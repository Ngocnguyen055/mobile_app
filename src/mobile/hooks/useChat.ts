import { useRef, useState, type MutableRefObject } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  type ChatAttachment,
  type ChatGroup,
  type ChatMessage,
  type StoredMessage,
} from "../domain/chat.ts";

import {
  chatAttachmentUrl,
  ApiError,
  deleteStoredDirectConversation,
  getToken,
  loadBlockedChatUsers,
  loadChatUser,
  markStoredChatMessagesRead,
  persistDirectChatMessage,
  persistGroupChatMessage,
  searchChatUsers,
  setChatUserBlocked,
  syncStoredChatMessages,
  uploadChatAttachments,
  uploadGroupChatAttachments,
  type ChatContact,
  type Project,
  type User,
} from "../services/api.ts";
import { canSendDirect } from "../domain/directChatPolicy.ts";
import { MobileStore } from "../services/local.ts";

type UseChatOptions = {
  user: User | null;
  projectRef: MutableRefObject<Project | null>;
  onError: (message: string) => void;
};

export function chatGroupForProject(project: Project): ChatGroup | null {
  if (!project.chatGroupId) return null;
  return {
    id: project.chatGroupId,
    ownerId: project.owner,
    members: [
      ...new Set(
        project.members.map((member) =>
          typeof member === "string" ? member : member._id,
        ),
      ),
    ],
    version: project.version,
    projectId: project._id,
    archived: project.archived,
  };
}

