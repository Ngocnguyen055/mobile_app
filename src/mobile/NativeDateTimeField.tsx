import React from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { formatViDate, formatViDateTime, parseViDateTime } from './calendar.ts';

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  dateOnly?: boolean;
  minimumDate?: Date;
  disabled?: boolean;
  placeholder?: string;
};

function valueOrNow(value: string) {
  try {
    return parseViDateTime(value);
  } catch {
    return new Date();
  }
}

function vietnamTime(value: Date) {
  return formatViDateTime(value).slice(-5);
}

export default function NativeDateTimeField({
  label,
  value,
  onChange,
  dateOnly = false,
  minimumDate,
  disabled = false,
  placeholder = 'Chọn ngày giờ',
}: Props) {
  const openTime = (selectedDay: Date) => {
    DateTimePickerAndroid.open({
      value: selectedDay,
      mode: 'time',
      display: 'spinner',
      is24Hour: true,
      timeZoneName: VIETNAM_TIME_ZONE,
      positiveButton: { label: 'Chọn' },
      negativeButton: { label: 'Hủy' },
      onChange: (event: DateTimePickerEvent, selectedTime?: Date) => {
        if (event.type !== 'set' || !selectedTime) return;
        onChange(`${formatViDate(selectedDay)} ${vietnamTime(selectedTime)}`);
      },
    });
  };

  const open = () => {
    if (disabled) return;
    if (Platform.OS !== 'android') return;

    const current = valueOrNow(value);
    Keyboard.dismiss();
    setTimeout(() => {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        display: 'spinner',
        firstDayOfWeek: 1,
        minimumDate,
        timeZoneName: VIETNAM_TIME_ZONE,
        positiveButton: { label: dateOnly ? 'Chọn' : 'Tiếp tục' },
        negativeButton: { label: 'Hủy' },
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type !== 'set' || !selectedDate) return;
          const selected = parseViDateTime(`${formatViDate(selectedDate)} ${vietnamTime(current)}`);
          if (dateOnly) {
            onChange(`${formatViDate(selected)} 00:00`);
            return;
          }
          setTimeout(() => openTime(selected), 100);
        },
      });
    }, 100);
  };

  const hasValue = !!value.trim();
  const displayValue = hasValue ? (dateOnly ? formatViDate(valueOrNow(value)) : value) : placeholder;

  return <View style={styles.container}>
    <Text style={styles.label}>{label}</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${displayValue}`}
      disabled={disabled}
      onPress={open}
      style={[styles.field, disabled && styles.disabled]}
    >
      <Text style={[styles.value, !hasValue && styles.placeholder]}>{displayValue}</Text>
      <Text style={styles.icon}>⌄</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 5 },
  label: { color: '#334155', fontSize: 13, fontWeight: '700' },
  field: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { color: '#0f172a', fontSize: 15 },
  placeholder: { color: '#64748b' },
  icon: { color: '#2563eb', fontSize: 22, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
