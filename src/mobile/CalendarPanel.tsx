import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CalendarEvent, Project, ProjectSummary, Task } from './api.ts';
import type { ReminderOffset } from './local.ts';
import NativeDateTimeField from './NativeDateTimeField.tsx';
import { calendarCreatePermissions, calendarProjectId, matchesCalendarScope, type CalendarScope } from './calendarPolicy.ts';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  buildWeekDays,
  dateKey,
  formatViCalendarTitle,
  formatViDate,
  formatViDateTime,
  moveCalendarDate,
  parseViDateTime,
  sameDay,
  toViDateTimeInput,
  type CalendarMode,
} from './calendar.ts';

export type EventDraft = {
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reminderOffsets: ReminderOffset[];
  projectId: string | null;
};

type Props = {
  tasks: Task[];
  events: CalendarEvent[];
  projects: Project[];
  scope?: CalendarScope;
  fixedProjectId?: string;
  initialEvent?: CalendarEvent | null;
  defaultReminderOffsets: ReminderOffset[];
  onSaveEvent: (event: CalendarEvent | null, draft: EventDraft) => Promise<void>;
  onDeleteEvent: (event: CalendarEvent) => Promise<void>;
  onOpenTask: (task: Task) => void;
  onOpenProjectEvent?: (event: CalendarEvent) => void;
  onInitialEventHandled?: () => void;
  onDeleteTask: (task: Task) => Promise<void>;
  onError: (message: string) => void;
};

const reminderOptions: [ReminderOffset, string][] = [
  [604800000, '1 tuần'],
  [86400000, '1 ngày'],
  [3600000, '1 giờ'],
];

const projectNameOf = (value: string | ProjectSummary | null | undefined, projects: Project[]) => {
  if (!value) return 'Cá nhân';
  if (typeof value !== 'string') return value.name;
  return projects.find(project => project._id === value)?.name || 'Dự án';
};
const statusLabel: Record<Task['status'], string> = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Hoàn thành' };

function parsedDateOrUndefined(value: string) {
  try {
    return parseViDateTime(value);
  } catch {
    return undefined;
  }
}

function actionButton(label: string, action: () => void, secondary = false, disabled = false) {
  return <Pressable accessibilityRole="button" onPress={action} disabled={disabled} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
  </Pressable>;
}

function occursOn(event: CalendarEvent, day: Date) {
  const starts = dateKey(new Date(event.startsAt));
  const exclusiveEnd = Math.max(new Date(event.endsAt).getTime() - 1, new Date(event.startsAt).getTime());
  const ends = dateKey(new Date(exclusiveEnd));
  const key = dateKey(day);
  return starts <= key && key <= ends;
}

