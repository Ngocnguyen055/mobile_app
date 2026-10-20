import type { Socket } from "socket.io";
import { peerIdSchema } from "@ds01/shared";
import type { SignalingContext, SignalingReply } from "./types.ts";

/** Forwards only SDP/ICE setup data. Chat bodies never pass this handler. */
export function registerWebRtcHandlers(
  socket: Socket,
  context: SignalingContext,
) {
  socket.on("signal:send", async (input: unknown, reply: SignalingReply) => {
    const senderId = context.peerFor(socket);
    const value = input as {
      to?: unknown;
      kind?: unknown;
      data?: unknown;
    } | null;
    if (
      !senderId ||
      context.peers.get(senderId)?.socket.id !== socket.id ||
      !value ||
      !peerIdSchema.safeParse(value.to).success ||
      !["request", "offer", "answer", "ice"].includes(String(value.kind)) ||
      JSON.stringify(value).length > 12_000
    )
      return reply?.({ ok: false, error: "invalid signaling data" });
    try {
      if (!(await context.authorizeDirect(senderId, String(value.to))))
        return reply?.({ ok: false, error: "direct chat blocked" });
    } catch {
      return reply?.({
        ok: false,
        error: "direct chat authorization unavailable",
      });
    }
    const target = context.peers.get(String(value.to));
    if (!target) return reply?.({ ok: false, error: "peer offline" });
    target.socket.emit("signal:receive", {
      from: senderId,
      kind: value.kind,
      data: value.data,
    });
    console.log(`[signal] ${value.kind} ${senderId} -> ${value.to}`);
    reply?.({ ok: true });
  });
}
