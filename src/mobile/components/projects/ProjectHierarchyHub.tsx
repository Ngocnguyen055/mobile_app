import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { createChildProject } from "../../services/api.ts";
import { styles as s } from "../../styles/projectHierarchy.ts";

import {
  memberDisplayRole,
  orderedProjectMembers,
  roleLabels,
} from "../../domain/projectPolicy.ts";
import { colors } from "../../styles/theme.ts";
import type { Project, ProjectChildSummary } from "../../types/api.ts";
import type { ProjectTab } from "../../types/index.ts";
import MemberDropdown from "../ui/MemberDropdown.tsx";
import ProjectManagementPanel from "./ProjectManagementPanel.tsx";

type HubTab = "overview" | "children" | "members";
type ChildFilter = "all" | "assigned";

type Props = {
  project: Project;
  currentUserId: string;
  tab: HubTab;
  onSelectTab: (tab: ProjectTab) => void;
  onChanged: () => Promise<unknown>;
  onOpenProject: (projectId: string) => void;
  onError: (message: string) => void;
};

function childSummaries(project: Project): ProjectChildSummary[] {
  return (project.children || []).filter(
    (child): child is ProjectChildSummary => "managerId" in child,
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <View style={s.progressTrack}>
      <View
        style={[s.progressFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]}
      />
    </View>
  );
}

