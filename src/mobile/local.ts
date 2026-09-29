import * as SQLite from "expo-sqlite";
import * as Notifications from "expo-notifications";
import type { ChatStore, StoredMessage, MessageStatus } from "@ds01/shared";
import type { CalendarEvent, Task } from "./api.ts";

const database = SQLite.openDatabaseAsync("ds01-chat.db");
let initialized: typeof database | undefined;
async function db() {
  initialized ||= (async () => {
    const connection = await database;
    await connection.execAsync(
      "CREATE TABLE IF NOT EXISTS messages (scope TEXT NOT NULL, message_id TEXT NOT NULL, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL, timestamp INTEGER NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(scope,message_id,sender_id,receiver_id)); CREATE INDEX IF NOT EXISTS messages_order ON messages(scope,timestamp); CREATE TABLE IF NOT EXISTS reminders (task_id TEXT PRIMARY KEY, notification_ids TEXT NOT NULL, signature TEXT); CREATE TABLE IF NOT EXISTS event_reminders (event_id TEXT PRIMARY KEY, notification_ids TEXT NOT NULL, signature TEXT NOT NULL);",
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
export class MobileStore implements ChatStore {
  constructor(private scope: string) {}
  async put(row: StoredMessage) {
    const conn = await db();
    const m = row.message;
    await conn.runAsync(
      "INSERT OR REPLACE INTO messages(scope,message_id,sender_id,receiver_id,timestamp,payload,status) VALUES(?,?,?,?,?,?,?)",
      this.scope,
      m.messageId,
      m.senderId,
      m.receiverId,
      m.timestamp,
      JSON.stringify(m),
      row.status,
    );
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
}
export type ReminderOffset = 604800000 | 86400000 | 3600000;
export const REMINDER_CHANNEL_ID = "planner-reminders";
const reminderOffsets = new Set<number>([604800000, 86400000, 3600000]);
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
