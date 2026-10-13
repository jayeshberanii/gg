import 'reflect-metadata';
import type { DB } from '@gglib/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  loginResponseSchema,
  type LoginLeaveRequired,
  type LoginSuccess,
  workLogDetailSchema,
  type WorkLogRow,
} from '@gglib/shared';
import { type ControlledTransaction, sql } from 'kysely';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { addDays, nextWorkingDay, previousWorkingDay } from '../src/attendance/working-days.js';
import { encodeLegacyPassword } from '../src/auth/legacy-password.js';
import { loadEnv } from '../src/config/env.js';
import { configureApp } from '../src/configure-app.js';
import { createDatabase, type Database, KYSELY } from '../src/db/db.module.js';
import { holidaysBetween, serverNow } from '../src/db/legacy-sql.js';

/**
 * End-to-end login / attendance / work-report flows against the real legacy DB. Every test
 * runs inside a transaction that is rolled back, so DBLibSQL is left untouched. Skipped when
 * apps/api/.env is absent (e.g. CI without a database).
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);

const PASSWORD = 'Secret1';

describe.skipIf(!hasDb)('auth, attendance and work report (integration)', () => {
  let db: Database;
  let trx: ControlledTransaction<DB>;
  let app: NestExpressApplication;
  let userId: number;
  let username: string;
  let today: string;
  let holidays: Set<string>;

  beforeAll(async () => {
    db = createDatabase(loadEnv());
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    trx = await db.startTransaction().execute();
    const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
      .overrideProvider(KYSELY)
      .useValue(trx)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();

    today = (await serverNow(trx)).date;
    holidays = await holidaysBetween(trx, addDays(today, -60), today);
    username = `webtest${Date.now() % 1_000_000}`;
    userId = await createUser(username, { add: true, modify: true, del: true });
  });

  afterEach(async () => {
    await app.close();
    await trx.rollback().execute();
  });

  /** Inserts an active user with PASSWORD; `tid` is an identity column. */
  async function createUser(
    name: string,
    rights: { add: boolean; modify: boolean; del: boolean; admin?: boolean; userType?: number },
  ): Promise<number> {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      OUTPUT inserted.tid AS id
      VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), ${rights.add}, ${rights.modify},
              ${rights.del}, 1, ${rights.admin ?? false}, 1, ${rights.userType ?? 3}, '08:00')
    `.execute(trx);
    return rows[0]!.id;
  }

  async function addLog(
    date: string,
    login: string,
    logout: string,
    total: string,
  ): Promise<number> {
    const { rows } = await sql<{
      id: string;
    }>`SELECT ISNULL(MAX(logID), 0) + 1 AS id FROM log`.execute(trx);
    const id = Number(rows[0]!.id);
    await sql`
      INSERT INTO log (logID, uid, logdate, logintime, logouttime, totallogtime, LastLoginTime)
      VALUES (${id}, ${userId}, CAST(${date} AS date), CAST(${login} AS time), CAST(${logout} AS time),
              CAST(${total} AS time), CAST(${login} AS time))
    `.execute(trx);
    return id;
  }

  async function addWork(logId: number, time: string) {
    const { rows } = await sql<{
      id: string;
    }>`SELECT ISNULL(MAX(workID), 0) + 1 AS id FROM work`.execute(trx);
    const [v, w] = await manualIds();
    await sql`
      INSERT INTO work (workID, worktypeID, workquantity, workreports, logid, vibhagkt, worktime, IsManualEntry, TableName, MistakeCount)
      VALUES (${Number(rows[0]!.id)}, ${w}, 1, '', ${logId}, ${v}, CAST(${time} AS time), 1, '', 0)
    `.execute(trx);
  }

  /** A real (Vibhag, WorkType) pair allowed for manual entries. */
  async function manualIds(): Promise<[number, number]> {
    const { rows } = await sql<{ v: number; w: number }>`
      SELECT TOP 1 VibhagKt AS v, WorkTypeKt AS w FROM ApprisalStandard
      WHERE IsManualEntry = 1 AND VibhagKt > 0 AND WorkTypeKt > 0
    `.execute(trx);
    return [rows[0]!.v, rows[0]!.w];
  }

  const agent = () => request.agent(app.getHttpServer());

  async function login(a = agent(), name = username, password = PASSWORD) {
    const res = await a.post('/api/auth/login').send({ username: name, password });
    return { a, res };
  }

  describe('credentials (frmlogin.vb)', () => {
    it('rejects an empty user name and password with the desktop messages', async () => {
      const r1 = await agent().post('/api/auth/login').send({ username: ' ', password: 'x' });
      expect(r1.status).toBe(400);
      expect(r1.body.message).toBe('Please Enter User Name');
      const r2 = await agent().post('/api/auth/login').send({ username: 'a', password: '  ' });
      expect(r2.body.message).toBe('Please Enter Password');
    });

    it('rejects a wrong password', async () => {
      const { res } = await login(agent(), username, 'nope');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Please Enter Current Username And Password');
    });

    it('requires the exact case of the user name, like the desktop', async () => {
      const { res } = await login(agent(), username.toUpperCase());
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid User Name Or Password');
    });

    it('ignores inactive users', async () => {
      await sql`UPDATE Usecurity SET IsActive = 0 WHERE tid = ${userId}`.execute(trx);
      const { res } = await login();
      expect(res.status).toBe(401);
    });

    it('locks out after repeated failures', async () => {
      const a = agent();
      for (let i = 0; i < 5; i++) await login(a, username, 'bad');
      const { res } = await login(a);
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('first login of the day', () => {
    it("creates today's log row, sets the session cookie, and clears stale edit locks", async () => {
      await sql`INSERT INTO DataEditingInfo (TableName, Recordkt, Userkt) VALUES ('bhasmast', 1, ${userId})`.execute(
        trx,
      );
      const { a, res } = await login();
      expect(res.status).toBe(200);
      const body = loginResponseSchema.parse(res.body) as LoginSuccess;
      expect(body.status).toBe('ok');
      expect(body.lastLogin).toBeNull();
      expect(body.pendingWorkReports).toEqual([]);
      expect(res.headers['set-cookie']?.[0]).toMatch(/gglib_session=.+HttpOnly.+SameSite=Strict/i);

      const { rows } = await sql<{ n: number }>`
        SELECT COUNT(*) AS n FROM log WHERE uid = ${userId} AND logdate = CAST(${today} AS date) AND logID = ${body.user.logId}
      `.execute(trx);
      expect(rows[0]!.n).toBe(1);
      const locks = await sql<{
        n: number;
      }>`SELECT COUNT(*) AS n FROM DataEditingInfo WHERE Userkt = ${userId}`.execute(trx);
      expect(locks.rows[0]!.n).toBe(0);

      const me = await a.get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(userId);
    });

    it("reuses today's log row on a second login and reports the earlier login", async () => {
      const first = loginResponseSchema.parse((await login()).res.body) as LoginSuccess;
      const second = loginResponseSchema.parse((await login()).res.body) as LoginSuccess;
      expect(second.user.logId).toBe(first.user.logId);
      expect(second.lastLogin?.date).toBe(today);
    });

    it('asks absent users for a leave covering the missed working days', async () => {
      const lastWorkingDay = previousWorkingDay(today, holidays);
      const lastLog = previousWorkingDay(previousWorkingDay(lastWorkingDay, holidays), holidays);
      const logId = await addLog(lastLog, '09:00:00', '17:00:00', '08:00:00');
      await addWork(logId, '08:00:00');

      const { a, res } = await login();
      const body = loginResponseSchema.parse(res.body) as LoginLeaveRequired;
      expect(body.status).toBe('leave-required');
      expect(body.leave).toMatchObject({
        mode: 'absent',
        fromDate: nextWorkingDay(lastLog, holidays),
        toDate: lastWorkingDay,
        diffHr: null,
      });
      expect(body.leave.leaveTypes.length).toBeGreaterThan(2);
      // No session until the leave is saved.
      expect((await a.get('/api/auth/me')).status).toBe(401);

      const noType = await a
        .post('/api/auth/login/leave')
        .send({ ticket: body.ticket, leaveTypeId: 0, reason: '' });
      expect(noType.status).toBe(400);
      expect(noType.body.message).toBe('Please SELECT LeaveType');

      const leaveTypeId = body.leave.leaveTypes[0]!.id;
      const ok = await a
        .post('/api/auth/login/leave')
        .send({ ticket: body.ticket, leaveTypeId, reason: '' });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('ok');

      const { rows } = await sql<{ days: number; status: string; type: number }>`
        SELECT l.TotalDays AS days, s.Name AS status, l.LeaveTypekt AS type FROM LeaveM l
        JOIN columnmaster s ON s.ColumnMastkm = l.LeaveStatuskt
        WHERE l.Employeekt = ${userId}
      `.execute(trx);
      expect(rows).toEqual([{ days: 2, status: 'Leave Without Approval', type: leaveTypeId }]);
      expect((await a.get('/api/auth/me')).status).toBe(200);
    });

    it('asks for an LC/EG leave with a reason when the last day was over 30 minutes short', async () => {
      const lastWorkingDay = previousWorkingDay(today, holidays);
      const logId = await addLog(lastWorkingDay, '10:00:00', '16:00:00', '06:00:00');
      await addWork(logId, '06:00:00');

      const { a, res } = await login();
      const body = loginResponseSchema.parse(res.body) as LoginLeaveRequired;
      expect(body.leave).toMatchObject({
        mode: 'short-hours',
        fromDate: lastWorkingDay,
        toDate: lastWorkingDay,
        diffHr: '02:00:00',
      });
      expect(body.leave.leaveTypes.map((t) => t.name).sort()).toEqual(['EG', 'LC']);

      const leaveTypeId = body.leave.leaveTypes[0]!.id;
      const noReason = await a
        .post('/api/auth/login/leave')
        .send({ ticket: body.ticket, leaveTypeId, reason: '' });
      expect(noReason.status).toBe(400);
      expect(noReason.body.message).toBe('Please Enter Reason');

      const ok = await a
        .post('/api/auth/login/leave')
        .send({ ticket: body.ticket, leaveTypeId, reason: 'Doctor' });
      expect(ok.status).toBe(200);
      const { rows } = await sql<{ diff: string; days: number }>`
        SELECT CONVERT(varchar(8), DiffHr, 108) AS diff, TotalDays AS days FROM LeaveM WHERE Employeekt = ${userId}
      `.execute(trx);
      expect(rows).toEqual([{ diff: '02:00:00', days: 0 }]);
    });

    it('never asks admins or the exempt users for a leave', async () => {
      await sql`UPDATE Usecurity SET IsAdmin = 1 WHERE tid = ${userId}`.execute(trx);
      await addLog(addDays(today, -30), '09:00:00', '17:00:00', '08:00:00');
      const { res } = await login();
      expect(res.body.status).toBe('ok');
    });

    it('rejects a forged login ticket', async () => {
      const res = await agent()
        .post('/api/auth/login/leave')
        .send({ ticket: 'x.y.z', leaveTypeId: 1, reason: '' });
      expect(res.status).toBe(401);
    });
  });

  describe('work report (frmLogoutNew)', () => {
    it('lists a past day short of work as pending, and completes it', async () => {
      const lastWorkingDay = previousWorkingDay(today, holidays);
      const pendingLog = await addLog(lastWorkingDay, '09:00:00', '17:00:00', '08:00:00');

      const { a, res } = await login();
      const body = loginResponseSchema.parse(res.body) as LoginSuccess;
      expect(body.pendingWorkReports).toEqual([{ logId: pendingLog, logDate: lastWorkingDay }]);

      const detail = workLogDetailSchema.parse((await a.get(`/api/work-log/${pendingLog}`)).body);
      expect(detail).toMatchObject({
        isPending: true,
        readOnly: false,
        loginTime: '09:00:00',
        logoutTime: '17:00:00',
      });

      const [v, w] = await manualIds();
      const row = (hrs: number, min: number): WorkLogRow => ({
        workId: 0,
        tableName: '',
        vibhagId: v,
        vibhagName: '',
        workTypeId: w,
        workTypeName: '',
        qty: 3,
        mistakeSum: 0,
        hrs,
        min,
        remark: 'ગ્રંથ entry',
        isManualEntry: true,
      });

      const tooMuch = await a.put(`/api/work-log/${pendingLog}`).send({ rows: [row(8, 1)] });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.message).toBe('Total Work Time cannot be Greater than : 08:00');

      const saved = await a
        .put(`/api/work-log/${pendingLog}`)
        .send({ rows: [row(5, 0), row(2, 58)] });
      expect(saved.status).toBe(204);

      const after = workLogDetailSchema.parse((await a.get(`/api/work-log/${pendingLog}`)).body);
      expect(after.rows.map((r) => [r.hrs, r.min, r.qty, r.remark])).toEqual([
        [5, 0, 3, 'ગ્રંથ entry'],
        [2, 58, 3, 'ગ્રંથ entry'],
      ]);
      expect((await a.get('/api/auth/pending-work-reports')).body).toEqual([]);
      // The pending day keeps its own logout time.
      expect(after.logoutTime).toBe('17:00:00');
    });

    it("opens today's report, records the logout time, and ends the session", async () => {
      const { a, res } = await login();
      const { user } = loginResponseSchema.parse(res.body) as LoginSuccess;
      const current = workLogDetailSchema.parse((await a.get('/api/work-log/current')).body);
      expect(current).toMatchObject({
        logId: user.logId,
        isPending: false,
        readOnly: false,
        logDate: today,
      });

      expect(
        (
          await a
            .post(`/api/work-log/${user.logId}/logout-time`)
            .set('Content-Type', 'application/json')
        ).status,
      ).toBe(204);
      const { rows } = await sql<{ out: string | null }>`
        SELECT CONVERT(varchar(8), logouttime, 108) AS out FROM log WHERE logID = ${user.logId}
      `.execute(trx);
      expect(rows[0]!.out).toMatch(/^\d{2}:\d{2}:\d{2}$/);

      await sql`INSERT INTO DataEditingInfo (TableName, Recordkt, Userkt) VALUES ('bhasmast', 1, ${userId})`.execute(
        trx,
      );
      const out = await a.post('/api/auth/logout').send({ recordLogoutTime: false });
      expect(out.status).toBe(204);
      expect(out.headers['set-cookie']?.[0]).toMatch(/gglib_session=;/);
      const locks = await sql<{
        n: number;
      }>`SELECT COUNT(*) AS n FROM DataEditingInfo WHERE Userkt = ${userId}`.execute(trx);
      expect(locks.rows[0]!.n).toBe(0);
    });

    it("lets only Admin / AMaster users open another user's report, read-only", async () => {
      const { a, res } = await login();
      const { user } = loginResponseSchema.parse(res.body) as LoginSuccess;

      const otherName = `${username}b`;
      const otherId = await createUser(otherName, {
        add: true,
        modify: true,
        del: true,
        userType: 5,
      });
      const other = await login(agent(), otherName);
      expect(other.res.status).toBe(200);

      expect((await other.a.get(`/api/work-log/find?userId=${userId}&date=${today}`)).body).toEqual(
        { logId: user.logId },
      );
      const view = workLogDetailSchema.parse(
        (await other.a.get(`/api/work-log/${user.logId}`)).body,
      );
      expect(view.readOnly).toBe(true);
      expect((await other.a.put(`/api/work-log/${user.logId}`).send({ rows: [] })).status).toBe(
        403,
      );

      const otherLogId = (other.res.body as LoginSuccess).user.logId;
      expect((await a.get(`/api/work-log/${otherLogId}`)).status).toBe(403);
      expect((await a.get(`/api/work-log/find?userId=${otherId}&date=${today}`)).status).toBe(403);
    });
  });

  describe('session and request hygiene', () => {
    it('requires a session', async () => {
      expect((await agent().get('/api/auth/me')).status).toBe(401);
      expect((await agent().get('/api/work-log/current')).status).toBe(401);
    });

    it('refuses state changes that are not JSON (CSRF)', async () => {
      const res = await agent()
        .post('/api/auth/login')
        .type('form')
        .send(`username=${username}&password=${PASSWORD}`);
      expect(res.status).toBe(415);
    });
  });
});
