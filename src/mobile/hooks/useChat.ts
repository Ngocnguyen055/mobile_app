import { useRef, useState, type MutableRefObject } from "react";
import { Alert } from "react-native";
import { RTCPeerConnection } from "react-native-webrtc";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  DirectChatService,
  PeerClient,
  isDirectMessageBetween,
  type ChatAttachment,
  type PeerConfig,
  type Group,
  type StoredMessage,
} from "@ds01/shared";

import {
  chatAttachmentUrl,
  getToken,
  loadBlockedChatUsers,
  loadChatUser,
  searchChatUsers,
  setChatUserBlocked,
  uploadChatAttachments,
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

export function useChat({ user, projectRef, onError }: UseChatOptions) {
  const setError = onError;
  const execute = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  const [online, setOnline] = useState<string[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [modes, setModes] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [forceRelay, setForceRelay] = useState(false);
  const [chatContacts, setChatContacts] = useState<ChatContact[]>([]);
  const [chatContactsLoading, setChatContactsLoading] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [chatSearchResults, setChatSearchResults] = useState<ChatContact[]>([]);
  const [chatSearching, setChatSearching] = useState(false);
  const [blockedPeerIds, setBlockedPeerIds] = useState<string[]>([]);
  const [directContact, setDirectContact] = useState<ChatContact | null>(null);
  const [directMessages, setDirectMessages] = useState<StoredMessage[]>([]);
  const [directMessageBody, setDirectMessageBody] = useState("");
  const [directOpening, setDirectOpening] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [directUploading, setDirectUploading] = useState(false);
  const [directInfoVisible, setDirectInfoVisible] = useState(false);
  const directSendingRef = useRef(false);
  const peer = useRef<PeerClient | null>(null);
  const peerConnect = useRef<Promise<void> | null>(null);
  const store = useRef<MobileStore | null>(null);
  const directChat = useRef<DirectChatService | null>(null);
  const directContactRef = useRef<ChatContact | null>(null);
  const directOpenRequest = useRef(0);

  const initializePeer = async (me: User, isCancelled: () => boolean) => {
    const id = me._id || me.id!;
    const local = new MobileStore(id);
    store.current = local;
    const instance = new PeerClient({
      peerId: id,
      identityProof: getToken(),
      signalUrl: process.env.EXPO_PUBLIC_SIGNAL_URL || "http://10.0.2.2:4001",
      relayUrl: process.env.EXPO_PUBLIC_RELAY_URL || "http://10.0.2.2:4002",
      rtc: RTCPeerConnection as unknown as PeerConfig["rtc"],
      store: local,
      onEvent: (event) => {
        if (peer.current !== instance) return;
        if (event.kind === "presence") setOnline(event.peers || []);
        if (
          event.kind === "group" &&
          projectRef.current?.chatGroupId === event.group?.id
        )
          setGroup(event.group?.members.includes(id) ? event.group : null);
        if (event.kind === "mode" && event.peerId)
          setModes((current) => ({ ...current, [event.peerId!]: event.mode! }));
        if (event.kind === "message") {
          void local.list().then(setMessages);
          if (event.message && !event.message.message.groupId) {
            const message = event.message.message;
            const otherId =
              message.senderId === id ? message.receiverId : message.senderId;
            void local.listDirectContacts().then(async (contacts) => {
              if (contacts.some((contact) => contact.peerId === otherId)) return;
              try {
                const contact = await loadChatUser(otherId);
                await local.saveDirectContact({
                  peerId: contact.id,
                  name: contact.name,
                  email: contact.email,
                  updatedAt: Date.now(),
                });
                if (peer.current === instance)
                  setChatContacts((current) =>
                    current.some((item) => item.id === contact.id)
                      ? current
                      : [contact, ...current],
                  );
              } catch {
                /* Keep the message locally even while the profile API is unavailable. */
              }
            });
          }
          const selected = directContactRef.current;
          if (
            selected &&
            event.message &&
            isDirectMessageBetween(event.message.message, id, selected.id)
          ) {
            void local.listDirect(selected.id).then((rows) => {
              if (directContactRef.current?.id === selected.id)
                setDirectMessages(rows);
            });
          }
        }
        if (event.kind === "log") {
          if (event.text === "signaling disconnected") setOnline([]);
          setLogs((current) => [event.text || "", ...current].slice(0, 100));
        }
      },
    });
    peer.current = instance;
    directChat.current = new DirectChatService(instance, local);
    const [history, cachedContacts, cachedBlocked] = await Promise.all([
      local.list(),
      local.listDirectContacts(),
      local.listDirectBlocked(),
    ]);
    if (!isCancelled() && peer.current === instance) {
      setMessages(history);
      setChatContacts(
        cachedContacts.map((contact) => ({
          id: contact.peerId,
          name: contact.name,
          email: contact.email,
        })),
      );
      setBlockedPeerIds(cachedBlocked);
    }
  };

  const connectPeer = async () => {
    if (!peer.current) throw new Error("Peer chat chưa được khởi tạo.");
    peerConnect.current ||= peer.current.connect().catch((caught) => {
      peerConnect.current = null;
      throw caught;
    });
    await peerConnect.current;
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
    const service = directChat.current;
    if (!service) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await service.rememberContact({
      peerId: contact.id,
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
    const service = directChat.current;
    const local = store.current;
    if (!service || !local) throw new Error("Chat cá nhân đang khởi tạo.");
    setChatContactsLoading(true);
    try {
      const [cachedContacts, history] = await Promise.all([
        service.contacts(),
        local.list(),
      ]);
      setMessages(history);
      const contacts = new Map<string, ChatContact>(
        cachedContacts.map((contact) => [
          contact.peerId,
          { id: contact.peerId, name: contact.name, email: contact.email },
        ]),
      );
      try {
        const blockedUsers = await loadBlockedChatUsers();
        const serverBlocked = new Set(blockedUsers.map((contact) => contact.id));
        const localBlocked = await service.blockedPeers();
        await Promise.all([
          ...blockedUsers.map(async (contact) => {
            contacts.set(contact.id, contact);
            await service.rememberContact({
              peerId: contact.id,
              name: contact.name,
              email: contact.email,
              updatedAt: Date.now(),
            });
            await service.setBlocked(contact.id, true);
          }),
          ...localBlocked
            .filter((peerId) => !serverBlocked.has(peerId))
            .map((peerId) => service.setBlocked(peerId, false)),
        ]);
        setBlockedPeerIds([...serverBlocked]);
      } catch (caught) {
        setError(
          `Không đồng bộ được danh sách chặn; ứng dụng đang dùng dữ liệu trên máy: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
        setBlockedPeerIds(await service.blockedPeers());
      }

      const missingPeerIds = new Set<string>();
      for (const row of history) {
        const message = row.message;
        if (message.groupId || message.type === "ack") continue;
        const otherId =
          message.senderId === user!._id ? message.receiverId : message.senderId;
        if (otherId !== user!._id && !contacts.has(otherId))
          missingPeerIds.add(otherId);
      }
      const resolved = await Promise.allSettled(
        [...missingPeerIds].map((peerId) => loadChatUser(peerId)),
      );
      for (const result of resolved) {
        if (result.status !== "fulfilled") continue;
        const contact = result.value;
        contacts.set(contact.id, contact);
        await service.rememberContact({
          peerId: contact.id,
          name: contact.name,
          email: contact.email,
          updatedAt: Date.now(),
        });
      }
      setChatContacts([...contacts.values()]);
      try {
        await connectPeer();
      } catch (caught) {
        setOnline([]);
        setError(
          `Không kết nối được dịch vụ chat. Danh sách hội thoại và lịch sử trên máy vẫn dùng được: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
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
    const service = directChat.current;
    if (!service) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await rememberChatContact(contact);
    const request = ++directOpenRequest.current;
    if (directContactRef.current?.id !== contact.id) setDirectMessageBody("");
    directContactRef.current = contact;
    setDirectContact(contact);
    setDirectOpening(true);
    try {
      const history = await service.history(contact.id);
      if (directOpenRequest.current !== request) return;
      setDirectMessages(history);
      try {
        await connectPeer();
        const discovery = await peer.current!.lookupPeer(contact.id);
        if (directOpenRequest.current !== request) return;
        setOnline((current) =>
          discovery.online
            ? [...new Set([...current, contact.id])]
            : current.filter((id) => id !== contact.id),
        );
      } catch (caught) {
        if (directOpenRequest.current !== request) return;
        setOnline((current) => current.filter((id) => id !== contact.id));
        setError(
          `Không lấy được trạng thái của ${contact.name}. Bạn vẫn có thể xem lịch sử trên máy: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    } finally {
      if (directOpenRequest.current === request) setDirectOpening(false);
    }
  };

  const refreshDirectHistory = async (contactId: string) => {
    const service = directChat.current;
    if (!service) return;
    const history = await service.history(contactId);
    if (directContactRef.current?.id === contactId) setDirectMessages(history);
  };

  const sendDirectMessage = async () => {
    const contact = directContactRef.current;
    const service = directChat.current;
    if (!contact || !service) throw new Error("Hãy chọn người nhận.");
    if (blockedPeerIds.includes(contact.id))
      throw new Error("Bạn đã chặn người dùng này.");
    if (directSendingRef.current)
      throw new Error("Tin nhắn trước đang được gửi.");
    if (!canSendDirect(directMessageBody, contact.id, false))
      throw new Error("Tin nhắn phải có từ 1 đến 4000 ký tự.");
    if (!online.includes(contact.id))
      throw new Error(
        `${contact.name} đang offline. Hệ thống chưa hỗ trợ giao tin offline.`,
      );
    const body = directMessageBody.trim();
    directSendingRef.current = true;
    setDirectSending(true);
    try {
      await connectPeer();
      await service.send(contact.id, body);
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
    const service = directChat.current;
    if (!service) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await setChatUserBlocked(contact.id, blocked);
    await service.setBlocked(contact.id, blocked);
    setBlockedPeerIds((current) =>
      blocked
        ? [...new Set([...current, contact.id])]
        : current.filter((peerId) => peerId !== contact.id),
    );
    setDirectInfoVisible(false);
  };

  const confirmChangeDirectBlock = (contact: ChatContact) => {
    const blocked = blockedPeerIds.includes(contact.id);
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
          onPress: () => void execute(() => changeDirectBlock(contact, !blocked)),
        },
      ],
    );
  };

  const deleteDirectConversation = async (contact: ChatContact) => {
    const service = directChat.current;
    const local = store.current;
    if (!service || !local) throw new Error("Chat cá nhân chưa được khởi tạo.");
    await service.deleteConversation(contact.id);
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
      "Tin nhắn chỉ bị xóa khỏi thiết bị này. Thao tác không xóa lịch sử trên thiết bị của người kia.",
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
    const blocked = blockedPeerIds.includes(contact.id);
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
    const service = directChat.current;
    if (!contact || !service) throw new Error("Hãy chọn người nhận.");
    if (blockedPeerIds.includes(contact.id))
      throw new Error("Bạn đã chặn người dùng này.");
    if (!online.includes(contact.id))
      throw new Error(
        `${contact.name} đang offline. Hệ thống chưa hỗ trợ giao tệp offline.`,
      );
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
      await connectPeer();
      const attachments = await uploadChatAttachments(
        contact.id,
        result.assets,
      );
      await service.sendAttachment(contact.id, attachments);
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
    if (!currentProject || !peer.current) return;
    await connectPeer();
    const currentGroup = await peer.current.syncProjectGroup(
      currentProject._id,
    );
    if (projectRef.current?._id === currentProject._id) setGroup(currentGroup);
  };

  const sendChat = async () => {
    if (!group || !peer.current || !store.current)
      throw new Error("Nhóm chưa sẵn sàng");
    const currentProject = projectRef.current;
    if (!currentProject || currentProject.archived)
      throw new Error("Dự án đã lưu trữ chỉ được xem.");
    await ensureGroup();
    const results = await peer.current.sendGroup(group.id, messageBody);
    const failed = Object.entries(results).filter(
      ([, value]) => value === "rejected",
    );
    if (failed.length)
      throw new Error(
        `Không gửi được cho ${failed.map(([id]) => id).join(", ")}`,
      );
    setMessageBody("");
    setMessages(await store.current.list());
  };

  const disposeChat = () => {
    directOpenRequest.current += 1;
    const currentPeer = peer.current;
    peer.current = null;
    currentPeer?.close();
    peerConnect.current = null;
    store.current = null;
    directChat.current = null;
    directContactRef.current = null;
  };

  const resetChatState = () => {
    disposeChat();
    setMessages([]);
    setOnline([]);
    setGroup(null);
    setModes({});
    setLogs([]);
    setForceRelay(false);
    setChatContacts([]);
    setChatSearch("");
    setChatSearchResults([]);
    setChatSearching(false);
    setBlockedPeerIds([]);
    setDirectContact(null);
    setDirectMessages([]);
    setDirectMessageBody("");
    directSendingRef.current = false;
    setDirectSending(false);
    setDirectUploading(false);
    setDirectInfoVisible(false);
  };

  return {
    online,
    group,
    setGroup,
    messageBody,
    setMessageBody,
    messages,
    setMessages,
    modes,
    logs,
    forceRelay,
    setForceRelay,
    chatContacts,
    chatContactsLoading,
    chatSearch,
    setChatSearch,
    chatSearchResults,
    setChatSearchResults,
    chatSearching,
    blockedPeerIds,
    directContact,
    directMessages,
    directMessageBody,
    setDirectMessageBody,
    directOpening,
    directSending,
    directUploading,
    directInfoVisible,
    setDirectInfoVisible,
    peer,
    initializePeer,
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
    downloadChatAttachment,
    ensureGroup,
    sendChat,
  };
}
