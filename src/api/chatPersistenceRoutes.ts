import type { Express } from "express";
import { z } from "zod";

import {
  hideDirectConversation,
  markChatMessagesRead,
  persistDirectMessage,
  persistGroupMessage,
  syncChatMessages,
} from "./chatPersistenceService.ts";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const messageId = z.string().uuid();
const messageShape = {
  messageId,
  sessionId: z.string().uuid(),
  timestamp: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  body: z.string().max(4000).default(""),
  attachmentIds: z.array(objectId).max(3).default([]),
};
const hasContent = (value: {
  body: string;
  attachmentIds: string[];
}) => !!value.body.trim() || value.attachmentIds.length > 0;
const directInput = z
  .object({ ...messageShape, receiverId: objectId })
  .strict()
  .refine(hasContent, "message body or attachment is required");
const groupInput = z
  .object({ ...messageShape, groupId: z.string().uuid() })
  .strict()
  .refine(hasContent, "message body or attachment is required");
const syncQuery = z
  .object({
    cursor: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();
const readInput = z
  .object({ messageIds: z.array(messageId).min(1).max(100) })
  .strict();

export function installChatPersistenceRoutes(app: Express) {
  app.post("/chat/messages/direct", async (req, res) => {
    const input = directInput.parse(req.body);
    const row = await persistDirectMessage(
      req.userId!,
      input.receiverId,
      input,
    );
    return res.status(201).json(row);
  });

  app.post("/chat/messages/group", async (req, res) => {
    const input = groupInput.parse(req.body);
    const rows = await persistGroupMessage(req.userId!, input.groupId, input);
    return res.status(201).json(rows);
  });

  app.get("/chat/messages/sync", async (req, res) => {
    const query = syncQuery.parse(req.query);
    return res.json(
      await syncChatMessages(req.userId!, query.cursor, query.limit),
    );
  });

  app.post("/chat/messages/read", async (req, res) => {
    const { messageIds } = readInput.parse(req.body);
    return res.json(await markChatMessagesRead(req.userId!, messageIds));
  });

  app.delete("/chat/conversations/direct/:userId", async (req, res) => {
    const otherUserId = objectId.parse(req.params.userId);
    if (otherUserId === req.userId)
      return res.status(400).json({ error: "cannot delete self conversation" });
    return res.json(
      await hideDirectConversation(req.userId!, otherUserId),
    );
  });
}
