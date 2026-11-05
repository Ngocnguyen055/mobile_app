import { Task } from "../models.ts";
import {
  emitNotification
} from "../notifications.ts";
import {
  HttpError,
  effectiveTaskStatus,
  projectMemberIds,
  withWritableProject,
} from "../projectAccess.ts";

import type { Express } from "express";
import { ownProject } from "../http/projectContext.ts";
import { check } from "../http/validation.ts";
import { taskInput, taskPatchInput } from "./schemas.ts";
const idOf = (value: unknown) => String(value || "");
export function installTaskRoutes(app: Express) {
  app.get("/projects/:projectId/tasks", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(
        (
          await Task.find({ project: project.id })
            .sort({ dueAt: 1 })
            .populate("assignee", "name email")
        ).map((task) => ({
          ...task.toObject(),
          effectiveStatus: effectiveTaskStatus(task),
        })),
      );
  });
  app.post("/projects/:projectId/tasks", async (req, res) => {
    const data = check(taskInput, req.body);
    const task = await withWritableProject(
      String(req.params.projectId),
      req.userId!,
      async (access, session) => {
        const project = access.project;
        if (data.assignee && !projectMemberIds(project).includes(data.assignee))
          throw new HttpError(400, "assignee not a member");
        const [created] = await Task.create(
          [{ ...data, project: project.id }],
          { session },
        );
        if (data.assignee)
          await emitNotification({
            actorId: req.userId!,
            recipientIds: [data.assignee],
            projectId: project.id,
            type: "task_assigned",
            title: `Bạn được giao task: ${created.title}`,
            entityId: created.id,
            session,
          });
        return created;
      },
      "manageTasks",
    );
    return res.status(201).json(task);
  });
  app.patch("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const { version, ...data } = check(taskPatchInput, req.body);
    const task = await withWritableProject(
      String(req.params.projectId),
      req.userId!,
      async (access, session) => {
        const project = access.project;
        if (data.assignee && !projectMemberIds(project).includes(data.assignee))
          throw new HttpError(400, "assignee not a member");
        const current = await Task.findOne({
          _id: req.params.taskId,
          project: project.id,
          version,
        }).session(session);
        if (!current)
          throw new HttpError(409, "task missing or version conflict; reload");
        if (
          !access.permissions.manageTasks &&
          (idOf(current.assignee) !== req.userId ||
            Object.keys(data).some((key) => key !== "status"))
        )
          throw new HttpError(
            403,
            "employees may only update the status of their own task",
          );
        const startsAt =
          data.startsAt === undefined
            ? current.startsAt
            : data.startsAt
              ? new Date(data.startsAt)
              : null;
        const dueAt =
          data.dueAt === undefined
            ? current.dueAt
            : data.dueAt
              ? new Date(data.dueAt)
              : null;
        if (startsAt && dueAt && +startsAt >= +dueAt)
          throw new HttpError(400, "task start must be before due date");
        const updated = await Task.findOneAndUpdate(
          {
            _id: req.params.taskId,
            project: project.id,
            version,
          },
          { $set: data, $inc: { version: 1 } },
          { new: true, session },
        );
        if (!updated)
          throw new HttpError(409, "task missing or version conflict; reload");
        await emitNotification({
          actorId: req.userId!,
          recipientIds: projectMemberIds(project),
          projectId: project.id,
          type: "task_updated",
          title: `Task cập nhật: ${updated.title}`,
          entityId: updated.id,
          session,
        });
        if (data.assignee && idOf(current.assignee) !== data.assignee)
          await emitNotification({
            actorId: req.userId!,
            recipientIds: [data.assignee],
            projectId: project.id,
            type: "task_assigned",
            title: `Bạn được giao task: ${updated.title}`,
            entityId: updated.id,
            session,
          });
        return updated;
      },
    );
    return res.json(task);
  });
  app.delete("/projects/:projectId/tasks/:taskId", async (req, res) => {
    await withWritableProject(
      String(req.params.projectId),
      req.userId!,
      async (access, session) => {
        await Task.deleteOne(
          { _id: req.params.taskId, project: access.project.id },
          { session },
        );
      },
      "manageTasks",
    );
    return res.json({ ok: true });
  });

}
