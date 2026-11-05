import { useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { styles } from "../../styles/app.ts";
import type { Project } from "../../types/api.ts";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatViDate,
  formatViMonth,
  sameDay,
} from "../../utils/calendar.ts";
import {
  formatProjectDatePeriod,
  moveProjectDatePeriod,
  projectDateRange,
  type ProjectDateFilter,
  type ProjectDateGranularity,
} from "../../utils/projectList.ts";

const dateModeOptions: ReadonlyArray<{
  value: ProjectDateGranularity;
  label: string;
}> = [
    { value: "day", label: "Ngày" },
    { value: "week", label: "Tuần" },
    { value: "month", label: "Tháng" },
    { value: "year", label: "Năm" },
  ];

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateFilterButtonLabel(
  filter: ProjectDateGranularity,
  anchor: Date,
) {
  const range = projectDateRange(filter, anchor)!;
  const start = new Date(range.start);
  const end = new Date(range.end - 1);
  if (filter === "day") return `Ngày ${formatViDate(start)}`;
  if (filter === "week")
    return `Tuần ${formatViDate(start).slice(0, 5)}–${formatViDate(end).slice(0, 5)}`;
  if (filter === "month")
    return `Tháng ${String(start.getMonth() + 1).padStart(2, "0")}/${start.getFullYear()}`;
  return `Năm ${start.getFullYear()}`;
}

