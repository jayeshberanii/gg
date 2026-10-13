import type { ActionResult, ReportBlock, ReportDocument } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, useMasterHarness } from './master-harness.js';

type Table = Extract<ReportBlock, { kind: 'table' }>;
const tables = (doc: ReportDocument) => doc.blocks.filter((b): b is Table => b.kind === 'table');
const texts = (cells: { text: string }[]) => cells.map((c) => c.text);

/**
 * Author Master › Print Report: the report site's pages (GGWebSolution HomeController), built
 * by the API. Every test is rolled back. See docs/screens/reports.md.
 */
describe.skipIf(!hasDb)('Author reports (integration)', () => {
  const h = useMasterHarness();
  const B = '/api/master/author-master';

  async function report(action: string, body: object = { ids: [] }): Promise<ReportDocument> {
    const res = await h.user.post(`${B}/action/${action}`).send(body);
    expect(res.status).toBe(200);
    const result = res.body as ActionResult;
    expect(result.kind).toBe('report');
    return (result as Extract<ActionResult, { kind: 'report' }>).document;
  }
  const tranIds = () => h.scalar(sql`SELECT COUNT(*) FROM TranIds`);

  it('Author Report lists the authors that have a Report No, as PrintAuthor returns them', async () => {
    const doc = await report('author-report');
    const [t] = tables(doc);
    expect(doc.title).toBe('Author Report');
    expect(texts(t!.head[0]!)).toEqual(['क्र.', 'कर्तानाम', 'संप्रदाय', 'गुरू', 'संवत्', 'विशेषण']);
    expect(t!.head[0]!.map((c) => c.width)).toEqual([3, 20, 18, 19, 26, 15]);

    const { rows } = await sql<Record<string, unknown>>`EXEC PrintAuthor`.execute(h.trx);
    expect(t!.rows).toHaveLength(rows.length);
    expect(rows.length).toBeGreaterThan(0);
    expect(texts(t!.rows[0]!.cells)).toEqual([
      String(rows[0]!.ReportNo),
      rows[0]!.authorname,
      rows[0]!.Sampraday,
      rows[0]!.Guru,
      rows[0]!.Samvat ?? '',
      rows[0]!.Visheshan,
    ]);
    // Sampraday, Samvat and Visheshan are the view's Html.Raw columns.
    expect(t!.rows[0]!.cells.map((c) => Boolean(c.rich))).toEqual([
      false,
      false,
      true,
      false,
      true,
      true,
    ]);
  });

  it(
    'Author Parampara Report prints one heading and its filled fields per author',
    { timeout: 60_000 },
    async () => {
      const doc = await report('parampara-report', { ids: [], params: { printReference: false } });
      const { rows } = await sql<Record<string, unknown>>`EXEC AuthorParamparaReport 0`.execute(
        h.trx,
      );
      const headings = doc.blocks.filter((b) => b.kind === 'heading');
      expect(headings).toHaveLength(rows.length);
      expect(headings[0]).toMatchObject({
        text: `${rows[0]!.Seq}. ${rows[0]!.AuthorName}`,
        align: 'center',
      });
      const fields = doc.blocks.find((b) => b.kind === 'fields');
      expect(fields && fields.kind === 'fields' && fields.fields.every((f) => f.value !== '')).toBe(
        true,
      );
      expect(doc.font).toBe('shree');
    },
  );

  it('Author Detail Report prints the selected authors and leaves TranIds empty', async () => {
    const { rows } = await sql<{ id: number; name: string; recordno: number | null }>`
      SELECT TOP 2 authorcokm AS id, authorname AS name, recordno FROM authmast
      WHERE authorcokm IN (SELECT AuthmastKt FROM AuthMAnyNmT) ORDER BY authorcokm`.execute(h.trx);
    const ids = rows.map((r) => r.id);
    const doc = await report('author-detail-report', { ids });
    const [t] = tables(doc);
    expect(t!.columns).toEqual([5, 15, 50, 30]);
    const heads = t!.rows.filter((r) => r.cells[1]?.text === 'Author Name');
    expect(heads.map((r) => r.cells[2]!.text)).toEqual(rows.map((r) => r.name));
    expect(heads[0]!.cells[0]).toMatchObject({ text: '1', bold: true });
    expect(heads[0]!.cells[3]!.text).toBe(`RecordNo - ${rows[0]!.recordno ?? ''}`);
    const labels = new Set(t!.rows.map((r) => r.cells[1]?.text).filter(Boolean));
    expect(labels.has('Anya Name')).toBe(true);
    expect(labels.has('Guru')).toBe(false);
    expect(await tranIds()).toBe(0);

    // Kruti Author Check: the short form, with "Guru" in place of "Parampara".
    const check = await report('kruti-author-check', { ids });
    const checkLabels = new Set(tables(check)[0]!.rows.map((r) => r.cells[1]?.text));
    for (const hidden of ['Visheshan', 'Parichay', 'Note', 'Parampara', 'Anya Yogdan']) {
      expect(checkLabels.has(hidden)).toBe(false);
    }
    expect(await tranIds()).toBe(0);
  });
});
