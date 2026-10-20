import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ScrollView } from "react-native";

import {
  api,
  json,
  type Project,
  type Task,
  type User,
} from "../services/api.ts";
import {
  formatViDate,
  parseViDateTime,
  toViDateTimeInput,
} from "../utils/calendar.ts";
import { calendarProjectId } from "../domain/calendarPolicy.ts";
import {
  cancelReminder,
  syncReminder,
  type ReminderOffset,
} from "../services/local.ts";
import { canChangeTaskStatus } from "../domain/projectPolicy.ts";
import type { ProjectTab } from "../types/index.ts";

type UseTasksOptions = {
  project: Project | null;
  projectRef: MutableRefObject<Project | null>;
  currentUserId?: string;
  reminderOffsets: ReminderOffset[];
  contentScroll: MutableRefObject<ScrollView | null>;
  onError: (message: string) => void;
  onTabChange: (tab: ProjectTab) => void;
  onReloadProject: (projectId: string, open?: boolean) => Promise<unknown>;
  onReloadCalendar: () => Promise<unknown>;
};

const defaultTaskRange = (selectedDay?: Date) => {
  if (selectedDay) {
    const day = formatViDate(selectedDay);
    return { startsAt: `${day} 09:00`, dueAt: `${day} 17:00` };
  }
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: toViDateTimeInput(start), dueAt: toViDateTimeInput(end) };
};

const userIdOf = (person?: User | string) =>
  typeof person === "string" ? person : person?._id || person?.id || "";

