import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Progress, Task, User } from "../../services/api.ts";
import { formatViDateTime } from "../../utils/calendar.ts";
import {
  effectiveTaskStatus,
  taskStatusLabels,
} from "../../domain/projectPolicy.ts";
import { styles } from "../../styles/app.ts";
import { orderTaskPeople } from "../../utils/taskGroups.ts";

type ProjectProgressTabProps = {
  progress: Progress | null;
  tasks: Task[];
  members: User[];
  currentUserId: string;
  expandedPeople: Record<string, boolean>;
  onTogglePerson: (userId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenTask: (task: Task) => void;
};

const userIdOf = (person?: User | string) =>
  typeof person === "string" ? person : person?._id || person?.id || "";

function ProjectProgressTab({
  progress,
  tasks,
  members,
  currentUserId,
  expandedPeople,
  onTogglePerson,
  onOpenProject,
  onOpenTask,
}: ProjectProgressTabProps) {
  const people = orderTaskPeople(
    progress?.byPerson || [],
    members,
    currentUserId,
  );

  return (
    <>
      <Text style={styles.heading}>Tiến độ dự án</Text>
      <Text>
        {progress?.done || 0}/{progress?.total || 0} task hoàn thành
      </Text>
      <View style={styles.bar}>
        <View
          style={[
            styles.fill,
            {
              width: `${progress?.total ? (100 * progress.done) / progress.total : 0}%`,
            },
          ]}
        />
      </View>
      <Text>Sắp quá hạn trong 24 giờ: {progress?.dueSoon || 0}</Text>
      <Text>Đã quá hạn: {progress?.overdue || 0}</Text>
      {progress?.byProject?.map((item) => (
        <Pressable
          key={item.projectId}
          style={styles.card}
          onPress={() => onOpenProject(item.projectId)}
        >
          <Text style={styles.strong}>{item.name}</Text>
          <Text>
            {item.done}/{item.total} hoàn thành · {item.overdue} quá hạn
          </Text>
        </Pressable>
      ))}
      {people.map((person) => (
        <View style={styles.card} key={person.userId}>
          <View style={styles.progressPersonHeader}>
            <Text style={styles.progressPersonName}>
              {person.name ||
                members.find((member) => member._id === person.userId)?.name ||
                (person.userId ? person.userId : "Chưa phân công")}
            </Text>
            {person.userId === currentUserId && (
              <View style={styles.meBadge}>
                <Text style={styles.meBadgeText}>BẠN</Text>
              </View>
            )}
            <Text style={styles.progressPersonCount}>
              {person.done}/{person.total}
            </Text>
          </View>
          <View style={styles.progressRow}>
            <View style={[styles.bar, styles.progressBar]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${person.total ? (100 * person.done) / person.total : 0}%`,
                  },
                ]}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem task của ${person.name || person.userId || "chưa phân công"}`}
              onPress={() => onTogglePerson(person.userId)}
              style={styles.expandButton}
            >
              <Text style={styles.strong}>
                {expandedPeople[person.userId] ? "▴" : "▾"}
              </Text>
            </Pressable>
          </View>
          {expandedPeople[person.userId] &&
            [
              ...(person.tasks ||
                tasks.filter(
                  (task) => userIdOf(task.assignee) === person.userId,
                )),
            ]
              .sort((left, right) =>
                left.title.localeCompare(right.title, "vi", {
                  sensitivity: "base",
                }),
              )
              .map((task) => {
                const status = effectiveTaskStatus(task);
                return (
                  <Pressable
                    key={task._id}
                    style={styles.row}
                    onPress={() => onOpenTask(task)}
                  >
                    <View
                      style={[
                        styles.taskIndicator,
                        status === "doing" && styles.taskDoing,
                        status === "done" && styles.taskDone,
                        status === "overdue" && styles.taskOverdue,
                      ]}
                    >
                      <Text
                        style={[
                          styles.taskIndicatorText,
                          status === "done" && styles.taskDoneText,
                          status === "overdue" && styles.taskOverdueText,
                        ]}
                      >
                        {status === "done"
                          ? "✓"
                          : status === "overdue"
                            ? "×"
                            : ""}
                      </Text>
                    </View>
                    <View style={styles.memberText}>
                      <Text style={styles.strong}>{task.title}</Text>
                      <Text style={styles.muted}>
                        {taskStatusLabels[status]}
                        {task.dueAt ? ` · ${formatViDateTime(task.dueAt)}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
        </View>
      ))}
    </>
  );
}

export default memo(ProjectProgressTab);
