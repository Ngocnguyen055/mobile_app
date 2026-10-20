import React, { memo } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";

import type { StoredMessage } from "@ds01/shared";
import {
  chatAttachmentUrl,
  getToken,
  type ChatContact,
} from "../services/api.ts";
import { formatViDateTime } from "../utils/calendar.ts";
import Button from "../components/ui/Button.tsx";
import {
  directMessageStatusLabel,
  directMessagesForContact,
} from "../domain/directChatPolicy.ts";
import { styles } from "../styles/app.ts";

type MessagesScreenProps = {
  currentUserId: string;
  contacts: ChatContact[];
  contactsLoading: boolean;
  search: string;
  searchResults: ChatContact[];
  searching: boolean;
  blockedPeerIds: string[];
  onlineUserIds: string[];
  selectedContact: ChatContact | null;
  messages: StoredMessage[];
  selectedMessages: StoredMessage[];
  opening: boolean;
  modes: Record<string, string>;
  forceRelay: boolean;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onRefreshContacts: () => void;
  onOpenContact: (contact: ChatContact) => void;
  onShowContactActions: (contact: ChatContact) => void;
  onDownloadAttachment: (
    attachment: NonNullable<StoredMessage["message"]["attachments"]>[number],
  ) => void;
  onToggleForceRelay: () => void;
};

