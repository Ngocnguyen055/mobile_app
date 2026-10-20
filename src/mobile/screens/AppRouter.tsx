import React from "react";
import { SafeAreaView, ScrollView, StatusBar } from "react-native";

import type {
  CalendarEvent,
  InboxNotification,
  User,
} from "../services/api.ts";
import CalendarPanel from "../components/calendar/CalendarPanel.tsx";
import NotificationsScreen from "./NotificationsScreen.tsx";
import BottomNav from "../components/ui/BottomNav.tsx";
import CalendarToolbar from "../components/ui/CalendarToolbar.tsx";
import ErrorBanner from "../components/ui/ErrorBanner.tsx";
import Header from "../components/ui/Header.tsx";
import ProjectToolbar from "../components/ui/ProjectToolbar.tsx";
import ChatToolbar from "../components/chat/ChatToolbar.tsx";
import DirectComposer from "../components/chat/DirectComposer.tsx";
import DirectInfoModal from "../components/chat/DirectInfoModal.tsx";
import type { useCalendarEvents } from "../hooks/useCalendarEvents.ts";
import type { useChat } from "../hooks/useChat.ts";
import type { useProjectWorkspace } from "../hooks/useProjectWorkspace.ts";
import type { useProjects } from "../hooks/useProjects.ts";
import type { useReminders } from "../hooks/useReminders.ts";
import type { useTasks } from "../hooks/useTasks.ts";
import { colors } from "../styles/theme.ts";
import type { MainView, ProjectTab } from "../types/index.ts";
import { styles } from "../styles/app.ts";
import AccountScreen from "./AccountScreen.tsx";
import MessagesScreen from "./MessagesScreen.tsx";
import ProjectDetailScreen from "./ProjectDetailScreen.tsx";
import ProjectListScreen from "./ProjectListScreen.tsx";

type Props = {
  user: User;
  mainView: MainView;
  tab: ProjectTab;
  drawerVisible: boolean;
  error: string;
  googleEmail: string;
  contentScroll: React.RefObject<ScrollView | null>;
  projectsController: ReturnType<typeof useProjects>;
  workspaceController: ReturnType<typeof useProjectWorkspace>;
  calendarController: ReturnType<typeof useCalendarEvents>;
  reminderController: ReturnType<typeof useReminders>;
  tasksController: ReturnType<typeof useTasks>;
  chatController: ReturnType<typeof useChat>;
  runAction: (action: () => Promise<unknown>) => void;
  onSelectMainView: (view: MainView) => void;
  onSelectProjectTab: (tab: ProjectTab) => void;
  onDrawerVisibleChange: (visible: boolean) => void;
  onClearError: () => void;
  onError: (message: string) => void;
  onOpenProject: (projectId: string) => Promise<unknown>;
  onProjectChanged: () => Promise<void>;
  onOpenCalendarEvent: (event: CalendarEvent) => Promise<void>;
  onOpenNotification: (notification: InboxNotification) => Promise<void>;
  onConnectGoogle: () => Promise<void>;
  onSyncGoogle: () => Promise<void>;
  onLogout: () => Promise<void>;
};

