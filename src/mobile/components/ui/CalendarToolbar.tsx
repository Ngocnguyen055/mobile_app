import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  CALENDAR_SCOPE_OPTIONS,
  type CalendarScope,
} from "../../domain/calendarPolicy.ts";
import { styles } from "../../styles/app.ts";

type CalendarToolbarProps = {
  scope: CalendarScope;
  onScopeChange: (scope: CalendarScope) => void;
};

function CalendarToolbar({ scope, onScopeChange }: CalendarToolbarProps) {
  return (
    <View style={[styles.contextToolbar, styles.calendarToolbar]}>
      <Text style={styles.contextTitle}>Lịch của tôi</Text>
      <Text style={styles.contextSubtitle}>
        Sự kiện cá nhân, lịch dự án và deadline được giao cho bạn.
      </Text>
      <Text style={styles.toolbarLabel}>Hiển thị</Text>
      <View style={styles.scopeRow}>
        {CALENDAR_SCOPE_OPTIONS.map(([value, label]) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: scope === value }}
            key={value}
            onPress={() => onScopeChange(value)}
            style={[
              styles.scopeChip,
              scope === value && styles.activeScopeChip,
            ]}
          >
            <Text
              style={[
                styles.scopeChipText,
                scope === value && styles.activeScopeChipText,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default memo(CalendarToolbar);
