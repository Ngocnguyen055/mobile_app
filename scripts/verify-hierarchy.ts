import "dotenv/config";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApi } from "../src/api/index.ts";
import { User, Project, ProjectMember, Task, Event, Discussion, Document, Comment, Notification } from "../src/api/models.ts";
import { runDeadlineNotifications } from "../src/api/notifications.ts";

// Use an isolated database on the configured cluster. Never migrate or alter the app database.
const uri = process.env.MONGO_URL;
if (!uri) throw new Error("MONGO_URL is required");
const testDatabase = `student_planner_verify_${Date.now()}_${randomUUID().slice(0, 8)}`;
const models = [User, Project, ProjectMember, Task, Event, Discussion, Document, Comment, Notification];
let server: ReturnType<ReturnType<typeof createApi>["listen"]> | undefined;
let base = "";
type Account = { token: string; user: { id: string; name: string; email: string } };
type Row = { _id: string; version: number; title?: string; manager?: string; members?: { _id: string; role: string }[]; chatGroupId?: string; revision?: number };
let checks = 0;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks++;
  console.log(`PASS ${message}`);
}
async function request<T = Row>(account: Account | null, path: string, method = "GET", body?: unknown) {
  const form = body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(account ? { Authorization: `Bearer ${account.token}` } : {}), ...(!form && body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: form ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.headers.get("content-type")?.includes("json")
    ? await response.json() : await response.text();
  return { status: response.status, data: payload as T };
}
async function ok<T = Row>(account: Account | null, path: string, method = "GET", body?: unknown) {
  const result = await request<T>(account, path, method, body);
  if (result.status >= 400) throw new Error(`${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
async function account(name: string): Promise<Account> {
  return ok<Account>(null, "/auth/register", "POST", { name, email: `${name.toLowerCase()}@verify.test`, password: randomUUID() });
}

try {
  await mongoose.connect(uri, { dbName: testDatabase, serverSelectionTimeoutMS: 15000 });
  await Promise.all(models.map((model) => model.init()));
  server = createApi().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const [director, manager, manager2, employee, outsider] = await Promise.all(["Director", "Manager", "Manager2", "Employee", "Outside"].map(account));
  assert((await request(null, "/projects")).status === 401, "JWT required");
  const root = await ok(director, "/projects", "POST", { name: "Hierarchy verification", kind: "hierarchical" });
  assert(!!root.chatGroupId, "root chat created automatically");
  for (const person of [manager, manager2, employee])
    await ok(director, `/projects/${root._id}/members`, "POST", { userId: person.user.id });
  const child = await ok(director, `/projects/${root._id}/children`, "POST", { name: "Department A", managerId: manager.user.id, memberIds: [employee.user.id] });
  const child2 = await ok(director, `/projects/${root._id}/children`, "POST", { name: "Department B", managerId: manager2.user.id, memberIds: [employee.user.id] });
  assert(!!child.chatGroupId && child.chatGroupId !== root.chatGroupId, "child has its own persistent chat");
  assert((await request(outsider, `/projects/${child._id}`)).status === 403, "outsider cannot access child");
  assert((await request(manager, `/projects/${child2._id}/progress`)).status === 403, "manager cannot inspect another department");
  assert((await request(manager, `/projects/${child._id}/members`, "POST", { userId: outsider.user.id })).status === 400, "manager cannot add user outside root");
  assert((await request(employee, `/projects/${child._id}/members`, "POST", { userId: manager2.user.id })).status === 403, "employee cannot manage members");
  assert((await request(manager, `/projects/${child._id}/manager`, "PUT", { userId: manager2.user.id })).status === 403, "only director can appoint manager");
  const draft = { title: "Assigned task", assignee: employee.user.id, startsAt: new Date(Date.now() - 3600000).toISOString(), dueAt: new Date(Date.now() + 3600000).toISOString() };
  assert((await request(employee, `/projects/${child._id}/tasks`, "POST", draft)).status === 403, "employee cannot create task");
  let task = await ok(manager, `/projects/${child._id}/tasks`, "POST", draft);
  task = await ok(employee, `/projects/${child._id}/tasks/${task._id}`, "PATCH", { version: task.version, status: "doing" });
  assert(task.version === 2, "employee updates only own task status");
  assert((await request(employee, `/projects/${child._id}/tasks/${task._id}`, "PATCH", { version: task.version, title: "forbidden" })).status === 403, "employee cannot edit own task content");
  const otherTask = await ok(manager, `/projects/${child._id}/tasks`, "POST", { ...draft, title: "Manager task", assignee: manager.user.id });
  assert((await request(employee, `/projects/${child._id}/tasks/${otherTask._id}`, "PATCH", { version: otherTask.version, status: "done" })).status === 403, "employee cannot change another person's task");
  const updates = await Promise.all(["First", "Second"].map((title) => request(manager, `/projects/${child._id}/tasks/${task._id}`, "PATCH", { title, version: task.version })));
  assert(updates.filter((r) => r.status === 200).length === 1 && updates.filter((r) => r.status === 409).length === 1, "concurrent task updates produce one conflict");

  const form = new FormData();
  form.set("title", "Attached discussion"); form.set("body", "Real multipart test");
  form.append("files", new Blob(["attachment content"], { type: "text/plain" }), "evidence.txt");
  const post = await ok<Row & { attachments: Row[] }>(employee, `/projects/${child._id}/discussions`, "POST", form);
  assert(post.attachments.length === 1, "post stores attachment atomically");
  assert((await request(manager, `/projects/${child._id}/discussions/${post._id}`, "PATCH", { title: "not the author" })).status === 403, "moderator cannot rewrite someone else's post");
  const comment = await ok(manager, `/projects/${child._id}/discussions/${post._id}/comments`, "POST", { body: "A comment" });
  await ok(manager, `/projects/${child._id}/discussions/${post._id}/comments/${comment._id}`, "PATCH", { body: "Edited comment", revision: comment.revision });
  await ok(manager, `/projects/${child._id}/discussions/${post._id}/visibility`, "PATCH", { hidden: true });
  // A current ordinary member must not access hidden post files; director/author can.
  await ok(director, `/projects/${child._id}/members`, "POST", { userId: manager2.user.id });
  assert((await request(manager2, `/projects/${child._id}/documents/${post.attachments[0]._id}`)).status === 404, "hidden attachment denied to non-author non-moderator");
  await ok(manager, `/projects/${child._id}/discussions/${post._id}/visibility`, "PATCH", { hidden: false });
  assert((await request(manager2, `/projects/${child._id}/documents/${post.attachments[0]._id}`)).status === 200, "visible attachment downloadable by child member");
  const revisions = await Promise.all(["Comment A", "Comment B"].map((body) => request(manager, `/projects/${child._id}/discussions/${post._id}/comments/${comment._id}`, "PATCH", { body, revision: (comment.revision || 1) + 1 })));
  assert(revisions.filter((r) => r.status === 200).length === 1 && revisions.filter((r) => r.status === 409).length === 1, "concurrent comment updates produce one conflict");
  const noticeRows = await Notification.find().lean();
  assert(noticeRows.every((n) => !n.actor || String(n.user) !== String(n.actor)), "no notification sent to action actor");
  assert(!noticeRows.some((n) => String(n.user) === outsider.user.id), "outsider receives no project notifications");
  assert(!noticeRows.some((n) => n.type === "discussion_created" && String(n.user) === manager2.user.id), "child post does not notify unrelated root member");
  await runDeadlineNotifications(); await runDeadlineNotifications();
  assert(await Notification.countDocuments({ type: "task_deadline", entityId: task._id }) === 1, "deadline inbox de-duplicates repeat scans");

  const childAtRemoval = await ok(director, `/projects/${child._id}`);
  assert((await request(director, `/projects/${root._id}/members/${manager.user.id}`, "DELETE", {})).status === 409, "manager removal requires replacement before mutation");
  assert((await ok(director, `/projects/${child._id}`)).manager === childAtRemoval.manager, "failed manager removal rolls back data");
  await ok(director, `/projects/${root._id}/members/${manager.user.id}`, "DELETE", { replacementManagers: [{ projectId: child._id, userId: manager2.user.id }] });
  assert((await request(manager, `/projects/${child._id}/tasks`)).status === 403, "root removal revokes child data access");
  assert((await Task.findById(otherTask._id))?.assignee == null, "removed member task becomes unassigned");
  const changed = await ok(director, `/projects/${child._id}`);
  assert(changed.manager === manager2.user.id && !changed.members?.some((m) => m._id === manager.user.id), "manager replacement and membership committed together");
  const persistentGroup = await fetch(`${base}/internal/chat-groups/${child.chatGroupId}`, { headers: { "x-peer-secret": process.env.PEER_SECRET || "local-development-only-secret" } }).then((r) => r.json()) as { members: string[] };
  assert(!persistentGroup.members.includes(manager.user.id), "chat directory excludes removed manager");

  await ok(director, `/projects/${root._id}/archive`, "PATCH", { archived: true });
  assert((await ok(director, `/projects/${child._id}`) as Row & { archived: boolean }).archived, "root archive cascades to children");
  assert((await request(employee, `/projects/${child._id}/discussions`, "POST", { title: "Blocked", body: "Archived" })).status === 423, "archived project blocks new posts");
  assert((await request(manager2, `/projects/${child._id}/tasks`, "POST", draft)).status === 423, "archived project blocks new tasks");
  assert((await request(employee, `/projects/${child._id}/tasks`)).status === 200, "archived project remains readable");
  await ok(director, `/projects/${root._id}/archive`, "PATCH", { archived: false, restoreChildren: false });
  assert((await ok(director, `/projects/${child._id}`) as Row & { archived: boolean }).archived, "restore root can leave children archived");
  await ok(director, `/projects/${root._id}/archive`, "PATCH", { archived: false, restoreChildren: true });
  assert(!(await ok(director, `/projects/${child._id}`) as Row & { archived: boolean }).archived, "restore root can restore children explicitly");
  const independent = await ok(director, "/projects", "POST", { name: "Independent compatibility", kind: "independent" });
  await ok(director, `/projects/${independent._id}/members`, "POST", { userId: employee.user.id });
  assert((await request(employee, `/projects/${independent._id}/tasks`, "POST", { ...draft, assignee: employee.user.id })).status === 201, "independent project retains shared task creation");
  console.log(`Hierarchy API verification passed: ${checks} checks. Data used an isolated temporary database.`);
} finally {
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try {
    if (mongoose.connection.db?.databaseName === testDatabase && testDatabase.startsWith("student_planner_verify_")) {
      await mongoose.connection.dropDatabase();
      console.log("Temporary verification database removed.");
    }
  } finally { await mongoose.disconnect(); }
}
