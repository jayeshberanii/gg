import type { GridRow, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Master › Column Master (frmColumnMaster) through the master engine, rolled back after each test. */
describe.skipIf(!hasDb)('Column Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/column-master';

  it('lets only admins, AMaster and users 20 / 50 change records', async () => {
    const list = (await h.user.post(`${API}/list`).send({ ids: [1, 2, 3] })).body as GridRow[];
    expect(list.length).toBeGreaterThan(0);
    const refused = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { Vibhag: 'x', Name: 'y' } });
    expect(refused.status).toBe(403);
    expect(
      (await h.user.post(`${API}/edit-lock/1`).set('Content-Type', 'application/json')).status,
    ).toBe(403);

    const amaster = await h.signIn(5);
    const ok = await amaster
      .post(`${API}/save`)
      .send({ id: 0, fields: { Vibhag: 'WebTest', Name: 'ok' } });
    expect(ok.status).toBe(200);
  });

  it('validates, adds, edits and keeps the up levels unless the popup is saved', async () => {
    expect(
      (await h.admin.post(`${API}/save`).send({ id: 0, fields: { Name: 'n' } })).body.message,
    ).toBe('Please Enter Vibhag');
    expect(
      (await h.admin.post(`${API}/save`).send({ id: 0, fields: { Vibhag: 'v' } })).body.message,
    ).toBe('Please Enter Name');

    const next = await h.scalar(
      sql`SELECT ISNULL(MAX(ColumnMastkm), 0) + 1 AS n FROM columnmaster`,
    );
    const parent = (
      await h.admin
        .post(`${API}/save`)
        .send({ id: 0, fields: { Vibhag: 'WebTest', Name: 'Parent' } })
    ).body.id as number;
    expect(parent).toBe(next);
    const added = await h.admin.post(`${API}/save`).send({
      id: 0,
      fields: {
        Vibhag: 'WebTest',
        Name: 'Child',
        ColumnNo: '12',
        IsPrint: true,
        'UplevelTran.Rows': [{ ColumnUplevelTranKm: 0, UplevelKt: parent, UplevelName: 'Parent' }],
      },
    });
    expect(added.status).toBe(200);
    const id = added.body.id as number;
    const record = (await h.admin.get(`${API}/record/${id}`)).body as GridRow;
    expect(record).toMatchObject({
      Name: 'Child',
      ColumnNo: 12,
      IsPrint: true,
      UplevelTran: 'Parent',
    });
    // INSQ writes a blank as ' '.
    expect(record.Brief).toBe(' ');

    // The popup's list is the columnmaster rows of the form's Vibhag (TranType).
    const list = (
      await h.admin
        .post(`${API}/trans/UplevelTran/lookup/uplevelname`)
        .send({ row: { TranType: 'WebTest' } })
    ).body as PickList;
    expect(list.rows.map((r) => r[1])).toEqual(expect.arrayContaining(['Parent', 'Child']));

    // An edit without the popup keeps ColumnUplevelTran (the desktop wiped it).
    await h.admin.post(`${API}/save`).send({ id, fields: { Vibhag: 'WebTest', Name: 'Child 2' } });
    const up = (await h.admin.get(`${API}/trans/UplevelTran/${id}`)).body as TransGrid;
    expect(up.rows.map((r) => r.UplevelKt)).toEqual([parent]);
  });

  it('refuses a second record with the same Name and Vibhag (v3.4.3.1)', async () => {
    const save = (id: number, fields: Record<string, unknown>) =>
      h.admin.post(`${API}/save`).send({ id, fields });
    const a = (await save(0, { Vibhag: 'WebDup', Name: 'Same' })).body.id as number;
    const again = await save(0, { Vibhag: ' WebDup ', Name: 'Same ' });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Recor Already Exist');
    // The same Name under another Vibhag is fine, until it is moved onto the first one's.
    const other = await save(0, { Vibhag: 'WebDup2', Name: 'Same' });
    expect(other.status).toBe(200);
    const moved = await save(other.body.id as number, { Vibhag: 'WebDup', Name: 'Same' });
    expect(moved.body.message).toBe('Recor Already Exist');
    expect((await save(a, { Vibhag: 'WebDup', Name: 'Same', Brief: 'b' })).status).toBe(200);
  });

  it('saves references, colours their rows, and never deletes', async () => {
    const id = (
      await h.admin.post(`${API}/save`).send({
        id: 0,
        fields: {
          Vibhag: 'WebTest',
          Name: 'Referenced',
          'ReferenceT1.Rows': [
            {
              RefrenceTkm: 0,
              Subhead: 'Sub',
              WordNm: 'W',
              Example: '',
              BookTKt: 0,
              BookTName: '',
              Refplacekt: 0,
              RefPlace: '',
              Pgno: '4',
              Seq: 1,
            },
          ],
        },
      })
    ).body.id as number;
    const refs = (await h.admin.get(`${API}/trans/ReferenceT1/${id}`)).body as TransGrid;
    expect(refs.rows.map((r) => [r.Subhead, r.Pgno])).toEqual([['Sub', '4']]);
    const [row] = (await h.admin.post(`${API}/list`).send({ ids: [id] })).body as GridRow[];
    expect(row).toMatchObject({ HasReference: true });
    expect((await h.admin.get(`${API}/record/${id}`)).body).toMatchObject({ HasReference: true });

    const del = await h.admin.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(del.status).toBe(403);
    expect((await h.admin.get(`${API}/record/${id}`)).status).toBe(200);

    const none = await h.admin.post(`${API}/action/vibhag-head`).send({ ids: [id] });
    expect(none.body).toMatchObject({
      kind: 'open',
      screen: 'kruti-master',
      ids: [],
      emptyMessage: 'No Records Found',
    });
  });
});
