import { describe, expect, it } from "vitest";
import type { Project, Task } from "../src/mobile/services/api.ts";
import {
  canChangeTaskStatus,
  effectiveTaskStatus,
  managedProjectsForMember,
  orderedProjectMembers,
} from "../src/mobile/domain/projectPolicy.ts";

describe("mobile hierarchical project policy", () => {
  const project = {
    archived: false,
    parentProject: null,
    permissions: { manageTasks: false },
    members: [],
    children: [],
  } as unknown as Project;
  const task = {
    assignee: { _id: "a" },
    status: "todo",
    dueAt: "2026-09-01T00:00:00Z",
  } as Task;
  it("limits employee status updates to own tasks and disables writes while archived", () => {
    expect(canChangeTaskStatus(project, task, "a")).toBe(true);
    expect(canChangeTaskStatus(project, task, "b")).toBe(false);
    expect(
      canChangeTaskStatus(
        {
          ...project,
          permissions: { ...project.permissions, manageTasks: true },
        },
        task,
        "b",
      ),
    ).toBe(true);
    expect(canChangeTaskStatus({ ...project, archived: true }, task, "a")).toBe(
      false,
    );
  });
  it("derives overdue without discarding the workflow status", () => {
    expect(effectiveTaskStatus(task, Date.parse("2026-10-01"))).toBe("overdue");
    expect(
      effectiveTaskStatus(
        { ...task, status: "done" },
        Date.parse("2026-10-01"),
      ),
    ).toBe("done");
    expect(
      effectiveTaskStatus({ ...task, dueAt: null }, Date.parse("2026-10-01")),
    ).toBe("todo");
  });
  it("requires replacement for each child managed by the removed member", () => {
    const child = {
      ...project,
      _id: "child",
      parentProject: "root",
      members: [
        { _id: "a", name: "A", email: "a@example.test", role: "MANAGER" },
      ],
    } as Project;
    expect(
      managedProjectsForMember({ ...project, children: [child] }, "a").map(
        (p) => p._id,
      ),
    ).toEqual(["child"]);
    expect(
      managedProjectsForMember({ ...project, children: [child] }, "b"),
    ).toEqual([]);
    const summary = {
      _id: "summary-child",
      name: "Summary",
      description: "",
      managerId: "b",
      manager: null,
      memberCount: 1,
      archived: false,
      version: 1,
      accessible: false,
      managedByMe: false,
      progress: { total: 0, done: 0, overdue: 0, percent: 0 },
    };
    expect(
      managedProjectsForMember(
        { ...project, children: [summary] },
        "b",
      ).map((item) => item._id),
    ).toEqual(["summary-child"]);
  });
  it("keeps the director first and prioritizes the current user within their role", () => {
    const hierarchy = {
      ...project,
      kind: "hierarchical",
      childManagerIds: ["manager-z", "manager-me", "manager-a"],
      members: [
        {
          _id: "employee-a",
          name: "An",
          email: "employee-a@example.test",
          role: "EMPLOYEE",
        },
        {
          _id: "manager-z",
          name: "Zed",
          email: "manager-z@example.test",
          role: "EMPLOYEE",
        },
        {
          _id: "director",
          name: "Bình",
          email: "director@example.test",
          role: "DIRECTOR",
        },
        {
          _id: "employee-me",
          name: "Chi",
          email: "employee-me@example.test",
          role: "EMPLOYEE",
        },
        {
          _id: "manager-me",
          name: "Minh",
          email: "manager-me@example.test",
          role: "EMPLOYEE",
        },
        {
          _id: "manager-a",
          name: "An",
          email: "manager-a@example.test",
          role: "EMPLOYEE",
        },
        {
          _id: "employee-z",
          name: "Zoe",
          email: "employee-z@example.test",
          role: "EMPLOYEE",
        },
      ],
    } as Project;

    expect(
      orderedProjectMembers(hierarchy, "manager-me").map(
        (member) => member._id,
      ),
    ).toEqual([
      "director",
      "manager-me",
      "manager-a",
      "manager-z",
      "employee-a",
      "employee-me",
      "employee-z",
    ]);
    expect(
      orderedProjectMembers(hierarchy, "employee-me").map(
        (member) => member._id,
      ),
    ).toEqual([
      "director",
      "manager-a",
      "manager-me",
      "manager-z",
      "employee-me",
      "employee-a",
      "employee-z",
    ]);
  });
});
