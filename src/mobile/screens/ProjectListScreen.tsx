import React, { memo, useState } from "react";
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
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatViDate,
  formatViMonth,
  sameDay,
} from "../utils/calendar.ts";
import TextField from "../components/ui/TextField.tsx";
import {
  PROJECTS_PER_PAGE,
  filterProjects,
  formatProjectDatePeriod,
  moveProjectDatePeriod,
  orderProjectsNewestFirst,
  projectDateRange,
  projectOwnerDetails,
  projectsForPage,
  type ProjectDateFilter,
  type ProjectDateGranularity,
  type ProjectOwnershipFilter,
} from "../utils/projectList.ts";
import { roleLabels } from "../domain/projectPolicy.ts";
import { styles } from "../styles/app.ts";

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

const dateModeOptions: ReadonlyArray<{
  value: ProjectDateGranularity;
  label: string;
}> = [
  { value: "day", label: "Ngày" },
  { value: "week", label: "Tuần" },
  { value: "month", label: "Tháng" },
  { value: "year", label: "Năm" },
];

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateFilterButtonLabel(
  filter: ProjectDateGranularity,
  anchor: Date,
) {
  const range = projectDateRange(filter, anchor)!;
  const start = new Date(range.start);
  const end = new Date(range.end - 1);
  if (filter === "day") return `Ngày ${formatViDate(start)}`;
  if (filter === "week")
    return `Tuần ${formatViDate(start).slice(0, 5)}–${formatViDate(end).slice(0, 5)}`;
  if (filter === "month")
    return `Tháng ${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()}`;
  return `Năm ${start.getFullYear()}`;
}

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
  const [datePopupVisible, setDatePopupVisible] = useState(false);
  const [draftDateFilter, setDraftDateFilter] =
    useState<ProjectDateGranularity>("month");
  const [draftDateAnchor, setDraftDateAnchor] = useState(() =>
    new Date().toISOString(),
  );
  const [calendarCursor, setCalendarCursor] = useState(() =>
    new Date().toISOString(),
  );
  const activeDateAnchor = dateAnchor ? validDate(dateAnchor) : new Date();
  const filteredProjects = filterProjects(
    projects,
    search,
    ownershipFilter,
    currentUserId,
    dateFilter,
    activeDateAnchor,
  );
  const projectDotRows = filterProjects(
    projects,
    search,
    ownershipFilter,
    currentUserId,
  );
  const orderedProjects = orderProjectsNewestFirst(filteredProjects);
  const pagination = projectsForPage(orderedProjects, page);
  const ownershipLabel =
    ownershipOptions.find((option) => option.value === ownershipFilter)?.label ||
    ownershipOptions[0].label;
  const dateLabel =
    dateFilter === "all"
      ? "Tất cả thời gian"
      : dateFilterButtonLabel(dateFilter, activeDateAnchor);
  const draftAnchorDate = validDate(draftDateAnchor);
  const currentDate = new Date();
  const selectedPeriodStart = projectDateRange(
    draftDateFilter,
    draftAnchorDate,
  )!.start;
  const currentPeriodStart = projectDateRange(
    draftDateFilter,
    currentDate,
  )!.start;
  const calendarCursorDate = validDate(calendarCursor);
  const calendarDisplayDate =
    draftDateFilter === "day" ? calendarCursorDate : draftAnchorDate;
  const calendarDays = buildMonthGrid(calendarDisplayDate);
  const currentMonthStart = projectDateRange("month", currentDate)!.start;
  const calendarMonthStart = projectDateRange(
    "month",
    calendarDisplayDate,
  )!.start;
  const calendarNextDisabled =
    draftDateFilter === "day"
      ? calendarMonthStart >= currentMonthStart
      : selectedPeriodStart >= currentPeriodStart;

  const openDatePopup = () => {
    setFilterExpanded(false);
    setDraftDateFilter(dateFilter === "all" ? "month" : dateFilter);
    setDraftDateAnchor(
      dateFilter === "all" || !dateAnchor
        ? new Date().toISOString()
        : dateAnchor,
    );
    setCalendarCursor(
      dateFilter === "all" || !dateAnchor
        ? new Date().toISOString()
        : dateAnchor,
    );
    setDatePopupVisible(true);
  };

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Lọc theo ngày tạo: ${dateLabel}`}
          accessibilityState={{ expanded: datePopupVisible }}
          onPress={openDatePopup}
          style={[styles.projectFilterButton, styles.projectFilterRowButton]}
        >
          <Text numberOfLines={1} style={styles.projectFilterButtonText}>
            {dateLabel}
          </Text>
          <Text style={styles.projectFilterArrow}>▾</Text>
        </Pressable>
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
      <Modal
        transparent
        animationType="fade"
        visible={datePopupVisible}
        onRequestClose={() => setDatePopupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel="Đóng bộ lọc thời gian"
            onPress={() => setDatePopupVisible(false)}
            style={styles.modalDismissArea}
          />
          <View style={styles.projectDateSheet} accessibilityViewIsModal>
            <View style={styles.modalHandle} />
            <View style={styles.projectDateSheetHeader}>
              <View style={styles.modalTitleCopy}>
                <Text style={styles.projectDateSheetTitle}>
                  Lọc theo ngày tạo
                </Text>
                <Text style={styles.subtitle}>
                  Chọn một khoảng ở hiện tại hoặc trong quá khứ.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={() => setDatePopupVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Đơn vị thời gian"
              style={styles.projectDateModeRow}
            >
              {dateModeOptions.map((option) => {
                const selected = option.value === draftDateFilter;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setDraftDateFilter(option.value);
                      setCalendarCursor(draftDateAnchor);
                    }}
                    style={[
                      styles.projectDateModeOption,
                      selected && styles.projectDateModeOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.projectDateModeText,
                        selected && styles.projectDateModeTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Khoảng thời gian</Text>
            {draftDateFilter !== "year" ? (
              <View style={styles.projectCalendarCard}>
                <View style={styles.projectDateNavigator}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Tháng trước"
                    onPress={() => {
                      if (draftDateFilter === "day")
                        setCalendarCursor(
                          moveProjectDatePeriod(
                            "month",
                            calendarDisplayDate,
                            -1,
                          ).toISOString(),
                        );
                      else
                        setDraftDateAnchor(
                          moveProjectDatePeriod(
                            draftDateFilter,
                            draftAnchorDate,
                            -1,
                          ).toISOString(),
                        );
                    }}
                    style={styles.projectDateNavButton}
                  >
                    <Text style={styles.projectDateNavArrow}>‹</Text>
                  </Pressable>
                  <Text style={styles.projectCalendarMonth}>
                    {formatViMonth(calendarDisplayDate)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Tháng tiếp theo"
                    disabled={calendarNextDisabled}
                    onPress={() => {
                      if (draftDateFilter === "day")
                        setCalendarCursor(
                          moveProjectDatePeriod(
                            "month",
                            calendarDisplayDate,
                            1,
                          ).toISOString(),
                        );
                      else
                        setDraftDateAnchor(
                          moveProjectDatePeriod(
                            draftDateFilter,
                            draftAnchorDate,
                            1,
                          ).toISOString(),
                        );
                    }}
                    style={[
                      styles.projectDateNavButton,
                      calendarNextDisabled && styles.disabled,
                    ]}
                  >
                    <Text style={styles.projectDateNavArrow}>›</Text>
                  </Pressable>
                </View>
                <View style={styles.projectCalendarWeekHeader}>
                  {WEEKDAY_LABELS.map((label) => (
                    <Text key={label} style={styles.projectCalendarWeekday}>
                      {label}
                    </Text>
                  ))}
                </View>
                <View style={styles.projectCalendarGrid}>
                  {calendarDays.map((day, index) => {
                    if (!day)
                      return (
                        <View
                          key={`blank-${index}`}
                          style={styles.projectCalendarDayCell}
                        />
                      );
                    const dayStart = projectDateRange("day", day)!.start;
                    const selectedRange = projectDateRange(
                      draftDateFilter,
                      draftAnchorDate,
                    )!;
                    const selected =
                      dayStart >= selectedRange.start &&
                      dayStart < selectedRange.end;
                    const today = sameDay(day, currentDate);
                    const future =
                      projectDateRange(draftDateFilter, day)!.start >
                      currentPeriodStart;
                    const hasProject = projectDotRows.some(
                      (project) =>
                        !!project.createdAt &&
                        sameDay(new Date(project.createdAt), day),
                    );
                    return (
                      <View
                        key={day.toISOString()}
                        style={styles.projectCalendarDayCell}
                      >
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityLabel={formatViDate(day)}
                          accessibilityState={{ selected, disabled: future }}
                          disabled={future}
                          onPress={() => {
                            setDraftDateAnchor(day.toISOString());
                            if (draftDateFilter === "day")
                              setCalendarCursor(day.toISOString());
                          }}
                          style={[
                            styles.projectCalendarDay,
                            today && styles.projectCalendarToday,
                            selected &&
                              (draftDateFilter === "day"
                                ? styles.projectCalendarDaySelected
                                : styles.projectCalendarPeriodDaySelected),
                            future && styles.projectCalendarDayDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.projectCalendarDayText,
                              today && styles.projectCalendarTodayText,
                              selected &&
                                (draftDateFilter === "day"
                                  ? styles.projectCalendarDayTextSelected
                                  : styles.projectCalendarPeriodDayTextSelected),
                            ]}
                          >
                            {formatViDate(day).slice(0, 2)}
                          </Text>
                          {hasProject && (
                            <View
                              style={[
                                styles.projectCalendarProjectDot,
                                draftDateFilter === "day" &&
                                  selected &&
                                  styles.projectCalendarProjectDotSelected,
                              ]}
                            />
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.projectDateSelectionText}>
                  Đã chọn: {formatProjectDatePeriod(
                    draftDateFilter,
                    draftAnchorDate,
                    currentDate,
                  )}
                </Text>
                <Text style={styles.projectCalendarLegend}>● Có dự án</Text>
              </View>
            ) : (
              <View style={styles.projectPeriodPicker}>
                <View style={styles.projectDateNavigator}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Khoảng trước"
                    onPress={() =>
                      setDraftDateAnchor(
                        moveProjectDatePeriod(
                          draftDateFilter,
                          draftAnchorDate,
                          -1,
                        ).toISOString(),
                      )
                    }
                    style={styles.projectDateNavButton}
                  >
                    <Text style={styles.projectDateNavArrow}>‹</Text>
                  </Pressable>
                  <Text style={styles.projectDateSelectedPeriod}>
                    {formatProjectDatePeriod(
                      draftDateFilter,
                      draftAnchorDate,
                      currentDate,
                    )}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Khoảng tiếp theo"
                    disabled={selectedPeriodStart >= currentPeriodStart}
                    onPress={() =>
                      setDraftDateAnchor(
                        moveProjectDatePeriod(
                          draftDateFilter,
                          draftAnchorDate,
                          1,
                        ).toISOString(),
                      )
                    }
                    style={[
                      styles.projectDateNavButton,
                      selectedPeriodStart >= currentPeriodStart &&
                        styles.disabled,
                    ]}
                  >
                    <Text style={styles.projectDateNavArrow}>›</Text>
                  </Pressable>
                </View>
                <Text style={styles.projectDatePickerHint}>
                  Dùng nút lùi hoặc tiến để chọn năm mong muốn.
                </Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const now = new Date().toISOString();
                setDraftDateAnchor(now);
                setCalendarCursor(now);
              }}
              style={styles.projectDateCurrentButton}
            >
              <Text style={styles.projectDateCurrentButtonText}>
                Về thời gian hiện tại
              </Text>
            </Pressable>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  onDateFilterChange("all", "");
                  setDatePopupVisible(false);
                }}
                style={[
                  styles.modalActionButton,
                  styles.modalCancelButton,
                ]}
              >
                <Text style={styles.modalCancelText}>Tất cả thời gian</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onDateFilterChange(draftDateFilter, draftDateAnchor);
                  setDatePopupVisible(false);
                }}
                style={[
                  styles.modalActionButton,
                  styles.modalCreateButton,
                ]}
              >
                <Text style={styles.buttonText}>Áp dụng</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
