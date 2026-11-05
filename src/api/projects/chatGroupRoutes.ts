import type { Express } from "express";
import {
  ChatGroupRecord
} from "../models.ts";
import {
  HttpError,
  getProjectChatGroup,
  listProjectChatGroups,
  projectAccess,
  requirePermission,
  requireWritable,
} from "../projectAccess.ts";

import { projectId, touchScope, transaction } from "./mutations.ts";
import { chatGroupId, chatGroupInput } from "./schemas.ts";
export function installProjectChatGroupRoutes(app: Express) {
  // Kept for older clients; group identity is server owned and never overwritten by a client.
  app.post("/projects/:projectId/chat-group", async (req, res) => {
    const access = await projectAccess(projectId(req), req.userId!);
    return res.json({
      chatGroupId: access.project.chatGroupId,
      chatRevision: access.project.chatRevision || 1,
    });
  });
  app.get("/projects/:projectId/chat-groups", async (req, res) => {
    const access = await projectAccess(projectId(req), req.userId!);
    return res.json(await listProjectChatGroups(access));
  });
  app.post("/projects/:projectId/chat-groups", async (req, res) => {
    const input = chatGroupInput.parse(req.body);
    if (input.name.localeCompare("Chung", "vi", { sensitivity: "base" }) === 0)
      throw new HttpError(409, "chat group name is reserved");
    const id = await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requireWritable(access);
      requirePermission(access, "manageProject");
      const [created] = await ChatGroupRecord.create(
        [
          {
            project: access.project._id,
            name: input.name,
            createdBy: req.userId,
          },
        ],
        { session },
      );
      await touchScope(access, session, true);
      return created.groupId;
    });
    return res.status(201).json(await getProjectChatGroup(id));
  });
  app.delete(
    "/projects/:projectId/chat-groups/:groupId",
    async (req, res) => {
      const id = chatGroupId.parse(req.params.groupId);
      await transaction(async (session) => {
        const access = await projectAccess(projectId(req), req.userId!, session);
        requireWritable(access);
        requirePermission(access, "manageProject");
        if (id === access.project.chatGroupId)
          throw new HttpError(409, "default chat group cannot be deleted");
        const deleted = await ChatGroupRecord.findOneAndUpdate(
          { groupId: id, project: access.project._id, deletedAt: null },
          { $set: { deletedAt: new Date() } },
          { new: true, session },
        );
        if (!deleted) throw new HttpError(404, "chat group not found");
        await touchScope(access, session, true);
      });
      return res.json({ ok: true });
    },
  );

}
