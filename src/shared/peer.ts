import { io, type Socket } from "socket.io-client";
import {
  DirectTransport,
  type SignalKind,
  type SignalPacket,
} from "./directTransport.ts";
import { MessageDelivery } from "./messageDelivery.ts";
import {
  peerIdSchema,
  peerDiscoverySchema,
  type ChatAttachment,
  type ChatMessage,
  type DeliveryMode,
  type Group,
  type PeerDiscovery,
} from "./protocol.ts";
import type { PeerConfig, PeerEvent } from "./peerTypes.ts";

export type {
  ChatStore,
  DirectChatContact,
  DirectChatStore,
  MessageStatus,
  PeerConfig,
  PeerEvent,
  RTCFactory,
  StoredMessage,
} from "./peerTypes.ts";

type Ack = {
  ok: boolean;
  error?: string;
  token?: string;
  peers?: string[];
  groups?: Group[];
  group?: Group;
  peer?: PeerDiscovery;
};
export class PeerClient {
  readonly peerId: string;
  private signal?: Socket;
  private relay?: Socket;
  private peers: string[] = [];
  private groups = new Map<string, Group>();
  private directTransport: DirectTransport;
  private delivery: MessageDelivery;
  private heartbeat?: ReturnType<typeof setInterval>;
  private closed = false;
  forceRelay: boolean;
  constructor(private config: PeerConfig) {
    this.peerId = config.peerId;
    this.forceRelay = !!config.forceRelay;
    this.directTransport = new DirectTransport({
      peerId: this.peerId,
      rtc: config.rtc,
      iceServers: config.iceServers,
      timeoutMs: config.directTimeoutMs,
      sendSignal: (to, kind, data) => this.sendSignal(to, kind, data),
      onMessage: (raw, expectedSender) => {
        void this.receive(raw, "DIRECT", expectedSender);
      },
      onMode: (peerId, mode) => this.emit({ kind: "mode", peerId, mode }),
      log: (text) => this.log(text),
    });
    this.delivery = new MessageDelivery({
      peerId: this.peerId,
      store: config.store,
      ackTimeoutMs: config.ackTimeoutMs,
      getGroup: (groupId) => this.groups.get(groupId),
      syncProjectGroup: (projectId) => this.syncProjectGroup(projectId),
      authorizeGroup: (groupId, otherPeerId) =>
        this.authorizeGroup(groupId, otherPeerId),
      selectMode: async (receiverId) =>
        (await this.directTransport.ensure(receiverId, this.forceRelay))
          ? "DIRECT"
          : "RELAY",
      transport: (message, mode) => this.transport(message, mode),
      emit: (event) => this.emit(event),
      log: (text) => this.log(text),
    });
  }
  private emit(event: PeerEvent) {
    this.config.onEvent(event);
  }
  private log(text: string) {
    this.emit({ kind: "log", text });
  }
  getOnlinePeers() {
    return [...this.peers];
  }
  getGroups() {
    return [...this.groups.values()];
  }
  async lookupPeer(peerId: string): Promise<PeerDiscovery> {
    peerIdSchema.parse(peerId);
    if (!this.signal?.connected) throw new Error("signaling unavailable");
    const result = await this.call(this.signal, "peer:lookup", { peerId });
    if (!result.ok) throw new Error(result.error || "peer lookup failed");
    const peer = peerDiscoverySchema.parse(result.peer);
    if (peer.peerId !== peerId)
      throw new Error("peer lookup identity mismatch");
    return peer;
  }
  private async call(
    socket: Socket,
    event: string,
    payload: unknown,
  ): Promise<Ack> {
    return await new Promise((resolve, reject) => {
      socket
        .timeout(4000)
        .emit(event, payload, (error: Error | null, result: Ack) =>
          error ? reject(error) : resolve(result),
        );
    });
  }
  async connect() {
    this.closed = false;
    this.signal = io(this.config.signalUrl, {
      autoConnect: false,
      reconnection: true,
    });
    this.signal.on("connect", () => {
      void this.register().catch((error) =>
        this.log(`register failed: ${String(error)}`),
      );
    });
    this.signal.on("presence", (peers: string[]) => {
      this.peers = peers;
      this.emit({ kind: "presence", peers });
    });
    this.signal.on("group:update", (group: Group) => {
      if (group.members.includes(this.peerId)) this.groups.set(group.id, group);
      else this.groups.delete(group.id);
      this.emit({ kind: "group", group });
    });
    this.signal.on("signal:receive", (packet: SignalPacket) => {
      void this.directTransport
        .receiveSignal(packet)
        .catch((error: unknown) => this.log(`signal error: ${String(error)}`));
    });
    this.signal.on("disconnect", () => this.log("signaling disconnected"));
    this.signal.connect();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("signaling timeout")),
        6000,
      );
      const onReady = () => {
        clearTimeout(timer);
        this.signal?.off("peer:ready", onReady);
        resolve();
      };
      this.signal?.on("peer:ready", onReady);
    });
    this.heartbeat = setInterval(
      () => this.signal?.emit("peer:heartbeat"),
      10_000,
    );
  }
  private async register() {
    if (!this.signal || this.closed) return;
    const response = await this.call(this.signal, "peer:register", {
      peerId: this.peerId,
      identityProof: this.config.identityProof,
    });
    if (!response.ok || !response.token)
      throw new Error(response.error || "registration failed");
    this.peers = response.peers || [];
    this.groups = new Map(
      (response.groups || []).map((group) => [group.id, group]),
    );
    this.emit({ kind: "presence", peers: this.peers });
    for (const group of this.groups.values())
      this.emit({ kind: "group", group });
    this.relay?.disconnect();
    this.relay = io(this.config.relayUrl, {
      auth: { token: response.token },
      reconnection: true,
    });
    this.relay.on("relay:receive", (raw: unknown) => {
      void this.receive(raw, "RELAY");
    });
    this.relay.on("connect", () => this.log("relay connected"));
    this.relay.on("disconnect", () => this.log("relay disconnected"));
  }
  async createGroup(members: string[]): Promise<Group> {
    if (!this.signal) throw new Error("not connected");
    const result = await this.call(this.signal, "group:create", { members });
    if (!result.ok || !result.group)
      throw new Error(result.error || "group creation failed");
    return result.group;
  }
  async syncProjectGroup(projectId: string): Promise<Group> {
    if (!this.signal?.connected) throw new Error("signaling unavailable");
    const result = await this.call(this.signal, "project:group", { projectId });
    if (!result.ok || !result.group)
      throw new Error(result.error || "project group access denied");
    this.groups.set(result.group.id, result.group);
    this.emit({ kind: "group", group: result.group });
    return result.group;
  }
  private async authorizeGroup(groupId: string, otherPeerId: string) {
    if (!this.signal?.connected)
      throw new Error("group authorization unavailable");
    const result = await this.call(this.signal, "group:authorize", {
      groupId,
      otherPeerId,
    });
    if (!result.ok || !result.group)
      throw new Error(result.error || "group access denied");
    this.groups.set(groupId, result.group);
    if (result.group.archived) throw new Error("project archived");
    return result.group;
  }
  async changeGroup(
    groupId: string,
    memberId: string,
    action: "add" | "remove",
  ): Promise<Group> {
    if (!this.signal) throw new Error("not connected");
    const group = this.groups.get(groupId);
    if (!group) throw new Error("group unknown");
    const result = await this.call(this.signal, "group:change", {
      groupId,
      memberId,
      action,
      version: group.version,
    });
    if (!result.ok || !result.group)
      throw new Error(result.error || "group change failed");
    return result.group;
  }
  private async sendSignal(to: string, kind: SignalKind, data: unknown) {
    if (!this.signal?.connected) throw new Error("signaling unavailable");
    const result = await this.call(this.signal, "signal:send", {
      to,
      kind,
      data,
    });
    if (!result.ok) throw new Error(result.error || "signal rejected");
  }
  private async transport(
    message: ChatMessage,
    mode: DeliveryMode,
  ): Promise<void> {
    const packet = { ...message, mode };
    // Control plane checks contain IDs only; chat content remains on DataChannel/relay.
    // Recheck each retry/ACK, even when a DataChannel is already open.
    if (packet.groupId)
      await this.authorizeGroup(packet.groupId, packet.receiverId);
    if (mode === "DIRECT") {
      this.directTransport.send(packet.receiverId, packet);
      this.log(`DIRECT SEND ${packet.messageId} -> ${packet.receiverId}`);
    } else {
      if (!this.relay?.connected) throw new Error("relay unavailable");
      const response = await this.call(this.relay, "relay:send", packet);
      if (!response.ok) throw new Error(response.error || "relay rejected");
      this.log(`RELAY SEND ${packet.messageId} -> ${packet.receiverId}`);
    }
  }
  async send(
    receiverId: string,
    body: string,
    groupId?: string | null,
    messageId?: string,
    sequenceOverride?: number,
    attachments?: ChatAttachment[],
  ): Promise<void> {
    return this.delivery.send(
      receiverId,
      body,
      groupId,
      messageId,
      sequenceOverride,
      attachments,
    );
  }
  /** Personal conversation; DIRECT is attempted first, with RELAY fallback. */
  async sendDirect(receiverId: string, body: string): Promise<void> {
    return this.delivery.sendDirect(receiverId, body);
  }
  async sendDirectAttachment(
    receiverId: string,
    attachments: ChatAttachment[],
    caption = "",
  ): Promise<void> {
    return this.delivery.sendDirectAttachment(receiverId, attachments, caption);
  }
  async sendGroup(
    groupId: string,
    body: string,
  ): Promise<Record<string, string>> {
    return this.delivery.sendGroup(groupId, body);
  }
  /** Single inbound boundary kept here so tests can inject a forged transport packet. */
  private receive(raw: unknown, mode: DeliveryMode, expectedSender?: string) {
    return this.delivery.receive(raw, mode, expectedSender);
  }
  close() {
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.delivery.close();
    this.directTransport.close();
    this.signal?.disconnect();
    this.relay?.disconnect();
  }
}
