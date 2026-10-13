import type { ReportDocument, ReportRow as Row } from '@gglib/shared';
import { sql } from 'kysely';
import { idList } from '../db/legacy-sql.js';
import { band, cell, distinct, orderBy, row, table, th } from './build.js';
import {
  col,
  num,
  reportRows,
  type ReportRow as Data,
  str,
  withTranIds,
  type ReportSource,
} from './run.js';

/**
 * Book Master › Print Report: the report site's HomeController actions PrintVishesh,
 * PrintParishishtNew (and the older PrintParishisht), PrintLekhPrastavana and PrintBookReport,
 * each laid out as its Razor view. The site built its SQL by joining the id lists into the
 * text; here they are bound parameters. See docs/screens/reports.md.
 */

const top = { top: true } as const;
const GANESH_16 = { bold: true, size: 16, font: 'ganesh' } as const;

// ------------------------------------------------------------------------------------------
// New Vishesh Report (Home/PrintVishesh, BookVisheshRepository)
// ------------------------------------------------------------------------------------------

/**
 * A book's publishers, as ListBook builds them one book at a time: the 'प्रकाशन विशेष' name if
 * there is one, else all the names; first those not marked purva, then "(P) " and the purva ones.
 */
const publisher = (purva: 0 | 1) => sql`
  ISNULL(NULLIF((SELECT TOP 1 ISNULL(nameSelected, '') FROM praksnPrakT
      INNER JOIN columnmaster ON praksnPrakT.PrakTypekt = columnmaster.ColumnMastkm
      WHERE ISNULL(praksnPrakT.purva, 0) = ${purva} AND praksnPrakT.prakashannokt = PAGING.BookMastKm
        AND columnmaster.Name = N'प्रकाशन विशेष'), ''),
    ISNULL((STUFF((SELECT ', ' + nameSelected FROM praksnPrakT
      WHERE ISNULL(praksnPrakT.purva, 0) = ${purva} AND praksnPrakT.prakashannokt = PAGING.BookMastKm
      FOR XML PATH('')), 1, 1, '')), ''))`;

