import type { ChatGroup, StoredMessage } from "../domain/chat.ts";
import type { User } from "../types/api.ts";
export const statusLabel = {
  pending: "Đang gửi",
  queued: "Đã gửi",
  sent: "Đã gửi",
  delivered: "Đã nhận",
  read: "Đã xem",
  failed: "Không giao được",
  received: "Đã nhận",
} as const;

export function groupMessagesForDisplay(
  messages: StoredMessage[],
  group: ChatGroup | null,
  currentUserId: string,
) {
  if (!group) return [];
  const rowsByMessage = new Map<string, StoredMessage[]>();
  for (const row of messages) {
    const message = row.message;
    if (message.groupId !== group.id) continue;
    const outgoing = message.senderId === currentUserId;
    if (outgoing && !group.members.includes(message.receiverId)) continue;
    const key = outgoing
      ? `${message.messageId}:${message.senderId}`
      : `${message.messageId}:${message.senderId}:${message.receiverId}`;
    rowsByMessage.set(key, [...(rowsByMessage.get(key) || []), row]);
  }
  return [...rowsByMessage.values()].sort(
    (left, right) =>
      left[0].message.timestamp - right[0].message.timestamp ||
      left[0].message.messageId.localeCompare(right[0].message.messageId),
  );
}

export function latestGroupMessage(messages: StoredMessage[], groupId: string) {
  return messages
    .filter((row) => row.message.groupId === groupId)
    .sort(
      (left, right) =>
        left.message.timestamp - right.message.timestamp ||
        left.message.messageId.localeCompare(right.message.messageId),
    )
    .at(-1);
}

export function groupDeliveryLabel(rows: StoredMessage[], outgoing: boolean) {
  if (!outgoing) return statusLabel[rows[0].status];
  const total = rows.length;
  const read = rows.filter((row) => row.status === "read").length;
  const delivered = rows.filter((row) =>
    ["delivered", "read"].includes(row.status),
  ).length;
  const failed = rows.filter((row) => row.status === "failed").length;
  if (read === total) return `Đã xem ${read}/${total}`;
  if (delivered === total) return `Đã nhận ${delivered}/${total}`;
  if (failed === total) return "Không giao được";
  return `${delivered}/${total} đã nhận${failed ? ` · ${failed} lỗi` : ""}`;
}

export function userName(members: User[], userId: string) {
  return members.find((member) => member._id === userId)?.name || "Thành viên";
}

export function messagePreview(
  row: StoredMessage | undefined,
  members: User[],
  currentUserId: string,
) {
  if (!row) return "Chưa có tin nhắn";
  const message = row.message;
  const prefix =
    message.senderId === currentUserId
      ? "Bạn: "
      : `${userName(members, message.senderId)}: `;
  if (message.attachments?.length)
    return `${prefix}📎 ${message.attachments[0].name}`;
  return `${prefix}${message.body || "Tin nhắn mới"}`;
}
