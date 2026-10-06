import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { createApi } from "../src/api/index.ts";
import { Project, User } from "../src/api/models.ts";
import { listContactsForUser } from "../src/api/contactService.ts";

const requesterId = "000000000000000000000001";
const anId = "000000000000000000000002";
const binhId = "000000000000000000000003";
const outsiderId = "000000000000000000000004";
const token = jwt.sign(
  { sub: requesterId },
  process.env.JWT_SECRET || "local-development-only-secret",
);

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

function mockUsers(rows: unknown[]) {
  const lean = vi.fn().mockResolvedValue(rows);
  const select = vi.fn().mockReturnValue({ lean });
  const find = vi.spyOn(User, "find").mockReturnValue({ select } as never);
  return { find, select, lean };
}

describe("project contact discovery", () => {
  it("returns only unique shared-project users in a stable public shape", async () => {
    vi.spyOn(Project, "distinct").mockResolvedValue([
      requesterId,
      binhId,
      anId,
      binhId,
    ] as never);
    const users = mockUsers([
      {
        _id: binhId,
        name: "Bình",
        email: "binh@example.test",
        passwordHash: "must-not-leak",
      },
      {
        _id: outsiderId,
        name: "Ngoài dự án",
        email: "outside@example.test",
        passwordHash: "must-not-leak",
      },
      {
        _id: anId,
        name: "An",
        email: "an@example.test",
        passwordHash: "must-not-leak",
      },
      {
        _id: requesterId,
        name: "Chính tôi",
        email: "me@example.test",
        passwordHash: "must-not-leak",
      },
      {
        _id: anId,
        name: "An trùng",
        email: "duplicate@example.test",
      },
    ]);

    await expect(listContactsForUser(requesterId)).resolves.toEqual([
      { id: anId, name: "An", email: "an@example.test" },
      { id: binhId, name: "Bình", email: "binh@example.test" },
    ]);

    expect(Project.distinct).toHaveBeenCalledWith("members", {
      members: requesterId,
    });
    expect(users.find).toHaveBeenCalledWith({
      _id: { $in: [binhId, anId], $ne: requesterId },
    });
    expect(users.select).toHaveBeenCalledWith("name email");
    expect(users.lean).toHaveBeenCalledOnce();
  });

  it("does not query users when the requester has no shared contacts", async () => {
    vi.spyOn(Project, "distinct").mockResolvedValue([
      requesterId,
      requesterId,
    ] as never);
    const find = vi.spyOn(User, "find");

    await expect(listContactsForUser(requesterId)).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it("requires a valid JWT and exposes contacts through GET /contacts", async () => {
    const distinct = vi
      .spyOn(Project, "distinct")
      .mockResolvedValue([requesterId, anId] as never);
    mockUsers([{ _id: anId, name: "An", email: "an@example.test" }]);

    await withApi(async (baseUrl) => {
      const unauthenticated = await fetch(`${baseUrl}/contacts`);
      expect(unauthenticated.status).toBe(401);
      expect(distinct).not.toHaveBeenCalled();

      const response = await fetch(`${baseUrl}/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { id: anId, name: "An", email: "an@example.test" },
      ]);
    });
  });
});
