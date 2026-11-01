// Mobile API client and transport types.
import * as SecureStore from "expo-secure-store";
import type {
  ChatAttachment,
  StoredMessage,
} from "../domain/chat.ts";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000";
let token = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
  }
}
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
    throw new ApiError(
      typeof result?.error === "string"
        ? result.error
        : `HTTP ${response.status}: ${JSON.stringify(result)}`,
      response.status,
      path,
    );
  return result as T;
}
export const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});
export type ProjectRole =
  "OWNER" | "MEMBER" | "DIRECTOR" | "MANAGER" | "EMPLOYEE";
export type User = {
  _id: string;
  id?: string;
  name: string;
  email: string;
  role?: ProjectRole;
};
export type ChatContact = { id: string; name: string; email: string };
export async function loadChatContacts(): Promise<ChatContact[]> {
  return api<ChatContact[]>("/contacts");
}
export async function searchChatUsers(email: string): Promise<ChatContact[]> {
  return api<ChatContact[]>(
    `/users/search?email=${encodeURIComponent(email.trim())}`,
  );
}
export async function loadChatUser(userId: string): Promise<ChatContact> {
  return api<ChatContact>(`/users/${encodeURIComponent(userId)}`);
}
export async function loadBlockedChatUsers(): Promise<ChatContact[]> {
  return api<ChatContact[]>("/chat/blocks");
}
export async function setChatUserBlocked(userId: string, blocked: boolean) {
  return api(
    `/chat/blocks/${encodeURIComponent(userId)}`,
    json(blocked ? "POST" : "DELETE"),
  );
}
export type ChatUploadFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};
export async function uploadChatAttachments(
  receiverId: string,
  files: ChatUploadFile[],
): Promise<ChatAttachment[]> {
  const form = new FormData();
  form.append("receiverId", receiverId);
  for (const file of files)
    form.append("files", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/octet-stream",
    } as unknown as Blob);
  return api<ChatAttachment[]>("/chat/attachments", {
    method: "POST",
    body: form,
  });
}
export async function uploadGroupChatAttachments(
  groupId: string,
  files: ChatUploadFile[],
): Promise<ChatAttachment[]> {
  const form = new FormData();
  form.append("groupId", groupId);
  for (const file of files)
    form.append("files", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/octet-stream",
    } as unknown as Blob);
  return api<ChatAttachment[]>("/chat/attachments", {
    method: "POST",
    body: form,
  });
}
export const chatAttachmentUrl = (attachmentId: string) =>
  `${API_URL}/chat/attachments/${encodeURIComponent(attachmentId)}`;
export type PersistedChatInput = {
  messageId: string;
  sessionId: string;
  timestamp: number;
  sequence: number;
  body: string;
  attachmentIds: string[];
};
export async function persistDirectChatMessage(
  receiverId: string,
  input: PersistedChatInput,
) {
  return api<StoredMessage>(
    "/chat/messages/direct",
    json("POST", { ...input, receiverId }),
  );
}
export async function persistGroupChatMessage(
  groupId: string,
  input: PersistedChatInput,
) {
  return api<StoredMessage[]>(
    "/chat/messages/group",
    json("POST", { ...input, groupId }),
  );
}
export type ChatSyncPage = {
  items: StoredMessage[];
  nextCursor: string | null;
  hasMore: boolean;
};
export async function syncStoredChatMessages(cursor?: string | null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<ChatSyncPage>(`/chat/messages/sync${query}`);
}
export async function markStoredChatMessagesRead(messageIds: string[]) {
  if (!messageIds.length) return { updated: 0 };
  return api<{ updated: number }>(
    "/chat/messages/read",
    json("POST", { messageIds }),
  );
}
export async function deleteStoredDirectConversation(userId: string) {
  return api<{ hidden: number }>(
    `/chat/conversations/direct/${encodeURIComponent(userId)}`,
    json("DELETE"),
  );
}
export type ProjectSummary = { _id: string; name: string };
export type Project = {
  _id: string;
  createdAt?: string;
  updatedAt?: string;
  name: string;
  description: string;
  owner: string;
  members: (User | string)[];
  plannedHours: number;
  actualHours: number;
  plannedBudget: number;
  spentBudget: number;
  chatGroupId?: string;
  kind: "independent" | "hierarchical";
  parentProject: string | null;
  rootProject: string;
  children?: Project[];
  childManagerIds?: string[];
  myRole: ProjectRole;
  version: number;
  archived: boolean;
  permissions: {
    manageMembers: boolean;
    manageTasks: boolean;
    manageProject: boolean;
    moderate: boolean;
    manageResources: boolean;
    createChildren: boolean;
    appointManager: boolean;
  };
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
  hidden: boolean;
  revision: number;
  attachments: DocumentRow[];
  commentCount: number;
};
export type DiscussionComment = {
  _id: string;
  body: string;
  author: User;
  revision: number;
  createdAt: string;
};
export type InboxNotification = {
  _id: string;
  type: string;
  title: string;
  body: string;
  project: ProjectSummary | null;
  actor: User | null;
  entityId?: string;
  readAt: string | null;
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
  byPerson: {
    userId: string;
    name?: string;
    total: number;
    done: number;
    tasks?: Task[];
  }[];
  byProject?: {
    projectId: string;
    name: string;
    total: number;
    done: number;
    overdue: number;
  }[];
};
