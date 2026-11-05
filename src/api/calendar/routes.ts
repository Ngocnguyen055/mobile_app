import mongoose from "mongoose";
import { Event, Task } from "../models.ts";
import {
  HttpError,
  accessibleProjectIds,
  lockWritableProject,
  withWritableProject,
} from "../projectAccess.ts";

import type { Express } from "express";
import { ownProject } from "../http/projectContext.ts";
import { check, objectId } from "../http/validation.ts";
import {
  calendarQuery,
  eventInput,
  eventPatchInput,
  standaloneEventInput,
  standaloneEventPatchInput,
} from "./schemas.ts";
const idOf = (value: unknown) => String(value || "");
const eventForUser = async (
  eventId: string,
  userId: string,
  session: mongoose.ClientSession,
) => {
  if (!objectId.safeParse(eventId).success) return null;
  const projectIds = await accessibleProjectIds(userId, session);
  return Event.findOne({
    _id: eventId,
    $or: [
      { project: null, createdBy: userId },
      { project: { $in: projectIds } },
    ],
  }).session(session);
};

export function installCalendarRoutes(app: Express) {
  app.get("/calendar", async (req, res) => {
    const range = check(calendarQuery, req.query);
    const projectIds = await accessibleProjectIds(req.userId!);
    const dueAt: {
      $ne: null;
      $gte?: Date;
      $lt?: Date
    } = { $ne: null };
    if (range.from) dueAt.$gte = new Date(range.from);
    if (range.to) dueAt.$lt = new Date(range.to);
    const time: Record<string, unknown> = {};
    if (range.from) time.endsAt = { $gt: new Date(range.from) };
    if (range.to) time.startsAt = { $lt: new Date(range.to) };
    const eventAccess: Record<string, unknown>[] = [
      { project: null, createdBy: req.userId },
    ];
    if (projectIds.length) eventAccess.push({ project: { $in: projectIds } });
    const [tasks, events] = await Promise.all([
      Task.find({ project: { $in: projectIds }, assignee: req.userId, dueAt })
        .sort({ dueAt: 1 })
        .populate("project", "name")
        .populate("assignee", "name email")
        .select("-__v"),
      Event.find({ $and: [{ $or: eventAccess }, time] })
        .sort({ startsAt: 1 })
        .populate("project", "name")
        .select("-__v"),
    ]);
    return res.json({ tasks, events });
  });
  app.post("/events", async (req, res) => {
    const { projectId, ...data } = check(standaloneEventInput, req.body);
    const event = projectId
      ? await withWritableProject(
        projectId,
        req.userId!,
        async (access, session) => {
          const [created] = await Event.create(
            [{ ...data, project: access.project.id, createdBy: req.userId }],
            { session },
          );
          return created;
        },
        "manageTasks",
      )
      : await Event.create({ ...data, project: null, createdBy: req.userId });
    event.$session(null);
    await event.populate("project", "name");
    return res.status(201).json(event);
  });
  app.patch("/events/:eventId", async (req, res) => {
    const { projectId, ...data } = check(standaloneEventPatchInput, req.body);
    const event = await mongoose.connection.transaction(async (session) => {
      const current = await eventForUser(
        req.params.eventId,
        req.userId!,
        session,
      );
      if (!current) throw new HttpError(404, "event not found");
      const sourceId = idOf(current.project);
      const targetId = projectId === undefined ? sourceId : projectId || "";
      if (sourceId !== targetId && idOf(current.createdBy) !== req.userId)
        throw new HttpError(403, "only event creator can move event");
      // Check both the source and destination; an employee cannot move personal data into a project.
      for (const scope of [
        ...new Set([sourceId, targetId].filter(Boolean)),
      ].sort())
        await lockWritableProject(scope, req.userId!, session, "manageTasks");
      const startsAt = data.startsAt
        ? new Date(data.startsAt)
        : current.startsAt;
      const endsAt = data.endsAt ? new Date(data.endsAt) : current.endsAt;
      if (+endsAt <= +startsAt)
        throw new HttpError(400, "end must be after start");
      current.set({ ...data, project: targetId || null });
      await current.save({ session });
      return current;
    });
    event.$session(null);
    await event.populate("project", "name");
    return res.json(event);
  });
  app.delete("/events/:eventId", async (req, res) => {
    await mongoose.connection.transaction(async (session) => {
      const event = await eventForUser(
        req.params.eventId,
        req.userId!,
        session,
      );
      if (!event) throw new HttpError(404, "event not found");
      if (event.project)
        await lockWritableProject(
          idOf(event.project),
          req.userId!,
          session,
          "manageTasks",
        );
      await event.deleteOne({ session });
    });
    return res.json({ ok: true });
  });
  app.get("/projects/:projectId/events", async (req, res) => {
    const project = await ownProject(req, res);
    if (project)
      res.json(await Event.find({ project: project.id }).sort({ startsAt: 1 }));
  });
  app.post("/projects/:projectId/events", async (req, res) => {
    const data = check(eventInput, req.body);
    const event = await withWritableProject(
      String(req.params.projectId),
      req.userId!,
      async (access, session) => {
        const [created] = await Event.create(
          [{ ...data, project: access.project.id, createdBy: req.userId }],
          { session },
        );
        return created;
      },
      "manageTasks",
    );
    return res.status(201).json(event);
  });
  app.patch("/projects/:projectId/events/:eventId", async (req, res) => {
    const data = check(eventPatchInput, req.body);
    const event = await withWritableProject(
      String(req.params.projectId),
      req.userId!,
      async (access, session) => {
        const current = await Event.findOne({
          _id: req.params.eventId,
          project: access.project.id,
        }).session(session);
        if (!current) throw new HttpError(404, "event not found");
        const startsAt = data.startsAt
          ? new Date(data.startsAt)
          : current.startsAt;
        const endsAt = data.endsAt ? new Date(data.endsAt) : current.endsAt;
        if (+endsAt <= +startsAt)
          throw new HttpError(400, "end must be after start");
        current.set(data);
        await current.save({ session });
        return current;
      },
      "manageTasks",
    );
    return res.json(event);
  });
  app.delete("/projects/:projectId/events/:eventId", async (req, res) => {
    await withWritableProject(
      String(req.params.projectId),
      req.userId!,
      async (access, session) => {
        await Event.deleteOne(
          { _id: req.params.eventId, project: access.project.id },
          { session },
        );
      },
      "manageTasks",
    );
    return res.json({ ok: true });
  });

}
