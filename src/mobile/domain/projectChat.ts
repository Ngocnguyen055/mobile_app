import type { Project } from "../types/api.ts";
import type { ChatGroup } from "./chat.ts";
export function chatGroupForProject(project: Project): ChatGroup | null {
  if (!project.chatGroupId) return null;
  return {
    id: project.chatGroupId,
    name: "Chung",
    isDefault: true,
    ownerId: project.owner,
    members: [
      ...new Set(
        project.members.map((member) =>
          typeof member === "string" ? member : member._id,
        ),
      ),
    ],
    version: project.version,
    projectId: project._id,
    archived: project.archived,
  };
}
