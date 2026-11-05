import type { Express } from "express";
import {
  Project,
  Task,
  User
} from "../models.ts";
import {
  accessibleProjectIds,
  effectiveTaskStatus,
  idOf,
  projectAccess,
  projectMemberIds,
} from "../projectAccess.ts";

import { projectId } from "./mutations.ts";
export function installProjectProgressRoutes(app: Express) {
  app.get("/projects/:projectId/progress", async (req, res) => {
    const access = await projectAccess(projectId(req), req.userId!);
    const scopes =
      access.project.kind === "hierarchical" && !access.project.parentProject
        ? [
          access.project,
          ...(await Project.find({
            parentProject: access.project._id,
            _id: { $in: await accessibleProjectIds(req.userId!) },
          })),
        ]
        : [access.project];
    const tasks = await Task.find({
      project: { $in: scopes.map((p) => p._id) },
    })
      .sort({ dueAt: 1 })
      .lean();
    const users = await User.find({
      _id: { $in: [...new Set(scopes.flatMap(projectMemberIds))] },
    })
      .select("name email")
      .lean();
    const now = Date.now();
    const withStatus = tasks.map((task) => ({
      ...task,
      effectiveStatus: effectiveTaskStatus(task, now),
      projectName: scopes.find((p) => p.id === idOf(task.project))?.name,
    }));
    const count = (scopeTasks: typeof withStatus) => ({
      total: scopeTasks.length,
      done: scopeTasks.filter((t) => t.status === "done").length,
      dueSoon: scopeTasks.filter(
        (t) =>
          t.status !== "done" &&
          t.dueAt &&
          +t.dueAt >= now &&
          +t.dueAt < now + 86400000,
      ).length,
      overdue: scopeTasks.filter((t) => t.effectiveStatus === "overdue").length,
    });
    return res.json({
      ...count(withStatus),
      byProject: scopes.map((p) => ({
        projectId: p.id,
        name: p.name,
        ...count(withStatus.filter((t) => idOf(t.project) === p.id)),
      })),
      byPerson: users.map((user) => {
        const mine = withStatus.filter(
          (t) => idOf(t.assignee) === idOf(user._id),
        );
        return {
          userId: idOf(user._id),
          name: user.name,
          ...count(mine),
          tasks: mine,
        };
      }),
    });
  });
}
