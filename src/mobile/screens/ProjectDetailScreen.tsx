import React, { useState } from "react";

import type {
  CalendarEvent,
  Discussion,
  DocumentRow,
  Progress,
  Project,
} from "../services/api.ts";
import CalendarPanel from "../components/calendar/CalendarPanel.tsx";
import DiscussionPanel from "../components/discussion/DiscussionPanel.tsx";
import ProjectManagementPanel from "../components/projects/ProjectManagementPanel.tsx";
import ProjectChatTab from "../components/projects/ProjectChatTab.tsx";
import ProjectProgressTab from "../components/projects/ProjectProgressTab.tsx";
import ProjectResourcesTab from "../components/projects/ProjectResourcesTab.tsx";
import ProjectTasksTab from "../components/projects/ProjectTasksTab.tsx";
import type { useChat } from "../hooks/useChat.ts";
import type { useTasks } from "../hooks/useTasks.ts";
import type { ReminderOffset } from "../services/local.ts";
import { groupTasksByAssignee } from "../utils/taskGroups.ts";
import type { ProjectTab } from "../types/index.ts";

type TaskController = ReturnType<typeof useTasks>;
type ChatController = ReturnType<typeof useChat>;

type Props = {
  project: Project;
  projects: Project[];
  tab: ProjectTab;
  currentUserId: string;
  events: CalendarEvent[];
  discussions: Discussion[];
  documents: DocumentRow[];
  progress: Progress | null;
  resourceValues: string[];
  pendingProjectEvent: CalendarEvent | null;
  reminderOffsets: ReminderOffset[];
  error: string;
  tasksController: TaskController;
  chatController: ChatController;
  runAction: (action: () => Promise<unknown>) => void;
  onClearPendingEvent: () => void;
  onSaveCalendarEvent: React.ComponentProps<
    typeof CalendarPanel
  >["onSaveEvent"];
  onDeleteCalendarEvent: React.ComponentProps<
    typeof CalendarPanel
  >["onDeleteEvent"];
  onProjectChanged: () => Promise<void>;
  onDownloadDocument: (document: DocumentRow) => Promise<void>;
  onOpenProject: (projectId: string) => Promise<unknown>;
  onResourceValueChange: (index: number, value: string) => void;
  onSaveResources: () => Promise<void>;
  onError: (message: string) => void;
};

