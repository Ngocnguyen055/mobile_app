import type { DirectChatAuthorizer } from "./types.ts";

export const ACCOUNT_PEER_ID = /^[a-f\d]{24}$/i;

export function createHttpDirectChatAuthorizer(
  peerSecret: string,
): DirectChatAuthorizer {
  return async (senderId, receiverId) => {
    if (!ACCOUNT_PEER_ID.test(senderId) || !ACCOUNT_PEER_ID.test(receiverId))
      return true;
    const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
    const query = new URLSearchParams({ senderId, receiverId });
    const response = await fetch(
      `${base}/internal/direct-chat/authorize?${query.toString()}`,
      {
        headers: { "x-peer-secret": peerSecret },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!response.ok) throw new Error("direct chat authorization unavailable");
    const result = (await response.json()) as { allowed?: unknown };
    return result.allowed === true;
  };
}