export async function visheshReport(
  source: ReportSource,
  vibhags: readonly number[],
): Promise<ReportDocument> {
  const vibhagRows = await reportRows(
    source,
    sql`SELECT DISTINCT BookVibhagT.VibhagKt, columnmaster.Name AS VibhagName, columnmaster.columnno
      FROM BookVibhagT INNER JOIN columnmaster ON BookVibhagT.VibhagKt = columnmaster.ColumnMastkm
      WHERE columnmaster.ColumnMastkm IN ${idList(vibhags)} AND ISNULL(columnmaster.name, '') <> ''
      ORDER BY columnmaster.columnno`,
  );
  const books = await reportRows(
    source,
    sql`WITH PAGING AS (
        SELECT DISTINCT BookMastKm,
          CASE WHEN ISNULL(BookM.ShortName, '') <> '' THEN BookM.ShortName ELSE BookName END
            + CASE WHEN ISNULL(BookM.Part, '') = '' THEN '' ELSE ' ' + BookM.Part + ' ' END AS BookNamePart,
          AvrutiMast.Avrutiname, BookVibhagT.VibhagKt, BookM.PrintNo,
          CASE WHEN ISNUMERIC(ISNULL(BookM.PartNo, '')) = 1 THEN CAST(BookM.PartNo AS INT) ELSE 0 END AS PrintSeq
        FROM BookM INNER JOIN AvrutiMast ON BookM.Avrutikt = AvrutiMast.Avrutitid AND ISNULL(PrintNo, 0) > 0
        INNER JOIN BookVibhagT ON BookVibhagT.BookMastKt = BookM.BookMastKm
        WHERE BookVibhagT.VibhagKt IN ${idList(vibhags)}
          AND BookMastkm IN (SELECT prakashannokt FROM praksnVisheshT WHERE prakashannokt = BookM.BookMastkm))
      SELECT PAGING.*, ${publisher(0)} AS Apurva, ${publisher(1)} AS Purva
      FROM PAGING ORDER BY VibhagKt, PrintNo, PrintSeq`,
  );
  const vishesh = await reportRows(
    source,
    sql`SELECT DISTINCT praksnVisheshT.prakashannokt, prksnvisheshkm, ISNULL(columnmaster_1.Name, '') AS M1,
        CAST(ISNULL(columnmaster.ColumnNo, 0) AS integer) ColumnNo, ISNULL(columnmaster.ShortNm, N'') AS ColumnName,
        praksnVisheshT.Detail,
        CASE WHEN praksnVisheshT.prakashannokt = 0 THEN '' ELSE STUFF((SELECT ', ' + CASE WHEN ISNULL(Sub.AuthAnyaNmKt, 0) = 0
            THEN authmast.authorname ELSE AuthMAnyNmT.AnyaName END
          FROM praksnVisheshT SubT INNER JOIN PraksnVishAutT Sub ON SubT.prksnvisheshkm = Sub.prksnvisheshkt
          INNER JOIN authmast ON Sub.Authorkt = authmast.authorcokm
          LEFT JOIN AuthMAnyNmT ON Sub.AuthAnyaNmKt = AuthMAnyNmT.AuthAnyaNmKm
          WHERE ISNULL(authmast.authorname, '') <> '' AND Sub.prakashannokt = praksnVisheshT.prakashannokt
            AND SubT.prksnvisheshkm = praksnVisheshT.prksnvisheshkm FOR XML PATH('')), 1, 1, '') END AS authorname,
        STUFF((SELECT ', ' + bhasmast.bhasa_attr FROM praksnVisheshT SubT
          INNER JOIN PraksnVishBhasT Sub ON SubT.prksnvisheshkm = Sub.prksnvisheshkt
          INNER JOIN bhasmast ON Sub.bhashakt = bhasmast.bhashacokm
          WHERE ISNULL(bhasmast.bhasa_attr, '') <> '' AND Sub.prakashannokt = praksnVisheshT.prakashannokt
            AND SubT.prksnvisheshkm = praksnVisheshT.prksnvisheshkm FOR XML PATH('')), 1, 1, '') AS bhashaname,
        ISNULL(praksnVisheshT.RefPgno, 0) AS RefPgno, praksnVisheshT.seq
      FROM praksnVisheshT INNER JOIN BookVibhagT ON praksnVisheshT.prakashannokt = BookVibhagT.BookMastKt
      LEFT OUTER JOIN columnmaster AS columnmaster_1 ON praksnVisheshT.Mark1 = columnmaster_1.ColumnMastkm
      LEFT OUTER JOIN columnmaster ON praksnVisheshT.ColumnMastkt = columnmaster.ColumnMastkm
      WHERE ISNULL(columnmaster.columnNo, 0) > 0
        AND columnmaster.columnNo NOT IN (200, 201, 202, 203, 204, 205, 206, 207)
        AND BookVibhagT.VibhagKt IN ${idList(vibhags)}
      ORDER BY praksnVisheshT.prksnvisheshkm, praksnVisheshT.seq`,
  );
  const visheshOf = new Map<number, Data[]>();
  for (const v of vishesh) {
    const book = num(col(v, 'prakashannokt'));
    visheshOf.set(book, [...(visheshOf.get(book) ?? []), v]);
  }

  const rows: Row[] = [];
  for (const vibhag of vibhagRows) {
    const own = books.filter((b) => num(col(b, 'VibhagKt')) === num(col(vibhag, 'VibhagKt')));
    if (own.length === 0) continue;
    rows.push(band(1, str(col(vibhag, 'VibhagName')), 4, GANESH_16));
    for (const book of own) {
      let lines = visheshOf.get(num(col(book, 'BookMastKm'))) ?? [];
      if (lines.length === 0) continue;
      // A book that has a column 72 line prints only its 37 and 72 lines.
      if (lines.some((l) => num(col(l, 'ColumnNo')) === 72)) {
        lines = lines.filter((l) => [37, 72].includes(num(col(l, 'ColumnNo'))));
      }
      const apurva = str(col(book, 'Apurva'));
      const purva = str(col(book, 'Purva')) === '' ? '' : `(P) ${str(col(book, 'Purva'))}`;
      const prakashak = apurva !== '' && purva !== '' ? `${apurva}, ${purva}` : apurva || purva;
      const seq = num(col(book, 'PrintSeq'));
      rows.push({
        head: true,
        cells: [
          cell(`${str(col(book, 'PrintNo'))}${seq > 0 ? `-${seq}` : ''}`, { shade: 2 }),
          cell(
            `${str(col(book, 'BookNamePart'))} (प्र. ${prakashak}) (आ. ${str(col(book, 'Avrutiname'))})`,
            { colSpan: 3, align: 'justify' },
          ),
        ],
      });
      for (const l of lines) {
        const author = str(col(l, 'authorname')).trim();
        const bhasha = str(col(l, 'bhashaname')).trim();
        rows.push(
          row(
            str(col(l, 'M1')),
            str(col(l, 'ColumnName')),
            cell(
              `${str(col(l, 'Detail'))}${author === '' ? '' : ` (कर्ता-${author})`}${
                bhasha === '' ? '' : ` (भाषा-${bhasha})`
              }`,
              { align: 'justify' },
            ),
            str(col(l, 'RefPgno')),
          ),
        );
      }
    }
  }
  const center = { align: 'center' } as const;
  return {
    title: 'PrintVishesh',
    blocks: [
      table(
        [
          [
            th('प्र. क्र.', undefined, center),
            th('प्रकाशन नाम, प्रकाशक (प्र.), आवृत्ति (आ.)', undefined, { colSpan: 3, ...center }),
          ],
          [
            th('', undefined, center),
            th('शीर्षक नाम', undefined, center),
            th('विगत, कर्ता, भाषा', undefined, center),
            th('पृष्ठ', undefined, center),
          ],
        ],
        rows,
        // The view's table has no width of its own, so its cells' percentages decide.
        { columns: [10, 22, 56, 12], fixed: false, ...top },
      ),
    ],
  };
}

