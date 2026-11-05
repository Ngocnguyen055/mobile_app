import { db } from "./database.ts";
import type { AttachmentCacheRow } from "./types.ts";
export class AttachmentStore {
  constructor(private scope: string) { }
  async getAttachmentCache(
    attachmentId: string,
  ): Promise<AttachmentCacheRow | null> {
    const conn = await db();
    const row = await conn.getFirstAsync<{
      attachment_id: string;
      local_uri: string;
      size: number;
      mime: string;
      last_accessed_at: number;
    }>(
      "SELECT attachment_id,local_uri,size,mime,last_accessed_at FROM attachment_cache WHERE scope=? AND attachment_id=?",
      this.scope,
      attachmentId,
    );
    return row
      ? {
        attachmentId: row.attachment_id,
        localUri: row.local_uri,
        size: row.size,
        mime: row.mime,
        lastAccessedAt: row.last_accessed_at,
      }
      : null;
  }
  async saveAttachmentCache(row: AttachmentCacheRow): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "INSERT INTO attachment_cache(scope,attachment_id,local_uri,size,mime,last_accessed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(scope,attachment_id) DO UPDATE SET local_uri=excluded.local_uri,size=excluded.size,mime=excluded.mime,last_accessed_at=excluded.last_accessed_at",
      this.scope,
      row.attachmentId,
      row.localUri,
      row.size,
      row.mime,
      row.lastAccessedAt,
    );
  }
  async touchAttachmentCache(
    attachmentId: string,
    lastAccessedAt = Date.now(),
  ): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "UPDATE attachment_cache SET last_accessed_at=? WHERE scope=? AND attachment_id=?",
      lastAccessedAt,
      this.scope,
      attachmentId,
    );
  }
  async listAttachmentCache(): Promise<AttachmentCacheRow[]> {
    const conn = await db();
    const rows = await conn.getAllAsync<{
      attachment_id: string;
      local_uri: string;
      size: number;
      mime: string;
      last_accessed_at: number;
    }>(
      "SELECT attachment_id,local_uri,size,mime,last_accessed_at FROM attachment_cache WHERE scope=? ORDER BY last_accessed_at,attachment_id",
      this.scope,
    );
    return rows.map((row) => ({
      attachmentId: row.attachment_id,
      localUri: row.local_uri,
      size: row.size,
      mime: row.mime,
      lastAccessedAt: row.last_accessed_at,
    }));
  }
  async removeAttachmentCache(attachmentId: string): Promise<void> {
    const conn = await db();
    await conn.runAsync(
      "DELETE FROM attachment_cache WHERE scope=? AND attachment_id=?",
      this.scope,
      attachmentId,
    );
  }
  async clearAttachmentCache(): Promise<void> {
    const conn = await db();
    await conn.runAsync("DELETE FROM attachment_cache WHERE scope=?", this.scope);
  }
}
