import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, json, type InboxNotification } from "../services/api.ts";
import { formatViDateTime } from "../utils/calendar.ts";
import { styles as s } from "../styles/notifications.ts";
export default function NotificationsScreen({
  onOpen,
  onError,
}: {
  onOpen: (notification: InboxNotification) => Promise<unknown>;
  onError: (error: string) => void;
}) {
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () =>
    setItems(await api<InboxNotification[]>("/notifications"));
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <>
      <View style={s.titleRow}>
        <View style={s.titleIcon}>
          <Text style={s.titleIconText}>🔔</Text>
        </View>
        <View style={s.titleCopy}>
          <Text style={s.heading}>Thông báo</Text>
          <Text style={s.muted}>Cập nhật mới từ các dự án bạn tham gia.</Text>
        </View>
      </View>
      <View style={s.row}>
        <Pressable
          style={s.button}
          disabled={busy}
          onPress={() => void run(load)}
        >
          <Text style={s.buttonText}>Làm mới</Text>
        </Pressable>
        <Pressable
          style={s.button}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await api("/notifications/read-all", json("PATCH"));
              await load();
            })
          }
        >
          <Text style={s.buttonText}>Đánh dấu đã đọc tất cả</Text>
        </Pressable>
      </View>
      {!items.length && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>✓</Text>
          <Text style={s.strong}>Bạn đã xem hết!</Text>
          <Text style={s.muted}>Chưa có thông báo mới.</Text>
        </View>
      )}
      {items.map((item) => (
        <Pressable
          accessibilityRole="button"
          key={item._id}
          style={[s.card, !item.readAt && s.unread]}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              if (!item.readAt)
                await api(`/notifications/${item._id}/read`, json("PATCH"));
              await load();
              if (item.project) await onOpen(item);
            })
          }
        >
          <View style={s.notificationTitle}>
            <Text style={s.strong}>{item.title}</Text>
            {!item.readAt && <View style={s.unreadDot} />}
          </View>
          <Text style={s.text}>{item.body}</Text>
          <Text style={s.meta}>
            {item.project?.name || "Dự án không còn truy cập được"} ·{" "}
            {formatViDateTime(item.createdAt)}
          </Text>
        </Pressable>
      ))}
    </>
  );
}
