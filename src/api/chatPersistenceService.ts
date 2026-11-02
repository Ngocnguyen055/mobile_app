import mongoose from "mongoose";

import {
  ChatAttachment,
  ChatMessageRecord,
} from "./models.ts";
import { canDirectChat, chatAttachmentMetadata } from "./directChatService.ts";
import { getProjectChatGroup, HttpError } from "./projectAccess.ts";

export type PersistedMessageInput = {
  messageId: string;
  sessionId: string;
  timestamp: number;
  sequence: number;
  body: string;
  attachmentIds: string[];
};

type AttachmentRow = {
  _id: unknown;
  sender: unknown;
  receiver?: unknown;
  groupId?: string | null;
  name: string;
  mime: string;
  size: number;
};

type MessageRow = {
  _id: unknown;
  messageId: string;
  sessionId: string;
  sender: unknown;
  receiver: unknown;
  groupId?: string | null;
  type: "text" | "attachment";
  body: string;
  attachments?: AttachmentRow[];
  timestamp: number;
  sequence: number;
  status: "queued" | "delivered" | "read" | "failed";
  updatedAt: Date;
};

const idOf = (value: unknown) => String(value || "");
const messageFields = (input: PersistedMessageInput) => ({
  messageId: input.messageId,
  sessionId: input.sessionId,
  timestamp: input.timestamp,
  sequence: input.sequence,
  body: input.body,
});

function storedMessage(row: MessageRow, userId: string) {
  const outgoing = idOf(row.sender) === userId;
  return {
    message: {
      messageId: row.messageId,
      sessionId: row.sessionId,
      senderId: idOf(row.sender),
      receiverId: idOf(row.receiver),
      groupId: row.groupId ?? null,
      type: row.type,
      timestamp: row.timestamp,
      body: row.body,
      attachments: row.attachments?.map(chatAttachmentMetadata),
      sequence: row.sequence,
    },
    status: outgoing ? row.status : ("received" as const),
  };
}

async function attachmentIdsForTarget(
  senderId: string,
  attachmentIds: string[],
  target: { receiverId?: string; groupId?: string },
) {
  if (!attachmentIds.length) return [];
  const rows = await ChatAttachment.find({
    _id: { $in: attachmentIds },
    sender: senderId,
  }).lean<AttachmentRow[]>();
  const valid = rows.filter((row) =>
    target.receiverId
      ? idOf(row.receiver) === target.receiverId && !row.groupId
      : row.groupId === target.groupId && !row.receiver,
  );
  if (valid.length !== attachmentIds.length)
    throw new HttpError(400, "invalid chat attachment target");
  return attachmentIds;
}

async function populatedRecord(messageId: string, receiverId: string) {
  return ChatMessageRecord.findOne({ messageId, receiver: receiverId })
    .populate("attachments", "name mime size")
    .lean<MessageRow | null>();
}

export async function persistDirectMessage(
  senderId: string,
  receiverId: string,
  input: PersistedMessageInput,
) {
  if (!(await canDirectChat(senderId, receiverId)))
    throw new HttpError(403, "direct chat is not allowed");
  const attachmentIds = await attachmentIdsForTarget(
    senderId,
    input.attachmentIds,
    { receiverId },
  );
  const existing = await ChatMessageRecord.findOne({
    messageId: input.messageId,
    receiver: receiverId,
  });
  if (existing) {
    if (idOf(existing.sender) !== senderId)
      throw new HttpError(409, "message ID already used");
  } else {
    try {
      await ChatMessageRecord.create({
        ...messageFields(input),
        sender: senderId,
        receiver: receiverId,
        groupId: null,
        project: null,
        type: attachmentIds.length ? "attachment" : "text",
        attachments: attachmentIds,
        status: "queued",
      });
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 11000
      )
        throw error;
    }
  }
  const row = await populatedRecord(input.messageId, receiverId);
  if (!row) throw new HttpError(409, "message persistence conflict");
  return storedMessage(row, senderId);
}

