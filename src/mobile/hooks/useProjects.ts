import { useState } from "react";

import { api, json, type Project } from "../services/api.ts";
import { projectPageCount } from "../utils/projectList.ts";

type UseProjectsOptions = {
  onOpenProject: (projectId: string) => Promise<unknown>;
};

export function useProjects({ onOpenProject }: UseProjectsOptions) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectKind, setProjectKind] =
    useState<Project["kind"]>("independent");
  const [projectPage, setProjectPage] = useState(0);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectCreateVisible, setProjectCreateVisible] = useState(false);
  const [projectCreating, setProjectCreating] = useState(false);

  const setProjectRows = (rows: Project[]) => {
    setProjects(rows);
    setProjectPage((current) => Math.min(current, projectPageCount(rows) - 1));
  };

  const loadProjects = async () => {
    const rows = await api<Project[]>("/projects");
    setProjectRows(rows);
    return rows;
  };

  const createProject = async () => {
    if (!projectName.trim()) throw new Error("Vui lòng nhập tên dự án.");
    setProjectCreating(true);
    try {
      const created = await api<Project>(
        "/projects",
        json("POST", { name: projectName.trim(), kind: projectKind }),
      );
      setProjectName("");
      setProjectCreateVisible(false);
      setProjectPage(0);
      await loadProjects();
      await onOpenProject(created._id);
    } finally {
      setProjectCreating(false);
    }
  };

  const resetProjects = () => {
    setProjects([]);
    setProjectName("");
    setProjectKind("independent");
    setProjectPage(0);
    setProjectSearch("");
    setProjectCreateVisible(false);
    setProjectCreating(false);
  };

  return {
    projects,
    projectName,
    setProjectName,
    projectKind,
    setProjectKind,
    projectPage,
    setProjectPage,
    projectSearch,
    setProjectSearch,
    projectCreateVisible,
    setProjectCreateVisible,
    projectCreating,
    setProjectRows,
    loadProjects,
    createProject,
    resetProjects,
  };
}
