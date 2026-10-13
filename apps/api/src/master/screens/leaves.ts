import {
  canApproveLeave,
  canEditLeave,
  type GridRow,
  type GridValue,
  isLcEgLeaveType,
  LeaveStatus,
  leaveStatusFor,
  seesAllLeaves,
  type SessionUser,
} from '@gglib/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'kysely';
import {
  leaveStatusId,
  leaveStatusIdSql,
  leaveTotalDays,
  leaveTypeId,
} from '../../attendance/leave-common.js';
import { addDays } from '../../attendance/working-days.js';
import { type Executor, serverNow } from '../../db/legacy-sql.js';
import { int } from './book-common.js';
import { pickerDate, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Employee › Leaves (frmLeaveM, LeaveMRepository). Table LeaveM, IDENTITY key LeaveMKm. No
 * Locked column, no work report, lblEntry shown. See docs/screens/leaves.md.
 *
 * - Every user may add a leave, for any active employee; only user type 1 and users 41 / 5 may
 *   change a saved one (`recordWritableBy`). Approve / Reject / Employee Summary are for user
 *   type 5 and users 41 / 5. The desktop only enabled buttons; the API enforces all of it.
 * - Users other than types 1 and 5 see only their own leaves and the ones they entered
 *   (DefaultCond), for every read and write (`enforceListFilter`).
 * - TotalDays and the status are computed here, not taken from the client: TotalDays on every
 *   save, the status on an add and on a change of the dates or the type (the desktop's
 *   boolChangeDate let both go stale).
 */

/** frmLeaveM_Load's DefaultCond. */
const ownLeaves = (user: SessionUser) =>
  seesAllLeaves(user) ? null : sql`(LeaveM.Employeekt = ${user.id} OR LeaveM.enuser = ${user.id})`;

const RANGE_MESSAGE =
  'Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)';

/**
 * The utility InputBoxes' "dd/MM/yyyy-dd/MM/yyyy" as ISO dates. The desktop split on "-" and
 * cut substrings, so anything else threw a SQL or substring error; here it is the message.
 */
export function parseLeaveRange(text: unknown): { from: string; to: string } {
  const parts = String(text ?? '').split('-');
  if (parts.length !== 2) throw new BadRequestException(RANGE_MESSAGE);
  const [from, to] = parts.map((p) => {
    const m = p.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    const d = new Date(`${iso}T00:00:00Z`);
    if (!m || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso)
      throw new BadRequestException(RANGE_MESSAGE);
    return iso;
  });
  return { from: from!, to: to! };
}

/** Hour (00–07 on the form) and Minute (00, 05 … 55) as the `time` DiffHr; blank reads 0. */
function diffHr(hour: unknown, minute: unknown): string {
  const h = Math.min(Math.max(int(hour), 0), 23);
  const m = Math.min(Math.max(int(minute), 0), 59);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/**
 * GetValidationMessage's last rule: another leave of the same employee lying entirely inside
 * from..to (containment, not overlap), named by its entering user's Employee_Name.
 */
async function alreadyApplied(
  db: Executor,
  id: number,
  employee: number,
  from: string,
  to: string,
): Promise<string> {
  const { rows } = await sql<{ n: string | null }>`
    SELECT TOP (1) ISNULL(Usecurity.Employee_Name, '') AS n FROM LeaveM
    INNER JOIN Usecurity ON LeaveM.enuser = Usecurity.tid
    WHERE LeaveMKm <> ${id} AND Employeekt = ${employee}
      AND LeaveFromDate >= CAST(${from} AS date) AND LeaveToDate <= CAST(${to} AS date)
  `.execute(db);
  const name = rows[0]?.n ?? '';
  return name !== '' ? `Leave Already Applied By - ${name}` : '';
}

/** GetValidationMessage's first three rules, in order ('' when they pass). */
function basicMessage(employee: number, from: string | null, to: string | null, type: number) {
  if (employee === 0) return 'Please Enter Employee Name';
  if (from === null || to === null) return 'Please Enter Leave Dates';
  if (from > to) return 'LeaveFrom Date Cannot be Greater Then LeaveTo Date';
  if (type === 0) return 'Please Enter Leave Type';
  return '';
}

type StoredLeave = {
  Employeekt: number | null;
  LeaveFromDate: string;
  LeaveToDate: string;
  LeaveTypekt: number | null;
  TotalDays: number | null;
  LeaveStatuskt: number | null;
  LeaveStatusName: string | null;
  ApprovedBykt: number | null;
};

async function storedLeave(
  db: Executor,
  id: number,
  user?: SessionUser,
): Promise<StoredLeave | undefined> {
  const filter = user ? ownLeaves(user) : null;
  const { rows } = await sql<StoredLeave>`
    SELECT Employeekt, CONVERT(varchar(10), LeaveFromDate, 23) AS LeaveFromDate,
      CONVERT(varchar(10), LeaveToDate, 23) AS LeaveToDate, LeaveTypekt, TotalDays, LeaveStatuskt,
      (SELECT Name FROM columnmaster WHERE ColumnMastkm = LeaveM.LeaveStatuskt) AS LeaveStatusName,
      ApprovedBykt
    FROM LeaveM WHERE LeaveMKm = ${id} ${filter ? sql`AND ${filter}` : sql``}
  `.execute(db);
  return rows[0];
}

const typeName = async (db: Executor, typeId: number) =>
  (
    await sql<{ n: string | null }>`
      SELECT Name AS n FROM columnmaster WHERE ColumnMastkm = ${typeId}
    `.execute(db)
  ).rows[0]?.n ?? '';

/**
 * The Approve Leave / Reject Leave menu items, on the grid's current row (the desktop saved
 * whatever record the boxes held, a blank one before any row click).
 */
async function decide(
  db: Executor,
  user: SessionUser,
  ids: number[],
  status: typeof LeaveStatus.Approved | typeof LeaveStatus.Rejected,
): Promise<ActionResult> {
  if (!canApproveLeave(user)) throw new ForbiddenException('You cannot approve or reject leaves');
  const id = ids[0] ?? 0;
  const row = id > 0 ? await storedLeave(db, id, user) : undefined;
  if (!row) throw new NotFoundException('Record not found');
  // cntMenu_Opening shows Approve only on a row whose status is exactly "Pending".
  if (status === LeaveStatus.Approved && row.LeaveStatusName !== LeaveStatus.Pending)
    throw new BadRequestException('Only a Pending leave can be approved');
  // Save()'s GetValidationMessage, for parity.
  const employee = int(row.Employeekt);
  const message =
    basicMessage(employee, row.LeaveFromDate, row.LeaveToDate, int(row.LeaveTypekt)) ||
    (await alreadyApplied(db, id, employee, row.LeaveFromDate, row.LeaveToDate));
  if (message) throw new BadRequestException(message);
  const { rows: holder } = await sql<{ userkt: number; uname: string | null }>`
    SELECT D.Userkt AS userkt, U.uname FROM DataEditingInfo D INNER JOIN Usecurity U ON D.Userkt = U.tid
    WHERE D.TableName = 'LeaveM' AND D.Recordkt = ${id}
  `.execute(db);
  if (holder[0] && holder[0].userkt !== user.id)
    throw new ConflictException(`Record is in used by - ${holder[0].uname ?? ''}`);
  // Reject is stored as Rejected even for an SPL leave: the desktop's Save() re-applied the SPL
  // auto-approve after Reject set Rejected (docs/screens/leaves.md, desktop bug 4).
  await sql`
    UPDATE LeaveM SET ApprovedBykt = ${user.id}, ApprovedDate = CAST(GETDATE() AS date),
      LeaveStatuskt = ${leaveStatusIdSql(status)}, moduser = ${user.id}, moddate = GETDATE()
    WHERE LeaveMKm = ${id}
  `.execute(db);
  return { kind: 'refreshed', rows: [], message: 'Record Saved Successfully' };
}

/** The Employee Summary columns, exactly as the desktop's base query names them. */
const SUMMARY_COLUMNS = [
  'Employeekt',
  'uname',
  'Tot Leave(In day)',
  'Tot LC/EG(In Day)',
  'Tot LC-EG(IN Hrs)',
  'Tot PG(In Days)',
  'Tot PG(In Hrs)',
  'Total Gap(In Hrs)',
  'Actual Hrs',
  'Total Logtime',
  'Actual Gap(In Hrs)',
];

/** EmployeeSummaryToolStripMenuItem_Click's five queries, with ISO date parameters. */
export async function employeeSummary(
  db: Executor,
  from: string,
  to: string,
): Promise<GridValue[][]> {
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const byEmployee = async <T extends { Employeekt: number }>(q: ReturnType<typeof sql<T>>) =>
    new Map((await q.execute(db)).rows.map((r) => [Number(r.Employeekt), r]));
  const days = await byEmployee(sql<{ Employeekt: number; TotalDays: number }>`
    SELECT L.Employeekt, ISNULL(SUM(L.TotalDays), 0) AS TotalDays FROM LeaveM L
    INNER JOIN columnmaster C ON L.LeaveTypekt = C.ColumnMastkm AND C.Vibhag = 'LeaveType' AND C.Name NOT IN ('LC', 'EG')
    WHERE L.LeaveFromDate >= CAST(${from} AS date) AND L.LeaveToDate <= CAST(${to} AS date)
    GROUP BY L.Employeekt`);
  const lceg = await byEmployee(sql<{ Employeekt: number; TotLCEG: number; TotLCEGHrs: number }>`
    SELECT L.Employeekt, COUNT(C.Name) AS TotLCEG,
      CAST(CAST(SUM(DATEDIFF(MINUTE, '0:00:00', L.DiffHr)) AS numeric(10, 2)) / 60 AS numeric(10, 2)) AS TotLCEGHrs
    FROM LeaveM L
    INNER JOIN columnmaster C ON L.LeaveTypekt = C.ColumnMastkm AND C.Vibhag = 'LeaveType' AND C.Name IN ('LC', 'EG')
    WHERE L.LeaveFromDate >= CAST(${from} AS date) AND L.LeaveToDate <= CAST(${to} AS date)
    GROUP BY L.Employeekt`);
  const pg = await byEmployee(sql<{ Employeekt: number; TotPGDays: number; TotPGHrs: number }>`
    SELECT L.uid AS Employeekt, COUNT(*) AS TotPGDays,
      CAST(CAST(SUM(DATEDIFF(MINUTE, '0:00:00', W.worktime)) AS numeric(10, 2)) / 60 AS numeric(10, 2)) AS TotPGHrs
    FROM work W INNER JOIN log L ON W.logid = L.logID
    LEFT JOIN columnmaster CW ON W.worktypeID = CW.ColumnMastkm AND CW.Vibhag = 'WorkType'
    LEFT JOIN columnmaster CV ON W.vibhagkt = CV.ColumnMastkm AND CV.Vibhag = 'Vibhag'
    WHERE L.logdate >= CAST(${from} AS date) AND L.logdate <= CAST(${to} AS date)
      AND (CW.Name = 'Gap' OR CV.Name = 'Personal')
    GROUP BY L.uid`);
  const actual = await byEmployee(sql<{
    Employeekt: number;
    ActualHrs: number;
    TotalLogTime: number;
    ActualGap: number;
  }>`
    WITH PAGING AS (
      SELECT l.uid AS Employeekt,
        CAST(CAST(DATEDIFF(MINUTE, '0:00:00', u.WorkingHours) AS numeric(10, 2)) / 60 AS numeric(10, 2)) * COUNT(*) AS ActualHrs,
        SUM(CAST(CAST(DATEDIFF(MINUTE, '0:00:00', totallogtime) AS numeric(10, 2)) / 60 AS numeric(10, 2))) AS TotalLogTime
      FROM log l INNER JOIN Usecurity u ON l.uid = u.tid
      WHERE logdate >= CAST(${from} AS date) AND logdate <= CAST(${to} AS date) AND totallogtime IS NOT NULL
      GROUP BY u.WorkingHours, l.uid)
    SELECT Employeekt, ActualHrs, TotalLogTime, (ActualHrs - TotalLogTime) AS ActualGap FROM PAGING`);
  const { rows: base } = await sql<{ Employeekt: number; uname: string | null }>`
    SELECT L.Employeekt, U.uname FROM LeaveM L INNER JOIN Usecurity U ON L.Employeekt = U.tid
    WHERE L.LeaveFromDate >= CAST(${from} AS date) AND L.LeaveToDate <= CAST(${to} AS date)
    GROUP BY L.Employeekt, U.uname ORDER BY U.uname
  `.execute(db);
  const round2 = (x: number) => Math.round(x * 100) / 100;
  return base.map((b) => {
    const k = Number(b.Employeekt);
    const lcegHrs = num(lceg.get(k)?.TotLCEGHrs);
    const pgHrs = num(pg.get(k)?.TotPGHrs);
    return [
      k,
      b.uname ?? '',
      num(days.get(k)?.TotalDays),
      num(lceg.get(k)?.TotLCEG),
      lcegHrs,
      num(pg.get(k)?.TotPGDays),
      pgHrs,
      round2(lcegHrs + pgHrs),
      num(actual.get(k)?.ActualHrs),
      num(actual.get(k)?.TotalLogTime),
      num(actual.get(k)?.ActualGap),
    ];
  });
}

export const leaves: ScreenDefinition = {
  screen: 'leaves',
  table: 'LeaveM',
  primaryColumn: 'LeaveMKm',
  lockable: false,
  listFilter: ownLeaves,
  enforceListFilter: true,
  // New for everyone (for any active employee); Modify / Save of a saved leave for user type 1
  // and users 41 / 5. Delete reaches deleteRecord's message for those, as btnDelete does.
  recordWritableBy: (user, _id, op) => op === 'add' || canEditLeave(user),

  validate: (f) =>
    basicMessage(
      int(f.Employeekt),
      pickerDate(f.LeaveFromDate),
      pickerDate(f.LeaveToDate),
      int(f.LeaveTypekt),
    ),

  /** NewEntry(curr_lnid): the user, tomorrow to tomorrow, Pending, TotalDays 1. */
  async newDefaults(db, user): Promise<GridRow> {
    const { date: today } = await serverNow(db);
    const tomorrow = addDays(today, 1);
    const me = user?.id ?? 0;
    const { rows } = await sql<{ n: string | null }>`
      SELECT uname AS n FROM Usecurity WHERE tid = ${me}
    `.execute(db);
    return {
      Employeekt: me,
      EmployeeName: rows[0]?.n ?? '',
      LeaveFromDate: tomorrow,
      LeaveToDate: tomorrow,
      TotalDays: await leaveTotalDays(db, tomorrow, tomorrow, ''),
      LeaveStatuskt: await leaveStatusId(db, LeaveStatus.Pending),
      LeaveStatusName: LeaveStatus.Pending,
      DiffHour: '',
      DiffMinute: '',
    };
  },

  /** FillData's extras: Hour / Minute from DiffHr, Approved Date as dd-MM-yyyy. */
  async recordExtras(db, id): Promise<GridRow> {
    const { rows } = await sql<{
      hm: string | null;
      ad: string | null;
      tn: string | null;
    }>`
      SELECT CONVERT(varchar(5), DiffHr, 108) AS hm, CONVERT(varchar(10), ApprovedDate, 105) AS ad,
        (SELECT Name FROM columnmaster WHERE ColumnMastkm = LeaveM.LeaveTypekt) AS tn
      FROM LeaveM WHERE LeaveMKm = ${id}
    `.execute(db);
    const r = rows[0];
    const hm = r?.hm ?? '';
    return {
      DiffHour: hm ? hm.slice(0, 2) : '',
      DiffMinute: hm ? hm.slice(3, 5) : '',
      ApprovedDateText: r?.ad ?? '',
      // Txt_Leave enables Hour / Minute only for a Leave Type reading "lc" / "eg".
      DiffHrLocked: !isLcEgLeaveType(r?.tn),
    };
  },

  async save(trx, user, id, f) {
    const employee = int(f.Employeekt);
    const from = pickerDate(f.LeaveFromDate)!;
    const to = pickerDate(f.LeaveToDate)!;
    const type = int(f.LeaveTypekt);
    const old = id > 0 ? await storedLeave(trx, id) : undefined;
    if (id > 0 && !old) throw new NotFoundException('Record not found');
    const applied = await alreadyApplied(trx, id, employee, from, to);
    if (applied) throw new BadRequestException(applied);

    // GetTotalDays, fixed: TotalDays always follows the dates and type being saved (the
    // desktop's boolChangeDate let it go stale). The status is recomputed on an add and when the
    // dates or the type changed, so a Reason-only edit does not undo an approval.
    const totalDays = await leaveTotalDays(trx, from, to, await typeName(trx, type));
    const changed =
      !old || old.LeaveFromDate !== from || old.LeaveToDate !== to || int(old.LeaveTypekt) !== type;
    let status = int(old?.LeaveStatuskt);
    if (changed) {
      const { date: today } = await serverNow(trx);
      status = await leaveStatusId(trx, leaveStatusFor(from, today));
    }
    // Save(): an SPL leave is Approved.
    if (type !== 0 && type === (await leaveTypeId(trx, 'SPL')))
      status = await leaveStatusId(trx, LeaveStatus.Approved);
    // Approved By / Approved Date / Comment are never editable: they are saved as stored, with
    // -1 for "nobody" as the form writes it.
    const approvedBy = int(old?.ApprovedBykt) > 0 ? int(old?.ApprovedBykt) : -1;
    const reason = trimmed(f.Reason);
    const diff = diffHr(f.DiffHour, f.DiffMinute);

    if (id > 0) {
      await sql`
        UPDATE LeaveM SET LeaveFromDate = CAST(${from} AS date), LeaveToDate = CAST(${to} AS date),
          Employeekt = ${employee}, TotalDays = ${totalDays}, Reason = ${reason}, LeaveStatuskt = ${status},
          ApprovedBykt = ${approvedBy}, Comment = LTRIM(RTRIM(ISNULL(Comment, ''))), LeaveTypekt = ${type},
          DiffHr = CAST(${diff} AS time), moduser = ${user.id}, moddate = GETDATE()
        WHERE LeaveMKm = ${id}
      `.execute(trx);
      return id;
    }
    const { rows } = await sql<{ id: number }>`
      INSERT INTO LeaveM (LeaveFromDate, LeaveToDate, Employeekt, TotalDays, Reason, LeaveStatuskt,
        ApprovedBykt, enuser, endate, Comment, LeaveTypekt, DiffHr, ApprovedDate)
      OUTPUT INSERTED.LeaveMKm AS id
      VALUES (CAST(${from} AS date), CAST(${to} AS date), ${employee}, ${totalDays}, ${reason}, ${status},
        ${approvedBy}, ${user.id}, GETDATE(), '', ${type}, CAST(${diff} AS time), NULL)
    `.execute(trx);
    return Number(rows[0]!.id);
  },

  /** Delete(): the real delete is commented out on the desktop. */
  async deleteRecord() {
    throw new BadRequestException('Delete Facility is not Available');
  },

  lists: {
    /**
     * GetTotalDays for the boxes while the user edits (From, To or Leave Type changed): the
     * TotalDays and the status the save will compute. `type` is the Leave Type box's text.
     */
    async 'total-days'(db, params) {
      const from = pickerDate(params.from);
      const to = pickerDate(params.to);
      if (!from || !to)
        return { columns: ['TotalDays', 'LeaveStatuskt', 'LeaveStatusName'], rows: [] };
      const { date: today } = await serverNow(db);
      const status = leaveStatusFor(from, today);
      return {
        columns: ['TotalDays', 'LeaveStatuskt', 'LeaveStatusName'],
        rows: [
          [
            await leaveTotalDays(db, from, to, params.type),
            await leaveStatusId(db, status),
            status,
          ],
        ],
      };
    },
  },

  actions: {
    approve: (db, user, ids) => decide(db, user, ids, LeaveStatus.Approved),
    reject: (db, user, ids) => decide(db, user, ids, LeaveStatus.Rejected),

    /** Utility › Show Leaves Between Dates: leaves overlapping the range, within DefaultCond. */
    async 'between-dates'(_db, _user, _ids, ctx): Promise<ActionResult> {
      const { from, to } = parseLeaveRange(ctx.params.range);
      return {
        kind: 'list',
        rows: await ctx.list(
          sql`CAST(${to} AS date) >= CAST(LeaveFromDate AS date) AND CAST(${from} AS date) <= CAST(LeaveToDate AS date)`,
        ),
      };
    },

    /** Utility › Show Leave Without Approval: self-entered, unapproved leaves. */
    async 'without-approval'(_db, _user, _ids, ctx): Promise<ActionResult> {
      return {
        kind: 'list',
        rows: await ctx.list(
          sql`LeaveM.Employeekt = LeaveM.enuser AND LeaveStatuskt IN (SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'leavestatus' AND Name = 'Leave Without Approval')`,
        ),
      };
    },

    /** Print Report › Employee Summary: every employee's totals for the range (frmPopup). */
    async 'employee-summary'(db, user, _ids, ctx): Promise<ActionResult> {
      if (!canApproveLeave(user)) throw new ForbiddenException('You cannot see the summary');
      const { from, to } = parseLeaveRange(ctx.params.range);
      return {
        kind: 'table',
        title: '',
        columns: SUMMARY_COLUMNS,
        rows: await employeeSummary(db, from, to),
      };
    },
  },
};
