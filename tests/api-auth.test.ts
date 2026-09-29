import { describe, expect, it } from "vitest";
import { createApi } from "../src/api/index.ts";
import type { AddressInfo } from "node:net";

describe("API guards without a database connection", () => {
  it("rejects unauthenticated project reads and malformed registration before touching MongoDB", async () => {
    const server = createApi().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const unauthenticated = await fetch(`${url}/projects`);
      expect(unauthenticated.status).toBe(401);
      const invalid = await fetch(`${url}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "A",
          email: "invalid",
          password: "short",
        }),
      });
      expect(invalid.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
