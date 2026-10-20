import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  CalendarEvent,
  Project,
  ProjectSummary,
  Task,
} from "../../services/api.ts";
import type { ReminderOffset } from "../../services/local.ts";
import NativeDateTimeField from "../ui/NativeDateTimeField.tsx";
import ReminderSelect, { REMINDER_OPTIONS } from "../ui/ReminderSelect.tsx";
import {
  effectiveTaskStatus,
  taskStatusLabels,
} from "../../domain/projectPolicy.ts";
import {
  calendarCreatePermissions,
  calendarProjectId,
  matchesCalendarScope,
  type CalendarScope,
} from "../../domain/calendarPolicy.ts";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  buildWeekDays,
  dateKey,
  formatViCalendarTitle,
  formatViDate,
  formatViDateTime,
  moveCalendarDate,
  parseViDateTime,
  sameDay,
  toViDateTimeInput,
  type CalendarMode,
} from "../../utils/calendar.ts";
import { styles } from "../../styles/calendar.ts";
import type { EventDraft } from "../../types/index.ts";

type Props = {
  tasks: Task[];
  events: CalendarEvent[];
  projects: Project[];
  scope?: CalendarScope;
  fixedProjectId?: string;
  readOnly?: boolean;
  canManageTasks?: boolean;
  canManageEvents?: boolean;
  initialEvent?: CalendarEvent | null;
  defaultReminderOffsets: ReminderOffset[];
  onSaveEvent: (
    event: CalendarEvent | null,
    draft: EventDraft,
  ) => Promise<void>;
  onDeleteEvent: (event: CalendarEvent) => Promise<void>;
  onOpenTask: (task: Task) => void;
  onOpenProjectEvent?: (event: CalendarEvent) => void;
  onInitialEventHandled?: () => void;
  onDeleteTask: (task: Task) => Promise<void>;
  onError: (message: string) => void;
};

const projectNameOf = (
  value: string | ProjectSummary | null | undefined,
  projects: Project[],
) => {
  if (!value) return "Cá nhân";
  if (typeof value !== "string") return value.name;
  return projects.find((project) => project._id === value)?.name || "Dự án";
};
function parsedDateOrUndefined(value: string) {
  try {
    return parseViDateTime(value);
  } catch {
    return undefined;
  }
}
function actionButton(
  label: string,
  action: () => void,
  secondary = false,
  disabled = false,
) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={action}
      disabled={disabled}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[styles.buttonText, secondary && styles.secondaryButtonText]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function occursOn(event: CalendarEvent, day: Date) {
  const starts = dateKey(new Date(event.startsAt));
  const exclusiveEnd = Math.max(
    new Date(event.endsAt).getTime() - 1,
    new Date(event.startsAt).getTime(),
  );
  const ends = dateKey(new Date(exclusiveEnd));
  const key = dateKey(day);
  return starts <= key && key <= ends;
}

