import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type Database } from '../src/db/db.module.js';
import { authorReport } from '../src/reports/author.js';
import { bookReport } from '../src/reports/book.js';
import { hasDb } from './master-harness.js';

/**
 * Outside a transaction (as the running API calls them) the reports use a connection of their
 * own with no statement time limit, and a report that goes through TranIds writes, reads and
 * clears it in one transaction there. These read only, apart from TranIds, which ends empty.
 */
describe.skipIf(!hasDb)(
  'Reports on their own connection (integration)',
  { timeout: 120_000 },
  () => {
    let db: Database;
    const env = loadEnv();

    beforeAll(() => {
      db = createDatabase(env);
    });
    afterAll(async () => {
      await db.destroy();
    });

    it('runs a procedure with no parameters', async () => {
      const doc = await authorReport({ db, env });
      const { rows } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM authmast WHERE ISNULL(ReportNo, 0) > 0`.execute(db);
      const table = doc.blocks[0]!;
      expect(table.kind === 'table' && table.rows.length).toBe(rows[0]!.n);
    });

    it('passes the selection through TranIds and leaves it empty', async () => {
      const { rows: nos } = await sql<{ PrintNo: number }>`
      SELECT DISTINCT TOP 2 PrintNo FROM BookM WHERE ISNULL(PrintNo, 0) > 0 ORDER BY PrintNo`.execute(
        db,
      );
      const doc = await bookReport(
        { db, env },
        nos.map((r) => r.PrintNo),
      );
      const table = doc.blocks[0]!;
      const lines = table.kind === 'table' ? table.rows.filter((r) => !r.band) : [];
      expect(lines.length).toBeGreaterThan(0);
      expect(new Set(lines.map((r) => r.cells[0]!.text))).toEqual(
        new Set(nos.map((r) => String(r.PrintNo))),
      );
      const { rows } = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM TranIds`.execute(db);
      expect(rows[0]!.n).toBe(0);
    });
  },
);
