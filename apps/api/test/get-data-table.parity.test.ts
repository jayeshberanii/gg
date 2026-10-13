import { sql } from 'kysely';
import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type Database } from '../src/db/db.module.js';
import { ident, trustedSql } from '../src/db/trusted-sql.js';
import {
  gridAlias,
  gridColumnsSql,
  loadTblSearch,
  recordColumnsSql,
  unescapeSql,
} from '../src/master/tbl-search.js';

/**
 * Parity with the desktop's GetDataTable procedure, which every list screen uses: for each
 * TransactionName in tblSearch, the web app's column list must return the same rows and
 * columns as the procedure. Read-only.
 */
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);

const TOP = 25;
// Same columns and values per row. Column order is not compared: GridSeq ties have no defined
// order in SQL Server, and the web grids name their columns explicitly.
const norm = (rows: Record<string, unknown>[]) =>
  rows.map((r) =>
    JSON.stringify(
      Object.entries(r)
        .map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ),
  );

describe.skipIf(!hasDb)('GetDataTable parity (read-only)', () => {
  const db: Database | undefined = hasDb ? createDatabase(loadEnv()) : undefined;

  afterAll(async () => {
    await db?.destroy();
  });

  it('builds the same grid and record queries as the procedure for every screen', async () => {
    const { rows: txs } = await sql<{ t: string; pk: string | null }>`
      SELECT TransactionName AS t, MAX(PrimaryColumn) AS pk FROM tblSearch
      WHERE ISNULL(PrimaryColumn, '') <> '' AND OBJECT_ID(TransactionName, 'U') IS NOT NULL
      GROUP BY TransactionName ORDER BY TransactionName
    `.execute(db!);
    expect(txs.length).toBeGreaterThan(20);

    const compared: string[] = [];
    const procFailures: string[] = [];
    const nonUniqueKey: string[] = [];
    for (const { t, pk } of txs) {
      // With a non-unique "primary column", TOP n ORDER BY key picks tied rows arbitrarily.
      let dup: { d: number }[];
      try {
        ({ rows: dup } = await sql<{ d: number }>`
          SELECT COUNT(*) - COUNT(DISTINCT ${ident(pk!)}) AS d FROM ${ident(t)}
        `.execute(db!));
      } catch {
        procFailures.push(`${t} (key column missing)`);
        continue;
      }
      if (dup[0]!.d > 0) {
        nonUniqueKey.push(t);
        continue;
      }
      const meta = await loadTblSearch(db!, t);
      for (const grid of [1, 0] as const) {
        let expected: Record<string, unknown>[];
        try {
          const r = await sql<Record<string, unknown>>`
            EXEC GetDataTable @TransactionName = ${t}, @PrimaryColumn = ${pk}, @IsDisplayGrid = ${grid},
              @TotRecords = ${grid ? TOP : 0}, @StrId = ${grid ? '' : '1,2,3'}
          `.execute(db!);
          expected = r.rows;
        } catch {
          // The desktop cannot open this list either (e.g. a stale tblSearch row).
          procFailures.push(`${t}/${grid}`);
          continue;
        }
        const cols = grid ? gridColumnsSql(meta) : recordColumnsSql(meta);
        const where = grid ? sql`` : sql`AND ${ident(pk!)} IN (1, 2, 3)`;
        const top = grid ? sql`TOP (${TOP})` : sql``;
        const { rows: actual } = await sql<Record<string, unknown>>`
          SELECT ${top} ${trustedSql(unescapeSql(cols))} FROM ${ident(t)} WHERE 1 = 1 ${where}
          ORDER BY ${ident(pk!)} DESC
        `.execute(db!);
        // The procedure returns a GridColumnName aliased to its own column next to the column
        // itself under the same name, and the driver keeps the last of the two; the web renames
        // the second "<name>1" as the desktop's DataTable does. Compare like with like.
        if (grid) {
          for (const r of meta) {
            const c = r.ColumnName ?? '';
            if (
              !r.DisplayInGrid ||
              !r.GridColumnName ||
              gridAlias(r.GridColumnName) !== c.toLowerCase()
            )
              continue;
            for (const row of actual) {
              if (!(`${c}1` in row)) continue; // only where the web renamed it
              const key = Object.keys(row).find((k) => k.toLowerCase() === c.toLowerCase()) ?? c;
              row[key] = row[`${c}1`];
              delete row[`${c}1`];
            }
          }
        }
        expect(norm(actual).sort(), `${t} (IsDisplayGrid=${grid})`).toEqual(norm(expected).sort());
        compared.push(`${t}/${grid}`);
      }
    }
    console.log(
      `GetDataTable parity: ${compared.length} queries matched; skipped (key not unique): ${nonUniqueKey.join(', ') || 'none'}; procedure itself failed for: ${procFailures.join(', ') || 'none'}`,
    );
    expect(compared.length).toBeGreaterThan(30);
  }, 120_000);
});
