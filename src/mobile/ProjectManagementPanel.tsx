import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, json, type Project, type User } from "./api.ts";
import { idOf, managedProjectsForMember, memberDisplayRole, orderedProjectMembers, roleLabels } from "./projectPolicy.ts";
import MemberDropdown from "./MemberDropdown.tsx";

type Props = {
  project: Project;
  section: "members" | "management";
  onChanged: () => Promise<unknown>;
  onOpenProject: (projectId: string) => void;
  onError: (error: string) => void;
};
function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function Picker({ users, value, onChange, emptyLabel }: { users: User[]; value: string; onChange: (id: string) => void; emptyLabel?: string }) {
  return <View style={s.wrap}>
    {!!emptyLabel && <Pressable onPress={() => onChange("")} style={[s.choice, !value && s.selected]}><Text style={!value ? s.selectedText : s.text}>{emptyLabel}</Text></Pressable>}
    {users.map((user) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: value === user._id }} key={user._id} onPress={() => onChange(user._id)} style={[s.choice, value === user._id && s.selected]}><Text style={value === user._id ? s.selectedText : s.text}>{user.name} · {user.email}</Text></Pressable>)}
  </View>;
}
export default function ProjectManagementPanel({ project, section, onChanged, onOpenProject, onError }: Props) {
  const [root, setRoot] = useState<Project | null>(null);
  const [email, setEmail] = useState("");
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
  const rootMembers = (project.parentProject ? root?.members || [] : project.members).filter((m): m is User => typeof m !== "string");
  const writable = !project.archived;
  const requiredReplacements = remove ? managedProjectsForMember(project, remove._id) : [];
  useEffect(() => {
    setProjectName(project.name); setDescription(project.description || "");
    if (project.parentProject) void api<Project>(`/projects/${project.rootProject}`).then(setRoot).catch((e) => onError(String(e)));
    else setRoot(project);
    setManager(members.find((m) => m.role === "MANAGER")?._id || "");
  }, [project._id, project.version]);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); await onChanged(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const removeMember = async () => {
    if (!remove) return;
    await api(`/projects/${project._id}/members/${remove._id}`, json("DELETE", {
      version: project.version, reassignTo: reassign || null,
      replacementManagers: requiredReplacements.map((p) => ({ projectId: p._id, userId: replacements[p._id] })),
    }));
    setRemove(null); setReplacements({}); setReassign("");
  };
  if (section === "members") return <>
    <Text style={s.heading}>Thành viên · {project.kind === "hierarchical" ? "Dự án phân cấp" : "Dự án độc lập"}</Text>
    {members.map((member) => <View key={member._id} style={s.card}>
      <Text style={s.strong}>{member.name}</Text><Text style={s.text}>{member.email}</Text><Text style={s.muted}>{roleLabels[memberDisplayRole(project, member)]}</Text>
      {writable && project.permissions.manageMembers && member._id !== idOf(project.owner) && member.role !== "DIRECTOR" && (member.role !== "MANAGER" || project.permissions.appointManager) && <Action title="Xóa thành viên" onPress={() => { setRemove(member); setReplacements({}); setReassign(""); }} disabled={busy} />}
    </View>)}
    {project.permissions.manageMembers && writable && <View style={s.card}>
      <Text style={s.heading}>Thêm thành viên</Text>
      {project.parentProject ? <>
        <Text style={s.muted}>Chọn người đã thuộc dự án tổng.</Text>
        <Picker users={rootMembers.filter((m) => !members.some((current) => current._id === m._id))} value={selectedMember} onChange={setSelectedMember} />
      </> : <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Email tài khoản đã đăng ký" placeholderTextColor="#64748b" autoCapitalize="none" keyboardType="email-address" />}
      <Action title="Thêm thành viên" disabled={busy || (project.parentProject ? !selectedMember : !email.trim())} onPress={() => void run(async () => {
        await api(`/projects/${project._id}/members`, json("POST", project.parentProject ? { userId: selectedMember, version: project.version } : { email: email.trim(), version: project.version }));
        setEmail(""); setSelectedMember("");
      })} />
    </View>}
    <Modal visible={!!remove} transparent animationType="slide" onRequestClose={() => !busy && setRemove(null)}>
      <View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
        <Text style={s.heading}>Xóa {remove?.name} khỏi dự án?</Text>
        <Text style={s.text}>Người này sẽ mất quyền truy cập và bị loại khỏi nhóm chat. Lịch sử chat đã lưu trên thiết bị của họ vẫn còn. Khi xóa khỏi dự án tổng, thành viên cũng bị loại khỏi mọi dự án con.</Text>
        {requiredReplacements.map((managed) => <View key={managed._id} style={s.card}>
          <Text style={s.strong}>Trưởng phòng thay thế: {managed.name}</Text>
          <MemberDropdown users={rootMembers.filter((m) => m._id !== remove?._id && m.role !== "DIRECTOR")} value={replacements[managed._id] || ""} onChange={(id) => setReplacements((current) => ({ ...current, [managed._id]: id }))} disabled={busy} loading={!!project.parentProject && !root} label={`Chọn Trưởng phòng thay thế cho ${managed.name}`} />
        </View>)}
        <Text style={s.strong}>Task đang được giao</Text>
        <Text style={s.muted}>Không chọn thì task chuyển thành chưa phân công. Nếu chuyển giao, người nhận phải thuộc tất cả các dự án bị ảnh hưởng; hệ thống sẽ báo lỗi nếu thiếu quyền tham gia.</Text>
        <Picker users={members.filter((m) => m._id !== remove?._id)} value={reassign} onChange={setReassign} emptyLabel="Chưa phân công" />
        <Action title={busy ? "Đang xử lý…" : "Xác nhận xóa"} disabled={busy || requiredReplacements.some((p) => !replacements[p._id])} onPress={() => void run(removeMember)} />
        <Action title="Hủy" disabled={busy} onPress={() => setRemove(null)} />
      </ScrollView></View></View>
    </Modal>
  </>;
  return <>
    <Text style={s.heading}>Quản lý dự án</Text>
    <Text style={s.muted}>{roleLabels[project.myRole]} · {project.archived ? "Đã lưu trữ · chỉ xem" : "Đang hoạt động"}</Text>
    {project.parentProject && <Action title="Mở dự án tổng" onPress={() => onOpenProject(project.rootProject)} />}
    {project.permissions.manageProject && writable && <View style={s.card}>
      <Text style={s.strong}>Thông tin dự án</Text><TextInput style={s.input} value={projectName} onChangeText={setProjectName} placeholder="Tên dự án" placeholderTextColor="#64748b" />
      <TextInput style={s.input} value={description} onChangeText={setDescription} multiline placeholder="Mô tả" placeholderTextColor="#64748b" />
      <Action title="Lưu thông tin" disabled={busy || !projectName.trim()} onPress={() => void run(() => api(`/projects/${project._id}`, json("PATCH", { name: projectName.trim(), description, version: project.version })))} />
    </View>}
    {!!project.children?.length && <><Text style={s.heading}>Dự án con</Text>{project.children.map((child) => <Pressable style={s.card} key={child._id} onPress={() => onOpenProject(child._id)}><Text style={s.strong}>{child.name}</Text><Text style={s.muted}>{roleLabels[child.myRole]}{child.archived ? " · Đã lưu trữ" : ""}</Text></Pressable>)}</>}
    {project.permissions.createChildren && writable && <View style={s.card}>
      <Text style={s.heading}>Tạo dự án con</Text><TextInput style={s.input} value={childName} onChangeText={setChildName} placeholder="Tên dự án con" placeholderTextColor="#64748b" />
      <Text style={s.strong}>Bổ nhiệm Trưởng phòng</Text><MemberDropdown users={rootMembers.filter((m) => m.role !== "DIRECTOR")} value={childManager} onChange={setChildManager} disabled={busy} />
      <Action title="Tạo dự án con" disabled={busy || !childName.trim() || !rootMembers.some((m) => m._id === childManager && m.role !== "DIRECTOR")} onPress={() => void run(async () => {
        const child = await api<Project>(`/projects/${project._id}/children`, json("POST", { name: childName.trim(), managerId: childManager, version: project.version }));
        setChildName(""); setChildManager(""); onOpenProject(child._id);
      })} />
    </View>}
    {project.permissions.appointManager && project.parentProject && writable && <View style={s.card}>
      <Text style={s.heading}>Bổ nhiệm / thay Trưởng phòng</Text><Text style={s.muted}>Thay người quản lý cũng hủy vai trò Trưởng phòng của người cũ. Người mới phải thuộc dự án tổng.</Text>
      <MemberDropdown users={rootMembers.filter((m) => m.role !== "DIRECTOR")} value={manager} onChange={setManager} disabled={busy} loading={!root} />
      <Action title="Lưu Trưởng phòng" disabled={busy || !rootMembers.some((m) => m._id === manager && m.role !== "DIRECTOR")} onPress={() => void run(() => api(`/projects/${project._id}/manager`, json("PUT", { userId: manager, version: project.version })))} />
    </View>}
    {project.permissions.manageProject && <View style={s.card}>
      <Text style={s.heading}>{project.archived ? "Khôi phục dự án" : "Lưu trữ dự án"}</Text>
      <Text style={s.text}>{project.parentProject ? "Dự án đã lưu trữ chỉ được xem." : "Lưu trữ dự án tổng sẽ lưu trữ toàn bộ dự án con. Khi khôi phục, bạn chọn có khôi phục các dự án con hay không."}</Text>
      {project.archived && !project.parentProject && project.kind === "hierarchical" && <Pressable style={s.choice} onPress={() => setRestoreChildren(!restoreChildren)}><Text style={s.text}>{restoreChildren ? "☑" : "☐"} Khôi phục cả các dự án con</Text></Pressable>}
      <Action title={project.archived ? "Khôi phục" : "Lưu trữ"} disabled={busy} onPress={() => Alert.alert(project.archived ? "Khôi phục dự án?" : "Lưu trữ dự án?", project.name, [{ text: "Hủy" }, { text: "Xác nhận", onPress: () => void run(() => api(`/projects/${project._id}/archive`, json("PATCH", { archived: !project.archived, restoreChildren, version: project.version }))) }])} />
    </View>}
  </>;
}
const s = StyleSheet.create({
  heading: { fontSize: 18, color: "#0f172a", fontWeight: "700", marginVertical: 7 }, strong: { fontSize: 15, color: "#0f172a", fontWeight: "700" }, text: { color: "#0f172a", lineHeight: 21 }, muted: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  card: { backgroundColor: "#fff", borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 10, padding: 12, gap: 7, marginVertical: 4 },
  wrap: { gap: 6 }, choice: { borderColor: "#94a3b8", borderWidth: 1, borderRadius: 8, padding: 9, backgroundColor: "#fff" }, selected: { backgroundColor: "#2563eb", borderColor: "#2563eb" }, selectedText: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#94a3b8", backgroundColor: "#fff", borderRadius: 8, padding: 10, color: "#0f172a" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, padding: 10, marginVertical: 3 }, buttonText: { color: "#fff", fontWeight: "700" }, disabled: { opacity: 0.4 },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)", paddingTop: 45 }, modal: { maxHeight: "95%", backgroundColor: "#f1f5f9", borderTopLeftRadius: 18, borderTopRightRadius: 18 }, modalContent: { padding: 18, gap: 10, paddingBottom: 30 },
});
