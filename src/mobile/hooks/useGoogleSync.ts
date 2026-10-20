import { useState } from "react";
import { Alert } from "react-native";

import type { CalendarFeed } from "../services/api.ts";
import {
  connectGoogle,
  disconnectGoogle,
  syncGoogleCalendar,
} from "../services/google.ts";

type Options = {
  userId?: string;
  loadCalendar: () => Promise<CalendarFeed>;
};

export function useGoogleSync({ userId, loadCalendar }: Options) {
  const [googleEmail, setGoogleEmail] = useState("");

  const connect = async () => {
    setGoogleEmail(await connectGoogle());
  };

  const sync = async () => {
    if (!userId) return;
    const feed = await loadCalendar();
    const count = await syncGoogleCalendar(feed.tasks, feed.events, userId);
    Alert.alert("Google Calendar", `Đã đồng bộ ${count} mục vào lịch chính.`);
  };

  const disconnect = async () => {
    await disconnectGoogle();
    setGoogleEmail("");
  };

  return {
    googleEmail,
    connectGoogle: connect,
    syncGoogle: sync,
    disconnectGoogle: disconnect,
  };
}
