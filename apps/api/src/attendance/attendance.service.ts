import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ATTENDANCE_EXEMPT_USER_IDS,
  type LeaveRequirement,
  LeaveStatus,
  type LeaveTypeOption,
  type LoginSuccess,
  type PendingWorkReport,
  requiresWorkReport,
  type SessionUser,
  timeDiff,
} from '@gglib/shared';
import { sql } from 'kysely';
import { KYSELY, type Database } from '../db/db.module.js';
import {
  type Executor,
  holidaysBetween,
  inTransaction,
  isDuplicateKey,
  nextId,
  serverNow,
} from '../db/legacy-sql.js';
import { leaveStatusIdSql } from './leave-common.js';
import { addDays, countWorkingDays, nextWorkingDay, previousWorkingDay } from './working-days.js';

/** A Usecurity row as the session needs it, minus the password. */
export type AttendanceUser = Omit<SessionUser, 'logId'>;

/**
 * Port of `frmLogoutNew.SaveLog` (CommonLibrary.dll), the attendance side of logging in:
 * the forced leave application, the daily `log` row and the pending work-report check.
 */
@Injectable()
export class AttendanceService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  /**
   * Whether the user must file a leave before today's session can start. Only asked at the
   * first login of the day, and never of admins or the hard-coded exempt users.
   */
  async leaveRequirement(
    user: AttendanceUser,
    db: Executor = this.db,
  ): Promise<LeaveRequirement | null> {
    const { date: today } = await serverNow(db);
    if (await this.todaysLogId(db, user.id, today)) return null;
    if (user.isAdmin || ATTENDANCE_EXEMPT_USER_IDS.includes(user.id)) return null;

    const { rows: lastRows } = await sql<{ d: string }>`
      SELECT CONVERT(varchar(10), ISNULL(MAX(logdate), GETDATE()), 23) AS d FROM log WHERE uid = ${user.id}
    `.execute(db);
    const lastLog = lastRows[0]!.d;

    // Every date stepped over below lies between the earlier of (last login, 60 days ago) and
    // today; the extra week covers a holiday run just before it.
    const windowStart = lastLog < addDays(today, -60) ? lastLog : addDays(today, -60);
    const holidays = await holidaysBetween(db, addDays(windowStart, -7), today);
    const lastWorkingDay = previousWorkingDay(today, holidays);

    if (lastLog < lastWorkingDay) {
      // Absent: working days between the last login and today were missed.
      const from = nextWorkingDay(lastLog, holidays);
      const { rows } = await sql<{ n: number }>`
        SELECT COUNT(*) AS n FROM LeaveM
        WHERE Employeekt = ${user.id}
          AND LeaveFromDate <= CAST(${from} AS date) AND LeaveToDate >= CAST(${from} AS date)
      `.execute(db);
      if (rows[0]!.n > 0) return null;
      return {
        mode: 'absent',
        fromDate: from,
        toDate: lastWorkingDay,
        leaveTypes: await this.leaveTypes(db, false),
        diffHr: null,
      };
    }

    // Present on the last working day: was the logged time short of WorkingHours by > 30 min?
    const { rows } = await sql<{ shortBy: number; total: string | null; hours: string }>`
      SELECT
        ISNULL(DATEDIFF(MINUTE, l.totallogtime, CAST(ISNULL(u.WorkingHours, '08:00') AS time)), 0) AS shortBy,
        CONVERT(varchar(8), l.totallogtime, 108) AS total,
        CONVERT(varchar(8), CAST(ISNULL(u.WorkingHours, '08:00') AS time), 108) AS hours
      FROM log l CROSS JOIN Usecurity u
      WHERE l.uid = ${user.id} AND l.logdate = CAST(${lastLog} AS date) AND u.tid = ${user.id}
    `.execute(db);
    const row = rows[0];
    if (!row || row.shortBy <= 30) return null;
    return {
      mode: 'short-hours',
      fromDate: lastLog,
      toDate: lastLog,
      leaveTypes: await this.leaveTypes(db, true),
      diffHr: timeDiff(row.total, row.hours),
    };
  }

  /**
   * Saves the leave the login form asked for, with status "Leave Without Approval". The
   * requirement is recomputed here rather than trusted from the client.
   */
  async submitLeave(
    user: AttendanceUser,
    leaveTypeId: number,
    reason: string,
    db: Executor = this.db,
  ): Promise<void> {
    const requirement = await this.leaveRequirement(user, db);
    if (!requirement) return;
    if (leaveTypeId === 0) throw new BadRequestException('Please SELECT LeaveType');
    if (requirement.mode === 'short-hours' && reason === '') {
      throw new BadRequestException('Please Enter Reason');
    }
    if (!requirement.leaveTypes.some((t) => t.id === leaveTypeId)) {
      throw new BadRequestException('Please SELECT LeaveType');
    }

    const totalDays =
      requirement.mode === 'absent'
        ? countWorkingDays(
            requirement.fromDate,
            requirement.toDate,
            await holidaysBetween(db, requirement.fromDate, requirement.toDate),
          )
        : 0;
    await sql`
      INSERT INTO LeaveM (Employeekt, LeaveFromDate, LeaveToDate, Reason, TotalDays, LeaveStatuskt,
                          enuser, endate, LeaveTypekt, DiffHr)
      VALUES (
        ${user.id}, CAST(${requirement.fromDate} AS date), CAST(${requirement.toDate} AS date),
        ${reason}, ${totalDays},
        ${leaveStatusIdSql(LeaveStatus.WithoutApproval)},
        ${user.id}, GETDATE(), ${leaveTypeId}, CAST(${requirement.diffHr ?? '00:00:00'} AS time)
      )
    `.execute(db);
  }

  /**
   * Starts (or resumes) today's session: the `log` row, the "Last LogIn" details, clearing
   * the user's leftover record locks, and the pending work reports.
   */
  async startSession(
    user: AttendanceUser,
    db: Executor = this.db,
  ): Promise<Omit<LoginSuccess, 'status' | 'user'> & { logId: number }> {
    return inTransaction(db, async (trx) => {
      const { date: today, time: now } = await serverNow(trx);
      let logId = await this.todaysLogId(trx, user.id, today);
      let lastLogin: LoginSuccess['lastLogin'];

      if (logId) {
        lastLogin = await this.latestLog(trx, user.id, sql`logdate = CAST(${today} AS date)`);
        await sql`UPDATE log SET LastLoginTime = CAST(${now} AS time) WHERE logID = ${logId}`.execute(
          trx,
        );
      } else {
        logId = await this.insertLog(trx, user.id, today, now);
        lastLogin = await this.latestLog(trx, user.id, sql`logdate < CAST(${today} AS date)`);
      }

      // clsCommon.EnableDisableDataEditing(Nothing, 2): drop this user's stale edit locks.
      await sql`DELETE FROM DataEditingInfo WHERE Userkt = ${user.id}`.execute(trx);

      const pendingWorkReports = requiresWorkReport(user)
        ? await this.pendingWorkReports(user.id, trx)
        : [];
      return { logId, lastLogin, currentLoginTime: now, pendingWorkReports };
    });
  }

  /** Past days where reported work is more than 15 minutes short of the logged time. */
  async pendingWorkReports(userId: number, db: Executor = this.db): Promise<PendingWorkReport[]> {
    const { rows } = await sql<{ logID: string; d: string }>`
      WITH paging AS (
        SELECT log.logID, log.uid, log.logdate,
          CAST(DATEPART(HH, totallogtime) * 60 + DATEPART(MI, totallogtime) AS int) AS TotalLogTime,
          CAST(ISNULL(SUM(DATEPART(HH, worktime) * 60 + DATEPART(MI, worktime)), 0) AS int) AS TotalWorkTime
        FROM log LEFT JOIN work ON log.logID = work.logid
        GROUP BY log.logID, log.uid, log.logdate, totallogtime
      )
      SELECT logID, CONVERT(varchar(10), logdate, 23) AS d FROM paging
      WHERE uid = ${userId} AND logdate < CAST(GETDATE() AS date) AND TotalWorkTime < TotalLogTime - 15
      ORDER BY logID
    `.execute(db);
    return rows.map((r) => ({ logId: Number(r.logID), logDate: r.d }));
  }

  /** `UpdateLogoutTime` for today's session: logout = now, total = now − login. */
  async recordLogoutTime(logId: number, db: Executor = this.db): Promise<void> {
    const { time: now } = await serverNow(db);
    const { rows } = await sql<{ t: string | null }>`
      SELECT CONVERT(varchar(8), logintime, 108) AS t FROM log WHERE logID = ${logId}
    `.execute(db);
    const total = timeDiff(rows[0]?.t ?? null, now);
    // The desktop fails with a message box on an invalid span; we leave the row unchanged.
    if (total === null) return;
    await sql`
      UPDATE log SET logouttime = CAST(${now} AS time), totallogtime = CAST(${total} AS time)
      WHERE logID = ${logId}
    `.execute(db);
  }

  /** clsCommon.EnableDisableDataEditing(Nothing, 2) on closing the app. */
  async releaseEditLocks(userId: number, db: Executor = this.db): Promise<void> {
    await sql`DELETE FROM DataEditingInfo WHERE Userkt = ${userId}`.execute(db);
  }

  private async todaysLogId(db: Executor, userId: number, today: string): Promise<number | null> {
    const { rows } = await sql<{ logid: string }>`
      SELECT logid FROM log WHERE logdate = CAST(${today} AS date) AND uid = ${userId}
    `.execute(db);
    return rows[0] ? Number(rows[0].logid) : null;
  }

  private async insertLog(
    trx: Executor,
    userId: number,
    today: string,
    now: string,
  ): Promise<number> {
    for (let attempt = 0; ; attempt++) {
      const id = await nextId(trx, 'log', 'logID');
      try {
        await sql`
          INSERT INTO log (logID, uid, logdate, logintime, LastLoginTime)
          VALUES (${id}, ${userId}, CAST(${today} AS date), CAST(${now} AS time), CAST(${now} AS time))
        `.execute(trx);
        return id;
      } catch (err) {
        // The desktop took the same id between our read and insert: take the next one.
        if (!isDuplicateKey(err) || attempt >= 2) throw err;
      }
    }
  }

  private async latestLog(
    db: Executor,
    userId: number,
    condition: ReturnType<typeof sql>,
  ): Promise<LoginSuccess['lastLogin']> {
    const { rows } = await sql<{ d: string; t: string | null }>`
      SELECT TOP 1 CONVERT(varchar(10), logdate, 23) AS d, CONVERT(varchar(8), LastLoginTime, 108) AS t
      FROM log WHERE uid = ${userId} AND ${condition} ORDER BY logid DESC
    `.execute(db);
    return rows[0] ? { date: rows[0].d, time: rows[0].t } : null;
  }

  private async leaveTypes(db: Executor, shortHours: boolean): Promise<LeaveTypeOption[]> {
    const { rows } = shortHours
      ? await sql<{ id: number; name: string; brief: string | null }>`
          SELECT ColumnMastkm AS id, Name AS name, Brief AS brief FROM columnmaster
          WHERE Vibhag = 'LeaveType' AND Name IN ('LC', 'EG') ORDER BY Name`.execute(db)
      : await sql<{ id: number; name: string; brief: string | null }>`
          SELECT ColumnMastkm AS id, Name AS name, Brief AS brief FROM columnmaster
          WHERE Vibhag = 'LeaveType' ORDER BY Name`.execute(db);
    return rows.map((r) => ({ id: r.id, name: r.name, brief: r.brief ?? '' }));
  }
}
