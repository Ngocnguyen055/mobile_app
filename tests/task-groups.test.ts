import { describe, expect, it } from "vitest";
import type { Project, Task } from "../src/mobile/services/api.ts";
import {
  compareTasksForDisplay,
  filterTaskMembers,
  groupTasksByAssignee,
  orderTaskAssignees,
  orderTaskPeople,
  taskAssigneeRole,
} from "../src/mobile/utils/taskGroups.ts";

const task = (id: string, assignee?: Task["assignee"]) =>
  ({ _id: id, title: id, assignee }) as Task;

describe("task assignee groups", () => {
  it("groups by assignee, puts the current user first, and unassigned last", () => {
    const groups = groupTasksByAssignee(
      [
        task("mine-z", "me"),
        task("other-1", "other"),
        task("mine-a", { _id: "me", name: "Bình", email: "b@test" }),
        task("none"),
      ],
      [
        { _id: "me", name: "Bình" },
        { _id: "other", name: "An" },
      ],
      "me",
    );

    expect(groups.map((group) => group.key)).toEqual([
      "me",
      "other",
      "unassigned",
    ]);
    expect(groups[0]).toMatchObject({ name: "Bình", isCurrentUser: true });
    expect(groups[0].tasks).toHaveLength(2);
    expect(groups[0].tasks.map((item) => item._id)).toEqual([
      "mine-a",
      "mine-z",
    ]);
    expect(groups[2].name).toBe("Chưa phân công");
  });

  it("orders progress people with the current user first and others alphabetically", () => {
    const ordered = orderTaskPeople(
      [
        { userId: "chi", name: "Chi" },
        { userId: "", name: "Chưa phân công" },
        { userId: "an", name: "An" },
        { userId: "me", name: "Bình" },
      ],
      [],
      "me",
    );

    expect(ordered.map((person) => person.userId)).toEqual([
      "me",
      "an",
      "chi",
      "",
    ]);
  });

  it("finds members by accent-insensitive name or email", () => {
    const members = [
      { _id: "one", name: "Nguyễn Bình", email: "binh@example.com" },
      { _id: "two", name: "An", email: "an@school.test" },
    ];

    expect(
      filterTaskMembers(members, "nguyen").map((member) => member._id),
    ).toEqual(["one"]);
    expect(
      filterTaskMembers(members, "school").map((member) => member._id),
    ).toEqual(["two"]);
  });

  it("puts the current user first, then hierarchy roles and names", () => {
    const project = {
      kind: "hierarchical",
      owner: "director",
      manager: "manager-z",
      parentProject: "root",
      children: [],
    } as unknown as Project;
    const members = [
      { _id: "employee-a", name: "An", email: "a@test", role: "EMPLOYEE" },
      {
        _id: "manager-z",
        name: "Zed",
        email: "z@test",
        role: "EMPLOYEE",
      },
      { _id: "director", name: "Bình", email: "b@test", role: "OWNER" },
      { _id: "me", name: "Chi", email: "c@test", role: "EMPLOYEE" },
      {
        _id: "manager-a",
        name: "An",
        email: "m@test",
        role: "MANAGER",
      },
    ] as const;

    expect(
      orderTaskAssignees(project, [...members], "me").map(
        (member) => member._id,
      ),
    ).toEqual(["me", "director", "manager-a", "manager-z", "employee-a"]);
    expect(taskAssigneeRole(project, members[2])).toBe("DIRECTOR");
    expect(taskAssigneeRole(project, members[1])).toBe("MANAGER");
    expect(taskAssigneeRole(project, members[0])).toBe("EMPLOYEE");
  });

  it("orders active tasks by deadline and FIFO creation before completed tasks", () => {
    const rows = [
      {
        ...task("done", "me"),
        status: "done",
        dueAt: "2026-11-06T01:00:00.000Z",
        createdAt: "2026-11-01T01:00:00.000Z",
      },
      {
        ...task("later", "me"),
        status: "todo",
        dueAt: "2026-11-08T01:00:00.000Z",
        createdAt: "2026-11-01T01:00:00.000Z",
      },
      {
        ...task("soon-new", "me"),
        status: "doing",
        dueAt: "2026-11-07T01:00:00.000Z",
        createdAt: "2026-11-03T01:00:00.000Z",
      },
      {
        ...task("soon-old", "me"),
        status: "todo",
        dueAt: "2026-11-07T01:00:00.000Z",
        createdAt: "2026-11-02T01:00:00.000Z",
      },
      {
        ...task("no-deadline", "me"),
        status: "todo",
        dueAt: null,
        createdAt: "2026-10-01T01:00:00.000Z",
      },
    ] as Task[];

    expect([...rows].sort(compareTasksForDisplay).map((item) => item._id)).toEqual([
      "soon-old",
      "soon-new",
      "later",
      "no-deadline",
      "done",
    ]);
    expect(
      groupTasksByAssignee(rows, [{ _id: "me", name: "Bình" }], "me")[0]
        .tasks.map((item) => item._id),
    ).toEqual(["soon-old", "soon-new", "later", "no-deadline", "done"]);
  });
});
