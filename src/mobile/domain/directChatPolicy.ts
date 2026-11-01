// directChatPolicy.ts.
import {
  isDirectMessageBetween,
  type MessageStatus,
  type StoredMessage,
} from "./chat.ts";

export function directMessagesForContact(
  rows: StoredMessage[],
  currentUserId: string,
  contactUserId: string,
) {
  return rows
    .filter((row) =>
      isDirectMessageBetween(row.message, currentUserId, contactUserId),
    )
    .sort(
      (left, right) =>
        left.message.timestamp - right.message.timestamp ||
        left.message.messageId.localeCompare(right.message.messageId) ||
        left.message.senderId.localeCompare(right.message.senderId) ||
        left.message.receiverId.localeCompare(right.message.receiverId),
    );
}

const outgoingStatusLabels: Record<MessageStatus, string> = {
  pending: "Đang gửi",
  queued: "Đã lưu, chờ người nhận",
  sent: "Đã gửi",
  delivered: "Đã giao",
  read: "Đã xem",
  failed: "Gửi thất bại",
  received: "Đã nhận",
};

export function directMessageStatusLabel(
  status: MessageStatus,
  outgoing: boolean,
) {
  return outgoing ? outgoingStatusLabels[status] : "Đã nhận";
}

export function canSendDirect(
  body: string,
  contactUserId: string | undefined,
  sending: boolean,
) {
  const length = body.trim().length;
  return !!contactUserId && !sending && length > 0 && length <= 4000;
}
