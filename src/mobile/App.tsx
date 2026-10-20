import React, { useRef, useState } from "react";
import { ScrollView } from "react-native";
import * as Notifications from "expo-notifications";
import {
  reconcileEventReminders,
  reconcileReminders,
} from "./services/local.ts";
import AuthScreen from "./screens/AuthScreen.tsx";
import {
  type MainView,
  type ProjectTab,
} from "./types/index.ts";
import AppRouter from "./screens/AppRouter.tsx";
import { useChat } from "./hooks/useChat.ts";
import { useAuth } from "./hooks/useAuth.ts";
import { useReminders } from "./hooks/useReminders.ts";
import { useTasks } from "./hooks/useTasks.ts";
import { useCalendarEvents } from "./hooks/useCalendarEvents.ts";
import { useProjects } from "./hooks/useProjects.ts";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace.ts";
import { useProjectCoordinator } from "./hooks/useProjectCoordinator.ts";
import { useGoogleSync } from "./hooks/useGoogleSync.ts";
import { useAppLifecycle } from "./hooks/useAppLifecycle.ts";
import { useAppActions } from "./hooks/useAppActions.ts";
import LoadingScreen from "./components/ui/LoadingScreen.tsx";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [error, setError] = useState("");
  const [mainView, setMainView] = useState<MainView>("calendar");
  const { user, loading, authMode, setAuthMode, auth, clearAuth } = useAuth({
    onAuthenticated: () => setMainView("calendar"),
  });

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [tab, setTab] = useState<ProjectTab>("tasks");

  const projectsController = useProjects({
    onOpenProject: (projectId) => loadProject(projectId),
  });
  const workspaceController = useProjectWorkspace({
    onReloadProject: (projectId) => loadProject(projectId, false),
  });
  const { project, projectRef } = workspaceController;
  const calendarController = useCalendarEvents({
    projectId: project?._id,
    onError: setError,
    onReloadProject: (projectId) => loadProject(projectId, false),
  });
  const { loadCalendar } = calendarController;
  const reminderController = useReminders({
    userId: user?._id,
    onError: setError,
    onRefresh: async (preferences) => {
      if (!user) return;
      const feed = await loadCalendar();
      await reconcileReminders(feed.tasks, user._id, preferences);
      await reconcileEventReminders(feed.events);
    },
  });
  const { offsets } = reminderController;

  const contentScroll = useRef<ScrollView | null>(null);
  const tasksController = useTasks({
    project,
    projectRef,
    currentUserId: user?._id,
    reminderOffsets: offsets,
    contentScroll,
    onError: setError,
    onTabChange: setTab,
    onReloadProject: (projectId, open) => loadProject(projectId, open),
    onReloadCalendar: () => loadCalendar(),
  });
  const chatController = useChat({ user, projectRef, onError: setError });
  const projectCoordinator = useProjectCoordinator({
    projectsController,
    workspaceController,
    calendarController,
    tasksController,
    chatController,
    onOpenProjectView: () => setMainView("project"),
    onSelectProjectTab: setTab,
  });
  const {
    loadProject,
    projectChanged,
    openEventFromCalendar,
    openNotification,
  } = projectCoordinator;
  const googleController = useGoogleSync({
    userId: user?._id,
    loadCalendar,
  });
  const { run, logout, selectMainView, selectProjectTab } = useAppActions({
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
  });

  useAppLifecycle({
    user,
    mainView,
    tab,
    projectId: project?._id,
    chatController,
    projectCoordinator,
    runAction: (action) => void run(action),
    onError: setError,
  });

  if (loading) return <LoadingScreen />;
  if (!user)
    return (
      <AuthScreen
        mode={authMode}
        error={error}
        onClearError={() => setError("")}
        onModeChange={setAuthMode}
        onSubmit={(credentials) =>
          run(() => auth({ mode: authMode, ...credentials }))
        }
      />
    );

  return (
    <AppRouter
      user={user}
      mainView={mainView}
      tab={tab}
      drawerVisible={drawerVisible}
      error={error}
      googleEmail={googleController.googleEmail}
      contentScroll={contentScroll}
      projectsController={projectsController}
      workspaceController={workspaceController}
      calendarController={calendarController}
      reminderController={reminderController}
      tasksController={tasksController}
      chatController={chatController}
      runAction={(action) => void run(action)}
      onSelectMainView={selectMainView}
      onSelectProjectTab={selectProjectTab}
      onDrawerVisibleChange={setDrawerVisible}
      onClearError={() => setError("")}
      onError={setError}
      onOpenProject={(projectId) => loadProject(projectId)}
      onProjectChanged={projectChanged}
      onOpenCalendarEvent={openEventFromCalendar}
      onOpenNotification={openNotification}
      onConnectGoogle={googleController.connectGoogle}
      onSyncGoogle={googleController.syncGoogle}
      onLogout={logout}
    />
  );
}
