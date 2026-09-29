import { describe, expect, it } from "vitest";
import {
  CALENDAR_SCOPE_OPTIONS,
  calendarCreatePermissions,
  calendarProjectId,
  matchesCalendarScope,
} from "../src/mobile/calendarPolicy.ts";

describe("calendar scope and action policy", () => {
  it("always exposes exactly the three aggregate filters", () => {
    expect(CALENDAR_SCOPE_OPTIONS).toEqual([
      ["all", "Tất cả"],
      ["personal", "Cá nhân"],
      ["projects", "Dự án"],
    ]);
  });

  it("separates personal items from items belonging to any project", () => {
    const personalEvent = null;
    const firstProject = "000000000000000000000001";
    const secondProject = { _id: "000000000000000000000002" };

    expect(
      [personalEvent, firstProject, secondProject].filter((item) =>
        matchesCalendarScope("all", item),
      ),
    ).toHaveLength(3);
    expect(
      [personalEvent, firstProject, secondProject].filter((item) =>
        matchesCalendarScope("personal", item),
      ),
    ).toEqual([personalEvent]);
    expect(
      [personalEvent, firstProject, secondProject].filter((item) =>
        matchesCalendarScope("projects", item),
      ),
    ).toEqual([firstProject, secondProject]);
  });

  it("only allows event creation from the all and personal views", () => {
    expect(calendarCreatePermissions("all")).toEqual({
      canCreateEvent: true,
      canCreateTask: false,
    });
    expect(calendarCreatePermissions("personal")).toEqual({
      canCreateEvent: true,
      canCreateTask: false,
    });
    expect(calendarCreatePermissions("projects")).toEqual({
      canCreateEvent: false,
      canCreateTask: false,
    });
    expect(calendarCreatePermissions("all", "project-id")).toEqual({
      canCreateEvent: false,
      canCreateTask: false,
    });
  });

  it("extracts project IDs used by the project navigation flow", () => {
    expect(calendarProjectId("project-a")).toBe("project-a");
    expect(calendarProjectId({ _id: "project-b" })).toBe("project-b");
    expect(calendarProjectId(null)).toBe("");
  });
});
