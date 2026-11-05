import type { Express } from "express";
import { installProjectChatGroupRoutes } from "./projects/chatGroupRoutes.ts";
import { installProjectMemberRoutes } from "./projects/memberRoutes.ts";
import { installProjectProgressRoutes } from "./projects/progressRoutes.ts";
import { installProjectCrudRoutes } from "./projects/routes.ts";
export { withWritableProject } from "./projectAccess.ts";

export function installProjectRoutes(app: Express) {
  installProjectCrudRoutes(app);
  installProjectMemberRoutes(app);
  installProjectChatGroupRoutes(app);
  installProjectProgressRoutes(app);
}
