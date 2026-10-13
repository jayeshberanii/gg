import type { ReportCell, ReportDocument, ReportRow as Row } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { band, cell, distinct, row, table, th } from './build.js';
import {
  col,
  procedureParameterCount,
  num,
  reportRows,
  type ReportRow as Data,
  rowsWith,
  str,
  withTranIds,
  type ReportSource,
} from './run.js';

/**
 * Kruti Master's reports: the report site's HomeController actions KrutiReport,
 * KrutiAkaradiReport, KrutiAkaradiAgamSuchiReport, KrutiAkaradiParishishtReport and
 * KrutiPrakashakReport, each laid out as its Razor view. See docs/screens/reports.md.
 */

const top = { top: true } as const;
const center = { align: 'center' } as const;
const justify = { align: 'justify' } as const;

/** Home/KrutiReport: the krutis of these Report Nos (procedure PrintKrutiReport, via TranIds). */
export async function krutiReport(
  source: ReportSource,
  pnos: readonly number[],
): Promise<ReportDocument> {
  const fetched = await withTranIds(source, pnos, (own) =>
    reportRows(own, sql`EXEC PrintKrutiReport`),
  );
  const rows: Row[] = [];
  // Grouped by Vibhag in the procedure's order; a group's rows are matched by its name.
  for (const vibhag of distinct(fetched, (r) => str(col(r, 'VibhagKt')))) {
    const name = str(
      col(
        fetched.find((r) => str(col(r, 'VibhagKt')) === vibhag)!,
        'VibhagName',
      ),
    );
    rows.push(band(2, name, 6, { bold: true, size: 16, font: 'ganesh' }));
    for (const r of fetched.filter((d) => str(col(d, 'VibhagName')) === name)) {
      rows.push(
        row(
          str(col(r, 'ReportNo')),
          str(col(r, 'SWaroopName')),
          str(col(r, 'SwaroopSeq')),
          str(col(r, 'Karta')),
          str(col(r, 'Samvat')),
          cell(str(col(r, 'KrutiDetail')), justify),
        ),
      );
    }
  }
  return {
    title: 'KrutiReport',
    blocks: [
      ...(fetched.length > 0 ? [{ kind: 'pageBreak' } as const] : []),
      table(
        [
          [
            th('कृ.क्र.', 7),
            th('स्वरूप', 10),
            th('पे.', 4),
            th('कर्ता', 20),
            th('संवत्', 11),
            th(
              'कृति विशेषनाम * भाषा * गद्य-पद्य * परिमाण * आदिवाक्य-अंतवाक्य * {प्र.क्र.}',
              48,
              justify,
            ),
          ],
        ],
        rows,
        top,
      ),
    ],
  };
}

/** Home/KrutiAkaradiReport (procedure PrintKrutiAkaradiReport @SampradayKt, @StrKrutiMstKm, @PrintAdiAnt). */
export async function krutiAkaradiReport(
  source: ReportSource,
  sampraday: number,
  krutis: readonly number[],
  printAdiAnt: boolean,
): Promise<ReportDocument> {
  const fetched = await reportRows(
    source,
    sql`EXEC PrintKrutiAkaradiReport ${sampraday}, ${krutis.join(',')}, ${printAdiAnt ? 1 : 0}`,
  );
  return {
    title: 'Kruti Akaradi Report',
    blocks: [
      table(
        [
          [
            th('कृ.क्र.', 10),
            th('कृति परिचायक नाम', 25),
            th('कर्ता', 18),
            th('संवत्', 8),
            th(
              'कृति विशेषनाम * भाषा * प्रकार * परिमाण * पूर्णता * आदिवाक्य-अंतवाक्य * प्र.क्र.',
              39,
            ),
          ],
        ],
        fetched.map((r) =>
          row(
            str(col(r, 'Seq')),
            str(col(r, 'KrutiParichayakName')),
            str(col(r, 'Karta')),
            str(col(r, 'Samvat')),
            cell(str(col(r, 'KrutiDetail')), justify),
          ),
        ),
        top,
      ),
    ],
  };
}

export type AgamSuchiOptions = {
  sampraday: number;
  /** The krutis to print, which the procedure reads from TranIds. */
  krutis: readonly number[];
  printAdiAnt: boolean;
  printSwaroopShortName?: boolean;
  /** Pattern1: the detail starts with Purnata (a fourth procedure argument, newer databases). */
  startWithPurnata?: boolean;
  /** Pattern2: a first column with the Kruti No. */
  krutiNoFirst?: boolean;
};

