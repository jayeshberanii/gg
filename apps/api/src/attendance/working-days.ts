/**
 * Calendar helpers for the desktop's attendance rules (frmLogoutNew.SaveLog). A working day is
 * any day that is not a Sunday and not in HolidayM. Dates are ISO `YYYY-MM-DD` strings; the
 * arithmetic runs in UTC so the server's time zone cannot shift a day.
 */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isSunday(iso: string): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
}

export function isWorkingDay(iso: string, holidays: ReadonlySet<string>): boolean {
  return !isSunday(iso) && !holidays.has(iso);
}

/** The last working day strictly before `iso`. */
export function previousWorkingDay(iso: string, holidays: ReadonlySet<string>): string {
  let d = addDays(iso, -1);
  while (!isWorkingDay(d, holidays)) d = addDays(d, -1);
  return d;
}

/** The first working day strictly after `iso`. */
export function nextWorkingDay(iso: string, holidays: ReadonlySet<string>): string {
  let d = addDays(iso, 1);
  while (!isWorkingDay(d, holidays)) d = addDays(d, 1);
  return d;
}

/** Working days in [from, to], both ends included (the leave's TotalDays). */
export function countWorkingDays(from: string, to: string, holidays: ReadonlySet<string>): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, holidays)) n++;
  return n;
}
