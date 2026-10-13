import type { GridRow, PickList, PrintDocument, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { BHET_DEFAULT_LETTER, DEMAND_DEFAULT_LETTER } from '../src/master/screens/letter-common.js';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Issue › Letter Bhet (frmLetterBhetM) and Letter Demand (frmLetterDemandM) through the master
 * engine, rolled back after every test: validation, LetterNo and the new-record defaults, the
 * LetterBookT lines (by TransactionName), delete, the F2 lists and the right-click actions,
 * including the print documents.
 */
describe.skipIf(!hasDb)('Letter Bhet / Letter Demand via the master engine (integration)', () => {
  const h = useMasterHarness();
  const BHET = '/api/master/letter-bhet';
  const DEMAND = '/api/master/letter-demand';
  const scalar = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  const bhetType = () =>
    scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 ColumnMastkm AS v FROM columnmaster WHERE Vibhag = 'LbhetType' ORDER BY ColumnMastkm`,
    );
  const letterType = () =>
    scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 ColumnMastkm AS v FROM columnmaster WHERE Vibhag = 'lettertype' ORDER BY ColumnMastkm`,
    );

  async function meId(agent: typeof h.user): Promise<number> {
    return (await agent.get('/api/auth/me')).body.user.id as number;
  }

  /** The record's book lines under one TransactionName. */
  async function lines(table: string, id: number) {
    return (
      await sql<{ BookName: string; Nakal: number }>`
        SELECT BookName, Nakal FROM LetterBookT WHERE TransactionKt = ${id} AND TransactionName = ${table}
        ORDER BY LetterBookKm`.execute(h.trx)
    ).rows;
  }

  const bhet = (type: number) => ({
    LetterDate: '2026-10-03',
    LetterNo: '7001',
    BhetTypekt: type,
    PartyName: ' zq-letter party ',
    party_add: 'Addr 1',
    MobileNo: '9876543210',
    Vishay: 'zq vishay',
    Letter: 'line one\nline two\n',
    inwordkt: 0,
    BookTran: '',
  });

  it('is open to every user and lists the Designer columns of both screens', async () => {
    const b = await h.user.post(`${BHET}/list`).send({});
    expect(b.status).toBe(200);
    const row = (b.body as GridRow[])[0]!;
    for (const c of [
      'LetterBhetMkm',
      'LetterNo',
      'LetterDate',
      'PartyName',
      'party_add',
      'MobileNo',
      'BhetTypeName',
      'Vishay',
      'InwordName',
    ])
      expect(row).toHaveProperty(c);
    const d = await h.user.post(`${DEMAND}/list`).send({});
    expect(d.status).toBe(200);
    const drow = (d.body as GridRow[])[0]!;
    for (const c of [
      'LetterDemandMkm',
      'ConcernedPersonName',
      'LetterTypeName',
      'PagesAttached',
      'NextReminderDt',
      'StatusTypeName',
      'WorkGivenMName',
      'MagazineName',
    ])
      expect(drow).toHaveProperty(c);
  });

  it('validates with the desktop messages, and refuses overflows', async () => {
    const type = await bhetType();
    const save = (fields: object) => h.user.post(`${BHET}/save`).send({ id: 0, fields });
    expect((await save({ ...bhet(type), BhetTypekt: 0 })).body.message).toBe(
      'Please Enter Bhet Type',
    );
    expect((await save({ ...bhet(type), PartyName: '  ' })).body.message).toBe(
      'Please Enter Party Name',
    );
    expect((await save({ ...bhet(type), PartyName: 'p'.repeat(51) })).body.message).toBe(
      'Party Name cannot be longer than 50 characters',
    );
    expect((await save({ ...bhet(type), MobileNo: '+91 98765 43210' })).body.message).toBe(
      'Mobile No cannot be longer than 10 characters',
    );
    expect((await save({ ...bhet(type), LetterNo: '99999999999' })).body.message).toBe(
      'Letter No is too large',
    );

    const lt = await letterType();
    const dsave = (fields: object) => h.user.post(`${DEMAND}/save`).send({ id: 0, fields });
    expect((await dsave({ LetterTypekt: 0, PartyName: 'x' })).body.message).toBe(
      'Please Enter Letter Type',
    );
    expect((await dsave({ LetterTypekt: lt, PartyName: '' })).body.message).toBe(
      'Please Enter Party Name',
    );
    expect(
      (await dsave({ LetterTypekt: lt, PartyName: 'x', StatusRemark: 's'.repeat(151) })).body
        .message,
    ).toBe('Status Remark cannot be longer than 150 characters');
  });

  it('starts a new letter with today, the next LetterNo and the default letter', async () => {
    const today = (
      await sql<{ d: string }>`SELECT CONVERT(varchar(10), GETDATE(), 23) AS d`.execute(h.trx)
    ).rows[0]!.d;
    const nextBhet = await scalar(
      sql<{ v: number }>`SELECT ISNULL(MAX(LetterNo), 0) + 1 AS v FROM LetterbhetM`,
    );
    expect((await h.user.get(`${BHET}/new-defaults`)).body).toEqual({
      LetterDate: today,
      LetterNo: nextBhet,
      Letter: BHET_DEFAULT_LETTER,
    });
    expect(BHET_DEFAULT_LETTER.startsWith('सादर प्रणाम,\r\n')).toBe(true);
    expect(BHET_DEFAULT_LETTER.endsWith('है ।\r\n')).toBe(true);
    const nextDemand = await scalar(
      sql<{ v: number }>`SELECT ISNULL(MAX(LetterNo), 0) + 1 AS v FROM LetterDemandM`,
    );
    const d = (await h.user.get(`${DEMAND}/new-defaults`)).body;
    expect(d).toEqual({ LetterDate: today, LetterNo: nextDemand, Letter: DEMAND_DEFAULT_LETTER });
    // The glued pieces are kept verbatim.
    expect(DEMAND_DEFAULT_LETTER).toContain('धर्मतीर्थसंरक्षक,गच्छाधिपति');
    expect(DEMAND_DEFAULT_LETTER.endsWith('विनंती है ।')).toBe(true);
  });

  it('saves the letter and its book lines in one round trip, by TransactionName', async () => {
    const type = await bhetType();
    const me = await meId(h.user);
    const added = await h.user.post(`${BHET}/save`).send({
      id: 0,
      fields: {
        ...bhet(type),
        BookTran: 'Book A-2,Book B',
        'BookTran.Rows': [
          { LetterBookKm: -1, BookName: ' Book A ', Nakal: '2' },
          { LetterBookKm: -2, BookName: 'Book B', Nakal: null },
          { LetterBookKm: -3, BookName: '', Nakal: null },
        ],
      },
    });
    expect(added.status).toBe(200);
    const id = added.body.id as number;
    expect(added.body.row).toMatchObject({ PartyName: 'zq-letter party', LetterNo: 7001 });
    const [row] = (
      await sql<{
        d: string;
        party: string;
        letter: string;
        enuser: number;
        endate: Date | null;
      }>`SELECT CONVERT(varchar(10), LetterDate, 23) AS d, PartyName AS party, Letter AS letter,
            enuser, endate FROM LetterbhetM WHERE LetterBhetMkm = ${id}`.execute(h.trx)
    ).rows;
    // Letter: saved untrimmed, with the desktop's CRLF line breaks.
    expect(row).toMatchObject({
      d: '2026-10-03',
      party: 'zq-letter party',
      letter: 'line one\r\nline two\r\n',
      enuser: me,
    });
    expect(row!.endate).not.toBeNull();
    // The blank row is dropped; a blank Nakal is 0.
    expect(await lines('LetterBhetM', id)).toEqual([
      { BookName: 'Book A', Nakal: 2 },
      { BookName: 'Book B', Nakal: 0 },
    ]);
    const record = (await h.user.get(`${BHET}/record/${id}`)).body as GridRow;
    expect(record.BookTran).toBe('Book A,Book B');

    // The popup lists only this letter's lines, not a Demand line with the same TransactionKt.
    await sql`INSERT INTO LetterBookT (TransactionKt, TransactionName, BookName, Nakal)
      VALUES (${id}, 'LetterDemandM', 'zq demand line', 1)`.execute(h.trx);
    const grid = (await h.user.get(`${BHET}/trans/BookTran/${id}`)).body as TransGrid;
    expect(grid.columns.map((c) => c.name)).toEqual(['LetterBookKm', 'BookName', 'Nakal']);
    expect(grid.rows.map((r) => r.BookName)).toEqual(['Book A', 'Book B']);

    // The box still reads as loaded: the rows are not rewritten, even when sent.
    const same = await h.user.post(`${BHET}/save`).send({
      id,
      fields: {
        ...bhet(type),
        BookTran: 'Book A,Book B',
        'BookTran.Rows': [{ LetterBookKm: -1, BookName: 'Ignored', Nakal: 1 }],
      },
    });
    expect(same.status).toBe(200);
    expect((await lines('LetterBhetM', id)).map((l) => l.BookName)).toEqual(['Book A', 'Book B']);
    const [mod] = (
      await sql<{
        moduser: number;
      }>`SELECT moduser FROM LetterbhetM WHERE LetterBhetMkm = ${id}`.execute(h.trx)
    ).rows;
    expect(mod!.moduser).toBe(me);

    // A changed summary: delete-then-insert.
    await h.user.post(`${BHET}/save`).send({
      id,
      fields: {
        ...bhet(type),
        BookTran: 'Book C-3',
        'BookTran.Rows': [{ LetterBookKm: 5, BookName: 'Book C', Nakal: 3 }],
      },
    });
    expect(await lines('LetterBhetM', id)).toEqual([{ BookName: 'Book C', Nakal: 3 }]);

    // A failing save leaves the lines alone (the desktop had already deleted them).
    const tooLong = await h.user.post(`${BHET}/save`).send({
      id,
      fields: {
        ...bhet(type),
        BookTran: 'x',
        'BookTran.Rows': [{ LetterBookKm: -1, BookName: 'x'.repeat(2001), Nakal: 1 }],
      },
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toBe('Book Name cannot be longer than 2000 characters');
    expect(await lines('LetterBhetM', id)).toEqual([{ BookName: 'Book C', Nakal: 3 }]);

    // An empty box deletes every line (DeleteTransaction), popup opened or not.
    await h.user.post(`${BHET}/save`).send({ id, fields: { ...bhet(type), BookTran: '' } });
    expect(await lines('LetterBhetM', id)).toEqual([]);
    expect(await lines('LetterDemandM', id)).toEqual([{ BookName: 'zq demand line', Nakal: 1 }]);
  });

  it('saves a Demand letter with its own fields and lines', async () => {
    const lt = await letterType();
    const me = await meId(h.user);
    const res = await h.user.post(`${DEMAND}/save`).send({
      id: 0,
      fields: {
        LetterDate: '2026-10-04',
        LetterNo: '55',
        LetterTypekt: lt,
        PartyName: ' zq demand ',
        PartyAddress: 'addr',
        Vishay: 'v',
        Letter: '  body  ',
        PagesAttached: '3',
        FollowUpRem: 'f',
        NextReminderDt: '2026-11-01',
        StatusRemark: 's',
        BookTran: 'Wanted-2',
        'BookTran.Rows': [{ LetterBookKm: -1, BookName: 'Wanted', Nakal: '2' }],
      },
    });
    expect(res.status).toBe(200);
    const id = res.body.id as number;
    const [row] = (
      await sql<{
        letter: string;
        pages: number;
        next: string;
        enuser: number;
      }>`SELECT Letter AS letter, PagesAttached AS pages, CONVERT(varchar(10), NextReminderDt, 23) AS next, enuser
          FROM LetterDemandM WHERE LetterDemandMkm = ${id}`.execute(h.trx)
    ).rows;
    // Demand saves the letter trimmed.
    expect(row).toEqual({ letter: 'body', pages: 3, next: '2026-11-01', enuser: me });
    expect(await lines('LetterDemandM', id)).toEqual([{ BookName: 'Wanted', Nakal: 2 }]);
    expect(await lines('LetterBhetM', id)).toEqual([]);
  });

  it('deletes a letter with its own book lines only, behind the Security password', async () => {
    const type = await bhetType();
    const id = (
      await h.user.post(`${BHET}/save`).send({
        id: 0,
        fields: {
          ...bhet(type),
          BookTran: 'Del',
          'BookTran.Rows': [{ LetterBookKm: -1, BookName: 'Del', Nakal: 1 }],
        },
      })
    ).body.id as number;
    await sql`INSERT INTO LetterBookT (TransactionKt, TransactionName, BookName, Nakal)
      VALUES (${id}, 'LetterDemandM', 'keep me', 1)`.execute(h.trx);
    expect(
      (await h.user.post(`${BHET}/delete`).send({ ids: [id], password: 'wrong' })).status,
    ).not.toBe(204);
    expect(
      (await h.user.post(`${BHET}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    expect(
      await scalar(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM LetterbhetM WHERE LetterBhetMkm = ${id}`,
      ),
    ).toBe(0);
    expect(await lines('LetterBhetM', id)).toEqual([]);
    expect(await lines('LetterDemandM', id)).toEqual([{ BookName: 'keep me', Nakal: 1 }]);
  });

  it('serves the F2 lists', async () => {
    const party = (await h.user.get(`${BHET}/f2/PartyName`)).body as PickList;
    expect(party.columns.slice(0, 4).map((c) => c.toLowerCase())).toEqual([
      'partymkm',
      'pname',
      'mobileno',
      'txtaddress',
    ]);
    expect(party.rows.length).toBeGreaterThan(0);
    const inward = (await h.user.get(`${BHET}/f2/inwordkt`)).body as PickList;
    expect(inward.columns[0]?.toLowerCase()).toBe('inwordkm');
    expect(inward.columns[1]).toBe('VibhagName');
    const types = (await h.user.get(`${BHET}/f2/BhetTypekt`)).body as PickList;
    expect(types.rows.length).toBeGreaterThan(0);
    const workGiven = (await h.user.get(`${DEMAND}/f2/WorkGivenMkt`)).body as PickList;
    expect(workGiven.columns[0]?.toLowerCase()).toBe('workgivenmkm');
    const status = (await h.user.get(`${DEMAND}/f2/StatusTypekt`)).body as PickList;
    expect(status.rows.map((r) => r[1])).toContain('Running');
  });

  it('fills the party from a picked inward only when its From party has an address row', async () => {
    const withAddress = await scalar(
      sql<{ v: number }>`SELECT TOP 1 i.inwordkm AS v FROM InwordM i
        WHERE EXISTS (SELECT 1 FROM PrakMAddT a WHERE a.partyMkt = i.fromkt) AND i.fromkt > 0
        ORDER BY i.inwordkm DESC`,
    );
    const filled = await h.user
      .post(`${BHET}/action/inward-party`)
      .send({ ids: [], params: { inwordkm: withAddress } });
    expect(filled.body.kind).toBe('form');
    expect(Object.keys(filled.body.fields).sort()).toEqual(['MobileNo', 'PartyName', 'party_add']);
    const noFrom = await scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 inwordkm AS v FROM InwordM WHERE ISNULL(fromkt, 0) = 0 ORDER BY inwordkm DESC`,
    );
    const empty = await h.user
      .post(`${BHET}/action/inward-party`)
      .send({ ids: [], params: { inwordkm: noFrom } });
    expect(empty.body).toEqual({ kind: 'form', fields: {}, trans: {} });
  });

  it('runs Send To and the print documents', async () => {
    const type = await bhetType();
    const inward = await scalar(
      sql<{ v: number }>`SELECT TOP 1 inwordkm AS v FROM InwordM ORDER BY inwordkm DESC`,
    );
    const withInward = (
      await h.user.post(`${BHET}/save`).send({
        id: 0,
        fields: {
          ...bhet(type),
          inwordkt: inward,
          BookTran: 'Printed-4',
          'BookTran.Rows': [{ LetterBookKm: -1, BookName: 'Printed', Nakal: 4 }],
        },
      })
    ).body.id as number;
    const none = (await h.user.post(`${BHET}/save`).send({ id: 0, fields: bhet(type) })).body
      .id as number;
    const sent = await h.user
      .post(`${BHET}/action/send-to-inward`)
      .send({ ids: [withInward, none] });
    expect(sent.body).toEqual({
      kind: 'open',
      screen: 'inward-master',
      ids: [inward],
      emptyMessage: 'No Record Found',
    });
    const empty = await h.user.post(`${BHET}/action/send-to-inward`).send({ ids: [none] });
    expect(empty.body).toMatchObject({ ids: [], emptyMessage: 'No Record Found' });

    const printed = await h.user
      .post(`${BHET}/action/print-bhet-pahoch`)
      .send({ ids: [withInward] });
    expect(printed.body.kind).toBe('print');
    const doc = printed.body.document as PrintDocument;
    expect(doc.provisional).toMatch(/Provisional/);
    expect(doc.pages).toHaveLength(1);
    const page = doc.pages[0]!;
    expect(page.header).toMatchObject({
      logo: true,
      fields: [
        { label: 'Letter No', value: '7001' },
        { label: 'Date', value: '03/10/2026' },
      ],
    });
    expect(page.blocks).toContainEqual({
      kind: 'lines',
      lines: ['zq-letter party', 'Addr 1', 'Mobile No: 9876543210'],
    });
    expect(page.blocks).toContainEqual({ kind: 'text', text: 'line one\nline two\n' });
    expect(page.blocks.find((b) => b.kind === 'table')).toMatchObject({
      numbered: true,
      rows: [['Printed', 4]],
    });
    // No lines: no table.
    const bare = (await h.user.post(`${BHET}/action/print-bhet-pahoch`).send({ ids: [none] })).body
      .document as PrintDocument;
    expect(bare.pages[0]!.blocks.some((b) => b.kind === 'table')).toBe(false);

    // Demand: Rpt_LetterDemand's rows, grouped by Sort1 (1295 has publisher books and a line).
    const demand = (await h.user.post(`${DEMAND}/action/print-demand`).send({ ids: [1295] })).body;
    expect(demand.kind).toBe('print');
    const tables = (demand.document as PrintDocument).pages[0]!.blocks.filter(
      (b) => b.kind === 'table',
    );
    expect(tables.map((t) => (t.kind === 'table' ? t.title : ''))).toEqual(
      expect.arrayContaining(['Books', 'Book Detail']),
    );

    const wg = await h.user.post(`${DEMAND}/action/send-to-work-given`).send({ ids: [1295] });
    expect(wg.body).toMatchObject({ kind: 'open', screen: 'work-given-master' });
  });
});
