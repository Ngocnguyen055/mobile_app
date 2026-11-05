import { memo, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import CreateProjectModal from "../components/projects/CreateProjectModal.tsx";
import ProjectDateFilterControl from "../components/projects/ProjectDateFilter.tsx";
import type { ProjectDateFilter } from "../utils/projectList.ts";

import { roleLabels } from "../domain/projectPolicy.ts";
import { styles } from "../styles/app.ts";
import type { Project } from "../types/api.ts";
import {
  formatViDate
} from "../utils/calendar.ts";
import {
  PROJECTS_PER_PAGE,
  filterProjects,
  orderProjectsNewestFirst,
  projectOwnerDetails,
  projectsForPage,
  type ProjectOwnershipFilter,
} from "../utils/projectList.ts";

type ProjectListScreenProps = {
  projects: Project[];
  currentUserId: string;
  search: string;
  ownershipFilter: ProjectOwnershipFilter;
  dateFilter: ProjectDateFilter;
  dateAnchor: string;
  page: number;
  createVisible: boolean;
  creating: boolean;
  projectName: string;
  projectKind: Project["kind"];
  error: string;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onSearchChange: (value: string) => void;
  onOwnershipFilterChange: (value: ProjectOwnershipFilter) => void;
  onDateFilterChange: (filter: ProjectDateFilter, anchor: string) => void;
  onPageChange: (page: number) => void;
  onProjectNameChange: (value: string) => void;
  onProjectKindChange: (kind: Project["kind"]) => void;
  onRefresh: () => void;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
};

const ownershipOptions: ReadonlyArray<{
  value: ProjectOwnershipFilter;
  label: string;
}> = [
    { value: "all", label: "Tất cả" },
    { value: "owned", label: "Dự án của bạn" },
    { value: "other", label: "Dự án khác" },
  ];

function OwnerDetails({
  project,
  currentUserId,
}: {
  project: Project;
  currentUserId: string;
}) {
  if (project.owner === currentUserId) return null;
  const owner = projectOwnerDetails(project);
  return (
    <View style={styles.projectOwnerBlock}>
      <Text numberOfLines={1} style={styles.projectOwnerName}>
        Chủ dự án: {owner?.name || "Không xác định"}
      </Text>
      <Text numberOfLines={1} style={styles.projectOwnerEmail}>
        {owner?.email || "Chưa có email"}
      </Text>
    </View>
  );
}

function ProjectListScreen({
  projects,
  currentUserId,
  search,
  ownershipFilter,
  dateFilter,
  dateAnchor,
  page,
  createVisible,
  creating,
  projectName,
  projectKind,
  error,
  onOpenCreate,
  onCloseCreate,
  onSearchChange,
  onOwnershipFilterChange,
  onDateFilterChange,
  onPageChange,
  onProjectNameChange,
  onProjectKindChange,
  onRefresh,
  onOpenProject,
  onCreateProject,
}: ProjectListScreenProps) {
  const [filterExpanded, setFilterExpanded] = useState(false);
  const topLevelProjects = projects.filter((project) => !project.parentProject);
  const activeDateAnchor = dateAnchor && !Number.isNaN(new Date(dateAnchor).getTime()) ? new Date(dateAnchor) : new Date();
  const filteredProjects = filterProjects(
    topLevelProjects,
    search,
    ownershipFilter,
    currentUserId,
    dateFilter,
    activeDateAnchor,
  );
  const projectDotRows = filterProjects(
    topLevelProjects,
    search,
    ownershipFilter,
    currentUserId,
  );
  const orderedProjects = orderProjectsNewestFirst(filteredProjects);
  const pagination = projectsForPage(orderedProjects, page);
  const ownershipLabel =
    ownershipOptions.find((option) => option.value === ownershipFilter)?.label ||
    ownershipOptions[0].label;

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
              {topLevelProjects.filter((item) => !item.archived).length}
              <Text style={styles.statTotal}>/{topLevelProjects.length}</Text>
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
          placeholder="Tìm dự án..."
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
      <View style={styles.projectFiltersRow}>
        <View style={styles.projectFilterDropdown}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Lọc theo quyền sở hữu: ${ownershipLabel}`}
            accessibilityState={{ expanded: filterExpanded }}
            onPress={() => setFilterExpanded((current) => !current)}
            style={styles.projectFilterButton}
          >
            <Text numberOfLines={1} style={styles.projectFilterButtonText}>
              {ownershipLabel}
            </Text>
            <Text style={styles.projectFilterArrow}>
              {filterExpanded ? "▴" : "▾"}
            </Text>
          </Pressable>
          {filterExpanded && (
            <View style={styles.projectFilterMenu}>
              {ownershipOptions.map((option) => {
                const selected = option.value === ownershipFilter;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onOwnershipFilterChange(option.value);
                      setFilterExpanded(false);
                    }}
                    style={[
                      styles.projectFilterOption,
                      selected && styles.projectFilterOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.projectFilterOptionText,
                        selected && styles.projectFilterOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected && <Text style={styles.projectFilterCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
        <ProjectDateFilterControl
          dateFilter={dateFilter}
          dateAnchor={dateAnchor}
          projectDotRows={projectDotRows}
          onDateFilterChange={onDateFilterChange}
          onOpen={() => setFilterExpanded(false)}
        />
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
            <OwnerDetails project={item} currentUserId={currentUserId} />
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
      {!topLevelProjects.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>◇</Text>
          <Text style={styles.strong}>Chưa có dự án</Text>
          <Text style={styles.muted}>
            Tạo dự án đầu tiên để bắt đầu cộng tác.
          </Text>
        </View>
      )}
      {!!topLevelProjects.length && !filteredProjects.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>⌕</Text>
          <Text style={styles.strong}>Không tìm thấy dự án</Text>
          <Text style={styles.muted}>
            {search
              ? "Thử tìm bằng một tên dự án khác."
              : "Không có dự án phù hợp với bộ lọc đã chọn."}
          </Text>
        </View>
      )}
      {filteredProjects.length > PROJECTS_PER_PAGE && (
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
      <CreateProjectModal
        createVisible={createVisible}
        creating={creating}
        projectName={projectName}
        projectKind={projectKind}
        error={error}
        onCloseCreate={onCloseCreate}
        onProjectNameChange={onProjectNameChange}
        onProjectKindChange={onProjectKindChange}
        onCreateProject={onCreateProject}
      />
    </>
  );
}

export default memo(ProjectListScreen);
