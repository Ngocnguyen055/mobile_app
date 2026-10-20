import {
  api,
  type CalendarEvent,
  type InboxNotification,
  type Project,
} from "../services/api.ts";
import { calendarProjectId } from "../domain/calendarPolicy.ts";
import type { useCalendarEvents } from "./useCalendarEvents.ts";
import type { useChat } from "./useChat.ts";
import type { useProjectWorkspace } from "./useProjectWorkspace.ts";
import type { useProjects } from "./useProjects.ts";
import type { useTasks } from "./useTasks.ts";
import type { ProjectTab } from "../types/index.ts";

type Options = {
  projectsController: ReturnType<typeof useProjects>;
  workspaceController: ReturnType<typeof useProjectWorkspace>;
  calendarController: ReturnType<typeof useCalendarEvents>;
  tasksController: ReturnType<typeof useTasks>;
  chatController: ReturnType<typeof useChat>;
  onOpenProjectView: () => void;
  onSelectProjectTab: (tab: ProjectTab) => void;
};

export function useProjectCoordinator({
  projectsController,
  workspaceController,
  calendarController,
  tasksController,
  chatController,
  onOpenProjectView,
  onSelectProjectTab,
}: Options) {
  const loadHome = async () => {
    const [projectRows, feed] = await Promise.all([
      api<Project[]>("/projects"),
      calendarController.loadCalendar(),
    ]);
    projectsController.setProjectRows(projectRows);
    return feed;
  };

  const loadProject = async (projectId: string, open = true) => {
    const loaded = await workspaceController.loadProjectWorkspace(projectId);
    tasksController.setTasks(loaded.tasks);
    chatController.setGroup(
      chatController.peer.current
        ?.getGroups()
        .find((group) => group.id === loaded.project.chatGroupId) || null,
    );
    if (open) {
      tasksController.resetTaskWorkspace();
      onOpenProjectView();
    }
    return loaded.project;
  };

  const projectChanged = async () => {
    if (!workspaceController.projectRef.current) return;
    await Promise.all([
      loadProject(workspaceController.projectRef.current._id, false),
      projectsController.loadProjects(),
      calendarController.loadCalendar(),
    ]);
    if (chatController.peer.current) await chatController.ensureGroup();
  };

  const openEventFromCalendar = async (event: CalendarEvent) => {
    const projectId = calendarProjectId(event.project);
    if (!projectId) throw new Error("Sự kiện không còn thuộc dự án hợp lệ.");
    await loadProject(projectId);
    calendarController.setPendingProjectEvent(event);
    onSelectProjectTab("calendar");
  };

  const openNotification = async (notification: InboxNotification) => {
    if (!notification.project) return;
    await loadProject(notification.project._id);
    onSelectProjectTab(
      notification.type.includes("discussion") ||
        notification.type.includes("comment")
        ? "discussion"
        : notification.type.includes("member")
          ? "members"
          : "tasks",
    );
  };

  return {
    loadHome,
    loadProject,
    projectChanged,
    openEventFromCalendar,
    openNotification,
  };
}
