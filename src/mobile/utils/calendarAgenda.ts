import type { CalendarEvent } from "../types/api.ts";
import { dateKey } from "./calendar.ts";
export function occursOn(event: CalendarEvent, day: Date) {
  const starts = dateKey(new Date(event.startsAt));
  const exclusiveEnd = Math.max(
    new Date(event.endsAt).getTime() - 1,
    new Date(event.startsAt).getTime(),
  );
  const ends = dateKey(new Date(exclusiveEnd));
  const key = dateKey(day);
  return starts <= key && key <= ends;
}

export function occursBetween(event: CalendarEvent, startKey: string, endKey: string) {
  const starts = dateKey(new Date(event.startsAt));
  const exclusiveEnd = Math.max(
    new Date(event.endsAt).getTime() - 1,
    new Date(event.startsAt).getTime(),
  );
  const ends = dateKey(new Date(exclusiveEnd));
  return starts <= endKey && ends >= startKey;
}
