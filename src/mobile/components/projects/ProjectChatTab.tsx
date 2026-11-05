import React, { memo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  ChatAttachment,
  ChatGroup,
  StoredMessage,
} from "../../domain/chat.ts";
import { type User } from "../../services/api.ts";
import { styles } from "../../styles/app.ts";
import { cardShadow, colors } from "../../styles/theme.ts";
import { formatViDateTime } from "../../utils/calendar.ts";
import CachedChatImage from "../chat/CachedChatImage.tsx";

const statusLabel = {
  pending: "Đang gửi",
  queued: "Đã gửi",
  sent: "Đã gửi",
  delivered: "Đã nhận",
  read: "Đã xem",
  failed: "Không giao được",
  received: "Đã nhận",
} as const;

function groupMessagesForDisplay(
  messages: StoredMessage[],
  group: ChatGroup | null,
  currentUserId: string,
) {
  if (!group) return [];
  const rowsByMessage = new Map<string, StoredMessage[]>();
  for (const row of messages) {
    const message = row.message;
    if (message.groupId !== group.id) continue;
    const outgoing = message.senderId === currentUserId;
    if (outgoing && !group.members.includes(message.receiverId)) continue;
    const key = outgoing
      ? `${message.messageId}:${message.senderId}`
      : `${message.messageId}:${message.senderId}:${message.receiverId}`;
    rowsByMessage.set(key, [...(rowsByMessage.get(key) || []), row]);
  }
  return [...rowsByMessage.values()].sort(
    (left, right) =>
      left[0].message.timestamp - right[0].message.timestamp ||
      left[0].message.messageId.localeCompare(right[0].message.messageId),
  );
}

function latestGroupMessage(messages: StoredMessage[], groupId: string) {
  return messages
    .filter((row) => row.message.groupId === groupId)
    .sort(
      (left, right) =>
        left.message.timestamp - right.message.timestamp ||
        left.message.messageId.localeCompare(right.message.messageId),
    )
    .at(-1);
}

function groupDeliveryLabel(rows: StoredMessage[], outgoing: boolean) {
  if (!outgoing) return statusLabel[rows[0].status];
  const total = rows.length;
  const read = rows.filter((row) => row.status === "read").length;
  const delivered = rows.filter((row) =>
    ["delivered", "read"].includes(row.status),
  ).length;
  const failed = rows.filter((row) => row.status === "failed").length;
  if (read === total) return `Đã xem ${read}/${total}`;
  if (delivered === total) return `Đã nhận ${delivered}/${total}`;
  if (failed === total) return "Không giao được";
  return `${delivered}/${total} đã nhận${failed ? ` · ${failed} lỗi` : ""}`;
}

function userName(members: User[], userId: string) {
  return members.find((member) => member._id === userId)?.name || "Thành viên";
}

function messagePreview(
  row: StoredMessage | undefined,
  members: User[],
  currentUserId: string,
) {
  if (!row) return "Chưa có tin nhắn";
  const message = row.message;
  const prefix =
    message.senderId === currentUserId
      ? "Bạn: "
      : `${userName(members, message.senderId)}: `;
  if (message.attachments?.length)
    return `${prefix}📎 ${message.attachments[0].name}`;
  return `${prefix}${message.body || "Tin nhắn mới"}`;
}

type ProjectChatTabProps = {
  groups: ChatGroup[];
  group: ChatGroup | null;
  members: User[];
  currentUserId: string;
  messages: StoredMessage[];
  readOnly: boolean;
  canManageGroups: boolean;
  conversationOpen: boolean;
  onRefreshGroup: () => void;
  onCloseGroup: () => void;
  onSelectGroup: (group: ChatGroup) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (group: ChatGroup) => void;
  onDownloadAttachment: (attachment: ChatAttachment) => void;
};

