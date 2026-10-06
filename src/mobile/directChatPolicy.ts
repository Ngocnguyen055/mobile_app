import {
  isDirectMessageBetween,
  type MessageStatus,
  type StoredMessage,
} from "@ds01/shared";

export function directMessagesForContact(
  rows: StoredMessage[],
  currentPeerId: string,
  contactPeerId: string,
) {
  return rows
    .filter((row) =>
      isDirectMessageBetween(row.message, currentPeerId, contactPeerId),
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
  sent: "Đã gửi",
  delivered: "Đã nhận ACK",
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
  contactPeerId: string | undefined,
  sending: boolean,
) {
  const length = body.trim().length;
  return !!contactPeerId && !sending && length > 0 && length <= 4000;
}