// ------------------------------------------------------------------------------------------
// Vishesh Parishisht Report (Home/PrintParishishtNew, VisheshParishishtRepository)
// ------------------------------------------------------------------------------------------

/**
 * GetPrintNo: the print numbers of the books that have a vishesh line under this column, in the
 * given Vibhags: "12, 15-1, 15-2, 20" (a number whose books have numeric part numbers lists
 * them as number-part). One query for every column and Vibhag at once.
 */
async function printNumbers(
  source: ReportSource,
  columns: readonly number[],
  vibhags: readonly number[],
): Promise<(column: number, vibhags: readonly number[]) => string> {
  const rows = await reportRows(
    source,
    sql`SELECT C1.ColumnMastkm, BV1.VibhagKt, BMain1.PrintNo, BMain1.Part, BMain1.PartNo,
        CASE WHEN ISNULL(BMain1.PartNo, '') <> '' AND ISNUMERIC(BMain1.PartNo) = 1
          THEN CAST(BMain1.PartNo AS INT) END AS PartSeq
      FROM praksnVisheshT P1 INNER JOIN columnmaster C1 ON P1.ColumnMastkt = C1.ColumnMastkm
      INNER JOIN BookVibhagT BV1 ON P1.prakashannokt = BV1.BookMastKt
      INNER JOIN BookM BMain1 ON BMain1.BookMastkm = BV1.BookMastKt
      WHERE ISNULL(BMain1.PrintNo, 0) > 0 AND C1.ColumnMastkm IN ${idList(columns)}
        AND BV1.VibhagKt IN ${idList(vibhags)}
      GROUP BY C1.ColumnMastkm, BV1.VibhagKt, BMain1.PrintNo, BMain1.Part, BMain1.PartNo`,
  );
  return (column, within) =>
    printNoList(
      rows.filter(
        (r) => num(col(r, 'ColumnMastkm')) === column && within.includes(num(col(r, 'VibhagKt'))),
      ),
    );
}

