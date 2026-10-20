import React, { memo } from "react";
import { Text, View } from "react-native";

import type { Group, StoredMessage } from "@ds01/shared";
import type { User } from "../../services/api.ts";
import { styles } from "../../styles/app.ts";
import Button from "../ui/Button.tsx";
import TextField from "../ui/TextField.tsx";

type ProjectChatTabProps = {
  group: Group | null;
  onlineUserIds: string[];
  members: User[];
  currentUserId: string;
  messages: StoredMessage[];
  modes: Record<string, string>;
  messageBody: string;
  logs: string[];
  forceRelay: boolean;
  readOnly: boolean;
  onRefreshGroup: () => void;
  onToggleForceRelay: () => void;
  onMessageBodyChange: (value: string) => void;
  onSend: () => void;
};

function ProjectChatTab({
  group,
  onlineUserIds,
  members,
  currentUserId,
  messages,
  modes,
  messageBody,
  logs,
  forceRelay,
  readOnly,
  onRefreshGroup,
  onToggleForceRelay,
  onMessageBodyChange,
  onSend,
}: ProjectChatTabProps) {
  return (
    <>
      <Text style={styles.heading}>Chat nhóm dự án</Text>
      <Text>
        Nhóm: {group?.id || "Đang đồng bộ"} · online{" "}
        {onlineUserIds.filter((id) => group?.members.includes(id)).length}/
        {group?.members.length || 0}
      </Text>
      <Text style={styles.muted}>
        Nhóm chat tự đồng bộ với thành viên dự án. Peer offline không nhận được
        tin mới; lịch sử đã lưu vẫn còn trên thiết bị.
      </Text>
      <Button label="Làm mới nhóm" onPress={onRefreshGroup} secondary />
      <Button
        label={forceRelay ? "Đang ép RELAY" : "Thử DIRECT trước"}
        onPress={onToggleForceRelay}
        secondary
      />
      {group?.members.map((id) => (
        <Text key={id}>
          {members.find((member) => member._id === id)?.name || id}:{" "}
          {onlineUserIds.includes(id) ? "online" : "offline"} ·{" "}
          {modes[id] || "chưa kết nối"}
        </Text>
      ))}
      {messages
        .filter((row) => row.message.groupId === group?.id)
        .map((row, index) => (
          <View
            style={styles.card}
            key={`${row.message.messageId}-${row.message.receiverId}-${index}`}
          >
            <Text style={styles.muted}>
              {row.message.senderId === currentUserId
                ? "Tôi"
                : members.find((member) => member._id === row.message.senderId)
                    ?.name || row.message.senderId}{" "}
              →{" "}
              {members.find((member) => member._id === row.message.receiverId)
                ?.name || row.message.receiverId}{" "}
              · {row.message.mode} · {row.status}
            </Text>
            <Text>{row.message.body}</Text>
          </View>
        ))}
      {!readOnly && (
        <TextField
          value={messageBody}
          onChangeText={onMessageBodyChange}
          placeholder="Tin nhắn"
        />
      )}
      {!readOnly && (
        <Button
          label="Gửi nhóm"
          onPress={onSend}
          disabled={!group || !messageBody.trim()}
        />
      )}
      <Text style={styles.heading}>Log peer</Text>
      {logs.slice(0, 20).map((line, index) => (
        <Text key={index} style={styles.muted}>
          {line}
        </Text>
      ))}
    </>
  );
}

export default memo(ProjectChatTab);
