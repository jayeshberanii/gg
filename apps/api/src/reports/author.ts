import type { ReportBlock, ReportDocument, ReportField, ReportRow as Row } from '@gglib/shared';
import { sql } from 'kysely';
import { cell, distinct, orderBy, row, table, th } from './build.js';
import { col, num, reportRows, rowsWith, str, withTranIds, type ReportSource } from './run.js';

/**
 * Author Master › Print Report: the report site's HomeController actions PrintAuthorReport,
 * PrintAuthorParamparaReport, PrintAuthorDetail and PrintKrutiReport, each laid out as its
 * Razor view (GGWebSolution/GGWeb/Views/Home). See docs/screens/reports.md.
 */

type Row2 = Record<string, unknown>;

const top = { top: true } as const;

/** Home/PrintAuthorReport: every author with a Report No (procedure PrintAuthor). */
export async function authorReport(source: ReportSource): Promise<ReportDocument> {
  const rows = await reportRows(source, sql`EXEC PrintAuthor`);
  return {
    title: 'Author Report',
    blocks: [
      table(
        [
          [
            th('क्र.', 3),
            th('कर्तानाम', 20),
            th('संप्रदाय', 18),
            th('गुरू', 19),
            th('संवत्', 26),
            th('विशेषण', 15),
          ],
        ],
        rows.map((r) =>
          row(
            str(col(r, 'ReportNo')),
            str(col(r, 'AuthorName')),
            cell(str(col(r, 'Sampraday')), { rich: true }),
            str(col(r, 'Guru')),
            cell(str(col(r, 'Samvat')), { rich: true }),
            cell(str(col(r, 'Visheshan')), { rich: true }),
          ),
        ),
        { font: 'surekh', size: 14, fixed: false, ...top },
      ),
    ],
  };
}

const PARAMPARA_FIELDS: [label: string, column: string][] = [
  ['अन्यनाम', 'AnyaName'],
  ['संवत्', 'Samvat'],
  ['संप्रदाय', 'Sampraday'],
  ['विशेषण', 'Visheshan'],
  ['परिचय', 'Parichay'],
  ['परंपरा', 'Parampara'],
  ['कृति', 'Kruti'],
  ['पर्यायः', 'Paryay'],
  ['पट्टावली क्रम', 'Pattavali'],
  ['नोंध', 'Note'],
];

/** Home/PrintAuthorParamparaReport (procedure AuthorParamparaReport @PrintReference). */
export async function authorParamparaReport(
  source: ReportSource,
  printReference: boolean,
): Promise<ReportDocument> {
  const rows = await reportRows(source, sql`EXEC AuthorParamparaReport ${printReference ? 1 : 0}`);
  const blocks: ReportBlock[] = [];
  for (const r of rows) {
    blocks.push({
      kind: 'heading',
      text: `${str(col(r, 'Seq'))}. ${str(col(r, 'AuthorName'))}`,
      align: 'center',
      size: 18,
    });
    const fields: ReportField[] = [];
    for (const [label, column] of PARAMPARA_FIELDS) {
      const value = str(col(r, column));
      if (value !== '') fields.push({ label, value });
    }
    if (fields.length > 0) blocks.push({ kind: 'fields', fields });
  }
  return { title: 'PrintAuthorParamparaReport', font: 'shree', size: 15, blocks };
}

/**
 * Home/PrintAuthorDetail (procedure PrintAuthorDetail @KrutiCheck, nine result sets). The
 * procedure takes its authors from TranIds, in that order, so they are written there for the
 * length of the call. `krutiCheck` is the shorter "Kruti Author Check" form.
 */
