import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  roleLabels
} from "../../domain/projectPolicy.ts";
import { appointProjectManager, archiveProject, updateProject } from "../../services/api.ts";
import { styles as s } from "../../styles/projectManagement.ts";
import type { Project } from "../../types/api.ts";
import MemberDropdown from "../ui/MemberDropdown.tsx";

import { useProjectManagement } from "../../hooks/useProjectManagement.ts";
import { Action } from "./ManagementControls.tsx";
import ProjectMembersPanel from "./ProjectMembersPanel.tsx";
type Props = {
  project: Project;
  currentUserId: string;
  section: "members" | "management";
  onChanged: () => Promise<unknown>;
  onOpenProject: (projectId: string) => void;
  onError: (error: string) => void;
};

export default function ProjectManagementPanel({
  project,
  currentUserId,
  section,
  onChanged,
  onOpenProject,
  onError,
}: Props) {
  const controller = useProjectManagement({ project, currentUserId, onChanged, onError });
  const {
    root,
    manager,
    setManager,
    busy,
    projectName,
    setProjectName,
    description,
    setDescription,
    restoreChildren,
    setRestoreChildren,
    rootMembers,
    writable,
    run,
  } = controller;

  if (section === "members") return <ProjectMembersPanel project={project} currentUserId={currentUserId} controller={controller} />;
  return (
    <>
      <Text style={s.heading}>Quản lý dự án</Text>
      <Text style={s.muted}>
        {roleLabels[project.myRole]} ·{" "}
        {project.archived ? "Đã lưu trữ · chỉ xem" : "Đang hoạt động"}
      </Text>
      {project.parentProject && (
        <Action
          title="Mở dự án tổng"
          onPress={() => onOpenProject(project.rootProject)}
        />
      )}
      {project.permissions.manageProject && writable && (
        <View style={s.card}>
          <Text style={s.strong}>Thông tin dự án</Text>
          <TextInput
            style={s.input}
            value={projectName}
            onChangeText={setProjectName}
            placeholder="Tên dự án"
            placeholderTextColor="#64748b"
          />
          <TextInput
            style={s.input}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Mô tả"
            placeholderTextColor="#64748b"
          />
          <Action
            title="Lưu thông tin"
            disabled={busy || !projectName.trim()}
            onPress={() =>
              void run(() =>
                updateProject(project._id, { name: projectName.trim(), description, version: project.version }),
              )
            }
          />
        </View>
      )}
      {project.permissions.appointManager &&
        project.parentProject &&
        writable && (
          <View style={s.card}>
            <Text style={s.heading}>Bổ nhiệm / thay Trưởng phòng</Text>
            <Text style={s.muted}>
              Thay người quản lý cũng hủy vai trò Trưởng phòng của người cũ.
              Người mới phải thuộc dự án tổng.
            </Text>
            <MemberDropdown
              users={rootMembers.filter((m) => m.role !== "DIRECTOR")}
              value={manager}
              onChange={setManager}
              disabled={busy}
              loading={!root}
            />
            <Action
              title="Lưu Trưởng phòng"
              disabled={
                busy ||
                !rootMembers.some(
                  (m) => m._id === manager && m.role !== "DIRECTOR",
                )
              }
              onPress={() =>
                void run(() =>
                  appointProjectManager(project._id, manager, project.version),
                )
              }
            />
          </View>
        )}
      {project.permissions.manageProject && (
        <View style={s.card}>
          <Text style={s.heading}>
            {project.archived ? "Khôi phục dự án" : "Lưu trữ dự án"}
          </Text>
          <Text style={s.text}>
            {project.parentProject
              ? "Dự án đã lưu trữ chỉ được xem."
              : "Lưu trữ dự án tổng sẽ lưu trữ toàn bộ dự án con. Khi khôi phục, bạn chọn có khôi phục các dự án con hay không."}
          </Text>
          {project.archived &&
            !project.parentProject &&
            project.kind === "hierarchical" && (
              <Pressable
                style={s.choice}
                onPress={() => setRestoreChildren(!restoreChildren)}
              >
                <Text style={s.text}>
                  {restoreChildren ? "☑" : "☐"} Khôi phục cả các dự án con
                </Text>
              </Pressable>
            )}
          <Action
            title={project.archived ? "Khôi phục" : "Lưu trữ"}
            disabled={busy}
            onPress={() =>
              Alert.alert(
                project.archived ? "Khôi phục dự án?" : "Lưu trữ dự án?",
                project.name,
                [
                  { text: "Hủy" },
                  {
                    text: "Xác nhận",
                    onPress: () =>
                      void run(() =>
                        archiveProject(project._id, { archived: !project.archived, restoreChildren, version: project.version }),
                      ),
                  },
                ],
              )
            }
          />
        </View>
      )}
    </>
  );
}
