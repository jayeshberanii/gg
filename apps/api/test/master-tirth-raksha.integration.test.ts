import type { GridRow, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Library › Tirth Raksha Master (frmTirthRakshaMaster, TirthRakshaRepository). Every test is
 * rolled back. See docs/screens/tirth-raksha-master.md.
 */
describe.skipIf(!hasDb)('Tirth Raksha Master (integration)', () => {
  const h = useMasterHarness();
  const B = '/api/master/tirth-raksha-master';

  async function fixtures() {
    const one = (q: Parameters<typeof h.scalar>[0]) => h.scalar(q);
    const vibhag = (name: string) =>
      one(
        sql`SELECT TOP 1 ColumnMastkm FROM columnmaster WHERE Vibhag = ${name} ORDER BY ColumnMastkm`,
      );
    // Two library numbers no record references yet.
    const { rows: books } = await sql<{ tid: number }>`
      SELECT TOP 2 tid FROM BookT WHERE ISNULL(Libno, '') <> ''
        AND tid NOT IN (SELECT ISNULL(BookTKt, 0) FROM TirthRakshaM) ORDER BY tid DESC`.execute(
      h.trx,
    );
    return {
      book: books[0]!.tid,
      book2: books[1]!.tid,
      doneBy: await vibhag('DoneBy'),
      kshetra: await vibhag('TirthRakshaKshetra'),
      kruti: await vibhag('TirthRakshaKruti'),
      tvishay: await vibhag('TirthRakshaVishay'),
      samvatKind: await vibhag('AuthSamKind'),
      vishay: await one(
        sql`SELECT TOP 1 vishaycokm FROM vishay WHERE ISNULL(vishay_nm, '') <> '' ORDER BY vishaycokm`,
      ),
      bhasha: await one(sql`SELECT TOP 1 bhashacokm FROM bhasmast ORDER BY bhashacokm`),
      author: await one(sql`SELECT TOP 1 authorcokm FROM authmast ORDER BY authorcokm`),
      authorType: await one(
        sql`SELECT TOP 1 authtycokm FROM authtype WHERE ISNULL(authortype, '') <> '' AND ISNULL(authtyattr, '') <> authortype ORDER BY authtycokm`,
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
  const refRow = (book: number, key = -1, page = '12') => ({
    TirthRakshaReferenceKm: key,
    KrutimstKt: 0,
    BookTKt: book,
    PageNo: page,
    GathaNo: 'g',
    Remark: '',
    seq: 1,
  });
  type F = Awaited<ReturnType<typeof fixtures>>;
  const base = (f: F, extra: Record<string, unknown> = {}) => ({
    TirthRakshaNameTran: 'zq-name',
    Seq: '9001',
    BookSeq: '1',
    DoneByKt: f.doneBy,
    'ReferenceTran.Rows': [refRow(f.book)],
    ...extra,
  });
  const record = async (id: number) =>
    (
      await sql<
        Record<string, unknown>
      >`SELECT * FROM TirthRakshaM WHERE TirthRakshaKm = ${id}`.execute(h.trx)
    ).rows[0]!;

  it('validates with the desktop lines, in order, and refuses values the columns cannot hold', async () => {
    const empty = await h.user.post(`${B}/save`).send({ id: 0, fields: {} });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe(
      '- Name(N) is Mandatory\r\n- Seq is Mandatory\r\n- BookSeq is Mandatory\r\n- Reference(P) is Mandatory\r\n- Done By(D) is Mandatory',
    );
    const f = await fixtures();
    // A Reference row without a book does not count.
    const noBook = await h.user
      .post(`${B}/save`)
      .send({ id: 0, fields: base(f, { 'ReferenceTran.Rows': [refRow(0)] }) });
    expect(noBook.body.message).toBe('- Reference(P) is Mandatory');
    const long = await h.user.post(`${B}/save`).send({
      id: 0,
      fields: base(f, {
        ProjectDetail: 'x'.repeat(2001),
        'BhashaTran.Rows': [
          { TirthRakshaBhashaKm: -1, BhashaKt: f.bhasha, BhashaName: 'b'.repeat(30), Seq: 1 },
          { TirthRakshaBhashaKm: -2, BhashaKt: f.bhasha, BhashaName: 'c'.repeat(30), Seq: 2 },
        ],
      }),
    });
    expect(long.status).toBe(400);
    expect(long.body.message).toBe(
      '- Project Detail cannot be longer than 2000 characters\r\n- Bhasha cannot be longer than 50 characters',
    );
  });

  it('saves the record with every popup and Vishay box, and edits it', async () => {
    const f = await fixtures();
    const added = await h.user.post(`${B}/save`).send({
      id: 0,
      fields: base(f, {
        TirthRakshaNameTran: 'typed',
        ProjectDetail: ' pd ',
        Remark: 'rem',
        GroupNo: '77',
        'TirthRakshaNameTran.Rows': [vishayRow(f.vishay, 1), vishayRow(0, 2)],
        'PetaVishayTran.Rows': [vishayRow(f.vishay, 1)],
        'AuthTran.Rows': [
          {
            TirthRakshaKt: 0,
            TirthRakshaAuthorKm: -5,
            authortype: "t'1",
            authorname: "O'Brien",
            seq: 1,
          },
        ],
        'AuthTran.Extra': [
          {
            TirthRakshaAuthorAuthorKm: -1,
            TirthRakshaAuthorKt: -5,
            authorkt: f.author,
            authorname: 'Main',
            AuthAnyaNmKt: 0,
            AnyaName: "O'Any",
            padkt: 0,
            Guru: '',
            identyty: '',
            signkt: 0,
            seq: 1,
          },
        ],
        'AuthTran.Extra2': [
          {
            TirthRakshaAuthorAuthorTypeKm: -1,
            TirthRakshaAuthorKt: -5,
            authortypekt: f.authorType,
            signkt: 0,
            seq: 1,
          },
        ],
        'SamvatTran.Rows': [
          {
            TirthRakshaSamvatKm: -1,
            SamvatKindKt: f.samvatKind,
            Remark: 'sr',
            AsamvatKt: 3,
            Asamvat: '2025',
            Vksamvat: 1555,
            Isvisan: 1499,
            BookTKt: 0,
            PageNo: '',
            SthalKt: 0,
            IsPrint: true,
            seq: 1,
          },
        ],
        'KshetraTran.Rows': [{ TirthRakshaKshetraKm: -1, KshetraKt: f.kshetra, Seq: 1 }],
        'BhashaTran.Rows': [
          { TirthRakshaBhashaKm: -1, BhashaKt: f.bhasha, BhashaName: 'B1', Seq: 1 },
          { TirthRakshaBhashaKm: -2, BhashaKt: f.bhasha, BhashaName: 'B2', Seq: 2 },
        ],
        'KrutiTran.Rows': [{ TirthRakshaKrutiKm: -1, KrutiKt: f.kruti, Seq: 1 }],
        'ReferenceTran.Rows': [refRow(f.book), { ...refRow(f.book2, -2), seq: 2 }],
        'MainPersonTran.Rows': [{ TirthRakshaMainPersonKm: -1, VishayKt: f.vishay, Seq: 1 }],
        'VishayTran.Rows': [
          { TirthRakshaVishayKm: -1, VishayKt: f.tvishay, VishayName: 'V1', Seq: 1 },
          { TirthRakshaVishayKm: -2, VishayKt: f.tvishay, VishayName: 'V2', Seq: 2 },
        ],
      }),
    });
    expect(added.status).toBe(200);
    const id = added.body.id as number;
    const rec = await record(id);
    expect(rec).toMatchObject({
      Seq: 9001,
      BookSeq: 1,
      BookTKt: f.book,
      DoneByKt: f.doneBy,
      ProjectDetail: 'pd',
      Remark: 'rem',
      VikramSamvat: 1555,
      Isvisan: 1499,
      SamvatRemark: 'sr',
      txtBhasha: 'B1,B2',
      Vishay: 'V1, V2',
      GroupNo: null,
      moduser: null,
    });
    expect(Number(rec.enuser)).toBeGreaterThan(0);
    // UpdateVishay rewrote the name from its line; the author text came from GetAuthorName.
    expect(String(rec.TirthRakshaName)).not.toBe('typed');
    expect(String(rec.txtAuthor)).toContain("O'Any");
    // v3.4.3.1: the type's name (authtype.authortype), no longer its attribute.
    const typeName = (
      await sql<{ t: string }>`
        SELECT authortype AS t FROM authtype WHERE authtycokm = ${f.authorType}`.execute(h.trx)
    ).rows[0]!.t.trim();
    expect(String(rec.txtAuthor).startsWith(typeName)).toBe(true);
    expect(String(rec.PetaVishay)).not.toBe('');
    const count = (table: string) =>
      h.scalar(sql`SELECT COUNT(*) FROM ${sql.table(table)} WHERE TirthRakshaKt = ${id}`);
    expect(await count('TirthRakshaReferenceT')).toBe(2);
    expect(await count('TirthRakshaAuthorAuthorT')).toBe(1);
    expect(await count('TirthRakshaAuthorAuthorTypeT')).toBe(1);
    expect(await count('TirthRakshaSamvatT')).toBe(1);
    const auth = (
      await sql<{ txtAuth: string; sub: number }>`
        SELECT a.txtAuth, (SELECT COUNT(*) FROM TirthRakshaAuthorAuthorT n WHERE n.TirthRakshaAuthorKt = a.TirthRakshaAuthorKm) AS sub
        FROM TirthRakshaAuthorT a WHERE a.TirthRakshaKt = ${id}`.execute(h.trx)
    ).rows;
    // The sub-rows follow their author row's new key; quotes are parameters now.
    expect(auth).toEqual([{ txtAuth: "t'1-O'Brien", sub: 1 }]);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = 'TirthRakshaName' AND RecordKt = ${id}`,
      ),
    ).toBe(1);
    expect(
      await h.scalar(
        sql`SELECT COUNT(*) FROM WorkReportM WHERE TableName = 'TirthRakshaM' AND RecordNo = ${String(id)}`,
      ),
    ).toBe(1);

    // The record's vishay boxes show GetcontString; the popups load from tblSearch.
    const shown = (await h.user.get(`${B}/record/${id}`)).body as GridRow;
    expect(String(shown.TirthRakshaNameTran)).not.toContain(' | ');
    const refs = (await h.user.get(`${B}/trans/ReferenceTran/${id}`)).body as TransGrid;
    expect(refs.rows).toHaveLength(2);

    // Edit without opening any popup: the stored name, author text and BookTKt stay.
    const before = await record(id);
    const edited = await h.user.post(`${B}/save`).send({
      id,
      fields: {
        TirthRakshaNameTran: 'box text',
        Seq: '9002',
        BookSeq: '3',
        DoneByKt: f.doneBy,
        GroupNo: '55',
      },
    });
    expect(edited.status).toBe(200);
    const after = await record(id);
    expect(after).toMatchObject({
      Seq: 9002,
      BookSeq: 3,
      BookTKt: f.book,
      TirthRakshaName: before.TirthRakshaName,
      txtAuthor: before.txtAuthor,
      txtBhasha: 'B1,B2',
      GroupNo: null,
    });
    expect(Number(after.moduser)).toBeGreaterThan(0);

    // A new first Reference row moves the record's BookTKt; emptying Samvat clears its values
    // (the desktop's save failed there).
    const moved = await h.user.post(`${B}/save`).send({
      id,
      fields: {
        TirthRakshaNameTran: 'box text',
        Seq: '9002',
        BookSeq: '3',
        DoneByKt: f.doneBy,
        'ReferenceTran.Rows': [{ ...refs.rows[1], seq: 1 }],
        'SamvatTran.Rows': [],
        'BhashaTran.Rows': [],
      },
    });
    expect(moved.status).toBe(200);
    expect(await record(id)).toMatchObject({
      BookTKt: f.book2,
      VikramSamvat: 0,
      Isvisan: 0,
      SamvatRemark: '',
      txtBhasha: ' ',
    });
    expect(await count('TirthRakshaReferenceT')).toBe(1);

    // An Edit whose stored book is gone and whose popup was not opened is refused.
    await sql`UPDATE TirthRakshaM SET BookTKt = 0 WHERE TirthRakshaKm = ${id}`.execute(h.trx);
    const noRef = await h.user.post(`${B}/save`).send({
      id,
      fields: { TirthRakshaNameTran: 'x', Seq: '1', BookSeq: '1', DoneByKt: f.doneBy },
    });
    expect(noRef.status).toBe(400);
    expect(noRef.body.message).toBe('- Reference(P) is Mandatory');
  });

  it('computes Seq and BookSeq, and renumbers a book (Update Book Seq)', async () => {
    const f = await fixtures();
    const maxSeq = await h.scalar(sql`SELECT ISNULL(MAX(Seq), 0) + 1 FROM TirthRakshaM`);
    const none = (await h.user.get(`${B}/new-defaults`)).body as GridRow;
    expect(none).toEqual({ Seq: maxSeq });
    const save = (bookSeq: string) =>
      h.user.post(`${B}/save`).send({ id: 0, fields: base(f, { BookSeq: bookSeq }) });
    const a = (await save('5')).body.id as number;
    const b = (await save('8')).body.id as number;
    const next = (await h.user.get(`${B}/new-defaults?BookTKt=${f.book}`)).body as GridRow;
    // Seq is the table's MAX + 1 (9001 now), BookSeq the book's.
    expect(next).toEqual({ Seq: Math.max(maxSeq, 9002), BookSeq: 9 });
    const action = await h.user
      .post(`${B}/action/max-book-seq`)
      .send({ ids: [], params: { bookTKt: f.book } });
    expect(action.body).toEqual({ kind: 'cells', rows: [{ BookSeq: 9 }] });

    const books = (await h.user.get(`${B}/lists/book-seq`)).body as PickList;
    expect(books.rows.some((r) => r[0] === f.book)).toBe(true);
    const upd = await h.user
      .post(`${B}/action/update-book-seq`)
      .send({ ids: [], params: { bookTKt: f.book } });
    expect(upd.status).toBe(200);
    const { rows } = await sql<{ id: number; BookSeq: number }>`
      SELECT TirthRakshaKm AS id, BookSeq FROM TirthRakshaM WHERE BookTKt = ${f.book} ORDER BY TirthRakshaKm`.execute(
      h.trx,
    );
    expect(rows).toEqual([
      { id: a, BookSeq: 1 },
      { id: b, BookSeq: 2 },
    ]);
  });

  it('adds to a new group, an existing one, and removes from it', async () => {
    const f = await fixtures();
    const save = async () =>
      (await h.user.post(`${B}/save`).send({ id: 0, fields: base(f) })).body.id as number;
    const a = await save();
    const b = await save();
    const top = await h.scalar(sql`SELECT ISNULL(MAX(GroupNo), 0) + 1 FROM TirthRakshaM`);
    const created = await h.user.post(`${B}/action/group-new`).send({ ids: [a, b] });
    expect(created.body).toEqual({
      kind: 'cells',
      rows: [{ GroupNo: top }],
      message: `2 Records Added in New GroupNo ${top} Successfully`,
    });
    const stamped = await record(a);
    expect(stamped.GroupNo).toBe(top);
    expect(Number(stamped.GroupNoModifiedBy)).toBeGreaterThan(0);
    expect(stamped.GroupNoModifiedDate).not.toBeNull();

    const groups = (await h.user.get(`${B}/lists/groups`)).body as PickList;
    expect(groups.rows.some((r) => r[0] === top)).toBe(true);
    const c = await save();
    const joined = await h.user
      .post(`${B}/action/group-existing`)
      .send({ ids: [c], params: { groupNo: top } });
    expect(joined.body.message).toBe(`1 Records Updated in GroupNo ${top} Successfully`);
    expect((await record(c)).GroupNo).toBe(top);
    const nothing = await h.user
      .post(`${B}/action/group-existing`)
      .send({ ids: [c], params: { groupNo: 0 } });
    expect(nothing.body).toEqual({ kind: 'message', message: '' });

    const removed = await h.user.post(`${B}/action/group-delete`).send({ ids: [a, c] });
    expect(removed.body.message).toBe('Groups Delete From 2 Records Successfully');
    expect((await record(a)).GroupNo).toBe(0);
    expect((await record(b)).GroupNo).toBe(top);
  });

  it('opens the books, refuses locks, and deletes with every child row', async () => {
    const f = await fixtures();
    const id = (
      await h.user.post(`${B}/save`).send({
        id: 0,
        fields: base(f, {
          'PetaVishayTran.Rows': [vishayRow(f.vishay, 1)],
          'KshetraTran.Rows': [{ TirthRakshaKshetraKm: -1, KshetraKt: f.kshetra, Seq: 1 }],
          'AuthTran.Rows': [{ TirthRakshaAuthorKm: -1, authortype: '', authorname: 'a', seq: 1 }],
          'AuthTran.Extra': [
            { TirthRakshaAuthorAuthorKm: -1, TirthRakshaAuthorKt: -1, authorkt: f.author, seq: 1 },
          ],
        }),
      })
    ).body.id as number;
    const bookMast = await h.scalar(sql`SELECT BookMastkt FROM BookT WHERE tid = ${f.book}`);
    const book = await h.user.post(`${B}/action/book-master`).send({ ids: [id] });
    expect(book.body).toMatchObject({ kind: 'open', screen: 'book-master', ids: [bookMast] });

    // No Locked column: Ctrl+L fails, as on the desktop.
    const lock = await h.user.post(`${B}/lock`).send({ ids: [id], lock: true, password: SECURITY });
    expect(lock.status).toBe(400);

    const logged = () =>
      h.scalar(
        sql`SELECT COUNT(*) FROM WorkReportM WHERE TableName = 'TirthRakshaM' AND RecordNo = ${String(id)}`,
      );
    const loggedBefore = await logged();
    expect((await h.user.post(`${B}/delete`).send({ ids: [id], password: 'no' })).status).toBe(401);
    expect((await h.user.post(`${B}/delete`).send({ ids: [id], password: SECURITY })).status).toBe(
      204,
    );
    const left = await h.scalar(sql`
      SELECT (SELECT COUNT(*) FROM TirthRakshaM WHERE TirthRakshaKm = ${id})
        + (SELECT COUNT(*) FROM TirthRakshaReferenceT WHERE TirthRakshaKt = ${id})
        + (SELECT COUNT(*) FROM TirthRakshaKshetraT WHERE TirthRakshaKt = ${id})
        + (SELECT COUNT(*) FROM TirthRakshaAuthorT WHERE TirthRakshaKt = ${id})
        + (SELECT COUNT(*) FROM TirthRakshaAuthorAuthorT WHERE TirthRakshaKt = ${id})
        + (SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = 'TirthRakshaPetaVishay' AND RecordKt = ${id})`);
    expect(left).toBe(0);
    expect(await logged()).toBe(loggedBefore);
  });

  it('needs a session', async () => {
    const agent = await h.signIn(3);
    expect((await agent.post(`${B}/list`).send({})).status).toBe(200);
    await agent.post('/api/auth/logout').send({ recordLogoutTime: false });
    expect((await agent.post(`${B}/list`).send({})).status).toBe(401);
    expect((await agent.post(`${B}/save`).send({ id: 0, fields: {} })).status).toBe(401);
  });
});
