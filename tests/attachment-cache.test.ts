import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map<string, number>(),
  rows: new Map<
    string,
    {
      attachmentId: string;
      localUri: string;
      size: number;
      mime: string;
      lastAccessedAt: number;
    }
  >(),
  downloads: 0,
}));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: async (uri: string) =>
    state.files.has(uri)
      ? { exists: true, size: state.files.get(uri) }
      : { exists: false },
  makeDirectoryAsync: vi.fn(),
  deleteAsync: async (uri: string) => {
    if (uri.endsWith("/")) {
      for (const path of state.files.keys())
        if (path.startsWith(uri)) state.files.delete(path);
    }
    state.files.delete(uri);
  },
  downloadAsync: async (_url: string, destination: string) => {
    state.downloads += 1;
    state.files.set(destination, 123);
    return { status: 200, uri: destination };
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    const size = state.files.get(from);
    state.files.delete(from);
    if (size !== undefined) state.files.set(to, size);
  },
}));

vi.mock("../src/mobile/services/api.ts", () => ({
  chatAttachmentUrl: (id: string) => `https://api.test/chat/${id}`,
  getToken: () => "token",
}));

vi.mock("../src/mobile/services/local.ts", () => ({
  MobileStore: class {
    async getAttachmentCache(id: string) {
      return state.rows.get(id) ?? null;
    }
    async saveAttachmentCache(row: (typeof state.rows extends Map<string, infer T> ? T : never)) {
      state.rows.set(row.attachmentId, row);
    }
    async touchAttachmentCache(id: string) {
      const row = state.rows.get(id);
      if (row) row.lastAccessedAt = Date.now();
    }
    async listAttachmentCache() {
      return [...state.rows.values()].sort(
        (left, right) => left.lastAccessedAt - right.lastAccessedAt,
      );
    }
    async removeAttachmentCache(id: string) {
      state.rows.delete(id);
    }
    async clearAttachmentCache() {
      state.rows.clear();
    }
  },
}));

import {
  clearAttachmentCache,
  ensureCachedChatAttachment,
} from "../src/mobile/services/attachmentCache.ts";

const userId = "000000000000000000000001";
const attachment = {
  id: "507f1f77bcf86cd799439011",
  name: "proof.png",
  mime: "image/png",
  size: 123,
};

beforeEach(() => {
  state.files.clear();
  state.rows.clear();
  state.downloads = 0;
});

describe("mobile attachment cache", () => {
  it("downloads once and reuses the verified local file", async () => {
    const first = await ensureCachedChatAttachment(userId, attachment);
    const second = await ensureCachedChatAttachment(userId, attachment);

    expect(first).toBe(second);
    expect(first).toContain(`chat-${attachment.id}.png`);
    expect(state.downloads).toBe(1);
  });

  it("removes the account cache on logout", async () => {
    const uri = await ensureCachedChatAttachment(userId, attachment);
    await clearAttachmentCache(userId);

    expect(state.rows.size).toBe(0);
    expect(state.files.has(uri)).toBe(false);
  });
});
