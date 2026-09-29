import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { parseMessage } from "../src/shared/protocol.ts";
const base = () => ({
  messageId: randomUUID(),
  sessionId: randomUUID(),
  senderId: "peer-a",
  receiverId: "peer-b",
  type: "text",
  timestamp: Date.now(),
  body: "hello",
  mode: "RELAY",
  attempt: 1,
  sequence: 1,
});
describe("protocol validation", () => {
  it("accepts a bounded message and rejects spoofable/malformed fields", () => {
    expect(parseMessage(base()).body).toBe("hello");
    expect(() => parseMessage({ ...base(), senderId: "../bad" })).toThrow();
    expect(() => parseMessage({ ...base(), body: "x".repeat(5000) })).toThrow();
    expect(() => parseMessage({ ...base(), type: "ack" })).toThrow();
  });
});
