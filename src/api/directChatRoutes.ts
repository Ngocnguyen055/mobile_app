import type { Express } from "express";
import multer from "multer";
import { z } from "zod";
import {
  blockChatUser,
  canDirectChat,
  canReadChatAttachment,
  chatAttachmentMetadata,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_FILES,
  ChatAttachment,
  directChatRelationship,
  getChatUser,
  listBlockedChatUsers,
  safeChatAttachmentName,
  searchChatUsersByEmail,
  unblockChatUser,
  validChatAttachmentMime,
} from "./directChatService.ts";
import { getProjectChatGroup, HttpError } from "./projectAccess.ts";
import { hideQueuedMessagesFromBlockedUser } from "./chatPersistenceService.ts";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const searchInput = z
  .object({ email: z.string().trim().min(3).max(120) })
  .strict();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CHAT_ATTACHMENT_MAX_BYTES,
    files: CHAT_ATTACHMENT_MAX_FILES,
    fields: 2,
    fieldSize: 200,
  },
});

function uploadedFiles(files: Express.Request["files"]) {
  return Array.isArray(files) ? files : [];
}
export function installDirectChatRoutes(app: Express) {
  app.get("/users/search", async (req, res) => {
    const { email } = searchInput.parse(req.query);
    return res.json(await searchChatUsersByEmail(req.userId!, email));
  });

  app.get("/users/:userId", async (req, res) => {
    const userId = objectId.parse(req.params.userId);
    if (userId === req.userId)
      return res.status(400).json({ error: "cannot resolve yourself" });
    const user = await getChatUser(userId);
    return user ? res.json(user) : res.sendStatus(404);
  });

  app.get("/chat/blocks", async (req, res) => {
    return res.json(await listBlockedChatUsers(req.userId!));
  });

  app.post("/chat/blocks/:userId", async (req, res) => {
    const blockedId = objectId.parse(req.params.userId);
    const user = await blockChatUser(
      req.userId!,
      blockedId,
    );
    await hideQueuedMessagesFromBlockedUser(req.userId!, blockedId);
    return res.status(201).json({ blocked: true, user });
  });

  app.delete("/chat/blocks/:userId", async (req, res) => {
    await unblockChatUser(req.userId!, objectId.parse(req.params.userId));
    return res.json({ blocked: false });
  });

  app.get("/chat/relationships/:userId", async (req, res) => {
    const userId = objectId.parse(req.params.userId);
    if (userId === req.userId)
      return res.status(400).json({ error: "cannot chat with yourself" });
    if (!(await getChatUser(userId))) return res.sendStatus(404);
    return res.json(await directChatRelationship(req.userId!, userId));
  });

  app.post(
    "/chat/attachments",
    upload.array("files", CHAT_ATTACHMENT_MAX_FILES),
    async (req, res) => {
      const receiverResult = objectId.safeParse(req.body.receiverId);
      const groupResult = z.string().uuid().safeParse(req.body.groupId);
      if (receiverResult.success === groupResult.success)
        throw new HttpError(
          400,
          "exactly one receiverId or groupId is required",
        );
      const files = uploadedFiles(req.files);
      if (!files.length)
        throw new HttpError(400, "at least one file is required");
      if (files.some((file) => !validChatAttachmentMime(file.mimetype)))
        throw new HttpError(400, "unsupported attachment type");
      let target:
        | { receiver: string; groupId: null; project: null }
        | { receiver: null; groupId: string; project: string };
      if (receiverResult.success) {
        if (!(await canDirectChat(req.userId!, receiverResult.data)))
          throw new HttpError(403, "direct chat is not allowed");
        target = {
          receiver: receiverResult.data,
          groupId: null,
          project: null,
        };
      } else {
        if (!groupResult.success)
          throw new HttpError(400, "valid groupId is required");
        const group = await getProjectChatGroup(groupResult.data);
        if (!group?.members.includes(req.userId!))
          throw new HttpError(403, "project chat access denied");
        if (group.archived) throw new HttpError(409, "project archived");
        target = {
          receiver: null,
          groupId: group.id,
          project: group.projectId!,
        };
      }

      const attachments = await ChatAttachment.create(
        files.map((file) => ({
          sender: req.userId,
          ...target,
          name: safeChatAttachmentName(file.originalname),
          mime: file.mimetype,
          size: file.size,
          data: file.buffer,
        })),
      );
      return res.status(201).json(attachments.map(chatAttachmentMetadata));
    },
  );

  app.get("/chat/attachments/:attachmentId", async (req, res) => {
    const attachment = await ChatAttachment.findById(
      objectId.parse(req.params.attachmentId),
    );
    if (!attachment) throw new HttpError(404, "attachment not found");
    const allowed = attachment.groupId
      ? !!(await getProjectChatGroup(attachment.groupId))?.members.includes(
          req.userId!,
        )
      : canReadChatAttachment(
          String(attachment.sender),
          String(attachment.receiver),
          req.userId!,
        );
    if (!allowed)
      throw new HttpError(404, "attachment not found");
    res.setHeader(
      "Content-Type",
      validChatAttachmentMime(attachment.mime)
        ? attachment.mime
        : "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    const disposition = attachment.mime.startsWith("image/")
      ? "inline"
      : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    );
    return res.send(attachment.data);
  });
}
