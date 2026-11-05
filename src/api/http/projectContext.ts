import type { Request, Response } from "express";
import { assertWritable, projectAccess } from "../projectAccess.ts";
export const ownProject = async (req: Request, res: Response) => {
  const access = await projectAccess(String(req.params.projectId), req.userId!);
  if (req.method !== "GET") assertWritable(access);
  res.locals.projectAccess = access;
  return access.project;
};
