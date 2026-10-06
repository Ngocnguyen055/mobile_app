import mongoose, { type ClientSession } from "mongoose";
import { Project, ProjectMember, User } from "./models.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type ProjectRole = "OWNER" | "MEMBER" | "DIRECTOR" | "MANAGER" | "EMPLOYEE";
export type ProjectDocument = mongoose.HydratedDocument<mongoose.InferSchemaType<typeof Project.schema>>;
export type ProjectPermissions = {
  manageMembers: boolean;
  manageTasks: boolean;
  manageProject: boolean;
  moderate: boolean;
  manageResources: boolean;
  createChildren: boolean;
  appointManager: boolean;
};
export type ProjectAccess = {
  project: ProjectDocument;
  root: ProjectDocument;
  role: ProjectRole;
  permissions: ProjectPermissions;
  archived: boolean;
};
export const idOf = (value: unknown): string => {
  if (value && typeof value === "object" && "_id" in value) return String(value._id);
  return String(value ?? "");
};
export const projectMemberIds = (project: { members?: unknown[] }): string[] =>
  [...new Set((project.members ?? []).map(idOf))];

/** Independent projects preserve shared task editing; hierarchy scopes all powers. */
export function permissionsForProject(kind: string, isChild: boolean, role: ProjectRole): ProjectPermissions {
  const independent = kind !== "hierarchical";
  const owner = role === "OWNER";
  const director = role === "DIRECTOR";
  const manager = isChild && role === "MANAGER";
  return {
    manageMembers: independent ? owner : director || manager,
    manageTasks: independent ? true : director || manager,
    manageProject: independent ? owner : director || manager,
    moderate: independent ? owner : director || manager,
    manageResources: independent ? owner : director || manager,
    createChildren: !independent && !isChild && director,
    appointManager: !independent && isChild && director,
  };
}

export async function projectAccess(projectId: string, userId: string, session?: ClientSession): Promise<ProjectAccess> {
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(userId))
    throw new HttpError(400, "invalid ID");
  const project = await Project.findById(projectId).session(session ?? null);
  if (!project) throw new HttpError(404, "project not found");
  const root = project.parentProject
    ? await Project.findById(project.parentProject).session(session ?? null)
    : project;
  if (!root) throw new HttpError(403, "project root missing");
  const independent = project.kind !== "hierarchical";
  const director = !independent && idOf(root.owner) === userId;
  if (!projectMemberIds(root).includes(userId) && !director)
    throw new HttpError(403, "project access denied");
  if (!projectMemberIds(project).includes(userId) && !director)
    throw new HttpError(403, "project access denied");
  let role: ProjectRole;
  if (independent) role = idOf(project.owner) === userId ? "OWNER" : "MEMBER";
  else if (director) role = "DIRECTOR";
  else {
    const membership = await ProjectMember.findOne({ project: project._id, user: userId }).session(session ?? null);
    // Manager mirror allows old schema hydration during the explicit migration only.
    role = project.parentProject && membership?.role === "MANAGER" && idOf(project.manager) === userId
      ? "MANAGER" : "EMPLOYEE";
  }
  return { project, root, role, permissions: permissionsForProject(project.kind, !!project.parentProject, role), archived: !!project.archived || !!root.archived };
}
export function requireWritable(access: ProjectAccess): void {
  if (access.archived) throw new HttpError(423, "project archived; read only");
}
export const assertWritable = requireWritable;
export function requirePermission(access: ProjectAccess, permission: keyof ProjectPermissions): void {
  if (!access.permissions[permission]) throw new HttpError(403, `permission denied: ${permission}`);
}

/** Retry the complete authorization + mutation when archive/member changes conflict. */
export async function withWritableProject<T>(
  projectId: string,
  userId: string,
  action: (access: ProjectAccess, session: ClientSession) => Promise<T>,
  permission?: keyof ProjectPermissions,
): Promise<T> {
  return mongoose.connection.transaction(async (session) => {
    const access = await lockWritableProject(projectId, userId, session, permission);
    return action(access, session);
  });
}