function ProjectChatTab({
  groups,
  group,
  members,
  currentUserId,
  messages,
  readOnly,
  canManageGroups,
  conversationOpen,
  onRefreshGroup,
  onCloseGroup,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup,
  onDownloadAttachment,
}: ProjectChatTabProps) {
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [infoVisible, setInfoVisible] = useState(false);
  const openedGroup = conversationOpen ? group : null;
  const visibleMessages = groupMessagesForDisplay(
    messages,
    openedGroup,
    currentUserId,
  );
  const attachments = messages
    .filter((row) => row.message.groupId === openedGroup?.id)
    .flatMap((row) => row.message.attachments || [])
    .filter(
      (attachment, index, rows) =>
        rows.findIndex((item) => item.id === attachment.id) === index,
    );
  const images = attachments.filter((attachment) =>
    attachment.mime.startsWith("image/"),
  );
  const files = attachments.filter(
    (attachment) => !attachment.mime.startsWith("image/"),
  );
  const sortedGroups = [...groups].sort((left, right) => {
    const leftTime =
      latestGroupMessage(messages, left.id)?.message.timestamp || 0;
    const rightTime =
      latestGroupMessage(messages, right.id)?.message.timestamp || 0;
    return (
      rightTime - leftTime ||
      Number(right.isDefault) - Number(left.isDefault) ||
      left.name.localeCompare(right.name, "vi")
    );
  });

  const closeCreator = () => {
    setCreating(false);
    setGroupName("");
  };
  const createGroup = () => {
    const name = groupName.trim();
    if (!name) return;
    closeCreator();
    onCreateGroup(name);
  };
  const openGroup = (selected: ChatGroup) => {
    onSelectGroup(selected);
  };
  const closeConversation = () => {
    setInfoVisible(false);
    onCloseGroup();
  };
  const confirmDeleteGroup = (selected: ChatGroup) => {
    if (selected.isDefault) return;
    Alert.alert(
      "Xóa nhóm chat?",
      `Nhóm “${selected.name}” sẽ không còn xuất hiện trong dự án.`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa",
          style: "destructive",
          onPress: () => {
            closeConversation();
            onDeleteGroup(selected);
          },
        },
      ],
    );
  };

  if (!openedGroup) {
    return (
      <>
        <View style={groupStyles.listHeader}>
          <View style={groupStyles.listTitle}>
            <Text style={styles.heading}>Cuộc trò chuyện</Text>
            <Text style={styles.muted}>
              {groups.length} nhóm trong dự án
            </Text>
          </View>
          <View style={groupStyles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Làm mới danh sách nhóm"
              onPress={onRefreshGroup}
              style={groupStyles.refreshButton}
            >
              <Text style={groupStyles.refreshText}>↻</Text>
            </Pressable>
            {canManageGroups && !readOnly && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tạo nhóm chat"
                onPress={() => setCreating(true)}
                style={groupStyles.addButton}
              >
                <Text style={groupStyles.addButtonText}>+</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={groupStyles.conversationList}>
          {sortedGroups.map((item) => {
            const latest = latestGroupMessage(messages, item.id);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Mở nhóm ${item.name}`}
                onPress={() => openGroup(item)}
                style={({ pressed }) => [
                  styles.contactCard,
                  groupStyles.conversationCard,
                  pressed && groupStyles.pressed,
                ]}
              >
                <View style={styles.contactAvatar}>
                  <Text style={styles.contactAvatarText}>
                    {item.name.trim().charAt(0).toUpperCase() || "N"}
                  </Text>
                </View>
                <View style={styles.contactText}>
                  <View style={styles.contactTitleRow}>
                    <View style={groupStyles.nameRow}>
                      <Text numberOfLines={1} style={styles.strong}>
                        {item.name}
                      </Text>
                      {item.isDefault && (
                        <View style={groupStyles.defaultBadge}>
                          <Text style={groupStyles.defaultBadgeText}>
                            Mặc định
                          </Text>
                        </View>
                      )}
                    </View>
                    {latest && (
                      <Text style={groupStyles.timeText}>
                        {formatViDateTime(latest.message.timestamp)}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.muted}>
                    {item.members.length} thành viên
                  </Text>
                  <Text numberOfLines={1} style={styles.contactPreview}>
                    {messagePreview(latest, members, currentUserId)}
                  </Text>
                </View>
                <Text style={styles.openConversationIcon}>›</Text>
              </Pressable>
            );
          })}
        </View>

        {!groups.length && (
          <View style={styles.emptyCard}>
            <Text style={styles.strong}>Chưa có nhóm chat</Text>
            <Text style={styles.muted}>Làm mới để tải nhóm Chung của dự án.</Text>
          </View>
        )}

        <Modal
          transparent
          animationType="fade"
          visible={creating}
          onRequestClose={closeCreator}
        >
          <View style={groupStyles.modalOverlay}>
            <View style={groupStyles.creatorModal}>
              <Text style={groupStyles.creatorTitle}>Tạo nhóm chat mới</Text>
              <Text style={styles.muted}>
                Mọi thành viên của dự án đều có thể tham gia trò chuyện.
              </Text>
              <TextInput
                accessibilityLabel="Tên nhóm chat"
                autoFocus
                maxLength={80}
                placeholder="Ví dụ: Kinh doanh"
                placeholderTextColor={colors.textSoft}
                style={groupStyles.creatorInput}
                value={groupName}
                onChangeText={setGroupName}
                onSubmitEditing={createGroup}
              />
              <View style={groupStyles.creatorActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeCreator}
                  style={groupStyles.cancelButton}
                >
                  <Text style={groupStyles.cancelText}>Hủy</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!groupName.trim()}
                  onPress={createGroup}
                  style={[
                    groupStyles.createButton,
                    !groupName.trim() && styles.disabled,
                  ]}
                >
                  <Text style={groupStyles.createText}>Tạo nhóm</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <>
      <View style={groupStyles.conversationHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại danh sách cuộc trò chuyện"
          onPress={closeConversation}
          style={styles.chatHeaderIconButton}
        >
          <Text style={styles.chatBackIcon}>←</Text>
        </Pressable>
        <View style={groupStyles.smallAvatar}>
          <Text style={groupStyles.smallAvatarText}>
            {openedGroup.name.trim().charAt(0).toUpperCase() || "N"}
          </Text>
        </View>
        <View style={styles.contactText}>
          <Text numberOfLines={1} style={styles.strong}>
            {openedGroup.name}
          </Text>
          <Text style={styles.muted}>
            {openedGroup.members.length} thành viên
            {openedGroup.isDefault ? " · Nhóm mặc định" : ""}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Làm mới tin nhắn nhóm"
          onPress={onRefreshGroup}
          style={groupStyles.refreshButton}
        >
          <Text style={groupStyles.refreshText}>↻</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông tin nhóm chat"
          onPress={() => setInfoVisible(true)}
          style={styles.chatHeaderIconButton}
        >
          <Text style={styles.chatInfoIcon}>!</Text>
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setInfoVisible(false)}
        transparent
        visible={infoVisible}
      >
        <View style={styles.chatInfoOverlay}>
          <Pressable
            accessibilityLabel="Đóng thông tin nhóm chat"
            onPress={() => setInfoVisible(false)}
            style={styles.chatInfoBackdrop}
          />
          <View style={styles.chatInfoSheet}>
            <View style={styles.chatInfoHandle} />
            <View style={styles.chatInfoHeader}>
              <View style={styles.contactText}>
                <Text style={styles.contextTitle}>{openedGroup.name}</Text>
                <Text style={styles.contextSubtitle}>
                  {openedGroup.members.length} thành viên
                  {openedGroup.isDefault ? " · Nhóm mặc định" : ""}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={() => setInfoVisible(false)}
                style={styles.chatHeaderIconButton}
              >
                <Text style={styles.chatCloseIcon}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.chatInfoContent}
              nestedScrollEnabled
            >
              <Text style={styles.heading}>Ảnh đã gửi</Text>
              {!images.length && (
                <Text style={styles.muted}>
                  Chưa có ảnh trong cuộc trò chuyện.
                </Text>
              )}
              {!!images.length && (
                <View style={styles.chatImageGrid}>
                  {images.map((attachment) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mở ảnh ${attachment.name}`}
                      key={`group-info-image-${attachment.id}`}
                      onPress={() => onDownloadAttachment(attachment)}
                      style={styles.chatImageTile}
                    >
                      <CachedChatImage
                        attachment={attachment}
                        currentUserId={currentUserId}
                        resizeMode="cover"
                        style={styles.chatInfoImage}
                      />
                      <Text numberOfLines={1} style={styles.chatImageTileName}>
                        {attachment.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.heading}>Tệp đã gửi</Text>
              {!files.length && (
                <Text style={styles.muted}>
                  Chưa có tệp trong cuộc trò chuyện.
                </Text>
              )}
              {files.map((attachment) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tải tệp ${attachment.name}`}
                  key={`group-info-file-${attachment.id}`}
                  onPress={() => onDownloadAttachment(attachment)}
                  style={styles.chatInfoFile}
                >
                  <Text style={styles.fileAttachmentIcon}>📎</Text>
                  <View style={styles.contactText}>
                    <Text numberOfLines={2} style={styles.attachmentName}>
                      {attachment.name}
                    </Text>
                    <Text style={styles.muted}>
                      {Math.ceil(attachment.size / 1024)} KiB
                    </Text>
                  </View>
                  <Text style={styles.openConversationIcon}>↓</Text>
                </Pressable>
              ))}

              <View style={styles.chatInfoActions}>
                {canManageGroups && !readOnly && !openedGroup.isDefault ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa nhóm ${openedGroup.name}`}
                    onPress={() => {
                      setInfoVisible(false);
                      confirmDeleteGroup(openedGroup);
                    }}
                    style={styles.deleteConversationButton}
                  >
                    <Text style={styles.deleteConversationText}>Xóa nhóm</Text>
                  </Pressable>
                ) : openedGroup.isDefault ? (
                  <Text style={styles.muted}>
                    Nhóm Chung là nhóm mặc định và không thể xóa.
                  </Text>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {!visibleMessages.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.strong}>Chưa có tin nhắn</Text>
          <Text style={styles.muted}>
            Hãy bắt đầu cuộc trò chuyện trong nhóm {openedGroup.name}.
          </Text>
        </View>
      )}

      {visibleMessages.map((rows) => {
        const row = rows[0];
        const outgoing = row.message.senderId === currentUserId;
        return (
          <View
            key={`${row.message.messageId}-${row.message.senderId}`}
            style={[
              styles.messageRow,
              outgoing ? styles.messageRowOutgoing : styles.messageRowIncoming,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                outgoing ? styles.messageOutgoing : styles.messageIncoming,
                rows.every((item) => item.status === "failed") &&
                  styles.messageFailed,
              ]}
            >
              {!outgoing && (
                <Text style={groupStyles.senderName}>
                  {userName(members, row.message.senderId)}
                </Text>
              )}
              {(row.message.attachments || []).map((attachment) =>
                attachment.mime.startsWith("image/") ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mở ảnh ${attachment.name}`}
                    key={attachment.id}
                    onPress={() => onDownloadAttachment(attachment)}
                  >
                    <CachedChatImage
                      attachment={attachment}
                      currentUserId={currentUserId}
                      resizeMode="cover"
                      style={styles.chatImage}
                    />
                    <Text numberOfLines={1} style={styles.attachmentName}>
                      {attachment.name}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Tải tệp ${attachment.name}`}
                    key={attachment.id}
                    onPress={() => onDownloadAttachment(attachment)}
                    style={styles.fileAttachment}
                  >
                    <Text style={styles.fileAttachmentIcon}>📎</Text>
                    <View style={styles.contactText}>
                      <Text numberOfLines={2} style={styles.attachmentName}>
                        {attachment.name}
                      </Text>
                      <Text style={styles.messageMeta}>
                        {Math.ceil(attachment.size / 1024)} KiB · Chạm để mở
                      </Text>
                    </View>
                  </Pressable>
                ),
              )}
              {!!row.message.body && (
                <Text style={styles.messageBody}>{row.message.body}</Text>
              )}
              <Text style={styles.messageMeta}>
                {formatViDateTime(row.message.timestamp)} ·{" "}
                {groupDeliveryLabel(rows, outgoing)}
              </Text>
            </View>
          </View>
        );
      })}

      {readOnly && (
        <View style={styles.directStatusCard}>
          <Text style={styles.muted}>Dự án đã lưu trữ, chat chỉ được xem.</Text>
        </View>
      )}
    </>
  );
}

const groupStyles = StyleSheet.create({
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  listTitle: { flex: 1, gap: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  refreshText: {
    color: colors.primary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 27,
    lineHeight: 29,
    fontWeight: "600",
  },
  conversationList: { gap: 9 },
  conversationCard: { ...cardShadow },
  pressed: { opacity: 0.72 },
  nameRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  defaultBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: colors.primarySoft,
  },
  defaultBadgeText: {
    color: colors.primaryDark,
    fontSize: 9,
    fontWeight: "800",
  },
  timeText: { color: colors.textSoft, fontSize: 9, flexShrink: 0 },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(15,23,42,0.46)",
  },
  creatorModal: {
    gap: 12,
    borderRadius: 20,
    padding: 18,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  creatorTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  creatorInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  creatorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: colors.textSoft, fontWeight: "800" },
  createButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.primary,
  },
  createText: { color: "#FFFFFF", fontWeight: "800" },
  conversationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    padding: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  smallAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  smallAvatarText: { color: colors.primaryDark, fontWeight: "900" },
  senderName: { color: colors.primaryDark, fontSize: 11, fontWeight: "800" },
});

export default memo(ProjectChatTab);