/**
 * Home/KrutiAkaradiAgamSuchiReport (procedure PrintKrutiAkaradiAgamSuchiReport: the groups, then
 * the detail lines). The fourth argument is passed only when asked for, so the plain report
 * also runs on a database whose procedure still has three.
 */
export async function krutiAgamSuchiReport(
  source: ReportSource,
  {
    sampraday,
    krutis,
    printAdiAnt,
    printSwaroopShortName = false,
    startWithPurnata = false,
    krutiNoFirst = false,
  }: AgamSuchiOptions,
): Promise<ReportDocument> {
  // Pattern1's argument came with a later version of the desktop; an older database's
  // procedure has three.
  if (
    startWithPurnata &&
    (await procedureParameterCount(source.db, 'PrintKrutiAkaradiAgamSuchiReport')) < 4
  ) {
    throw new BadRequestException(
      'This database\'s PrintKrutiAkaradiAgamSuchiReport procedure does not have the "Start With Purnata In Kruti Detail" option',
    );
  }
  const adi = printAdiAnt ? 1 : 0;
  const short = printSwaroopShortName ? 1 : 0;
  const all = await withTranIds(source, krutis, (own) =>
    reportRows(
      own,
      startWithPurnata
        ? sql`EXEC PrintKrutiAkaradiAgamSuchiReport ${sampraday}, ${adi}, ${short}, 1`
        : sql`EXEC PrintKrutiAkaradiAgamSuchiReport ${sampraday}, ${adi}, ${short}`,
    ),
  );
  const details = rowsWith(all, 'RowNumber');
  const groups = all.filter((r) => !details.includes(r));
  const span = krutiNoFirst ? 8 : 7;
  /** A lone ",," or "-" is centred. */
  const marked = (text: string, mark: string) => (text === mark ? cell(text, center) : text);

  const rows: Row[] = [];
  // The groups are numbered on from the first line's GroupStartSeq.
  let seq = details.length > 0 ? num(col(details[0]!, 'GroupStartSeq')) || 1 : 1;
  for (const group of groups) {
    const own = details.filter((d) => num(col(d, 'MainSeq')) === num(col(group, 'MainSeq')));
    rows.push(
      band(2, `${seq}. ${str(col(group, 'KrutiParichayakName'))} (${own.length})`, span, {
        bold: true,
      }),
    );
    for (const d of own) {
      rows.push(
        row(
          ...(krutiNoFirst ? [str(col(d, 'KrutiNo'))] : []),
          str(col(d, 'RowNumber')),
          marked(str(col(d, 'SWaroopName')), ',,'),
          marked(str(col(d, 'SwaroopSeq')), '-'),
          str(col(d, 'Karta')),
          str(col(d, 'Bhasha')),
          marked(str(col(d, 'Samvat')), '-'),
          cell(str(col(d, 'KrutiDetail')), { rich: true, ...justify }),
        ),
      );
    }
    seq += 1;
  }
  return {
    title: 'Kruti Akaradi Agam Suchi Report',
    blocks: [
      table(
        [
          [
            ...(krutiNoFirst ? [th('कृ.क्र.', 6.67)] : []),
            th('क्रम', 6.67),
            th('स्वरूप', 11.11),
            th('उ.क्र.', 4.44),
            th('कर्ता', 17.78),
            th('भाषा', 6.11),
            th('संवत्', 9.44),
            th(
              startWithPurnata
                ? 'पूर्णता * विशेषनाम/स्पष्टीकरण * प्रकार * परिमाण * आदिवाक्य-अंतवाक्य * प्र.क्र.'
                : 'विशेषनाम/स्पष्टीकरण * प्रकार * परिमाण * पूर्णता * आदिवाक्य-अंतवाक्य * प्र.क्र.',
              44.45,
            ),
          ],
        ],
        rows,
        { font: 'shree', ...top },
      ),
    ],
  };
}

