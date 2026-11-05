import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  calendarCreatePermissions,
  calendarProjectId,
  matchesCalendarScope,
  type CalendarScope,
} from "../../domain/calendarPolicy.ts";
import {
  effectiveTaskStatus,
  taskStatusLabels,
} from "../../domain/projectPolicy.ts";
import { useCalendarEventEditor } from "../../hooks/useCalendarEventEditor.ts";
import type { ReminderOffset } from "../../services/local.ts";
import { styles } from "../../styles/calendar.ts";
import type {
  CalendarEvent,
  Project,
  ProjectSummary,
  Task,
} from "../../types/api.ts";
import type { EventDraft } from "../../types/index.ts";
import {
  dateKey,
  formatViCalendarTitle,
  formatViDate,
  formatViDateTime,
  moveCalendarDate,
  sameDay,
  type CalendarMode,
} from "../../utils/calendar.ts";
import { occursBetween, occursOn } from "../../utils/calendarAgenda.ts";
import { REMINDER_OPTIONS } from "../ui/ReminderSelect.tsx";
import CalendarGrid from "./CalendarGrid.tsx";
import EventEditorModal from "./EventEditorModal.tsx";

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

  const selectedYear = dateKey(selectedDay).slice(0, 4);
  const yearTasks = visibleTasks.filter(
    (task) =>
      task.dueAt && dateKey(new Date(task.dueAt)).startsWith(selectedYear),
  );
  const yearEvents = visibleEvents.filter((event) =>
    occursBetween(event, `${selectedYear}-01-01`, `${selectedYear}-12-31`),
  );
  const selectedTasks = visibleTasks.filter(
    (task) => task.dueAt && sameDay(new Date(task.dueAt), selectedDay),
  );
  const selectedEvents = visibleEvents.filter((event) =>
    occursOn(event, selectedDay),
  );
  const permissions = calendarCreatePermissions(scope, fixedProjectId);

  const editor = useCalendarEventEditor({
    selectedDay,
    onSelectedDayChange: setSelectedDay,
    fixedProjectId,
    readOnly,
    canManageEvents,
    canCreateEvent: permissions.canCreateEvent,
    initialEvent,
    defaultReminderOffsets,
    onInitialEventHandled,
    onSaveEvent,
  });
  const { beginNew, beginEdit } = editor;

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
        {(["day", "week", "month", "year"] as CalendarMode[]).map((value) => (
          <Pressable
            key={value}
            onPress={() => setMode(value)}
            style={[styles.modeButton, mode === value && styles.activeMode]}
          >
            <Text
              style={mode === value ? styles.activeModeText : styles.modeText}
            >
              {{ day: "Ngày", week: "Tuần", month: "Tháng", year: "Năm" }[
                value
              ]}
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

      <CalendarGrid
        mode={mode}
        selectedDay={selectedDay}
        visibleTasks={visibleTasks}
        visibleEvents={visibleEvents}
        setSelectedDay={setSelectedDay}
        setMode={setMode}
      />
      <View style={styles.legend}>
        <Text style={styles.legendTask}>● Deadline</Text>
        <Text style={styles.legendEvent}>● Sự kiện</Text>
      </View>

      <Text style={styles.selectedTitle}>
        {mode === "year"
          ? `Tổng quan năm ${selectedYear}`
          : formatViDate(selectedDay)}
      </Text>

      {mode === "year" && (
        <View style={styles.yearSummary}>
          <Text style={styles.yearSummaryValue}>
            {yearTasks.length} deadline · {yearEvents.length} sự kiện
          </Text>
          <Text style={styles.muted}>
            Chọn một tháng để mở lịch chi tiết của tháng đó.
          </Text>
        </View>
      )}
      {mode !== "year" && !selectedTasks.length && !selectedEvents.length && (
        <View style={styles.emptyAgenda}>
          <Text style={styles.muted}>Chưa có lịch trong ngày này.</Text>
        </View>
      )}
      {mode !== "year" && selectedTasks.map((task) => (
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
      {mode !== "year" && selectedEvents.map((event) => (
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

      <EventEditorModal editor={editor} selectedDay={selectedDay} />
    </View>
  );
}
