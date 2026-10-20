import { ChatAttachment, User, UserBlock } from "./models.ts";
import { HttpError } from "./projectAccess.ts";

export const CHAT_ATTACHMENT_MAX_BYTES = 512 * 1024;
export const CHAT_ATTACHMENT_MAX_FILES = 3;

const attachmentMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/octet-stream",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export type ChatUser = { id: string; name: string; email: string };

type UserRow = { _id: unknown; name: string; email: string };
type BlockRow = { blocker: unknown; blocked: unknown };

const userOrder = new Intl.Collator("vi", {
  numeric: true,
  sensitivity: "variant",
});

const publicUser = (row: UserRow): ChatUser => ({
  id: String(row._id),
  name: row.name,
  email: row.email,
});

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function validChatAttachmentMime(mime: string) {
  return attachmentMimeTypes.has(mime);
}

export function safeChatAttachmentName(name: string) {
  const cleaned = name
    .replace(/[\\/\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 160);
  return cleaned || "tep";
}

export function canReadChatAttachment(
  senderId: string,
  receiverId: string,
  userId: string,
) {
  return senderId === userId || receiverId === userId;
}

export async function searchChatUsersByEmail(
  requesterId: string,
  emailQuery: string,
): Promise<ChatUser[]> {
  const query = emailQuery.trim().toLowerCase();
  const rows = await User.find({
    _id: { $ne: requesterId },
    email: { $regex: escapeRegex(query) },
  })
    .select("name email")
    .sort({ email: 1, _id: 1 })
    .limit(20)
    .lean<UserRow[]>();
  if (!rows.length) return [];

  const ids = rows.map((row) => String(row._id));
  const blocks = await UserBlock.find({
    $or: [
      { blocker: requesterId, blocked: { $in: ids } },
      { blocker: { $in: ids }, blocked: requesterId },
    ],
  })
    .select("blocker blocked")
    .lean<BlockRow[]>();
  const hiddenIds = new Set(
    blocks.map((row) =>
      String(row.blocker) === requesterId
        ? String(row.blocked)
        : String(row.blocker),
    ),
  );
  return rows
    .filter((row) => !hiddenIds.has(String(row._id)))
    .map(publicUser)
    .sort(
      (left, right) =>
        userOrder.compare(left.email, right.email) ||
        left.id.localeCompare(right.id),
    );
}

export async function getChatUser(userId: string): Promise<ChatUser | null> {
  const row = await User.findById(userId)
    .select("name email")
    .lean<UserRow | null>();
  return row ? publicUser(row) : null;
}

export async function listBlockedChatUsers(
  requesterId: string,
): Promise<ChatUser[]> {
  const ids = (await UserBlock.distinct("blocked", { blocker: requesterId })).map(
    String,
  );
  if (!ids.length) return [];
  const rows = await User.find({ _id: { $in: ids } })
    .select("name email")
    .lean<UserRow[]>();
  return rows
    .map(publicUser)
    .sort(
      (left, right) =>
        userOrder.compare(left.name, right.name) ||
        userOrder.compare(left.email, right.email) ||
        left.id.localeCompare(right.id),
    );
}

export async function directChatRelationship(
  requesterId: string,
  otherUserId: string,
) {
  const rows = await UserBlock.find({
    $or: [
      { blocker: requesterId, blocked: otherUserId },
      { blocker: otherUserId, blocked: requesterId },
    ],
  })
    .select("blocker blocked")
    .lean<BlockRow[]>();
  const blockedByMe = rows.some(
    (row) =>
      String(row.blocker) === requesterId &&
      String(row.blocked) === otherUserId,
  );
  return { blockedByMe, canMessage: rows.length === 0 };
}

export async function blockChatUser(
  requesterId: string,
  otherUserId: string,
): Promise<ChatUser> {
  if (requesterId === otherUserId)
    throw new HttpError(400, "cannot block yourself");
  const user = await getChatUser(otherUserId);
  if (!user) throw new HttpError(404, "user not found");
  await UserBlock.updateOne(
    { blocker: requesterId, blocked: otherUserId },
    { $setOnInsert: { blocker: requesterId, blocked: otherUserId } },
    { upsert: true },
  );
  return user;
}

export async function unblockChatUser(
  requesterId: string,
  otherUserId: string,
) {
  await UserBlock.deleteOne({ blocker: requesterId, blocked: otherUserId });
}

export async function canDirectChat(
  senderId: string,
  receiverId: string,
): Promise<boolean> {
  if (senderId === receiverId) return false;
  const [users, blocked] = await Promise.all([
    User.countDocuments({ _id: { $in: [senderId, receiverId] } }),
    UserBlock.exists({
      $or: [
        { blocker: senderId, blocked: receiverId },
        { blocker: receiverId, blocked: senderId },
      ],
    }),
  ]);
  return users === 2 && !blocked;
}

export function chatAttachmentMetadata(attachment: {
  id?: string;
  _id?: unknown;
  name: string;
  mime: string;
  size: number;
}) {
  return {
    id: String(attachment.id || attachment._id || ""),
    name: attachment.name,
    mime: attachment.mime,
    size: attachment.size,
  };
}

export { ChatAttachment };
