import {
  peerIdSchema,
  type ChatAttachment,
  type PeerDiscovery,
} from "./protocol.ts";
import {
  PeerClient,
  type DirectChatContact,
  type DirectChatStore,
  type StoredMessage,
} from "./peer.ts";

/** UI-independent 1:1 operations on an already connected PeerClient. */
export class DirectChatService {
  constructor(
    private peer: PeerClient,
    private store: DirectChatStore,
  ) {}

  private checkRecipient(peerId: string) {
    peerIdSchema.parse(peerId);
    if (peerId === this.peer.peerId)
      throw new Error("cannot chat with yourself");
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

  async sendAttachment(
    peerId: string,
    attachments: ChatAttachment[],
    caption = "",
  ): Promise<void> {
    this.checkRecipient(peerId);
    await this.peer.sendDirectAttachment(peerId, attachments, caption);
  }

  async attachments(peerId: string): Promise<StoredMessage[]> {
    this.checkRecipient(peerId);
    return this.store.listDirectAttachments(peerId);
  }

  async deleteConversation(peerId: string): Promise<void> {
    this.checkRecipient(peerId);
    await Promise.all([
      this.store.deleteDirect(peerId),
      this.store.removeDirectContact(peerId),
    ]);
  }

  async setBlocked(peerId: string, blocked: boolean): Promise<void> {
    this.checkRecipient(peerId);
    await this.store.setDirectBlocked(peerId, blocked);
  }

  async isBlocked(peerId: string): Promise<boolean> {
    this.checkRecipient(peerId);
    return this.store.isDirectBlocked(peerId);
  }

  async blockedPeers(): Promise<string[]> {
    return this.store.listDirectBlocked();
  }

  async rememberContact(contact: DirectChatContact): Promise<void> {
    this.checkRecipient(contact.peerId);
    await this.store.saveDirectContact(contact);
  }

  async contacts(): Promise<DirectChatContact[]> {
    return this.store.listDirectContacts();
  }
}
