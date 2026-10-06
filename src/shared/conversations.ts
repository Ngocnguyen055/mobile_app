import type { ChatMessage } from "./protocol.ts";

/** Include only text messages belonging to exactly this 1:1 conversation. */
export function isDirectMessageBetween(
  message: ChatMessage,
  currentPeerId: string,
  otherPeerId: string,
): boolean {
  return message.type === "text" && message.groupId == null && (
    (message.senderId === currentPeerId && message.receiverId === otherPeerId) ||
    (message.senderId === otherPeerId && message.receiverId === currentPeerId)
  );
}
