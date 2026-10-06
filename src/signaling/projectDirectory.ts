import type { Group } from "@ds01/shared";

export interface ProjectDirectory {
  group(id: string): Promise<Group | null>;
  project(id: string): Promise<Group | null>;
  forPeer(peerId: string): Promise<Group[]>;
}

/** Private API control plane. Never reads or forwards chat message contents. */
export function httpProjectDirectory(): ProjectDirectory {
  const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
  const secret = process.env.PEER_SECRET || "local-development-only-secret";
  async function read<T>(path: string): Promise<T | null> {
    const response = await fetch(`${base}${path}`, {
      headers: { "x-peer-secret": secret },
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("project authorization API unavailable");
    return response.json() as Promise<T>;
  }
  return {
    group: (id) => read<Group>(`/internal/chat-groups/${encodeURIComponent(id)}`),
    project: (id) => read<Group>(`/internal/projects/${encodeURIComponent(id)}/chat-group`),
    forPeer: async (id) => (await read<Group[]>(`/internal/chat-groups?userId=${encodeURIComponent(id)}`)) || [],
  };
}
