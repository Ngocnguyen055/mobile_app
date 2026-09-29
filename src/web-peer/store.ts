import type { ChatStore, StoredMessage, MessageStatus } from '@ds01/shared';
export class WebStore implements ChatStore {
  constructor(private scope: string) {}
  private get key() { return `ds01-history-v1-${this.scope}`; }
  private read(): StoredMessage[] { try { return JSON.parse(localStorage.getItem(this.key) || '[]') as StoredMessage[]; } catch { return []; } }
  private write(rows: StoredMessage[]) { localStorage.setItem(this.key, JSON.stringify(rows.slice(-1000))); }
  async put(row: StoredMessage) { const rows = this.read(); const index = rows.findIndex(r => r.message.messageId === row.message.messageId && r.message.receiverId === row.message.receiverId && r.message.senderId === row.message.senderId); if (index >= 0) rows[index] = row; else rows.push(row); this.write(rows); }
  async mark(messageId: string, receiverId: string, status: MessageStatus) { const rows = this.read(); for (const row of rows) if (row.message.messageId === messageId && row.message.receiverId === receiverId) row.status = status; this.write(rows); }
  async has(messageId: string, senderId: string) { return this.read().some(r => r.message.messageId === messageId && r.message.senderId === senderId); }
  async list() { return this.read().sort((a,b) => a.message.timestamp - b.message.timestamp || a.message.messageId.localeCompare(b.message.messageId)); }
}
