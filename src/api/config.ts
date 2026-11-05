import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
)
  throw new Error("JWT_SECRET must be at least 32 characters in production");
export const secret = process.env.JWT_SECRET || "local-development-only-secret";
