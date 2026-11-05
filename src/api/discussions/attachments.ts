import {
  temporaryUpload
} from "../gridFsStorage.ts";
import {
  HttpError
} from "../projectAccess.ts";

export const DISCUSSION_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DISCUSSION_ATTACHMENT_MAX_FILES = 3;
export const upload = temporaryUpload({
  fileSize: DISCUSSION_ATTACHMENT_MAX_BYTES,
  files: DISCUSSION_ATTACHMENT_MAX_FILES,
  fields: 2,
  fieldSize: 20000,
});
const mimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/octet-stream",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
export function validAttachmentMime(mime: string) {
  return mimeTypes.has(mime);
}

export function filesFromRequest(files: Express.Request["files"]) {
  return Array.isArray(files) ? files : [];
}
export function validateFiles(files: Express.Multer.File[]) {
  if (files.some((file) => !validAttachmentMime(file.mimetype)))
    throw new HttpError(400, "unsupported attachment type");
}
