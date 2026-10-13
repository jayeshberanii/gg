import 'reflect-metadata';
import type { DB } from '@gglib/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  ActionResult,
  GridRow,
  MasterMeta,
  PickList,
  SaveResult,
  TransGrid,
} from '@gglib/shared';
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
 * Library › Book Master (and its Library No form) through the master engine, against the real
 * DB inside a transaction that is rolled back after every test. See docs/screens/book-master.md.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);
const PASSWORD = 'Secret1';
const SECURITY = 'sec-test-1';
const LOCK = 'book-lock-test';
const API = '/api/master/book-master';
const BOOKT = '/api/master/book-tran';

describe.skipIf(!hasDb)(
  'Book Master via the master engine (integration)',
  { timeout: 60_000 },
  () => {
    let db: Database;
    let trx: ControlledTransaction<DB>;
    let app: NestExpressApplication;
    let op: request.Agent;
    let admin: request.Agent;
    let opId: number;
    let bhashaKt: number;
    let lipiKt: number;
    let prakKt: number;
    let authorKt: number;
    let authTypeKt: number;
    let vishColKt: number;
    let vibhagKt: number;
    let vishayKt: number;

    beforeAll(() => {
      db = createDatabase(loadEnv());
    });
    afterAll(async () => {
      await db.destroy();
    });

    const one = async <T>(q: ReturnType<typeof sql<T>>) => (await q.execute(trx)).rows[0]!;
    const count = async (q: ReturnType<typeof sql<{ n: number }>>) => Number((await one(q)).n);

    async function login(userType: number, isAdmin: boolean) {
      const name = `mtbook${userType}${Date.now() % 1_000_000}`;
      await sql`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 0, 0, 0, 1, ${isAdmin ? 1 : 0}, 1, ${userType}, '08:00')
    `.execute(trx);
      const id = Number(
        (await one(sql<{ id: number }>`SELECT tid AS id FROM Usecurity WHERE uname = ${name}`)).id,
      );
      const agent = request.agent(app.getHttpServer());
      expect(
        (await agent.post('/api/auth/login').send({ username: name, password: PASSWORD })).status,
      ).toBe(200);
      return { id, agent };
    }

    beforeEach(async () => {
      trx = await db.startTransaction().execute();
      const env = loadEnv({
        ...process.env,
        NODE_ENV: 'test',
        SECURITY_PASSWORD: SECURITY,
        AUTHOR_LOCK_PASSWORD: LOCK,
      });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
        .overrideProvider(KYSELY)
        .useValue(trx)
        .compile();
      app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
      configureApp(app, env);
      await app.init();
      ({ id: opId, agent: op } = await login(3, false));
      ({ agent: admin } = await login(1, true));
      const first = async (q: ReturnType<typeof sql<{ id: number }>>) => Number((await one(q)).id);
      bhashaKt = await first(sql`SELECT TOP 1 bhashacokm AS id FROM bhasmast ORDER BY bhashacokm`);
      lipiKt = await first(sql`SELECT TOP 1 lipicodekm AS id FROM lipimast ORDER BY lipicodekm`);
      prakKt = await first(sql`SELECT TOP 1 prakcodekm AS id FROM prakmast ORDER BY prakcodekm`);
      authorKt = await first(sql`SELECT TOP 1 authorcokm AS id FROM authmast ORDER BY authorcokm`);
      authTypeKt = await first(
        sql`SELECT TOP 1 authtycokm AS id FROM authtype WHERE ISNULL(authortype, '') <> '' AND ISNULL(authtyattr, '') <> authortype ORDER BY authtycokm`,
      );
      vishColKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE vibhag = 'vishcol' AND columnno > 0`,
      );
      vibhagKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = N'Head'`,
      );
      vishayKt = await first(
        sql`SELECT TOP 1 vishaycokm AS id FROM vishay WHERE ISNULL(vishay_nm, '') <> ''`,
      );
    });

    afterEach(async () => {
      await app.close();
      await trx.rollback().execute();
    });

    async function save(agent: request.Agent, id: number, fields: Record<string, unknown>) {
      return agent.post(`${API}/save`).send({ id, fields });
    }

    async function addBook(fields: Record<string, unknown> = {}): Promise<SaveResult> {
      const res = await save(op, 0, { BookName: 'Pustak Test', ...fields });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return res.body as SaveResult;
    }

    it('lists the newest 100 books, without CM/MS/CP/SN numbers for an Operator', async () => {
      const meta = (await op.get(`${API}/meta`)).body as MasterMeta;
      expect(meta).toMatchObject({ transactionName: 'BookM', primaryColumn: 'BookMastkm' });
      const opRows = (await op.post(`${API}/list`).send({})).body as GridRow[];
      expect(opRows.length).toBeLessThanOrEqual(100);
      expect(opRows.some((r) => /CM|ms|CP|SN/i.test(String(r.txtBookTran ?? '')))).toBe(false);
      const adminRows = (await admin.post(`${API}/list`).send({})).body as GridRow[];
      expect(adminRows).toHaveLength(100);
      const max = Number(
        (await one(sql<{ id: number }>`SELECT MAX(BookMastkm) AS id FROM BookM`)).id,
      );
      expect(Number(adminRows[0]!.BookMastkm)).toBe(max);
      expect(Object.keys(adminRows[0]!)).toEqual(
        expect.arrayContaining([
          'txtBookName',
          'txtPrakashak',
          'txtAuthor',
          'txtBookTran',
          'LibNoCount',
          'IsPrint',
        ]),
      );
    });

    it('validates as Save() does', async () => {
      expect((await save(op, 0, { BookName: ' ' })).body.message).toBe('Please Enter BookName');
      const { id } = await addBook();
      expect((await save(op, id, { BookName: 'X', BookTran: '' })).body.message).toBe(
        'Please Enter LibNo in BookT',
      );
      const missing = await save(op, id, { BookName: 'X', BookTran: 'B000001', Pages: '10' });
      expect(missing.body.message).toBe(
        'Please Enter Required Fields:\r\n- Smvt Type\r\n- Avruti\r\n- GMalaName\r\n- TotPgs\r\n- Price\r\n- Size\r\n- Shape\r\n- Prakashak\r\n- Author\r\n- Bhasha\r\n- Lipi',
      );
      expect((await save(op, id, { BookName: 'X', BookTran: 'OB0001' })).status).toBe(200);
      const bad = await save(op, id, { BookName: 'X', BookTran: 'OB0001', Nakal: 'abc' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toMatch(/Conversion failed/);
    });

    it('adds a book with its popups, as Save() writes them', async () => {
      const saved = await addBook({
        ParichayakName: 'Pari',
        PSamvatcokt: 2,
        PSamvat: '2070',
        PSamvatVK: '2070',
        Grpno: '0',
        GrpName: 'ignored',
        IsPrint: true,
        BhasTran: 'x',
        LipiTran: 'y',
        PrakTran: 'z',
        VibhagTran: 'v',
        MagazineRemarkTran: 'm',
        'BhasTran.Rows': [
          { prakshnbhashakm: 0, prakshnokt: 0, bhashakt: bhashaKt, bhasa_attr: 'a', seq: 1 },
          { prakshnbhashakm: 0, prakshnokt: 0, bhashakt: 0, bhasa_attr: '', seq: 2 },
        ],
        'LipiTran.Rows': [
          { prakshnlipikm: 0, prakashankt: 0, lippikt: lipiKt, lipi_attr: 'l', seq: 1 },
        ],
        'PrakTran.Rows': [
          {
            prashnprakkm: 0,
            prakashannokt: 0,
            prakashakkt: prakKt,
            prakname: 'Prak',
            purva: true,
            nameSelected: 'Chosen ',
            PrakTypekt: 0,
            PrakType: '',
            Remark: 'r',
            signkt: 0,
            sign: '',
            seq: 1,
          },
        ],
        'VibhagTran.Rows': [
          { BookMastKt: 0, BookVibhagKm: 0, VibhagKt: vibhagKt, VibhagName: 'V', seq: 1 },
        ],
        'MagazineRemarkTran.Rows': [
          { BookMagazineRemarkKm: -3, Remark: 'Rem', RefPageNo: '4', Seq: 1 },
        ],
        'AuthTran.Rows': [
          { prakashannokt: 0, praksnauthorkm: -1, authortype: 'Type', authorname: 'Auth', seq: 1 },
        ],
        'AuthTran.Extra': [
          {
            prakashannokt: 0,
            praksnauthorauthkm: 0,
            praksnauthorkt: -1,
            authorkt: authorKt,
            authorname: 'A',
            AuthAnyaNmKt: 0,
            AnyaName: 'Anya',
            padkt: 0,
            Padvi: '',
            Guru: 'G',
            identyty: 'I',
            signkt: 0,
            Sign: '',
            seq: 1,
          },
        ],
        'AuthTran.Extra2': [
          {
            prakashannokt: 0,
            praksnauthorauthtypekm: 0,
            praksnauthorkt: -1,
            authortypekt: authTypeKt,
            authortype: 'T',
            signkt: 0,
            Sign: '',
            seq: 1,
          },
        ],
        'praksnVisheshTran.Rows': [
          {
            prksnvisheshkm: -7,
            Mark1: 0,
            ColumnMastkt: vishColKt,
            ColumnNo: 1,
            ColumnName: 'C',
            Detail: 'D',
            RefPgno: '9',
            Mark2: 0,
            seq: 3,
            title: '',
            DoneByKt: 0,
            DetailSummary: 'S',
            PrCpNo: '',
          },
        ],
        'praksnVisheshTran.Extra': [
          {
            prakashannokt: 0,
            praksnVishAutkm: 0,
            prksnvisheshkt: -7,
            Authorkt: authorKt,
            authorname: 'A',
            AuthAnyaNmKt: 0,
            AnyaName: 'A',
            Identyty: '',
            padkt: 0,
            padvi: '',
            signkt: 0,
            sign: '',
            seq: 1,
          },
        ],
        'praksnVisheshTran.Extra2': [
          {
            prakashannokt: 0,
            praksnVishBhakm: 0,
            prksnvisheshkt: -7,
            bhashakt: bhashaKt,
            bhashaname: 'B',
            bhasa_attr: 'b',
            seq: 1,
          },
        ],
        'praksnVisheshTran.Extra3': [
          {
            Id: 0,
            RecordKt: -7,
            VishayKt: vishayKt,
            Vishay: 'x',
            VachanKt: 0,
            Vachan: '',
            VibhaktiKt: 0,
            Vibhakti: '',
            AnyaNameKt: 0,
            Seq: 1,
          },
          {
            Id: 0,
            RecordKt: -7,
            VishayKt: 0,
            Vishay: '',
            VachanKt: 0,
            Vachan: '',
            VibhaktiKt: 0,
            Vibhakti: '',
            AnyaNameKt: 0,
            Seq: 0,
          },
        ],
      });
      const id = saved.id;
      const book = await one(
        sql<Record<string, unknown>>`SELECT * FROM BookM WHERE BookMastkm = ${id}`,
      );
      expect(book).toMatchObject({
        BookName: 'Pustak Test',
        GrpName: '',
        KrutiHeadKt: 0,
        IsPrint: true,
        enuser: opId,
        KNo: '',
      });
      expect(String(book.txtPrakashak)).toBe('(P), Chosen');
      expect(String(book.txtAuthor)).toMatch(/^.+-Anya\(G\)\[I\]$/);
      // v3.4.3.1: the type's name (authtype.authortype), no longer its attribute.
      const typeName = (
        await one(
          sql<{ t: string }>`SELECT authortype AS t FROM authtype WHERE authtycokm = ${authTypeKt}`,
        )
      ).t.trim();
      expect(String(book.txtAuthor).startsWith(typeName)).toBe(true);
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM BookT WHERE BookMastkt = ${id} AND MainL = 1 AND seq = 1`,
        ),
      ).toBe(1);
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM praksnBhashaT WHERE prakshnokt = ${id}`),
      ).toBe(1);
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM praksnLipiT WHERE prakashankt = ${id}`),
      ).toBe(1);
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM praksnPrakT WHERE prakashannokt = ${id} AND prashnprakkm = 0 AND nameSelected = N'Chosen '`,
        ),
      ).toBe(1);
      expect(await count(sql`SELECT COUNT(*) AS n FROM BookVibhagT WHERE BookMastKt = ${id}`)).toBe(
        1,
      );
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM BookMagazineRemarkT WHERE BookMastKt = ${id}`),
      ).toBe(1);
      const author = await one(
        sql<{
          km: number;
          txt: string;
        }>`SELECT praksnauthorkm AS km, txtAuth AS txt FROM praksnAuthorT WHERE prakashannokt = ${id}`,
      );
      expect(author.txt).toBe('Type-Auth');
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM praksnAuthorAuthT WHERE praksnauthorkt = ${author.km}`,
        ),
      ).toBe(1);
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM PraksnAuthorAuthTypeT WHERE praksnauthorkt = ${author.km}`,
        ),
      ).toBe(1);
      // v3.4.3.1 UpdateTxtAuthor (here through Replace Author Type, same type both ways) rebuilds
      // txtAuth from the type's name, and the type list no longer shows the attribute.
      const replaced = await op
        .post(`${API}/action/replace-author-type`)
        .send({ ids: [id], params: { from: authTypeKt, to: authTypeKt } });
      expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
      const rebuilt = await one(
        sql<{
          txt: string;
        }>`SELECT txtAuth AS txt FROM praksnAuthorT WHERE praksnauthorkm = ${author.km}`,
      );
      expect(rebuilt.txt.startsWith(typeName)).toBe(true);
      const types = (await op.post(`${API}/trans/AuthTran/lookup/authortype`).send({ row: {} }))
        .body as PickList;
      expect(types.columns).toEqual(['authtycokm', 'authortype']);
      const vishesh = await one(
        sql<{
          km: number;
          txtDetail: string;
        }>`SELECT prksnvisheshkm AS km, txtDetail FROM praksnVisheshT WHERE prakashannokt = ${id}`,
      );
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM PraksnVishAutT WHERE prksnvisheshkt = ${vishesh.km}`,
        ),
      ).toBe(1);
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM PraksnVishBhasT WHERE prksnvisheshkt = ${vishesh.km}`,
        ),
      ).toBe(1);
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM VishayEntry WHERE TransactionName = 'BookVisheshDetail' AND RecordKt = ${vishesh.km}`,
        ),
      ).toBe(1);
      expect(String(vishesh.txtDetail)).not.toBe('');
      // The popup rows come back through tblSearch, with the appended detail tables.
      const grid = (await op.get(`${API}/trans/praksnVisheshTran/${id}`)).body as TransGrid;
      expect(grid.rows).toHaveLength(1);
      expect(grid.extras).toHaveLength(4);
      expect(grid.extras![2]!.rows).toHaveLength(1);
    });

    it('keeps the child rows on an edit that leaves their boxes, and keeps Vishesh details on a re-save', async () => {
      const { id } = await addBook({
        PrakTran: 'z',
        'PrakTran.Rows': [
          {
            prashnprakkm: 0,
            prakashakkt: prakKt,
            prakname: 'P',
            purva: false,
            nameSelected: '',
            PrakTypekt: 0,
            PrakType: '',
            Remark: '',
            signkt: 0,
            sign: '',
            seq: 1,
          },
        ],
        'praksnVisheshTran.Rows': [
          { prksnvisheshkm: -1, ColumnMastkt: vishColKt, Detail: 'D', RefPgno: '1', seq: 1 },
        ],
        'praksnVisheshTran.Extra3': [
          { Id: 0, RecordKt: -1, VishayKt: vishayKt, VachanKt: 0, VibhaktiKt: 0, Seq: 1 },
        ],
      });
      const record = (await op.get(`${API}/record/${id}`)).body as GridRow;
      await sql`UPDATE BookT SET Libno = 'OBTEST1' WHERE BookMastkt = ${id}`.execute(trx);
      const base = { BookName: 'Renamed', BookTran: 'OBTEST1', PrakTran: record.PrakTran };
      expect((await save(op, id, base)).status).toBe(200);
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM praksnPrakT WHERE prakashannokt = ${id}`),
      ).toBe(1);
      // The Vishesh popup reloaded and saved again: new keys, the detail entry moves along.
      const grid = (await op.get(`${API}/trans/praksnVisheshTran/${id}`)).body as TransGrid;
      const res = await save(op, id, {
        ...base,
        'praksnVisheshTran.Rows': grid.rows,
        'praksnVisheshTran.Extra': grid.extras![0]!.rows,
        'praksnVisheshTran.Extra2': grid.extras![1]!.rows,
        'praksnVisheshTran.Extra3': grid.extras![2]!.rows,
        'praksnVisheshTran.Extra4': grid.extras![3]!.rows,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const km = Number(
        (
          await one(
            sql<{
              km: number;
            }>`SELECT prksnvisheshkm AS km FROM praksnVisheshT WHERE prakashannokt = ${id}`,
          )
        ).km,
      );
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM VishayEntry WHERE TransactionName = 'BookVisheshDetail' AND RecordKt = ${km}`,
        ),
      ).toBe(1);
      // Clearing the Prakashak box (without opening its popup) empties praksnPrakT.
      expect((await save(op, id, { ...base, PrakTran: '' })).status).toBe(200);
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM praksnPrakT WHERE prakashannokt = ${id}`),
      ).toBe(0);
    });

    it('refuses to delete a book with library rows, deletes it once they are gone', async () => {
      const { id } = await addBook();
      const refused = await op.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('Lib No is in use. Record cannot be deleted');
      const tid = Number(
        (await one(sql<{ id: number }>`SELECT tid AS id FROM BookT WHERE BookMastkt = ${id}`)).id,
      );
      const inUse = (await op.post(`${BOOKT}/action/in-use`).send({ ids: [], params: { tid } }))
        .body as ActionResult;
      expect(inUse).toEqual({ kind: 'message', message: '' });
      const del = await op
        .post(`${BOOKT}/action/delete-libno`)
        .send({ ids: [], params: { tid, password: SECURITY } });
      expect(del.status, JSON.stringify(del.body)).toBe(200);
      expect((await op.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status).toBe(
        204,
      );
      expect(await count(sql`SELECT COUNT(*) AS n FROM BookM WHERE BookMastkm = ${id}`)).toBe(0);
    });

    it("saves library numbers in the BookT form and keeps BookM's text in step", async () => {
      const { id } = await addBook();
      const tid = Number(
        (await one(sql<{ id: number }>`SELECT tid AS id FROM BookT WHERE BookMastkt = ${id}`)).id,
      );
      const edit = await op
        .post(`${BOOKT}/save`)
        .send({ id: tid, fields: { Libno: 'ZZTEST1', MainL: true, RowIndex: 0 } });
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      const added = await op.post(`${BOOKT}/save`).send({
        id: 0,
        fields: {
          Libno: 'ZZTEST2',
          BookMastkt: id,
          RowCount: 1,
          'MarkTran.Rows': [{ BookTranMarkTKm: 0, MarkKt: 1, MarkName: 'M', seq: 1 }],
        },
      });
      expect(added.status, JSON.stringify(added.body)).toBe(200);
      const text = (
        await one(sql<{ t: string }>`SELECT txtBookTran AS t FROM BookM WHERE BookMastkm = ${id}`)
      ).t;
      expect(text).toBe('ZZTEST1,ZZTEST2');
      const dup = await op
        .post(`${BOOKT}/save`)
        .send({ id: 0, fields: { Libno: 'ZZTEST1', BookMastkt: id } });
      expect(dup.body.message).toBe('LibNo Already Exist');
      const newTid = (added.body as SaveResult).id;
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM BookT WHERE tid = ${newTid} AND seq = 3`),
      ).toBe(1);
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM BookTranMarkT WHERE BookTKt = ${newTid}`),
      ).toBe(1);
      const record = (await op.get(`${BOOKT}/record/${tid}`)).body as GridRow;
      expect(record).toHaveProperty('PM_GBKM_SEL_PLIST_IMG');
      const series = Number(
        (
          await one(
            sql<{
              id: number;
            }>`SELECT TOP 1 bookcodekm AS id FROM bookmast WHERE ISNULL(bookprefix, '') <> ''`,
          )
        ).id,
      );
      const next = (
        await op.post(`${BOOKT}/action/next-libno`).send({ ids: [], params: { seriesKt: series } })
      ).body as ActionResult;
      expect(next.kind).toBe('message');
    });

    it('serves the popup lists, the Kruti list with its group, and the menu actions', async () => {
      const { id } = await addBook();
      const bhasha = (await op.post(`${API}/trans/BhasTran/lookup/bhasa_attr`).send({ row: {} }))
        .body as PickList;
      expect(bhasha.columns).toEqual(['bhashacokm', 'bhashaname', 'bhasa_attr']);
      const vishay = (
        await op.post(`${API}/trans/BookSubjTran/lookup/ve-vishay`).send({ row: { search: 'a' } })
      ).body as PickList;
      expect(vishay.rows.length).toBeLessThanOrEqual(50);
      expect((await op.get(`${API}/trans/KrutiTran/${id}`)).status).toBe(200);
      const project = (await op.get(`${API}/lists/project-work`)).body as PickList;
      if (project.rows[0]) {
        const r = (
          await op
            .post(`${API}/action/set-project-work`)
            .send({ ids: [id], params: { projectKt: project.rows[0][0] } })
        ).body as ActionResult;
        expect(r).toMatchObject({
          kind: 'refreshed',
          message: 'Total (1) records updated successfully',
        });
      }
      await op.post(`${API}/action/common-add-new`).send({ ids: [id] });
      const grp = Number(
        (await one(sql<{ g: number }>`SELECT CommonGrpNo AS g FROM BookM WHERE BookMastkm = ${id}`))
          .g,
      );
      expect(grp).toBeGreaterThan(0);
      const listed = (
        await op
          .post(`${API}/action/current-common-group`)
          .send({ ids: [], params: { commonGrpNo: grp } })
      ).body as ActionResult;
      expect(listed.kind === 'list' && listed.rows.map((r) => r.BookMastkm)).toEqual([id]);
      const locked = await op
        .post(`${API}/action/lock-records`)
        .send({ ids: [id], params: { password: LOCK, lock: true } });
      expect(locked.body).toMatchObject({
        kind: 'refreshed',
        message: '(1 ) Records Locked Successfully',
      });
      const kruti = (await op.post(`${API}/action/kruti-master`).send({ ids: [id] }))
        .body as ActionResult;
      expect(kruti).toMatchObject({
        kind: 'open',
        screen: 'kruti-master',
        emptyMessage: 'No Kruti Available for Current Selection',
      });
    });
    // ------------------------------------------------------------------ desktop v3.4.3.1 ----

    it('v3.4.3.1: the Operator filter is NULL-safe, and Search Not In OB filters list, search and record', async () => {
      const { id } = await addBook({ BookName: 'Zqob Pustak' });
      const setLibNos = (text: string | null) =>
        sql`UPDATE BookM SET txtBookTran = ${text} WHERE BookMastkm = ${id}`.execute(trx);
      const listed = async (agent: request.Agent, params?: Record<string, unknown>) =>
        (
          (await agent.post(`${API}/list`).send({ ids: [id], ...(params ? { params } : {}) }))
            .body as GridRow[]
        ).length;

      // No library text at all: an Operator sees the book now (ISNULL(txtBookTran, '')).
      await setLibNos(null);
      expect(await listed(op)).toBe(1);
      expect((await op.get(`${API}/record/${id}`)).status).toBe(200);

      // An OB number: hidden only while the box is ticked — in the grid, the record and the search.
      await setLibNos('OB09999');
      expect(await listed(op)).toBe(1);
      expect(await listed(op, { SearchNotInOB: true })).toBe(0);
      expect(await listed(admin, { SearchNotInOB: true })).toBe(0);
      expect(await listed(admin, { SearchNotInOB: false })).toBe(1);
      expect((await admin.get(`${API}/record/${id}`)).status).toBe(200);
      expect((await admin.get(`${API}/record/${id}`).query({ SearchNotInOB: 'true' })).status).toBe(
        404,
      );
      const meta = (await admin.get(`${API}/meta`)).body as MasterMeta;
      const name = meta.searchColumns.find((c) => c.columnName === 'BookName')!;
      const search = async (agent: request.Agent, params?: Record<string, unknown>) =>
        (
          (
            await agent.post(`${API}/search`).send({
              columnId: name.id,
              scope: 'all',
              gridIds: [],
              notIn: false,
              values: [],
              text: 'Zqob+Pustak',
              ...(params ? { params } : {}),
            })
          ).body as GridRow[]
        ).map((r) => Number(r.BookMastkm));
      expect(await search(admin)).toContain(id);
      expect(await search(admin, { SearchNotInOB: true })).not.toContain(id);

      // The Operator's own condition stays beside the box's (the desktop's search box drops it).
      await setLibNos('CM00001');
      expect(await listed(admin, { SearchNotInOB: true })).toBe(1);
      expect(await listed(op, { SearchNotInOB: true })).toBe(0);
      expect(await search(op, { SearchNotInOB: true })).not.toContain(id);
      expect(await search(admin, { SearchNotInOB: true })).toContain(id);

      // A menu list (GetDataTable) carries the box too.
      await setLibNos('OB09999');
      await sql`UPDATE BookM SET Grpno = 987654321 WHERE BookMastkm = ${id}`.execute(trx);
      const parts = async (switches?: Record<string, boolean>) => {
        const r = (
          await admin
            .post(`${API}/action/current-part-group`)
            .send({ ids: [], params: { grpNo: 987654321 }, ...(switches ? { switches } : {}) })
        ).body as ActionResult;
        return r.kind === 'list' ? r.rows.map((x) => Number(x.BookMastkm)) : null;
      };
      expect(await parts()).toEqual([id]);
      expect(await parts({ SearchNotInOB: true })).toEqual([]);
      // No group, nothing to show.
      const none = await admin
        .post(`${API}/action/current-part-group`)
        .send({ ids: [], params: { grpNo: 0 } });
      expect(none.body).toEqual({ kind: 'message', message: '' });
    });

    it('v3.4.3.1: the Common Group lists come from the whole table', async () => {
      const a = (await addBook({ BookName: 'Zqcg One' })).id;
      const b = (await addBook({ BookName: 'Zqcg Two' })).id;
      const top = Number(
        (await one(sql<{ g: number }>`SELECT ISNULL(MAX(CommonGrpNo), 0) AS g FROM BookM`)).g,
      );
      // Two books beyond the newest 100 of the grid would do as well; these are alone in a group each.
      await sql`UPDATE BookM SET CommonGrpNo = ${top + 2} WHERE BookMastkm = ${a}`.execute(trx);
      await sql`UPDATE BookM SET CommonGrpNo = ${top + 1} WHERE BookMastkm = ${b}`.execute(trx);

      const all = (await admin.post(`${API}/action/all-common-groups`).send({ ids: [] }))
        .body as ActionResult;
      expect(all.kind).toBe('list');
      if (all.kind !== 'list') return;
      const total = await count(sql`SELECT COUNT(*) AS n FROM BookM WHERE CommonGrpNo > 0`);
      expect(all.rows).toHaveLength(total);
      const groups = all.rows.map((r) => Number(r.CommonGrpNo));
      expect(groups.every((g, i) => i === 0 || groups[i - 1]! <= g)).toBe(true);
      // Sorted by CommonGrpNo: the two new groups are last, b before a.
      expect(all.rows.slice(-2).map((r) => Number(r.BookMastkm))).toEqual([b, a]);

      const single = (await admin.post(`${API}/action/common-single`).send({ ids: [] }))
        .body as ActionResult;
      expect(single.kind).toBe('list');
      if (single.kind !== 'list') return;
      expect(single.rows.length).toBeLessThanOrEqual(100);
      // The newest first: the two just made.
      expect(single.rows.slice(0, 2).map((r) => Number(r.BookMastkm))).toEqual([b, a]);
    });

    it('v3.4.3.1: RefLibNo check by BookTKt, and Update Kruti Seq with its sampraday', async () => {
      const { id } = await addBook({ BookName: 'Zqref Pustak' });
      const noRef = (await admin.post(`${API}/action/no-ref-libno`).send({ ids: [] }))
        .body as ActionResult;
      expect(noRef).toMatchObject({
        kind: 'table',
        columns: ['BookMastkm', 'BookName'],
        emptyMessage: 'No Records Found',
      });
      if (noRef.kind !== 'table') return;
      // The new book's library row has no Kruti reference; a referenced row's book is not listed
      // unless another of its rows is unreferenced.
      expect(noRef.rows.some((r) => Number(r[0]) === id)).toBe(true);
      const expected = await count(sql`
        SELECT COUNT(*) AS n FROM (SELECT DISTINCT BookMastkm, BookName FROM BookM INNER JOIN BookT ON BookM.BookMastkm = BookT.BookMastkt
          WHERE tid NOT IN (SELECT BookTKt FROM krutireflibno WHERE BookTKt IS NOT NULL)) q`);
      expect(noRef.rows).toHaveLength(expected);

      const list = (await admin.get(`${API}/lists/kruti-sampraday`)).body as PickList;
      expect(list.columns).toEqual(['ColumnMastkm', 'Name']);
      expect(list.rows.length).toBeGreaterThan(0);
      // Nothing picked: nothing runs.
      await sql`UPDATE BookM SET KrutiAkaradiSeq = -5 WHERE BookMastkm = ${id}`.execute(trx);
      const skipped = await admin.post(`${API}/action/update-kruti-seq`).send({ ids: [] });
      expect(skipped.body).toEqual({ kind: 'message', message: '' });
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM BookM WHERE BookMastkm = ${id} AND KrutiAkaradiSeq = -5`,
        ),
      ).toBe(1);
      // PrintKrutiPrakashakReport @SampradayKt renumbers BookM.KrutiAkaradiSeq.
      const sampradayKt = Number(
        (
          await one(sql<{ id: number }>`
            SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = 'KrutiSampraday' ORDER BY ColumnMastkm`)
        ).id,
      );
      const ran = await admin
        .post(`${API}/action/update-kruti-seq`)
        .send({ ids: [], params: { sampradayKt } });
      expect(ran.status, JSON.stringify(ran.body)).toBe(200);
      expect(ran.body).toEqual({ kind: 'message', message: '' });
      expect(
        await count(
          sql`SELECT COUNT(*) AS n FROM BookM WHERE BookMastkm = ${id} AND KrutiAkaradiSeq = -5`,
        ),
      ).toBe(0);
      // The old action is gone.
      expect((await admin.post(`${API}/action/update-akaradi-seq`).send({ ids: [] })).status).toBe(
        404,
      );
    });

    it('v3.4.3.1: a library number is in use only by an open confirmation or lab issue; the transfer moves them all', async () => {
      const { id } = await addBook({ BookName: 'Zquse Pustak' });
      const tid = Number(
        (await one(sql<{ id: number }>`SELECT tid AS id FROM BookT WHERE BookMastkt = ${id}`)).id,
      );
      await op.post(`${BOOKT}/save`).send({ id: tid, fields: { Libno: 'ZZUSE1', RowIndex: 0 } });
      const other = (
        (
          await op
            .post(`${BOOKT}/save`)
            .send({ id: 0, fields: { Libno: 'ZZUSE2', BookMastkt: id, RowCount: 1 } })
        ).body as SaveResult
      ).id;
      const inUse = async () =>
        (
          (await op.post(`${BOOKT}/action/in-use`).send({ ids: [], params: { tid } })).body as {
            message: string;
          }
        ).message;
      const status = async (name: string) =>
        Number(
          (
            await one(sql<{ id: number }>`
              SELECT ColumnMastkm AS id FROM columnmaster WHERE Vibhag = 'LabIssueStatus' AND Name = ${name}`)
          ).id,
        );
      const confirmation = (state: string) =>
        sql`INSERT INTO BookConfirmation (BookTKt, Ank, BookSentByKt, BookSentDate, BookConfirmationStatus)
            VALUES (${tid}, 'zq', ${opId}, GETDATE(), ${state})`.execute(trx);
      const labIssue = async (state: string) =>
        sql`INSERT INTO LabIssueM (BookTKt, enuserKt, endate, Forkt, StatusKt, Type)
            VALUES (${tid}, ${opId}, GETDATE(), 0, ${await status(state)}, 'Book')`.execute(trx);

      // Finished business does not count.
      await confirmation('Received');
      await labIssue('Closed');
      await labIssue('CancelReq');
      expect(await inUse()).toBe('');
      // Open business does.
      await confirmation('Sent');
      expect(await inUse()).toBe('- Book Confirmation');
      await labIssue('RetPen');
      expect(await inUse()).toBe('- Book Confirmation\r\n- Lab Issue');

      // The transfer moves every row, open or not, to the chosen number (the desktop leaves the
      // open ones on the deleted row).
      const del = await op
        .post(`${BOOKT}/action/delete-libno`)
        .send({ ids: [], params: { tid, transferTo: other, password: SECURITY } });
      expect(del.status, JSON.stringify(del.body)).toBe(200);
      expect(await count(sql`SELECT COUNT(*) AS n FROM BookT WHERE tid = ${tid}`)).toBe(0);
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM BookConfirmation WHERE BookTKt = ${tid}`),
      ).toBe(0);
      expect(await count(sql`SELECT COUNT(*) AS n FROM LabIssueM WHERE BookTKt = ${tid}`)).toBe(0);
      expect(
        await count(sql`SELECT COUNT(*) AS n FROM BookConfirmation WHERE BookTKt = ${other}`),
      ).toBe(2);
      expect(await count(sql`SELECT COUNT(*) AS n FROM LabIssueM WHERE BookTKt = ${other}`)).toBe(
        3,
      );
    });

    it("v3.4.3.1: the next library number fills the series' gaps (GetMemID)", async () => {
      const seriesOf = async (prefix: string) =>
        Number(
          (
            await one(
              sql<{
                id: number;
              }>`SELECT bookcodekm AS id FROM bookmast WHERE bookprefix = ${prefix}`,
            )
          ).id,
        );
      const next = async (prefix: string) =>
        (
          (
            await op
              .post(`${BOOKT}/action/next-libno`)
              .send({ ids: [], params: { seriesKt: await seriesOf(prefix) } })
          ).body as { message: string }
        ).message;
      const maxPlus1 = async (table: 'BookT' | 'HastpratLibNoT', prefix: string) =>
        Number(
          (
            await one(sql<{ n: number }>`
              SELECT ISNULL(MAX(RIGHT(libno, 5)), 0) + 1 AS n FROM ${sql.table(table)} WHERE LEFT(libno, 2) = ${prefix}`)
          ).n,
        );
      const firstGap = async (prefix: string) => {
        const { rows } = await sql<{
          No: string;
        }>`EXEC Print_MissingNo 'libary', ${prefix}`.execute(trx);
        return rows[0] ? Number(rows[0].No) : 0;
      };
      const libNo = (prefix: string, n: number) => prefix + String(n).padStart(5, '0');

      // A series of the test's own: no gap, so one more than the largest in BookT and Hastprat.
      const { id } = await addBook({ BookName: 'Zqgap Pustak' });
      await sql`INSERT INTO bookmast (bookcodekm, bookname, bookprefix)
                VALUES ((SELECT ISNULL(MAX(bookcodekm), 0) + 1 FROM bookmast), 'zq series', 'ZQ')`.execute(
        trx,
      );
      expect(await next('ZQ')).toBe('ZQ00001');
      const row = (n: number) =>
        sql`INSERT INTO BookT (BookMastkt, Libno, seq) VALUES (${id}, ${libNo('ZQ', n)}, 9)`.execute(
          trx,
        );
      await row(1);
      await row(2);
      expect(await next('ZQ')).toBe('ZQ00003');
      await sql`INSERT INTO HastpratLibNoT (HastpratKt, Libno) VALUES (0, 'ZQ00007')`.execute(trx);
      expect(await next('ZQ')).toBe('ZQ00008');
      // A gap in BookT comes first: 3 and 4 are missing between 2 and 5.
      await row(5);
      expect(await firstGap('ZQ')).toBe(3);
      expect(await next('ZQ')).toBe('ZQ00003');
      await row(3);
      expect(await next('ZQ')).toBe('ZQ00004');

      // SN and EB never fill gaps, although they have some.
      for (const prefix of ['SN', 'EB']) {
        expect(await firstGap(prefix)).toBeGreaterThan(0);
        expect(await next(prefix)).toBe(
          libNo(
            prefix,
            Math.max(await maxPlus1('BookT', prefix), await maxPlus1('HastpratLibNoT', prefix)),
          ),
        );
      }
      // A real series with a gap takes it.
      const gap = await firstGap('B0');
      expect(await next('B0')).toBe(
        libNo(
          'B0',
          gap > 0
            ? gap
            : Math.max(await maxPlus1('BookT', 'B0'), await maxPlus1('HastpratLibNoT', 'B0')),
        ),
      );
    });
  },
);
