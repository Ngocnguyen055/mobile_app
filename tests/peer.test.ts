import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import {
  PeerClient,
  type PeerConfig,
  type ChatStore,
  type StoredMessage,
  type MessageStatus,
} from "../src/shared/index.ts";
import { createSignaling } from "../src/signaling/index.ts";
import { createRelay } from "../src/relay/index.ts";

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
