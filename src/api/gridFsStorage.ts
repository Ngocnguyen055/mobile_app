import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";

const bucketName = "uploads";
const uploadDirectory = join(tmpdir(), "student-planner-uploads");

const diskStorage = multer.diskStorage({
  destination: (_req, _file, done) => {
    void mkdir(uploadDirectory, { recursive: true }).then(
      () => done(null, uploadDirectory),
      (error) => done(error as Error, uploadDirectory),
    );
  },
  filename: (_req, _file, done) => done(null, randomUUID()),
});

export function temporaryUpload(limits: multer.Options["limits"]) {
  return multer({ storage: diskStorage, limits });
}

export async function removeTemporaryFiles(
  files: Express.Multer.File[],
): Promise<void> {
  await Promise.all(
    files.map((file) => rm(file.path, { force: true }).catch(() => undefined)),
  );
}

export function cleanupTemporaryUploads(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    const files = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : [];
    void removeTemporaryFiles(files);
  };
  res.once("finish", cleanup);
  res.once("close", cleanup);
  next();
}

function gridFsBucket() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB connection is not ready");
  return new mongoose.mongo.GridFSBucket(database, { bucketName });
}

export async function uploadTemporaryFile(
  file: Express.Multer.File,
  metadata: Record<string, string | number | null>,
) {
  const bucket = gridFsBucket();
  const target = bucket.openUploadStream(file.originalname, {
    contentType: file.mimetype,
    metadata,
  });
  try {
    await pipeline(createReadStream(file.path), target);
    return target.id;
  } catch (error) {
    await bucket.delete(target.id).catch(() => undefined);
    throw error;
  }
}

export async function pipeGridFsFile(
  fileId: unknown,
  destination: NodeJS.WritableStream,
) {
  await pipeline(
    gridFsBucket().openDownloadStream(
      new mongoose.Types.ObjectId(String(fileId)),
    ),
    destination,
  );
}

export async function deleteGridFsFiles(fileIds: unknown[]): Promise<void> {
  const ids = fileIds.filter(Boolean);
  if (!ids.length) return;
  const bucket = gridFsBucket();
  await Promise.all(
    ids.map((id) =>
      bucket
        .delete(new mongoose.Types.ObjectId(String(id)))
        .catch(() => undefined),
    ),
  );
}
