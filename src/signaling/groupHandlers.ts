import { randomUUID } from "node:crypto";
import type { Socket } from "socket.io";
import { peerIdSchema, type Group } from "@ds01/shared";
import type { SignalingContext, SignalingReply } from "./types.ts";

function registeredPeer(socket: Socket, context: SignalingContext) {
  const peerId = context.peerFor(socket);
  return peerId && context.peers.get(peerId)?.socket.id === socket.id
    ? peerId
    : undefined;
}

/** Project-backed and standalone demo group membership handlers. */
export function registerGroupHandlers(
  socket: Socket,
  context: SignalingContext,
) {
  socket.on("project:group", async (input: unknown, reply: SignalingReply) => {
    if (typeof reply !== "function") return;
    const actor = registeredPeer(socket, context);
    if (!actor) return reply({ ok: false, error: "registration required" });
    const projectId = (input as { projectId?: unknown } | null)?.projectId;
    if (typeof projectId !== "string" || !/^[a-f\d]{24}$/i.test(projectId))
      return reply({ ok: false, error: "invalid project ID" });
    try {
      const group = await context.directory.project(projectId);
      if (!group || !group.members.includes(actor))
        return reply({ ok: false, error: "project group access denied" });
      context.publishGroup(group);
      reply({ ok: true, group });
    } catch {
      reply({ ok: false, error: "project authorization unavailable" });
    }
  });

  socket.on(
    "group:authorize",
    async (input: unknown, reply: SignalingReply) => {
      if (typeof reply !== "function") return;
      const actor = registeredPeer(socket, context);
      if (!actor) return reply({ ok: false, error: "registration required" });
      const value = input as {
        groupId?: unknown;
        otherPeerId?: unknown;
      } | null;
      if (
        !value ||
        typeof value.groupId !== "string" ||
        !/^[\da-f-]{36}$/i.test(value.groupId) ||
        !peerIdSchema.safeParse(value.otherPeerId).success
      )
        return reply({ ok: false, error: "invalid group authorization" });
      try {
        const group = await context.currentGroup(value.groupId);
        if (
          !group ||
          group.archived ||
          !group.members.includes(actor) ||
          !group.members.includes(String(value.otherPeerId))
        )
          return reply({
            ok: false,
            error: "group access denied or project archived",
          });
        reply({ ok: true, group });
      } catch {
        reply({ ok: false, error: "project authorization unavailable" });
      }
    },
  );

  socket.on("group:create", (input: unknown, reply: SignalingReply) => {
    const ownerId = registeredPeer(socket, context);
    const members = (input as { members?: unknown })?.members;
    if (
      !ownerId ||
      !Array.isArray(members) ||
      members.length > 15 ||
      !members.every((value) => peerIdSchema.safeParse(value).success)
    )
      return reply?.({ ok: false, error: "invalid members" });
    const group: Group = {
      id: randomUUID(),
      ownerId,
      members: [...new Set([ownerId, ...members])],
      version: 1,
    };
    context.groups.set(group.id, group);
    group.members.forEach((peerId) =>
      context.peers.get(peerId)?.socket.emit("group:update", group),
    );
    console.log(
      `[signal] GROUP ${group.id} members=${group.members.join(",")}`,
    );
    reply?.({ ok: true, group });
  });

  socket.on("group:change", (input: unknown, reply: SignalingReply) => {
    const actor = registeredPeer(socket, context);
    const { groupId, memberId, action, version } = (input || {}) as Record<
      string,
      unknown
    >;
    const group = context.groups.get(String(groupId));
    if (group?.projectId)
      return reply?.({
        ok: false,
        error: "manage project members through REST API",
      });
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
        : group.members.filter((peerId) => peerId !== memberId);
    group.version++;
    [...new Set([...before, ...group.members])].forEach((peerId) =>
      context.peers.get(peerId)?.socket.emit("group:update", group),
    );
    console.log(`[signal] GROUP_CHANGE ${group.id} v${group.version}`);
    reply?.({ ok: true, group });
  });
}
