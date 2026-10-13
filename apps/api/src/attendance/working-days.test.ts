import { describe, expect, it } from 'vitest';
import { countWorkingDays, isSunday, nextWorkingDay, previousWorkingDay } from './working-days.js';

// 2026-09-20 is a Sunday.
const holidays = new Set(['2026-09-18']);

describe('working days (Sundays and HolidayM excluded)', () => {
  it('knows Sundays', () => {
    expect(isSunday('2026-09-20')).toBe(true);
    expect(isSunday('2026-09-21')).toBe(false);
  });

  it('steps back over a Sunday', () => {
    expect(previousWorkingDay('2026-09-21', holidays)).toBe('2026-09-19');
  });

  it('steps back over a holiday', () => {
    expect(previousWorkingDay('2026-09-19', holidays)).toBe('2026-09-17');
  });

  it('steps forward over holidays and Sundays', () => {
    expect(nextWorkingDay('2026-09-17', holidays)).toBe('2026-09-19');
    expect(nextWorkingDay('2026-09-19', holidays)).toBe('2026-09-21');
  });

  it('counts working days inclusively', () => {
    // 16, 17, (18 holiday), 19, (20 Sunday), 21
    expect(countWorkingDays('2026-09-16', '2026-09-21', holidays)).toBe(4);
  });
});
