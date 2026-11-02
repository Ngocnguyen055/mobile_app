import { describe, expect, it } from "vitest";
import type { Project, User } from "../src/mobile/services/api.ts";
import {
  filterProjects,
  projectOwnerDetails,
} from "../src/mobile/utils/projectList.ts";

const me: User = {
  _id: "000000000000000000000001",
  name: "Người dùng hiện tại",
  email: "me@example.com",
};
const otherOwner: User = {
  _id: "000000000000000000000002",
  name: "Nguyễn Minh Anh",
  email: "minhanh@example.com",
};

function project(
  id: string,
  name: string,
  owner: User,
  members: User[],
): Project {
  return { _id: id, name, owner: owner._id, members } as Project;
}

const rows = [
  project("000000000000000000000011", "Dự án Mobile", me, [me]),
  project("000000000000000000000012", "Dự án bán hàng", otherOwner, [
    otherOwner,
    me,
  ]),
];

describe("mobile project ownership filter", () => {
  it("filters projects owned by the current user and projects owned by others", () => {
    expect(filterProjects(rows, "", "owned", me._id)).toEqual([rows[0]]);
    expect(filterProjects(rows, "", "other", me._id)).toEqual([rows[1]]);
    expect(filterProjects(rows, "", "all", me._id)).toEqual(rows);
  });

  it("combines the ownership filter with name search", () => {
    expect(filterProjects(rows, "ban hang", "other", me._id)).toEqual([
      rows[1],
    ]);
    expect(filterProjects(rows, "mobile", "other", me._id)).toEqual([]);
  });

  it("finds the owner profile used by project cards", () => {
    expect(projectOwnerDetails(rows[1])).toEqual(otherOwner);
  });
});
