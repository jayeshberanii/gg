import type { GridRow } from '@gglib/shared';
import { sql } from 'kysely';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { decodeLegacyPassword, encodeLegacyPassword } from '../src/auth/legacy-password.js';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Employee › Employee Master (frmEmployeeNew, table Usecurity) through the master engine,
 * rolled back after every test. The login table: the password must never reach a viewer who
 * fails the Show Password rule, and a non-privileged user may read and change only their own
 * row, enforced by the API.
 */
describe.skipIf(!hasDb)('Employee Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/employee-master';
  const PW = 'Pa55word';

  const me = async (agent: request.Agent) =>
    ((await agent.get('/api/auth/me')).body as { user: { id: number } }).user.id;

  const fields = (extra: Record<string, unknown> = {}) => ({
    Employee_Name: 'Test Employee',
    uname: `emp${Date.now() % 100000}`,
    upwd: PW,
    DOB: '1990-05-01',
    DOJ: '2020-01-02',
    Refnm: 'ref',
    UserTypeKt: 3,
    Address: 'Addr 1',
    Area: 'Area 1',
    city: 'Surat',
    Pincode: '395001',
    Phoneno: '0261',
    Mobileno: '9999999999',
    EmailID: 'e@x.in',
    IPAddress: '10.0.0.1',
    vibhagkt: 0,
    Grading: 'A',
    WorkingHours: '08:30',
    per_hor_amount: '12.5',
    Remark: 'remark',
    ReportingToTran: '',
    uadd: true,
    umodify: false,
    udel: true,
    IsActive: true,
    ...extra,
  });

  /** Adds an employee as the admin; returns its tid. */
  const add = async (extra: Record<string, unknown> = {}) => {
    const res = await h.admin.post(`${API}/save`).send({ id: 0, fields: fields(extra) });
    expect(res.status).toBe(200);
    return res.body.id as number;
  };

  const storedPwd = async (tid: number) => {
    const { rows } = await sql<{ p: Buffer | null }>`
      SELECT CONVERT(varbinary(100), upwd) AS p FROM Usecurity WHERE tid = ${tid}
    `.execute(h.trx);
    return rows[0]?.p ? decodeLegacyPassword(rows[0].p) : null;
  };

  /** No key called upwd anywhere, and neither the plain nor the encoded password as a value. */
  const expectNoPassword = (body: unknown, plain = PW) => {
    const json = JSON.stringify(body);
    expect(json.toLowerCase()).not.toContain('"upwd"');
    expect(json).not.toContain(plain);
    expect(json).not.toContain(encodeLegacyPassword(plain).toString('latin1'));
  };

  it('validates with the desktop messages, Working Hours first', async () => {
    const noHours = await h.admin
      .post(`${API}/save`)
      .send({ id: 0, fields: fields({ WorkingHours: '__:__', uname: '' }) });
    expect(noHours.status).toBe(400);
    expect(noHours.body.message).toBe('Please Enter Working Hours');
    const noName = await h.admin
      .post(`${API}/save`)
      .send({ id: 0, fields: fields({ uname: ' ' }) });
    expect(noName.status).toBe(400);
    expect(noName.body.message).toBe('Please Enter User Name');
  });

  it('adds with the identity, the encoded password, audit columns and Reporting To rows', async () => {
    const adminId = await me(h.admin);
    const res = await h.admin.post(`${API}/save`).send({
      id: 0,
      fields: {
        ...fields(),
        ReportingToTran: 'x',
        'ReportingToTran.Rows': [
          { EmployeeKt: 0, ReportingToKt: adminId, ReportingToName: 'x' },
          { EmployeeKt: 0, ReportingToKt: 0, ReportingToName: '' },
        ],
      },
    });
    expect(res.status).toBe(200);
    const tid = res.body.id as number;
    expectNoPassword(res.body);
    expect(res.body.row).toMatchObject({ tid, Employee_Name: 'Test Employee' });

    expect(await storedPwd(tid)).toBe(PW);
    const { rows } = await sql<{
      Createdby: number;
      per_hor_amount: number;
      uview: boolean;
      Image: string | null;
      wh: string;
    }>`
      SELECT Createdby, per_hor_amount, uview, Image, CONVERT(varchar(5), WorkingHours, 108) AS wh
      FROM Usecurity WHERE tid = ${tid}
    `.execute(h.trx);
    // Val("12.5") into an Integer rounds half to even.
    expect(Number(rows[0]!.Createdby)).toBe(adminId);
    expect(rows[0]).toMatchObject({
      per_hor_amount: 12,
      uview: false,
      Image: null,
      wh: '08:30',
    });
    // The popup's blank row is not written.
    const reporting = await sql<{ to: number }>`
      SELECT ReportingToKt AS [to] FROM EmpReportingT WHERE EmployeeKt = ${tid}
    `.execute(h.trx);
    expect(reporting.rows.map((r) => r.to)).toEqual([adminId]);

    const record = (await h.admin.get(`${API}/record/${tid}`)).body as GridRow;
    expect(record.upwd).toBe(PW);
    expect(String(record.ReportingToTran)).toBe(
      (
        await sql<{ u: string }>`SELECT uname AS u FROM Usecurity WHERE tid = ${adminId}`.execute(
          h.trx,
        )
      ).rows[0]!.u,
    );
    const popup = (await h.admin.get(`${API}/trans/ReportingToTran/${tid}`)).body;
    expect(popup.rows).toHaveLength(1);
  });

  it('keeps the password when the field is absent and logs a change as upwd(changed)', async () => {
    const tid = await add();
    const rest: Record<string, unknown> = fields({ Employee_Name: 'Renamed' });
    delete rest.upwd;
    const kept = await h.admin.post(`${API}/save`).send({ id: tid, fields: rest });
    expect(kept.status).toBe(200);
    expect(await storedPwd(tid)).toBe(PW);

    const changed = await h.admin
      .post(`${API}/save`)
      .send({ id: tid, fields: fields({ Employee_Name: 'Renamed', upwd: 'NewPw77' }) });
    expect(changed.status).toBe(200);
    expect(await storedPwd(tid)).toBe('NewPw77');
    expectNoPassword(changed.body, 'NewPw77');
    expectNoPassword(changed.body, PW);
    const logged = await sql<{ m: string | null; r: string | null }>`
      SELECT Mistake AS m, Remark AS r FROM WorkReportM WHERE TableName = 'Usecurity' AND RecordNo = ${String(tid)}
    `.execute(h.trx);
    const texts = [
      changed.body.workReport?.mistake,
      changed.body.workReport?.remark,
      ...logged.rows.flatMap((r) => [r.m, r.r]),
    ].join(' ');
    expect(texts).toContain('upwd(changed)');
    expect(texts).not.toContain('NewPw77');
    expect(texts).not.toContain(encodeLegacyPassword('NewPw77').toString('latin1'));
    expect(texts).not.toContain(encodeLegacyPassword(PW).toString('latin1'));
  });

  it('never sends upwd in list, search, print or the Excel rows to an unauthorised viewer', async () => {
    const tid = await add();
    // The operator's own grid, the rows Send To Excel exports.
    const list = await h.user.post(`${API}/list`).send({});
    expect(list.status).toBe(200);
    expectNoPassword(list.body, 'Secret1');
    // The admin's lists too: the grid never carries a password.
    const all = await h.admin.post(`${API}/action/show-all`).send({ ids: [] });
    expectNoPassword(all.body);
    expect((all.body.rows as GridRow[]).some((r) => r.tid === tid)).toBe(true);

    // Search By offers no upwd; every search result is free of it.
    const meta = (await h.admin.get(`${API}/meta`)).body;
    expect(meta.searchColumns.length).toBeGreaterThan(0);
    expect(
      meta.searchColumns.map((c: { columnName: string }) => c.columnName.toLowerCase()),
    ).not.toContain('upwd');
    expect(meta.printColumns.map((c: { name: string }) => c.name.toLowerCase())).not.toContain(
      'upwd',
    );
    const upwdRow = await sql<{ Id: number }>`
      SELECT Id FROM tblSearch WHERE TransactionName = 'Usecurity' AND ColumnName = 'upwd'
    `.execute(h.trx);
    const upwdId = upwdRow.rows[0]!.Id;
    expect(
      (
        await h.admin
          .post(`${API}/search-values`)
          .send({ columnId: upwdId, scope: 'all', gridIds: [] })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.admin.post(`${API}/search`).send({
          columnId: upwdId,
          scope: 'all',
          gridIds: [],
          notIn: false,
          values: [],
          text: PW,
        })
      ).status,
    ).toBe(400);
    const unameCol = meta.searchColumns.find(
      (c: { columnName: string }) => c.columnName === 'uname',
    );
    const found = await h.admin.post(`${API}/search`).send({
      columnId: unameCol.id,
      scope: 'all',
      gridIds: [],
      notIn: false,
      values: [],
      text: fields().uname.slice(0, 6),
    });
    expect(found.status).toBe(200);
    expectNoPassword(found.body);

    // Print Selected Column with every column it offers.
    const printed = await h.admin.post(`${API}/print`).send({
      ids: [tid],
      columnIndices: meta.printColumns.map((c: { index: number }) => c.index),
    });
    expect(printed.status).toBe(200);
    expect(printed.body.rows).toHaveLength(1);
    expectNoPassword(printed.body);
    // A layout index pointing at upwd's place picks nothing.
    const { rows: ts } = await sql<{
      IsPrintable: boolean;
      PrintSeq: number | null;
      ColumnName: string;
      PrintColumn: string | null;
    }>`
      SELECT IsPrintable, PrintSeq, ColumnName, PrintColumn FROM tblSearch WHERE TransactionName = 'Usecurity'
    `.execute(h.trx);
    expect(ts.length).toBeGreaterThan(0);
    const allIndices = Array.from({ length: 60 }, (_, i) => i);
    const everything = await h.admin
      .post(`${API}/print`)
      .send({ ids: [tid], columnIndices: allIndices });
    expectNoPassword(everything.body);
  });

  it('gives the record password only to those who pass the Show Password rule', async () => {
    const tid = await add();
    // An admin (not user 100) sees others' passwords, but never row 100's.
    expect(((await h.admin.get(`${API}/record/${tid}`)).body as GridRow).upwd).toBe(PW);
    const vinit = await h.admin.get(`${API}/record/100`);
    expect(vinit.status).toBe(200);
    expect('upwd' in (vinit.body as GridRow)).toBe(false);
    // The operator sees their own password, and no other record at all.
    const ownId = await me(h.user);
    expect(((await h.user.get(`${API}/record/${ownId}`)).body as GridRow).upwd).toBe('Secret1');
    const other = await h.user.get(`${API}/record/${tid}`);
    expect(other.status).toBe(404);
    expectNoPassword(other.body);
  });

  it("refuses a non-privileged user another user's row on every endpoint", async () => {
    const tid = await add({
      ReportingToTran: 'x',
      'ReportingToTran.Rows': [{ EmployeeKt: 0, ReportingToKt: 5, ReportingToName: 'vishal' }],
    });
    const ownId = await me(h.user);

    const list = (await h.user.post(`${API}/list`).send({})).body as GridRow[];
    expect(list.map((r) => r.tid)).toEqual([ownId]);
    expect(((await h.user.post(`${API}/list`).send({ ids: [tid] })).body as GridRow[]).length).toBe(
      0,
    );

    const before = await storedPwd(tid);
    const save = await h.user
      .post(`${API}/save`)
      .send({ id: tid, fields: fields({ upwd: 'hacked', uname: 'hacked' }) });
    expect(save.status).toBe(403);
    expect(await storedPwd(tid)).toBe(before);
    const name = await sql<{
      u: string;
    }>`SELECT uname AS u FROM Usecurity WHERE tid = ${tid}`.execute(h.trx);
    expect(name.rows[0]!.u).not.toBe('hacked');

    expect((await h.user.post(`${API}/save`).send({ id: 0, fields: fields() })).status).toBe(403);
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [tid], password: SECURITY })).status,
    ).toBe(403);
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [ownId], password: SECURITY })).status,
    ).toBe(403);
    expect((await h.user.post(`${API}/edit-lock/${tid}`).send({})).status).toBe(403);
    expect((await h.user.post(`${API}/edit-lock/${ownId}`).send({})).status).toBe(204);
    expect((await h.user.get(`${API}/trans/ReportingToTran/${tid}`)).status).toBe(404);
    expect((await h.user.get(`${API}/work-report/${tid}`)).status).toBe(404);
    expect(
      (
        await h.user.post(`${API}/work-report/${tid}`).send({
          rows: [{ workTypeId: 1, doneById: ownId, mistake: '', remark: 'x' }],
        })
      ).status,
    ).toBe(404);
    const printed = await h.user
      .post(`${API}/print`)
      .send({ ids: [tid], columnIndices: [0, 1, 2, 3] });
    expect(printed.body.rows ?? []).toHaveLength(0);

    // No Search By, no search, and F2 lists only their own values.
    const meta = (await h.user.get(`${API}/meta`)).body;
    expect(meta.searchColumns).toEqual([]);
    expect(
      (
        await h.user
          .post(`${API}/search-values`)
          .send({ columnId: 1067, scope: 'all', gridIds: [] })
      ).status,
    ).toBe(403);
    expect((await h.user.post(`${API}/action/show-all`).send({ ids: [] })).status).toBe(403);
    expect((await h.user.post(`${API}/action/show-inactive`).send({ ids: [] })).status).toBe(403);
    const city = (await h.user.get(`${API}/f2/city`)).body;
    expect(city.rows.flat()).not.toContain('Surat');
    const adminCity = (await h.admin.get(`${API}/f2/city`)).body;
    expect(adminCity.rows.flat()).toContain('Surat');
  });

  it('lets a non-privileged user edit their own row but not the privileged fields', async () => {
    const amaster = await h.signIn(5);
    const ownId = await me(amaster);
    await sql`UPDATE Usecurity SET WorkingHours = '07:00', DOB = NULL WHERE tid = ${ownId}`.execute(
      h.trx,
    );
    const record = (await amaster.get(`${API}/record/${ownId}`)).body as GridRow;
    const mine = {
      ...fields({ uname: record.uname, upwd: undefined }),
      UserTypeKt: 5,
      WorkingHours: '09:00',
      IsActive: false,
      DOB: '',
    };
    const ok = await amaster.post(`${API}/save`).send({ id: ownId, fields: mine });
    expect(ok.status).toBe(200);
    const { rows } = await sql<{
      wh: string;
      IsActive: boolean;
      DOB: Date | null;
      ut: number;
      Employee_Name: string;
    }>`
      SELECT CONVERT(varchar(5), WorkingHours, 108) AS wh, IsActive, DOB, UserTypeKt AS ut, Employee_Name
      FROM Usecurity WHERE tid = ${ownId}
    `.execute(h.trx);
    expect(rows[0]).toMatchObject({
      wh: '07:00',
      IsActive: true,
      DOB: null,
      ut: 5,
      Employee_Name: 'Test Employee',
    });
    expect(await storedPwd(ownId)).toBe('Secret1');

    // Nobody changes their own User Type (an AMaster could make themself Admin on the desktop).
    const escalate = await amaster
      .post(`${API}/save`)
      .send({ id: ownId, fields: { ...mine, UserTypeKt: 1 } });
    expect(escalate.status).toBe(400);
    expect(escalate.body.message).toBe('You cannot change your own User Type');
    const adminId = await me(h.admin);
    const self = await h.admin
      .post(`${API}/save`)
      .send({ id: adminId, fields: fields({ uname: 'adm', UserTypeKt: 1 }) });
    expect(self.body.message).toBe('You cannot change your own User Type');
  });

  it('sets the leaving date when deactivating, keeping an existing one', async () => {
    const tid = await add();
    await h.admin.post(`${API}/save`).send({ id: tid, fields: fields({ IsActive: false }) });
    const today = await sql<{ d: string | null; t: string }>`
      SELECT CONVERT(varchar(10), DOL, 23) AS d, CONVERT(varchar(10), GETDATE(), 23) AS t FROM Usecurity WHERE tid = ${tid}
    `.execute(h.trx);
    expect(today.rows[0]!.d).toBe(today.rows[0]!.t);
    await sql`UPDATE Usecurity SET DOL = '2001-02-03', IsActive = 1 WHERE tid = ${tid}`.execute(
      h.trx,
    );
    await h.admin.post(`${API}/save`).send({ id: tid, fields: fields({ IsActive: false }) });
    const kept = await sql<{ d: string }>`
      SELECT CONVERT(varchar(10), DOL, 23) AS d FROM Usecurity WHERE tid = ${tid}
    `.execute(h.trx);
    expect(kept.rows[0]!.d).toBe('2001-02-03');

    // Inactive rows leave the default grid; Show Inactive brings them back.
    const list = (await h.admin.post(`${API}/list`).send({})).body as GridRow[];
    expect(list.some((r) => r.tid === tid)).toBe(false);
    const inactive = await h.admin.post(`${API}/action/show-inactive`).send({ ids: [] });
    expect((inactive.body.rows as GridRow[]).some((r) => r.tid === tid)).toBe(true);
  });

  it('only the IsAdmin user may set the Admin user type', async () => {
    const amaster = await h.signIn(5);
    // An AMaster who is not privileged cannot add at all.
    expect((await amaster.post(`${API}/save`).send({ id: 0, fields: fields() })).status).toBe(403);
    const tid = await add({ UserTypeKt: 1 });
    const t = await sql<{
      ut: number;
    }>`SELECT UserTypeKt AS ut FROM Usecurity WHERE tid = ${tid}`.execute(h.trx);
    expect(t.rows[0]!.ut).toBe(1);
  });

  it('deletes the record and its Reporting To rows after the Security password', async () => {
    const tid = await add({
      ReportingToTran: 'x',
      'ReportingToTran.Rows': [{ EmployeeKt: 0, ReportingToKt: 5, ReportingToName: 'vishal' }],
    });
    expect(
      (await h.admin.post(`${API}/delete`).send({ ids: [tid], password: 'nope' })).status,
    ).toBe(401);
    expect(
      (await h.admin.post(`${API}/delete`).send({ ids: [tid], password: SECURITY })).status,
    ).toBe(204);
    const left = await sql<{ n: number }>`
      SELECT (SELECT COUNT(*) FROM Usecurity WHERE tid = ${tid}) + (SELECT COUNT(*) FROM EmpReportingT WHERE EmployeeKt = ${tid}) AS n
    `.execute(h.trx);
    expect(Number(left.rows[0]!.n)).toBe(0);
  });

  it('hides the encoded passwords the desktop wrote into the work report', async () => {
    const tid = await add();
    const enc = encodeLegacyPassword('oldpw').toString('latin1');
    await sql`
      INSERT INTO WorkReportM (RecordNo, TableName, ColumnName, WorkTypeGId, DoneByGId, Workdate, Mistake, Remark, alterTime)
      VALUES (${String(tid)}, 'Usecurity', 'Tid', 0, 0, CAST(GETDATE() AS date), ${`uname(a)~upwd(${enc})=2`},
        ${`uname(b)~upwd(${enc})=2`}, CAST(GETDATE() AS time))
    `.execute(h.trx);
    const report = await h.admin.get(`${API}/work-report/${tid}`);
    expect(report.status).toBe(200);
    const entry = (report.body as { Mistake: string; Remark: string }[]).find((r) =>
      r.Mistake.startsWith('uname(a)'),
    )!;
    expect(entry.Mistake).toBe('uname(a)~upwd(***)=2');
    expect(entry.Remark).toBe('uname(b)~upwd(***)=2');
  });
});
