// local.ts.
import * as SQLite from "expo-sqlite";
import * as Notifications from "expo-notifications";
import {
  assertUserId,
  isDirectMessageBetween,
  type DirectChatContact,
  type StoredMessage,
  type MessageStatus,
} from "../domain/chat.ts";
import type { CalendarEvent, Task } from "./api.ts";

export type ChatOutboxItem = {
  id: string;
  targetKind: "direct" | "group";
  targetId: string;
  payload: {
    messageId: string;
    sessionId: string;
    timestamp: number;
    sequence: number;
    body: string;
    attachmentIds: string[];
  };
  createdAt: number;
};

const database = SQLite.openDatabaseAsync("ds01-chat.db");
let initialized: typeof database | undefined;
async function db() {
  initialized ||= (async () => {
    const connection = await database;
    await connection.execAsync(
      "CREATE TABLE IF NOT EXISTS messages (scope TEXT NOT NULL, message_id TEXT NOT NULL, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL, group_id TEXT, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(scope,message_id,sender_id,receiver_id)); CREATE INDEX IF NOT EXISTS messages_order ON messages(scope,timestamp); CREATE TABLE IF NOT EXISTS storage_migrations (name TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS reminders (task_id TEXT PRIMARY KEY, notification_ids TEXT NOT NULL, signature TEXT); CREATE TABLE IF NOT EXISTS event_reminders (event_id TEXT PRIMARY KEY, notification_ids TEXT NOT NULL, signature TEXT NOT NULL); CREATE TABLE IF NOT EXISTS direct_chat_preferences (scope TEXT NOT NULL, user_id TEXT NOT NULL, blocked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(scope,user_id)); CREATE TABLE IF NOT EXISTS direct_chat_contacts (scope TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(scope,user_id)); CREATE TABLE IF NOT EXISTS chat_outbox (scope TEXT NOT NULL, id TEXT NOT NULL, target_kind TEXT NOT NULL, target_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(scope,id)); CREATE INDEX IF NOT EXISTS chat_outbox_order ON chat_outbox(scope,created_at,id); CREATE TABLE IF NOT EXISTS chat_sync_state (scope TEXT PRIMARY KEY, cursor TEXT);",
    );
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
export class MobileStore {
  constructor(private scope: string) {}
  async put(row: StoredMessage) {
    const conn = await db();
    const m = row.message;
    await conn.runAsync(
      "INSERT OR REPLACE INTO messages(scope,message_id,sender_id,receiver_id,group_id,timestamp,payload,status) VALUES(?,?,?,?,?,?,?,?)",
      this.scope,
      m.messageId,
      m.senderId,
      m.receiverId,
      m.groupId ?? null,
      m.timestamp,
      JSON.stringify(m),
      row.status,
    );
  }
  async putDirect(row: StoredMessage) {
    const currentUserId = assertUserId(this.scope);
    const message = row.message;
    const otherUserId =
      message.senderId === currentUserId
        ? message.receiverId
        : message.senderId;
    assertUserId(otherUserId);
    if (
      otherUserId === currentUserId ||
      !isDirectMessageBetween(message, currentUserId, otherUserId)
    )
      throw new Error("direct message does not belong to this store");
    await this.put(row);
  }
  async mark(messageId: string, receiverId: string, status: MessageStatus) {
    const conn = await db();
    await conn.runAsync(
      "UPDATE messages SET status=? WHERE scope=? AND message_id=? AND receiver_id=?",
      status,
      this.scope,
      messageId,
      receiverId,
    );
  }
  async has(messageId: string, senderId: string) {
    const conn = await db();
    return !!(await conn.getFirstAsync(
      "SELECT 1 FROM messages WHERE scope=? AND message_id=? AND sender_id=?",
      this.scope,
      messageId,
      senderId,
    ));
  }
  async list(): Promise<StoredMessage[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{
      payload: string;
      status: MessageStatus;
    }>(
      "SELECT payload,status FROM messages WHERE scope=? ORDER BY timestamp,message_id",
      this.scope,
    );
    return rows.map((row) => ({
      message: JSON.parse(row.payload),
      status: row.status,
    }));
  }
  async listDirect(userId: string): Promise<StoredMessage[]> {
    const currentUserId = assertUserId(this.scope);
    const otherUserId = assertUserId(userId);
    if (currentUserId === otherUserId)
      throw new Error("direct conversation requires another user");
    const conn = await db();
    const rows = await conn.getAllAsync<{
      payload: string;
      status: MessageStatus;
    }>(
      "SELECT payload,status FROM messages WHERE scope=? AND group_id IS NULL AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) ORDER BY timestamp,message_id,sender_id,receiver_id",
      this.scope,
      currentUserId,
      otherUserId,
      otherUserId,
      currentUserId,
    );
    return rows
      .map((row) => ({
        message: JSON.parse(row.payload),
        status: row.status,
      }))
      .filter((row) =>
        isDirectMessageBetween(row.message, currentUserId, otherUserId),
      );
  }
  async listDirectAttachments(userId: string): Promise<StoredMessage[]> {
    return (await this.listDirect(userId)).filter(
      (row) => row.message.type === "attachment",
    );
  }
  async deleteDirect(userId: string): Promise<void> {
    const currentUserId = assertUserId(this.scope);
    const otherUserId = assertUserId(userId);
    if (currentUserId === otherUserId)
      throw new Error("direct conversation requires another user");
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM messages WHERE scope=? AND group_id IS NULL AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))",
      this.scope,
      currentUserId,
      otherUserId,
      otherUserId,
      currentUserId,
    );
  }
  async deleteGroupDeliveries(
    messageId: string,
    groupId: string,
  ): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM messages WHERE scope=? AND message_id=? AND group_id=?",
      this.scope,
      messageId,
      groupId,
    );
  }
  async setDirectBlocked(userId: string, blocked: boolean): Promise<void> {
    const currentUserId = assertUserId(this.scope);
    const otherUserId = assertUserId(userId);
    if (currentUserId === otherUserId) throw new Error("cannot block yourself");
    const conn = await db();
    if (!blocked) {
      await conn.runAsync(
        "DELETE FROM direct_chat_preferences WHERE scope=? AND user_id=?",
        this.scope,
        otherUserId,
      );
      return;
    }
    await conn.runAsync(
      "INSERT INTO direct_chat_preferences(scope,user_id,blocked) VALUES(?,?,1) ON CONFLICT(scope,user_id) DO UPDATE SET blocked=1",
      this.scope,
      otherUserId,
    );
  }
  async isDirectBlocked(userId: string): Promise<boolean> {
    const otherUserId = assertUserId(userId);
    const conn = await db();
    return !!(await conn.getFirstAsync(
      "SELECT 1 FROM direct_chat_preferences WHERE scope=? AND user_id=? AND blocked=1",
      this.scope,
      otherUserId,
    ));
  }
  async listDirectBlocked(): Promise<string[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{ user_id: string }>(
      "SELECT user_id FROM direct_chat_preferences WHERE scope=? AND blocked=1 ORDER BY user_id",
      this.scope,
    );
    return rows.map((row) => row.user_id);
  }
  async saveDirectContact(contact: DirectChatContact): Promise<void> {
    const currentUserId = assertUserId(this.scope);
    const userId = assertUserId(contact.userId);
    const name = contact.name.trim();
    const email = contact.email.trim().toLowerCase();
    if (userId === currentUserId) throw new Error("cannot save yourself");
    if (!name || !email || !Number.isSafeInteger(contact.updatedAt))
      throw new Error("invalid direct contact");
    const conn = await db();
    await conn.runAsync(
      "INSERT INTO direct_chat_contacts(scope,user_id,name,email,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(scope,user_id) DO UPDATE SET name=excluded.name,email=excluded.email,updated_at=excluded.updated_at",
      this.scope,
      userId,
      name,
      email,
      contact.updatedAt,
    );
  }
  async listDirectContacts(): Promise<DirectChatContact[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{
      user_id: string;
      name: string;
      email: string;
      updated_at: number;
    }>(
      "SELECT user_id,name,email,updated_at FROM direct_chat_contacts WHERE scope=? ORDER BY updated_at DESC,user_id",
      this.scope,
    );
    return rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      updatedAt: row.updated_at,
    }));
  }
  async removeDirectContact(userId: string): Promise<void> {
    const otherUserId = assertUserId(userId);
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM direct_chat_contacts WHERE scope=? AND user_id=?",
      this.scope,
      otherUserId,
    );
  }
  async enqueueChatOutbox(item: ChatOutboxItem): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "INSERT OR REPLACE INTO chat_outbox(scope,id,target_kind,target_id,payload,created_at) VALUES(?,?,?,?,?,?)",
      this.scope,
      item.id,
      item.targetKind,
      item.targetId,
      JSON.stringify(item.payload),
      item.createdAt,
    );
  }
  async listChatOutbox(): Promise<ChatOutboxItem[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{
      id: string;
      target_kind: "direct" | "group";
      target_id: string;
      payload: string;
      created_at: number;
    }>(
      "SELECT id,target_kind,target_id,payload,created_at FROM chat_outbox WHERE scope=? ORDER BY created_at,id",
      this.scope,
    );
    return rows.map((row) => ({
      id: row.id,
      targetKind: row.target_kind,
      targetId: row.target_id,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
    }));
  }
  async removeChatOutbox(id: string): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM chat_outbox WHERE scope=? AND id=?",
      this.scope,
      id,
    );
  }
  async getChatSyncCursor(): Promise<string | null> {
    const conn = await db();
    const row = await conn.getFirstAsync<{ cursor: string | null }>(
      "SELECT cursor FROM chat_sync_state WHERE scope=?",
      this.scope,
    );
    return row?.cursor || null;
  }
  async setChatSyncCursor(cursor: string | null): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "INSERT INTO chat_sync_state(scope,cursor) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET cursor=excluded.cursor",
      this.scope,
      cursor,
    );
  }
}
export type ReminderOffset =
  604800000 | 86400000 | 3600000 | 1800000 | 300000 | 0;
