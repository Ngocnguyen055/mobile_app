import { useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import {
  API_URL,
  api,
  getToken,
  json,
  type CalendarEvent,
  type Discussion,
  type DocumentRow,
  type Progress,
  type Project,
  type Task,
} from "../services/api.ts";

type UseProjectWorkspaceOptions = {
  onReloadProject: (projectId: string) => Promise<unknown>;
};

export function useProjectWorkspace({
  onReloadProject,
}: UseProjectWorkspaceOptions) {
  const projectRef = useRef<Project | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [resourceValues, setResourceValues] = useState(["0", "0", "0", "0"]);

  const loadProjectWorkspace = async (projectId: string) => {
    const [
      projectRow,
      taskRows,
      eventRows,
      discussionRows,
      documentRows,
      stats,
    ] = await Promise.all([
      api<Project>(`/projects/${projectId}`),
      api<Task[]>(`/projects/${projectId}/tasks`),
      api<CalendarEvent[]>(`/projects/${projectId}/events`),
      api<Discussion[]>(`/projects/${projectId}/discussions`),
      api<DocumentRow[]>(`/projects/${projectId}/documents`),
      api<Progress>(`/projects/${projectId}/progress`),
    ]);
    projectRef.current = projectRow;
    setProject(projectRow);
    setEvents(eventRows);
    setDiscussions(discussionRows);
    setDocuments(documentRows);
    setProgress(stats);
    setResourceValues(
      [
        projectRow.plannedHours,
        projectRow.actualHours,
        projectRow.plannedBudget,
        projectRow.spentBudget,
      ].map(String),
    );
    return { project: projectRow, tasks: taskRows };
  };

  const resetProjectWorkspace = () => {
    projectRef.current = null;
    setProject(null);
    setEvents([]);
    setDiscussions([]);
    setDocuments([]);
    setProgress(null);
    setResourceValues(["0", "0", "0", "0"]);
  };

  const setResourceValue = (index: number, value: string) => {
    setResourceValues((current) =>
      current.map((item, itemIndex) => (index === itemIndex ? value : item)),
    );
  };

  const saveResources = async () => {
    if (!project) return;
    await api(
      `/projects/${project._id}/resources`,
      json("PATCH", {
        plannedHours: Number(resourceValues[0]),
        actualHours: Number(resourceValues[1]),
        plannedBudget: Number(resourceValues[2]),
        spentBudget: Number(resourceValues[3]),
        version: project.version,
      }),
    );
    await onReloadProject(project._id);
  };

  const downloadDocument = async (document: DocumentRow) => {
    if (!project || !FileSystem.documentDirectory) return;
    const safeName = document.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const destination = `${FileSystem.documentDirectory}${document._id}-${safeName}`;
    const file = await FileSystem.downloadAsync(
      `${API_URL}/projects/${project._id}/documents/${document._id}`,
      destination,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (file.status !== 200) throw new Error(`Tải thất bại: ${file.status}`);
    await Sharing.shareAsync(file.uri);
  };

  return {
    project,
    projectRef,
    events,
    discussions,
    documents,
    progress,
    resourceValues,
    loadProjectWorkspace,
    resetProjectWorkspace,
    setResourceValue,
    saveResources,
    downloadDocument,
  };
}
