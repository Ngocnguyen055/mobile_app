import { AttachmentStore } from "./attachmentStore.ts";
import { ChatStore } from "./chatStore.ts";
import type { AttachmentCacheRow } from "./types.ts";

export class MobileStore extends ChatStore {
  private readonly attachments: AttachmentStore;
  constructor(scope: string) {
    super(scope);
    this.attachments = new AttachmentStore(scope);
  }
  getAttachmentCache(attachmentId: string) {
    return this.attachments.getAttachmentCache(attachmentId);
  }
  saveAttachmentCache(row: AttachmentCacheRow) {
    return this.attachments.saveAttachmentCache(row);
  }
  touchAttachmentCache(attachmentId: string, lastAccessedAt = Date.now()) {
    return this.attachments.touchAttachmentCache(attachmentId, lastAccessedAt);
  }
  listAttachmentCache() {
    return this.attachments.listAttachmentCache();
  }
  removeAttachmentCache(attachmentId: string) {
    return this.attachments.removeAttachmentCache(attachmentId);
  }
  clearAttachmentCache() {
    return this.attachments.clearAttachmentCache();
  }
}
