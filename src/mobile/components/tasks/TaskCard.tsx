import React, { memo } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import type { Project, Task, User } from "../../services/api.ts";
import { formatViDateTime } from "../../utils/calendar.ts";
import {
  canChangeTaskStatus,
  effectiveTaskStatus,
  taskStatusLabels,
} from "../../domain/projectPolicy.ts";
import { styles } from "../../styles/app.ts";
import Button from "../ui/Button.tsx";

type TaskCardProps = {
  task: Task;
  project: Project;
  currentUserId: string;
  focused: boolean;
  onLayout: (taskId: string, y: number) => void;
  onChangeStatus: (task: Task, status: Task["status"]) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

const userIdOf = (person?: User | string) =>
  typeof person === "string" ? person : person?._id || person?.id || "";

function TaskCard({
  task,
  project,
  currentUserId,
  focused,
  onLayout,
  onChangeStatus,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const status = effectiveTaskStatus(task);
  const isMine = userIdOf(task.assignee) === currentUserId;

  return (
    <View
      onLayout={(event) => onLayout(task._id, event.nativeEvent.layout.y)}
      style={[
        styles.card,
        styles.groupedTaskCard,
        isMine && styles.myTaskCard,
        focused && styles.focusedTaskCard,
      ]}
    >
      <View style={styles.taskCardTitleRow}>
        <Text style={styles.taskCardTitle}>{task.title}</Text>
        {isMine && (
          <View style={styles.myTaskBadge}>
            <Text style={styles.myTaskBadgeText}>★ Của bạn</Text>
          </View>
        )}
      </View>
      {!!task.description && (
        <Text style={styles.taskDescription}>{task.description}</Text>
      )}
      <View style={styles.taskMetaRow}>
        <View
          style={[
            styles.taskStatusBadge,
            status === "doing" && styles.taskStatusDoing,
            status === "done" && styles.taskStatusDone,
            status === "overdue" && styles.taskStatusOverdue,
          ]}
        >
          <Text
            style={[
              styles.taskStatusText,
              status === "doing" && styles.taskStatusDoingText,
              status === "done" && styles.taskStatusDoneText,
              status === "overdue" && styles.taskStatusOverdueText,
            ]}
          >
            {taskStatusLabels[status]}
          </Text>
        </View>
        <Text style={styles.taskTimeText}>
          {task.dueAt ? `Hạn ${formatViDateTime(task.dueAt)}` : "Chưa đặt hạn"}
        </Text>
      </View>
      {!!task.startsAt && (
        <Text style={styles.taskTimeText}>
          Bắt đầu {formatViDateTime(task.startsAt)}
        </Text>
      )}
      <View style={styles.wrap}>
        {canChangeTaskStatus(project, task, currentUserId) &&
          (["todo", "doing", "done"] as Task["status"][]).map((nextStatus) => (
            <Pressable
              key={nextStatus}
              onPress={() => onChangeStatus(task, nextStatus)}
              disabled={task.status === nextStatus}
              style={[
                styles.smallButton,
                task.status === nextStatus && styles.disabled,
              ]}
            >
              <Text style={styles.buttonText}>
                {
                  {
                    todo: "Chưa làm",
                    doing: "Đang làm",
                    done: "Hoàn thành",
                  }[nextStatus]
                }
              </Text>
            </Pressable>
          ))}
        {!project.archived && project.permissions.manageTasks && (
          <Button label="Sửa" onPress={() => onEdit(task)} secondary />
        )}
        {!project.archived && project.permissions.manageTasks && (
          <Button
            label="Xóa"
            onPress={() =>
              Alert.alert("Xóa task?", task.title, [
                { text: "Hủy" },
                {
                  text: "Xóa",
                  style: "destructive",
                  onPress: () => onDelete(task),
                },
              ])
            }
            secondary
          />
        )}
      </View>
    </View>
  );
}

export default memo(TaskCard);
