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
  it("accepts omitted/null group IDs for personal messages and preserves valid group IDs", () => {
    expect(parseMessage(base()).groupId).toBeUndefined();
    expect(parseMessage({ ...base(), groupId: null }).groupId).toBeNull();
    const groupId = randomUUID();
    expect(parseMessage({ ...base(), groupId }).groupId).toBe(groupId);
    expect(() => parseMessage({ ...base(), groupId: "" })).toThrow();
    expect(() => parseMessage({ ...base(), groupId: "not-a-uuid" })).toThrow();
    expect(parseMessage({ ...base(), type: "ack", groupId: null, ackFor: randomUUID(), body: "" }).groupId).toBeNull();
  });
});
