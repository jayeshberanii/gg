import type { GridRow, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Library › Magazine Master (frmMagazineMaster) through the master engine, rolled back after each test. */
describe.skipIf(!hasDb)('Magazine Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/magazine-master';
  const count = (q: ReturnType<typeof sql<{ n: number }>>) => h.scalar(q);
  const firstId = (q: ReturnType<typeof sql<{ n: number }>>) => h.scalar(q);

  it('validates with the desktop message and rejects what the desktop INSERT would fail on', async () => {
    const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: { MName: '  ' } });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Please Enter Magazine Name');

    const series = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { MName: 'x', Series: 'BSX' + 'Y' } });
    expect(series.status).toBe(400);
    expect(series.body.message).toBe('Series cannot be longer than 3 characters');

    const remark = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { MName: 'x', SeriesRem: 'r'.repeat(51) } });
    expect(remark.body.message).toBe('Series Remark cannot be longer than 50 characters');

    const date = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        MName: 'x',
        SubscribeTran: 's',
        'SubscribeTran.Rows': [{ MagSubscribekm: 0, SubDate: '31/02/2024', PartyMkt: 0 }],
      },
    });
    expect(date.status).toBe(400);
    expect(date.body.message).toBe('SubDate "31/02/2024" is not a date (Ex-dd/MM/yyyy)');

    const ank = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        MName: 'x',
        BookTran: 'b',
        'BookTran.Rows': [{ MagBookmTKm: 0, bookmastkt: 1, MissingYr: 'y'.repeat(51) }],
      },
    });
    expect(ank.body.message).toBe('MissingYr cannot be longer than 50 characters');
  });

  it('adds with an identity key, its four popups, and shows the joined names', async () => {
    const sampraday = await firstId(
      sql<{ n: number }>`SELECT TOP 1 SampradayKm AS n FROM Sampraday ORDER BY SampradayKm`,
    );
    const mtype = await firstId(
      sql<{ n: number }>`SELECT TOP 1 ColumnMastkm AS n FROM columnmaster WHERE Vibhag = 'Mtype'`,
    );
    const book = await firstId(
      sql<{ n: number }>`SELECT TOP 1 BookMastkm AS n FROM BookM ORDER BY BookMastkm`,
    );
    const party = await firstId(
      sql<{ n: number }>`SELECT TOP 1 partyMkm AS n FROM PartyM ORDER BY partyMkm`,
    );
    const bhasha = await firstId(
      sql<{ n: number }>`SELECT TOP 1 bhashacokm AS n FROM bhasmast ORDER BY bhashacokm`,
    );
    const saved = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        MName: ' વેબ સામયિક ',
        Series: 'BS',
        SampradayKt: sampraday,
        MTypekt: mtype,
        samvatcokt: 2,
        FirstYr: '2050',
        FYearVK: '2050',
        CYearVK: '',
        AddressTran: 'a',
        'AddressTran.Rows': [
          { prakMAddkm: -3, PrakashakName: 'P', address: ' Line 1 ', citykt: 0, City: '', seq: 1 },
        ],
        BookTran: 'b',
        'BookTran.Rows': [
          {
            MagBookmTKm: 9999,
            BookName: 'x',
            MissingYr: ' 2001 ',
            MissingaAnk: '4',
            PSamvatVK: 0,
            bookmastkt: book,
          },
        ],
        SubscribeTran: 's',
        'SubscribeTran.Rows': [
          {
            MagSubscribekm: 0,
            SubDate: '05/01/2024',
            PartyMkt: party,
            PName: '',
            SType: 'Paid',
            SUptoYr: '2025',
            LavajamType: 'L',
            Amount: '150',
            Remark: 'r',
          },
        ],
        BhashaTran: 'h',
        'BhashaTran.Rows': [
          { MagazineKt: 0, MagBhashaKm: 0, BhashaKt: bhasha, bhashaname: '', Remark: '' },
        ],
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const id = saved.body.id as number;
    expect(id).toBeGreaterThan(0);
    expect(saved.body.row).toMatchObject({
      Magazinekm: id,
      MName: 'વેબ સામયિક',
      Series: 'BS',
      FYearVK: 2050,
    });
    expect(saved.body.row.SampradayName).toBeTruthy();
    expect(saved.body.row.MTypeName).toBeTruthy();
    expect(saved.body.row.txtBhasha).toBeTruthy();
    expect(saved.body.workReport).toBeUndefined();

    const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
    expect(record).toMatchObject({ samvatcokt: 2, enuser: expect.any(Number) });
    expect(record.endate).toBeTruthy();

    const books = (await h.user.get(`${API}/trans/BookTran/${id}`)).body as TransGrid;
    expect(books.rows).toHaveLength(1);
    expect(books.rows[0]).toMatchObject({ bookmastkt: book, MissingYr: '2001', MissingaAnk: '4' });
    expect(books.rows[0]!.MagBookmTKm).not.toBe(9999);
    const subs = (await h.user.get(`${API}/trans/SubscribeTran/${id}`)).body as TransGrid;
    expect(subs.rows[0]).toMatchObject({
      SubDate: '05/01/2024',
      PartyMkt: party,
      SType: 'Paid',
      Amount: 150,
    });
    const address = (await h.user.get(`${API}/trans/AddressTran/${id}`)).body as TransGrid;
    expect(address.rows[0]).toMatchObject({ PrakashakName: 'P', address: 'Line 1' });
    expect(
      await count(
        sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM PrakMAddT WHERE Magazinekt = ${id} AND PartyMKt = 0 AND StateKt = 0`,
      ),
    ).toBe(1);
    const bh = (await h.user.get(`${API}/trans/BhashaTran/${id}`)).body as TransGrid;
    expect(bh.rows).toHaveLength(1);
    // Add logs no work report.
    expect(
      await count(
        sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM WorkReportM WHERE TableName = 'MagazineM' AND RecordNo = ${String(id)}`,
      ),
    ).toBe(0);

    // Edit: boxes unchanged and no rows sent keep the children; an emptied box drops its rows;
    // re-sent rows replace them.
    const edited = await h.user.post(`${API}/save`).send({
      id,
      fields: {
        MName: 'edited',
        Series: 'B',
        SampradayKt: sampraday,
        AddressTran: 'unchanged',
        BookTran: '',
        SubscribeTran: 's',
        'SubscribeTran.Rows': [
          { MagSubscribekm: 1, SubDate: '', PartyMkt: 0, SType: 'Free', Amount: '', Remark: '' },
          {
            MagSubscribekm: 2,
            SubDate: '1/2/2023',
            PartyMkt: 0,
            SType: 'Free',
            Amount: '7',
            Remark: '',
          },
        ],
        BhashaTran: 'h',
      },
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.row).toMatchObject({ MName: 'edited', Series: 'B' });
    const n = (table: 'PrakMAddT' | 'MagBookmT' | 'MagSubscribeT' | 'MagBhashaT') =>
      count(
        sql<{ n: number }>`SELECT COUNT(*) AS n FROM ${sql.table(table)} WHERE Magazinekt = ${id}`,
      );
    expect(await n('PrakMAddT')).toBe(1);
    expect(await n('MagBookmT')).toBe(0);
    expect(await n('MagSubscribeT')).toBe(2);
    expect(await n('MagBhashaT')).toBe(1);
    const subs2 = (await h.user.get(`${API}/trans/SubscribeTran/${id}`)).body as TransGrid;
    expect(subs2.rows.map((r) => r.SubDate ?? '').sort()).toEqual(['', '01/02/2023']);
    const mod = await h.scalar(sql`SELECT moduser FROM MagazineM WHERE Magazinekm = ${id}`);
    expect(mod).toBeGreaterThan(0);
  });

  it('refuses a Locked record, and deletes a record with all four child tables', async () => {
    const book = await firstId(
      sql<{ n: number }>`SELECT TOP 1 BookMastkm AS n FROM BookM ORDER BY BookMastkm`,
    );
    const id = (
      await h.user.post(`${API}/save`).send({
        id: 0,
        fields: {
          MName: 'to delete',
          AddressTran: 'a',
          'AddressTran.Rows': [{ prakMAddkm: -1, address: 'a', seq: 1 }],
          BookTran: 'b',
          'BookTran.Rows': [{ MagBookmTKm: 0, bookmastkt: book, MissingYr: '', MissingaAnk: '' }],
          SubscribeTran: 's',
          'SubscribeTran.Rows': [{ MagSubscribekm: 0, SubDate: '', PartyMkt: 0 }],
          BhashaTran: 'h',
          'BhashaTran.Rows': [{ MagBhashaKm: 0, BhashaKt: 1, Remark: '' }],
        },
      })
    ).body.id as number;

    const wrong = await h.user.post(`${API}/delete`).send({ ids: [id], password: 'nope' });
    expect(wrong.status).toBe(401);

    const locked = await h.user
      .post(`${API}/lock`)
      .send({ ids: [id], lock: true, password: SECURITY });
    expect(locked.body.message).toBe('Locked Successfully in 1 Records');
    expect((await h.user.post(`${API}/save`).send({ id, fields: { MName: 'x' } })).status).toBe(
      403,
    );
    expect(
      (await h.user.post(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json')).status,
    ).toBe(403);
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(403);
    await h.user.post(`${API}/lock`).send({ ids: [id], lock: false, password: SECURITY });

    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    for (const table of [
      'PrakMAddT',
      'MagBookmT',
      'MagSubscribeT',
      'MagBhashaT',
      'MagazineM',
    ] as const) {
      const column = table === 'MagazineM' ? 'Magazinekm' : 'Magazinekt';
      expect(
        await count(
          sql<{
            n: number;
          }>`SELECT COUNT(*) AS n FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ${id}`,
        ),
      ).toBe(0);
    }
    // No work report on delete.
    expect(
      await count(
        sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM WorkReportM WHERE TableName = 'MagazineM' AND RecordNo = ${String(id)}`,
      ),
    ).toBe(0);
  });

  it('serves the popup lists, Send To and the Missing Ank report', async () => {
    const books = (await h.user.post(`${API}/trans/BookTran/lookup/bookname`).send({ row: {} }))
      .body as PickList;
    expect(books.columns).toEqual(['BookMastkm', 'BookName', 'PSamvatVK']);
    const stype = (await h.user.post(`${API}/trans/SubscribeTran/lookup/stype`).send({ row: {} }))
      .body as PickList;
    expect(stype.rows.map((r) => r[1])).toEqual(['Free', 'Paid']);
    const party = (await h.user.post(`${API}/trans/SubscribeTran/lookup/pname`).send({ row: {} }))
      .body as PickList;
    expect(party.columns).toEqual(['partyMkm', 'PName']);
    const bhasha = (
      await h.user.post(`${API}/trans/BhashaTran/lookup/bhashaname`).send({ row: {} })
    ).body as PickList;
    expect(bhasha.columns).toEqual(['bhashacokm', 'bhashaname']);

    const none = await h.user.post(`${API}/action/send-to-book`).send({ ids: [-1] });
    expect(none.body).toEqual({
      kind: 'open',
      screen: 'book-master',
      ids: [],
      emptyMessage: 'No Record Found',
    });
    const mag = await firstId(
      sql<{ n: number }>`SELECT TOP 1 MB.Magazinekt AS n FROM MagBookmT MB
        INNER JOIN BookT T ON MB.bookmastkt = T.BookMastkt
        INNER JOIN MagazineM M ON M.Magazinekm = MB.Magazinekt WHERE MB.bookmastkt > 0`,
    );
    const toBook = await h.user.post(`${API}/action/send-to-book`).send({ ids: [mag] });
    expect(toBook.body).toMatchObject({ kind: 'open', screen: 'book-master' });
    expect(toBook.body.ids.length).toBeGreaterThan(0);
    const toBookT = await h.user.post(`${API}/action/send-to-book-t`).send({ ids: [mag] });
    expect(toBookT.body).toMatchObject({ kind: 'open', screen: 'book-tran' });
    expect(toBookT.body.ids.length).toBeGreaterThan(0);

    const sampradays = (await h.user.get(`${API}/lists/missing-ank-sampraday`)).body as PickList;
    expect(sampradays.columns).toEqual(['SampradayKm', 'SampradayName']);
    const ids = sampradays.rows.map((r) => Number(r[0]));
    const report = await h.user
      .post(`${API}/action/missing-ank`)
      .send({ ids: [], params: { sampraday: ids } });
    expect(report.body).toMatchObject({
      kind: 'table',
      columns: [
        'Sampraday',
        'BookName',
        'txtBookTran',
        'MissingaAnk',
        'MissingYr',
        'PSamvatVK',
        'PubStatus',
      ],
    });
    const rows = report.body.rows as unknown[][];
    if (rows.length > 0) expect(rows[0]![0]).not.toBe('');
    const empty = await h.user.post(`${API}/action/missing-ank`).send({ ids: [], params: {} });
    expect(empty.body.rows).toEqual([]);
  });
});
