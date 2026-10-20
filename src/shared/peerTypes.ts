import type { ChatMessage, DeliveryMode, Group } from "./protocol.ts";

export type MessageStatus =
  "pending" | "sent" | "delivered" | "failed" | "received";

export type StoredMessage = {
  message: ChatMessage;
  status: MessageStatus;
};

export type DirectChatContact = {
  peerId: string;
  name: string;
  email: string;
  updatedAt: number;
};

/** Persistence boundary implemented by SQLite on mobile and localStorage on web. */
export interface ChatStore {
  put(row: StoredMessage): Promise<void>;
  mark(
    messageId: string,
    receiverId: string,
    status: MessageStatus,
  ): Promise<void>;
  has(messageId: string, senderId: string): Promise<boolean>;
  list(): Promise<StoredMessage[]>;
  /** Reject an already-open direct channel after the local user blocks a peer. */
  isDirectBlocked?(peerId: string): Promise<boolean>;
}

export interface DirectChatStore extends ChatStore {
  putDirect(row: StoredMessage): Promise<void>;
  listDirect(peerId: string): Promise<StoredMessage[]>;
  listDirectAttachments(peerId: string): Promise<StoredMessage[]>;
  deleteDirect(peerId: string): Promise<void>;
  setDirectBlocked(peerId: string, blocked: boolean): Promise<void>;
  isDirectBlocked(peerId: string): Promise<boolean>;
  listDirectBlocked(): Promise<string[]>;
  saveDirectContact(contact: DirectChatContact): Promise<void>;
  listDirectContacts(): Promise<DirectChatContact[]>;
  removeDirectContact(peerId: string): Promise<void>;
}

export type RTCFactory = new (config: RTCConfiguration) => RTCPeerConnection;

export type PeerEvent = {
  kind: "message" | "presence" | "group" | "mode" | "log";
  message?: StoredMessage;
  peers?: string[];
  group?: Group;
  peerId?: string;
  mode?: DeliveryMode;
  text?: string;
};

export type PeerConfig = {
  peerId: string;
  identityProof: string;
  signalUrl: string;
  relayUrl: string;
  rtc: RTCFactory;
  store: ChatStore;
  forceRelay?: boolean;
  iceServers?: RTCIceServer[];
  directTimeoutMs?: number;
  ackTimeoutMs?: number;
  onEvent: (event: PeerEvent) => void;
};