export default function ProjectDetailScreen({
  project,
  projects,
  tab,
  currentUserId,
  events,
  discussions,
  documents,
  progress,
  resourceValues,
  pendingProjectEvent,
  reminderOffsets,
  error,
  tasksController,
  chatController,
  runAction,
  onClearPendingEvent,
  onSaveCalendarEvent,
  onDeleteCalendarEvent,
  onProjectChanged,
  onDownloadDocument,
  onOpenProject,
  onResourceValueChange,
  onSaveResources,
  onError,
}: Props) {
  const [expandedPeople, setExpandedPeople] = useState<Record<string, boolean>>(
    {},
  );
  const members = project.members.map((member) =>
    typeof member === "string"
      ? { _id: member, name: member, email: "" }
      : member,
  );
  const taskGroups = groupTasksByAssignee(
    tasksController.tasks,
    members,
    currentUserId,
  );

  if (tab === "tasks") {
    return (
      <ProjectTasksTab
        project={project}
        tasks={tasksController.tasks}
        groups={taskGroups}
        members={members}
        currentUserId={currentUserId}
        expandedGroups={tasksController.expandedTaskGroups}
        focusedTaskId={tasksController.focusedTaskId}
        editor={{
          visible: tasksController.taskEditorVisible,
          saving: tasksController.taskSaving,
          error,
          editTask: tasksController.editTask,
          title: tasksController.taskTitle,
          description: tasksController.taskDescription,
          startsAt: tasksController.taskStartsAt,
          dueAt: tasksController.taskDue,
          assigneeId: tasksController.taskAssignee,
        }}
        onBeginTask={tasksController.beginNewTask}
        onToggleGroup={(group) =>
          tasksController.setExpandedTaskGroups((current) => ({
            ...current,
            [group.key]: !(current[group.key] ?? group.isCurrentUser),
          }))
        }
        onGroupLayout={tasksController.onGroupLayout}
        onGroupBodyLayout={tasksController.onGroupBodyLayout}
        onTaskLayout={tasksController.onTaskLayout}
        onChangeStatus={(task, status) =>
          runAction(() => tasksController.changeStatus(task, status))
        }
        onEditTask={tasksController.selectTask}
        onDeleteTask={(task) =>
          runAction(() => tasksController.deleteTask(task))
        }
        onTaskTitleChange={tasksController.setTaskTitle}
        onTaskDescriptionChange={tasksController.setTaskDescription}
        onTaskStartsAtChange={tasksController.setTaskStartsAt}
        onTaskDueAtChange={tasksController.setTaskDue}
        onTaskAssigneeChange={tasksController.setTaskAssignee}
        onCloseEditor={tasksController.closeTaskEditor}
        onSaveTask={() => runAction(tasksController.saveTask)}
      />
    );
  }

  if (tab === "calendar") {
    return (
      <CalendarPanel
        tasks={tasksController.tasks}
        events={events}
        projects={projects}
        fixedProjectId={project._id}
        initialEvent={pendingProjectEvent}
        defaultReminderOffsets={reminderOffsets}
        onSaveEvent={onSaveCalendarEvent}
        onDeleteEvent={onDeleteCalendarEvent}
        onOpenTask={tasksController.selectTask}
        onDeleteTask={tasksController.deleteTask}
        onInitialEventHandled={onClearPendingEvent}
        onError={onError}
        readOnly={project.archived}
        canManageTasks={project.permissions.manageTasks}
        canManageEvents={project.permissions.manageTasks}
      />
    );
  }

  if (tab === "progress") {
    return (
      <ProjectProgressTab
        progress={progress}
        tasks={tasksController.tasks}
        members={members}
        currentUserId={currentUserId}
        expandedPeople={expandedPeople}
        onTogglePerson={(userId) =>
          setExpandedPeople((current) => ({
            ...current,
            [userId]: !current[userId],
          }))
        }
        onOpenProject={(projectId) =>
          runAction(() => onOpenProject(projectId))
        }
        onOpenTask={(task) =>
          runAction(() => tasksController.openTaskInList(task))
        }
      />
    );
  }

  if (tab === "chat") {
    return (
      <ProjectChatTab
        group={chatController.group}
        onlineUserIds={chatController.online}
        members={members}
        currentUserId={currentUserId}
        messages={chatController.messages}
        modes={chatController.modes}
        messageBody={chatController.messageBody}
        logs={chatController.logs}
        forceRelay={chatController.forceRelay}
        readOnly={project.archived}
        onRefreshGroup={() => runAction(chatController.ensureGroup)}
        onToggleForceRelay={() => {
          const forceRelay = !chatController.forceRelay;
          chatController.setForceRelay(forceRelay);
          if (chatController.peer.current)
            chatController.peer.current.forceRelay = forceRelay;
        }}
        onMessageBodyChange={chatController.setMessageBody}
        onSend={() => runAction(chatController.sendChat)}
      />
    );
  }

  if (tab === "discussion") {
    return (
      <DiscussionPanel
        key={project._id}
        project={project}
        userId={currentUserId}
        posts={discussions}
        legacyDocuments={documents}
        onChanged={onProjectChanged}
        onDownload={onDownloadDocument}
        onError={onError}
      />
    );
  }

  if (tab === "resources") {
    return (
      <ProjectResourcesTab
        project={project}
        values={resourceValues}
        onValueChange={onResourceValueChange}
        onSave={() => runAction(onSaveResources)}
      />
    );
  }

  return (
    <ProjectManagementPanel
      key={`${project._id}-${tab}`}
      project={project}
      section={tab === "members" ? "members" : "management"}
      onChanged={onProjectChanged}
      onOpenProject={(projectId) => runAction(() => onOpenProject(projectId))}
      onError={onError}
    />
  );
}
