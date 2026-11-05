import type { Express } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  Project,
  ProjectMember,
  Task
} from "../models.ts";
import { emitNotification } from "../notifications.ts";
import {
  HttpError,
  idOf,
  projectAccess,
  projectDto,
  projectMemberIds,
  requirePermission,
  requireWritable,
} from "../projectAccess.ts";

import {
  appoint,
  checkVersion,
  memberUser,
  projectId,
  setMember,
  touch,
  touchScope,
  transaction,
} from "./mutations.ts";
import { objectId, version } from "./schemas.ts";
export function installProjectMemberRoutes(app: Express) {
  app.post("/projects/:projectId/members", async (req, res) => {
    const input = z
      .object({
        email: z.string().email().optional(),
        userId: objectId.optional(),
        version,
      })
      .strict()
      .refine((v) => !!v.email !== !!v.userId, "provide either email or userId")
      .parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageMembers");
      requireWritable(access);
      checkVersion(access, input.version);
      const user = await memberUser(input, session);
      if (projectMemberIds(access.project).includes(user.id))
        throw new HttpError(409, "Thành viên này đã có trong dự án");
      if (
        access.project.parentProject &&
        !projectMemberIds(access.root).includes(user.id)
      ) {
        if (access.role !== "DIRECTOR")
          throw new HttpError(400, "choose an existing root project member");
        await setMember(access.root, user.id, "EMPLOYEE", session);
        await touch(access.root, session, true);
        await emitNotification({
          actorId: req.userId!,
          recipientIds: [user.id],
          projectId: access.root.id,
          type: "project_member_added",
          title: `Bạn được thêm vào dự án ${access.root.name}`,
          session,
        });
      }
      await setMember(
        access.project,
        user.id,
        access.project.kind === "hierarchical" ? "EMPLOYEE" : "MEMBER",
        session,
      );
      await touchScope(access, session, true);
      await emitNotification({
        actorId: req.userId!,
        recipientIds: [user.id],
        projectId: access.project.id,
        type: "project_member_added",
        title: `Bạn được thêm vào dự án ${access.project.name}`,
        session,
      });
    });
    return res.json(
      await projectDto(await projectAccess(projectId(req), req.userId!)),
    );
  });
  app.put("/projects/:projectId/manager", async (req, res) => {
    const input = z
      .object({ userId: objectId, version })
      .strict()
      .parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requireWritable(access);
      checkVersion(access, input.version);
      await appoint(access, input.userId, session);
      await touchScope(access, session, true);
      await emitNotification({
        actorId: req.userId!,
        recipientIds: [input.userId],
        projectId: access.project.id,
        type: "manager_appointed",
        title: `Bạn được bổ nhiệm Trưởng phòng: ${access.project.name}`,
        session,
      });
    });
    return res.json(
      await projectDto(await projectAccess(projectId(req), req.userId!)),
    );
  });
  app.delete("/projects/:projectId/members/:userId", async (req, res) => {
    const input = z
      .object({
        version,
        reassignTo: objectId.nullable().optional(),
        replacementManagers: z
          .array(z.object({ projectId: objectId, userId: objectId }).strict())
          .max(200)
          .default([]),
      })
      .strict()
      .parse(req.body ?? {});
    const removedId = objectId.parse(String(req.params.userId));
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageMembers");
      requireWritable(access);
      checkVersion(access, input.version);
      if (removedId === idOf(access.root.owner))
        throw new HttpError(403, "cannot remove project owner/director");
      if (!projectMemberIds(access.project).includes(removedId)) return;
      const children =
        access.project.kind === "hierarchical" && !access.project.parentProject
          ? await Project.find({
            parentProject: access.project._id,
            members: removedId,
          }).session(session)
          : [];
      const scopes = [access.project, ...children];
      for (const scope of scopes) {
        if (idOf(scope.manager) === removedId) {
          if (access.role !== "DIRECTOR")
            throw new HttpError(403, "only director can replace manager");
          const replacement = input.replacementManagers.find(
            (item) => item.projectId === scope.id,
          );
          if (!replacement || replacement.userId === removedId)
            throw new HttpError(
              409,
              `manager replacement required: ${scope.id}`,
            );
          await appoint(
            await projectAccess(scope.id, req.userId!, session),
            replacement.userId,
            session,
          );
          if (!projectMemberIds(scope).includes(replacement.userId))
            scope.members.push(new mongoose.Types.ObjectId(replacement.userId));
          await emitNotification({
            actorId: req.userId!,
            recipientIds: [replacement.userId],
            projectId: scope.id,
            type: "manager_appointed",
            title: `Bạn được bổ nhiệm Trưởng phòng: ${scope.name}`,
            session,
          });
        }
        if (
          input.reassignTo &&
          (input.reassignTo === removedId ||
            !projectMemberIds(scope).includes(input.reassignTo))
        )
          throw new HttpError(
            400,
            `replacement assignee must belong to affected project: ${scope.id}`,
          );
      }
      for (const scope of scopes) {
        await ProjectMember.deleteOne(
          { project: scope._id, user: removedId },
          { session },
        );
        await Project.updateOne(
          { _id: scope._id },
          { $pull: { members: removedId } },
          { session },
        );
        await Task.updateMany(
          { project: scope._id, assignee: removedId },
          {
            ...(input.reassignTo
              ? { $set: { assignee: input.reassignTo } }
              : { $unset: { assignee: 1 } }),
            $inc: { version: 1 },
          },
          { session },
        );
        await touch(scope, session, true);
        if (input.reassignTo)
          await emitNotification({
            actorId: req.userId!,
            recipientIds: [input.reassignTo],
            projectId: scope.id,
            type: "task_assigned",
            title: "Công việc đã được chuyển giao cho bạn",
            session,
          });
      }
      if (access.project.parentProject) await touch(access.root, session);
    });
    return res.json({ ok: true });
  });

}
