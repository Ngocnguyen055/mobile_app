import { z } from "zod";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const date = z.string().datetime({ offset: true });
export const check = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> =>
  schema.parse(input);
