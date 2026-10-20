import type { DeliveryMode } from "./protocol.ts";
import type { RTCFactory } from "./peerTypes.ts";

export type SignalKind = "request" | "offer" | "answer" | "ice";

export type SignalPacket = {
  from: string;
  kind: SignalKind;
  data: unknown;
};

type DirectConnection = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  ready: boolean;
  opening?: Promise<boolean>;
  candidates: RTCIceCandidateInit[];
  failedUntil: number;
};

type DirectTransportConfig = {
  peerId: string;
  rtc: RTCFactory;
  iceServers?: RTCIceServer[];
  timeoutMs?: number;
  sendSignal: (to: string, kind: SignalKind, data: unknown) => Promise<void>;
  onMessage: (raw: unknown, expectedSender: string) => void;
  onMode: (peerId: string, mode: DeliveryMode) => void;
  log: (text: string) => void;
};

/** Owns WebRTC negotiation and DataChannel lifecycle for all direct peers. */
export class DirectTransport {
  private connections = new Map<string, DirectConnection>();

  constructor(private config: DirectTransportConfig) {}

  private connection(peerId: string): DirectConnection {
    let item = this.connections.get(peerId);
    if (
      item &&
      ["failed", "closed"].includes(item.pc.connectionState) &&
      item.failedUntil <= Date.now()
    ) {
      item.pc.close();
      this.connections.delete(peerId);
      item = undefined;
    }
    if (item) return item;

    const pc = new this.config.rtc({
      iceServers: this.config.iceServers || [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    item = { pc, ready: false, candidates: [], failedUntil: 0 };
    this.connections.set(peerId, item);

    pc.onicecandidate = (event) => {
      if (event.candidate)
        void this.config
          .sendSignal(peerId, "ice", event.candidate.toJSON())
          .catch((error) =>
            this.config.log(`ICE send failed: ${String(error)}`),
          );
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        item!.ready = false;
        item!.failedUntil = Date.now() + 30_000;
        this.config.onMode(peerId, "RELAY");
        this.config.log(`direct lost ${peerId}: ${pc.connectionState}`);
      }
    };
    pc.ondatachannel = (event) =>
      this.attachChannel(peerId, item!, event.channel);
    return item;
  }

  private attachChannel(
    peerId: string,
    direct: DirectConnection,
    channel: RTCDataChannel,
  ) {
    direct.channel = channel;
    channel.onopen = () => {
      direct.ready = true;
      direct.failedUntil = 0;
      this.config.onMode(peerId, "DIRECT");
      this.config.log(`DIRECT open ${peerId}`);
    };
    channel.onclose = () => {
      direct.ready = false;
      direct.failedUntil = Date.now() + 30_000;
      this.config.onMode(peerId, "RELAY");
      this.config.log(`DIRECT closed ${peerId}`);
    };
    channel.onerror = () => {
      direct.ready = false;
    };
    channel.onmessage = (event) => {
      try {
        this.config.onMessage(JSON.parse(String(event.data)), peerId);
      } catch (error) {
        this.config.log(`bad direct message: ${String(error)}`);
      }
    };
  }

  private async flushCandidates(direct: DirectConnection) {
    for (const candidate of direct.candidates.splice(0))
      await direct.pc.addIceCandidate(candidate);
  }

  private async makeOffer(peerId: string, direct: DirectConnection) {
    const channel = direct.pc.createDataChannel("chat", { ordered: true });
    this.attachChannel(peerId, direct, channel);
    const offer = await direct.pc.createOffer();
    await direct.pc.setLocalDescription(offer);
    await this.config.sendSignal(peerId, "offer", offer);
  }

  async receiveSignal(packet: SignalPacket): Promise<void> {
    const { from, kind, data } = packet;
    const direct = this.connection(from);
    if (kind === "request") {
      if (this.config.peerId < from && direct.pc.signalingState === "stable")
        await this.makeOffer(from, direct);
      return;
    }
    if (kind === "offer") {
      if (direct.pc.signalingState !== "stable") {
        direct.pc.close();
        this.connections.delete(from);
        return this.receiveSignal(packet);
      }
      await direct.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      await this.flushCandidates(direct);
      const answer = await direct.pc.createAnswer();
      await direct.pc.setLocalDescription(answer);
      await this.config.sendSignal(from, "answer", answer);
      return;
    }
    if (kind === "answer") {
      await direct.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
      await this.flushCandidates(direct);
      return;
    }
    if (direct.pc.remoteDescription)
      await direct.pc.addIceCandidate(data as RTCIceCandidateInit);
    else direct.candidates.push(data as RTCIceCandidateInit);
  }

  async ensure(peerId: string, forceRelay: boolean): Promise<boolean> {
    if (forceRelay) return false;
    const direct = this.connection(peerId);
    if (direct.ready && direct.channel?.readyState === "open") return true;
    if (direct.failedUntil > Date.now()) return false;
    if (direct.opening) return direct.opening;

    direct.opening = (async () => {
      try {
        if (
          this.config.peerId < peerId &&
          direct.pc.signalingState === "stable"
        ) {
          await this.makeOffer(peerId, direct);
        } else if (
          this.config.peerId > peerId &&
          direct.pc.signalingState === "stable"
        ) {
          await this.config.sendSignal(peerId, "request", null);
        }
        const deadline = Date.now() + (this.config.timeoutMs || 5000);
        while (Date.now() < deadline && !direct.ready)
          await new Promise((resolve) => setTimeout(resolve, 100));
        if (!direct.ready) {
          direct.failedUntil = Date.now() + 30_000;
          this.config.log(`DIRECT timeout ${peerId}; RELAY fallback`);
        }
        return direct.ready;
      } catch (error) {
        this.config.log(`DIRECT failed ${peerId}: ${String(error)}`);
        return false;
      } finally {
        direct.opening = undefined;
      }
    })();
    return direct.opening;
  }

  send(peerId: string, packet: unknown) {
    const channel = this.connections.get(peerId)?.channel;
    if (!channel || channel.readyState !== "open")
      throw new Error("direct unavailable");
    channel.send(JSON.stringify(packet));
  }

  close() {
    for (const direct of this.connections.values()) direct.pc.close();
    this.connections.clear();
  }
}
