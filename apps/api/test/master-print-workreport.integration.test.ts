import 'reflect-metadata';
import type { DB } from '@gglib/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { MasterMeta, PrintResult, WorkReportEntry } from '@gglib/shared';
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
 * The master engine's generic Print Selected Column and Work Report pieces (5c), exercised
 * through Bhasha Master, against the real DB inside a transaction rolled back after each test.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);
const PASSWORD = 'Secret1';
const API = '/api/master/bhasha-master';

describe.skipIf(!hasDb)(
  'Print Selected Column and Work Report via the master engine (integration)',
  () => {
    let db: Database;
    let trx: ControlledTransaction<DB>;
    let app: NestExpressApplication;
    let alice: request.Agent;
    let aliceId: number;
    let aliceName: string;

    beforeAll(() => {
      db = createDatabase(loadEnv());
    });
    afterAll(async () => {
      await db.destroy();
    });

    beforeEach(async () => {
      trx = await db.startTransaction().execute();
      const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
        .overrideProvider(KYSELY)
        .useValue(trx)
        .compile();
      app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
      configureApp(app, env);
      await app.init();
      const stamp = Date.now() % 1_000_000;
      aliceName = `mtpalice${stamp}`;
      await sql`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      VALUES (${aliceName}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 0, 0, 0, 1, 0, 1, 3, '08:00')
    `.execute(trx);
      alice = request.agent(app.getHttpServer());
      const res = await alice
        .post('/api/auth/login')
        .send({ username: aliceName, password: PASSWORD });
      expect(res.status).toBe(200);
      aliceId = res.body.user.id as number;
    });

    afterEach(async () => {
      await app.close();
      await trx.rollback().execute();
    });

    it('lists printable columns in meta, in PrintSeq order', async () => {
      const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
      expect(meta.printColumns.length).toBeGreaterThan(0);
      expect(meta.printColumns.map((c) => c.name)).toEqual(
        expect.arrayContaining(['Name', 'Brief', 'Uplevel']),
      );
      // Every index is a fresh 0-based position into that same list.
      expect(meta.printColumns.map((c) => c.index)).toEqual(meta.printColumns.map((_, i) => i));
    });

    it('prints the chosen columns for the selected records, including a joined (subquery) column', async () => {
      const rows = (await alice.post(`${API}/list`).send({})).body as {
        bhashacokm: number;
        bhashaname: string;
      }[];
      const id = rows[0]!.bhashacokm;
      const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
      const nameIdx = meta.printColumns.find((c) => c.name === 'Name')!.index;
      const upLevelIdx = meta.printColumns.find((c) => c.name === 'Uplevel')!.index;

      const result = (
        await alice.post(`${API}/print`).send({ ids: [id], columnIndices: [nameIdx, upLevelIdx] })
      ).body as PrintResult;
      expect(result.columns).toEqual(['Name', 'Uplevel']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]![0]).toBe(rows[0]!.bhashaname);

      const noColumns = await alice.post(`${API}/print`).send({ ids: [id], columnIndices: [] });
      expect(noColumns.status).toBe(400);
      const noRecords = await alice
        .post(`${API}/print`)
        .send({ ids: [], columnIndices: [nameIdx] });
      expect(noRecords.status).toBe(400);
    });

    it('reads a saved Config_Master layout by id instead of the picker', async () => {
      const rows = (await alice.post(`${API}/list`).send({})).body as { bhashacokm: number }[];
      const id = rows[0]!.bhashacokm;
      const configId = Math.floor(Math.random() * 1_000_000) + 500_000;
      await sql`
      INSERT INTO Config_Master (ConfigId, ConfigName, ConfigType, ConfigStr, ShortcutKey)
      VALUES (${configId}, 'Test Layout', 'bhasmast', '0,1', 'Ctrl|9')
    `.execute(trx);

      const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
      const layout = meta.printLayouts.find((l) => l.id === configId);
      expect(layout).toMatchObject({
        name: 'Test Layout',
        shortcut: 'Ctrl|9',
        columnIndices: [0, 1],
      });
      expect(meta.savedPrintLayouts.map((l) => l.id)).toContain(configId);

      const result = (await alice.post(`${API}/print`).send({ ids: [id], layoutId: configId }))
        .body as PrintResult;
      expect(result.title).toBe('Test Layout');
      expect(result.columns).toHaveLength(2);

      const unknown = await alice.post(`${API}/print`).send({ ids: [id], layoutId: -1 });
      expect(unknown.status).toBe(404);
    });

    it('saves a new print layout, edits it, and refuses a clashing shortcut', async () => {
      const meta = (await alice.get(`${API}/meta`)).body as MasterMeta;
      const [a, b] = meta.printColumns.map((c) => c.index);

      const created = (
        await alice
          .post(`${API}/print-layouts`)
          .send({ name: 'e2e layout', columnIndices: [a, b], shortcut: 'Ctrl|7' })
      ).body as { id: number; name: string; shortcut: string; columnIndices: number[] };
      expect(created).toMatchObject({
        name: 'e2e layout',
        shortcut: 'Ctrl|7',
        columnIndices: [a, b],
      });

      // A layout without a shortcut appears only in the full list, not the menu-shortcut one.
      const other = (
        await alice
          .post(`${API}/print-layouts`)
          .send({ name: 'no shortcut layout', columnIndices: [a] })
      ).body as { id: number };
      const afterAdd = (await alice.get(`${API}/meta`)).body as MasterMeta;
      expect(afterAdd.printLayouts.map((l) => l.id)).toContain(created.id);
      expect(afterAdd.printLayouts.map((l) => l.id)).not.toContain(other.id);
      expect(afterAdd.savedPrintLayouts.map((l) => l.id)).toEqual(
        expect.arrayContaining([created.id, other.id]),
      );

      // Editing (configId set) reuses the same row, renamed and reordered.
      const edited = (
        await alice
          .post(`${API}/print-layouts`)
          .send({ configId: created.id, name: 'e2e layout renamed', columnIndices: [b, a] })
      ).body as { id: number; name: string; shortcut: string; columnIndices: number[] };
      expect(edited).toMatchObject({
        id: created.id,
        name: 'e2e layout renamed',
        columnIndices: [b, a],
      });
      // Dropping the shortcut on edit clears it (SaveConfig writes ShortcutKey = NULL either way).
      expect(edited.shortcut).toBe('');
      const afterEdit = (await alice.get(`${API}/meta`)).body as MasterMeta;
      expect(afterEdit.printLayouts.map((l) => l.id)).not.toContain(created.id);

      const clash = await alice
        .post(`${API}/print-layouts`)
        .send({ name: 'clashing', columnIndices: [a], shortcut: 'Ctrl|7' });
      expect(clash.status).toBe(200); // Ctrl|7 was freed when "e2e layout" was edited above.

      const clash2 = await alice
        .post(`${API}/print-layouts`)
        .send({ name: 'clashing again', columnIndices: [a], shortcut: 'Ctrl|7' });
      expect(clash2.status).toBe(409);
      expect(clash2.body.message).toBe('Shortcut Key Already Assigned');

      const unknownEdit = await alice
        .post(`${API}/print-layouts`)
        .send({ configId: -1, name: 'x', columnIndices: [a] });
      expect(unknownEdit.status).toBe(404);
    });

    it("reads a record's work report and its F2 lists, and saves nothing (as on the desktop)", async () => {
      const rows = (await alice.post(`${API}/list`).send({})).body as { bhashacokm: number }[];
      const id = rows[0]!.bhashacokm;
      await sql`
      INSERT INTO WorkReportM (RecordNo, TableName, ColumnName, WorkTypeGId, DoneByGId, Workdate, Mistake, Remark, alterTime)
      VALUES (${String(id)}, 'bhasmast', '', 0, ${aliceId}, CAST(GETDATE() AS date), 'bhashaname(Oldval)=1', 'wr test', CAST(GETDATE() AS time))
    `.execute(trx);

      const report = (await alice.get(`${API}/work-report/${id}`)).body as WorkReportEntry[];
      expect(report.find((r) => r.Remark === 'wr test')).toMatchObject({
        DoneByGId: aliceId,
        DoneBy: aliceName,
        Mistake: 'bhashaname(Oldval)=1',
      });

      // Compare Data: GetMistakeRemarkDetail of that entry, only for an entry of this record.
      const km = report.find((r) => r.Remark === 'wr test')!.WorkReportKm;
      const compare = await alice.get(`${API}/work-report/${id}/compare/${km}`);
      expect(compare.status).toBe(200);
      expect(compare.body.columns).toEqual(['ColName', 'OldData', 'NewData']);
      expect(JSON.stringify(compare.body.rows)).toContain('Oldval');
      const other = await alice.get(`${API}/work-report/${id + 1}/compare/${km}`);
      expect(other.body.rows ?? []).toEqual([]);

      for (const lookup of ['worktype', 'doneby']) {
        const res = await alice.post(`${API}/trans/WorkReport/lookup/${lookup}`).send({ row: {} });
        expect(res.status).toBe(200);
        expect(res.body.columns).toEqual(['ColumnMastkm', 'Name']);
      }
      expect(
        (await alice.post(`${API}/trans/WorkReport/lookup/nope`).send({ row: {} })).status,
      ).toBe(404);
      // frmDisplayTransNew's Save only re-reads WorkReportM: there is no write route.
      expect((await alice.post(`${API}/work-report/${id}`).send({ rows: [] })).status).toBe(404);
    });
  },
);
