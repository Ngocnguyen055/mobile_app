import React, { memo } from "react";
import { Text, View } from "react-native";

import type { Project } from "../../services/api.ts";
import { styles } from "../../styles/app.ts";
import Button from "../ui/Button.tsx";
import TextField from "../ui/TextField.tsx";

type ProjectResourcesTabProps = {
  project: Project;
  values: string[];
  onValueChange: (index: number, value: string) => void;
  onSave: () => void;
};

const resourceLabels = [
  "Giờ dự kiến",
  "Giờ thực tế",
  "Ngân sách dự kiến (VND)",
  "Đã dùng (VND)",
];

function ProjectResourcesTab({
  project,
  values,
  onValueChange,
  onSave,
}: ProjectResourcesTabProps) {
  const editable = !project.archived && project.permissions.manageResources;

  return (
    <>
      <Text style={styles.heading}>Nguồn lực và ngân sách</Text>
      {resourceLabels.map((label, index) => (
        <View key={label}>
          <Text>{label}</Text>
          <TextField
            value={values[index] || ""}
            onChangeText={(value) => onValueChange(index, value)}
            placeholder={label}
            editable={editable}
          />
        </View>
      ))}
      <Button label="Lưu" onPress={onSave} disabled={!editable} />
      <Text>
        Còn lại: {project.plannedBudget - project.spentBudget} VND · giờ chênh
        lệch: {project.actualHours - project.plannedHours}
      </Text>
    </>
  );
}

export default memo(ProjectResourcesTab);
