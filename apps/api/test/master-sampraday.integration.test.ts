import type { GridRow, MasterMeta, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Master › Sampraday Master (frmSampraday) through the master engine, rolled back after each test. */
describe.skipIf(!hasDb)('Sampraday Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/sampraday-master';
  const save = (id: number, fields: Record<string, unknown>) =>
    h.user.post(`${API}/save`).send({ id, fields });

  it('validates, refuses a duplicate name, and saves all eight popups', async () => {
    expect((await save(0, { SampradayName: ' ' })).body.message).toBe('Please Enter Name');
    const existing = String(
      (
        await sql<{
          n: string;
        }>`SELECT TOP 1 SampradayName AS n FROM Sampraday WHERE ISNULL(SampradayName, '') <> ''`.execute(
          h.trx,
        )
      ).rows[0]!.n,
    );
    expect((await save(0, { SampradayName: existing })).body.message).toBe('Name Already Exist');

    const author = await h.scalar(
      sql`SELECT TOP 1 authorcokm AS n FROM authmast ORDER BY authorcokm`,
    );
    const city = await h.scalar(sql`SELECT TOP 1 Tid AS n FROM visheshMast WHERE remark = 'City'`);
    const saved = await save(0, {
      SampradayName: 'વેબ સંપ્રદાય',
      ShortNm: 'WS',
      SampradayAnyaNameTran: 'Alias',
      'SampradayAnyaNameTran.Rows': [
        { SampradayAnyaNameKm: 0, AnyaName: 'Alias', BookTKt: 0, LibNo: '', Page: '3', Seq: 1 },
      ],
      'SampradayAdyaSthapakTran.Rows': [
        { SampradayAdyaSthapakKm: 0, AuthorKt: author, AdyaSthapak: 'x', Seq: 1 },
      ],
      'SampradayReferenceTran.Rows': [
        {
          SampradayReferenceKm: 0,
          BookTKt: 0,
          LibNo: '',
          RefPlaceKt: 0,
          RefPlaceName: '',
          RefPgNo: '9',
          Remark: 'r',
          Seq: 1,
        },
      ],
      'SampradayNoteTran.Rows': [
        {
          SampradayNoteKm: 0,
          NoteTypeKt: 0,
          NoteTypeName: '',
          Notes: 'n',
          BookTKt: 0,
          LibNo: '',
          PageNo: '',
          Seq: 1,
        },
      ],
      'SampradaySamvatTran.Rows': [
        {
          SampradaySamvatKm: 0,
          SamvatTypeKt: 0,
          SamvatTypeName: '',
          Samvat: '1200',
          SamvatVK: 1200,
          BookTKt: 0,
          LibNo: '',
          PageNo: '',
          Seq: 1,
        },
      ],
      'SampradayBriefTran.Rows': [
        { SampradayBriefKm: 0, Brief: 'b', BookTKt: 0, LibNo: '', PageNo: '', Seq: 1 },
      ],
      'SampradayRemarkTran.Rows': [
        { SampradayRemarkKm: 0, Remark: 'rm', BookTKt: 0, LibNo: '', PageNo: '', Seq: 1 },
      ],
      'SampradaySthalTran.Rows': [
        {
          SampradaySthalKm: 0,
          SthalKt: city,
          Sthal: 'c',
          BookTKt: 0,
          LibNo: '',
          PageNo: '',
          Seq: 1,
        },
      ],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const id = saved.body.id as number;
    expect(id).toBe(await h.scalar(sql`SELECT MAX(SampradayKm) AS n FROM Sampraday`));
    for (const t of [
      'SampradayAnyaNameT',
      'SampradayAdyaSthapakT',
      'SampradayReferenceT',
      'SampradayNoteT',
      'SampradaySamvatT',
      'SampradayBriefT',
      'SampradayRemarkT',
      'SampradaySthalT',
    ]) {
      expect(
        await h.scalar(sql`SELECT COUNT(*) AS n FROM ${sql.table(t)} WHERE SampradayKt = ${id}`),
        t,
      ).toBe(1);
    }
    const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
    expect(record).toMatchObject({
      SampradayName: 'વેબ સંપ્રદાય',
      txtAnyaName: 'Alias',
      SampradayBriefTran: 'b',
    });

    // Upsert: edit the brief, add a remark row, keep the rest.
    const brief = (await h.user.get(`${API}/trans/SampradayBriefTran/${id}`)).body as TransGrid;
    await save(id, {
      SampradayName: 'વેબ સંપ્રદાય',
      'SampradayBriefTran.Rows': [{ ...brief.rows[0], Brief: 'b2' }],
    });
    const after = (await h.user.get(`${API}/trans/SampradayBriefTran/${id}`)).body as TransGrid;
    expect(after.rows.map((r) => [r.SampradayBriefKm, r.Brief])).toEqual([
      [brief.rows[0]!.SampradayBriefKm, 'b2'],
    ]);
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM SampradayNoteT WHERE SampradayKt = ${id}`),
    ).toBe(1);

    // Delete takes every popup's rows with it.
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM SampradaySthalT WHERE SampradayKt = ${id}`),
    ).toBe(0);
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM SampradayNoteT WHERE SampradayKt = ${id}`),
    ).toBe(0);
  });

  it('updates up levels and LinkWithSadi, searches UplevelWithChild, and finds authors', async () => {
    const parent = (await save(0, { SampradayName: 'Zz web parent' })).body.id as number;
    const child = (await save(0, { SampradayName: 'Zz web child' })).body.id as number;
    const up = await h.user
      .post(`${API}/action/update-uplevel`)
      .send({ ids: [child, parent], params: { uplevelKt: parent } });
    expect(up.body).toEqual({ kind: 'message', message: 'Records Updated Successfully' });
    expect((await h.user.get(`${API}/record/${child}`)).body).toMatchObject({ UplevelKt: parent });
    expect((await h.user.get(`${API}/record/${parent}`)).body.UplevelKt ?? 0).not.toBe(parent);
    await h.user
      .post(`${API}/action/update-uplevel1`)
      .send({ ids: [child], params: { uplevelKt: parent } });
    expect((await h.user.get(`${API}/record/${child}`)).body).toMatchObject({ Uplevel1Kt: parent });

    const sadi = await h.scalar(
      sql`SELECT TOP 1 ColumnMastKm AS n FROM columnmaster WHERE Vibhag = 'LinkWithSadi'`,
    );
    if (sadi > 0) {
      const linked = await h.user
        .post(`${API}/action/set-link-with-sadi`)
        .send({ ids: [child], params: { linkedSadiKt: sadi } });
      expect(linked.body.message).toBe('Total (1) records updated successfully');
    }

    const meta = (await h.user.get(`${API}/meta`)).body as MasterMeta;
    const col = meta.searchColumns.find((c) => c.displayName === 'UplevelWithChild')!;
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
    expect(found.map((r) => r.SampradayKm)).toEqual([child]);

    expect(((await h.user.get(`${API}/f2/UplevelKt`)).body as PickList).columns).toEqual([
      'SampradayKm',
      'SampradayName',
    ]);
    const tree = (await h.user.get(`${API}/lists/tree`)).body as PickList;
    expect(tree.columns).toEqual(['SampradayKm', 'SampradayName', 'Uplevelkt']);

    const { rows } = await sql<{
      id: number;
    }>`SELECT TOP 1 Sampradaykt AS id FROM authmast WHERE Sampradaykt > 0`.execute(h.trx);
    if (rows[0]) {
      const own = await h.user
        .post(`${API}/action/in-use-author`)
        .send({ ids: [rows[0].id], params: { mode: 'own' } });
      expect(own.body).toMatchObject({ kind: 'open', screen: 'author-master' });
      expect(own.body.ids.length).toBeGreaterThan(0);
    }
    const none = await h.user.post(`${API}/action/in-use-magazine`).send({ ids: [child] });
    expect(none.body).toMatchObject({ ids: [], emptyMessage: 'No Records Found' });
  });
  it('searches a popup column with F3 "Not In": records with other rows and with none (UcSearch v3.4.3.1)', async () => {
    const authors = (
      await sql<{
        id: number;
      }>`SELECT TOP 2 authorcokm AS id FROM authmast ORDER BY authorcokm`.execute(h.trx)
    ).rows.map((r) => Number(r.id));
    const add = async (name: string, author?: number) => {
      const res = await save(0, {
        SampradayName: name,
        ...(author
          ? {
              'SampradayAdyaSthapakTran.Rows': [
                { SampradayAdyaSthapakKm: 0, AuthorKt: author, AdyaSthapak: 'x', Seq: 1 },
              ],
            }
          : {}),
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return res.body.id as number;
    };
    const withFirst = await add('zq-notin-first', authors[0]);
    const withSecond = await add('zq-notin-second', authors[1]);
    const withNone = await add('zq-notin-none');

    const meta = (await h.user.get(`${API}/meta`)).body as MasterMeta;
    const col = meta.searchColumns.find((c) => c.columnName === 'SampradayAdyaSthapakTran')!;
    const search = async (notIn: boolean) =>
      (
        (
          await h.user.post(`${API}/search`).send({
            columnId: col.id,
            scope: 'all',
            gridIds: [],
            notIn,
            values: [String(authors[0])],
            text: '',
          })
        ).body as GridRow[]
      ).map((r) => Number(r.SampradayKm));

    const inIds = await search(false);
    expect(inIds).toContain(withFirst);
    expect(inIds).not.toContain(withSecond);
    expect(inIds).not.toContain(withNone);

    const notInIds = await search(true);
    expect(notInIds).not.toContain(withFirst);
    expect(notInIds).toContain(withSecond);
    // The old two-clause form left out a record with no founder row at all.
    expect(notInIds).toContain(withNone);
    // Together the two searches are the whole table.
    const total = await h.scalar(sql`SELECT COUNT(*) FROM Sampraday`);
    expect(inIds.length + notInIds.length).toBe(total);
  });
});
