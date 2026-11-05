import { useEffect, useState } from "react";
import {
  managedProjectsForMember,
  orderedProjectMembers
} from "../domain/projectPolicy.ts";
import { addProjectMember, getProject, removeProjectMember } from "../services/api.ts";
import type { Project, ProjectChildSummary, User } from "../types/api.ts";

export type ProjectManagementOptions = {
  project: Project;
  currentUserId: string;
  onChanged: () => Promise<unknown>;
  onError: (error: string) => void
};
export function useProjectManagement({
  project,
  currentUserId,
  onChanged,
  onError,
}: ProjectManagementOptions) {
  const [root, setRoot] = useState<Project | null>(null);
  const [email, setEmail] = useState("");
  const [memberError, setMemberError] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [manager, setManager] = useState("");
  const [appoint, setAppoint] = useState<User | null>(null);
  const [remove, setRemove] = useState<User | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [reassign, setReassign] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [restoreChildren, setRestoreChildren] = useState(false);
  const members = orderedProjectMembers(project, currentUserId);
  const children = (project.children || []).filter(
    (child): child is ProjectChildSummary => "managerId" in child,
  );
  const rootMembers = (
    project.parentProject ? root?.members || [] : project.members
  ).filter((m): m is User => typeof m !== "string");
  const writable = !project.archived;
  const requiredReplacements = remove
    ? managedProjectsForMember(project, remove._id)
    : [];
  useEffect(() => {
    setProjectName(project.name);
    setDescription(project.description || "");
    if (project.parentProject)
      void getProject(project.rootProject)
        .then(setRoot)
        .catch((e) => onError(String(e)));
    else setRoot(project);
    setManager(members.find((m) => m.role === "MANAGER")?._id || "");
  }, [project._id, project.version]);
  const run = async (
    action: () => Promise<unknown>,
    handleError?: (message: string) => void,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (handleError) handleError(message);
      else onError(message);
    } finally {
      setBusy(false);
    }
  };
  const removeMember = async () => {
    if (!remove) return;
    await removeProjectMember(project._id, remove._id, {
      version: project.version, reassignTo: reassign || null,
      replacementManagers: requiredReplacements.map(p => ({ projectId: p._id, userId: replacements[p._id] })),
    });
    setRemove(null);
    setReplacements({});
    setReassign("");
  };
  const availableRootMembers = rootMembers.filter(
    (member) => !members.some((current) => current._id === member._id),
  );
  const addMember = async () => {
    await addProjectMember(project._id, project.parentProject
      ? { userId: selectedMember, version: project.version }
      : { email: email.trim(), version: project.version });
    setEmail("");
    setSelectedMember("");
  };
  const addMemberDisabled =
    busy || (project.parentProject ? !selectedMember : !email.trim());
  const submitMember = () => {
    setMemberError("");
    void run(addMember, setMemberError);
  };

  return {
    root,
    setRoot,
    email,
    setEmail,
    memberError,
    setMemberError,
    selectedMember,
    setSelectedMember,
    manager,
    setManager,
    appoint,
    setAppoint,
    remove,
    setRemove,
    replacements,
    setReplacements,
    reassign,
    setReassign,
    busy,
    setBusy,
    projectName,
    setProjectName,
    description,
    setDescription,
    restoreChildren,
    setRestoreChildren,
    members,
    children,
    rootMembers,
    writable,
    requiredReplacements,
    run,
    removeMember,
    availableRootMembers,
    addMember,
    addMemberDisabled,
    submitMember,
  };
}