export async function authorDetailReport(
  source: ReportSource,
  authors: readonly number[],
  krutiCheck: boolean,
): Promise<ReportDocument> {
  const all = await withTranIds(source, authors, (own) =>
    reportRows(own, sql`EXEC PrintAuthorDetail ${krutiCheck ? 1 : 0}`),
  );
  const of = (set: Row2[], author: number) => set.filter((r) => num(col(r, 'AuthorKt')) === author);
  const sets = {
    authors: rowsWith(all, 'recordno'),
    anyaName: rowsWith(all, 'AnyaName'),
    samvat: rowsWith(all, 'SamvatKindName'),
    sampraday: rowsWith(all, 'SampradayName'),
    visheshan: rowsWith(all, 'Visheshan'),
    parichay: rowsWith(all, 'AuthContactType'),
    note: rowsWith(all, 'wordnm'),
    parampara: rowsWith(all, 'Guru1'),
    identity: rowsWith(all, 'IdentityName'),
  };
  const bold = { bold: true } as const;
  const rows: Row[] = [];
  /** One block of the author: its label on the first line only. */
  const lines = (label: string, set: Row2[], line: (r: Row2) => [string, string]) => {
    set.forEach((r, i) => {
      const [value, reference] = line(r);
      rows.push(row('', i === 0 ? cell(label, bold) : '', value, reference));
    });
  };
  const ref = (r: Row2, lib: string, page: string) => `${str(col(r, lib))} - ${str(col(r, page))}`;

  sets.authors.forEach((a, i) => {
    const id = num(col(a, 'AuthorKm'));
    rows.push(
      row(
        cell(String(i + 1), bold),
        cell('Author Name', bold),
        cell(str(col(a, 'AuthorName')), bold),
        `RecordNo - ${str(col(a, 'recordno'))}`,
      ),
    );
    lines('Anya Name', of(sets.anyaName, id), (r) => [
      str(col(r, 'AnyaName')),
      ref(r, 'LibNo', 'RefPgNo'),
    ]);
    lines('Samvat', of(sets.samvat, id), (r) => [
      `${str(col(r, 'SamvatKindName'))} - ${str(col(r, 'AsamvatName'))} - ${str(col(r, 'Asamvat'))}`,
      ref(r, 'Libno', 'PageNo'),
    ]);
    lines('Sampraday', of(sets.sampraday, id), (r) => [
      str(col(r, 'SampradayName')),
      ref(r, 'LibNo', 'RefPgNo'),
    ]);
    if (!krutiCheck) {
      lines('Visheshan', of(sets.visheshan, id), (r) => [
        str(col(r, 'Visheshan')),
        ref(r, 'LibNo', 'RefPgNo'),
      ]);
      lines('Parichay', of(sets.parichay, id), (r) => {
        const sthal = str(col(r, 'SthalName'));
        return [
          `${str(col(r, 'AuthContactType'))} - ${str(col(r, 'AuthorContact'))} ${sthal === '' ? '' : ` [${sthal}]`}`,
          ref(r, 'Libno', 'RefPgNo'),
        ];
      });
      lines('Note', of(sets.note, id), (r) => [
        `${str(col(r, 'AuthorColName'))} - ${str(col(r, 'ColShortNm'))} - (${str(col(r, 'wordnm'))})`,
        ref(r, 'BooktName', 'pgno'),
      ]);
    }
    lines(krutiCheck ? 'Guru' : 'Parampara', of(sets.parampara, id), (r) => [
      krutiCheck ? str(col(r, 'Guru1')) : `${str(col(r, 'Identyty2'))} - ${str(col(r, 'Guru1'))}`,
      ref(r, 'Libno', 'PageNo'),
    ]);
    const yogdan = str(col(a, 'anyayogdan'));
    if (!krutiCheck && yogdan !== '') {
      // The view's row has three cells only; the fourth column stays empty.
      rows.push(
        row('', cell('Anya Yogdan', bold), cell(yogdan, { italic: true, underline: true }), ''),
      );
    }
    lines('Identity', of(sets.identity, id), (r) => [
      str(col(r, 'IdentityName')),
      ref(r, 'Libno', 'RefPgNo'),
    ]);
    rows.push(row(cell('', { colSpan: 4 })));
  });

  return {
    title: 'PrintAuthorDetail',
    blocks: [table([], rows, { columns: [5, 15, 50, 30] })],
  };
}

