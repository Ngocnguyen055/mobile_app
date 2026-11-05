import type { Progress, Project } from "../../types/api.ts";
import { api, json } from "./client.ts";

export const listProjects = () => api<Project[]>("/projects");
export const getProject = (projectId: string) =>
  api<Project>(`/projects/${projectId}`);
export const postProject = (name: string, kind: Project["kind"]) =>
  api<Project>("/projects", json("POST", { name, kind }));
export const getProjectProgress = (projectId: string) =>
  api<Progress>(`/projects/${projectId}/progress`);

export function createChildProject(
  projectId: string,
  input: {
    name: string;
    managerId: string;
    version: number
  },
) {
  return api<Project>(`/projects/${projectId}/children`, json("POST", input));
}

export function updateProject(
  projectId: string,
  input: {
    name: string;
    description: string;
    version: number
  },
) {
  return api<Project>(`/projects/${projectId}`, json("PATCH", input));
}

export function addProjectMember(
  projectId: string,
  input: {
    userId: string;
    version: number
  } | {
    email: string;
    version: number
  },
) {
  return api<Project>(`/projects/${projectId}/members`, json("POST", input));
}

export function removeProjectMember(
  projectId: string,
  userId: string,
  input: {
    version: number;
    reassignTo: string | null;
    replacementManagers: {
      projectId: string;
      userId: string
    }[];
  },
) {
  return api<{ ok: true }>(
    `/projects/${projectId}/members/${userId}`,
    json("DELETE", input),
  );
}

export function appointProjectManager(projectId: string, userId: string, version: number) {
  return api<Project>(`/projects/${projectId}/manager`, json("PUT", { userId, version }));
}

export function archiveProject(
  projectId: string,
  input: {
    archived: boolean;
    restoreChildren: boolean;
    version: number
  },
) {
  return api<Project>(`/projects/${projectId}/archive`, json("PATCH", input));
}

export function updateProjectResources(
  projectId: string,
  input: Pick<Project, "plannedHours" | "actualHours" | "plannedBudget" | "spentBudget" | "version">,
) {
  return api<Project>(`/projects/${projectId}/resources`, json("PATCH", input));
}