export default function AppRouter({
  user,
  mainView,
  tab,
  drawerVisible,
  error,
  googleEmail,
  contentScroll,
  projectsController,
  workspaceController,
  calendarController,
  reminderController,
  tasksController,
  chatController,
  runAction,
  onSelectMainView,
  onSelectProjectTab,
  onDrawerVisibleChange,
  onClearError,
  onError,
  onOpenProject,
  onProjectChanged,
  onOpenCalendarEvent,
  onOpenNotification,
  onConnectGoogle,
  onSyncGoogle,
  onLogout,
}: Props) {
  const projectListScreen = (
    <ProjectListScreen
      projects={projectsController.projects}
      search={projectsController.projectSearch}
      page={projectsController.projectPage}
      createVisible={projectsController.projectCreateVisible}
      creating={projectsController.projectCreating}
      projectName={projectsController.projectName}
      projectKind={projectsController.projectKind}
      error={error}
      onOpenCreate={() => {
        onClearError();
        projectsController.setProjectCreateVisible(true);
      }}
      onCloseCreate={() => projectsController.setProjectCreateVisible(false)}
      onSearchChange={(value) => {
        projectsController.setProjectSearch(value);
        projectsController.setProjectPage(0);
      }}
      onPageChange={projectsController.setProjectPage}
      onProjectNameChange={projectsController.setProjectName}
      onProjectKindChange={projectsController.setProjectKind}
      onRefresh={() => runAction(projectsController.loadProjects)}
      onOpenProject={(projectId) => runAction(() => onOpenProject(projectId))}
      onCreateProject={() => runAction(projectsController.createProject)}
    />
  );

  const handleContentSizeChange = (_width: number, _height: number) => {
    if (mainView === "messages" && chatController.directContact)
      contentScroll.current?.scrollToEnd({ animated: true });
  };

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <Header
        userName={user.name}
        notificationsActive={mainView === "notifications"}
        onOpenNotifications={() => onSelectMainView("notifications")}
      />
      {mainView === "calendar" && (
        <CalendarToolbar
          scope={calendarController.calendarScope}
          onScopeChange={calendarController.setCalendarScope}
        />
      )}
      {mainView === "project" && workspaceController.project && (
        <ProjectToolbar
          project={workspaceController.project}
          tab={tab}
          drawerVisible={drawerVisible}
          onOpenDrawer={() => onDrawerVisibleChange(true)}
          onCloseDrawer={() => onDrawerVisibleChange(false)}
          onBack={() => {
            onDrawerVisibleChange(false);
            calendarController.setPendingProjectEvent(null);
            onSelectMainView("projects");
          }}
          onSelectTab={onSelectProjectTab}
        />
      )}
      {mainView === "messages" && (
        <ChatToolbar
          contact={chatController.directContact}
          online={
            !!chatController.directContact &&
            chatController.online.includes(chatController.directContact.id)
          }
          blocked={
            !!chatController.directContact &&
            chatController.blockedPeerIds.includes(
              chatController.directContact.id,
            )
          }
          onBack={chatController.closeDirectConversation}
          onOpenInfo={() => chatController.setDirectInfoVisible(true)}
        />
      )}
      {mainView === "messages" && chatController.directContact && (
        <DirectInfoModal
          contact={chatController.directContact}
          currentUserId={user._id}
          messages={chatController.directMessages}
          visible={chatController.directInfoVisible}
          blocked={chatController.blockedPeerIds.includes(
            chatController.directContact.id,
          )}
          onClose={() => chatController.setDirectInfoVisible(false)}
          onDownload={(attachment) =>
            runAction(() => chatController.downloadChatAttachment(attachment))
          }
          onToggleBlock={() =>
            chatController.confirmChangeDirectBlock(
              chatController.directContact!,
            )
          }
          onDeleteConversation={() =>
            chatController.confirmDeleteDirectConversation(
              chatController.directContact!,
            )
          }
        />
      )}
      <ScrollView
        ref={contentScroll}
        key={`${mainView}-${mainView === "project" ? tab : ""}-${mainView === "messages" ? chatController.directContact?.id || "contacts" : ""}`}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={handleContentSizeChange}
      >
        <ErrorBanner message={error} onDismiss={onClearError} />
        {mainView === "calendar" && (
          <CalendarPanel
            scope={calendarController.calendarScope}
            tasks={calendarController.calendarTasks}
            events={calendarController.calendarEvents}
            projects={projectsController.projects}
            defaultReminderOffsets={reminderController.offsets}
            onSaveEvent={calendarController.saveCalendarEvent}
            onDeleteEvent={calendarController.deleteCalendarEvent}
            onOpenTask={(task) =>
              runAction(() => tasksController.openTaskFromCalendar(task))
            }
            onOpenProjectEvent={(event) =>
              runAction(() => onOpenCalendarEvent(event))
            }
            onDeleteTask={tasksController.deleteTask}
            onError={onError}
          />
        )}
        {mainView === "projects" && projectListScreen}
        {mainView === "project" &&
          (workspaceController.project ? (
            <ProjectDetailScreen
              project={workspaceController.project}
              projects={projectsController.projects}
              tab={tab}
              currentUserId={user._id}
              events={workspaceController.events}
              discussions={workspaceController.discussions}
              documents={workspaceController.documents}
              progress={workspaceController.progress}
              resourceValues={workspaceController.resourceValues}
              pendingProjectEvent={calendarController.pendingProjectEvent}
              reminderOffsets={reminderController.offsets}
              error={error}
              tasksController={tasksController}
              chatController={chatController}
              runAction={runAction}
              onClearPendingEvent={() =>
                calendarController.setPendingProjectEvent(null)
              }
              onSaveCalendarEvent={calendarController.saveCalendarEvent}
              onDeleteCalendarEvent={calendarController.deleteCalendarEvent}
              onProjectChanged={onProjectChanged}
              onDownloadDocument={workspaceController.downloadDocument}
              onOpenProject={onOpenProject}
              onResourceValueChange={workspaceController.setResourceValue}
              onSaveResources={workspaceController.saveResources}
              onError={onError}
            />
          ) : (
            projectListScreen
          ))}
        {mainView === "messages" && (
          <MessagesScreen
            currentUserId={user._id}
            contacts={chatController.chatContacts}
            contactsLoading={chatController.chatContactsLoading}
            search={chatController.chatSearch}
            searchResults={chatController.chatSearchResults}
            searching={chatController.chatSearching}
            blockedPeerIds={chatController.blockedPeerIds}
            onlineUserIds={chatController.online}
            selectedContact={chatController.directContact}
            messages={chatController.messages}
            selectedMessages={chatController.directMessages}
            opening={chatController.directOpening}
            modes={chatController.modes}
            forceRelay={chatController.forceRelay}
            onSearchChange={(value) => {
              chatController.setChatSearch(value);
              if (!value.trim()) chatController.setChatSearchResults([]);
            }}
            onSearch={() => runAction(chatController.searchDirectUsers)}
            onRefreshContacts={() =>
              runAction(chatController.loadDirectConversations)
            }
            onOpenContact={(contact) =>
              runAction(() => chatController.openDirectConversation(contact))
            }
            onShowContactActions={chatController.showDirectConversationActions}
            onDownloadAttachment={(attachment) =>
              runAction(() => chatController.downloadChatAttachment(attachment))
            }
            onToggleForceRelay={() => {
              const forceRelay = !chatController.forceRelay;
              chatController.setForceRelay(forceRelay);
              if (chatController.peer.current)
                chatController.peer.current.forceRelay = forceRelay;
            }}
          />
        )}
        {mainView === "account" && (
          <AccountScreen
            user={user}
            reminderOffset={reminderController.offsets[0] ?? 0}
            googleEmail={googleEmail}
            onReminderChange={(value) =>
              runAction(() => reminderController.setReminderPreference(value))
            }
            onConnectGoogle={() => runAction(onConnectGoogle)}
            onSyncGoogle={() => runAction(onSyncGoogle)}
            onLogout={() => runAction(onLogout)}
          />
        )}
        {mainView === "notifications" && (
          <NotificationsScreen onOpen={onOpenNotification} onError={onError} />
        )}
      </ScrollView>
      {mainView === "messages" && chatController.directContact && (
        <DirectComposer
          contact={chatController.directContact}
          body={chatController.directMessageBody}
          online={chatController.online.includes(
            chatController.directContact.id,
          )}
          blocked={chatController.blockedPeerIds.includes(
            chatController.directContact.id,
          )}
          sending={chatController.directSending}
          uploading={chatController.directUploading}
          onBodyChange={chatController.setDirectMessageBody}
          onSend={() => runAction(chatController.sendDirectMessage)}
          onAttach={() =>
            runAction(chatController.pickAndSendDirectAttachments)
          }
        />
      )}
      <BottomNav currentView={mainView} onSelect={onSelectMainView} />
    </SafeAreaView>
  );
}
