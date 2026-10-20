import React, { memo, useEffect, useState } from "react";
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

import type { Task, User } from "../../services/api.ts";
import { parseViDateTime } from "../../utils/calendar.ts";
import NativeDateTimeField from "../ui/NativeDateTimeField.tsx";
import { styles } from "../../styles/app.ts";
import { filterTaskMembers } from "../../utils/taskGroups.ts";
import TextField from "../ui/TextField.tsx";

type TaskEditorProps = {
  visible: boolean;
  saving: boolean;
  error: string;
  editTask: Task | null;
  title: string;
  description: string;
  startsAt: string;
  dueAt: string;
  assigneeId: string;
  members: User[];
  currentUserId: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStartsAtChange: (value: string) => void;
  onDueAtChange: (value: string) => void;
  onAssigneeChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

const parsedDateOrUndefined = (value: string) => {
  try {
    return parseViDateTime(value);
  } catch {
    return undefined;
  }
};

function TaskEditor({
  visible,
  saving,
  error,
  editTask,
  title,
  description,
  startsAt,
  dueAt,
  assigneeId,
  members,
  currentUserId,
  onTitleChange,
  onDescriptionChange,
  onStartsAtChange,
  onDueAtChange,
  onAssigneeChange,
  onClose,
  onSave,
}: TaskEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedAssignee = members.find((member) => member._id === assigneeId);
  const filteredMembers = filterTaskMembers(members, search);

  useEffect(() => {
    if (!visible) return;
    setPickerOpen(false);
    setSearch("");
  }, [visible, editTask?._id]);

  const selectAssignee = (id: string) => {
    onAssigneeChange(id);
    setPickerOpen(false);
    setSearch("");
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <Pressable
          disabled={saving}
          onPress={onClose}
          style={styles.modalDismissArea}
        />
        <View style={styles.taskEditorSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.createProjectHeader}>
            <View style={styles.modalTitleCopy}>
              <Text style={styles.heading}>
                {editTask ? "Sửa công việc" : "Tạo task mới"}
              </Text>
              <Text style={styles.muted}>
                Điền thông tin và chọn người phụ trách công việc.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              disabled={saving}
              onPress={onClose}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.taskEditorContent}
          >
            <Text style={styles.fieldLabel}>Tên công việc</Text>
            <TextField
              value={title}
              onChangeText={onTitleChange}
              placeholder="Ví dụ: Hoàn thiện thiết kế"
              editable={!saving}
            />
            <Text style={styles.fieldLabel}>Mô tả</Text>
            <TextField
              value={description}
              onChangeText={onDescriptionChange}
              placeholder="Nội dung cần thực hiện"
              multiline
              editable={!saving}
            />
            <NativeDateTimeField
              label="Bắt đầu"
              value={startsAt}
              onChange={onStartsAtChange}
              disabled={saving}
            />
            <NativeDateTimeField
              label="Kết thúc (deadline)"
              value={dueAt}
              onChange={onDueAtChange}
              minimumDate={parsedDateOrUndefined(startsAt)}
              disabled={saving}
            />
            <Text style={styles.fieldLabel}>Phân công</Text>
            <View style={styles.assigneePicker}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: pickerOpen }}
                disabled={saving}
                onPress={() => setPickerOpen((current) => !current)}
                style={[
                  styles.assigneeSelectButton,
                  pickerOpen && styles.assigneeSelectButtonOpen,
                ]}
              >
                <View
                  style={[
                    styles.assigneeOptionAvatar,
                    selectedAssignee && styles.assigneeOptionAvatarSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.assigneeOptionAvatarText,
                      selectedAssignee &&
                        styles.assigneeOptionAvatarTextSelected,
                    ]}
                  >
                    {selectedAssignee
                      ? selectedAssignee.name
                          .trim()
                          .charAt(0)
                          .toLocaleUpperCase("vi") || "?"
                      : "—"}
                  </Text>
                </View>
                <View style={styles.assigneeSelectCopy}>
                  <Text style={styles.assigneeSelectName}>
                    {selectedAssignee?.name || "Chưa phân công"}
                    {selectedAssignee?._id === currentUserId ? " (Bạn)" : ""}
                  </Text>
                  <Text style={styles.assigneeSelectHint} numberOfLines={1}>
                    {selectedAssignee?.email ||
                      "Chọn một thành viên phụ trách"}
                  </Text>
                </View>
                <Text style={styles.assigneeSelectChevron}>
                  {pickerOpen ? "⌃" : "⌄"}
                </Text>
              </Pressable>
              {pickerOpen && (
                <View style={styles.assigneeDropdown}>
                  <View style={styles.assigneeSearchBox}>
                    <Text style={styles.assigneeSearchIcon}>⌕</Text>
                    <TextInput
                      accessibilityLabel="Tìm kiếm thành viên"
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!saving}
                      onChangeText={setSearch}
                      placeholder="Tìm theo tên hoặc email..."
                      placeholderTextColor="#969DB0"
                      returnKeyType="search"
                      style={styles.assigneeSearchInput}
                      value={search}
                    />
                    {!!search && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Xóa nội dung tìm kiếm thành viên"
                        hitSlop={8}
                        onPress={() => setSearch("")}
                        style={styles.assigneeSearchClear}
                      >
                        <Text style={styles.assigneeSearchClearText}>×</Text>
                      </Pressable>
                    )}
                  </View>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    style={styles.assigneeOptions}
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => selectAssignee("")}
                      style={[
                        styles.assigneeOption,
                        !assigneeId && styles.assigneeOptionActive,
                      ]}
                    >
                      <View style={styles.assigneeOptionAvatar}>
                        <Text style={styles.assigneeOptionAvatarText}>—</Text>
                      </View>
                      <View style={styles.assigneeOptionCopy}>
                        <Text style={styles.assigneeOptionName}>
                          Chưa phân công
                        </Text>
                        <Text style={styles.assigneeOptionEmail}>
                          Có thể giao cho thành viên sau
                        </Text>
                      </View>
                      {!assigneeId && (
                        <Text style={styles.assigneeOptionCheck}>✓</Text>
                      )}
                    </Pressable>
                    {filteredMembers.map((member) => {
                      const selected = assigneeId === member._id;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={member._id}
                          onPress={() => selectAssignee(member._id)}
                          style={[
                            styles.assigneeOption,
                            selected && styles.assigneeOptionActive,
                          ]}
                        >
                          <View
                            style={[
                              styles.assigneeOptionAvatar,
                              selected && styles.assigneeOptionAvatarSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.assigneeOptionAvatarText,
                                selected &&
                                  styles.assigneeOptionAvatarTextSelected,
                              ]}
                            >
                              {member.name
                                .trim()
                                .charAt(0)
                                .toLocaleUpperCase("vi") || "?"}
                            </Text>
                          </View>
                          <View style={styles.assigneeOptionCopy}>
                            <View style={styles.assigneeOptionNameRow}>
                              <Text style={styles.assigneeOptionName}>
                                {member.name}
                              </Text>
                              {member._id === currentUserId && (
                                <View style={styles.meBadge}>
                                  <Text style={styles.meBadgeText}>BẠN</Text>
                                </View>
                              )}
                            </View>
                            {!!member.email && (
                              <Text
                                numberOfLines={1}
                                style={styles.assigneeOptionEmail}
                              >
                                {member.email}
                              </Text>
                            )}
                          </View>
                          {selected && (
                            <Text style={styles.assigneeOptionCheck}>✓</Text>
                          )}
                        </Pressable>
                      );
                    })}
                    {!filteredMembers.length && (
                      <View style={styles.assigneeEmpty}>
                        <Text style={styles.muted}>
                          Không tìm thấy thành viên phù hợp.
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
            <View style={styles.modalActions}>
              <Pressable
                disabled={saving}
                onPress={onClose}
                style={[
                  styles.modalActionButton,
                  styles.modalCancelButton,
                  saving && styles.disabled,
                ]}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                disabled={saving || !title.trim()}
                onPress={onSave}
                style={[
                  styles.modalActionButton,
                  styles.modalCreateButton,
                  (saving || !title.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.buttonText}>
                  {saving
                    ? "Đang lưu…"
                    : editTask
                      ? "Lưu thay đổi"
                      : "Tạo task"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default memo(TaskEditor);
