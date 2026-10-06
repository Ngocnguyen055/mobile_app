import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server, type Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  peerIdSchema,
  type Group,
  type PeerDiscovery,
} from "@ds01/shared";
import { httpProjectDirectory, type ProjectDirectory } from "./projectDirectory.ts";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    !process.env.PEER_SECRET ||
    process.env.PEER_SECRET.length < 32)
)
  throw new Error(
    "JWT_SECRET and PEER_SECRET must each be at least 32 characters in production",
  );
type Peer = { socket: Socket; lastSeen: number };
type Reply = (response: {
  ok: boolean;
  error?: string;
  token?: string;
  peers?: string[];
  groups?: Group[];
  group?: Group;
  peer?: PeerDiscovery;
}) => void;
const HEARTBEAT_FRESH_MS = 30_000;
const PEER_SECRET = process.env.PEER_SECRET || "local-development-only-secret";
const JWT_SECRET = process.env.JWT_SECRET || "local-development-only-secret";
export function createSignaling(
  httpServer: HttpServer = createServer(),
  directory: ProjectDirectory = httpProjectDirectory(),
) {
  const app = express();
  const peers = new Map<string, Peer>();
  const groups = new Map<string, Group>();
  const demoSecrets = new Map<string, string>();
  httpServer.on("request", app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 16_384,
  });
  app.get("/health", (_req, res) =>
    res.json({ service: "signaling", peers: peers.size }),
  );
  const publishGroup = (group: Group) => {
    const before = groups.get(group.id);
    if (before && before.version > group.version) return;
    groups.set(group.id, group);
    for (const id of new Set([...(before?.members || []), ...group.members]))
      peers.get(id)?.socket.emit("group:update", group);
  };
  const currentGroup = async (id: string) => {
    const cached = groups.get(id);
    if (cached && !cached.projectId) return cached;
    const current = await directory.group(id);
    if (current) publishGroup(current);
    return current;
  };
  app.get("/internal/groups/:id", async (req, res) => {
    if (req.header("x-peer-secret") !== PEER_SECRET) return res.sendStatus(403);
    try {
      const group = await currentGroup(req.params.id);
      return group ? res.json(group) : res.sendStatus(404);
    } catch {
      return res.status(503).json({ error: "project authorization unavailable" });
    }
  });
  const publishPresence = () =>
    io.to("registered-peers").emit("presence", [...peers.keys()]);
  const peerFor = (socket: Socket) => socket.data.peerId as string | undefined;
  io.on("connection", (socket) => {
    socket.on("peer:register", async (input: unknown, reply: Reply) => {
      if (typeof reply !== "function") return;
      const { peerId: requestedId, identityProof } = (input || {}) as Record<
        string,
        unknown
      >;
      const parsed = peerIdSchema.safeParse(requestedId);
      if (!parsed.success)
        return reply({ ok: false, error: "invalid peer ID" });
      const peerId = parsed.data;
      if (typeof identityProof !== "string")
        return reply({ ok: false, error: "identity proof required" });
      if (/^[a-f\d]{24}$/i.test(peerId)) {
        try {
          const token = jwt.verify(identityProof, JWT_SECRET) as jwt.JwtPayload;
          if (token.sub !== peerId) throw new Error("wrong account");
        } catch {
          return reply({ ok: false, error: "invalid account token" });
        }
      } else {
        if (identityProof.length < 16)
          return reply({ ok: false, error: "demo peer secret too short" });
        const hash = createHash("sha256").update(identityProof).digest("hex");
        if (demoSecrets.has(peerId) && demoSecrets.get(peerId) !== hash)
          return reply({
            ok: false,
            error: "peer ID belongs to another demo peer",
          });
        demoSecrets.set(peerId, hash);
      }
      if (peers.has(peerId) && peers.get(peerId)?.socket.id !== socket.id)
        return reply({ ok: false, error: "peer ID already online" });
      const previous = peerFor(socket);
      if (previous && previous !== peerId) peers.delete(previous);
      socket.data.peerId = peerId;
      peers.set(peerId, { socket, lastSeen: Date.now() });
      void socket.join("registered-peers");
      if (/^[a-f\d]{24}$/i.test(peerId)) {
        try {
          for (const group of await directory.forPeer(peerId)) publishGroup(group);
        } catch {
          console.warn("[signal] project directory unavailable; project chat will fail closed");
        }
      }
      const token = jwt.sign({ sub: peerId }, PEER_SECRET, {
        expiresIn: "12h",
      });
      console.log(`[signal] REGISTER ${peerId}`);
      reply({
        ok: true,
        token,
        peers: [...peers.keys()],
        groups: [...groups.values()].filter((g) => g.members.includes(peerId)),
      });
      socket.emit("peer:ready");
      publishPresence();
    });
    socket.on("peer:heartbeat", () => {
      const id = peerFor(socket);
      if (id && peers.get(id)?.socket.id === socket.id)
        peers.get(id)!.lastSeen = Date.now();
    });
    socket.on("project:group", async (input: unknown, reply: Reply) => {
      if (typeof reply !== "function") return;
      const actor = peerFor(socket);
      if (!actor || peers.get(actor)?.socket.id !== socket.id)
        return reply({ ok: false, error: "registration required" });
      const id = (input as { projectId?: unknown } | null)?.projectId;
      if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id))
        return reply({ ok: false, error: "invalid project ID" });
      try {
        const group = await directory.project(id);
        if (!group || !group.members.includes(actor))
          return reply({ ok: false, error: "project group access denied" });
        publishGroup(group);
        reply({ ok: true, group });
      } catch {
        reply({ ok: false, error: "project authorization unavailable" });
      }
    });
    socket.on("group:authorize", async (input: unknown, reply: Reply) => {
      if (typeof reply !== "function") return;
      const actor = peerFor(socket);
      if (!actor || peers.get(actor)?.socket.id !== socket.id)
        return reply({ ok: false, error: "registration required" });
      const value = input as { groupId?: unknown; otherPeerId?: unknown } | null;
      if (!value || typeof value.groupId !== "string" ||
        !/^[\da-f-]{36}$/i.test(value.groupId) ||
        !peerIdSchema.safeParse(value.otherPeerId).success)
        return reply({ ok: false, error: "invalid group authorization" });
      try {
        const group = await currentGroup(value.groupId);
        if (!group || group.archived || !group.members.includes(actor) ||
          !group.members.includes(String(value.otherPeerId)))
          return reply({ ok: false, error: "group access denied or project archived" });
        reply({ ok: true, group });
      } catch {
        reply({ ok: false, error: "project authorization unavailable" });
      }
    });
    socket.on("peer:list", (reply: Reply) => {
      if (typeof reply !== "function") return;
      const requesterId = peerFor(socket);
      if (!requesterId || peers.get(requesterId)?.socket.id !== socket.id)
        return reply({ ok: false, error: "registration required" });
      reply({ ok: true, peers: [...peers.keys()] });
    });
    socket.on("peer:lookup", (input: unknown, reply: Reply) => {
      if (typeof reply !== "function") return;
      const requesterId = peerFor(socket);
      if (!requesterId || peers.get(requesterId)?.socket.id !== socket.id)
        return reply({ ok: false, error: "registration required" });
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length !== 1 ||
        !Object.hasOwn(input, "peerId")
      )
        return reply({ ok: false, error: "invalid peer lookup" });
      const parsed = peerIdSchema.safeParse(
        (input as { peerId?: unknown }).peerId,
      );
      if (!parsed.success)
        return reply({ ok: false, error: "invalid peer lookup" });
      const peerId = parsed.data;
      const target = peers.get(peerId);
      if (
        !target ||
        !target.socket.connected ||
        Date.now() - target.lastSeen > HEARTBEAT_FRESH_MS
      )
        return reply({
          ok: true,
          peer: {
            peerId,
            online: false,
            lastSeen: null,
            connection: null,
          },
        });
      return reply({
        ok: true,
        peer: {
          peerId,
          online: true,
          lastSeen: target.lastSeen,
          connection: {
            transport: "webrtc-datachannel",
            signaling: "socket.io",
            relay: "socket.io",
          },
        },
      });
    });
    socket.on("signal:send", (input: unknown, reply: Reply) => {
      const senderId = peerFor(socket);
      const value = input as {
        to?: unknown;
        kind?: unknown;
        data?: unknown;
      } | null;
      if (
        !senderId ||
        !value ||
        !peerIdSchema.safeParse(value.to).success ||
        !["request", "offer", "answer", "ice"].includes(String(value.kind)) ||
        JSON.stringify(value).length > 12_000
      )
        return reply?.({ ok: false, error: "invalid signaling data" });
      const target = peers.get(value.to as string);
      if (!target) return reply?.({ ok: false, error: "peer offline" });
      target.socket.emit("signal:receive", {
        from: senderId,
        kind: value.kind,
        data: value.data,
      });
      console.log(`[signal] ${value.kind} ${senderId} -> ${value.to}`);
      reply?.({ ok: true });
    });
    socket.on("group:create", (input: unknown, reply: Reply) => {
      const ownerId = peerFor(socket);
      const members = (input as { members?: unknown })?.members;
      if (
        !ownerId ||
        !Array.isArray(members) ||
        members.length > 15 ||
        !members.every((v) => peerIdSchema.safeParse(v).success)
      )
        return reply?.({ ok: false, error: "invalid members" });
      const group: Group = {
        id: randomUUID(),
        ownerId,
        members: [...new Set([ownerId, ...members])],
        version: 1,
      };
      groups.set(group.id, group);
      group.members.forEach((id) =>
        peers.get(id)?.socket.emit("group:update", group),
      );
      console.log(
        `[signal] GROUP ${group.id} members=${group.members.join(",")}`,
      );
      reply?.({ ok: true, group });
    });
    socket.on("group:change", (input: unknown, reply: Reply) => {
      const actor = peerFor(socket);
      const { groupId, memberId, action, version } = (input || {}) as Record<
        string,
        unknown
      >;
      const group = groups.get(String(groupId));
      if (group?.projectId)
        return reply?.({ ok: false, error: "manage project members through REST API" });
      if (
        !actor ||
        !group ||
        !group.members.includes(actor) ||
        group.version !== version ||
        !peerIdSchema.safeParse(memberId).success ||
        !["add", "remove"].includes(String(action))
      )
        return reply?.({
          ok: false,
          error: "invalid group change or stale version",
        });
      if (action === "add" && actor !== group.ownerId)
        return reply?.({ ok: false, error: "only owner can add member" });
      if (action === "remove" && actor !== group.ownerId && actor !== memberId)
        return reply?.({ ok: false, error: "not allowed" });
      const before = [...group.members];
      group.members =
        action === "add"
          ? [...new Set([...group.members, String(memberId)])]
          : group.members.filter((id) => id !== memberId);
      group.version++;
      [...new Set([...before, ...group.members])].forEach((id) =>
        peers.get(id)?.socket.emit("group:update", group),
      );
      console.log(`[signal] GROUP_CHANGE ${group.id} v${group.version}`);
      reply?.({ ok: true, group });
    });
    socket.on("disconnect", () => {
      const id = peerFor(socket);
      if (id && peers.get(id)?.socket.id === socket.id) {
        peers.delete(id);
        console.log(`[signal] DISCONNECT ${id}`);
        publishPresence();
      }
    });
  });
  const timer = setInterval(() => {
    for (const [id, peer] of peers)
      if (Date.now() - peer.lastSeen > HEARTBEAT_FRESH_MS) {
        peers.delete(id);
        peer.socket.disconnect(true);
        console.log(`[signal] TIMEOUT ${id}`);
        publishPresence();
      }
  }, 5_000);
  timer.unref();
  let synchronizing = false;
  const projectTimer = setInterval(async () => {
    if (synchronizing) return;
    synchronizing = true;
    try {
      const accountIds = [...peers.keys()].filter((id) => /^[a-f\d]{24}$/i.test(id));
      for (const peerId of accountIds)
        for (const group of await directory.forPeer(peerId)) publishGroup(group);
      for (const group of [...groups.values()].filter((g) => g.projectId)) {
        const latest = await directory.group(group.id);
        if (latest) publishGroup(latest);
      }
    } catch {
      // Authorization always queries current state and fails closed if API is down.
    } finally {
      synchronizing = false;
    }
  }, 2000);
  projectTimer.unref();
  return {
    app,
    io,
    peers,
    groups,
    httpServer,
    close: async () => {
      clearInterval(timer);
      clearInterval(projectTimer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
if (process.argv[1]?.endsWith("index.ts")) {
  const server = createSignaling();
  server.httpServer.listen(
    Number(process.env.SIGNAL_PORT || 4001),
    "0.0.0.0",
    () => console.log("[signal] listening"),
  );
}