export default function CalendarPanel({
  tasks,
  events,
  projects,
  scope = 'all',
  fixedProjectId,
  initialEvent,
  defaultReminderOffsets,
  onSaveEvent,
  onDeleteEvent,
  onOpenTask,
  onOpenProjectEvent,
  onInitialEventHandled,
  onDeleteTask,
  onError,
}: Props) {
  const [mode, setMode] = useState<CalendarMode>('month');
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [eventProjectId, setEventProjectId] = useState<string | null>(fixedProjectId || null);
  const [eventOffsets, setEventOffsets] = useState<ReminderOffset[]>(defaultReminderOffsets);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');

  const visibleTasks = useMemo(() => tasks.filter(task => {
    if (fixedProjectId) return calendarProjectId(task.project) === fixedProjectId;
    return matchesCalendarScope(scope, task.project);
  }), [tasks, fixedProjectId, scope]);
  const visibleEvents = useMemo(() => events.filter(event => {
    if (fixedProjectId) return calendarProjectId(event.project) === fixedProjectId;
    return matchesCalendarScope(scope, event.project);
  }), [events, fixedProjectId, scope]);

  const cells = mode === 'month' ? buildMonthGrid(selectedDay) : mode === 'week' ? buildWeekDays(selectedDay) : [selectedDay];
  const selectedTasks = visibleTasks.filter(task => task.dueAt && sameDay(new Date(task.dueAt), selectedDay));
  const selectedEvents = visibleEvents.filter(event => occursOn(event, selectedDay));
  const permissions = calendarCreatePermissions(scope, fixedProjectId);

  const resetEditor = () => {
    setEditing(null);
    setEditorVisible(false);
    setTitle('');
    setStartsAt('');
    setEndsAt('');
    setAllDay(false);
    setEventProjectId(null);
    setEventOffsets(defaultReminderOffsets);
    setEditorError('');
  };

  const beginNew = () => {
    if (!permissions.canCreateEvent) return;
    const day = formatViDate(selectedDay);
    const start = parseViDateTime(`${day} 09:00`);
    const end = parseViDateTime(`${day} 10:00`);
    setEditing(null);
    setTitle('');
    setStartsAt(toViDateTimeInput(start));
    setEndsAt(toViDateTimeInput(end));
    setAllDay(false);
    setEventProjectId(null);
    setEventOffsets(defaultReminderOffsets.length ? defaultReminderOffsets : [86400000]);
    setEditorError('');
    setEditorVisible(true);
  };

  const beginEdit = (event: CalendarEvent) => {
    setEditing(event);
    setTitle(event.title);
    setStartsAt(toViDateTimeInput(event.startsAt));
    setEndsAt(toViDateTimeInput(event.endsAt));
    setAllDay(!!event.allDay);
    setEventProjectId(calendarProjectId(event.project) || null);
    setEventOffsets((event.reminderOffsets || []) as ReminderOffset[]);
    setEditorError('');
    setEditorVisible(true);
  };

  useEffect(() => {
    if (!initialEvent) return;
    setSelectedDay(new Date(initialEvent.startsAt));
    beginEdit(initialEvent);
    onInitialEventHandled?.();
  }, [initialEvent?._id]);

  const submit = async () => {
    try {
      setEditorError('');
      let start = parseViDateTime(startsAt);
      let end = parseViDateTime(endsAt);
      if (allDay) {
        start = parseViDateTime(`${formatViDate(start)} 00:00`);
        end = parseViDateTime(`${formatViDate(end)} 00:00`);
        if (end <= start && formatViDate(end) === formatViDate(start)) end = new Date(start.getTime() + 86400000);
      }
      if (!title.trim()) throw new Error('Nội dung sự kiện không được để trống.');
      if (end <= start) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.');
      setSaving(true);
      await onSaveEvent(editing, {
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay,
        reminderOffsets: eventOffsets,
        projectId: fixedProjectId || (scope === 'all' ? eventProjectId : null),
      });
      resetEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () => {
    if (!saving) resetEditor();
  };

  const confirmDeleteEvent = (event: CalendarEvent) => Alert.alert('Xóa sự kiện?', event.title, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => void onDeleteEvent(event).catch(error => onError(String(error))) },
  ]);
  const confirmDeleteTask = (task: Task) => Alert.alert('Xóa công việc?', task.title, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => void onDeleteTask(task).catch(error => onError(String(error))) },
  ]);

  return <View style={styles.container}>
    <View style={styles.modeRow}>
      {(['day', 'week', 'month'] as CalendarMode[]).map(value => <Pressable key={value} onPress={() => setMode(value)} style={[styles.modeButton, mode === value && styles.activeMode]}>
        <Text style={mode === value ? styles.activeModeText : styles.modeText}>{({ day: 'Ngày', week: 'Tuần', month: 'Tháng' })[value]}</Text>
      </Pressable>)}
    </View>

    <View style={styles.calendarHeader}>
      {actionButton('‹', () => setSelectedDay(current => moveCalendarDate(current, mode, -1)), true)}
      <View style={styles.calendarTitleWrap}>
        <Text style={styles.calendarTitle}>{formatViCalendarTitle(selectedDay, mode)}</Text>
        {sameDay(selectedDay, new Date()) && <Text style={styles.todayLabel}>Hôm nay</Text>}
      </View>
      {actionButton('›', () => setSelectedDay(current => moveCalendarDate(current, mode, 1)), true)}
    </View>

    {mode !== 'day' && <View style={styles.weekHeader}>
      {WEEKDAY_LABELS.map((label, index) => <Text key={label} style={[styles.weekLabel, index === 6 && styles.sunday]}>{label}</Text>)}
    </View>}
    <View style={styles.calendarGrid}>
      {cells.map((day, index) => {
        if (!day) return <View key={`empty-${index}`} style={styles.emptyDay}/>;
        const taskItems = visibleTasks.filter(task => task.dueAt && sameDay(new Date(task.dueAt), day));
        const eventItems = visibleEvents.filter(event => occursOn(event, day));
        const overdue = taskItems.some(task => task.status !== 'done' && task.dueAt && new Date(task.dueAt).getTime() < Date.now());
        return <Pressable key={`${dateKey(day)}-${index}`} onPress={() => setSelectedDay(day)} style={[
          styles.dayCell,
          mode === 'day' && styles.singleDayCell,
          sameDay(day, selectedDay) && styles.selectedDay,
          sameDay(day, new Date()) && styles.todayCell,
        ]}>
          <Text style={[styles.dayNumber, sameDay(day, selectedDay) && styles.selectedDayText]}>{Number(dateKey(day).slice(-2))}</Text>
          <View style={styles.dotRow}>
            {!!taskItems.length && <Text style={[styles.dot, overdue && styles.overdueDot]}>●</Text>}
            {!!eventItems.length && <Text style={[styles.dot, styles.eventDot]}>●</Text>}
          </View>
        </Pressable>;
      })}
    </View>
    <View style={styles.legend}><Text style={styles.legendTask}>● Deadline</Text><Text style={styles.legendEvent}>● Sự kiện</Text></View>

    <Text style={styles.selectedTitle}>{formatViDate(selectedDay)}</Text>
    {permissions.canCreateEvent && <View style={styles.wrap}>{actionButton('+ Thêm sự kiện', beginNew)}</View>}

    {!selectedTasks.length && !selectedEvents.length && <View style={styles.emptyAgenda}><Text style={styles.muted}>Chưa có lịch trong ngày này.</Text></View>}
    {selectedTasks.map(task => <View style={styles.card} key={`task-${task._id}`}>
      <View style={styles.badgeRow}><Text style={styles.taskBadge}>TASK</Text><Text style={styles.projectLabel}>{projectNameOf(task.project, projects)}</Text></View>
      <Text style={styles.cardTitle}>{task.title}</Text>
      <Text>Bắt đầu: {task.startsAt ? formatViDateTime(task.startsAt) : 'Chưa đặt'}</Text>
      <Text>Kết thúc: {task.dueAt ? formatViDateTime(task.dueAt) : 'Chưa đặt'} · {statusLabel[task.status]}</Text>
      {!!task.description && <Text style={styles.note}>{task.description}</Text>}
      <View style={styles.wrap}>
        {actionButton('Xem / sửa', () => onOpenTask(task), true)}
        {!!fixedProjectId && actionButton('Xóa', () => confirmDeleteTask(task), true)}
      </View>
    </View>)}
    {selectedEvents.map(event => <View style={styles.card} key={`event-${event._id}`}>
      <View style={styles.badgeRow}><Text style={styles.eventBadge}>SỰ KIỆN</Text><Text style={styles.projectLabel}>{projectNameOf(event.project, projects)}</Text></View>
      <Text style={styles.cardTitle}>{event.title}</Text>
      <Text>{event.allDay ? 'Cả ngày' : `${formatViDateTime(event.startsAt)} – ${formatViDateTime(event.endsAt)}`}</Text>
      {!!event.reminderOffsets?.length && <Text style={styles.muted}>Nhắc: {event.reminderOffsets.map(offset => reminderOptions.find(([value]) => value === offset)?.[1]).filter(Boolean).join(', ')}</Text>}
      <View style={styles.wrap}>{!fixedProjectId && calendarProjectId(event.project)
        ? actionButton('Xem / sửa', () => onOpenProjectEvent?.(event), true, !onOpenProjectEvent)
        : <>{actionButton('Sửa', () => beginEdit(event), true)}{actionButton('Xóa', () => confirmDeleteEvent(event), true)}</>}
      </View>
    </View>)}

    <Modal
      animationType="slide"
      hardwareAccelerated
      onRequestClose={closeEditor}
      statusBarTranslucent
      transparent
      visible={editorVisible}
    >
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalSheet} accessibilityViewIsModal>
          <View style={styles.modalHandle}/>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeading}>
              <Text accessibilityRole="header" style={styles.editorTitle}>{editing ? 'Sửa sự kiện' : 'Thêm sự kiện'}</Text>
              <Text style={styles.modalSubtitle}>{editing ? 'Cập nhật nội dung và thời gian' : `Ngày ${formatViDate(selectedDay)}`}</Text>
            </View>
            <Pressable accessibilityLabel="Đóng biểu mẫu sự kiện" accessibilityRole="button" disabled={saving} hitSlop={8} onPress={closeEditor} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          {!!editorError && <View style={styles.editorErrorBox}><Text accessibilityRole="alert" style={styles.editorError}>{editorError}</Text></View>}

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>Nội dung sự kiện</Text>
            <TextInput
              accessibilityLabel="Nội dung sự kiện"
              value={title}
              onChangeText={setTitle}
              placeholder="Nhập nội dung sự kiện"
              placeholderTextColor="#64748b"
              style={styles.input}
              keyboardType="default"
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
            />
            <NativeDateTimeField label="Bắt đầu" value={startsAt} onChange={setStartsAt} dateOnly={allDay}/>
            <NativeDateTimeField label="Kết thúc" value={endsAt} onChange={setEndsAt} dateOnly={allDay} minimumDate={parsedDateOrUndefined(startsAt)}/>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allDay }} onPress={() => setAllDay(value => !value)} style={[styles.chip, styles.singleChip, allDay && styles.activeChip]}>
              <Text style={[styles.chipText, allDay && styles.activeChipText]}>{allDay ? '☑' : '☐'} Cả ngày</Text>
            </Pressable>
            {allDay && <Text style={styles.muted}>Giờ được lưu thành 00:00; ngày kết thúc là ngày kế tiếp.</Text>}

            {!fixedProjectId && scope === 'all' && <>
              <Text style={styles.fieldLabel}>Thuộc lịch</Text>
              <View style={styles.wrap}>
                <Pressable accessibilityRole="radio" accessibilityState={{ selected: !eventProjectId }} onPress={() => setEventProjectId(null)} style={[styles.chip, !eventProjectId && styles.activeChip]}><Text style={[styles.chipText, !eventProjectId && styles.activeChipText]}>Cá nhân</Text></Pressable>
                {projects.map(project => <Pressable accessibilityRole="radio" accessibilityState={{ selected: eventProjectId === project._id }} key={project._id} onPress={() => setEventProjectId(project._id)} style={[styles.chip, eventProjectId === project._id && styles.activeChip]}><Text style={[styles.chipText, eventProjectId === project._id && styles.activeChipText]}>{project.name}</Text></Pressable>)}
              </View>
            </>}
            {!fixedProjectId && scope === 'personal' && <Text style={styles.muted}>Thuộc lịch: Cá nhân</Text>}
            {!!fixedProjectId && <Text style={styles.muted}>Thuộc lịch: {projectNameOf(fixedProjectId, projects)}</Text>}

            <Text style={styles.fieldLabel}>Nhắc trước</Text>
            <View style={styles.wrap}>{reminderOptions.map(([value, label]) => {
              const active = eventOffsets.includes(value);
              return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: active }} key={value} onPress={() => setEventOffsets(current => active ? current.filter(item => item !== value) : [...current, value])} style={[styles.chip, active && styles.activeChip]}><Text style={[styles.chipText, active && styles.activeChipText]}>{active ? '☑' : '☐'} {label}</Text></Pressable>;
            })}</View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={closeEditor} style={[styles.modalAction, styles.modalCancelAction, saving && styles.disabled]}>
              <Text style={styles.modalCancelText}>Hủy</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }} disabled={saving} onPress={() => void submit()} style={[styles.modalAction, styles.modalSaveAction, saving && styles.disabled]}>
              <Text style={styles.modalSaveText}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo sự kiện'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  sectionTitle: { fontWeight: '700', color: '#334155' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#94a3b8', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, marginBottom: 3 },
  chipText: { color: '#0f172a', fontWeight: '500' },
  activeChip: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  activeChipText: { color: '#fff', fontWeight: '700' },
  modeRow: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 10, padding: 3 },
  modeButton: { flex: 1, padding: 9, alignItems: 'center', borderRadius: 8 },
  activeMode: { backgroundColor: '#2563eb' },
  modeText: { color: '#334155', fontWeight: '600' },
  activeModeText: { color: '#fff', fontWeight: '700' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarTitleWrap: { alignItems: 'center', flex: 1 },
  calendarTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  todayLabel: { color: '#2563eb', fontWeight: '600', marginTop: 3 },
  weekHeader: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  weekLabel: { width: '14.2857%', textAlign: 'center', paddingVertical: 7, color: '#475569', fontWeight: '700' },
  sunday: { color: '#dc2626' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#e2e8f0' },
  emptyDay: { width: '14.2857%', minHeight: 54, backgroundColor: '#f8fafc', borderWidth: 0.5, borderColor: '#e2e8f0' },
  singleDayCell: { width: '100%', minHeight: 68, borderRadius: 8 },
  selectedDay: { backgroundColor: '#2563eb' },
  todayCell: { borderWidth: 2, borderColor: '#0ea5e9' },
  dayNumber: { color: '#0f172a' },
  selectedDayText: { color: '#fff', fontWeight: '800' },
  dotRow: { flexDirection: 'row', height: 13 },
  dot: { color: '#2563eb', fontSize: 10, marginHorizontal: 1 },
  eventDot: { color: '#16a34a' },
  overdueDot: { color: '#dc2626' },
  legend: { flexDirection: 'row', gap: 14 },
  legendTask: { color: '#2563eb', fontSize: 12 },
  legendEvent: { color: '#16a34a', fontSize: 12 },
  selectedTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  emptyAgenda: { padding: 16, alignItems: 'center', backgroundColor: '#fff', borderRadius: 10 },
  card: { padding: 12, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  taskBadge: { backgroundColor: '#dbeafe', color: '#1d4ed8', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: '800' },
  eventBadge: { backgroundColor: '#dcfce7', color: '#15803d', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: '800' },
  projectLabel: { color: '#64748b', fontSize: 12 },
  note: { color: '#334155' },
  muted: { color: '#64748b', fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)', paddingTop: 28 },
  modalSheet: { height: '94%', backgroundColor: '#f8fafc', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  modalHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', alignSelf: 'center', marginTop: 8 },
  modalHeader: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center' },
  modalHeading: { flex: 1 },
  editorTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { color: '#64748b', marginTop: 2 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  closeButtonText: { color: '#334155', fontSize: 30, lineHeight: 32 },
  editorErrorBox: { backgroundColor: '#fee2e2', borderBottomWidth: 1, borderBottomColor: '#fecaca', paddingHorizontal: 16, paddingVertical: 9 },
  editorError: { color: '#991b1b', fontWeight: '600' },
  modalScroll: { flex: 1 },
  modalContent: { padding: 16, paddingBottom: 28, gap: 12 },
  modalFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 14, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  modalAction: { flex: 1, minHeight: 46, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  modalCancelAction: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#2563eb' },
  modalSaveAction: { backgroundColor: '#2563eb' },
  modalCancelText: { color: '#1d4ed8', fontWeight: '700' },
  modalSaveText: { color: '#fff', fontWeight: '700' },
  fieldLabel: { fontWeight: '700', color: '#334155', marginTop: 2 },
  input: { borderWidth: 1, borderColor: '#94a3b8', backgroundColor: '#fff', color: '#0f172a', borderRadius: 8, padding: 10, fontSize: 15 },
  singleChip: { alignSelf: 'flex-start' },
  button: { backgroundColor: '#2563eb', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 8, marginBottom: 3 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#2563eb' },
  secondaryButtonText: { color: '#1d4ed8' },
  disabled: { opacity: 0.4 },
});
