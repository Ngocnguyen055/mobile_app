import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  buildWeekDays,
  dateKey,
  formatViCalendarTitle,
  formatViDate,
  formatViDateTime,
  formatViMonth,
  moveCalendarDate,
  parseViDateTime,
  sameDay,
  toViDateTimeInput
} from '../src/mobile/calendar.ts';

describe('Vietnamese calendar helpers', () => {
  it('builds September 2026 in Monday-first columns with complete weeks', () => {
    const grid = buildMonthGrid(parseViDateTime('26/09/2026 12:00'));
    expect(WEEKDAY_LABELS).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
    expect(grid).toHaveLength(35);
    expect(grid[0]).toBeNull();
    expect(dateKey(grid[1]!)).toBe('2026-09-01');
    expect(dateKey(grid[6]!)).toBe('2026-09-06');
    expect(dateKey(grid[30]!)).toBe('2026-09-30');
    expect(grid.slice(31)).toEqual([null, null, null, null]);
  });

  it('starts a Sunday week on the preceding Monday', () => {
    const week = buildWeekDays(parseViDateTime('27/09/2026 09:30'));
    expect(week.map(dateKey)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
      '2026-09-25', '2026-09-26', '2026-09-27'
    ]);
    expect(formatViCalendarTitle(week[6], 'week')).toBe('Tuần 21/09/2026 – 27/09/2026');
  });

  it('formats and parses Vietnamese dates independently of the host locale', () => {
    const date = parseViDateTime('26/09/2026 08:05');
    expect(date.toISOString()).toBe('2026-09-26T01:05:00.000Z');
    expect(formatViDate(date)).toBe('26/09/2026');
    expect(formatViDateTime(date)).toBe('26/09/2026 08:05');
    expect(toViDateTimeInput(date)).toBe('26/09/2026 08:05');
    expect(formatViMonth(date)).toBe('Tháng 9, 2026');
    expect(formatViCalendarTitle(date, 'day')).toBe('26/09/2026');
    expect(formatViCalendarTitle(date, 'month')).toBe('Tháng 9, 2026');
    expect(() => parseViDateTime('31/02/2026 08:00')).toThrow('Ngày giờ không hợp lệ');
    expect(() => parseViDateTime('26/09/2026 24:00')).toThrow('Ngày giờ không hợp lệ');
  });

  it('uses Asia/Ho_Chi_Minh when an UTC instant crosses midnight', () => {
    const beforeMidnightUtc = new Date('2026-09-26T16:59:59.000Z');
    const afterMidnightUtc = new Date('2026-09-26T18:00:00.000Z');
    expect(dateKey(beforeMidnightUtc)).toBe('2026-09-26');
    expect(dateKey(afterMidnightUtc)).toBe('2026-09-27');
    expect(sameDay(afterMidnightUtc, parseViDateTime('27/09/2026 01:00'))).toBe(true);
  });

  it('clamps month navigation and handles leap years and year boundaries', () => {
    const january31 = parseViDateTime('31/01/2026 17:45');
    expect(toViDateTimeInput(moveCalendarDate(january31, 'month', 1))).toBe('28/02/2026 17:45');
    expect(formatViDate(moveCalendarDate(parseViDateTime('31/01/2024 10:00'), 'month', 1))).toBe('29/02/2024');
    expect(formatViDate(moveCalendarDate(parseViDateTime('15/12/2026 10:00'), 'month', 1))).toBe('15/01/2027');
    expect(formatViDate(moveCalendarDate(parseViDateTime('01/01/2026 10:00'), 'day', -1))).toBe('31/12/2025');
  });
});
