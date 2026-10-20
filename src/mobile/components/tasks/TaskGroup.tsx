import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Project, Task } from "../../services/api.ts";
import { styles } from "../../styles/app.ts";
import type { TaskAssigneeGroup } from "../../utils/taskGroups.ts";
import TaskCard from "./TaskCard.tsx";

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
  const initial =
    group.key === "unassigned"
      ? "—"
      : group.name.trim().charAt(0).toLocaleUpperCase("vi");

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
          {group.tasks.map((task) => (
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
        </View>
      )}
    </View>
  );
}

export default memo(TaskGroup);
