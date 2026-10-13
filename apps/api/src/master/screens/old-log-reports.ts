import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type GridRow, isoDate, type SessionUser, UserType } from '@gglib/shared';
import { type RawBuilder, sql } from 'kysely';
import { z } from 'zod';
import { idList } from '../../db/legacy-sql.js';
import { normalizeRow, pickListOf } from '../values.js';
import type { ScreenDefinition } from './registry.js';
import { logIdOf, parseDay, reportingScope, visibleWorkUsers } from './work-report.js';

type Sql = RawBuilder<unknown>;

/** cmbReportType's items: the ORDER BY and what the grid's first column shows. */
export const REPORT_TYPES = ['Datewise', 'Userwise', 'Vibhagwise', 'WorkTypewise'] as const;

/**
 * The header panel's values, as the client sends them. Short Report is only possible for
 * Datewise and Userwise (cmbReportType_SelectedIndexChanged checks Full Report otherwise).
 */
const paramsSchema = z.object({
  reportType: z.enum(REPORT_TYPES).default('Datewise'),
  short: z.boolean().default(false),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** Full Report's columns: one row per work entry of the day (or one for a day without any). */
const FULL_COLUMNS = sql`
  log.logdate logdat, CONVERT(varchar, log.logdate, 103) logdate, log.uid, Usecurity.uname,
  SUBSTRING(CAST(logintime AS varchar), 1, 8) logintime, SUBSTRING(CAST(logouttime AS varchar), 1, 8) logouttime,
  SUBSTRING(CAST(totallogtime AS varchar), 1, 8) totallogtime,
  colVib.Name Vibhag, colWorkType.Name WorkType, work.workquantity,
  SUBSTRING(CAST(work.worktime AS varchar), 1, 8) worktime, work.workreports, work.remarks,
  ISNULL(CAST((DATEDIFF(minute, '0:00:00', CONVERT(time, work.worktime)) / 60.0) * PerHourWorkQty AS INT), 0) TargetedWorkQty`;

/**
 * Short Report's columns. The desktop selects the Full names with blanks and then keeps only
 * these nine (DefaultView.ToTable(True, …)), so Send To Excel and Search see only these.
 */
const SHORT_COLUMNS = sql`
  log.logdate logdat, CONVERT(varchar, log.logdate, 103) logdate, log.uid, Usecurity.uname,
  CAST(SUBSTRING(CAST(logintime AS varchar), 1, 8) AS VARCHAR) logintime,
  SUBSTRING(CAST(logouttime AS varchar), 1, 8) logouttime, SUBSTRING(CAST(totallogtime AS varchar), 1, 8) totallogtime`;

/** Total Gap Time (Personal/Lunch work of type Gap) and Total WorkTime (log time minus gaps), HH:mm. */
const GAP_COLUMNS = sql`
  RIGHT('0' + CAST(tblGap.TotalGapTime / 3600 AS VARCHAR(5)), 2) + ':' + RIGHT('0' + CAST(tblGap.TotalGapTime % 3600 / 60 AS VARCHAR(5)), 2) AS totalgaptime,
  RIGHT('0' + CAST((ISNULL(DATEDIFF(S, '00:00:00', totallogtime), 0) - ISNULL(tblGap.TotalGapTime, 0)) / 3600 AS VARCHAR(5)), 2) + ':'
    + RIGHT('0' + CAST((ISNULL(DATEDIFF(S, '00:00:00', totallogtime), 0) - ISNULL(tblGap.TotalGapTime, 0)) % 3600 / 60 AS VARCHAR(5)), 2) AS totalworktime`;

const FROM = sql`
  FROM log
  INNER JOIN Usecurity ON log.uid = Usecurity.tid
  LEFT JOIN work ON log.logID = work.logid
  LEFT JOIN columnmaster colVib ON work.vibhagkt = colVib.ColumnMastkm AND colVib.Vibhag = 'Vibhag'
  LEFT JOIN columnmaster colWorkType ON work.worktypeID = colWorkType.ColumnMastkm AND colWorkType.Vibhag = 'worktype'
  LEFT JOIN ApprisalStandard AStd ON AStd.vibhagkt = work.vibhagkt AND AStd.WorkTypeKt = work.worktypeID
  OUTER APPLY (
    SELECT ISNULL(SUM(DATEDIFF(S, '00:00:00', worktime)), 0) AS TotalGapTime FROM work w1
    WHERE w1.workID IN (
      SELECT w2.workId FROM work w2
      INNER JOIN columnmaster colVib1 ON w2.vibhagkt = colVib1.ColumnMastkm AND colVib1.Name IN ('Personal', 'Lunch')
      INNER JOIN columnmaster colwTyp1 ON w2.worktypeID = colwTyp1.ColumnMastkm AND colwTyp1.Name = 'Gap'
      WHERE w2.logid = log.logID)
  ) tblGap`;

const ORDER_BY: Record<(typeof REPORT_TYPES)[number], Sql> = {
  Datewise: sql`ORDER BY logdat, uname`,
  Userwise: sql`ORDER BY uname, logdat`,
  Vibhagwise: sql`ORDER BY Vibhag, logdat, uname`,
  WorkTypewise: sql`ORDER BY WorkType, logdat, uname`,
};

/** Who gets "Send To Log Report" (cntMenu_Opening: curr_utypeid 1 or 5, not IsAdmin). */
export function canSendToLogReport(user: SessionUser): boolean {
  return user.userType === UserType.Admin || user.userType === UserType.AMaster;
}

/** The users whose logs this user sees: the report's own scoping, on `log.uid`. */
const scopeOf = (user: SessionUser) => reportingScope(user, sql`log.uid`) ?? sql`1 = 1`;

/**
 * Employee › Old Log Reports (frmLogReport): a read-only report over `log` ⋈ `work`, with the
 * desktop's own SQL (FillReport). See docs/screens/old-log-reports.md.
 */
export const oldLogReports: ScreenDefinition = {
  screen: 'old-log-reports',
  table: 'log',
  primaryColumn: 'logID',
  lockable: false,
  readOnly: true,

  /**
   * FillReport's `Usecurity.tid IN (curr_lnid, GetReportingByTid(curr_lnid))` for anyone but an
   * admin or AMaster. Unlike Work Report there is no IsActive condition. It applies to the
   * StrId path (a window opened from Work Report) too.
   */
  listFilter: (user) => reportingScope(user, sql`log.uid`),

  /**
   * FillReport: the logs of the date range, or of StrId (`ids`, when another screen opened this
   * window; the dates are then ignored), Full or Short, ordered by the report type.
   */
  async listRows(db, { ids, params, filter }) {
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) throw new BadRequestException('Bad report parameters');
    const p = parsed.data;
    const short = p.short && (p.reportType === 'Datewise' || p.reportType === 'Userwise');
    const day = (d: string | undefined) =>
      d ? sql`CAST(${d} AS date)` : sql`CAST(GETDATE() AS date)`;
    const which = ids
      ? sql`AND log.logID IN ${idList(ids.length ? ids : [0])}`
      : sql`AND log.logdate >= ${day(p.from)} AND log.logdate <= ${day(p.to)}`;
    const { rows } = await sql<GridRow>`
      SELECT ${short ? SHORT_COLUMNS : FULL_COLUMNS}, ${GAP_COLUMNS}
      ${FROM}
      WHERE 1 = 1 ${which} ${filter}
      ${short ? sql`GROUP BY log.uid, log.logdate, Usecurity.uname, logintime, logouttime, totallogtime, tblGap.TotalGapTime` : sql``}
      ${ORDER_BY[p.reportType]}
    `.execute(db);
    return rows.map(normalizeRow);
  },

  validate: () => 'Record Cannot Be Saved',
  save: () => Promise.reject(new BadRequestException('Record Cannot Be Saved')),

  f2: {
    /**
     * txtSearch_KeyDown's F2 with Search By = User: the users who have a log. The desktop
     * scopes it for Operator / Guest only; here it follows the report's own scoping.
     */
    txtsearch: (db, _params, user) => {
      const scope = user ? reportingScope(user, sql`log.uid`) : sql`1 = 0`;
      return pickListOf(
        db,
        sql`SELECT DISTINCT Usecurity.tid, Usecurity.uname FROM Usecurity INNER JOIN log ON Usecurity.tid = log.uid
            ${scope ? sql`WHERE ${scope}` : sql``} ORDER BY uname`,
      );
    },
  },

  actions: {
    /**
     * Send To Work Report: the WorkReportM entries of the clicked row's user and day, in
     * frmWorkReportM. The desktop read the day by grid row index (wrong after a sort or F2);
     * here the client sends the row's own `uid|logdat`.
     */
    async 'send-to-work-report'(db, user, _ids, { params }) {
      const { userId, date } = parseDay(String(params.day ?? ''));
      const { rows } = await sql<{ WorkReportKm: number | string }>`
        SELECT WorkReportKm FROM WorkReportM
        WHERE DoneByGId = ${userId} AND Workdate = CAST(${date} AS date)
          AND ${visibleWorkUsers(user, sql`WorkReportM.DoneByGId`)}
        ORDER BY WorkReportKm
      `.execute(db);
      return {
        kind: 'open',
        screen: 'work-report',
        ids: rows.map((r) => Number(r.WorkReportKm)),
        emptyMessage: 'No Record Found',
      };
    },

    /**
     * Send To Log Report (curr_utypeid 1 or 5): that day's log in frmLogout(LogId, True). The
     * desktop's UpdateLogoutTime rewrite after the dialog closes is not ported (as in Work
     * Report).
     */
    async 'log-report'(db, user, _ids, { params }) {
      if (!canSendToLogReport(user)) throw new ForbiddenException('Not allowed');
      const { userId, date } = parseDay(String(params.day ?? ''));
      const logId = await logIdOf(db, scopeOf(user), userId, date);
      return logId > 0
        ? { kind: 'work-log', logId }
        : { kind: 'message', message: 'No Record Found' };
    },
  },
};
