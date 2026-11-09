import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../src/mobile/types/api.ts";

const notificationMocks = vi.hoisted(() => ({
  cancel: vi.fn(async (_id: string) => undefined),
  schedule: vi.fn(async (_request: unknown) => "notification-id"),
}));
const databaseMocks = vi.hoisted(() => ({
  getFirst: vi.fn(async (..._args: unknown[]) => null),
  run: vi.fn(async (..._args: unknown[]) => ({
    changes: 1,
    lastInsertRowId: 1,
  })),
}));

vi.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: notificationMocks.cancel,
  scheduleNotificationAsync: notificationMocks.schedule,
}));

vi.mock("../src/mobile/services/storage/database.ts", () => ({
  db: async () => ({
    getFirstAsync: databaseMocks.getFirst,
    runAsync: databaseMocks.run,
  }),
}));

import { syncEventReminder } from "../src/mobile/services/reminders.ts";

type ScheduledRequest = {
  content: { title: string };
  trigger: { date: Date };
};

describe("calendar event notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a plain title at event start and a prefix for advance notice", async () => {
    const startsAt = new Date("2099-11-09T15:00:00.000Z");
    const event: CalendarEvent = {
      _id: "event-1",
      title: "Họp",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
      note: "",
      allDay: false,
      reminderOffsets: [300_000, 0],
    };

    await syncEventReminder(event);

    const scheduled = notificationMocks.schedule.mock.calls.map(
      ([request]) => request as ScheduledRequest,
    );
    const atStart = scheduled.find(
      (request) => request.trigger.date.getTime() === startsAt.getTime(),
    );
    const fiveMinutesBefore = scheduled.find(
      (request) =>
        request.trigger.date.getTime() === startsAt.getTime() - 300_000,
    );
    expect(atStart?.content.title).toBe("Họp");
    expect(fiveMinutesBefore?.content.title).toBe("Sắp diễn ra: Họp");

    const storedSignature = databaseMocks.run.mock.calls.at(-1)?.[3];
    expect(JSON.parse(storedSignature as string).at(-1)).toBe(2);
  });
});
