import {
  isDirectMessageBetween,
  peerIdSchema,
  type DirectChatStore,
  type StoredMessage,
  type MessageStatus,
} from "@ds01/shared";
export class WebStore implements DirectChatStore {
  constructor(private scope: string) {}
  private get key() {
    return `ds01-history-v1-${this.scope}`;
  }
  private read(): StoredMessage[] {
    try {
      return JSON.parse(
        localStorage.getItem(this.key) || "[]",
      ) as StoredMessage[];
    } catch {
      return [];
    }
  }
  private write(rows: StoredMessage[]) {
    localStorage.setItem(this.key, JSON.stringify(rows.slice(-1000)));
  }
  async put(row: StoredMessage) {
    const rows = this.read();
    const index = rows.findIndex(
      (r) =>
        r.message.messageId === row.message.messageId &&
        r.message.receiverId === row.message.receiverId &&
        r.message.senderId === row.message.senderId,
    );
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    this.write(rows);
  }
  async putDirect(row: StoredMessage) {
    const currentPeerId = peerIdSchema.parse(this.scope);
    const message = row.message;
    const otherPeerId =
      message.senderId === currentPeerId
        ? message.receiverId
        : message.senderId;
    peerIdSchema.parse(otherPeerId);
    if (
      otherPeerId === currentPeerId ||
      !isDirectMessageBetween(message, currentPeerId, otherPeerId)
    )
      throw new Error("direct message does not belong to this store");
    await this.put(row);
  }
  async mark(messageId: string, receiverId: string, status: MessageStatus) {
    const rows = this.read();
    for (const row of rows)
      if (
        row.message.messageId === messageId &&
        row.message.receiverId === receiverId
      )
        row.status = status;
    this.write(rows);
  }
  async has(messageId: string, senderId: string) {
    return this.read().some(
      (r) =>
        r.message.messageId === messageId && r.message.senderId === senderId,
    );
  }
  async list() {
    return this.read().sort(
      (a, b) =>
        a.message.timestamp - b.message.timestamp ||
        a.message.messageId.localeCompare(b.message.messageId),
    );
  }
  async listDirect(peerId: string) {
    const currentPeerId = peerIdSchema.parse(this.scope);
    const otherPeerId = peerIdSchema.parse(peerId);
    if (currentPeerId === otherPeerId)
      throw new Error("direct conversation requires another peer");
    return this.read()
      .filter((row) =>
        isDirectMessageBetween(row.message, currentPeerId, otherPeerId),
      )
      .sort(
        (a, b) =>
          a.message.timestamp - b.message.timestamp ||
          a.message.messageId.localeCompare(b.message.messageId) ||
          a.message.senderId.localeCompare(b.message.senderId) ||
          a.message.receiverId.localeCompare(b.message.receiverId),
      );
  }
}
