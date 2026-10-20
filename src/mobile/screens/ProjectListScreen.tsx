import React, { memo } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Project } from "../services/api.ts";
import { formatViDate } from "../utils/calendar.ts";
import TextField from "../components/ui/TextField.tsx";
import {
  filterProjects,
  orderProjectsNewestFirst,
  projectsForPage,
} from "../utils/projectList.ts";
import { roleLabels } from "../domain/projectPolicy.ts";
import { styles } from "../styles/app.ts";

type ProjectListScreenProps = {
  projects: Project[];
  search: string;
  page: number;
  createVisible: boolean;
  creating: boolean;
  projectName: string;
  projectKind: Project["kind"];
  error: string;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onProjectNameChange: (value: string) => void;
  onProjectKindChange: (kind: Project["kind"]) => void;
  onRefresh: () => void;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
};

function ProjectListScreen({
  projects,
  search,
  page,
  createVisible,
  creating,
  projectName,
  projectKind,
  error,
  onOpenCreate,
  onCloseCreate,
  onSearchChange,
  onPageChange,
  onProjectNameChange,
  onProjectKindChange,
  onRefresh,
  onOpenProject,
  onCreateProject,
}: ProjectListScreenProps) {
  const filteredProjects = filterProjects(projects, search);
  const orderedProjects = orderProjectsNewestFirst(filteredProjects);
  const pagination = projectsForPage(orderedProjects, page);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenCreate}
        style={({ pressed }) => [
          styles.topCreateButton,
          pressed && styles.cardPressed,
        ]}
      >
        <Text style={styles.topCreateIcon}>＋</Text>
        <Text style={styles.topCreateText}>Tạo dự án mới</Text>
      </Pressable>
      <View style={styles.heroCard}>
        <View style={styles.heroMainRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>KHÔNG GIAN LÀM VIỆC</Text>
            <Text style={styles.heroTitle}>Dự án của bạn</Text>
          </View>
          <View style={styles.compactStat}>
            <Text style={styles.statValue}>
              {projects.filter((item) => !item.archived).length}
              <Text style={styles.statTotal}>/{projects.length}</Text>
            </Text>
            <Text style={styles.statLabel}>đang hoạt động</Text>
          </View>
        </View>
      </View>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.heading}>Danh sách dự án</Text>
        <Pressable onPress={onRefresh} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>Làm mới ↻</Text>
        </Pressable>
      </View>
      <View style={styles.projectSearchBox}>
        <Text style={styles.projectSearchIcon}>⌕</Text>
        <TextInput
          accessibilityLabel="Tìm kiếm dự án"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onSearchChange}
          placeholder="Tìm theo tên dự án..."
          placeholderTextColor="#969DB0"
          returnKeyType="search"
          style={styles.projectSearchInput}
          value={search}
        />
        {!!search && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa nội dung tìm kiếm"
            hitSlop={8}
            onPress={() => onSearchChange("")}
            style={styles.projectSearchClear}
          >
            <Text style={styles.projectSearchClearText}>×</Text>
          </Pressable>
        )}
      </View>
      {pagination.items.map((item) => (
        <Pressable
          key={item._id}
          style={({ pressed }) => [
            styles.card,
            styles.projectCard,
            pressed && styles.cardPressed,
          ]}
          onPress={() => onOpenProject(item._id)}
        >
          <View style={styles.projectIcon}>
            <Text style={styles.projectIconText}>▦</Text>
          </View>
          <View style={styles.projectBody}>
            <Text style={styles.strong}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.parentProject
                ? "Dự án con"
                : item.kind === "hierarchical"
                  ? "Dự án phân cấp"
                  : "Dự án độc lập"}{" "}
              · {roleLabels[item.myRole]}
            </Text>
            {!!item.createdAt && (
              <Text style={styles.projectDate}>
                Tạo ngày {formatViDate(item.createdAt)}
              </Text>
            )}
            {!!item.description && (
              <Text numberOfLines={2} style={styles.projectDescription}>
                {item.description}
              </Text>
            )}
            <View
              style={[styles.statusPill, item.archived && styles.archivedPill]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  item.archived && styles.archivedPillText,
                ]}
              >
                {item.archived ? "Đã lưu trữ" : "Đang hoạt động"}
              </Text>
            </View>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </Pressable>
      ))}
      {!projects.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>◇</Text>
          <Text style={styles.strong}>Chưa có dự án</Text>
          <Text style={styles.muted}>
            Tạo dự án đầu tiên để bắt đầu cộng tác.
          </Text>
        </View>
      )}
      {!!projects.length && !filteredProjects.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>⌕</Text>
          <Text style={styles.strong}>Không tìm thấy dự án</Text>
          <Text style={styles.muted}>Thử tìm bằng một tên dự án khác.</Text>
        </View>
      )}
      {filteredProjects.length > 5 && (
        <View style={styles.pagination}>
          <Pressable
            accessibilityLabel="Trang dự án trước"
            disabled={pagination.page === 0}
            onPress={() => onPageChange(Math.max(0, pagination.page - 1))}
            style={[
              styles.pageButton,
              pagination.page === 0 && styles.disabled,
            ]}
          >
            <Text style={styles.pageArrow}>‹</Text>
          </Pressable>
          <Text style={styles.pageLabel}>
            Trang {pagination.page + 1} / {pagination.pageCount}
          </Text>
          <Pressable
            accessibilityLabel="Trang dự án tiếp theo"
            disabled={pagination.page >= pagination.pageCount - 1}
            onPress={() =>
              onPageChange(
                Math.min(pagination.pageCount - 1, pagination.page + 1),
              )
            }
            style={[
              styles.pageButton,
              pagination.page >= pagination.pageCount - 1 && styles.disabled,
            ]}
          >
            <Text style={styles.pageArrow}>›</Text>
          </Pressable>
        </View>
      )}
      <Modal
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
    </>
  );
}

export default memo(ProjectListScreen);
