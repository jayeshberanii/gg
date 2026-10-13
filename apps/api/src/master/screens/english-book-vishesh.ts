import { sql } from 'kysely';
import { list, text, get } from './book-common.js';
import { commonChildren, visheshEntryScreen } from './vishesh-entry-common.js';

/**
 * Library › English Book Vishesh (frmEnglishBookVishesh, EnglishBookVisheshRepository). Table
 * EnglishBookVishesh, IDENTITY key EnglishBookVisheshKm, no Locked column. The twin of Magazine
 * Vishesh: one frmVishayEntry box (Detail) and five popups (with Tag). See
 * docs/screens/english-book-vishesh.md.
 */
const children = commonChildren('EnglishBookVishesh');

/** Txt_KeyDown's Column No / Name list: it fills both boxes (Name, ColumnMastkm, ColumnNo). */
const COLUMN_LIST = list(
  sql`SELECT ColumnMastkm, Name, ColumnNo FROM columnmaster WHERE Vibhag = 'vishcol' ORDER BY Name`,
);

export const englishBookVishesh = visheshEntryScreen({
  screen: 'english-book-vishesh',
  table: 'EnglishBookVishesh',
  primaryColumn: 'EnglishBookVisheshKm',
  seqTransaction: 'EnglishBookVishesh',
  strictSeq: false,
  columns: [
    { name: 'SubSeq', kind: 'text', max: 5 },
    { name: 'Mark1Kt', kind: 'int' },
    { name: 'ColumnMastKt', kind: 'int' },
    { name: 'Numbers', kind: 'text', max: 50 },
    { name: 'PageNo', kind: 'text', max: 250, label: 'Page No' },
    { name: 'PDFPath', kind: 'text', max: 500, label: 'PDF Path' },
    { name: 'PDFPageNo', kind: 'int' },
    { name: 'Remark', kind: 'text', max: 3000 },
  ],
  vishayEntries: [
    { column: 'DetailTran', transactionName: 'EnglishBookVishesh', summary: 'Detail' },
  ],
  children: [
    children.MTypeTran!,
    children.AuthorTypeTran!,
    children.AuthorTran!,
    children.BhashaTran!,
    {
      column: 'TagTran',
      table: {
        table: 'EnglishBookVisheshTagT',
        key: 'EnglishBookVisheshTagKm',
        parent: 'EnglishBookVisheshKt',
        columns: { VishayKt: 'int', Seq: 'int' },
        audit: true,
      },
      summary: 'TagName',
      max: 200,
      label: 'Tag',
      sign: ',',
      text: (r) => text(get(r, 'VishayName')),
    },
  ],
  listOrderBy: 'Seq Desc',
  contStringColumns: ['Detail'],
  contStringBoxes: [{ box: 'DetailTran', column: 'Detail' }],
  f2: { columnno: COLUMN_LIST, columnmastkt: COLUMN_LIST },
  trans: {
    TagTran: {
      lookups: {
        vishayname: list(
          sql`SELECT vishaycokm, vishay_nm FROM vishay WHERE ISNULL(vishay_nm, '') <> '' ORDER BY vishay_nm`,
        ),
      },
    },
  },
});
