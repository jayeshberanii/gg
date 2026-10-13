import type { GridRow, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Library › Anya Bhandar (frmAnyaBhandar, AnyaBhandarRepository). Every test is rolled back.
 * See docs/screens/anya-bhandar.md.
 */
describe.skipIf(!hasDb)('Anya Bhandar (integration)', () => {
  const h = useMasterHarness();
  const B = '/api/master/anya-bhandar';

  async function fixtures() {
    const one = (q: Parameters<typeof h.scalar>[0]) => h.scalar(q);
    return {
      bhandar: await one(
        sql`SELECT TOP 1 partyMkm FROM PartyM WHERE Categorykt = 14132 ORDER BY partyMkm`,
      ),
      prakashak: await one(sql`SELECT TOP 1 prakcodekm FROM prakmast ORDER BY prakcodekm`),
      bhasha: await one(sql`SELECT TOP 1 bhashacokm FROM bhasmast ORDER BY bhashacokm`),
      lipi: await one(sql`SELECT TOP 1 lipicodekm FROM lipimast ORDER BY lipicodekm`),
      author: await one(sql`SELECT TOP 1 authorcokm FROM authmast ORDER BY authorcokm`),
      author2: await one(
        sql`SELECT TOP 1 authorcokm FROM authmast WHERE authorcokm > (SELECT MIN(authorcokm) FROM authmast) ORDER BY authorcokm`,
      ),
      authorType: await one(
        sql`SELECT TOP 1 authtycokm FROM authtype WHERE ISNULL(authtyattr, '') <> '' ORDER BY authtycokm`,
      ),
      vishay: await one(
        sql`SELECT TOP 1 vishaycokm FROM vishay WHERE ISNULL(vishay_nm, '') <> '' ORDER BY vishaycokm`,
      ),
      // A library number and its own book.
      tid: await one(
        sql`SELECT TOP 1 tid FROM BookT WHERE ISNULL(Libno, '') <> '' AND BookMastkt > 0 ORDER BY tid DESC`,
      ),
    };
  }
  type F = Awaited<ReturnType<typeof fixtures>>;
  const base = (f: F, extra: Record<string, unknown> = {}) => ({
    BhandarKt: f.bhandar,
    BookMastKt: 0,
    BookName: 'zq-book',
    Size: 'zq',
    RecordNo: '7',
    ...extra,
  });
  const record = async (id: number) =>
    (
      await sql<
        Record<string, unknown>
      >`SELECT * FROM AnyaBhandarM WHERE AnyaBhandarKm = ${id}`.execute(h.trx)
    ).rows[0]!;
  const count = (table: string, id: number) =>
    h.scalar(sql`SELECT COUNT(*) FROM ${sql.table(table)} WHERE AnyaBhandarKt = ${id}`);
  const vishayLine = (vishay: number, recordKt: number, seq = 1) => ({
    Id: 0,
    RecordKt: recordKt,
    VishayKt: vishay,
    Vishay: 'v',
    VachanKt: 0,
    Vachan: '',
    VibhaktiKt: 0,
    Vibhakti: '',
    Seq: seq,
  });

  it('validates with the desktop messages, first failure only', async () => {
    const f = await fixtures();
    const send = (fields: Record<string, unknown>) =>
      h.user.post(`${B}/save`).send({ id: 0, fields });
    // Ent.RecordNo = txtRecordNo.Text: VB's conversion throws first.
    expect((await send({})).body.message).toBe(
      `Conversion from string "" to type 'Integer' is not valid.`,
    );
    expect((await send({ RecordNo: 'x1' })).body.message).toBe(
      `Conversion from string "x1" to type 'Integer' is not valid.`,
    );
    expect((await send({ RecordNo: '1' })).body.message).toBe('Please Bhandar Name');
    expect((await send({ RecordNo: '1', BhandarKt: f.bhandar })).body.message).toBe(
      '- Please Enter Book Name',
    );
    expect((await send({ RecordNo: '1', BhandarKt: f.bhandar, BookName: 'b' })).body.message).toBe(
      '- Please Enter Size',
    );
    expect(
      (await send({ RecordNo: '0', BhandarKt: f.bhandar, BookName: 'b', Size: 's' })).body.message,
    ).toBe('- Please Enter RecrordNo');
    const long = await send(base(f, { Size: 'abcd', OldLibNo: 'o'.repeat(201) }));
    expect(long.status).toBe(400);
    expect(long.body.message).toBe(
      '- Size cannot be longer than 3 characters\r\n- Old Library No cannot be longer than 200 characters',
    );
  });

  it('computes RecordNo for the size (New / Copy)', async () => {
    const f = await fixtures();
    const next = (size: string) =>
      h.user
        .get(`${B}/new-defaults?Size=${encodeURIComponent(size)}`)
        .then((r) => r.body as GridRow);
    expect(await next('zq')).toEqual({ RecordNo: 1 });
    await h.user.post(`${B}/save`).send({ id: 0, fields: base(f, { RecordNo: '41' }) });
    expect(await next('zq')).toEqual({ RecordNo: 42 });
  });

  it('saves the record with every popup, and edits it', async () => {
    const f = await fixtures();
    const added = await h.user.post(`${B}/save`).send({
      id: 0,
      fields: base(f, {
        BookMastKt: 0,
        PrakTran: 'typed prak',
        AuthTran: 'typed author',
        BhashaTran: 'B',
        LipiTran: 'L',
        Remark: ' rem ',
        BookTKt: f.tid,
        'PrakTran.Rows': [
          {
            AnyaBhandarPrakKm: 0,
            AnyaBhandarKt: 0,
            prakashakkt: f.prakashak,
            prakname: 'p',
            purva: true,
            nameSelected: "O'Prak",
            PrakTypekt: 0,
            PrakType: '',
            Remark: '',
            signkt: 0,
            sign: '',
            seq: 1,
          },
        ],
        'BhashaTran.Rows': [
          { AnyaBhandarBhashaKm: 0, AnyaBhandarKt: 0, bhashakt: f.bhasha, bhasa_attr: 'b', seq: 1 },
          // A row without a language is skipped.
          { AnyaBhandarBhashaKm: 0, AnyaBhandarKt: 0, bhashakt: 0, bhasa_attr: '', seq: 2 },
        ],
        'LipiTran.Rows': [
          { AnyaBhandarLipiKm: 0, AnyaBhandarKt: 0, lippikt: f.lipi, lipi_attr: 'l', seq: 1 },
        ],
        'AuthTran.Rows': [
          { AnyaBhandarAuthorKm: -1, authortype: "t'1", authorname: "O'Brien", seq: 1 },
        ],
        'AuthTran.Extra': [
          {
            AnyaBhandarAuthorAuthKm: -1,
            AnyaBhandarAuthorKt: -1,
            authorkt: f.author,
            authorname: 'Main',
            AuthAnyaNmKt: 0,
            AnyaName: "O'Any",
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
            AnyaBhandarAuthorAuthTypekm: -1,
            AnyaBhandarAuthorKt: -1,
            authortypekt: f.authorType,
            authortype: 'x',
            signkt: 0,
            Sign: '',
            seq: 1,
          },
        ],
        'SubjTran.Rows': [
          {
            AnyaBhandarSubjectKm: 0,
            EntryType: 'Main Title(New)',
            Vishay: '',
            WorkDoneByKt: 0,
            WorkDoneByName: '',
            PrintDate: '05/02/2024',
            PrintSeq: 3,
            Remark: 'sr',
            Seq: 1,
          },
          {
            AnyaBhandarSubjectKm: 0,
            EntryType: 'Old',
            Vishay: '',
            WorkDoneByKt: 0,
            WorkDoneByName: '',
            PrintDate: '',
            PrintSeq: 0,
            Remark: '',
            Seq: 2,
          },
        ],
        // A row the popup added (key −1) is saved too (the desktop dropped it).
        'MulAuthorTran.Rows': [
          { AnyaBhandarMulAuthorKm: -1, AuthorKt: f.author, AuthorName: 'a', seq: 1 },
        ],
        'AnuAuthorTran.Rows': [
          { AnyaBhandarAnuAuthorKm: 0, AuthorKt: f.author2, AuthorName: 'b', seq: 1 },
        ],
      }),
    });
    expect(added.status).toBe(200);
    const id = added.body.id as number;
    const rec = await record(id);
    expect(rec).toMatchObject({
      BhandarKt: f.bhandar,
      RecordNo: 7,
      Size: 'zq',
      BookMastKt: 0,
      BookName: 'zq-book',
      BookTKt: f.tid,
      txtPrakashak: 'typed prak',
      txtBhasha: 'B',
      Remark: 'rem',
      moduser: null,
    });
    expect(Number(rec.enuser)).toBeGreaterThan(0);
    // txtAuthor is rebuilt from the author rows.
    expect(String(rec.txtAuthor)).toContain("O'Any");
    expect(await count('AnyaBhandarPrakT', id)).toBe(1);
    expect(await count('AnyaBhandarBhashaT', id)).toBe(1);
    expect(await count('AnyaBhandarLipiT', id)).toBe(1);
    expect(await count('AnyaBhandarAuthorAuthT', id)).toBe(1);
    expect(await count('AnyaBhandarAuthorAuthTypeT', id)).toBe(1);
    expect(await count('AnyaBhandarMulAuthorT', id)).toBe(1);
    expect(await count('AnyaBhandarAnuAuthorT', id)).toBe(1);
    const auth = (
      await sql<{ txtAuth: string; sub: number }>`
        SELECT a.txtAuth, (SELECT COUNT(*) FROM AnyaBhandarAuthorAuthT n WHERE n.AnyaBhandarAuthorKt = a.AnyaBhandarAuthorKm) AS sub
        FROM AnyaBhandarAuthorT a WHERE a.AnyaBhandarKt = ${id}`.execute(h.trx)
    ).rows;
    expect(auth).toEqual([{ txtAuth: "t'1-O'Brien", sub: 1 }]);
    const subjects = (
      await sql<{ km: number; PrintDate: Date | null }>`
        SELECT AnyaBhandarSubjectKm AS km, PrintDate FROM AnyaBhandarSubjectT WHERE AnyaBhandarKt = ${id} ORDER BY Seq`.execute(
        h.trx,
      )
    ).rows;
    expect(subjects).toHaveLength(2);
    expect(subjects[0]!.PrintDate?.toISOString().slice(0, 10)).toBe('2024-02-05');
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) FROM WorkReportM WHERE TableName = 'AnyaBhandarM' AND RecordNo = ${String(id)}`,
      ),
    ).toBe(1);

    // The popups load from tblSearch; the record shows the kt names.
    const shown = (await h.user.get(`${B}/record/${id}`)).body as GridRow;
    expect(shown.BookMastName).toBe('zq-book');
    const subj = (await h.user.get(`${B}/trans/SubjTran/${id}`)).body as TransGrid;
    expect(subj.rows).toHaveLength(2);

    // Edit: Vishay lines on both subjects go under each subject's own key (the desktop put
    // them all under the first); a Bhasha row removed is deleted; an unopened popup stays.
    const [s1, s2] = subjects.map((s) => s.km);
    const edited = await h.user.post(`${B}/save`).send({
      id,
      fields: base(f, {
        BookTKt: f.tid,
        RecordNo: '8',
        'BhashaTran.Rows': [],
        'SubjTran.Rows': subj.rows,
        'SubjTran.Extra': [vishayLine(f.vishay, s1!), vishayLine(f.vishay, s2!)],
      }),
    });
    expect(edited.status).toBe(200);
    const after = await record(id);
    expect(after.RecordNo).toBe(8);
    expect(Number(after.moduser)).toBeGreaterThan(0);
    expect(await count('AnyaBhandarBhashaT', id)).toBe(0);
    expect(await count('AnyaBhandarLipiT', id)).toBe(1);
    // No author rows sent: the box text is saved.
    expect(after.txtAuthor).toBe('');
    expect(await count('AnyaBhandarAuthorT', id)).toBe(1);
    const lines = (
      await sql<{ RecordKt: number }>`
        SELECT RecordKt FROM VishayEntry WHERE TransactionName = 'AnyaBhandarSubject' AND RecordKt IN (${s1}, ${s2}) ORDER BY RecordKt`.execute(
        h.trx,
      )
    ).rows.map((r) => r.RecordKt);
    expect(lines).toEqual([s1, s2]);
    const vishay = (
      await sql<{
        Vishay: string;
      }>`SELECT Vishay FROM AnyaBhandarSubjectT WHERE AnyaBhandarSubjectKm = ${s2}`.execute(h.trx)
    ).rows[0]!.Vishay;
    expect(vishay.trim()).not.toBe('');
  });

  it('adds a new book in the obtain-book series when asked, and only then', async () => {
    const f = await fixtures();
    const ob = await h.scalar(sql`SELECT bookcodekm FROM bookmast WHERE bookname = 'obtain book'`);
    const top = await h.scalar(
      sql`SELECT ISNULL(MAX(RIGHT(libno, 5)), 0) FROM BookT WHERE LEFT(libno, 2) = 'OB'`,
    );
    const expected = `OB${String(top + 1).padStart(5, '0')}`;
    const added = await h.user.post(`${B}/save`).send({
      id: 0,
      fields: base(f, {
        AddBook: true,
        BookName: 'zq-new-book',
        Pages: '1-10',
        TotalPages: '10',
        BhashaTran: 'B',
        'BhashaTran.Rows': [
          { AnyaBhandarBhashaKm: 0, AnyaBhandarKt: 0, bhashakt: f.bhasha, bhasa_attr: 'b', seq: 1 },
        ],
        'PrakTran.Rows': [
          {
            AnyaBhandarPrakKm: 0,
            prakashakkt: f.prakashak,
            purva: false,
            nameSelected: 'n',
            PrakTypekt: 0,
            Remark: '',
            signkt: 0,
            seq: 1,
          },
        ],
        'AuthTran.Rows': [{ AnyaBhandarAuthorKm: -1, authortype: 't', authorname: 'a', seq: 1 }],
        'AuthTran.Extra': [
          { AnyaBhandarAuthorAuthKm: -1, AnyaBhandarAuthorKt: -1, authorkt: f.author, seq: 1 },
        ],
        'SubjTran.Rows': [
          { AnyaBhandarSubjectKm: 0, EntryType: 'Old', Vishay: '', PrintDate: '', Seq: 1 },
        ],
      }),
    });
    expect(added.status).toBe(200);
    const rec = await record(added.body.id as number);
    const bookId = Number(rec.BookMastKt);
    expect(bookId).toBeGreaterThan(0);
    const bookT = (
      await sql<{ tid: number; Libno: string; SeriesKt: number; BookMastkt: number }>`
        SELECT tid, Libno, SeriesKt, BookMastkt FROM BookT WHERE tid = ${Number(rec.BookTKt)}`.execute(
        h.trx,
      )
    ).rows[0]!;
    expect(bookT).toMatchObject({ Libno: expected, SeriesKt: ob, BookMastkt: bookId });
    const book = (
      await sql<
        Record<string, unknown>
      >`SELECT BookName, txtBookTran, Size, TotalPages, txtBhasha FROM BookM WHERE BookMastkm = ${bookId}`.execute(
        h.trx,
      )
    ).rows[0]!;
    expect(book).toMatchObject({
      BookName: 'zq-new-book',
      txtBookTran: expected,
      Size: 'zq',
      TotalPages: 10,
      txtBhasha: 'B',
    });
    const bookCount = (q: string) =>
      h.scalar(
        sql`SELECT COUNT(*) FROM ${sql.table(q)} WHERE ${sql.ref(q === 'praksnBhashaT' ? 'prakshnokt' : q === 'BookSubjectT' ? 'BookMastKt' : 'prakashannokt')} = ${bookId}`,
      );
    expect(await bookCount('praksnBhashaT')).toBe(1);
    expect(await bookCount('praksnPrakT')).toBe(1);
    expect(await bookCount('praksnAuthorT')).toBe(1);
    expect(await bookCount('praksnAuthorAuthT')).toBe(1);
    expect(await bookCount('BookSubjectT')).toBe(1);

    // A picked book (BookMastKt) or an Edit never adds one.
    const books = () => h.scalar(sql`SELECT COUNT(*) FROM BookM`);
    const before = await books();
    await h.user
      .post(`${B}/save`)
      .send({ id: 0, fields: base(f, { AddBook: true, BookMastKt: bookId }) });
    await h.user
      .post(`${B}/save`)
      .send({ id: added.body.id, fields: base(f, { AddBook: true, BookTKt: f.tid }) });
    expect(await books()).toBe(before);
    // Editing a record on an OB number with another library number just saves (the desktop's
    // BookT update failed on a column BookT does not have).
    expect((await record(added.body.id as number)).BookTKt).toBe(f.tid);

    // The next number already taken: "LibNo Already Exist", nothing saved.
    await sql`INSERT INTO BookT (BookMastkt, Libno, MainL) VALUES (${bookId}, 'OB99999', 0)`.execute(
      h.trx,
    );
    await sql`INSERT INTO BookT (BookMastkt, Libno, MainL) VALUES (${bookId}, 'OB100000', 0)`.execute(
      h.trx,
    );
    const anya = () => h.scalar(sql`SELECT COUNT(*) FROM AnyaBhandarM`);
    const anyaBefore = await anya();
    const taken = await h.user
      .post(`${B}/save`)
      .send({ id: 0, fields: base(f, { AddBook: true, BookName: 'zq-again' }) });
    expect(taken.status).toBe(400);
    expect(taken.body.message).toBe('LibNo Already Exist');
    expect(await anya()).toBe(anyaBefore);
  });

  it('fills from a picked book, finds the book of a library number, and lists the F2 boxes', async () => {
    const f = await fixtures();
    const bookId = await h.scalar(sql`
      SELECT TOP 1 b.prakashannokt FROM praksnPrakT b
      WHERE EXISTS (SELECT 1 FROM praksnBhashaT x WHERE x.prakshnokt = b.prakashannokt)
        AND EXISTS (SELECT 1 FROM BookT t WHERE t.BookMastkt = b.prakashannokt)
        AND EXISTS (SELECT 1 FROM BookM m WHERE m.BookMastkm = b.prakashannokt AND ISNULL(m.txtBookTran, '') NOT LIKE '%CM%'
          AND ISNULL(m.txtBookTran, '') NOT LIKE '%ms%' AND ISNULL(m.txtBookTran, '') NOT LIKE '%CP%' AND ISNULL(m.txtBookTran, '') NOT LIKE '%SN%')
      ORDER BY b.prakashannokt DESC`);
    const res = await h.user
      .post(`${B}/action/fill-from-book`)
      .send({ ids: [], params: { bookId, tranKm: 0 } });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('form');
    const lastTid = await h.scalar(
      sql`SELECT TOP 1 tid FROM BookT WHERE BookMastkt = ${bookId} ORDER BY tid DESC`,
    );
    expect(res.body.fields.BookTKt).toBe(lastTid);
    const prak = res.body.trans.PrakTran.rows as GridRow[];
    expect(prak.length).toBeGreaterThan(0);
    expect(prak.every((r) => Number(r.AnyaBhandarPrakKm) <= 0)).toBe(true);
    expect((res.body.trans.BhashaTran.rows as GridRow[]).length).toBeGreaterThan(0);
    expect(res.body.trans.AuthTran.extras).toHaveLength(2);

    // An Operator does not get a book carrying a CM/MS/CP/SN number.
    const hidden = await h.scalar(
      sql`SELECT TOP 1 BookMastkm FROM BookM WHERE txtBookTran LIKE '%CM%' ORDER BY BookMastkm DESC`,
    );
    const op = await h.user
      .post(`${B}/action/fill-from-book`)
      .send({ ids: [], params: { bookId: hidden, tranKm: 0 } });
    expect(op.body).toEqual({ kind: 'message', message: '' });
    const master = await h.signIn(2);
    const seen = await master
      .post(`${B}/action/fill-from-book`)
      .send({ ids: [], params: { bookId: hidden, tranKm: 0 } });
    expect(seen.body.kind).toBe('form');

    // Library No's F2: the number's own book (the desktop read BookM by the BookT tid).
    const own = await h.scalar(sql`SELECT BookMastkt FROM BookT WHERE tid = ${f.tid}`);
    const libno = await h.user
      .post(`${B}/action/book-of-libno`)
      .send({ ids: [], params: { tid: f.tid } });
    expect(libno.body.rows[0].BookMastKm).toBe(own);

    const sizes = (await h.user.get(`${B}/f2/Size`)).body as PickList;
    expect(sizes.rows.length).toBeGreaterThan(0);
    const bhandars = (await h.user.get(`${B}/f2/BhandarKt`)).body as PickList;
    expect(bhandars.rows.some((r) => r[0] === f.bhandar)).toBe(true);
  }, 60_000);

  it('opens the books, refuses locks, and deletes with every child row', async () => {
    const f = await fixtures();
    const bookId = await h.scalar(sql`SELECT BookMastkt FROM BookT WHERE tid = ${f.tid}`);
    const added = await h.user.post(`${B}/save`).send({
      id: 0,
      fields: base(f, {
        BookMastKt: bookId,
        'LipiTran.Rows': [{ AnyaBhandarLipiKm: 0, lippikt: f.lipi, seq: 1 }],
        'MulAuthorTran.Rows': [{ AnyaBhandarMulAuthorKm: -1, AuthorKt: f.author, seq: 1 }],
        'SubjTran.Rows': [{ AnyaBhandarSubjectKm: 0, EntryType: 'Old', PrintDate: '', Seq: 1 }],
      }),
    });
    const id = added.body.id as number;
    const subject = await h.scalar(
      sql`SELECT AnyaBhandarSubjectKm FROM AnyaBhandarSubjectT WHERE AnyaBhandarKt = ${id}`,
    );
    await sql`INSERT INTO VishayEntry (TransactionName, RecordKt, VishayKt, Seq) VALUES ('AnyaBhandarSubject', ${subject}, ${f.vishay}, 1)`.execute(
      h.trx,
    );
    const book = await h.user.post(`${B}/action/book-master`).send({ ids: [id] });
    expect(book.body).toEqual({
      kind: 'open',
      screen: 'book-master',
      ids: [bookId],
      emptyMessage: 'No Record Found',
    });
    const lock = await h.user.post(`${B}/lock`).send({ ids: [id], lock: true, password: SECURITY });
    expect(lock.status).toBe(400);

    expect((await h.user.post(`${B}/delete`).send({ ids: [id], password: 'no' })).status).toBe(401);
    expect((await h.user.post(`${B}/delete`).send({ ids: [id], password: SECURITY })).status).toBe(
      204,
    );
    const left = await h.scalar(sql`
      SELECT (SELECT COUNT(*) FROM AnyaBhandarM WHERE AnyaBhandarKm = ${id})
        + (SELECT COUNT(*) FROM AnyaBhandarLipiT WHERE AnyaBhandarKt = ${id})
        + (SELECT COUNT(*) FROM AnyaBhandarMulAuthorT WHERE AnyaBhandarKt = ${id})
        + (SELECT COUNT(*) FROM AnyaBhandarSubjectT WHERE AnyaBhandarKt = ${id})
        + (SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = 'AnyaBhandarSubject' AND RecordKt = ${subject})`);
    expect(left).toBe(0);
  });

  it('is open to every user and needs a session', async () => {
    const guest = await h.signIn(4);
    expect((await guest.post(`${B}/list`).send({ ids: [0] })).status).toBe(200);
    await guest.post('/api/auth/logout').send({ recordLogoutTime: false });
    expect((await guest.post(`${B}/list`).send({})).status).toBe(401);
    expect((await guest.post(`${B}/save`).send({ id: 0, fields: {} })).status).toBe(401);
  });
});
