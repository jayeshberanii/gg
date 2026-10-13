import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type LookupOption,
  type SessionUser,
  timeDiff,
  UserType,
  validateWorkLog,
  type WorkLogDetail,
  type WorkLogRow,
} from '@gglib/shared';
import { sql } from 'kysely';
import { AttendanceService } from '../attendance/attendance.service.js';
import { KYSELY, type Database } from '../db/db.module.js';
import {
  type Executor,
  inTransaction,
  isDuplicateKey,
  nextId,
  serverNow,
} from '../db/legacy-sql.js';

type LogRow = {
  logID: string;
  uid: number;
  uname: string;
  d: string;
  loginTime: string | null;
  logoutTime: string | null;
};

type DetailRow = {
  workID: string | number;
  TableName: string | null;
  VibhagKt: number;
  VibhagName: string;
  WorkTypeId: number;
  WorkTypeName: string;
  Qty: number;
  MistakeSum: number | null;
  Hrs: string;
  Min: string;
  Remark: string;
  IsManualEntry: boolean;
};

/** Users who may open another user's work report (frmLogoutNew `TSBtnReport_Click`). */
export function canViewOthersWorkLogs(user: Pick<SessionUser, 'userType'>): boolean {
  return user.userType === UserType.Admin || user.userType === UserType.AMaster;
}

