import { useEffect, useState } from "react";
import type { ReminderOffset } from "../services/local.ts";
import type { CalendarEvent } from "../types/api.ts";
import type { EventDraft } from "../types/index.ts";
import {
  eventEndOneHourAfter,
  formatViDate,
  parseViDateTime,
  toViDateTimeInput
} from "../utils/calendar.ts";

type Options = {
  selectedDay: Date;
  onSelectedDayChange: (day: Date) => void;
  fixedProjectId?: string;
  readOnly: boolean;
  canManageEvents: boolean;
  canCreateEvent: boolean;
  initialEvent?: CalendarEvent | null;
  defaultReminderOffsets: ReminderOffset[];
  onInitialEventHandled?: () => void;
  onSaveEvent: (event: CalendarEvent | null, draft: EventDraft) => Promise<void>;
};
export function useCalendarEventEditor({
  selectedDay,
  onSelectedDayChange: setSelectedDay,
  fixedProjectId,
  readOnly,
  canManageEvents,
  canCreateEvent,
  initialEvent,
  defaultReminderOffsets,
  onInitialEventHandled,
  onSaveEvent,
}: Options) {
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAtValue] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [eventOffsets, setEventOffsets] = useState<ReminderOffset[]>(
    defaultReminderOffsets,
  );
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");

  const resetEditor = () => {
    setEditing(null);
    setEditorVisible(false);
    setTitle("");
    setStartsAtValue("");
    setEndsAt("");
    setAllDay(false);
    setEventOffsets(defaultReminderOffsets);
    setEditorError("");
  };

  const beginNew = () => {
    if (readOnly || !canCreateEvent) return;
    const day = formatViDate(selectedDay);
    const start = parseViDateTime(`${day} 09:00`);
    const end = parseViDateTime(`${day} 10:00`);
    setEditing(null);
    setTitle("");
    setStartsAtValue(toViDateTimeInput(start));
    setEndsAt(toViDateTimeInput(end));
    setAllDay(false);
    setEventOffsets(
      defaultReminderOffsets.length ? [defaultReminderOffsets[0]] : [0],
    );
    setEditorError("");
    setEditorVisible(true);
  };

  const beginEdit = (event: CalendarEvent) => {
    if (readOnly || !canManageEvents) return;
    setEditing(event);
    setTitle(event.title);
    setStartsAtValue(toViDateTimeInput(event.startsAt));
    setEndsAt(toViDateTimeInput(event.endsAt));
    setAllDay(!!event.allDay);
    setEventOffsets([
      ((event.reminderOffsets || [0])[0] ?? 0) as ReminderOffset,
    ]);
    setEditorError("");
    setEditorVisible(true);
  };

  useEffect(() => {
    if (!initialEvent) return;
    setSelectedDay(new Date(initialEvent.startsAt));
    beginEdit(initialEvent);
    onInitialEventHandled?.();
  }, [initialEvent?._id]);

  const setStartsAt = (value: string) => {
    setStartsAtValue(value);
    if (editing) return;
    try {
      setEndsAt(eventEndOneHourAfter(value));
    } catch {
      /* Keep the current end while a date-time value is incomplete. */
    }
  };

  const submit = async () => {
    try {
      if (readOnly || !canManageEvents)
        throw new Error("Lịch dự án này chỉ được xem.");
      setEditorError("");
      let start = parseViDateTime(startsAt);
      let end = parseViDateTime(endsAt);
      if (allDay) {
        start = parseViDateTime(`${formatViDate(start)} 00:00`);
        end = parseViDateTime(`${formatViDate(end)} 00:00`);
        if (end <= start && formatViDate(end) === formatViDate(start))
          end = new Date(start.getTime() + 86400000);
      }
      if (!title.trim())
        throw new Error("Nội dung sự kiện không được để trống.");
      if (end <= start)
        throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
      setSaving(true);
      await onSaveEvent(editing, {
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay,
        reminderOffsets: eventOffsets,
        projectId: fixedProjectId || null,
      });
      resetEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () => {
    if (!saving) resetEditor();
  };

  return {
    editing,
    editorVisible,
    title,
    setTitle,
    startsAt,
    setStartsAt,
    endsAt,
    setEndsAt,
    allDay,
    setAllDay,
    eventOffsets,
    setEventOffsets,
    saving,
    editorError,
    beginNew,
    beginEdit,
    submit,
    closeEditor,
  };
}
