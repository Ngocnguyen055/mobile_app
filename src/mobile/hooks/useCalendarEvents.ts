import { useState } from "react";
import { getCalendar, putCalendarEvent, removeCalendarEvent } from "../services/api.ts";

import {
  calendarProjectId,
  type CalendarScope,
} from "../domain/calendarPolicy.ts";
import { cancelEventReminder, syncEventReminder } from "../services/local.ts";
import type { CalendarEvent, CalendarFeed, Task } from "../types/api.ts";
import type { EventDraft } from "../types/index.ts";

type UseCalendarEventsOptions = {
  projectId?: string;
  onError: (message: string) => void;
  onReloadProject: (projectId: string) => Promise<unknown>;
};

export function useCalendarEvents({
  projectId,
  onError,
  onReloadProject,
}: UseCalendarEventsOptions) {
  const [calendarTasks, setCalendarTasks] = useState<Task[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarScope, setCalendarScope] = useState<CalendarScope>("all");
  const [pendingProjectEvent, setPendingProjectEvent] =
    useState<CalendarEvent | null>(null);

  const setCalendarFeed = (feed: CalendarFeed) => {
    setCalendarTasks(feed.tasks);
    setCalendarEvents(feed.events);
  };

  const loadCalendar = async () => {
    const feed = await getCalendar();
    setCalendarFeed(feed);
    return feed;
  };

  const resetCalendar = () => {
    setCalendarTasks([]);
    setCalendarEvents([]);
    setCalendarScope("all");
    setPendingProjectEvent(null);
  };

  const saveCalendarEvent = async (
    current: CalendarEvent | null,
    draft: EventDraft,
  ) => {
    const saved = await putCalendarEvent(current?._id || null, draft);
    let warning = "";
    try {
      await syncEventReminder(saved);
    } catch (caught) {
      warning = `Sự kiện đã lưu nhưng chưa đặt được nhắc hẹn: ${String(caught)}`;
    }
    try {
      await loadCalendar();
    } catch (caught) {
      warning ||= `Sự kiện đã lưu nhưng chưa tải lại được lịch: ${String(caught)}`;
    }
    const savedProjectId = calendarProjectId(saved.project) || draft.projectId;
    if (projectId && savedProjectId === projectId) {
      try {
        await onReloadProject(projectId);
      } catch (caught) {
        warning ||= `Sự kiện đã lưu nhưng chưa tải lại được dự án: ${String(caught)}`;
      }
    }
    if (warning) onError(warning);
  };

  const deleteCalendarEvent = async (event: CalendarEvent) => {
    await removeCalendarEvent(event._id);
    let warning = "";
    try {
      await cancelEventReminder(event._id);
    } catch (caught) {
      warning = `Sự kiện đã xóa nhưng chưa hủy được nhắc hẹn: ${String(caught)}`;
    }
    try {
      await loadCalendar();
    } catch (caught) {
      warning ||= `Sự kiện đã xóa nhưng chưa tải lại được lịch: ${String(caught)}`;
    }
    if (projectId && calendarProjectId(event.project) === projectId) {
      try {
        await onReloadProject(projectId);
      } catch (caught) {
        warning ||= `Sự kiện đã xóa nhưng chưa tải lại được dự án: ${String(caught)}`;
      }
    }
    if (warning) onError(warning);
  };

  return {
    calendarTasks,
    calendarEvents,
    calendarScope,
    setCalendarScope,
    pendingProjectEvent,
    setPendingProjectEvent,
    setCalendarFeed,
    loadCalendar,
    resetCalendar,
    saveCalendarEvent,
    deleteCalendarEvent,
  };
}
