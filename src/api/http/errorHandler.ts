import {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  HttpError
} from "../projectAccess.ts";

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError)
    return res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError)
    return res.status(400).json({ error: error.flatten() });
  if (error instanceof Error && error.name === "MulterError")
    return res.status(400).json({ error: error.message });
  if (error instanceof mongoose.Error.CastError)
    return res.status(400).json({ error: "invalid ID" });
  if (error instanceof mongoose.Error.ValidationError)
    return res.status(400).json({ error: error.message });
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  )
    return res.status(409).json({ error: "duplicate value" });
  console.error(error);
  return res.status(500).json({ error: "internal error" });
};
