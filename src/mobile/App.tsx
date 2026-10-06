import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RTCPeerConnection } from "react-native-webrtc";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as DocumentPicker from "expo-document-picker";
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
  type Task,
  type User,
} from "./api.ts";
import {
  MobileStore,
  REMINDER_CHANNEL_ID,
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type MainView = "calendar" | "projects" | "project" | "messages" | "account";
type ProjectTab =
  | "tasks"
  | "calendar"
  | "progress"
  | "chat"
  | "discussion"
  | "documents"
  | "resources"
  | "members";
const projectTabLabels: Record<ProjectTab, string> = {
  tasks: "Task",
  calendar: "Lịch",
  progress: "Tiến độ",
  chat: "Chat",
  discussion: "Thảo luận",
  documents: "Tài liệu",
  resources: "Nguồn lực",
  members: "Thành viên",
};
const offsetLabels: [ReminderOffset, string][] = [
  [604800000, "1 tuần"],
  [86400000, "1 ngày"],
  [3600000, "1 giờ"],
];

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
  />
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mainView, setMainView] = useState<MainView>("calendar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
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
  const [discussionTitle, setDiscussionTitle] = useState("");
  const [discussionBody, setDiscussionBody] = useState("");
  const [resourceValues, setResourceValues] = useState(["0", "0", "0", "0"]);
  const [offsets, setOffsets] = useState<ReminderOffset[]>([86400000]);
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
        if (saved) setOffsets(JSON.parse(saved));
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
    if (directContactRef.current?.id === contactId)
      setDirectMessages(history);
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
      if (directContactRef.current?.id === contact.id)
        setDirectMessageBody("");
    } finally {
      try {
        await refreshDirectHistory(contact.id);
      } finally {
        directSendingRef.current = false;
        setDirectSending(false);
      }
    }
  };

  const auth = async (register: boolean) => {
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
    setMainView("calendar");
  };

  const createProject = async () => {
    const created = await api<Project>(
      "/projects",
      json("POST", { name: projectName }),
    );
    setProjectName("");
    await loadProjects();
    await loadProject(created._id);
  };

  const addMember = async () => {
    if (!project) return;
    const updated = await api<Project>(
      `/projects/${project._id}/members`,
      json("POST", { email: memberEmail }),
    );
    setMemberEmail("");
    await loadProject(project._id, false);
    if (updated.chatGroupId && group && userIdOf(updated.owner) === user?._id) {
      for (const member of updated.members)
        if (!group.members.includes(userIdOf(member)))
          await peer.current?.changeGroup(group.id, userIdOf(member), "add");
    }
  };

  const removeMember = async (id: string) => {
    if (!project) return;
    await api(`/projects/${project._id}/members/${id}`, json("DELETE"));
    if (group?.members.includes(id))
      await peer.current?.changeGroup(group.id, id, "remove");
    await loadProject(project._id, false);
    await loadCalendar();
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

  const saveDiscussion = async () => {
    if (!project) return;
    await api(
      `/projects/${project._id}/discussions`,
      json("POST", { title: discussionTitle, body: discussionBody }),
    );
    setDiscussionTitle("");
    setDiscussionBody("");
    await loadProject(project._id, false);
  };

  const uploadDocument = async () => {
    if (!project) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.size || 0) > 512 * 1024) throw new Error("Tệp tối đa 512 KiB");
    const form = new FormData();
    form.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || "application/octet-stream",
    } as unknown as Blob);
    await api(`/projects/${project._id}/documents`, {
      method: "POST",
      body: form,
    });
    await loadProject(project._id, false);
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
      }),
    );
    await loadProject(project._id, false);
  };

  const ensureGroup = async () => {
    if (!project || !peer.current) return;
    await connectPeer();
    const memberIds = project.members.map(userIdOf);
    let currentGroup = peer.current
      .getGroups()
      .find((item) => item.id === project.chatGroupId);
    if (!currentGroup && userIdOf(project.owner) === user?._id) {
      currentGroup = await peer.current.createGroup(
        memberIds.filter((id) => id !== user?._id),
      );
      const mapping = await api<{ chatGroupId: string }>(
        `/projects/${project._id}/chat-group`,
        json("POST", {
          groupId: currentGroup.id,
          previousGroupId: project.chatGroupId || null,
        }),
      );
      if (mapping.chatGroupId !== currentGroup.id)
        currentGroup = peer.current
          .getGroups()
          .find((item) => item.id === mapping.chatGroupId);
      await loadProject(project._id, false);
    }
    setGroup(currentGroup || null);
  };

  const sendChat = async () => {
    if (!group || !peer.current || !store.current)
      throw new Error("Nhóm chưa sẵn sàng");
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
    const next = offsets.includes(offset)
      ? offsets.filter((value) => value !== offset)
      : [...offsets, offset];
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

  if (loading)
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.loading}>
          <Text>Đang tải…</Text>
        </View>
      </SafeAreaView>
    );
  if (!user)
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView
          contentContainerStyle={styles.loginContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Student Planner</Text>
          <Text style={styles.subtitle}>Lịch học, deadline và dự án nhóm</Text>
          {field(name, setName, "Tên (khi đăng ký)")}
          {field(email, setEmail, "Email")}
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Mật khẩu"
            placeholderTextColor="#64748b"
            secureTextEntry
          />
          {button("Đăng nhập", () => void run(() => auth(false)))}
          {button("Đăng ký", () => void run(() => auth(true)), false, true)}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    );

  const members =
    project?.members.map((member) =>
      typeof member === "string"
        ? { _id: member, name: member, email: "" }
        : member,
    ) || [];

  const renderProjects = () => (
    <>
      <Text style={styles.pageTitle}>Dự án</Text>
      <Text style={styles.subtitle}>
        Quản lý công việc, thành viên và tiến độ nhóm.
      </Text>
      {projects.map((item) => (
        <Pressable
          key={item._id}
          style={styles.card}
          onPress={() => void run(() => loadProject(item._id))}
        >
          <Text style={styles.strong}>{item.name}</Text>
          <Text>{item.description || "Mở dự án"}</Text>
        </Pressable>
      ))}
      {!projects.length && (
        <Text style={styles.muted}>Bạn chưa tham gia dự án nào.</Text>
      )}
      <Text style={styles.heading}>Tạo dự án</Text>
      {field(projectName, setProjectName, "Tên dự án mới")}
      {button("Tạo dự án", () => void run(createProject))}
      {button("Làm mới", () => void run(loadProjects), false, true)}
    </>
  );

  const renderProject = () => {
    if (!project) return <>{renderProjects()}</>;
    return (
      <>
        {tab === "tasks" && (
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
              {members.find((member) => member._id === taskAssignee)?.name ||
                "Chưa phân công"}
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
              {button("Bỏ phân công", () => setTaskAssignee(""), false, true)}
            </View>
            {button(
              editTask ? "Lưu thay đổi" : "Tạo task",
              () => void run(saveTask),
            )}
            {editTask && button("Hủy sửa", () => resetTaskForm(), false, true)}
            <Text style={styles.heading}>Công việc</Text>
            {tasks.map((task) => (
              <View style={styles.card} key={task._id}>
                <Text style={styles.strong}>{task.title}</Text>
                <Text>{task.description}</Text>
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
                  {(["todo", "doing", "done"] as Task["status"][]).map(
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
                  {button("Sửa", () => selectTask(task), false, true)}
                  {button(
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
            {progress?.byPerson.map((person) => (
              <View style={styles.card} key={person.userId}>
                <Text>
                  {members.find((member) => member._id === person.userId)
                    ?.name || person.userId}
                  : {person.done}/{person.total}
                </Text>
                <View style={styles.bar}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${person.total ? (100 * person.done) / person.total : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "chat" && (
          <>
            <Text style={styles.heading}>Chat nhóm dự án</Text>
            <Text>
              Nhóm: {group?.id || "Chưa tạo / chưa đồng bộ"} · online{" "}
              {online.filter((id) => group?.members.includes(id)).length}/
              {group?.members.length || 0}
            </Text>
            {button("Tạo / khôi phục nhóm", () => void run(ensureGroup))}
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
            {field(messageBody, setMessageBody, "Tin nhắn")}
            {button("Gửi nhóm", () => void run(sendChat), !group)}
            <Text style={styles.heading}>Log peer</Text>
            {logs.slice(0, 20).map((line, index) => (
              <Text key={index} style={styles.muted}>
                {line}
              </Text>
            ))}
          </>
        )}

        {tab === "discussion" && (
          <>
            <Text style={styles.heading}>Bảng thảo luận</Text>
            {field(discussionTitle, setDiscussionTitle, "Chủ đề")}
            {field(
              discussionBody,
              setDiscussionBody,
              "Nội dung cần lưu lâu dài",
              true,
            )}
            {button("Đăng", () => void run(saveDiscussion))}
            {discussions.map((discussion) => (
              <View key={discussion._id} style={styles.card}>
                <Text style={styles.strong}>{discussion.title}</Text>
                <Text>{discussion.body}</Text>
                <Text style={styles.muted}>
                  {discussion.author?.name} ·{" "}
                  {formatViDateTime(discussion.createdAt)}
                </Text>
                {userIdOf(discussion.author) === user._id &&
                  button(
                    "Xóa",
                    () =>
                      void run(async () => {
                        await api(
                          `/projects/${project._id}/discussions/${discussion._id}`,
                          json("DELETE"),
                        );
                        await loadProject(project._id, false);
                      }),
                    false,
                    true,
                  )}
              </View>
            ))}
          </>
        )}

        {tab === "documents" && (
          <>
            <Text style={styles.heading}>Tài liệu (tối đa 512 KiB)</Text>
            {button("Chọn và tải lên", () => void run(uploadDocument))}
            {documents.map((document) => (
              <View key={document._id} style={styles.card}>
                <Text>
                  {document.name} · {Math.ceil(document.size / 1024)} KiB
                </Text>
                {button(
                  "Tải / chia sẻ",
                  () => void run(() => downloadDocument(document)),
                  false,
                  true,
                )}
              </View>
            ))}
          </>
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
                )}
              </View>
            ))}
            {button(
              "Lưu",
              () => void run(saveResources),
              userIdOf(project.owner) !== user._id,
            )}
            <Text>
              Còn lại: {project.plannedBudget - project.spentBudget} VND · giờ
              chênh lệch: {project.actualHours - project.plannedHours}
            </Text>
          </>
        )}

        {tab === "members" && (
          <>
            <Text style={styles.heading}>Thành viên</Text>
            {members.map((member) => (
              <View key={member._id} style={styles.memberRow}>
                <View style={styles.memberText}>
                  <Text style={styles.strong}>{member.name}</Text>
                  <Text>{member.email}</Text>
                </View>
                {member._id !== userIdOf(project.owner) &&
                  user._id === userIdOf(project.owner) &&
                  button(
                    "Xóa",
                    () => void run(() => removeMember(member._id)),
                    false,
                    true,
                  )}
              </View>
            ))}
            {user._id === userIdOf(project.owner) && (
              <>
                {field(
                  memberEmail,
                  setMemberEmail,
                  "Email thành viên đã đăng ký",
                )}
                {button("Thêm thành viên", () => void run(addMember))}
              </>
            )}
          </>
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
                onPress={() =>
                  void run(() => openDirectConversation(contact))
                }
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
                outgoing ? styles.messageRowOutgoing : styles.messageRowIncoming,
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
      <Text style={styles.pageTitle}>Cá nhân</Text>
      <View style={styles.card}>
        <Text style={styles.strong}>{user.name}</Text>
        <Text>{user.email}</Text>
      </View>
      <Text style={styles.heading}>Nhắc deadline mặc định</Text>
      <Text style={styles.subtitle}>
        Áp dụng cho task được giao cho bạn và làm mặc định khi tạo sự kiện mới.
      </Text>
      <View style={styles.wrap}>
        {offsetLabels.map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => void run(() => setReminderPreference(value))}
            style={[styles.chip, offsets.includes(value) && styles.activeTab]}
          >
            <Text
              style={[
                styles.chipText,
                offsets.includes(value) && styles.activeTabText,
              ]}
            >
              {offsets.includes(value) ? "☑" : "☐"} {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.heading}>Google Calendar</Text>
      <Text>
        Đồng bộ một chiều task chưa hoàn thành được giao cho bạn cùng sự kiện cá
        nhân và sự kiện dự án. Mỗi mục dùng khóa ổn định để tránh tạo trùng.
      </Text>
      <Text style={styles.muted}>{googleEmail || "Chưa kết nối Google"}</Text>
      {button(
        "Kết nối Google",
        () => void run(async () => setGoogleEmail(await connectGoogle())),
      )}
      {button("Đồng bộ ngay", () => void run(syncGoogle), !googleEmail, true)}
      <Text style={styles.heading}>Tài khoản</Text>
      {button("Đăng xuất", () => void run(logout), false, true)}
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={styles.tabsContent}
      >
        {(Object.keys(projectTabLabels) as ProjectTab[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => {
              setPendingProjectEvent(null);
              setTab(item);
              if (item === "chat") void run(ensureGroup);
            }}
            style={[styles.tab, tab === item && styles.activeTab]}
          >
            <Text
              style={[styles.tabText, tab === item && styles.activeTabText]}
            >
              {projectTabLabels[item]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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
        style={[
          styles.chatSendButton,
          !directCanSend && styles.disabled,
        ]}
      >
        <Text style={styles.buttonText}>
          {directSending ? "Đang gửi…" : "Gửi"}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Student Planner</Text>
          <Text style={styles.userLine}>
            {user.name} · {user.email}
          </Text>
        </View>
      </View>
      {mainView === "calendar" && calendarToolbar}
      {mainView === "project" && projectToolbar}
      {mainView === "messages" && messagesToolbar}
      <ScrollView
        ref={contentScroll}
        key={`${mainView}-${mainView === "project" ? tab : ""}-${mainView === "messages" ? directContact?.id || "contacts" : ""}`}
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
      </ScrollView>
      {mainView === "messages" && directComposer}
      <View style={styles.bottomNav}>
        {(
          [
            ["calendar", "▣", "Lịch"],
            ["projects", "▤", "Dự án"],
            ["messages", "✉", "Tin nhắn"],
            ["account", "●", "Cá nhân"],
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
              style={styles.navItem}
            >
              <Text style={[styles.navIcon, active && styles.navActive]}>
                {icon}
              </Text>
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
  page: { flex: 1, backgroundColor: "#f1f5f9" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  contextToolbar: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    zIndex: 2,
    elevation: 3,
  },
  calendarToolbar: { paddingBottom: 10, gap: 5 },
  projectToolbar: { paddingBottom: 1 },
  messagesToolbar: { paddingBottom: 9 },
  contextTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0f172a",
    flexShrink: 1,
  },
  contextSubtitle: { color: "#64748b", fontSize: 12, lineHeight: 17 },
  toolbarLabel: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 13,
    marginTop: 2,
  },
  scopeRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  scopeChip: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  activeScopeChip: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  scopeChipText: { color: "#0f172a", fontWeight: "600" },
  activeScopeChipText: { color: "#fff", fontWeight: "700" },
  projectTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  content: { padding: 16, paddingBottom: 28, gap: 9 },
  loginContent: { padding: 22, paddingTop: 80, gap: 11 },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  userLine: { color: "#64748b", marginTop: 2 },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    flexShrink: 1,
  },
  subtitle: { color: "#64748b", lineHeight: 20 },
  heading: { fontSize: 18, fontWeight: "700", marginTop: 12, color: "#0f172a" },
  strong: { fontWeight: "700", fontSize: 16, color: "#0f172a" },
  muted: { fontSize: 12, color: "#64748b" },
  errorBox: {
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    padding: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  error: { color: "#991b1b", flex: 1 },
  errorClose: { color: "#991b1b", fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    color: "#0f172a",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 80 },
  button: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 8,
    marginRight: 4,
    marginBottom: 4,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#2563eb",
  },
  secondaryButtonText: { color: "#1d4ed8" },
  smallButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 7,
    marginRight: 4,
    marginBottom: 4,
  },
  disabled: { opacity: 0.4 },
  card: {
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    gap: 5,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  chip: {
    padding: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 8,
    margin: 2,
  },
  tabs: { flexGrow: 0, marginTop: 5, marginBottom: 7 },
  tabsContent: { alignItems: "center", paddingRight: 12 },
  tab: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginRight: 5,
  },
  tabText: { color: "#0f172a" },
  chipText: { color: "#0f172a" },
  activeTab: { backgroundColor: "#bfdbfe", borderColor: "#2563eb" },
  activeTabText: { color: "#1d4ed8", fontWeight: "700" },
  bar: {
    height: 10,
    backgroundColor: "#cbd5e1",
    borderRadius: 8,
    overflow: "hidden",
  },
  fill: { height: 10, backgroundColor: "#22c55e" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    padding: 10,
  },
  memberText: { flex: 1 },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  contactText: { flex: 1, minWidth: 0 },
  contactTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  contactPreview: { color: "#334155", marginTop: 4 },
  presenceDot: { width: 11, height: 11, borderRadius: 6 },
  presenceOnline: { backgroundColor: "#22c55e" },
  presenceOffline: { backgroundColor: "#94a3b8" },
  directStatusCard: {
    padding: 10,
    backgroundColor: "#e2e8f0",
    borderRadius: 9,
    gap: 6,
  },
  emptyCard: {
    padding: 16,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
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
  messageOutgoing: { backgroundColor: "#bfdbfe" },
  messageIncoming: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  messageFailed: { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
  messageBody: { color: "#0f172a", fontSize: 15, lineHeight: 20 },
  messageMeta: { color: "#64748b", fontSize: 10 },
  chatComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
  },
  chatComposerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    color: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  chatSendButton: {
    minHeight: 42,
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    paddingVertical: 7,
  },
  navItem: { flex: 1, alignItems: "center", gap: 2 },
  navIcon: { fontSize: 18, color: "#64748b" },
  navText: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  navActive: { color: "#2563eb", fontWeight: "800" },
});
