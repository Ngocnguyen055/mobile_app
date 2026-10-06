import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import multer from "multer";
import { installDiscussionRoutes } from "../src/api/discussionRoutes.ts";
import { Comment, Discussion, Document } from "../src/api/models.ts";
import { HttpError, projectAccess } from "../src/api/projectAccess.ts";
import { emitNotification } from "../src/api/notifications.ts";

vi.mock("../src/api/models.ts", () => ({
  Discussion: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), create: vi.fn(), findById: vi.fn() },
  Document: { findOne: vi.fn(), insertMany: vi.fn() }, Comment: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  Notification: {}, Project: {}, Task: {},
}));
vi.mock("../src/api/notifications.ts", () => ({ emitNotification: vi.fn() }));
vi.mock("../src/api/projectAccess.ts", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  const lookup = vi.fn();
  const requireWritable = (access: { archived: boolean }) => {
    if (access.archived) throw new HttpError(423, "project archived; read only");
  };
  return {
    HttpError, projectAccess: lookup, accessibleProjectIds: vi.fn(),
    requireWritable,
    withWritableProject: async (projectId: string, userId: string, action: (access: unknown, session: undefined) => Promise<unknown>, permission?: string) => {
      const access = await lookup(projectId, userId);
      requireWritable(access);
      if (permission && !access.permissions[permission]) throw new HttpError(403, "permission denied");
      return action(access, undefined);
    },
  };
});
const actor = "000000000000000000000001";
const other = "000000000000000000000002";
const projectId = "000000000000000000000003";
const postId = "000000000000000000000004";
const commentId = "000000000000000000000005";
const servers: ReturnType<express.Express["listen"]>[] = [];
const query = (value: unknown) => ({ session: async () => value });
async function http(moderate = false, archived = false) {
  vi.mocked(projectAccess).mockResolvedValue({
    project: { id: projectId, members: [actor, other] }, permissions: { moderate }, archived,
  } as unknown as Awaited<ReturnType<typeof projectAccess>>);
  vi.mocked(Discussion.findOne).mockReturnValue(query({
    id: postId, project: projectId, author: other, hidden: false, revision: 2, attachments: [],
  }) as never);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = actor; next(); });
  installDiscussionRoutes(app);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof HttpError ? error.status :
      error instanceof z.ZodError || error instanceof multer.MulterError ? 400 : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "error" });
  });
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/projects/${projectId}`;
}
const json = (body: unknown, method = "PATCH") => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});
describe("discussion authorization and data boundaries", () => {
  it("stores a multipart post and attachment together and emits only project-scoped notification candidates", async () => {
    const base = await http();
    const post = { id: postId, title: "Design", body: "Notes", attachments: [], save: vi.fn() };
    vi.mocked(Discussion.create).mockResolvedValue([post] as never);
    vi.mocked(Document.insertMany).mockResolvedValue([{ _id: commentId }] as never);
    vi.mocked(Discussion.findById).mockReturnValue({
      populate: () => ({ populate: async () => ({ _id: postId, attachments: [{ name: "notes.txt" }] }) }),
    } as never);
    const form = new FormData(); form.set("title", "Design"); form.set("body", "Notes");
    form.append("files", new Blob(["document"], { type: "text/plain" }), "notes.txt");
    const response = await fetch(`${base}/discussions`, { method: "POST", body: form });
    expect(response.status).toBe(201);
    expect((await response.json()).attachments).toEqual([{ name: "notes.txt" }]);
    expect(post.attachments).toEqual([commentId]);
    expect(emitNotification).toHaveBeenCalledWith(expect.objectContaining({
      actorId: actor, recipientIds: [actor, other], projectId, type: "discussion_created", entityId: postId,
    }));
    expect(Document.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ project: projectId, post: postId, uploader: actor, name: "notes.txt", size: 8 }),
    ], { session: undefined });
  });
  it("rechecks archive state inside the mutation boundary before writing a post", async () => {
    const base = await http();
    const active = { project: { id: projectId, members: [actor] }, permissions: { moderate: false }, archived: false };
    vi.mocked(projectAccess).mockResolvedValueOnce(active as never)
      .mockResolvedValueOnce({ ...active, archived: true } as never);
    const response = await fetch(`${base}/discussions`, json({ title: "Title", body: "Text" }, "POST"));
    expect(response.status).toBe(423);
    expect(Discussion.create).not.toHaveBeenCalled();
  });
  it("allows managers to moderate without editing another author's content", async () => {
    const base = await http(true);
    expect((await fetch(`${base}/discussions/${postId}`, json({ body: "rewritten" }))).status).toBe(403);
    expect(Discussion.findOneAndUpdate).not.toHaveBeenCalled();
    const employeeBase = await http(false);
    expect((await fetch(`${employeeBase}/discussions/${postId}/visibility`, json({ hidden: true }))).status).toBe(403);
    expect(Discussion.updateOne).not.toHaveBeenCalled();
  });
  it("blocks all comment writes while archived and blocks nonauthor editing", async () => {
    const base = await http(false, true);
    expect((await fetch(`${base}/discussions/${postId}/comments`, json({ body: "test" }, "POST"))).status).toBe(423);
    expect(Comment.findOne).not.toHaveBeenCalled();
    const active = await http(true, false);
    vi.mocked(Comment.findOne).mockReturnValue(query({ id: commentId, author: other, revision: 1 }) as never);
    expect((await fetch(`${active}/discussions/${postId}/comments/${commentId}`, json({ body: "edited" }))).status).toBe(403);
    expect(Comment.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("prevents downloading hidden-post attachments using a guessed document ID", async () => {
    const base = await http();
    vi.mocked(Document.findOne).mockResolvedValue({ post: postId, data: Buffer.from("private") } as never);
    vi.mocked(Discussion.findOne).mockReturnValue(query({ id: postId, author: other, hidden: true }) as never);
    const response = await fetch(`${base}/documents/${commentId}`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("private");
  });
  it("returns a conflict for stale authored-post revisions", async () => {
    const base = await http();
    vi.mocked(Discussion.findOne).mockReturnValue(query({ id: postId, author: actor, revision: 2, attachments: [] }) as never);
    vi.mocked(Discussion.findOneAndUpdate).mockResolvedValue(null);
    const response = await fetch(`${base}/discussions/${postId}`, json({ body: "new", revision: 1 }));
    expect(response.status).toBe(409);
    expect(Discussion.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: postId, revision: 1 },
      { $set: { body: "new" }, $inc: { revision: 1 } }, { new: true, session: undefined },
    );
  });
  it("rejects active content MIME types, oversized uploads and invalid IDs", async () => {
    const base = await http();
    const unsafe = new FormData();
    unsafe.set("title", "File"); unsafe.set("body", "attached");
    unsafe.append("files", new Blob(["<script>alert(1)</script>"], { type: "text/html" }), "bad.html");
    expect((await fetch(`${base}/discussions`, { method: "POST", body: unsafe })).status).toBe(400);
    const huge = new FormData(); huge.set("title", "File"); huge.set("body", "attached");
    huge.append("files", new Blob([new Uint8Array(512 * 1024 + 1)], { type: "application/pdf" }), "big.pdf");
    expect((await fetch(`${base}/discussions`, { method: "POST", body: huge })).status).toBe(400);
    expect((await fetch(`${base}/discussions/invalid/comments`)).status).toBe(400);
  });
});
