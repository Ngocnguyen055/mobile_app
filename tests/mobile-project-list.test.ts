import { describe, expect, it } from "vitest";
import type { Project } from "../src/mobile/services/api.ts";
import {
  filterProjects,
  orderProjectsNewestFirst,
  projectPageCount,
  projectsForPage,
} from "../src/mobile/utils/projectList.ts";

const project = (id: string, createdAt: string) =>
  ({ _id: id, createdAt }) as Project;

describe("mobile project list", () => {
  it("searches project names without requiring Vietnamese accents", () => {
    const rows = [
      { ...project("000000000000000000000001", "2026-01-10T00:00:00.000Z"), name: "Đồ án tốt nghiệp" },
      { ...project("000000000000000000000002", "2026-03-10T00:00:00.000Z"), name: "Ứng dụng Mobile" },
    ];
    expect(filterProjects(rows, "do an").map((row) => row.name)).toEqual([
      "Đồ án tốt nghiệp",
    ]);
    expect(filterProjects(rows, "MOBILE").map((row) => row.name)).toEqual([
      "Ứng dụng Mobile",
    ]);
  });

  it("orders projects from newest to oldest by creation date", () => {
    const rows = [
      project("000000000000000000000001", "2026-01-10T00:00:00.000Z"),
      project("000000000000000000000002", "2026-03-10T00:00:00.000Z"),
      project("000000000000000000000003", "2026-02-10T00:00:00.000Z"),
    ];
    expect(orderProjectsNewestFirst(rows).map((row) => row._id)).toEqual([
      "000000000000000000000002",
      "000000000000000000000003",
      "000000000000000000000001",
    ]);
  });

  it("shows five projects per page and clamps invalid pages", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      project(
        String(index).padStart(24, "0"),
        `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );
    const ordered = orderProjectsNewestFirst(rows);
    expect(projectPageCount(ordered)).toBe(3);
    expect(projectsForPage(ordered, 0).items).toHaveLength(5);
    expect(projectsForPage(ordered, 1).items).toHaveLength(5);
    expect(projectsForPage(ordered, 99)).toMatchObject({ page: 2 });
    expect(projectsForPage(ordered, 99).items).toHaveLength(2);
  });
});
