import type { Express } from "express";
import { Comment } from "../models.ts";
import { emitNotification } from "../notifications.ts";
import {
  HttpError,
  projectAccess,
  requireWritable,
  withWritableProject,
} from "../projectAccess.ts";

import { canRemoveDiscussion } from "./policy.ts";
import { loadPost } from "./postService.ts";
import { commentInput, commentPatch, objectId } from "./schemas.ts";
export function installCommentRoutes(app: Express) {
  const base = "/projects/:projectId";
  app.get(`${base}/discussions/:id/comments`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    const post = await loadPost(
      access.project.id,
      String(req.params.id),
      req.userId!,
      access,
    );
    return res.json(
      await Comment.find({ post: post.id })
        .sort({ createdAt: 1, _id: 1 })
        .limit(200)
        .populate("author", "name email"),
    );
  });
  app.post(`${base}/discussions/:id/comments`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    requireWritable(access);
    const data = commentInput.parse(req.body);
    // Mentions use @[24-character userId] and are intersected with project membership.
    const mentions = [...data.body.matchAll(/@\[([a-f\d]{24})\]/gi)].map(
      (match) => match[1],
    );
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
        const participants = await Comment.distinct("author", {
          post: post.id,
        }).session(session);
        const [comment] = await Comment.create(
          [
            {
              ...data,
              project: current.project.id,
              post: post.id,
              author: req.userId,
            },
          ],
          { session },
        );
        await emitNotification({
          actorId: req.userId,
          recipientIds: post.hidden
            ? [String(post.author)]
            : [String(post.author), ...participants.map(String), ...mentions],
          projectId: current.project.id,
          type: "comment_created",
          title: `Bình luận mới: ${post.title}`,
          entityId: post.id,
          session,
        });
        return comment.id;
      },
    );
    return res
      .status(201)
      .json(await Comment.findById(id).populate("author", "name email"));
  });
  app.patch(`${base}/discussions/:id/comments/:commentId`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    requireWritable(access);
    const { revision, body } = commentPatch.parse(req.body);
    const updated = await withWritableProject(
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
        const comment = await Comment.findOne({
          _id: objectId.parse(req.params.commentId),
          post: post.id,
        }).session(session);
        if (!comment) throw new HttpError(404, "comment not found");
        if (String(comment.author) !== req.userId)
          throw new HttpError(403, "only the author may edit content");
        const result = await Comment.findOneAndUpdate(
          {
            _id: comment.id,
            revision: revision ?? comment.revision,
          },
          { $set: { body }, $inc: { revision: 1 } },
          { new: true, session },
        ).populate("author", "name email");
        if (!result) throw new HttpError(409, "comment changed; reload");
        return result;
      },
    );
    return res.json(updated);
  });
  app.delete(
    `${base}/discussions/:id/comments/:commentId`,
    async (req, res) => {
      const access = await projectAccess(
        String(req.params.projectId),
        req.userId!,
      );
      requireWritable(access);
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
          const comment = await Comment.findOne({
            _id: objectId.parse(req.params.commentId),
            post: post.id,
          }).session(session);
          if (!comment) throw new HttpError(404, "comment not found");
          if (
            !canRemoveDiscussion(
              String(comment.author),
              req.userId!,
              current.permissions.moderate,
            )
          )
            throw new HttpError(403, "author or moderator required");
          await comment.deleteOne({ session });
        },
      );
      return res.json({ ok: true });
    },
  );

}
