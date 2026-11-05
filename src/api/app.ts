import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { installAccountRoutes, installAuthRoutes } from "./auth/routes.ts";
import { installCalendarRoutes } from "./calendar/routes.ts";
import { installChatPersistenceRoutes } from "./chatPersistenceRoutes.ts";
import { installDirectChatRoutes } from "./directChatRoutes.ts";
import { installDiscussionRoutes } from "./discussionRoutes.ts";
import { auth } from "./http/auth.ts";
import { errorHandler } from "./http/errorHandler.ts";
import { installNotificationRoutes } from "./notifications.ts";
import { installProjectRoutes } from "./projectRoutes.ts";
import { installTaskRoutes } from "./tasks/routes.ts";

/** Compose HTTP middleware and routes without opening a database or listening port. */
export function createApi() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_req, res) =>
    res.json({ service: "api", mongo: mongoose.connection.readyState === 1 }),
  );
  installAuthRoutes(app);
  app.use(auth);
  installProjectRoutes(app);
  installDiscussionRoutes(app);
  installNotificationRoutes(app);
  installDirectChatRoutes(app);
  installChatPersistenceRoutes(app);
  installAccountRoutes(app);
  installCalendarRoutes(app);
  installTaskRoutes(app);
  app.use(errorHandler);
  return app;
}
