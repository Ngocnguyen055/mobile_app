import type { Express } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  cleanupTemporaryUploads,
  deleteGridFsFiles,
  removeTemporaryFiles,
  uploadTemporaryFile,
} from "../gridFsStorage.ts";
import { Comment, Discussion, Document } from "../models.ts";
import { emitNotification } from "../notifications.ts";
import {
  HttpError,
  projectAccess,
  requireWritable,
  withWritableProject,
} from "../projectAccess.ts";

import {
  DISCUSSION_ATTACHMENT_MAX_FILES,
  filesFromRequest,
  upload,
  validateFiles,
} from "./attachments.ts";
import { canEditDiscussion, canRemoveDiscussion } from "./policy.ts";
import { loadPost, populatedPost } from "./postService.ts";
import { postInput, postPatch } from "./schemas.ts";
export function installPostRoutes(app: Express) {
  const base = "/projects/:projectId";
  app.get(`${base}/discussions`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    const visible = access.permissions.moderate
      ? {}
      : {
        $or: [{ hidden: { $ne: true } }, { author: req.userId }],
      };
    const posts = await Discussion.find({
      project: access.project.id,
      ...visible,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .populate("author", "name email")
      .populate("attachments", "name mime size uploader createdAt");
    const counts = await Comment.aggregate<{
      _id: mongoose.Types.ObjectId;
      total: number;
    }>([
      { $match: { post: { $in: posts.map((post) => post._id) } } },
      { $group: { _id: "$post", total: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((row) => [String(row._id), row.total]));
    return res.json(
      posts.map((post) => ({
        ...post.toObject(),
        commentCount: byId.get(post.id) ?? 0,
      })),
    );
  });
  app.post(
    `${base}/discussions`,
    upload.array("files", DISCUSSION_ATTACHMENT_MAX_FILES),
    cleanupTemporaryUploads,
    async (req, res) => {
      const access = await projectAccess(
        String(req.params.projectId),
        req.userId!,
      );
      requireWritable(access);
      const files = filesFromRequest(req.files);
      const gridFsFileIds: unknown[] = [];
      let metadataCommitted = false;
      try {
        const data = postInput.parse(req.body);
        validateFiles(files);
        if (!data.body && !files.length)
          throw new HttpError(400, "body or attachment required");
        for (const file of files) {
          gridFsFileIds.push(
            await uploadTemporaryFile(file, {
              kind: "discussion",
              uploaderId: req.userId!,
              projectId: access.project.id,
            }),
          );
        }
        const id = await withWritableProject(
          access.project.id,
          req.userId!,
          async (current, session) => {
            const [post] = await Discussion.create(
              [
                {
                  ...data,
                  project: current.project.id,
                  author: req.userId,
                },
              ],
              { session },
            );
            if (files.length) {
              const documents = await Document.insertMany(
                files.map((file, index) => ({
                  project: current.project.id,
                  post: post.id,
                  uploader: req.userId,
                  name: file.originalname.slice(0, 160),
                  mime: file.mimetype,
                  size: file.size,
                  gridFsFileId: gridFsFileIds[index],
                })),
                { session },
              );
              post.attachments = documents.map((document) => document._id);
              await post.save({ session });
            }
            await emitNotification({
              actorId: req.userId,
              recipientIds: current.project.members.map(String),
              projectId: current.project.id,
              type: "discussion_created",
              title: `Bài thảo luận mới: ${post.title}`,
              entityId: post.id,
              session,
            });
            return post.id;
          },
        );
        metadataCommitted = true;
        return res.status(201).json(await populatedPost(id));
      } catch (error) {
        if (!metadataCommitted) await deleteGridFsFiles(gridFsFileIds);
        throw error;
      } finally {
        await removeTemporaryFiles(files);
      }
    },
  );
  app.patch(`${base}/discussions/:id`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    requireWritable(access);
    const { revision, ...data } = postPatch.parse(req.body);
    const id = await withWritableProject(
      access.project.id,
      req.userId!,
      async (current, session) => {
        const post = await loadPost(
          current.project.id,
          String(req.params.id),
          req.userId!,
          current,
          session,
        );
        if (!canEditDiscussion(String(post.author), req.userId!))
          throw new HttpError(403, "only the author may edit content");
        if (data.body === "" && !post.attachments.length)
          throw new HttpError(400, "body or attachment required");
        const updated = await Discussion.findOneAndUpdate(
          {
            _id: post.id,
            revision: revision ?? post.revision,
          },
          { $set: data, $inc: { revision: 1 } },
          { new: true, session },
        );
        if (!updated) throw new HttpError(409, "discussion changed; reload");
        return post.id;
      },
    );
    return res.json(await populatedPost(id));
  });
  app.patch(`${base}/discussions/:id/visibility`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    requireWritable(access);
    if (!access.permissions.moderate)
      throw new HttpError(403, "moderator required");
    const { hidden } = z
      .object({ hidden: z.boolean() })
      .strict()
      .parse(req.body);
    const id = await withWritableProject(
      access.project.id,
      req.userId!,
      async (current, session) => {
        const post = await loadPost(
          current.project.id,
          String(req.params.id),
          req.userId!,
          current,
          session,
        );
        await Discussion.updateOne(
          { _id: post.id },
          { $set: { hidden }, $inc: { revision: 1 } },
          { session },
        );
        return post.id;
      },
      "moderate",
    );
    return res.json(await populatedPost(id));
  });
  app.delete(`${base}/discussions/:id`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    requireWritable(access);
    let gridFsFileIds: unknown[] = [];
    await withWritableProject(
      access.project.id,
      req.userId!,
      async (current, session) => {
        const post = await loadPost(
          current.project.id,
          String(req.params.id),
          req.userId!,
          current,
          session,
        );
        if (
          !canRemoveDiscussion(
            String(post.author),
            req.userId!,
            current.permissions.moderate,
          )
        )
          throw new HttpError(403, "author or moderator required");
        const documents = await Document.find({ post: post.id })
          .select("gridFsFileId")
          .session(session ?? null);
        gridFsFileIds = documents.map((document) => document.gridFsFileId);
        await Comment.deleteMany({ post: post.id }, { session });
        await Document.deleteMany({ post: post.id }, { session });
        await Discussion.deleteOne({ _id: post.id }, { session });
      },
    );
    await deleteGridFsFiles(gridFsFileIds);
    return res.json({ ok: true });
  });

}
