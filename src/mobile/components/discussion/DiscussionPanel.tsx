import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { idOf } from "../../domain/projectPolicy.ts";
import {
  removeDiscussion,
  removeDiscussionComment,
  saveDiscussionComment,
  setDiscussionHidden,
} from "../../services/api.ts";
import { styles as s } from "../../styles/discussion.ts";
import type { Discussion, DocumentRow, Project } from "../../types/api.ts";
import { formatViDateTime } from "../../utils/calendar.ts";

import { useDiscussion } from "../../hooks/useDiscussion.ts";
import PostEditorModal from "./PostEditorModal.tsx";
type Props = {
  project: Project;
  userId: string;
  posts: Discussion[];
  legacyDocuments: DocumentRow[];
  onChanged: () => Promise<unknown>;
  onDownload: (document: DocumentRow) => Promise<unknown>;
  onError: (error: string) => void;
};
function Action({
  title,
  action,
  disabled = false,
}: {
  title: string;
  action: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={action}
      style={[s.button, disabled && s.disabled]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}

export default function DiscussionPanel({
  project,
  userId,
  posts,
  legacyDocuments,
  onChanged,
  onDownload,
  onError,
}: Props) {
  const controller = useDiscussion({ project, onChanged, onError });
  const {
    openPost,
    setOpenPost,
    comments,
    commentBody,
    setCommentBody,
    editingComment,
    setEditingComment,
    busy,
    writable,
    run,
    loadComments,
    openNewPost,
    openPostEditor,
    confirmDelete,
  } = controller;

  const linkedIds = new Set(
    posts.flatMap((p) => (p.attachments || []).map((file) => file._id)),
  );
  const legacy = legacyDocuments.filter(
    (document) => !linkedIds.has(document._id),
  );

  return (
    <>
      <Text style={s.heading}>Bảng thảo luận</Text>
      {writable && (
        <Pressable
          accessibilityRole="button"
          onPress={openNewPost}
          style={({ pressed }) => [
            s.createPostButton,
            pressed && s.buttonPressed,
          ]}
        >
          <Text style={s.createPostIcon}>＋</Text>
          <Text style={s.createPostText}>Đăng bài mới</Text>
        </Pressable>
      )}
      <PostEditorModal controller={controller} />

      {!posts.length && <Text style={s.muted}>Chưa có bài thảo luận.</Text>}
      {posts.map((post) => (
        <View key={post._id} style={s.card}>
          <Text style={s.strong}>
            {post.title}
            {post.hidden ? " · Đã ẩn" : ""}
          </Text>
          <Text style={s.text}>{post.body}</Text>
          <Text style={s.muted}>
            {post.author?.name} · {formatViDateTime(post.createdAt)}
          </Text>
          {(post.attachments || []).map((document) => (
            <Action
              key={document._id}
              title={`↓ ${document.name} · ${Math.ceil(document.size / 1024)} KiB`}
              action={() => void run(() => onDownload(document), false)}
              disabled={busy}
            />
          ))}
          {writable && (
            <View style={s.wrap}>
              {idOf(post.author) === userId && (
                <Action title="Sửa bài" action={() => openPostEditor(post)} />
              )}
              {(idOf(post.author) === userId ||
                project.permissions.moderate) && (
                  <Action
                    title="Xóa bài"
                    action={() =>
                      confirmDelete("Xóa bài đăng?", () =>
                        removeDiscussion(project._id, post._id),
                      )
                    }
                    disabled={busy}
                  />
                )}
              {project.permissions.moderate && (
                <Action
                  title={post.hidden ? "Hiện lại bài" : "Ẩn bài"}
                  action={() =>
                    void run(() =>
                      setDiscussionHidden(project._id, post._id, !post.hidden),
                    )
                  }
                  disabled={busy}
                />
              )}
            </View>
          )}
          <Action
            title={
              openPost === post._id
                ? "Thu gọn bình luận ▴"
                : `Bình luận (${post.commentCount || 0}) ▾`
            }
            disabled={busy}
            action={() =>
              void run(async () => {
                if (openPost === post._id) setOpenPost("");
                else {
                  setOpenPost(post._id);
                  setEditingComment(null);
                  setCommentBody("");
                  await loadComments(post._id);
                }
              }, false)
            }
          />
          {openPost === post._id && (
            <>
              <ScrollView
                accessibilityLabel={`Bình luận của bài ${post.title}`}
                style={s.commentScroll}
                contentContainerStyle={s.commentList}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                persistentScrollbar
                keyboardShouldPersistTaps="handled"
              >
                {!comments[post._id]?.length && (
                  <Text style={s.muted}>Chưa có bình luận.</Text>
                )}
                {(comments[post._id] || []).map((comment) => (
                  <View style={s.comment} key={comment._id}>
                    <Text style={s.text}>{comment.body}</Text>
                    <Text style={s.muted}>
                      {comment.author?.name} ·{" "}
                      {formatViDateTime(comment.createdAt)}
                    </Text>
                    {writable && (
                      <View style={s.wrap}>
                        {idOf(comment.author) === userId && (
                          <Action
                            title="Sửa"
                            action={() => {
                              setEditingComment(comment);
                              setCommentBody(comment.body);
                            }}
                          />
                        )}
                        {(idOf(comment.author) === userId ||
                          project.permissions.moderate) && (
                            <Action
                              title="Xóa"
                              action={() =>
                                confirmDelete("Xóa bình luận?", async () => {
                                  await removeDiscussionComment(project._id, post._id, comment._id);
                                  await loadComments(post._id);
                                })
                              }
                              disabled={busy}
                            />
                          )}
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
              {writable && (
                <>
                  <TextInput
                    style={[s.input, s.multiline]}
                    multiline
                    textAlignVertical="top"
                    value={commentBody}
                    onChangeText={setCommentBody}
                    placeholder={
                      editingComment
                        ? "Sửa bình luận của bạn"
                        : "Viết bình luận"
                    }
                    placeholderTextColor="#64748b"
                    maxLength={2000}
                  />
                  <Action
                    title={editingComment ? "Lưu bình luận" : "Gửi bình luận"}
                    disabled={busy || !commentBody.trim()}
                    action={() =>
                      void run(async () => {
                        await saveDiscussionComment(project._id, post._id, editingComment, commentBody.trim());
                        setCommentBody("");
                        setEditingComment(null);
                        await loadComments(post._id);
                      })
                    }
                  />
                  {!!editingComment && (
                    <Action
                      title="Hủy sửa bình luận"
                      action={() => {
                        setEditingComment(null);
                        setCommentBody("");
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </View>
      ))}
      {!!legacy.length && (
        <>
          <Text style={s.heading}>Tài liệu đã tải lên trước đây</Text>
          {legacy.map((document) => (
            <Action
              key={document._id}
              title={`↓ ${document.name} · ${Math.ceil(document.size / 1024)} KiB`}
              action={() => void run(() => onDownload(document), false)}
              disabled={busy}
            />
          ))}
        </>
      )}
    </>
  );
}
