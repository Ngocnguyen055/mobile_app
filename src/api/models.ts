import mongoose, { Schema } from "mongoose";
import { randomUUID } from "node:crypto";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);
const projectSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    kind: { type: String, enum: ["independent", "hierarchical"], default: "independent" },
    parentProject: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    manager: { type: Schema.Types.ObjectId, ref: "User", default: null },
    archived: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    plannedHours: { type: Number, default: 0 },
    actualHours: { type: Number, default: 0 },
    plannedBudget: { type: Number, default: 0 },
    spentBudget: { type: Number, default: 0 },
    currency: { type: String, default: "VND" },
    chatGroupId: { type: String, default: randomUUID },
    chatRevision: { type: Number, default: 1 },
  },
  { timestamps: true },
);
projectSchema.index({ parentProject: 1, archived: 1 });
projectSchema.index({ members: 1 });
projectSchema.index({ chatGroupId: 1 }, { unique: true, sparse: true });
const projectMemberSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["OWNER", "MEMBER", "DIRECTOR", "MANAGER", "EMPLOYEE"], required: true },
  },
  { timestamps: true, collection: "project_members" },
);
projectMemberSchema.index({ project: 1, user: 1 }, { unique: true });
projectMemberSchema.index({ user: 1, project: 1 });
const taskSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    assignee: { type: Schema.Types.ObjectId, ref: "User" },
    startsAt: Date,
    dueAt: Date,
    status: { type: String, enum: ["todo", "doing", "done"], default: "todo" },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);
taskSchema.pre("validate", function () {
  if (this.startsAt && this.dueAt && +this.startsAt >= +this.dueAt)
    this.invalidate("startsAt", "task start must be before due date");
});
const eventSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    title: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    note: { type: String, default: "" },
    allDay: { type: Boolean, default: false },
    reminderOffsets: {
      type: [{ type: Number, enum: [604800000, 86400000, 3600000] }],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
taskSchema.index({ assignee: 1, dueAt: 1 });
eventSchema.index({ project: 1, startsAt: 1, endsAt: 1 });
eventSchema.index({ createdBy: 1, startsAt: 1, endsAt: 1 });
const discussionSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    hidden: { type: Boolean, default: false },
    revision: { type: Number, default: 1 },
    attachments: [{ type: Schema.Types.ObjectId, ref: "Document" }],
  },
  { timestamps: true },
);
const documentSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    uploader: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    post: { type: Schema.Types.ObjectId, ref: "Discussion", default: null },
  },
  { timestamps: true },
);
const commentSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: "Discussion", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true, collection: "comments" },
);
commentSchema.index({ post: 1, createdAt: 1 });
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    project: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    entityId: String,
    dedupeKey: String,
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "notifications" },
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } });
export const User = mongoose.model("User", userSchema);
export const Project = mongoose.model("Project", projectSchema);
export const ProjectMember = mongoose.model("ProjectMember", projectMemberSchema);
export const Task = mongoose.model("Task", taskSchema);
export const Event = mongoose.model("Event", eventSchema);
export const Discussion = mongoose.model("Discussion", discussionSchema);
export const Document = mongoose.model("Document", documentSchema);
export const Comment = mongoose.model("Comment", commentSchema);
export const Notification = mongoose.model("Notification", notificationSchema);
