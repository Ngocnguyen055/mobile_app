import { z } from "zod";
import { date, objectId } from "../http/validation.ts";
export const taskFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(3000).default(""),
  assignee: objectId.nullable().optional(),
  startsAt: date.nullable().optional(),
  dueAt: date.nullable().optional(),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
};
export const validTaskWindow = (value: {
  startsAt?: string | null;
  dueAt?: string | null;
}) =>
  !value.startsAt ||
  !value.dueAt ||
  Date.parse(value.startsAt) < Date.parse(value.dueAt);
export const taskInput = z
  .object(taskFields)
  .strict()
  .refine(validTaskWindow, "task start must be before due date");
export const taskPatchInput = z
  .object(taskFields)
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict()
  .refine(validTaskWindow, "task start must be before due date");
