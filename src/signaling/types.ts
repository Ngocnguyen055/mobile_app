import type { Server, Socket } from "socket.io";
import type { Group, PeerDiscovery } from "@ds01/shared";
import type { ProjectDirectory } from "./projectDirectory.ts";

export type PeerSession = {
  socket: Socket;
  lastSeen: number;
};

export type DirectChatAuthorizer = (
  senderId: string,
  receiverId: string,
) => Promise<boolean>;

export type SignalingReply = (response: {
  ok: boolean;
  error?: string;
  token?: string;
  peers?: string[];
  groups?: Group[];
  group?: Group;
  peer?: PeerDiscovery;
}) => void;

export type SignalingContext = {
  io: Server;
  peers: Map<string, PeerSession>;
  groups: Map<string, Group>;
  demoSecrets: Map<string, string>;
  directory: ProjectDirectory;
  authorizeDirect: DirectChatAuthorizer;
  peerSecret: string;
  jwtSecret: string;
  heartbeatFreshMs: number;
  publishGroup: (group: Group) => void;
  currentGroup: (id: string) => Promise<Group | null>;
  publishPresence: () => void;
  peerFor: (socket: Socket) => string | undefined;
};
