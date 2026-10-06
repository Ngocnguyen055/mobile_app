import type { Express, Request } from "express";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import { Project, ProjectMember, Task, User } from "./models.ts";
import { emitNotification } from "./notifications.ts";
import {
  HttpError, projectAccess, projectDto, accessibleProjectIds, projectMemberIds,
  requirePermission, requireWritable, idOf, effectiveTaskStatus,
  type ProjectAccess, type ProjectDocument, type ProjectRole,
} from "./projectAccess.ts";
export { withWritableProject } from "./projectAccess.ts";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().positive().optional();
const projectFields = { name: z.string().trim().min(1).max(120), description: z.string().max(2000).default("") };
const projectId = (req: Request) => String(req.params.projectId);
const transaction = <T>(action: (session: ClientSession) => Promise<T>): Promise<T> =>
  mongoose.connection.transaction(action);

function checkVersion(access: ProjectAccess, expected?: number) {
  if (expected !== undefined && expected !== (access.project.version || 1))
    throw new HttpError(409, "project version conflict; reload");
}
async function touch(project: ProjectDocument, session: ClientSession, chat = false) {
  project.version = (project.version || 1) + 1;
  if (chat) project.chatRevision = (project.chatRevision || 1) + 1;
  await Project.updateOne({ _id: project._id }, { $set: {
    version: project.version, ...(chat ? { chatRevision: project.chatRevision } : {}),
  } }, { session });
}
/** Writing the root serializes child mutations against root member removal/archive. */
async function touchScope(access: ProjectAccess, session: ClientSession, chat = false) {
  if (idOf(access.root._id) !== idOf(access.project._id)) await touch(access.root, session);
  await touch(access.project, session, chat);
}
async function setMember(project: ProjectDocument, userId: string, role: ProjectRole, session: ClientSession) {
  await ProjectMember.updateOne({ project: project._id, user: userId }, { $set: { role } }, { upsert: true, session });
  await Project.updateOne({ _id: project._id }, { $addToSet: { members: userId } }, { session });
  if (!projectMemberIds(project).includes(userId)) project.members.push(new mongoose.Types.ObjectId(userId));
}
async function memberUser(input: { userId?: string; email?: string }, session: ClientSession) {
  const user = await User.findOne(input.userId ? { _id: input.userId } : { email: input.email!.toLowerCase() }).session(session);
  if (!user) throw new HttpError(404, "user not found");
  return user;
}
async function appoint(access: ProjectAccess, userId: string, session: ClientSession) {
  requirePermission(access, "appointManager");
  if (userId === idOf(access.root.owner)) throw new HttpError(400, "director cannot be appointed manager");
  if (!projectMemberIds(access.root).includes(userId)) throw new HttpError(400, "manager must belong to root project");
  if (access.project.manager) {
    await ProjectMember.updateOne({ project: access.project._id, user: access.project.manager }, { $set: { role: "EMPLOYEE" } }, { session });
  }
  await setMember(access.project, userId, "MANAGER", session);
  access.project.manager = new mongoose.Types.ObjectId(userId);
  await Project.updateOne({ _id: access.project._id }, { $set: { manager: userId } }, { session });
}

