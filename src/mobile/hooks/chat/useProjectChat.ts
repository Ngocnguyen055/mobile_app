import * as DocumentPicker from "expo-document-picker";
import { type MutableRefObject } from "react";
import { Alert } from "react-native";
import {
  type ChatAttachment,
  type ChatGroup,
  type ChatMessage
} from "../../domain/chat.ts";
import { chatGroupForProject } from "../../domain/projectChat.ts";
import {
  ApiError,
  createProjectChatGroup,
  deleteProjectChatGroup,
  loadProjectChatGroups,
  markStoredChatMessagesRead,
  uploadGroupChatAttachments,
} from "../../services/api.ts";
import { createPersistentInput } from "../../services/chat/messageInput.ts";
import type { Project, User } from "../../types/api.ts";
import { selectedAttachmentValidationError } from "../../utils/attachments.ts";
import type { useChatState } from "./useChatState.ts";
import type { useChatSync } from "./useChatSync.ts";
type Options = {
  state: ReturnType<typeof useChatState>;
  sync: ReturnType<typeof useChatSync>;
  user: User | null;
  projectRef: MutableRefObject<Project | null>
};
export function useProjectChat({
  state,
  sync,
  user,
  projectRef,
}: Options) {
  const {
    groups,
    messageBody,
    setMessageBody,
    setLogs,
    groupUploading,
    setGroupUploading,
    setGroupConversationOpen,
    groupRef,
    store,
    setGroup,
    setProjectGroups,
  } = state;

  const { refreshChatViews, flushChatOutbox, syncPersistentChat } = sync;
  const markGroupRead = async (selected: ChatGroup) => {
    const local = store.current;
    if (!local) return;
    const unread = (await local.list())
      .filter(
        (row) =>
          row.message.groupId === selected.id &&
          row.message.senderId !== user?._id,
      )
      .map((row) => row.message.messageId);
    if (unread.length) await markStoredChatMessagesRead(unread);
  };

  const selectProjectGroup = async (selected: ChatGroup) => {
    const currentProject = projectRef.current;
    if (!currentProject || selected.projectId !== currentProject._id)
      throw new Error("Nhóm chat không thuộc dự án hiện tại.");
    setGroup(selected);
    setMessageBody("");
    setGroupConversationOpen(true);
    try {
      await syncPersistentChat();
      await markGroupRead(selected);
    } catch {
      /* The selected group's SQLite history remains available offline. */
    }
  };

  const closeProjectGroupConversation = () => {
    setGroupConversationOpen(false);
    setMessageBody("");
  };

  const ensureGroup = async () => {
    const currentProject = projectRef.current;
    if (!currentProject) return null;
    let currentGroup = groupRef.current;
    try {
      currentGroup = setProjectGroups(
        await loadProjectChatGroups(currentProject._id),
      );
    } catch {
      if (!currentGroup || currentGroup.projectId !== currentProject._id) {
        const fallback = chatGroupForProject(currentProject);
        setProjectGroups(fallback ? [fallback] : []);
        currentGroup = fallback;
      }
    }
    if (!currentGroup) return null;
    try {
      await syncPersistentChat();
      await markGroupRead(currentGroup);
    } catch {
      /* Project chat can still display the SQLite cache. */
    }
    return currentGroup;
  };

  const createProjectGroup = async (name: string) => {
    const currentProject = projectRef.current;
    const value = name.trim();
    if (!currentProject) throw new Error("Hãy mở một dự án trước.");
    if (!value) throw new Error("Hãy nhập tên nhóm.");
    if (currentProject.archived)
      throw new Error("Dự án đã lưu trữ chỉ được xem.");
    const created = await createProjectChatGroup(currentProject._id, value);
    setProjectGroups([...groups, created]);
    setGroup(created);
    setMessageBody("");
    try {
      const rows = await loadProjectChatGroups(currentProject._id);
      setProjectGroups(rows);
      const selected = rows.find((row) => row.id === created.id) || created;
      setGroup(selected);
      return selected;
    } catch {
      return created;
    }
  };

  const deleteProjectGroup = async (selected: ChatGroup) => {
    const currentProject = projectRef.current;
    if (!currentProject || selected.projectId !== currentProject._id)
      throw new Error("Nhóm chat không thuộc dự án hiện tại.");
    if (selected.isDefault) throw new Error("Không thể xóa nhóm Chung.");
    if (groupRef.current?.id === selected.id)
      setGroupConversationOpen(false);
    await deleteProjectChatGroup(currentProject._id, selected.id);
    const remaining = groups.filter((row) => row.id !== selected.id);
    const fallback = setProjectGroups(remaining);
    const local = store.current;
    if (local) {
      for (const item of await local.listChatOutbox()) {
        if (item.targetKind !== "group" || item.targetId !== selected.id)
          continue;
        const affected = (await local.list()).filter(
          (row) =>
            row.message.groupId === selected.id &&
            row.message.messageId === item.payload.messageId,
        );
        for (const row of affected)
          await local.mark(
            row.message.messageId,
            row.message.receiverId,
            "failed",
          );
        await local.removeChatOutbox(item.id);
      }
    }
    setMessageBody("");
    try {
      return setProjectGroups(
        await loadProjectChatGroups(currentProject._id),
      );
    } catch {
      return fallback;
    }
  };

  const queueGroupMessage = async (
    body: string,
    attachments: ChatAttachment[] = [],
  ) => {
    const selectedGroup = groupRef.current;
    if (!selectedGroup || !store.current)
      throw new Error("Nhóm chưa sẵn sàng");
    const currentProject = projectRef.current;
    if (!currentProject || currentProject.archived)
      throw new Error("Dự án đã lưu trữ chỉ được xem.");
    const currentGroup = await ensureGroup();
    if (!currentGroup) throw new Error("Nhóm chưa sẵn sàng");
    if (currentGroup.id !== selectedGroup.id)
      throw new Error("Nhóm vừa bị xóa hoặc không còn khả dụng.");
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
    const selectedGroup = groupRef.current;
    if (!selectedGroup) throw new Error("Nhóm chưa sẵn sàng.");
    if (groupUploading) return;
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
    setGroupUploading(true);
    try {
      const attachments = await uploadGroupChatAttachments(
        selectedGroup.id,
        result.assets,
      );
      await queueGroupMessage(messageBody, attachments);
      setMessageBody("");
    } finally {
      setGroupUploading(false);
    }
  };

  return {
    selectProjectGroup,
    closeProjectGroupConversation,
    createProjectGroup,
    deleteProjectGroup,
    ensureGroup,
    sendChat,
    pickAndSendGroupAttachments,
  };
}
