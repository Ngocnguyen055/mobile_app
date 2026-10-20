import { fileURLToPath } from "node:url";
import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import { config as loadEnv } from "dotenv";
import { Server } from "socket.io";
import type { Group } from "@ds01/shared";
import { createHttpDirectChatAuthorizer } from "./directChatAuthorization.ts";
import { registerGroupHandlers } from "./groupHandlers.ts";
import { startSignalingMaintenance } from "./maintenance.ts";
import { registerPeerHandlers } from "./peerHandlers.ts";
import {
  httpProjectDirectory,
  type ProjectDirectory,
} from "./projectDirectory.ts";
import type { DirectChatAuthorizer, SignalingContext } from "./types.ts";
import { registerWebRtcHandlers } from "./webrtcHandlers.ts";

export type { DirectChatAuthorizer } from "./types.ts";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const HEARTBEAT_FRESH_MS = 30_000;
const PEER_SECRET = process.env.PEER_SECRET || "local-development-only-secret";
const JWT_SECRET = process.env.JWT_SECRET || "local-development-only-secret";

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

/** Builds the signaling control plane without starting a TCP listener. */
export function createSignaling(
  httpServer: HttpServer = createServer(),
  directory: ProjectDirectory = httpProjectDirectory(),
  authorizeDirect: DirectChatAuthorizer = createHttpDirectChatAuthorizer(
    PEER_SECRET,
  ),
) {
  const app = express();
  const peers: SignalingContext["peers"] = new Map();
  const groups = new Map<string, Group>();
  const demoSecrets = new Map<string, string>();
  httpServer.on("request", app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 16_384,
  });

  const publishGroup = (group: Group) => {
    const before = groups.get(group.id);
    if (before && before.version > group.version) return;
    groups.set(group.id, group);
    for (const peerId of new Set([
      ...(before?.members || []),
      ...group.members,
    ]))
      peers.get(peerId)?.socket.emit("group:update", group);
  };
  const currentGroup = async (id: string) => {
    const cached = groups.get(id);
    if (cached && !cached.projectId) return cached;
    const current = await directory.group(id);
    if (current) publishGroup(current);
    return current;
  };
  const publishPresence = () =>
    io.to("registered-peers").emit("presence", [...peers.keys()]);

  const context: SignalingContext = {
    io,
    peers,
    groups,
    demoSecrets,
    directory,
    authorizeDirect,
    peerSecret: PEER_SECRET,
    jwtSecret: JWT_SECRET,
    heartbeatFreshMs: HEARTBEAT_FRESH_MS,
    publishGroup,
    currentGroup,
    publishPresence,
    peerFor: (socket) => socket.data.peerId as string | undefined,
  };

  app.get("/health", (_req, res) =>
    res.json({ service: "signaling", peers: peers.size }),
  );
  app.get("/internal/groups/:id", async (req, res) => {
    if (req.header("x-peer-secret") !== PEER_SECRET) return res.sendStatus(403);
    try {
      const group = await currentGroup(req.params.id);
      return group ? res.json(group) : res.sendStatus(404);
    } catch {
      return res
        .status(503)
        .json({ error: "project authorization unavailable" });
    }
  });

  io.on("connection", (socket) => {
    registerPeerHandlers(socket, context);
    registerGroupHandlers(socket, context);
    registerWebRtcHandlers(socket, context);
  });
  const stopMaintenance = startSignalingMaintenance(context);

  return {
    app,
    io,
    peers,
    groups,
    httpServer,
    close: async () => {
      stopMaintenance();
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
