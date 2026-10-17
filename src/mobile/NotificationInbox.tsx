import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api, json, type InboxNotification } from "./api.ts";
import { formatViDateTime } from "./calendar.ts";
import { cardShadow, colors } from "./theme.ts";
export default function NotificationInbox({
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
const s = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  titleIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  titleIconText: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  titleCopy: { flex: 1 },
  heading: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.4,
  },
  strong: { flex: 1, fontWeight: "800", color: colors.text },
  text: { color: colors.text, lineHeight: 21 },
  muted: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  meta: { color: colors.textSoft, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 6 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: colors.primary,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
    padding: 14,
    gap: 8,
    ...cardShadow,
  },
  unread: { borderColor: "#C8CBFF", backgroundColor: "#FAFAFF" },
  notificationTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: { color: colors.accent, fontSize: 28, fontWeight: "900" },
});