export function useChat({ user, projectRef, onError }: UseChatOptions) {
  const setError = onError;
  const execute = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  const [group, setGroup] = useState<ChatGroup | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [chatContacts, setChatContacts] = useState<ChatContact[]>([]);
  const [chatContactsLoading, setChatContactsLoading] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [chatSearchResults, setChatSearchResults] = useState<ChatContact[]>([]);
  const [chatSearching, setChatSearching] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [directContact, setDirectContact] = useState<ChatContact | null>(null);
  const [directMessages, setDirectMessages] = useState<StoredMessage[]>([]);
  const [directMessageBody, setDirectMessageBody] = useState("");
  const [directOpening, setDirectOpening] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [directUploading, setDirectUploading] = useState(false);
  const [groupUploading, setGroupUploading] = useState(false);
  const [directInfoVisible, setDirectInfoVisible] = useState(false);
  const directSendingRef = useRef(false);
  const store = useRef<MobileStore | null>(null);
  const directContactRef = useRef<ChatContact | null>(null);
  const directOpenRequest = useRef(0);
  const chatSyncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatSyncing = useRef(false);

  const createPersistentInput = (
    body: string,
    attachments: ChatAttachment[] = [],
  ) => ({
    messageId: Crypto.randomUUID(),
    sessionId: Crypto.randomUUID(),
    timestamp: Date.now(),
    sequence: Date.now(),
    body: body.trim(),
    attachmentIds: attachments.map((attachment) => attachment.id),
  });

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
    if (!local) return;
    for (const item of await local.listChatOutbox()) {
      try {
        if (item.targetKind === "direct") {
          const row = await persistDirectChatMessage(
            item.targetId,
            item.payload,
          );
          await local.put(row);
        } else {
          const rows = await persistGroupChatMessage(
            item.targetId,
            item.payload,
          );
          await local.deleteGroupDeliveries(item.payload.messageId, item.targetId);
          for (const row of rows) await local.put(row);
        }
        await local.removeChatOutbox(item.id);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status < 500) {
          const affected = (await local.list()).filter(
            (row) => row.message.messageId === item.payload.messageId,
          );
          for (const row of affected)
            await local.mark(
              row.message.messageId,
              row.message.receiverId,
              "failed",
            );
          await local.removeChatOutbox(item.id);
        }
        throw caught;
      }
    }
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
    if (result.assets.length > 3)
      throw new Error("Mỗi lần gửi tối đa 3 ảnh hoặc tệp.");
    if (result.assets.some((file) => (file.size || 0) > 512 * 1024))
      throw new Error("Mỗi ảnh hoặc tệp tối đa 512 KiB.");
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

  const downloadChatAttachment = async (attachment: ChatAttachment) => {
    if (!FileSystem.documentDirectory)
      throw new Error("Thiết bị không có thư mục lưu tệp.");
    const safeName = attachment.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const destination = `${FileSystem.documentDirectory}chat-${attachment.id}-${safeName}`;
    const file = await FileSystem.downloadAsync(
      chatAttachmentUrl(attachment.id),
      destination,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (file.status < 200 || file.status >= 300)
      throw new Error(`Không tải được tệp (HTTP ${file.status}).`);
    await Sharing.shareAsync(file.uri, { mimeType: attachment.mime });
  };

  const ensureGroup = async () => {
    const currentProject = projectRef.current;
    if (!currentProject) return null;
    const currentGroup = chatGroupForProject(currentProject);
    if (!currentGroup) return null;
    if (projectRef.current?._id === currentProject._id) setGroup(currentGroup);
    try {
      await syncPersistentChat();
      const local = store.current;
      if (local) {
        const unread = (await local.list())
          .filter(
            (row) =>
              row.message.groupId === currentGroup.id &&
              row.message.senderId !== user?._id,
          )
          .map((row) => row.message.messageId);
        if (unread.length) void markStoredChatMessagesRead(unread);
      }
    } catch {
      /* Project chat can still display the SQLite cache. */
    }
    return currentGroup;
  };

  const queueGroupMessage = async (
    body: string,
    attachments: ChatAttachment[] = [],
  ) => {
    if (!group || !store.current)
      throw new Error("Nhóm chưa sẵn sàng");
    const currentProject = projectRef.current;
    if (!currentProject || currentProject.archived)
      throw new Error("Dự án đã lưu trữ chỉ được xem.");
    const currentGroup = await ensureGroup();
    if (!currentGroup) throw new Error("Nhóm chưa sẵn sàng");
    const input = createPersistentInput(body, attachments);
    const recipients = currentGroup.members.filter((id) => id !== user?._id);
    if (!recipients.length) throw new Error("Nhóm chưa có người nhận khác.");
    for (const receiverId of recipients) {
      const message: ChatMessage = {
        ...input,
        senderId: user!._id,
        receiverId,
        groupId: currentGroup.id,
        type: attachments.length ? "attachment" : "text",
        attachments: attachments.length ? attachments : undefined,
      };
      await store.current.put({ message, status: "queued" });
    }
    await store.current.enqueueChatOutbox({
      id: input.messageId,
      targetKind: "group",
      targetId: currentGroup.id,
      payload: input,
      createdAt: input.timestamp,
    });
    await refreshChatViews();
    try {
      await flushChatOutbox();
    } catch (caught) {
      if (caught instanceof ApiError) throw caught;
      setLogs((current) => [
        "Tin nhóm đã lưu trên thiết bị và sẽ tự gửi khi API hoạt động lại.",
        ...current,
      ].slice(0, 100));
    }
    await refreshChatViews();
  };

  const sendChat = async () => {
    if (!messageBody.trim()) throw new Error("Hãy nhập tin nhắn.");
    await queueGroupMessage(messageBody);
    setMessageBody("");
  };

  const pickAndSendGroupAttachments = async () => {
    if (!group) throw new Error("Nhóm chưa sẵn sàng.");
    if (groupUploading) return;
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: "*/*",
    });
    if (result.canceled) return;
    if (result.assets.length > 3)
      throw new Error("Mỗi lần gửi tối đa 3 ảnh hoặc tệp.");
    if (result.assets.some((file) => (file.size || 0) > 512 * 1024))
      throw new Error("Mỗi ảnh hoặc tệp tối đa 512 KiB.");
    setGroupUploading(true);
    try {
      const attachments = await uploadGroupChatAttachments(
        group.id,
        result.assets,
      );
      await queueGroupMessage(messageBody, attachments);
      setMessageBody("");
    } finally {
      setGroupUploading(false);
    }
  };

  const disposeChat = () => {
    directOpenRequest.current += 1;
    if (chatSyncTimer.current) clearInterval(chatSyncTimer.current);
    chatSyncTimer.current = null;
    chatSyncing.current = false;
    store.current = null;
    directContactRef.current = null;
  };

  const resetChatState = () => {
    disposeChat();
    setMessages([]);
    setGroup(null);
    setLogs([]);
    setChatContacts([]);
    setChatSearch("");
    setChatSearchResults([]);
    setChatSearching(false);
    setBlockedUserIds([]);
    setDirectContact(null);
    setDirectMessages([]);
    setDirectMessageBody("");
    directSendingRef.current = false;
    setDirectSending(false);
    setDirectUploading(false);
    setGroupUploading(false);
    setDirectInfoVisible(false);
  };

  return {
    group,
    setGroup,
    messageBody,
    setMessageBody,
    messages,
    setMessages,
    logs,
    chatContacts,
    chatContactsLoading,
    chatSearch,
    setChatSearch,
    chatSearchResults,
    setChatSearchResults,
    chatSearching,
    blockedUserIds,
    directContact,
    directMessages,
    directMessageBody,
    setDirectMessageBody,
    directOpening,
    directSending,
    directUploading,
    groupUploading,
    directInfoVisible,
    setDirectInfoVisible,
    initializeChat,
    disposeChat,
    resetChatState,
    closeDirectConversation,
    loadDirectConversations,
    searchDirectUsers,
    openDirectConversation,
    sendDirectMessage,
    confirmChangeDirectBlock,
    confirmDeleteDirectConversation,
    showDirectConversationActions,
    pickAndSendDirectAttachments,
    pickAndSendGroupAttachments,
    downloadChatAttachment,
    ensureGroup,
    sendChat,
  };
}
