import * as SQLite from "expo-sqlite";
import { CREATE_SCHEMA } from "./schema.ts";
const database = SQLite.openDatabaseAsync("ds01-chat.db");
let initialized: typeof database | undefined;
export async function db() {
  initialized ||= (async () => {
    const connection = await database;
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
        "INSERT INTO storage_migrations(name) VALUES(?)",
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
    return connection;
  })();
  return initialized;
}
