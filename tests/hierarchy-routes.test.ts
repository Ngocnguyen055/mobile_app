import express, { type Request, type Response, type NextFunction } from "express";
import mongoose, { type ClientSession } from "mongoose";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Project, ProjectMember, Task, User } from "../src/api/models.ts";
import * as accessModule from "../src/api/projectAccess.ts";
import * as notifications from "../src/api/notifications.ts";
import { installProjectRoutes } from "../src/api/projectRoutes.ts";

const director = "100000000000000000000001";
const manager = "100000000000000000000002";
const employee = "100000000000000000000003";
const outsider = "100000000000000000000004";
const rootId = "200000000000000000000001";
const childId = "200000000000000000000002";
const session = { token: "transaction" } as unknown as ClientSession;
const query = <T>(value: T) => ({ session: () => Promise.resolve(value) });
let current: accessModule.ProjectAccess;
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let url: string;
const patch = (route: string, data: unknown, method = "PATCH") => fetch(`${url}${route}`, {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});

beforeEach(async () => {
  const root = new Project({ _id: rootId, name: "Root", owner: director, kind: "hierarchical", members: [director, manager, employee], version: 4 });
  const project = new Project({ _id: childId, name: "Child", owner: director, kind: "hierarchical", parentProject: rootId, manager, members: [director, manager], version: 4 });
  current = { root, project, role: "DIRECTOR", archived: false, permissions: accessModule.permissionsForProject("hierarchical", true, "DIRECTOR") };
  vi.spyOn(accessModule, "projectAccess").mockImplementation(async () => current);
  vi.spyOn(accessModule, "projectDto").mockImplementation(async (access) => ({ ...access.project.toObject(), myRole: access.role, permissions: access.permissions, archived: access.archived, rootProject: rootId, parentProject: access.project.parentProject ? rootId : null, members: [] }));
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async (action) => action(session));
  vi.spyOn(notifications, "emitNotification").mockResolvedValue(undefined);
  vi.spyOn(Project, "updateOne").mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
  vi.spyOn(Project, "updateMany").mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
  vi.spyOn(ProjectMember, "updateOne").mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
  vi.spyOn(ProjectMember, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 1 });
  vi.spyOn(Task, "updateMany").mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.userId = director; next(); });
  installProjectRoutes(app);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof accessModule.HttpError ? error.status : error instanceof z.ZodError ? 400 : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "error" });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});

describe("project hierarchy mutations", () => {
  it("manager cannot add someone outside root membership", async () => {
    current.role = "MANAGER"; current.permissions = accessModule.permissionsForProject("hierarchical", true, "MANAGER");
    vi.spyOn(User, "findOne").mockReturnValue(query(new User({ _id: outsider, name: "Out", email: "out@example.test", passwordHash: "hash" })) as unknown as ReturnType<typeof User.findOne>);
    const response = await patch(`/projects/${childId}/members`, { userId: outsider }, "POST");
    expect(response.status).toBe(400);
    expect(ProjectMember.updateOne).not.toHaveBeenCalled();
  });
  it("removing root manager requires explicit replacements before any member/task deletion", async () => {
    const child = current.project;
    current.project = current.root; current.permissions = accessModule.permissionsForProject("hierarchical", false, "DIRECTOR");
    vi.spyOn(Project, "find").mockReturnValue(query([child]) as unknown as ReturnType<typeof Project.find>);
    const response = await patch(`/projects/${rootId}/members/${manager}`, {}, "DELETE");
    expect(response.status).toBe(409);
    expect(ProjectMember.deleteOne).not.toHaveBeenCalled();
    expect(Task.updateMany).not.toHaveBeenCalled();
  });
  it("director can replace a departing manager with a root member and reassign tasks atomically", async () => {
    const response = await patch(`/projects/${childId}/members/${manager}`, {
      version: 4, replacementManagers: [{ projectId: childId, userId: employee }], reassignTo: employee,
    }, "DELETE");
    expect(response.status).toBe(200);
    expect(ProjectMember.updateOne).toHaveBeenCalledWith({ project: current.project._id, user: employee }, { $set: { role: "MANAGER" } }, { upsert: true, session });
    expect(ProjectMember.deleteOne).toHaveBeenCalledWith({ project: current.project._id, user: manager }, { session });
    expect(Task.updateMany).toHaveBeenCalledWith({ project: current.project._id, assignee: manager }, { $set: { assignee: employee }, $inc: { version: 1 } }, { session });
  });
  it("stale optimistic project versions reject competing edits", async () => {
    const response = await patch(`/projects/${childId}`, { name: "Stale edit", version: 3 });
    expect(response.status).toBe(409);
    expect(Project.updateOne).not.toHaveBeenCalled();
  });
  it("root archive cascades children in the same transaction; restoreChildren is explicit", async () => {
    current.project = current.root; current.permissions = accessModule.permissionsForProject("hierarchical", false, "DIRECTOR");
    const response = await patch(`/projects/${rootId}/archive`, { archived: true, version: 4 });
    expect(response.status).toBe(200);
    expect(Project.updateMany).toHaveBeenCalledWith({ parentProject: current.root._id }, { $set: { archived: true }, $inc: { version: 1, chatRevision: 1 } }, { session });
    vi.mocked(Project.updateMany).mockClear();
    current.root.archived = true; current.archived = true;
    const restore = await patch(`/projects/${rootId}/archive`, { archived: false, restoreChildren: false });
    expect(restore.status).toBe(200);
    expect(Project.updateMany).not.toHaveBeenCalled();
  });
  it("employees cannot change membership; archived scopes reject renames", async () => {
    current.role = "EMPLOYEE"; current.permissions = accessModule.permissionsForProject("hierarchical", true, "EMPLOYEE");
    expect((await patch(`/projects/${childId}/members/${manager}`, {}, "DELETE")).status).toBe(403);
    current.role = "DIRECTOR"; current.permissions = accessModule.permissionsForProject("hierarchical", true, "DIRECTOR"); current.archived = true;
    expect((await patch(`/projects/${childId}`, { name: "Blocked" })).status).toBe(423);
    expect(Project.updateOne).not.toHaveBeenCalled();
  });
});
