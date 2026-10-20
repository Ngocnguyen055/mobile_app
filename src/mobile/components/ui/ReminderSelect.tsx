import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ReminderOffset } from "../../services/local.ts";
import { styles } from "../../styles/reminderSelect.ts";

export const REMINDER_OPTIONS: readonly [ReminderOffset, string][] = [
  [0, "Khi sự kiện bắt đầu"],
  [300000, "Trước 5 phút"],
  [1800000, "Trước 30 phút"],
  [3600000, "Trước 1 giờ"],
  [86400000, "Trước 1 ngày"],
  [604800000, "Trước 1 tuần"],
];

type Props = {
  value: ReminderOffset;
  onChange: (value: ReminderOffset) => void;
  disabled?: boolean;
  label?: string;
  zeroLabel?: string;
};

export default function ReminderSelect({
  value,
  onChange,
  disabled = false,
  label = "Thời điểm thông báo",
  zeroLabel = "Khi sự kiện bắt đầu",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const options = REMINDER_OPTIONS.map(
    ([offset, optionLabel]) =>
      [offset, offset === 0 ? zeroLabel : optionLabel] as const,
  );
  const selectedLabel =
    options.find(([offset]) => offset === value)?.[1] || zeroLabel;

  return (
    <View style={styles.container}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel}`}
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={() => setExpanded((current) => !current)}
        style={[styles.trigger, disabled && styles.disabled]}
      >
        <View style={styles.clockBadge}>
          <Text style={styles.clockIcon}>◷</Text>
        </View>
        <Text style={styles.selectedText}>{selectedLabel}</Text>
        <Text style={styles.arrow}>{expanded ? "⌃" : "⌄"}</Text>
      </Pressable>
      {expanded && !disabled && (
        <View style={styles.menu}>
          {options.map(([offset, optionLabel], index) => {
            const selected = offset === value;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={offset}
                onPress={() => {
                  onChange(offset);
                  setExpanded(false);
                }}
                style={[
                  styles.option,
                  index < options.length - 1 && styles.optionBorder,
                  selected && styles.selectedOption,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    selected && styles.selectedOptionText,
                  ]}
                >
                  {optionLabel}
                </Text>
                {selected && <Text style={styles.check}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
