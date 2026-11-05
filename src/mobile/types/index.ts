export type AuthMode = "login" | "register";

export type EventDraft = {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reminderOffsets: number[];
  projectId: string | null;
};

export type MainView =
  | "calendar"
  | "projects"
  | "project"
  | "messages"
  | "account"
  | "notifications";

export type ProjectTab =
  | "overview"
  | "children"
  | "tasks"
  | "calendar"
  | "progress"
  | "chat"
  | "discussion"
  | "resources"
  | "members"
  | "management";

export const projectTabLabels: Record<ProjectTab, string> = {
  overview: "Tổng quan",
  children: "Dự án con",
  tasks: "Task",
  calendar: "Lịch",
  progress: "Tiến độ",
  chat: "Chat",
  discussion: "Thảo luận",
  resources: "Nguồn lực",
  members: "Thành viên",
  management: "Quản lý",
};
