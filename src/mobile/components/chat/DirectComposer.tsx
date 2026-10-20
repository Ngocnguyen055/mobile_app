import React, { memo } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { ChatContact } from "../../services/api.ts";
import { canSendDirect } from "../../domain/directChatPolicy.ts";
import { styles } from "../../styles/app.ts";

type DirectComposerProps = {
  contact: ChatContact;
  body: string;
  online: boolean;
  blocked: boolean;
  sending: boolean;
  uploading: boolean;
  onBodyChange: (value: string) => void;
  onSend: () => void;
  onAttach: () => void;
};

function DirectComposer({
  contact,
  body,
  online,
  blocked,
  sending,
  uploading,
  onBodyChange,
  onSend,
  onAttach,
}: DirectComposerProps) {
  const canSend = online && !blocked && canSendDirect(body, contact.id, sending);
  const canAttach = online && !blocked && !sending && !uploading;

  return (
    <View style={styles.chatComposer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gửi ảnh hoặc tệp"
        disabled={!canAttach}
        onPress={onAttach}
        style={[styles.chatAttachmentButton, !canAttach && styles.disabled]}
      >
        <Text style={styles.chatAttachmentButtonText}>
          {uploading ? "…" : "+"}
        </Text>
      </Pressable>
      <TextInput
        accessibilityLabel={`Tin nhắn gửi ${contact.name}`}
        style={styles.chatComposerInput}
        value={body}
        onChangeText={onBodyChange}
        placeholder={
          blocked
            ? "Bạn đã chặn người dùng này"
            : online
              ? "Nhập tin nhắn"
              : `${contact.name} đang offline`
        }
        placeholderTextColor="#64748b"
        maxLength={4000}
        editable={!sending && !blocked && online}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (canSend) onSend();
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gửi tin nhắn riêng"
        disabled={!canSend}
        onPress={onSend}
        style={[styles.chatSendButton, !canSend && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {sending ? "Đang gửi…" : "Gửi"}
        </Text>
      </Pressable>
    </View>
  );
}

export default memo(DirectComposer);