type Props = {
  dateFilter: ProjectDateFilter;
  dateAnchor: string;
  projectDotRows: Project[];
  onDateFilterChange: (filter: ProjectDateFilter, anchor: string) => void;
  onOpen: () => void;
};
export default function ProjectDateFilter({
  dateFilter,
  dateAnchor,
  projectDotRows,
  onDateFilterChange,
  onOpen,
}: Props) {
  const [datePopupVisible, setDatePopupVisible] = useState(false);
  const [draftDateFilter, setDraftDateFilter] =
    useState<ProjectDateGranularity>("month");
  const [draftDateAnchor, setDraftDateAnchor] = useState(() =>
    new Date().toISOString(),
  );
  const [calendarCursor, setCalendarCursor] = useState(() =>
    new Date().toISOString(),
  );

  const activeDateAnchor = dateAnchor ? validDate(dateAnchor) : new Date();
  const dateLabel =
    dateFilter === "all"
      ? "Tất cả thời gian"
      : dateFilterButtonLabel(dateFilter, activeDateAnchor);
  const draftAnchorDate = validDate(draftDateAnchor);
  const currentDate = new Date();
  const selectedPeriodStart = projectDateRange(
    draftDateFilter,
    draftAnchorDate,
  )!.start;
  const currentPeriodStart = projectDateRange(
    draftDateFilter,
    currentDate,
  )!.start;
  const calendarCursorDate = validDate(calendarCursor);
  const calendarDisplayDate =
    draftDateFilter === "day" ? calendarCursorDate : draftAnchorDate;
  const calendarDays = buildMonthGrid(calendarDisplayDate);
  const currentMonthStart = projectDateRange("month", currentDate)!.start;
  const calendarMonthStart = projectDateRange(
    "month",
    calendarDisplayDate,
  )!.start;
  const calendarNextDisabled =
    draftDateFilter === "day"
      ? calendarMonthStart >= currentMonthStart
      : selectedPeriodStart >= currentPeriodStart;

  const openDatePopup = () => {
    onOpen();
    setDraftDateFilter(dateFilter === "all" ? "month" : dateFilter);
    setDraftDateAnchor(
      dateFilter === "all" || !dateAnchor
        ? new Date().toISOString()
        : dateAnchor,
    );
    setCalendarCursor(
      dateFilter === "all" || !dateAnchor
        ? new Date().toISOString()
        : dateAnchor,
    );
    setDatePopupVisible(true);
  };

  return (<>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lọc theo ngày tạo: ${dateLabel}`}
      accessibilityState={{ expanded: datePopupVisible }}
      onPress={openDatePopup}
      style={[styles.projectFilterButton, styles.projectFilterRowButton]}
    >
      <Text numberOfLines={1} style={styles.projectFilterButtonText}>
        {dateLabel}
      </Text>
      <Text style={styles.projectFilterArrow}>▾</Text>
    </Pressable>
    <Modal
      transparent
      animationType="fade"
      visible={datePopupVisible}
      onRequestClose={() => setDatePopupVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          accessibilityLabel="Đóng bộ lọc thời gian"
          onPress={() => setDatePopupVisible(false)}
          style={styles.modalDismissArea}
        />
        <View style={styles.projectDateSheet} accessibilityViewIsModal>
          <View style={styles.modalHandle} />
          <View style={styles.projectDateSheetHeader}>
            <View style={styles.modalTitleCopy}>
              <Text style={styles.projectDateSheetTitle}>
                Lọc theo ngày tạo
              </Text>
              <Text style={styles.subtitle}>
                Chọn một khoảng ở hiện tại hoặc trong quá khứ.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={() => setDatePopupVisible(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
          </View>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Đơn vị thời gian"
            style={styles.projectDateModeRow}
          >
            {dateModeOptions.map((option) => {
              const selected = option.value === draftDateFilter;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setDraftDateFilter(option.value);
                    setCalendarCursor(draftDateAnchor);
                  }}
                  style={[
                    styles.projectDateModeOption,
                    selected && styles.projectDateModeOptionSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.projectDateModeText,
                      selected && styles.projectDateModeTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>Khoảng thời gian</Text>
          {draftDateFilter !== "year" ? (
            <View style={styles.projectCalendarCard}>
              <View style={styles.projectDateNavigator}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tháng trước"
                  onPress={() => {
                    if (draftDateFilter === "day")
                      setCalendarCursor(
                        moveProjectDatePeriod(
                          "month",
                          calendarDisplayDate,
                          -1,
                        ).toISOString(),
                      );
                    else
                      setDraftDateAnchor(
                        moveProjectDatePeriod(
                          draftDateFilter,
                          draftAnchorDate,
                          -1,
                        ).toISOString(),
                      );
                  }}
                  style={styles.projectDateNavButton}
                >
                  <Text style={styles.projectDateNavArrow}>‹</Text>
                </Pressable>
                <Text style={styles.projectCalendarMonth}>
                  {formatViMonth(calendarDisplayDate)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tháng tiếp theo"
                  disabled={calendarNextDisabled}
                  onPress={() => {
                    if (draftDateFilter === "day")
                      setCalendarCursor(
                        moveProjectDatePeriod(
                          "month",
                          calendarDisplayDate,
                          1,
                        ).toISOString(),
                      );
                    else
                      setDraftDateAnchor(
                        moveProjectDatePeriod(
                          draftDateFilter,
                          draftAnchorDate,
                          1,
                        ).toISOString(),
                      );
                  }}
                  style={[
                    styles.projectDateNavButton,
                    calendarNextDisabled && styles.disabled,
                  ]}
                >
                  <Text style={styles.projectDateNavArrow}>›</Text>
                </Pressable>
              </View>
              <View style={styles.projectCalendarWeekHeader}>
                {WEEKDAY_LABELS.map((label) => (
                  <Text key={label} style={styles.projectCalendarWeekday}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.projectCalendarGrid}>
                {calendarDays.map((day, index) => {
                  if (!day)
                    return (
                      <View
                        key={`blank-${index}`}
                        style={styles.projectCalendarDayCell}
                      />
                    );
                  const dayStart = projectDateRange("day", day)!.start;
                  const selectedRange = projectDateRange(
                    draftDateFilter,
                    draftAnchorDate,
                  )!;
                  const selected =
                    dayStart >= selectedRange.start &&
                    dayStart < selectedRange.end;
                  const today = sameDay(day, currentDate);
                  const future =
                    projectDateRange(draftDateFilter, day)!.start >
                    currentPeriodStart;
                  const hasProject = projectDotRows.some(
                    (project) =>
                      !!project.createdAt &&
                      sameDay(new Date(project.createdAt), day),
                  );
                  return (
                    <View
                      key={day.toISOString()}
                      style={styles.projectCalendarDayCell}
                    >
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityLabel={formatViDate(day)}
                        accessibilityState={{ selected, disabled: future }}
                        disabled={future}
                        onPress={() => {
                          setDraftDateAnchor(day.toISOString());
                          if (draftDateFilter === "day")
                            setCalendarCursor(day.toISOString());
                        }}
                        style={[
                          styles.projectCalendarDay,
                          today && styles.projectCalendarToday,
                          selected &&
                          (draftDateFilter === "day"
                            ? styles.projectCalendarDaySelected
                            : styles.projectCalendarPeriodDaySelected),
                          future && styles.projectCalendarDayDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.projectCalendarDayText,
                            today && styles.projectCalendarTodayText,
                            selected &&
                            (draftDateFilter === "day"
                              ? styles.projectCalendarDayTextSelected
                              : styles.projectCalendarPeriodDayTextSelected),
                          ]}
                        >
                          {formatViDate(day).slice(0, 2)}
                        </Text>
                        {hasProject && (
                          <View
                            style={[
                              styles.projectCalendarProjectDot,
                              draftDateFilter === "day" &&
                              selected &&
                              styles.projectCalendarProjectDotSelected,
                            ]}
                          />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.projectDateSelectionText}>
                Đã chọn: {formatProjectDatePeriod(
                  draftDateFilter,
                  draftAnchorDate,
                  currentDate,
                )}
              </Text>
              <Text style={styles.projectCalendarLegend}>● Có dự án</Text>
            </View>
          ) : (
            <View style={styles.projectPeriodPicker}>
              <View style={styles.projectDateNavigator}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Khoảng trước"
                  onPress={() =>
                    setDraftDateAnchor(
                      moveProjectDatePeriod(
                        draftDateFilter,
                        draftAnchorDate,
                        -1,
                      ).toISOString(),
                    )
                  }
                  style={styles.projectDateNavButton}
                >
                  <Text style={styles.projectDateNavArrow}>‹</Text>
                </Pressable>
                <Text style={styles.projectDateSelectedPeriod}>
                  {formatProjectDatePeriod(
                    draftDateFilter,
                    draftAnchorDate,
                    currentDate,
                  )}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Khoảng tiếp theo"
                  disabled={selectedPeriodStart >= currentPeriodStart}
                  onPress={() =>
                    setDraftDateAnchor(
                      moveProjectDatePeriod(
                        draftDateFilter,
                        draftAnchorDate,
                        1,
                      ).toISOString(),
                    )
                  }
                  style={[
                    styles.projectDateNavButton,
                    selectedPeriodStart >= currentPeriodStart &&
                    styles.disabled,
                  ]}
                >
                  <Text style={styles.projectDateNavArrow}>›</Text>
                </Pressable>
              </View>
              <Text style={styles.projectDatePickerHint}>
                Dùng nút lùi hoặc tiến để chọn năm mong muốn.
              </Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const now = new Date().toISOString();
              setDraftDateAnchor(now);
              setCalendarCursor(now);
            }}
            style={styles.projectDateCurrentButton}
          >
            <Text style={styles.projectDateCurrentButtonText}>
              Về thời gian hiện tại
            </Text>
          </Pressable>
          <View style={styles.modalActions}>
            <Pressable
              onPress={() => {
                onDateFilterChange("all", "");
                setDatePopupVisible(false);
              }}
              style={[
                styles.modalActionButton,
                styles.modalCancelButton,
              ]}
            >
              <Text style={styles.modalCancelText}>Tất cả thời gian</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onDateFilterChange(draftDateFilter, draftDateAnchor);
                setDatePopupVisible(false);
              }}
              style={[
                styles.modalActionButton,
                styles.modalCreateButton,
              ]}
            >
              <Text style={styles.buttonText}>Áp dụng</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

  </>);
}
