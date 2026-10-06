import { peerIdSchema, type PeerDiscovery } from "./protocol.ts";
import { PeerClient, type DirectChatStore, type StoredMessage } from "./peer.ts";

/** UI-independent 1:1 operations on an already connected PeerClient. */
export class DirectChatService {
  constructor(
    private peer: PeerClient,
    private store: DirectChatStore,
  ) {}

  private checkRecipient(peerId: string) {
    peerIdSchema.parse(peerId);
    if (peerId === this.peer.peerId) throw new Error("cannot chat with yourself");
  }

  async history(peerId: string): Promise<StoredMessage[]> {
    this.checkRecipient(peerId);
    return this.store.listDirect(peerId);
  }

  async open(peerId: string): Promise<{
    peer: PeerDiscovery;
    messages: StoredMessage[];
  }> {
    this.checkRecipient(peerId);
    const [peer, messages] = await Promise.all([
      this.peer.lookupPeer(peerId),
      this.store.listDirect(peerId),
    ]);
    return { peer, messages };
  }

  async send(peerId: string, body: string): Promise<void> {
    this.checkRecipient(peerId);
    await this.peer.sendDirect(peerId, body);
  }
}
