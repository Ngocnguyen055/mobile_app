import type { Discussion, DiscussionComment, DocumentRow } from "../../types/api.ts";
import type { ChatUploadFile } from "./chat.ts";
import { API_URL, api, json } from "./client.ts";

const base = (projectId: string) => `/projects/${projectId}/discussions`;
export const getDiscussions = (projectId: string) => api<Discussion[]>(base(projectId));
export const getProjectDocuments = (projectId: string) =>
  api<DocumentRow[]>(`/projects/${projectId}/documents`);
export const projectDocumentUrl = (projectId: string, documentId: string) =>
  `${API_URL}/projects/${projectId}/documents/${documentId}`;
export const getDiscussionComments = (projectId: string, postId: string) =>
  api<DiscussionComment[]>(`${base(projectId)}/${postId}/comments`);

export function saveDiscussion(
  projectId: string,
  editing: Discussion | null,
  input: {
    title: string;
    body: string
  },
  files: ChatUploadFile[],
) {
  if (editing) return api<Discussion>(
    `${base(projectId)}/${editing._id}`,
    json("PATCH", { ...input, revision: editing.revision }),
  );
  if (!files.length) return api<Discussion>(base(projectId), json("POST", input));
  const form = new FormData();
  form.append("title", input.title);
  form.append("body", input.body);
  for (const file of files) form.append("files", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  } as unknown as Blob);
  return api<Discussion>(base(projectId), { method: "POST", body: form });
}

export const removeDiscussion = (projectId: string, postId: string) =>
  api(`${base(projectId)}/${postId}`, json("DELETE"));
export const setDiscussionHidden = (projectId: string, postId: string, hidden: boolean) =>
  api<Discussion>(`${base(projectId)}/${postId}/visibility`, json("PATCH", { hidden }));
export const removeDiscussionComment = (projectId: string, postId: string, commentId: string) =>
  api(`${base(projectId)}/${postId}/comments/${commentId}`, json("DELETE"));
export const saveDiscussionComment = (
  projectId: string,
  postId: string,
  editing: DiscussionComment | null,
  body: string,
) => api<DiscussionComment>(
  `${base(projectId)}/${postId}/comments${editing ? `/${editing._id}` : ""}`,
  json(editing ? "PATCH" : "POST", { body, ...(editing ? { revision: editing.revision } : {}) }),
);
