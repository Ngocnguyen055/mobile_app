import { useRef, useState } from "react";
import {
  type ChatGroup,
  type StoredMessage
} from "../../domain/chat.ts";
import { MobileStore } from "../../services/local.ts";
import type { ChatContact } from "../../types/api.ts";
export function useChatState() {
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [group, setGroupState] = useState<ChatGroup | null>(null);
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
  const [groupConversationOpen, setGroupConversationOpen] = useState(false);
  const [directInfoVisible, setDirectInfoVisible] = useState(false);
  const directSendingRef = useRef(false);
  const groupRef = useRef<ChatGroup | null>(null);
  const store = useRef<MobileStore | null>(null);
  const directContactRef = useRef<ChatContact | null>(null);
  const directOpenRequest = useRef(0);
  const chatSyncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatSyncing = useRef(false);

  const setGroup = (next: ChatGroup | null) => {
    groupRef.current = next;
    setGroupState(next);
  };

  const setProjectGroups = (rows: ChatGroup[]) => {
    setGroups(rows);
    const current = groupRef.current;
    const selected =
      rows.find((row) => row.id === current?.id) ||
      rows.find((row) => row.isDefault) ||
      rows[0] ||
      null;
    setGroup(selected);
    return selected;
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
    setGroups([]);
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
    setGroupConversationOpen(false);
    setDirectInfoVisible(false);
  };

  return {
    groups,
    setGroups,
    group,
    setGroupState,
    messageBody,
    setMessageBody,
    messages,
    setMessages,
    logs,
    setLogs,
    chatContacts,
    setChatContacts,
    chatContactsLoading,
    setChatContactsLoading,
    chatSearch,
    setChatSearch,
    chatSearchResults,
    setChatSearchResults,
    chatSearching,
    setChatSearching,
    blockedUserIds,
    setBlockedUserIds,
    directContact,
    setDirectContact,
    directMessages,
    setDirectMessages,
    directMessageBody,
    setDirectMessageBody,
    directOpening,
    setDirectOpening,
    directSending,
    setDirectSending,
    directUploading,
    setDirectUploading,
    groupUploading,
    setGroupUploading,
    groupConversationOpen,
    setGroupConversationOpen,
    directInfoVisible,
    setDirectInfoVisible,
    directSendingRef,
    groupRef,
    store,
    directContactRef,
    directOpenRequest,
    chatSyncTimer,
    chatSyncing,
    setGroup,
    setProjectGroups,
    disposeChat,
    resetChatState,
  };
}
