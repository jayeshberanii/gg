import type { SessionUser, WorkLogRow } from '@gglib/shared';
import { sql } from 'kysely';
import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { AttendanceService } from '../src/attendance/attendance.service.js';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type Database } from '../src/db/db.module.js';
import { WorkLogService } from '../src/work-log/work-log.service.js';

/**
 * Parity with the desktop's `GetWorkDetail` stored procedure. The procedure's own SQL is read
 * from the database and run with its one [DBCoding] lookup removed (that database is not on
 * every server, and the value it reads is unused). Read-only.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);

type ProcRow = {
  IsManualEntry: boolean;
  WorkId: number | string;
  TableName: string | null;
  VibhagKt: number;
  VibhagName: string;
  WorkTypeId: number;
  WorkTypeName: string;
  Qty: number;
  Hrs: string;
  Min: string;
  Remark: string;
  MistakeSum: number | null;
};

const admin: SessionUser = {
  id: -1,
  username: 'parity',
  isAdmin: true,
  userType: 1,
  rights: { add: true, modify: true, delete: true, view: true },
  logId: -1,
};

const key = (r: WorkLogRow) => JSON.stringify(r);

describe.skipIf(!hasDb)('GetWorkDetail parity (read-only)', () => {
  const db: Database | undefined = hasDb ? createDatabase(loadEnv()) : undefined;

  afterAll(async () => {
    await db?.destroy();
  });

  async function procedureRows(userId: number, date: string): Promise<WorkLogRow[]> {
    const { rows } = await sql<{ d: string }>`
      SELECT OBJECT_DEFINITION(OBJECT_ID('GetWorkDetail')) AS d
    `.execute(db!);
    const definition = rows[0]!.d;
    const body = definition
      .slice(definition.indexOf('AS BEGIN') + 'AS BEGIN'.length, definition.lastIndexOf('END'))
      .replace(/SELECT @CodingUserId\s*=\s*tid FROM \[DBCoding\][^\n]*/i, '');
    expect(body).not.toMatch(/^\s*SELECT @CodingUserId/im);

    const batch = `DECLARE @LibUserId INT = ${Number(userId)}, @LogDate DATE = '${date.replace(/[^0-9-]/g, '')}';\n${body}`;
    // The procedure text comes from the database itself; the two values are sanitised above.
    // eslint-disable-next-line no-restricted-syntax
    const result = await sql.raw<ProcRow>(batch).execute(db!);
    return result.rows.map((r) => ({
      workId: Number(r.WorkId),
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

  it('matches the procedure on real days with automatic and manual rows', async () => {
    const { rows: days } = await sql<{ logID: string; uid: number; d: string }>`
      SELECT TOP 5 l.logID, l.uid, CONVERT(varchar(10), l.logdate, 23) AS d FROM log l
      WHERE EXISTS (SELECT 1 FROM WorkReportM w WHERE w.DoneByGId = l.uid AND w.Workdate = l.logdate)
        AND EXISTS (SELECT 1 FROM work k WHERE k.logid = l.logID AND k.IsManualEntry = 1)
      ORDER BY l.logdate DESC
    `.execute(db!);
    expect(days.length).toBeGreaterThan(0);

    const service = new WorkLogService(db!, new AttendanceService(db!));
    for (const day of days) {
      const expected = await procedureRows(day.uid, day.d);
      const actual = (await service.detail(admin, Number(day.logID))).rows;
      expect(actual.map(key).sort(), `uid ${day.uid} on ${day.d}`).toEqual(
        expected.map(key).sort(),
      );
      expect(actual.some((r) => r.isManualEntry)).toBe(true);
      expect(actual.some((r) => !r.isManualEntry)).toBe(true);
    }
  });
});
