import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { styles as s } from "../../styles/discussion.ts";

import type { useDiscussion } from "../../hooks/useDiscussion.ts";
export default function PostEditorModal({ controller }: { controller: ReturnType<typeof useDiscussion> }) {
  const {
    title,
    setTitle,
    body,
    setBody,
    editing,
    files,
    setFiles,
    editorVisible,
    editorError,
    setEditorError,
    busy,
    run,
    reset,
    pickFiles,
    savePost,
    postReady,
  } = controller;

  return (<Modal
    transparent
    animationType="slide"
    visible={editorVisible}
    onRequestClose={() => {
      if (!busy) reset();
    }}
  >
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.modalOverlay}
    >
      <Pressable
        disabled={busy}
        onPress={reset}
        style={s.modalDismissArea}
      />
      <View style={s.editorSheet}>
        <View style={s.modalHandle} />
        <View style={s.editorHeader}>
          <View style={s.editorHeaderCopy}>
            <Text style={s.editorTitle}>
              {editing ? "Sửa bài thảo luận" : "Đăng bài mới"}
            </Text>
            <Text style={s.muted}>
              Chia sẻ nội dung, tài liệu hoặc hình ảnh với mọi người.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            disabled={busy}
            onPress={reset}
            style={s.modalCloseButton}
          >
            <Text style={s.modalCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.editorContent}
        >
          {!!editorError && (
            <View style={s.editorErrorBox}>
              <Text style={s.editorError}>{editorError}</Text>
            </View>
          )}
          <Text style={s.fieldLabel}>Chủ đề</Text>
          <TextInput
            editable={!busy}
            style={s.input}
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setEditorError("");
            }}
            placeholder="Nhập chủ đề bài viết"
            placeholderTextColor="#64748b"
            maxLength={120}
          />
          <Text style={s.fieldLabel}>Nội dung</Text>
          <TextInput
            editable={!busy}
            style={[s.input, s.postBodyInput]}
            value={body}
            onChangeText={(value) => {
              setBody(value);
              setEditorError("");
            }}
            multiline
            textAlignVertical="top"
            placeholder="Bạn muốn chia sẻ điều gì?"
            placeholderTextColor="#64748b"
            maxLength={5000}
          />
          {!editing && (
            <Pressable
              accessibilityRole="button"
              disabled={busy || files.length >= 3}
              onPress={() => void run(pickFiles, false)}
              style={[
                s.attachmentButton,
                (busy || files.length >= 3) && s.disabled,
              ]}
            >
              <Text style={s.attachmentIcon}>＋</Text>
              <View style={s.attachmentCopy}>
                <Text style={s.attachmentTitle}>Đính kèm tệp / ảnh</Text>
              </View>
            </Pressable>
          )}
          {files.map((file, index) => (
            <View key={`${file.uri}-${index}`} style={s.selectedFile}>
              <View style={s.fileIcon}>
                <Text style={s.fileIconText}>↥</Text>
              </View>
              <Text style={s.fileText} numberOfLines={2}>
                {file.name} · {Math.ceil((file.size || 0) / 1024)} KiB
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Bỏ tệp ${file.name}`}
                disabled={busy}
                onPress={() =>
                  setFiles((current) =>
                    current.filter((_, fileIndex) => fileIndex !== index),
                  )
                }
                style={s.fileRemove}
              >
                <Text style={s.fileRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
          <View style={s.modalActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={reset}
              style={[s.modalAction, s.modalCancel, busy && s.disabled]}
            >
              <Text style={s.modalCancelText}>Hủy</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy || !postReady}
              onPress={() => void run(savePost)}
              style={[
                s.modalAction,
                s.modalSubmit,
                (busy || !postReady) && s.disabled,
              ]}
            >
              <Text style={s.buttonText}>
                {busy ? "Đang xử lý…" : editing ? "Lưu bài" : "Đăng bài"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
}
