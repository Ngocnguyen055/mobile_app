import type {
  Project,
  ProjectRole,
  Task,
  User,
} from "../services/api.ts";
import { memberDisplayRole } from "../domain/projectPolicy.ts";

const taskAssigneeNameOrder = new Intl.Collator("vi", {
  sensitivity: "base",
  numeric: true,
});
const taskAssigneeRoleOrder: Record<ProjectRole, number> = {
  DIRECTOR: 0,
  OWNER: 0,
  MANAGER: 1,
  EMPLOYEE: 2,
  MEMBER: 2,
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

export type TaskAssigneeGroup = {
  key: string;
  name: string;
  isCurrentUser: boolean;
  tasks: Task[];
};

/** Hierarchical projects always display the business role used in task forms. */
export function taskAssigneeRole(
  project: Project,
  member: User,
): ProjectRole {
  const role = memberDisplayRole(project, member);
  if (project.kind !== "hierarchical") return role;
  if (
    member._id === project.owner ||
    role === "DIRECTOR" ||
    role === "OWNER"
  )
    return "DIRECTOR";
  if (member._id === project.manager || role === "MANAGER") return "MANAGER";
  return "EMPLOYEE";
}

/** The task picker puts the current user first, then hierarchy roles and names. */
export function orderTaskAssignees(
  project: Project,
  members: User[],
  currentUserId: string,
) {
  return [...members].sort((left, right) => {
    const currentUserOrder =
      Number(right._id === currentUserId) -
      Number(left._id === currentUserId);
    if (currentUserOrder) return currentUserOrder;
    if (project.kind === "hierarchical") {
      const roleOrder =
        taskAssigneeRoleOrder[taskAssigneeRole(project, left)] -
        taskAssigneeRoleOrder[taskAssigneeRole(project, right)];
      if (roleOrder) return roleOrder;
    }
    return (
      taskAssigneeNameOrder.compare(left.name.trim(), right.name.trim()) ||
      taskAssigneeNameOrder.compare(left.email, right.email) ||
      left._id.localeCompare(right._id)
    );
  });
}

function assigneeId(task: Task) {
  return typeof task.assignee === "string"
    ? task.assignee
    : task.assignee?._id || task.assignee?.id || "";
}

function dateOrder(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

/** Active work comes first, followed by deadline and FIFO creation order. */
export function compareTasksForDisplay(left: Task, right: Task) {
  const completionOrder =
    Number(left.status === "done") - Number(right.status === "done");
  if (completionOrder) return completionOrder;
  const deadlineOrder = dateOrder(left.dueAt) - dateOrder(right.dueAt);
  if (deadlineOrder) return deadlineOrder;
  const creationOrder = dateOrder(left.createdAt) - dateOrder(right.createdAt);
  if (creationOrder) return creationOrder;
  return (
    left.title.localeCompare(right.title, "vi", { sensitivity: "base" }) ||
    left._id.localeCompare(right._id)
  );
}

export function groupTasksByAssignee(
  tasks: Task[],
  members: Pick<User, "_id" | "id" | "name">[],
  currentUserId: string,
): TaskAssigneeGroup[] {
  const groups = new Map<string, TaskAssigneeGroup>();

  for (const task of tasks) {
    const id = assigneeId(task);
    const key = id || "unassigned";
    const populatedName =
      typeof task.assignee === "object" ? task.assignee?.name : undefined;
    const memberName = members.find(
      (member) => (member._id || member.id) === id,
    )?.name;
    const group = groups.get(key) || {
      key,
      name: id ? populatedName || memberName || id : "Chưa phân công",
      isCurrentUser: id === currentUserId,
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(key, group);
  }

  for (const group of groups.values())
    group.tasks.sort(compareTasksForDisplay);

  return [...groups.values()].sort((left, right) => {
    if (left.isCurrentUser !== right.isCurrentUser)
      return left.isCurrentUser ? -1 : 1;
    if (left.key === "unassigned" || right.key === "unassigned")
      return left.key === "unassigned" ? 1 : -1;
    return left.name.localeCompare(right.name, "vi");
  });
}

export function orderTaskPeople<T extends { userId: string; name?: string }>(
  people: T[],
  members: Pick<User, "_id" | "id" | "name">[],
  currentUserId: string,
) {
  const displayName = (person: T) =>
    person.name ||
    members.find((member) => (member._id || member.id) === person.userId)
      ?.name ||
    person.userId;

  return [...people].sort((left, right) => {
    const leftIsCurrent = left.userId === currentUserId;
    const rightIsCurrent = right.userId === currentUserId;
    if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
    if (!left.userId || !right.userId) return !left.userId ? 1 : -1;
    return displayName(left).localeCompare(displayName(right), "vi", {
      sensitivity: "base",
    });
  });
}

export function filterTaskMembers(
  members: Pick<User, "_id" | "id" | "name" | "email">[],
  query: string,
) {
  const keyword = normalizeSearch(query);
  if (!keyword) return members;
  return members.filter((member) =>
    normalizeSearch(`${member.name} ${member.email || ""}`).includes(keyword),
  );
}
