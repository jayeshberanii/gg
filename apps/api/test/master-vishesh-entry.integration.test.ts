import type { GridRow, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Library › Magazine Vishesh Master New (frmMagazineVisheshNew) and English Book Vishesh
 * (frmEnglishBookVishesh), the twins built on vishesh-entry-common.ts. Every test is rolled back.
 */
describe.skipIf(!hasDb)('Magazine Vishesh / English Book Vishesh (integration)', () => {
  const h = useMasterHarness();
  const MAG = '/api/master/magazine-vishesh-master';
  const ENG = '/api/master/english-book-vishesh';

  /** A library number whose book has no Vishesh rows yet, with a party, two subjects … */
  async function fixtures() {
    const { rows: books } = await sql<{ tid: number; BookMastkt: number; Libno: string }>`
      SELECT TOP 1 tid, BookMastkt, Libno FROM BookT
      WHERE ISNULL(Libno, '') <> '' AND BookMastkt NOT IN (SELECT ISNULL(BookMastKt, 0) FROM MagazineVishesh)
        AND BookMastkt NOT IN (SELECT ISNULL(BookMastKt, 0) FROM EnglishBookVishesh)
      ORDER BY tid DESC`.execute(h.trx);
    const one = async (q: Parameters<typeof h.scalar>[0]) => h.scalar(q);
    return {
      book: books[0]!,
      party: await one(sql`SELECT TOP 1 partyMkm FROM PartyM WHERE partyMkm > 0 ORDER BY partyMkm`),
      vishay: await one(
        sql`SELECT TOP 1 vishaycokm FROM vishay WHERE ISNULL(vishay_nm, '') <> '' ORDER BY vishaycokm`,
      ),
      bhasha: await one(sql`SELECT TOP 1 bhashacokm FROM bhasmast ORDER BY bhashacokm`),
      author: await one(sql`SELECT TOP 1 authorcokm FROM authmast ORDER BY authorcokm`),
      authorType: await one(sql`SELECT TOP 1 authtycokm FROM authtype ORDER BY authtycokm`),
      mtype: await one(
        sql`SELECT TOP 1 columnmastkm FROM columnmaster WHERE vibhag = 'MagazineVisheshType' ORDER BY columnmastkm`,
      ),
    };
  }

  const vishayRow = (vishay: number, seq: number, id = 0) => ({
    Id: id,
    RecordKt: 0,
    VishayKt: vishay,
    Vishay: 'v',
    VachanKt: 0,
    Vachan: '',
    VibhaktiKt: 0,
    Vibhakti: '',
    AnyaNameKt: 0,
    Seq: seq,
  });

  it('validates with the desktop lines, in order, and refuses values the columns cannot hold', async () => {
    const empty = await h.user.post(`${MAG}/save`).send({ id: 0, fields: { Seq: 'x' } });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe(
      '- Book Name is Mandatory\r\n- LibNo is Mandatory\r\n- Seq is Mandatory\r\n- Work Done By is Mandatory',
    );
    const f = await fixtures();
    const base = {
      BookTKt: f.book.tid,
      BookMastKt: f.book.BookMastkt,
      Seq: '1',
      WorkDoneByKt: f.party,
    };
    const long = await h.user.post(`${MAG}/save`).send({
      id: 0,
      fields: {
        ...base,
        SubSeq: '123456',
        Ank: '12345678901',
        'BhashaTran.Rows': [
          { MagazineVisheshBhashaKm: -1, BhashaKt: f.bhasha, BhashaName: 'x'.repeat(101), Seq: 1 },
        ],
      },
    });
    expect(long.status).toBe(400);
    expect(long.body.message).toBe(
      '- SubSeq cannot be longer than 5 characters\r\n- Ank cannot be longer than 10 characters\r\n- Bhasha cannot be longer than 100 characters',
    );
    // English reads Seq with Val(): "3abc" is 3; its Tag summary is nvarchar(200).
    const eng = await h.user.post(`${ENG}/save`).send({
      id: 0,
      fields: {
        ...base,
        Seq: '',
        'TagTran.Rows': [
          { EnglishBookVisheshTagKm: -1, VishayKt: f.vishay, VishayName: 'x'.repeat(201), Seq: 1 },
        ],
      },
    });
    expect(eng.body.message).toBe(
      '- Seq is Mandatory\r\n- Tag cannot be longer than 200 characters',
    );
  });

  it('saves the record with its popups and Vishay lines, and edits them', async () => {
    const f = await fixtures();
    const added = await h.user.post(`${MAG}/save`).send({
      id: 0,
      fields: {
        BookTKt: f.book.tid,
        BookMastKt: f.book.BookMastkt,
        Year: '2020',
        Seq: '4',
        SubSeq: ' a',
        Ank: ' 12 ',
        WorkDoneByKt: f.party,
        PDFPageNo: '7',
        'BhashaTran.Rows': [
          { MagazineVisheshBhashaKm: -3, BhashaKt: f.bhasha, bhashaname: 'B1', Seq: 1 },
          { MagazineVisheshBhashaKm: -4, BhashaKt: f.bhasha, bhashaname: 'B2', Seq: 2 },
        ],
        'MTypeTran.Rows': [
          { MagazineVisheshMTypeKm: -1, MTypeKt: f.mtype, MTypeName: 'M1', MTypeNo: 1, Seq: 1 },
        ],
        'AuthorTypeTran.Rows': [
          {
            MagazineVisheshAuthorTypeKm: -1,
            AuthorTypeKt: f.authorType,
            AuthorTypeName: 'T1',
            Seq: 1,
          },
        ],
        'AuthorTran.Rows': [
          {
            MagazineVisheshAuthorKm: -1,
            AuthorKt: f.author,
            AuthorName: 'Main',
            AuthAnyaNmKt: 0,
            AnyaName: 'Other',
            padkt: 0,
            signkt: 0,
            Seq: 1,
          },
        ],
        'DetailTran.Rows': [vishayRow(f.vishay, 1), vishayRow(0, 2)],
        'HeadNameTran.Rows': [vishayRow(f.vishay, 1)],
      },
    });
    expect(added.status).toBe(200);
    const id = added.body.id as number;
    const [rec] = (
      await sql<Record<string, unknown>>`
        SELECT Year, Seq, SubSeq, Ank, PDFPageNo, BhashaName, MTypeName, AuthorTypeName, AuthorName,
          Detail, txtHeadName, txtSabhar, enuser, moduser FROM MagazineVishesh WHERE MagazineVisheshKm = ${id}`.execute(
        h.trx,
      )
    ).rows;
    expect(rec).toMatchObject({
      Year: 2020,
      Seq: 4,
      SubSeq: ' a',
      Ank: '12',
      PDFPageNo: 7,
      BhashaName: 'B1,B2',
      MTypeName: 'M1',
      AuthorTypeName: 'T1',
      AuthorName: 'Other',
      moduser: null,
    });
    expect(Number(rec!.enuser)).toBeGreaterThan(0);
    expect(String(rec!.Detail)).not.toBe('');
    expect(String(rec!.txtHeadName)).not.toBe('');
    // A box whose lines were never loaded is left alone.
    expect(rec!.txtSabhar).toBeNull();
    const entries = await h.scalar(
      sql`SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = 'MagazineVisheshDetail' AND RecordKt = ${id}`,
    );
    expect(entries).toBe(1); // the line without a Vishay is not saved
    expect(added.body.row).toMatchObject({ MagazineVisheshKm: id, BhashaName: 'B1,B2' });

    // The record's vishay boxes and the grid show GetcontString of the summary.
    const record = (await h.user.get(`${MAG}/record/${id}`)).body as GridRow;
    expect(record.BookTName).toBe(f.book.Libno);
    expect(String(record.DetailTran)).not.toContain(' | ');

    // The popups' rows come back from tblSearch's F2EntryText.
    const bhasha = (await h.user.get(`${MAG}/trans/BhashaTran/${id}`)).body as TransGrid;
    expect(bhasha.rows).toHaveLength(2);
    const detail = (await h.user.get(`${MAG}/trans/DetailTran/${id}`)).body as TransGrid;
    expect(detail.rows).toHaveLength(1);

    // Edit: drop a language, empty the MType popup, keep the Detail line and add none.
    const keep = bhasha.rows[0]!;
    const edited = await h.user.post(`${MAG}/save`).send({
      id,
      fields: {
        BookTKt: f.book.tid,
        BookMastKt: f.book.BookMastkt,
        Seq: '5',
        WorkDoneByKt: f.party,
        'BhashaTran.Rows': [keep],
        'MTypeTran.Rows': [],
        'DetailTran.Rows': detail.rows,
      },
    });
    expect(edited.status).toBe(200);
    const [after] = (
      await sql<Record<string, unknown>>`
        SELECT Seq, Year, BhashaName, MTypeName, moduser FROM MagazineVishesh WHERE MagazineVisheshKm = ${id}`.execute(
        h.trx,
      )
    ).rows;
    // INSQ writes a single space for an emptied popup; Year is 0 when the box is blank.
    expect(after).toMatchObject({ Seq: 5, Year: 0, BhashaName: keep.bhashaname, MTypeName: ' ' });
    expect(Number(after!.moduser)).toBeGreaterThan(0);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) FROM MagazineVisheshBhashaT WHERE MagazineVisheshKt = ${id}`,
      ),
    ).toBe(1);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = 'MagazineVisheshDetail' AND RecordKt = ${id}`,
      ),
    ).toBe(1);
    // insertworkreports: the Add is logged; the same user's modification the same day is not
    // (the record is still "New" for them).
    const logs = await h.scalar(
      sql`SELECT COUNT(*) FROM WorkReportM WHERE TableName = 'MagazineVishesh' AND RecordNo = ${String(id)}`,
    );
    expect(edited.body.workReport).toBeUndefined();
    expect(logs).toBe(1);
  });

  it('starts New with the next Seq of the kept book, and lists only the picked book', async () => {
    const f = await fixtures();
    const none = (await h.user.get(`${MAG}/new-defaults`)).body as GridRow;
    expect(none.Seq).toBe(1);
    const save = (seq: string) =>
      h.user.post(`${MAG}/save`).send({
        id: 0,
        fields: {
          BookTKt: f.book.tid,
          BookMastKt: f.book.BookMastkt,
          Seq: seq,
          WorkDoneByKt: f.party,
        },
      });
    const a = (await save('3')).body.id as number;
    const b = (await save('9')).body.id as number;
    const next = (await h.user.get(`${MAG}/new-defaults?BookMastKt=${f.book.BookMastkt}`))
      .body as GridRow;
    expect(next.Seq).toBe(10);

    // The menu's picker lists the book, and the window then lists only its rows.
    const open = (await h.user.get(`${MAG}/lists/open`)).body as PickList;
    expect(open.rows.some((r) => r[0] === f.book.BookMastkt)).toBe(true);
    const rows = (
      await h.user.post(`${MAG}/list`).send({ params: { BookMastKt: f.book.BookMastkt } })
    ).body as GridRow[];
    expect(rows.map((r) => r.MagazineVisheshKm)).toEqual([b, a]);

    // Update Seq renumbers the book's rows 1, 2 (UpdateMagazineSeq).
    const upd = await h.user
      .post(`${MAG}/action/update-seq`)
      .send({ ids: [], params: { bookMastKt: f.book.BookMastkt } });
    expect(upd.status).toBe(200);
    const { rows: seqs } = await sql<{ id: number; Seq: number }>`
      SELECT MagazineVisheshKm AS id, Seq FROM MagazineVishesh WHERE BookMastKt = ${f.book.BookMastkt} ORDER BY Seq`.execute(
      h.trx,
    );
    expect(seqs).toEqual([
      { id: a, Seq: 1 },
      { id: b, Seq: 2 },
    ]);
  });

  it('opens the book and the authors, and deletes with every child row', async () => {
    const f = await fixtures();
    const id = (
      await h.user.post(`${MAG}/save`).send({
        id: 0,
        fields: {
          BookTKt: f.book.tid,
          BookMastKt: f.book.BookMastkt,
          Seq: '1',
          WorkDoneByKt: f.party,
          'BhashaTran.Rows': [
            { MagazineVisheshBhashaKm: -1, BhashaKt: f.bhasha, bhashaname: 'B', Seq: 1 },
          ],
          'AuthorTran.Rows': [
            { MagazineVisheshAuthorKm: -1, AuthorKt: f.author, AnyaName: 'A', Seq: 1 },
          ],
          'SabharTran.Rows': [vishayRow(f.vishay, 1)],
        },
      })
    ).body.id as number;

    const book = await h.user
      .post(`${MAG}/action/bookm`)
      .send({ ids: [], params: { bookMastKt: f.book.BookMastkt } });
    expect(book.body).toMatchObject({
      kind: 'open',
      screen: 'book-master',
      ids: [f.book.BookMastkt],
    });
    const author = await h.user.post(`${MAG}/action/author`).send({ ids: [id] });
    expect(author.body).toMatchObject({ kind: 'open', screen: 'author-master', ids: [f.author] });
    // Nothing found: no message at all.
    const none = await h.user.post(`${MAG}/action/author`).send({ ids: [0] });
    expect(none.body).toMatchObject({ kind: 'open', ids: [], emptyMessage: '' });

    // The table has no Locked column.
    const lock = await h.user
      .post(`${MAG}/lock`)
      .send({ ids: [id], lock: true, password: SECURITY });
    expect(lock.status).toBe(400);

    const logged = () =>
      h.scalar(
        sql`SELECT COUNT(*) FROM WorkReportM WHERE TableName = 'MagazineVishesh' AND RecordNo = ${String(id)}`,
      );
    const loggedBefore = await logged();
    expect(loggedBefore).toBe(1); // the Add
    expect((await h.user.post(`${MAG}/delete`).send({ ids: [id], password: 'no' })).status).toBe(
      401,
    );
    expect(
      (await h.user.post(`${MAG}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    const left = await h.scalar(sql`
      SELECT (SELECT COUNT(*) FROM MagazineVishesh WHERE MagazineVisheshKm = ${id})
        + (SELECT COUNT(*) FROM MagazineVisheshBhashaT WHERE MagazineVisheshKt = ${id})
        + (SELECT COUNT(*) FROM MagazineVisheshAuthorT WHERE MagazineVisheshKt = ${id})
        + (SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = 'MagazineVisheshSabhar' AND RecordKt = ${id})`);
    expect(left).toBe(0);
    // Delete is not logged in the work report.
    expect(await logged()).toBe(loggedBefore);
  });

  it('English Book Vishesh: Tag popup, Column No list, Seq Desc order', async () => {
    const f = await fixtures();
    const col = (await h.user.get(`${ENG}/f2/ColumnNo`)).body as PickList;
    expect(col.columns).toHaveLength(3);
    const [colId, , colNo] = col.rows[0]!;
    const save = (seq: string, extra: Record<string, unknown> = {}) =>
      h.user.post(`${ENG}/save`).send({
        id: 0,
        fields: {
          BookTKt: f.book.tid,
          BookMastKt: f.book.BookMastkt,
          Seq: seq,
          SubSeq: ' b ',
          WorkDoneByKt: f.party,
          ColumnMastKt: colId,
          ...extra,
        },
      });
    const a = (
      await save('2abc', {
        'TagTran.Rows': [
          { EnglishBookVisheshTagKm: -1, VishayKt: f.vishay, VishayName: 'T1', Seq: 1 },
          { EnglishBookVisheshTagKm: -2, VishayKt: f.vishay, VishayName: 'T2', Seq: 2 },
        ],
        'DetailTran.Rows': [vishayRow(f.vishay, 1)],
      })
    ).body.id as number;
    const b = (await save('7')).body.id as number;
    const [rec] = (
      await sql<Record<string, unknown>>`
        SELECT Seq, SubSeq, TagName, Detail FROM EnglishBookVishesh WHERE EnglishBookVisheshKm = ${a}`.execute(
        h.trx,
      )
    ).rows;
    expect(rec).toMatchObject({ Seq: 2, SubSeq: 'b', TagName: 'T1,T2' });
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = 'EnglishBookVishesh' AND RecordKt = ${a}`,
      ),
    ).toBe(1);
    const record = (await h.user.get(`${ENG}/record/${a}`)).body as GridRow;
    expect(record.ColumnNo).toBe(colNo);
    const rows = (
      await h.user.post(`${ENG}/list`).send({ params: { BookMastKt: f.book.BookMastkt } })
    ).body as GridRow[];
    expect(rows.map((r) => r.EnglishBookVisheshKm)).toEqual([b, a]);
    expect(
      (await h.user.post(`${ENG}/delete`).send({ ids: [a, b], password: SECURITY })).status,
    ).toBe(204);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) FROM EnglishBookVisheshTagT WHERE EnglishBookVisheshKt = ${a}`,
      ),
    ).toBe(0);
  });

  it("Vishay Master's Show In Use › Magazine Vishesh finds the Detail lines", async () => {
    const f = await fixtures();
    const id = (
      await h.user.post(`${MAG}/save`).send({
        id: 0,
        fields: {
          BookTKt: f.book.tid,
          BookMastKt: f.book.BookMastkt,
          Seq: '1',
          WorkDoneByKt: f.party,
          'DetailTran.Rows': [vishayRow(f.vishay, 1)],
        },
      })
    ).body.id as number;
    const res = await h.admin
      .post('/api/master/vishay-master/action/in-use-magazine-vishesh')
      .send({ ids: [f.vishay] });
    expect(res.body.kind).toBe('open');
    expect(res.body.screen).toBe('magazine-vishesh-master');
    expect(res.body.ids).toContain(id);
  });
});
