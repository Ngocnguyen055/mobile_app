import { memo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { groupStyles } from "../../styles/projectChat.ts";
import {
  groupDeliveryLabel,
  groupMessagesForDisplay,
  latestGroupMessage,
  messagePreview,
  userName,
} from "../../utils/groupMessages.ts";
import GroupInfoModal from "../chat/GroupInfoModal.tsx";

import type {
  ChatAttachment,
  ChatGroup,
  StoredMessage,
} from "../../domain/chat.ts";
import { styles } from "../../styles/app.ts";
import { colors } from "../../styles/theme.ts";
import type { User } from "../../types/api.ts";
import { formatViDateTime } from "../../utils/calendar.ts";
import CachedChatImage from "../chat/CachedChatImage.tsx";

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

      <GroupInfoModal
        openedGroup={openedGroup}
        messages={messages}
        currentUserId={currentUserId}
        infoVisible={infoVisible}
        canManageGroups={canManageGroups}
        readOnly={readOnly}
        setInfoVisible={setInfoVisible}
        confirmDeleteGroup={confirmDeleteGroup}
        onDownloadAttachment={onDownloadAttachment}
      />

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

export default memo(ProjectChatTab);
