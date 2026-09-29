import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { createApi } from "../src/api/index.ts";
import { Project, Task } from "../src/api/models.ts";

const userId = "000000000000000000000001";
const projectId = "000000000000000000000002";
const taskId = "000000000000000000000003";
const token = jwt.sign(
  { sub: userId },
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

const request = (
  baseUrl: string,
  path: string,
  method: string,
  body: unknown,
) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("task time window API", () => {
  it("keeps legacy tasks without startsAt valid and rejects invalid model windows", async () => {
    const legacy = new Task({
      project: projectId,
      title: "Task cũ",
      dueAt: new Date("2026-10-01T10:00:00.000Z"),
    });
    await expect(legacy.validate()).resolves.toBeUndefined();

    const invalid = new Task({
      project: projectId,
      title: "Task sai thời gian",
      startsAt: new Date("2026-10-01T10:00:00.000Z"),
      dueAt: new Date("2026-10-01T09:00:00.000Z"),
    });
    await expect(invalid.validate()).rejects.toThrow(
      "task start must be before due date",
    );
  });

  it("rejects an invalid create window before writing a task", async () => {
    vi.spyOn(Project, "findOne").mockResolvedValue({
      id: projectId,
      members: [userId],
    } as never);
    const create = vi.spyOn(Task, "create");

    await withApi(async (baseUrl) => {
      const response = await request(
        baseUrl,
        `/projects/${projectId}/tasks`,
        "POST",
        {
          title: "Khoảng thời gian sai",
          startsAt: "2026-10-01T10:00:00.000Z",
          dueAt: "2026-10-01T09:00:00.000Z",
        },
      );
      expect(response.status).toBe(400);
      expect(create).not.toHaveBeenCalled();
    });
  });

  it("validates a partial patch against stored dates and keeps optimistic versioning", async () => {
    vi.spyOn(Project, "findOne").mockResolvedValue({
      id: projectId,
      members: [userId],
    } as never);
    const find = vi.spyOn(Task, "findOne").mockResolvedValue({
      startsAt: new Date("2026-10-01T08:00:00.000Z"),
      dueAt: new Date("2026-10-01T10:00:00.000Z"),
    } as never);
    const update = vi.spyOn(Task, "findOneAndUpdate").mockResolvedValue({
      _id: taskId,
      project: projectId,
      title: "Task",
      startsAt: null,
      dueAt: "2026-10-01T10:00:00.000Z",
      version: 8,
    } as never);

    await withApi(async (baseUrl) => {
      const invalid = await request(
        baseUrl,
        `/projects/${projectId}/tasks/${taskId}`,
        "PATCH",
        {
          startsAt: "2026-10-01T11:00:00.000Z",
          version: 7,
        },
      );
      expect(invalid.status).toBe(400);
      expect(find).toHaveBeenCalledWith({
        _id: taskId,
        project: projectId,
        version: 7,
      });
      expect(update).not.toHaveBeenCalled();

      const cleared = await request(
        baseUrl,
        `/projects/${projectId}/tasks/${taskId}`,
        "PATCH",
        { startsAt: null, version: 7 },
      );
      expect(cleared.status).toBe(200);
      expect(update).toHaveBeenCalledWith(
        { _id: taskId, project: projectId, version: 7 },
        { $set: { startsAt: null }, $inc: { version: 1 } },
        { new: true },
      );
    });
  });
});
