import { randomUUID } from "./uuid.ts";
import {
  parseMessage,
  peerIdSchema,
  type ChatAttachment,
  type ChatMessage,
  type DeliveryMode,
  type Group,
} from "./protocol.ts";
import type { ChatStore, PeerEvent } from "./peerTypes.ts";

type PendingAck = {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
};

type MessageDeliveryConfig = {
  peerId: string;
  store: ChatStore;
  ackTimeoutMs?: number;
  getGroup: (groupId: string) => Group | undefined;
  syncProjectGroup: (projectId: string) => Promise<Group>;
  authorizeGroup: (groupId: string, otherPeerId: string) => Promise<Group>;
  selectMode: (receiverId: string) => Promise<DeliveryMode>;
  transport: (message: ChatMessage, mode: DeliveryMode) => Promise<void>;
  emit: (event: PeerEvent) => void;
  log: (text: string) => void;
};

/** Implements message identity, ordering, ACK/retry, deduplication and fan-out. */
export class MessageDelivery {
  private pending = new Map<string, PendingAck>();
  private sequence = new Map<string, number>();
  private sessionIds = new Map<string, string>();

  constructor(private config: MessageDeliveryConfig) {}

  async send(
    receiverId: string,
    body: string,
    groupId?: string | null,
    messageId = randomUUID(),
    sequenceOverride?: number,
    attachments?: ChatAttachment[],
  ): Promise<void> {
    if (!body.trim() && !attachments?.length) throw new Error("empty message");
    if (attachments?.length && groupId)
      throw new Error("attachments are only supported in direct chat");
    if (groupId && !this.config.getGroup(groupId)?.members.includes(receiverId))
      throw new Error("receiver not in group");

    const conversationKey =
      groupId || [this.config.peerId, receiverId].sort().join(":");
    const sequence =
      sequenceOverride ?? (this.sequence.get(conversationKey) || 0) + 1;
    if (sequenceOverride === undefined)
      this.sequence.set(conversationKey, sequence);
    let sessionId = groupId || this.sessionIds.get(conversationKey);
    if (!sessionId) {
      sessionId = randomUUID();
      this.sessionIds.set(conversationKey, sessionId);
    }

    const message = parseMessage({
      messageId,
      sessionId,
      senderId: this.config.peerId,
      receiverId,
      groupId,
      type: attachments?.length ? "attachment" : "text",
      timestamp: Date.now(),
      body,
      attachments,
      mode: "RELAY",
      attempt: 1,
      sequence,
    });
    await this.config.store.put({ message, status: "pending" });
    this.config.emit({
      kind: "message",
      message: { message, status: "pending" },
    });

    let mode = await this.config.selectMode(receiverId);
    this.config.emit({ kind: "mode", peerId: receiverId, mode });
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
        await this.config.transport(packet, mode);
        await this.config.store.put({ message: packet, status: "sent" });
        this.config.emit({
          kind: "message",
          message: { message: packet, status: "sent" },
        });
        await ack;
        await this.config.store.mark(messageId, receiverId, "delivered");
        this.config.emit({
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
        this.config.log(`send attempt ${attempt} failed: ${String(error)}`);
        mode = "RELAY";
        this.config.emit({ kind: "mode", peerId: receiverId, mode });
      }
    }

    await this.config.store.mark(messageId, receiverId, "failed");
    this.config.emit({
      kind: "message",
      message: { message: { ...message, mode }, status: "failed" },
    });
    throw new Error(`delivery failed to ${receiverId}`);
  }

  async sendDirect(receiverId: string, body: string): Promise<void> {
    peerIdSchema.parse(receiverId);
    if (receiverId === this.config.peerId)
      throw new Error("cannot chat with yourself");
    if (await this.config.store.isDirectBlocked?.(receiverId))
      throw new Error("peer is blocked");
    await this.send(receiverId, body);
  }

  async sendDirectAttachment(
    receiverId: string,
    attachments: ChatAttachment[],
    caption = "",
  ): Promise<void> {
    peerIdSchema.parse(receiverId);
    if (receiverId === this.config.peerId)
      throw new Error("cannot chat with yourself");
    if (await this.config.store.isDirectBlocked?.(receiverId))
      throw new Error("peer is blocked");
    await this.send(
      receiverId,
      caption.trim(),
      undefined,
      randomUUID(),
      undefined,
      attachments,
    );
  }

  async sendGroup(
    groupId: string,
    body: string,
  ): Promise<Record<string, string>> {
    const group = this.config.getGroup(groupId);
    if (!group || !group.members.includes(this.config.peerId))
      throw new Error("not a group member");
    const current = group.projectId
      ? await this.config.syncProjectGroup(group.projectId)
      : group;
    if (current.archived) throw new Error("project archived");

    const messageId = randomUUID();
    const sequence = (this.sequence.get(groupId) || 0) + 1;
    this.sequence.set(groupId, sequence);
    const recipients = current.members.filter(
      (peerId) => peerId !== this.config.peerId,
    );
    const results = await Promise.allSettled(
      recipients.map((peerId) =>
        this.send(peerId, body, groupId, messageId, sequence),
      ),
    );
    return Object.fromEntries(
      recipients.map((peerId, index) => [peerId, results[index].status]),
    );
  }

  async receive(raw: unknown, mode: DeliveryMode, expectedSender?: string) {
    try {
      const message = parseMessage(raw);
      if (
        message.receiverId !== this.config.peerId ||
        message.mode !== mode ||
        (expectedSender && message.senderId !== expectedSender)
      )
        throw new Error("wrong receiver, sender or mode");
      if (
        !message.groupId &&
        (await this.config.store.isDirectBlocked?.(message.senderId))
      )
        throw new Error("sender blocked");
      this.config.emit({ kind: "mode", peerId: message.senderId, mode });
      if (message.groupId)
        await this.config.authorizeGroup(message.groupId, message.senderId);

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
        const key = [this.config.peerId, message.senderId].sort().join(":");
        if (!this.sessionIds.has(key))
          this.sessionIds.set(key, message.sessionId);
      }
      const duplicate = await this.config.store.has(
        message.messageId,
        message.senderId,
      );
      if (!duplicate) {
        await this.config.store.put({ message, status: "received" });
        this.config.emit({
          kind: "message",
          message: { message, status: "received" },
        });
      }

      const ack: ChatMessage = {
        messageId: randomUUID(),
        sessionId: message.sessionId,
        senderId: this.config.peerId,
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
        await this.config.transport(ack, mode);
      } catch {
        await this.config.transport({ ...ack, mode: "RELAY" }, "RELAY");
      }
    } catch (error) {
      this.config.log(`receive rejected: ${String(error)}`);
    }
  }

  close() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
  }
}
