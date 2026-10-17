import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RTCPeerConnection } from "react-native-webrtc";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  DirectChatService,
  PeerClient,
  isDirectMessageBetween,
  type PeerConfig,
  type Group,
  type StoredMessage,
} from "@ds01/shared";
import {
  API_URL,
  ApiError,
  api,
  getToken,
  json,
  loadChatContacts,
  restoreToken,
  setToken,
  type CalendarEvent,
  type CalendarFeed,
  type ChatContact,
  type Discussion,
  type DocumentRow,
  type Progress,
  type Project,
  type InboxNotification,
  type Task,
  type User,
} from "./api.ts";
import {
  MobileStore,
  REMINDER_CHANNEL_ID,
  REMINDER_OFFSETS,
  cancelEventReminder,
  cancelReminder,
  clearAllReminders,
  reconcileEventReminders,
  reconcileReminders,
  syncEventReminder,
  syncReminder,
  type ReminderOffset,
} from "./local.ts";
import {
  formatViDate,
  formatViDateTime,
  parseViDateTime,
  toViDateTimeInput,
} from "./calendar.ts";
import CalendarPanel, { type EventDraft } from "./CalendarPanel.tsx";
import NativeDateTimeField from "./NativeDateTimeField.tsx";
import {
  connectGoogle,
  disconnectGoogle,
  syncGoogleCalendar,
} from "./google.ts";
import {
  CALENDAR_SCOPE_OPTIONS,
  calendarProjectId,
  type CalendarScope,
} from "./calendarPolicy.ts";
import {
  canSendDirect,
  directMessageStatusLabel,
  directMessagesForContact,
} from "./directChatPolicy.ts";
import ProjectManagementPanel from "./ProjectManagementPanel.tsx";
import DiscussionPanel from "./DiscussionPanel.tsx";
import NotificationInbox from "./NotificationInbox.tsx";
import {
  canChangeTaskStatus,
  effectiveTaskStatus,
  roleLabels,
  taskStatusLabels,
} from "./projectPolicy.ts";
import AuthScreen, { type AuthMode } from "./AuthScreen.tsx";
import { cardShadow, colors } from "./theme.ts";
import ReminderSelect from "./ReminderSelect.tsx";
import {
  orderProjectsNewestFirst,
  projectPageCount as countProjectPages,
  projectsForPage,
} from "./projectList.ts";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type MainView =
  | "calendar"
  | "projects"
  | "project"
  | "messages"
  | "account"
  | "notifications";
type ProjectTab =
  | "tasks"
  | "calendar"
  | "progress"
  | "chat"
  | "discussion"
  | "resources"
  | "members"
  | "management";
const projectTabLabels: Record<ProjectTab, string> = {
  tasks: "Task",
  calendar: "Lịch",
  progress: "Tiến độ",
  chat: "Chat",
  discussion: "Thảo luận",
  resources: "Nguồn lực",
  members: "Thành viên",
  management: "Quản lý",
};
const defaultTaskRange = (selectedDay?: Date) => {
  if (selectedDay) {
    const day = formatViDate(selectedDay);
    return { startsAt: `${day} 09:00`, dueAt: `${day} 17:00` };
  }
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: toViDateTimeInput(start), dueAt: toViDateTimeInput(end) };
};

const userIdOf = (person?: User | string) =>
  typeof person === "string" ? person : person?._id || person?.id || "";
