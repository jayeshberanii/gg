import type { ActionResult, ReportBlock, ReportDocument } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, useMasterHarness } from './master-harness.js';

type Table = Extract<ReportBlock, { kind: 'table' }>;
const tableOf = (doc: ReportDocument) => doc.blocks.find((b): b is Table => b.kind === 'table')!;
const texts = (cells: { text: string }[]) => cells.map((c) => c.text);

/**
 * Book Master › Print Report: the report site's pages (GGWebSolution HomeController), built by
 * the API. Every test is rolled back. See docs/screens/reports.md.
 */
describe.skipIf(!hasDb)('Book reports (integration)', { timeout: 120_000 }, () => {
  const h = useMasterHarness();
  const B = '/api/master/book-master';

  async function report(action: string, params: object): Promise<ReportDocument> {
    const res = await h.user.post(`${B}/action/${action}`).send({ ids: [], params });
    expect(res.status).toBe(200);
    const result = res.body as ActionResult;
    expect(result.kind).toBe('report');
    return (result as Extract<ActionResult, { kind: 'report' }>).document;
  }

  /** A Vibhag with printed books that have vishesh lines, and its busiest vishesh column. */
  async function fixtures() {
    const vibhag = await h.scalar(sql`
      SELECT TOP 1 BV.VibhagKt FROM BookVibhagT BV
      INNER JOIN praksnVisheshT P ON P.prakashannokt = BV.BookMastKt
      INNER JOIN BookM B ON B.BookMastkm = BV.BookMastKt
      INNER JOIN columnmaster C ON C.ColumnMastkm = BV.VibhagKt
      WHERE ISNULL(B.PrintNo, 0) > 0 AND ISNULL(C.Name, '') <> ''
      GROUP BY BV.VibhagKt HAVING COUNT(*) BETWEEN 50 AND 800 ORDER BY COUNT(*) DESC`);
    const column = await h.scalar(sql`
      SELECT TOP 1 P.ColumnMastkt FROM praksnVisheshT P
      INNER JOIN BookVibhagT BV ON P.prakashannokt = BV.BookMastKt
      INNER JOIN BookM B ON B.BookMastkm = BV.BookMastKt
      WHERE BV.VibhagKt = ${vibhag} AND B.PrintNo > 0 AND ISNULL(P.ColumnMastkt, 0) > 0
      GROUP BY P.ColumnMastkt ORDER BY COUNT(*) DESC`);
    return { vibhag, column };
  }

  it('Book Report groups the chosen print numbers by Vibhag and clears TranIds', async () => {
    const { rows: nos } = await sql<{ PrintNo: number }>`
      SELECT DISTINCT TOP 3 PrintNo FROM BookM WHERE ISNULL(PrintNo, 0) > 0 ORDER BY PrintNo`.execute(
      h.trx,
    );
    const printNos = nos.map((r) => r.PrintNo);
    const doc = await report('book-report', { printNos });
    const t = tableOf(doc);
    expect(texts(t.head[0]!)).toEqual([
      'प्र.क्र.',
      'प्रकाशन नाम {परिचायक नाम} {लिपि} {कृ.क्र.}',
      'प्रकाशक {ग्रंथमाला}',
      'संपादक, संशोधक आदि',
      'वि.सं. (आ.)',
      'पृष्ठ (कद)',
    ]);
    expect(t.rows[0]).toMatchObject({ band: 2 });
    expect(t.rows[0]!.cells[0]).toMatchObject({ colSpan: 6, align: 'center' });

    await sql`EXEC SetTranIds 1, ${printNos.join(',')}`.execute(h.trx);
    const { rows: expected } = await sql<Record<string, unknown>>`EXEC PrintBookReport`.execute(
      h.trx,
    );
    await sql`EXEC SetTranIds 0`.execute(h.trx);
    const lines = t.rows.filter((r) => !r.band);
    expect(lines).toHaveLength(expected.length);
    expect(lines.length).toBeGreaterThan(0);
    expect(texts(lines[0]!.cells)).toEqual([
      String(expected[0]!.PrintNo),
      expected[0]!.BookPartParichayak,
      expected[0]!.PrakashakGranthMala,
      expected[0]!.SampadakSanshodhak,
      expected[0]!.SamvatAvruti,
      expected[0]!.PageSize,
    ]);
    expect(await h.scalar(sql`SELECT COUNT(*) FROM TranIds`)).toBe(0);
  });

  it('New Vishesh Report prints the Vibhag band, each book and its vishesh lines', async () => {
    const { vibhag } = await fixtures();
    const doc = await report('new-vishesh-report', { vibhagKt: vibhag });
    const t = tableOf(doc);
    expect(t.head).toHaveLength(2);
    expect(texts(t.head[1]!)).toEqual(['', 'शीर्षक नाम', 'विगत, कर्ता, भाषा', 'पृष्ठ']);
    expect(t.columns).toEqual([10, 22, 56, 12]);

    const name = await sql<{ Name: string }>`
      SELECT Name FROM columnmaster WHERE ColumnMastkm = ${vibhag}`.execute(h.trx);
    expect(t.rows[0]).toMatchObject({ band: 1 });
    expect(t.rows[0]!.cells[0]!.text).toBe(name.rows[0]!.Name);

    // Each book line: its print number (shaded) and "name (प्र. publisher) (आ. edition)".
    const books = t.rows.filter((r) => r.head);
    const expected = await h.scalar(sql`
      SELECT COUNT(*) FROM (SELECT DISTINCT B.BookMastkm FROM BookM B
        INNER JOIN AvrutiMast A ON B.Avrutikt = A.Avrutitid AND ISNULL(B.PrintNo, 0) > 0
        INNER JOIN BookVibhagT BV ON BV.BookMastKt = B.BookMastkm
        WHERE BV.VibhagKt = ${vibhag} AND B.BookMastkm IN (
          SELECT P.prakashannokt FROM praksnVisheshT P INNER JOIN columnmaster C ON P.ColumnMastkt = C.ColumnMastkm
          WHERE ISNULL(C.ColumnNo, 0) > 0 AND C.ColumnNo NOT IN (200, 201, 202, 203, 204, 205, 206, 207))) x`);
    expect(books).toHaveLength(expected);
    expect(books.length).toBeGreaterThan(0);
    expect(books[0]!.cells[0]).toMatchObject({ shade: 2 });
    expect(books[0]!.cells[1]!.text).toMatch(/ \(प्र\. .*\) \(आ\. .*\)$/);
    expect(books[0]!.cells[1]).toMatchObject({ colSpan: 3 });
    // Every book is followed by at least one four-cell vishesh line.
    const after = t.rows[t.rows.indexOf(books[0]!) + 1]!;
    expect(after.cells).toHaveLength(4);
  });

  it('Vishesh Parishisht Report prints details with numbers, or the numbers alone', async () => {
    const { vibhag, column } = await fixtures();
    const params = { column: [column], vibhag: [vibhag] };
    const { rows: proc } = await sql<Record<string, unknown>>`
      EXEC PrintVisheshParishisht ${String(column)}, ${String(vibhag)}`.execute(h.trx);
    const distinctDetails = new Set(proc.map((r) => r.Detail)).size;

    const detail = tableOf(
      await report('vishesh-parishisht-report', {
        ...params,
        printDetail: true,
        printVibhag: false,
      }),
    );
    expect(texts(detail.head[0]!)).toEqual(['क्र.', 'विगत', 'प्रकाशन क्रमांक']);
    expect(detail.rows[0]).toMatchObject({ band: 1 });
    const lines = detail.rows.filter((r) => !r.band);
    expect(lines).toHaveLength(distinctDetails);
    expect(lines.map((r) => r.cells[0]!.text)).toEqual(lines.map((_, i) => String(i + 1)));
    const first = proc.find((r) => r.Detail === lines[0]!.cells[1]!.text)!;
    expect(lines[0]!.cells[2]!.text).toBe(first.PrintNo);

    // Print Vibhag: a second band under the column's.
    const byVibhag = tableOf(
      await report('vishesh-parishisht-report', {
        ...params,
        printDetail: true,
        printVibhag: true,
      }),
    );
    expect(byVibhag.rows.slice(0, 2).map((r) => r.band)).toEqual([1, 2]);
    expect(byVibhag.rows.filter((r) => !r.band)).toHaveLength(distinctDetails);

    // Numbers only: one line listing every print number of the column, ascending.
    const numbers = tableOf(
      await report('vishesh-parishisht-report', {
        ...params,
        printDetail: false,
        printVibhag: false,
      }),
    );
    expect(texts(numbers.head[0]!)).toEqual(['प्रकाशन क्रमांक']);
    expect(numbers.rows).toHaveLength(2);
    const listed = numbers.rows[1]!.cells[0]!.text.split(', ').map((n) => Number(n.split('-')[0]));
    const { rows: expected } = await sql<{ PrintNo: number }>`
      SELECT DISTINCT B.PrintNo FROM praksnVisheshT P
      INNER JOIN BookVibhagT BV ON P.prakashannokt = BV.BookMastKt
      INNER JOIN BookM B ON B.BookMastkm = BV.BookMastKt
      WHERE ISNULL(B.PrintNo, 0) > 0 AND P.ColumnMastkt = ${column} AND BV.VibhagKt = ${vibhag}
      ORDER BY B.PrintNo`.execute(h.trx);
    expect([...new Set(listed)]).toEqual(expected.map((r) => r.PrintNo));

    const numbersByVibhag = tableOf(
      await report('vishesh-parishisht-report', {
        ...params,
        printDetail: false,
        printVibhag: true,
      }),
    );
    expect(numbersByVibhag.rows[1]!.cells).toHaveLength(2);
    expect(numbersByVibhag.rows[1]!.cells[1]!.text).toBe(numbers.rows[1]!.cells[0]!.text);
  });

  it('the older Parishisht page strips the appendix labels and numbers each line itself', async () => {
    const { vibhag, column } = await fixtures();
    const t = tableOf(
      await report('vishesh-parishisht-report-old', {
        column: [column],
        vibhag: [vibhag],
        printDetail: true,
        printVibhag: false,
      }),
    );
    expect(texts(t.head[0]!)).toEqual(['क्र.', 'विगत', 'प्रकाशन क्रमांक']);
    const lines = t.rows.filter((r) => !r.band);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((r) => !r.cells[1]!.text.includes("'"))).toBe(true);
    expect(lines.every((r) => /^\d+(-\w+)?(, \d+(-\w+)?)*$/.test(r.cells[2]!.text))).toBe(true);
    // No detail is printed twice.
    expect(new Set(lines.map((r) => r.cells[1]!.text)).size).toBe(lines.length);
  });

  it('Lekh Prastavana Report lists authors, languages and print numbers per column', async () => {
    const { vibhag, column } = await fixtures();
    const doc = await report('lekh-prastavana-report', { column: [column], vibhag: [vibhag] });
    const t = tableOf(doc);
    expect(texts(t.head[0]!)).toEqual(['क्र.', 'कर्ता', 'भाषा', 'प्रकाशन क्रमांक']);
    const name = await sql<{ Name: string }>`
      SELECT Name FROM columnmaster WHERE ColumnMastkm = ${column}`.execute(h.trx);
    expect(t.rows[0]).toMatchObject({ band: 2 });
    expect(t.rows[0]!.cells[0]!.text).toBe(name.rows[0]!.Name);
    const lines = t.rows.slice(1);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((r) => r.cells[0]!.text)).toEqual(lines.map((_, i) => String(i + 1)));
    expect(lines.every((r) => r.cells.length === 4)).toBe(true);
  });
});
