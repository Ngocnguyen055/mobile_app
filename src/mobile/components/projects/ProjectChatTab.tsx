import React, { memo } from "react";
import { Image, Pressable, Text, View } from "react-native";

import type {
  ChatAttachment,
  ChatGroup,
  StoredMessage,
} from "../../domain/chat.ts";
import {
  chatAttachmentUrl,
  getToken,
  type User,
} from "../../services/api.ts";
import { styles } from "../../styles/app.ts";
import Button from "../ui/Button.tsx";
import TextField from "../ui/TextField.tsx";

const statusLabel = {
  pending: "Đang gửi",
  queued: "Chờ người nhận",
  sent: "Đã gửi",
  delivered: "Đã giao",
  read: "Đã xem",
  failed: "Không giao được",
  received: "Đã nhận",
} as const;

function groupMessagesForDisplay(
  messages: StoredMessage[],
  group: ChatGroup | null,
  currentUserId: string,
) {
  if (!group) return [];
  const rowsByMessage = new Map<string, StoredMessage[]>();
  for (const row of messages) {
    const message = row.message;
    if (message.groupId !== group.id) continue;
    const outgoing = message.senderId === currentUserId;
    if (outgoing && !group.members.includes(message.receiverId)) continue;
    const key = outgoing
      ? `${message.messageId}:${message.senderId}`
      : `${message.messageId}:${message.senderId}:${message.receiverId}`;
    rowsByMessage.set(key, [...(rowsByMessage.get(key) || []), row]);
  }
  return [...rowsByMessage.values()].sort(
    (left, right) =>
      left[0].message.timestamp - right[0].message.timestamp ||
      left[0].message.messageId.localeCompare(right[0].message.messageId),
  );
}

function groupDeliveryLabel(rows: StoredMessage[], outgoing: boolean) {
  if (!outgoing) return statusLabel[rows[0].status];
  const total = rows.length;
  const read = rows.filter((row) => row.status === "read").length;
  const delivered = rows.filter((row) =>
    ["delivered", "read"].includes(row.status),
  ).length;
  const failed = rows.filter((row) => row.status === "failed").length;
  if (read === total) return `Đã xem ${read}/${total}`;
  if (delivered === total) return `Đã giao ${delivered}/${total}`;
  if (failed === total) return "Không giao được";
  return `${delivered}/${total} đã giao${failed ? ` · ${failed} lỗi` : ""}`;
}

type ProjectChatTabProps = {
  group: ChatGroup | null;
  members: User[];
  currentUserId: string;
  messages: StoredMessage[];
  messageBody: string;
  logs: string[];
  uploading: boolean;
  readOnly: boolean;
  onRefreshGroup: () => void;
  onMessageBodyChange: (value: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onDownloadAttachment: (attachment: ChatAttachment) => void;
};

function ProjectChatTab({
  group,
  members,
  currentUserId,
  messages,
  messageBody,
  logs,
  uploading,
  readOnly,
  onRefreshGroup,
  onMessageBodyChange,
  onSend,
  onAttach,
  onDownloadAttachment,
}: ProjectChatTabProps) {
  const visibleMessages = groupMessagesForDisplay(
    messages,
    group,
    currentUserId,
  );
  return (
    <>
      <Text style={styles.heading}>Chat nhóm dự án</Text>
      <Text>
        Nhóm: {group?.id || "Đang đồng bộ"} · thành viên{" "}
        {group?.members.length || 0}
      </Text>
      <Text style={styles.muted}>
        Nhóm chat tự đồng bộ với thành viên dự án. Tin được lưu trong MongoDB;
        thành viên offline nhận khi mở ứng dụng lại.
      </Text>
      <Button label="Làm mới nhóm" onPress={onRefreshGroup} secondary />
      {group?.members.map((id) => (
        <Text key={id}>
          {members.find((member) => member._id === id)?.name || id}
        </Text>
      ))}
      {visibleMessages.map((rows) => {
        const row = rows[0];
        const outgoing = row.message.senderId === currentUserId;
        return (
          <View
            style={styles.card}
            key={`${row.message.messageId}-${row.message.senderId}`}
          >
            <Text style={styles.muted}>
              {outgoing
                ? "Tôi"
                : members.find((member) => member._id === row.message.senderId)
                    ?.name || row.message.senderId}{" "}
              · Máy chủ · {groupDeliveryLabel(rows, outgoing)}
            </Text>
            {(row.message.attachments || []).map((attachment) =>
              attachment.mime.startsWith("image/") ? (
                <Pressable
                  key={attachment.id}
                  onPress={() => onDownloadAttachment(attachment)}
                >
                  <Image
                    source={{
                      uri: chatAttachmentUrl(attachment.id),
                      headers: { Authorization: `Bearer ${getToken()}` },
                    }}
                    resizeMode="cover"
                    style={styles.chatImage}
                  />
                  <Text style={styles.attachmentName}>{attachment.name}</Text>
                </Pressable>
              ) : (
                <Pressable
                  key={attachment.id}
                  onPress={() => onDownloadAttachment(attachment)}
                  style={styles.fileAttachment}
                >
                  <Text style={styles.fileAttachmentIcon}>📎</Text>
                  <Text style={styles.attachmentName}>{attachment.name}</Text>
                </Pressable>
              ),
            )}
            <Text>{row.message.body}</Text>
          </View>
        );
      })}
      {!readOnly && (
        <TextField
          value={messageBody}
          onChangeText={onMessageBodyChange}
          placeholder="Tin nhắn"
        />
      )}
      {!readOnly && (
        <Button
          label={uploading ? "Đang tải tệp…" : "Gửi ảnh hoặc tệp"}
          onPress={onAttach}
          disabled={!group || uploading}
          secondary
        />
      )}
      {!readOnly && (
        <Button
          label="Gửi nhóm"
          onPress={onSend}
          disabled={!group || !messageBody.trim()}
        />
      )}
      <Text style={styles.heading}>Trạng thái đồng bộ</Text>
      {logs.slice(0, 20).map((line, index) => (
        <Text key={index} style={styles.muted}>
          {line}
        </Text>
      ))}
    </>
  );
}

export default memo(ProjectChatTab);
