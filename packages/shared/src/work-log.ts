import { z } from 'zod';
import { clockTime, isoDate } from './auth.js';

/**
 * One line of the logout work report (frmLogoutNew `dgMain`). Rows with a TableName come from
 * WorkReportM (entries the app logged automatically); rows without one are manual entries.
 */
export const workLogRowSchema = z.object({
  workId: z.number().int(),
  tableName: z.string(),
  vibhagId: z.number().int(),
  vibhagName: z.string(),
  workTypeId: z.number().int(),
  workTypeName: z.string(),
  qty: z.number().int(),
  mistakeSum: z.number().int(),
  hrs: z.number().int().min(0).max(23),
  min: z.number().int().min(0).max(59),
  remark: z.string(),
  isManualEntry: z.boolean(),
});
export type WorkLogRow = z.infer<typeof workLogRowSchema>;

export const workLogDetailSchema = z.object({
  logId: z.number().int(),
  userId: z.number().int(),
  userName: z.string(),
  logDate: isoDate,
  loginTime: clockTime,
  logoutTime: clockTime.nullable(),
  /**
   * A past day being completed (the desktop's `boolPendingLog`): total time is logout − login.
   * Otherwise it is today's session and total time runs up to the server clock.
   */
  isPending: z.boolean(),
  /** Another user's log opened through Report: view only (desktop disables New/Delete/Save). */
  readOnly: z.boolean(),
  serverTime: clockTime,
  rows: z.array(workLogRowSchema),
});
export type WorkLogDetail = z.infer<typeof workLogDetailSchema>;

export const saveWorkLogRequestSchema = z.object({
  rows: z.array(workLogRowSchema),
});
export type SaveWorkLogRequest = z.infer<typeof saveWorkLogRequestSchema>;

export const lookupOptionSchema = z.object({ id: z.number().int(), name: z.string() });
export type LookupOption = z.infer<typeof lookupOptionSchema>;

/** `GetTimeDiff` in clsCommon: to − from as HH:mm:ss, or null if either is missing/invalid. */
export function timeDiff(from: string | null, to: string | null): string | null {
  const f = parseClock(from);
  const t = parseClock(to);
  if (f === null || t === null) return null;
  const diff = t - f;
  if (diff < 0) return null;
  return formatClock(diff);
}

export function parseClock(value: string | null | undefined): number | null {
  const m = value?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Total of the rows' Hrs/Min in minutes (frmLogoutNew `RefreshTotalTime`). */
export function reportedMinutes(rows: Pick<WorkLogRow, 'hrs' | 'min'>[]): number {
  // The desktop carries minutes with `-= 59`, over-counting a minute per carry. We use 60.
  return rows.reduce((sum, r) => sum + r.hrs * 60 + r.min, 0);
}

/**
 * frmLogoutNew `GetValidationMessage`, message text kept verbatim. `totalTime` is the logged
 * time (logout − login) as HH:mm:ss. Returns an empty list when the report may be saved.
 */
export function validateWorkLog(
  rows: Pick<WorkLogRow, 'hrs' | 'min' | 'vibhagId' | 'workTypeId' | 'isManualEntry'>[],
  totalTime: string,
): string[] {
  const messages: string[] = [];
  rows.forEach((row, i) => {
    const line = i + 1;
    const hasTime = row.hrs > 0 || row.min > 0;
    if (!row.isManualEntry && !hasTime) messages.push(`Please Select Hrs/Min At Line ${line}`);
    if (hasTime) {
      if (row.vibhagId === 0) messages.push(`Please Select Vibhag At Line ${line}`);
      if (row.workTypeId === 0) messages.push(`Please Select Work Type At Line ${line}`);
    }
  });

  const reported = reportedMinutes(rows);
  const [hh = '00', mm = '00'] = totalTime.split(':');
  const logged = Number(hh) * 60 + Number(mm);
  const shown = `${hh}:${mm}`;
  if (reported > logged) messages.push(`Total Work Time cannot be Greater than : ${shown}`);
  else if (reported < logged - 5) messages.push(`Total Work Time cannot be Less than : ${shown}`);
  return messages;
}
