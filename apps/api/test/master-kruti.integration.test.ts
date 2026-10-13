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
import { expandNumbers } from '../src/master/screens/kruti-actions.js';
import { subTitleText } from '../src/master/screens/kruti.js';

/**
 * Library › Kruti Master through the master engine, against the real DB inside a transaction
 * that is rolled back after every test. See docs/screens/kruti-master.md.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);
const PASSWORD = 'Secret1';
const SECURITY = 'sec-test-1';
const KRUTI_LOCK = 'kruti-lock-test';
const API = '/api/master/kruti-master';

describe('Kruti Master helpers', () => {
  it('expands "1,2,4-6" as StringContinuanceSequential does', () => {
    expect(expandNumbers('1,2,4-6')).toEqual([1, 2, 4, 5, 6]);
    expect(expandNumbers(' ')).toEqual([]);
  });
  it('words the Title box as FillData does', () => {
    expect(
      subTitleText([
        {
          SubTitleNo: '1',
          Refplace: 'R',
          SubTitleNm: ' Nm ',
          pariman: '5',
          adivakya: 'a',
          remark: 'x',
        },
        { SubTitleNo: '', Refplace: '', SubTitleNm: 'B', remark: '' },
      ]),
    ).toBe('1 R Nm 5 a,(x); B,');
  });
});

describe.skipIf(!hasDb)(
  'Kruti Master via the master engine (integration)',
  { timeout: 180_000 },
  () => {
    let db: Database;
    let trx: ControlledTransaction<DB>;
    let app: NestExpressApplication;
    let op: request.Agent;
    let admin: request.Agent;
    let bhashaKt: number;
    let authorKt: number;
    let authTypeKt: number;
    let swaroopKt: number;
    let vibhagKt: number;
    let sampradayKt: number;
    let parimanTypeKt: number;
    let bookTKt: number;
    let vishayKt: number;
    let ragTypeKt: number;
    let ragKt: number;

    beforeAll(() => {
      db = createDatabase(loadEnv());
    });
    afterAll(async () => {
      await db.destroy();
    });

    const one = async <T>(q: ReturnType<typeof sql<T>>) => (await q.execute(trx)).rows[0]!;
    const count = async (q: ReturnType<typeof sql<{ n: number }>>) => Number((await one(q)).n);
    const first = async (q: ReturnType<typeof sql<{ id: number }>>) => Number((await one(q)).id);

    async function login(userType: number, isAdmin: boolean) {
      const name = `mtkr${userType}${Date.now() % 1_000_000}`;
      await sql`
        INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
        VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 0, 0, 0, 1, ${isAdmin ? 1 : 0}, 1, ${userType}, '08:00')
      `.execute(trx);
      const agent = request.agent(app.getHttpServer());
      expect(
        (await agent.post('/api/auth/login').send({ username: name, password: PASSWORD })).status,
      ).toBe(200);
      return agent;
    }

    beforeEach(async () => {
      trx = await db.startTransaction().execute();
      const env = loadEnv({
        ...process.env,
        NODE_ENV: 'test',
        SECURITY_PASSWORD: SECURITY,
        KRUTI_LOCK_PASSWORD: KRUTI_LOCK,
        LEGACY_WEB_URL: 'http://reports.test',
      });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
        .overrideProvider(KYSELY)
        .useValue(trx)
        .compile();
      app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
      configureApp(app, env);
      await app.init();
      op = await login(3, false);
      admin = await login(1, true);
      bhashaKt = await first(
        sql`SELECT TOP 1 bhashacokm AS id FROM bhasmast WHERE ISNULL(bhasa_attr, '') <> '' ORDER BY bhashacokm`,
      );
      authorKt = await first(
        sql`SELECT TOP 1 authorcokm AS id FROM authmast WHERE ISNULL(authorname, '') <> '' ORDER BY authorcokm`,
      );
      authTypeKt = await first(
        sql`SELECT TOP 1 authtycokm AS id FROM authtype WHERE ISNULL(authtyattr, '') <> '' ORDER BY authtycokm`,
      );
      swaroopKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = N'Swroop' AND ISNULL(Name, '') <> ''`,
      );
      vibhagKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = N'Head' AND ISNULL(Name, '') <> ''`,
      );
      sampradayKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = 'KrutiSampraday'`,
      );
      parimanTypeKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = 'ParimnType' AND ISNULL(ShortNm, '') <> ''`,
      );
      bookTKt = await first(
        sql`SELECT TOP 1 Tid AS id FROM BookT WHERE ISNULL(LibNo, '') <> '' AND ISNULL(CupBoardRackNo, '') NOT LIKE '%/%' ORDER BY Tid`,
      );
      vishayKt = await first(
        sql`SELECT TOP 1 vishaycokm AS id FROM vishay WHERE ISNULL(vishay_nm, '') <> ''`,
      );
      ragTypeKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = N'RagType'`,
      );
      ragKt = await first(
        sql`SELECT TOP 1 ColumnMastkm AS id FROM columnmaster WHERE Vibhag = N'Rag'`,
      );
    });

    afterEach(async () => {
      await app.close();
      await trx.rollback().execute();
    });

    const save = (agent: request.Agent, id: number, fields: Record<string, unknown>) =>
      agent.post(`${API}/save`).send({ id, fields });
    const action = (
      agent: request.Agent,
      name: string,
      ids: number[],
      params: Record<string, unknown> = {},
    ) => agent.post(`${API}/action/${name}`).send({ ids, params });
    const nextNo = async () =>
      Number(
        (await one(sql<{ n: number }>`SELECT ISNULL(MAX(KrutiNo), 0) + 1 AS n FROM krutiMst`)).n,
      );

    async function addKruti(fields: Record<string, unknown> = {}): Promise<SaveResult> {
      const res = await save(op, 0, {
        KrutiNo: String(await nextNo()),
        extranm: 'Kruti Test',
        ...fields,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return res.body as SaveResult;
    }

    it("lists every kruti with the form's join, any names appended, and loads a record", async () => {
      const meta = (await op.get(`${API}/meta`)).body as MasterMeta;
      expect(meta).toMatchObject({ transactionName: 'krutiMst', primaryColumn: 'krutimstkm' });
      // The context menu's layouts are Config_Master type 'Kruti'; the picker's 'KrutiMst'.
      expect(meta.printLayouts.length).toBeGreaterThan(0);
      const { id } = await addKruti({
        'KrutiNmTran.Rows': [
          {
            krutimstkt: 0,
            KrutiNmkm: 0,
            Anyaname: 'Anya1',
            mark1: 0,
            mark: '',
            remark: '',
            seq: 1,
          },
        ],
      });
      const rows = (await op.post(`${API}/list`).send({})).body as GridRow[];
      const total = await count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM krutiMst`);
      expect(rows).toHaveLength(total);
      expect(Number(rows[0]!.krutimstkm)).toBe(id);
      expect(rows[0]!.extranm).toBe('Kruti Test(Anya1)');
      expect(Object.keys(rows[0]!)).toEqual(
        expect.arrayContaining([
          'KrutiNo',
          'Bhasha',
          'Author',
          'SAuthor',
          'Rsamvatvir',
          'Pariman',
          'UpLvl',
          'groupnm',
          'PurnaName',
          'Count',
        ]),
      );
      const record = (await op.get(`${API}/record/${id}`)).body as GridRow;
      expect(record).toMatchObject({
        extranm: 'Kruti Test',
        GroupDisabled: true,
        SamvatDisabled: false,
      });
      expect(record).toHaveProperty('Rsamvatvir1');
      expect(record.KrutiNmTran).toBe('Anya1');
    });

    it('validates KrutiNo as Save() does', async () => {
      expect((await save(op, 0, { KrutiNo: '0', extranm: 'x' })).body.message).toBe(
        'KrutiNo is Null so record can not be saved ',
      );
      const { id } = await addKruti();
      const no = (
        await one(sql<{ KrutiNo: number }>`SELECT KrutiNo FROM krutiMst WHERE krutimstkm = ${id}`)
      ).KrutiNo;
      const dup = await save(op, 0, { KrutiNo: String(no), extranm: 'y' });
      expect(dup.status).toBe(400);
      expect(dup.body.message).toBe(`Cannot Enter RecordNo ${no}`);
      expect((await op.get(`${API}/new-defaults`)).body).toEqual({ KrutiNo: no + 1 });
    });

    it('adds a kruti with its popups and the texts krutiMst keeps of them', async () => {
      const { id } = await addKruti({
        samvattype: 2,
        samvattypeText: 'वि.सं.',
        rachsamvat: '1700',
        Rsamvatvir: '1700',
        IsDownLevel: true,
        krutisubparimnTran: 'Sub',
        prasastitypeText: 'Pr',
        prasastipariman: '12',
        'BhashaTran.Rows': [
          {
            krutimstkt: 0,
            krutibhashakm: 0,
            bhashakt: bhashaKt,
            bhashaname: 'b',
            remarkkt: 0,
            Remark: '',
            seq: 1,
          },
          {
            krutimstkt: 0,
            krutibhashakm: 0,
            bhashakt: 0,
            bhashaname: '',
            remarkkt: 0,
            Remark: '',
            seq: 2,
          },
        ],
        'AuthorTran.Rows': [
          {
            krutimstkt: 0,
            krutauthkm: -1,
            authtycokt: authTypeKt,
            authortype: 't',
            authorcokt: authorKt,
            authorname: 'a',
            AuthAnyaNmKt: 0,
            Anyaname: 'a',
            avasthaid: 0,
            Avastha: '',
            Guru: '',
            identyty: '',
            UpdateAuthorSamvat: false,
            seq: 1,
          },
        ],
        'SAuthorTran.Rows': [
          {
            krutimstkt: 0,
            krutauthkm: 0,
            authtycokt: 0,
            authortype: '',
            authorcokt: authorKt,
            authorname: 'a',
            AuthAnyaNmKt: 0,
            Anyaname: 'a',
            avasthaid: 0,
            Avastha: '',
            seq: 1,
            Guru: '',
            identyty: '',
          },
        ],
        'krutiparimnTran.Rows': [
          {
            krutimstkt: 0,
            krutparimKm: 0,
            Sign1Kt: 0,
            Sign1: '',
            parimantypkt: parimanTypeKt,
            ParimanType: 'PT',
            pariman: '100',
            Sign2kt: 0,
            Sign2: '',
            seq: 1,
            ParimanTypeFull: '',
          },
        ],
        'SwaroopTran.Rows': [
          {
            krutimstkt: 0,
            krutiswaropkm: 0,
            swroopkt: swaroopKt,
            swroop: 's',
            mark1: 0,
            m1: '',
            seq: 1,
          },
        ],
        'VibhagTran.Rows': [
          { krutimstkt: 0, KrutiVibhagKm: 0, VibhagKt: vibhagKt, VibhagName: 'v', seq: 1 },
        ],
        'SampradayTran.Rows': [
          { KrutiSampradayKm: 0, SampradayKt: sampradayKt, SampradayName: 's', seq: 1 },
        ],
        'krutireflibnoTran.Rows': [
          {
            krutimstkt: 0,
            krutiReflibnokm: 0,
            bhandarkt: 0,
            BhandarName: '',
            remark: 'r',
            BookTKt: bookTKt,
            BookTName: 'L1',
            BookDetail: '',
            refplacekt: 0,
            RefPlaceName: '',
            refpgno: '5',
            signkt: 0,
            SignName: '',
            ktypeid: 3012,
            Typename: 'T',
            lipiname: '',
            pariman: '',
            vishash: '',
            libseq: 0,
            IsCommonGroup: true,
            IsPrint: false,
            seq: 1,
          },
        ],
        'KrutiNoteTran.Rows': [
          {
            krutimstkt: 0,
            KrutiNoteKm: 0,
            KrutiColKt: 0,
            KrutiColName: '',
            SeriesKt: 0,
            SeriesName: '',
            wordnm: 'w',
            BookTkt: bookTKt,
            BooktName: 'L1',
            RefplaceKt: 0,
            RefPlaceName: '',
            pgno: '3',
            SignColKt: 0,
            SignColName: '',
            ColShortNm: '',
            seq: 1,
          },
        ],
        'krutivishayTran.Rows': [
          {
            krutimstkt: 0,
            krutisubjkm: 0,
            Mark1: 0,
            M1: '',
            vishaykt: 0,
            Vishay: '',
            vachankt: 0,
            Vachan: '',
            vibhaktikt: 0,
            Vibhakti: '',
            Remark: 'vr',
            seq: 1,
          },
        ],
        'KrutiRagTran.Rows': [
          { KrutiRagTkm: -5, krutimstkt: 0, Ragtype: 'x', Ragname: 'y', seq: 1 },
        ],
        'KrutiRagTran.Extra': [
          {
            KrutiRagTRagTypeKm: 0,
            krutiRagTkt: -5,
            krutimstkt: 0,
            RagTypekt: ragTypeKt,
            RagType: 'x',
            Remark: 'tr',
            seq: 1,
          },
        ],
        'KrutiRagTran.Extra2': [
          {
            KrutiRagTRagNmKm: 0,
            krutimstkt: 0,
            krutiRagTkt: -5,
            RagNamekt: ragKt,
            RagName: 'y',
            remark: 'nr',
            seq: 1,
          },
        ],
        'KrutiSubTitleTran.Rows': [
          {
            krutimstkt: 0,
            krutiSubTitleKm: -9,
            SubTitleNo: '1',
            Refplace: '',
            SubTitleNm: 'Title A',
            txtSubTitleNm: '',
            pariman: '',
            parimanpattern: '',
            adivakya: '',
            antvakya: '',
            RagaName: '',
            desi: '',
            refpgno: '',
            remark: '',
            seq: 1,
          },
          {
            krutimstkt: 0,
            krutiSubTitleKm: -10,
            SubTitleNo: '2',
            Refplace: '',
            SubTitleNm: 'Title B',
            txtSubTitleNm: '',
            pariman: '',
            parimanpattern: '',
            adivakya: '',
            antvakya: '',
            RagaName: '',
            desi: '',
            refpgno: '',
            remark: '',
            seq: 2,
          },
        ],
        'KrutiSubTitleTran.Extra': [
          {
            krutimstkt: 0,
            KrutiSubTitleRagkm: 0,
            krutiSubTitleKt: -9,
            Signkt: 0,
            Sign: '',
            RagTypekt: ragTypeKt,
            RagType: 'x',
            RagNamekt: ragKt,
            RagName: 'y',
            Remark: '',
            seq: 1,
          },
        ],
        // Only the first title is named: the desktop could not save that at all.
        'KrutiSubTitleTran.Extra2': [
          {
            Id: 0,
            RecordKt: -9,
            VishayKt: vishayKt,
            Vishay: 'v',
            VachanKt: 0,
            Vachan: '',
            VibhaktiKt: 0,
            Vibhakti: '',
            AnyaNameKt: 0,
            Seq: 1,
          },
        ],
      });

      const k = await one(
        sql<Record<string, unknown>>`SELECT * FROM krutiMst WHERE krutimstkm = ${id}`,
      );
      expect(k).toMatchObject({ Rsamvatvir: 1700, IsDownLevel: true, vishesh: '' });
      expect(k.Bhasha).toBe(
        (
          await one(
            sql<{ b: string }>`SELECT bhasa_attr AS b FROM bhasmast WHERE bhashacokm = ${bhashaKt}`,
          )
        ).b.trim(),
      );
      expect(k.Pariman).toBe('Sub PT 100,Pr 12');
      expect(String(k.Author)).not.toBe('');
      expect(String(k.SAuthor)).not.toBe('');
      const n = (t: string) =>
        count(
          sql<{ n: number }>`SELECT COUNT(*) AS n FROM ${sql.table(t)} WHERE krutimstkt = ${id}`,
        );
      expect(await n('krutibhasT')).toBe(1); // the blank row is not stored
      for (const t of [
        'krutiauthT',
        'krutiSautht',
        'krutiparimnT',
        'krutiSwaropT',
        'KrutiVibhagT',
        'KrutiSampradayT',
        'krutiRefLibno',
        'KrutiNoteT',
        'krutivishayT',
        'KrutiRagT',
        'KrutiRagTRagTypeT',
        'KrutiRagTRanNmT',
        'KrutiSubTitleRagT',
      ])
        expect(await n(t), t).toBe(1);
      expect(await n('KrutiSubTitleT')).toBe(2);
      expect(
        await count(sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM VishayEntry v INNER JOIN KrutiSubTitleT t ON v.RecordKt = t.krutiSubTitleKm
          WHERE v.TransactionName = 'KrutiTitleSubTitleName' AND t.krutimstkt = ${id}`),
      ).toBe(1);

      const record = (await op.get(`${API}/record/${id}`)).body as GridRow;
      expect(record.KrutiSubTitleTran).toMatch(/^1 Title A.*;2 Title B,$/);
      const nameOf = async (kt: number) =>
        (
          await one(
            sql<{ n: string }>`SELECT Name AS n FROM columnmaster WHERE ColumnMastkm = ${kt}`,
          )
        ).n;
      const [ragType, ragName] = [await nameOf(ragTypeKt), await nameOf(ragKt)];
      expect(record.KrutiRagTran).toBe(`${ragType}(tr)-${ragName}(nr)`);

      // The popups read back: the form's own statements for Rag, Title and RefLibNo.
      const rag = (await op.get(`${API}/trans/KrutiRagTran/${id}`)).body as TransGrid;
      expect(rag.rows[0]).toMatchObject({ Ragtype: `${ragType}(tr)`, Ragname: `${ragName}(nr)` });
      expect(rag.extras).toHaveLength(2);
      const titles = (await op.get(`${API}/trans/KrutiSubTitleTran/${id}`)).body as TransGrid;
      expect(titles.rows).toHaveLength(2);
      expect(titles.extras?.[1]?.rows).toHaveLength(1);
      for (const c of [
        'BhashaTran',
        'AuthorTran',
        'SAuthorTran',
        'krutiparimnTran',
        'krutisubparimnTran',
        'SwaroopTran',
        'VibhagTran',
        'SampradayTran',
        'krutireflibnoTran',
        'KrutiNoteTran',
        'krutivishayTran',
        'KrutiNmTran',
        'krutiRelTran',
        'KrutiSubjTran',
        'group',
      ])
        expect((await op.get(`${API}/trans/${c}/${id}`)).status, c).toBe(200);
    });

    it('edits: unopened popups stay, opened ones are rewritten, title names follow their title', async () => {
      const { id } = await addKruti({
        'BhashaTran.Rows': [
          {
            krutimstkt: 0,
            krutibhashakm: 0,
            bhashakt: bhashaKt,
            bhashaname: 'b',
            remarkkt: 0,
            Remark: '',
            seq: 1,
          },
        ],
        'KrutiSubTitleTran.Rows': [
          {
            krutimstkt: 0,
            krutiSubTitleKm: -1,
            SubTitleNo: '1',
            Refplace: '',
            SubTitleNm: 'A',
            txtSubTitleNm: '',
            pariman: '',
            parimanpattern: '',
            adivakya: '',
            antvakya: '',
            RagaName: '',
            desi: '',
            refpgno: '',
            remark: '',
            seq: 1,
          },
        ],
        'KrutiSubTitleTran.Extra2': [
          {
            Id: 0,
            RecordKt: -1,
            VishayKt: vishayKt,
            Vishay: 'v',
            VachanKt: 0,
            Vachan: '',
            VibhaktiKt: 0,
            Vibhakti: '',
            AnyaNameKt: 0,
            Seq: 1,
          },
        ],
      });
      const titles = (await op.get(`${API}/trans/KrutiSubTitleTran/${id}`)).body as TransGrid;
      const no = (
        await one(sql<{ KrutiNo: number }>`SELECT KrutiNo FROM krutiMst WHERE krutimstkm = ${id}`)
      ).KrutiNo;
      const res = await save(op, id, {
        KrutiNo: String(no),
        extranm: 'Renamed',
        'KrutiSubTitleTran.Rows': titles.rows,
        'KrutiSubTitleTran.Extra': titles.extras?.[0]?.rows ?? [],
        'KrutiSubTitleTran.Extra2': titles.extras?.[1]?.rows ?? [],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(
        await count(
          sql<{ n: number }>`SELECT COUNT(*) AS n FROM krutibhasT WHERE krutimstkt = ${id}`,
        ),
      ).toBe(1);
      expect(
        await count(sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM VishayEntry v INNER JOIN KrutiSubTitleT t ON v.RecordKt = t.krutiSubTitleKm
          WHERE v.TransactionName = 'KrutiTitleSubTitleName' AND t.krutimstkt = ${id}`),
      ).toBe(1);
      expect(
        (await one(sql<{ e: string }>`SELECT extranm AS e FROM krutiMst WHERE krutimstkm = ${id}`))
          .e,
      ).toBe('Renamed');
    });

    it('deletes after the checks, with every child table', async () => {
      const a = await addKruti({
        'BhashaTran.Rows': [
          {
            krutimstkt: 0,
            krutibhashakm: 0,
            bhashakt: bhashaKt,
            bhashaname: 'b',
            remarkkt: 0,
            Remark: '',
            seq: 1,
          },
        ],
        'VibhagTran.Rows': [
          { krutimstkt: 0, KrutiVibhagKm: 0, VibhagKt: vibhagKt, VibhagName: 'v', seq: 1 },
        ],
      });
      const b = await addKruti({ extranm: 'Down' });
      // b has an up level: refused after the password.
      await save(op, b.id, {
        KrutiNo: String(
          (
            await one(
              sql<{ n: number }>`SELECT KrutiNo AS n FROM krutiMst WHERE krutimstkm = ${b.id}`,
            )
          ).n,
        ),
        extranm: 'Down',
        'krutiRelTran.Rows': [
          {
            krutimstkt: b.id,
            krutirelkm: 0,
            uplevelKrutimstkt: a.id,
            KrutiNo: 0,
            krutiname: '',
            Author: '',
            Bhasha: '',
            seq: 1,
          },
        ],
      });
      const refused = await op.post(`${API}/delete`).send({ ids: [b.id], password: SECURITY });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('Records in used anthor plase !');
      // a heads a group with b: refused while b is a member.
      expect(
        (await action(op, 'group-add-new', [a.id, b.id], { head: a.id, name: 'G' })).status,
      ).toBe(200);
      const group = await op.post(`${API}/delete`).send({ ids: [a.id], password: SECURITY });
      expect(group.body.message).toBe(
        "You can not delete Group's Master Record First Remove Group Member",
      );
      await sql`DELETE FROM krutigroupT WHERE krutimstkt = ${b.id}`.execute(trx);
      expect(
        (await op.post(`${API}/delete`).send({ ids: [a.id], password: SECURITY })).status,
      ).toBe(204);
      for (const t of ['krutibhasT', 'KrutiVibhagT', 'krutigroupT'])
        expect(
          await count(
            sql<{
              n: number;
            }>`SELECT COUNT(*) AS n FROM ${sql.table(t)} WHERE krutimstkt = ${a.id}`,
          ),
          t,
        ).toBe(0);
      expect(
        await count(sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM WorkReportM WHERE TableName = 'krutiMst' AND RecordNo = ${String(a.id)}
          AND Remark LIKE 'DEL-%'`),
      ).toBe(1);
    });

    it('runs the right-click actions', async () => {
      const a = await addKruti();
      const b = await addKruti({ extranm: 'Second' });
      const ids = [a.id, b.id];

      // Lock By Admin needs the form's own password; Ctrl+L the Security one.
      expect(
        (await action(admin, 'lock-by-admin', ids, { lock: true, password: SECURITY })).status,
      ).toBe(401);
      const locked = await action(admin, 'lock-by-admin', ids, {
        lock: true,
        password: KRUTI_LOCK,
      });
      expect((locked.body as ActionResult & { message: string }).message).toBe(
        '(2 ) Records Locked Successfully',
      );
      expect(
        (await action(op, 'lock-records', [a.id], { lock: true, password: SECURITY })).status,
      ).toBe(200);
      expect(
        (
          await one(
            sql<{ l: boolean }>`SELECT locked AS l FROM krutiMst WHERE krutimstkm = ${a.id}`,
          )
        ).l,
      ).toBe(true);

      const inserted = await action(op, 'change-in-selected', ids, {
        kind: 'Bhasha',
        op: 1,
        value: bhashaKt,
        name: 'B',
        password: SECURITY,
      });
      expect(inserted.body.message).toBe('At 2 Places B  Bhasha is Inserted succefully');
      expect(
        (await one(sql<{ b: string }>`SELECT Bhasha AS b FROM krutiMst WHERE krutimstkm = ${a.id}`))
          .b,
      ).not.toBe('');

      expect((await action(op, 'check-nsmp', ids, { nsmp: true })).status).toBe(200);
      const tree = (await action(op, 'tree', ids, { up: false })).body as ActionResult;
      expect(tree).toMatchObject({ kind: 'table', columns: ['id', 'parent', 'text'] });
      const missing = (await action(op, 'missing-nos', [], { gridIds: ids })).body as ActionResult;
      expect(missing.kind).toBe('table');
      const dup = (await action(op, 'duplicate-nos', [], { gridIds: ids })).body as ActionResult;
      expect(dup).toMatchObject({ kind: 'table', rows: [] });
      const url = (
        await action(op, 'akaradi-report', [], { type: 'Vishay', sampraday: sampradayKt })
      ).body;
      expect(url).toEqual({
        kind: 'url',
        url: `http://reports.test/gglibrary/Home/KrutiAkaradiParishishtReport?Type=Vishay&SampradayKt=${sampradayKt}`,
      });

      await action(op, 'insert-ref-libno', [], {
        current: a.id,
        bookT: bookTKt,
        libno: 'LN',
        pgno: '7',
      });
      expect(
        await count(
          sql<{
            n: number;
          }>`SELECT COUNT(*) AS n FROM krutiRefLibno WHERE krutimstkt = ${a.id} AND ktypeid = 3518 AND refpgno = '7'`,
        ),
      ).toBe(1);
      const sent = await action(op, 'send-to-title', ids, { target: a.id });
      expect(sent.body.message).toBe(
        `Sub Title Records From Krutin Id ${a.id} Inserted Successfully`,
      );

      // The group popup: rewritten at once, the current kruti its head.
      await action(op, 'group-add-new', ids, { head: a.id, name: 'Grp' });
      const grp = (await op.get(`${API}/trans/group/${a.id}`)).body as TransGrid;
      expect(grp.rows).toHaveLength(2);
      await action(op, 'save-group', [], {
        current: b.id,
        groupName: 'NewHead',
        rows: JSON.stringify(grp.rows),
      });
      expect(
        await one(
          sql<{
            head: boolean;
            groupname: string;
          }>`SELECT head, groupname FROM krutigroupT WHERE krutimstkt = ${b.id}`,
        ),
      ).toEqual({ head: true, groupname: 'NewHead' });
      const record = (await op.get(`${API}/record/${b.id}`)).body as GridRow;
      expect(record.groupnm).toMatch(/^\(\d+\)NewHead$/);
      expect(record.GroupDisabled).toBe(false);
    });

    it("prints a Kruti layout with the joined Pariman column, and lists the popups' cells", async () => {
      const { id } = await addKruti();
      const meta = (await op.get(`${API}/meta`)).body as MasterMeta;
      const pariman = meta.printColumns.find((c) => c.name === 'परिमाण');
      expect(pariman).toBeDefined();
      const printed = await op
        .post(`${API}/print`)
        .send({ ids: [id], columnIndices: [pariman!.index] });
      expect(printed.status, JSON.stringify(printed.body)).toBe(200);
      const layout = meta.printLayouts[0]!;
      expect((await op.post(`${API}/print`).send({ ids: [id], layoutId: layout.id })).status).toBe(
        200,
      );

      const lookup = (col: string, name: string, row: Record<string, unknown> = {}) =>
        op.post(`${API}/trans/${col}/lookup/${name}`).send({ row });
      const cells: [string, string][] = [
        ['BhashaTran', 'bhashaname'],
        ['SwaroopTran', 'swroop'],
        ['krutiparimnTran', 'parimantype'],
        ['krutireflibnoTran', 'typename'],
        ['KrutiNoteTran', 'kruticolname'],
        ['KrutiRagTran', 'ragtype'],
        ['KrutiSubTitleTran', 'ragname'],
        ['AuthorTran', 'avastha'],
        ['SampradayTran', 'sampradayname'],
      ];
      for (const [col, name] of cells)
        expect(
          ((await lookup(col, name)).body as PickList).rows.length,
          `${col}/${name}`,
        ).toBeGreaterThan(0);
      expect(
        (await op.post(`${API}/print`).send({ ids: [id], layoutId: layout.id })).body.rows,
      ).toHaveLength(1);
      expect((await lookup('krutireflibnoTran', 'book-detail', { BookTKt: bookTKt })).status).toBe(
        200,
      );
      expect((await lookup('AuthorTran', 'anyaname', { authorcokt: authorKt })).status).toBe(200);
      expect(
        ((await op.get(`${API}/lists/uplvl-by-no`)).body as PickList).rows.length,
      ).toBeGreaterThan(0);
    });
  },
);
