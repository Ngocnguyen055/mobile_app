import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import {
  getDiscussions,
  getProject,
  getProjectDocuments,
  getProjectEvents,
  getProjectProgress,
  getProjectTasks,
  loadProjectChatGroups,
  projectDocumentUrl,
  updateProjectResources,
} from "../services/api.ts";

import { ensureCachedProjectDocument } from "../services/attachmentCache.ts";
import type {
  CalendarEvent,
  Discussion,
  DocumentRow,
  Progress,
  Project,
} from "../types/api.ts";

type UseProjectWorkspaceOptions = {
  onReloadProject: (projectId: string) => Promise<unknown>;
  currentUserId?: string;
};

export function useProjectWorkspace({
  onReloadProject,
  currentUserId,
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
      chatGroupRows,
      taskRows,
      eventRows,
      discussionRows,
      documentRows,
      stats,
    ] = await Promise.all([
      getProject(projectId),
      loadProjectChatGroups(projectId),
      getProjectTasks(projectId),
      getProjectEvents(projectId),
      getDiscussions(projectId),
      getProjectDocuments(projectId),
      getProjectProgress(projectId),
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
    return { project: projectRow, chatGroups: chatGroupRows, tasks: taskRows };
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
    await updateProjectResources(project._id, {
      plannedHours: Number(resourceValues[0]), actualHours: Number(resourceValues[1]),
      plannedBudget: Number(resourceValues[2]), spentBudget: Number(resourceValues[3]), version: project.version,
    });
    await onReloadProject(project._id);
  };

  const downloadDocument = async (document: DocumentRow) => {
    if (!project || !currentUserId) return;
    const uri = await ensureCachedProjectDocument(
      currentUserId,
      project._id,
      document,
      projectDocumentUrl(project._id, document._id),
    );
    await Sharing.shareAsync(uri, { mimeType: document.mime });
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
