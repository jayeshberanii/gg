import { commonChildren, visheshEntryScreen } from './vishesh-entry-common.js';

/**
 * Library › Magazine Vishesh Master New (frmMagazineVisheshNew, MagazineVisheshRepository).
 * Table MagazineVishesh, IDENTITY key MagazineVisheshKm, no Locked column. Four frmVishayEntry
 * boxes (Detail, Sabhar, Reference, HeadName) and four popups. See
 * docs/screens/magazine-vishesh-master.md.
 */
const children = commonChildren('MagazineVishesh');

export const magazineVishesh = visheshEntryScreen({
  screen: 'magazine-vishesh-master',
  table: 'MagazineVishesh',
  primaryColumn: 'MagazineVisheshKm',
  seqTransaction: 'MagazineVishesh',
  strictSeq: true,
  columns: [
    { name: 'Year', kind: 'int' },
    { name: 'SubSeq', kind: 'raw', max: 5 },
    { name: 'Ank', kind: 'text', max: 10 },
    { name: 'StatusKt', kind: 'int' },
    { name: 'PageNo', kind: 'text', max: 250, label: 'Page No' },
    { name: 'Sabhar', kind: 'text', max: 3000 },
    { name: 'Reference', kind: 'text', max: 500 },
    { name: 'HeadName', kind: 'text', max: 4000 },
    { name: 'PDFPath', kind: 'text', max: 500, label: 'PDF Path' },
    { name: 'PDFPageNo', kind: 'int' },
  ],
  vishayEntries: [
    { column: 'DetailTran', transactionName: 'MagazineVisheshDetail', summary: 'Detail' },
    { column: 'SabharTran', transactionName: 'MagazineVisheshSabhar', summary: 'txtSabhar' },
    {
      column: 'ReferenceTran',
      transactionName: 'MagazineVisheshReference',
      summary: 'txtReference',
    },
    { column: 'HeadNameTran', transactionName: 'MagazineVisheshHeadName', summary: 'txtHeadName' },
  ],
  children: [
    children.BhashaTran!,
    children.MTypeTran!,
    children.AuthorTypeTran!,
    children.AuthorTran!,
  ],
  contStringColumns: ['Detail', 'txtSabhar', 'txtReference', 'txtHeadName'],
  contStringBoxes: [
    { box: 'DetailTran', column: 'Detail' },
    { box: 'SabharTran', column: 'txtSabhar' },
    { box: 'ReferenceTran', column: 'txtReference' },
    { box: 'HeadNameTran', column: 'txtHeadName' },
  ],
});