export async function persistGroupMessage(
  senderId: string,
  groupId: string,
  input: PersistedMessageInput,
) {
  const group = await getProjectChatGroup(groupId);
  if (!group || !group.members.includes(senderId))
    throw new HttpError(403, "project chat access denied");
  if (group.archived) throw new HttpError(409, "project archived");
  const attachmentIds = await attachmentIdsForTarget(
    senderId,
    input.attachmentIds,
    { groupId },
  );
  const recipients = group.members.filter((id) => id !== senderId);
  if (!recipients.length)
    throw new HttpError(409, "project chat has no other members");
  await ChatMessageRecord.bulkWrite(
    recipients.map((receiverId) => ({
      updateOne: {
        filter: { messageId: input.messageId, receiver: receiverId },
        update: {
          $setOnInsert: {
            ...messageFields(input),
            sender: new mongoose.Types.ObjectId(senderId),
            receiver: new mongoose.Types.ObjectId(receiverId),
            groupId,
            project: new mongoose.Types.ObjectId(group.projectId),
            type: attachmentIds.length ? "attachment" : "text",
            attachments: attachmentIds.map(
              (id) => new mongoose.Types.ObjectId(id),
            ),
            status: "queued",
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  const rows = await ChatMessageRecord.find({
    messageId: input.messageId,
    sender: senderId,
    receiver: { $in: recipients },
  })
    .populate("attachments", "name mime size")
    .sort({ receiver: 1 })
    .lean<MessageRow[]>();
  if (rows.length !== recipients.length)
    throw new HttpError(409, "message ID already used");
  return rows.map((row) => storedMessage(row, senderId));
}

type Cursor = { updatedAt: Date; id: mongoose.Types.ObjectId };

function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;
  const [timestamp, id] = value.split(":");
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || !mongoose.isValidObjectId(id))
    throw new HttpError(400, "invalid chat sync cursor");
  return { updatedAt: new Date(time), id: new mongoose.Types.ObjectId(id) };
}

function encodeCursor(row: MessageRow) {
  return `${new Date(row.updatedAt).getTime()}:${idOf(row._id)}`;
}

export async function syncChatMessages(
  userId: string,
  cursorValue: string | undefined,
  limit: number,
) {
  const cursor = decodeCursor(cursorValue);
  const query: Record<string, unknown> = {
    $and: [
      { $or: [{ sender: userId }, { receiver: userId }] },
      { hiddenFor: { $ne: userId } },
    ],
  };
  if (cursor)
    (query.$and as Record<string, unknown>[]).push({
      $or: [
        { updatedAt: { $gt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, _id: { $gt: cursor.id } },
      ],
    });
  const raw = await ChatMessageRecord.find(query)
    .populate("attachments", "name mime size")
    .sort({ updatedAt: 1, _id: 1 })
    .limit(limit + 1)
    .lean<MessageRow[]>();
  const page = raw.slice(0, limit);
  const groupAccess = new Map<
    string,
    Awaited<ReturnType<typeof getProjectChatGroup>>
  >();
  const visible: MessageRow[] = [];
  const staleGroupDeliveries: unknown[] = [];
  for (const row of page) {
    if (!row.groupId) {
      visible.push(row);
      continue;
    }
    if (!groupAccess.has(row.groupId)) {
      const group = await getProjectChatGroup(row.groupId);
      groupAccess.set(row.groupId, group);
    }
    const group = groupAccess.get(row.groupId);
    if (!group?.members.includes(userId)) continue;
    if (
      idOf(row.sender) === userId &&
      !group.members.includes(idOf(row.receiver)) &&
      row.status === "queued"
    ) {
      row.status = "failed";
      staleGroupDeliveries.push(row._id);
    }
    visible.push(row);
  }
  if (staleGroupDeliveries.length)
    await ChatMessageRecord.updateMany(
      { _id: { $in: staleGroupDeliveries }, sender: userId, status: "queued" },
      { $set: { status: "failed" } },
    );
  const receivedIds = visible
    .filter((row) => idOf(row.receiver) === userId && row.status === "queued")
    .map((row) => row._id);
  if (receivedIds.length)
    await ChatMessageRecord.updateMany(
      { _id: { $in: receivedIds }, receiver: userId, status: "queued" },
      { $set: { status: "delivered", deliveredAt: new Date() } },
    );
  return {
    items: visible.map((row) => storedMessage(row, userId)),
    nextCursor: page.length ? encodeCursor(page.at(-1)!) : cursorValue || null,
    hasMore: raw.length > limit,
  };
}

export async function markChatMessagesRead(
  userId: string,
  messageIds: string[],
) {
  if (!messageIds.length) return { updated: 0 };
  const result = await ChatMessageRecord.updateMany(
    { messageId: { $in: messageIds }, receiver: userId },
    {
      $set: {
        status: "read",
        deliveredAt: new Date(),
        readAt: new Date(),
      },
    },
  );
  return { updated: result.modifiedCount };
}

export async function hideDirectConversation(
  userId: string,
  otherUserId: string,
) {
  const result = await ChatMessageRecord.updateMany(
    {
      groupId: null,
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId },
      ],
    },
    { $addToSet: { hiddenFor: userId } },
  );
  return { hidden: result.modifiedCount };
}

export async function hideQueuedMessagesFromBlockedUser(
  blockerId: string,
  blockedId: string,
) {
  await ChatMessageRecord.updateMany(
    {
      sender: blockedId,
      receiver: blockerId,
      groupId: null,
      status: "queued",
    },
    { $addToSet: { hiddenFor: blockerId } },
  );
}

