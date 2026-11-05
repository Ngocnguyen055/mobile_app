import type { Express } from "express";
import { installCommentRoutes } from "./discussions/commentRoutes.ts";
import { installDocumentRoutes } from "./discussions/documentRoutes.ts";
import { installPostRoutes } from "./discussions/postRoutes.ts";
export { DISCUSSION_ATTACHMENT_MAX_BYTES, DISCUSSION_ATTACHMENT_MAX_FILES, validAttachmentMime } from "./discussions/attachments.ts";
export { canEditDiscussion, canReadDiscussion, canRemoveDiscussion } from "./discussions/policy.ts";

export function installDiscussionRoutes(app: Express) {
  installPostRoutes(app);
  installCommentRoutes(app);
  installDocumentRoutes(app);
}
