import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../styles/app.ts";
import type { MainView } from "../../types/index.ts";

type BottomNavProps = {
  currentView: MainView;
  onSelect: (view: "calendar" | "projects" | "messages" | "account") => void;
};

const navItems = [
  ["calendar", "▦", "Lịch"],
  ["projects", "◇", "Dự án"],
  ["messages", "✉", "Tin nhắn"],
  ["account", "◎", "Cá nhân"],
] as const;

function BottomNav({ currentView, onSelect }: BottomNavProps) {
  return (
    <View style={styles.bottomNav}>
      {navItems.map(([view, icon, label]) => {
        const active =
          currentView === view ||
          (view === "projects" && currentView === "project");
        return (
          <Pressable
            key={view}
            onPress={() => onSelect(view)}
            style={[styles.navItem, active && styles.activeNavItem]}
          >
            <View
              style={[styles.navIconWrap, active && styles.navIconWrapActive]}
            >
              <Text style={[styles.navIcon, active && styles.navActive]}>
                {icon}
              </Text>
            </View>
            <Text style={[styles.navText, active && styles.navActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(BottomNav);
