import {
  type StoredMessage
} from "../../domain/chat.ts";
import { loadChatUser } from "../../services/api.ts";
import { flushChatOutbox as flushOutbox, pullChatMessages } from "../../services/chat/persistence.ts";
import { MobileStore } from "../../services/local.ts";
import type { User } from "../../types/api.ts";
import type { useChatState } from "./useChatState.ts";
type Options = {
  state: ReturnType<typeof useChatState>;
  user: User | null
};
export function useChatSync({ state, user }: Options) {
  const {
    setMessages,
    setLogs,
    setChatContacts,
    setChatContactsLoading,
    setChatContactsReady,
    setBlockedUserIds,
    setDirectMessages,
    store,
    directContactRef,
    chatSyncTimer,
    chatSyncing,
  } = state;

  const refreshChatViews = async () => {
    const local = store.current;
    if (!local) return;
    const history = await local.list();
    setMessages(history);
    const selected = directContactRef.current;
    if (selected) setDirectMessages(await local.listDirect(selected.id));
  };

  const flushChatOutbox = async () => {
    const local = store.current;
    if (local) await flushOutbox(local);
  };

  const rememberContactsFromMessages = async (rows: StoredMessage[]) => {
    const local = store.current;
    const currentUserId = user?._id;
    if (!local || !currentUserId) return;
    const known = new Set(
      (await local.listDirectContacts()).map((contact) => contact.userId),
    );
    const missing = new Set<string>();
    for (const row of rows) {
      const message = row.message;
      if (message.groupId) continue;
      const otherId: string =
        message.senderId === currentUserId
          ? message.receiverId
          : message.senderId;
      if (otherId !== currentUserId && !known.has(otherId))
        missing.add(otherId);
    }
    for (const userId of missing) {
      try {
        const contact = await loadChatUser(userId);
        await local.saveDirectContact({
          userId: contact.id,
          name: contact.name,
          email: contact.email,
          updatedAt: Date.now(),
        });
        setChatContacts((current) =>
          current.some((item) => item.id === contact.id)
            ? current
            : [contact, ...current],
        );
      } catch {
        /* The message remains available even if profile lookup is temporary. */
      }
    }
  };

  const syncPersistentChat = async () => {
    const local = store.current;
    if (!local || chatSyncing.current) return;
    chatSyncing.current = true;
    try {
      await flushChatOutbox();
      const received = await pullChatMessages(local);
      await rememberContactsFromMessages(received);
      await refreshChatViews();
    } finally {
      chatSyncing.current = false;
    }
  };

  const initializeChat = async (me: User, isCancelled: () => boolean) => {
    const id = me._id || me.id!;
    const local = new MobileStore(id);
    store.current = local;
    setChatContactsLoading(true);
    try {
      const [history, cachedContacts, cachedBlocked] = await Promise.all([
        local.list(),
        local.listDirectContacts(),
        local.listDirectBlocked(),
      ]);
      if (!isCancelled() && store.current === local) {
        setMessages(history);
        setChatContacts(
          cachedContacts.map((contact) => ({
            id: contact.userId,
            name: contact.name,
            email: contact.email,
          })),
        );
        setChatContactsReady(true);
        setBlockedUserIds(cachedBlocked);
        if (chatSyncTimer.current) clearInterval(chatSyncTimer.current);
        void syncPersistentChat().catch((caught) =>
          setLogs((current) => [
            `Đồng bộ chat tạm gián đoạn: ${caught instanceof Error ? caught.message : String(caught)}`,
            ...current,
          ].slice(0, 100)),
        );
        chatSyncTimer.current = setInterval(() => {
          void syncPersistentChat().catch(() => {
            /* A queued message remains in SQLite until the API is reachable. */
          });
        }, 3_000);
      }
    } finally {
      if (!isCancelled() && store.current === local)
        setChatContactsLoading(false);
    }
  };

  return { refreshChatViews, flushChatOutbox, syncPersistentChat, initializeChat };
}
