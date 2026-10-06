import { afterEach, describe, expect, it, vi } from "vitest";
import { Project, ProjectMember } from "../src/api/models.ts";
import mongoose, { type ClientSession } from "mongoose";
import {
  accessibleProjectIds, effectiveTaskStatus, getProjectChatGroup,
  permissionsForProject, projectAccess, projectMemberIds, requireWritable, withWritableProject,
} from "../src/api/projectAccess.ts";

const director = "100000000000000000000001";
const manager = "100000000000000000000002";
const employee = "100000000000000000000003";
const rootId = "200000000000000000000001";
const childId = "200000000000000000000002";
const otherChildId = "200000000000000000000003";
const root = () => new Project({ _id: rootId, name: "Root", kind: "hierarchical", owner: director, members: [director, manager, employee] });
const child = () => new Project({ _id: childId, name: "Child", kind: "hierarchical", parentProject: rootId, owner: director, manager, members: [director, manager, employee] });
const query = <T>(value: T) => ({ session: () => Promise.resolve(value) });
function lookup(projects: ReturnType<typeof root>[]) {
  vi.spyOn(Project, "findById").mockImplementation((id) => query(projects.find((p) => p.id === String(id)) ?? null) as unknown as ReturnType<typeof Project.findById>);
  vi.spyOn(ProjectMember, "findOne").mockImplementation((filter) => query(filter?.user === manager ? { role: "MANAGER" } : { role: "EMPLOYEE" }) as unknown as ReturnType<typeof ProjectMember.findOne>);
}
afterEach(() => vi.restoreAllMocks());

describe("hierarchical access boundaries", () => {
  it("director can administer every child even if a child mirror is missing them", async () => {
    const department = child(); department.members = department.members.filter((id) => String(id) !== director);
    lookup([root(), department]);
    const access = await projectAccess(childId, director);
    expect(access.role).toBe("DIRECTOR");
    expect(access.permissions).toMatchObject({ manageMembers: true, manageTasks: true, appointManager: true, createChildren: false });
  });
  it("manager has power in managed child and no read access to a different child", async () => {
    const other = child(); other._id = new Project({ _id: otherChildId })._id; other.manager = employee as unknown as typeof other.manager;
    other.members = other.members.filter((id) => String(id) !== manager);
    lookup([root(), child(), other]);
    const access = await projectAccess(childId, manager);
    expect(access.role).toBe("MANAGER");
    expect(access.permissions.manageMembers).toBe(true);
    expect(access.permissions.appointManager).toBe(false);
    await expect(projectAccess(otherChildId, manager)).rejects.toMatchObject({ status: 403 });
    expect((await projectAccess(rootId, manager)).permissions.manageTasks).toBe(false);
  });
  it("employee reads joined scopes but has no administration rights", async () => {
    lookup([root(), child()]);
    const access = await projectAccess(childId, employee);
    expect(access.role).toBe("EMPLOYEE");
    expect(Object.values(access.permissions).every((value) => value === false)).toBe(true);
  });
  it("root removal revokes child access even with a stale child membership", async () => {
    const project = root(); project.members = project.members.filter((id) => String(id) !== employee);
    lookup([project, child()]);
    await expect(projectAccess(childId, employee)).rejects.toMatchObject({ status: 403 });
  });
  it("archive inherited from root makes all child writes read only, including director", async () => {
    const project = root(); project.archived = true;
    lookup([project, child()]);
    const access = await projectAccess(childId, director);
    expect(access.archived).toBe(true);
    expect(() => requireWritable(access)).toThrow("project archived; read only");
  });
  it("independent members retain shared task editing with owner-only member/resources powers", () => {
    expect(permissionsForProject("independent", false, "MEMBER")).toMatchObject({ manageTasks: true, manageMembers: false, manageResources: false });
    expect(permissionsForProject("independent", false, "OWNER")).toMatchObject({ manageMembers: true, manageResources: true, createChildren: false });
  });
  it("write helper locks both root and child inside transaction before invoking mutation", async () => {
    lookup([root(), child()]);
    const session = {} as ClientSession;
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(async (action) => action(session));
    const lock = vi.spyOn(Project, "updateOne").mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    const mutation = vi.fn(async (_access, activeSession) => {
      expect(lock).toHaveBeenCalledTimes(2);
      expect(activeSession).toBe(session);
      return "updated";
    });
    expect(await withWritableProject(childId, manager, mutation, "manageTasks")).toBe("updated");
    expect(lock.mock.calls.map((call) => String(call[0]._id))).toEqual([rootId, childId]);
    expect(lock.mock.calls.every((call) => call[2]?.session === session)).toBe(true);
  });
  it("project listing filters stale child memberships and includes director children", async () => {
    const project = root(); project.members = project.members.filter((id) => String(id) !== employee);
    vi.spyOn(Project, "find").mockImplementation((filter) => query(filter && "_id" in filter ? [project] : [child()]) as unknown as ReturnType<typeof Project.find>);
    expect(await accessibleProjectIds(employee)).toEqual([]);
    vi.restoreAllMocks();
    vi.spyOn(Project, "find").mockImplementation((filter) => query(filter && "parentProject" in filter ? [child()] : [root()]) as unknown as ReturnType<typeof Project.find>);
    expect(await accessibleProjectIds(director)).toEqual([rootId, childId]);
  });
  it("managed chat group excludes removed root members and inherits archive state", async () => {
    const project = root(); project.archived = true; project.members = project.members.filter((id) => String(id) !== employee);
    const department = child(); department.chatRevision = 7;
    vi.spyOn(Project, "findOne").mockResolvedValue(department);
    vi.spyOn(Project, "findById").mockResolvedValue(project);
    const group = await getProjectChatGroup(department.chatGroupId!);
    expect(group).toMatchObject({ ownerId: manager, members: [director, manager], archived: true, version: 7, projectId: childId });
  });
  it("overdue derives from unfinished due time and completed tasks stay completed", () => {
    const now = Date.parse("2026-10-07T12:00:00+07:00");
    expect(effectiveTaskStatus({ status: "doing", dueAt: new Date(now - 1) }, now)).toBe("overdue");
    expect(effectiveTaskStatus({ status: "done", dueAt: new Date(now - 1) }, now)).toBe("done");
    expect(effectiveTaskStatus({ status: "todo", dueAt: new Date(now) }, now)).toBe("todo");
    expect(projectMemberIds({ members: [director, { _id: director }, manager] })).toEqual([director, manager]);
  });
});
