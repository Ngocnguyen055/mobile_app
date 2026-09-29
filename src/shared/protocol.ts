import { z } from "zod";

export const peerIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/);
export const idSchema = z.string().uuid();
export const messageSchema = z
  .object({
    messageId: idSchema,
    sessionId: idSchema,
    senderId: peerIdSchema,
    receiverId: peerIdSchema,
    groupId: idSchema.optional(),
    type: z.enum(["text", "ack"]),
    timestamp: z.number().int().positive(),
    body: z.string().max(4000),
    mode: z.enum(["DIRECT", "RELAY"]),
    ackFor: idSchema.optional(),
    attempt: z.number().int().min(1).max(4),
    sequence: z.number().int().nonnegative(),
  })
  .superRefine((m, ctx) => {
    if (m.type === "ack" && !m.ackFor)
      ctx.addIssue({ code: "custom", message: "ackFor required" });
    if (m.type === "text" && !m.body.trim())
      ctx.addIssue({ code: "custom", message: "body required" });
  });
export type ChatMessage = z.infer<typeof messageSchema>;
export type DeliveryMode = ChatMessage["mode"];
export type PeerPresence = { peerId: string; online: boolean };
export type Group = {
  id: string;
  ownerId: string;
  members: string[];
  version: number;
};
export const MAX_WIRE_BYTES = 8192;
export function parseMessage(input: unknown): ChatMessage {
  if (BufferLikeSize(input) > MAX_WIRE_BYTES)
    throw new Error("message too large");
  return messageSchema.parse(input);
}
function BufferLikeSize(input: unknown): number {
  return encodeURIComponent(JSON.stringify(input)).replace(/%[A-F0-9]{2}/g, "x")
    .length;
}
