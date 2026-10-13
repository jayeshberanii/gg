import 'reflect-metadata';
import type { DB } from '@gglib/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { GridRow, MasterMeta, PickList, SaveResult, TransGrid } from '@gglib/shared';
import { type ControlledTransaction, sql } from 'kysely';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { encodeLegacyPassword } from '../src/auth/legacy-password.js';
import { loadEnv } from '../src/config/env.js';
import { configureApp } from '../src/configure-app.js';
import { createDatabase, type Database, KYSELY } from '../src/db/db.module.js';

/**
 * Master › Author Master through the master engine, against the real DB inside a transaction
 * that is rolled back after every test. See docs/screens/author-master.md.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);
const PASSWORD = 'Secret1';
const SECURITY = 'sec-test-1';
const AUTHOR_LOCK = 'author-lock-test';
const API = '/api/master/author-master';

describe.skipIf(!hasDb)('Author Master via the master engine (integration)', () => {
  let db: Database;
  let trx: ControlledTransaction<DB>;
  let app: NestExpressApplication;
  let alice: request.Agent;
  let aliceId: number;
  let doneByKt: number;
  let bookTKt: number;
  let existingAuthorId: number;
  let samvatKindKt: number;

  beforeAll(() => {
    db = createDatabase(loadEnv());
  });
  afterAll(async () => {
    await db.destroy();
  });

  const one = async <T>(q: ReturnType<typeof sql<T>>) => (await q.execute(trx)).rows[0]!;

  beforeEach(async () => {
    trx = await db.startTransaction().execute();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      SECURITY_PASSWORD: SECURITY,
      AUTHOR_LOCK_PASSWORD: AUTHOR_LOCK,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
      .overrideProvider(KYSELY)
      .useValue(trx)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();
    const name = `mtauthor${Date.now() % 1_000_000}`;
    await sql`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 0, 0, 0, 1, 0, 1, 3, '08:00')
    `.execute(trx);
    aliceId = Number(
      (await one(sql<{ id: number }>`SELECT tid AS id FROM Usecurity WHERE uname = ${name}`)).id,
    );
    alice = request.agent(app.getHttpServer());
    expect(
      (await alice.post('/api/auth/login').send({ username: name, password: PASSWORD })).status,
    ).toBe(200);

    doneByKt = Number(
      (
        await one(
          sql<{
            id: number;
          }>`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = 'DoneBy'`,
        )
      ).id,
    );
    bookTKt = Number(
      (
        await one(
          sql<{ id: number }>`SELECT TOP 1 tid AS id FROM BookT WHERE ISNULL(LibNo, '') <> ''`,
        )
      ).id,
    );
    existingAuthorId = Number(
      (
        await one(
          sql<{ id: number }>`SELECT TOP 1 authorcokm AS id FROM authmast ORDER BY authorcokm`,
        )
      ).id,
    );
    samvatKindKt = Number(
      (
        await one(
          sql<{
            id: number;
          }>`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = 'AuthSamKind' AND Name = N'दी.सं.'`,
        )
      ).id,
    );
  });

  afterEach(async () => {
    await app.close();
    await trx.rollback().execute();
  });

  const nextRecordNo = async () =>
    Number(
      (await one(sql<{ n: number }>`SELECT ISNULL(MAX(recordno), 0) + 1 AS n FROM Authmast`)).n,
    );

  async function addAuthor(fields: Record<string, unknown>): Promise<SaveResult> {
    const res = await alice.post(`${API}/save`).send({
      id: 0,
      fields: {
        authorname: 'Muni Test',
        recordno: await nextRecordNo(),
        donebykt: doneByKt,
        ...fields,
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as SaveResult;
  }

  it('describes the screen and starts a new record at the next RecordNo', async () => {
    const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
    expect(meta).toMatchObject({ transactionName: 'authmast', primaryColumn: 'authorcokm' });
    const defaults = (await alice.get(`${API}/new-defaults`)).body as GridRow;
    expect(defaults.recordno).toBe(await nextRecordNo());
  });

  it('validates as GetValidationMessage does, RecordNo included for a new record', async () => {
    const blank = await alice.post(`${API}/save`).send({ id: 0, fields: { authorname: '  ' } });
    expect(blank.body.message).toBe('Please Enter Name');
    const noDoneBy = await alice
      .post(`${API}/save`)
      .send({ id: 0, fields: { authorname: 'X', donebykt: 0 } });
    expect(noDoneBy.body.message).toBe('Please Enter DoneBy');
    const existingNo = Number(
      (await one(sql<{ n: number }>`SELECT TOP 1 recordno AS n FROM authmast WHERE recordno > 0`))
        .n,
    );
    const dup = await alice
      .post(`${API}/save`)
      .send({ id: 0, fields: { authorname: 'X', donebykt: doneByKt, recordno: existingNo } });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toBe('RecordNo Already Exists');
  });

  it("serves a popup's rows and columns from tblSearch, and its cell lists", async () => {
    const guru = (await alice.get(`${API}/trans/AuthorGuruTran/${existingAuthorId}`))
      .body as TransGrid;
    expect(guru.columns.map((c) => c.name)).toEqual(['GuruKt', 'GuruName', 'IsPrint', 'Seq']);
    expect(guru.columns.find((c) => c.name === 'IsPrint')!.type).toBe('bit');
    const anyName = (await alice.get(`${API}/trans/AuthMAnyNmTran/0`)).body as TransGrid;
    expect(anyName.rows).toEqual([]);
    expect(anyName.columns[0]!.name).toBe('AuthAnyaNmKm');
    expect(anyName.extra!.columns.map((c) => c.name)).toContain('AuthMAnyLibNoKm');
    const kruti = (await alice.get(`${API}/trans/AuthUnavailKrutiTran/0`)).body as TransGrid;
    expect(Number(kruti.defaults!.krutino)).toBeGreaterThan(0);
    expect((await alice.get(`${API}/trans/NotAPopup/0`)).status).toBe(404);

    const types = (
      await alice.post(`${API}/trans/AuthMContactTran/lookup/authcontacttype`).send({ row: {} })
    ).body as PickList;
    expect(types.columns).toEqual(['TId', 'Vishesh']);
    const contacts = (
      await alice
        .post(`${API}/trans/AuthMContactTran/lookup/authorcontact`)
        .send({ row: { authContctTypekt: types.rows[0]?.[0] ?? 0 } })
    ).body as PickList;
    expect(Array.isArray(contacts.rows)).toBe(true);
  });

  it('adds a record with its popups, deriving the text and Samvat columns as the desktop does', async () => {
    const saved = await addAuthor({
      Sign: 'MS',
      AuthorGuruTran: 'Guru Name-False',
      SampradayTran: 'Sampraday text',
      AuthorIdentityTran: 'Identity text',
      AuthorNameRefBookTKt: bookTKt,
      AuthorNameRefPgNo: '12',
      IsGuru: true,
      'AuthMAnyNmTran.Rows': [
        { AuthAnyaNmKm: -1, AnyaName: 'Alt One', IsPrint: true, Seq: 1 },
        { AuthAnyaNmKm: -2, AnyaName: 'Alt Two', IsPrint: false, Seq: 2 },
      ],
      'AuthMAnyNmTran.Extra': [{ AuthMAnyLibNoKm: 0, AuthAnyaNmKt: -2, BookTKt: bookTKt, Seq: 1 }],
      'AuthorParamparaTran.Rows': [
        { AuthorParamparaKm: 1, Guru1kt: existingAuthorId, PageNo: '5', IsPrint: true, seq: 1 },
      ],
      'AuthorVishTran.Rows': [{ AuthorVishKm: 1, Vishkt: 0, Remark: 'r', seq: 1 }],
      'AuthMContactTran.Rows': [{ authMContactkm: 1, remark: 'c', seq: 1 }],
      'AuthMSubTran.Rows': [{ AuthMsubkm: 1, remark: 's', seq: 1 }],
      'AuthUnavailKrutiTran.Rows': [{ AuthUnavailKrutiTKm: 1, krutinm: 'k', krutino: 7, seq: 1 }],
      'SamvatTran.Rows': [
        {
          AuthorSamvatKm: 0,
          SamvatKindKt: samvatKindKt,
          SamvatKindName: 'दी.सं.',
          Vksamvat: 1990,
          IsPrint: false,
          seq: 1,
        },
        {
          AuthorSamvatKm: 0,
          SamvatKindKt: samvatKindKt,
          SamvatKindName: 'x',
          Vksamvat: 2001,
          IsPrint: true,
          seq: 2,
        },
      ],
    });
    const id = saved.id;
    const row = await one(
      sql<Record<string, unknown>>`SELECT * FROM authmast WHERE authorcokm = ${id}`,
    );
    expect(row).toMatchObject({
      txtAuthorName: 'Muni Test(Alt One,Alt Two)(MS)',
      txtGuru: 'Guru Name-False',
      txtSampraday: 'Sampraday text',
      Identyty: 'Identity text',
      vksamvat: 2001,
      samvatkindkt: samvatKindKt,
      enuser: aliceId,
      IsGuru: true,
      AuthorNameRefBookTKt: bookTKt,
      AuthorNameRefPgNo: '12',
      Sampradaykt: 0,
    });
    const counts = await one(sql<Record<string, number>>`
      SELECT (SELECT COUNT(*) FROM AuthMAnyNmT WHERE AuthmastKt = ${id}) AS anyName,
        (SELECT COUNT(*) FROM AuthMAnyLibNoT L JOIN AuthMAnyNmT N ON L.AuthAnyaNmKt = N.AuthAnyaNmKm
          WHERE N.AuthmastKt = ${id} AND N.AnyaName = 'Alt Two') AS lib,
        (SELECT COUNT(*) FROM AuthorParamparaT WHERE Authorkt = ${id}) AS parampara,
        (SELECT COUNT(*) FROM AuthorVishT WHERE Authorkt = ${id}) AS vish,
        (SELECT COUNT(*) FROM AuthMContactT WHERE authmastkt = ${id}) AS contact,
        (SELECT COUNT(*) FROM AuthMSubT WHERE authorcokt = ${id}) AS subj,
        (SELECT COUNT(*) FROM AuthUnavailKrutiT WHERE authorcokt = ${id} AND enuser = ${aliceId}) AS kruti,
        (SELECT COUNT(*) FROM AuthorSamvatT WHERE AuthorKt = ${id}) AS samvat`);
    expect(counts).toEqual({
      anyName: 2,
      lib: 1,
      parampara: 1,
      vish: 1,
      contact: 1,
      subj: 1,
      kruti: 1,
      samvat: 2,
    });

    // A new record is logged as New (insertworkreports with no old row).
    const wr = await one(sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM WorkReportM W JOIN columnmaster C ON W.WorkTypeGId = C.ColumnMastkm
      WHERE W.TableName = 'authmast' AND W.RecordNo = ${String(id)} AND W.DoneByGId = ${aliceId} AND C.Name = 'New'`);
    expect(Number(wr.n)).toBe(1);

    const record = (await alice.get(`${API}/record/${id}`)).body as GridRow;
    expect(record.AuthMAnyNmTran).toContain('Alt One');
    expect(record.SignInfo).toBe('');
    expect(
      ((await alice.get(`${API}/record/${id}/entry`)).body as { text: string }).text,
    ).toContain(' | ');
  });

  it('edits only the popups that were opened, renames into AnyaName, and asks for the work type', async () => {
    const recordno = await nextRecordNo();
    // Entered by someone else, so this user's modification is logged (and asked about).
    const { id } = await one(sql<{ id: number }>`
      INSERT INTO authmast (authorname, recordno, donebykt, txtAuthorName) OUTPUT INSERTED.authorcokm AS id
      VALUES ('Old Name', ${recordno}, ${doneByKt}, 'Old Name')`);
    await sql`INSERT INTO AuthorGuruT (AuthorKt, GuruKt, IsPrint, Seq) VALUES (${id}, ${existingAuthorId}, 0, 1)`.execute(
      trx,
    );
    await sql`INSERT INTO AuthorPattavaliT (AuthorKt, PattavaliSeq, Seq) VALUES (${id}, '1', 1)`.execute(
      trx,
    );
    const pattavaliId = Number(
      (
        await one(
          sql<{
            k: number;
          }>`SELECT AuthorPattavaliKm AS k FROM AuthorPattavaliT WHERE AuthorKt = ${id}`,
        )
      ).k,
    );

    const res = await alice.post(`${API}/save`).send({
      id,
      fields: {
        authorname: 'New Name',
        recordno,
        donebykt: doneByKt,
        boolAddAnyaName: 1,
        'AuthorPattavaliTran.Rows': [
          { AuthorPattavaliKm: pattavaliId, PattavaliSeq: '1-edited', Seq: 1 },
          { AuthorPattavaliKm: 0, PattavaliSeq: '2', Seq: 2 },
        ],
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const result = res.body as SaveResult;
    // The guru popup was not opened: its row stays.
    expect(
      Number(
        (
          await one(
            sql<{ n: number }>`SELECT COUNT(*) AS n FROM AuthorGuruT WHERE AuthorKt = ${id}`,
          )
        ).n,
      ),
    ).toBe(1);
    const pattavali = (
      await sql<{ k: number; s: string }>`
      SELECT AuthorPattavaliKm AS k, PattavaliSeq AS s FROM AuthorPattavaliT WHERE AuthorKt = ${id} ORDER BY Seq`.execute(
        trx,
      )
    ).rows;
    expect(pattavali.map((p) => p.s)).toEqual(['1-edited', '2']);
    expect(Number(pattavali[0]!.k)).toBe(pattavaliId);
    // The old name became an any name.
    expect(
      (
        await one(
          sql<{ a: string }>`SELECT AnyaName AS a FROM AuthMAnyNmT WHERE AuthmastKt = ${id}`,
        )
      ).a,
    ).toBe('Old Name');

    expect(result.workReport).toMatchObject({ recordId: id });
    expect(result.workReport!.remark).toContain('authorname(New Name)');
    const types = (await alice.get(`${API}/work-report-types`)).body as PickList;
    const modify = types.rows.find((r) => r[1] === 'Modify')!;
    const logged = await alice.post(`${API}/work-report-log/${id}`).send({
      workTypeId: Number(modify[0]),
      mistake: result.workReport!.mistake,
      remark: result.workReport!.remark,
      mistakeCount: result.workReport!.mistakeCount,
    });
    expect(logged.status).toBe(204);
    const wr = await one(sql<{ Remark: string; MistakeCount: number }>`
      SELECT Remark, MistakeCount FROM WorkReportM WHERE TableName = 'authmast' AND RecordNo = ${String(id)} AND DoneByGId = ${aliceId}`);
    expect(wr.Remark).toContain('authorname(New Name)');
  });

  it('upserts the Samvat rows by key and clears only references to removed rows (v3.4.3.1)', async () => {
    const samvat = (over: Record<string, unknown>) => ({
      AuthorSamvatKm: 0,
      SamvatKindKt: samvatKindKt,
      SamvatKindName: 'दी.सं.',
      Remark: '',
      AsamvatKt: 0,
      Asamvat: '',
      Vksamvat: 1500,
      BookTKt: 0,
      PageNo: '',
      SthalKt: 0,
      IsPrint: false,
      seq: 1,
      ...over,
    });
    const { id } = await addAuthor({
      'SamvatTran.Rows': [samvat({ Remark: 'keep', seq: 1 }), samvat({ Remark: 'drop', seq: 2 })],
    });
    const keys = async () =>
      (
        await sql<{ k: number; r: string }>`
          SELECT AuthorSamvatKm AS k, Remark AS r FROM AuthorSamvatT WHERE AuthorKt = ${id} ORDER BY seq`.execute(
          trx,
        )
      ).rows.map((r) => ({ k: Number(r.k), r: r.r }));
    const [keep, drop] = await keys();
    expect([keep!.r, drop!.r]).toEqual(['keep', 'drop']);

    // Another author refers to each row; this author refers to the row that stays.
    const other = async (ref: number) =>
      Number(
        (
          await one(sql<{ id: number }>`
            INSERT INTO authmast (authorname, recordno, donebykt, RefSamvatKt) OUTPUT INSERTED.authorcokm AS id
            VALUES ('Ref', ${(await nextRecordNo()) + ref}, ${doneByKt}, ${ref})`)
        ).id,
      );
    const refKeep = await other(keep!.k);
    const refDrop = await other(drop!.k);
    const ref = async (author: number) =>
      (
        await one(
          sql<{
            r: number | null;
          }>`SELECT RefSamvatKt AS r FROM authmast WHERE authorcokm = ${author}`,
        )
      ).r;

    const res = await alice.post(`${API}/save`).send({
      id,
      fields: {
        authorname: 'Muni Test',
        recordno: (
          await one(sql<{ n: number }>`SELECT recordno AS n FROM authmast WHERE authorcokm = ${id}`)
        ).n,
        donebykt: doneByKt,
        RefSamvatKt: keep!.k,
        'SamvatTran.Rows': [
          samvat({ AuthorSamvatKm: keep!.k, Remark: 'kept and edited', Vksamvat: 1501, seq: 1 }),
          samvat({ Remark: 'new', seq: 2 }),
        ],
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = await keys();
    // The kept row keeps its key and takes the edit; the dropped one is gone; the new one is new.
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual({ k: keep!.k, r: 'kept and edited' });
    expect(after[1]!.r).toBe('new');
    expect([keep!.k, drop!.k]).not.toContain(after[1]!.k);
    // References to the kept row stay (this author's own too); the one to the removed row is cleared.
    expect(await ref(id)).toBe(keep!.k);
    expect(await ref(refKeep)).toBe(keep!.k);
    expect(await ref(refDrop)).toBeNull();

    // A save that never opened the popup leaves the rows alone.
    await alice.post(`${API}/save`).send({
      id,
      fields: { authorname: 'Muni Test', recordno: res.body.row.recordno, donebykt: doneByKt },
    });
    expect(await keys()).toEqual(after);
  });

  it('lists the Library Nos the selected authors refer to (Show In Use › BookT, v3.4.3.1)', async () => {
    const { rows: books } = await sql<{
      tid: number;
    }>`SELECT TOP 3 tid FROM BookT ORDER BY tid`.execute(trx);
    const [nameRef, printed, notPrinted] = books.map((b) => Number(b.tid));
    const { id } = await addAuthor({
      AuthorNameRefBookTKt: nameRef,
      'SamvatTran.Rows': [
        {
          AuthorSamvatKm: 0,
          SamvatKindKt: samvatKindKt,
          SamvatKindName: 'दी.सं.',
          Vksamvat: 1500,
          BookTKt: printed,
          IsPrint: true,
          seq: 1,
        },
        {
          AuthorSamvatKm: 0,
          SamvatKindKt: samvatKindKt,
          SamvatKindName: 'दी.सं.',
          Vksamvat: 1500,
          BookTKt: notPrinted,
          IsPrint: false,
          seq: 2,
        },
      ],
    });
    const found = await alice.post(`${API}/action/in-use-book-t`).send({ ids: [id] });
    expect(found.status, JSON.stringify(found.body)).toBe(200);
    expect(found.body).toMatchObject({ kind: 'open', screen: 'book-tran', emptyMessage: '' });
    expect([...(found.body.ids as number[])].sort((a, b) => a - b)).toEqual(
      [nameRef, printed].sort((a, b) => a! - b!),
    );
    const none = await alice.post(`${API}/action/in-use-book-t`).send({ ids: [] });
    expect(none.body.ids).toEqual([]);
  });

  it('refuses to delete an author in use, and logs a delete', async () => {
    const used = await addAuthor({
      'AuthMAnyNmTran.Rows': [{ AuthAnyaNmKm: -1, AnyaName: 'Alt', Seq: 1 }],
    });
    const refused = await alice.post(`${API}/delete`).send({ ids: [used.id], password: SECURITY });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe('Record is used in Author AnyName');

    const free = await addAuthor({ authorname: 'Gone Soon' });
    expect(
      (await alice.post(`${API}/delete`).send({ ids: [free.id], password: SECURITY })).status,
    ).toBe(204);
    const wr = await one(sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM WorkReportM WHERE TableName = 'authmast' AND RecordNo = ${String(free.id)} AND Remark = 'Delete Gone Soon'`);
    expect(Number(wr.n)).toBe(1);
  });

  it('runs the right-click actions', async () => {
    const a = await addAuthor({});
    const post = (name: string, body: object) => alice.post(`${API}/action/${name}`).send(body);

    const marked = await post('mark-physically-checked', { ids: [a.id] });
    expect(marked.body).toMatchObject({ kind: 'refreshed', message: 'completed marking' });
    expect(marked.body.rows[0].authorcokm).toBe(a.id);

    const sadiKt = Number(
      (
        await one(
          sql<{
            id: number;
          }>`SELECT TOP 1 ColumnMastKm AS id FROM columnmaster WHERE Vibhag = 'LinkWithSadi'`,
        )
      ).id,
    );
    const sadi = await post('set-link-with-sadi', { ids: [a.id], params: { linkSadiKt: sadiKt } });
    expect(sadi.body.message).toBe('Total (1) records updated successfully');

    const badLock = await post('lock-author', { ids: [a.id], params: { password: SECURITY } });
    expect(badLock.status).toBe(401);
    expect(
      (await post('lock-author', { ids: [a.id], params: { password: AUTHOR_LOCK } })).status,
    ).toBe(200);
    expect(
      Boolean(
        (
          await one(
            sql<{
              l: boolean;
            }>`SELECT IsLockedByAdmin AS l FROM authmast WHERE authorcokm = ${a.id}`,
          )
        ).l,
      ),
    ).toBe(true);

    const locked = await post('lock-records', { ids: [a.id], params: { password: SECURITY } });
    expect(locked.body.message).toBe('(1 ) Records Locked Successfully');

    const inUse = await post('records-in-use', {
      ids: [],
      params: { selection: '8', condType: 'And' },
    });
    expect(inUse.body.kind).toBe('list');

    const dup = await post('find-duplicate-recno', {
      ids: [],
      params: { gridIds: [a.id, existingAuthorId] },
    });
    expect(dup.body).toMatchObject({ kind: 'table', columns: [] });

    const info = await post('author-info', { ids: [a.id] });
    expect(info.body.columns).toEqual([
      'RecordNo',
      'Name',
      'AnyaName2',
      'Guru',
      'Sampraday',
      'Samvat',
    ]);

    const tree = await post('tree-links', {
      ids: [a.id],
      params: { uplevel: true, guruParampara: true },
    });
    expect(tree.body.columns).toEqual(['Authorkt', 'Guru1kt', 'Guru']);

    const report = await post('author-report', { ids: [a.id] });
    expect(report.body.kind).toBe('report');
    expect(report.body.document.title).toBe('Author Report');

    const lists = (await alice.get(`${API}/lists/pattavali`)).body as PickList;
    expect(lists.columns).toEqual(['ColumnMastkm', 'Name']);
  });

  it('keeps F1 reference edits to administrators', async () => {
    const help = await alice.get(`${API}/help/donebykt`);
    expect(help.status).toBe(200);
    const denied = await alice.post(`${API}/help/donebykt`).send({ rows: [] });
    expect(denied.status).toBe(403);
  });
});
