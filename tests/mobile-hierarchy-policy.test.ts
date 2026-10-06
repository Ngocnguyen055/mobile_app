import { describe, expect, it } from "vitest";
import type { Project, Task } from "../src/mobile/api.ts";
import { canChangeTaskStatus, effectiveTaskStatus, managedProjectsForMember } from "../src/mobile/projectPolicy.ts";

describe("mobile hierarchical project policy", () => {
  const project = { archived: false, parentProject: null, permissions: { manageTasks: false }, members: [], children: [] } as unknown as Project;
  const task = { assignee: { _id: "a" }, status: "todo", dueAt: "2026-09-01T00:00:00Z" } as Task;
  it("limits employee status updates to own tasks and disables writes while archived", () => {
    expect(canChangeTaskStatus(project, task, "a")).toBe(true);
    expect(canChangeTaskStatus(project, task, "b")).toBe(false);
    expect(canChangeTaskStatus({ ...project, permissions: { ...project.permissions, manageTasks: true } }, task, "b")).toBe(true);
    expect(canChangeTaskStatus({ ...project, archived: true }, task, "a")).toBe(false);
  });
  it("derives overdue without discarding the workflow status", () => {
    expect(effectiveTaskStatus(task, Date.parse("2026-10-01"))).toBe("overdue");
    expect(effectiveTaskStatus({ ...task, status: "done" }, Date.parse("2026-10-01"))).toBe("done");
    expect(effectiveTaskStatus({ ...task, dueAt: null }, Date.parse("2026-10-01"))).toBe("todo");
  });
  it("requires replacement for each child managed by the removed member", () => {
    const child = { ...project, _id: "child", parentProject: "root", members: [{ _id: "a", name: "A", email: "a@example.test", role: "MANAGER" }] } as Project;
    expect(managedProjectsForMember({ ...project, children: [child] }, "a").map((p) => p._id)).toEqual(["child"]);
    expect(managedProjectsForMember({ ...project, children: [child] }, "b")).toEqual([]);
  });
});
