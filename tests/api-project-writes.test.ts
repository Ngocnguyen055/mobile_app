import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { type ClientSession } from "mongoose";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { createApi } from "../src/api/index.ts";
import { Event, Project, Task } from "../src/api/models.ts";
import * as access from "../src/api/projectAccess.ts";
import * as notifications from "../src/api/notifications.ts";

const userId = "100000000000000000000001";
const projectId = "200000000000000000000001";
const recordId = "300000000000000000000001";
const otherId = "100000000000000000000002";
const session = { transaction: true } as unknown as ClientSession;
const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET || "local-development-only-secret");
const project = new Project({ _id: projectId, name: "Child", kind: "hierarchical", owner: otherId, members: [userId, otherId] });
const scope: access.ProjectAccess = { project, root: project, role: "EMPLOYEE", archived: false, permissions: access.permissionsForProject("hierarchical", true, "EMPLOYEE") };
const query = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) });
let server: ReturnType<ReturnType<typeof createApi>["listen"]>;
let base: string;
const patch = (path: string, body: unknown) => fetch(base + path, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(async () => {
  scope.archived = false;
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async (action) => action(session));
  vi.spyOn(access, "accessibleProjectIds").mockResolvedValue([projectId]);
  vi.spyOn(access, "lockWritableProject").mockImplementation(async (_id, _user, transaction, permission) => {
    expect(transaction).toBe(session);
    access.requireWritable(scope);
    if (permission) access.requirePermission(scope, permission);
    return scope;
  });
  vi.spyOn(access, "withWritableProject").mockImplementation(async (_id, _user, action, permission) => {
    access.requireWritable(scope);
    if (permission) access.requirePermission(scope, permission);
    return action(scope, session);
  });
  vi.spyOn(notifications, "emitNotification").mockResolvedValue(undefined);
  server = createApi().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); vi.restoreAllMocks(); });

describe("project writes from employees", () => {
  it("blocks moving a personal event into a project before saving", async () => {
    const event = new Event({ _id: recordId, title: "Personal", project: null, createdBy: userId, startsAt: new Date(), endsAt: new Date(Date.now() + 3600000) });
    vi.spyOn(Event, "findOne").mockReturnValue(query(event) as never);
    const save = vi.spyOn(event, "save");
    expect((await patch(`/events/${recordId}`, { projectId })).status).toBe(403);
    expect(access.lockWritableProject).toHaveBeenCalledWith(projectId, userId, session, "manageTasks");
    expect(save).not.toHaveBeenCalled();
  });
  it("blocks a project event write when archived, including a move out", async () => {
    scope.archived = true;
    const event = new Event({ _id: recordId, title: "Project", project: projectId, createdBy: userId, startsAt: new Date(), endsAt: new Date(Date.now() + 3600000) });
    vi.spyOn(Event, "findOne").mockReturnValue(query(event) as never);
    const save = vi.spyOn(event, "save");
    expect((await patch(`/events/${recordId}`, { projectId: null })).status).toBe(423);
    expect(save).not.toHaveBeenCalled();
  });
  it("allows only the assigned employee's status, preserving the version and session", async () => {
    const task = new Task({ _id: recordId, project: projectId, title: "Assigned", assignee: userId, version: 3 });
    vi.spyOn(Task, "findOne").mockReturnValue(query(task) as never);
    const update = vi.spyOn(Task, "findOneAndUpdate").mockResolvedValue(task);
    const route = `/projects/${projectId}/tasks/${recordId}`;
    expect((await patch(route, { title: "Cannot edit", version: 3 })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
    expect((await patch(route, { status: "doing", version: 3 })).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ _id: recordId, project: projectId, version: 3 }, { $set: { status: "doing" }, $inc: { version: 1 } }, { new: true, session });
    update.mockClear(); task.assignee = new mongoose.Types.ObjectId(otherId);
    expect((await patch(route, { status: "done", version: 3 })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});
