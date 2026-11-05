import { calendarProjectId } from "../domain/calendarPolicy.ts";
import { listProjects } from "../services/api.ts";
import type { CalendarEvent, InboxNotification } from "../types/api.ts";
import type { ProjectTab } from "../types/index.ts";
import type { useCalendarEvents } from "./useCalendarEvents.ts";
import type { useChat } from "./useChat.ts";
import type { useProjectWorkspace } from "./useProjectWorkspace.ts";
import type { useProjects } from "./useProjects.ts";
import type { useTasks } from "./useTasks.ts";

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
      listProjects(),
      calendarController.loadCalendar(),
    ]);
    projectsController.setProjectRows(projectRows);
    return feed;
  };

  const loadProject = async (projectId: string, open = true) => {
    const loaded = await workspaceController.loadProjectWorkspace(projectId);
    tasksController.setTasks(loaded.tasks);
    if (open) chatController.closeProjectGroupConversation();
    chatController.setProjectGroups(loaded.chatGroups);
    if (open) {
      tasksController.resetTaskWorkspace();
      onSelectProjectTab(
        loaded.project.kind === "hierarchical" &&
          !loaded.project.parentProject
          ? "overview"
          : "tasks",
      );
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
    await chatController.ensureGroup();
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
    const loaded = await loadProject(notification.project._id);
    const hierarchyRoot =
      loaded.kind === "hierarchical" && !loaded.parentProject;
    onSelectProjectTab(
      notification.type.includes("discussion") ||
        notification.type.includes("comment")
        ? "discussion"
        : notification.type.includes("member")
          ? "members"
          : hierarchyRoot
            ? "overview"
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
