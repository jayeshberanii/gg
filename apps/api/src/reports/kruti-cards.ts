import type { ReportBlock, ReportCell, ReportDocument, ReportRow } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../db/legacy-sql.js';
import { trustedSql } from '../db/trusted-sql.js';
import { loadTblSearch, recordColumnsSql, unescapeSql } from '../master/tbl-search.js';
import { band, cell, row, table, th } from './build.js';
import { col, num, type ReportSource, reportRows, str, withTranIds } from './run.js';

/**
 * Kruti Master › Print Report: the cards the desktop writes into its KrutiCard.xls template
 * (frmKrutiMasterNew FullCardToolStripMenuItem_Click / FullCardPortraitToolStripMenuItem_Click)
 * and the Crystal "Main Report As Agam Suchi New". See docs/screens/kruti-master.md, "Cards".
 *
 * The template workbook and the .rpt layout are not readable here; what these builders carry
 * over is what the handlers and the report's procedure decide: which value goes into which
 * cell, in which order.
 */

type Row = Record<string, unknown>;

/** More cards than this in one page is refused (the desktop writes them one Excel cell at a time). */
export const MAX_CARDS = 2000;

/** MdlLib.CheckForZero. */
const checkForZero = (s: string) => (s === '0' ? '' : s);

/** MdlLib.SignBetweenStr(str1, str2, sign). */
function signBetween(a: string, b: string, sign: string): string {
  if (a.trim() === '' && b.trim() === '') return '';
  if (a.trim() === '') return b;
  if (b.trim() === '') return a;
  return a.trim() + sign + b.trim();
}

type CardData = {
  /** GetDataTable(TransactionName, id): the record's row, in the grid's order. */
  records: Row[];
  /** tblSearch KrutiNoteTran's F2EntryText rows, per kruti. */
  notes: Map<number, Row[]>;
  /** tblSearch krutiRelTran's F2EntryText rows (the up levels), per kruti. */
  upLevels: Map<number, Row[]>;
};

function byKruti(rows: Row[]): Map<number, Row[]> {
  const map = new Map<number, Row[]>();
  for (const r of rows) {
    const id = num(col(r, 'krutimstkt'));
    const list = map.get(id);
    if (list) list.push(r);
    else map.set(id, [r]);
  }
  return map;
}

/**
 * What both handlers read for every row of the grid: the record (the tblSearch column list of
 * GetDataTable) and the two transaction queries tblSearch keeps for the form's popups. The
 * desktop runs the three per kruti; here they run once for all of them.
 */
async function cardData(db: Executor, ids: readonly number[]): Promise<CardData> {
  if (ids.length === 0) return { records: [], notes: new Map(), upLevels: new Map() };
  if (ids.length > MAX_CARDS) {
    throw new BadRequestException(
      `The grid has ${ids.length} records; a card page takes at most ${MAX_CARDS}. Search for the krutis to print first.`,
    );
  }
  const tbl = await loadTblSearch(db, 'KrutiMst');
  const list = idList(ids);
  const inner = sql`SELECT CAST(val AS bigint) FROM dbo.SplitString(${ids.join(',')}, ',')`;
  const { rows: found } = await sql<Row>`
    SELECT ${trustedSql(unescapeSql(recordColumnsSql(tbl)))} FROM KrutiMst WHERE KrutiMstkm IN ${list}
  `.execute(db);
  const tran = async (name: string): Promise<Row[]> => {
    const entry = tbl.find(
      (r) =>
        (r.Type ?? '').trim().toUpperCase() === 'T' &&
        (r.ColumnName ?? '').trim().toUpperCase() === name.toUpperCase(),
    );
    const text = (entry?.F2EntryText ?? '').trim();
    if (text === '') return [];
    // replace(F2EntryText, '{Id}', <id>): the query's own "in ({Id})" takes the whole list.
    const parts = text.split('{Id}');
    const query = sql.join(
      parts.flatMap((p, i) => (i === 0 ? [trustedSql(p)] : [inner, trustedSql(p)])),
      sql``,
    );
    return (await sql<Row>`${query}`.execute(db)).rows;
  };
  const byId = new Map(found.map((r) => [num(col(r, 'krutimstkm')), r]));
  return {
    records: ids.map((id) => byId.get(id)).filter((r): r is Row => r !== undefined),
    notes: byKruti(await tran('KrutiNoteTran')),
    upLevels: byKruti(await tran('krutiRelTran')),
  };
}