export function useTasks({
  project,
  projectRef,
  currentUserId,
  reminderOffsets,
  contentScroll,
  onError,
  onTabChange,
  onReloadProject,
  onReloadCalendar,
}: UseTasksOptions) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStartsAt, setTaskStartsAt] = useState(
    () => defaultTaskRange().startsAt,
  );
  const [taskDue, setTaskDue] = useState(() => defaultTaskRange().dueAt);
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskEditorVisible, setTaskEditorVisible] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<
    Record<string, boolean>
  >({});
  const [focusedTaskId, setFocusedTaskId] = useState("");
  const taskGroupOffsets = useRef<Record<string, number>>({});
  const taskGroupBodyOffsets = useRef<Record<string, number>>({});
  const taskOffsets = useRef<Record<string, number>>({});
  const pendingTaskFocus = useRef<{ taskId: string; groupKey: string } | null>(
    null,
  );
  const focusedTaskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (focusedTaskTimer.current) clearTimeout(focusedTaskTimer.current);
    },
    [],
  );

  const clearFocus = () => {
    setFocusedTaskId("");
    pendingTaskFocus.current = null;
    if (focusedTaskTimer.current) {
      clearTimeout(focusedTaskTimer.current);
      focusedTaskTimer.current = null;
    }
  };

  const resetTaskForm = (selectedDay?: Date) => {
    const range = defaultTaskRange(selectedDay);
    setEditTask(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskStartsAt(range.startsAt);
    setTaskDue(range.dueAt);
    setTaskAssignee("");
  };

  const resetTaskWorkspace = () => {
    resetTaskForm();
    setTaskEditorVisible(false);
    setTaskSaving(false);
    setExpandedTaskGroups({});
    clearFocus();
    taskGroupOffsets.current = {};
    taskGroupBodyOffsets.current = {};
    taskOffsets.current = {};
  };

  const beginNewTask = () => {
    resetTaskForm();
    onError("");
    clearFocus();
    setTaskEditorVisible(true);
  };

  const closeTaskEditor = () => {
    if (taskSaving) return;
    setTaskEditorVisible(false);
    resetTaskForm();
    onError("");
  };

  const saveTask = async () => {
    if (!project) return;
    if (project.archived || !project.permissions.manageTasks)
      throw new Error("Bạn không có quyền tạo / sửa task trong dự án này.");
    if (!taskTitle.trim())
      throw new Error("Tên công việc không được để trống.");
    const startsAt = parseViDateTime(taskStartsAt);
    const dueAt = parseViDateTime(taskDue);
    if (dueAt.getTime() <= startsAt.getTime())
      throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
    const data = {
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      assignee: taskAssignee || null,
      startsAt: startsAt.toISOString(),
      dueAt: dueAt.toISOString(),
    };
    setTaskSaving(true);
    try {
      const saved = editTask
        ? await api<Task>(
            `/projects/${project._id}/tasks/${editTask._id}`,
            json("PATCH", { ...data, version: editTask.version }),
          )
        : await api<Task>(`/projects/${project._id}/tasks`, json("POST", data));
      resetTaskForm();
      setTaskEditorVisible(false);
      let reminderWarning = "";
      try {
        if (userIdOf(saved.assignee) === currentUserId)
          await syncReminder(saved, reminderOffsets);
        else await cancelReminder(saved._id);
      } catch (caught) {
        reminderWarning = `Task đã lưu nhưng chưa cập nhật được nhắc hẹn: ${String(caught)}`;
      }
      await Promise.all([
        onReloadProject(project._id, false),
        onReloadCalendar(),
      ]);
      if (reminderWarning) onError(reminderWarning);
    } finally {
      setTaskSaving(false);
    }
  };

  const selectTask = (task: Task) => {
    const startsAt = task.startsAt
      ? new Date(task.startsAt)
      : task.dueAt
        ? new Date(new Date(task.dueAt).getTime() - 60 * 60 * 1000)
        : new Date();
    const dueAt = task.dueAt
      ? new Date(task.dueAt)
      : new Date(startsAt.getTime() + 60 * 60 * 1000);
    if (
      projectRef.current?.archived ||
      !projectRef.current?.permissions.manageTasks
    ) {
      resetTaskForm();
      onTabChange("tasks");
      return;
    }
    setEditTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setTaskStartsAt(toViDateTimeInput(startsAt));
    setTaskDue(toViDateTimeInput(dueAt));
    setTaskAssignee(userIdOf(task.assignee));
    onTabChange("tasks");
    onError("");
    clearFocus();
    setTaskEditorVisible(true);
  };

  const scheduleFocusedTaskScroll = () => {
    setTimeout(() => {
      const pending = pendingTaskFocus.current;
      if (!pending) return;
      const groupOffset = taskGroupOffsets.current[pending.groupKey];
      const bodyOffset = taskGroupBodyOffsets.current[pending.groupKey];
      const taskOffset = taskOffsets.current[pending.taskId];
      if (
        groupOffset === undefined ||
        bodyOffset === undefined ||
        taskOffset === undefined
      )
        return;
      pendingTaskFocus.current = null;
      contentScroll.current?.scrollTo({
        y: Math.max(0, groupOffset + bodyOffset + taskOffset - 12),
        animated: true,
      });
      if (focusedTaskTimer.current) clearTimeout(focusedTaskTimer.current);
      focusedTaskTimer.current = setTimeout(() => {
        setFocusedTaskId("");
        focusedTaskTimer.current = null;
      }, 3_000);
    }, 50);
  };

  const openTaskInList = async (task: Task) => {
    const projectId = calendarProjectId(task.project);
    if (!projectId) throw new Error("Task không còn thuộc dự án hợp lệ.");
    if (projectRef.current?._id !== projectId) await onReloadProject(projectId);
    const groupKey = userIdOf(task.assignee) || "unassigned";
    resetTaskForm();
    setTaskEditorVisible(false);
    clearFocus();
    setFocusedTaskId(task._id);
    pendingTaskFocus.current = { taskId: task._id, groupKey };
    setExpandedTaskGroups((current) => ({ ...current, [groupKey]: true }));
    onError("");
    onTabChange("tasks");
  };

  const openTaskFromCalendar = async (task: Task) => {
    const id = calendarProjectId(task.project);
    if (!id) throw new Error("Task không còn thuộc dự án hợp lệ.");
    await onReloadProject(id);
    selectTask(task);
  };

  const changeStatus = async (task: Task, status: Task["status"]) => {
    if (!project) return;
    if (!currentUserId || !canChangeTaskStatus(project, task, currentUserId))
      throw new Error("Bạn chỉ được cập nhật task được giao cho mình.");
    const saved = await api<Task>(
      `/projects/${project._id}/tasks/${task._id}`,
      json("PATCH", { status, version: task.version }),
    );
    try {
      if (userIdOf(saved.assignee) === currentUserId)
        await syncReminder(saved, reminderOffsets);
      else await cancelReminder(saved._id);
    } catch (caught) {
      onError(
        `Trạng thái đã lưu nhưng chưa cập nhật được nhắc hẹn: ${String(caught)}`,
      );
    }
    await Promise.all([
      onReloadProject(project._id, false),
      onReloadCalendar(),
    ]);
  };

  const deleteTask = async (task: Task) => {
    const id = calendarProjectId(task.project) || project?._id;
    if (!id) throw new Error("Không xác định được dự án của task.");
    await api(`/projects/${id}/tasks/${task._id}`, json("DELETE"));
    try {
      await cancelReminder(task._id);
    } catch (caught) {
      onError(`Task đã xóa nhưng chưa hủy được nhắc hẹn: ${String(caught)}`);
    }
    await onReloadCalendar();
    if (project?._id === id) await onReloadProject(id, false);
  };

  const onGroupLayout = (groupKey: string, y: number) => {
    taskGroupOffsets.current[groupKey] = y;
    scheduleFocusedTaskScroll();
  };
  const onGroupBodyLayout = (groupKey: string, y: number) => {
    taskGroupBodyOffsets.current[groupKey] = y;
    scheduleFocusedTaskScroll();
  };
  const onTaskLayout = (taskId: string, y: number) => {
    taskOffsets.current[taskId] = y;
    scheduleFocusedTaskScroll();
  };

  return {
    tasks,
    setTasks,
    editTask,
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    taskStartsAt,
    setTaskStartsAt,
    taskDue,
    setTaskDue,
    taskAssignee,
    setTaskAssignee,
    taskEditorVisible,
    taskSaving,
    expandedTaskGroups,
    setExpandedTaskGroups,
    focusedTaskId,
    resetTaskForm,
    resetTaskWorkspace,
    beginNewTask,
    closeTaskEditor,
    saveTask,
    selectTask,
    openTaskInList,
    openTaskFromCalendar,
    changeStatus,
    deleteTask,
    onGroupLayout,
    onGroupBodyLayout,
    onTaskLayout,
  };
}
