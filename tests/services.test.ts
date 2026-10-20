import { afterEach, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { createSignaling } from "../src/signaling/index.ts";
import { createRelay } from "../src/relay/index.ts";

type Service =
  ReturnType<typeof createSignaling> | ReturnType<typeof createRelay>;
const services: Service[] = [];
const sockets: Socket[] = [];
async function start<T extends Service>(service: T) {
  services.push(service);
  await new Promise<void>((resolve) =>
    service.httpServer.listen(0, "127.0.0.1", resolve),
  );
  return `http://127.0.0.1:${(service.httpServer.address() as AddressInfo).port}`;
}
async function connect(url: string, auth?: Record<string, string>) {
  const socket = io(url, { transports: ["websocket"], auth });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}
async function register(
  url: string,
  peerId: string,
  identityProof = randomUUID() + randomUUID(),
) {
  const signal = await connect(url);
  const result = await signal
    .timeout(3000)
    .emitWithAck("peer:register", { peerId, identityProof });
  expect(result.ok).toBe(true);
  return { signal, token: result.token as string };
}
afterEach(async () => {
  vi.restoreAllMocks();
  sockets.forEach((s) => s.disconnect());
  sockets.length = 0;
  for (const service of services.splice(0)) await service.close();
});
describe("signaling and relay integration", () => {
  it("looks up fresh peers, refreshes heartbeat, and reports disconnects without leaking connection internals", async () => {
    const signal = createSignaling();
    const url = await start(signal);
    const a = await register(url, "peer-a");
    const b = await register(url, "peer-b");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    signal.peers.get("peer-b")!.lastSeen = now - 1;

    expect(
      await a.signal
        .timeout(3000)
        .emitWithAck("peer:lookup", { peerId: "peer-b" }),
    ).toEqual({
      ok: true,
      peer: {
        peerId: "peer-b",
        online: true,
        lastSeen: now - 1,
        connection: {
          transport: "webrtc-datachannel",
          signaling: "socket.io",
          relay: "socket.io",
        },
      },
    });

    signal.peers.get("peer-b")!.lastSeen = now - 30_001;
    b.signal.emit("peer:heartbeat");
    expect(
      await b.signal
        .timeout(3000)
        .emitWithAck("peer:lookup", { peerId: "peer-b" }),
    ).toMatchObject({
      ok: true,
      peer: { peerId: "peer-b", online: true, lastSeen: now },
    });

    const disconnected = new Promise<void>((resolve) => {
      const onPresence = (peerIds: string[]) => {
        if (!peerIds.includes("peer-b")) {
          a.signal.off("presence", onPresence);
          resolve();
        }
      };
      a.signal.on("presence", onPresence);
    });
    b.signal.disconnect();
    await disconnected;
    expect(
      await a.signal
        .timeout(3000)
        .emitWithAck("peer:lookup", { peerId: "peer-b" }),
    ).toEqual({
      ok: true,
      peer: {
        peerId: "peer-b",
        online: false,
        lastSeen: null,
        connection: null,
      },
    });
  });

  it("requires current registration, validates lookup input strictly, and hides stale timestamps", async () => {
    const signal = createSignaling();
    const url = await start(signal);
    const anonymous = await connect(url);
    const anonymousPresence = vi.fn();
    anonymous.on("presence", anonymousPresence);
    expect(
      await anonymous
        .timeout(3000)
        .emitWithAck("peer:lookup", { peerId: "peer-b" }),
    ).toEqual({ ok: false, error: "registration required" });
    expect(await anonymous.timeout(3000).emitWithAck("peer:list")).toEqual({
      ok: false,
      error: "registration required",
    });

    const a = await register(url, "peer-a");
    await register(url, "peer-b");
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(anonymousPresence).not.toHaveBeenCalled();
    for (const input of [
      null,
      {},
      { peerId: "../bad" },
      { peerId: "peer-b", extra: true },
    ]) {
      expect(
        await a.signal.timeout(3000).emitWithAck("peer:lookup", input),
      ).toEqual({ ok: false, error: "invalid peer lookup" });
    }

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    signal.peers.get("peer-b")!.lastSeen = now - 30_001;
    expect(
      await a.signal
        .timeout(3000)
        .emitWithAck("peer:lookup", { peerId: "peer-b" }),
    ).toEqual({
      ok: true,
      peer: {
        peerId: "peer-b",
        online: false,
        lastSeen: null,
        connection: null,
      },
    });
    expect(
      await a.signal
        .timeout(3000)
        .emitWithAck("peer:lookup", { peerId: "peer-unknown" }),
    ).toEqual({
      ok: true,
      peer: {
        peerId: "peer-unknown",
        online: false,
        lastSeen: null,
        connection: null,
      },
    });
  });

  it("denies discovery and relay delivery when either account blocks direct chat", async () => {
    const aId = "000000000000000000000001";
    const bId = "000000000000000000000002";
    const jwtSecret = process.env.JWT_SECRET || "local-development-only-secret";
    const authorizer = vi.fn().mockResolvedValue(false);
    const signal = createSignaling(
      undefined,
      {
        group: async () => null,
        project: async () => null,
        forPeer: async () => [],
      },
      authorizer,
    );
    const signalUrl = await start(signal);
    const a = await register(signalUrl, aId, jwt.sign({ sub: aId }, jwtSecret));
    const b = await register(signalUrl, bId, jwt.sign({ sub: bId }, jwtSecret));
    expect(
      await a.signal.timeout(3000).emitWithAck("peer:lookup", { peerId: bId }),
    ).toEqual({ ok: false, error: "direct chat blocked" });

    const groupId = randomUUID();
    const relay = createRelay(
      undefined,
      async (id) =>
        id === groupId
          ? {
              id: groupId,
              ownerId: aId,
              members: [aId, bId],
              version: 1,
            }
          : null,
      authorizer,
    );
    const relayUrl = await start(relay);
    const ar = await connect(relayUrl, { token: a.token });
    const br = await connect(relayUrl, { token: b.token });
    const response = await ar.timeout(3000).emitWithAck("relay:send", {
      messageId: randomUUID(),
      sessionId: randomUUID(),
      senderId: aId,
      receiverId: bId,
      type: "text",
      timestamp: Date.now(),
      body: "blocked message",
      mode: "RELAY",
      attempt: 1,
      sequence: 1,
    });
    expect(response).toEqual({ ok: false, error: "direct chat blocked" });
    expect(authorizer).toHaveBeenCalledWith(aId, bId);

    const receivedGroup = new Promise<unknown>((resolve) =>
      br.once("relay:receive", resolve),
    );
    const groupResponse = await ar.timeout(3000).emitWithAck("relay:send", {
      messageId: randomUUID(),
      sessionId: groupId,
      senderId: aId,
      receiverId: bId,
      groupId,
      type: "text",
      timestamp: Date.now(),
      body: "group message remains allowed",
      mode: "RELAY",
      attempt: 1,
      sequence: 1,
    });
    expect(groupResponse).toEqual({ ok: true });
    await expect(receivedGroup).resolves.toMatchObject({ groupId });
  });

  it("discovers three peers, rejects duplicate identity, and resolves concurrent group edits by version", async () => {
    const signal = createSignaling();
    const url = await start(signal);
    const a = await register(url, "peer-a");
    const b = await register(url, "peer-b");
    await register(url, "peer-c");
    expect(
      (await a.signal.timeout(3000).emitWithAck("peer:list")).peers,
    ).toEqual(expect.arrayContaining(["peer-a", "peer-b", "peer-c"]));
    const duplicate = await connect(url);
    expect(
      (
        await duplicate.timeout(3000).emitWithAck("peer:register", {
          peerId: "peer-a",
          identityProof: randomUUID() + randomUUID(),
        })
      ).ok,
    ).toBe(false);
    const created = await a.signal
      .timeout(3000)
      .emitWithAck("group:create", { members: ["peer-b", "peer-c"] });
    expect(created.ok).toBe(true);
    const id = created.group.id as string;
    const [first, second] = await Promise.all([
      a.signal.timeout(3000).emitWithAck("group:change", {
        groupId: id,
        memberId: "peer-c",
        action: "remove",
        version: 1,
      }),
      b.signal.timeout(3000).emitWithAck("group:change", {
        groupId: id,
        memberId: "peer-b",
        action: "remove",
        version: 1,
      }),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(signal.groups.get(id)?.version).toBe(2);
  });
  it("forwards only to target, rejects sender spoof/oversize/group outsider, and detects disconnect", async () => {
    const signal = createSignaling();
    const signalUrl = await start(signal);
    const a = await register(signalUrl, "peer-a");
    const b = await register(signalUrl, "peer-b");
    const c = await register(signalUrl, "peer-c");
    const group = (
      await a.signal
        .timeout(3000)
        .emitWithAck("group:create", { members: ["peer-b"] })
    ).group;
    const relay = createRelay(
      undefined,
      async (id) => signal.groups.get(id) || null,
    );
    const relayUrl = await start(relay);
    const ar = await connect(relayUrl, { token: a.token });
    const br = await connect(relayUrl, { token: b.token });
    const cr = await connect(relayUrl, { token: c.token });
    const envelope = {
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
    };
    const received = new Promise<unknown>((resolve) =>
      br.once("relay:receive", resolve),
    );
    expect(
      (await ar.timeout(3000).emitWithAck("relay:send", envelope)).ok,
    ).toBe(true);
    await expect(received).resolves.toMatchObject({
      messageId: envelope.messageId,
      body: "hello",
    });
    expect(
      (
        await ar
          .timeout(3000)
          .emitWithAck("relay:send", { ...envelope, senderId: "peer-c" })
      ).ok,
    ).toBe(false);
    expect(
      (
        await ar
          .timeout(3000)
          .emitWithAck("relay:send", { ...envelope, body: "x".repeat(5000) })
      ).ok,
    ).toBe(false);
    expect(
      (
        await cr.timeout(3000).emitWithAck("relay:send", {
          ...envelope,
          senderId: "peer-c",
          groupId: group.id,
        })
      ).ok,
    ).toBe(false);
    br.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      (
        await ar
          .timeout(3000)
          .emitWithAck("relay:send", { ...envelope, messageId: randomUUID() })
      ).error,
    ).toBe("receiver offline");
  });
});
