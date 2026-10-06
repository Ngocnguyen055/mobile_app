import "dotenv/config";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { Project, ProjectMember, Task, Discussion, Document, Comment, Notification } from "../src/api/models.ts";
import { idOf, projectMemberIds, type ProjectRole } from "../src/api/projectAccess.ts";

// Dry run is the default. Run with --apply only after taking a database backup.
const apply = process.argv.includes("--apply");
if (!process.env.MONGO_URL) throw new Error("MONGO_URL is required");
await mongoose.connect(process.env.MONGO_URL, { autoIndex: false, autoCreate: false });
try {
  if (apply) {
    // Create collections outside transactions, including on a previously empty database.
    for (const model of [Project, ProjectMember, Task, Discussion, Document, Comment, Notification])
      await model.createCollection();
  }
  const projects = await Project.find().lean();
  console.log(`Migration ${apply ? "APPLY" : "DRY RUN"}: ${projects.length} projects. Existing projects remain independent.`);
  for (const original of projects) {
    const id = idOf(original._id);
    console.log(`${id}: ${original.kind || "independent"}; ${projectMemberIds(original).length} members; chat ${original.chatGroupId ? "preserved" : "will be created"}`);
    if (!apply) continue;
    await mongoose.connection.transaction(async (session) => {
      // Read fresh in every retry; never regenerate a committed group identity.
      const project = await Project.findById(id).session(session).lean();
      if (!project) return;
      const root = project.parentProject ? await Project.findById(project.parentProject).session(session).lean() : project;
      if (!root) throw new Error(`Missing root for ${id}`);
      const kind = project.kind || "independent";
      const members = [...new Set([...projectMemberIds(project), idOf(root.owner)])];
      if (project.parentProject && !members.every((userId) => projectMemberIds(root).includes(userId) || userId === idOf(root.owner)))
        throw new Error(`Child ${id} has a member outside root; correct membership before migration`);
      const records = members.map((userId) => ({
        project: project._id, user: userId,
        role: (kind === "independent" ? userId === idOf(project.owner) ? "OWNER" : "MEMBER" : userId === idOf(root.owner) ? "DIRECTOR" : userId === idOf(project.manager) ? "MANAGER" : "EMPLOYEE") as ProjectRole,
      }));
      await ProjectMember.deleteMany({ project: project._id }, { session });
      if (records.length) await ProjectMember.insertMany(records, { session });
      await Project.updateOne({ _id: project._id }, { $set: {
        members, kind, parentProject: project.parentProject || null, manager: project.manager || null,
        archived: project.archived || false, version: project.version || 1,
        chatGroupId: project.chatGroupId || randomUUID(), chatRevision: project.chatRevision || 1,
      } }, { session });
      await Task.updateMany({ project: project._id, assignee: { $nin: members, $ne: null } }, { $unset: { assignee: 1 }, $inc: { version: 1 } }, { session });
    });
  }
  if (apply) {
    // Defaults on hydrated old rows do not backfill stored optimistic revisions.
    await Discussion.updateMany({ revision: { $exists: false } }, { $set: { revision: 1 } });
    await Discussion.updateMany({ hidden: { $exists: false } }, { $set: { hidden: false } });
    await Discussion.updateMany({ attachments: { $exists: false } }, { $set: { attachments: [] } });
    await Document.updateMany({ post: { $exists: false } }, { $set: { post: null } });
    for (const model of [Project, ProjectMember, Comment, Notification]) await model.createIndexes();
    console.log("Migration applied. Group IDs and roles are stable on repeated runs.");
  } else {
    console.log(`Legacy posts needing revision backfill: ${await Discussion.countDocuments({ revision: { $exists: false } })}`);
    console.log("No data changed. To apply: npm.cmd run migrate:projects -- --apply");
  }
} finally {
  await mongoose.disconnect();
}
