import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ChatGroup } from "../../domain/chat.ts";
import { styles } from "../../styles/app.ts";
import { colors } from "../../styles/theme.ts";
type GroupComposerProps = {
  group: ChatGroup;
  body: string;
  uploading: boolean;
  onBodyChange: (value: string) => void;
  onSend: () => void;
  onAttach: () => void;
};

export default function GroupComposer({
  group,
  body,
  uploading,
  onBodyChange,
  onSend,
  onAttach,
}: GroupComposerProps) {
  const canSend = !!body.trim() && !uploading;
  return (
    <View style={styles.chatComposer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gửi ảnh hoặc tệp vào nhóm"
        disabled={uploading}
        onPress={onAttach}
        style={[styles.chatAttachmentButton, uploading && styles.disabled]}
      >
        <Text style={styles.chatAttachmentButtonText}>
          {uploading ? "…" : "+"}
        </Text>
      </Pressable>
      <TextInput
        accessibilityLabel={`Tin nhắn gửi nhóm ${group.name}`}
        editable={!uploading}
        maxLength={4000}
        multiline
        onChangeText={onBodyChange}
        placeholder="Nhắn tin"
        placeholderTextColor={colors.textSoft}
        style={styles.chatComposerInput}
        value={body}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gửi tin nhắn nhóm"
        disabled={!canSend}
        onPress={onSend}
        style={[styles.chatSendButton, !canSend && styles.disabled]}
      >
        <Text style={styles.buttonText}>Gửi</Text>
      </Pressable>
    </View>
  );
}