export const REMINDER_CHANNEL_ID = "planner-reminders";
export const REMINDER_OFFSETS: readonly ReminderOffset[] = [
  604800000, 86400000, 3600000, 1800000, 300000, 0,
];
const reminderOffsets = new Set<number>(REMINDER_OFFSETS);
const notificationIds = (value?: string) => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
};
const formatViDateTime = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));

export async function syncReminder(task: Task, offsets: ReminderOffset[]) {
  const conn = await db();
  const signature = JSON.stringify([
    task.title,
    task.status,
    task.dueAt,
    [...offsets].sort(),
  ]);
  const old = await conn.getFirstAsync<{
    notification_ids: string;
    signature: string | null;
  }>(
    "SELECT notification_ids,signature FROM reminders WHERE task_id=?",
    task._id,
  );
  if (old?.signature === signature) return;
  for (const id of old ? (JSON.parse(old.notification_ids) as string[]) : [])
    await Notifications.cancelScheduledNotificationAsync(id);
  const ids: string[] = [];
  if (task.status !== "done" && task.dueAt) {
    for (const offset of offsets) {
      const when = new Date(task.dueAt).getTime() - offset;
      if (when <= Date.now()) continue;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Sắp đến hạn: ${task.title}`,
          body: `Deadline ${formatViDateTime(task.dueAt)}`,
          data: { taskId: task._id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(when),
          channelId: REMINDER_CHANNEL_ID,
        },
      });
      ids.push(id);
    }
  }
  await conn.runAsync(
    "INSERT OR REPLACE INTO reminders(task_id,notification_ids,signature) VALUES(?,?,?)",
    task._id,
    JSON.stringify(ids),
    signature,
  );
}
export async function cancelReminder(taskId: string) {
  await syncReminder(
    {
      _id: taskId,
      title: "",
      status: "done",
      description: "",
      project: "",
      version: 1,
    },
    [],
  );
}
export async function reconcileReminders(
  tasks: Task[],
  userId: string,
  offsets: ReminderOffset[],
) {
  const conn = await db();
  const known = await conn.getAllAsync<{ task_id: string }>(
    "SELECT task_id FROM reminders",
  );
  const ids = new Set(tasks.map((t) => t._id));
  for (const row of known)
    if (!ids.has(row.task_id)) await cancelReminder(row.task_id);
  for (const task of tasks) {
    const assignee =
      typeof task.assignee === "string" ? task.assignee : task.assignee?._id;
    if (assignee === userId) await syncReminder(task, offsets);
    else await cancelReminder(task._id);
  }
}

export async function syncEventReminder(event: CalendarEvent) {
  const conn = await db();
  const offsets = [...new Set(event.reminderOffsets || [])]
    .filter((offset): offset is ReminderOffset => reminderOffsets.has(offset))
    .sort((a, b) => b - a);
  const signature = JSON.stringify([
    event.title,
    event.startsAt,
    event.endsAt,
    event.note,
    event.allDay,
    offsets,
  ]);
  const old = await conn.getFirstAsync<{
    notification_ids: string;
    signature: string;
  }>(
    "SELECT notification_ids,signature FROM event_reminders WHERE event_id=?",
    event._id,
  );
  if (old?.signature === signature) return;

  for (const id of notificationIds(old?.notification_ids)) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  const ids: string[] = [];
  const startsAt = new Date(event.startsAt).getTime();
  if (Number.isFinite(startsAt)) {
    for (const offset of offsets) {
      const when = startsAt - offset;
      if (when <= Date.now()) continue;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Sắp diễn ra: ${event.title}`,
          body: event.allDay
            ? `Sự kiện ngày ${formatViDateTime(event.startsAt).slice(0, 10)}`
            : `Bắt đầu lúc ${formatViDateTime(event.startsAt)}`,
          data: { eventId: event._id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(when),
          channelId: REMINDER_CHANNEL_ID,
        },
      });
      ids.push(id);
    }
  }
  await conn.runAsync(
    "INSERT OR REPLACE INTO event_reminders(event_id,notification_ids,signature) VALUES(?,?,?)",
    event._id,
    JSON.stringify(ids),
    signature,
  );
}

