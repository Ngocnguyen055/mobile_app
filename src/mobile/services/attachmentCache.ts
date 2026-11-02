import * as FileSystem from "expo-file-system/legacy";

import type { ChatAttachment } from "../domain/chat.ts";
import { chatAttachmentUrl, getToken } from "./api.ts";
import { MobileStore } from "./local.ts";

export const ATTACHMENT_CACHE_MAX_BYTES = 200 * 1024 * 1024;

type RemoteFile = {
  cacheKey: string;
  name: string;
  mime: string;
  size: number;
  url: string;
};

const inFlight = new Map<string, Promise<string>>();

function cacheRoot(userId: string) {
  if (!FileSystem.cacheDirectory)
    throw new Error("Thiết bị không hỗ trợ bộ nhớ đệm tệp.");
  return `${FileSystem.cacheDirectory}student-planner/${userId}/`;
}

function safeExtension(name: string) {
  const match = name.match(/(\.[a-zA-Z0-9]{1,10})$/);
  return match?.[1].toLowerCase() || "";
}

async function removeCachedRow(store: MobileStore, key: string, uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  await store.removeAttachmentCache(key);
}

async function trimAttachmentCache(store: MobileStore) {
  const rows = await store.listAttachmentCache();
  let total = 0;
  const existing = [];
  for (const row of rows) {
    const info = await FileSystem.getInfoAsync(row.localUri);
    if (!info.exists || info.size !== row.size) {
      await removeCachedRow(store, row.attachmentId, row.localUri);
      continue;
    }
    total += row.size;
    existing.push(row);
  }
  for (const row of existing) {
    if (total <= ATTACHMENT_CACHE_MAX_BYTES) break;
    await removeCachedRow(store, row.attachmentId, row.localUri);
    total -= row.size;
  }
}

async function ensureCachedRemoteFile(userId: string, file: RemoteFile) {
  const requestKey = `${userId}:${file.cacheKey}`;
  const pending = inFlight.get(requestKey);
  if (pending) return pending;
  const operation = (async () => {
    const store = new MobileStore(userId);
    const root = cacheRoot(userId);
    const destination = `${root}${file.cacheKey}${safeExtension(file.name)}`;
    const cached = await store.getAttachmentCache(file.cacheKey);
    if (cached) {
      const info = await FileSystem.getInfoAsync(cached.localUri);
      if (info.exists && info.size === file.size) {
        await store.touchAttachmentCache(file.cacheKey);
        return cached.localUri;
      }
      await removeCachedRow(store, file.cacheKey, cached.localUri);
    }

    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    const temporary = `${destination}.part`;
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    try {
      const downloaded = await FileSystem.downloadAsync(file.url, temporary, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (downloaded.status < 200 || downloaded.status >= 300)
        throw new Error(`Không tải được tệp (HTTP ${downloaded.status}).`);
      const info = await FileSystem.getInfoAsync(temporary);
      if (!info.exists || info.size !== file.size)
        throw new Error("Tệp tải về không đúng kích thước.");
      await FileSystem.deleteAsync(destination, { idempotent: true });
      await FileSystem.moveAsync({ from: temporary, to: destination });
    } finally {
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(
        () => undefined,
      );
    }
    await store.saveAttachmentCache({
      attachmentId: file.cacheKey,
      localUri: destination,
      size: file.size,
      mime: file.mime,
      lastAccessedAt: Date.now(),
    });
    await trimAttachmentCache(store);
    return destination;
  })().finally(() => inFlight.delete(requestKey));
  inFlight.set(requestKey, operation);
  return operation;
}

export function ensureCachedChatAttachment(
  userId: string,
  attachment: ChatAttachment,
) {
  return ensureCachedRemoteFile(userId, {
    cacheKey: `chat-${attachment.id}`,
    name: attachment.name,
    mime: attachment.mime,
    size: attachment.size,
    url: chatAttachmentUrl(attachment.id),
  });
}

export function ensureCachedProjectDocument(
  userId: string,
  projectId: string,
  document: { _id: string; name: string; mime: string; size: number },
  url: string,
) {
  return ensureCachedRemoteFile(userId, {
    cacheKey: `project-${projectId}-${document._id}`,
    name: document.name,
    mime: document.mime,
    size: document.size,
    url,
  });
}

export async function clearAttachmentCache(userId: string) {
  const store = new MobileStore(userId);
  if (FileSystem.cacheDirectory)
    await FileSystem.deleteAsync(cacheRoot(userId), { idempotent: true }).catch(
      () => undefined,
    );
  await store.clearAttachmentCache();
}
