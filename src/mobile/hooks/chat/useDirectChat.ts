import * as DocumentPicker from "expo-document-picker";
import { Alert } from "react-native";
import {
  type ChatAttachment,
  type ChatMessage
} from "../../domain/chat.ts";
import { canSendDirect } from "../../domain/directChatPolicy.ts";
import {
  ApiError,
  deleteStoredDirectConversation,
  loadBlockedChatUsers,
  loadChatUser,
  markStoredChatMessagesRead,
  searchChatUsers,
  setChatUserBlocked,
  uploadChatAttachments,
} from "../../services/api.ts";
import { createPersistentInput } from "../../services/chat/messageInput.ts";
import type { ChatContact, User } from "../../types/api.ts";
import { selectedAttachmentValidationError } from "../../utils/attachments.ts";
import type { useChatState } from "./useChatState.ts";
import type { useChatSync } from "./useChatSync.ts";
type Options = {
  state: ReturnType<typeof useChatState>;
  sync: ReturnType<typeof useChatSync>;
  user: User | null;
  onError: (message: string) => void
};
export function useDirectChat({
  state,
  sync,
  user,
  onError: setError,
}: Options) {
  const {
    setMessages,
    setLogs,
    setChatContacts,
    setChatContactsLoading,
    chatSearch,
    setChatSearchResults,
    setChatSearching,
    blockedUserIds,
    setBlockedUserIds,
    setDirectContact,
    setDirectMessages,
    directMessageBody,
    setDirectMessageBody,
    setDirectOpening,
    setDirectSending,
    directUploading,
    setDirectUploading,
    setDirectInfoVisible,
    directSendingRef,
    store,
    directContactRef,
    directOpenRequest,
  } = state;

  const { refreshChatViews, flushChatOutbox, syncPersistentChat } = sync;
  const execute = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const closeDirectConversation = () => {
    directOpenRequest.current += 1;
    directContactRef.current = null;
    setDirectContact(null);
    setDirectMessages([]);
    setDirectMessageBody("");
    setDirectOpening(false);
    setDirectInfoVisible(false);
  };

  const rememberChatContact = async (contact: ChatContact) => {
    const local = store.current;
    if (!local) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await local.saveDirectContact({
      userId: contact.id,
      name: contact.name,
      email: contact.email,
      updatedAt: Date.now(),
    });
    setChatContacts((current) => [
      contact,
      ...current.filter((item) => item.id !== contact.id),
    ]);
  };

  const loadDirectConversations = async () => {
    const local = store.current;
    if (!local) throw new Error("Chat cá nhân đang khởi tạo.");
    setChatContactsLoading(true);
    try {
      const [cachedContacts, history] = await Promise.all([
        local.listDirectContacts(),
        local.list(),
      ]);
      setMessages(history);
      const contacts = new Map<string, ChatContact>(
        cachedContacts.map((contact) => [
          contact.userId,
          { id: contact.userId, name: contact.name, email: contact.email },
        ]),
      );
      try {
        const blockedUsers = await loadBlockedChatUsers();
        const serverBlocked = new Set(
          blockedUsers.map((contact) => contact.id),
        );
        const localBlocked = await local.listDirectBlocked();
        await Promise.all([
          ...blockedUsers.map(async (contact) => {
            contacts.set(contact.id, contact);
            await local.saveDirectContact({
              userId: contact.id,
              name: contact.name,
              email: contact.email,
              updatedAt: Date.now(),
            });
            await local.setDirectBlocked(contact.id, true);
          }),
          ...localBlocked
            .filter((userId) => !serverBlocked.has(userId))
            .map((userId) => local.setDirectBlocked(userId, false)),
        ]);
        setBlockedUserIds([...serverBlocked]);
      } catch (caught) {
        setError(
          `Không đồng bộ được danh sách chặn; ứng dụng đang dùng dữ liệu trên máy: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
        setBlockedUserIds(await local.listDirectBlocked());
      }

      const missingUserIds = new Set<string>();
      for (const row of history) {
        const message = row.message;
        if (message.groupId) continue;
        const otherId =
          message.senderId === user!._id
            ? message.receiverId
            : message.senderId;
        if (otherId !== user!._id && !contacts.has(otherId))
          missingUserIds.add(otherId);
      }
      const resolved = await Promise.allSettled(
        [...missingUserIds].map((userId) => loadChatUser(userId)),
      );
      for (const result of resolved) {
        if (result.status !== "fulfilled") continue;
        const contact = result.value;
        contacts.set(contact.id, contact);
        await local.saveDirectContact({
          userId: contact.id,
          name: contact.name,
          email: contact.email,
          updatedAt: Date.now(),
        });
      }
      setChatContacts([...contacts.values()]);
      return [...contacts.values()];
    } finally {
      setChatContactsLoading(false);
    }
  };

  const searchDirectUsers = async () => {
    const query = chatSearch.trim();
    if (query.length < 3)
      throw new Error("Nhập ít nhất 3 ký tự trong email cần tìm.");
    setChatSearching(true);
    try {
      setChatSearchResults(await searchChatUsers(query));
    } finally {
      setChatSearching(false);
    }
  };

  const openDirectConversation = async (contact: ChatContact) => {
    const local = store.current;
    if (!local) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await rememberChatContact(contact);
    const request = ++directOpenRequest.current;
    if (directContactRef.current?.id !== contact.id) setDirectMessageBody("");
    directContactRef.current = contact;
    setDirectContact(contact);
    setDirectOpening(true);
    try {
      try {
        await syncPersistentChat();
      } catch {
        /* Local history remains available while the API is unreachable. */
      }
      const history = await local.listDirect(contact.id);
      if (directOpenRequest.current !== request) return;
      setDirectMessages(history);
      const unreadIds = history
        .filter((row) => row.message.senderId === contact.id)
        .map((row) => row.message.messageId);
      if (unreadIds.length)
        void markStoredChatMessagesRead(unreadIds).catch(() => {
          /* Read receipts will be retried by a later conversation refresh. */
        });
    } finally {
      if (directOpenRequest.current === request) setDirectOpening(false);
    }
  };

  const refreshDirectHistory = async (contactId: string) => {
    const local = store.current;
    if (!local) return;
    const history = await local.listDirect(contactId);
    if (directContactRef.current?.id === contactId) setDirectMessages(history);
  };

  const queueDirectMessage = async (
    contact: ChatContact,
    body: string,
    attachments: ChatAttachment[] = [],
  ) => {
    const local = store.current;
    if (!local || !user) throw new Error("Chat cá nhân đang khởi tạo.");
    const input = createPersistentInput(body, attachments);
    const message: ChatMessage = {
      ...input,
      senderId: user._id,
      receiverId: contact.id,
      groupId: null,
      type: attachments.length ? "attachment" : "text",
      attachments: attachments.length ? attachments : undefined,
    };
    await local.put({ message, status: "queued" });
    await local.enqueueChatOutbox({
      id: input.messageId,
      targetKind: "direct",
      targetId: contact.id,
      payload: input,
      createdAt: input.timestamp,
    });
    await refreshChatViews();
    try {
      await flushChatOutbox();
    } catch (caught) {
      if (caught instanceof ApiError) throw caught;
      setLogs((current) => [
        "Tin nhắn đã lưu trên thiết bị và sẽ tự gửi khi API hoạt động lại.",
        ...current,
      ].slice(0, 100));
    }
    await refreshChatViews();
  };

  const sendDirectMessage = async () => {
    const contact = directContactRef.current;
    if (!contact || !store.current) throw new Error("Hãy chọn người nhận.");
    if (blockedUserIds.includes(contact.id))
      throw new Error("Bạn đã chặn người dùng này.");
    if (directSendingRef.current)
      throw new Error("Tin nhắn trước đang được gửi.");
    if (!canSendDirect(directMessageBody, contact.id, false))
      throw new Error("Tin nhắn phải có từ 1 đến 4000 ký tự.");
    const body = directMessageBody.trim();
    directSendingRef.current = true;
    setDirectSending(true);
    try {
      await queueDirectMessage(contact, body);
      if (directContactRef.current?.id === contact.id) setDirectMessageBody("");
    } finally {
      try {
        await refreshDirectHistory(contact.id);
      } finally {
        directSendingRef.current = false;
        setDirectSending(false);
      }
    }
  };

  const changeDirectBlock = async (contact: ChatContact, blocked: boolean) => {
    const local = store.current;
    if (!local) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await setChatUserBlocked(contact.id, blocked);
    await local.setDirectBlocked(contact.id, blocked);
    setBlockedUserIds((current) =>
      blocked
        ? [...new Set([...current, contact.id])]
        : current.filter((userId) => userId !== contact.id),
    );
    setDirectInfoVisible(false);
  };

  const confirmChangeDirectBlock = (contact: ChatContact) => {
    const blocked = blockedUserIds.includes(contact.id);
    Alert.alert(
      blocked ? "Bỏ chặn người dùng?" : "Chặn người dùng?",
      blocked
        ? `Bạn sẽ có thể gửi và nhận tin nhắn với ${contact.name}.`
        : `${contact.name} sẽ không thể gửi tin nhắn mới cho bạn. Lịch sử trên máy vẫn được giữ.`,
      [
        { text: "Hủy" },
        {
          text: blocked ? "Bỏ chặn" : "Chặn",
          style: blocked ? "default" : "destructive",
          onPress: () =>
            void execute(() => changeDirectBlock(contact, !blocked)),
        },
      ],
    );
  };

  const deleteDirectConversation = async (contact: ChatContact) => {
    const local = store.current;
    if (!local) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await deleteStoredDirectConversation(contact.id);
    for (const item of await local.listChatOutbox())
      if (item.targetKind === "direct" && item.targetId === contact.id)
        await local.removeChatOutbox(item.id);
    await Promise.all([
      local.deleteDirect(contact.id),
      local.removeDirectContact(contact.id),
    ]);
    const history = await local.list();
    setMessages(history);
    setChatContacts((current) =>
      current.filter((item) => item.id !== contact.id),
    );
    if (directContactRef.current?.id === contact.id) closeDirectConversation();
  };

  const confirmDeleteDirectConversation = (contact: ChatContact) =>
    Alert.alert(
      "Xóa đoạn chat?",
      "Tin nhắn sẽ bị ẩn khỏi tài khoản và xóa khỏi thiết bị này. Thao tác không xóa lịch sử của người kia.",
      [
        { text: "Hủy" },
        {
          text: "Xóa",
          style: "destructive",
          onPress: () => void execute(() => deleteDirectConversation(contact)),
        },
      ],
    );

  const showDirectConversationActions = (contact: ChatContact) => {
    const blocked = blockedUserIds.includes(contact.id);
    Alert.alert(contact.name, contact.email, [
      {
        text: "Xóa đoạn chat",
        style: "destructive",
        onPress: () => confirmDeleteDirectConversation(contact),
      },
      {
        text: blocked ? "Bỏ chặn" : "Chặn",
        onPress: () => confirmChangeDirectBlock(contact),
      },
      { text: "Hủy", style: "cancel" },
    ]);
  };

  const pickAndSendDirectAttachments = async () => {
    const contact = directContactRef.current;
    if (!contact || !store.current) throw new Error("Hãy chọn người nhận.");
    if (blockedUserIds.includes(contact.id))
      throw new Error("Bạn đã chặn người dùng này.");
    if (directUploading) return;
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: "*/*",
    });
    if (result.canceled) return;
    const validationError = await selectedAttachmentValidationError(
      0,
      result.assets,
    );
    if (validationError) {
      Alert.alert("Không thể gửi tệp", validationError);
      return;
    }
    setDirectUploading(true);
    try {
      const attachments = await uploadChatAttachments(
        contact.id,
        result.assets,
      );
      await queueDirectMessage(contact, "", attachments);
      await refreshDirectHistory(contact.id);
    } finally {
      setDirectUploading(false);
    }
  };

  return {
    closeDirectConversation,
    loadDirectConversations,
    searchDirectUsers,
    openDirectConversation,
    sendDirectMessage,
    confirmChangeDirectBlock,
    confirmDeleteDirectConversation,
    showDirectConversationActions,
    pickAndSendDirectAttachments,
  };
}
