import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import {
  PeerClient,
  DirectChatService,
  type PeerConfig,
  type ChatStore,
  type StoredMessage,
  type MessageStatus,
} from "../src/shared/index.ts";
import { createSignaling } from "../src/signaling/index.ts";
import { createRelay } from "../src/relay/index.ts";
import { WebStore } from "../src/web-peer/store.ts";

class MemoryStore implements ChatStore {
  rows: StoredMessage[] = [];
  async put(row: StoredMessage) {
    const i = this.rows.findIndex(
      (r) =>
        r.message.messageId === row.message.messageId &&
        r.message.senderId === row.message.senderId &&
        r.message.receiverId === row.message.receiverId,
    );
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
  }
  async mark(id: string, receiver: string, status: MessageStatus) {
    for (const row of this.rows)
      if (row.message.messageId === id && row.message.receiverId === receiver)
        row.status = status;
  }
  async has(id: string, sender: string) {
    return this.rows.some(
      (r) => r.message.messageId === id && r.message.senderId === sender,
    );
  }
  async list() {
    return this.rows;
  }
}
class DeadRTC {
  signalingState = "stable";
  connectionState = "new";
  remoteDescription: unknown = null;
  onicecandidate: unknown;
  onconnectionstatechange: unknown;
  ondatachannel: unknown;
  createDataChannel() {
    return { readyState: "connecting", send() {} };
  }
  async createOffer() {
    return { type: "offer", sdp: "fake" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "fake" };
  }
  async setLocalDescription(description: { type: string }) {
    this.signalingState =
      description.type === "offer" ? "have-local-offer" : "stable";
  }
  async setRemoteDescription(description: unknown) {
    this.remoteDescription = description;
    this.signalingState = "stable";
  }
  async addIceCandidate() {}
  close() {
    this.connectionState = "closed";
  }
}
const clients: PeerClient[] = [];
const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients.length = 0;
  for (const s of servers.reverse()) await s.close();
  servers.length = 0;
  vi.unstubAllGlobals();
});
const listen = async (server: {
  httpServer: import("node:http").Server;
  close: () => Promise<void>;
}) => {
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.httpServer.listen(0, "127.0.0.1", resolve),
  );
  return `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
};
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 50; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("condition timeout");
}
describe("peer delivery across real Socket.IO processes", () => {
  it("keeps personal histories separate from group fan-out, restores them, and reports an offline recipient", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    const signal = createSignaling();
    const signalUrl = await listen(signal);
    const relay = createRelay(undefined, async (id) => signal.groups.get(id) || null);
    const relayUrl = await listen(relay);
    const stores = ["peer-a", "peer-b", "peer-c"].map(id => new WebStore(id));
    const logs: string[] = [];
    for (const [index, id] of ["peer-a", "peer-b", "peer-c"].entries()) {
      const client = new PeerClient({
        peerId: id, identityProof: randomUUID() + randomUUID(), signalUrl, relayUrl,
        rtc: DeadRTC as unknown as PeerConfig["rtc"], store: stores[index],
        forceRelay: true, ackTimeoutMs: 100,
        onEvent: event => { if (event.kind === "log") logs.push(event.text || ""); },
      });
      clients.push(client);
      await client.connect();
    }
    await waitFor(() => logs.filter(line => line.includes("relay connected")).length === 3);
    const personal = new DirectChatService(clients[0], stores[0]);
    expect((await personal.open("peer-b")).peer.online).toBe(true);
    await personal.send("peer-b", "personal A to B");
    await clients[1].send("peer-a", "personal B to A with null group", null);
    const group = await clients[0].createGroup(["peer-b", "peer-c"]);
    await waitFor(() => clients.every(client => client.getGroups().some(row => row.id === group.id)));
    const [, groupResult] = await Promise.all([
      personal.send("peer-b", "personal while group sends"),
      clients[0].sendGroup(group.id, "group at the same time"),
    ]);
    expect(groupResult).toEqual({ "peer-b": "fulfilled", "peer-c": "fulfilled" });
    const history = await personal.history("peer-b");
    expect(new Set(history.map(row => row.message.body))).toEqual(new Set([
      "personal A to B", "personal B to A with null group", "personal while group sends",
    ]));
    expect(history.find(row => row.message.body === "personal A to B")?.status).toBe("delivered");
    expect(history.find(row => row.message.body === "personal B to A with null group")?.status).toBe("received");
    expect(history.find(row => row.message.body === "personal while group sends")?.status).toBe("delivered");
    expect(history.map(row => row.message.timestamp)).toEqual(
      [...history].map(row => row.message.timestamp).sort((a, b) => a - b),
    );
    expect(history.every(row => row.message.groupId == null)).toBe(true);
    expect(await new WebStore("peer-a").listDirect("peer-b")).toEqual(history);
    expect(await stores[2].listDirect("peer-a")).toEqual([]);
    expect((await stores[0].list()).filter(row => row.message.groupId === group.id)).toHaveLength(2);
    expect((await stores[2].list()).map(row => row.message.body)).toEqual(["group at the same time"]);
    clients[1].close();
    await waitFor(() => !signal.peers.has("peer-b"));
    expect((await personal.open("peer-b")).peer.online).toBe(false);
    expect(await personal.history("peer-b")).toEqual(history);
    await expect(personal.send("peer-b", "cannot deliver offline")).rejects.toThrow("delivery failed");
    const failed = (await personal.history("peer-b")).find(row => row.message.body === "cannot deliver offline");
    expect(failed?.status).toBe("failed");
    await expect(personal.send("peer-a", "self")).rejects.toThrow("yourself");
    await expect(clients[0].lookupPeer("../invalid")).rejects.toThrow();
    clients[0].close();
    await expect(clients[0].lookupPeer("peer-c")).rejects.toThrow("signaling unavailable");
  });
  it("times out a simulated dead DataChannel, falls back to RELAY, gets receiver ACK, and deduplicates", async () => {
    const signal = createSignaling();
    const signalUrl = await listen(signal);
    const relay = createRelay(
      undefined,
      async (id) => signal.groups.get(id) || null,
    );
    const relayUrl = await listen(relay);
    const logs: string[] = [];
    const stores = [new MemoryStore(), new MemoryStore()];
    for (const [i, id] of ["peer-a", "peer-b"].entries()) {
      const client = new PeerClient({
        peerId: id,
        identityProof: randomUUID() + randomUUID(),
        signalUrl,
        relayUrl,
        rtc: DeadRTC as unknown as PeerConfig["rtc"],
        store: stores[i],
        directTimeoutMs: 150,
        ackTimeoutMs: 300,
        onEvent: (event) => {
          if (event.kind === "log") logs.push(`${id}: ${event.text}`);
        },
      });
      clients.push(client);
      await client.connect();
    }
    await waitFor(
      () =>
        logs.filter((line) => line.includes("relay connected")).length === 2,
    );
    await clients[0].send("peer-b", "fallback message");
    expect(logs.some((line) => line.includes("DIRECT timeout"))).toBe(true);
    expect(stores[0].rows).toHaveLength(1);
    expect(stores[0].rows[0].status).toBe("delivered");
    expect(stores[0].rows[0].message.mode).toBe("RELAY");
    expect(stores[1].rows).toHaveLength(1);
    expect(stores[1].rows[0].status).toBe("received");
    const duplicate = stores[0].rows[0].message;
    const token = (await import("jsonwebtoken")).default.sign(
      { sub: "peer-a" },
      process.env.PEER_SECRET || "local-development-only-secret",
    );
    const { io } = await import("socket.io-client");
    const socket = io(relayUrl, { auth: { token } });
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    await socket.timeout(3000).emitWithAck("relay:send", duplicate);
    await new Promise((resolve) => setTimeout(resolve, 80));
    socket.disconnect();
    expect(stores[1].rows).toHaveLength(1);
  });
  it("tracks group ACK separately for two recipients", async () => {
    const signal = createSignaling();
    const signalUrl = await listen(signal);
    const relay = createRelay(
      undefined,
      async (id) => signal.groups.get(id) || null,
    );
    const relayUrl = await listen(relay);
    const stores = [new MemoryStore(), new MemoryStore(), new MemoryStore()];
    const logs: string[] = [];
    for (const [i, id] of ["peer-a", "peer-b", "peer-c"].entries()) {
      const client = new PeerClient({
        peerId: id,
        identityProof: randomUUID() + randomUUID(),
        signalUrl,
        relayUrl,
        rtc: DeadRTC as unknown as PeerConfig["rtc"],
        store: stores[i],
        forceRelay: true,
        onEvent: (event) => {
          if (event.kind === "log") logs.push(event.text || "");
        },
      });
      clients.push(client);
      await client.connect();
    }
    await waitFor(
      () =>
        logs.filter((line) => line.includes("relay connected")).length === 3,
    );
    const group = await clients[0].createGroup(["peer-b", "peer-c"]);
    await waitFor(() =>
      clients.every((c) => c.getGroups().some((g) => g.id === group.id)),
    );
    expect(await clients[0].sendGroup(group.id, "hello team")).toEqual({
      "peer-b": "fulfilled",
      "peer-c": "fulfilled",
    });
    expect(stores[0].rows.map((r) => r.status)).toEqual([
      "delivered",
      "delivered",
    ]);
    expect(stores[1].rows[0].message.body).toBe("hello team");
    expect(stores[2].rows[0].message.body).toBe("hello team");
  });
});
