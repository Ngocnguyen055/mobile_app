import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredMessage } from "../src/mobile/domain/chat.ts";
import type { ChatOutboxItem } from "../src/mobile/services/storage/types.ts";
import {
  ApiError,
  persistDirectChatMessage,
  persistGroupChatMessage,
  syncStoredChatMessages,
} from "../src/mobile/services/api.ts";
import { flushChatOutbox, pullChatMessages } from "../src/mobile/services/chat/persistence.ts";

vi.mock("../src/mobile/services/api.ts", () => ({
  ApiError: class extends Error {
    constructor(message: string, public status: number, public path: string) {
      super(message);
    }
  },
  persistDirectChatMessage: vi.fn(),
  persistGroupChatMessage: vi.fn(),
  syncStoredChatMessages: vi.fn(),
}));

const input: ChatOutboxItem["payload"] = {
  messageId: "message-1", sessionId: "session-1", timestamp: 1,
  sequence: 1, body: "Xin chào", attachmentIds: [],
};
const queued: ChatOutboxItem = {
  id: input.messageId, targetKind: "direct", targetId: "receiver",
  payload: input, createdAt: 1,
};
function delivery(receiverId: string, messageId = input.messageId): StoredMessage {
  return {
    message: {
      ...input, messageId, senderId: "sender", receiverId,
      groupId: "group", type: "text",
    },
    status: "queued",
  };
}
function store(items: ChatOutboxItem[] = [queued]) {
  return {
    listChatOutbox: vi.fn().mockResolvedValue(items),
    put: vi.fn().mockResolvedValue(undefined),
    deleteGroupDeliveries: vi.fn().mockResolvedValue(undefined),
    removeChatOutbox: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    mark: vi.fn().mockResolvedValue(undefined),
    getChatSyncCursor: vi.fn().mockResolvedValue("previous"),
    setChatSyncCursor: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => vi.resetAllMocks());

describe("mobile chat retry and synchronization", () => {
  it.each([
    new Error("network offline"),
    new ApiError("temporarily unavailable", 503, "/chat/messages/direct"),
  ])("retains queued deliveries after transient failure: %s", async error => {
    const local = store();
    vi.mocked(persistDirectChatMessage).mockRejectedValue(error);
    await expect(flushChatOutbox(local)).rejects.toBe(error);
    expect(local.removeChatOutbox).not.toHaveBeenCalled();
    expect(local.mark).not.toHaveBeenCalled();
  });

  it("marks every rejected group delivery failed without changing another message", async () => {
    const local = store([{ ...queued, targetKind: "group", targetId: "group" }]);
    local.list.mockResolvedValue([
      delivery("a"), delivery("b"), delivery("a", "another-message"),
    ]);
    const rejected = new ApiError("access denied", 403, "/chat/messages/group");
    vi.mocked(persistGroupChatMessage).mockRejectedValue(rejected);
    await expect(flushChatOutbox(local)).rejects.toBe(rejected);
    expect(local.mark.mock.calls).toEqual([
      [input.messageId, "a", "failed"], [input.messageId, "b", "failed"],
    ]);
    expect(local.removeChatOutbox).toHaveBeenCalledWith(input.messageId);
  });

  it("replaces optimistic recipients with server deliveries before removing a queued group message", async () => {
    const local = store([{ ...queued, targetKind: "group", targetId: "group" }]);
    const serverRows = [delivery("remaining-member")];
    vi.mocked(persistGroupChatMessage).mockResolvedValue(serverRows);
    await flushChatOutbox(local);
    expect(local.deleteGroupDeliveries).toHaveBeenCalledWith(input.messageId, "group");
    expect(local.put).toHaveBeenCalledExactlyOnceWith(serverRows[0]);
    expect(local.removeChatOutbox).toHaveBeenCalledWith(input.messageId);
    expect(local.put.mock.invocationCallOrder[0]).toBeLessThan(
      local.removeChatOutbox.mock.invocationCallOrder[0],
    );
  });

  it("keeps the cursor at the last fully persisted page when local storage fails", async () => {
    const local = store();
    const first = delivery("a", "first");
    const second = delivery("a", "second");
    vi.mocked(syncStoredChatMessages)
      .mockResolvedValueOnce({ items: [first], nextCursor: "page-1", hasMore: true })
      .mockResolvedValueOnce({ items: [second], nextCursor: "page-2", hasMore: false });
    local.put.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk full"));
    await expect(pullChatMessages(local)).rejects.toThrow("disk full");
    expect(syncStoredChatMessages.mock.calls).toEqual([["previous"], ["page-1"]]);
    expect(local.setChatSyncCursor).toHaveBeenCalledExactlyOnceWith("page-1");
  });
});
