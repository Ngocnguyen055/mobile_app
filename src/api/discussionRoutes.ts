import type { Express } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import { Comment, Discussion, Document } from "./models.ts";
import { HttpError, projectAccess, requireWritable, withWritableProject } from "./projectAccess.ts";
import { emitNotification } from "./notifications.ts";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const textFields = {
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(5000).default(""),
};
const postInput = z.object(textFields).strict();
const postPatch = z.object(textFields).partial()
  .extend({ revision: z.number().int().positive().optional() }).strict();
const commentInput = z.object({
  body: z.string().trim().min(1).max(2000),
}).strict();
const commentPatch = commentInput.extend({
  revision: z.number().int().positive().optional(),
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024, files: 3, fields: 2, fieldSize: 20000 },
});
const mimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv", "application/octet-stream",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
export function validAttachmentMime(mime: string) { return mimeTypes.has(mime); }
export function canEditDiscussion(authorId: string, userId: string) {
  return authorId === userId;
}
export function canRemoveDiscussion(authorId: string, userId: string, moderate: boolean) {
  return authorId === userId || moderate;
}
export function canReadDiscussion(hidden: boolean, authorId: string, userId: string, moderate: boolean) {
  return !hidden || authorId === userId || moderate;
}

type Access = Awaited<ReturnType<typeof projectAccess>>;
async function loadPost(projectId: string, postId: string, userId: string, access: Access, session?: mongoose.ClientSession) {
  const post = await Discussion.findOne({
    _id: objectId.parse(postId), project: projectId,
  }).session(session ?? null);
  if (!post || !canReadDiscussion(!!post.hidden, String(post.author), userId, access.permissions.moderate))
    throw new HttpError(404, "discussion not found");
  return post;
}
async function populatedPost(postId: string) {
  return Discussion.findById(postId).populate("author", "name email")
    .populate("attachments", "name mime size uploader createdAt");
}
function filesFromRequest(files: Express.Request["files"]) {
  return Array.isArray(files) ? files : [];
}
function validateFiles(files: Express.Multer.File[]) {
  if (files.some((file) => !validAttachmentMime(file.mimetype)))
    throw new HttpError(400, "unsupported attachment type");
}

