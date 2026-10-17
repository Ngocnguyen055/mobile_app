import { describe, expect, it } from "vitest";
import { Event } from "../src/api/models.ts";

const userId = "100000000000000000000001";
const validOffsets = [604800000, 86400000, 3600000, 1800000, 300000, 0];

describe("calendar reminder options", () => {
  it("accepts every reminder option, including event start", () => {
    for (const reminderOffset of validOffsets) {
      const event = new Event({
        title: "Nhắc lịch",
        startsAt: new Date("2026-10-20T02:00:00.000Z"),
        endsAt: new Date("2026-10-20T03:00:00.000Z"),
        createdBy: userId,
        reminderOffsets: [reminderOffset],
      });
      expect(event.validateSync()).toBeUndefined();
    }
  });

  it("still rejects unsupported reminder offsets", () => {
    const event = new Event({
      title: "Nhắc lịch",
      startsAt: new Date("2026-10-20T02:00:00.000Z"),
      endsAt: new Date("2026-10-20T03:00:00.000Z"),
      createdBy: userId,
      reminderOffsets: [12345],
    });
    expect(event.validateSync()?.errors["reminderOffsets.0"]).toBeDefined();
  });
});
