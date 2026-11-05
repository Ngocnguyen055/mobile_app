import type { Request } from "express";
import mongoose, { type ClientSession } from "mongoose";
import {
  Project,
  ProjectMember,
  User
} from "../models.ts";
import {
  HttpError,
  idOf,
  projectMemberIds,
  requirePermission,
  type ProjectAccess,
  type ProjectDocument,
  type ProjectRole,
} from "../projectAccess.ts";

export const projectId = (req: Request) => String(req.params.projectId);
export const transaction = <T>(
  action: (session: ClientSession) => Promise<T>,
): Promise<T> => mongoose.connection.transaction(action);

export function checkVersion(access: ProjectAccess, expected?: number) {
  if (expected !== undefined && expected !== (access.project.version || 1))
    throw new HttpError(409, "project version conflict; reload");
}
export async function touch(
  project: ProjectDocument,
  session: ClientSession,
  chat = false,
) {
  project.version = (project.version || 1) + 1;
  if (chat) project.chatRevision = (project.chatRevision || 1) + 1;
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        version: project.version,
        ...(chat ? { chatRevision: project.chatRevision } : {}),
      },
    },
    { session },
  );
}
/** Writing the root serializes child mutations against root member removal/archive. */
export async function touchScope(
  access: ProjectAccess,
  session: ClientSession,
  chat = false,
) {
  if (idOf(access.root._id) !== idOf(access.project._id))
    await touch(access.root, session);
  await touch(access.project, session, chat);
}
export async function setMember(
  project: ProjectDocument,
  userId: string,
  role: ProjectRole,
  session: ClientSession,
) {
  await ProjectMember.updateOne(
    { project: project._id, user: userId },
    { $set: { role } },
    { upsert: true, session },
  );
  await Project.updateOne(
    { _id: project._id },
    { $addToSet: { members: userId } },
    { session },
  );
  if (!projectMemberIds(project).includes(userId))
    project.members.push(new mongoose.Types.ObjectId(userId));
}
export async function memberUser(
  input: {
    userId?: string;
    email?: string
  },
  session: ClientSession,
) {
  const user = await User.findOne(
    input.userId
      ? { _id: input.userId }
      : { email: input.email!.toLowerCase() },
  ).session(session);
  if (!user) throw new HttpError(404, "user not found");
  return user;
}
export async function appoint(
  access: ProjectAccess,
  userId: string,
  session: ClientSession,
) {
  requirePermission(access, "appointManager");
  if (userId === idOf(access.root.owner))
    throw new HttpError(400, "director cannot be appointed manager");
  if (!projectMemberIds(access.root).includes(userId))
    throw new HttpError(400, "manager must belong to root project");
  if (access.project.manager) {
    await ProjectMember.updateOne(
      { project: access.project._id, user: access.project.manager },
      { $set: { role: "EMPLOYEE" } },
      { session },
    );
  }
  await setMember(access.project, userId, "MANAGER", session);
  access.project.manager = new mongoose.Types.ObjectId(userId);
  await Project.updateOne(
    { _id: access.project._id },
    { $set: { manager: userId } },
    { session },
  );
}