/** The appendix kinds PrintKrutiAkaradiParishisht knows (frmKrutiMasterNew.AkaradiReport). */
export const AKARADI_TYPES = [
  'AnyaName',
  'TikaName',
  'TikagatKatha',
  'KartaName',
  'KartaNameDetail',
  'Vishay',
  'Bhasha',
  'Apurna',
  'MainKruti',
  'Niryukti',
  'NiryuktiAll',
  'Prakashak',
  'PrakashakWithLatestPSamvatVK',
  'ShodhGranth',
] as const;
export type AkaradiType = (typeof AKARADI_TYPES)[number];

type Layout = {
  head: ReportCell[];
  rows: (fetched: Data[]) => Row[];
};

const text = (r: Data, name: string) => str(col(r, name));
/** A layout of plain lines: one cell per column, some justified. */
const lines =
  (...cells: (string | [column: string, extra: Omit<ReportCell, 'text'>])[]) =>
  (fetched: Data[]): Row[] =>
    fetched.map((r) =>
      row(...cells.map((c) => (typeof c === 'string' ? text(r, c) : cell(text(r, c[0]), c[1])))),
    );
/** Bhasha / Niryukti: a numbered grey heading per line, then its kruti numbers. */
const headed =
  (title: string, numbers: Omit<ReportCell, 'text'>) =>
  (fetched: Data[]): Row[] =>
    fetched.flatMap((r, i) => [
      band(2, `${i + 1}. ${text(r, title)}`, 1, { bold: true, width: 100 }),
      row(cell(text(r, 'AkaradiSeq'), numbers)),
    ]);

const ANYA_NAME: Layout = {
  head: [th('क्रम', 10), th('कृति अन्यनाम', 35), th('कृति क्रमांक', 10), th('कृतिनाम', 45)],
  rows: lines('Seq', 'AnyaName', 'AkaradiSeq', 'KrutiParichayakName'),
};
const NIRYUKTI: Layout = { head: [], rows: headed('Swaroop', { align: 'left' }) };
const PRAKASHAK: Layout = {
  head: [th('कृ.क्र.', 10, center), th('पुस्तक नाम', 35, center), th('प्रकाशक', 55, center)],
  rows: lines('AkaradiSeq', ['BookName', justify], ['Prakashak', justify]),
};

/** The view's branches, by the Type the procedure returns. */
const LAYOUTS: Record<AkaradiType, Layout> = {
  AnyaName: ANYA_NAME,
  TikaName: ANYA_NAME,
  TikagatKatha: {
    head: [
      th('क्रम', 5),
      th('कृति अन्यनाम', 25),
      th('कृति क्रमांक', 10),
      th('कृतिनाम', 25),
      th('अनुवादक', 20),
      th('भाषा', 15),
    ],
    rows: lines('Seq', 'AnyaName', 'AkaradiSeq', 'KrutiParichayakName', 'AuthorName', 'Vishay'),
  },
  KartaName: {
    head: [
      th('क्रम', 10, center),
      th('कर्तानाम * अन्यनाम/विशेषण * गुरु * गच्छ/संप्रदाय * संवत् ', 35, center),
      th('कृति क्रमांक', 55, { ...center, padding: 15 }),
    ],
    rows: lines('Seq', 'AuthorName', ['AkaradiSeq', { ...justify, padding: 15 }]),
  },
  KartaNameDetail: {
    head: [
      th('क्रम', 5, center),
      th('कर्तानाम * अन्यनाम/विशेषण * गुरु * संप्रदाय * संवत्', 25, center),
      th('कृति क्रमांक', 30, center),
      th('कृति अन्यनाम', 20, center),
      th('कृतिनाम', 20, center),
    ],
    rows: lines('Seq', 'AuthorName', ['AkaradiSeq', justify], 'AnyaName', 'KrutiParichayakName'),
  },
  Vishay: {
    head: [th('क्र.', 10, center), th('विषय', 35, center), th('कृति क्रमांक', 55, center)],
    rows: lines('Seq', 'Vishay', ['AkaradiSeq', justify]),
  },
  Bhasha: { head: [], rows: headed('Vishay', justify) },
  Apurna: {
    head: [
      th('क्रम', 10, center),
      th('कृति क्रमांक', 10, center),
      th('कृति नाम', 40, center),
      th('कर्ता', 40, center),
    ],
    // Grouped by Vishesh, numbered again in each group. (The view's heading spans three of
    // the four columns; here it spans the table.)
    rows: (fetched) =>
      distinct(fetched, (r) => text(r, 'Vishesh')).flatMap((vishesh) => [
        { cells: [cell(vishesh, { colSpan: 4, bold: true, ...center })] },
        ...fetched
          .filter((r) => text(r, 'Vishesh') === vishesh)
          .map((r, i) =>
            row(
              String(i + 1),
              text(r, 'AkaradiSeq'),
              cell(text(r, 'KrutiParichayakName'), justify),
              cell(text(r, 'AuthorName'), justify),
            ),
          ),
      ]),
  },
  MainKruti: {
    head: [th('कृ.क्र.', 20, center), th('कृति परिचायक नाम', 40, center), th('विषय', 40, center)],
    rows: lines('AkaradiSeq', 'KrutiParichayakName', ['Vishay', justify]),
  },
  Niryukti: NIRYUKTI,
  NiryuktiAll: NIRYUKTI,
  Prakashak: PRAKASHAK,
  PrakashakWithLatestPSamvatVK: PRAKASHAK,
  ShodhGranth: {
    head: [
      th('क्रम', 10, center),
      th('कृति क्रमांक', 10, center),
      th('नाम', 50, center),
      th('कर्ता', 30, center),
      th('भाषा', 10, center),
    ],
    // The view never counts its first column up (it prints 0 on every line); numbered here.
    rows: (fetched) =>
      fetched.map((r, i) =>
        row(
          String(i + 1),
          text(r, 'Seq'),
          cell(text(r, 'AnyaName'), justify),
          cell(text(r, 'AuthorName'), justify),
          cell(text(r, 'Vishay'), justify),
        ),
      ),
  },
};

