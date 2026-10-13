import type { GridRow, MasterMeta, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Master › Vishesh Master (frmVisheshMaster) through the master engine, rolled back after each test. */
describe.skipIf(!hasDb)('Vishesh Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/vishesh-master';
  const save = (id: number, fields: Record<string, unknown>) =>
    h.user.post(`${API}/save`).send({ id, fields });

  it('validates, adds with max + 1 and saves the popups', async () => {
    expect((await save(0, { Vishesh: ' ' })).body.message).toBe('Please Enter Name');

    const next = await h.scalar(sql`SELECT ISNULL(MAX(Tid), 0) + 1 AS n FROM visheshMast`);
    const author = await h.scalar(
      sql`SELECT TOP 1 authorcokm AS n FROM authmast ORDER BY authorcokm`,
    );
    const added = await save(0, {
      Vishesh: 'વેબ વિશેષ',
      remark: 'WebTest',
      VisheshNo: '7',
      VisheshAnyaNameTran: 'Alias',
      'VisheshAnyaNameTran.Rows': [{ VisheshAnyaNamekm: 0, AnyaName: 'Alias', Seq: 1 }],
      VisheshAdyaSthapakTran: 'x',
      'VisheshAdyaSthapakTran.Rows': [{ AuthorKt: author, AdyaSthapak: 'x', Seq: 1 }],
      'ReferenceT1.Rows': [
        {
          Subhead: 'S',
          WordNm: '',
          Example: '',
          BookTKt: 0,
          BookTName: '',
          Refplacekt: 0,
          Pgno: '2',
          Seq: 1,
        },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(added.body.id).toBe(next);
    const id = next;
    const tk = await h.scalar(
      sql`SELECT ISNULL(MAX(ColumnMastkm), 0) AS n FROM columnmaster WHERE Vibhag = 'TableNm' AND Name = 'visheshMast'`,
    );
    const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
    expect(record).toMatchObject({ Vishesh: 'વેબ વિશેષ', VisheshNo: 7, HasReference: true });
    const { rows: saved } = await sql<{
      t: string;
    }>`SELECT txtAnyaName AS t FROM visheshMast WHERE Tid = ${id}`.execute(h.trx);
    expect(saved[0]!.t).toBe('Alias');
    expect(
      ((await h.user.get(`${API}/trans/VisheshAnyaNameTran/${id}`)).body as TransGrid).rows.map(
        (r) => r.AnyaName,
      ),
    ).toEqual(['Alias']);
    expect(
      ((await h.user.get(`${API}/trans/VisheshAdyaSthapakTran/${id}`)).body as TransGrid).rows.map(
        (r) => r.AuthorKt,
      ),
    ).toEqual([author]);

    // A plain edit keeps the popups' rows.
    await save(id, { Vishesh: 'Edited', remark: 'WebTest' });
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM VisheshAnyaNameT WHERE VisheshKt = ${id}`),
    ).toBe(1);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) AS n FROM RefrenceT WHERE Tablekt = ${tk} AND RecordKt = ${id}`,
      ),
    ).toBeGreaterThan(0);

    // Re-saving the Adya Sthapak popup on an existing record replaces its rows.
    const author2 = await h.scalar(
      sql`SELECT TOP 1 authorcokm AS n FROM authmast WHERE authorcokm > ${author} ORDER BY authorcokm`,
    );
    const resaved = await save(id, {
      Vishesh: 'Edited',
      remark: 'WebTest',
      VisheshAdyaSthapakTran: 'y',
      'VisheshAdyaSthapakTran.Rows': [{ AuthorKt: author2, AdyaSthapak: 'y', Seq: 1 }],
    });
    expect(resaved.status, JSON.stringify(resaved.body)).toBe(200);
    expect(
      ((await h.user.get(`${API}/trans/VisheshAdyaSthapakTran/${id}`)).body as TransGrid).rows.map(
        (r) => r.AuthorKt,
      ),
    ).toEqual([author2]);

    // Delete takes the child rows with it.
    const refsBefore = await h.scalar(
      sql`SELECT COUNT(*) AS n FROM RefrenceT WHERE Tablekt = ${tk} AND RecordKt = ${id}`,
    );
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM VisheshAdyaSthapakT WHERE VisheshKt = ${id}`),
    ).toBe(0);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) AS n FROM RefrenceT WHERE Tablekt = ${tk} AND RecordKt = ${id}`,
      ),
    ).toBe(refsBefore - 1);
  });

  it('lists up levels by remark, updates the up level of a selection, and searches UplevelWithChild', async () => {
    const parent = (await save(0, { Vishesh: 'P', remark: 'WebTest' })).body.id as number;
    const child = (await save(0, { Vishesh: 'C', remark: 'WebTest', UplevelKt: parent })).body
      .id as number;
    const grandchild = (await save(0, { Vishesh: 'G', remark: 'WebTest' })).body.id as number;

    const sameRemark = (await h.user.get(`${API}/f2/UplevelKt?remark=WebTest&id=${child}`))
      .body as PickList;
    expect(sameRemark.columns).toEqual(['tid', 'vishesh']);
    expect(sameRemark.rows.map((r) => r[0]).sort()).toEqual([parent, child, grandchild].sort());
    const contacts = (await h.user.get(`${API}/f2/UplevelKt?remark=ContactNm&id=0`))
      .body as PickList;
    expect(contacts.columns).toEqual(['tid', 'vishesh', 'remark']);

    const choices = (await h.user.get(`${API}/f2/update-uplevel?ids=${grandchild}`))
      .body as PickList;
    expect(choices.rows.map((r) => r[0])).toContain(child);
    const updated = await h.user
      .post(`${API}/action/update-uplevel`)
      .send({ ids: [grandchild, child], params: { uplevelKt: child } });
    expect(updated.body).toEqual({ kind: 'message', message: 'Records Updated Successfully' });
    // Never its own up level.
    expect((await h.user.get(`${API}/record/${child}`)).body).toMatchObject({ UplevelKt: parent });
    expect((await h.user.get(`${API}/record/${grandchild}`)).body).toMatchObject({
      UplevelKt: child,
    });

    const meta = (await h.user.get(`${API}/meta`)).body as MasterMeta;
    const col = meta.searchColumns.find((c) => c.displayName === 'UplevelWithChild')!;
    const values = (
      await h.user
        .post(`${API}/search-values`)
        .send({ columnId: col.id, scope: 'all', gridIds: [] })
    ).body as PickList;
    expect(values.rows.map((r) => r[0])).toContain(parent);
    const found = (
      await h.user.post(`${API}/search`).send({
        columnId: col.id,
        scope: 'all',
        gridIds: [],
        notIn: false,
        values: [String(parent)],
        text: '',
      })
    ).body as GridRow[];
    expect(found.map((r) => r.Tid).sort()).toEqual([child, grandchild].sort());

    const tree = (await h.user.get(`${API}/lists/tree`)).body as PickList;
    expect(tree.columns).toEqual(['Tid', 'Vishesh', 'Uplevelkt']);
    const list = (await h.user.post(`${API}/list`).send({ ids: [child] })).body as GridRow[];
    expect(Object.keys(list[0]!)).toEqual(
      expect.arrayContaining(['UplevelName', 'txtAdyaSthapak', 'Count']),
    );
  });
});
