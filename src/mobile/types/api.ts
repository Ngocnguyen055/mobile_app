export type ProjectRole =
  "OWNER" | "MEMBER" | "DIRECTOR" | "MANAGER" | "EMPLOYEE";
export type User = {
  _id: string;
  id?: string;
  name: string;
  email: string;
  role?: ProjectRole;
};
export type ChatContact = {
  id: string;
  name: string;
  email: string
};
export type ProjectSummary = {
  _id: string;
  name: string
};
export type ProjectChildSummary = {
  _id: string;
  name: string;
  description: string;
  managerId: string;
  manager: User | null;
  memberCount: number;
  archived: boolean;
  version: number;
  accessible: boolean;
  managedByMe: boolean;
  progress: {
    total: number;
    done: number;
    overdue: number;
    percent: number;
  };
};
export type Project = {
  _id: string;
  createdAt?: string;
  updatedAt?: string;
  name: string;
  description: string;
  owner: string;
  members: (User | string)[];
  plannedHours: number;
  actualHours: number;
  plannedBudget: number;
  spentBudget: number;
  chatGroupId?: string;
  kind: "independent" | "hierarchical";
  manager?: string | null;
  parentProject: string | null;
  rootProject: string;
  children?: Array<ProjectChildSummary | Project>;
  childManagerIds?: string[];
  myRole: ProjectRole;
  version: number;
  archived: boolean;
  permissions: {
    manageMembers: boolean;
    manageTasks: boolean;
    manageProject: boolean;
    moderate: boolean;
    manageResources: boolean;
    createChildren: boolean;
    appointManager: boolean;
  };
};
export type Task = {
  _id: string;
  project: string | ProjectSummary;
  title: string;
  description: string;
  assignee?: User | string;
  startsAt?: string | null;
  dueAt?: string | null;
  status: "todo" | "doing" | "done";
  version: number;
};
export type CalendarEvent = {
  _id: string;
  project?: string | ProjectSummary | null;
  createdBy?: string | User;
  title: string;
  startsAt: string;
  endsAt: string;
  note: string;
  allDay: boolean;
  reminderOffsets: number[];
};
export type CalendarFeed = {
  tasks: Task[];
  events: CalendarEvent[]
};
export type Discussion = {
  _id: string;
  title: string;
  body: string;
  author: User;
  createdAt: string;
  hidden: boolean;
  revision: number;
  attachments: DocumentRow[];
  commentCount: number;
};
export type DiscussionComment = {
  _id: string;
  body: string;
  author: User;
  revision: number;
  createdAt: string;
};
export type InboxNotification = {
  _id: string;
  type: string;
  title: string;
  body: string;
  project: ProjectSummary | null;
  actor: User | null;
  entityId?: string;
  readAt: string | null;
  createdAt: string;
};
export type DocumentRow = {
  _id: string;
  name: string;
  size: number;
  mime: string;
};
export type Progress = {
  total: number;
  done: number;
  dueSoon: number;
  overdue: number;
  byPerson: {
    userId: string;
    name?: string;
    total: number;
    done: number;
    tasks?: Task[];
  }[];
  byProject?: {
    projectId: string;
    name: string;
    total: number;
    done: number;
    overdue: number;
  }[];
};
