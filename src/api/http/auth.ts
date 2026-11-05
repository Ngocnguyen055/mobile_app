import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { secret } from "../config.ts";
export const auth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = (req.header("authorization") || "").replace(/^Bearer /, "");
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    req.userId = String(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
};
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
