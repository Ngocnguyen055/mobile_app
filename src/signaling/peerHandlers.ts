import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { peerDiscoverySchema, peerIdSchema } from "@ds01/shared";
import { ACCOUNT_PEER_ID } from "./directChatAuthorization.ts";
import type { SignalingContext, SignalingReply } from "./types.ts";

function isRegistered(socket: Socket, context: SignalingContext) {
  const peerId = context.peerFor(socket);
  return !!peerId && context.peers.get(peerId)?.socket.id === socket.id;
}

/** Registration, heartbeat, discovery and disconnect handlers. */
export function registerPeerHandlers(
  socket: Socket,
  context: SignalingContext,
) {
  socket.on("peer:register", async (input: unknown, reply: SignalingReply) => {
    if (typeof reply !== "function") return;
    const { peerId: requestedId, identityProof } = (input || {}) as Record<
      string,
      unknown
    >;
    const parsed = peerIdSchema.safeParse(requestedId);
    if (!parsed.success) return reply({ ok: false, error: "invalid peer ID" });
    const peerId = parsed.data;
    if (typeof identityProof !== "string")
      return reply({ ok: false, error: "identity proof required" });

    if (ACCOUNT_PEER_ID.test(peerId)) {
      try {
        const token = jwt.verify(
          identityProof,
          context.jwtSecret,
        ) as jwt.JwtPayload;
        if (token.sub !== peerId) throw new Error("wrong account");
      } catch {
        return reply({ ok: false, error: "invalid account token" });
      }
    } else {
      if (identityProof.length < 16)
        return reply({ ok: false, error: "demo peer secret too short" });
      const hash = createHash("sha256").update(identityProof).digest("hex");
      if (
        context.demoSecrets.has(peerId) &&
        context.demoSecrets.get(peerId) !== hash
      )
        return reply({
          ok: false,
          error: "peer ID belongs to another demo peer",
        });
      context.demoSecrets.set(peerId, hash);
    }

    if (
      context.peers.has(peerId) &&
      context.peers.get(peerId)?.socket.id !== socket.id
    )
      return reply({ ok: false, error: "peer ID already online" });
    const previous = context.peerFor(socket);
    if (previous && previous !== peerId) context.peers.delete(previous);
    socket.data.peerId = peerId;
    context.peers.set(peerId, { socket, lastSeen: Date.now() });
    void socket.join("registered-peers");

    if (ACCOUNT_PEER_ID.test(peerId)) {
      try {
        for (const group of await context.directory.forPeer(peerId))
          context.publishGroup(group);
      } catch {
        console.warn(
          "[signal] project directory unavailable; project chat will fail closed",
        );
      }
    }

    const token = jwt.sign({ sub: peerId }, context.peerSecret, {
      expiresIn: "12h",
    });
    console.log(`[signal] REGISTER ${peerId}`);
    reply({
      ok: true,
      token,
      peers: [...context.peers.keys()],
      groups: [...context.groups.values()].filter((group) =>
        group.members.includes(peerId),
      ),
    });
    socket.emit("peer:ready");
    context.publishPresence();
  });

  socket.on("peer:heartbeat", () => {
    const peerId = context.peerFor(socket);
    if (peerId && context.peers.get(peerId)?.socket.id === socket.id)
      context.peers.get(peerId)!.lastSeen = Date.now();
  });

  socket.on("peer:list", (reply: SignalingReply) => {
    if (typeof reply !== "function") return;
    if (!isRegistered(socket, context))
      return reply({ ok: false, error: "registration required" });
    reply({ ok: true, peers: [...context.peers.keys()] });
  });

  socket.on("peer:lookup", async (input: unknown, reply: SignalingReply) => {
    if (typeof reply !== "function") return;
    const requesterId = context.peerFor(socket);
    if (!requesterId || !isRegistered(socket, context))
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
    try {
      if (!(await context.authorizeDirect(requesterId, peerId)))
        return reply({ ok: false, error: "direct chat blocked" });
    } catch {
      return reply({
        ok: false,
        error: "direct chat authorization unavailable",
      });
    }

    const target = context.peers.get(peerId);
    const peer =
      !target ||
      !target.socket.connected ||
      Date.now() - target.lastSeen > context.heartbeatFreshMs
        ? {
            peerId,
            online: false as const,
            lastSeen: null,
            connection: null,
          }
        : {
            peerId,
            online: true as const,
            lastSeen: target.lastSeen,
            connection: {
              transport: "webrtc-datachannel" as const,
              signaling: "socket.io" as const,
              relay: "socket.io" as const,
            },
          };
    reply({ ok: true, peer: peerDiscoverySchema.parse(peer) });
  });

  socket.on("disconnect", () => {
    const peerId = context.peerFor(socket);
    if (peerId && context.peers.get(peerId)?.socket.id === socket.id) {
      context.peers.delete(peerId);
      console.log(`[signal] DISCONNECT ${peerId}`);
      context.publishPresence();
    }
  });
}