/**
 * Home/KrutiAkaradiParishishtReport (procedure PrintKrutiAkaradiParishisht @Type, @SampradayKt):
 * the appendices of the Akaradi report, each kind with its own columns.
 */
export async function krutiAkaradiParishishtReport(
  source: ReportSource,
  type: string,
  sampraday: number,
): Promise<ReportDocument> {
  if (!(AKARADI_TYPES as readonly string[]).includes(type)) {
    throw new BadRequestException(`Unknown report type "${type}"`);
  }
  const fetched = await reportRows(
    source,
    sql`EXEC PrintKrutiAkaradiParishisht ${type}, ${sampraday}`,
  );
  // The layout follows the Type column of the rows; with no rows, the one asked for.
  const returned = fetched.length > 0 ? text(fetched[0]!, 'Type') : type;
  const layout = LAYOUTS[returned as AkaradiType] ?? { head: [], rows: () => [] };
  return {
    title: 'Kruti Akaradi Parishisht Report',
    blocks: [table(layout.head.length > 0 ? [layout.head] : [], layout.rows(fetched), top)],
  };
}

/** Home/KrutiPrakashakReport (procedure PrintKrutiPrakashakReport @SampradayKt). */
export async function krutiPrakashakReport(
  source: ReportSource,
  sampraday: number,
  printAll: boolean,
): Promise<ReportDocument> {
  const fetched = await reportRows(source, sql`EXEC PrintKrutiPrakashakReport ${sampraday}`);
  const head = printAll
    ? [
        th('कृ.क्र.', 5, center),
        th('अ.क्र.', 5, center),
        th('पुस्तक नाम', 30, center),
        th('प्रकाशक', 20, center),
        th('संपादक आदि', 25, center),
        th('सं', 5, center),
        th('लाईब्रेरी नं', 10, center),
      ]
    : [
        th('अ.क्र.', 5, center),
        th('लाईब्रेरी नं', 10, center),
        th('पुस्तक नाम', 30, center),
        th('प्रकाशक', 20, center),
        th('संपादक आदि', 25, center),
        th('सं', 5, center),
        th('आवृत्ति', 5, center),
      ];
  const columns = printAll
    ? ['KrutiNo', 'AkaradiSeq', 'BookName', 'Prakashak', 'AuthorName', 'PSamvatVK', 'LibNo']
    : [
        'AkaradiSeq',
        'PrathamPustakLibNo',
        'BookName',
        'Prakashak',
        'AuthorName',
        'PSamvatVK',
        'Avruti',
      ];
  return {
    // The view's own title (copied from the Parishisht view).
    title: 'Kruti Akaradi Parishisht Report',
    blocks: [table([head], lines(...columns)(fetched), top)],
  };
}