export default function CalendarPanel({
  tasks,
  events,
  projects,
  scope = "all",
  fixedProjectId,
  readOnly = false,
  canManageTasks = true,
  canManageEvents = true,
  initialEvent,
  defaultReminderOffsets,
  onSaveEvent,
  onDeleteEvent,
  onOpenTask,
  onOpenProjectEvent,
  onInitialEventHandled,
  onDeleteTask,
  onError,
}: Props) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [eventOffsets, setEventOffsets] = useState<ReminderOffset[]>(
    defaultReminderOffsets,
  );
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (fixedProjectId)
          return calendarProjectId(task.project) === fixedProjectId;
        return matchesCalendarScope(scope, task.project);
      }),
    [tasks, fixedProjectId, scope],
  );
  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        if (fixedProjectId)
          return calendarProjectId(event.project) === fixedProjectId;
        return matchesCalendarScope(scope, event.project);
      }),
    [events, fixedProjectId, scope],
  );

  const cells =
    mode === "month"
      ? buildMonthGrid(selectedDay)
      : mode === "week"
        ? buildWeekDays(selectedDay)
        : [selectedDay];
  const selectedTasks = visibleTasks.filter(
    (task) => task.dueAt && sameDay(new Date(task.dueAt), selectedDay),
  );
  const selectedEvents = visibleEvents.filter((event) =>
    occursOn(event, selectedDay),
  );
  const permissions = calendarCreatePermissions(scope, fixedProjectId);

  const resetEditor = () => {
    setEditing(null);
    setEditorVisible(false);
    setTitle("");
    setStartsAt("");
    setEndsAt("");
    setAllDay(false);
    setEventOffsets(defaultReminderOffsets);
    setEditorError("");
  };

  const beginNew = () => {
    if (readOnly || !permissions.canCreateEvent) return;
    const day = formatViDate(selectedDay);
    const start = parseViDateTime(`${day} 09:00`);
    const end = parseViDateTime(`${day} 10:00`);
    setEditing(null);
    setTitle("");
    setStartsAt(toViDateTimeInput(start));
    setEndsAt(toViDateTimeInput(end));
    setAllDay(false);
    setEventOffsets(
      defaultReminderOffsets.length ? [defaultReminderOffsets[0]] : [0],
    );
    setEditorError("");
    setEditorVisible(true);
  };

  const beginEdit = (event: CalendarEvent) => {
    if (readOnly || !canManageEvents) return;
    setEditing(event);
    setTitle(event.title);
    setStartsAt(toViDateTimeInput(event.startsAt));
    setEndsAt(toViDateTimeInput(event.endsAt));
    setAllDay(!!event.allDay);
    setEventOffsets([
      ((event.reminderOffsets || [0])[0] ?? 0) as ReminderOffset,
    ]);
    setEditorError("");
    setEditorVisible(true);
  };

  useEffect(() => {
    if (!initialEvent) return;
    setSelectedDay(new Date(initialEvent.startsAt));
    beginEdit(initialEvent);
    onInitialEventHandled?.();
  }, [initialEvent?._id]);

  const submit = async () => {
    try {
      if (readOnly || !canManageEvents)
        throw new Error("Lịch dự án này chỉ được xem.");
      setEditorError("");
      let start = parseViDateTime(startsAt);
      let end = parseViDateTime(endsAt);
      if (allDay) {
        start = parseViDateTime(`${formatViDate(start)} 00:00`);
        end = parseViDateTime(`${formatViDate(end)} 00:00`);
        if (end <= start && formatViDate(end) === formatViDate(start))
          end = new Date(start.getTime() + 86400000);
      }
      if (!title.trim())
        throw new Error("Nội dung sự kiện không được để trống.");
      if (end <= start)
        throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
      setSaving(true);
      await onSaveEvent(editing, {
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay,
        reminderOffsets: eventOffsets,
        projectId: fixedProjectId || null,
      });
      resetEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () => {
    if (!saving) resetEditor();
  };

  const confirmDeleteEvent = (event: CalendarEvent) =>
    Alert.alert("Xóa sự kiện?", event.title, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: () =>
          void onDeleteEvent(event).catch((error) => onError(String(error))),
      },
    ]);
  const confirmDeleteTask = (task: Task) =>
    Alert.alert("Xóa công việc?", task.title, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: () =>
          void onDeleteTask(task).catch((error) => onError(String(error))),
      },
    ]);

  return (
    <View style={styles.container}>
      {!readOnly && permissions.canCreateEvent && (
        <View style={styles.topActionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={beginNew}
            style={({ pressed }) => [
              styles.addEventButton,
              pressed && styles.addEventButtonPressed,
            ]}
          >
            <Text style={styles.addEventIcon}>＋</Text>
            <Text style={styles.addEventText}>Thêm sự kiện</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.modeRow}>
        {(["day", "week", "month"] as CalendarMode[]).map((value) => (
          <Pressable
            key={value}
            onPress={() => setMode(value)}
            style={[styles.modeButton, mode === value && styles.activeMode]}
          >
            <Text
              style={mode === value ? styles.activeModeText : styles.modeText}
            >
              {{ day: "Ngày", week: "Tuần", month: "Tháng" }[value]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.calendarHeader}>
        {actionButton(
          "‹",
          () =>
            setSelectedDay((current) => moveCalendarDate(current, mode, -1)),
          true,
        )}
        <View style={styles.calendarTitleWrap}>
          <Text style={styles.calendarTitle}>
            {formatViCalendarTitle(selectedDay, mode)}
          </Text>
          {sameDay(selectedDay, new Date()) && (
            <Text style={styles.todayLabel}>Hôm nay</Text>
          )}
        </View>
        {actionButton(
          "›",
          () => setSelectedDay((current) => moveCalendarDate(current, mode, 1)),
          true,
        )}
      </View>

      {mode !== "day" && (
        <View style={styles.weekHeader}>
          {WEEKDAY_LABELS.map((label, index) => (
            <Text
              key={label}
              style={[styles.weekLabel, index === 6 && styles.sunday]}
            >
              {label}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.calendarGrid}>
        {cells.map((day, index) => {
          if (!day)
            return <View key={`empty-${index}`} style={styles.emptyDay} />;
          const taskItems = visibleTasks.filter(
            (task) => task.dueAt && sameDay(new Date(task.dueAt), day),
          );
          const eventItems = visibleEvents.filter((event) =>
            occursOn(event, day),
          );
          const overdue = taskItems.some(
            (task) =>
              task.status !== "done" &&
              task.dueAt &&
              new Date(task.dueAt).getTime() < Date.now(),
          );
          return (
            <Pressable
              key={`${dateKey(day)}-${index}`}
              onPress={() => setSelectedDay(day)}
              style={[
                styles.dayCell,
                mode === "day" && styles.singleDayCell,
                sameDay(day, selectedDay) && styles.selectedDay,
                sameDay(day, new Date()) && styles.todayCell,
              ]}
            >
              <Text
                style={[
                  styles.dayNumber,
                  sameDay(day, selectedDay) && styles.selectedDayText,
                ]}
              >
                {Number(dateKey(day).slice(-2))}
              </Text>
              <View style={styles.dotRow}>
                {!!taskItems.length && (
                  <Text style={[styles.dot, overdue && styles.overdueDot]}>
                    ●
                  </Text>
                )}
                {!!eventItems.length && (
                  <Text style={[styles.dot, styles.eventDot]}>●</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendTask}>● Deadline</Text>
        <Text style={styles.legendEvent}>● Sự kiện</Text>
      </View>

      <Text style={styles.selectedTitle}>{formatViDate(selectedDay)}</Text>

      {!selectedTasks.length && !selectedEvents.length && (
        <View style={styles.emptyAgenda}>
          <Text style={styles.muted}>Chưa có lịch trong ngày này.</Text>
        </View>
      )}
      {selectedTasks.map((task) => (
        <View style={styles.card} key={`task-${task._id}`}>
          <View style={styles.badgeRow}>
            <Text style={styles.taskBadge}>TASK</Text>
            <Text style={styles.projectLabel}>
              {projectNameOf(task.project, projects)}
            </Text>
          </View>
          <Text style={styles.cardTitle}>{task.title}</Text>
          {!!task.description && (
            <Text style={styles.note}>{task.description}</Text>
          )}
          <Text>
            Bắt đầu:{" "}
            {task.startsAt ? formatViDateTime(task.startsAt) : "Chưa đặt"}
          </Text>
          <Text>
            Kết thúc: {task.dueAt ? formatViDateTime(task.dueAt) : "Chưa đặt"} ·{" "}
            {taskStatusLabels[effectiveTaskStatus(task)]}
          </Text>
          <View style={styles.wrap}>
            {actionButton(
              readOnly || !canManageTasks ? "Xem" : "Xem / sửa",
              () => onOpenTask(task),
              true,
            )}
            {!!fixedProjectId &&
              !readOnly &&
              canManageTasks &&
              actionButton("Xóa", () => confirmDeleteTask(task), true)}
          </View>
        </View>
      ))}
      {selectedEvents.map((event) => (
        <View style={styles.card} key={`event-${event._id}`}>
          <View style={styles.badgeRow}>
            <Text style={styles.eventBadge}>SỰ KIỆN</Text>
            <Text style={styles.projectLabel}>
              {projectNameOf(event.project, projects)}
            </Text>
          </View>
          <Text style={styles.cardTitle}>{event.title}</Text>
          <Text>
            {event.allDay
              ? "Cả ngày"
              : `${formatViDateTime(event.startsAt)} – ${formatViDateTime(event.endsAt)}`}
          </Text>
          {!!event.reminderOffsets?.length && (
            <Text style={styles.muted}>
              Nhắc:{" "}
              {event.reminderOffsets
                .map(
                  (offset) =>
                    REMINDER_OPTIONS.find(([value]) => value === offset)?.[1],
                )
                .filter(Boolean)
                .join(", ")}
            </Text>
          )}
          <View style={styles.wrap}>
            {!fixedProjectId && calendarProjectId(event.project) ? (
              actionButton(
                "Xem / sửa",
                () => onOpenProjectEvent?.(event),
                true,
                !onOpenProjectEvent,
              )
            ) : !readOnly && canManageEvents ? (
              <>
                {actionButton("Sửa", () => beginEdit(event), true)}
                {actionButton("Xóa", () => confirmDeleteEvent(event), true)}
              </>
            ) : null}
          </View>
        </View>
      ))}

      <Modal
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
    </View>
  );
}