function MessagesScreen({
  currentUserId,
  contacts,
  contactsLoading,
  search,
  searchResults,
  searching,
  blockedPeerIds,
  onlineUserIds,
  selectedContact,
  messages,
  selectedMessages,
  opening,
  modes,
  forceRelay,
  onSearchChange,
  onSearch,
  onRefreshContacts,
  onOpenContact,
  onShowContactActions,
  onDownloadAttachment,
  onToggleForceRelay,
}: MessagesScreenProps) {
  if (!selectedContact) {
    const conversations = [...contacts].sort((left, right) => {
      const leftTime =
        directMessagesForContact(messages, currentUserId, left.id).at(-1)
          ?.message.timestamp || 0;
      const rightTime =
        directMessagesForContact(messages, currentUserId, right.id).at(-1)
          ?.message.timestamp || 0;
      return rightTime - leftTime || left.name.localeCompare(right.name, "vi");
    });

    return (
      <>
        <View style={styles.chatSearchRow}>
          <TextInput
            accessibilityLabel="Tìm người chat bằng email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Tìm bằng email..."
            placeholderTextColor="#64748b"
            returnKeyType="search"
            style={styles.chatSearchInput}
            value={search}
            onChangeText={onSearchChange}
            onSubmitEditing={onSearch}
          />
          <Pressable
            accessibilityRole="button"
            disabled={searching || search.trim().length < 3}
            onPress={onSearch}
            style={[
              styles.chatSearchButton,
              (searching || search.trim().length < 3) && styles.disabled,
            ]}
          >
            <Text style={styles.buttonText}>{searching ? "…" : "Tìm"}</Text>
          </Pressable>
        </View>
        {!!search.trim() && !searching && !searchResults.length && (
          <Text style={styles.chatSearchHint}>
            Không có kết quả đang hiển thị.
          </Text>
        )}
        {!!searchResults.length && (
          <View style={styles.searchResults}>
            {searchResults.map((contact) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Bắt đầu chat với ${contact.name}`}
                key={`search-${contact.id}`}
                onPress={() => onOpenContact(contact)}
                style={styles.searchResult}
              >
                <View style={styles.contactAvatar}>
                  <Text style={styles.contactAvatarText}>
                    {contact.name.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.contactText}>
                  <Text style={styles.strong}>{contact.name}</Text>
                  <Text style={styles.muted}>{contact.email}</Text>
                </View>
                <Text style={styles.openConversationIcon}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.chatListHeading}>
          <Text style={styles.heading}>Cuộc trò chuyện</Text>
          <Pressable
            accessibilityRole="button"
            disabled={contactsLoading}
            onPress={onRefreshContacts}
            style={styles.refreshChatButton}
          >
            <Text style={styles.refreshChatText}>
              {contactsLoading ? "Đang tải…" : "Làm mới"}
            </Text>
          </Pressable>
        </View>
        {conversations.map((contact) => {
          const history = directMessagesForContact(
            messages,
            currentUserId,
            contact.id,
          );
          const latest = history.at(-1);
          const contactOnline = onlineUserIds.includes(contact.id);
          const blocked = blockedPeerIds.includes(contact.id);
          const preview = latest
            ? latest.message.type === "attachment"
              ? `📎 ${latest.message.attachments?.[0]?.name || "Tệp đính kèm"}`
              : `${latest.message.senderId === currentUserId ? "Bạn: " : ""}${latest.message.body}`
            : blocked
              ? "Đã chặn"
              : "Chưa có tin nhắn";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mở chat với ${contact.name}`}
              key={contact.id}
              style={styles.contactCard}
              onPress={() => onOpenContact(contact)}
              onLongPress={() => onShowContactActions(contact)}
              delayLongPress={450}
            >
              <View style={styles.contactAvatar}>
                <Text style={styles.contactAvatarText}>
                  {contact.name.trim().charAt(0).toUpperCase()}
                </Text>
                <View
                  style={[
                    styles.presenceDot,
                    styles.contactPresenceDot,
                    contactOnline
                      ? styles.presenceOnline
                      : styles.presenceOffline,
                  ]}
                />
              </View>
              <View style={styles.contactText}>
                <View style={styles.contactTitleRow}>
                  <Text style={styles.strong}>{contact.name}</Text>
                  <Text style={styles.muted}>
                    {blocked
                      ? "Đã chặn"
                      : contactOnline
                        ? "Online"
                        : "Offline"}
                  </Text>
                </View>
                <Text style={styles.muted}>{contact.email}</Text>
                <Text numberOfLines={1} style={styles.contactPreview}>
                  {preview}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {!contactsLoading && !conversations.length && (
          <View style={styles.emptyCard}>
            <Text style={styles.strong}>Chưa có cuộc trò chuyện</Text>
            <Text style={styles.muted}>
              Tìm người dùng bằng email ở phía trên để bắt đầu chat.
            </Text>
          </View>
        )}
        {!!conversations.length && (
          <Text style={styles.longPressHint}>
            Nhấn giữ một cuộc trò chuyện để xóa hoặc chặn người dùng.
          </Text>
        )}
      </>
    );
  }

  const contactOnline = onlineUserIds.includes(selectedContact.id);
  const contactBlocked = blockedPeerIds.includes(selectedContact.id);
  const visibleMessages = directMessagesForContact(
    selectedMessages,
    currentUserId,
    selectedContact.id,
  );

  return (
    <>
      <View style={styles.directStatusCard}>
        <Text style={styles.muted}>
          {contactBlocked
            ? "Bạn đã chặn người dùng này. Tin nhắn mới sẽ bị từ chối."
            : contactOnline
              ? `Đang online · ${modes[selectedContact.id] || "chưa chọn đường truyền"}`
              : "Đang offline · không có hàng đợi giao tin offline"}
        </Text>
        <View style={styles.wrap}>
          <Button
            label="Làm mới trạng thái"
            onPress={() => onOpenContact(selectedContact)}
            disabled={opening}
            secondary
          />
          <Button
            label={forceRelay ? "Đang ép RELAY" : "DIRECT trước"}
            onPress={onToggleForceRelay}
            secondary
          />
        </View>
      </View>
      {opening && !visibleMessages.length && (
        <Text style={styles.muted}>Đang tải lịch sử trên thiết bị…</Text>
      )}
      {!opening && !visibleMessages.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.muted}>
            Chưa có tin nhắn với {selectedContact.name}.
          </Text>
        </View>
      )}
      {visibleMessages.map((row) => {
        const outgoing = row.message.senderId === currentUserId;
        const route =
          row.status === "pending" ? "Đang chọn đường truyền" : row.message.mode;
        return (
          <View
            key={`${row.message.messageId}-${row.message.senderId}-${row.message.receiverId}`}
            style={[
              styles.messageRow,
              outgoing ? styles.messageRowOutgoing : styles.messageRowIncoming,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                outgoing ? styles.messageOutgoing : styles.messageIncoming,
                row.status === "failed" && styles.messageFailed,
              ]}
            >
              {(row.message.attachments || []).map((attachment) =>
                attachment.mime.startsWith("image/") ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mở ảnh ${attachment.name}`}
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
                    <Text numberOfLines={1} style={styles.attachmentName}>
                      {attachment.name}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Tải tệp ${attachment.name}`}
                    key={attachment.id}
                    onPress={() => onDownloadAttachment(attachment)}
                    style={styles.fileAttachment}
                  >
                    <Text style={styles.fileAttachmentIcon}>📎</Text>
                    <View style={styles.contactText}>
                      <Text numberOfLines={2} style={styles.attachmentName}>
                        {attachment.name}
                      </Text>
                      <Text style={styles.messageMeta}>
                        {Math.ceil(attachment.size / 1024)} KiB · Chạm để mở
                      </Text>
                    </View>
                  </Pressable>
                ),
              )}
              {!!row.message.body && (
                <Text style={styles.messageBody}>{row.message.body}</Text>
              )}
              <Text style={styles.messageMeta}>
                {formatViDateTime(row.message.timestamp)} · {route} ·{" "}
                {directMessageStatusLabel(row.status, outgoing)}
              </Text>
            </View>
          </View>
        );
      })}
    </>
  );
}

export default memo(MessagesScreen);
