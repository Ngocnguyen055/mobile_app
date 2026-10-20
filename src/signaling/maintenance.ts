import { ACCOUNT_PEER_ID } from "./directChatAuthorization.ts";
import type { SignalingContext } from "./types.ts";

/** Starts presence expiry and project-group synchronization jobs. */
export function startSignalingMaintenance(context: SignalingContext) {
  const presenceTimer = setInterval(() => {
    for (const [peerId, peer] of context.peers)
      if (Date.now() - peer.lastSeen > context.heartbeatFreshMs) {
        context.peers.delete(peerId);
        peer.socket.disconnect(true);
        console.log(`[signal] TIMEOUT ${peerId}`);
        context.publishPresence();
      }
  }, 5_000);
  presenceTimer.unref();

  let synchronizing = false;
  const projectTimer = setInterval(async () => {
    if (synchronizing) return;
    synchronizing = true;
    try {
      const accountIds = [...context.peers.keys()].filter((peerId) =>
        ACCOUNT_PEER_ID.test(peerId),
      );
      for (const peerId of accountIds)
        for (const group of await context.directory.forPeer(peerId))
          context.publishGroup(group);
      for (const group of [...context.groups.values()].filter(
        (item) => item.projectId,
      )) {
        const latest = await context.directory.group(group.id);
        if (latest) context.publishGroup(latest);
      }
    } catch {
      // Authorization queries current state and fails closed if the API is down.
    } finally {
      synchronizing = false;
    }
  }, 2_000);
  projectTimer.unref();

  return () => {
    clearInterval(presenceTimer);
    clearInterval(projectTimer);
  };
}