/** Port of the logout work-report form, frmLogoutNew (CommonLibrary.dll). */
@Injectable()
export class WorkLogService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    private readonly attendance: AttendanceService,
  ) {}

  async detail(user: SessionUser, logId: number, db: Executor = this.db): Promise<WorkLogDetail> {
    const log = await this.log(db, logId);
    const own = log.uid === user.id;
    // Work Report's Show in › Log Report opens the days of the employees reporting to you too
    // (frmWorkReportM lists them), read-only as frmLogout makes another user's day.
    if (!own && !canViewOthersWorkLogs(user) && !(await this.reportsTo(db, log.uid, user.id))) {
      throw new ForbiddenException('You cannot view this work report');
    }
    const { date: today, time: serverTime } = await serverNow(db);
    return {
      logId,
      userId: log.uid,
      userName: log.uname,
      logDate: log.d,
      loginTime: log.loginTime ?? '00:00:00',
      logoutTime: log.logoutTime,
      isPending: log.d < today || !own,
      readOnly: !own,
      serverTime,
      rows: await this.rows(db, log.uid, log.d, logId),
    };
  }

  /** Whether `employeeId` reports to `managerId` (EmpReportingT, GetReportingByTid). */
  private async reportsTo(db: Executor, employeeId: number, managerId: number): Promise<boolean> {
    const { rows } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM EmpReportingT WHERE EmployeeKt = ${employeeId} AND ReportingToKt = ${managerId}
    `.execute(db);
    return Number(rows[0]?.n ?? 0) > 0;
  }

  /** Report: a user's log id for a date (admin / AMaster only). */
  async find(user: SessionUser, userId: number, date: string, db: Executor = this.db) {
    if (!canViewOthersWorkLogs(user)) throw new ForbiddenException('Not allowed');
    const { rows } = await sql<{ logID: string }>`
      SELECT logID FROM log WHERE uid = ${userId} AND logdate = CAST(${date} AS date)
    `.execute(db);
    if (!rows[0]) throw new NotFoundException('No Record Found');
    return { logId: Number(rows[0].logID) };
  }

  async users(user: SessionUser, db: Executor = this.db): Promise<LookupOption[]> {
    if (!canViewOthersWorkLogs(user)) throw new ForbiddenException('Not allowed');
    const { rows } = await sql<{ tid: number; uname: string | null }>`
      SELECT tid, uname FROM Usecurity ORDER BY uname
    `.execute(db);
    return rows.map((r) => ({ id: r.tid, name: r.uname ?? '' }));
  }

  /**
   * Save & Logout: replaces the day's `work` rows and stamps the logout time, in one
   * transaction. Validated with the desktop's rules against the server clock.
   */
  async save(
    user: SessionUser,
    logId: number,
    rows: WorkLogRow[],
    db: Executor = this.db,
  ): Promise<void> {
    await inTransaction(db, async (trx) => {
      const log = await this.log(trx, logId);
      if (log.uid !== user.id) throw new ForbiddenException('You cannot change this work report');
      const { date: today, time: now } = await serverNow(trx);
      const isPending = log.d < today;
      if (isPending && !canViewOthersWorkLogs(user)) {
        const pending = await this.attendance.pendingWorkReports(user.id, trx);
        if (!pending.some((p) => p.logId === logId)) {
          throw new ForbiddenException('This work report is already complete');
        }
      }

      const logoutTime = isPending ? log.logoutTime : now;
      const totalTime = timeDiff(log.loginTime, logoutTime);
      if (totalTime === null) {
        throw new BadRequestException('The login or logout time of this day is missing');
      }
      const messages = validateWorkLog(rows, totalTime);
      if (messages.length > 0) throw new BadRequestException(messages.join('\n'));

      await sql`DELETE FROM work WHERE logid = ${logId}`.execute(trx);
      for (const row of rows) {
        if (row.hrs === 0 && row.min === 0) continue;
        await this.insertWork(trx, logId, row);
      }
      await sql`
        UPDATE log SET logouttime = CAST(${logoutTime} AS time), totallogtime = CAST(${totalTime} AS time)
        WHERE logID = ${logId}
      `.execute(trx);
    });
  }

  /** Closing the form without saving still records today's logout time. */
  async recordLogoutTime(user: SessionUser, logId: number): Promise<void> {
    if (logId !== user.logId) throw new ForbiddenException('Not your current session');
    await this.attendance.recordLogoutTime(logId);
  }

  /** F2 on the Vibhag cell (frmLogoutNew `dgMain_KeyDown`, column 3). */
  async vibhagOptions(tableName: string, workTypeId: number, db: Executor = this.db) {
    const { rows } = await sql<LookupOption>`
      SELECT DISTINCT cm.ColumnMastkm AS id, cm.Name AS name
      FROM ApprisalStandard INNER JOIN columnmaster cm ON ApprisalStandard.Vibhagkt = cm.ColumnMastkm
      WHERE ApprisalStandard.IsManualEntry = ${tableName === '' ? 1 : 0}
        ${tableName === 'BookT' ? sql`AND cm.Name = 'BookT Entry'` : sql``}
        ${workTypeId > 0 ? sql`AND ApprisalStandard.WorkTypeKt = ${workTypeId}` : sql``}
      ORDER BY cm.Name
    `.execute(db);
    return rows;
  }

  /** F2 on the Work Type cell: manual rows only (column 5). */
  async workTypeOptions(vibhagId: number, db: Executor = this.db) {
    const { rows } = await sql<LookupOption>`
      SELECT DISTINCT cm.ColumnMastkm AS id, cm.Name AS name
      FROM ApprisalStandard INNER JOIN columnmaster cm ON ApprisalStandard.WorkTypeKt = cm.ColumnMastkm
      WHERE ApprisalStandard.IsManualEntry = 1
        ${vibhagId > 0 ? sql`AND ApprisalStandard.VibhagKt = ${vibhagId}` : sql``}
      ORDER BY cm.Name
    `.execute(db);
    return rows;
  }

  private async log(db: Executor, logId: number): Promise<LogRow> {
    const { rows } = await sql<LogRow>`
      SELECT TOP 1 log.logID, log.uid, Usecurity.uname, CONVERT(varchar(10), log.logdate, 23) AS d,
        CONVERT(varchar(8), log.logintime, 108) AS loginTime,
        CONVERT(varchar(8), log.logouttime, 108) AS logoutTime
      FROM log INNER JOIN Usecurity ON log.uid = Usecurity.tid
      WHERE log.logID = ${logId}
    `.execute(db);
    if (!rows[0]) throw new NotFoundException('No Record Found');
    return rows[0];
  }

  /**
   * The `GetWorkDetail` stored procedure, ported. The procedure also looks up the user in
   * [DBCoding], but that value only fed a commented-out branch, so it is dropped here; this
   * keeps the web app working on servers without DBCoding.
   */
  private async rows(
    db: Executor,
    userId: number,
    date: string,
    logId: number,
  ): Promise<WorkLogRow[]> {
    const { rows } = await sql<DetailRow>`
      WITH auto AS (
        SELECT DISTINCT 1 AS GroupNo, CAST(ISNULL(wk.IsManualEntry, 0) AS bit) AS IsManualEntry,
          ISNULL(wk.workID, 0) AS workID, W.TableName, ISNULL(wk.vibhagkt, 0) AS VibhagKt,
          ISNULL(CV.Name, '') AS VibhagName, ISNULL(C.ColumnMastkm, 0) AS WorkTypeId,
          ISNULL(C.Name, '') AS WorkTypeName, COUNT(C.Name) AS Qty,
          ISNULL(SUBSTRING(CAST(wk.worktime AS varchar), 1, 2), '00') AS Hrs,
          ISNULL(SUBSTRING(CAST(wk.worktime AS varchar), 4, 2), '00') AS Min,
          ISNULL(wk.workreports, '') AS Remark
        FROM WorkReportM W
        LEFT JOIN columnmaster C ON W.WorkTypeGId = C.ColumnMastkm
        LEFT JOIN work wk ON wk.logid = ${logId} AND wk.worktypeID = W.WorkTypeGId AND wk.TableName = W.TableName
        LEFT JOIN columnmaster CV ON wk.vibhagkt = CV.ColumnMastkm
        WHERE W.DoneByGId = ${userId} AND W.Workdate = CAST(${date} AS date) AND ISNULL(wk.IsManualEntry, 0) = 0
        GROUP BY wk.IsManualEntry, wk.workID, W.TableName, wk.vibhagkt, CV.Name, C.ColumnMastkm, C.Name,
          wk.worktime, wk.workreports, W.WorkTypeGId
      ),
      manual AS (
        SELECT DISTINCT 3 AS GroupNo, CAST(ISNULL(wk.IsManualEntry, 0) AS bit) AS IsManualEntry,
          wk.workID, '' AS TableName, ISNULL(wk.vibhagkt, 0) AS VibhagKt, ISNULL(CV.Name, '') AS VibhagName,
          ISNULL(C.ColumnMastkm, 0) AS WorkTypeId, ISNULL(C.Name, '') AS WorkTypeName,
          ISNULL(wk.workquantity, 0) AS Qty,
          ISNULL(SUBSTRING(CAST(wk.worktime AS varchar), 1, 2), '00') AS Hrs,
          ISNULL(SUBSTRING(CAST(wk.worktime AS varchar), 4, 2), '00') AS Min,
          ISNULL(wk.workreports, '') AS Remark
        FROM work wk
        INNER JOIN log ON wk.logid = log.logID
        INNER JOIN columnmaster C ON wk.worktypeID = C.ColumnMastkm
        INNER JOIN columnmaster CV ON wk.vibhagkt = CV.ColumnMastkm
        WHERE log.uid = ${userId} AND log.logdate = CAST(${date} AS date) AND ISNULL(wk.IsManualEntry, 0) = 1
      )
      SELECT a.workID, a.TableName, a.IsManualEntry, a.WorkTypeId, a.WorkTypeName, a.Qty, a.Hrs, a.Min,
        a.Remark, ms.MistakeSum,
        CASE WHEN a.VibhagName = '' THEN ISNULL(fb.id, a.VibhagKt) ELSE a.VibhagKt END AS VibhagKt,
        CASE WHEN a.VibhagName = '' THEN ISNULL(fb.name, '') ELSE a.VibhagName END AS VibhagName,
        a.GroupNo
      FROM auto a
      OUTER APPLY (
        SELECT SUM(SW.MistakeCount) AS MistakeSum FROM WorkReportM SW
        WHERE SW.DoneByGId = ${userId} AND SW.Workdate = CAST(${date} AS date)
          AND SW.WorkTypeGId = a.WorkTypeId AND SW.TableName = a.TableName
      ) ms
      OUTER APPLY (
        SELECT TOP 1 cm.ColumnMastkm AS id, cm.Name AS name FROM ApprisalStandard
        INNER JOIN columnmaster cm ON ApprisalStandard.VibhagKt = cm.ColumnMastkm
        WHERE ApprisalStandard.TableName = a.TableName AND ApprisalStandard.WorkTypeKt = a.WorkTypeId
      ) fb
      UNION ALL
      SELECT m.workID, m.TableName, m.IsManualEntry, m.WorkTypeId, m.WorkTypeName, m.Qty, m.Hrs, m.Min,
        m.Remark, NULL, m.VibhagKt, m.VibhagName, m.GroupNo
      FROM manual m
      ORDER BY GroupNo, TableName, workID
    `.execute(db);
    return rows.map((r) => ({
      workId: Number(r.workID),
      tableName: r.TableName ?? '',
      vibhagId: r.VibhagKt,
      vibhagName: r.VibhagName,
      workTypeId: r.WorkTypeId,
      workTypeName: r.WorkTypeName,
      qty: r.Qty,
      mistakeSum: r.MistakeSum ?? 0,
      hrs: Number(r.Hrs) || 0,
      min: Number(r.Min) || 0,
      remark: r.Remark,
      isManualEntry: Boolean(r.IsManualEntry),
    }));
  }

  private async insertWork(trx: Executor, logId: number, row: WorkLogRow): Promise<void> {
    const worktime = `${String(row.hrs).padStart(2, '0')}:${String(row.min).padStart(2, '0')}:00`;
    for (let attempt = 0; ; attempt++) {
      const id = await nextId(trx, 'work', 'workID');
      try {
        await sql`
          INSERT INTO work (workID, worktypeId, workquantity, workreports, logid, vibhagkt, worktime,
                            IsManualEntry, TableName, MistakeCount)
          VALUES (${id}, ${row.workTypeId}, ${row.qty}, ${row.remark.trim()}, ${logId}, ${row.vibhagId},
                  CAST(${worktime} AS time), ${row.isManualEntry ? 1 : 0}, ${row.tableName}, ${row.mistakeSum})
        `.execute(trx);
        return;
      } catch (err) {
        if (!isDuplicateKey(err) || attempt >= 2) throw err;
      }
    }
  }
}
