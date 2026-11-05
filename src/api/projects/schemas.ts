import { z } from "zod";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const version = z.number().int().positive().optional();
export const chatGroupId = z.string().uuid();
export const chatGroupInput = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();
export const projectFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
};
