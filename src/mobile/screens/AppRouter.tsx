import React from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  CalendarEvent,
  InboxNotification,
  User,
} from "../services/api.ts";
import type { ChatGroup } from "../domain/chat.ts";
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

type GroupComposerProps = {
  group: ChatGroup;
  body: string;
  uploading: boolean;
  onBodyChange: (value: string) => void;
  onSend: () => void;
  onAttach: () => void;
};

function GroupComposer({
  group,
  body,
  uploading,
  onBodyChange,
  onSend,
  onAttach,
}: GroupComposerProps) {
  const canSend = !!body.trim() && !uploading;
  return (
    <View style={styles.chatComposer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gửi ảnh hoặc tệp vào nhóm"
        disabled={uploading}
        onPress={onAttach}
        style={[styles.chatAttachmentButton, uploading && styles.disabled]}
      >
        <Text style={styles.chatAttachmentButtonText}>
          {uploading ? "…" : "+"}
        </Text>
      </Pressable>
      <TextInput
        accessibilityLabel={`Tin nhắn gửi nhóm ${group.name}`}
        editable={!uploading}
        maxLength={4000}
        multiline
        onChangeText={onBodyChange}
        placeholder="Nhắn tin"
        placeholderTextColor={colors.textSoft}
        style={styles.chatComposerInput}
        value={body}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gửi tin nhắn nhóm"
        disabled={!canSend}
        onPress={onSend}
        style={[styles.chatSendButton, !canSend && styles.disabled]}
      >
        <Text style={styles.buttonText}>Gửi</Text>
      </Pressable>
    </View>
  );
}

type Props = {
  user: User;
  mainView: MainView;
  tab: ProjectTab;
  drawerVisible: boolean;
  error: string;
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
  onLogout: () => Promise<void>;
};

export default function AppRouter({
  user,
  mainView,
  tab,
  drawerVisible,
  error,
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
  onLogout,
}: Props) {
  const projectListScreen = (
    <ProjectListScreen
      projects={projectsController.projects}
      currentUserId={user._id}
      search={projectsController.projectSearch}
      ownershipFilter={projectsController.projectOwnershipFilter}
      dateFilter={projectsController.projectDateFilter}
      dateAnchor={projectsController.projectDateAnchor}
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
      onOwnershipFilterChange={(value) => {
        projectsController.setProjectOwnershipFilter(value);
        projectsController.setProjectPage(0);
      }}
      onDateFilterChange={(filter, anchor) => {
        projectsController.setProjectDateFilter(filter);
        projectsController.setProjectDateAnchor(anchor);
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
    if (
      (mainView === "messages" && chatController.directContact) ||
      (mainView === "project" &&
        tab === "chat" &&
        chatController.groupConversationOpen)
    )
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
          onOpenParent={() => {
            onDrawerVisibleChange(false);
            void onOpenProject(workspaceController.project!.rootProject);
          }}
          onSelectTab={onSelectProjectTab}
        />
      )}
      {mainView === "messages" && (
        <ChatToolbar
          contact={chatController.directContact}
          refreshing={chatController.directOpening}
          blocked={
            !!chatController.directContact &&
            chatController.blockedUserIds.includes(
              chatController.directContact.id,
            )
          }
          onBack={chatController.closeDirectConversation}
          onRefresh={() => {
            if (chatController.directContact)
              runAction(() =>
                chatController.openDirectConversation(
                  chatController.directContact!,
                ),
              );
          }}
          onOpenInfo={() => chatController.setDirectInfoVisible(true)}
        />
      )}
      {mainView === "messages" && chatController.directContact && (
        <DirectInfoModal
          contact={chatController.directContact}
          currentUserId={user._id}
          messages={chatController.directMessages}
          visible={chatController.directInfoVisible}
          blocked={chatController.blockedUserIds.includes(
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
              onSelectProjectTab={onSelectProjectTab}
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
            blockedUserIds={chatController.blockedUserIds}
            selectedContact={chatController.directContact}
            messages={chatController.messages}
            selectedMessages={chatController.directMessages}
            opening={chatController.directOpening}
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
          />
        )}
        {mainView === "account" && (
          <AccountScreen
            user={user}
            reminderOffset={reminderController.offsets[0] ?? 0}
            onReminderChange={(value) =>
              runAction(() => reminderController.setReminderPreference(value))
            }
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
          blocked={chatController.blockedUserIds.includes(
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
      {mainView === "project" &&
        tab === "chat" &&
        chatController.groupConversationOpen &&
        chatController.group &&
        !workspaceController.project?.archived && (
          <GroupComposer
            group={chatController.group}
            body={chatController.messageBody}
            uploading={chatController.groupUploading}
            onBodyChange={chatController.setMessageBody}
            onSend={() => runAction(chatController.sendChat)}
            onAttach={() =>
              runAction(chatController.pickAndSendGroupAttachments)
            }
          />
        )}
      <BottomNav currentView={mainView} onSelect={onSelectMainView} />
    </SafeAreaView>
  );
}
