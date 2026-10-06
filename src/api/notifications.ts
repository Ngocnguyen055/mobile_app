import type { Express } from "express";
import { Types, type ClientSession } from "mongoose";
import { z } from "zod";
import { Discussion, Notification, Project, Task } from "./models.ts";
import { accessibleProjectIds, HttpError, idOf, projectAccess } from "./projectAccess.ts";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export interface NotificationInput {
  actorId?: string | null;
  recipientIds: string[];
  projectId: string;
  type: string;
  title: string;
  body?: string;
  entityId?: string;
  dedupeKey?: string;
  session?: ClientSession;
}

/** Scope and de-duplicate recipients before writing the durable inbox. */
export function notificationRecipients(
  candidates: string[],
  memberIds: string[],
  actorId?: string | null,
) {
  const members = new Set(memberIds);
  return [...new Set(candidates)].filter(
    (id) => id !== actorId && members.has(id),
  );
}

export async function emitNotification(input: NotificationInput) {
  const project = await Project.findById(input.projectId)
    .select("members")
    .session(input.session ?? null)
    .lean();
  if (!project) return;
  const recipients = notificationRecipients(
    input.recipientIds,
    project.members.map(String),
    input.actorId,
  );
  if (!recipients.length) return;
  const rows = recipients.map((user) => ({
    user: new Types.ObjectId(user),
    actor: input.actorId ? new Types.ObjectId(input.actorId) : null,
    project: new Types.ObjectId(input.projectId),
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    entityId: input.entityId,
    dedupeKey: input.dedupeKey,
    readAt: null,
  }));
  if (input.dedupeKey) {
    await Notification.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { user: row.user, dedupeKey: input.dedupeKey },
          update: { $setOnInsert: row },
          upsert: true,
        },
      })),
      { session: input.session },
    );
  } else {
    await Notification.insertMany(rows, { session: input.session });
  }
}

export async function notifyProject(
  projectId: string,
  actorId: string,
  type: string,
  title: string,
  entityId?: string,
  body?: string,
) {
  const project = await Project.findById(projectId).select("members").lean();
  if (!project) return;
  await emitNotification({
    projectId,
    actorId,
    recipientIds: project.members.map(String),
    type,
    title,
    body,
    entityId,
  });
}

export function installNotificationRoutes(app: Express) {
  app.get("/notifications", async (req, res) => {
    const { limit } = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).strict().parse(req.query);
    const projects = await accessibleProjectIds(req.userId!);
    const items = await Notification.find({
      user: req.userId,
      project: { $in: projects },
    }).sort({ createdAt: -1, _id: -1 }).limit(limit)
      .populate("actor", "name email").populate("project", "name")
      .select("-dedupeKey -__v");
    // Hiding a post also hides its old notification previews from regular members.
    const postIds = items.filter((item) =>
      ["discussion_created", "comment_created"].includes(item.type) &&
      objectId.safeParse(item.entityId).success,
    ).map((item) => item.entityId!);
    if (!postIds.length) return res.json(items);
    const hidden = await Discussion.find({ _id: { $in: postIds }, hidden: true })
      .select("project author").lean();
    const blocked = new Set<string>();
    const moderators = new Map<string, boolean>();
    for (const post of hidden) {
      if (String(post.author) === req.userId) continue;
      const projectId = idOf(post.project);
      if (!moderators.has(projectId)) {
        const access = await projectAccess(projectId, req.userId!);
        moderators.set(projectId, access.permissions.moderate);
      }
      if (!moderators.get(projectId)) blocked.add(String(post._id));
    }
    return res.json(items.filter((item) => !blocked.has(item.entityId ?? "")));
  });
  app.patch("/notifications/read-all", async (req, res) => {
    const projects = await accessibleProjectIds(req.userId!);
    await Notification.updateMany({
      user: req.userId, project: { $in: projects }, readAt: null,
    }, { $set: { readAt: new Date() } });
    return res.json({ ok: true });
  });
  app.patch("/notifications/:notificationId/read", async (req, res) => {
    const id = objectId.parse(req.params.notificationId);
    const projects = await accessibleProjectIds(req.userId!);
    const item = await Notification.findOneAndUpdate({
      _id: id, user: req.userId, project: { $in: projects },
    }, { $set: { readAt: new Date() } }, { new: true }).select("-dedupeKey -__v");
    if (!item) return res.sendStatus(404);
    return res.json(item);
  });
}

/** Durable inbox only; Android's local notifications remain a separate mechanism. */
export async function runDeadlineNotifications(now = new Date()) {
  const tasks = await Task.find({
    assignee: { $ne: null }, status: { $ne: "done" },
    dueAt: { $gt: now, $lte: new Date(+now + 86400000) },
  }).select("project assignee title dueAt").lean();
  for (const task of tasks) {
    if (!task.assignee || !task.dueAt) continue;
    let access;
    try {
      access = await projectAccess(String(task.project), String(task.assignee));
    } catch (error) {
      // Removed members and missing projects do not receive reminder metadata.
      if (error instanceof HttpError && [403, 404].includes(error.status)) continue;
      throw error;
    }
    if (access.archived) continue;
    await emitNotification({
      projectId: String(task.project), recipientIds: [String(task.assignee)],
      type: "task_deadline", title: `Task sắp đến hạn: ${task.title}`,
      entityId: String(task._id),
      dedupeKey: `deadline:${task._id}:${task.dueAt.toISOString()}`,
    });
  }
}

/** Call only in the API entry point; tests/createApi must not spawn timers. */
export function startDeadlineNotifications(intervalMs = 60000) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await runDeadlineNotifications(); }
    catch (error) { console.error("[notifications] deadline scan failed", error); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
