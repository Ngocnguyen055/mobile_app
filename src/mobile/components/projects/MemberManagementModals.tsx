import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { appointProjectManager } from "../../services/api.ts";
import { styles as s } from "../../styles/projectManagement.ts";
import type { Project } from "../../types/api.ts";
import MemberDropdown from "../ui/MemberDropdown.tsx";

import type { useProjectManagement } from "../../hooks/useProjectManagement.ts";
import { Action, Picker } from "./ManagementControls.tsx";

type Props = {
  project: Project;
  controller: ReturnType<typeof useProjectManagement>
};
export default function MemberManagementModals({ project, controller }: Props) {
  const {
    root,
    appoint,
    setAppoint,
    remove,
    setRemove,
    replacements,
    setReplacements,
    reassign,
    setReassign,
    busy,
    members,
    children,
    rootMembers,
    requiredReplacements,
    run,
    removeMember,
  } = controller;

  return (<>
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
    <Modal
      visible={!!appoint}
      transparent
      animationType="slide"
      onRequestClose={() => !busy && setAppoint(null)}
    >
      <View style={s.overlay}>
        <View style={s.modal}>
          <ScrollView contentContainerStyle={s.modalContent}>
            <Text style={s.heading}>
              Bổ nhiệm {appoint?.name} làm Trưởng phòng
            </Text>
            <Text style={s.muted}>
              Chọn dự án con. Người được bổ nhiệm sẽ có quyền quản lý task và
              thành viên trong dự án đó.
            </Text>
            {children.map((child) => (
              <Pressable
                key={child._id}
                accessibilityRole="button"
                disabled={busy || child.archived}
                onPress={() =>
                  void run(async () => {
                    await appointProjectManager(child._id, appoint!._id, child.version);
                    setAppoint(null);
                  })
                }
                style={[
                  s.card,
                  (busy || child.archived) && s.disabled,
                ]}
              >
                <Text style={s.strong}>{child.name}</Text>
                <Text style={s.muted}>
                  Hiện tại: {child.manager?.name || "Chưa có Trưởng phòng"}
                  {child.archived ? " · Đã lưu trữ" : ""}
                </Text>
              </Pressable>
            ))}
            <Action
              title="Hủy"
              disabled={busy}
              onPress={() => setAppoint(null)}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>);
}
