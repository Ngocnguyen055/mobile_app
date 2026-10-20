import { describe, expect, it } from "vitest";
import type { Task } from "../src/mobile/services/api.ts";
import {
  filterTaskMembers,
  groupTasksByAssignee,
  orderTaskPeople,
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
});
