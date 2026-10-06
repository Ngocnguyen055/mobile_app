import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  DatabaseSync,
  type SQLInputValue,
  type SQLOutputValue,
} from "node:sqlite";
import type { ChatMessage, StoredMessage } from "../src/shared/index.ts";
import { WebStore } from "../src/web-peer/store.ts";

const sqliteState = vi.hoisted(() => ({
  database: null as DatabaseSync | null,
}));

vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    const database = sqliteState.database;
    if (!database) throw new Error("test database is not ready");
    return {
      async execAsync(sql: string) {
        database.exec(sql);
      },
      async runAsync(sql: string, ...params: SQLInputValue[]) {
        const result = database.prepare(sql).run(...params);
        return {
          changes: Number(result.changes),
          lastInsertRowId: Number(result.lastInsertRowid),
        };
      },
      async getAllAsync<T>(sql: string, ...params: SQLInputValue[]) {
        return database.prepare(sql).all(...params) as T[];
      },
      async getFirstAsync<T>(sql: string, ...params: SQLInputValue[]) {
        return (database.prepare(sql).get(...params) as T | undefined) ?? null;
      },
    };
  },
}));

vi.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
}));

const CURRENT = "peer-a";
const OTHER = "peer-b";
const OUTSIDER_A = "peer-c";
const OUTSIDER_B = "peer-d";
const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const GROUP_ID = "20000000-0000-4000-8000-000000000001";
const ids = {
  inbound: "00000000-0000-4000-8000-000000000001",
  outbound: "00000000-0000-4000-8000-000000000002",
  ack: "00000000-0000-4000-8000-000000000003",
  group: "00000000-0000-4000-8000-000000000004",
  outsider: "00000000-0000-4000-8000-000000000005",
  added: "00000000-0000-4000-8000-000000000006",
};

function textMessage(input: {
  messageId: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  groupId?: string | null;
}): ChatMessage {
  return {
    messageId: input.messageId,
    sessionId: SESSION_ID,
    senderId: input.senderId,
    receiverId: input.receiverId,
    groupId: input.groupId,
    type: "text",
    timestamp: input.timestamp,
    body: `body-${input.messageId}`,
    mode: "RELAY",
    attempt: 1,
    sequence: 1,
  };
}

function row(message: ChatMessage): StoredMessage {
  return { message, status: "received" };
}

const inbound = row(
  textMessage({
    messageId: ids.inbound,
    senderId: OTHER,
    receiverId: CURRENT,
    timestamp: 100,
  }),
);
const outbound = row(
  textMessage({
    messageId: ids.outbound,
    senderId: CURRENT,
    receiverId: OTHER,
    timestamp: 100,
    groupId: null,
  }),
);
const acknowledgement = row({
  ...textMessage({
    messageId: ids.ack,
    senderId: OTHER,
    receiverId: CURRENT,
    timestamp: 50,
  }),
  type: "ack",
  body: "",
  ackFor: ids.outbound,
});
const groupMessage = row(
  textMessage({
    messageId: ids.group,
    senderId: CURRENT,
    receiverId: OTHER,
    timestamp: 25,
    groupId: GROUP_ID,
  }),
);
const outsiderMessage = row(
  textMessage({
    messageId: ids.outsider,
    senderId: OUTSIDER_A,
    receiverId: OUTSIDER_B,
    timestamp: 10,
  }),
);

function seedLegacyMessages(database: DatabaseSync) {
  database.exec(
    "CREATE TABLE messages (scope TEXT NOT NULL, message_id TEXT NOT NULL, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(scope,message_id,sender_id,receiver_id))",
  );
  const insert = database.prepare(
    "INSERT INTO messages(scope,message_id,sender_id,receiver_id,timestamp,payload,status) VALUES(?,?,?,?,?,?,?)",
  );
  for (const stored of [outbound, groupMessage, acknowledgement, inbound, outsiderMessage]) {
    const message = stored.message;
    insert.run(
      CURRENT,
      message.messageId,
      message.senderId,
      message.receiverId,
      message.timestamp,
      JSON.stringify(message),
      stored.status,
    );
  }
}

