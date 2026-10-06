import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitNotification, installNotificationRoutes, notificationRecipients, runDeadlineNotifications } from "../src/api/notifications.ts";
import { Discussion, Notification, Project, Task } from "../src/api/models.ts";
import { accessibleProjectIds, projectAccess } from "../src/api/projectAccess.ts";

vi.mock("../src/api/models.ts", () => ({
  Project: { findById: vi.fn() }, Task: { find: vi.fn() }, Discussion: { find: vi.fn() },
  Notification: { bulkWrite: vi.fn(), insertMany: vi.fn(), findOneAndUpdate: vi.fn(), find: vi.fn() },
}));
vi.mock("../src/api/projectAccess.ts", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { HttpError, accessibleProjectIds: vi.fn(), projectAccess: vi.fn(), idOf: (value: unknown) => String(value) };
});
const a = "000000000000000000000001";
const b = "000000000000000000000002";
const p = "000000000000000000000003";
const n = "000000000000000000000004";
afterEach(() => vi.clearAllMocks());
describe("durable project notifications", () => {
  it("filters removed project scopes and hidden-post previews when listing the inbox", async () => {
    vi.mocked(accessibleProjectIds).mockResolvedValue([p]);
    const rows = [{ _id: n, type: "discussion_created", entityId: n, title: "hidden title" },
      { _id: b, type: "task_updated", entityId: b, title: "Task" }];
    const query = { sort: () => query, limit: () => query, populate: () => query, select: async () => rows };
    vi.mocked(Notification.find).mockReturnValue(query as never);
    vi.mocked(Discussion.find).mockReturnValue({ select: () => ({ lean: async () => [{ _id: n, author: b, project: p }] }) } as never);
    vi.mocked(projectAccess).mockResolvedValue({ permissions: { moderate: false } } as never);
    const app = express(); app.use((req, _res, next) => { req.userId = a; next(); });
    installNotificationRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const response = await fetch(`${url}/notifications`);
      expect(await response.json()).toEqual([rows[1]]);
      expect(Notification.find).toHaveBeenCalledWith({ user: a, project: { $in: [p] } });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it("excludes actor, duplicate participants and outsiders including mentions", async () => {
    expect(notificationRecipients([a, b, b, "outsider"], [a, b], a)).toEqual([b]);
    const query = { select: () => query, session: () => query, lean: async () => ({ members: [a, b] }) };
    vi.mocked(Project.findById).mockReturnValue(query as never);
    await emitNotification({ actorId: a, recipientIds: [a, b, b, "outsider"], projectId: p, type: "comment_created", title: "Comment" });
    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ user: new Types.ObjectId(b), actor: new Types.ObjectId(a), project: new Types.ObjectId(p) }),
    ], { session: undefined });
  });
  it("uses task and due timestamp for durable per-recipient reminder deduplication and skips archived scopes", async () => {
    const dueAt = new Date("2026-10-08T04:00:00Z");
    const tasksQuery = { select: () => tasksQuery, lean: async () => [
      { _id: n, project: p, assignee: a, dueAt, title: "First" },
      { _id: b, project: p, assignee: b, dueAt, title: "Archived" },
    ] };
    vi.mocked(Task.find).mockReturnValue(tasksQuery as never);
    vi.mocked(projectAccess).mockResolvedValueOnce({ archived: false } as never).mockResolvedValueOnce({ archived: true } as never);
    const projectQuery = { select: () => projectQuery, session: () => projectQuery, lean: async () => ({ members: [a, b] }) };
    vi.mocked(Project.findById).mockReturnValue(projectQuery as never);
    await runDeadlineNotifications(new Date("2026-10-07T04:01:00Z"));
    expect(Notification.bulkWrite).toHaveBeenCalledTimes(1);
    expect(Notification.bulkWrite).toHaveBeenCalledWith([
      { updateOne: expect.objectContaining({
        filter: { user: new Types.ObjectId(a), dedupeKey: `deadline:${n}:${dueAt.toISOString()}` }, upsert: true,
      }) },
    ], { session: undefined });
  });
  it("marks only owned notification rows in currently accessible projects", async () => {
    vi.mocked(accessibleProjectIds).mockResolvedValue([p]);
    vi.mocked(Notification.findOneAndUpdate).mockReturnValue({ select: async () => null } as never);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.userId = a; next(); });
    installNotificationRoutes(app);
    app.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) => res.sendStatus(500));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect((await fetch(`${url}/notifications/${n}/read`, { method: "PATCH" })).status).toBe(404);
      expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: n, user: a, project: { $in: [p] } },
        { $set: { readAt: expect.any(Date) } }, { new: true },
      );
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
