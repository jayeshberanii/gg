import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type Database } from '../src/db/db.module.js';

// Runs against the real legacy DB when apps/api/.env exists; skipped otherwise (e.g. CI).
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const hasDb = Boolean(process.env.DB_HOST);

describe.skipIf(!hasDb)('legacy SQL Server (integration, read-only)', () => {
  const db: Database | undefined = hasDb ? createDatabase(loadEnv()) : undefined;

  afterAll(async () => {
    await db?.destroy();
  });

  it('reads bhasmast through the generated types', async () => {
    const rows = await db!
      .selectFrom('bhasmast')
      .select(['bhashacokm', 'bhashaname'])
      .orderBy('bhashacokm')
      .top(3)
      .execute();
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0]!.bhashacokm).toBe('number');
  });

  it('round-trips Gujarati text as nvarchar', async () => {
    const [row] = await db!.selectNoFrom((eb) => eb.val('ગ્રંથાલય').as('word')).execute();
    expect(row!.word).toBe('ગ્રંથાલય');
  });

  it('reads the tblSearch metadata that drives grids and F2 lookups', async () => {
    const rows = await db!.selectFrom('tblSearch').select('TransactionName').distinct().execute();
    expect(rows.length).toBeGreaterThan(10);
  });
});
