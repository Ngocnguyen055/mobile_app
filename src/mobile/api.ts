import * as SecureStore from "expo-secure-store";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000";
let token = "";
export async function restoreToken() {
  token = (await SecureStore.getItemAsync("api-token")) || "";
  return token;
}
export async function setToken(value: string) {
  token = value;
  if (value) await SecureStore.setItemAsync("api-token", value);
  else await SecureStore.deleteItemAsync("api-token");
}
export function getToken() {
  return token;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const type = response.headers.get("content-type") || "";
  const result = type.includes("json")
    ? await response.json()
    : await response.text();
  if (!response.ok)
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : `HTTP ${response.status}: ${JSON.stringify(result)}`,
    );
  return result as T;
}
export const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});
export type User = { _id: string; id?: string; name: string; email: string };
export type ChatContact = { id: string; name: string; email: string };
export async function loadChatContacts(): Promise<ChatContact[]> {
  return api<ChatContact[]>("/contacts");
}
export type ProjectSummary = { _id: string; name: string };
export type Project = {
  _id: string;
  name: string;
  description: string;
  owner: string;
  members: (User | string)[];
  plannedHours: number;
  actualHours: number;
  plannedBudget: number;
  spentBudget: number;
  chatGroupId?: string;
};
export type Task = {
  _id: string;
  project: string | ProjectSummary;
  title: string;
  description: string;
  assignee?: User | string;
  startsAt?: string | null;
  dueAt?: string | null;
  status: "todo" | "doing" | "done";
  version: number;
};
export type CalendarEvent = {
  _id: string;
  project?: string | ProjectSummary | null;
  createdBy?: string | User;
  title: string;
  startsAt: string;
  endsAt: string;
  note: string;
  allDay: boolean;
  reminderOffsets: number[];
};
export type CalendarFeed = { tasks: Task[]; events: CalendarEvent[] };
export type Discussion = {
  _id: string;
  title: string;
  body: string;
  author: User;
  createdAt: string;
};
export type DocumentRow = {
  _id: string;
  name: string;
  size: number;
  mime: string;
};
export type Progress = {
  total: number;
  done: number;
  dueSoon: number;
  overdue: number;
  byPerson: { userId: string; total: number; done: number }[];
};
