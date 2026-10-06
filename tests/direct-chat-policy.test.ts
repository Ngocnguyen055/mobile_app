import { describe, expect, it } from "vitest";
import type { ChatMessage, StoredMessage } from "../src/shared/index.ts";
import {
  canSendDirect,
  directMessageStatusLabel,
  directMessagesForContact,
} from "../src/mobile/directChatPolicy.ts";

const CURRENT = "peer-a";
const CONTACT = "peer-b";
const OTHER = "peer-c";
const SESSION = "10000000-0000-4000-8000-000000000001";
const GROUP = "20000000-0000-4000-8000-000000000001";

function stored(
  id: string,
  senderId: string,
  receiverId: string,
  timestamp: number,
  groupId?: string | null,
  type: ChatMessage["type"] = "text",
): StoredMessage {
  return {
    message: {
      messageId: id,
      sessionId: SESSION,
      senderId,
      receiverId,
      groupId,
      type,
      timestamp,
      body: type === "text" ? id : "",
      mode: "RELAY",
      ackFor:
        type === "ack"
          ? "00000000-0000-4000-8000-000000000099"
          : undefined,
      attempt: 1,
      sequence: 1,
    },
    status: senderId === CURRENT ? "delivered" : "received",
  };
}

describe("mobile direct-chat policy", () => {
  it("keeps only two-way direct text rows and orders ties deterministically", () => {
    const later = stored(
      "00000000-0000-4000-8000-000000000002",
      CURRENT,
      CONTACT,
      20,
      null,
    );
    const earlierInbound = stored(
      "00000000-0000-4000-8000-000000000001",
      CONTACT,
      CURRENT,
      10,
    );
    const group = stored(
      "00000000-0000-4000-8000-000000000003",
      CURRENT,
      CONTACT,
      5,
      GROUP,
    );
    const acknowledgement = stored(
      "00000000-0000-4000-8000-000000000004",
      CONTACT,
      CURRENT,
      6,
      null,
      "ack",
    );
    const anotherContact = stored(
      "00000000-0000-4000-8000-000000000005",
      CURRENT,
      OTHER,
      7,
    );

    expect(
      directMessagesForContact(
        [later, group, anotherContact, acknowledgement, earlierInbound],
        CURRENT,
        CONTACT,
      ).map((row) => row.message.messageId),
    ).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("maps delivery states and validates the composer", () => {
    expect(directMessageStatusLabel("pending", true)).toBe("Đang gửi");
    expect(directMessageStatusLabel("delivered", true)).toBe("Đã nhận ACK");
    expect(directMessageStatusLabel("failed", true)).toBe("Gửi thất bại");
    expect(directMessageStatusLabel("received", false)).toBe("Đã nhận");
    expect(canSendDirect(" Xin chào ", CONTACT, false)).toBe(true);
    expect(canSendDirect("   ", CONTACT, false)).toBe(false);
    expect(canSendDirect("x", undefined, false)).toBe(false);
    expect(canSendDirect("x", CONTACT, true)).toBe(false);
    expect(canSendDirect("x".repeat(4001), CONTACT, false)).toBe(false);
  });
});
