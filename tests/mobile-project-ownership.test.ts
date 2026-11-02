import { describe, expect, it } from "vitest";
import type { Project, User } from "../src/mobile/services/api.ts";
import {
  filterProjects,
  formatProjectDatePeriod,
  moveProjectDatePeriod,
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

  it("filters by the current day, week, month, and year", () => {
    const now = new Date(2026, 10, 4, 12);
    const datedRows = [
      { ...rows[0], createdAt: new Date(2026, 10, 4, 8).toISOString() },
      {
        ...rows[0],
        _id: "000000000000000000000021",
        createdAt: new Date(2026, 10, 2, 8).toISOString(),
      },
      {
        ...rows[0],
        _id: "000000000000000000000022",
        createdAt: new Date(2026, 10, 1, 8).toISOString(),
      },
      {
        ...rows[0],
        _id: "000000000000000000000023",
        createdAt: new Date(2026, 0, 10, 8).toISOString(),
      },
      {
        ...rows[0],
        _id: "000000000000000000000024",
        createdAt: new Date(2025, 11, 31, 8).toISOString(),
      },
    ];

    expect(
      filterProjects(datedRows, "", "all", me._id, "day", now),
    ).toHaveLength(1);
    expect(
      filterProjects(datedRows, "", "all", me._id, "week", now),
    ).toHaveLength(2);
    expect(
      filterProjects(datedRows, "", "all", me._id, "month", now),
    ).toHaveLength(3);
    expect(
      filterProjects(datedRows, "", "all", me._id, "year", now),
    ).toHaveLength(4);
    expect(
      filterProjects(
        datedRows,
        "",
        "all",
        me._id,
        "month",
        new Date(2025, 11, 15),
      ),
    ).toHaveLength(1);

    expect(
      formatProjectDatePeriod(
        "week",
        moveProjectDatePeriod("week", now, -1),
        now,
      ),
    ).toBe("26/10 – 01/11/2026");
    expect(
      formatProjectDatePeriod(
        "month",
        moveProjectDatePeriod("month", now, -1),
        now,
      ),
    ).toBe("Tháng 10/2026");
    expect(
      formatProjectDatePeriod(
        "year",
        moveProjectDatePeriod("year", now, -1),
        now,
      ),
    ).toBe("Năm 2025");
  });
});
