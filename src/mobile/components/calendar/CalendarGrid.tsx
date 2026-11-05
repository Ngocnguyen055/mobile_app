import {
  Pressable,
  Text,
  View
} from "react-native";
import { styles } from "../../styles/calendar.ts";
import type { CalendarEvent, Task } from "../../types/api.ts";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  buildWeekDays,
  buildYearMonths,
  dateKey,
  sameDay,
  type CalendarMode,
} from "../../utils/calendar.ts";

import { occursBetween, occursOn } from "../../utils/calendarAgenda.ts";
type Props = {
  mode: CalendarMode;
  selectedDay: Date;
  visibleTasks: Task[];
  visibleEvents: CalendarEvent[];
  setSelectedDay: (day: Date) => void;
  setMode: (mode: CalendarMode) => void
};
export default function CalendarGrid({
  mode,
  selectedDay,
  visibleTasks,
  visibleEvents,
  setSelectedDay,
  setMode,
}: Props) {
  const cells =
    mode === "year"
      ? []
      : mode === "month"
        ? buildMonthGrid(selectedDay)
        : mode === "week"
          ? buildWeekDays(selectedDay)
          : [selectedDay];
  const yearMonths = buildYearMonths(selectedDay);

  return (<>
    {(mode === "week" || mode === "month") && (
      <View style={styles.weekHeader}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={label}
            style={[styles.weekLabel, index === 6 && styles.sunday]}
          >
            {label}
          </Text>
        ))}
      </View>
    )}
    {mode === "year" ? (
      <View style={styles.yearGrid}>
        {yearMonths.map((month, index) => {
          const monthKey = dateKey(month).slice(0, 7);
          const taskItems = visibleTasks.filter(
            (task) =>
              task.dueAt &&
              dateKey(new Date(task.dueAt)).startsWith(monthKey),
          );
          const eventItems = visibleEvents.filter((event) =>
            occursBetween(event, `${monthKey}-01`, `${monthKey}-31`),
          );
          const currentMonth =
            dateKey(new Date()).slice(0, 7) === monthKey;
          return (
            <Pressable
              key={monthKey}
              accessibilityRole="button"
              accessibilityLabel={`Tháng ${index + 1}, ${taskItems.length} deadline, ${eventItems.length} sự kiện`}
              onPress={() => {
                setSelectedDay(month);
                setMode("month");
              }}
              style={[
                styles.yearMonthCell,
                currentMonth && styles.yearCurrentMonth,
              ]}
            >
              <Text
                style={[
                  styles.yearMonthText,
                  currentMonth && styles.yearCurrentMonthText,
                ]}
              >
                Tháng {index + 1}
              </Text>
              <View style={styles.dotRow}>
                {!!taskItems.length && <Text style={styles.dot}>●</Text>}
                {!!eventItems.length && (
                  <Text style={[styles.dot, styles.eventDot]}>●</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    ) : (
      <View style={styles.calendarGrid}>
        {cells.map((day, index) => {
          if (!day)
            return <View key={`empty-${index}`} style={styles.emptyDay} />;
          const taskItems = visibleTasks.filter(
            (task) => task.dueAt && sameDay(new Date(task.dueAt), day),
          );
          const eventItems = visibleEvents.filter((event) =>
            occursOn(event, day),
          );
          const overdue = taskItems.some(
            (task) =>
              task.status !== "done" &&
              task.dueAt &&
              new Date(task.dueAt).getTime() < Date.now(),
          );
          return (
            <Pressable
              key={`${dateKey(day)}-${index}`}
              onPress={() => setSelectedDay(day)}
              style={[
                styles.dayCell,
                mode === "day" && styles.singleDayCell,
                sameDay(day, selectedDay) && styles.selectedDay,
                sameDay(day, new Date()) && styles.todayCell,
              ]}
            >
              <Text
                style={[
                  styles.dayNumber,
                  sameDay(day, selectedDay) && styles.selectedDayText,
                ]}
              >
                {Number(dateKey(day).slice(-2))}
              </Text>
              <View style={styles.dotRow}>
                {!!taskItems.length && (
                  <Text style={[styles.dot, overdue && styles.overdueDot]}>
                    ●
                  </Text>
                )}
                {!!eventItems.length && (
                  <Text style={[styles.dot, styles.eventDot]}>●</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    )}

  </>);
}
