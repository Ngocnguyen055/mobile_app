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
import multer from "multer";
import { z } from "zod";
import { User, Project, Task, Event, Discussion, Document } from "./models.ts";
import { listContactsForUser } from "./contactService.ts";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
)
  throw new Error(
    "JWT_SECRET must be set to at least 32 characters in production",
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
const member = async (projectId: string, userId: string) => {
  if (!objectId.safeParse(projectId).success) return null;
  return Project.findOne({ _id: projectId, members: userId });
};
const ownProject = async (req: Request, res: Response) => {
  const project = await member(String(req.params.projectId), req.userId!);
  if (!project) res.status(403).json({ error: "project access denied" });
  return project;
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024, files: 1 },
});
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
  .refine(validTaskWindow, "task start must be before due date");
const taskPatchInput = z
  .object(taskFields)
  .partial()
  .extend({ version: z.number().int().positive() })
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
const eventForUser = async (eventId: string, userId: string) => {
  if (!objectId.safeParse(eventId).success) return null;
  const projectIds = await Project.distinct("_id", { members: userId });
  return Event.findOne({
    _id: eventId,
    $or: [
      { project: null, createdBy: userId },
      { project: { $in: projectIds } },
    ],
  });
};
export function createApi() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_req, res) =>
    res.json({ service: "api", mongo: mongoose.connection.readyState === 1 }),
  );
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
  app.get("/me", async (req, res) => {
    const user = await User.findById(req.userId).select("name email");
    res.json(user);
  });
  app.get("/contacts", async (req, res) => {
    return res.json(await listContactsForUser(req.userId!));
  });
  app.get("/calendar", async (req, res) => {
    const range = check(calendarQuery, req.query);
    const projectIds = await Project.distinct("_id", { members: req.userId });
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
    let project = null;
    if (projectId) {
      project = await member(projectId, req.userId!);
      if (!project)
        return res.status(403).json({ error: "project access denied" });
    }
    const event = await Event.create({
      ...data,
      project: project?.id ?? null,
      createdBy: req.userId,
    });
    await event.populate("project", "name");
    return res.status(201).json(event);
  });
  app.patch("/events/:eventId", async (req, res) => {
    const { projectId, ...data } = check(standaloneEventPatchInput, req.body);
    const event = await eventForUser(req.params.eventId, req.userId!);
    if (!event) return res.sendStatus(404);
    const startsAt = data.startsAt ? new Date(data.startsAt) : event.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : event.endsAt;
    if (+endsAt <= +startsAt)
      return res.status(400).json({ error: "end must be after start" });
    if (projectId !== undefined && idOf(event.project) !== (projectId || "")) {
      if (idOf(event.createdBy) !== req.userId)
        return res
          .status(403)
          .json({ error: "only event creator can move event" });
      if (projectId && !(await member(projectId, req.userId!)))
        return res.status(403).json({ error: "project access denied" });
      event.project = projectId ? new mongoose.Types.ObjectId(projectId) : null;
    }
    event.set(data);
    await event.save();
    await event.populate("project", "name");
    return res.json(event);
  });
  app.delete("/events/:eventId", async (req, res) => {
    const event = await eventForUser(req.params.eventId, req.userId!);
    if (!event) return res.sendStatus(404);
    await event.deleteOne();
    return res.json({ ok: true });
  });
  app.get("/projects", async (req, res) =>
    res.json(
      await Project.find({ members: req.userId })
        .sort({ updatedAt: -1 })
        .select("-__v"),
    ),
  );
  app.post("/projects", async (req, res) => {
    const data = check(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).default(""),
      }),
      req.body,
    );
    const project = await Project.create({
      ...data,
      owner: req.userId,
      members: [req.userId],
    });
    res.status(201).json(project);
  });
  app.get("/projects/:projectId", async (req, res) => {
    const project = await ownProject(req, res);
    if (project) res.json(await project.populate("members", "name email"));
  });
  app.post("/projects/:projectId/members", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    if (idOf(project.owner) !== req.userId)
      return res.status(403).json({ error: "owner only" });
    const { email } = check(z.object({ email: z.string().email() }), req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "user not found" });
    await Project.updateOne(
      { _id: project.id },
      { $addToSet: { members: user.id } },
    );
    return res.json(
      await Project.findById(project.id).populate("members", "name email"),
    );
  });
  app.delete("/projects/:projectId/members/:userId", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    if (
      idOf(project.owner) !== req.userId ||
      idOf(project.owner) === req.params.userId
    )
      return res.status(403).json({ error: "owner only; cannot remove owner" });
    await Project.updateOne(
      { _id: project.id },
      { $pull: { members: req.params.userId } },
    );
    await Task.updateMany(
      { project: project.id, assignee: req.params.userId },
      { $unset: { assignee: 1 }, $inc: { version: 1 } },
    );
    return res.json({ ok: true });
  });
  app.patch("/projects/:projectId/resources", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    if (idOf(project.owner) !== req.userId)
      return res.status(403).json({ error: "owner only" });
    const data = check(
      z.object({
        plannedHours: z.number().min(0),
        actualHours: z.number().min(0),
        plannedBudget: z.number().min(0),
        spentBudget: z.number().min(0),
      }),
      req.body,
    );
    res.json(
      await Project.findByIdAndUpdate(
        project.id,
        { $set: data },
        { new: true },
      ),
    );
  });
  app.post("/projects/:projectId/chat-group", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    if (idOf(project.owner) !== req.userId)
      return res.status(403).json({ error: "owner only" });
    const { groupId, previousGroupId } = check(
      z.object({
        groupId: z.string().uuid(),
        previousGroupId: z.string().uuid().nullable().optional(),
      }),
      req.body,
    );
    const expected = previousGroupId ? previousGroupId : { $exists: false };
    const updated = await Project.findOneAndUpdate(
      { _id: project.id, chatGroupId: expected },
      { $set: { chatGroupId: groupId } },
      { new: true },
    );
    return res.json({
      chatGroupId:
        updated?.chatGroupId ||
        (await Project.findById(project.id))?.chatGroupId,
    });
  });
  app.get("/projects/:projectId/tasks", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(
        await Task.find({ project: project.id })
          .sort({ dueAt: 1 })
          .populate("assignee", "name email"),
      );
  });
  app.post("/projects/:projectId/tasks", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    const data = check(taskInput, req.body);
    if (
      data.assignee &&
      !project.members.some((id) => idOf(id) === data.assignee)
    )
      return res.status(400).json({ error: "assignee not a member" });
    res.status(201).json(await Task.create({ ...data, project: project.id }));
  });
  app.patch("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    const { version, ...data } = check(taskPatchInput, req.body);
    if (
      data.assignee &&
      !project.members.some((id) => idOf(id) === data.assignee)
    )
      return res.status(400).json({ error: "assignee not a member" });
    const current = await Task.findOne({
      _id: req.params.taskId,
      project: project.id,
      version,
    });
    if (!current)
      return res
        .status(409)
        .json({ error: "task missing or version conflict; reload" });
    const startsAt =
      data.startsAt === undefined
        ? current.startsAt
        : data.startsAt
          ? new Date(data.startsAt)
          : null;
    const dueAt =
      data.dueAt === undefined
        ? current.dueAt
        : data.dueAt
          ? new Date(data.dueAt)
          : null;
    if (startsAt && dueAt && +startsAt >= +dueAt)
      return res
        .status(400)
        .json({ error: "task start must be before due date" });
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, project: project.id, version },
      { $set: data, $inc: { version: 1 } },
      { new: true },
    );
    if (!task)
      return res
        .status(409)
        .json({ error: "task missing or version conflict; reload" });
    return res.json(task);
  });
  app.delete("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const project = await ownProject(req, res);
    if (project) {
      await Task.deleteOne({ _id: req.params.taskId, project: project.id });
      res.json({ ok: true });
    }
  });
  app.get("/projects/:projectId/progress", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    const tasks = await Task.find({ project: project.id }).lean();
    const now = Date.now();
    const byPerson = project.members.map((id) => {
      const mine = tasks.filter((t) => idOf(t.assignee) === idOf(id));
      return {
        userId: idOf(id),
        total: mine.length,
        done: mine.filter((t) => t.status === "done").length,
      };
    });
    return res.json({
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
      dueSoon: tasks.filter(
        (t) =>
          t.status !== "done" &&
          t.dueAt &&
          +t.dueAt >= now &&
          +t.dueAt < now + 86400000,
      ).length,
      overdue: tasks.filter(
        (t) => t.status !== "done" && t.dueAt && +t.dueAt < now,
      ).length,
      byPerson,
    });
  });
  app.get("/projects/:projectId/events", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(await Event.find({ project: project.id }).sort({ startsAt: 1 }));
  });
  app.post("/projects/:projectId/events", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res
        .status(201)
        .json(
          await Event.create({
            ...check(eventInput, req.body),
            project: project.id,
            createdBy: req.userId,
          }),
        );
  });
  app.patch("/projects/:projectId/events/:eventId", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    const data = check(eventPatchInput, req.body);
    const event = await Event.findOne({
      _id: req.params.eventId,
      project: project.id,
    });
    if (!event) return res.sendStatus(404);
    const startsAt = data.startsAt ? new Date(data.startsAt) : event.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : event.endsAt;
    if (+endsAt <= +startsAt)
      return res.status(400).json({ error: "end must be after start" });
    event.set(data);
    await event.save();
    return res.json(event);
  });
  app.delete("/projects/:projectId/events/:eventId", async (req, res) => {
    const project = await ownProject(req, res);
    if (project) {
      await Event.deleteOne({ _id: req.params.eventId, project: project.id });
      res.json({ ok: true });
    }
  });
  app.get("/projects/:projectId/discussions", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(
        await Discussion.find({ project: project.id })
          .sort({ createdAt: -1 })
          .populate("author", "name"),
      );
  });
  app.post("/projects/:projectId/discussions", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res
        .status(201)
        .json(
          await Discussion.create({
            ...check(
              z.object({
                title: z.string().trim().min(1).max(120),
                body: z.string().trim().min(1).max(5000),
              }),
              req.body,
            ),
            project: project.id,
            author: req.userId,
          }),
        );
  });
  app.delete("/projects/:projectId/discussions/:id", async (req, res) => {
    const project = await ownProject(req, res);
    if (project) {
      const result = await Discussion.deleteOne({
        _id: req.params.id,
        project: project.id,
        author: req.userId,
      });
      res
        .status(result.deletedCount ? 200 : 403)
        .json({ ok: !!result.deletedCount });
    }
  });
  app.get("/projects/:projectId/documents", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(
        await Document.find({ project: project.id })
          .select("-data")
          .sort({ createdAt: -1 }),
      );
  });
  app.post(
    "/projects/:projectId/documents",
    upload.single("file"),
    async (req, res) => {
      const project = await ownProject(req, res);
      if (!project) return;
      if (!req.file)
        return res.status(400).json({ error: "file required, max 512 KiB" });
      const doc = await Document.create({
        project: project.id,
        uploader: req.userId,
        name: req.file.originalname.slice(0, 160),
        mime: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
      });
      return res
        .status(201)
        .json({ id: doc.id, name: doc.name, size: doc.size });
    },
  );
  app.get("/projects/:projectId/documents/:id", async (req, res) => {
    const project = await ownProject(req, res);
    if (!project) return;
    const doc = await Document.findOne({
      _id: req.params.id,
      project: project.id,
    });
    if (!doc) return res.sendStatus(404);
    res.setHeader("Content-Type", doc.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${doc.name.replace(/["\r\n]/g, "_")}"`,
    );
    return res.send(doc.data);
  });
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.flatten() });
      if (error instanceof multer.MulterError)
        return res.status(400).json({ error: error.code });
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
  createApi().listen(Number(process.env.API_PORT || 4000), "0.0.0.0", () =>
    console.log("[api] listening"),
  );
}
