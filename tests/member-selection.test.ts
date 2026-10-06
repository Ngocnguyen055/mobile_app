import { describe, expect, it } from "vitest";
import { filterMembersByEmail } from "../src/mobile/memberSelection.ts";

describe("member email selection", () => {
  const members = [
    { _id: "a", name: "Alice", email: "Alice@Example.test" },
    { _id: "b", name: "Bob Smith", email: "bob@company.test" },
    { _id: "c", name: "Carol", email: "carol@example.test" },
  ];

  it("returns every member in the original order for an empty query", () => {
    expect(filterMembersByEmail(members, "")).toEqual(members);
    expect(filterMembersByEmail(members, "   ")).toEqual(members);
    expect(filterMembersByEmail([], "")).toEqual([]);
  });

  it("matches part of an email, ignoring case and surrounding query spaces", () => {
    expect(filterMembersByEmail(members, "  EXAMPLE  ")).toEqual([
      members[0],
      members[2],
    ]);
    expect(filterMembersByEmail(members, "LiCe@")).toEqual([members[0]]);
  });

  it("returns no members when the email does not match", () => {
    expect(filterMembersByEmail(members, "missing@test")).toEqual([]);
    expect(filterMembersByEmail(members, "Bob Smith")).toEqual([]);
  });

  it("does not mutate the input array or its members", () => {
    const users = Object.freeze(members.map((member) => Object.freeze({ ...member })));
    const before = users.map((user) => ({ ...user }));

    const result = filterMembersByEmail(users, "example");

    expect(users).toEqual(before);
    expect(result).toEqual([users[0], users[2]]);
    expect(result[0]).toBe(users[0]);
    expect(result[1]).toBe(users[2]);
    expect(result).not.toBe(users);
  });
});
