import type { ChatAttachment, ChatGroup, StoredMessage } from "../../domain/chat.ts";
import type { ChatContact } from "../../types/api.ts";
import { API_URL, api, json } from "./client.ts";
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
export async function loadProjectChatGroups(
  projectId: string,
): Promise<ChatGroup[]> {
  return api<ChatGroup[]>(
    `/projects/${encodeURIComponent(projectId)}/chat-groups`,
  );
}
export async function createProjectChatGroup(
  projectId: string,
  name: string,
): Promise<ChatGroup> {
  return api<ChatGroup>(
    `/projects/${encodeURIComponent(projectId)}/chat-groups`,
    json("POST", { name }),
  );
}
export async function deleteProjectChatGroup(
  projectId: string,
  groupId: string,
) {
  return api<{ ok: true }>(
    `/projects/${encodeURIComponent(projectId)}/chat-groups/${encodeURIComponent(groupId)}`,
    json("DELETE"),
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
