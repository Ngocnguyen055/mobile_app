import mongoose from "mongoose";
import { createApi } from "./app.ts";
import "./config.ts";
import { startDeadlineNotifications } from "./notifications.ts";
export { createApi } from "./app.ts";

if (process.argv[1]?.endsWith("index.ts")) {
  await mongoose.connect(
    process.env.MONGO_URL || "mongodb://127.0.0.1:27017/student_planner",
  );
  const stopDeadlineNotifications = startDeadlineNotifications();
  process.once("SIGINT", stopDeadlineNotifications);
  process.once("SIGTERM", stopDeadlineNotifications);
  createApi().listen(Number(process.env.API_PORT || 4000), "0.0.0.0", () =>
    console.log("[api] listening"),
  );
}
