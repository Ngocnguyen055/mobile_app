import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { createApi } from "../src/api/index.ts";
import { ChatAttachment, User, UserBlock } from "../src/api/models.ts";
import {
  canDirectChat,
  canReadChatAttachment,
  chatAttachmentMetadata,
  safeChatAttachmentName,
  searchChatUsersByEmail,
  validChatAttachmentMime,
} from "../src/api/directChatService.ts";

const me = "000000000000000000000001";
const an = "000000000000000000000002";
const binh = "000000000000000000000003";
const token = jwt.sign(
  { sub: me },
  process.env.JWT_SECRET || "local-development-only-secret",
);
const outsiderToken = jwt.sign(
  { sub: binh },
  process.env.JWT_SECRET || "local-development-only-secret",
);

afterEach(() => vi.restoreAllMocks());

function mockSearchUsers(rows: unknown[]) {
  const lean = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ lean });
  const sort = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ sort });
  const find = vi.spyOn(User, "find").mockReturnValue({ select } as never);
  return { find, select, sort, limit, lean };
}

function mockBlockRows(rows: unknown[]) {
  const lean = vi.fn().mockResolvedValue(rows);
  const select = vi.fn().mockReturnValue({ lean });
  const find = vi.spyOn(UserBlock, "find").mockReturnValue({ select } as never);
  return { find, select, lean };
}

async function withApi(run: (baseUrl: string) => Promise<void>) {
  const server = createApi().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("direct chat account discovery and blocking", () => {
  it("searches a bounded escaped email query and hides either blocking relationship", async () => {
    const users = mockSearchUsers([
      { _id: an, name: "An", email: "an+demo@example.test" },
      { _id: binh, name: "Bình", email: "binh@example.test" },
    ]);
    mockBlockRows([{ blocker: binh, blocked: me }]);

    await expect(searchChatUsersByEmail(me, " AN+ ")).resolves.toEqual([
      { id: an, name: "An", email: "an+demo@example.test" },
    ]);
    expect(users.find).toHaveBeenCalledWith({
      _id: { $ne: me },
      email: { $regex: "an\\+" },
    });
    expect(users.limit).toHaveBeenCalledWith(20);
  });

  it("allows direct chat only when both accounts exist and neither side blocked", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(2);
    const exists = vi.spyOn(UserBlock, "exists").mockResolvedValue(null);
    await expect(canDirectChat(me, an)).resolves.toBe(true);
    exists.mockResolvedValue({ _id: "block" } as never);
    await expect(canDirectChat(me, an)).resolves.toBe(false);
    await expect(canDirectChat(me, me)).resolves.toBe(false);
  });

  it("requires authentication and a useful email fragment on the search endpoint", async () => {
    await withApi(async (baseUrl) => {
      expect((await fetch(`${baseUrl}/users/search?email=an%40`)).status).toBe(
        401,
      );
      expect(
        (
          await fetch(`${baseUrl}/users/search?email=ab`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(400);
    });
  });
});

describe("direct chat attachment access", () => {
  it("accepts supported small-file metadata without exposing file contents", () => {
    expect(validChatAttachmentMime("image/png")).toBe(true);
    expect(validChatAttachmentMime("text/html")).toBe(false);
    expect(canReadChatAttachment(me, an, me)).toBe(true);
    expect(canReadChatAttachment(me, an, an)).toBe(true);
    expect(canReadChatAttachment(me, an, binh)).toBe(false);
    expect(safeChatAttachmentName(" ../ảnh\\demo.png\u0000")).toBe(
      ".._ảnh_demo.png_",
    );
    expect(
      chatAttachmentMetadata({
        _id: "507f1f77bcf86cd799439011",
        name: "anh.png",
        mime: "image/png",
        size: 123,
      }),
    ).toEqual({
      id: "507f1f77bcf86cd799439011",
      name: "anh.png",
      mime: "image/png",
      size: 123,
    });
  });

  it("uploads supported bytes and lets only the two participants download them", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(2);
    vi.spyOn(UserBlock, "exists").mockResolvedValue(null);
    const create = vi.spyOn(ChatAttachment, "create").mockResolvedValue([
      {
        _id: "507f1f77bcf86cd799439011",
        name: "proof.png",
        mime: "image/png",
        size: 3,
      },
    ] as never);
    vi.spyOn(ChatAttachment, "findById").mockResolvedValue({
      sender: me,
      receiver: an,
      name: "proof.png",
      mime: "image/png",
      size: 3,
      data: Buffer.from("png"),
    } as never);

    await withApi(async (baseUrl) => {
      const form = new FormData();
      form.append("receiverId", an);
      form.append(
        "files",
        new Blob(["png"], { type: "image/png" }),
        "proof.png",
      );
      const uploaded = await fetch(`${baseUrl}/chat/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      expect(uploaded.status).toBe(201);
      await expect(uploaded.json()).resolves.toEqual([
        {
          id: "507f1f77bcf86cd799439011",
          name: "proof.png",
          mime: "image/png",
          size: 3,
        },
      ]);
      expect(create).toHaveBeenCalledWith([
        expect.objectContaining({
          sender: me,
          receiver: an,
          name: "proof.png",
          mime: "image/png",
          size: 3,
          data: expect.any(Buffer),
        }),
      ]);

      const allowed = await fetch(
        `${baseUrl}/chat/attachments/507f1f77bcf86cd799439011`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("content-type")).toContain("image/png");
      expect(await allowed.text()).toBe("png");

      const denied = await fetch(
        `${baseUrl}/chat/attachments/507f1f77bcf86cd799439011`,
        { headers: { Authorization: `Bearer ${outsiderToken}` } },
      );
      expect(denied.status).toBe(404);
    });
  });
});
