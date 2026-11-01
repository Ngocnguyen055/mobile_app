export type ChatAttachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export type ChatMessage = {
  messageId: string;
  sessionId: string;
  senderId: string;
  receiverId: string;
  groupId?: string | null;
  type: "text" | "attachment";
  timestamp: number;
  body: string;
  attachments?: ChatAttachment[];
  sequence: number;
};

export type MessageStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received";

export type StoredMessage = {
  message: ChatMessage;
  status: MessageStatus;
};

export type DirectChatContact = {
  userId: string;
  name: string;
  email: string;
  updatedAt: number;
};

export type ChatGroup = {
  id: string;
  ownerId: string;
  members: string[];
  version: number;
  projectId: string;
  archived: boolean;
};

const userIdPattern = /^[a-f\d]{24}$/i;

export function assertUserId(value: string) {
  if (!userIdPattern.test(value)) throw new Error("invalid user ID");
  return value;
}

export function isDirectMessageBetween(
  message: ChatMessage,
  currentUserId: string,
  otherUserId: string,
) {
  return (
    (message.type === "text" || message.type === "attachment") &&
    message.groupId == null &&
    ((message.senderId === currentUserId &&
      message.receiverId === otherUserId) ||
      (message.senderId === otherUserId &&
        message.receiverId === currentUserId))
  );
}
