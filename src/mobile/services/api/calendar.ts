import type { CalendarEvent, CalendarFeed } from "../../types/api.ts";
import type { EventDraft } from "../../types/index.ts";
import { api, json } from "./client.ts";

export const getCalendar = () => api<CalendarFeed>("/calendar");
export const getProjectEvents = (projectId: string) =>
  api<CalendarEvent[]>(`/projects/${projectId}/events`);
export const putCalendarEvent = (eventId: string | null, draft: EventDraft) =>
  api<CalendarEvent>(
    eventId ? `/events/${eventId}` : "/events",
    json(eventId ? "PATCH" : "POST", draft),
  );
export const removeCalendarEvent = (eventId: string) =>
  api<{ ok: true }>(`/events/${eventId}`, json("DELETE"));
