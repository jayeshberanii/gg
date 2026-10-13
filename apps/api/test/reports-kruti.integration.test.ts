import type { ActionResult, ReportBlock, ReportDocument } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, useMasterHarness } from './master-harness.js';

type Table = Extract<ReportBlock, { kind: 'table' }>;
const tableOf = (doc: ReportDocument) => doc.blocks.find((b): b is Table => b.kind === 'table')!;
const texts = (cells: { text: string }[]) => cells.map((c) => c.text);
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Kruti Master's reports: the report site's pages (GGWebSolution HomeController), built by the
 * API. Every test is rolled back. See docs/screens/reports.md.
 */
describe.skipIf(!hasDb)('Kruti reports (integration)', { timeout: 300_000 }, () => {
  const h = useMasterHarness();
  const B = '/api/master/kruti-master';

  async function run(action: string, params: object) {
    return h.user.post(`${B}/action/${action}`).send({ ids: [], params });
  }
  async function report(action: string, params: object): Promise<ReportDocument> {
    const res = await run(action, params);
    expect(res.status).toBe(200);
    const result = res.body as ActionResult;
    expect(result.kind).toBe('report');
    return (result as Extract<ActionResult, { kind: 'report' }>).document;
  }
  const tranIds = () => h.scalar(sql`SELECT COUNT(*) FROM TranIds`);

  /**
   * The Sampraday the report procedures default to (the one the Akaradi lists are kept for),
   * and five of its krutis.
   */
  async function fixtures() {
    const sampraday = await h.scalar(sql`
      SELECT TOP 1 SampradayKt FROM KrutiSampradayT
      GROUP BY SampradayKt ORDER BY CASE WHEN SampradayKt = 15333 THEN 0 ELSE 1 END, COUNT(*) DESC`);
    const { rows } = await sql<{ id: number }>`
      SELECT TOP 5 K.krutimstkm AS id FROM krutiMst K
      INNER JOIN KrutiSampradayT S ON S.KrutimstKt = K.krutimstkm
      WHERE S.SampradayKt = ${sampraday} ORDER BY K.krutimstkm`.execute(h.trx);
    return { sampraday, krutis: rows.map((r) => r.id) };
  }

  it('Kruti Report prints the krutis of the chosen Report Nos under their Vibhag', async () => {
    const { rows: nos } = await sql<{ pno: number }>`
      SELECT DISTINCT TOP 2 pno FROM krutiMst WHERE ISNULL(pno, 0) > 0 ORDER BY pno`.execute(h.trx);
    const pnos = nos.map((r) => r.pno).join(',');
    const doc = await report('kruti-report', { pnos });
    const t = tableOf(doc);
    expect(texts(t.head[0]!).slice(0, 5)).toEqual(['कृ.क्र.', 'स्वरूप', 'पे.', 'कर्ता', 'संवत्']);

    await sql`EXEC SetTranIds 1, ${pnos}`.execute(h.trx);
    const { rows: expected } = await sql<Record<string, unknown>>`EXEC PrintKrutiReport`.execute(
      h.trx,
    );
    await sql`EXEC SetTranIds 0`.execute(h.trx);
    expect(expected.length).toBeGreaterThan(0);
    expect(t.rows[0]).toMatchObject({ band: 2 });
    expect(t.rows[0]!.cells[0]!.text).toBe(expected[0]!.VibhagName);
    const lines = t.rows.filter((r) => !r.band);
    expect(lines).toHaveLength(expected.length);
    expect(texts(lines[0]!.cells)).toEqual([
      s(expected[0]!.ReportNo),
      s(expected[0]!.SwaroopName),
      s(expected[0]!.SwaroopSeq),
      s(expected[0]!.Karta),
      s(expected[0]!.Samvat),
      s(expected[0]!.KrutiDetail),
    ]);
    expect(await tranIds()).toBe(0);
  });

  it('Main Report and Main Report As Agam Suchi print the picked krutis', async () => {
    const { sampraday, krutis } = await fixtures();
    const ids = krutis.join(',');

    const main = tableOf(await report('main-report', { sampraday, ids, printAdiAnt: true }));
    const { rows: expected } = await sql<Record<string, unknown>>`
      EXEC PrintKrutiAkaradiReport ${sampraday}, ${ids}, 1`.execute(h.trx);
    expect(main.rows).toHaveLength(expected.length);
    expect(texts(main.head[0]!).slice(0, 4)).toEqual([
      'कृ.क्र.',
      'कृति परिचायक नाम',
      'कर्ता',
      'संवत्',
    ]);
    if (expected.length > 0) {
      expect(texts(main.rows[0]!.cells)).toEqual([
        s(expected[0]!.Seq),
        s(expected[0]!.KrutiParichayakName),
        s(expected[0]!.Karta),
        s(expected[0]!.Samvat),
        s(expected[0]!.KrutiDetail),
      ]);
    }

    const agam = tableOf(await report('agam-suchi', { sampraday, ids, printAdiAnt: true }));
    expect(agam.head[0]).toHaveLength(7);
    expect(agam.font).toBe('shree');
    const bands = agam.rows.filter((r) => r.band);
    const details = agam.rows.filter((r) => !r.band);
    expect(bands.length).toBeGreaterThan(0);
    expect(bands[0]!.cells[0]).toMatchObject({ colSpan: 7, bold: true });
    // "<n>. <name> (<its lines>)": the counts add up to the lines printed.
    const counted = bands.map((b) => Number(/\((\d+)\)$/.exec(b.cells[0]!.text)![1]));
    expect(counted.reduce((a, b) => a + b, 0)).toBe(details.length);
    expect(details[0]!.cells).toHaveLength(7);
    expect(details[0]!.cells[6]).toMatchObject({ rich: true, align: 'justify' });
    expect(await tranIds()).toBe(0);

    // Pattern2: the Kruti No first, an eighth column.
    const pattern2 = tableOf(
      await report('agam-suchi', { sampraday, ids, printAdiAnt: false, pattern: 2 }),
    );
    expect(pattern2.head[0]).toHaveLength(8);
    expect(pattern2.head[0]![0]!.text).toBe('कृ.क्र.');

    // Pattern1 passes a fourth argument, which only the later desktop's procedure takes: an
    // older database is told so.
    const fourArguments = await h.scalar(sql`
      SELECT COUNT(*) FROM sys.parameters
      WHERE object_id = OBJECT_ID('PrintKrutiAkaradiAgamSuchiReport')`);
    const pattern1 = await run('agam-suchi', { sampraday, ids, printAdiAnt: false, pattern: 1 });
    if (fourArguments >= 4) {
      expect(pattern1.status).toBe(200);
      expect(texts(pattern1.body.document.blocks[0].head[0])[6]).toMatch(/^पूर्णता \* /);
    } else {
      expect(pattern1.status).toBe(400);
      expect(pattern1.body.message).toContain('Start With Purnata');
    }
    expect(await tranIds()).toBe(0);
  });

  it('the Akaradi appendices each print their own columns', async () => {
    const { sampraday } = await fixtures();
    const head = async (type: string) => {
      const t = tableOf(await report('akaradi-report', { type, sampraday }));
      return { t, head: texts(t.head[0] ?? []) };
    };

    // (AnyaName, the first appendix, runs for half a minute: longer than a statement may in
    // the tests' transaction, so the quicker kinds are checked here.)
    const main = await head('MainKruti');
    expect(main.head).toEqual(['कृ.क्र.', 'कृति परिचायक नाम', 'विषय']);
    const { rows: expected } = await sql<Record<string, unknown>>`
      EXEC PrintKrutiAkaradiParishisht 'MainKruti', ${sampraday}`.execute(h.trx);
    expect(main.t.rows).toHaveLength(expected.length);
    if (expected.length > 0) {
      expect(texts(main.t.rows[0]!.cells)).toEqual([
        s(expected[0]!.AkaradiSeq),
        s(expected[0]!.KrutiParichayakName),
        s(expected[0]!.Vishay),
      ]);
    }

    // Bhasha: no header; a numbered grey heading, then the kruti numbers.
    const bhasha = await head('Bhasha');
    expect(bhasha.head).toEqual([]);
    if (bhasha.t.rows.length > 0) {
      expect(bhasha.t.rows[0]).toMatchObject({ band: 2 });
      expect(bhasha.t.rows[0]!.cells[0]!.text).toMatch(/^1\. /);
      expect(bhasha.t.rows[1]!.band).toBeUndefined();
    }

    // Apurna: grouped by Vishesh, numbered again in each group.
    const apurna = await head('Apurna');
    expect(apurna.head).toEqual(['क्रम', 'कृति क्रमांक', 'कृति नाम', 'कर्ता']);
    if (apurna.t.rows.length > 0) {
      expect(apurna.t.rows[0]!.cells[0]).toMatchObject({ colSpan: 4, bold: true });
      expect(apurna.t.rows[1]!.cells[0]!.text).toBe('1');
    }

    expect((await head('KartaName')).head).toHaveLength(3);
    expect((await run('akaradi-report', { type: "x'; DROP TABLE t --", sampraday })).status).toBe(
      400,
    );
  });

  it('परिशिष्ट 9 lists the books of the krutis, in either column set', async () => {
    const { sampraday } = await fixtures();
    const { rows: expected } = await sql<Record<string, unknown>>`
      EXEC PrintKrutiPrakashakReport ${sampraday}`.execute(h.trx);
    const all = tableOf(await report('kruti-prakashak-report', { sampraday, printAll: true }));
    expect(texts(all.head[0]!)).toEqual([
      'कृ.क्र.',
      'अ.क्र.',
      'पुस्तक नाम',
      'प्रकाशक',
      'संपादक आदि',
      'सं',
      'लाईब्रेरी नं',
    ]);
    expect(all.rows).toHaveLength(expected.length);
    if (expected.length > 0) {
      expect(texts(all.rows[0]!.cells)).toEqual([
        s(expected[0]!.KrutiNo),
        s(expected[0]!.AkaradiSeq),
        s(expected[0]!.BookName),
        s(expected[0]!.Prakashak),
        s(expected[0]!.AuthorName),
        s(expected[0]!.PSamvatVK),
        s(expected[0]!.LibNo),
      ]);
    }
    const short = tableOf(await report('kruti-prakashak-report', { sampraday, printAll: false }));
    expect(texts(short.head[0]!)[1]).toBe('लाईब्रेरी नं');
    expect(texts(short.head[0]!)[6]).toBe('आवृत्ति');
  });
});
