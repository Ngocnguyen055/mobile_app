import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../styles/app.ts";

type HeaderProps = {
  userName: string;
  notificationsActive: boolean;
  hasUnreadNotifications: boolean;
  onOpenNotifications: () => void;
};

function Header({
  userName,
  notificationsActive,
  hasUnreadNotifications,
  onOpenNotifications,
}: HeaderProps) {
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.headerGreeting}>
        Xin chào, {userName.split(" ").slice(-1)[0]}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hasUnreadNotifications
            ? "Mở thông báo, có thông báo chưa đọc"
            : "Mở thông báo"
        }
        onPress={onOpenNotifications}
        style={[
          styles.notificationBell,
          notificationsActive && styles.notificationBellActive,
        ]}
      >
        <Text style={styles.notificationIcon}>🔔</Text>
        {hasUnreadNotifications && (
          <View style={styles.notificationUnreadDot} />
        )}
      </Pressable>
    </View>
  );
}

export default memo(Header);
