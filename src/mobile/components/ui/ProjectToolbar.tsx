import React, { memo } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import type { Project } from "../../services/api.ts";
import { roleLabels } from "../../domain/projectPolicy.ts";
import { styles } from "../../styles/app.ts";
import { projectTabLabels, type ProjectTab } from "../../types/index.ts";
import Button from "./Button.tsx";

type ProjectToolbarProps = {
  project: Project;
  tab: ProjectTab;
  drawerVisible: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onBack: () => void;
  onSelectTab: (tab: ProjectTab) => void;
};

function ProjectToolbar({
  project,
  tab,
  drawerVisible,
  onOpenDrawer,
  onCloseDrawer,
  onBack,
  onSelectTab,
}: ProjectToolbarProps) {
  return (
    <View style={[styles.contextToolbar, styles.projectToolbar]}>
      <View style={styles.projectTitleRow}>
        <Button label="☰" onPress={onOpenDrawer} secondary />
        <Button label="← Danh sách" onPress={onBack} secondary />
        <Text style={styles.contextTitle}>{project.name}</Text>
      </View>
      <Text style={styles.contextSubtitle}>
        {projectTabLabels[tab]} · {roleLabels[project.myRole]}
        {project.archived ? " · Đã lưu trữ (chỉ xem)" : ""}
      </Text>
      <Modal
        transparent
        animationType="fade"
        visible={drawerVisible}
        onRequestClose={onCloseDrawer}
      >
        <View style={styles.drawerOverlay}>
          <View style={styles.drawer}>
            <Text style={styles.contextTitle}>{project.name}</Text>
            <Text style={styles.muted}>{roleLabels[project.myRole]}</Text>
            <ScrollView contentContainerStyle={styles.drawerItems}>
              {(Object.keys(projectTabLabels) as ProjectTab[]).map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  style={[styles.drawerItem, tab === item && styles.activeTab]}
                  onPress={() => onSelectTab(item)}
                >
                  <Text
                    style={[
                      styles.drawerItemText,
                      tab === item && styles.activeTabText,
                    ]}
                  >
                    {projectTabLabels[item]}
                  </Text>
                </Pressable>
              ))}
              <Button label="← Danh sách dự án" onPress={onBack} secondary />
            </ScrollView>
            <Button label="Đóng" onPress={onCloseDrawer} secondary />
          </View>
          <Pressable
            accessibilityLabel="Đóng menu dự án"
            style={styles.drawerShade}
            onPress={onCloseDrawer}
          />
        </View>
      </Modal>
    </View>
  );
}

export default memo(ProjectToolbar);
