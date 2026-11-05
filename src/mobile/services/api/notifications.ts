import type { InboxNotification } from "../../types/api.ts";
import { api, json } from "./client.ts";

export const getNotifications = () => api<InboxNotification[]>("/notifications");
export const readAllNotifications = () => api("/notifications/read-all", json("PATCH"));
export const readNotification = (notificationId: string) =>
  api(`/notifications/${notificationId}/read`, json("PATCH"));
