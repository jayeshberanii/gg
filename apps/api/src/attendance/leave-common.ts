import { isLcEgLeaveType } from '@gglib/shared';
import { sql } from 'kysely';
import { type Executor, holidaysBetween } from '../db/legacy-sql.js';
import { countWorkingDays } from './working-days.js';

/**
 * What the login-time leave (attendance.service.ts) and Employee › Leaves (frmLeaveM) share:
 * the columnmaster lookups by name and the TotalDays rule, so both write LeaveM the same way.
 */

/** `(SELECT ColumnMastKm FROM ColumnMaster WHERE Vibhag='LeaveStatus' AND Name=…)`, as SQL. */
export const leaveStatusIdSql = (name: string) =>
  sql<number>`(SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'LeaveStatus' AND Name = ${name})`;

/** A LeaveStatus row's id by name (GetScalarValue: 0 when there is none). */
export async function leaveStatusId(db: Executor, name: string): Promise<number> {
  const { rows } = await sql<{ id: number | null }>`SELECT ${leaveStatusIdSql(name)} AS id`.execute(
    db,
  );
  return Number(rows[0]?.id ?? 0);
}

/** A LeaveType row's id by name (frmLeaveM.Save's SPL lookup), 0 when there is none. */
export async function leaveTypeId(db: Executor, name: string): Promise<number> {
  const { rows } = await sql<{ id: number | null }>`
    SELECT (SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'LeaveType' AND Name = ${name}) AS id
  `.execute(db);
  return Number(rows[0]?.id ?? 0);
}

/**
 * frmLeaveM.GetTotalDays: 0 for an LC / EG leave, else the working days from..to (Sundays and
 * HolidayM excluded, both ends included; 0 when from > to), which is LeaveMRepository.GetTotalDays.
 */
export async function leaveTotalDays(
  db: Executor,
  from: string,
  to: string,
  typeName: string | null | undefined,
): Promise<number> {
  if (isLcEgLeaveType(typeName)) return 0;
  if (from > to) return 0;
  return countWorkingDays(from, to, await holidaysBetween(db, from, to));
}