/** "12, 15-1, 15-2, 20" from rows of PrintNo, Part, PartNo and PartSeq (the numeric part). */
function printNoList(own: readonly Data[]): string {
  const numbers = distinct(
    orderBy(own, (r) => num(col(r, 'PrintNo'))),
    (r) => num(col(r, 'PrintNo')),
  );
  return numbers
    .map((no) => {
      // GROUP BY PrintNo, Part, PartNo, ordered by the part number.
      const parts = distinct(
        orderBy(
          own.filter((r) => num(col(r, 'PrintNo')) === no && col(r, 'PartSeq') != null),
          (r) => num(col(r, 'PartSeq')),
        ),
        (r) => `${str(col(r, 'Part'))}\u0000${str(col(r, 'PartNo'))}`,
      ).map((key) => `${no}-${key.split('\u0000')[1]}`);
      return parts.length > 0 ? parts.join(', ') : String(no);
    })
    .join(', ');
}

/** The "परिशिष्ट … -" labels the older report takes off the front of a detail line. */
const PARISHISHT_PREFIXES = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'अ',
  '1(क)',
  '1(ख)',
  '1(ग)',
  '2(क)',
  '2(ख)',
  'ब',
  '11',
  '12',
  '3-4',
  '1-5',
  'य',
  '2-3',
  'A',
  'स',
  'र',
  '2(क-ख-ग)',
  '16',
  '21',
  '22',
  'B',
  '13',
  '15',
  '19',
  '20',
  '14',
  '17',
  '23',
  '18',
].map((n) => `परिशिष्ट ${n} -`);

/** ListDetail's PrintDetail: the detail without its appendix label, quotes as backticks. */
export function parishishtDetail(detail: string): string {
  let out = detail.replaceAll("'", '`');
  for (const prefix of PARISHISHT_PREFIXES) out = out.replaceAll(prefix, '').trim();
  return out;
}

/**
 * The older Home/PrintParishisht's data, in the shape PrintVisheshParishisht returns: its
 * inline SQL (ListColumns, ListDetail) and a GetPrintNo call per line, here one query whose
 * rows are grouped by the stripped detail.
 */
