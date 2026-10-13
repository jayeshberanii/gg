import type { GridRow, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Master › Vishay Master (frmVishayMaster) through the master engine, rolled back after each test. */
describe.skipIf(!hasDb)('Vishay Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/vishay-master';
  const save = (id: number, fields: Record<string, unknown>) =>
    h.user.post(`${API}/save`).send({ id, fields });

  it('adds with the inserted identity and saves the popups on that subject', async () => {
    expect((await save(0, { vishay_nm: '' })).body.message).toBe('Please Enter Vishay Name');

    const previous = await h.scalar(sql`SELECT MAX(vishaycokm) AS n FROM Vishay`);
    const other = await h.scalar(sql`SELECT TOP 1 vishaycokm AS n FROM Vishay ORDER BY vishaycokm`);
    const added = await save(0, {
      vishay_nm: 'વેબ વિષય',
      brif: 'b',
      'AnyaNameTran.Rows': [
        { VishayAnyaNameKm: -1, AnyaName: 'Alias A', Seq: 1 },
        { VishayAnyaNameKm: -2, AnyaName: 'Alias B', Seq: 2 },
      ],
      'MeaningTran.Rows': [{ VishayMeaningKm: -3, Meaning: 'M', Seq: 1 }],
      'EnglishAnyaNameTran.Rows': [
        { VishayEnglishAnyaNameKm: -4, EnglishNameKt: other, EnglishName: 'Eng', Seq: 1 },
      ],
      'HindiAnyaNameTran.Rows': [
        { VishayHindiAnyaNameKm: 0, HindiNameKt: other, HindiName: 'Hin', Seq: 1 },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const id = added.body.id as number;
    expect(id).toBeGreaterThan(previous);
    expect(added.body.row).toMatchObject({ vishaycokm: id, vishay_nm: 'વેબ વિષય' });

    const { rows } = await sql<{
      AnyaName: string;
      EnglishAnyaName: string;
      HIndiAnyaName: string;
    }>`
      SELECT AnyaName, EnglishAnyaName, HIndiAnyaName FROM Vishay WHERE vishaycokm = ${id}`.execute(
      h.trx,
    );
    expect(rows[0]).toEqual({
      AnyaName: 'Alias A, Alias B',
      EnglishAnyaName: 'Eng',
      HIndiAnyaName: 'Hin',
    });
    // Nothing went to the previous subject (the desktop's MAX-before-insert bug).
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) AS n FROM VishayAnyaNameT WHERE VishayKt = ${previous} AND AnyaName LIKE 'Alias %'`,
      ),
    ).toBe(0);
    // A Hindi row with key 0 is inserted, not lost.
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM VishayHindiAnyaNameT WHERE VishayKt = ${id}`),
    ).toBe(1);

    // Edit one anya name and drop the other.
    const anya = (await h.user.get(`${API}/trans/AnyaNameTran/${id}`)).body as TransGrid;
    await save(id, {
      vishay_nm: 'વેબ વિષય',
      'AnyaNameTran.Rows': [{ ...anya.rows[0], AnyaName: 'Alias A2' }],
    });
    const after = (await h.user.get(`${API}/trans/AnyaNameTran/${id}`)).body as TransGrid;
    expect(after.rows.map((r) => r.AnyaName)).toEqual(['Alias A2']);
    const { rows: again } = await sql<{
      a: string;
    }>`SELECT AnyaName AS a FROM Vishay WHERE vishaycokm = ${id}`.execute(h.trx);
    expect(again[0]!.a).toBe('Alias A2');
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM VishayMeaningT WHERE VishayKt = ${id}`),
    ).toBe(1);
  });

  it('refuses a name another subject already has, on add and on edit (v3.4.3.1)', async () => {
    const a = (await save(0, { vishay_nm: 'વેબ ડુપ્લિકેટ A' })).body.id as number;
    const b = (await save(0, { vishay_nm: 'વેબ ડુપ્લિકેટ B' })).body.id as number;
    const again = await save(0, { vishay_nm: ' વેબ ડુપ્લિકેટ A ' });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Vishay Name - વેબ ડુપ્લિકેટ A Already Exist');
    const renamed = await save(b, { vishay_nm: 'વેબ ડુપ્લિકેટ A' });
    expect(renamed.status).toBe(400);
    expect(renamed.body.message).toBe('Vishay Name - વેબ ડુપ્લિકેટ A Already Exist');
    // A record keeps its own name.
    expect((await save(a, { vishay_nm: 'વેબ ડુપ્લિકેટ A', brif: 'x' })).status).toBe(200);
  });

  it('replaces references instead of doubling them', async () => {
    const tk = await h.scalar(
      sql`SELECT ISNULL(MAX(ColumnMastkm), 0) AS n FROM columnmaster WHERE Vibhag = 'TableNm' AND Name = 'Vishay'`,
    );
    const ref = {
      Subhead: 'S',
      WordNm: '',
      Example: '',
      BookTKt: 0,
      BookTName: '',
      Refplacekt: 0,
      Pgno: '1',
      Seq: 1,
    };
    const id = (await save(0, { vishay_nm: 'refs', 'ReferenceT1.Rows': [ref] })).body.id as number;
    await save(id, { vishay_nm: 'refs', 'ReferenceT1.Rows': [ref] });
    await save(id, { vishay_nm: 'refs 2' });
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) AS n FROM RefrenceT WHERE Tablekt = ${tk} AND RecordKt = ${id}`,
      ),
    ).toBe(1);
    expect((await h.user.get(`${API}/record/${id}`)).body).toMatchObject({ HasReference: true });
  });

  it('refuses to delete a subject in use and lists where it is', async () => {
    const { rows } = await sql<{
      id: number;
    }>`SELECT TOP 1 vishaykt AS id FROM krutivishayT WHERE vishaykt > 0`.execute(h.trx);
    if (rows[0]) {
      const refused = await h.user
        .post(`${API}/delete`)
        .send({ ids: [rows[0].id], password: SECURITY });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toMatch(/^Record is in used in below forms\r\n/);
      expect(refused.body.message).toContain('- कृति विषय');
    }
    const free = (await save(0, { vishay_nm: 'web free subject' })).body.id as number;
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [free], password: SECURITY })).status,
    ).toBe(204);

    const counted = await h.user
      .post(`${API}/action/update-count`)
      .send({ ids: [rows[0]?.id ?? 1] });
    expect(counted.body).toMatchObject({
      kind: 'refreshed',
      message: 'Records Updated Successfully',
    });
    const none = await h.user.post(`${API}/action/in-use-kruti`).send({ ids: [free] });
    expect(none.body).toMatchObject({
      kind: 'open',
      ids: [],
      emptyMessage: 'No Kruti Available For Current Selection',
    });
    const list = (await h.user.post(`${API}/list`).send({ ids: [rows[0]?.id ?? 1] }))
      .body as GridRow[];
    expect(Object.keys(list[0] ?? {})).toEqual(
      expect.arrayContaining(['vishay_nm', 'uplevalName', 'counters']),
    );
  });
});
