import { io, type Socket } from "socket.io-client";
import { randomUUID } from "./uuid.ts";
import {
  parseMessage,
  peerIdSchema,
  peerDiscoverySchema,
  type ChatMessage,
  type DeliveryMode,
  type Group,
  type PeerDiscovery,
} from "./protocol.ts";

export type MessageStatus =
  "pending" | "sent" | "delivered" | "failed" | "received";
export type StoredMessage = { message: ChatMessage; status: MessageStatus };
export interface ChatStore {
  put(row: StoredMessage): Promise<void>;
  mark(
    messageId: string,
    receiverId: string,
    status: MessageStatus,
  ): Promise<void>;
  has(messageId: string, senderId: string): Promise<boolean>;
  list(): Promise<StoredMessage[]>;
}
export interface DirectChatStore extends ChatStore {
  putDirect(row: StoredMessage): Promise<void>;
  listDirect(peerId: string): Promise<StoredMessage[]>;
}
type RTCFactory = new (config: RTCConfiguration) => RTCPeerConnection;
type Event = {
  kind: "message" | "presence" | "group" | "mode" | "log";
  message?: StoredMessage;
  peers?: string[];
  group?: Group;
  peerId?: string;
  mode?: DeliveryMode;
  text?: string;
};
type Ack = {
  ok: boolean;
  error?: string;
  token?: string;
  peers?: string[];
  groups?: Group[];
  group?: Group;
  peer?: PeerDiscovery;
};
type Pending = { resolve: () => void; timer: ReturnType<typeof setTimeout> };
type Direct = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  ready: boolean;
  opening?: Promise<boolean>;
  candidates: RTCIceCandidateInit[];
  failedUntil: number;
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
  onEvent: (event: Event) => void;
};