/**
 * Home/PrintKrutiReport (procedure PrintKrutiFromAuthor, three result sets: the authors, their
 * kruti names by type, and the kruti detail lines). Each author starts a new page: first a
 * table per kruti type listing the names, then on a page of its own the detail table grouped
 * by Vibhag and type.
 */
export async function krutiFromAuthorReport(source: ReportSource): Promise<ReportDocument> {
  const all = await reportRows(source, sql`EXEC PrintKrutiFromAuthor`);
  const details = rowsWith(all, 'KrutiDetail');
  const names = rowsWith(all, 'KrutiName').filter((r) => !details.includes(r));
  const authors = rowsWith(all, 'AuthorName').filter(
    (r) => !details.includes(r) && !names.includes(r),
  );
  /** KrutiTypeSeq is nullable; OrderBy puts NULL first. */
  const seq = (r: Row2) =>
    col(r, 'KrutiTypeSeq') == null ? -Infinity : num(col(r, 'KrutiTypeSeq'));
  const blocks: ReportBlock[] = [];

  for (const author of authors) {
    const id = num(col(author, 'AuthorKt'));
    const ownNames = names.filter((r) => num(col(r, 'AuthorKt')) === id);
    const ownDetails = details.filter((r) => num(col(r, 'AuthorKt')) === id);
    blocks.push(
      { kind: 'pageBreak' },
      {
        kind: 'heading',
        text: `${str(col(author, 'ReportNo'))}. ${str(col(author, 'AuthorName'))}`,
        font: 'ganesh',
        size: 20,
      },
      { kind: 'space' },
    );

    for (const type of distinct(orderBy(ownNames, seq), (r) => str(col(r, 'KrutiType')))) {
      const list = orderBy(
        ownNames.filter((r) => str(col(r, 'KrutiType')) === type),
        (r) => str(col(r, 'KrutiName')),
      );
      const bold = { bold: true } as const;
      blocks.push(
        table(
          [[th(type, 100, { colSpan: 2, align: 'center' })]],
          list.length === 0
            ? [row('', '')]
            : [
                row(cell('क्र.', bold), cell('कृतिनाम', bold)),
                ...list.map((r, i) => row(String(i + 1), str(col(r, 'KrutiName')))),
              ],
          { columns: [10, 90], top: true },
        ),
        { kind: 'space' },
      );
    }

    const vibhags = distinct(ownDetails, (r) => str(col(r, 'VibhagName')));
    if (vibhags.length === 0) continue;
    const types = distinct(orderBy(ownDetails, seq), (r) => str(col(r, 'KrutiTypeName')));
    const rows: Row[] = [];
    for (const vibhag of vibhags) {
      rows.push({
        cells: [
          cell(vibhag, { colSpan: 6, align: 'center', bold: true, size: 16, font: 'ganesh' }),
        ],
      });
      for (const type of types) {
        const list = ownDetails.filter(
          (r) => str(col(r, 'VibhagName')) === vibhag && str(col(r, 'KrutiTypeName')) === type,
        );
        if (list.length === 0) continue;
        rows.push({
          cells: [cell(type, { colSpan: 6, align: 'left', bold: true, size: 14, font: 'surekh' })],
        });
        for (const r of list) {
          rows.push(
            row(
              str(col(r, 'ReportNo')),
              str(col(r, 'SWaroopName')),
              str(col(r, 'SwaroopSeq')),
              str(col(r, 'Karta')),
              str(col(r, 'Samvat')),
              cell(str(col(r, 'KrutiDetail')), { align: 'justify' }),
            ),
          );
        }
      }
    }
    blocks.push(
      { kind: 'pageBreak' },
      table(
        [
          [
            th('क्र.', 6),
            th('स्वरूप', 7),
            th('पे.', 2),
            th('कर्ता', 22),
            th('संवत्', 13),
            th(
              'कृति विशेषनाम * भाषा * प्रकार * परिमाण * आदि-अंतवाक्य * रचना स्थल * पूर्णता * (प्रकाशक, संपादक आदि)',
              50,
            ),
          ],
        ],
        rows,
        { top: true },
      ),
    );
  }
  return { title: 'PrintKrutiReport', blocks };
}
