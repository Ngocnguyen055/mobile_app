import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { ChatContact } from "../../services/api.ts";
import { styles } from "../../styles/app.ts";

type ChatToolbarProps = {
  contact: ChatContact | null;
  blocked: boolean;
  refreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onOpenInfo: () => void;
};

function ChatToolbar({
  contact,
  blocked,
  refreshing,
  onBack,
  onRefresh,
  onOpenInfo,
}: ChatToolbarProps) {
  return (
    <View style={[styles.contextToolbar, styles.messagesToolbar]}>
      {contact ? (
        <View style={styles.chatToolbarRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại danh sách cuộc trò chuyện"
            onPress={onBack}
            style={styles.chatHeaderIconButton}
          >
            <Text style={styles.chatBackIcon}>←</Text>
          </Pressable>
          <View style={styles.chatToolbarContact}>
            <View style={styles.contactText}>
              <Text style={styles.contextTitle}>{contact.name}</Text>
              <Text style={styles.contextSubtitle}>
                {contact.email}
                {blocked ? " · Đã chặn" : ""}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Làm mới tin nhắn"
            disabled={refreshing}
            onPress={onRefresh}
            style={[
              styles.chatHeaderIconButton,
              refreshing && styles.disabled,
            ]}
          >
            <Text style={styles.chatRefreshIcon}>
              {refreshing ? "…" : "↻"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thông tin cuộc trò chuyện"
            onPress={onOpenInfo}
            style={styles.chatHeaderIconButton}
          >
            <Text style={styles.chatInfoIcon}>!</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.contextTitle}>Tin nhắn</Text>
          <Text style={styles.contextSubtitle}>
            Tìm người dùng bằng email và quản lý các cuộc trò chuyện trên máy.
          </Text>
        </>
      )}
    </View>
  );
}

export default memo(ChatToolbar);
