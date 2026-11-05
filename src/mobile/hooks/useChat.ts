import * as Sharing from "expo-sharing";
import { type MutableRefObject } from "react";
import {
  type ChatAttachment
} from "../domain/chat.ts";
import { ensureCachedChatAttachment } from "../services/attachmentCache.ts";
import type { Project, User } from "../types/api.ts";
import { useChatState } from "./chat/useChatState.ts";
import { useChatSync } from "./chat/useChatSync.ts";
import { useDirectChat } from "./chat/useDirectChat.ts";
import { useProjectChat } from "./chat/useProjectChat.ts";
export { chatGroupForProject } from "../domain/projectChat.ts";
type UseChatOptions = {
  user: User | null;
  projectRef: MutableRefObject<Project | null>;
  onError: (message: string) => void;
};

/** Compose chat flows while retaining the controller used by screens. */
export function useChat({ user, projectRef, onError }: UseChatOptions) {
  const state = useChatState();
  const sync = useChatSync({ state, user });
  const direct = useDirectChat({ state, sync, user, onError });
  const projectChat = useProjectChat({ state, sync, user, projectRef });
  const {
    groups,
    group,
    setGroup,
    setProjectGroups,
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
    groupConversationOpen,
    directInfoVisible,
    setDirectInfoVisible,
    disposeChat,
    resetChatState,
  } = state;
  const { initializeChat } = sync;
  const {
    closeDirectConversation,
    loadDirectConversations,
    searchDirectUsers,
    openDirectConversation,
    sendDirectMessage,
    confirmChangeDirectBlock,
    confirmDeleteDirectConversation,
    showDirectConversationActions,
    pickAndSendDirectAttachments,
  } = direct;
  const {
    selectProjectGroup,
    closeProjectGroupConversation,
    createProjectGroup,
    deleteProjectGroup,
    ensureGroup,
    sendChat,
    pickAndSendGroupAttachments,
  } = projectChat;
  const downloadChatAttachment = async (attachment: ChatAttachment) => {
    if (!user?._id) throw new Error("Bạn cần đăng nhập để mở tệp.");
    const uri = await ensureCachedChatAttachment(user._id, attachment);
    await Sharing.shareAsync(uri, { mimeType: attachment.mime });
  };

  return {
    groups,
    group,
    setGroup,
    setProjectGroups,
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
    groupConversationOpen,
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
    selectProjectGroup,
    closeProjectGroupConversation,
    createProjectGroup,
    deleteProjectGroup,
    ensureGroup,
    sendChat,
  };
}
