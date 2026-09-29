import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import type { Task, CalendarEvent } from "./api.ts";
import { dateKey } from "./calendar.ts";

const scope = "https://www.googleapis.com/auth/calendar.events";
let configured = false;
export function configureGoogle() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) throw new Error("Thiếu EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID");
  if (!configured) {
    GoogleSignin.configure({ webClientId, scopes: [scope] });
    configured = true;
  }
}
export async function connectGoogle() {
  configureGoogle();
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new Error("Đã hủy đăng nhập Google");
  await GoogleSignin.addScopes({ scopes: [scope] });
  return response.data.user.email;
}
async function accessToken() {
  configureGoogle();
  await GoogleSignin.signInSilently();
  return (await GoogleSignin.getTokens()).accessToken;
}
async function googleRequest(path: string, token: string, init?: RequestInit) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `Google Calendar ${res.status}: ${data.error?.message || "request failed"}`,
    );
  return data;
}
async function upsert(
  token: string,
  key: string,
  summary: string,
  start: string,
  end: string,
  description: string,
  allDay = false,
) {
  const query = `?privateExtendedProperty=${encodeURIComponent(`studentPlannerKey=${key}`)}&maxResults=2`;
  const existing = await googleRequest(query, token);
  const timing = allDay
    ? { start: { date: dateKey(start) }, end: { date: dateKey(end) } }
    : {
        start: { dateTime: start, timeZone: "Asia/Ho_Chi_Minh" },
        end: { dateTime: end, timeZone: "Asia/Ho_Chi_Minh" },
      };
  const payload = {
    summary,
    description,
    ...timing,
    extendedProperties: { private: { studentPlannerKey: key } },
  };
  if (existing.items?.length)
    await googleRequest(`/${encodeURIComponent(existing.items[0].id)}`, token, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  else {
    const stableId = key.replace(":", "");
    try {
      await googleRequest("", token, {
        method: "POST",
        body: JSON.stringify({ ...payload, id: stableId }),
      });
    } catch (error) {
      if (!String(error).includes("409")) throw error;
      await googleRequest(`/${stableId}`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
  }
}
export async function disconnectGoogle() {
  if (configured) {
    try {
      await GoogleSignin.signOut();
    } catch {
      /* API logout must still finish. */
    }
  }
}
export async function syncGoogleCalendar(
  tasks: Task[],
  events: CalendarEvent[],
  userId: string,
) {
  const token = await accessToken();
  let count = 0;
  for (const task of tasks) {
    const assignee =
      typeof task.assignee === "string" ? task.assignee : task.assignee?._id;
    if (assignee !== userId || !task.dueAt || task.status === "done") continue;
    const end = new Date(task.dueAt);
    const start = task.startsAt
      ? new Date(task.startsAt)
      : new Date(end.getTime() - 60 * 60000);
    await upsert(
      token,
      `task:${task._id}`,
      `[Task] ${task.title}`,
      start.toISOString(),
      end.toISOString(),
      task.description,
    );
    count++;
  }
  for (const event of events) {
    await upsert(
      token,
      `event:${event._id}`,
      event.title,
      event.startsAt,
      event.endsAt,
      event.note,
      event.allDay,
    );
    count++;
  }
  return count;
}
