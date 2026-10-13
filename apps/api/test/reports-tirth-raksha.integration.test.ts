import type { ActionResult } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, useMasterHarness } from './master-harness.js';

/**
 * Tirth Raksha Master › Print Report › Main Report (Home/PrintTirthRakshaReport). The
 * procedure came with a later version of the desktop, so a database restored from an older
 * backup does not have it: the report then says so. See docs/screens/reports.md.
 */
describe.skipIf(!hasDb)('Tirth Raksha report (integration)', { timeout: 60_000 }, () => {
  const h = useMasterHarness();

  it('prints the selected records, or says the procedure is missing', async () => {
    const { rows } = await sql<{ id: number }>`
      SELECT TOP 2 TirthRakshaKm AS id FROM TirthRakshaM ORDER BY TirthRakshaKm`.execute(h.trx);
    const ids = rows.map((r) => r.id);
    const res = await h.user
      .post('/api/master/tirth-raksha-master/action/main-report')
      .send({ ids });
    const exists = await h.scalar(
      sql`SELECT CASE WHEN OBJECT_ID('PrintTirthRakshaReport', 'P') IS NULL THEN 0 ELSE 1 END`,
    );
    if (!exists) {
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('PrintTirthRakshaReport');
      return;
    }
    expect(res.status).toBe(200);
    const result = res.body as Extract<ActionResult, { kind: 'report' }>;
    expect(result.kind).toBe('report');
    expect(result.document).toMatchObject({ title: 'PrintTirthRakshaReport', font: 'shree' });
    const fields = result.document.blocks.filter((b) => b.kind === 'fields');
    expect(fields).toHaveLength(ids.length);
    expect(fields[0]!.kind === 'fields' && fields[0]!.fields[0]!.label).toBe('Seq');
    expect(await h.scalar(sql`SELECT COUNT(*) FROM TranIds`)).toBe(0);
  });
});
