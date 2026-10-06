import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { api, json, type Discussion, type DiscussionComment, type DocumentRow, type Project } from "./api.ts";
import { formatViDateTime } from "./calendar.ts";
import { idOf } from "./projectPolicy.ts";

type Props = { project: Project; userId: string; posts: Discussion[]; legacyDocuments: DocumentRow[]; onChanged: () => Promise<unknown>; onDownload: (document: DocumentRow) => Promise<unknown>; onError: (error: string) => void };
function Action({ title, action, disabled = false }: { title: string; action: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
export default function DiscussionPanel({ project, userId, posts, legacyDocuments, onChanged, onDownload, onError }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<Discussion | null>(null);
  const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [openPost, setOpenPost] = useState("");
  const [comments, setComments] = useState<Record<string, DiscussionComment[]>>({});
  const [commentBody, setCommentBody] = useState("");
  const [editingComment, setEditingComment] = useState<DiscussionComment | null>(null);
  const [busy, setBusy] = useState(false);
  const writable = !project.archived;
  const run = async (action: () => Promise<unknown>, reload = true) => {
    if (busy) return;
    setBusy(true);
    try { await action(); if (reload) await onChanged(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const base = `/projects/${project._id}/discussions`;
  const loadComments = async (id: string) => {
    const rows = await api<DiscussionComment[]>(`${base}/${id}/comments`);
    setComments((current) => ({ ...current, [id]: rows }));
  };
  const reset = () => { setTitle(""); setBody(""); setEditing(null); setFiles([]); };
  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const next = [...files, ...result.assets];
    if (next.length > 3) throw new Error("Mỗi bài tối đa 3 tệp.");
    if (next.some((file) => (file.size || 0) > 512 * 1024)) throw new Error("Mỗi tệp tối đa 512 KiB.");
    setFiles(next);
  };
  const savePost = async () => {
    if (!title.trim() || (!body.trim() && !files.length && !editing?.attachments?.length)) throw new Error("Nhập chủ đề và nội dung hoặc đính kèm tệp.");
    if (editing) await api(`${base}/${editing._id}`, json("PATCH", { title: title.trim(), body: body.trim(), revision: editing.revision }));
    else if (files.length) {
      const form = new FormData(); form.append("title", title.trim()); form.append("body", body.trim());
      for (const file of files) form.append("files", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as unknown as Blob);
      await api(base, { method: "POST", body: form });
    } else await api(base, json("POST", { title: title.trim(), body: body.trim() }));
    reset();
  };
  const confirmDelete = (title: string, action: () => Promise<unknown>) => Alert.alert(title, "Thao tác này xóa nội dung khỏi dự án.", [{ text: "Hủy" }, { text: "Xóa", style: "destructive", onPress: () => void run(action) }]);
  const linkedIds = new Set(posts.flatMap((p) => (p.attachments || []).map((file) => file._id)));
  const legacy = legacyDocuments.filter((document) => !linkedIds.has(document._id));
  return <>
    <Text style={s.heading}>Bảng thảo luận</Text>
    <Text style={s.muted}>Bài đăng và bình luận lưu trên máy chủ. Tệp / ảnh đính kèm tối đa 3 tệp, mỗi tệp 512 KiB.</Text>
    {writable && <View style={s.card}>
      <Text style={s.strong}>{editing ? "Sửa bài của bạn" : "Đăng bài mới"}</Text>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Chủ đề" placeholderTextColor="#64748b" maxLength={120} />
      <TextInput style={[s.input, s.multiline]} value={body} onChangeText={setBody} multiline textAlignVertical="top" placeholder="Nội dung" placeholderTextColor="#64748b" maxLength={5000} />
      {!editing && <Action title="Đính kèm tệp / ảnh" action={() => void run(pickFiles, false)} disabled={busy || files.length >= 3} />}
      {files.map((file, index) => <View key={`${file.uri}-${index}`} style={s.row}><Text style={s.fileText}>{file.name} · {Math.ceil((file.size || 0) / 1024)} KiB</Text><Action title="Bỏ" action={() => setFiles((current) => current.filter((_, i) => i !== index))} /></View>)}
      <Action title={busy ? "Đang xử lý…" : editing ? "Lưu bài" : "Đăng"} action={() => void run(savePost)} disabled={busy || !title.trim() || (!body.trim() && !files.length && !editing?.attachments?.length)} />
      {!!editing && <Action title="Hủy sửa" action={reset} disabled={busy} />}
    </View>}
    {!posts.length && <Text style={s.muted}>Chưa có bài thảo luận.</Text>}
    {posts.map((post) => <View key={post._id} style={s.card}>
      <Text style={s.strong}>{post.title}{post.hidden ? " · Đã ẩn" : ""}</Text><Text style={s.text}>{post.body}</Text><Text style={s.muted}>{post.author?.name} · {formatViDateTime(post.createdAt)}</Text>
      {(post.attachments || []).map((document) => <Action key={document._id} title={`↓ ${document.name} · ${Math.ceil(document.size / 1024)} KiB`} action={() => void run(() => onDownload(document), false)} disabled={busy} />)}
      {writable && <View style={s.wrap}>
        {idOf(post.author) === userId && <Action title="Sửa bài" action={() => { setEditing(post); setTitle(post.title); setBody(post.body); setFiles([]); }} />}
        {(idOf(post.author) === userId || project.permissions.moderate) && <Action title="Xóa bài" action={() => confirmDelete("Xóa bài đăng?", () => api(`${base}/${post._id}`, json("DELETE")))} disabled={busy} />}
        {project.permissions.moderate && <Action title={post.hidden ? "Hiện lại bài" : "Ẩn bài"} action={() => void run(() => api(`${base}/${post._id}/visibility`, json("PATCH", { hidden: !post.hidden })))} disabled={busy} />}
      </View>}
      <Action title={openPost === post._id ? "Thu gọn bình luận ▴" : `Bình luận (${post.commentCount || 0}) ▾`} disabled={busy} action={() => void run(async () => { if (openPost === post._id) setOpenPost(""); else { setOpenPost(post._id); setEditingComment(null); setCommentBody(""); await loadComments(post._id); } }, false)} />
      {openPost === post._id && <>
        <ScrollView
          accessibilityLabel={`Bình luận của bài ${post.title}`}
          style={s.commentScroll}
          contentContainerStyle={s.commentList}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          persistentScrollbar
          keyboardShouldPersistTaps="handled"
        >
          {!comments[post._id]?.length && <Text style={s.muted}>Chưa có bình luận.</Text>}
          {(comments[post._id] || []).map((comment) => <View style={s.comment} key={comment._id}>
            <Text style={s.text}>{comment.body}</Text><Text style={s.muted}>{comment.author?.name} · {formatViDateTime(comment.createdAt)}</Text>
            {writable && <View style={s.wrap}>
              {idOf(comment.author) === userId && <Action title="Sửa" action={() => { setEditingComment(comment); setCommentBody(comment.body); }} />}
              {(idOf(comment.author) === userId || project.permissions.moderate) && <Action title="Xóa" action={() => confirmDelete("Xóa bình luận?", async () => { await api(`${base}/${post._id}/comments/${comment._id}`, json("DELETE")); await loadComments(post._id); })} disabled={busy} />}
            </View>}
          </View>)}
        </ScrollView>
        {writable && <>
          <TextInput style={[s.input, s.multiline]} multiline textAlignVertical="top" value={commentBody} onChangeText={setCommentBody} placeholder={editingComment ? "Sửa bình luận của bạn" : "Viết bình luận"} placeholderTextColor="#64748b" maxLength={2000} />
          <Action title={editingComment ? "Lưu bình luận" : "Gửi bình luận"} disabled={busy || !commentBody.trim()} action={() => void run(async () => {
            await api(editingComment ? `${base}/${post._id}/comments/${editingComment._id}` : `${base}/${post._id}/comments`, json(editingComment ? "PATCH" : "POST", { body: commentBody.trim(), ...(editingComment ? { revision: editingComment.revision } : {}) }));
            setCommentBody(""); setEditingComment(null); await loadComments(post._id);
          })} />
          {!!editingComment && <Action title="Hủy sửa bình luận" action={() => { setEditingComment(null); setCommentBody(""); }} />}
        </>}
      </>}
    </View>)}
    {!!legacy.length && <><Text style={s.heading}>Tài liệu đã tải lên trước đây</Text>{legacy.map((document) => <Action key={document._id} title={`↓ ${document.name} · ${Math.ceil(document.size / 1024)} KiB`} action={() => void run(() => onDownload(document), false)} disabled={busy} />)}</>}
  </>;
}
const s = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: "700", color: "#0f172a", marginVertical: 8 }, strong: { fontSize: 15, fontWeight: "700", color: "#0f172a" }, text: { color: "#0f172a", lineHeight: 21 }, muted: { fontSize: 12, color: "#64748b", lineHeight: 18 },
  card: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#fff", padding: 12, gap: 8, marginVertical: 5 },
  input: { color: "#0f172a", borderWidth: 1, borderColor: "#94a3b8", borderRadius: 8, padding: 10, backgroundColor: "#fff" }, multiline: { minHeight: 70 },
  button: { backgroundColor: "#2563eb", borderRadius: 7, padding: 9, marginVertical: 2 }, buttonText: { color: "#fff", fontWeight: "600" }, disabled: { opacity: 0.4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, row: { flexDirection: "row", alignItems: "center", gap: 5 }, fileText: { flex: 1, color: "#0f172a" }, comment: { backgroundColor: "#f1f5f9", padding: 10, borderRadius: 7, gap: 4 },
  commentScroll: { maxHeight: 260, flexGrow: 0, borderRadius: 7 },
  commentList: { gap: 8, paddingRight: 8, paddingBottom: 2 },
});
