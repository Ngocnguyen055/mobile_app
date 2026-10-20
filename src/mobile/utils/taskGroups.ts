import type { Task, User } from "../services/api.ts";

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

function assigneeId(task: Task) {
  return typeof task.assignee === "string"
    ? task.assignee
    : task.assignee?._id || task.assignee?.id || "";
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
    group.tasks.sort((left, right) =>
      left.title.localeCompare(right.title, "vi", { sensitivity: "base" }),
    );

  return [...groups.values()].sort((left, right) => {
    if (left.isCurrentUser !== right.isCurrentUser)
      return left.isCurrentUser ? -1 : 1;
    if (left.key === "unassigned" || right.key === "unassigned")
      return left.key === "unassigned" ? 1 : -1;
    return left.name.localeCompare(right.name, "vi");
  });
}

export function orderTaskPeople<
  T extends { userId: string; name?: string },
>(
  people: T[],
  members: Pick<User, "_id" | "id" | "name">[],
  currentUserId: string,
) {
  const displayName = (person: T) =>
    person.name ||
    members.find(
      (member) => (member._id || member.id) === person.userId,
    )?.name ||
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
