import type { Dispatch, SetStateAction } from "react";

import { ApiError } from "../services/api.ts";
import { clearAllReminders } from "../services/local.ts";
import type { MainView, ProjectTab } from "../types/index.ts";
import type { useCalendarEvents } from "./useCalendarEvents.ts";
import type { useChat } from "./useChat.ts";
import type { useGoogleSync } from "./useGoogleSync.ts";
import type { useProjectWorkspace } from "./useProjectWorkspace.ts";
import type { useProjects } from "./useProjects.ts";
import type { useReminders } from "./useReminders.ts";
import type { useTasks } from "./useTasks.ts";

type Options = {
  projectsController: ReturnType<typeof useProjects>;
  workspaceController: ReturnType<typeof useProjectWorkspace>;
  calendarController: ReturnType<typeof useCalendarEvents>;
  reminderController: ReturnType<typeof useReminders>;
  tasksController: ReturnType<typeof useTasks>;
  chatController: ReturnType<typeof useChat>;
  googleController: ReturnType<typeof useGoogleSync>;
  clearAuth: () => Promise<void>;
  setError: (message: string) => void;
  setMainView: Dispatch<SetStateAction<MainView>>;
  setTab: Dispatch<SetStateAction<ProjectTab>>;
  setDrawerVisible: Dispatch<SetStateAction<boolean>>;
};

export function useAppActions({
  projectsController,
  workspaceController,
  calendarController,
  reminderController,
  tasksController,
  chatController,
  googleController,
  clearAuth,
  setError,
  setMainView,
  setTab,
  setDrawerVisible,
}: Options) {
  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
    } catch (caught) {
      const currentProjectPath = workspaceController.projectRef.current
        ? `/projects/${workspaceController.projectRef.current._id}`
        : "";
      if (
        caught instanceof ApiError &&
        currentProjectPath &&
        ((caught.status === 403 &&
          caught.message === "project access denied") ||
          (caught.status === 404 && caught.path === currentProjectPath))
      ) {
        workspaceController.resetProjectWorkspace();
        chatController.setGroup(null);
        tasksController.setTasks([]);
        setDrawerVisible(false);
        setMainView("projects");
        void projectsController.loadProjects().catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const logout = async () => {
    chatController.resetChatState();
    workspaceController.resetProjectWorkspace();
    await googleController.disconnectGoogle();
    try {
      await clearAllReminders();
    } catch {
      /* Logout must still clear the local session. */
    }
    await clearAuth();
    projectsController.resetProjects();
    calendarController.resetCalendar();
    tasksController.resetTaskWorkspace();
    reminderController.resetReminders();
    setMainView("calendar");
  };

  const selectMainView = (view: MainView) => {
    setMainView(view);
    if (view === "calendar") void run(calendarController.loadCalendar);
    if (view === "projects") void run(projectsController.loadProjects);
    if (view === "messages")
      void run(chatController.loadDirectConversations);
  };

  const selectProjectTab = (nextTab: ProjectTab) => {
    calendarController.setPendingProjectEvent(null);
    setTab(nextTab);
    setDrawerVisible(false);
    if (nextTab === "chat") void run(chatController.ensureGroup);
  };

  return { run, logout, selectMainView, selectProjectTab };
}
