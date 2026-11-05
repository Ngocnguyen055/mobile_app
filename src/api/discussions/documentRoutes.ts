import type { Express } from "express";
import {
  cleanupTemporaryUploads,
  deleteGridFsFiles,
  pipeGridFsFile,
  removeTemporaryFiles,
  uploadTemporaryFile,
} from "../gridFsStorage.ts";
import { Discussion, Document } from "../models.ts";
import {
  HttpError,
  projectAccess,
  requireWritable,
  withWritableProject,
} from "../projectAccess.ts";

import { upload, validAttachmentMime, validateFiles } from "./attachments.ts";
import { loadPost } from "./postService.ts";
import { objectId } from "./schemas.ts";
export function installDocumentRoutes(app: Express) {
  const base = "/projects/:projectId";
  app.get(`${base}/documents`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    const visiblePosts = await Discussion.distinct("_id", {
      project: access.project.id,
      ...(access.permissions.moderate
        ? {}
        : {
          $or: [{ hidden: { $ne: true } }, { author: req.userId }],
        }),
    });
    return res.json(
      await Document.find({
        project: access.project.id,
        $or: [{ post: null }, { post: { $in: visiblePosts } }],
      })
        .select("-data")
        .sort({ createdAt: -1 })
        .limit(100),
    );
  });
  app.post(
    `${base}/documents`,
    upload.single("file"),
    cleanupTemporaryUploads,
    async (req, res) => {
      const access = await projectAccess(
        String(req.params.projectId),
        req.userId!,
      );
      requireWritable(access);
      if (!req.file) throw new HttpError(400, "file required, max 5 MiB");
      const file = req.file;
      let gridFsFileId: unknown;
      let metadataCommitted = false;
      try {
        validateFiles([file]);
        gridFsFileId = await uploadTemporaryFile(file, {
          kind: "project-document",
          uploaderId: req.userId!,
          projectId: access.project.id,
        });
        const doc = await withWritableProject(
          access.project.id,
          req.userId!,
          async (current, session) => {
            const [result] = await Document.create(
              [
                {
                  project: current.project.id,
                  uploader: req.userId,
                  post: null,
                  name: file.originalname.slice(0, 160),
                  mime: file.mimetype,
                  size: file.size,
                  gridFsFileId,
                },
              ],
              { session },
            );
            return result;
          },
        );
        metadataCommitted = true;
        return res.status(201).json({
          id: doc.id,
          name: doc.name,
          size: doc.size,
          mime: doc.mime,
        });
      } catch (error) {
        if (!metadataCommitted && gridFsFileId)
          await deleteGridFsFiles([gridFsFileId]);
        throw error;
      } finally {
        await removeTemporaryFiles([file]);
      }
    },
  );
  app.get(`${base}/documents/:id`, async (req, res) => {
    const access = await projectAccess(
      String(req.params.projectId),
      req.userId!,
    );
    const doc = await Document.findOne({
      _id: objectId.parse(req.params.id),
      project: access.project.id,
    }).select("+data");
    if (!doc) throw new HttpError(404, "document not found");
    if (doc.post)
      await loadPost(access.project.id, String(doc.post), req.userId!, access);
    res.setHeader(
      "Content-Type",
      validAttachmentMime(doc.mime) ? doc.mime : "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    );
    res.setHeader("Content-Length", String(doc.size));
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("ETag", `\"document-${doc.id}-${doc.size}\"`);
    if (doc.gridFsFileId) {
      await pipeGridFsFile(doc.gridFsFileId, res);
      return;
    }
    if (!doc.data) throw new HttpError(404, "document content not found");
    return res.send(doc.data);
  });
}