function ChildCard({
  child,
  compact = false,
  onOpen,
}: {
  child: ProjectChildSummary;
  compact?: boolean;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${child.name}${child.accessible ? "" : ", không thuộc phạm vi phụ trách"}`}
      disabled={!child.accessible}
      onPress={onOpen}
      style={({ pressed }) => [
        compact ? s.progressItem : s.childCard,
        !child.accessible && s.childCardLocked,
        pressed && child.accessible && s.cardPressed,
      ]}
    >
      <View style={s.childTitleRow}>
        <Text numberOfLines={1} style={s.childName}>
          {child.name}
        </Text>
        <Text style={s.childProgressCount}>
          {child.progress.done}/{child.progress.total} hoàn thành
        </Text>
        <Text style={s.childArrow}>{child.accessible ? "›" : "🔒"}</Text>
      </View>
      {!compact && (
        <>
          <Text style={s.childMeta}>
            Trưởng phòng: {child.manager?.name || "Chưa bổ nhiệm"}
          </Text>
          <Text style={s.childMeta}>{child.memberCount} thành viên</Text>
        </>
      )}
      <ProgressBar percent={child.progress.percent} />
      {!child.accessible && (
        <Text style={s.lockedHint}>Bạn không phụ trách dự án này</Text>
      )}
    </Pressable>
  );
}

export default function ProjectHierarchyHub({
  project,
  currentUserId,
  tab,
  onSelectTab,
  onChanged,
  onOpenProject,
  onError,
}: Props) {
  const [filter, setFilter] = useState<ChildFilter>("all");
  const [createVisible, setCreateVisible] = useState(false);
  const [childName, setChildName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const children = childSummaries(project);
  const members = orderedProjectMembers(project, currentUserId);
  const managerCandidates = useMemo(
    () =>
      members.filter(
        (member) => memberDisplayRole(project, member) !== "DIRECTOR",
      ),
    [members, project],
  );
  const assignedChildren = children.filter((child) => child.accessible);
  const visibleChildren =
    filter === "assigned" ? assignedChildren : children;
  const closeCreate = () => {
    if (busy) return;
    setCreateVisible(false);
    setChildName("");
    setManagerId("");
    setCreateError("");
  };
  const createChild = async () => {
    if (busy || !childName.trim() || !managerId) return;
    setBusy(true);
    setCreateError("");
    try {
      await createChildProject(project._id, { name: childName.trim(), managerId, version: project.version });
      setCreateVisible(false);
      setChildName("");
      setManagerId("");
      await onChanged();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setCreateError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={s.hero}>
        <View style={s.roleRow}>
          <View style={s.roleBadge}>
            <Text style={s.roleText}>{roleLabels[project.myRole]}</Text>
          </View>
          <Text style={s.parentLabel}>Dự án cha</Text>
        </View>
      </View>

      {tab === "members" ? (
        <ProjectManagementPanel
          project={project}
          currentUserId={currentUserId}
          section="members"
          onChanged={onChanged}
          onOpenProject={onOpenProject}
          onError={onError}
        />
      ) : tab === "overview" ? (
        <>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statLabel}>Dự án con</Text>
              <Text style={s.statValue}>{children.length}</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.stat}>
              <Text style={s.statLabel}>Tổng thành viên</Text>
              <Text style={s.statValue}>{project.members.length}</Text>
            </View>
          </View>
          {project.permissions.manageMembers && !project.archived && (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectTab("members")}
              style={s.secondaryAction}
            >
              <Text style={s.secondaryActionText}>＋ Thêm thành viên</Text>
            </Pressable>
          )}
          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Tiến độ từng dự án</Text>
            <Pressable onPress={() => onSelectTab("children")}>
              <Text style={s.linkText}>Xem tất cả</Text>
            </Pressable>
          </View>
          <View style={s.progressList}>
            {children.slice(0, 3).map((child) => (
              <ChildCard
                key={child._id}
                child={child}
                compact
                onOpen={() => onOpenProject(child._id)}
              />
            ))}
            {!children.length && (
              <Text style={s.emptyText}>Chưa có dự án con.</Text>
            )}
          </View>
        </>
      ) : (
        <>
          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Danh sách dự án con</Text>
            {project.permissions.createChildren && !project.archived && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCreateVisible(true)}
                style={s.primaryAction}
              >
                <Text style={s.primaryActionText}>＋ Tạo mới</Text>
              </Pressable>
            )}
          </View>
          <View style={s.filters}>
            {([
              ["all", `Tất cả (${children.length})`],
              ["assigned", `Dự án phụ trách (${assignedChildren.length})`],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: filter === value }}
                onPress={() => setFilter(value)}
                style={[s.filter, filter === value && s.filterSelected]}
              >
                <Text
                  style={[
                    s.filterText,
                    filter === value && s.filterTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={s.childList}>
            {visibleChildren.map((child) => (
              <ChildCard
                key={child._id}
                child={child}
                onOpen={() => onOpenProject(child._id)}
              />
            ))}
            {!visibleChildren.length && (
              <Text style={s.emptyText}>Không có dự án phù hợp bộ lọc.</Text>
            )}
          </View>
        </>
      )}

      <Modal
        transparent
        animationType="slide"
        visible={createVisible}
        onRequestClose={closeCreate}
      >
        <View style={s.overlay}>
          <Pressable style={s.backdrop} onPress={closeCreate} />
          <View style={s.modal}>
            <ScrollView
              contentContainerStyle={s.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.modalTitle}>Tạo dự án con</Text>
              <Text style={s.modalHint}>
                Trưởng phòng phải là thành viên của dự án phân cấp. Sau khi tạo,
                họ có thể thêm các thành viên khác từ dự án cha.
              </Text>
              <TextInput
                value={childName}
                onChangeText={setChildName}
                editable={!busy}
                placeholder="Tên dự án con"
                placeholderTextColor={colors.textSoft}
                style={s.input}
              />
              <MemberDropdown
                users={managerCandidates}
                value={managerId}
                onChange={setManagerId}
                disabled={busy}
                label="Chọn Trưởng phòng"
              />
              {!!createError && (
                <Text style={s.errorText}>{createError}</Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={busy || !childName.trim() || !managerId}
                onPress={() => void createChild()}
                style={[
                  s.modalPrimary,
                  (busy || !childName.trim() || !managerId) && s.disabled,
                ]}
              >
                <Text style={s.modalPrimaryText}>
                  {busy ? "Đang tạo…" : "Tạo dự án"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={closeCreate}
                style={s.modalSecondary}
              >
                <Text style={s.modalSecondaryText}>Hủy</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