export async function cancelEventReminder(eventId: string) {
  const conn = await db();
  const old = await conn.getFirstAsync<{ notification_ids: string }>(
    "SELECT notification_ids FROM event_reminders WHERE event_id=?",
    eventId,
  );
  for (const id of notificationIds(old?.notification_ids)) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
  await conn.runAsync("DELETE FROM event_reminders WHERE event_id=?", eventId);
}

export async function reconcileEventReminders(events: CalendarEvent[]) {
  const conn = await db();
  const known = await conn.getAllAsync<{ event_id: string }>(
    "SELECT event_id FROM event_reminders",
  );
  const currentIds = new Set(events.map((event) => event._id));
  for (const row of known) {
    if (!currentIds.has(row.event_id)) await cancelEventReminder(row.event_id);
  }
  for (const event of events) await syncEventReminder(event);
}

export async function clearAllReminders() {
  const conn = await db();
  const taskRows = await conn.getAllAsync<{ notification_ids: string }>(
    "SELECT notification_ids FROM reminders",
  );
  const eventRows = await conn.getAllAsync<{ notification_ids: string }>(
    "SELECT notification_ids FROM event_reminders",
  );
  for (const row of [...taskRows, ...eventRows]) {
    for (const id of notificationIds(row.notification_ids))
      await Notifications.cancelScheduledNotificationAsync(id);
  }
  await conn.execAsync("DELETE FROM reminders; DELETE FROM event_reminders;");
}
