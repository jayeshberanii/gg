import 'reflect-metadata';
import type { DB } from '@gglib/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { ActionResult, GridRow, MasterMeta, WorkLogDetail } from '@gglib/shared';
import { type ControlledTransaction, sql } from 'kysely';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { encodeLegacyPassword } from '../src/auth/legacy-password.js';
import { loadEnv } from '../src/config/env.js';
import { configureApp } from '../src/configure-app.js';
import { createDatabase, type Database, KYSELY } from '../src/db/db.module.js';
import { mistakeRemarkDetail } from '../src/master/screens/work-report.js';

/**
 * Employee › Work Report (frmWorkReportM) through the master engine, against the real DB inside
 * a transaction that is rolled back after every test.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);
const PASSWORD = 'Secret1';
const SECURITY = 'test-security-pw';
const API = '/api/master/work-report';

describe('mistakeRemarkDetail (GetMistakeRemarkDetail)', () => {
  it('pairs old and new values by column, padding the shorter side at the top', () => {
    expect(
      mistakeRemarkDetail(
        'groupnm1()~authortran(A)~authortran(B)=3',
        'groupnm1((390)567)~AuthorTran(C)=2',
      ),
    ).toEqual([
      ['groupnm1', '()', '((390)567)'],
      ['authortran', '(A)', null],
      [null, '(B)', '(C)'],
    ]);
  });

  it('adds columns only in the old values after the new ones, and is empty for no data', () => {
    expect(mistakeRemarkDetail('vksamvat(1111)', 'remark(x)')).toEqual([
      ['remark', null, '(x)'],
      ['vksamvat', '(1111)', null],
    ]);
    expect(mistakeRemarkDetail('', '')).toEqual([]);
  });
});

describe.skipIf(!hasDb)('Work Report via the master engine (integration)', () => {
  let db: Database;
  let trx: ControlledTransaction<DB>;
  let app: NestExpressApplication;
  let alice: request.Agent;
  let admin: request.Agent;
  const ids: Record<string, number> = {};

  beforeAll(() => {
    db = createDatabase(loadEnv());
  });
  afterAll(async () => {
    await db.destroy();
  });

  async function createUser(name: string, opts: { admin?: boolean; active?: boolean } = {}) {
    await sql`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 0, 0, 0, 1,
        ${opts.admin ? 1 : 0}, ${opts.active === false ? 0 : 1}, ${opts.admin ? 1 : 3}, '08:00')
    `.execute(trx);
    const { rows } = await sql<{
      tid: number;
    }>`SELECT tid FROM Usecurity WHERE uname = ${name}`.execute(trx);
    return rows[0]!.tid;
  }

  async function signIn(name: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ username: name, password: PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  async function addEntry(
    doneBy: number,
    tableName: string,
    recordNo: string,
    daysAgo: number,
    extra = {},
  ) {
    const e = { mistake: '', remark: '', column: 'id', ...extra };
    const { rows } = await sql<{ id: number }>`
      INSERT INTO WorkReportM (RecordNo, TableName, ColumnName, WorkTypeGId, DoneByGId, Workdate, Mistake, Remark, alterTime)
      OUTPUT INSERTED.WorkReportKm AS id
      VALUES (${recordNo}, ${tableName}, ${e.column}, 0, ${doneBy}, CAST(DATEADD(DAY, ${-daysAgo}, GETDATE()) AS date),
        ${e.mistake}, ${e.remark}, CAST(GETDATE() AS time))
    `.execute(trx);
    return rows[0]!.id;
  }

  beforeEach(async () => {
    trx = await db.startTransaction().execute();
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', SECURITY_PASSWORD: SECURITY });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
      .overrideProvider(KYSELY)
      .useValue(trx)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();
    const stamp = Date.now() % 1_000_000;
    ids.alice = await createUser(`wralice${stamp}`);
    ids.bob = await createUser(`wrbob${stamp}`);
    ids.carol = await createUser(`wrcarol${stamp}`);
    ids.dave = await createUser(`wrdave${stamp}`, { active: false });
    await createUser(`wradmin${stamp}`, { admin: true });
    // Bob and (inactive) Dave report to Alice; Carol does not.
    await sql`
      INSERT INTO EmpReportingT (EmployeeKt, ReportingToKt) VALUES (${ids.bob}, ${ids.alice}), (${ids.dave}, ${ids.alice})
    `.execute(trx);
    ids.a1 = await addEntry(ids.alice, 'bhasmast', '11', 0);
    ids.a2 = await addEntry(ids.alice, 'bhasmast', '12', 0);
    ids.b1 = await addEntry(ids.bob, 'authmast', '21', 1, {
      mistake: 'name(Old)=1',
      remark: 'name(New)=1',
    });
    ids.c1 = await addEntry(ids.carol, 'KrutiMst', '31', 0);
    ids.d1 = await addEntry(ids.dave, 'KrutiMst', '41', 0);
    ids.old = await addEntry(ids.alice, 'BookM', '51', 60);
    alice = await signIn(`wralice${stamp}`);
    await signIn(`wrbob${stamp}`); // creates Bob's log row for today
    admin = await signIn(`wradmin${stamp}`);
  });

  afterEach(async () => {
    await app.close();
    await trx.rollback().execute();
  });

  const kms = (rows: GridRow[]) => rows.map((r) => r.WorkReportKm);

  it('describes the screen from tblSearch', async () => {
    const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
    expect(meta).toMatchObject({ transactionName: 'WorkReportM', primaryColumn: 'WorkReportKm' });
    expect(meta.searchColumns.map((c) => c.displayName).slice(0, 2)).toEqual([
      'Workdate',
      'DoneBy',
    ]);
  });

  it("lists the last month of your own and your reportees' active entries", async () => {
    const rows = (await alice.post(`${API}/list`).send({})).body as GridRow[];
    expect(kms(rows)).toEqual(expect.arrayContaining([ids.a1, ids.a2, ids.b1]));
    expect(kms(rows)).not.toContain(ids.c1); // not reporting to Alice
    expect(kms(rows)).not.toContain(ids.d1); // inactive
    expect(kms(rows)).not.toContain(ids.old); // older than a month
    expect(rows[0]).toMatchObject({ DoneByGId: ids.alice, TableName: 'bhasmast', Qty: 0 });
    expect(Object.keys(rows[0]!)).toEqual(
      expect.arrayContaining([
        'WorkDate',
        'DoneByGIdName',
        'WorkTypeGIdName',
        'RecordNo',
        'alterTime',
      ]),
    );

    const all = (await admin.post(`${API}/list`).send({})).body as GridRow[];
    expect(kms(all)).toEqual(expect.arrayContaining([ids.a1, ids.b1, ids.c1]));
    expect(kms(all)).not.toContain(ids.d1);
  });

  it('with StrId, lists just those records at any date', async () => {
    const rows = (await alice.post(`${API}/list`).send({ ids: [ids.old, ids.c1] }))
      .body as GridRow[];
    expect(kms(rows)).toEqual([ids.old]);
  });

  it('Display Count groups by day, user, work type and table', async () => {
    const rows = (await alice.post(`${API}/list`).send({ params: { displayCount: true } }))
      .body as GridRow[];
    const mine = rows.filter((r) => r.DoneByGId === ids.alice);
    expect(mine).toEqual([
      expect.objectContaining({ TableName: 'bhasmast', Qty: 2, WorkReportKm: 0 }),
    ]);
  });

  it('searches within the same users', async () => {
    const meta = (await admin.get(`${API}/meta`)).body as MasterMeta;
    const table = meta.searchColumns.find((c) => c.columnName === 'TableName')!;
    const rows = (
      await alice.post(`${API}/search`).send({
        columnId: table.id,
        scope: 'all',
        gridIds: [],
        notIn: false,
        values: ['KrutiMst'],
        text: '',
      })
    ).body as GridRow[];
    expect(kms(rows)).not.toContain(ids.c1);
    expect(kms(rows)).not.toContain(ids.d1);
  });

  it('Compare Data shows the old and new values side by side', async () => {
    const res = (await alice.post(`${API}/action/compare-data`).send({ ids: [ids.b1] }))
      .body as ActionResult;
    expect(res).toEqual({
      kind: 'table',
      title: '',
      columns: ['ColName', 'OldData', 'NewData'],
      rows: [['name', '(Old)', '(New)']],
    });
    const hidden = (await alice.post(`${API}/action/compare-data`).send({ ids: [ids.c1] })).body;
    expect(hidden.rows).toEqual([]);
  });

  it("Log Report opens a reportee's day read-only; Report opens the days' logs", async () => {
    const { rows } = await sql<{
      d: string;
    }>`SELECT CONVERT(varchar(10), GETDATE(), 23) AS d`.execute(trx);
    const today = rows[0]!.d;
    const res = (
      await alice
        .post(`${API}/action/log-report`)
        .send({ ids: [], params: { day: `${ids.bob}|${today}` } })
    ).body as ActionResult;
    expect(res.kind).toBe('work-log');
    const logId = (res as { logId: number }).logId;
    const detail = (await alice.get(`/api/work-log/${logId}`)).body as WorkLogDetail;
    expect(detail).toMatchObject({ userId: ids.bob, readOnly: true });

    const none = (
      await alice
        .post(`${API}/action/log-report`)
        .send({ ids: [], params: { day: `${ids.carol}|${today}` } })
    ).body;
    expect(none).toEqual({ kind: 'message', message: 'No Record Found' });

    const report = (
      await alice.post(`${API}/action/report`).send({
        ids: [],
        params: { days: `${ids.alice}|${today},${ids.bob}|${today},${ids.bob}|${today}` },
      })
    ).body as ActionResult;
    expect(report).toMatchObject({ kind: 'open', screen: 'old-log-reports' });
    expect((report as { ids: number[] }).ids).toHaveLength(2);
  });

  it('refuses every write', async () => {
    const json = { 'Content-Type': 'application/json' };
    expect((await admin.post(`${API}/save`).send({ id: 0, fields: {} })).status).toBe(403);
    expect(
      (await admin.post(`${API}/delete`).send({ ids: [ids.a1], password: SECURITY })).status,
    ).toBe(403);
    expect((await admin.post(`${API}/edit-lock/${ids.a1}`).set(json)).status).toBe(403);
    // There is no work report write route at all (frmDisplayTransNew never saves).
    expect((await admin.post(`${API}/work-report/${ids.a1}`).send({ rows: [] })).status).toBe(404);
    const { rows } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM WorkReportM WHERE WorkReportKm = ${ids.a1}
    `.execute(trx);
    expect(rows[0]!.n).toBe(1);
  });
});