/** The note's last cell: "<RefPlace> पृष्ठ-<pgno> <Sign>". */
function noteReference(n: Row): string {
  const place = str(col(n, 'Refplacename'));
  const pg = str(col(n, 'pgno'));
  return (
    (place.trim() === '' ? '' : `${place} `) +
    (checkForZero(pg).trim() === '' ? ' ' : `पृष्ठ-${pg.trim()}`) +
    ` ${str(col(n, 'SignColName')).trim()}`
  );
}

/**
 * The note's third cell. The handlers print the note's `prakashankt`, a column the note query
 * no longer has (the publication became a book copy, `BookTkt`): the copy's LibNo is printed,
 * as the form's own note summary does.
 */
const notePublication = (n: Row) => ` ${str(col(n, 'BooktName')).trim()}`;

const big = { size: 20, bold: true } as const;
const blank = (n: number): ReportCell[] => Array.from({ length: n }, () => cell(''));

function cardTable(columns: number[], rows: ReportRow[]): ReportBlock {
  return table([], rows, { columns, top: true, size: 14 });
}

/**
 * Full Card Portrait: sheet "Vertical" of KrutiCard.xls, columns A–G. Each kruti takes four
 * lines (A–C the kruti, D–G one note per line, more lines when it has more than four notes),
 * then a line with Adi Vakya (A–C merged) and Ant Vakya (D–G merged).
 */
export async function krutiFullCardPortrait(
  db: Executor,
  ids: readonly number[],
): Promise<ReportDocument> {
  const data = await cardData(db, ids);
  const blocks: ReportBlock[] = [];
  for (const k of data.records) {
    const id = num(col(k, 'krutimstkm'));
    const f = (name: string) => str(col(k, name));
    const kind = f('samvatkindName');
    const left: ReportCell[][] = [
      [
        cell(f('KrutiNo'), big),
        cell(`${f('extranm')} (${f('BhashaTran')})`),
        cell(f('SwaroopTran')),
      ],
      [
        cell((data.upLevels.get(id) ?? []).map((u) => str(col(u, 'KrutiNo')).trim()).join(',')),
        cell(f('AuthorTran')),
        cell(f('KrutiTypeName')),
      ],
      [
        cell(f('PurnaName')),
        cell(
          `${signBetween(f('KrutiParimnTran'), f('prasastitypeName'), ' ,')} ${f('prasastipariman')}`,
        ),
        cell(`${f('samvattypeName')} ${f('rachsamvat')}${kind !== '' ? `(${kind})` : ''}`),
      ],
      [cell(f('krutireflibnoTran')), cell(f('KrutiNmTran')), cell(f('rachnasthalname'))],
    ];
    const notes = (data.notes.get(id) ?? []).map((n) => [
      cell(`${str(col(n, 'ColShortNm')).trim()}-${str(col(n, 'SeriesName')).trim()}`),
      cell(str(col(n, 'wordnm')).trim()),
      cell(notePublication(n)),
      cell(noteReference(n)),
    ]);
    const rows: ReportRow[] = [];
    for (let i = 0; i < Math.max(4, notes.length); i++) {
      rows.push({ cells: [...(left[i] ?? blank(3)), ...(notes[i] ?? blank(4))] });
    }
    rows.push(row(cell(f('adivakya'), { colSpan: 3 }), cell(f('antvakya'), { colSpan: 4 })));
    blocks.push(cardTable([9, 24, 13, 12, 22, 8, 12], rows), { kind: 'space' });
  }
  return { title: 'Kruti Full Card Portrait', blocks };
}

/**
 * Full Card Landscape: sheet "Sheet1" of KrutiCard.xls, columns A–H. The handler fills eight of
 * its cells from text boxes it never loads (the call that filled them is commented out), so
 * those cells are empty here too: up levels, other names, swaroop, bhasha, author, pariman,
 * lib nos and mul.
 */
