import type { Task } from "../../types/api.ts";
import { api, json } from "./client.ts";

export type TaskInput = {
  title: string;
  description: string;
  assignee: string | null;
  startsAt: string;
  dueAt: string;
};

export const getProjectTasks = (projectId: string) =>
  api<Task[]>(`/projects/${projectId}/tasks`);
export const postTask = (projectId: string, input: TaskInput) =>
  api<Task>(`/projects/${projectId}/tasks`, json("POST", input));
export const patchTask = (
  projectId: string,
  taskId: string,
  input: Partial<TaskInput> & {
    version: number;
    status?: Task["status"]
  },
) => api<Task>(`/projects/${projectId}/tasks/${taskId}`, json("PATCH", input));
export const removeTask = (projectId: string, taskId: string) =>
  api<{ ok: true }>(`/projects/${projectId}/tasks/${taskId}`, json("DELETE"));
