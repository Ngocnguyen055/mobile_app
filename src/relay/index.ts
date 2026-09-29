import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server, type Socket } from "socket.io";
import { parseMessage, type Group } from "@ds01/shared";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.PEER_SECRET || process.env.PEER_SECRET.length < 32)
)
  throw new Error(
    "PEER_SECRET must be set to at least 32 characters in production",
  );
type Reply = (response: { ok: boolean; error?: string }) => void;
const SECRET = process.env.PEER_SECRET || "local-development-only-secret";
export function createRelay(
  httpServer: HttpServer = createServer(),
  groupLookup?: (id: string) => Promise<Group | null>,
) {
  const app = express();
  const connections = new Map<string, Socket>();
  httpServer.on("request", app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 8192,
  });
  app.get("/health", (_req, res) =>
    res.json({ service: "relay", peers: connections.size }),
  );
  const lookup =
    groupLookup ||
    (async (id: string) => {
      const url = process.env.SIGNAL_INTERNAL_URL || "http://127.0.0.1:4001";
      const response = await fetch(
        `${url}/internal/groups/${encodeURIComponent(id)}`,
        {
          headers: { "x-peer-secret": SECRET },
          signal: AbortSignal.timeout(2000),
        },
      );
      return response.ok ? ((await response.json()) as Group) : null;
    });
  io.use((socket, next) => {
    try {
      const data = jwt.verify(
        String(socket.handshake.auth.token || ""),
        SECRET,
      ) as jwt.JwtPayload;
      if (typeof data.sub !== "string") throw new Error("invalid subject");
      socket.data.peerId = data.sub;
      next();
    } catch {
      next(new Error("invalid peer token"));
    }
  });
  io.on("connection", (socket) => {
    const peerId = socket.data.peerId as string;
    const old = connections.get(peerId);
    old?.disconnect(true);
    connections.set(peerId, socket);
    console.log(`[relay] REGISTER ${peerId}`);
    socket.on("relay:send", async (input: unknown, reply: Reply) => {
      try {
        const msg = parseMessage(input);
        if (msg.senderId !== peerId || msg.mode !== "RELAY")
          throw new Error("sender or mode mismatch");
        if (msg.groupId) {
          const group = await lookup(msg.groupId);
          if (
            !group ||
            !group.members.includes(peerId) ||
            !group.members.includes(msg.receiverId)
          )
            throw new Error("group access denied");
        }
        const target = connections.get(msg.receiverId);
        if (!target) throw new Error("receiver offline");
        target.emit("relay:receive", msg);
        console.log(
          `[relay] FORWARD ${msg.messageId} ${peerId} -> ${msg.receiverId} ${msg.type}`,
        );
        reply?.({ ok: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "invalid message";
        console.log(`[relay] REJECT ${peerId}: ${message}`);
        reply?.({ ok: false, error: message });
      }
    });
    socket.on("disconnect", () => {
      if (connections.get(peerId)?.id === socket.id) {
        connections.delete(peerId);
        console.log(`[relay] DISCONNECT ${peerId}`);
      }
    });
  });
  return {
    app,
    io,
    connections,
    httpServer,
    close: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
if (process.argv[1]?.endsWith("index.ts")) {
  const server = createRelay();
  server.httpServer.listen(
    Number(process.env.RELAY_PORT || 4002),
    "0.0.0.0",
    () => console.log("[relay] listening"),
  );
}
