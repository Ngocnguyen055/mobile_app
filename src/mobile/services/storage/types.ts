export type ChatOutboxItem = {
  id: string;
  targetKind: "direct" | "group";
  targetId: string;
  payload: {
    messageId: string;
    sessionId: string;
    timestamp: number;
    sequence: number;
    body: string;
    attachmentIds: string[];
  };
  createdAt: number;
};

export type AttachmentCacheRow = {
  attachmentId: string;
  localUri: string;
  size: number;
  mime: string;
  lastAccessedAt: number;
};