/** Also used when moving an event between project scopes in one transaction. */
export async function lockWritableProject(
  projectId: string, userId: string, session: ClientSession,
  permission?: keyof ProjectPermissions,
): Promise<ProjectAccess> {
  const access = await projectAccess(projectId, userId, session);
  requireWritable(access);
  if (permission) requirePermission(access, permission);
  const scopes = idOf(access.root._id) === idOf(access.project._id)
    ? [access.project] : [access.root, access.project];
  for (const scope of scopes) {
    scope.version = (scope.version || 1) + 1;
    await Project.updateOne({ _id: scope._id }, { $set: { version: scope.version } }, { session });
  }
  return access;
}

export async function accessibleProjectIds(userId: string, session?: ClientSession): Promise<string[]> {
  if (!mongoose.isValidObjectId(userId)) return [];
  const projects = await Project.find({ $or: [{ members: userId }, { owner: userId }] }).session(session ?? null);
  const directorRoots = projects.filter((p) => p.kind === "hierarchical" && !p.parentProject && idOf(p.owner) === userId);
  const children = directorRoots.length
    ? await Project.find({ parentProject: { $in: directorRoots.map((p) => p._id) } }).session(session ?? null)
    : [];
  // A removed root member never retains child access, even if stale mirror data exists.
  const rootIds = [...new Set(projects.filter((p) => p.parentProject).map((p) => idOf(p.parentProject)))];
  const roots = rootIds.length ? await Project.find({ _id: { $in: rootIds } }).session(session ?? null) : [];
  const visible = projects.filter((p) => !p.parentProject || roots.some((r) => idOf(r._id) === idOf(p.parentProject) && (projectMemberIds(r).includes(userId) || idOf(r.owner) === userId)));
  return [...new Set([...visible, ...children].map((p) => idOf(p._id)))];
}

export async function projectDto(access: ProjectAccess) {
  const { project, root, role, permissions, archived } = access;
  const ids = projectMemberIds(project);
  const [users, memberships, childManagers] = await Promise.all([
    User.find({ _id: { $in: ids } }).select("name email").lean(),
    ProjectMember.find({ project: project._id }).lean(),
    project.kind === "hierarchical" && !project.parentProject
      ? Project.distinct("manager", { parentProject: project._id, manager: { $in: ids } })
      : Promise.resolve([]),
  ]);
  return {
    ...project.toObject(),
    rootProject: idOf(root._id),
    parentProject: project.parentProject ? idOf(project.parentProject) : null,
    kind: project.kind || "independent",
    archived,
    myRole: role,
    permissions,
    // Directory display only; never grants management rights on the root project.
    childManagerIds: childManagers.map(idOf),
    members: users.map((user) => ({
      _id: idOf(user._id), name: user.name, email: user.email,
      role: memberships.find((m) => idOf(m.user) === idOf(user._id))?.role ??
        (project.kind === "hierarchical" ? idOf(user._id) === idOf(root.owner) ? "DIRECTOR" : "EMPLOYEE" : idOf(user._id) === idOf(project.owner) ? "OWNER" : "MEMBER"),
    })),
  };
}

export async function getProjectChatGroup(groupId: string) {
  const project = await Project.findOne({ chatGroupId: groupId });
  if (!project) return null;
  const root = project.parentProject ? await Project.findById(project.parentProject) : project;
  if (!root) return null;
  const rootMembers = new Set(projectMemberIds(root));
  return {
    id: groupId,
    ownerId: idOf(project.manager || root.owner),
    members: projectMemberIds(project).filter((id) => rootMembers.has(id) || id === idOf(root.owner)),
    version: project.chatRevision || 1,
    projectId: idOf(project._id),
    archived: !!project.archived || !!root.archived,
  };
}

export function effectiveTaskStatus(task: { status: string; dueAt?: Date | string | null }, now = Date.now()) {
  return task.status !== "done" && task.dueAt && +new Date(task.dueAt) < now ? "overdue" : task.status;
}
