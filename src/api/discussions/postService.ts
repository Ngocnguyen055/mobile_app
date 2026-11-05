import mongoose from "mongoose";
import { Discussion } from "../models.ts";
import {
  HttpError,
  projectAccess
} from "../projectAccess.ts";

import { canReadDiscussion } from "./policy.ts";
import { objectId } from "./schemas.ts";
export type Access = Awaited<ReturnType<typeof projectAccess>>;
export async function loadPost(
  projectId: string,
  postId: string,
  userId: string,
  access: Access,
  session?: mongoose.ClientSession,
) {
  const post = await Discussion.findOne({
    _id: objectId.parse(postId),
    project: projectId,
  }).session(session ?? null);
  if (
    !post ||
    !canReadDiscussion(
      !!post.hidden,
      String(post.author),
      userId,
      access.permissions.moderate,
    )
  )
    throw new HttpError(404, "discussion not found");
  return post;
}
export async function populatedPost(postId: string) {
  return Discussion.findById(postId)
    .populate("author", "name email")
    .populate("attachments", "name mime size uploader createdAt");
}