const parsedDateOrUndefined = (value: string) => {
  try {
    return parseViDateTime(value);
  } catch {
    return undefined;
  }
};
const button = (
  label: string,
  action: () => void,
  disabled = false,
  secondary = false,
) => (
  <Pressable
    accessibilityRole="button"
    onPress={action}
    disabled={disabled}
    style={[
      styles.button,
      secondary && styles.secondaryButton,
      disabled && styles.disabled,
    ]}
  >
    <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
      {label}
    </Text>
  </Pressable>
);
const field = (
  value: string,
  set: (value: string) => void,
  placeholder: string,
  multiline = false,
  editable = true,
) => (
  <TextInput
    style={[styles.input, multiline && styles.multiline]}
    value={value}
    onChangeText={set}
    placeholder={placeholder}
    placeholderTextColor="#64748b"
    multiline={multiline}
    textAlignVertical={multiline ? "top" : "center"}
    autoCapitalize="sentences"
    editable={editable}
  />
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [mainView, setMainView] = useState<MainView>("calendar");

  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectKind, setProjectKind] =
    useState<Project["kind"]>("independent");
  const [projectPage, setProjectPage] = useState(0);
  const [projectCreateVisible, setProjectCreateVisible] = useState(false);
  const [projectCreating, setProjectCreating] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [expandedProgress, setExpandedProgress] = useState<
    Record<string, boolean>
  >({});
  const [calendarTasks, setCalendarTasks] = useState<Task[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarScope, setCalendarScope] = useState<CalendarScope>("all");
  const [pendingProjectEvent, setPendingProjectEvent] =
    useState<CalendarEvent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [tab, setTab] = useState<ProjectTab>("tasks");

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStartsAt, setTaskStartsAt] = useState(
    () => defaultTaskRange().startsAt,
  );
  const [taskDue, setTaskDue] = useState(() => defaultTaskRange().dueAt);
  const [taskAssignee, setTaskAssignee] = useState("");
  const [resourceValues, setResourceValues] = useState(["0", "0", "0", "0"]);
  const [offsets, setOffsets] = useState<ReminderOffset[]>([0]);
  const [googleEmail, setGoogleEmail] = useState("");
  const [notificationsReady, setNotificationsReady] = useState(false);

  const [online, setOnline] = useState<string[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [modes, setModes] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [forceRelay, setForceRelay] = useState(false);
  const [chatContacts, setChatContacts] = useState<ChatContact[]>([]);
  const [chatContactsLoading, setChatContactsLoading] = useState(false);
  const [directContact, setDirectContact] = useState<ChatContact | null>(null);
  const [directMessages, setDirectMessages] = useState<StoredMessage[]>([]);
  const [directMessageBody, setDirectMessageBody] = useState("");
  const [directOpening, setDirectOpening] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const directSendingRef = useRef(false);
  const peer = useRef<PeerClient | null>(null);
  const peerConnect = useRef<Promise<void> | null>(null);
  const store = useRef<MobileStore | null>(null);
  const directChat = useRef<DirectChatService | null>(null);
  const directContactRef = useRef<ChatContact | null>(null);
  const directOpenRequest = useRef(0);
  const contentScroll = useRef<ScrollView | null>(null);
  const projectRef = useRef<Project | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (caught) {
      const currentProjectPath = projectRef.current
        ? `/projects/${projectRef.current._id}`
        : "";
      if (
        caught instanceof ApiError &&
        currentProjectPath &&
        ((caught.status === 403 &&
          caught.message === "project access denied") ||
          (caught.status === 404 && caught.path === currentProjectPath))
      ) {
        projectRef.current = null;
        setProject(null);
        setGroup(null);
        setTasks([]);
        setEvents([]);
        setDiscussions([]);
        setDocuments([]);
        setProgress(null);
        setDrawerVisible(false);
        setMainView("projects");
        void loadProjects().catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        if (await restoreToken()) {
          const me = await api<User>("/me");
          setUser(me);
          setMainView("calendar");
        }
        const saved = await SecureStore.getItemAsync("reminder-offsets");
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          const selected = Array.isArray(parsed)
            ? parsed.find((value): value is ReminderOffset =>
                REMINDER_OFFSETS.includes(value as ReminderOffset),
              )
            : undefined;
          setOffsets([selected ?? 0]);
        }
      } catch {
        await setToken("");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void run(loadHome);
    void prepareNotifications();
    void initializePeer(user, () => !active).catch((caught) => {
      if (active) setError(`Lịch sử chat: ${String(caught)}`);
    });
    return () => {
      active = false;
      directOpenRequest.current += 1;
      const currentPeer = peer.current;
      peer.current = null;
      currentPeer?.close();
      peerConnect.current = null;
      store.current = null;
      directChat.current = null;
      directContactRef.current = null;
    };
  }, [user?._id]);

  useEffect(() => {
    if (!user || !notificationsReady) return;
    const timer = setInterval(() => {
      void refreshReminders().catch((caught) =>
        setError(`Nhắc nhở: ${String(caught)}`),
      );
    }, 60_000);
    return () => clearInterval(timer);
  }, [user?._id, offsets, notificationsReady]);

  useEffect(() => {
    if (!user || mainView !== "project" || !project?._id) return;
    const id = project._id;
    const timer = setInterval(
      () =>
        void run(async () => {
          await loadProject(id, false);
          if (tab === "chat") await ensureGroup();
        }),
      30_000,
    );
    return () => clearInterval(timer);
  }, [user?._id, mainView, project?._id, tab]);

  const prepareNotifications = async () => {
    try {
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
          name: "Nhắc lịch và deadline",
          importance: Notifications.AndroidImportance.HIGH,
        });
      const current = await Notifications.getPermissionsAsync();
      const permission = current.granted
        ? current
        : await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        setNotificationsReady(false);
        setError(
          "Bạn chưa cấp quyền thông báo. Lịch vẫn được lưu nhưng nhắc hẹn sẽ chưa hoạt động.",
        );
        return;
      }
      setNotificationsReady(true);
      await refreshReminders();
    } catch (caught) {
      setNotificationsReady(false);
      setError(`Không thể chuẩn bị nhắc hẹn: ${String(caught)}`);
    }
  };

  const loadProjects = async () => {
    const data = await api<Project[]>("/projects");
    setProjects(data);
    setProjectPage((current) => Math.min(current, countProjectPages(data) - 1));
    return data;
  };

  const loadCalendar = async () => {
    const feed = await api<CalendarFeed>("/calendar");
    setCalendarTasks(feed.tasks);
    setCalendarEvents(feed.events);
    return feed;
  };

  const loadHome = async () => {
    const [projectRows, feed] = await Promise.all([
      api<Project[]>("/projects"),
      api<CalendarFeed>("/calendar"),
    ]);
    setProjects(projectRows);
    setProjectPage((current) =>
      Math.min(current, countProjectPages(projectRows) - 1),
    );
    setCalendarTasks(feed.tasks);
    setCalendarEvents(feed.events);
    return feed;
  };

  const loadProject = async (id: string, open = true) => {
    const [
      projectRow,
      taskRows,
      eventRows,
      discussionRows,
      documentRows,
      stats,
    ] = await Promise.all([
      api<Project>(`/projects/${id}`),
      api<Task[]>(`/projects/${id}/tasks`),
      api<CalendarEvent[]>(`/projects/${id}/events`),
      api<Discussion[]>(`/projects/${id}/discussions`),
      api<DocumentRow[]>(`/projects/${id}/documents`),
      api<Progress>(`/projects/${id}/progress`),
    ]);
    projectRef.current = projectRow;
    setProject(projectRow);
    setTasks(taskRows);
    setEvents(eventRows);
    setDiscussions(discussionRows);
    setDocuments(documentRows);
    setProgress(stats);
    setResourceValues(
      [
        projectRow.plannedHours,
        projectRow.actualHours,
        projectRow.plannedBudget,
        projectRow.spentBudget,
      ].map(String),
    );
    setGroup(
      peer.current
        ?.getGroups()
        .find((item) => item.id === projectRow.chatGroupId) || null,
    );
    if (open) {
      resetTaskForm();
      setMainView("project");
    }
    return projectRow;
  };

  const refreshReminders = async (preferences = offsets) => {
    if (!user) return;
    const feed = await loadCalendar();
    await reconcileReminders(feed.tasks, user._id, preferences);
    await reconcileEventReminders(feed.events);
  };

  const initializePeer = async (me: User, isCancelled: () => boolean) => {
    const id = me._id || me.id!;
    const local = new MobileStore(id);
    store.current = local;
    const instance = new PeerClient({
      peerId: id,
      identityProof: getToken(),
      signalUrl: process.env.EXPO_PUBLIC_SIGNAL_URL || "http://10.0.2.2:4001",
      relayUrl: process.env.EXPO_PUBLIC_RELAY_URL || "http://10.0.2.2:4002",
      rtc: RTCPeerConnection as unknown as PeerConfig["rtc"],
      store: local,
      onEvent: (event) => {
        if (peer.current !== instance) return;
        if (event.kind === "presence") setOnline(event.peers || []);
        if (
          event.kind === "group" &&
          projectRef.current?.chatGroupId === event.group?.id
        )
          setGroup(event.group?.members.includes(id) ? event.group : null);
        if (event.kind === "mode" && event.peerId)
          setModes((current) => ({ ...current, [event.peerId!]: event.mode! }));
        if (event.kind === "message") {
          void local.list().then(setMessages);
          const selected = directContactRef.current;
          if (
            selected &&
            event.message &&
            isDirectMessageBetween(event.message.message, id, selected.id)
          ) {
            void local.listDirect(selected.id).then((rows) => {
              if (directContactRef.current?.id === selected.id)
                setDirectMessages(rows);
            });
          }
        }
        if (event.kind === "log") {
          if (event.text === "signaling disconnected") setOnline([]);
          setLogs((current) => [event.text || "", ...current].slice(0, 100));
        }
      },
    });
    peer.current = instance;
    directChat.current = new DirectChatService(instance, local);
    const history = await local.list();
    if (!isCancelled() && peer.current === instance) setMessages(history);
  };

  const connectPeer = async () => {
    if (!peer.current) throw new Error("Peer chat chưa được khởi tạo.");
    peerConnect.current ||= peer.current.connect().catch((caught) => {
      peerConnect.current = null;
      throw caught;
    });
    await peerConnect.current;
  };

  const closeDirectConversation = () => {
    directOpenRequest.current += 1;
    directContactRef.current = null;
    setDirectContact(null);
    setDirectMessages([]);
    setDirectMessageBody("");
    setDirectOpening(false);
  };

  const loadDirectContacts = async () => {
    setChatContactsLoading(true);
    try {
      const contacts = await loadChatContacts();
      setChatContacts(contacts);
      const selected = directContactRef.current;
      if (selected && !contacts.some((contact) => contact.id === selected.id))
        closeDirectConversation();
      try {
        await connectPeer();
      } catch (caught) {
        setOnline([]);
        setError(
          `Không kết nối được dịch vụ chat. Danh bạ và lịch sử cục bộ vẫn dùng được: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
      return contacts;
    } finally {
      setChatContactsLoading(false);
    }
  };

  const openDirectConversation = async (contact: ChatContact) => {
    const service = directChat.current;
    if (!service) throw new Error("Chat cá nhân chưa được khởi tạo.");
    const request = ++directOpenRequest.current;
    if (directContactRef.current?.id !== contact.id) setDirectMessageBody("");
    directContactRef.current = contact;
    setDirectContact(contact);
    setDirectOpening(true);
    try {
      const history = await service.history(contact.id);
      if (directOpenRequest.current !== request) return;
      setDirectMessages(history);
      try {
        await connectPeer();
        const discovery = await peer.current!.lookupPeer(contact.id);
        if (directOpenRequest.current !== request) return;
        setOnline((current) =>
          discovery.online
            ? [...new Set([...current, contact.id])]
            : current.filter((id) => id !== contact.id),
        );
      } catch (caught) {
        if (directOpenRequest.current !== request) return;
        setOnline((current) => current.filter((id) => id !== contact.id));
        setError(
          `Không lấy được trạng thái của ${contact.name}. Bạn vẫn có thể xem lịch sử trên máy: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    } finally {
      if (directOpenRequest.current === request) setDirectOpening(false);
    }
  };

  const refreshDirectHistory = async (contactId: string) => {
    const service = directChat.current;
    if (!service) return;
    const history = await service.history(contactId);
    if (directContactRef.current?.id === contactId) setDirectMessages(history);
  };

  const sendDirectMessage = async () => {
    const contact = directContactRef.current;
    const service = directChat.current;
    if (!contact || !service) throw new Error("Hãy chọn người nhận.");
    if (directSendingRef.current)
      throw new Error("Tin nhắn trước đang được gửi.");
    if (!canSendDirect(directMessageBody, contact.id, false))
      throw new Error("Tin nhắn phải có từ 1 đến 4000 ký tự.");
    if (!online.includes(contact.id))
      throw new Error(
        `${contact.name} đang offline. Hệ thống chưa hỗ trợ giao tin offline.`,
      );
    const body = directMessageBody.trim();
    directSendingRef.current = true;
    setDirectSending(true);
    try {
      await connectPeer();
      await service.send(contact.id, body);
      if (directContactRef.current?.id === contact.id) setDirectMessageBody("");
    } finally {
      try {
        await refreshDirectHistory(contact.id);
      } finally {
        directSendingRef.current = false;
        setDirectSending(false);
      }
    }
  };

  const auth = async ({
    mode,
    name,
    email,
    password,
  }: {
    mode: AuthMode;
    name?: string;
    email: string;
    password: string;
  }) => {
    const register = mode === "register";
    const data = await api<{ token: string; user: User }>(
      register ? "/auth/register" : "/auth/login",
      json("POST", register ? { name, email, password } : { email, password }),
    );
    await setToken(data.token);
    setMainView("calendar");
    setUser({ ...data.user, _id: data.user.id || data.user._id });
  };

  const logout = async () => {
    directOpenRequest.current += 1;
    const currentPeer = peer.current;
    peer.current = null;
    currentPeer?.close();
    peerConnect.current = null;
    store.current = null;
    directChat.current = null;
    directContactRef.current = null;
    projectRef.current = null;
    await disconnectGoogle();
    try {
      await clearAllReminders();
    } catch {
      /* Logout must still clear the local session. */
    }
    await setToken("");
    setUser(null);
    setProject(null);
    setProjects([]);
    setProjectPage(0);
    setProjectCreateVisible(false);
    setProjectCreating(false);
    setCalendarTasks([]);
    setCalendarEvents([]);
    setCalendarScope("all");
    setPendingProjectEvent(null);
    setMessages([]);
    setOnline([]);
    setGroup(null);
    setModes({});
    setLogs([]);
    setForceRelay(false);
    setChatContacts([]);
    setDirectContact(null);
    setDirectMessages([]);
    setDirectMessageBody("");
    directSendingRef.current = false;
    setDirectSending(false);
    setGoogleEmail("");
    setNotificationsReady(false);
    setAuthMode("login");
    setMainView("calendar");
  };

  const createProject = async () => {
    if (!projectName.trim()) throw new Error("Vui lòng nhập tên dự án.");
    setProjectCreating(true);
    try {
      const created = await api<Project>(
        "/projects",
        json("POST", { name: projectName.trim(), kind: projectKind }),
      );
      setProjectName("");
      setProjectCreateVisible(false);
      setProjectPage(0);
      await loadProjects();
      await loadProject(created._id);
    } finally {
      setProjectCreating(false);
    }
  };

  const projectChanged = async () => {
    if (!projectRef.current) return;
    await Promise.all([
      loadProject(projectRef.current._id, false),
      loadProjects(),
      loadCalendar(),
    ]);
    if (peer.current && peerConnect.current) await ensureGroup();
  };

  const resetTaskForm = (selectedDay?: Date) => {
    const range = defaultTaskRange(selectedDay);
    setEditTask(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskStartsAt(range.startsAt);
    setTaskDue(range.dueAt);
    setTaskAssignee("");
  };

  const saveTask = async () => {
    if (!project) return;
    if (project.archived || !project.permissions.manageTasks)
      throw new Error("Bạn không có quyền tạo / sửa task trong dự án này.");
    if (!taskTitle.trim())
      throw new Error("Tên công việc không được để trống.");
    const startsAt = parseViDateTime(taskStartsAt);
    const dueAt = parseViDateTime(taskDue);
    if (dueAt.getTime() <= startsAt.getTime())
      throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
    const data = {
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      assignee: taskAssignee || null,
      startsAt: startsAt.toISOString(),
      dueAt: dueAt.toISOString(),
    };
    const saved = editTask
      ? await api<Task>(
          `/projects/${project._id}/tasks/${editTask._id}`,
          json("PATCH", { ...data, version: editTask.version }),
        )
      : await api<Task>(`/projects/${project._id}/tasks`, json("POST", data));
    resetTaskForm();
    let reminderWarning = "";
    try {
      if (userIdOf(saved.assignee) === user?._id)
        await syncReminder(saved, offsets);
      else await cancelReminder(saved._id);
    } catch (caught) {
      reminderWarning = `Task đã lưu nhưng chưa cập nhật được nhắc hẹn: ${String(caught)}`;
    }
    await Promise.all([loadProject(project._id, false), loadCalendar()]);
    if (reminderWarning) setError(reminderWarning);
  };

  const selectTask = (task: Task) => {
    const startsAt = task.startsAt
      ? new Date(task.startsAt)
      : task.dueAt
        ? new Date(new Date(task.dueAt).getTime() - 60 * 60 * 1000)
        : new Date();
    const dueAt = task.dueAt
      ? new Date(task.dueAt)
      : new Date(startsAt.getTime() + 60 * 60 * 1000);
    if (
      projectRef.current?.archived ||
      !projectRef.current?.permissions.manageTasks
    ) {
      resetTaskForm();
      setTab("tasks");
      return;
    }
    setEditTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setTaskStartsAt(toViDateTimeInput(startsAt));
    setTaskDue(toViDateTimeInput(dueAt));
    setTaskAssignee(userIdOf(task.assignee));
    setTab("tasks");
  };

  const openTaskFromCalendar = async (task: Task) => {
    const id = calendarProjectId(task.project);
    if (!id) throw new Error("Task không còn thuộc dự án hợp lệ.");
    await loadProject(id);
    selectTask(task);
  };

  const openEventFromCalendar = async (event: CalendarEvent) => {
    const id = calendarProjectId(event.project);
    if (!id) throw new Error("Sự kiện không còn thuộc dự án hợp lệ.");
    await loadProject(id);
    setPendingProjectEvent(event);
    setTab("calendar");
  };

  const changeStatus = async (task: Task, status: Task["status"]) => {
    if (!project) return;
    if (!user || !canChangeTaskStatus(project, task, user._id))
      throw new Error("Bạn chỉ được cập nhật task được giao cho mình.");
    const saved = await api<Task>(
      `/projects/${project._id}/tasks/${task._id}`,
      json("PATCH", { status, version: task.version }),
    );
    try {
      if (userIdOf(saved.assignee) === user?._id)
        await syncReminder(saved, offsets);
      else await cancelReminder(saved._id);
    } catch (caught) {
      setError(
        `Trạng thái đã lưu nhưng chưa cập nhật được nhắc hẹn: ${String(caught)}`,
      );
    }
    await Promise.all([loadProject(project._id, false), loadCalendar()]);
  };

  const deleteTask = async (task: Task) => {
    const id = calendarProjectId(task.project) || project?._id;
    if (!id) throw new Error("Không xác định được dự án của task.");
    await api(`/projects/${id}/tasks/${task._id}`, json("DELETE"));
    try {
      await cancelReminder(task._id);
    } catch (caught) {
      setError(`Task đã xóa nhưng chưa hủy được nhắc hẹn: ${String(caught)}`);
    }
    await loadCalendar();
    if (project?._id === id) await loadProject(id, false);
  };

  const saveCalendarEvent = async (
    current: CalendarEvent | null,
    draft: EventDraft,
  ) => {
    const saved = await api<CalendarEvent>(
      current ? `/events/${current._id}` : "/events",
      json(current ? "PATCH" : "POST", draft),
    );
    let warning = "";
    try {
      await syncEventReminder(saved);
    } catch (caught) {
      warning = `Sự kiện đã lưu nhưng chưa đặt được nhắc hẹn: ${String(caught)}`;
    }
    try {
      await loadCalendar();
    } catch (caught) {
      warning ||= `Sự kiện đã lưu nhưng chưa tải lại được lịch: ${String(caught)}`;
    }
    const id = calendarProjectId(saved.project) || draft.projectId;
    if (project && id === project._id) {
      try {
        await loadProject(project._id, false);
      } catch (caught) {
        warning ||= `Sự kiện đã lưu nhưng chưa tải lại được dự án: ${String(caught)}`;
      }
    }
    if (warning) setError(warning);
  };

  const deleteCalendarEvent = async (event: CalendarEvent) => {
    await api(`/events/${event._id}`, json("DELETE"));
    let warning = "";
    try {
      await cancelEventReminder(event._id);
    } catch (caught) {
      warning = `Sự kiện đã xóa nhưng chưa hủy được nhắc hẹn: ${String(caught)}`;
    }
    try {
      await loadCalendar();
    } catch (caught) {
      warning ||= `Sự kiện đã xóa nhưng chưa tải lại được lịch: ${String(caught)}`;
    }
    const id = calendarProjectId(event.project);
    if (project && id === project._id) {
      try {
        await loadProject(project._id, false);
      } catch (caught) {
        warning ||= `Sự kiện đã xóa nhưng chưa tải lại được dự án: ${String(caught)}`;
      }
    }
    if (warning) setError(warning);
  };

  const downloadDocument = async (document: DocumentRow) => {
    if (!project || !FileSystem.documentDirectory) return;
    const destination = `${FileSystem.documentDirectory}${document._id}-${document.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    const file = await FileSystem.downloadAsync(
      `${API_URL}/projects/${project._id}/documents/${document._id}`,
      destination,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (file.status !== 200) throw new Error(`Tải thất bại: ${file.status}`);
    await Sharing.shareAsync(file.uri);
  };

  const saveResources = async () => {
    if (!project) return;
    await api(
      `/projects/${project._id}/resources`,
      json("PATCH", {
        plannedHours: Number(resourceValues[0]),
        actualHours: Number(resourceValues[1]),
        plannedBudget: Number(resourceValues[2]),
        spentBudget: Number(resourceValues[3]),
        version: project.version,
      }),
    );
    await loadProject(project._id, false);
  };

  const ensureGroup = async () => {
    const currentProject = projectRef.current;
    if (!currentProject || !peer.current) return;
    await connectPeer();
    const currentGroup = await peer.current.syncProjectGroup(
      currentProject._id,
    );
    if (projectRef.current?._id === currentProject._id) setGroup(currentGroup);
  };

  const sendChat = async () => {
    if (!group || !peer.current || !store.current)
      throw new Error("Nhóm chưa sẵn sàng");
    const currentProject = projectRef.current;
    if (!currentProject || currentProject.archived)
      throw new Error("Dự án đã lưu trữ chỉ được xem.");
    await ensureGroup();
    const results = await peer.current.sendGroup(group.id, messageBody);
    const failed = Object.entries(results).filter(
      ([, value]) => value === "rejected",
    );
    if (failed.length)
      throw new Error(
        `Không gửi được cho ${failed.map(([id]) => id).join(", ")}`,
      );
    setMessageBody("");
    setMessages(await store.current.list());
  };

  const setReminderPreference = async (offset: ReminderOffset) => {
    const next: ReminderOffset[] = [offset];
    setOffsets(next);
    await SecureStore.setItemAsync("reminder-offsets", JSON.stringify(next));
    await refreshReminders(next);
  };

  const syncGoogle = async () => {
    if (!user) return;
    const feed = await loadCalendar();
    const count = await syncGoogleCalendar(feed.tasks, feed.events, user._id);
    Alert.alert("Google Calendar", `Đã đồng bộ ${count} mục vào lịch chính.`);
  };

  const openNotification = async (notification: InboxNotification) => {
    if (!notification.project) return;
    await loadProject(notification.project._id);
    setTab(
      notification.type.includes("discussion") ||
        notification.type.includes("comment")
        ? "discussion"
        : notification.type.includes("member")
          ? "members"
          : "tasks",
    );
  };

  if (loading)
    return (
      <SafeAreaView style={styles.page}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={colors.background}
        />
        <View style={styles.loading}>
          <View style={styles.loadingLogo}>
            <Text style={styles.loadingLogoText}>✓</Text>
          </View>
          <Text style={styles.loadingTitle}>Student Planner</Text>
          <Text style={styles.muted}>Đang chuẩn bị không gian của bạn…</Text>
        </View>
      </SafeAreaView>
    );
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

  const members =
    project?.members.map((member) =>
      typeof member === "string"
        ? { _id: member, name: member, email: "" }
        : member,
    ) || [];

  const orderedProjects = orderProjectsNewestFirst(projects);
  const projectPagination = projectsForPage(orderedProjects, projectPage);
  const projectPageCount = projectPagination.pageCount;
  const currentProjectPage = projectPagination.page;
  const visibleProjects = projectPagination.items;

  const renderProjects = () => (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setError("");
          setProjectCreateVisible(true);
        }}
        style={({ pressed }) => [
          styles.topCreateButton,
          pressed && styles.cardPressed,
        ]}
      >
        <Text style={styles.topCreateIcon}>＋</Text>
        <Text style={styles.topCreateText}>Tạo dự án mới</Text>
      </Pressable>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>KHÔNG GIAN LÀM VIỆC</Text>
        <Text style={styles.heroTitle}>Dự án của bạn</Text>
        <Text style={styles.heroSubtitle}>
          Cùng đội nhóm biến kế hoạch thành kết quả.
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{projects.length}</Text>
            <Text style={styles.statLabel}>Tổng dự án</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {projects.filter((item) => !item.archived).length}
            </Text>
            <Text style={styles.statLabel}>Đang hoạt động</Text>
          </View>
        </View>
      </View>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.heading}>Danh sách dự án</Text>
        <Pressable
          onPress={() => void run(loadProjects)}
          style={styles.textButton}
        >
          <Text style={styles.textButtonLabel}>Làm mới ↻</Text>
        </Pressable>
      </View>
      {visibleProjects.map((item) => (
        <Pressable
          key={item._id}
          style={({ pressed }) => [
            styles.card,
            styles.projectCard,
            pressed && styles.cardPressed,
          ]}
          onPress={() => void run(() => loadProject(item._id))}
        >
          <View style={styles.projectIcon}>
            <Text style={styles.projectIconText}>▦</Text>
          </View>
          <View style={styles.projectBody}>
            <Text style={styles.strong}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.parentProject
                ? "Dự án con"
                : item.kind === "hierarchical"
                  ? "Dự án phân cấp"
                  : "Dự án độc lập"}{" "}
              · {roleLabels[item.myRole]}
            </Text>
            {!!item.createdAt && (
              <Text style={styles.projectDate}>
                Tạo ngày {formatViDate(item.createdAt)}
              </Text>
            )}
            {!!item.description && (
              <Text numberOfLines={2} style={styles.projectDescription}>
                {item.description}
              </Text>
            )}
            <View
              style={[styles.statusPill, item.archived && styles.archivedPill]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  item.archived && styles.archivedPillText,
                ]}
              >
                {item.archived ? "Đã lưu trữ" : "Đang hoạt động"}
              </Text>
            </View>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </Pressable>
      ))}
      {!projects.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>◇</Text>
          <Text style={styles.strong}>Chưa có dự án</Text>
          <Text style={styles.muted}>
            Tạo dự án đầu tiên để bắt đầu cộng tác.
          </Text>
        </View>
      )}
      {projects.length > 5 && (
        <View style={styles.pagination}>
          <Pressable
            accessibilityLabel="Trang dự án trước"
            disabled={currentProjectPage === 0}
            onPress={() => setProjectPage((page) => Math.max(0, page - 1))}
            style={[
              styles.pageButton,
              currentProjectPage === 0 && styles.disabled,
            ]}
          >
            <Text style={styles.pageArrow}>‹</Text>
          </Pressable>
          <Text style={styles.pageLabel}>
            Trang {currentProjectPage + 1} / {projectPageCount}
          </Text>
          <Pressable
            accessibilityLabel="Trang dự án tiếp theo"
            disabled={currentProjectPage >= projectPageCount - 1}
            onPress={() =>
              setProjectPage((page) => Math.min(projectPageCount - 1, page + 1))
            }
            style={[
              styles.pageButton,
              currentProjectPage >= projectPageCount - 1 && styles.disabled,
            ]}
          >
            <Text style={styles.pageArrow}>›</Text>
          </Pressable>
        </View>
      )}
      <Modal
        transparent
        animationType="slide"
        visible={projectCreateVisible}
        onRequestClose={() =>
          !projectCreating && setProjectCreateVisible(false)
        }
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            accessibilityLabel="Đóng cửa sổ tạo dự án"
            disabled={projectCreating}
            onPress={() => setProjectCreateVisible(false)}
            style={styles.modalDismissArea}
          />
          <View style={styles.createProjectSheet} accessibilityViewIsModal>
            <View style={styles.modalHandle} />
            <View style={styles.createProjectHeader}>
              <View style={styles.modalTitleCopy}>
                <Text style={styles.pageTitle}>Tạo dự án mới</Text>
                <Text style={styles.subtitle}>
                  Thiết lập không gian làm việc cho đội của bạn.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                disabled={projectCreating}
                onPress={() => setProjectCreateVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>Mô hình dự án</Text>
            <View style={styles.projectKindGrid}>
              {(
                [
                  [
                    "independent",
                    "Dự án độc lập",
                    "Nhóm nhỏ, cùng quản lý công việc",
                  ],
                  [
                    "hierarchical",
                    "Dự án phân cấp",
                    "Dự án tổng, dự án con và Trưởng phòng",
                  ],
                ] as const
              ).map(([kind, label, description]) => (
                <Pressable
                  key={kind}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: projectKind === kind }}
                  disabled={projectCreating}
                  onPress={() => setProjectKind(kind)}
                  style={[
                    styles.projectKindOption,
                    kind === projectKind && styles.projectKindOptionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.projectKindTitle,
                      kind === projectKind && styles.activeTabText,
                    ]}
                  >
                    {kind === projectKind ? "✓ " : ""}
                    {label}
                  </Text>
                  <Text style={styles.projectKindDescription}>
                    {description}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Tên dự án</Text>
            {field(projectName, setProjectName, "Ví dụ: Đồ án tốt nghiệp")}
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                disabled={projectCreating}
                onPress={() => setProjectCreateVisible(false)}
                style={[
                  styles.modalActionButton,
                  styles.modalCancelButton,
                  projectCreating && styles.disabled,
                ]}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                disabled={projectCreating || !projectName.trim()}
                onPress={() => void run(createProject)}
                style={[
                  styles.modalActionButton,
                  styles.modalCreateButton,
                  (projectCreating || !projectName.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.buttonText}>
                  {projectCreating ? "Đang tạo…" : "Tạo dự án"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );

  const renderProject = () => {
    if (!project) return <>{renderProjects()}</>;
    return (
      <>
        {tab === "tasks" && (
          <>
            {!project.archived && project.permissions.manageTasks && (
              <>
                <Text style={styles.heading}>
                  {editTask ? "Sửa task" : "Tạo task"}
                </Text>
                {field(taskTitle, setTaskTitle, "Tên công việc")}
                {field(taskDescription, setTaskDescription, "Mô tả", true)}
                <NativeDateTimeField
                  label="Bắt đầu"
                  value={taskStartsAt}
                  onChange={setTaskStartsAt}
                />
                <NativeDateTimeField
                  label="Kết thúc (deadline)"
                  value={taskDue}
                  onChange={setTaskDue}
                  minimumDate={parsedDateOrUndefined(taskStartsAt)}
                />
                <Text>
                  Phân công:{" "}
                  {members.find((member) => member._id === taskAssignee)
                    ?.name || "Chưa phân công"}
                </Text>
                <View style={styles.wrap}>
                  {members.map((member) => (
                    <Pressable
                      key={member._id}
                      style={[
                        styles.chip,
                        taskAssignee === member._id && styles.activeTab,
                      ]}
                      onPress={() => setTaskAssignee(member._id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          taskAssignee === member._id && styles.activeTabText,
                        ]}
                      >
                        {member.name}
                      </Text>
                    </Pressable>
                  ))}
                  {button(
                    "Bỏ phân công",
                    () => setTaskAssignee(""),
                    false,
                    true,
                  )}
                </View>
                {button(
                  editTask ? "Lưu thay đổi" : "Tạo task",
                  () => void run(saveTask),
                )}
                {editTask &&
                  button("Hủy sửa", () => resetTaskForm(), false, true)}
              </>
            )}
            <Text style={styles.heading}>Công việc</Text>
            {!tasks.length && (
              <Text style={styles.muted}>
                Chưa có task trong phạm vi bạn tham gia.
              </Text>
            )}
            {tasks.map((task) => (
              <View style={styles.card} key={task._id}>
                <Text style={styles.strong}>{task.title}</Text>
                <Text>{task.description}</Text>
                <Text
                  style={
                    effectiveTaskStatus(task) === "overdue"
                      ? styles.overdue
                      : styles.muted
                  }
                >
                  {taskStatusLabels[effectiveTaskStatus(task)]}
                </Text>
                <Text>
                  Bắt đầu:{" "}
                  {task.startsAt ? formatViDateTime(task.startsAt) : "Chưa đặt"}
                </Text>
                <Text>
                  Kết thúc:{" "}
                  {task.dueAt ? formatViDateTime(task.dueAt) : "Chưa đặt"} ·{" "}
                  {members.find(
                    (member) => member._id === userIdOf(task.assignee),
                  )?.name || "Chưa phân công"}
                </Text>
                <View style={styles.wrap}>
                  {canChangeTaskStatus(project, task, user._id) &&
                    (["todo", "doing", "done"] as Task["status"][]).map(
                      (status) => (
                        <Pressable
                          key={status}
                          onPress={() =>
                            void run(() => changeStatus(task, status))
                          }
                          disabled={task.status === status}
                          style={[
                            styles.smallButton,
                            task.status === status && styles.disabled,
                          ]}
                        >
                          <Text style={styles.buttonText}>
                            {
                              {
                                todo: "Chưa làm",
                                doing: "Đang làm",
                                done: "Hoàn thành",
                              }[status]
                            }
                          </Text>
                        </Pressable>
                      ),
                    )}
                  {!project.archived &&
                    project.permissions.manageTasks &&
                    button("Sửa", () => selectTask(task), false, true)}
                  {!project.archived &&
                    project.permissions.manageTasks &&
                    button(
                      "Xóa",
                      () =>
                        Alert.alert("Xóa task?", task.title, [
                          { text: "Hủy" },
                          {
                            text: "Xóa",
                            style: "destructive",
                            onPress: () => void run(() => deleteTask(task)),
                          },
                        ]),
                      false,
                      true,
                    )}
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "calendar" && (
          <CalendarPanel
            tasks={tasks}
            events={events}
            projects={projects}
            fixedProjectId={project._id}
            initialEvent={pendingProjectEvent}
            defaultReminderOffsets={offsets}
            onSaveEvent={saveCalendarEvent}
            onDeleteEvent={deleteCalendarEvent}
            onOpenTask={selectTask}
            onDeleteTask={deleteTask}
            onInitialEventHandled={() => setPendingProjectEvent(null)}
            onError={setError}
            readOnly={project.archived}
            canManageTasks={project.permissions.manageTasks}
            canManageEvents={project.permissions.manageTasks}
          />
        )}

        {tab === "progress" && (
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
                onPress={() => void run(() => loadProject(item.projectId))}
              >
                <Text style={styles.strong}>{item.name}</Text>
                <Text>
                  {item.done}/{item.total} hoàn thành · {item.overdue} quá hạn
                </Text>
              </Pressable>
            ))}
            {progress?.byPerson.map((person) => (
              <View style={styles.card} key={person.userId}>
                <Text>
                  {person.name ||
                    members.find((member) => member._id === person.userId)
                      ?.name ||
                    (person.userId ? person.userId : "Chưa phân công")}
                  : {person.done}/{person.total}
                </Text>
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
                    onPress={() =>
                      setExpandedProgress((current) => ({
                        ...current,
                        [person.userId]: !current[person.userId],
                      }))
                    }
                    style={styles.expandButton}
                  >
                    <Text style={styles.strong}>
                      {expandedProgress[person.userId] ? "▴" : "▾"}
                    </Text>
                  </Pressable>
                </View>
                {expandedProgress[person.userId] &&
                  (
                    person.tasks ||
                    tasks.filter(
                      (task) => userIdOf(task.assignee) === person.userId,
                    )
                  ).map((task) => {
                    const status = effectiveTaskStatus(task);
                    return (
                      <Pressable
                        key={task._id}
                        style={styles.row}
                        onPress={() =>
                          void run(() => openTaskFromCalendar(task))
                        }
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
                            {task.dueAt
                              ? ` · ${formatViDateTime(task.dueAt)}`
                              : ""}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
              </View>
            ))}
          </>
        )}

        {tab === "chat" && (
          <>
            <Text style={styles.heading}>Chat nhóm dự án</Text>
            <Text>
              Nhóm: {group?.id || "Đang đồng bộ"} · online{" "}
              {online.filter((id) => group?.members.includes(id)).length}/
              {group?.members.length || 0}
            </Text>
            <Text style={styles.muted}>
              Nhóm chat tự đồng bộ với thành viên dự án. Peer offline không nhận
              được tin mới; lịch sử đã lưu vẫn còn trên thiết bị.
            </Text>
            {button("Làm mới nhóm", () => void run(ensureGroup), false, true)}
            {button(
              forceRelay ? "Đang ép RELAY" : "Thử DIRECT trước",
              () => {
                setForceRelay(!forceRelay);
                if (peer.current) peer.current.forceRelay = !forceRelay;
              },
              false,
              true,
            )}
            {group?.members.map((id) => (
              <Text key={id}>
                {members.find((member) => member._id === id)?.name || id}:{" "}
                {online.includes(id) ? "online" : "offline"} ·{" "}
                {modes[id] || "chưa kết nối"}
              </Text>
            ))}
            {messages
              .filter((row) => row.message.groupId === group?.id)
              .map((row, index) => (
                <View
                  style={styles.card}
                  key={`${row.message.messageId}-${row.message.receiverId}-${index}`}
                >
                  <Text style={styles.muted}>
                    {row.message.senderId === user._id
                      ? "Tôi"
                      : members.find(
                          (member) => member._id === row.message.senderId,
                        )?.name || row.message.senderId}{" "}
                    →{" "}
                    {members.find(
                      (member) => member._id === row.message.receiverId,
                    )?.name || row.message.receiverId}{" "}
                    · {row.message.mode} · {row.status}
                  </Text>
                  <Text>{row.message.body}</Text>
                </View>
              ))}
            {!project.archived &&
              field(messageBody, setMessageBody, "Tin nhắn")}
            {!project.archived &&
              button(
                "Gửi nhóm",
                () => void run(sendChat),
                !group || !messageBody.trim(),
              )}
            <Text style={styles.heading}>Log peer</Text>
            {logs.slice(0, 20).map((line, index) => (
              <Text key={index} style={styles.muted}>
                {line}
              </Text>
            ))}
          </>
        )}

        {tab === "discussion" && (
          <DiscussionPanel
            key={project._id}
            project={project}
            userId={user._id}
            posts={discussions}
            legacyDocuments={documents}
            onChanged={projectChanged}
            onDownload={downloadDocument}
            onError={setError}
          />
        )}

        {tab === "resources" && (
          <>
            <Text style={styles.heading}>Nguồn lực và ngân sách</Text>
            {[
              "Giờ dự kiến",
              "Giờ thực tế",
              "Ngân sách dự kiến (VND)",
              "Đã dùng (VND)",
            ].map((label, index) => (
              <View key={label}>
                <Text>{label}</Text>
                {field(
                  resourceValues[index],
                  (value) =>
                    setResourceValues((current) =>
                      current.map((item, itemIndex) =>
                        index === itemIndex ? value : item,
                      ),
                    ),
                  label,
                  false,
                  !project.archived && project.permissions.manageResources,
                )}
              </View>
            ))}
            {button(
              "Lưu",
              () => void run(saveResources),
              project.archived || !project.permissions.manageResources,
            )}
            <Text>
              Còn lại: {project.plannedBudget - project.spentBudget} VND · giờ
              chênh lệch: {project.actualHours - project.plannedHours}
            </Text>
          </>
        )}

        {(tab === "members" || tab === "management") && (
          <ProjectManagementPanel
            key={`${project._id}-${tab}`}
            project={project}
            section={tab === "members" ? "members" : "management"}
            onChanged={projectChanged}
            onOpenProject={(id) => void run(() => loadProject(id))}
            onError={setError}
          />
        )}
      </>
    );
  };

  const renderDirectMessages = () => {
    if (!directContact)
      return (
        <>
          <Text style={styles.subtitle}>
            Chọn một thành viên cùng dự án để chat riêng. Tin nhắn được lưu cục
            bộ trên thiết bị và không xuất hiện trong Chat nhóm dự án.
          </Text>
          {button(
            chatContactsLoading ? "Đang tải danh bạ…" : "Làm mới danh bạ",
            () => void run(loadDirectContacts),
            chatContactsLoading,
            true,
          )}
          {chatContacts.map((contact) => {
            const history = directMessagesForContact(
              messages,
              user._id,
              contact.id,
            );
            const latest = history.at(-1);
            const contactOnline = online.includes(contact.id);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mở chat với ${contact.name}`}
                key={contact.id}
                style={styles.contactCard}
                onPress={() => void run(() => openDirectConversation(contact))}
              >
                <View
                  style={[
                    styles.presenceDot,
                    contactOnline
                      ? styles.presenceOnline
                      : styles.presenceOffline,
                  ]}
                />
                <View style={styles.contactText}>
                  <View style={styles.contactTitleRow}>
                    <Text style={styles.strong}>{contact.name}</Text>
                    <Text style={styles.muted}>
                      {contactOnline ? "Online" : "Offline"}
                    </Text>
                  </View>
                  <Text style={styles.muted}>{contact.email}</Text>
                  <Text numberOfLines={1} style={styles.contactPreview}>
                    {latest
                      ? `${latest.message.senderId === user._id ? "Bạn: " : ""}${latest.message.body}`
                      : "Chưa có tin nhắn"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {!chatContactsLoading && !chatContacts.length && (
            <View style={styles.emptyCard}>
              <Text style={styles.strong}>Danh bạ đang trống</Text>
              <Text style={styles.muted}>
                Hãy thêm thành viên đã đăng ký vào dự án, sau đó làm mới danh
                bạ.
              </Text>
            </View>
          )}
        </>
      );

    const contactOnline = online.includes(directContact.id);
    const visibleMessages = directMessagesForContact(
      directMessages,
      user._id,
      directContact.id,
    );
    return (
      <>
        <View style={styles.directStatusCard}>
          <Text style={styles.muted}>
            {contactOnline
              ? `Đang online · ${modes[directContact.id] || "chưa chọn đường truyền"}`
              : "Đang offline · không có hàng đợi giao tin offline"}
          </Text>
          <View style={styles.wrap}>
            {button(
              "Làm mới trạng thái",
              () => void run(() => openDirectConversation(directContact)),
              directOpening,
              true,
            )}
            {button(
              forceRelay ? "Đang ép RELAY" : "DIRECT trước",
              () => {
                setForceRelay(!forceRelay);
                if (peer.current) peer.current.forceRelay = !forceRelay;
              },
              false,
              true,
            )}
          </View>
        </View>
        {directOpening && !visibleMessages.length && (
          <Text style={styles.muted}>Đang tải lịch sử trên thiết bị…</Text>
        )}
        {!directOpening && !visibleMessages.length && (
          <View style={styles.emptyCard}>
            <Text style={styles.muted}>
              Chưa có tin nhắn với {directContact.name}.
            </Text>
          </View>
        )}
        {visibleMessages.map((row) => {
          const outgoing = row.message.senderId === user._id;
          const route =
            row.status === "pending"
              ? "Đang chọn đường truyền"
              : row.message.mode;
          return (
            <View
              key={`${row.message.messageId}-${row.message.senderId}-${row.message.receiverId}`}
              style={[
                styles.messageRow,
                outgoing
                  ? styles.messageRowOutgoing
                  : styles.messageRowIncoming,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  outgoing ? styles.messageOutgoing : styles.messageIncoming,
                  row.status === "failed" && styles.messageFailed,
                ]}
              >
                <Text style={styles.messageBody}>{row.message.body}</Text>
                <Text style={styles.messageMeta}>
                  {formatViDateTime(row.message.timestamp)} · {route} ·{" "}
                  {directMessageStatusLabel(row.status, outgoing)}
                </Text>
              </View>
            </View>
          );
        })}
      </>
    );
  };

  const renderAccount = () => (
    <>
      <Text style={styles.pageTitle}>Tài khoản</Text>
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {user.name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedText}>✓</Text>
        </View>
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>NHẮC VIỆC</Text>
        <Text style={styles.heading}>Nhắc deadline mặc định</Text>
        <Text style={styles.subtitle}>
          Áp dụng cho task được giao và sự kiện mới của bạn.
        </Text>
        <ReminderSelect
          label="Thông báo mặc định"
          zeroLabel="Đúng thời điểm bắt đầu / đến hạn"
          value={offsets[0] ?? 0}
          onChange={(value) => void run(() => setReminderPreference(value))}
        />
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>TÍCH HỢP</Text>
        <Text style={styles.heading}>Google Calendar</Text>
        <Text style={styles.subtitle}>
          Đưa deadline và sự kiện vào lịch chính, không tạo mục trùng.
        </Text>
        <View style={styles.connectionRow}>
          <View
            style={[
              styles.connectionDot,
              googleEmail && styles.connectionDotActive,
            ]}
          />
          <Text style={styles.connectionText}>
            {googleEmail || "Chưa kết nối Google"}
          </Text>
        </View>
        {button(
          "Kết nối Google",
          () => void run(async () => setGoogleEmail(await connectGoogle())),
        )}
        {button("Đồng bộ ngay", () => void run(syncGoogle), !googleEmail, true)}
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>PHIÊN ĐĂNG NHẬP</Text>
        <Text style={styles.subtitle}>
          Đăng xuất sẽ xóa phiên và các nhắc hẹn cục bộ trên thiết bị này.
        </Text>
        {button("Đăng xuất", () => void run(logout), false, true)}
      </View>
    </>
  );

  const calendarToolbar = (
    <View style={[styles.contextToolbar, styles.calendarToolbar]}>
      <Text style={styles.contextTitle}>Lịch của tôi</Text>
      <Text style={styles.contextSubtitle}>
        Sự kiện cá nhân, lịch dự án và deadline được giao cho bạn.
      </Text>
      <Text style={styles.toolbarLabel}>Hiển thị</Text>
      <View style={styles.scopeRow}>
        {CALENDAR_SCOPE_OPTIONS.map(([value, label]) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: calendarScope === value }}
            key={value}
            onPress={() => setCalendarScope(value)}
            style={[
              styles.scopeChip,
              calendarScope === value && styles.activeScopeChip,
            ]}
          >
            <Text
              style={[
                styles.scopeChipText,
                calendarScope === value && styles.activeScopeChipText,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const projectToolbar = project && (
    <View style={[styles.contextToolbar, styles.projectToolbar]}>
      <View style={styles.projectTitleRow}>
        {button("☰", () => setDrawerVisible(true), false, true)}
        {button(
          "← Danh sách",
          () => {
            setPendingProjectEvent(null);
            setMainView("projects");
          },
          false,
          true,
        )}
        <Text style={styles.contextTitle}>{project.name}</Text>
      </View>
      <Text style={styles.contextSubtitle}>
        {projectTabLabels[tab]} · {roleLabels[project.myRole]}
        {project.archived ? " · Đã lưu trữ (chỉ xem)" : ""}
      </Text>
      <Modal
        transparent
        animationType="fade"
        visible={drawerVisible}
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <View style={styles.drawer}>
            <Text style={styles.contextTitle}>{project.name}</Text>
            <Text style={styles.muted}>{roleLabels[project.myRole]}</Text>
            <ScrollView contentContainerStyle={styles.drawerItems}>
              {(Object.keys(projectTabLabels) as ProjectTab[]).map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  style={[styles.drawerItem, tab === item && styles.activeTab]}
                  onPress={() => {
                    setPendingProjectEvent(null);
                    setTab(item);
                    setDrawerVisible(false);
                    if (item === "chat") void run(ensureGroup);
                  }}
                >
                  <Text
                    style={[
                      styles.drawerItemText,
                      tab === item && styles.activeTabText,
                    ]}
                  >
                    {projectTabLabels[item]}
                  </Text>
                </Pressable>
              ))}
              {button(
                "← Danh sách dự án",
                () => {
                  setDrawerVisible(false);
                  setMainView("projects");
                },
                false,
                true,
              )}
            </ScrollView>
            {button("Đóng", () => setDrawerVisible(false), false, true)}
          </View>
          <Pressable
            accessibilityLabel="Đóng menu dự án"
            style={styles.drawerShade}
            onPress={() => setDrawerVisible(false)}
          />
        </View>
      </Modal>
    </View>
  );

  const messagesToolbar = (
    <View style={[styles.contextToolbar, styles.messagesToolbar]}>
      {directContact ? (
        <>
          <View style={styles.projectTitleRow}>
            {button("← Danh bạ", closeDirectConversation, false, true)}
            <View style={styles.contactText}>
              <Text style={styles.contextTitle}>{directContact.name}</Text>
              <Text style={styles.contextSubtitle}>
                {directContact.email} ·{" "}
                {online.includes(directContact.id) ? "Online" : "Offline"}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.contextTitle}>Tin nhắn</Text>
          <Text style={styles.contextSubtitle}>
            Chat cá nhân với thành viên trong các dự án của bạn.
          </Text>
        </>
      )}
    </View>
  );

  const directCanSend =
    !!directContact &&
    online.includes(directContact.id) &&
    canSendDirect(directMessageBody, directContact.id, directSending);

  const directComposer = directContact && (
    <View style={styles.chatComposer}>
      <TextInput
        accessibilityLabel={`Tin nhắn gửi ${directContact.name}`}
        style={styles.chatComposerInput}
        value={directMessageBody}
        onChangeText={setDirectMessageBody}
        placeholder={
          online.includes(directContact.id)
            ? "Nhập tin nhắn"
            : `${directContact.name} đang offline`
        }
        placeholderTextColor="#64748b"
        maxLength={4000}
        editable={!directSending && online.includes(directContact.id)}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (directCanSend) void run(sendDirectMessage);
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gửi tin nhắn riêng"
        disabled={!directCanSend}
        onPress={() => void run(sendDirectMessage)}
        style={[styles.chatSendButton, !directCanSend && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {directSending ? "Đang gửi…" : "Gửi"}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.headerLogo}>
            <Text style={styles.headerLogoText}>✓</Text>
          </View>
          <View>
            <Text style={styles.title}>Student Planner</Text>
            <Text style={styles.userLine}>
              Xin chào, {user.name.split(" ").slice(-1)[0]}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mở thông báo"
          onPress={() => setMainView("notifications")}
          style={[
            styles.notificationBell,
            mainView === "notifications" && styles.notificationBellActive,
          ]}
        >
          <Text style={styles.notificationIcon}>🔔</Text>
        </Pressable>
      </View>
      {mainView === "calendar" && calendarToolbar}
      {mainView === "project" && projectToolbar}
      {mainView === "messages" && messagesToolbar}
      <ScrollView
        ref={contentScroll}
        key={`${mainView}-${mainView === "project" ? tab : ""}-${mainView === "messages" ? directContact?.id || "contacts" : ""}`}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (mainView === "messages" && directContact)
            contentScroll.current?.scrollToEnd({ animated: true });
        }}
      >
        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => setError("")}>
              <Text style={styles.errorClose}>Đóng</Text>
            </Pressable>
          </View>
        )}
        {mainView === "calendar" && (
          <CalendarPanel
            scope={calendarScope}
            tasks={calendarTasks}
            events={calendarEvents}
            projects={projects}
            defaultReminderOffsets={offsets}
            onSaveEvent={saveCalendarEvent}
            onDeleteEvent={deleteCalendarEvent}
            onOpenTask={(task) => void run(() => openTaskFromCalendar(task))}
            onOpenProjectEvent={(event) =>
              void run(() => openEventFromCalendar(event))
            }
            onDeleteTask={deleteTask}
            onError={setError}
          />
        )}
        {mainView === "projects" && renderProjects()}
        {mainView === "project" && renderProject()}
        {mainView === "messages" && renderDirectMessages()}
        {mainView === "account" && renderAccount()}
        {mainView === "notifications" && (
          <NotificationInbox onOpen={openNotification} onError={setError} />
        )}
      </ScrollView>
      {mainView === "messages" && directComposer}
      <View style={styles.bottomNav}>
        {(
          [
            ["calendar", "▦", "Lịch"],
            ["projects", "◇", "Dự án"],
            ["messages", "✉", "Tin nhắn"],
            ["account", "◎", "Cá nhân"],
          ] as const
        ).map(([view, icon, label]) => {
          const active =
            mainView === view ||
            (view === "projects" && mainView === "project");
          return (
            <Pressable
              key={view}
              onPress={() => {
                setMainView(view);
                if (view === "calendar") void run(loadCalendar);
                if (view === "projects") void run(loadProjects);
                if (view === "messages") void run(loadDirectContacts);
              }}
              style={[styles.navItem, active && styles.activeNavItem]}
            >
              <View
                style={[styles.navIconWrap, active && styles.navIconWrapActive]}
              >
                <Text style={[styles.navIcon, active && styles.navActive]}>
                  {icon}
                </Text>
              </View>
              <Text style={[styles.navText, active && styles.navActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingLogo: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    ...cardShadow,
  },
  loadingLogoText: { color: "#fff", fontSize: 30, fontWeight: "900" },
  loadingTitle: { color: colors.text, fontSize: 21, fontWeight: "900" },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingTop: 11,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 11 },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  headerLogoText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  contextToolbar: {
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingTop: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 2,
    elevation: 2,
  },
  calendarToolbar: { paddingBottom: 12, gap: 6 },
  projectToolbar: { paddingBottom: 8 },
  notificationBell: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBellActive: { backgroundColor: colors.primarySoft },
  notificationIcon: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  drawer: {
    width: "82%",
    backgroundColor: colors.surface,
    padding: 20,
    paddingTop: 48,
    gap: 10,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
  },
  drawerShade: { flex: 1 },
  drawerItems: { gap: 8, paddingTop: 16 },
  drawerItem: {
    padding: 14,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
  },
  drawerItemText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  overdue: { color: colors.danger, fontWeight: "700" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressBar: { flex: 1 },
  expandButton: {
    padding: 9,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
  },
  taskIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderColor: "#94a3b8",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  taskDoing: { borderColor: "#eab308", borderStyle: "dashed" },
  taskDone: { borderColor: colors.success },
  taskOverdue: { borderColor: colors.danger },
  taskIndicatorText: { fontWeight: "800", fontSize: 16 },
  taskDoneText: { color: colors.success },
  taskOverdueText: { color: colors.danger },
  messagesToolbar: { paddingBottom: 9 },
  contextTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.text,
    flexShrink: 1,
  },
  contextSubtitle: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  toolbarLabel: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 2,
  },
  scopeRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  scopeChip: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  activeScopeChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scopeChipText: { color: colors.text, fontWeight: "600" },
  activeScopeChipText: { color: "#fff", fontWeight: "700" },
  projectTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 11,
  },
  loginContent: { padding: 22, paddingTop: 80, gap: 11 },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.35,
  },
  userLine: { color: colors.textSoft, marginTop: 1, fontSize: 12 },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    flexShrink: 1,
  },
  subtitle: { color: colors.textSoft, lineHeight: 20 },
  heading: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 8,
    color: colors.text,
    letterSpacing: -0.25,
  },
  strong: { fontWeight: "800", fontSize: 16, color: colors.text },
  muted: { fontSize: 12, color: colors.textSoft, lineHeight: 18 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 13,
    padding: 11,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  error: { color: "#A52B38", flex: 1 },
  errorClose: { color: colors.danger, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 80 },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    marginRight: 4,
    marginBottom: 4,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#D9DCFF",
  },
  secondaryButtonText: { color: colors.primaryDark },
  smallButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 4,
    marginBottom: 4,
  },
  disabled: { opacity: 0.4 },
  card: {
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 7,
    ...cardShadow,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    margin: 2,
  },
  tabs: { flexGrow: 0, marginTop: 5, marginBottom: 7 },
  tabsContent: { alignItems: "center", paddingRight: 12 },
  tab: {
    backgroundColor: colors.surface,
    borderRadius: 11,
    padding: 10,
    marginRight: 5,
  },
  tabText: { color: colors.text },
  chipText: { color: colors.text },
  activeTab: { backgroundColor: colors.primarySoft, borderColor: "#C8CBFF" },
  activeTabText: { color: colors.primaryDark, fontWeight: "800" },
  bar: {
    height: 10,
    backgroundColor: "#cbd5e1",
    borderRadius: 8,
    overflow: "hidden",
  },
  fill: { height: 10, backgroundColor: colors.accent },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  memberText: { flex: 1 },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactText: { flex: 1, minWidth: 0 },
  contactTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  contactPreview: { color: colors.textSoft, marginTop: 4 },
  presenceDot: { width: 11, height: 11, borderRadius: 6 },
  presenceOnline: { backgroundColor: "#22c55e" },
  presenceOffline: { backgroundColor: "#94a3b8" },
  directStatusCard: {
    padding: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 13,
    gap: 6,
  },
  emptyCard: {
    padding: 16,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 5,
  },
  messageRow: { width: "100%", marginVertical: 3 },
  messageRowOutgoing: { alignItems: "flex-end" },
  messageRowIncoming: { alignItems: "flex-start" },
  messageBubble: {
    maxWidth: "84%",
    minWidth: 100,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 13,
    gap: 5,
  },
  messageOutgoing: { backgroundColor: colors.primarySoft },
  messageIncoming: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageFailed: { backgroundColor: colors.dangerSoft, borderColor: "#F5B4BB" },
  messageBody: { color: colors.text, fontSize: 15, lineHeight: 20 },
  messageMeta: { color: colors.textSoft, fontSize: 10 },
  chatComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chatComposerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  chatSendButton: {
    minHeight: 42,
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: 13,
    paddingHorizontal: 12,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 8 : 9,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 3,
    borderRadius: 13,
  },
  activeNavItem: { backgroundColor: "#FAFAFF" },
  navIconWrap: {
    minWidth: 42,
    height: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconWrapActive: { backgroundColor: colors.primarySoft },
  navIcon: { fontSize: 18, color: colors.textSoft },
  navText: { color: colors.textSoft, fontSize: 11, fontWeight: "600" },
  navActive: { color: colors.primary, fontWeight: "900" },
  topCreateButton: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: colors.primary,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  topCreateIcon: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 23,
  },
  topCreateText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    padding: 20,
    overflow: "hidden",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  eyebrow: {
    color: "#D9DCFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 7,
    letterSpacing: -0.5,
  },
  heroSubtitle: { color: "#E7E8FF", fontSize: 13, marginTop: 5 },
  statsRow: { flexDirection: "row", alignItems: "center", marginTop: 20 },
  statItem: { flex: 1 },
  statValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#D9DCFF", fontSize: 11, marginTop: 2 },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginHorizontal: 16,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
  },
  textButton: { paddingHorizontal: 8, paddingVertical: 7 },
  textButtonLabel: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  projectCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  projectIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  projectIconText: { color: colors.primary, fontSize: 23, fontWeight: "800" },
  projectBody: { flex: 1, gap: 4 },
  projectDate: { color: colors.textSoft, fontSize: 11 },
  projectDescription: { color: colors.textSoft, fontSize: 13, lineHeight: 18 },
  cardArrow: { color: colors.primary, fontSize: 28, fontWeight: "400" },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  statusPillText: { color: "#0B7A6D", fontSize: 10, fontWeight: "800" },
  archivedPill: { backgroundColor: colors.surfaceMuted },
  archivedPillText: { color: colors.textSoft },
  emptyIcon: { color: colors.primary, fontSize: 30 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 5,
  },
  pageButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#D9DCFF",
  },
  pageArrow: {
    color: colors.primary,
    fontSize: 27,
    fontWeight: "700",
    lineHeight: 29,
  },
  pageLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    minWidth: 82,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(24,32,52,0.48)",
  },
  modalDismissArea: { flex: 1 },
  createProjectSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 22,
    gap: 13,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C9CDDA",
    alignSelf: "center",
    marginTop: 9,
    marginBottom: 2,
  },
  createProjectHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  modalTitleCopy: { flex: 1, gap: 3 },
  modalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  modalCloseText: { color: colors.text, fontSize: 28, lineHeight: 30 },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  projectKindGrid: { flexDirection: "row", gap: 9 },
  projectKindOption: {
    flex: 1,
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 6,
  },
  projectKindOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  projectKindTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  projectKindDescription: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 3 },
  modalActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  modalCancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCreateButton: { backgroundColor: colors.primary },
  modalCancelText: { color: colors.text, fontWeight: "800" },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    marginTop: 5,
    ...cardShadow,
  },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  profileCard: {
    backgroundColor: colors.primary,
    borderRadius: 21,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 3,
    ...cardShadow,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  profileAvatarText: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  profileEmail: { color: "#E7E8FF", fontSize: 12 },
  verifiedBadge: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedText: { color: "#FFFFFF", fontWeight: "900" },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  connectionDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#B5BBC9",
  },
  connectionDotActive: { backgroundColor: colors.success },
  connectionText: { flex: 1, color: colors.textSoft, fontSize: 13 },
});
