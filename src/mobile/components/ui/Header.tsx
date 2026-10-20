import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../styles/app.ts";

type HeaderProps = {
  userName: string;
  notificationsActive: boolean;
  onOpenNotifications: () => void;
};

function Header({
  userName,
  notificationsActive,
  onOpenNotifications,
}: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerBrand}>
        <View style={styles.headerLogo}>
          <Text style={styles.headerLogoText}>✓</Text>
        </View>
        <View>
          <Text style={styles.title}>Student Planner</Text>
          <Text style={styles.userLine}>
            Xin chào, {userName.split(" ").slice(-1)[0]}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mở thông báo"
        onPress={onOpenNotifications}
        style={[
          styles.notificationBell,
          notificationsActive && styles.notificationBellActive,
        ]}
      >
        <Text style={styles.notificationIcon}>🔔</Text>
      </Pressable>
    </View>
  );
}

export default memo(Header);