export function installDiscussionRoutes(app: Express) {
  const base = "/projects/:projectId";
  app.get(`${base}/discussions`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    const visible = access.permissions.moderate ? {} : {
      $or: [{ hidden: { $ne: true } }, { author: req.userId }],
    };
    const posts = await Discussion.find({ project: access.project.id, ...visible })
      .sort({ createdAt: -1, _id: -1 }).limit(100)
      .populate("author", "name email")
      .populate("attachments", "name mime size uploader createdAt");
    const counts = await Comment.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
      { $match: { post: { $in: posts.map((post) => post._id) } } },
      { $group: { _id: "$post", total: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((row) => [String(row._id), row.total]));
    return res.json(posts.map((post) => ({ ...post.toObject(), commentCount: byId.get(post.id) ?? 0 })));
  });
  app.post(`${base}/discussions`, upload.array("files", 3), async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    const data = postInput.parse(req.body);
    const files = filesFromRequest(req.files);
    validateFiles(files);
    if (!data.body && !files.length) throw new HttpError(400, "body or attachment required");
    const id = await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const [post] = await Discussion.create([{
        ...data, project: current.project.id, author: req.userId,
      }], { session });
      if (files.length) {
        const documents = await Document.insertMany(files.map((file) => ({
          project: current.project.id, post: post.id, uploader: req.userId,
          name: file.originalname.slice(0, 160), mime: file.mimetype,
          size: file.size, data: file.buffer,
        })), { session });
        post.attachments = documents.map((document) => document._id);
        await post.save({ session });
      }
      await emitNotification({
        actorId: req.userId, recipientIds: current.project.members.map(String),
        projectId: current.project.id, type: "discussion_created",
        title: `Bài thảo luận mới: ${post.title}`, entityId: post.id, session,
      });
      return post.id;
    });
    return res.status(201).json(await populatedPost(id));
  });
  app.patch(`${base}/discussions/:id`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    const { revision, ...data } = postPatch.parse(req.body);
    const id = await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const post = await loadPost(current.project.id, String(req.params.id), req.userId!, current, session);
      if (!canEditDiscussion(String(post.author), req.userId!))
        throw new HttpError(403, "only the author may edit content");
      if (data.body === "" && !post.attachments.length)
        throw new HttpError(400, "body or attachment required");
      const updated = await Discussion.findOneAndUpdate({
        _id: post.id, revision: revision ?? post.revision,
      }, { $set: data, $inc: { revision: 1 } }, { new: true, session });
      if (!updated) throw new HttpError(409, "discussion changed; reload");
      return post.id;
    });
    return res.json(await populatedPost(id));
  });
  app.patch(`${base}/discussions/:id/visibility`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    if (!access.permissions.moderate) throw new HttpError(403, "moderator required");
    const { hidden } = z.object({ hidden: z.boolean() }).strict().parse(req.body);
    const id = await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const post = await loadPost(current.project.id, String(req.params.id), req.userId!, current, session);
      await Discussion.updateOne({ _id: post.id }, { $set: { hidden }, $inc: { revision: 1 } }, { session });
      return post.id;
    }, "moderate");
    return res.json(await populatedPost(id));
  });
  app.delete(`${base}/discussions/:id`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const post = await loadPost(current.project.id, String(req.params.id), req.userId!, current, session);
      if (!canRemoveDiscussion(String(post.author), req.userId!, current.permissions.moderate))
        throw new HttpError(403, "author or moderator required");
      await Comment.deleteMany({ post: post.id }, { session });
      await Document.deleteMany({ post: post.id }, { session });
      await Discussion.deleteOne({ _id: post.id }, { session });
    });
    return res.json({ ok: true });
  });
  app.get(`${base}/discussions/:id/comments`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    const post = await loadPost(access.project.id, String(req.params.id), req.userId!, access);
    return res.json(await Comment.find({ post: post.id }).sort({ createdAt: 1, _id: 1 })
      .limit(200).populate("author", "name email"));
  });
  app.post(`${base}/discussions/:id/comments`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    const data = commentInput.parse(req.body);
    // Mentions use @[24-character userId] and are intersected with project membership.
    const mentions = [...data.body.matchAll(/@\[([a-f\d]{24})\]/gi)].map((match) => match[1]);
    const id = await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const post = await loadPost(current.project.id, String(req.params.id), req.userId!, current, session);
      const participants = await Comment.distinct("author", { post: post.id }).session(session);
      const [comment] = await Comment.create([{
        ...data, project: current.project.id, post: post.id, author: req.userId,
      }], { session });
      await emitNotification({
        actorId: req.userId,
        recipientIds: post.hidden ? [String(post.author)] : [String(post.author), ...participants.map(String), ...mentions],
        projectId: current.project.id, type: "comment_created",
        title: `Bình luận mới: ${post.title}`, entityId: post.id, session,
      });
      return comment.id;
    });
    return res.status(201).json(await Comment.findById(id).populate("author", "name email"));
  });
  app.patch(`${base}/discussions/:id/comments/:commentId`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    const { revision, body } = commentPatch.parse(req.body);
    const updated = await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const post = await loadPost(current.project.id, String(req.params.id), req.userId!, current, session);
      const comment = await Comment.findOne({
        _id: objectId.parse(req.params.commentId), post: post.id,
      }).session(session);
      if (!comment) throw new HttpError(404, "comment not found");
      if (String(comment.author) !== req.userId) throw new HttpError(403, "only the author may edit content");
      const result = await Comment.findOneAndUpdate({
        _id: comment.id, revision: revision ?? comment.revision,
      }, { $set: { body }, $inc: { revision: 1 } }, { new: true, session }).populate("author", "name email");
      if (!result) throw new HttpError(409, "comment changed; reload");
      return result;
    });
    return res.json(updated);
  });
  app.delete(`${base}/discussions/:id/comments/:commentId`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const post = await loadPost(current.project.id, String(req.params.id), req.userId!, current, session);
      const comment = await Comment.findOne({
        _id: objectId.parse(req.params.commentId), post: post.id,
      }).session(session);
      if (!comment) throw new HttpError(404, "comment not found");
      if (!canRemoveDiscussion(String(comment.author), req.userId!, current.permissions.moderate))
        throw new HttpError(403, "author or moderator required");
      await comment.deleteOne({ session });
    });
    return res.json({ ok: true });
  });
  app.get(`${base}/documents`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    const visiblePosts = await Discussion.distinct("_id", {
      project: access.project.id,
      ...(access.permissions.moderate ? {} : {
        $or: [{ hidden: { $ne: true } }, { author: req.userId }],
      }),
    });
    return res.json(await Document.find({
      project: access.project.id,
      $or: [{ post: null }, { post: { $in: visiblePosts } }],
    }).select("-data").sort({ createdAt: -1 }).limit(100));
  });
  app.post(`${base}/documents`, upload.single("file"), async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    requireWritable(access);
    if (!req.file) throw new HttpError(400, "file required, max 512 KiB");
    validateFiles([req.file]);
    const file = req.file;
    const doc = await withWritableProject(access.project.id, req.userId!, async (current, session) => {
      const [result] = await Document.create([{
        project: current.project.id, uploader: req.userId, post: null,
        name: file.originalname.slice(0, 160), mime: file.mimetype,
        size: file.size, data: file.buffer,
      }], { session });
      return result;
    });
    return res.status(201).json({ id: doc.id, name: doc.name, size: doc.size, mime: doc.mime });
  });
  app.get(`${base}/documents/:id`, async (req, res) => {
    const access = await projectAccess(String(req.params.projectId), req.userId!);
    const doc = await Document.findOne({
      _id: objectId.parse(req.params.id), project: access.project.id,
    });
    if (!doc) throw new HttpError(404, "document not found");
    if (doc.post) await loadPost(access.project.id, String(doc.post), req.userId!, access);
    res.setHeader("Content-Type", validAttachmentMime(doc.mime) ? doc.mime : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
    return res.send(doc.data);
  });
}
