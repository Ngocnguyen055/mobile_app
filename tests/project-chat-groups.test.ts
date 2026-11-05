import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import mongoose, { type ClientSession } from "mongoose";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatGroupRecord, Project } from "../src/api/models.ts";
import * as accessModule from "../src/api/projectAccess.ts";
import { installProjectRoutes } from "../src/api/projectRoutes.ts";

const owner = "100000000000000000000001";
const member = "100000000000000000000002";
const projectId = "200000000000000000000001";
const defaultGroupId = "10000000-0000-4000-8000-000000000001";
const extraGroupId = "10000000-0000-4000-8000-000000000002";
const session = { token: "chat-groups" } as unknown as ClientSession;

const project = () =>
  new Project({
    _id: projectId,
    name: "Mobile",
    owner,
    members: [owner, member],
    chatGroupId: defaultGroupId,
  });

const access = (
  role: accessModule.ProjectRole = "OWNER",
): accessModule.ProjectAccess => {
  const row = project();
  return {
    project: row,
    root: row,
    role,
    permissions: accessModule.permissionsForProject(
      "independent",
      false,
      role,
    ),
    archived: false,
  };
};

afterEach(() => vi.restoreAllMocks());

describe("project chat group lookup", () => {
  it("always lists the legacy project group first as undeletable Chung", async () => {
    const extra = new ChatGroupRecord({
      groupId: extraGroupId,
      project: projectId,
      name: "Thiết kế",
      createdBy: owner,
    });
    vi.spyOn(ChatGroupRecord, "find").mockReturnValue({
      sort: async () => [extra],
    } as never);

    const groups = await accessModule.listProjectChatGroups(access());

    expect(groups).toMatchObject([
      {
        id: defaultGroupId,
        name: "Chung",
        isDefault: true,
        members: [owner, member],
      },
      {
        id: extraGroupId,
        name: "Thiết kế",
        isDefault: false,
        members: [owner, member],
      },
    ]);
  });

  it("keeps a soft-deleted group resolvable for old-message authorization", async () => {
    const row = project();
    vi.spyOn(Project, "findOne").mockResolvedValue(null);
    vi.spyOn(ChatGroupRecord, "findOne").mockResolvedValue(
      new ChatGroupRecord({
        groupId: extraGroupId,
        project: projectId,
        name: "Đã xóa",
        createdBy: owner,
        deletedAt: new Date(),
      }),
    );
    vi.spyOn(Project, "findById").mockResolvedValue(row);

    await expect(
      accessModule.getProjectChatGroup(extraGroupId),
    ).resolves.toMatchObject({
      id: extraGroupId,
      name: "Đã xóa",
      isDefault: false,
      deleted: true,
      members: [owner, member],
    });
  });
});

describe("project chat group management routes", () => {
  let currentAccess: accessModule.ProjectAccess;
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let url: string;

  beforeEach(async () => {
    currentAccess = access();
    vi.spyOn(accessModule, "projectAccess").mockImplementation(
      async () => currentAccess,
    );
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (action) => action(session),
    );
    vi.spyOn(Project, "updateOne").mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.userId = owner;
      next();
    });
    installProjectRoutes(app);
    app.use(
      (
        error: unknown,
        _req: Request,
        res: Response,
        _next: NextFunction,
      ) => {
        if (error instanceof accessModule.HttpError)
          return res.status(error.status).json({ error: error.message });
        return res.status(400).json({ error: "bad request" });
      },
    );
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  it("lets the project owner create an additional group", async () => {
    const created = new ChatGroupRecord({
      groupId: extraGroupId,
      project: projectId,
      name: "Thiết kế",
      createdBy: owner,
    });
    const create = vi
      .spyOn(ChatGroupRecord, "create")
      .mockResolvedValue([created] as never);
    vi.spyOn(accessModule, "getProjectChatGroup").mockResolvedValue({
      id: extraGroupId,
      name: "Thiết kế",
      isDefault: false,
      deleted: false,
      ownerId: owner,
      members: [owner, member],
      version: 2,
      projectId,
      archived: false,
    });

    const response = await fetch(`${url}/projects/${projectId}/chat-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Thiết kế" }),
    });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          project: currentAccess.project._id,
          name: "Thiết kế",
          createdBy: owner,
        }),
      ],
      { session },
    );
    await expect(response.json()).resolves.toMatchObject({
      id: extraGroupId,
      name: "Thiết kế",
    });
  });

  it("rejects group creation by a regular project member", async () => {
    currentAccess = access("MEMBER");

    const response = await fetch(`${url}/projects/${projectId}/chat-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Riêng" }),
    });

    expect(response.status).toBe(403);
  });

  it("lets the project owner soft-delete an additional group", async () => {
    const remove = vi
      .spyOn(ChatGroupRecord, "findOneAndUpdate")
      .mockResolvedValue(
        new ChatGroupRecord({
          groupId: extraGroupId,
          project: projectId,
          name: "Thiết kế",
          createdBy: owner,
          deletedAt: new Date(),
        }),
      );

    const response = await fetch(
      `${url}/projects/${projectId}/chat-groups/${extraGroupId}`,
      { method: "DELETE" },
    );

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(
      {
        groupId: extraGroupId,
        project: currentAccess.project._id,
        deletedAt: null,
      },
      { $set: { deletedAt: expect.any(Date) } },
      { new: true, session },
    );
  });

  it("rejects deletion of the default Chung group even for the owner", async () => {
    const response = await fetch(
      `${url}/projects/${projectId}/chat-groups/${defaultGroupId}`,
      { method: "DELETE" },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "default chat group cannot be deleted",
    });
  });
});
