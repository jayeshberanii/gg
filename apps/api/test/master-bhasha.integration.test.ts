import 'reflect-metadata';
import type { DB } from '@gglib/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { GridRow, MasterMeta, PickList, UiPreferences } from '@gglib/shared';
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
 * Master › Bhasha Master through the master-screen engine, against the real DB inside a
 * transaction that is rolled back after every test.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);
const PASSWORD = 'Secret1';
const SECURITY = 'test-security-pw';
const API = '/api/master/bhasha-master';

describe.skipIf(!hasDb)('Bhasha Master via the master engine (integration)', () => {
  let db: Database;
  let trx: ControlledTransaction<DB>;
  let app: NestExpressApplication;
  let alice: request.Agent;
  let bob: request.Agent;
  let aliceName: string;

  beforeAll(() => {
    db = createDatabase(loadEnv());
  });
  afterAll(async () => {
    await db.destroy();
  });

  async function createUser(name: string) {
    await sql`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 0, 0, 0, 1, 0, 1, 3, '08:00')
    `.execute(trx);
  }

  async function signIn(name: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ username: name, password: PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  beforeEach(async () => {
    trx = await db.startTransaction().execute();
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', SECURITY_PASSWORD: SECURITY });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
      .overrideProvider(KYSELY)
      .useValue(trx)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();
    const stamp = Date.now() % 1_000_000;
    aliceName = `mtalice${stamp}`;
    await createUser(aliceName);
    await createUser(`mtbob${stamp}`);
    alice = await signIn(aliceName);
    bob = await signIn(`mtbob${stamp}`);
  });

  afterEach(async () => {
    await app.close();
    await trx.rollback().execute();
  });

  const maxId = async () =>
    Number(
      (await sql<{ m: number }>`SELECT MAX(bhashacokm) AS m FROM bhasmast`.execute(trx)).rows[0]!.m,
    );

  it('describes the screen from tblSearch', async () => {
    const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
    expect(meta).toMatchObject({ transactionName: 'bhasmast', primaryColumn: 'bhashacokm' });
    const names = meta.searchColumns.map((c) => c.displayName);
    expect(names.slice(0, 3)).toEqual(['locked', 'bhashacokm', 'columnNo']); // Seq order
    expect(names).toContain('Name');
    // Search box with nothing chosen: grid columns after the id, in GridSeq order.
    expect(meta.freeTextTargets[0]).toEqual({ column: 'bhashaname', dataType: 'nvarchar' });
    expect(meta.freeTextTargets.map((t) => t.column)).toContain('UplevelName');
  });

  it('lists every record, newest first, and loads one for the form', async () => {
    const rows = (await alice.post(`${API}/list`).send({})).body as GridRow[];
    const { rows: count } = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM bhasmast`.execute(
      trx,
    );
    expect(rows).toHaveLength(count[0]!.n);
    expect(rows[0]!.bhashacokm).toBe(await maxId());
    expect(Object.keys(rows[0]!)).toEqual(
      expect.arrayContaining(['bhashaname', 'UplevelName', 'countI']),
    );

    const record = (await alice.get(`${API}/record/${rows[0]!.bhashacokm}`)).body as GridRow;
    expect(record).toMatchObject({ bhashacokm: rows[0]!.bhashacokm });
    expect(Object.keys(record)).toEqual(
      expect.arrayContaining(['UplevelKt', 'UplevelName', 'shortnm']),
    );

    const some = (await alice.post(`${API}/list`).send({ ids: [rows[1]!.bhashacokm] }))
      .body as GridRow[];
    expect(some.map((r) => r.bhashacokm)).toEqual([rows[1]!.bhashacokm]);
  });

  it('validates, adds with max + 1, and edits', async () => {
    const empty = await alice.post(`${API}/save`).send({ id: 0, fields: { bhashaname: '  ' } });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Please Enter Letter Type');

    const next = (await maxId()) + 1;
    const added = await alice.post(`${API}/save`).send({
      id: 0,
      fields: {
        bhashaname: 'વેબ ભાષા',
        bhasa_attr: 'WB',
        columnNo: '7 ',
        remark: 'r',
        UplevelKt: 1,
      },
    });
    expect(added.status).toBe(200);
    expect(added.body.id).toBe(next);
    expect(added.body.row).toMatchObject({ bhashacokm: next, bhashaname: 'વેબ ભાષા', columnNo: 7 });
    const record = (await alice.get(`${API}/record/${next}`)).body as GridRow;
    expect(record).toMatchObject({ shortnm: 'WB', UplevelKt: 1 }); // shortnm comes from Attr

    const edited = await alice
      .post(`${API}/save`)
      .send({ id: next, fields: { bhashaname: 'Edited' } });
    expect(edited.body.row).toMatchObject({ bhashacokm: next, bhashaname: 'Edited' });
  });

  it('lets only one user edit a record at a time (DataEditingInfo)', async () => {
    const id = await maxId();
    expect(
      (await alice.post(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json')).status,
    ).toBe(204);
    // Taking it again is fine for the same user.
    expect(
      (await alice.post(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json')).status,
    ).toBe(204);

    const refused = await bob
      .post(`${API}/edit-lock/${id}`)
      .set('Content-Type', 'application/json');
    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe(`Record is in used by - ${aliceName}`);
    const save = await bob.post(`${API}/save`).send({ id, fields: { bhashaname: 'x' } });
    expect(save.status).toBe(409);

    await alice.delete(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json');
    expect(
      (await bob.post(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json')).status,
    ).toBe(204);
  });

  it('deletes and locks only with the security password', async () => {
    const id = (
      await alice.post(`${API}/save`).send({ id: 0, fields: { bhashaname: 'to delete' } })
    ).body.id as number;

    const wrong = await alice.post(`${API}/delete`).send({ ids: [id], password: 'nope' });
    expect(wrong.status).toBe(401);

    const locked = await alice
      .post(`${API}/lock`)
      .send({ ids: [id], lock: true, password: ` ${SECURITY} ` });
    expect(locked.body.message).toBe('Locked Successfully in 1 Records');
    // "locked" is not a grid column for Bhasha; the record shows it.
    expect((await alice.get(`${API}/record/${id}`)).body).toMatchObject({
      bhashacokm: id,
      locked: true,
    });
    const unlocked = await alice
      .post(`${API}/lock`)
      .send({ ids: [id], lock: false, password: SECURITY });
    expect(unlocked.body.message).toBe('Unlocked Successfully1 Records');

    expect((await alice.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status).toBe(
      204,
    );
    expect((await alice.get(`${API}/record/${id}`)).status).toBe(404);
  });

  it('searches by typed text, by F2 values, in a range and for blanks', async () => {
    const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
    const col = (name: string) => meta.searchColumns.find((c) => c.displayName === name)!.id;
    await alice
      .post(`${API}/save`)
      .send({ id: 0, fields: { bhashaname: 'Zzqweb one', columnNo: '901' } });
    await alice
      .post(`${API}/save`)
      .send({ id: 0, fields: { bhashaname: 'Zzqweb two', columnNo: '902' } });
    const all = (await alice.post(`${API}/list`).send({})).body as GridRow[];
    const gridIds = all.map((r) => Number(r.bhashacokm));

    const byText = (
      await alice
        .post(`${API}/search`)
        .send({
          columnId: col('Name'),
          scope: 'all',
          gridIds,
          notIn: false,
          values: [],
          text: 'zzqweb+two',
        })
    ).body as GridRow[];
    expect(byText.map((r) => r.bhashaname)).toEqual(['Zzqweb two']);

    const values = (
      await alice
        .post(`${API}/search-values`)
        .send({ columnId: col('Name'), scope: 'grid', gridIds })
    ).body as PickList;
    expect(values.rows.map((r) => r[1])).toEqual(
      expect.arrayContaining(['Zzqweb one', 'Zzqweb two']),
    );

    const picked = (
      await alice.post(`${API}/search`).send({
        columnId: col('Name'),
        scope: 'grid',
        gridIds,
        notIn: false,
        values: ['Zzqweb one'],
        text: '',
      })
    ).body as GridRow[];
    expect(picked.map((r) => r.bhashaname)).toEqual(['Zzqweb one']);

    const notPicked = (
      await alice.post(`${API}/search`).send({
        columnId: col('Name'),
        scope: 'all',
        gridIds,
        notIn: true,
        values: ['Zzqweb one'],
        text: '',
      })
    ).body as GridRow[];
    expect(notPicked.map((r) => r.bhashaname)).not.toContain('Zzqweb one');
    expect(notPicked.map((r) => r.bhashaname)).toContain('Zzqweb two');

    const range = (
      await alice
        .post(`${API}/search-range`)
        .send({ columnId: col('columnNo'), from: '901', to: '902' })
    ).body as GridRow[];
    expect(range.map((r) => r.bhashaname).sort()).toEqual(['Zzqweb one', 'Zzqweb two']);
    const badRange = await alice
      .post(`${API}/search-range`)
      .send({ columnId: col('columnNo'), from: 'a', to: '2' });
    expect(badRange.body.message).toBe('Please Enter Proper Value (Ex.:- 1-10)');

    const blank = (
      await alice.post(`${API}/search-blank`).send({ columnId: col('Hindi Word'), blank: true })
    ).body as GridRow[];
    expect(blank.map((r) => r.bhashaname)).toEqual(
      expect.arrayContaining(['Zzqweb one', 'Zzqweb two']),
    );
    // SQL Server ignores trailing spaces, so ' ' counts as blank, as on the desktop.
    expect(blank.every((r) => String(r.hindiword ?? '').trim() === '' || r.hindiword === '0')).toBe(
      true,
    );
  });

  it('serves the F2 lists of the form fields (F2EntryText)', async () => {
    const upLevel = (await alice.get(`${API}/f2/UplevelKt`)).body as PickList;
    expect(upLevel.columns).toEqual(['bhashacokm', 'bhashaname']);
    expect(upLevel.rows.length).toBeGreaterThan(10);
    // A "...Name" box is looked up without the suffix (Txt_KeyDown); "Uplevel" has no row.
    const byName = (await alice.get(`${API}/f2/UplevelName`)).body as PickList;
    expect(byName).toEqual({ columns: [], rows: [] });
    const brief = (await alice.get(`${API}/f2/brief`)).body as PickList;
    expect(brief.columns).toEqual(['brief']);
  });

  it('updates the usage count and finds where records are used', async () => {
    const [first] = (await alice.post(`${API}/list`).send({})).body as GridRow[];
    const id = Number(first!.bhashacokm);
    const counted = await alice.post(`${API}/action/update-count`).send({ ids: [id] });
    expect(counted.body.kind).toBe('refreshed');
    expect(String(counted.body.rows[0].count)).toMatch(/^\d+\+\d+\+\d+\+\d+\+\d+$/);

    const { rows: used } = await sql<{
      id: number;
    }>`SELECT TOP 1 bhashakt AS id FROM krutibhasT WHERE bhashakt > 0`.execute(trx);
    if (used[0]) {
      const inUse = await alice.post(`${API}/action/in-use-kruti`).send({ ids: [used[0].id] });
      expect(inUse.body).toMatchObject({ kind: 'open', screen: 'kruti-master' });
      expect(inUse.body.ids.length).toBeGreaterThan(0);
    }
    const none = await alice.post(`${API}/action/in-use-book`).send({ ids: [-1] });
    expect(none.body).toMatchObject({
      ids: [],
      emptyMessage: 'No Book Available for Current Selection',
    });
  });

  it('refuses unknown screens and serves the user font preferences', async () => {
    expect((await alice.get('/api/master/no-such-screen/meta')).status).toBe(403);
    const prefs = (await alice.get('/api/me/preferences')).body as UiPreferences;
    // No UserConfig row: clsCommon.SetTextboxEvent's default.
    expect(prefs.textBoxFont).toEqual({
      family: 'Arial Unicode MS',
      sizePt: 18,
      bold: false,
      italic: false,
    });
    expect(prefs.search).toMatchObject({
      andChar: '+',
      orChar: '-',
      splitChar: '/',
      condition: 'Like',
    });
  });
});
