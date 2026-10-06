import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { z } from "zod";
import { User, Project, Task, Event } from "./models.ts";
import { listContactsForUser } from "./contactService.ts";
import {
  projectAccess, assertWritable, accessibleProjectIds, effectiveTaskStatus,
  getProjectChatGroup, HttpError,
  withWritableProject, lockWritableProject, projectMemberIds,
} from "./projectAccess.ts";
import { installProjectRoutes } from "./projectRoutes.ts";
import { installDiscussionRoutes } from "./discussionRoutes.ts";
import { installNotificationRoutes, emitNotification, startDeadlineNotifications } from "./notifications.ts";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
   !process.env.PEER_SECRET || process.env.PEER_SECRET.length < 32)
)
  throw new Error(
    "JWT_SECRET and PEER_SECRET must each be at least 32 characters in production",
  );
const secret = process.env.JWT_SECRET || "local-development-only-secret";
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const date = z.string().datetime({ offset: true });
const idOf = (value: unknown) => String(value || "");
const auth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = (req.header("authorization") || "").replace(/^Bearer /, "");
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    req.userId = String(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
};
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
const check = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> =>
  schema.parse(input);
const ownProject = async (req: Request, res: Response) => {
  const access = await projectAccess(String(req.params.projectId), req.userId!);
  if (req.method !== "GET") assertWritable(access);
  res.locals.projectAccess = access;
  return access.project;
};
const taskFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(3000).default(""),
  assignee: objectId.nullable().optional(),
  startsAt: date.nullable().optional(),
  dueAt: date.nullable().optional(),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
};
const validTaskWindow = (value: {
  startsAt?: string | null;
  dueAt?: string | null;
}) =>
  !value.startsAt ||
  !value.dueAt ||
  Date.parse(value.startsAt) < Date.parse(value.dueAt);
const taskInput = z
  .object(taskFields)
  .strict()
  .refine(validTaskWindow, "task start must be before due date");
const taskPatchInput = z
  .object(taskFields)
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict()
  .refine(validTaskWindow, "task start must be before due date");
