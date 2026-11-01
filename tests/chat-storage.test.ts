import {
  afterAll,
  beforeAll,
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
import type {
  ChatMessage,
  StoredMessage,
} from "../src/mobile/domain/chat.ts";

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

const CURRENT = "000000000000000000000001";
const OTHER = "000000000000000000000002";
const OUTSIDER_A = "000000000000000000000003";
const OUTSIDER_B = "000000000000000000000004";
const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const GROUP_ID = "20000000-0000-4000-8000-000000000001";
const ids = {
  inbound: "00000000-0000-4000-8000-000000000001",
  outbound: "00000000-0000-4000-8000-000000000002",
  group: "00000000-0000-4000-8000-000000000004",
  groupReplace: "00000000-0000-4000-8000-000000000008",
  outsider: "00000000-0000-4000-8000-000000000005",
  added: "00000000-0000-4000-8000-000000000006",
  attachment: "00000000-0000-4000-8000-000000000007",
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
  for (const stored of [
    outbound,
    groupMessage,
    inbound,
    outsiderMessage,
  ]) {
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
  let MobileStore: typeof import("../src/mobile/services/local.ts").MobileStore;

  beforeAll(async () => {
    const database = new DatabaseSync(":memory:");
    sqliteState.database = database;
    seedLegacyMessages(database);
    ({ MobileStore } = await import("../src/mobile/services/local.ts"));
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
    expect(await store.list()).toHaveLength(4);
  });

  it("stores valid direct rows with a null group and rejects other scopes", async () => {
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
      sqliteState
        .database!.prepare("SELECT group_id FROM messages WHERE message_id=?")
        .get(ids.added),
    ).toMatchObject({ group_id: null });
    expect((await store.listDirect(OTHER)).at(-1)?.message.messageId).toBe(
      ids.added,
    );
    await expect(store.putDirect(groupMessage)).rejects.toThrow(
      "does not belong",
    );
    await expect(store.putDirect(outsiderMessage)).rejects.toThrow(
      "does not belong",
    );
  });

  it("persists contact/block preferences, lists attachments, and deletes only one direct conversation", async () => {
    const store = new MobileStore(CURRENT);
    await store.saveDirectContact({
      userId: OTHER,
      name: "Bình",
      email: "BINH@example.test",
      updatedAt: 123,
    });
    expect(await store.listDirectContacts()).toEqual([
      {
        userId: OTHER,
        name: "Bình",
        email: "binh@example.test",
        updatedAt: 123,
      },
    ]);
    await store.setDirectBlocked(OTHER, true);
    expect(await store.isDirectBlocked(OTHER)).toBe(true);
    expect(await store.listDirectBlocked()).toEqual([OTHER]);

    const attachment = row({
      ...textMessage({
        messageId: ids.attachment,
        senderId: CURRENT,
        receiverId: OTHER,
        timestamp: 300,
        groupId: null,
      }),
      type: "attachment",
      body: "",
      attachments: [
        {
          id: "507f1f77bcf86cd799439011",
          name: "anh.png",
          mime: "image/png",
          size: 32_000,
        },
      ],
    });
    await store.putDirect(attachment);
    expect(
      (await store.listDirectAttachments(OTHER)).map(
        (item) => item.message.messageId,
      ),
    ).toEqual([ids.attachment]);

    await store.deleteDirect(OTHER);
    expect(await store.listDirect(OTHER)).toEqual([]);
    expect(
      (await store.list()).some((item) => item.message.groupId === GROUP_ID),
    ).toBe(true);
    await store.removeDirectContact(OTHER);
    expect(await store.listDirectContacts()).toEqual([]);
    await store.setDirectBlocked(OTHER, false);
    expect(await store.isDirectBlocked(OTHER)).toBe(false);
  });

  it("persists the chat outbox and sync cursor across store instances", async () => {
    const store = new MobileStore(CURRENT);
    const item = {
      id: "outbox-1",
      targetKind: "direct" as const,
      targetId: OTHER,
      payload: {
        messageId: ids.outbound,
        sessionId: SESSION_ID,
        timestamp: 400,
        sequence: 2,
        body: "offline message",
        attachmentIds: [],
      },
      createdAt: 400,
    };
    await store.enqueueChatOutbox(item);
    await store.setChatSyncCursor("400:507f1f77bcf86cd799439011");

    const reopened = new MobileStore(CURRENT);
    expect(await reopened.listChatOutbox()).toEqual([item]);
    expect(await reopened.getChatSyncCursor()).toBe(
      "400:507f1f77bcf86cd799439011",
    );

    await reopened.removeChatOutbox(item.id);
    expect(await reopened.listChatOutbox()).toEqual([]);
  });

  it("replaces all provisional deliveries for one group message", async () => {
    const store = new MobileStore(CURRENT);
    for (const receiverId of [OTHER, OUTSIDER_A])
      await store.put(
        row(
          textMessage({
            messageId: ids.groupReplace,
            senderId: CURRENT,
            receiverId,
            timestamp: 500,
            groupId: GROUP_ID,
          }),
        ),
      );
    expect(
      (await store.list()).filter(
        (item) => item.message.messageId === ids.groupReplace,
      ),
    ).toHaveLength(2);

    await store.deleteGroupDeliveries(ids.groupReplace, GROUP_ID);

    expect(
      (await store.list()).filter(
        (item) => item.message.messageId === ids.groupReplace,
      ),
    ).toEqual([]);
  });
});
