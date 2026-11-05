import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { ScrollView } from "react-native";

/** Track task layout and temporary highlight independently from task editing. */
export function useTaskFocus(contentScroll: MutableRefObject<ScrollView | null>) {
  const [focusedTaskId, setFocusedTaskId] = useState("");
  const taskGroupOffsets = useRef<Record<string, number>>({});
  const taskGroupBodyOffsets = useRef<Record<string, number>>({});
  const taskOffsets = useRef<Record<string, number>>({});
  const pendingTaskFocus = useRef<{
    taskId: string;
    groupKey: string
  } | null>(
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

  const focusTask = (taskId: string, groupKey: string) => {
    setFocusedTaskId(taskId);
    pendingTaskFocus.current = { taskId, groupKey };
  };
  const resetFocusLayout = () => {
    taskGroupOffsets.current = {};
    taskGroupBodyOffsets.current = {};
    taskOffsets.current = {};
  };
  return {
    resetFocusLayout,
    focusedTaskId,
    clearFocus,
    focusTask,
    onGroupLayout,
    onGroupBodyLayout,
    onTaskLayout,
  };
}
