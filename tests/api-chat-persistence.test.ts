import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

import { createApi } from "../src/api/index.ts";
import {
  ChatMessageRecord,
  Project,
  User,
  UserBlock,
} from "../src/api/models.ts";
import {
  persistDirectMessage,
  persistGroupMessage,
  syncChatMessages,
} from "../src/api/chatPersistenceService.ts";

const me = "000000000000000000000001";
const an = "000000000000000000000002";
const binh = "000000000000000000000003";
const projectId = "000000000000000000000010";
const groupId = "10000000-0000-4000-8000-000000000010";
const token = jwt.sign(
  { sub: me },
  process.env.JWT_SECRET || "local-development-only-secret",
);

const input = () => ({
  messageId: randomUUID(),
  sessionId: randomUUID(),
  timestamp: Date.now(),
  sequence: 1,
  body: "Tin lưu khi người nhận offline",
  attachmentIds: [] as string[],
});

const row = (
  data: ReturnType<typeof input>,
  receiver = an,
  group: string | null = null,
) => ({
  _id: "507f1f77bcf86cd799439011",
  ...data,
  sender: me,
  receiver,
  groupId: group,
  type: "text" as const,
  attachments: [],
  status: "queued" as const,
  updatedAt: new Date("2026-10-31T12:00:00.000Z"),
});

afterEach(() => vi.restoreAllMocks());

async function withApi(run: (baseUrl: string) => Promise<void>) {
  const server = createApi().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const postJson = (baseUrl: string, path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("persistent offline chat", () => {
  it("accepts a valid direct message through the strict HTTP schema", async () => {
    const data = input();
    vi.spyOn(User, "countDocuments").mockResolvedValue(2);
    vi.spyOn(UserBlock, "exists").mockResolvedValue(null);
    vi.spyOn(ChatMessageRecord, "findOne")
      .mockReturnValueOnce(Promise.resolve(null) as never)
      .mockReturnValueOnce({
        populate: () => ({ lean: async () => row(data) }),
      } as never);
    vi.spyOn(ChatMessageRecord, "create").mockResolvedValue({} as never);

    await withApi(async (baseUrl) => {
      const response = await postJson(baseUrl, "/chat/messages/direct", {
        ...data,
        receiverId: an,
      });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        status: "queued",
        message: { messageId: data.messageId, receiverId: an },
      });
    });
  });

  it("accepts a valid group message through the strict HTTP schema", async () => {
    const data = input();
    vi.spyOn(Project, "findOne").mockResolvedValue({
      _id: projectId,
      parentProject: null,
      owner: me,
      manager: me,
      members: [me, an, binh],
      chatGroupId: groupId,
      chatRevision: 3,
      archived: false,
    } as never);
    vi.spyOn(ChatMessageRecord, "bulkWrite").mockResolvedValue({} as never);
    vi.spyOn(ChatMessageRecord, "find").mockReturnValue({
      populate: () => ({
        sort: () => ({
          lean: async () => [row(data, an, groupId), row(data, binh, groupId)],
        }),
      }),
    } as never);

    await withApi(async (baseUrl) => {
      const response = await postJson(baseUrl, "/chat/messages/group", {
        ...data,
        groupId,
      });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toHaveLength(2);
    });
  });

  it("stores a direct message idempotently and returns a queued envelope", async () => {
    const data = input();
    vi.spyOn(User, "countDocuments").mockResolvedValue(2);
    vi.spyOn(UserBlock, "exists").mockResolvedValue(null);
    vi.spyOn(ChatMessageRecord, "findOne")
      .mockReturnValueOnce(Promise.resolve(null) as never)
      .mockReturnValueOnce({
        populate: () => ({ lean: async () => row(data) }),
      } as never);
    const create = vi
      .spyOn(ChatMessageRecord, "create")
      .mockResolvedValue({} as never);

    await expect(persistDirectMessage(me, an, data)).resolves.toMatchObject({
      status: "queued",
      message: {
        messageId: data.messageId,
        senderId: me,
        receiverId: an,
        body: data.body,
      },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: data.messageId,
        sender: me,
        receiver: an,
        status: "queued",
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty("attachmentIds");
  });

  it("fans one group message out to every current recipient", async () => {
    const data = input();
    vi.spyOn(Project, "findOne").mockResolvedValue({
      _id: projectId,
      parentProject: null,
      owner: me,
      manager: me,
      members: [me, an, binh],
      chatGroupId: groupId,
      chatRevision: 3,
      archived: false,
    } as never);
    const bulkWrite = vi
      .spyOn(ChatMessageRecord, "bulkWrite")
      .mockResolvedValue({} as never);
    vi.spyOn(ChatMessageRecord, "find").mockReturnValue({
      populate: () => ({
        sort: () => ({
          lean: async () => [row(data, an, groupId), row(data, binh, groupId)],
        }),
      }),
    } as never);

    const result = await persistGroupMessage(me, groupId, data);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.message.receiverId)).toEqual([an, binh]);
    expect(bulkWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          updateOne: expect.objectContaining({ upsert: true }),
        }),
      ]),
      { ordered: false },
    );
  });

  it("marks queued messages delivered when the offline recipient synchronizes", async () => {
    const data = input();
    const delivered = row(data);
    vi.spyOn(ChatMessageRecord, "find").mockReturnValue({
      populate: () => ({
        sort: () => ({
          limit: () => ({ lean: async () => [delivered] }),
        }),
      }),
    } as never);
    const update = vi
      .spyOn(ChatMessageRecord, "updateMany")
      .mockResolvedValue({ modifiedCount: 1 } as never);

    const page = await syncChatMessages(an, undefined, 100);

    expect(page.items).toEqual([
      expect.objectContaining({
        status: "received",
        message: expect.objectContaining({ messageId: data.messageId }),
      }),
    ]);
    expect(page.nextCursor).toBe(
      `${delivered.updatedAt.getTime()}:${delivered._id}`,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ receiver: an, status: "queued" }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "delivered" }),
      }),
    );
  });

  it("marks a queued group delivery failed after its recipient leaves the group", async () => {
    const data = input();
    const stale = row(data, binh, groupId);
    vi.spyOn(Project, "findOne").mockResolvedValue({
      _id: projectId,
      parentProject: null,
      owner: me,
      manager: me,
      members: [me, an],
      chatGroupId: groupId,
      chatRevision: 4,
      archived: false,
    } as never);
    vi.spyOn(ChatMessageRecord, "find").mockReturnValue({
      populate: () => ({
        sort: () => ({
          limit: () => ({ lean: async () => [stale] }),
        }),
      }),
    } as never);
    const update = vi
      .spyOn(ChatMessageRecord, "updateMany")
      .mockResolvedValue({ modifiedCount: 1 } as never);

    const page = await syncChatMessages(me, undefined, 100);

    expect(page.items).toEqual([
      expect.objectContaining({
        status: "failed",
        message: expect.objectContaining({
          receiverId: binh,
          groupId,
        }),
      }),
    ]);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: me,
        status: "queued",
      }),
      { $set: { status: "failed" } },
    );
  });
});
