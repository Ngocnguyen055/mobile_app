import type { StoredMessage } from "../../domain/chat.ts";
import {
  ApiError,
  persistDirectChatMessage,
  persistGroupChatMessage,
  syncStoredChatMessages,
} from "../api.ts";
import type { MobileStore } from "../storage/mobileStore.ts";

type OutboxStore = Pick<MobileStore,
  "listChatOutbox" | "put" | "deleteGroupDeliveries" | "removeChatOutbox" | "list" | "mark"
>;
type SyncStore = Pick<MobileStore, "getChatSyncCursor" | "setChatSyncCursor" | "put">;

/** Keep transient failures queued; permanent rejection fails all local deliveries. */
export async function flushChatOutbox(local: OutboxStore) {
  for (const item of await local.listChatOutbox()) {
    try {
      if (item.targetKind === "direct") {
        const row = await persistDirectChatMessage(item.targetId, item.payload);
        await local.put(row);
      } else {
        const rows = await persistGroupChatMessage(item.targetId, item.payload);
        await local.deleteGroupDeliveries(item.payload.messageId, item.targetId);
        for (const row of rows) await local.put(row);
      }
      await local.removeChatOutbox(item.id);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status < 500) {
        const affected = (await local.list()).filter(
          row => row.message.messageId === item.payload.messageId,
        );
        for (const row of affected) {
          await local.mark(row.message.messageId, row.message.receiverId, "failed");
        }
        await local.removeChatOutbox(item.id);
      }
      throw caught;
    }
  }
}

/** Advance each cursor only after its complete page has reached local storage. */
export async function pullChatMessages(local: SyncStore) {
  let cursor = await local.getChatSyncCursor();
  const received: StoredMessage[] = [];
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = await syncStoredChatMessages(cursor);
    for (const row of page.items) {
      await local.put(row);
      received.push(row);
    }
    cursor = page.nextCursor;
    await local.setChatSyncCursor(cursor);
    if (!page.hasMore) break;
  }
  return received;
}