const reminderOffset = z.union([
  z.literal(604800000),
  z.literal(86400000),
  z.literal(3600000),
]);
const eventCreateFields = {
  title: z.string().trim().min(1).max(120),
  startsAt: date,
  endsAt: date,
  note: z.string().max(2000).default(""),
  allDay: z.boolean().default(false),
  reminderOffsets: z
    .array(reminderOffset)
    .max(3)
    .refine((v) => new Set(v).size === v.length, "duplicate reminder offset")
    .default([]),
};
const eventInput = z
  .object(eventCreateFields)
  .strict()
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
const standaloneEventInput = z
  .object({ projectId: objectId.nullable().optional(), ...eventCreateFields })
  .strict()
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
const eventPatchInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    startsAt: date,
    endsAt: date,
    note: z.string().max(2000),
    allDay: z.boolean(),
    reminderOffsets: z
      .array(reminderOffset)
      .max(3)
      .refine((v) => new Set(v).size === v.length, "duplicate reminder offset"),
  })
  .partial()
  .strict()
  .refine(
    (v) =>
      !v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
const standaloneEventPatchInput = z
  .object({
    projectId: objectId.nullable().optional(),
    title: z.string().trim().min(1).max(120).optional(),
    startsAt: date.optional(),
    endsAt: date.optional(),
    note: z.string().max(2000).optional(),
    allDay: z.boolean().optional(),
    reminderOffsets: z
      .array(reminderOffset)
      .max(3)
      .refine((v) => new Set(v).size === v.length, "duplicate reminder offset")
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      !v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
const calendarQuery = z
  .object({ from: date.optional(), to: date.optional() })
  .strict()
  .refine(
    (v) => !v.from || !v.to || Date.parse(v.to) > Date.parse(v.from),
    "to must be after from",
  );
const eventForUser = async (eventId: string, userId: string, session: mongoose.ClientSession) => {
  if (!objectId.safeParse(eventId).success) return null;
  const projectIds = await accessibleProjectIds(userId, session);
  return Event.findOne({
    _id: eventId,
    $or: [
      { project: null, createdBy: userId },
      { project: { $in: projectIds } },
    ],
  }).session(session);
};
export function createApi() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_req, res) =>
    res.json({ service: "api", mongo: mongoose.connection.readyState === 1 }),
  );
  const internalAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.header("x-peer-secret") !== (process.env.PEER_SECRET || "local-development-only-secret"))
      return res.sendStatus(403);
    next();
  };
  app.get("/internal/chat-groups", internalAuth, async (req, res) => {
    const userId = check(objectId, req.query.userId);
    const ids = await accessibleProjectIds(userId);
    const rows = await Project.find({ _id: { $in: ids }, chatGroupId: { $exists: true } });
    const groups = await Promise.all(rows.map((p) => getProjectChatGroup(p.chatGroupId!)));
    return res.json(groups.filter((group) => group?.members.includes(userId)));
  });
  app.get("/internal/chat-groups/:groupId", internalAuth, async (req, res) => {
    const group = await getProjectChatGroup(check(z.string().uuid(), req.params.groupId));
    return group ? res.json(group) : res.sendStatus(404);
  });
  app.get("/internal/projects/:projectId/chat-group", internalAuth, async (req, res) => {
    const project = await Project.findById(check(objectId, req.params.projectId));
    if (!project?.chatGroupId) return res.sendStatus(404);
    return res.json(await getProjectChatGroup(project.chatGroupId));
  });
  app.post("/auth/register", async (req, res) => {
    const data = check(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().email().max(120),
        password: z.string().min(8).max(100),
      }),
      req.body,
    );
    const email = data.email.toLowerCase();
    if (await User.exists({ email }))
      return res.status(409).json({ error: "email already used" });
    const user = await User.create({
      name: data.name,
      email,
      passwordHash: await bcrypt.hash(data.password, 10),
    });
    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: "7d" });
    return res
      .status(201)
      .json({
        token,
        user: { id: user.id, name: user.name, email: user.email },
      });
  });
  app.post("/auth/login", async (req, res) => {
    const data = check(
      z.object({ email: z.string().email(), password: z.string() }),
      req.body,
    );
    const user = await User.findOne({ email: data.email.toLowerCase() });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash)))
      return res.status(401).json({ error: "invalid credentials" });
    return res.json({
      token: jwt.sign({ sub: user.id }, secret, { expiresIn: "7d" }),
      user: { id: user.id, name: user.name, email: user.email },
    });
  });
  app.use(auth);
  installProjectRoutes(app);
  installDiscussionRoutes(app);
  installNotificationRoutes(app);
  app.get("/me", async (req, res) => {
    const user = await User.findById(req.userId).select("name email");
    res.json(user);
  });
  app.get("/contacts", async (req, res) => {
    return res.json(await listContactsForUser(req.userId!));
  });
  app.get("/calendar", async (req, res) => {
    const range = check(calendarQuery, req.query);
    const projectIds = await accessibleProjectIds(req.userId!);
    const dueAt: { $ne: null; $gte?: Date; $lt?: Date } = { $ne: null };
    if (range.from) dueAt.$gte = new Date(range.from);
    if (range.to) dueAt.$lt = new Date(range.to);
    const time: Record<string, unknown> = {};
    if (range.from) time.endsAt = { $gt: new Date(range.from) };
    if (range.to) time.startsAt = { $lt: new Date(range.to) };
    const eventAccess: Record<string, unknown>[] = [
      { project: null, createdBy: req.userId },
    ];
    if (projectIds.length) eventAccess.push({ project: { $in: projectIds } });
    const [tasks, events] = await Promise.all([
      Task.find({ project: { $in: projectIds }, assignee: req.userId, dueAt })
        .sort({ dueAt: 1 })
        .populate("project", "name")
        .populate("assignee", "name email")
        .select("-__v"),
      Event.find({ $and: [{ $or: eventAccess }, time] })
        .sort({ startsAt: 1 })
        .populate("project", "name")
        .select("-__v"),
    ]);
    return res.json({ tasks, events });
  });
  app.post("/events", async (req, res) => {
    const { projectId, ...data } = check(standaloneEventInput, req.body);
    const event = projectId
      ? await withWritableProject(projectId, req.userId!, async (access, session) => {
          const [created] = await Event.create([{ ...data, project: access.project.id, createdBy: req.userId }], { session });
          return created;
        }, "manageTasks")
      : await Event.create({ ...data, project: null, createdBy: req.userId });
    event.$session(null);
    await event.populate("project", "name");
    return res.status(201).json(event);
  });
  app.patch("/events/:eventId", async (req, res) => {
    const { projectId, ...data } = check(standaloneEventPatchInput, req.body);
    const event = await mongoose.connection.transaction(async (session) => {
      const current = await eventForUser(req.params.eventId, req.userId!, session);
      if (!current) throw new HttpError(404, "event not found");
      const sourceId = idOf(current.project);
      const targetId = projectId === undefined ? sourceId : projectId || "";
      if (sourceId !== targetId && idOf(current.createdBy) !== req.userId)
        throw new HttpError(403, "only event creator can move event");
      // Check both the source and destination; an employee cannot move personal data into a project.
      for (const scope of [...new Set([sourceId, targetId].filter(Boolean))].sort())
        await lockWritableProject(scope, req.userId!, session, "manageTasks");
      const startsAt = data.startsAt ? new Date(data.startsAt) : current.startsAt;
      const endsAt = data.endsAt ? new Date(data.endsAt) : current.endsAt;
      if (+endsAt <= +startsAt) throw new HttpError(400, "end must be after start");
      current.set({ ...data, project: targetId || null });
      await current.save({ session });
      return current;
    });
    event.$session(null);
    await event.populate("project", "name");
    return res.json(event);
  });
  app.delete("/events/:eventId", async (req, res) => {
    await mongoose.connection.transaction(async (session) => {
      const event = await eventForUser(req.params.eventId, req.userId!, session);
      if (!event) throw new HttpError(404, "event not found");
      if (event.project) await lockWritableProject(idOf(event.project), req.userId!, session, "manageTasks");
      await event.deleteOne({ session });
    });
    return res.json({ ok: true });
  });
  app.get("/projects/:projectId/tasks", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(
        (await Task.find({ project: project.id })
          .sort({ dueAt: 1 })
          .populate("assignee", "name email"))
          .map((task) => ({ ...task.toObject(), effectiveStatus: effectiveTaskStatus(task) })),
      );
  });
  app.post("/projects/:projectId/tasks", async (req, res) => {
    const data = check(taskInput, req.body);
    const task = await withWritableProject(String(req.params.projectId), req.userId!, async (access, session) => {
      const project = access.project;
      if (data.assignee && !projectMemberIds(project).includes(data.assignee))
        throw new HttpError(400, "assignee not a member");
      const [created] = await Task.create([{ ...data, project: project.id }], { session });
      if (data.assignee)
        await emitNotification({ actorId: req.userId!, recipientIds: [data.assignee], projectId: project.id, type: "task_assigned", title: `Bạn được giao task: ${created.title}`, entityId: created.id, session });
      return created;
    }, "manageTasks");
    return res.status(201).json(task);
  });
  app.patch("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const { version, ...data } = check(taskPatchInput, req.body);
    const task = await withWritableProject(String(req.params.projectId), req.userId!, async (access, session) => {
      const project = access.project;
      if (data.assignee && !projectMemberIds(project).includes(data.assignee))
        throw new HttpError(400, "assignee not a member");
      const current = await Task.findOne({
        _id: req.params.taskId, project: project.id, version,
      }).session(session);
      if (!current) throw new HttpError(409, "task missing or version conflict; reload");
      if (!access.permissions.manageTasks &&
        (idOf(current.assignee) !== req.userId || Object.keys(data).some((key) => key !== "status")))
        throw new HttpError(403, "employees may only update the status of their own task");
      const startsAt = data.startsAt === undefined ? current.startsAt : data.startsAt ? new Date(data.startsAt) : null;
      const dueAt = data.dueAt === undefined ? current.dueAt : data.dueAt ? new Date(data.dueAt) : null;
      if (startsAt && dueAt && +startsAt >= +dueAt)
        throw new HttpError(400, "task start must be before due date");
      const updated = await Task.findOneAndUpdate({
        _id: req.params.taskId, project: project.id, version,
      }, { $set: data, $inc: { version: 1 } }, { new: true, session });
      if (!updated) throw new HttpError(409, "task missing or version conflict; reload");
      await emitNotification({ actorId: req.userId!, recipientIds: projectMemberIds(project), projectId: project.id, type: "task_updated", title: `Task cập nhật: ${updated.title}`, entityId: updated.id, session });
      if (data.assignee && idOf(current.assignee) !== data.assignee)
        await emitNotification({ actorId: req.userId!, recipientIds: [data.assignee], projectId: project.id, type: "task_assigned", title: `Bạn được giao task: ${updated.title}`, entityId: updated.id, session });
      return updated;
    });
    return res.json(task);
  });
  app.delete("/projects/:projectId/tasks/:taskId", async (req, res) => {
    await withWritableProject(String(req.params.projectId), req.userId!, async (access, session) => {
      await Task.deleteOne({ _id: req.params.taskId, project: access.project.id }, { session });
    }, "manageTasks");
    return res.json({ ok: true });
  });
  app.get("/projects/:projectId/events", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(await Event.find({ project: project.id }).sort({ startsAt: 1 }));
  });
  app.post("/projects/:projectId/events", async (req, res) => {
    const data = check(eventInput, req.body);
    const event = await withWritableProject(String(req.params.projectId), req.userId!, async (access, session) => {
      const [created] = await Event.create([{ ...data, project: access.project.id, createdBy: req.userId }], { session });
      return created;
    }, "manageTasks");
    return res.status(201).json(event);
  });
  app.patch("/projects/:projectId/events/:eventId", async (req, res) => {
    const data = check(eventPatchInput, req.body);
    const event = await withWritableProject(String(req.params.projectId), req.userId!, async (access, session) => {
      const current = await Event.findOne({ _id: req.params.eventId, project: access.project.id }).session(session);
      if (!current) throw new HttpError(404, "event not found");
      const startsAt = data.startsAt ? new Date(data.startsAt) : current.startsAt;
      const endsAt = data.endsAt ? new Date(data.endsAt) : current.endsAt;
      if (+endsAt <= +startsAt) throw new HttpError(400, "end must be after start");
      current.set(data); await current.save({ session });
      return current;
    }, "manageTasks");
    return res.json(event);
  });
  app.delete("/projects/:projectId/events/:eventId", async (req, res) => {
    await withWritableProject(String(req.params.projectId), req.userId!, async (access, session) => {
      await Event.deleteOne({ _id: req.params.eventId, project: access.project.id }, { session });
    }, "manageTasks");
    return res.json({ ok: true });
  });
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.flatten() });
      if (error instanceof Error && error.name === "MulterError")
        return res.status(400).json({ error: error.message });
      if (error instanceof mongoose.Error.CastError)
        return res.status(400).json({ error: "invalid ID" });
      if (error instanceof mongoose.Error.ValidationError)
        return res.status(400).json({ error: error.message });
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      )
        return res.status(409).json({ error: "duplicate value" });
      console.error(error);
      return res.status(500).json({ error: "internal error" });
    },
  );
  return app;
}
if (process.argv[1]?.endsWith("index.ts")) {
  await mongoose.connect(
    process.env.MONGO_URL || "mongodb://127.0.0.1:27017/student_planner",
  );
  const stopDeadlineNotifications = startDeadlineNotifications();
  process.once("SIGINT", stopDeadlineNotifications);
  process.once("SIGTERM", stopDeadlineNotifications);
  createApi().listen(Number(process.env.API_PORT || 4000), "0.0.0.0", () =>
    console.log("[api] listening"),
  );
}
