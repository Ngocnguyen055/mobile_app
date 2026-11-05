import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  idOf,
  memberDisplayRole,
  roleLabels
} from "../../domain/projectPolicy.ts";
import { styles as s } from "../../styles/projectManagement.ts";
import type { Project } from "../../types/api.ts";
import MemberDropdown from "../ui/MemberDropdown.tsx";

import type { useProjectManagement } from "../../hooks/useProjectManagement.ts";
import MemberManagementModals from "./MemberManagementModals.tsx";
type Props = {
  project: Project;
  currentUserId: string;
  controller: ReturnType<typeof useProjectManagement>
};
export default function ProjectMembersPanel({ project, currentUserId, controller }: Props) {
  const {
    root,
    email,
    setEmail,
    memberError,
    setMemberError,
    selectedMember,
    setSelectedMember,
    setAppoint,
    setRemove,
    setReplacements,
    setReassign,
    busy,
    members,
    children,
    writable,
    availableRootMembers,
    addMemberDisabled,
    submitMember,
  } = controller;

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
                style={[s.compactAddButton, addMemberDisabled && s.disabled]}
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
          const displayRole = memberDisplayRole(project, member);
          const isCurrentUser = member._id === currentUserId;
          const canReplaceManager =
            project.myRole === "DIRECTOR" ||
            project.permissions.appointManager;
          const canRemove =
            writable &&
            project.permissions.manageMembers &&
            member._id !== idOf(project.owner) &&
            displayRole !== "DIRECTOR" &&
            (displayRole !== "MANAGER" || canReplaceManager);
          const canAppoint =
            writable &&
            project.kind === "hierarchical" &&
            !project.parentProject &&
            project.permissions.createChildren &&
            displayRole !== "DIRECTOR" &&
            children.length > 0;
          return (
            <View key={member._id} style={s.memberCard}>
              <View style={s.memberAvatar}>
                <Text style={s.memberAvatarText}>
                  {member.name.trim().charAt(0).toLocaleUpperCase("vi") ||
                    "?"}
                </Text>
              </View>
              <View style={s.memberInfo}>
                <View style={s.memberNameRow}>
                  <Text style={s.memberName} numberOfLines={1}>
                    {member.name}
                  </Text>
                  <View style={s.memberRoleBadge}>
                    <Text style={s.memberRoleText}>
                      {roleLabels[displayRole]}
                    </Text>
                  </View>
                  {isCurrentUser && (
                    <View style={s.memberMeBadge}>
                      <Text style={s.memberMeText}>Bạn</Text>
                    </View>
                  )}
                </View>
                <Text style={s.memberEmail} numberOfLines={1}>
                  {member.email}
                </Text>
              </View>
              {(canAppoint || canRemove) && (
                <View style={s.memberActions}>
                  {canAppoint && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Bổ nhiệm ${member.name} làm Trưởng phòng`}
                      disabled={busy}
                      onPress={() => setAppoint(member)}
                      style={[s.appointButton, busy && s.disabled]}
                    >
                      <Text style={s.appointText}>Bổ nhiệm</Text>
                    </Pressable>
                  )}
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
              )}
            </View>
          );
        })}
      </View>
      <MemberManagementModals project={project} controller={controller} />
    </>
  );
}
