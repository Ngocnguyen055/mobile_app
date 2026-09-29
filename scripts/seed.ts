import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Project, Task, Event, Discussion } from "../src/api/models.ts";

await mongoose.connect(
  process.env.MONGO_URL || "mongodb://127.0.0.1:27017/student_planner",
);
const names = ["An", "Bình", "Chi"];
const password = "StudentDemo123!";
const users = [];
for (const name of names) {
  const email = `${name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")}@example.test`;
  let user = await User.findOne({ email });
  if (!user)
    user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
    });
  users.push(user);
}
let project = await Project.findOne({
  name: "Bài tập lớn Mobile + DS01",
  owner: users[0].id,
});
if (!project)
  project = await Project.create({
    name: "Bài tập lớn Mobile + DS01",
    description: "Dữ liệu mẫu cho ba sinh viên",
    owner: users[0].id,
    members: users.map((u) => u.id),
    plannedHours: 90,
    actualHours: 15,
    plannedBudget: 500000,
    spentBudget: 75000,
  });
if (!(await Task.exists({ project: project.id }))) {
  const now = Date.now();
  await Task.create([
    {
      project: project.id,
      title: "Thiết kế giao thức chat",
      assignee: users[0].id,
      startsAt: new Date(now + 2 * 3600000),
      dueAt: new Date(now + 86400000),
      status: "doing",
    },
    {
      project: project.id,
      title: "Làm giao diện Mobile",
      assignee: users[1].id,
      startsAt: new Date(now + 86400000),
      dueAt: new Date(now + 3 * 86400000),
      status: "todo",
    },
    {
      project: project.id,
      title: "Kiểm thử ba peer",
      assignee: users[2].id,
      startsAt: new Date(now + 4 * 86400000),
      dueAt: new Date(now + 7 * 86400000),
      status: "todo",
    },
  ]);
}
if (!(await Event.exists({ project: project.id, title: "Họp nhóm" }))) {
  await Event.create({
    project: project.id,
    title: "Họp nhóm",
    startsAt: new Date(Date.now() + 2 * 86400000),
    endsAt: new Date(Date.now() + 2 * 86400000 + 3600000),
    createdBy: users[0].id,
  });
}
if (
  !(await Discussion.exists({ project: project.id, title: "Quy ước nhóm" }))
) {
  await Discussion.create({
    project: project.id,
    author: users[0].id,
    title: "Quy ước nhóm",
    body: "Cập nhật tiến độ sau mỗi buổi làm việc.",
  });
}
if (
  !(await Event.exists({
    project: null,
    createdBy: users[1].id,
    title: "Ôn bài cá nhân",
  }))
) {
  await Event.create({
    project: null,
    title: "Ôn bài cá nhân",
    startsAt: new Date(Date.now() + 86400000),
    endsAt: new Date(Date.now() + 86400000 + 3600000),
    note: "Sự kiện cá nhân mẫu",
    reminderOffsets: [3600000],
    createdBy: users[1].id,
  });
}
console.log(
  "Seed ready:",
  users.map((u) => `${u.email} / ${password}`).join(" | "),
);
await mongoose.disconnect();
