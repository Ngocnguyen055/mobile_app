import React, { memo } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";

import type { ChatAttachment, StoredMessage } from "@ds01/shared";
import {
  chatAttachmentUrl,
  getToken,
  type ChatContact,
} from "../../services/api.ts";
import { directMessagesForContact } from "../../domain/directChatPolicy.ts";
import { styles } from "../../styles/app.ts";
import Button from "../ui/Button.tsx";

type DirectInfoModalProps = {
  contact: ChatContact;
  currentUserId: string;
  messages: StoredMessage[];
  visible: boolean;
  blocked: boolean;
  onClose: () => void;
  onDownload: (attachment: ChatAttachment) => void;
  onToggleBlock: () => void;
  onDeleteConversation: () => void;
};

function DirectInfoModal({
  contact,
  currentUserId,
  messages,
  visible,
  blocked,
  onClose,
  onDownload,
  onToggleBlock,
  onDeleteConversation,
}: DirectInfoModalProps) {
  const attachments = directMessagesForContact(
    messages,
    currentUserId,
    contact.id,
  )
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

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.chatInfoOverlay}>
        <Pressable
          accessibilityLabel="Đóng thông tin cuộc trò chuyện"
          onPress={onClose}
          style={styles.chatInfoBackdrop}
        />
        <View style={styles.chatInfoSheet}>
          <View style={styles.chatInfoHandle} />
          <View style={styles.chatInfoHeader}>
            <View style={styles.contactText}>
              <Text style={styles.contextTitle}>{contact.name}</Text>
              <Text style={styles.contextSubtitle}>{contact.email}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
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
                    key={`info-image-${attachment.id}`}
                    onPress={() => onDownload(attachment)}
                    style={styles.chatImageTile}
                  >
                    <Image
                      source={{
                        uri: chatAttachmentUrl(attachment.id),
                        headers: { Authorization: `Bearer ${getToken()}` },
                      }}
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
                key={`info-file-${attachment.id}`}
                onPress={() => onDownload(attachment)}
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
              <Button
                label={blocked ? "Bỏ chặn người dùng" : "Chặn người dùng"}
                onPress={onToggleBlock}
                secondary
              />
              <Pressable
                accessibilityRole="button"
                onPress={onDeleteConversation}
                style={styles.deleteConversationButton}
              >
                <Text style={styles.deleteConversationText}>Xóa đoạn chat</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default memo(DirectInfoModal);