async function legacyParishishtRows(
  source: ReportSource,
  { columns, vibhags, printVibhag }: ParishishtOptions,
): Promise<Data[]> {
  const rows = await reportRows(
    source,
    sql`SELECT DISTINCT C.ColumnMastkm, C.ColumnNo, C.Name AS ColumnName, Vib.ColumnMastkm AS VibhagKt,
        Vib.ColumnNo AS VibhagNo, Vib.Name AS VibhagName, P.Detail, B.PrintNo, B.Part, B.PartNo,
        CASE WHEN ISNULL(B.PartNo, '') <> '' AND ISNUMERIC(B.PartNo) = 1 THEN CAST(B.PartNo AS INT) END AS PartSeq
      FROM praksnVisheshT P INNER JOIN columnmaster C ON P.ColumnMastkt = C.ColumnMastkm
      INNER JOIN BookVibhagT BV ON P.prakashannokt = BV.BookMastKt
      INNER JOIN columnmaster Vib ON BV.VibhagKt = Vib.ColumnMastkm
      INNER JOIN BookM B ON B.BookMastkm = BV.BookMastKt
      WHERE ISNULL(B.PrintNo, 0) > 0 AND C.ColumnMastkm IN ${idList(columns)}
        AND BV.VibhagKt IN ${idList(vibhags)}`,
  );
  const groups = new Map<string, Data[]>();
  for (const r of rows) {
    const key = [
      num(col(r, 'ColumnMastkm')),
      printVibhag ? num(col(r, 'VibhagKt')) : 0,
      parishishtDetail(str(col(r, 'Detail'))),
    ].join('\u0000');
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((own) => ({
    ...own[0]!,
    Detail: parishishtDetail(str(col(own[0]!, 'Detail'))),
    PrintNo: printNoList(own),
  }));
}

export type ParishishtOptions = {
  /** Print Detail: each detail line with its print numbers; otherwise the numbers alone. */
  printDetail: boolean;
  /** The vishesh columns (columnmaster ids) and the Vibhags to print. */
  columns: readonly number[];
  vibhags: readonly number[];
  /** Print Vibhag: sub-group by Vibhag. */
  printVibhag: boolean;
};

/**
 * `legacy`: the older Home/PrintParishisht, which nothing on the desktop opens any more; it
 * differs only in where the detail lines and their numbers come from.
 */
export async function visheshParishishtReport(
  source: ReportSource,
  options: ParishishtOptions,
  legacy = false,
): Promise<ReportDocument> {
  const { printDetail, columns, vibhags, printVibhag } = options;
  const fetched = legacy
    ? await legacyParishishtRows(source, options)
    : await reportRows(
        source,
        sql`EXEC PrintVisheshParishisht ${columns.join(',')}, ${vibhags.join(',')}`,
      );
  // The controller's lists: the rows by column name then Vibhag name; a column's first row,
  // by column number; each column's Vibhags.
  const main = orderBy(
    fetched,
    (r) => str(col(r, 'ColumnName')),
    (r) => str(col(r, 'VibhagName')),
  );
  const columnHeads = orderBy(
    main.filter(
      (r, i) => i === 0 || num(col(main[i - 1]!, 'ColumnMastkm')) !== num(col(r, 'ColumnMastkm')),
    ),
    (r) => num(col(r, 'ColumnNo')),
  );
  const columnVibhags: Data[] = [];
  for (const r of main) {
    if (
      !columnVibhags.some(
        (v) =>
          num(col(v, 'ColumnMastkm')) === num(col(r, 'ColumnMastkm')) &&
          str(col(v, 'VibhagKt')) === str(col(r, 'VibhagKt')),
      )
    ) {
      columnVibhags.push(r);
    }
  }
  const printNo = printDetail ? null : await printNumbers(source, columns, vibhags);

  const rows: Row[] = [];
  for (const column of columnHeads) {
    const id = num(col(column, 'ColumnMastkm'));
    const ofColumn = main.filter((r) => num(col(r, 'ColumnMastkm')) === id);
    const ownVibhags = orderBy(
      columnVibhags.filter((r) => num(col(r, 'ColumnMastkm')) === id),
      (r) => num(col(r, 'VibhagNo')),
    );
    if (!printDetail) {
      rows.push(band(1, str(col(column, 'ColumnName')), 2, GANESH_16));
      if (printVibhag) {
        for (const v of ownVibhags) {
          rows.push(
            row(
              cell(str(col(v, 'VibhagName')), { width: 24 }),
              cell(printNo!(id, [num(col(v, 'VibhagKt'))]), { width: 76, align: 'justify' }),
            ),
          );
        }
      } else {
        rows.push(row(cell(printNo!(id, vibhags), { colSpan: 2, align: 'justify' })));
      }
      continue;
    }

    let count = 0;
    /** The detail lines, each once (a line repeated in a row prints its first numbers only). */
    const details = (list: Data[]) => {
      let previous = '';
      for (const r of orderBy(list, (d) => str(col(d, 'Detail')))) {
        const detail = str(col(r, 'Detail'));
        if (detail !== previous) {
          rows.push(
            row(
              String(++count),
              cell(detail, { align: 'justify' }),
              cell(str(col(r, 'PrintNo')), { align: 'justify' }),
            ),
          );
        }
        previous = detail;
      }
    };
    if (printVibhag ? ownVibhags.length > 0 : ofColumn.length > 0) {
      rows.push(band(1, str(col(column, 'ColumnName')), 3, GANESH_16));
    }
    if (!printVibhag) {
      details(ofColumn);
      continue;
    }
    for (const v of ownVibhags) {
      const list = ofColumn.filter((r) => str(col(r, 'VibhagKt')) === str(col(v, 'VibhagKt')));
      if (list.length === 0) continue;
      rows.push(band(2, str(col(v, 'VibhagName')), 3, { bold: true, size: 15 }));
      details(list);
    }
  }

  const center = { align: 'center' } as const;
  return {
    title: legacy ? 'PrintParishisht' : 'PrintParishishtNew',
    blocks: [
      table(
        [
          printDetail
            ? [th('क्र.', 6, center), th('विगत', 69, center), th('प्रकाशन क्रमांक', 25, center)]
            : [th('प्रकाशन क्रमांक', 100, { colSpan: 2, ...center })],
        ],
        rows,
        { fixed: false, ...top },
      ),
    ],
  };
}

// ------------------------------------------------------------------------------------------
// Lekh Prastavana Report (Home/PrintLekhPrastavana, LekhPrastavanaRepository)
// ------------------------------------------------------------------------------------------

export async function lekhPrastavanaReport(
  source: ReportSource,
  columns: readonly number[],
  vibhags: readonly number[],
): Promise<ReportDocument> {
  const columnRows = await reportRows(
    source,
    sql`SELECT DISTINCT C.ColumnMastkm, C.ColumnNo, C.Name AS ColumnName FROM columnmaster C
      WHERE C.ColumnMastkm IN ${idList(columns)} ORDER BY C.Name`,
  );
  const details = await reportRows(
    source,
    sql`WITH PAGING AS (
        SELECT P.ColumnMastkt,
          STUFF((SELECT ', ' + authmast.authorname FROM praksnVisheshT SubT
            INNER JOIN PraksnVishAutT Sub ON SubT.prksnvisheshkm = Sub.prksnvisheshkt
            INNER JOIN authmast ON Sub.Authorkt = authmast.authorcokm
            WHERE Sub.prakashannokt = P.prakashannokt AND SubT.prksnvisheshkm = P.prksnvisheshkm
            FOR XML PATH('')), 1, 1, '') AS AuthorName,
          STUFF((SELECT ', ' + bhasmast.bhashaname FROM praksnVisheshT SubT
            INNER JOIN PraksnVishBhasT Sub ON SubT.prksnvisheshkm = Sub.prksnvisheshkt
            INNER JOIN bhasmast ON Sub.bhashakt = bhasmast.bhashacokm
            WHERE Sub.prakashannokt = P.prakashannokt AND SubT.prksnvisheshkm = P.prksnvisheshkm
            FOR XML PATH('')), 1, 1, '') AS Bhasha
        FROM praksnVisheshT P INNER JOIN BookM B ON P.prakashannokt = B.BookMastkm
        INNER JOIN BookVibhagT BV ON P.prakashannokt = BV.BookMastKt
        INNER JOIN columnmaster C ON P.ColumnMastkt = C.ColumnMastkm
        WHERE P.ColumnMastkt IN ${idList(columns)} AND B.PrintNo > 0 AND BV.VibhagKt IN ${idList(vibhags)})
      SELECT ColumnMastkt, AuthorName, Bhasha,
        STUFF((SELECT ', ' + CAST(SubB.PrintNo AS VARCHAR(10)) + CASE WHEN ISNULL(SubB.PartNo, '') = '' THEN '' ELSE '-' END
            + ISNULL(SubB.PartNo, '')
          FROM praksnVisheshT SubP INNER JOIN BookM SubB ON SubP.prakashannokt = SubB.BookMastkm
          INNER JOIN BookVibhagT SubBV ON SubP.prakashannokt = SubBV.BookMastKt
          WHERE SubP.ColumnMastkt = PAGING.ColumnMastkt AND SubB.PrintNo > 0 AND SubBV.VibhagKt IN ${idList(vibhags)}
            AND PAGING.authorname = STUFF((SELECT ', ' + authmast.authorname FROM praksnVisheshT SubT
              INNER JOIN PraksnVishAutT Sub ON SubT.prksnvisheshkm = Sub.prksnvisheshkt
              INNER JOIN authmast ON Sub.Authorkt = authmast.authorcokm
              LEFT JOIN AuthMAnyNmT ON Sub.AuthAnyaNmKt = AuthMAnyNmT.AuthAnyaNmKm
              WHERE Sub.prakashannokt = SubP.prakashannokt AND SubT.prksnvisheshkm = SubP.prksnvisheshkm
              FOR XML PATH('')), 1, 1, '')
            AND ISNULL(PAGING.Bhasha, '') = (ISNULL(STUFF((SELECT ', ' + bhasmast.bhashaname FROM PraksnVishBhasT Sub
              INNER JOIN bhasmast ON Sub.bhashakt = bhasmast.bhashacokm
              WHERE Sub.prakashannokt = SubP.prakashannokt AND Sub.prksnvisheshkt = SubP.prksnvisheshkm
              FOR XML PATH('')), 1, 1, ''), ''))
          GROUP BY SubB.PrintNo, SubB.PartNo ORDER BY SubB.PrintNo FOR XML PATH('')), 1, 1, '') AS Pages
      FROM PAGING GROUP BY ColumnMastkt, authorname, Bhasha ORDER BY authorname, Bhasha`,
  );

  const rows: Row[] = [];
  for (const column of columnRows) {
    rows.push(band(2, str(col(column, 'ColumnName')), 4, GANESH_16));
    orderBy(
      details.filter((d) => num(col(d, 'ColumnMastkt')) === num(col(column, 'ColumnMastkm'))),
      (d) => str(col(d, 'AuthorName')),
    ).forEach((d, i) => {
      rows.push(
        row(
          String(i + 1),
          str(col(d, 'AuthorName')),
          str(col(d, 'Bhasha')),
          cell(str(col(d, 'Pages')), { align: 'justify' }),
        ),
      );
    });
  }
  const center = { align: 'center' } as const;
  return {
    title: 'PrintLekhPrastavana',
    blocks: [
      table(
        [
          [
            th('क्र.', 6, center),
            th('कर्ता', 25, center),
            th('भाषा', 14, center),
            th('प्रकाशन क्रमांक', 55, center),
          ],
        ],
        rows,
        { fixed: false, ...top },
      ),
    ],
  };
}

// ------------------------------------------------------------------------------------------
// Book Report (Home/PrintBookReport, procedure PrintBookReport)
// ------------------------------------------------------------------------------------------

/** The books of these print numbers, which the procedure reads from TranIds. */
export async function bookReport(
  source: ReportSource,
  printNos: readonly number[],
): Promise<ReportDocument> {
  const fetched = await withTranIds(source, printNos, (own) =>
    reportRows(own, sql`EXEC PrintBookReport`),
  );
  const rows: Row[] = [];
  for (const vibhagNo of distinct(fetched, (r) => num(col(r, 'VibhagNo')))) {
    const own = fetched.filter((r) => num(col(r, 'VibhagNo')) === vibhagNo);
    rows.push(band(2, str(col(own[0]!, 'VibhagName')), 6, GANESH_16));
    for (const r of own) {
      rows.push(
        row(
          str(col(r, 'PrintNo')),
          str(col(r, 'BookPartParichayak')),
          str(col(r, 'PrakashakGranthMala')),
          str(col(r, 'SampadakSanshodhak')),
          str(col(r, 'SamvatAvruti')),
          str(col(r, 'PageSize')),
        ),
      );
    }
  }
  return {
    title: 'PrintBookReport',
    blocks: [
      table(
        [
          [
            th('प्र.क्र.', 9),
            th('प्रकाशन नाम {परिचायक नाम} {लिपि} {कृ.क्र.}', 27),
            th('प्रकाशक {ग्रंथमाला}', 20),
            th('संपादक, संशोधक आदि', 22),
            th('वि.सं. (आ.)', 12),
            th('पृष्ठ (कद)', 11),
          ],
        ],
        rows,
        top,
      ),
    ],
  };
}
