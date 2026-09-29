export const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export type CalendarMode = 'day' | 'week' | 'month';
export type DateInput = Date | string | number;

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const invalidDateMessage = 'Ngày giờ không hợp lệ. Dùng dd/MM/yyyy HH:mm';
const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function asDate(input: DateInput) {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error('Ngày không hợp lệ');
  return date;
}

function vietnamParts(input: DateInput): DateParts {
  const values: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(asDate(input))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Creates an instant from civil date/time fields in Asia/Ho_Chi_Minh. */
function vietnamDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const requestedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let result = new Date(requestedAsUtc);

  // Resolve the time-zone offset using Intl instead of depending on the host's time zone.
  for (let attempt = 0; attempt < 2; attempt++) {
    const actual = vietnamParts(result);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, millisecond);
    result = new Date(result.getTime() + requestedAsUtc - actualAsUtc);
  }
  return result;
}

export function dateKey(input: DateInput) {
  const { year, month, day } = vietnamParts(input);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function sameDay(left: DateInput, right: DateInput) {
  return dateKey(left) === dateKey(right);
}

export function formatViDate(input: DateInput) {
  const { year, month, day } = vietnamParts(input);
  return `${pad(day)}/${pad(month)}/${year}`;
}

export function formatViDateTime(input: DateInput) {
  const { hour, minute } = vietnamParts(input);
  return `${formatViDate(input)} ${pad(hour)}:${pad(minute)}`;
}

export function formatViMonth(input: DateInput) {
  const { year, month } = vietnamParts(input);
  return `Tháng ${month}, ${year}`;
}

export function formatViCalendarTitle(input: DateInput, mode: CalendarMode) {
  if (mode === 'month') return formatViMonth(input);
  if (mode === 'day') return formatViDate(input);
  const week = buildWeekDays(input);
  return `Tuần ${formatViDate(week[0])} – ${formatViDate(week[6])}`;
}

export function toViDateTimeInput(input: DateInput) {
  return formatViDateTime(input);
}

export function parseViDateTime(input: string) {
  const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) throw new Error(invalidDateMessage);

  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    year < 1000 ||
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth(year, month) ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) throw new Error(invalidDateMessage);

  const parsed = vietnamDate(year, month, day, hour, minute);
  if (formatViDateTime(parsed) !== `${dayText}/${monthText}/${yearText} ${hourText}:${minuteText}`) {
    throw new Error(invalidDateMessage);
  }
  return parsed;
}

export function buildMonthGrid(input: DateInput): (Date | null)[] {
  const { year, month } = vietnamParts(input);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingBlanks = (firstWeekday + 6) % 7;
  const grid: (Date | null)[] = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    grid.push(vietnamDate(year, month, day));
  }
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

export function buildWeekDays(input: DateInput): Date[] {
  const { year, month, day } = vietnamParts(input);
  const civilDate = new Date(Date.UTC(year, month - 1, day));
  const distanceFromMonday = (civilDate.getUTCDay() + 6) % 7;
  civilDate.setUTCDate(civilDate.getUTCDate() - distanceFromMonday);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(civilDate);
    current.setUTCDate(civilDate.getUTCDate() + index);
    return vietnamDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate());
  });
}

export function moveCalendarDate(input: DateInput, mode: CalendarMode, direction: -1 | 1) {
  const source = asDate(input);
  const { year, month, day, hour, minute, second } = vietnamParts(source);
  if (mode === 'month') {
    const target = new Date(Date.UTC(year, month - 1 + direction, 1));
    const targetYear = target.getUTCFullYear();
    const targetMonth = target.getUTCMonth() + 1;
    return vietnamDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)), hour, minute, second, source.getUTCMilliseconds());
  }

  const target = new Date(Date.UTC(year, month - 1, day + direction * (mode === 'week' ? 7 : 1)));
  return vietnamDate(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), hour, minute, second, source.getUTCMilliseconds());
}
