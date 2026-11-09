import * as SQLite from "expo-sqlite";
import { CREATE_SCHEMA } from "./schema.ts";

type DatabaseRuntime = {
  connection?: Promise<SQLite.SQLiteDatabase>;
  queue: Promise<void>;
  schemaReady?: Promise<void>;
};

const DATABASE_RUNTIME_KEY = "__studentPlannerSqliteRuntimeV1__";
const runtimeScope = globalThis as typeof globalThis & {
  [DATABASE_RUNTIME_KEY]?: DatabaseRuntime;
};
const runtime = (runtimeScope[DATABASE_RUNTIME_KEY] ??= {
  queue: Promise.resolve(),
});
const LOCK_RETRY_DELAYS_MS = [80, 200, 500] as const;

const isLockedError = (error: unknown) =>
  /database (?:is )?locked|SQLITE_(?:BUSY|LOCKED)/i.test(
    error instanceof Error ? error.message : String(error),
  );

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

async function retryLocked<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = LOCK_RETRY_DELAYS_MS[attempt];
      if (!isLockedError(error) || delayMs === undefined) throw error;
      await wait(delayMs);
    }
  }
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = runtime.queue.then(() => retryLocked(operation));
  runtime.queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

class SerializedDatabase {
  constructor(private readonly connection: SQLite.SQLiteDatabase) {}

  execAsync(source: string): Promise<void> {
    return serialize(() => this.connection.execAsync(source));
  }

  runAsync(
    source: string,
    ...params: SQLite.SQLiteVariadicBindParams
  ): Promise<SQLite.SQLiteRunResult> {
    return serialize(() => this.connection.runAsync(source, ...params));
  }

  getFirstAsync<T>(
    source: string,
    ...params: SQLite.SQLiteVariadicBindParams
  ): Promise<T | null> {
    return serialize(() =>
      this.connection.getFirstAsync<T>(source, ...params),
    );
  }

  getAllAsync<T>(
    source: string,
    ...params: SQLite.SQLiteVariadicBindParams
  ): Promise<T[]> {
    return serialize(() => this.connection.getAllAsync<T>(source, ...params));
  }
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  runtime.connection ??= SQLite.openDatabaseAsync("ds01-chat.db");
  const pending = runtime.connection;
  try {
    return await pending;
  } catch (error) {
    if (runtime.connection === pending) runtime.connection = undefined;
    throw error;
  }
}

async function initializeDatabase(connection: SerializedDatabase) {
  await connection.execAsync("PRAGMA busy_timeout = 2000");
  await connection.execAsync(CREATE_SCHEMA);
  const preferenceColumns = await connection.getAllAsync<{ name: string }>(
    "PRAGMA table_info(direct_chat_preferences)",
  );
  if (
    preferenceColumns.some((column) => column.name === "peer_id") &&
    !preferenceColumns.some((column) => column.name === "user_id")
  )
    await connection.execAsync(
      "ALTER TABLE direct_chat_preferences RENAME COLUMN peer_id TO user_id",
    );
  const contactColumns = await connection.getAllAsync<{ name: string }>(
    "PRAGMA table_info(direct_chat_contacts)",
  );
  if (
    contactColumns.some((column) => column.name === "peer_id") &&
    !contactColumns.some((column) => column.name === "user_id")
  )
    await connection.execAsync(
      "ALTER TABLE direct_chat_contacts RENAME COLUMN peer_id TO user_id",
    );
  const messageColumns = await connection.getAllAsync<{ name: string }>(
    "PRAGMA table_info(messages)",
  );
  if (!messageColumns.some((column) => column.name === "group_id"))
    await connection.execAsync(
      "ALTER TABLE messages ADD COLUMN group_id TEXT",
    );
  const groupIdMigration = "messages-group-id-v1";
  const migrationComplete = await connection.getFirstAsync(
    "SELECT 1 FROM storage_migrations WHERE name=?",
    groupIdMigration,
  );
  if (!migrationComplete) {
    const legacyRows = await connection.getAllAsync<{
      scope: string;
      message_id: string;
      sender_id: string;
      receiver_id: string;
      payload: string;
    }>(
      "SELECT scope,message_id,sender_id,receiver_id,payload FROM messages WHERE group_id IS NULL",
    );
    for (const row of legacyRows) {
      let groupId: unknown;
      try {
        groupId = (JSON.parse(row.payload) as { groupId?: unknown }).groupId;
      } catch {
        continue;
      }
      if (typeof groupId !== "string") continue;
      await connection.runAsync(
        "UPDATE messages SET group_id=? WHERE scope=? AND message_id=? AND sender_id=? AND receiver_id=?",
        groupId,
        row.scope,
        row.message_id,
        row.sender_id,
        row.receiver_id,
      );
    }
    await connection.runAsync(
      "INSERT OR IGNORE INTO storage_migrations(name) VALUES(?)",
      groupIdMigration,
    );
  }
  await connection.execAsync(
    "CREATE INDEX IF NOT EXISTS messages_direct ON messages(scope,group_id,sender_id,receiver_id,timestamp,message_id)",
  );
  const columns = await connection.getAllAsync<{ name: string }>(
    "PRAGMA table_info(reminders)",
  );
  if (!columns.some((column) => column.name === "signature"))
    await connection.execAsync(
      "ALTER TABLE reminders ADD COLUMN signature TEXT",
    );
}

async function ensureSchema(connection: SQLite.SQLiteDatabase) {
  if (!runtime.schemaReady)
    runtime.schemaReady = initializeDatabase(
      new SerializedDatabase(connection),
    );
  const pending = runtime.schemaReady;
  try {
    await pending;
  } catch (error) {
    if (runtime.schemaReady === pending) runtime.schemaReady = undefined;
    throw error;
  }
}

export async function db(): Promise<SerializedDatabase> {
  const connection = await openDatabase();
  await ensureSchema(connection);
  return new SerializedDatabase(connection);
}
