import React, { memo, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { Project, Task } from "../../services/api.ts";
import { styles } from "../../styles/app.ts";
import type { TaskAssigneeGroup } from "../../utils/taskGroups.ts";
import TaskCard from "./TaskCard.tsx";

const TASK_PREVIEW_LIMIT = 3;

type TaskGroupProps = {
  group: TaskAssigneeGroup;
  project: Project;
  currentUserId: string;
  expanded: boolean;
  focusedTaskId: string;
  onToggle: () => void;
  onGroupLayout: (groupKey: string, y: number) => void;
  onBodyLayout: (groupKey: string, y: number) => void;
  onTaskLayout: (taskId: string, y: number) => void;
  onChangeStatus: (task: Task, status: Task["status"]) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
};

function TaskGroup({
  group,
  project,
  currentUserId,
  expanded,
  focusedTaskId,
  onToggle,
  onGroupLayout,
  onBodyLayout,
  onTaskLayout,
  onChangeStatus,
  onEditTask,
  onDeleteTask,
}: TaskGroupProps) {
  const [showAllTasks, setShowAllTasks] = useState(false);
  const containsFocusedTask = group.tasks.some(
    (task) => task._id === focusedTaskId,
  );
  const visibleTasks = showAllTasks
    ? group.tasks
    : group.tasks.slice(0, TASK_PREVIEW_LIMIT);
  const hiddenTaskCount = Math.max(
    0,
    group.tasks.length - TASK_PREVIEW_LIMIT,
  );
  const initial =
    group.key === "unassigned"
      ? "—"
      : group.name.trim().charAt(0).toLocaleUpperCase("vi");

  useEffect(() => {
    if (!expanded || group.tasks.length <= TASK_PREVIEW_LIMIT) {
      setShowAllTasks(false);
      return;
    }
    if (focusedTaskId && containsFocusedTask) setShowAllTasks(true);
  }, [containsFocusedTask, expanded, focusedTaskId, group.tasks.length]);

  return (
    <View
      onLayout={(event) => onGroupLayout(group.key, event.nativeEvent.layout.y)}
      style={styles.taskGroup}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.taskGroupHeader,
          pressed && styles.cardPressed,
        ]}
      >
        <View
          style={[
            styles.assigneeAvatar,
            group.isCurrentUser && styles.myAssigneeAvatar,
          ]}
        >
          <Text
            style={[
              styles.assigneeAvatarText,
              group.isCurrentUser && styles.myAssigneeAvatarText,
            ]}
          >
            {initial}
          </Text>
        </View>
        <View style={styles.taskGroupCopy}>
          <View style={styles.assigneeNameRow}>
            <Text style={styles.taskGroupName}>{group.name}</Text>
            {group.isCurrentUser && (
              <View style={styles.meBadge}>
                <Text style={styles.meBadgeText}>BẠN</Text>
              </View>
            )}
          </View>
          <Text style={styles.taskGroupMeta}>
            {group.tasks.length} công việc
          </Text>
        </View>
        <View style={styles.taskGroupChevron}>
          <Text style={styles.taskGroupChevronText}>
            {expanded ? "⌃" : "⌄"}
          </Text>
        </View>
      </Pressable>
      {expanded && (
        <View
          onLayout={(event) =>
            onBodyLayout(group.key, event.nativeEvent.layout.y)
          }
          style={styles.taskGroupBody}
        >
          {visibleTasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              project={project}
              currentUserId={currentUserId}
              focused={focusedTaskId === task._id}
              onLayout={onTaskLayout}
              onChangeStatus={onChangeStatus}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
            />
          ))}
          {group.tasks.length > TASK_PREVIEW_LIMIT && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllTasks }}
              onPress={() => setShowAllTasks((current) => !current)}
              style={({ pressed }) => [
                styles.taskGroupMoreButton,
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={styles.taskGroupMoreText}>
                {showAllTasks
                  ? "Thu gọn"
                  : `Xem thêm ${hiddenTaskCount} task`}
              </Text>
              <Text style={styles.taskGroupMoreIcon}>
                {showAllTasks ? "⌃" : "⌄"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export default memo(TaskGroup);