describe("MobileStore direct-message migration", () => {
  let MobileStore: typeof import("../src/mobile/local.ts").MobileStore;

  beforeAll(async () => {
    const database = new DatabaseSync(":memory:");
    sqliteState.database = database;
    seedLegacyMessages(database);
    ({ MobileStore } = await import("../src/mobile/local.ts"));
  });

  afterAll(() => {
    sqliteState.database?.close();
    sqliteState.database = null;
  });

  it("backfills legacy group IDs and queries only two-way direct text messages", async () => {
    const store = new MobileStore(CURRENT);

    const history = await store.listDirect(OTHER);

    expect(history.map((item) => item.message.messageId)).toEqual([
      ids.inbound,
      ids.outbound,
    ]);
    expect(await new MobileStore(OTHER).listDirect(CURRENT)).toEqual([]);
    const database = sqliteState.database!;
    const columns = database.prepare("PRAGMA table_info(messages)").all() as {
      name: SQLOutputValue;
    }[];
    expect(columns.map((column) => column.name)).toContain("group_id");
    expect(
      database
        .prepare("SELECT group_id FROM messages WHERE message_id=?")
        .get(ids.group),
    ).toMatchObject({ group_id: GROUP_ID });
    const indexes = database.prepare("PRAGMA index_list(messages)").all() as {
      name: SQLOutputValue;
    }[];
    expect(indexes.map((index) => index.name)).toContain("messages_direct");
    expect(
      database
        .prepare("SELECT 1 AS present FROM storage_migrations WHERE name=?")
        .get("messages-group-id-v1"),
    ).toMatchObject({ present: 1 });
    expect(await store.list()).toHaveLength(5);
  });

  it("stores valid direct rows with a null group and rejects other scopes or types", async () => {
    const store = new MobileStore(CURRENT);
    const added = row(
      textMessage({
        messageId: ids.added,
        senderId: CURRENT,
        receiverId: OTHER,
        timestamp: 200,
        groupId: null,
      }),
    );

    await store.putDirect(added);

    expect(
      sqliteState.database!
        .prepare("SELECT group_id FROM messages WHERE message_id=?")
        .get(ids.added),
    ).toMatchObject({ group_id: null });
    expect((await store.listDirect(OTHER)).at(-1)?.message.messageId).toBe(
      ids.added,
    );
    await expect(store.putDirect(groupMessage)).rejects.toThrow(
      "does not belong",
    );
    await expect(store.putDirect(acknowledgement)).rejects.toThrow(
      "does not belong",
    );
    await expect(store.putDirect(outsiderMessage)).rejects.toThrow(
      "does not belong",
    );
  });
});

const localStorageRows = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localStorageRows.size;
  },
  clear() {
    localStorageRows.clear();
  },
  getItem(key) {
    return localStorageRows.get(key) ?? null;
  },
  key(index) {
    return [...localStorageRows.keys()][index] ?? null;
  },
  removeItem(key) {
    localStorageRows.delete(key);
  },
  setItem(key, value) {
    localStorageRows.set(key, value);
  },
};

describe("WebStore direct-message history", () => {
  beforeEach(() => {
    localStorageRows.clear();
    vi.stubGlobal("localStorage", localStorageMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reopens the existing key and returns deterministic two-way text history", async () => {
    const store = new WebStore(CURRENT);
    await store.put(outbound);
    await store.put(groupMessage);
    await store.put(acknowledgement);
    await store.put(outsiderMessage);
    await store.putDirect(inbound);

    const reopened = new WebStore(CURRENT);
    const history = await reopened.listDirect(OTHER);

    expect(localStorageRows.has(`ds01-history-v1-${CURRENT}`)).toBe(true);
    expect(history.map((item) => item.message.messageId)).toEqual([
      ids.inbound,
      ids.outbound,
    ]);
    expect(await new WebStore(OTHER).listDirect(CURRENT)).toEqual([]);
    expect(await reopened.list()).toHaveLength(5);
    await expect(reopened.putDirect(groupMessage)).rejects.toThrow(
      "does not belong",
    );
    await expect(reopened.putDirect(acknowledgement)).rejects.toThrow(
      "does not belong",
    );
    await expect(reopened.putDirect(outsiderMessage)).rejects.toThrow(
      "does not belong",
    );
  });
});
