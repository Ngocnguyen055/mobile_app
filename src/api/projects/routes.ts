import type { Express } from "express";
import { z } from "zod";
import {
  Project,
  ProjectMember,
  Task,
  User,
} from "../models.ts";
import { emitNotification } from "../notifications.ts";
import {
  HttpError,
  accessibleProjectIds,
  effectiveTaskStatus,
  idOf,
  projectAccess,
  projectDto,
  projectMemberIds,
  requirePermission,
  requireWritable,
} from "../projectAccess.ts";

import {
  checkVersion,
  projectId,
  setMember,
  touchScope,
  transaction,
} from "./mutations.ts";
import { objectId, projectFields, version } from "./schemas.ts";
export function installProjectCrudRoutes(app: Express) {
  app.get("/projects", async (req, res) => {
    const ids = await accessibleProjectIds(req.userId!);
    const projects = await Project.find({ _id: { $in: ids } }).sort({
      createdAt: -1,
      _id: -1,
    });
    return res.json(
      await Promise.all(
        projects.map(async (p) =>
          projectDto(await projectAccess(p.id, req.userId!)),
        ),
      ),
    );
  });
  app.post("/projects", async (req, res) => {
    const data = z
      .object({
        ...projectFields,
        kind: z.enum(["independent", "hierarchical"]).default("independent"),
      })
      .strict()
      .parse(req.body);
    const id = await transaction(async (session) => {
      const [project] = await Project.create(
        [{ ...data, owner: req.userId, members: [req.userId] }],
        { session },
      );
      await setMember(
        project,
        req.userId!,
        data.kind === "hierarchical" ? "DIRECTOR" : "OWNER",
        session,
      );
      return project.id;
    });
    return res
      .status(201)
      .json(await projectDto(await projectAccess(id, req.userId!)));
  });
  app.get("/projects/:projectId", async (req, res) => {
    const access = await projectAccess(projectId(req), req.userId!);
    const dto = await projectDto(access);
    const children =
      access.project.kind === "hierarchical" && !access.project.parentProject
        ? await Project.find({
          parentProject: access.project._id,
        }).sort({ createdAt: -1, _id: -1 })
        : [];
    const accessibleIds = new Set(
      children.length ? await accessibleProjectIds(req.userId!) : [],
    );
    const [childTasks, managers] = children.length
      ? await Promise.all([
        Task.find({ project: { $in: children.map((child) => child._id) } })
          .select("project status dueAt")
          .lean(),
        User.find({
          _id: {
            $in: children.map((child) => child.manager).filter(Boolean),
          },
        })
          .select("name email")
          .lean(),
      ])
      : [[], []];
    const now = Date.now();
    return res.json({
      ...dto,
      children: children.map((child) => {
        const tasks = childTasks.filter(
          (task) => idOf(task.project) === child.id,
        );
        const done = tasks.filter((task) => task.status === "done").length;
        const overdue = tasks.filter(
          (task) => effectiveTaskStatus(task, now) === "overdue",
        ).length;
        const managerId = idOf(child.manager);
        const manager = managers.find(
          (candidate) => idOf(candidate._id) === managerId,
        );
        return {
          _id: child.id,
          name: child.name,
          description: child.description || "",
          managerId,
          manager: manager
            ? {
              _id: idOf(manager._id),
              name: manager.name,
              email: manager.email,
              role: "MANAGER",
            }
            : null,
          memberCount: projectMemberIds(child).length,
          archived: !!child.archived || access.archived,
          version: child.version || 1,
          accessible: accessibleIds.has(child.id),
          managedByMe: managerId === req.userId,
          progress: {
            total: tasks.length,
            done,
            overdue,
            percent: tasks.length ? Math.round((done * 100) / tasks.length) : 0,
          },
        };
      }),
    });
  });
  app.post("/projects/:projectId/children", async (req, res) => {
    const input = z
      .object({
        ...projectFields,
        managerId: objectId,
        memberIds: z.array(objectId).max(200).default([]),
        version,
      })
      .strict()
      .parse(req.body);
    const id = await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "createChildren");
      requireWritable(access);
      checkVersion(access, input.version);
      const rootMembers = projectMemberIds(access.project);
      if (input.managerId === idOf(access.root.owner))
        throw new HttpError(
          400,
          "choose a member other than director as manager",
        );
      const ids = [
        ...new Set([req.userId!, input.managerId, ...input.memberIds]),
      ];
      if (!ids.every((id) => rootMembers.includes(id)))
        throw new HttpError(400, "child members must belong to root project");
      const [child] = await Project.create(
        [
          {
            name: input.name,
            description: input.description,
            kind: "hierarchical",
            parentProject: access.project._id,
            owner: access.root.owner,
            manager: input.managerId,
            members: ids,
          },
        ],
        { session },
      );
      await ProjectMember.insertMany(
        ids.map((id) => ({
          project: child._id,
          user: id,
          role:
            id === req.userId
              ? "DIRECTOR"
              : id === input.managerId
                ? "MANAGER"
                : "EMPLOYEE",
        })),
        { session },
      );
      await touchScope(access, session);
      await emitNotification({
        actorId: req.userId!,
        recipientIds: ids,
        projectId: child.id,
        type: "project_member_added",
        title: `Bạn được thêm vào dự án ${child.name}`,
        session,
      });
      return child.id;
    });
    return res
      .status(201)
      .json(await projectDto(await projectAccess(id, req.userId!)));
  });
  app.patch("/projects/:projectId", async (req, res) => {
    const input = z
      .object({
        name: projectFields.name.optional(),
        description: z.string().max(2000).optional(),
        version,
      })
      .strict()
      .parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageProject");
      requireWritable(access);
      checkVersion(access, input.version);
      const data = { ...input };
      delete data.version;
      await Project.updateOne(
        { _id: access.project._id },
        { $set: data },
        { session },
      );
      await touchScope(access, session);
      await emitNotification({
        actorId: req.userId!,
        recipientIds: projectMemberIds(access.project),
        projectId: access.project.id,
        type: "project_updated",
        title: `Dự án ${access.project.name} được cập nhật`,
        session,
      });
    });
    return res.json(
      await projectDto(await projectAccess(projectId(req), req.userId!)),
    );
  });
  app.patch("/projects/:projectId/archive", async (req, res) => {
    const input = z
      .object({
        archived: z.boolean(),
        restoreChildren: z.boolean().optional(),
        version,
      })
      .strict()
      .parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageProject");
      checkVersion(access, input.version);
      if (
        access.project.parentProject &&
        access.root.archived &&
        !input.archived
      )
        throw new HttpError(423, "restore root project first");
      await Project.updateOne(
        { _id: access.project._id },
        { $set: { archived: input.archived } },
        { session },
      );
      await touchScope(access, session, true);
      if (
        access.project.kind === "hierarchical" &&
        !access.project.parentProject &&
        (input.archived || input.restoreChildren)
      ) {
        await Project.updateMany(
          { parentProject: access.project._id },
          {
            $set: { archived: input.archived },
            $inc: { version: 1, chatRevision: 1 },
          },
          { session },
        );
      }
      await emitNotification({
        actorId: req.userId!,
        recipientIds: projectMemberIds(access.project),
        projectId: access.project.id,
        type: "project_updated",
        title: input.archived
          ? `Dự án ${access.project.name} được lưu trữ`
          : `Dự án ${access.project.name} được khôi phục`,
        session,
      });
    });
    return res.json(
      await projectDto(await projectAccess(projectId(req), req.userId!)),
    );
  });
  app.patch("/projects/:projectId/resources", async (req, res) => {
    const input = z
      .object({
        plannedHours: z.number().finite().min(0),
        actualHours: z.number().finite().min(0),
        plannedBudget: z.number().finite().min(0),
        spentBudget: z.number().finite().min(0),
        version,
      })
      .strict()
      .parse(req.body);
    await transaction(async (session) => {
      const access = await projectAccess(projectId(req), req.userId!, session);
      requirePermission(access, "manageResources");
      requireWritable(access);
      checkVersion(access, input.version);
      const data = { ...input };
      delete data.version;
      await Project.updateOne(
        { _id: access.project._id },
        { $set: data },
        { session },
      );
      await touchScope(access, session);
    });
    return res.json(
      await projectDto(await projectAccess(projectId(req), req.userId!)),
    );
  });

}
