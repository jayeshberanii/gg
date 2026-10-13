import type { ActionResult, GridRow, PickList } from '@gglib/shared';
import { sql } from 'kysely';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { hasDb, useMasterHarness } from './master-harness.js';

/**
 * Employee › Old Log Reports (frmLogReport): the read-only log ⋈ work report, rolled back after
 * every test. Anyone but an admin or AMaster sees only their own logs and their direct
 * reports' (EmpReportingT), inactive users included; the API enforces it on every path.
 */
describe.skipIf(!hasDb)('Old Log Reports via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/old-log-reports';
  // A day no real data uses.
  const DAY = '2031-05-06';
  const DAY_TEXT = '06/05/2031';

  const me = async (agent: request.Agent) =>
    ((await agent.get('/api/auth/me')).body as { user: { id: number } }).user.id;

  /** A user who never signs in (inactive when asked). */
  async function plainUser(name: string, active = true) {
    await sql`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      VALUES (${name}, 'x', 0, 0, 0, 1, 0, ${active ? 1 : 0}, 3, '08:00')
    `.execute(h.trx);
    return h.scalar(sql`SELECT tid FROM Usecurity WHERE uname = ${name}`);
  }

  async function reportsTo(employee: number, boss: number) {
    await sql`INSERT INTO EmpReportingT (EmployeeKt, ReportingToKt) VALUES (${employee}, ${boss})`.execute(
      h.trx,
    );
  }

  /** A log day of 8 hours (09:00–17:00); returns its logID. */
  async function addLog(uid: number, day = DAY, total: string | null = '08:00:00') {
    const id = (await h.scalar(sql`SELECT ISNULL(MAX(logID), 0) + 1 FROM log`)) as number;
    await sql`
      INSERT INTO log (logID, uid, logdate, logintime, logouttime, totallogtime)
      VALUES (${id}, ${uid}, CAST(${day} AS date), '09:00:00', ${total ? '17:00:00' : null}, ${total})
    `.execute(h.trx);
    return id;
  }

  async function addWork(
    logId: number,
    vibhag: number,
    workType: number,
    time: string,
    report = 'r',
    quantity = 1,
  ) {
    const id = await h.scalar(sql`SELECT ISNULL(MAX(workID), 0) + 1 FROM work`);
    await sql`
      INSERT INTO work (workID, logid, vibhagkt, worktypeID, workquantity, worktime, workreports, remarks)
      VALUES (${id}, ${logId}, ${vibhag}, ${workType}, ${quantity}, ${time}, ${report}, ${'rem ' + report})
    `.execute(h.trx);
  }

  const cm = (name: string, vibhag: string) =>
    h.scalar(
      sql`SELECT ColumnMastkm FROM columnmaster WHERE Name = ${name} AND Vibhag = ${vibhag}`,
    );

  const list = async (agent: request.Agent, params: object, ids?: number[]) => {
    const res = await agent.post(`${API}/list`).send({ params, ...(ids ? { ids } : {}) });
    expect(res.status).toBe(200);
    return res.body as GridRow[];
  };

  const range = { from: DAY, to: DAY };

  it('Full Report: one row per work entry, with gap and work time and the target', async () => {
    const uid = await me(h.user);
    const logId = await addLog(uid);
    const personal = await cm('Personal', 'Vibhag');
    const gap = await cm('Gap', 'worktype');
    await addWork(logId, personal, gap, '00:25:00', 'tea');
    const std = (
      await sql<{ VibhagKt: number; WorkTypeKt: number; PerHourWorkQty: number }>`
        SELECT TOP 1 VibhagKt, WorkTypeKt, PerHourWorkQty FROM ApprisalStandard
        WHERE PerHourWorkQty > 0 AND VibhagKt IN (SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'Vibhag')
          AND WorkTypeKt IN (SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'worktype')
        ORDER BY ApprisalStandardKm`.execute(h.trx)
    ).rows[0]!;
    await addWork(logId, std.VibhagKt, std.WorkTypeKt, '02:00:00', 'books', 7);

    const rows = await list(h.user, { reportType: 'Datewise', short: false, ...range });
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]!)).toEqual([
      'logdat',
      'logdate',
      'uid',
      'uname',
      'logintime',
      'logouttime',
      'totallogtime',
      'Vibhag',
      'WorkType',
      'workquantity',
      'worktime',
      'workreports',
      'remarks',
      'TargetedWorkQty',
      'totalgaptime',
      'totalworktime',
    ]);
    const books = rows.find((r) => r.workreports === 'books')!;
    expect(books).toMatchObject({
      logdate: DAY_TEXT,
      uid,
      logintime: '09:00:00',
      logouttime: '17:00:00',
      totallogtime: '08:00:00',
      workquantity: 7,
      worktime: '02:00:00',
      remarks: 'rem books',
      TargetedWorkQty: 2 * std.PerHourWorkQty,
      totalgaptime: '00:25',
      totalworktime: '07:35',
    });
    expect(String(books.logdat).slice(0, 10)).toBe(DAY);
    expect(rows.find((r) => r.workreports === 'tea')).toMatchObject({
      Vibhag: 'Personal',
      WorkType: 'Gap',
      TargetedWorkQty: 0,
    });
  });

  it('Short Report: one row per log day with only the nine desktop columns', async () => {
    const uid = await me(h.user);
    const logId = await addLog(uid);
    const personal = await cm('Personal', 'Vibhag');
    const gap = await cm('Gap', 'worktype');
    await addWork(logId, personal, gap, '00:10:00', 'a');
    await addWork(logId, personal, gap, '00:05:00', 'b');
    await addLog(uid, DAY, null); // a second, still open day (16 such days exist)

    const rows = await list(h.user, { reportType: 'Userwise', short: true, ...range });
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]!)).toEqual([
      'logdat',
      'logdate',
      'uid',
      'uname',
      'logintime',
      'logouttime',
      'totallogtime',
      'totalgaptime',
      'totalworktime',
    ]);
    expect(rows.map((r) => [r.totallogtime, r.totalgaptime, r.totalworktime])).toEqual(
      expect.arrayContaining([
        ['08:00:00', '00:15', '07:45'],
        [null, '00:00', '00:00'],
      ]),
    );
    // Short is only for Datewise / Userwise: Vibhagwise gets the Full rows (2 work + 1 open day).
    const vib = await list(h.user, { reportType: 'Vibhagwise', short: true, ...range });
    expect(vib).toHaveLength(3);
    expect(vib[0]).toHaveProperty('Vibhag');
  });

  it('orders by the report type', async () => {
    const uid = await me(h.user);
    await addLog(uid, '2031-05-07');
    await addLog(uid, DAY);
    const rows = await list(h.user, {
      reportType: 'Datewise',
      short: true,
      from: DAY,
      to: '2031-05-07',
    });
    expect(rows.map((r) => r.logdate)).toEqual([DAY_TEXT, '07/05/2031']);
    const none = await list(h.user, {
      reportType: 'Datewise',
      from: '2031-05-08',
      to: '2031-05-09',
    });
    expect(none).toEqual([]);
  });

  it('scopes an operator to self plus direct reports, inactive ones included', async () => {
    const boss = await me(h.user);
    const sub = await plainUser(`olr${Date.now() % 1e6}s`);
    const gone = await plainUser(`olr${Date.now() % 1e6}g`, false);
    const other = await plainUser(`olr${Date.now() % 1e6}o`);
    await reportsTo(sub, boss);
    await reportsTo(gone, boss);
    const logs = {
      boss: await addLog(boss),
      sub: await addLog(sub),
      gone: await addLog(gone),
      other: await addLog(other),
    };
    const uids = (rows: GridRow[]) => [...new Set(rows.map((r) => Number(r.uid)))].sort();

    const mine = await list(h.user, { reportType: 'Datewise', short: true, ...range });
    expect(uids(mine)).toEqual([boss, sub, gone].sort());

    // The StrId path (a window opened from Work Report) is scoped too, whatever ids it names.
    const byIds = await list(h.user, { reportType: 'Datewise' }, Object.values(logs));
    expect(uids(byIds)).toEqual([boss, sub, gone].sort());
    expect(await list(h.user, { reportType: 'Datewise' }, [logs.other])).toEqual([]);

    // A subordinate sees only themselves; an admin and an AMaster see everyone.
    await reportsTo(other, sub);
    const ofOther = await list(h.admin, { reportType: 'Datewise' }, Object.values(logs));
    expect(uids(ofOther)).toEqual([boss, sub, gone, other].sort());
    const amaster = await h.signIn(5);
    expect(uids(await list(amaster, { reportType: 'Datewise' }, Object.values(logs)))).toEqual(
      [boss, sub, gone, other].sort(),
    );
    // A Master (2) without admin rights is scoped like an operator.
    const master = await h.signIn(2);
    const masterId = await me(master);
    expect(await list(master, { reportType: 'Datewise' }, Object.values(logs))).toEqual([]);
    await reportsTo(boss, masterId);
    expect(uids(await list(master, { reportType: 'Datewise' }, Object.values(logs)))).toEqual([
      boss,
    ]);
  });

  it('gap time of a real log: logID 96958 has 1500 s of gaps (00:25)', async () => {
    const rows = await list(h.admin, { reportType: 'Datewise', short: true }, [96958]);
    if (rows.length === 0) return; // not in this copy of the DB
    expect(rows[0]!.totalgaptime).toBe('00:25');
  });

  it('F2 on Search (User): the users with a log, scoped like the report', async () => {
    const boss = await me(h.user);
    const sub = await plainUser(`olr${Date.now() % 1e6}f`);
    const other = await plainUser(`olr${Date.now() % 1e6}x`);
    await reportsTo(sub, boss);
    await addLog(boss);
    await addLog(sub);
    await addLog(other);
    const res = await h.user.get(`${API}/f2/txtSearch`);
    expect(res.status).toBe(200);
    const pick = res.body as PickList;
    expect(pick.columns).toEqual(['tid', 'uname']);
    expect(pick.rows.map((r) => Number(r[0])).sort()).toEqual([boss, sub].sort());

    const all = (await h.admin.get(`${API}/f2/txtSearch`)).body as PickList;
    expect(all.rows.map((r) => Number(r[0]))).toEqual(expect.arrayContaining([boss, sub, other]));
  });

  it('Send To Work Report opens the WorkReportM entries of the row’s user and day', async () => {
    const uid = await me(h.user);
    const other = await plainUser(`olr${Date.now() % 1e6}w`);
    const add = async (by: number) => {
      await sql`
        INSERT INTO WorkReportM (RecordNo, TableName, ColumnName, WorkTypeGId, DoneByGId, Workdate, alterTime)
        VALUES ('1', 'BookM', '', 0, ${by}, CAST(${DAY} AS date), '10:00:00')
      `.execute(h.trx);
      return h.scalar(sql`SELECT MAX(WorkReportKm) FROM WorkReportM`);
    };
    const a = await add(uid);
    const b = await add(uid);
    await add(other);

    const send = (agent: request.Agent, day: string) =>
      agent.post(`${API}/action/send-to-work-report`).send({ ids: [], params: { day } });
    const res = await send(h.user, `${uid}|${DAY}`);
    expect(res.status).toBe(200);
    expect(res.body as ActionResult).toEqual({
      kind: 'open',
      screen: 'work-report',
      ids: [a, b],
      emptyMessage: 'No Record Found',
    });
    // Someone outside the operator's scope: nothing, so "No Record Found".
    expect(((await send(h.user, `${other}|${DAY}`)).body as { ids: number[] }).ids).toEqual([]);
    expect(((await send(h.admin, `${other}|${DAY}`)).body as { ids: number[] }).ids).toHaveLength(
      1,
    );
    expect((await send(h.user, 'nonsense')).status).toBe(400);
  });

  it('Send To Log Report: user type 1 or 5 only, and within the scope', async () => {
    const uid = await me(h.user);
    const logId = await addLog(uid);
    const day = `${uid}|${DAY}`;
    const go = (agent: request.Agent, d = day) =>
      agent.post(`${API}/action/log-report`).send({ ids: [], params: { day: d } });

    // An operator, even an IsAdmin one, may not (cntMenu_Opening gates on curr_utypeid).
    expect((await go(h.user)).status).toBe(403);
    expect((await go(h.admin)).status).toBe(403);

    const type1 = await h.signIn(1);
    // A type-1 user without IsAdmin is scoped: another user's day is not found.
    expect((await go(type1)).body).toEqual({ kind: 'message', message: 'No Record Found' });
    const amaster = await h.signIn(5);
    expect((await go(amaster)).body).toEqual({ kind: 'work-log', logId });
    expect((await go(amaster, `${uid}|2031-05-09`)).body).toEqual({
      kind: 'message',
      message: 'No Record Found',
    });
  });

  it('refuses every write and bad parameters', async () => {
    expect(
      (await h.admin.post(`${API}/save`).send({ id: 0, fields: {} })).status,
    ).toBeGreaterThanOrEqual(400);
    const bad = await h.user.post(`${API}/list`).send({ params: { reportType: 'Monthly' } });
    expect(bad.status).toBe(400);
    const badDate = await h.user
      .post(`${API}/list`)
      .send({ params: { reportType: 'Datewise', from: "2031-05-06' OR 1=1 --" } });
    expect(badDate.status).toBe(400);
  });
});
