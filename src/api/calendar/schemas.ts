import { z } from "zod";
import { date, objectId } from "../http/validation.ts";
export const reminderOffset = z.union([
  z.literal(604800000),
  z.literal(86400000),
  z.literal(3600000),
  z.literal(1800000),
  z.literal(300000),
  z.literal(0),
]);
export const eventCreateFields = {
  title: z.string().trim().min(1).max(120),
  startsAt: date,
  endsAt: date,
  note: z.string().max(2000).default(""),
  allDay: z.boolean().default(false),
  reminderOffsets: z
    .array(reminderOffset)
    .max(3)
    .refine((v) => new Set(v).size === v.length, "duplicate reminder offset")
    .default([]),
};
export const eventInput = z
  .object(eventCreateFields)
  .strict()
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
export const standaloneEventInput = z
  .object({ projectId: objectId.nullable().optional(), ...eventCreateFields })
  .strict()
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
export const eventPatchInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    startsAt: date,
    endsAt: date,
    note: z.string().max(2000),
    allDay: z.boolean(),
    reminderOffsets: z
      .array(reminderOffset)
      .max(3)
      .refine((v) => new Set(v).size === v.length, "duplicate reminder offset"),
  })
  .partial()
  .strict()
  .refine(
    (v) =>
      !v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
export const standaloneEventPatchInput = z
  .object({
    projectId: objectId.nullable().optional(),
    title: z.string().trim().min(1).max(120).optional(),
    startsAt: date.optional(),
    endsAt: date.optional(),
    note: z.string().max(2000).optional(),
    allDay: z.boolean().optional(),
    reminderOffsets: z
      .array(reminderOffset)
      .max(3)
      .refine((v) => new Set(v).size === v.length, "duplicate reminder offset")
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      !v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "end must be after start",
  );
export const calendarQuery = z
  .object({ from: date.optional(), to: date.optional() })
  .strict()
  .refine(
    (v) => !v.from || !v.to || Date.parse(v.to) > Date.parse(v.from),
    "to must be after from",
  );
