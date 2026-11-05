import {
  assertUserId,
  isDirectMessageBetween,
  type DirectChatContact,
  type MessageStatus,
  type StoredMessage,
} from "../../domain/chat.ts";
import { db } from "./database.ts";
import type { ChatOutboxItem } from "./types.ts";
export class ChatStore {
  constructor(private scope: string) { }
  async put(row: StoredMessage) {
    const conn = await db();
    const m = row.message;
    await conn.runAsync(
      "INSERT OR REPLACE INTO messages(scope,message_id,sender_id,receiver_id,group_id,timestamp,payload,status) VALUES(?,?,?,?,?,?,?,?)",
      this.scope,
      m.messageId,
      m.senderId,
      m.receiverId,
      m.groupId ?? null,
      m.timestamp,
      JSON.stringify(m),
      row.status,
    );
  }
  async putDirect(row: StoredMessage) {
    const currentUserId = assertUserId(this.scope);
    const message = row.message;
    const otherUserId =
      message.senderId === currentUserId
        ? message.receiverId
        : message.senderId;
    assertUserId(otherUserId);
    if (
      otherUserId === currentUserId ||
      !isDirectMessageBetween(message, currentUserId, otherUserId)
    )
      throw new Error("direct message does not belong to this store");
    await this.put(row);
  }
  async mark(messageId: string, receiverId: string, status: MessageStatus) {
    const conn = await db();
    await conn.runAsync(
      "UPDATE messages SET status=? WHERE scope=? AND message_id=? AND receiver_id=?",
      status,
      this.scope,
      messageId,
      receiverId,
    );
  }
  async has(messageId: string, senderId: string) {
    const conn = await db();
    return !!(await conn.getFirstAsync(
      "SELECT 1 FROM messages WHERE scope=? AND message_id=? AND sender_id=?",
      this.scope,
      messageId,
      senderId,
    ));
  }
  async list(): Promise<StoredMessage[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{
      payload: string;
      status: MessageStatus;
    }>(
      "SELECT payload,status FROM messages WHERE scope=? ORDER BY timestamp,message_id",
      this.scope,
    );
    return rows.map((row) => ({
      message: JSON.parse(row.payload),
      status: row.status,
    }));
  }
  async listDirect(userId: string): Promise<StoredMessage[]> {
    const currentUserId = assertUserId(this.scope);
    const otherUserId = assertUserId(userId);
    if (currentUserId === otherUserId)
      throw new Error("direct conversation requires another user");
    const conn = await db();
    const rows = await conn.getAllAsync<{
      payload: string;
      status: MessageStatus;
    }>(
      "SELECT payload,status FROM messages WHERE scope=? AND group_id IS NULL AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) ORDER BY timestamp,message_id,sender_id,receiver_id",
      this.scope,
      currentUserId,
      otherUserId,
      otherUserId,
      currentUserId,
    );
    return rows
      .map((row) => ({
        message: JSON.parse(row.payload),
        status: row.status,
      }))
      .filter((row) =>
        isDirectMessageBetween(row.message, currentUserId, otherUserId),
      );
  }
  async listDirectAttachments(userId: string): Promise<StoredMessage[]> {
    return (await this.listDirect(userId)).filter(
      (row) => row.message.type === "attachment",
    );
  }
  async deleteDirect(userId: string): Promise<void> {
    const currentUserId = assertUserId(this.scope);
    const otherUserId = assertUserId(userId);
    if (currentUserId === otherUserId)
      throw new Error("direct conversation requires another user");
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM messages WHERE scope=? AND group_id IS NULL AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))",
      this.scope,
      currentUserId,
      otherUserId,
      otherUserId,
      currentUserId,
    );
  }
  async deleteGroupDeliveries(
    messageId: string,
    groupId: string,
  ): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM messages WHERE scope=? AND message_id=? AND group_id=?",
      this.scope,
      messageId,
      groupId,
    );
  }
  async setDirectBlocked(userId: string, blocked: boolean): Promise<void> {
    const currentUserId = assertUserId(this.scope);
    const otherUserId = assertUserId(userId);
    if (currentUserId === otherUserId) throw new Error("cannot block yourself");
    const conn = await db();
    if (!blocked) {
      await conn.runAsync(
        "DELETE FROM direct_chat_preferences WHERE scope=? AND user_id=?",
        this.scope,
        otherUserId,
      );
      return;
    }
    await conn.runAsync(
      "INSERT INTO direct_chat_preferences(scope,user_id,blocked) VALUES(?,?,1) ON CONFLICT(scope,user_id) DO UPDATE SET blocked=1",
      this.scope,
      otherUserId,
    );
  }
  async isDirectBlocked(userId: string): Promise<boolean> {
    const otherUserId = assertUserId(userId);
    const conn = await db();
    return !!(await conn.getFirstAsync(
      "SELECT 1 FROM direct_chat_preferences WHERE scope=? AND user_id=? AND blocked=1",
      this.scope,
      otherUserId,
    ));
  }
  async listDirectBlocked(): Promise<string[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{ user_id: string }>(
      "SELECT user_id FROM direct_chat_preferences WHERE scope=? AND blocked=1 ORDER BY user_id",
      this.scope,
    );
    return rows.map((row) => row.user_id);
  }
  async saveDirectContact(contact: DirectChatContact): Promise<void> {
    const currentUserId = assertUserId(this.scope);
    const userId = assertUserId(contact.userId);
    const name = contact.name.trim();
    const email = contact.email.trim().toLowerCase();
    if (userId === currentUserId) throw new Error("cannot save yourself");
    if (!name || !email || !Number.isSafeInteger(contact.updatedAt))
      throw new Error("invalid direct contact");
    const conn = await db();
    await conn.runAsync(
      "INSERT INTO direct_chat_contacts(scope,user_id,name,email,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(scope,user_id) DO UPDATE SET name=excluded.name,email=excluded.email,updated_at=excluded.updated_at",
      this.scope,
      userId,
      name,
      email,
      contact.updatedAt,
    );
  }
  async listDirectContacts(): Promise<DirectChatContact[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{
      user_id: string;
      name: string;
      email: string;
      updated_at: number;
    }>(
      "SELECT user_id,name,email,updated_at FROM direct_chat_contacts WHERE scope=? ORDER BY updated_at DESC,user_id",
      this.scope,
    );
    return rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      updatedAt: row.updated_at,
    }));
  }
  async removeDirectContact(userId: string): Promise<void> {
    const otherUserId = assertUserId(userId);
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM direct_chat_contacts WHERE scope=? AND user_id=?",
      this.scope,
      otherUserId,
    );
  }
  async enqueueChatOutbox(item: ChatOutboxItem): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "INSERT OR REPLACE INTO chat_outbox(scope,id,target_kind,target_id,payload,created_at) VALUES(?,?,?,?,?,?)",
      this.scope,
      item.id,
      item.targetKind,
      item.targetId,
      JSON.stringify(item.payload),
      item.createdAt,
    );
  }
  async listChatOutbox(): Promise<ChatOutboxItem[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{
      id: string;
      target_kind: "direct" | "group";
      target_id: string;
      payload: string;
      created_at: number;
    }>(
      "SELECT id,target_kind,target_id,payload,created_at FROM chat_outbox WHERE scope=? ORDER BY created_at,id",
      this.scope,
    );
    return rows.map((row) => ({
      id: row.id,
      targetKind: row.target_kind,
      targetId: row.target_id,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
    }));
  }
  async removeChatOutbox(id: string): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM chat_outbox WHERE scope=? AND id=?",
      this.scope,
      id,
    );
  }
  async getChatSyncCursor(): Promise<string | null> {
    const conn = await db();
    const row = await conn.getFirstAsync<{ cursor: string | null }>(
      "SELECT cursor FROM chat_sync_state WHERE scope=?",
      this.scope,
    );
    return row?.cursor || null;
  }
  async setChatSyncCursor(cursor: string | null): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "INSERT INTO chat_sync_state(scope,cursor) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET cursor=excluded.cursor",
      this.scope,
      cursor,
    );
  }

}
