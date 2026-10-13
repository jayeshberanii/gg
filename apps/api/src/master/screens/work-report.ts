import { BadRequestException } from '@nestjs/common';
import { type GridRow, type GridValue, type SessionUser, UserType } from '@gglib/shared';
import { type RawBuilder, sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { normalizeRow } from '../values.js';
import type { ScreenDefinition } from './registry.js';

type Sql = RawBuilder<unknown>;

/**
 * `IsAdminLogin = False And curr_utypeid <> AMaster` → `tid IN (curr_lnid, GetReportingByTid(curr_lnid))`:
 * anyone but an admin or AMaster sees only themselves and the employees reporting to them
 * directly (EmpReportingT). Null for those who see everyone. frmWorkReportM and frmLogReport
 * both scope this way; only Work Report adds the IsActive condition.
 */
export function reportingScope(user: SessionUser, column: Sql): Sql | null {
  if (user.isAdmin || user.userType === UserType.AMaster) return null;
  return sql`(${column} = ${user.id} OR ${column} IN (SELECT EmployeeKt FROM EmpReportingT WHERE ReportingToKt = ${user.id}))`;
}

/**
 * frmWorkReportM_Load's DefaultCond on a user column: anyone but an admin or AMaster sees only
 * themselves and the employees reporting to them (GetReportingByTid), and only active users.
 */
export function visibleWorkUsers(user: SessionUser, column: Sql): Sql {
  const active = sql`${column} IN (SELECT tid FROM Usecurity WHERE IsActive = 1)`;
  const scope = reportingScope(user, column);
  return scope ? sql`${scope} AND ${active}` : active;
}

/** WorkReportMRepository.ListGridData's two column lists: the detail rows, or the day counts. */
const DETAIL_COLUMNS = sql`
  WorkDate, (SELECT uname FROM Usecurity WHERE tid = WorkReportM.DoneByGId) DoneByGIdName, DoneByGId,
  WorkReportKm, (SELECT Name FROM columnmaster WHERE ColumnMastkm = WorkReportM.WorkTypeGId AND Vibhag = 'worktype') WorkTypeGIdName,
  WorkTypeGId, ColumnName, Mistake, RecordNo, Remark, TableName, alterTime, 0 Qty`;
const COUNT_COLUMNS = sql`
  WorkDate, (SELECT uname FROM Usecurity WHERE tid = WorkReportM.DoneByGId) DoneByGIdName, DoneByGId,
  0 WorkReportKm, (SELECT Name FROM columnmaster WHERE ColumnMastkm = WorkReportM.WorkTypeGId AND Vibhag = 'worktype') WorkTypeGIdName,
  WorkTypeGId, '' ColumnName, '' Mistake, 0 RecordNo, '' Remark, TableName, '' alterTime, COUNT(DoneByGId) Qty`;

/**
 * WorkReportMRepository.GetMistakeRemarkDetail (Compare Data): the entry's old values
 * (Mistake) beside its new ones (Remark), one row per changed value. Both read
 * "col(value)~col(value)…=count"; the "=count" is cut off at the last "=", the rest split on
 * "~", and each part's text before "(" is its column. Every column (Remark's first, then any
 * only in Mistake) lists its old and new parts side by side, the shorter side padded at the
 * top; the column name shows on its first row only.
 */
export function mistakeRemarkDetail(oldData: string, newData: string): GridValue[][] {
  const out: GridValue[][] = [];
  if (oldData === '' && newData === '') return out;
  const parts = (s: string) => {
    const eq = s.lastIndexOf('=');
    return (eq >= 0 ? s.slice(0, eq) : s).split('~');
  };
  const oldParts = parts(oldData);
  const newParts = parts(newData);
  const colOf = (p: string) => {
    const paren = p.indexOf('(');
    return p.trim() !== '' && paren >= 0 ? p.slice(0, paren).toLowerCase() : null;
  };
  const oldCols = [...new Set(oldParts.map(colOf).filter((c): c is string => c !== null))];
  const cols = newParts.map(colOf).filter((c): c is string => c !== null);
  for (const c of oldCols) if (!cols.includes(c)) cols.push(c);
  let previous = '';
  for (const col of new Set(cols)) {
    const olds = oldParts.filter((p) => p.toLowerCase().startsWith(col));
    const news = newParts.filter((p) => p.toLowerCase().startsWith(col));
    while (olds.length > news.length) news.unshift('');
    while (news.length > olds.length) olds.unshift('');
    for (let i = 0; i < news.length; i++) {
      out.push([
        col !== previous ? col : null,
        olds[i]!.length > 0 ? olds[i]!.slice(col.length) : null,
        news[i]!.length > 0 ? news[i]!.slice(col.length) : null,
      ]);
      previous = col;
    }
  }
  return out;
}

/** A (DoneBy, Workdate) day of the grid, as the client sends it: "uid|yyyy-mm-dd". */
export function parseDay(s: string): { userId: number; date: string } {
  const m = s.match(/^(\d{1,9})\|(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw new BadRequestException('Bad day');
  return { userId: Number(m[1]), date: m[2]! };
}

/**
 * `SELECT logID FROM log WHERE uid=… AND logdate=…` (GetScalarValue: the first row), within
 * `scope`, a condition on `log.uid` (the users the calling screen shows), or 0.
 */
export async function logIdOf(db: Executor, scope: Sql, userId: number, date: string) {
  const { rows } = await sql<{ logID: string | number }>`
    SELECT TOP (1) logID FROM log
    WHERE uid = ${userId} AND logdate = CAST(${date} AS date) AND ${scope}
  `.execute(db);
  return rows[0] ? Number(rows[0].logID) : 0;
}

/**
 * Employee › Work Report (frmWorkReportM, WorkReportMRepository). A read-only list of the
 * WorkReportM change log; see docs/screens/work-report.md.
 */
export const workReport: ScreenDefinition = {
  screen: 'work-report',
  table: 'WorkReportM',
  primaryColumn: 'WorkReportKm',
  lockable: false,
  readOnly: true,

  listFilter: (user) => visibleWorkUsers(user, sql`WorkReportM.DoneByGId`),

  /**
   * FillList → ListGridData(boolDisplayCount, StrId, Top, DefaultWhereCond): the last month
   * (Top = 1) unless StrId names the records; Display Count groups by day, user, type, table.
   */
  async listRows(db, { ids, params, filter }) {
    const count = params.displayCount === true;
    const { rows } = await sql<GridRow>`
      SELECT ${count ? COUNT_COLUMNS : DETAIL_COLUMNS}
      FROM WorkReportM
      WHERE 1 = 1 ${filter}
        ${ids ? sql`AND WorkReportKm IN ${idList(ids.length ? ids : [0])}` : sql``}
        ${ids ? sql`` : sql`AND Workdate >= DATEADD(MONTH, -1, GETDATE())`}
      ${count ? sql`GROUP BY Workdate, DoneByGId, WorkTypeGId, TableName` : sql``}
      ORDER BY CAST(Workdate AS DATE) DESC, DoneByGIdName, TableName
    `.execute(db);
    return rows.map(normalizeRow);
  },

  validate: () => 'Record Cannot Be Saved',
  save: () => Promise.reject(new BadRequestException('Record Cannot Be Saved')),

  actions: {
    /** Compare Data: GetMistakeRemarkDetail(dgMain.CurrentRow's WorkReportKm), for frmPopup. */
    async 'compare-data'(db, user, ids) {
      const id = Math.trunc(ids[0] ?? 0);
      const { rows } = await sql<{ OldData: string | null; NewData: string | null }>`
        SELECT ISNULL(Mistake, '') OldData, ISNULL(Remark, '') NewData FROM WorkReportM
        WHERE WorkReportKm = ${id} AND ${visibleWorkUsers(user, sql`WorkReportM.DoneByGId`)}
      `.execute(db);
      const row = rows[0];
      return {
        kind: 'table',
        title: '',
        columns: ['ColName', 'OldData', 'NewData'],
        rows: row ? mistakeRemarkDetail(row.OldData ?? '', row.NewData ?? '') : [],
      };
    },

    /** Show in › Log Report: the current row's day in frmLogout(LogId, True). */
    async 'log-report'(db, user, _ids, { params }) {
      const { userId, date } = parseDay(String(params.day ?? ''));
      const logId = await logIdOf(db, visibleWorkUsers(user, sql`log.uid`), userId, date);
      return logId > 0
        ? { kind: 'work-log', logId }
        : { kind: 'message', message: 'No Record Found' };
    },

    /** Show in › Report: the selected rows' days' log ids, in frmLogReport. */
    async report(db, user, _ids, { params }) {
      const days = String(params.days ?? '')
        .split(',')
        .filter((d) => d !== '')
        .map(parseDay);
      const logIds: number[] = [];
      for (const d of days) {
        const logId = await logIdOf(db, visibleWorkUsers(user, sql`log.uid`), d.userId, d.date);
        if (logId > 0 && !logIds.includes(logId)) logIds.push(logId);
      }
      return {
        kind: 'open',
        screen: 'old-log-reports',
        ids: logIds,
        emptyMessage: 'No Record Found',
      };
    },
  },
};