export function installProjectRoutes(app: Express) {
  app.get("/projects", async (req, res) => {
    const ids = await accessibleProjectIds(req.userId!);
    const projects = await Project.find({ _id: { $in: ids } }).sort({ updatedAt: -1 });
    return res.json(await Promise.all(projects.map(async (p) => projectDto(await projectAccess(p.id, req.userId!)))));
  });
  app.post("/projects", async (req, res) => {
    const data = z.object({ ...projectFields, kind: z.enum(["independent", "hierarchical"]).default("independent") }).strict().parse(req.body);
    const id = await transaction(async (session) => {
      const [project] = await Project.create([{ ...data, owner: req.userId, members: [req.userId] }], { session });
      await setMember(project, req.userId!, data.kind === "hierarchical" ? "DIRECTOR" : "OWNER", session);
      return project.id;
    });
    return res.status(201).json(await projectDto(await projectAccess(id, req.userId!)));
  });
  app.get("/projects/:projectId", async (req, res) => {
    const access = await projectAccess(projectId(req), req.userId!);
    const dto = await projectDto(access);
    const children = access.project.kind === "hierarchical" && !access.project.parentProject
      ? await Project.find({ parentProject: access.project._id, _id: { $in: await accessibleProjectIds(req.userId!) } }).sort({ createdAt: 1 }) : [];
    return res.json({ ...dto, children: await Promise.all(children.map(async (p) => projectDto(await projectAccess(p.id, req.userId!)))) });
  });
  app.post("/projects/:projectId/children", async (req, res) => {
    const input = z.object({ ...projectFields, managerId: objectId, memberIds: z.array(objectId).max(200).default([]), version }).strict().parse(req.body);
    const id = await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "createChildren"); requireWritable(access); checkVersion(access, input.version);
      const rootMembers = projectMemberIds(access.project);
      if (input.managerId === idOf(access.root.owner)) throw new HttpError(400, "choose a member other than director as manager");
      const ids = [...new Set([req.userId!, input.managerId, ...input.memberIds])];
      if (!ids.every((id) => rootMembers.includes(id))) throw new HttpError(400, "child members must belong to root project");
      const [child] = await Project.create([{
        name: input.name, description: input.description, kind: "hierarchical", parentProject: access.project._id,
        owner: access.root.owner, manager: input.managerId, members: ids,
      }], { session });
      await ProjectMember.insertMany(ids.map((id) => ({ project: child._id, user: id, role: id === req.userId ? "DIRECTOR" : id === input.managerId ? "MANAGER" : "EMPLOYEE" })), { session });
      await touchScope(access, session);
      await emitNotification({ actorId: req.userId!, recipientIds: ids, projectId: child.id, type: "project_member_added", title: `Bạn được thêm vào dự án ${child.name}`, session });
      return child.id;
    });
    return res.status(201).json(await projectDto(await projectAccess(id, req.userId!)));
  });
  app.post("/projects/:projectId/members", async (req, res) => {
    const input = z.object({ email: z.string().email().optional(), userId: objectId.optional(), version }).strict()
      .refine((v) => !!v.email !== !!v.userId, "provide either email or userId").parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageMembers"); requireWritable(access); checkVersion(access, input.version);
      const user = await memberUser(input, session);
      if (projectMemberIds(access.project).includes(user.id)) return;
      if (access.project.parentProject && !projectMemberIds(access.root).includes(user.id)) {
        if (access.role !== "DIRECTOR") throw new HttpError(400, "choose an existing root project member");
        await setMember(access.root, user.id, "EMPLOYEE", session);
        await touch(access.root, session, true);
        await emitNotification({ actorId: req.userId!, recipientIds: [user.id], projectId: access.root.id, type: "project_member_added", title: `Bạn được thêm vào dự án ${access.root.name}`, session });
      }
      await setMember(access.project, user.id, access.project.kind === "hierarchical" ? "EMPLOYEE" : "MEMBER", session);
      await touchScope(access, session, true);
      await emitNotification({ actorId: req.userId!, recipientIds: [user.id], projectId: access.project.id, type: "project_member_added", title: `Bạn được thêm vào dự án ${access.project.name}`, session });
    });
    return res.json(await projectDto(await projectAccess(projectId(req), req.userId!)));
  });
  app.put("/projects/:projectId/manager", async (req, res) => {
    const input = z.object({ userId: objectId, version }).strict().parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requireWritable(access); checkVersion(access, input.version);
      await appoint(access, input.userId, session);
      await touchScope(access, session, true);
      await emitNotification({ actorId: req.userId!, recipientIds: [input.userId], projectId: access.project.id, type: "manager_appointed", title: `Bạn được bổ nhiệm Trưởng phòng: ${access.project.name}`, session });
    });
    return res.json(await projectDto(await projectAccess(projectId(req), req.userId!)));
  });
  app.delete("/projects/:projectId/members/:userId", async (req, res) => {
    const input = z.object({ version, reassignTo: objectId.nullable().optional(), replacementManagers: z.array(z.object({ projectId: objectId, userId: objectId }).strict()).max(200).default([]) }).strict().parse(req.body ?? {});
    const removedId = objectId.parse(String(req.params.userId));
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageMembers"); requireWritable(access); checkVersion(access, input.version);
      if (removedId === idOf(access.root.owner)) throw new HttpError(403, "cannot remove project owner/director");
      if (!projectMemberIds(access.project).includes(removedId)) return;
      const children = access.project.kind === "hierarchical" && !access.project.parentProject
        ? await Project.find({ parentProject: access.project._id, members: removedId }).session(session) : [];
      const scopes = [access.project, ...children];
      for (const scope of scopes) {
        if (idOf(scope.manager) === removedId) {
          if (access.role !== "DIRECTOR") throw new HttpError(403, "only director can replace manager");
          const replacement = input.replacementManagers.find((item) => item.projectId === scope.id);
          if (!replacement || replacement.userId === removedId) throw new HttpError(409, `manager replacement required: ${scope.id}`);
          await appoint(await projectAccess(scope.id, req.userId!, session), replacement.userId, session);
          if (!projectMemberIds(scope).includes(replacement.userId)) scope.members.push(new mongoose.Types.ObjectId(replacement.userId));
          await emitNotification({ actorId: req.userId!, recipientIds: [replacement.userId], projectId: scope.id, type: "manager_appointed", title: `Bạn được bổ nhiệm Trưởng phòng: ${scope.name}`, session });
        }
        if (input.reassignTo && (input.reassignTo === removedId || !projectMemberIds(scope).includes(input.reassignTo)))
          throw new HttpError(400, `replacement assignee must belong to affected project: ${scope.id}`);
      }
      for (const scope of scopes) {
        await ProjectMember.deleteOne({ project: scope._id, user: removedId }, { session });
        await Project.updateOne({ _id: scope._id }, { $pull: { members: removedId } }, { session });
        await Task.updateMany({ project: scope._id, assignee: removedId }, {
          ...(input.reassignTo ? { $set: { assignee: input.reassignTo } } : { $unset: { assignee: 1 } }), $inc: { version: 1 },
        }, { session });
        await touch(scope, session, true);
        if (input.reassignTo) await emitNotification({ actorId: req.userId!, recipientIds: [input.reassignTo], projectId: scope.id, type: "task_assigned", title: "Công việc đã được chuyển giao cho bạn", session });
      }
      if (access.project.parentProject) await touch(access.root, session);
    });
    return res.json({ ok: true });
  });
  app.patch("/projects/:projectId", async (req, res) => {
    const input = z.object({ name: projectFields.name.optional(), description: z.string().max(2000).optional(), version }).strict().parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageProject"); requireWritable(access); checkVersion(access, input.version);
      const data = { ...input }; delete data.version;
      await Project.updateOne({ _id: access.project._id }, { $set: data }, { session });
      await touchScope(access, session);
      await emitNotification({ actorId: req.userId!, recipientIds: projectMemberIds(access.project), projectId: access.project.id, type: "project_updated", title: `Dự án ${access.project.name} được cập nhật`, session });
    });
    return res.json(await projectDto(await projectAccess(projectId(req), req.userId!)));
  });
  app.patch("/projects/:projectId/archive", async (req, res) => {
    const input = z.object({ archived: z.boolean(), restoreChildren: z.boolean().optional(), version }).strict().parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageProject"); checkVersion(access, input.version);
      if (access.project.parentProject && access.root.archived && !input.archived)
        throw new HttpError(423, "restore root project first");
      await Project.updateOne({ _id: access.project._id }, { $set: { archived: input.archived } }, { session });
      await touchScope(access, session, true);
      if (access.project.kind === "hierarchical" && !access.project.parentProject && (input.archived || input.restoreChildren)) {
        await Project.updateMany({ parentProject: access.project._id }, { $set: { archived: input.archived }, $inc: { version: 1, chatRevision: 1 } }, { session });
      }
      await emitNotification({ actorId: req.userId!, recipientIds: projectMemberIds(access.project), projectId: access.project.id, type: "project_updated", title: input.archived ? `Dự án ${access.project.name} được lưu trữ` : `Dự án ${access.project.name} được khôi phục`, session });
    });
    return res.json(await projectDto(await projectAccess(projectId(req), req.userId!)));
  });
  app.patch("/projects/:projectId/resources", async (req, res) => {
    const input = z.object({ plannedHours: z.number().finite().min(0), actualHours: z.number().finite().min(0), plannedBudget: z.number().finite().min(0), spentBudget: z.number().finite().min(0), version }).strict().parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageResources"); requireWritable(access); checkVersion(access, input.version);
      const data = { ...input }; delete data.version;
      await Project.updateOne({ _id: access.project._id }, { $set: data }, { session });
      await touchScope(access, session);
    });
    return res.json(await projectDto(await projectAccess(projectId(req), req.userId!)));
  });
  // Kept for older clients; group identity is server owned and never overwritten by a client.
  app.post("/projects/:projectId/chat-group", async (req, res) => {
    const access = await projectAccess(projectId(req), req.userId!);
    return res.json({ chatGroupId: access.project.chatGroupId, chatRevision: access.project.chatRevision || 1 });
  });
  app.get("/projects/:projectId/progress", async (req, res) => {
    const access = await projectAccess(projectId(req), req.userId!);
    const scopes = access.project.kind === "hierarchical" && !access.project.parentProject
      ? [access.project, ...await Project.find({ parentProject: access.project._id, _id: { $in: await accessibleProjectIds(req.userId!) } })] : [access.project];
    const tasks = await Task.find({ project: { $in: scopes.map((p) => p._id) } }).sort({ dueAt: 1 }).lean();
    const users = await User.find({ _id: { $in: [...new Set(scopes.flatMap(projectMemberIds))] } }).select("name email").lean();
    const now = Date.now();
    const withStatus = tasks.map((task) => ({ ...task, effectiveStatus: effectiveTaskStatus(task, now), projectName: scopes.find((p) => p.id === idOf(task.project))?.name }));
    const count = (scopeTasks: typeof withStatus) => ({
      total: scopeTasks.length, done: scopeTasks.filter((t) => t.status === "done").length,
      dueSoon: scopeTasks.filter((t) => t.status !== "done" && t.dueAt && +t.dueAt >= now && +t.dueAt < now + 86400000).length,
      overdue: scopeTasks.filter((t) => t.effectiveStatus === "overdue").length,
    });
    return res.json({
      ...count(withStatus),
      byProject: scopes.map((p) => ({ projectId: p.id, name: p.name, ...count(withStatus.filter((t) => idOf(t.project) === p.id)) })),
      byPerson: users.map((user) => {
        const mine = withStatus.filter((t) => idOf(t.assignee) === idOf(user._id));
        return { userId: idOf(user._id), name: user.name, ...count(mine), tasks: mine };
      }),
    });
  });
}
