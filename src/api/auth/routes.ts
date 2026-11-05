import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { listContactsForUser } from "../contactService.ts";
import { User } from "../models.ts";

import type { Express } from "express";
import { secret } from "../config.ts";
import { check } from "../http/validation.ts";
export function installAuthRoutes(app: Express) {
  app.post("/auth/register", async (req, res) => {
    const data = check(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().email().max(120),
        password: z.string().min(8).max(100),
      }),
      req.body,
    );
    const email = data.email.toLowerCase();
    if (await User.exists({ email }))
      return res.status(409).json({ error: "email already used" });
    const user = await User.create({
      name: data.name,
      email,
      passwordHash: await bcrypt.hash(data.password, 10),
    });
    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: "7d" });
    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });
  app.post("/auth/login", async (req, res) => {
    const data = check(
      z.object({ email: z.string().email(), password: z.string() }),
      req.body,
    );
    const user = await User.findOne({ email: data.email.toLowerCase() });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash)))
      return res.status(401).json({ error: "invalid credentials" });
    return res.json({
      token: jwt.sign({ sub: user.id }, secret, { expiresIn: "7d" }),
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

}

export function installAccountRoutes(app: Express) {
  app.get("/me", async (req, res) => {
    const user = await User.findById(req.userId).select("name email");
    res.json(user);
  });
  app.get("/contacts", async (req, res) => {
    return res.json(await listContactsForUser(req.userId!));
  });

}
