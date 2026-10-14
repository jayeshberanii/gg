import type { GridRow, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Master › Prakashak Master (frmPrakashakMaster) through the master engine, rolled back after each test. */
describe.skipIf(!hasDb)('Prakashak Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/prakashak-master';
  const save = (id: number, fields: Record<string, unknown>) =>
    h.user.post(`${API}/save`).send({ id, fields });

  it('validates RefLibNo first, adds with the next recordno and composes txtPrakName', async () => {
    expect((await save(0, { prakname: 'x' })).body.message).toBe('Please Enter RefLibNo');
    expect((await save(0, { prakname: '', PrakMRefLibNoTran: 'r' })).body.message).toBe(
      'Please Enter Name',
    );

    const nextRecord = await h.scalar(sql`SELECT ISNULL(MAX(RecordNo), 0) + 1 AS n FROM prakmast`);
    const contact = await h.scalar(
      sql`SELECT TOP 1 Tid AS n FROM visheshMast WHERE Remark = N'contactnm'`,
    );
    const contactName = String(
      (
        await sql<{
          v: string;
        }>`SELECT Vishesh AS v FROM visheshMast WHERE Tid = ${contact}`.execute(h.trx)
      ).rows[0]!.v,
    );
    const book = await h.scalar(
      sql`SELECT TOP 1 tid AS n FROM BookT WHERE ISNULL(LibNo, '') <> ''`,
    );
    const added = await save(0, {
      prakname: 'વેબ પ્રકાશક',
      PrakMRefLibNoTran: 'r',
      'PrakMRefLibNoTran.Rows': [
        { PrakMRefLibNoKm: -1, BookTKt: book, Libno: 'x', RefPgNo: '5', Seq: 1 },
      ],
      Finished: 'True',
      'prakcontactTran.Rows': [
        {
          prakcontactkm: -2,
          contacttypekt: 0,
          contactkt: contact,
          Contact: contactName,
          IsPrint: true,
          seq: 1,
        },
      ],
      'PrakMAnayNmTran.Rows': [{ PrakMAnyNmKm: -3, AnyaNm: 'Alias', IsPrint: false, seq: 1 }],
      'SamvatTran.Rows': [
        {
          PrakMSamvatKm: -4,
          SamvatKindKt: 0,
          AsamvatKt: 2,
          Asamvat: '1990',
          Vksamvat: 1990,
          IsPrint: false,
          seq: 1,
        },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const id = added.body.id as number;
    const { rows } = await sql<{
      recordno: number;
      txtPrakName: string;
      Finished: boolean;
      vikramsmvt: number;
    }>`
      SELECT recordno, txtPrakName, Finished, vikramsmvt FROM prakmast WHERE prakcodekm = ${id}`.execute(
      h.trx,
    );
    expect(rows[0]).toEqual({
      recordno: nextRecord,
      txtPrakName: `વેબ પ્રકાશક,Cont(${contactName}),AName(Alias)`,
      Finished: true,
      vikramsmvt: 1990,
    });
    expect(
      await h.scalar(sql`SELECT COUNT(*) AS n FROM PrakMRefLibNoT WHERE PrakmastKt = ${id}`),
    ).toBe(1);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) AS n FROM prakContactT WHERE prakmastkt = ${id} AND IsPrint = 1`,
      ),
    ).toBe(1);

    // An edit without the popups keeps them and recomposes the name from the stored rows.
    const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
    expect(record).toMatchObject({ Finished: true, recordno: nextRecord });
    await save(id, {
      prakname: 'Edited',
      PrakMRefLibNoTran: 'r',
      Finished: 'True',
      recordno: String(nextRecord),
    });
    const { rows: again } = await sql<{ t: string; f: boolean }>`
      SELECT txtPrakName AS t, Finished AS f FROM prakmast WHERE prakcodekm = ${id}`.execute(h.trx);
    expect(again[0]).toEqual({ t: `Edited,Cont(${contactName}),AName(Alias)`, f: true });

    // RecordNo already used by another prakashak.
    const other = await h.scalar(
      sql`SELECT TOP 1 recordno AS n FROM prakmast WHERE recordno > 0 AND prakcodekm <> ${id}`,
    );
    const taken = await save(id, {
      prakname: 'Edited',
      PrakMRefLibNoTran: 'r',
      recordno: String(other),
    });
    expect(taken.body.message).toBe(`RecordNo ${other} is already in use`);
  });

  it('saves the nested authors and builds txtAuthor, then deletes with every child row', async () => {
    const type = await h.scalar(
      sql`SELECT TOP 1 authtycokm AS n FROM authtype WHERE ISNULL(authortype, '') <> '' AND ISNULL(authtyattr, '') <> authortype`,
    );
    const attr = String(
      (
        await sql<{
          a: string;
        }>`SELECT authortype AS a FROM authtype WHERE authtycokm = ${type}`.execute(h.trx)
      ).rows[0]!.a,
    );
    const author = await h.scalar(
      sql`SELECT TOP 1 authorcokm AS n FROM authmast WHERE ISNULL(authorname, '') <> ''`,
    );
    const added = await save(0, {
      prakname: 'with authors',
      PrakMRefLibNoTran: 'r',
      AuthTran: 'x',
      'AuthTran.Rows': [
        {
          PrakMastKt: 0,
          PrakMAuthorKm: -7,
          authortype: attr,
          authorname: 'A',
          BookTKt: 0,
          PageNo: '',
          Seq: 1,
        },
      ],
      'AuthTran.Extra': [
        {
          PrakMastKt: 0,
          PrakMAuthorAuthKm: 0,
          PrakMAuthorKt: -7,
          authorkt: author,
          authorname: 'A',
          AuthAnyaNmKt: 0,
          AnyaName: 'Anya A',
          padkt: 0,
          Padvi: '',
          Guru: '',
          identyty: '',
          signkt: 0,
          Sign: '',
          seq: 1,
        },
      ],
      'AuthTran.Extra2': [
        {
          PrakMastKt: 0,
          PrakMAuthorAuthTypeKm: 0,
          PrakMAuthorKt: -7,
          authortypekt: type,
          authortype: attr,
          signkt: 0,
          Sign: '',
          seq: 1,
        },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const id = added.body.id as number;
    const { rows } = await sql<{
      t: string;
    }>`SELECT txtAuthor AS t FROM prakmast WHERE prakcodekm = ${id}`.execute(h.trx);
    expect(rows[0]!.t).toBe(`${attr}-Anya A`);
    const grid = (await h.user.get(`${API}/trans/AuthTran/${id}`)).body as TransGrid;
    expect(grid.rows).toHaveLength(1);
    expect(grid.extras?.[0]?.rows.map((r) => r.authorkt)).toEqual([author]);
    expect(grid.extras?.[1]?.rows.map((r) => r.authortypekt)).toEqual([type]);
    const key = Number(grid.rows[0]!.PrakMAuthorKm);
    expect(grid.extras?.[0]?.rows[0]?.PrakMAuthorKt).toBe(key);

    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    for (const t of ['PrakMAuthorT', 'PrakMAuthorAuthT', 'PrakMAuthorAuthTypeT']) {
      expect(
        await h.scalar(sql`SELECT COUNT(*) AS n FROM ${sql.table(t)} WHERE PrakMastKt = ${id}`),
        t,
      ).toBe(0);
    }
  });

  it('runs the menu actions', async () => {
    const id = (await save(0, { prakname: 'menu', PrakMRefLibNoTran: 'r' })).body.id as number;
    const marked = await h.user.post(`${API}/action/mark-physically-checked`).send({ ids: [id] });
    expect(marked.body.message).toBe('Selected Records Marked Successfully');
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) AS n FROM prakmast WHERE prakcodekm = ${id} AND Exist = N'PC'`,
      ),
    ).toBe(1);

    const fin = await h.scalar(
      sql`SELECT TOP 1 ColumnMastkm AS n FROM columnmaster WHERE Vibhag = 'PrakMFin'`,
    );
    if (fin > 0) {
      const res = await h.user
        .post(`${API}/action/update-finance`)
        .send({ ids: [id], params: { financeKt: fin } });
      expect(res.body.message).toBe('Finance Updated in Selected Records');

      // The form's Finance box: shown with the record, kept by a save, cleared when blanked.
      const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
      expect(record.FinanceKt).toBe(fin);
      expect(String(record.FinanceName ?? '')).not.toBe('');
      // …and in the grid's Finance column (gridColumnsAlso; tblSearch does not flag it).
      const listed = (await h.user.post(`${API}/list`).send({ ids: [id] })).body as GridRow[];
      expect(listed[0]!.FinanceName).toBe(record.FinanceName);
      await save(id, { prakname: 'menu', PrakMRefLibNoTran: 'r', FinanceKt: String(fin) });
      expect(
        await h.scalar(
          sql`SELECT ISNULL(FinanceKt, 0) AS n FROM prakmast WHERE prakcodekm = ${id}`,
        ),
      ).toBe(fin);
      await save(id, { prakname: 'menu', PrakMRefLibNoTran: 'r', FinanceKt: '' });
      expect(
        await h.scalar(
          sql`SELECT ISNULL(FinanceKt, 0) AS n FROM prakmast WHERE prakcodekm = ${id}`,
        ),
      ).toBe(0);
    }
    const dup = await h.user
      .post(`${API}/action/duplicate-recno`)
      .send({ ids: [], params: { gridIds: [id] } });
    expect(dup.body).toMatchObject({ kind: 'table', columns: ['recordno'], rows: [] });
    const bad = await h.user
      .post(`${API}/action/print-contact`)
      .send({ ids: [], params: { range: '12' } });
    expect(bad.body.message).toBe('Please Enter ManualNo in Proper Format(Ex:1-100)');
    const active = await h.user.post(`${API}/action/show-active-only`).send({ ids: [] });
    expect((active.body.rows as GridRow[]).length).toBeGreaterThan(0);
    const none = await h.user.post(`${API}/action/in-use-author`).send({ ids: [id] });
    expect(none.body).toMatchObject({
      ids: [],
      emptyMessage: 'No Author Available for Current Selection',
    });
  });

  it('prints the Samvat column of a prakashak that has samvat rows', async () => {
    // tblSearch's own PrintColumn adds the int Vksamvat to the text and fails to convert.
    const row = (
      await sql<{ id: number; type: string | null; asamvat: string | null; vk: number | null }>`
        SELECT TOP 1 s.PrakMastKt AS id, m.samvatname AS type, s.Asamvat AS asamvat, s.Vksamvat AS vk
        FROM PrakMSamvatT s LEFT JOIN samvmast m ON m.samvatcokm = s.AsamvatKt
        WHERE s.Vksamvat > 0 AND ISNULL(s.Asamvat, '') <> '' ORDER BY s.PrakMastKt, s.seq`.execute(
        h.trx,
      )
    ).rows[0];
    if (!row) return;
    const meta = (await h.user.get(`${API}/meta`)).body;
    const samvat = meta.printColumns.find((c: { name: string }) => c.name === 'Samvat');
    expect(samvat).toBeDefined();
    const printed = await h.user
      .post(`${API}/print`)
      .send({ ids: [Number(row.id)], columnIndices: [samvat.index] });
    expect(printed.status).toBe(200);
    expect(printed.body.rows).toHaveLength(1);
    expect(String(printed.body.rows[0][0])).toContain(`${row.type ?? ''} ${row.asamvat} ${row.vk}`);
  });
});
