import type { GridRow } from '@gglib/shared';
import { sql } from 'kysely';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { serverNow } from '../src/db/legacy-sql.js';
import { addDays } from '../src/attendance/working-days.js';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Employee › Leaves (frmLeaveM, table LeaveM) through the master engine, rolled back after
 * every test. Everyone may add a leave; only user type 1 (and users 41 / 5) may change one;
 * only AMaster (and users 41 / 5) may approve or reject. The API enforces all of it.
 */
describe.skipIf(!hasDb)('Leaves via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/leaves';
  // A Monday-to-Sunday week no real data uses.
  const MON = '2031-03-03';
  const WED = '2031-03-05';
  const SUN = '2031-03-09';

  const me = async (agent: request.Agent) =>
    ((await agent.get('/api/auth/me')).body as { user: { id: number } }).user.id;

  const typeId = (name: string) =>
    h.scalar(
      sql`SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'LeaveType' AND Name = ${name}`,
    );
  const statusId = (name: string) =>
    h.scalar(
      sql`SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'LeaveStatus' AND Name = ${name}`,
    );
  const stored = async (id: number) =>
    (
      await sql<{
        TotalDays: number;
        status: string;
        ApprovedBykt: number | null;
        approved: string | null;
        enuser: number;
        moduser: number | null;
        DiffHr: string | null;
      }>`
        SELECT TotalDays, (SELECT Name FROM columnmaster WHERE ColumnMastkm = LeaveStatuskt) AS status,
          ApprovedBykt, CONVERT(varchar(10), ApprovedDate, 23) AS approved, enuser, moduser,
          CONVERT(varchar(8), DiffHr, 108) AS DiffHr
        FROM LeaveM WHERE LeaveMKm = ${id}
      `.execute(h.trx)
    ).rows[0]!;

  /** Saves a leave as `agent`; returns the response. */
  const save = async (
    agent: request.Agent,
    id: number,
    f: { emp: number; from: string; to: string; type: number; reason?: string },
  ) =>
    agent.post(`${API}/save`).send({
      id,
      fields: {
        Employeekt: f.emp,
        LeaveFromDate: f.from,
        LeaveToDate: f.to,
        LeaveTypekt: f.type,
        Reason: f.reason ?? ' r ',
        DiffHour: '01',
        DiffMinute: '30',
        // Ignored: computed or kept by the server.
        TotalDays: '99',
        LeaveStatuskt: 0,
        ApprovedBykt: 0,
        Comment: 'x',
      },
    });

  const add = async (agent: request.Agent, f: Parameters<typeof save>[2]) => {
    const res = await save(agent, 0, f);
    expect(res.status).toBe(200);
    return res.body.id as number;
  };

  it('lets an operator add a leave but not change, approve or summarise', async () => {
    const op = h.user;
    const opId = await me(op);
    const personal = await typeId('Personal');
    const id = await add(op, { emp: opId, from: MON, to: SUN, type: personal });
    const row = await stored(id);
    // Sunday excluded; TotalDays and status computed, not taken from the client.
    expect(row.TotalDays).toBe(6);
    expect(row.status).toBe('Pending');
    expect(row.ApprovedBykt).toBe(-1);
    expect(row.enuser).toBe(opId);
    expect(row.DiffHr).toBe('01:30:00');

    expect((await save(op, id, { emp: opId, from: MON, to: SUN, type: personal })).status).toBe(
      403,
    );
    expect((await op.post(`${API}/edit-lock/${id}`).send({})).status).toBe(403);
    expect((await op.post(`${API}/action/approve`).send({ ids: [id] })).status).toBe(403);
    expect((await op.post(`${API}/action/reject`).send({ ids: [id] })).status).toBe(403);
    expect(
      (
        await op
          .post(`${API}/action/employee-summary`)
          .send({ ids: [], params: { range: '01/03/2031-31/03/2031' } })
      ).status,
    ).toBe(403);
    // Delete is never available.
    const del = await h.admin.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(del.status).toBe(403);
    const editor = await h.signIn(1);
    const del2 = await editor.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(del2.status).toBe(400);
    expect(del2.body.message).toBe('Delete Facility is not Available');
  });

  it('shows an operator only their own leaves and the ones they entered', async () => {
    const op = h.user;
    const opId = await me(op);
    const otherAgent = await h.signIn(3);
    const otherId = await me(otherAgent);
    const personal = await typeId('Personal');
    const theirs = await add(otherAgent, { emp: otherId, from: MON, to: MON, type: personal });
    const forOther = await add(op, { emp: otherId, from: WED, to: WED, type: personal });
    const list = (await op.post(`${API}/list`).send({})).body as GridRow[];
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) expect([r.Employeekt, r.enuser]).toContain(opId);
    expect(list.some((r) => r.LeaveMKm === forOther)).toBe(true);
    expect(list.some((r) => r.LeaveMKm === theirs)).toBe(false);
    expect((await op.get(`${API}/record/${theirs}`)).status).toBe(404);
    // An AMaster sees every row.
    const amaster = await h.signIn(5);
    const all = (await amaster.post(`${API}/list`).send({ ids: [theirs, forOther] }))
      .body as GridRow[];
    expect(all).toHaveLength(2);
  });

  it('lets user type 1 modify but not approve; recomputes only when dates or type change', async () => {
    const editor = await h.signIn(1);
    const empId = await me(h.user);
    const personal = await typeId('Personal');
    const id = await add(h.user, { emp: empId, from: MON, to: SUN, type: personal });
    expect((await editor.post(`${API}/action/approve`).send({ ids: [id] })).status).toBe(403);

    await sql`UPDATE LeaveM SET LeaveStatuskt = ${await statusId('Approved')}, TotalDays = 42 WHERE LeaveMKm = ${id}`.execute(
      h.trx,
    );
    const same = await save(editor, id, {
      emp: empId,
      from: MON,
      to: SUN,
      type: personal,
      reason: 'n',
    });
    expect(same.status).toBe(200);
    let row = await stored(id);
    expect(row.status).toBe('Approved');
    // TotalDays always follows the dates; the approval survives a Reason-only edit.
    expect(row.TotalDays).toBe(6);
    expect(row.moduser).toBe(await me(editor));

    expect(
      (await save(editor, id, { emp: empId, from: MON, to: WED, type: personal })).status,
    ).toBe(200);
    row = await stored(id);
    expect(row.status).toBe('Pending');
    expect(row.TotalDays).toBe(3);
  });

  it('lets an AMaster approve a Pending leave and reject any', async () => {
    const amaster = await h.signIn(5);
    const amId = await me(amaster);
    const empId = await me(h.user);
    const personal = await typeId('Personal');
    const id = await add(h.user, { emp: empId, from: MON, to: MON, type: personal });

    const ok = await amaster.post(`${API}/action/approve`).send({ ids: [id] });
    expect(ok.status).toBe(200);
    expect(ok.body.kind).toBe('refreshed');
    expect(ok.body.rows[0].LeaveStatusName).toBe('Approved');
    const { date: today } = await serverNow(h.trx);
    let row = await stored(id);
    expect(row.status).toBe('Approved');
    expect(row.ApprovedBykt).toBe(amId);
    expect(row.approved).toBe(today);

    // Approve only offers itself on a Pending row.
    expect((await amaster.post(`${API}/action/approve`).send({ ids: [id] })).status).toBe(400);
    expect((await amaster.post(`${API}/action/reject`).send({ ids: [id] })).status).toBe(200);
    row = await stored(id);
    expect(row.status).toBe('Rejected');

    // An AMaster cannot modify a saved leave.
    expect(
      (await save(amaster, id, { emp: empId, from: MON, to: MON, type: personal })).status,
    ).toBe(403);
  });

  it('auto-approves SPL on save, but a Reject stays Rejected', async () => {
    const spl = await typeId('SPL');
    const empId = await me(h.user);
    const id = await add(h.user, { emp: empId, from: MON, to: MON, type: spl });
    expect((await stored(id)).status).toBe('Approved');
    const amaster = await h.signIn(5);
    expect((await amaster.post(`${API}/action/reject`).send({ ids: [id] })).status).toBe(200);
    expect((await stored(id)).status).toBe('Rejected');
  });

  it('gives Leave Without Approval from today, Pending from tomorrow', async () => {
    const { date: today } = await serverNow(h.trx);
    const empId = await me(h.user);
    const personal = await typeId('Personal');
    const a = await add(h.user, { emp: empId, from: today, to: today, type: personal });
    expect((await stored(a)).status).toBe('Leave Without Approval');
    const tomorrow = addDays(today, 1);
    const b = await add(h.user, {
      emp: empId,
      from: tomorrow,
      to: tomorrow,
      type: personal,
    });
    expect((await stored(b)).status).toBe('Pending');
    // The defaults: the user, tomorrow, Pending.
    const d = (await h.user.get(`${API}/new-defaults`)).body as GridRow;
    expect(d.Employeekt).toBe(empId);
    expect(d.LeaveFromDate).toBe(tomorrow);
    expect(d.LeaveStatusName).toBe('Pending');
  });

  it('skips Sundays and holidays, and counts 0 for LC / EG', async () => {
    await sql`INSERT INTO HolidayM (HolidayDate, HolidayName) VALUES (CAST(${WED} AS date), 'zz test')`.execute(
      h.trx,
    );
    const empId = await me(h.user);
    const id = await add(h.user, {
      emp: empId,
      from: MON,
      to: SUN,
      type: await typeId('Personal'),
    });
    expect((await stored(id)).TotalDays).toBe(5);
    const preview = await h.user.get(`${API}/lists/total-days?from=${MON}&to=${SUN}&type=Personal`);
    expect(preview.body.rows[0][0]).toBe(5);
    expect(preview.body.rows[0][2]).toBe('Pending');
    const lc = await add(h.user, {
      emp: empId,
      from: '2031-04-01',
      to: '2031-04-01',
      type: await typeId('LC'),
    });
    expect((await stored(lc)).TotalDays).toBe(0);
  });

  it('validates with the desktop messages; containment names the entering user', async () => {
    const empId = await me(h.user);
    const personal = await typeId('Personal');
    const msg = async (f: Parameters<typeof save>[2]) => (await save(h.user, 0, f)).body.message;
    expect(await msg({ emp: 0, from: MON, to: MON, type: personal })).toBe(
      'Please Enter Employee Name',
    );
    expect(await msg({ emp: empId, from: SUN, to: MON, type: personal })).toBe(
      'LeaveFrom Date Cannot be Greater Then LeaveTo Date',
    );
    expect(await msg({ emp: empId, from: MON, to: MON, type: 0 })).toBe('Please Enter Leave Type');

    const enterer = await h.signIn(3);
    await sql`UPDATE Usecurity SET Employee_Name = 'Zz Enterer' WHERE tid = ${await me(enterer)}`.execute(
      h.trx,
    );
    await add(enterer, { emp: empId, from: WED, to: WED, type: personal });
    // A range containing that leave is refused; one inside it (not containing it) is not.
    expect(await msg({ emp: empId, from: MON, to: SUN, type: personal })).toBe(
      'Leave Already Applied By - Zz Enterer',
    );
  });

  it('lists leaves between dates, and those without approval', async () => {
    const empId = await me(h.user);
    const personal = await typeId('Personal');
    const inRange = await add(h.user, { emp: empId, from: MON, to: WED, type: personal });
    const outside = await add(h.user, {
      emp: empId,
      from: '2031-04-01',
      to: '2031-04-02',
      type: personal,
    });
    const res = await h.user
      .post(`${API}/action/between-dates`)
      .send({ ids: [], params: { range: '05/03/2031-06/03/2031' } });
    expect(res.status).toBe(200);
    const ids = (res.body.rows as GridRow[]).map((r) => r.LeaveMKm);
    expect(ids).toContain(inRange);
    expect(ids).not.toContain(outside);

    const bad = await h.user
      .post(`${API}/action/between-dates`)
      .send({ ids: [], params: { range: '2031-03-05' } });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe(
      'Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)',
    );

    await sql`UPDATE LeaveM SET LeaveStatuskt = ${await statusId('Leave Without Approval')} WHERE LeaveMKm = ${inRange}`.execute(
      h.trx,
    );
    const wa = await h.user.post(`${API}/action/without-approval`).send({ ids: [] });
    const waIds = (wa.body.rows as GridRow[]).map((r) => r.LeaveMKm);
    expect(waIds).toContain(inRange);
    expect(waIds).not.toContain(outside);
  });

  it('builds the Employee Summary for a range', async () => {
    const empId = await me(h.user);
    await add(h.user, { emp: empId, from: MON, to: WED, type: await typeId('Personal') });
    const lc = await add(h.user, { emp: empId, from: SUN, to: SUN, type: await typeId('LC') });
    await sql`UPDATE LeaveM SET DiffHr = '01:30' WHERE LeaveMKm = ${lc}`.execute(h.trx);
    const amaster = await h.signIn(5);
    const res = await amaster
      .post(`${API}/action/employee-summary`)
      .send({ ids: [], params: { range: '01/03/2031-31/03/2031' } });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('table');
    expect(res.body.columns).toEqual([
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
    ]);
    const mine = (res.body.rows as unknown[][]).find((r) => r[0] === empId)!;
    expect(mine.slice(2, 8)).toEqual([3, 1, 1.5, 0, 0, 1.5]);
  });
});
