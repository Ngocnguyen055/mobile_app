import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Project, Task, User } from "../../services/api.ts";
import { styles } from "../../styles/app.ts";
import type { TaskAssigneeGroup } from "../../utils/taskGroups.ts";
import TaskEditor from "../tasks/TaskEditor.tsx";
import TaskGroup from "../tasks/TaskGroup.tsx";

type ProjectTasksTabProps = {
  project: Project;
  tasks: Task[];
  groups: TaskAssigneeGroup[];
  members: User[];
  currentUserId: string;
  expandedGroups: Record<string, boolean>;
  focusedTaskId: string;
  editor: {
    visible: boolean;
    saving: boolean;
    error: string;
    editTask: Task | null;
    title: string;
    description: string;
    startsAt: string;
    dueAt: string;
    assigneeId: string;
  };
  onBeginTask: () => void;
  onToggleGroup: (group: TaskAssigneeGroup) => void;
  onGroupLayout: (groupKey: string, y: number) => void;
  onGroupBodyLayout: (groupKey: string, y: number) => void;
  onTaskLayout: (taskId: string, y: number) => void;
  onChangeStatus: (task: Task, status: Task["status"]) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onTaskTitleChange: (value: string) => void;
  onTaskDescriptionChange: (value: string) => void;
  onTaskStartsAtChange: (value: string) => void;
  onTaskDueAtChange: (value: string) => void;
  onTaskAssigneeChange: (value: string) => void;
  onCloseEditor: () => void;
  onSaveTask: () => void;
};

function ProjectTasksTab({
  project,
  tasks,
  groups,
  members,
  currentUserId,
  expandedGroups,
  focusedTaskId,
  editor,
  onBeginTask,
  onToggleGroup,
  onGroupLayout,
  onGroupBodyLayout,
  onTaskLayout,
  onChangeStatus,
  onEditTask,
  onDeleteTask,
  onTaskTitleChange,
  onTaskDescriptionChange,
  onTaskStartsAtChange,
  onTaskDueAtChange,
  onTaskAssigneeChange,
  onCloseEditor,
  onSaveTask,
}: ProjectTasksTabProps) {
  return (
    <>
      {!project.archived && project.permissions.manageTasks && (
        <Pressable
          accessibilityRole="button"
          onPress={onBeginTask}
          style={({ pressed }) => [
            styles.topCreateButton,
            pressed && styles.cardPressed,
          ]}
        >
          <Text style={styles.topCreateIcon}>＋</Text>
          <Text style={styles.topCreateText}>Tạo task</Text>
        </Pressable>
      )}
      <View style={styles.taskListTitleRow}>
        <Text style={styles.heading}>Công việc</Text>
        <View style={styles.taskCountBadge}>
          <Text style={styles.taskCountText}>{tasks.length} task</Text>
        </View>
      </View>
      {!tasks.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.strong}>Chưa có công việc</Text>
          <Text style={styles.muted}>
            Task mới sẽ được gom theo người phụ trách tại đây.
          </Text>
        </View>
      )}
      {groups.map((group) => (
        <TaskGroup
          key={group.key}
          group={group}
          project={project}
          currentUserId={currentUserId}
          expanded={expandedGroups[group.key] ?? group.isCurrentUser}
          focusedTaskId={focusedTaskId}
          onToggle={() => onToggleGroup(group)}
          onGroupLayout={onGroupLayout}
          onBodyLayout={onGroupBodyLayout}
          onTaskLayout={onTaskLayout}
          onChangeStatus={onChangeStatus}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
        />
      ))}
      <TaskEditor
        visible={editor.visible}
        saving={editor.saving}
        error={editor.error}
        editTask={editor.editTask}
        title={editor.title}
        description={editor.description}
        startsAt={editor.startsAt}
        dueAt={editor.dueAt}
        assigneeId={editor.assigneeId}
        members={members}
        currentUserId={currentUserId}
        onTitleChange={onTaskTitleChange}
        onDescriptionChange={onTaskDescriptionChange}
        onStartsAtChange={onTaskStartsAtChange}
        onDueAtChange={onTaskDueAtChange}
        onAssigneeChange={onTaskAssigneeChange}
        onClose={onCloseEditor}
        onSave={onSaveTask}
      />
    </>
  );
}

export default memo(ProjectTasksTab);
