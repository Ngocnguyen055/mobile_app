import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import {
  REMINDER_CHANNEL_ID,
  REMINDER_OFFSETS,
  type ReminderOffset,
} from "../services/local.ts";

type UseRemindersOptions = {
  userId?: string;
  onRefresh: (preferences: ReminderOffset[]) => Promise<void>;
  onError: (message: string) => void;
};

export function useReminders({
  userId,
  onRefresh,
  onError,
}: UseRemindersOptions) {
  const [offsets, setOffsets] = useState<ReminderOffset[]>([0]);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    void (async () => {
      const saved = await SecureStore.getItemAsync("reminder-offsets");
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      const selected = Array.isArray(parsed)
        ? parsed.find((value): value is ReminderOffset =>
            REMINDER_OFFSETS.includes(value as ReminderOffset),
          )
        : undefined;
      setOffsets([selected ?? 0]);
    })().catch((caught) => onError(`Nhắc nhở: ${String(caught)}`));
  }, []);

  const refreshReminders = async (preferences = offsets) => {
    if (!userId) return;
    await refreshRef.current(preferences);
  };

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        if (Platform.OS === "android")
          await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
            name: "Nhắc lịch và deadline",
            importance: Notifications.AndroidImportance.HIGH,
          });
        const current = await Notifications.getPermissionsAsync();
        const permission = current.granted
          ? current
          : await Notifications.requestPermissionsAsync();
        if (!permission.granted) {
          setNotificationsReady(false);
          onError(
            "Bạn chưa cấp quyền thông báo. Lịch vẫn được lưu nhưng nhắc hẹn sẽ chưa hoạt động.",
          );
          return;
        }
        setNotificationsReady(true);
        await refreshRef.current(offsets);
      } catch (caught) {
        setNotificationsReady(false);
        onError(`Không thể chuẩn bị nhắc hẹn: ${String(caught)}`);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId || !notificationsReady) return;
    const timer = setInterval(() => {
      void refreshRef
        .current(offsets)
        .catch((caught) => onError(`Nhắc nhở: ${String(caught)}`));
    }, 60_000);
    return () => clearInterval(timer);
  }, [userId, offsets, notificationsReady]);

  const setReminderPreference = async (offset: ReminderOffset) => {
    const next: ReminderOffset[] = [offset];
    setOffsets(next);
    await SecureStore.setItemAsync("reminder-offsets", JSON.stringify(next));
    await refreshReminders(next);
  };

  const resetReminders = () => {
    setNotificationsReady(false);
  };

  return {
    offsets,
    refreshReminders,
    setReminderPreference,
    resetReminders,
  };
}
