import mongoose, { Schema } from "mongoose";

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
    plannedHours: { type: Number, default: 0 },
    actualHours: { type: Number, default: 0 },
    plannedBudget: { type: Number, default: 0 },
    spentBudget: { type: Number, default: 0 },
    currency: { type: String, default: "VND" },
    chatGroupId: String,
  },
  { timestamps: true },
);
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
    body: { type: String, required: true },
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
  },
  { timestamps: true },
);
export const User = mongoose.model("User", userSchema);
export const Project = mongoose.model("Project", projectSchema);
export const Task = mongoose.model("Task", taskSchema);
export const Event = mongoose.model("Event", eventSchema);
export const Discussion = mongoose.model("Discussion", discussionSchema);
export const Document = mongoose.model("Document", documentSchema);
