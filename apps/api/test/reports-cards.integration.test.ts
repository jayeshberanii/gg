import type { ActionResult, ReportBlock, ReportDocument } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, useMasterHarness } from './master-harness.js';

type Table = Extract<ReportBlock, { kind: 'table' }>;
const tablesOf = (doc: ReportDocument) => doc.blocks.filter((b): b is Table => b.kind === 'table');
const texts = (cells: { text: string }[]) => cells.map((c) => c.text);
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * The cards of Kruti Master and Book Master (the desktop's Excel templates) and the Crystal
 * "Main Report As Agam Suchi New". Every test is rolled back. See docs/screens/kruti-master.md
 * and book-master.md, "Cards".
 */
describe.skipIf(!hasDb)('Cards and Agam Suchi New (integration)', { timeout: 300_000 }, () => {
  const h = useMasterHarness();

  async function report(screen: string, action: string, ids: number[], params: object) {
    const res = await h.user.post(`/api/master/${screen}/action/${action}`).send({ ids, params });
    expect(res.status).toBe(200);
    const result = res.body as ActionResult;
    expect(result.kind).toBe('report');
    return (result as Extract<ActionResult, { kind: 'report' }>).document;
  }

  /** A kruti with more than four notes and an up level, and one with no notes. */
  async function krutis() {
    const noted = await h.scalar(sql`
      SELECT TOP 1 N.krutimstkt FROM KrutiNoteT N
      WHERE EXISTS (SELECT 1 FROM krutiRelT R WHERE R.krutimstkt = N.krutimstkt)
      GROUP BY N.krutimstkt HAVING COUNT(*) BETWEEN 5 AND 12 ORDER BY N.krutimstkt`);
    const plain = await h.scalar(sql`
      SELECT TOP 1 K.krutimstkm FROM krutiMst K
      WHERE NOT EXISTS (SELECT 1 FROM KrutiNoteT N WHERE N.krutimstkt = K.krutimstkm)
      ORDER BY K.krutimstkm`);
    return { noted, plain };
  }

  it('Kruti Full Card Portrait puts each value in the cell the desktop writes it to', async () => {
    const { noted, plain } = await krutis();
    // The grid's order is kept: the plain kruti first.
    const doc = await report('kruti-master', 'full-card-portrait', [], {
      gridIds: [plain, noted],
    });
    const cards = tablesOf(doc);
    expect(cards).toHaveLength(2);

    const { rows } = await sql<Record<string, unknown>>`
      SELECT K.krutimstkm, K.KrutiNo, K.extranm, K.Bhasha, K.Author, K.Swaroop, K.adivakya, K.antvakya
      FROM krutiMst K WHERE K.krutimstkm IN (${plain}, ${noted})`.execute(h.trx);
    const of = (id: number) => rows.find((r) => Number(r.krutimstkm) === id)!;

    // No notes: four lines of seven cells, then Adi Vakya (A–C) and Ant Vakya (D–G).
    const first = cards[0]!;
    expect(first.columns).toHaveLength(7);
    expect(first.rows).toHaveLength(5);
    expect(first.rows[0]!.cells[0]).toMatchObject({ text: s(of(plain).KrutiNo), size: 20 });
    expect(first.rows[0]!.cells[1]!.text).toBe(`${s(of(plain).extranm)} (${s(of(plain).Bhasha)})`);
    expect(first.rows[0]!.cells[2]!.text).toBe(s(of(plain).Swaroop));
    expect(first.rows[1]!.cells[1]!.text).toBe(s(of(plain).Author));
    expect(texts(first.rows[0]!.cells.slice(3))).toEqual(['', '', '', '']);
    expect(first.rows[4]!.cells).toEqual([
      { text: s(of(plain).adivakya), colSpan: 3 },
      { text: s(of(plain).antvakya), colSpan: 4 },
    ]);

    // Notes: one per line in D–G, in the note query's order; lines are added past the fourth.
    const { rows: notes } = await sql<Record<string, unknown>>`
      SELECT ISNULL(C1.ShortNm, N'') AS ColShortNm, ISNULL(C2.Name, N'') AS SeriesName, N.wordnm,
        B.LibNo
      FROM KrutiNoteT N
      LEFT JOIN columnmaster C1 ON N.KrutiColKt = C1.ColumnMastkm
      LEFT JOIN columnmaster C2 ON N.SeriesKt = C2.ColumnMastkm
      LEFT JOIN BookT B ON N.BookTkt = B.Tid
      WHERE N.krutimstkt = ${noted} ORDER BY N.krutimstkt, N.KrutiColKt, N.serieskt`.execute(h.trx);
    const second = cards[1]!;
    expect(notes.length).toBeGreaterThan(4);
    expect(second.rows).toHaveLength(notes.length + 1);
    expect(
      second.rows
        .slice(0, -1)
        .map((r) => r.cells[3]!.text)
        .sort(),
    ).toEqual(notes.map((n) => `${s(n.ColShortNm).trim()}-${s(n.SeriesName).trim()}`).sort());
    expect(
      second.rows
        .slice(0, -1)
        .map((r) => r.cells[4]!.text)
        .sort(),
    ).toEqual(notes.map((n) => s(n.wordnm).trim()).sort());
    // Past the fourth line only the note's cells are filled.
    expect(texts(second.rows[4]!.cells.slice(0, 3))).toEqual(['', '', '']);
    // The up levels' Kruti Nos, comma separated, under the Kruti No.
    const { rows: ups } = await sql<{ KrutiNo: unknown }>`
      SELECT K.KrutiNo FROM krutiRelT R INNER JOIN krutiMst K ON R.uplevelKrutimstkt = K.krutimstkm
      WHERE R.krutimstkt = ${noted} ORDER BY R.seq`.execute(h.trx);
    expect(second.rows[1]!.cells[0]!.text.split(',').sort()).toEqual(
      ups.map((u) => s(u.KrutiNo).trim()).sort(),
    );
    expect(second.rows.at(-1)!.cells[0]).toMatchObject({ text: s(of(noted).adivakya), colSpan: 3 });
  });

  it('Kruti Full Card Landscape has eight columns and leaves the unfilled boxes empty', async () => {
    const { noted } = await krutis();
    const doc = await report('kruti-master', 'full-card-landscape', [], { gridIds: [noted] });
    const [card] = tablesOf(doc);
    const k = (
      await sql<Record<string, unknown>>`
        SELECT KrutiNo, krutiname, extranm, granthagra, adivakya, antvakya FROM krutiMst
        WHERE krutimstkm = ${noted}`.execute(h.trx)
    ).rows[0]!;
    expect(card!.columns).toHaveLength(8);
    expect(texts(card!.rows[0]!.cells.slice(0, 3))).toEqual([s(k.KrutiNo), s(k.krutiname), '']);
    expect(texts(card!.rows[1]!.cells.slice(0, 3))).toEqual(['', s(k.extranm), '']);
    expect(card!.rows[3]!.cells[0]!.text).toBe(s(k.granthagra));
    expect(card!.rows[3]!.cells[1]!.text).toBe('');
    expect(card!.rows.at(-1)!.cells).toEqual([
      { text: s(k.adivakya), colSpan: 3 },
      { text: '' },
      { text: s(k.antvakya), colSpan: 4 },
    ]);
  });

  it('a card page refuses more records than it can hold, and none gives an empty page', async () => {
    const res = await h.user
      .post('/api/master/kruti-master/action/full-card-portrait')
      .send({ ids: [], params: { gridIds: Array.from({ length: 2001 }, (_, i) => i + 1) } });
    expect(res.status).toBe(400);
    const empty = await report('kruti-master', 'full-card-portrait', [], { gridIds: [] });
    expect(empty.blocks).toEqual([]);
  });

  it('Book Full Card Portrait prints the book, its krutis and its Vishesh', async () => {
    // A book with one main copy and more than five krutis.
    const book = await h.scalar(sql`
      SELECT TOP 1 b.BookMastkt FROM krutireflibno kr INNER JOIN BookT b ON kr.BookTKt = b.Tid
      WHERE (SELECT COUNT(*) FROM BookT T WHERE T.BookMastkt = b.BookMastkt AND T.MainL = 1) = 1
      GROUP BY b.BookMastkt HAVING COUNT(DISTINCT kr.krutimstkt) BETWEEN 6 AND 12
      ORDER BY b.BookMastkt`);
    const m = (
      await sql<Record<string, unknown>>`
        SELECT M.PrintNo, M.BookName, M.Part, M.ParichayakName, M.txtPrakashak, M.txtAuthor, M.txtLipi,
          M.Pages FROM BookM M WHERE M.BookMastkm = ${book}`.execute(h.trx)
    ).rows[0]!;
    const { rows: krutiRows } = await sql<Record<string, unknown>>`
      SELECT DISTINCT k.KrutiNo, k.extranm, k.author, k.Pariman, kr.lipi FROM krutiMst k
      INNER JOIN krutireflibno kr ON kr.krutimstkt = k.krutimstkm
      INNER JOIN BookT b ON kr.BookTKt = b.Tid WHERE b.BookMastkt = ${book}`.execute(h.trx);

    const yes = tablesOf(
      await report('book-master', 'full-card-portrait', [book], { withParichayak: true }),
    );
    expect(yes).toHaveLength(1);
    const card = yes[0]!;
    expect(card.columns).toHaveLength(6);
    expect(card.rows).toHaveLength(Math.max(5, krutiRows.length) + 1);
    expect(card.rows[0]!.cells[0]).toMatchObject({ text: s(m.PrintNo), size: 20 });
    expect(card.rows[0]!.cells[1]!.text).toBe(
      `${s(m.BookName)} ${s(m.Part)}(${s(m.ParichayakName)})`,
    );
    expect(card.rows[1]!.cells[1]!.text).toBe(s(m.txtPrakashak));
    expect(card.rows[3]!.cells[1]!.text).toBe(s(m.txtAuthor));
    expect(card.rows[3]!.cells[2]!.text).toBe(s(m.txtLipi));
    expect(card.rows[4]!.cells[1]!.text).toBe(s(m.Pages));
    // One kruti per line in D–F: "<name> (<bhasha>) (<Kruti No>)", its author, pariman and lipi.
    const lines = card.rows.slice(0, krutiRows.length);
    expect(lines.map((r) => /\((\d+)\)$/.exec(r.cells[3]!.text)?.[1]).sort()).toEqual(
      krutiRows.map((k) => s(k.KrutiNo)).sort(),
    );
    expect(lines.map((r) => r.cells[4]!.text).sort()).toEqual(
      krutiRows.map((k) => s(k.author).trim()).sort(),
    );
    expect(card.rows.at(-1)!.cells).toHaveLength(1);
    expect(card.rows.at(-1)!.cells[0]).toMatchObject({ colSpan: 6 });

    // Answer No: the name without the Parichayak Name.
    const no = tablesOf(
      await report('book-master', 'full-card-portrait', [book], { withParichayak: false }),
    );
    expect(no[0]!.rows[0]!.cells[1]!.text).toBe(`${s(m.BookName)} ${s(m.Part)}`);
  });

  it('Main Report As Agam Suchi New prints the Crystal procedure’s lines under their groups', async () => {
    const sampraday = await h.scalar(sql`
      SELECT TOP 1 SampradayKt FROM KrutiSampradayT
      GROUP BY SampradayKt ORDER BY CASE WHEN SampradayKt = 15333 THEN 0 ELSE 1 END, COUNT(*) DESC`);
    const { rows: picked } = await sql<{ id: number }>`
      SELECT TOP 5 K.krutimstkm AS id FROM krutiMst K
      INNER JOIN KrutiSampradayT S ON S.KrutimstKt = K.krutimstkm
      WHERE S.SampradayKt = ${sampraday} ORDER BY K.krutimstkm`.execute(h.trx);
    const ids = picked.map((r) => r.id).join(',');

    const doc = await report('kruti-master', 'agam-suchi-new', [], {
      sampraday,
      ids,
      printAdiAnt: true,
    });
    const [t] = tablesOf(doc);
    expect(t!.head[0]).toHaveLength(7);

    await sql`EXEC SetTranIds 1, ${ids}`.execute(h.trx);
    const { rows: expected } = await sql<Record<string, unknown>>`
      EXEC PrintKrutiAkaradiAgamSuchiCrystalReport ${sampraday}, 1, 0`.execute(h.trx);
    await sql`EXEC SetTranIds 0`.execute(h.trx);
    expect(expected.length).toBeGreaterThan(0);

    const bands = t!.rows.filter((r) => r.band);
    const details = t!.rows.filter((r) => !r.band);
    expect(details).toHaveLength(expected.length);
    expect(details.map((r) => r.cells[0]!.text)).toEqual(expected.map((e) => s(e.RowNumber)));
    expect(details.map((r) => r.cells[3]!.text)).toEqual(expected.map((e) => s(e.Karta)));
    expect(details.map((r) => r.cells[6]!.text)).toEqual(expected.map((e) => s(e.KrutiDetail)));
    expect(details[0]!.cells[6]).toMatchObject({ rich: true, align: 'justify' });
    // One heading per MainSeq: "<MainSeq>. <name> (<its lines>)".
    expect(bands).toHaveLength(new Set(expected.map((e) => s(e.MainSeq))).size);
    expect(bands[0]!.cells[0]).toMatchObject({
      text: `${s(expected[0]!.MainSeqStr)}. ${s(expected[0]!.KrutiParichayakName)} (${s(expected[0]!.MainSeqCountStr)})`,
      colSpan: 7,
    });
    // The selection is cleared again.
    expect(await h.scalar(sql`SELECT COUNT(*) FROM TranIds`)).toBe(0);
  });
});
