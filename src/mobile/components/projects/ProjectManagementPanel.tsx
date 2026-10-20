import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, json, type Project, type User } from "../../services/api.ts";
import {
  idOf,
  managedProjectsForMember,
  memberDisplayRole,
  orderedProjectMembers,
  roleLabels,
} from "../../domain/projectPolicy.ts";
import MemberDropdown from "../ui/MemberDropdown.tsx";
import { styles as s } from "../../styles/projectManagement.ts";

type Props = {
  project: Project;
  section: "members" | "management";
  onChanged: () => Promise<unknown>;
  onOpenProject: (projectId: string) => void;
  onError: (error: string) => void;
};
function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && s.disabled]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
function Picker({
  users,
  value,
  onChange,
  emptyLabel,
}: {
  users: User[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
}) {
  return (
    <View style={s.wrap}>
      {!!emptyLabel && (
        <Pressable
          onPress={() => onChange("")}
          style={[s.choice, !value && s.selected]}
        >
          <Text style={!value ? s.selectedText : s.text}>{emptyLabel}</Text>
        </Pressable>
      )}
      {users.map((user) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: value === user._id }}
          key={user._id}
          onPress={() => onChange(user._id)}
          style={[s.choice, value === user._id && s.selected]}
        >
          <Text style={value === user._id ? s.selectedText : s.text}>
            {user.name} · {user.email}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export default function ProjectManagementPanel({
  project,
  section,
  onChanged,
  onOpenProject,
  onError,
}: Props) {
  const [root, setRoot] = useState<Project | null>(null);
  const [email, setEmail] = useState("");
  const [memberError, setMemberError] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [childName, setChildName] = useState("");
  const [childManager, setChildManager] = useState("");
  const [manager, setManager] = useState("");
  const [remove, setRemove] = useState<User | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [reassign, setReassign] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [restoreChildren, setRestoreChildren] = useState(false);
  const members = orderedProjectMembers(project);
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
      void api<Project>(`/projects/${project.rootProject}`)
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
    await api(
      `/projects/${project._id}/members/${remove._id}`,
      json("DELETE", {
        version: project.version,
        reassignTo: reassign || null,
        replacementManagers: requiredReplacements.map((p) => ({
          projectId: p._id,
          userId: replacements[p._id],
        })),
      }),
    );
    setRemove(null);
    setReplacements({});
    setReassign("");
  };
  const availableRootMembers = rootMembers.filter(
    (member) => !members.some((current) => current._id === member._id),
  );
  const addMember = async () => {
    await api(
      `/projects/${project._id}/members`,
      json(
        "POST",
        project.parentProject
          ? { userId: selectedMember, version: project.version }
          : { email: email.trim(), version: project.version },
      ),
    );
    setEmail("");
    setSelectedMember("");
  };
  const addMemberDisabled =
    busy || (project.parentProject ? !selectedMember : !email.trim());
  const submitMember = () => {
    setMemberError("");
    void run(addMember, setMemberError);
  };
  if (section === "members")
    return (
      <>
        <View style={s.membersHeadingRow}>
          <Text style={s.heading}>
            Thành viên ·{" "}
            {project.kind === "hierarchical"
              ? "Dự án phân cấp"
              : "Dự án độc lập"}
          </Text>
          <View style={s.memberCountBadge}>
            <Text style={s.memberCountText}>{members.length}</Text>
          </View>
        </View>
        {project.permissions.manageMembers && writable && (
          <View style={s.addMemberPanel}>
            <View style={s.addMemberHeader}>
              <View style={s.addMemberIcon}>
                <Text style={s.addMemberIconText}>＋</Text>
              </View>
              <View style={s.addMemberCopy}>
                <Text style={s.addMemberTitle}>Thêm thành viên</Text>
                <Text style={s.addMemberHint}>
                  {project.parentProject
                    ? "Chọn người thuộc dự án tổng"
                    : "Nhập email tài khoản đã đăng ký"}
                </Text>
              </View>
            </View>
            {project.parentProject ? (
              <View style={s.addMemberRow}>
                <View style={s.addMemberPicker}>
                  <MemberDropdown
                    users={availableRootMembers}
                    value={selectedMember}
                    onChange={(id) => {
                      setSelectedMember(id);
                      setMemberError("");
                    }}
                    disabled={busy}
                    loading={!root}
                    label="Chọn thành viên"
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thêm thành viên đã chọn"
                  disabled={addMemberDisabled}
                  onPress={submitMember}
                  style={[
                    s.compactAddButton,
                    addMemberDisabled && s.disabled,
                  ]}
                >
                  <Text style={s.compactAddButtonText}>＋</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.addMemberRow}>
                <TextInput
                  style={[s.input, s.addMemberInput]}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setMemberError("");
                  }}
                  placeholder="email@example.com"
                  placeholderTextColor="#8B93A7"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (!addMemberDisabled) submitMember();
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={addMemberDisabled}
                  onPress={submitMember}
                  style={[
                    s.compactAddButton,
                    s.compactAddButtonWide,
                    addMemberDisabled && s.disabled,
                  ]}
                >
                  <Text style={s.compactAddButtonText}>
                    {busy ? "…" : "Thêm"}
                  </Text>
                </Pressable>
              </View>
            )}
            {!!memberError && (
              <View style={s.memberErrorBox}>
                <Text style={s.memberErrorText}>{memberError}</Text>
              </View>
            )}
          </View>
        )}
        <View style={s.memberList}>
          {members.map((member) => {
            const canRemove =
              writable &&
              project.permissions.manageMembers &&
              member._id !== idOf(project.owner) &&
              member.role !== "DIRECTOR" &&
              (member.role !== "MANAGER" ||
                project.permissions.appointManager);
            return (
              <View key={member._id} style={s.memberCard}>
                <View style={s.memberAvatar}>
                  <Text style={s.memberAvatarText}>
                    {member.name
                      .trim()
                      .charAt(0)
                      .toLocaleUpperCase("vi") || "?"}
                  </Text>
                </View>
                <View style={s.memberInfo}>
                  <View style={s.memberNameRow}>
                    <Text style={s.memberName} numberOfLines={1}>
                      {member.name}
                    </Text>
                    <View style={s.memberRoleBadge}>
                      <Text style={s.memberRoleText}>
                        {roleLabels[memberDisplayRole(project, member)]}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.memberEmail} numberOfLines={1}>
                    {member.email}
                  </Text>
                </View>
                {canRemove && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ${member.name} khỏi dự án`}
                    disabled={busy}
                    onPress={() => {
                      setRemove(member);
                      setReplacements({});
                      setReassign("");
                    }}
                    style={[s.removeMemberButton, busy && s.disabled]}
                  >
                    <Text style={s.removeMemberText}>Xóa</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        <Modal
          visible={!!remove}
          transparent
          animationType="slide"
          onRequestClose={() => !busy && setRemove(null)}
        >
          <View style={s.overlay}>
            <View style={s.modal}>
              <ScrollView
                contentContainerStyle={s.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={s.heading}>Xóa {remove?.name} khỏi dự án?</Text>
                <Text style={s.text}>
                  Người này sẽ mất quyền truy cập và bị loại khỏi nhóm chat.
                  Lịch sử chat đã lưu trên thiết bị của họ vẫn còn. Khi xóa khỏi
                  dự án tổng, thành viên cũng bị loại khỏi mọi dự án con.
                </Text>
                {requiredReplacements.map((managed) => (
                  <View key={managed._id} style={s.card}>
                    <Text style={s.strong}>
                      Trưởng phòng thay thế: {managed.name}
                    </Text>
                    <MemberDropdown
                      users={rootMembers.filter(
                        (m) => m._id !== remove?._id && m.role !== "DIRECTOR",
                      )}
                      value={replacements[managed._id] || ""}
                      onChange={(id) =>
                        setReplacements((current) => ({
                          ...current,
                          [managed._id]: id,
                        }))
                      }
                      disabled={busy}
                      loading={!!project.parentProject && !root}
                      label={`Chọn Trưởng phòng thay thế cho ${managed.name}`}
                    />
                  </View>
                ))}
                <Text style={s.strong}>Task đang được giao</Text>
                <Text style={s.muted}>
                  Không chọn thì task chuyển thành chưa phân công. Nếu chuyển
                  giao, người nhận phải thuộc tất cả các dự án bị ảnh hưởng; hệ
                  thống sẽ báo lỗi nếu thiếu quyền tham gia.
                </Text>
                <Picker
                  users={members.filter((m) => m._id !== remove?._id)}
                  value={reassign}
                  onChange={setReassign}
                  emptyLabel="Chưa phân công"
                />
                <Action
                  title={busy ? "Đang xử lý…" : "Xác nhận xóa"}
                  disabled={
                    busy ||
                    requiredReplacements.some((p) => !replacements[p._id])
                  }
                  onPress={() => void run(removeMember)}
                />
                <Action
                  title="Hủy"
                  disabled={busy}
                  onPress={() => setRemove(null)}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
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
                api(
                  `/projects/${project._id}`,
                  json("PATCH", {
                    name: projectName.trim(),
                    description,
                    version: project.version,
                  }),
                ),
              )
            }
          />
        </View>
      )}
      {!!project.children?.length && (
        <>
          <Text style={s.heading}>Dự án con</Text>
          {project.children.map((child) => (
            <Pressable
              style={s.card}
              key={child._id}
              onPress={() => onOpenProject(child._id)}
            >
              <Text style={s.strong}>{child.name}</Text>
              <Text style={s.muted}>
                {roleLabels[child.myRole]}
                {child.archived ? " · Đã lưu trữ" : ""}
              </Text>
            </Pressable>
          ))}
        </>
      )}
      {project.permissions.createChildren && writable && (
        <View style={s.card}>
          <Text style={s.heading}>Tạo dự án con</Text>
          <TextInput
            style={s.input}
            value={childName}
            onChangeText={setChildName}
            placeholder="Tên dự án con"
            placeholderTextColor="#64748b"
          />
          <Text style={s.strong}>Bổ nhiệm Trưởng phòng</Text>
          <MemberDropdown
            users={rootMembers.filter((m) => m.role !== "DIRECTOR")}
            value={childManager}
            onChange={setChildManager}
            disabled={busy}
          />
          <Action
            title="Tạo dự án con"
            disabled={
              busy ||
              !childName.trim() ||
              !rootMembers.some(
                (m) => m._id === childManager && m.role !== "DIRECTOR",
              )
            }
            onPress={() =>
              void run(async () => {
                const child = await api<Project>(
                  `/projects/${project._id}/children`,
                  json("POST", {
                    name: childName.trim(),
                    managerId: childManager,
                    version: project.version,
                  }),
                );
                setChildName("");
                setChildManager("");
                onOpenProject(child._id);
              })
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
                  api(
                    `/projects/${project._id}/manager`,
                    json("PUT", { userId: manager, version: project.version }),
                  ),
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
                        api(
                          `/projects/${project._id}/archive`,
                          json("PATCH", {
                            archived: !project.archived,
                            restoreChildren,
                            version: project.version,
                          }),
                        ),
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
