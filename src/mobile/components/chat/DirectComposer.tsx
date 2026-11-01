import React, { memo } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { ChatContact } from "../../services/api.ts";
import { canSendDirect } from "../../domain/directChatPolicy.ts";
import { styles } from "../../styles/app.ts";

type DirectComposerProps = {
  contact: ChatContact;
  body: string;
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
  blocked,
  sending,
  uploading,
  onBodyChange,
  onSend,
  onAttach,
}: DirectComposerProps) {
  const canSend = !blocked && canSendDirect(body, contact.id, sending);
  const canAttach = !blocked && !sending && !uploading;

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
            : `Nhắn ${contact.name} · tin được lưu trên máy chủ`
        }
        placeholderTextColor="#64748b"
        maxLength={4000}
        editable={!sending && !blocked}
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
        <Text style={styles.buttonText}>{sending ? "Đang gửi…" : "Gửi"}</Text>
      </Pressable>
    </View>
  );
}

export default memo(DirectComposer);
