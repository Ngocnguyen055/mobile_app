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
  onOpenParent: () => void;
  onSelectTab: (tab: ProjectTab) => void;
};

function ProjectToolbar({
  project,
  tab,
  drawerVisible,
  onOpenDrawer,
  onCloseDrawer,
  onBack,
  onOpenParent,
  onSelectTab,
}: ProjectToolbarProps) {
  const hierarchyRoot =
    project.kind === "hierarchical" && !project.parentProject;
  const displayedTab =
    hierarchyRoot && (tab === "tasks" || tab === "progress")
      ? "overview"
      : tab;
  const visibleTabs = (Object.keys(projectTabLabels) as ProjectTab[]).filter(
    (item) =>
      hierarchyRoot
        ? item !== "tasks" && item !== "progress"
        : item !== "overview" && item !== "children",
  );
  return (
    <View style={[styles.contextToolbar, styles.projectToolbar]}>
      <View style={styles.projectTitleRow}>
        <Button label="☰" onPress={onOpenDrawer} secondary />
        <Button
          label={project.parentProject ? "← Dự án cha" : "← Danh sách"}
          onPress={project.parentProject ? onOpenParent : onBack}
          secondary
        />
        <Text style={styles.contextTitle}>{project.name}</Text>
      </View>
      <Text style={styles.contextSubtitle}>
        {projectTabLabels[displayedTab]} · {roleLabels[project.myRole]}
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
              {visibleTabs.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  style={[
                    styles.drawerItem,
                    displayedTab === item && styles.activeTab,
                  ]}
                  onPress={() => onSelectTab(item)}
                >
                  <Text
                    style={[
                      styles.drawerItemText,
                      displayedTab === item && styles.activeTabText,
                    ]}
                  >
                    {projectTabLabels[item]}
                  </Text>
                </Pressable>
              ))}
              <Button
                label={
                  project.parentProject
                    ? "← Quay lại dự án cha"
                    : "← Danh sách dự án"
                }
                onPress={project.parentProject ? onOpenParent : onBack}
                secondary
              />
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
