import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type {
  ChatAttachment,
  ChatGroup,
  StoredMessage,
} from "../../domain/chat.ts";
import { styles } from "../../styles/app.ts";
import CachedChatImage from "./CachedChatImage.tsx";

type Props = {
  openedGroup: ChatGroup;
  messages: StoredMessage[];
  currentUserId: string;
  infoVisible: boolean;
  canManageGroups: boolean;
  readOnly: boolean;
  setInfoVisible: (visible: boolean) => void;
  confirmDeleteGroup: (group: ChatGroup) => void;
  onDownloadAttachment: (attachment: ChatAttachment) => void
};
export default function GroupInfoModal({
  openedGroup,
  messages,
  currentUserId,
  infoVisible,
  canManageGroups,
  readOnly,
  setInfoVisible,
  confirmDeleteGroup,
  onDownloadAttachment,
}: Props) {
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

  return (<Modal
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

  );
}
