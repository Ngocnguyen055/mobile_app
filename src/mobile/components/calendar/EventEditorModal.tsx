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
import { styles } from "../../styles/calendar.ts";
import {
  formatViDate,
  parseViDateTime
} from "../../utils/calendar.ts";
import NativeDateTimeField from "../ui/NativeDateTimeField.tsx";
import ReminderSelect from "../ui/ReminderSelect.tsx";

import type { useCalendarEventEditor } from "../../hooks/useCalendarEventEditor.ts";
function parsedDateOrUndefined(value: string) {
  try {
    return parseViDateTime(value);
  } catch {
    return undefined;
  }
}

type Props = {
  editor: ReturnType<typeof useCalendarEventEditor>;
  selectedDay: Date
};
export default function EventEditorModal({ editor, selectedDay }: Props) {
  const {
    editing,
    editorVisible,
    title,
    setTitle,
    startsAt,
    setStartsAt,
    endsAt,
    setEndsAt,
    allDay,
    setAllDay,
    eventOffsets,
    setEventOffsets,
    saving,
    editorError,
    submit,
    closeEditor,
  } = editor;
  return (<Modal
    animationType="slide"
    hardwareAccelerated
    onRequestClose={closeEditor}
    statusBarTranslucent
    transparent
    visible={editorVisible}
  >
    <KeyboardAvoidingView
      style={styles.modalBackdrop}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.modalSheet} accessibilityViewIsModal>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <View style={styles.modalHeading}>
            <Text accessibilityRole="header" style={styles.editorTitle}>
              {editing ? "Sửa sự kiện" : "Thêm sự kiện"}
            </Text>
            <Text style={styles.modalSubtitle}>
              {editing
                ? "Cập nhật nội dung và thời gian"
                : `Ngày ${formatViDate(selectedDay)}`}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Đóng biểu mẫu sự kiện"
            accessibilityRole="button"
            disabled={saving}
            hitSlop={8}
            onPress={closeEditor}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>

        {!!editorError && (
          <View style={styles.editorErrorBox}>
            <Text accessibilityRole="alert" style={styles.editorError}>
              {editorError}
            </Text>
          </View>
        )}

        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalContent}
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.fieldLabel}>Nội dung sự kiện</Text>
          <TextInput
            accessibilityLabel="Nội dung sự kiện"
            value={title}
            onChangeText={setTitle}
            placeholder="Nhập nội dung sự kiện"
            placeholderTextColor="#64748b"
            style={styles.input}
            keyboardType="default"
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
          />
          <NativeDateTimeField
            label="Bắt đầu"
            value={startsAt}
            onChange={setStartsAt}
            dateOnly={allDay}
          />
          <NativeDateTimeField
            label="Kết thúc"
            value={endsAt}
            onChange={setEndsAt}
            dateOnly={allDay}
            minimumDate={parsedDateOrUndefined(startsAt)}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allDay }}
            onPress={() => setAllDay((value) => !value)}
            style={[
              styles.chip,
              styles.singleChip,
              allDay && styles.activeChip,
            ]}
          >
            <Text
              style={[styles.chipText, allDay && styles.activeChipText]}
            >
              {allDay ? "☑" : "☐"} Cả ngày
            </Text>
          </Pressable>
          {allDay && (
            <Text style={styles.muted}>
              Giờ được lưu thành 00:00; ngày kết thúc là ngày kế tiếp.
            </Text>
          )}

          <ReminderSelect
            value={eventOffsets[0] ?? 0}
            onChange={(value) => setEventOffsets([value])}
            disabled={saving}
          />
        </ScrollView>

        <View style={styles.modalFooter}>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={closeEditor}
            style={[
              styles.modalAction,
              styles.modalCancelAction,
              saving && styles.disabled,
            ]}
          >
            <Text style={styles.modalCancelText}>Hủy</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={() => void submit()}
            style={[
              styles.modalAction,
              styles.modalSaveAction,
              saving && styles.disabled,
            ]}
          >
            <Text style={styles.modalSaveText}>
              {saving
                ? "Đang lưu…"
                : editing
                  ? "Lưu thay đổi"
                  : "Tạo sự kiện"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
}
