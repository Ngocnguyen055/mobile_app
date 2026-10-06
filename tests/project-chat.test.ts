import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io, type Socket } from "socket.io-client";
import { createSignaling } from "../src/signaling/index.ts";
import { createRelay } from "../src/relay/index.ts";
import { PeerClient, type PeerConfig, type StoredMessage, type ChatMessage, type Group } from "../src/shared/index.ts";

const A = "000000000000000000000001";
const B = "000000000000000000000002";
const C = "000000000000000000000003";
const PROJECT = "000000000000000000000004";
const clients: PeerClient[] = [];
const sockets: Socket[] = [];
const cleanups: (() => Promise<void>)[] = [];

class Store {
  rows: StoredMessage[] = [];
  async put(row: StoredMessage) {
    const i = this.rows.findIndex((r) => r.message.messageId === row.message.messageId && r.message.receiverId === row.message.receiverId);
    if (i < 0) this.rows.push(row); else this.rows[i] = row;
  }
  async mark(id: string, receiverId: string, status: StoredMessage["status"]) {
    const row = this.rows.find((r) => r.message.messageId === id && r.message.receiverId === receiverId);
    if (row) row.status = status;
  }
  async has(id: string, senderId: string) { return this.rows.some((r) => r.message.messageId === id && r.message.senderId === senderId); }
  async list() { return this.rows; }
}

async function listen(service: ReturnType<typeof createSignaling> | ReturnType<typeof createRelay>) {
  cleanups.push(service.close);
  await new Promise<void>((resolve) => service.httpServer.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(service.httpServer.address() as AddressInfo).port}`;
}
async function waitFor(predicate: () => boolean) {
  const until = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > until) throw new Error("condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  sockets.splice(0).forEach((s) => s.disconnect());
  for (const close of cleanups.splice(0)) await close();
});

describe("persistent project chat authorization", () => {
  it("discovers automatic groups, preserves old history after removal, and blocks new relay/direct input and archived writes", async () => {
    let group: Group = { id: randomUUID(), ownerId: A, members: [A, B, C], version: 1, projectId: PROJECT, archived: false };
    const signal = createSignaling(undefined, {
      group: async (id) => id === group.id ? group : null,
      project: async (id) => id === PROJECT ? group : null,
      forPeer: async (id) => group.members.includes(id) ? [group] : [],
    });
    const signalUrl = await listen(signal);
    const relayUrl = await listen(createRelay(undefined, async (id) => id === group.id ? group : null));
    const stores = [new Store(), new Store(), new Store()];
    const logs: string[] = [];
    for (const [index, peerId] of [A, B, C].entries()) {
      const peer = new PeerClient({
        peerId, signalUrl, relayUrl, forceRelay: true,
        identityProof: jwt.sign({ sub: peerId }, process.env.JWT_SECRET || "local-development-only-secret"),
        rtc: class {} as unknown as PeerConfig["rtc"], store: stores[index], ackTimeoutMs: 150,
        onEvent: (event) => { if (event.kind === "log") logs.push(event.text || ""); },
      });
      clients.push(peer);
      await peer.connect();
    }
    await waitFor(() => logs.filter((r) => r === "relay connected").length === 3);
    expect(await clients[0].syncProjectGroup(PROJECT)).toMatchObject({ members: [A, B, C] });
    expect(await clients[0].sendGroup(group.id, "before removal")).toEqual({ [B]: "fulfilled", [C]: "fulfilled" });
    expect(stores[1].rows[0].message.body).toBe("before removal");

    group = { ...group, members: [A, C], version: 2 };
    await expect(clients[1].syncProjectGroup(PROJECT)).rejects.toThrow("access denied");
    expect(await clients[0].sendGroup(group.id, "after removal")).toEqual({ [C]: "fulfilled" });
    expect(stores[1].rows.map((r) => r.message.body)).toEqual(["before removal"]);

    const wire: ChatMessage = { messageId: randomUUID(), sessionId: group.id, groupId: group.id, senderId: A, receiverId: B, type: "text", timestamp: Date.now(), body: "stale connection", mode: "RELAY", attempt: 1, sequence: 10 };
    const forged = io(relayUrl, { auth: { token: jwt.sign({ sub: A }, process.env.PEER_SECRET || "local-development-only-secret") } });
    sockets.push(forged);
    await new Promise<void>((resolve) => forged.once("connect", resolve));
    expect(await forged.timeout(2000).emitWithAck("relay:send", wire)).toMatchObject({ ok: false, error: "group access denied" });
    // Exercise DataChannel receive handler directly; this is a policy simulation, not WebRTC evidence.
    await (clients[1] as unknown as { receive(raw: unknown, mode: string, expectedSender: string): Promise<void> }).receive({ ...wire, mode: "DIRECT" }, "DIRECT", A);
    expect(stores[1].rows).toHaveLength(1);
    expect(logs.some((r) => r.includes("receive rejected"))).toBe(true);

    group = { ...group, archived: true, version: 3 };
    await expect(clients[2].sendGroup(group.id, "archived content")).rejects.toThrow("archived");
    expect(await forged.timeout(2000).emitWithAck("relay:send", { ...wire, receiverId: C })).toMatchObject({ ok: false });
    expect(stores[1].rows).toHaveLength(1);
  });

  it("fails closed when project authorization is unavailable", async () => {
    const signal = createSignaling(undefined, {
      group: async () => { throw new Error("API lost"); },
      project: async () => { throw new Error("API lost"); },
      forPeer: async () => [],
    });
    const url = await listen(signal);
    const socket = io(url, { transports: ["websocket"] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    await socket.timeout(2000).emitWithAck("peer:register", { peerId: "demo-a", identityProof: randomUUID() });
    expect(await socket.timeout(2000).emitWithAck("project:group", { projectId: PROJECT })).toMatchObject({ ok: false });
    expect(await socket.timeout(2000).emitWithAck("group:authorize", { groupId: randomUUID(), otherPeerId: "demo-b" })).toMatchObject({ ok: false });
  });
});
