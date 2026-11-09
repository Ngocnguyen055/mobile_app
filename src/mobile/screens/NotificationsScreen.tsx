import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getNotifications, readAllNotifications, readNotification } from "../services/api.ts";
import { styles as s } from "../styles/notifications.ts";
import type { InboxNotification } from "../types/api.ts";
import { formatViDateTime } from "../utils/calendar.ts";

type NotificationTone =
  | "member"
  | "task"
  | "deadline"
  | "discussion"
  | "project"
  | "default";

function notificationVisual(type: string): {
  icon: string;
  tone: NotificationTone;
} {
  if (type === "project_member_added") return { icon: "👤", tone: "member" };
  if (type === "manager_appointed") return { icon: "⭐", tone: "member" };
  if (type === "task_deadline") return { icon: "⏰", tone: "deadline" };
  if (type === "task_updated") return { icon: "📝", tone: "task" };
  if (type === "task_assigned") return { icon: "📋", tone: "task" };
  if (type.includes("discussion") || type.includes("comment"))
    return { icon: "💬", tone: "discussion" };
  if (type.startsWith("project_")) return { icon: "📁", tone: "project" };
  return { icon: "🔔", tone: "default" };
}

const notificationIconStyle = {
  member: s.itemIconMember,
  task: s.itemIconTask,
  deadline: s.itemIconDeadline,
  discussion: s.itemIconDiscussion,
  project: s.itemIconProject,
  default: s.itemIconDefault,
};

type ProjectContextTone = "parent" | "child" | "independent" | "default";

function notificationProjectContext(
  project: InboxNotification["project"],
): { label: string; tone: ProjectContextTone; parentName: string } {
  if (!project)
    return { label: "Dự án", tone: "default", parentName: "" };
  if (project.parentProject) {
    const parentName =
      typeof project.parentProject === "object"
        ? project.parentProject.name
        : "";
    return { label: "Dự án con", tone: "child", parentName };
  }
  if (project.kind === "hierarchical")
    return { label: "Dự án cha", tone: "parent", parentName: "" };
  if (project.kind === "independent")
    return { label: "Dự án độc lập", tone: "independent", parentName: "" };
  return { label: "Dự án", tone: "default", parentName: "" };
}

function notificationDisplayTitle(
  item: InboxNotification,
  context: ReturnType<typeof notificationProjectContext>,
) {
  if (item.type !== "project_member_added" || !item.project)
    return item.title;
  return `Bạn được thêm vào ${context.label.toLocaleLowerCase("vi")} ${item.project.name}`;
}

const projectContextStyle = {
  parent: s.projectTypeParent,
  child: s.projectTypeChild,
  independent: s.projectTypeIndependent,
  default: s.projectTypeDefault,
};
const projectContextTextStyle = {
  parent: s.projectTypeParentText,
  child: s.projectTypeChildText,
  independent: s.projectTypeIndependentText,
  default: s.projectTypeDefaultText,
};

export default function NotificationsScreen({
  onOpen,
  onError,
  onUnreadChange,
}: {
  onOpen: (notification: InboxNotification) => Promise<unknown>;
  onError: (error: string) => void;
  onUnreadChange: (hasUnread: boolean) => void;
}) {
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const nextItems = await getNotifications();
    setItems(nextItems);
    onUnreadChange(nextItems.some((item) => !item.readAt));
  };
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <>
      <View style={s.titleRow}>
        <View style={s.titleIcon}>
          <Text style={s.titleIconText}>🔔</Text>
        </View>
        <View style={s.titleCopy}>
          <Text style={s.heading}>Thông báo</Text>
          <Text style={s.muted}>Cập nhật mới từ các dự án bạn tham gia.</Text>
        </View>
      </View>
      <View style={s.row}>
        <Pressable
          style={s.button}
          disabled={busy}
          onPress={() => void run(load)}
        >
          <Text style={s.buttonText}>Làm mới</Text>
        </Pressable>
        <Pressable
          style={s.button}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await readAllNotifications();
              await load();
            })
          }
        >
          <Text style={s.buttonText}>Đánh dấu đã đọc tất cả</Text>
        </Pressable>
      </View>
      {!items.length && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>✓</Text>
          <Text style={s.strong}>Bạn đã xem hết!</Text>
          <Text style={s.muted}>Chưa có thông báo mới.</Text>
        </View>
      )}
      {items.map((item) => {
        const visual = notificationVisual(item.type);
        const projectContext = notificationProjectContext(item.project);
        return (
          <Pressable
            accessibilityRole="button"
            key={item._id}
            style={[s.card, !item.readAt && s.unread]}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (!item.readAt) await readNotification(item._id);
                await load();
                if (item.project) await onOpen(item);
              })
            }
          >
            <View style={[s.itemIcon, notificationIconStyle[visual.tone]]}>
              <Text style={s.itemIconText}>{visual.icon}</Text>
            </View>
            <View style={s.notificationContent}>
              <View style={s.notificationTitle}>
                <Text style={s.strong}>
                  {notificationDisplayTitle(item, projectContext)}
                </Text>
                {!item.readAt && <View style={s.unreadDot} />}
              </View>
              {!!item.body && <Text style={s.text}>{item.body}</Text>}
              <View style={s.projectMetaRow}>
                <View
                  style={[
                    s.projectTypeBadge,
                    projectContextStyle[projectContext.tone],
                  ]}
                >
                  <Text
                    style={[
                      s.projectTypeText,
                      projectContextTextStyle[projectContext.tone],
                    ]}
                  >
                    {projectContext.label}
                  </Text>
                </View>
                <Text style={[s.meta, s.projectMetaText]}>
                  {item.project?.name || "Không còn truy cập được"}
                  {projectContext.parentName
                    ? ` · Thuộc ${projectContext.parentName}`
                    : ""}
                  {` · ${formatViDateTime(item.createdAt)}`}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}
