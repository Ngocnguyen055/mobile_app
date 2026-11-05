import * as Crypto from "expo-crypto";
import type { ChatAttachment } from "../../domain/chat.ts";
export const createPersistentInput = (
  body: string,
  attachments: ChatAttachment[] = [],
) => ({
  messageId: Crypto.randomUUID(),
  sessionId: Crypto.randomUUID(),
  timestamp: Date.now(),
  sequence: Date.now(),
  body: body.trim(),
  attachmentIds: attachments.map((attachment) => attachment.id),
});
