import type { ChatMessage } from "./protocol.ts";

/** Include only user-visible messages belonging to exactly this 1:1 conversation. */
export function isDirectMessageBetween(
  message: ChatMessage,
  currentPeerId: string,
  otherPeerId: string,
): boolean {
  return (
    (message.type === "text" || message.type === "attachment") &&
    message.groupId == null &&
    ((message.senderId === currentPeerId &&
      message.receiverId === otherPeerId) ||
      (message.senderId === otherPeerId &&
        message.receiverId === currentPeerId))
  );
}
