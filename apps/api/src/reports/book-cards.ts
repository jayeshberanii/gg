import type { ReportBlock, ReportCell, ReportDocument, ReportRow } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../db/legacy-sql.js';
import { cell, row, table } from './build.js';
import { MAX_CARDS } from './kruti-cards.js';
import { col, num, str } from './run.js';

/**
 * Book Master › Print › Full Card Portrait (frmBookMasterNew
 * FullCardPortraitToolStripMenuItem_Click): the cards the desktop writes into sheet "Vertical"
 * of its "prakashan Card.xls" template, columns A–F. See docs/screens/book-master.md, "Cards".
 *
 * The template is not in the repo; what is carried over is what the handler decides: the two
 * queries, and which value goes into which cell.
 */

type Row = Record<string, unknown>;

/** MdlLib.CheckForZero. */
const checkForZero = (s: string) => (s === '0' ? '' : s);

const blank = (n: number): ReportCell[] => Array.from({ length: n }, () => cell(''));

/** =CONCATENATE(a, CHAR(10), b …): the values one under another in a cell. */
const stacked = (...lines: string[]): ReportCell =>
  cell(
    lines
      .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('<br>'),
    { rich: true },
  );

/**
 * Each book takes five lines (A–C the book, D–F one kruti per line, more lines when the book
 * has more than five krutis), then its Vishesh across the card.
 *
 * `withParichayak`: the answer Yes to "Do You Want to Print Column No?" — the book's name is
 * followed by its Parichayak Name in brackets (that is all the answer changes on the desktop).
 */
export async function bookFullCardPortrait(
  db: Executor,
  ids: readonly number[],
  withParichayak: boolean,
): Promise<ReportDocument> {
  if (ids.length > MAX_CARDS) {
    throw new BadRequestException(
      `${ids.length} records are selected; a card page takes at most ${MAX_CARDS}.`,
    );
  }
  const list = idList(ids.length > 0 ? ids : [0]);
  const { rows: books } = await sql<Row>`
    SELECT M.PrintNo, M.BookMastkm, M.BookName, M.ParichayakName, A.Avrutiname, VQ.Vishesh Quality,
      VS.Vishesh Shape, M.Size, M.Part, VG.Vishesh GMala, M.GMalaNo, s.samvatname samvattypename,
      M.PSamvat Samvat, M.Price, M.txtLipi, M.ISBNNo, bh.PName bhandarnam, T.Libno, M.Vishesh,
      M.txtPrakashak, M.txtAuthor, M.Pages, M.TotalPages,
      ISNULL((SELECT STUFF((SELECT ',' + ISNULL(columnmaster.ShortNm, N'') + '(' + praksnVisheshT.Detail + ')'
        FROM praksnVisheshT LEFT OUTER JOIN columnmaster ON praksnVisheshT.ColumnMastkt = columnmaster.ColumnMastkm
        WHERE praksnVisheshT.prakashannokt = M.BookMastkm ORDER BY praksnVisheshT.seq
        FOR XML PATH('')), 1, 1, '')), '') AS txtVishesh
    FROM BookM M
    INNER JOIN BookT T ON M.BookMastkm = T.BookMastkt AND T.MainL = 1
    LEFT JOIN AvrutiMast A ON M.Avrutikt = A.Avrutitid
    LEFT JOIN visheshMast VQ ON T.QualityKt = VQ.Tid AND VQ.remark = 'Quality'
    LEFT JOIN VisheshMast VS ON M.ShapeKt = VS.Tid AND VS.remark = 'shape'
    LEFT JOIN visheshMast VG ON M.GMalaKt = VG.Tid AND VG.remark = 'gmala'
    LEFT JOIN samvmast s ON M.PSamvatcokt = s.samvatcokm
    LEFT JOIN PartyM bh ON M.bhandarcokt = bh.partyMkm
    WHERE M.BookMastkm IN ${list}
    ORDER BY M.BookMastkm, T.Tid
  `.execute(db);
  const { rows: krutis } = await sql<Row>`
    SELECT DISTINCT b.BookMastkt, k.extranm KrutiName, k.author authorname, k.KrutiNo,
      (SELECT STUFF((SELECT ',' + CAST(b.bhasa_attr AS nvarchar(1000)) FROM krutibhast kb
        LEFT OUTER JOIN bhasmast AS b ON b.bhashacokm = kb.bhashakt
        WHERE kb.Krutimstkt = k.krutimstkm FOR XML PATH('')), 1, 1, '')) AS bhasha,
      k.Pariman, kr.lipi
    FROM krutiMst AS k
    INNER JOIN krutireflibno AS kr ON kr.krutimstkt = k.krutimstkm
    INNER JOIN BookT b ON kr.BookTKt = b.Tid
    WHERE b.BookMastkt IN ${list}
    ORDER BY k.KrutiNo
  `.execute(db);
  const krutisOf = new Map<number, Row[]>();
  for (const k of krutis) {
    const id = num(col(k, 'BookMastkt'));
    const own = krutisOf.get(id);
    if (own) own.push(k);
    else krutisOf.set(id, [k]);
  }

  const blocks: ReportBlock[] = [];
  for (const b of books) {
    const f = (name: string) => str(col(b, name));
    const isbn = f('ISBNNo').trim();
    const gmalaNo = f('GMalaNo');
    const left: ReportCell[][] = [
      [
        cell(f('PrintNo'), { size: 20, bold: true }),
        cell(
          withParichayak
            ? `${f('BookName')} ${f('Part')}(${f('ParichayakName')})`
            : `${f('BookName')} ${f('Part')}`,
        ),
        stacked(checkForZero(f('samvattypename')), checkForZero(f('Samvat'))),
      ],
      [
        cell(`${f('Shape')} - ${f('Size')}`),
        cell(f('txtPrakashak')),
        cell(` ${checkForZero(f('Price'))}`),
      ],
      [
        cell(f('Quality')),
        cell(f('GMala') + (checkForZero(gmalaNo) === '' ? '' : ` - ${gmalaNo}`)),
        // The handler reads "PrakSthal" here, a column its query does not select.
        cell(''),
      ],
      [cell(''), cell(f('txtAuthor')), cell(f('txtLipi'))],
      [
        cell(f('Avrutiname')),
        cell(f('Pages')),
        stacked(
          f('bhandarnam'),
          checkForZero(f('Libno')),
          ...(isbn === '' || isbn === '0' ? [] : [`ISBN- ${isbn}`]),
        ),
      ],
    ];
    const lines = (krutisOf.get(num(col(b, 'BookMastkm'))) ?? []).map((k) => [
      cell(
        `${str(col(k, 'KrutiName'))} (${str(col(k, 'bhasha')).trim()}) (${str(col(k, 'KrutiNo'))})`,
      ),
      cell(str(col(k, 'authorname')).trim()),
      cell(`${str(col(k, 'Pariman'))} ${str(col(k, 'lipi'))}`),
    ]);
    const rows: ReportRow[] = [];
    for (let i = 0; i < Math.max(5, lines.length); i++) {
      rows.push({ cells: [...(left[i] ?? blank(3)), ...(lines[i] ?? blank(3))] });
    }
    rows.push(row(cell(f('txtVishesh'), { colSpan: 6 })));
    blocks.push(table([], rows, { columns: [9, 25, 12, 28, 14, 12], top: true, size: 14 }), {
      kind: 'space',
    });
  }
  return { title: 'Book Full Card Portrait', blocks };
}
