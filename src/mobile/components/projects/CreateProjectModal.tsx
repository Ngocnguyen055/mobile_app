import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { styles } from "../../styles/app.ts";
import type { Project } from "../../types/api.ts";
import TextField from "../ui/TextField.tsx";

type Props = {
  createVisible: boolean;
  creating: boolean;
  projectName: string;
  projectKind: Project["kind"];
  error: string;
  onCloseCreate: () => void;
  onProjectNameChange: (value: string) => void;
  onProjectKindChange: (kind: Project["kind"]) => void;
  onCreateProject: () => void;
};
export default function CreateProjectModal({
  createVisible,
  creating,
  projectName,
  projectKind,
  error,
  onCloseCreate,
  onProjectNameChange,
  onProjectKindChange,
  onCreateProject,
}: Props) {
  return (<Modal
    transparent
    animationType="slide"
    visible={createVisible}
    onRequestClose={() => !creating && onCloseCreate()}
  >
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.modalOverlay}
    >
      <Pressable
        accessibilityLabel="Đóng cửa sổ tạo dự án"
        disabled={creating}
        onPress={onCloseCreate}
        style={styles.modalDismissArea}
      />
      <View style={styles.createProjectSheet} accessibilityViewIsModal>
        <View style={styles.modalHandle} />
        <View style={styles.createProjectHeader}>
          <View style={styles.modalTitleCopy}>
            <Text style={styles.pageTitle}>Tạo dự án mới</Text>
            <Text style={styles.subtitle}>
              Thiết lập không gian làm việc cho đội của bạn.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            disabled={creating}
            onPress={onCloseCreate}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseText}>×</Text>
          </Pressable>
        </View>
        <Text style={styles.fieldLabel}>Mô hình dự án</Text>
        <View style={styles.projectKindGrid}>
          {(
            [
              [
                "independent",
                "Dự án độc lập",
                "Nhóm nhỏ, cùng quản lý công việc",
              ],
              [
                "hierarchical",
                "Dự án phân cấp",
                "Dự án tổng, dự án con và Trưởng phòng",
              ],
            ] as const
          ).map(([kind, label, description]) => (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ selected: projectKind === kind }}
              disabled={creating}
              onPress={() => onProjectKindChange(kind)}
              style={[
                styles.projectKindOption,
                kind === projectKind && styles.projectKindOptionActive,
              ]}
            >
              <Text
                style={[
                  styles.projectKindTitle,
                  kind === projectKind && styles.activeTabText,
                ]}
              >
                {kind === projectKind ? "✓ " : ""}
                {label}
              </Text>
              <Text style={styles.projectKindDescription}>
                {description}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Tên dự án</Text>
        <TextField
          value={projectName}
          onChangeText={onProjectNameChange}
          placeholder="Ví dụ: Đồ án tốt nghiệp"
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.modalActions}>
          <Pressable
            disabled={creating}
            onPress={onCloseCreate}
            style={[
              styles.modalActionButton,
              styles.modalCancelButton,
              creating && styles.disabled,
            ]}
          >
            <Text style={styles.modalCancelText}>Hủy</Text>
          </Pressable>
          <Pressable
            disabled={creating || !projectName.trim()}
            onPress={onCreateProject}
            style={[
              styles.modalActionButton,
              styles.modalCreateButton,
              (creating || !projectName.trim()) && styles.disabled,
            ]}
          >
            <Text style={styles.buttonText}>
              {creating ? "Đang tạo…" : "Tạo dự án"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
}
