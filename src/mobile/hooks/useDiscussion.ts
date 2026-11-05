import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import {
  Alert
} from "react-native";
import { getDiscussionComments, saveDiscussion } from "../services/api.ts";
import type { Discussion, DiscussionComment, Project } from "../types/api.ts";
import { selectedAttachmentValidationError } from "../utils/attachments.ts";

type Options = {
  project: Project;
  onChanged: () => Promise<unknown>;
  onError: (error: string) => void
};
export function useDiscussion({ project, onChanged, onError }: Options) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<Discussion | null>(null);
  const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [openPost, setOpenPost] = useState("");
  const [comments, setComments] = useState<Record<string, DiscussionComment[]>>(
    {},
  );
  const [commentBody, setCommentBody] = useState("");
  const [editingComment, setEditingComment] =
    useState<DiscussionComment | null>(null);
  const [busy, setBusy] = useState(false);
  const writable = !project.archived;
  const run = async (action: () => Promise<unknown>, reload = true) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (reload) await onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      onError(message);
      if (editorVisible) setEditorError(message);
    } finally {
      setBusy(false);
    }
  };
  const loadComments = async (id: string) => {
    const rows = await getDiscussionComments(project._id, id);
    setComments((current) => ({ ...current, [id]: rows }));
  };
  const reset = () => {
    setTitle("");
    setBody("");
    setEditing(null);
    setFiles([]);
    setEditorError("");
    setEditorVisible(false);
  };
  const openNewPost = () => {
    setTitle("");
    setBody("");
    setEditing(null);
    setFiles([]);
    setEditorError("");
    setEditorVisible(true);
  };
  const openPostEditor = (post: Discussion) => {
    setEditing(post);
    setTitle(post.title);
    setBody(post.body);
    setFiles([]);
    setEditorError("");
    setEditorVisible(true);
  };
  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const validationError = await selectedAttachmentValidationError(
      files.length,
      result.assets,
    );
    if (validationError) {
      Alert.alert("Không thể đính kèm tệp", validationError);
      return;
    }
    const next = [...files, ...result.assets];
    setFiles(next);
  };
  const savePost = async () => {
    if (
      !title.trim() ||
      (!body.trim() && !files.length && !editing?.attachments?.length)
    )
      throw new Error("Nhập chủ đề và nội dung hoặc đính kèm tệp.");
    await saveDiscussion(project._id, editing, { title: title.trim(), body: body.trim() }, files);
    reset();
  };
  const confirmDelete = (title: string, action: () => Promise<unknown>) =>
    Alert.alert(title, "Thao tác này xóa nội dung khỏi dự án.", [
      { text: "Hủy" },
      { text: "Xóa", style: "destructive", onPress: () => void run(action) },
    ]);

  const postReady =
    !!title.trim() &&
    !!(body.trim() || files.length || editing?.attachments?.length);
  return {
    title,
    setTitle,
    body,
    setBody,
    editing,
    setEditing,
    files,
    setFiles,
    editorVisible,
    setEditorVisible,
    editorError,
    setEditorError,
    openPost,
    setOpenPost,
    comments,
    setComments,
    commentBody,
    setCommentBody,
    editingComment,
    setEditingComment,
    busy,
    setBusy,
    writable,
    run,
    loadComments,
    reset,
    openNewPost,
    openPostEditor,
    pickFiles,
    savePost,
    confirmDelete,
    postReady,
  };
}
