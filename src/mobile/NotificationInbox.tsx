import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api, json, type InboxNotification } from "./api.ts";
import { formatViDateTime } from "./calendar.ts";
export default function NotificationInbox({ onOpen, onError }: { onOpen: (notification: InboxNotification) => Promise<unknown>; onError: (error: string) => void }) {
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => setItems(await api<InboxNotification[]>("/notifications"));
  const run = async (action: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await action(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  useEffect(() => { void run(load); }, []);
  return <>
    <Text style={s.heading}>Thông báo</Text>
    <Text style={s.muted}>Bài đăng, bình luận, thành viên và task trong phạm vi bạn tham gia. Nhắc deadline trên thiết bị vẫn được đặt trong mục Cá nhân.</Text>
    <View style={s.row}>
      <Pressable style={s.button} disabled={busy} onPress={() => void run(load)}><Text style={s.buttonText}>Làm mới</Text></Pressable>
      <Pressable style={s.button} disabled={busy} onPress={() => void run(async () => { await api("/notifications/read-all", json("PATCH")); await load(); })}><Text style={s.buttonText}>Đánh dấu đã đọc tất cả</Text></Pressable>
    </View>
    {!items.length && <Text style={s.muted}>Chưa có thông báo.</Text>}
    {items.map((item) => <Pressable accessibilityRole="button" key={item._id} style={[s.card, !item.readAt && s.unread]} disabled={busy} onPress={() => void run(async () => {
      if (!item.readAt) await api(`/notifications/${item._id}/read`, json("PATCH"));
      await load(); if (item.project) await onOpen(item);
    })}>
      <Text style={s.strong}>{item.readAt ? "" : "● "}{item.title}</Text><Text style={s.text}>{item.body}</Text><Text style={s.muted}>{item.project?.name || "Dự án không còn truy cập được"} · {formatViDateTime(item.createdAt)}</Text>
    </Pressable>)}
  </>;
}
const s = StyleSheet.create({ heading: { fontSize: 20, fontWeight: "700", color: "#0f172a" }, strong: { fontWeight: "700", color: "#0f172a" }, text: { color: "#0f172a", lineHeight: 21 }, muted: { color: "#64748b", fontSize: 12, lineHeight: 18 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, button: { padding: 10, borderRadius: 8, backgroundColor: "#2563eb" }, buttonText: { color: "#fff", fontWeight: "600" }, card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 12, gap: 7 }, unread: { borderColor: "#2563eb", backgroundColor: "#eff6ff" } });
