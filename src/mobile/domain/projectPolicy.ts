import type {
  Project,
  ProjectChildSummary,
  ProjectRole,
  Task,
  User,
} from "../services/api.ts";

export const roleLabels: Record<ProjectRole, string> = {
  OWNER: "Chủ dự án",
  MEMBER: "Thành viên",
  DIRECTOR: "Giám đốc",
  MANAGER: "Trưởng phòng",
  EMPLOYEE: "Nhân viên",
};
const memberNameOrder = new Intl.Collator("vi", {
  sensitivity: "base",
  numeric: true,
});
const memberRoleOrder: Record<ProjectRole, number> = {
  DIRECTOR: 0,
  OWNER: 0,
  MANAGER: 1,
  EMPLOYEE: 2,
  MEMBER: 2,
};

/** Root summaries show child managers without changing their root membership role. */
export function memberDisplayRole(project: Project, member: User): ProjectRole {
  if (member.role === "DIRECTOR" || member.role === "OWNER") return member.role;
  if (project.kind === "hierarchical" && !project.parentProject) {
    const managesChild = project.childManagerIds
      ? project.childManagerIds.includes(member._id)
      : project.children?.some((child) =>
          "managerId" in child
            ? child.managerId === member._id
            : child.members.some(
                (candidate) =>
                  typeof candidate !== "string" &&
                  candidate._id === member._id &&
                  candidate.role === "MANAGER",
              ),
        );
    if (managesChild) return "MANAGER";
  }
  return (
    member.role || (project.kind === "hierarchical" ? "EMPLOYEE" : "MEMBER")
  );
}

export function orderedProjectMembers(
  project: Project,
  currentUserId = "",
): User[] {
  return project.members
    .filter((member): member is User => typeof member !== "string")
    .sort(
      (left, right) => {
        const roleOrder =
          memberRoleOrder[memberDisplayRole(project, left)] -
          memberRoleOrder[memberDisplayRole(project, right)];
        if (roleOrder) return roleOrder;
        const currentUserOrder =
          Number(right._id === currentUserId) -
          Number(left._id === currentUserId);
        return (
          currentUserOrder ||
          memberNameOrder.compare(left.name.trim(), right.name.trim()) ||
          memberNameOrder.compare(left.email, right.email) ||
          left._id.localeCompare(right._id)
        );
      },
    );
}

export const idOf = (user?: User | string | null) =>
  typeof user === "string" ? user : user?._id || user?.id || "";
export function canChangeTaskStatus(
  project: Project,
  task: Task,
  userId: string,
) {
  return (
    !project.archived &&
    (project.permissions.manageTasks || idOf(task.assignee) === userId)
  );
}
export function effectiveTaskStatus(
  task: Pick<Task, "status" | "dueAt">,
  now = Date.now(),
) {
  return task.status !== "done" &&
    task.dueAt &&
    new Date(task.dueAt).getTime() < now
    ? "overdue"
    : task.status;
}
export const taskStatusLabels = {
  todo: "Chưa làm",
  doing: "Đang làm",
  done: "Hoàn thành",
  overdue: "Quá hạn",
};
export function managedProjectsForMember(
  project: Project,
  memberId: string,
): Array<Project | ProjectChildSummary> {
  if (project.parentProject)
    return project.manager === memberId ? [project] : [];
  return (project.children || []).filter((child) =>
    "managerId" in child
      ? child.managerId === memberId
      : child.members.some(
          (member) =>
            idOf(member) === memberId &&
            typeof member !== "string" &&
            member.role === "MANAGER",
        ),
  );
}
