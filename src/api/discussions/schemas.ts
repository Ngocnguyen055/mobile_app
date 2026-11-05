import { z } from "zod";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const textFields = {
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(5000).default(""),
};
export const postInput = z.object(textFields).strict();
export const postPatch = z
  .object(textFields)
  .partial()
  .extend({ revision: z.number().int().positive().optional() })
  .strict();
export const commentInput = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .strict();
export const commentPatch = commentInput.extend({
  revision: z.number().int().positive().optional(),
});