export async function krutiFullCardLandscape(
  db: Executor,
  ids: readonly number[],
): Promise<ReportDocument> {
  const data = await cardData(db, ids);
  const blocks: ReportBlock[] = [];
  for (const k of data.records) {
    const id = num(col(k, 'krutimstkm'));
    const f = (name: string) => str(col(k, name));
    const samvat = `${f('samvattypeName')} ${f('rachsamvat')}`;
    const left: ReportCell[][] = [
      [
        cell(f('KrutiNo')),
        cell(f('krutiname')),
        cell(''),
        cell(f('extraid2').includes('1') ? `कर्ता  ${samvat}` : samvat),
      ],
      [cell(''), cell(f('extranm')), cell(''), cell(f('rachnasthalname'))],
      [cell(f('PurnaName')), cell(''), cell(f('KrutiTypeName')), cell(f('KrutiHeadName'))],
      [
        cell(f('granthagra')),
        cell(''),
        cell(`${f('prasastitypeName')} ${f('prasastipariman')}`),
        cell(''),
      ],
    ];
    const notes = (data.notes.get(id) ?? []).map((n) => [
      cell(`${str(col(n, 'KrutiColName')).trim()}-${str(col(n, 'SeriesName')).trim()}`),
      cell(str(col(n, 'wordnm')).trim()),
      cell(notePublication(n)),
      cell(noteReference(n)),
    ]);
    const rows: ReportRow[] = [];
    for (let i = 0; i < Math.max(4, notes.length); i++) {
      rows.push({ cells: [...(left[i] ?? blank(4)), ...(notes[i] ?? blank(4))] });
    }
    rows.push(
      row(cell(f('adivakya'), { colSpan: 3 }), cell(''), cell(f('antvakya'), { colSpan: 4 })),
    );
    blocks.push(cardTable([8, 20, 12, 12, 8, 20, 8, 12], rows), { kind: 'space' });
  }
  return { title: 'Kruti Full Card Landscape', blocks };
}

export type AgamSuchiNewOptions = {
  sampraday: number;
  krutis: readonly number[];
  printAdiAnt: boolean;
};

/**
 * Main Report As Agam Suchi New: the Crystal report KrutiAkaradiAgamSuchiReport over the
 * procedure PrintKrutiAkaradiAgamSuchiCrystalReport (@PrintSwaroopShortName is always 0). The
 * procedure returns one line per kruti with its group's number, name and size on it
 * (MainSeqStr, KrutiParichayakName, MainSeqCountStr); the lines are printed under those group
 * headings in the columns of the Agam Suchi page, which shows the same list.
 */
export async function krutiAgamSuchiNewReport(
  source: ReportSource,
  { sampraday, krutis, printAdiAnt }: AgamSuchiNewOptions,
): Promise<ReportDocument> {
  const lines = await withTranIds(source, krutis, (own) =>
    reportRows(
      own,
      sql`EXEC PrintKrutiAkaradiAgamSuchiCrystalReport ${sampraday}, ${printAdiAnt ? 1 : 0}, 0`,
    ),
  );
  const center = { align: 'center' } as const;
  const marked = (text: string, mark: string) => (text === mark ? cell(text, center) : text);
  const rows: ReportRow[] = [];
  let group: number | null = null;
  for (const d of lines) {
    const seq = num(col(d, 'MainSeq'));
    if (group !== seq) {
      group = seq;
      rows.push(
        band(
          2,
          `${str(col(d, 'MainSeqStr'))}. ${str(col(d, 'KrutiParichayakName'))} (${str(col(d, 'MainSeqCountStr'))})`,
          7,
          { bold: true },
        ),
      );
    }
    rows.push(
      row(
        str(col(d, 'RowNumber')),
        marked(str(col(d, 'SwaroopName')), ',,'),
        marked(str(col(d, 'SwaroopSeq')), '-'),
        str(col(d, 'Karta')),
        str(col(d, 'Bhasha')),
        marked(str(col(d, 'Samvat')), '-'),
        cell(str(col(d, 'KrutiDetail')), { rich: true, align: 'justify' }),
      ),
    );
  }
  return {
    title: 'Kruti Akaradi Agam Suchi Report (New)',
    blocks: [
      table(
        [
          [
            th('क्रम', 6.67),
            th('स्वरूप', 11.11),
            th('उ.क्र.', 4.44),
            th('कर्ता', 17.78),
            th('भाषा', 6.11),
            th('संवत्', 9.44),
            th(
              'विशेषनाम/स्पष्टीकरण * प्रकार * परिमाण * पूर्णता * आदिवाक्य-अंतवाक्य * प्र.क्र.',
              44.45,
            ),
          ],
        ],
        rows,
        { font: 'shree', top: true },
      ),
    ],
  };
}