export class PeerClient {
  readonly peerId: string;
  private signal?: Socket;
  private relay?: Socket;
  private peers: string[] = [];
  private groups = new Map<string, Group>();
  private directs = new Map<string, Direct>();
  private pending = new Map<string, Pending>();
  private sequence = new Map<string, number>();
  private sessionIds = new Map<string, string>();
  private heartbeat?: ReturnType<typeof setInterval>;
  private closed = false;
  forceRelay: boolean;
  constructor(private config: PeerConfig) {
    this.peerId = config.peerId;
    this.forceRelay = !!config.forceRelay;
  }
  private emit(event: Event) {
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
    if (peer.peerId !== peerId) throw new Error("peer lookup identity mismatch");
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
    this.signal.on(
      "signal:receive",
      (packet: {
        from: string;
        kind: "request" | "offer" | "answer" | "ice";
        data: unknown;
      }) => {
        void this.receiveSignal(packet).catch((error: unknown) =>
          this.log(`signal error: ${String(error)}`),
        );
      },
    );
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
    if (!this.signal?.connected) throw new Error("group authorization unavailable");
    const result = await this.call(this.signal, "group:authorize", {
      groupId, otherPeerId,
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
  private direct(peerId: string): Direct {
    let item = this.directs.get(peerId);
    if (
      item &&
      ["failed", "closed"].includes(item.pc.connectionState) &&
      item.failedUntil <= Date.now()
    ) {
      item.pc.close();
      this.directs.delete(peerId);
      item = undefined;
    }
    if (item) return item;
    const pc = new this.config.rtc({
      iceServers: this.config.iceServers || [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    item = { pc, ready: false, candidates: [], failedUntil: 0 };
    this.directs.set(peerId, item);
    pc.onicecandidate = (event) => {
      if (event.candidate)
        void this.sendSignal(peerId, "ice", event.candidate.toJSON()).catch(
          (error) => this.log(`ICE send failed: ${String(error)}`),
        );
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        item!.ready = false;
        item!.failedUntil = Date.now() + 30_000;
        this.emit({ kind: "mode", peerId, mode: "RELAY" });
        this.log(`direct lost ${peerId}: ${pc.connectionState}`);
      }
    };
    pc.ondatachannel = (event) =>
      this.attachChannel(peerId, item!, event.channel);
    return item;
  }
  private attachChannel(
    peerId: string,
    direct: Direct,
    channel: RTCDataChannel,
  ) {
    direct.channel = channel;
    channel.onopen = () => {
      direct.ready = true;
      direct.failedUntil = 0;
      this.emit({ kind: "mode", peerId, mode: "DIRECT" });
      this.log(`DIRECT open ${peerId}`);
    };
    channel.onclose = () => {
      direct.ready = false;
      direct.failedUntil = Date.now() + 30_000;
      this.emit({ kind: "mode", peerId, mode: "RELAY" });
      this.log(`DIRECT closed ${peerId}`);
    };
    channel.onerror = () => {
      direct.ready = false;
    };
    channel.onmessage = (event) => {
      try {
        void this.receive(JSON.parse(String(event.data)), "DIRECT", peerId);
      } catch (error) {
        this.log(`bad direct message: ${String(error)}`);
      }
    };
  }
  private async sendSignal(
    to: string,
    kind: "request" | "offer" | "answer" | "ice",
    data: unknown,
  ) {
    if (!this.signal?.connected) throw new Error("signaling unavailable");
    const result = await this.call(this.signal, "signal:send", {
      to,
      kind,
      data,
    });
    if (!result.ok) throw new Error(result.error || "signal rejected");
  }
  private async receiveSignal(packet: {
    from: string;
    kind: "request" | "offer" | "answer" | "ice";
    data: unknown;
  }): Promise<void> {
    const { from, kind, data } = packet;
    const direct = this.direct(from);
    if (kind === "request") {
      if (this.peerId < from && direct.pc.signalingState === "stable")
        await this.makeOffer(from, direct);
    } else if (kind === "offer") {
      if (direct.pc.signalingState !== "stable") {
        direct.pc.close();
        this.directs.delete(from);
        return this.receiveSignal(packet);
      }
      await direct.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      await this.flushCandidates(direct);
      const answer = await direct.pc.createAnswer();
      await direct.pc.setLocalDescription(answer);
      await this.sendSignal(from, "answer", answer);
    } else if (kind === "answer") {
      await direct.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      await this.flushCandidates(direct);
    } else if (kind === "ice") {
      if (direct.pc.remoteDescription)
        await direct.pc.addIceCandidate(data as RTCIceCandidateInit);
      else direct.candidates.push(data as RTCIceCandidateInit);
    }
  }
  private async flushCandidates(direct: Direct) {
    for (const candidate of direct.candidates.splice(0))
      await direct.pc.addIceCandidate(candidate);
  }
  private async makeOffer(peerId: string, direct: Direct) {
    const channel = direct.pc.createDataChannel("chat", { ordered: true });
    this.attachChannel(peerId, direct, channel);
    const offer = await direct.pc.createOffer();
    await direct.pc.setLocalDescription(offer);
    await this.sendSignal(peerId, "offer", offer);
  }
  private async ensureDirect(peerId: string): Promise<boolean> {
    if (this.forceRelay) return false;
    const direct = this.direct(peerId);
    if (direct.ready && direct.channel?.readyState === "open") return true;
    if (direct.failedUntil > Date.now()) return false;
    if (direct.opening) return direct.opening;
    direct.opening = (async () => {
      try {
        if (this.peerId < peerId && direct.pc.signalingState === "stable") {
          await this.makeOffer(peerId, direct);
        } else if (
          this.peerId > peerId &&
          direct.pc.signalingState === "stable"
        ) {
          await this.sendSignal(peerId, "request", null);
        }
        const deadline = Date.now() + (this.config.directTimeoutMs || 5000);
        while (Date.now() < deadline && !direct.ready)
          await new Promise((resolve) => setTimeout(resolve, 100));
        if (!direct.ready) {
          direct.failedUntil = Date.now() + 30_000;
          this.log(`DIRECT timeout ${peerId}; RELAY fallback`);
        }
        return direct.ready;
      } catch (error) {
        this.log(`DIRECT failed ${peerId}: ${String(error)}`);
        return false;
      } finally {
        direct.opening = undefined;
      }
    })();
    return direct.opening;
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
      const channel = this.directs.get(packet.receiverId)?.channel;
      if (!channel || channel.readyState !== "open")
        throw new Error("direct unavailable");
      channel.send(JSON.stringify(packet));
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
    messageId = randomUUID(),
    sequenceOverride?: number,
  ): Promise<void> {
    if (!body.trim()) throw new Error("empty message");
    if (groupId && !this.groups.get(groupId)?.members.includes(receiverId))
      throw new Error("receiver not in group");
    const key = groupId || [this.peerId, receiverId].sort().join(":");
    const sequence = sequenceOverride ?? (this.sequence.get(key) || 0) + 1;
    if (sequenceOverride === undefined) this.sequence.set(key, sequence);
    let sessionId = groupId || this.sessionIds.get(key);
    if (!sessionId) {
      sessionId = randomUUID();
      this.sessionIds.set(key, sessionId);
    }
    const message: ChatMessage = {
      messageId,
      sessionId,
      senderId: this.peerId,
      receiverId,
      groupId,
      type: "text",
      timestamp: Date.now(),
      body,
      mode: "RELAY",
      attempt: 1,
      sequence,
    };
    await this.config.store.put({ message, status: "pending" });
    this.emit({ kind: "message", message: { message, status: "pending" } });
    let mode: DeliveryMode = (await this.ensureDirect(receiverId))
      ? "DIRECT"
      : "RELAY";
    this.emit({ kind: "mode", peerId: receiverId, mode });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const packet = { ...message, mode, attempt };
      try {
        const ack = new Promise<void>((resolve, reject) => {
          const key = `${messageId}:${receiverId}`;
          const timer = setTimeout(() => {
            this.pending.delete(key);
            reject(new Error("ACK timeout"));
          }, this.config.ackTimeoutMs || 2000);
          this.pending.set(key, { resolve, timer });
        });
        void ack.catch(() => {});
        await this.transport(packet, mode);
        await this.config.store.put({ message: packet, status: "sent" });
        this.emit({
          kind: "message",
          message: { message: packet, status: "sent" },
        });
        await ack;
        await this.config.store.mark(messageId, receiverId, "delivered");
        this.emit({
          kind: "message",
          message: { message: packet, status: "delivered" },
        });
        return;
      } catch (error) {
        const pending = this.pending.get(`${messageId}:${receiverId}`);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(`${messageId}:${receiverId}`);
        }
        this.log(`send attempt ${attempt} failed: ${String(error)}`);
        mode = "RELAY";
        this.emit({ kind: "mode", peerId: receiverId, mode });
      }
    }
    await this.config.store.mark(messageId, receiverId, "failed");
    this.emit({
      kind: "message",
      message: { message: { ...message, mode }, status: "failed" },
    });
    throw new Error(`delivery failed to ${receiverId}`);
  }
  /** Personal conversation; DIRECT is attempted first, with RELAY fallback. */
  async sendDirect(receiverId: string, body: string): Promise<void> {
    peerIdSchema.parse(receiverId);
    if (receiverId === this.peerId) throw new Error("cannot chat with yourself");
    await this.send(receiverId, body);
  }
  async sendGroup(
    groupId: string,
    body: string,
  ): Promise<Record<string, string>> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.includes(this.peerId))
      throw new Error("not a group member");
    const current = group.projectId
      ? await this.syncProjectGroup(group.projectId)
      : group;
    if (current.archived) throw new Error("project archived");
    const messageId = randomUUID();
    const sequence = (this.sequence.get(groupId) || 0) + 1;
    this.sequence.set(groupId, sequence);
    const results = await Promise.allSettled(
      current.members
        .filter((id) => id !== this.peerId)
        .map((id) => this.send(id, body, groupId, messageId, sequence)),
    );
    return Object.fromEntries(
      current.members
        .filter((id) => id !== this.peerId)
        .map((id, index) => [id, results[index].status]),
    );
  }
  private async receive(
    raw: unknown,
    mode: DeliveryMode,
    expectedSender?: string,
  ) {
    try {
      const message = parseMessage(raw);
      if (
        message.receiverId !== this.peerId ||
        message.mode !== mode ||
        (expectedSender && message.senderId !== expectedSender)
      )
        throw new Error("wrong receiver, sender or mode");
      this.emit({ kind: "mode", peerId: message.senderId, mode });
      if (message.groupId)
        await this.authorizeGroup(message.groupId, message.senderId);
      if (message.type === "ack") {
        const pending = this.pending.get(
          `${message.ackFor}:${message.senderId}`,
        );
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(`${message.ackFor}:${message.senderId}`);
          pending.resolve();
        }
        return;
      }
      if (!message.groupId) {
        const key = [this.peerId, message.senderId].sort().join(":");
        if (!this.sessionIds.has(key))
          this.sessionIds.set(key, message.sessionId);
      }
      const duplicate = await this.config.store.has(
        message.messageId,
        message.senderId,
      );
      if (!duplicate) {
        await this.config.store.put({ message, status: "received" });
        this.emit({
          kind: "message",
          message: { message, status: "received" },
        });
      }
      const ack: ChatMessage = {
        messageId: randomUUID(),
        sessionId: message.sessionId,
        senderId: this.peerId,
        receiverId: message.senderId,
        groupId: message.groupId,
        type: "ack",
        timestamp: Date.now(),
        body: "",
        mode,
        ackFor: message.messageId,
        attempt: 1,
        sequence: message.sequence,
      };
      try {
        await this.transport(ack, mode);
      } catch {
        await this.transport({ ...ack, mode: "RELAY" }, "RELAY");
      }
    } catch (error) {
      this.log(`receive rejected: ${String(error)}`);
    }
  }
  close() {
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    for (const direct of this.directs.values()) direct.pc.close();
    this.directs.clear();
    this.signal?.disconnect();
    this.relay?.disconnect();
  }
}
