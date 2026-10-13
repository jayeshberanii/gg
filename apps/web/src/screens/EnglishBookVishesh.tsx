'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';
import {
  commonPopups,
  libNoField,
  TAG_POPUP,
  vishayPopups,
  visheshEntrySpec,
} from './visheshEntry';

const popups = { ...commonPopups('EnglishBookVishesh'), TagTran: TAG_POPUP };

/** Txt_KeyDown's Column No / Name list (Name, ColumnMastkm, ColumnNo) fills both boxes. */
const columnPick = (
  picked: { name: string; code: string; row?: unknown[] },
  ctx: {
    setField: (n: string, v: string) => void;
    setTag: (n: string, id: number) => void;
  },
) => {
  const row = picked.row ?? [];
  ctx.setField('ColumnMastKt', String(row[1] ?? ''));
  ctx.setTag('ColumnMastKt', Number(row[0]) || 0);
  ctx.setField('ColumnNo', String(row[2] ?? ''));
};

/**
 * Library › English Book Vishesh (frmEnglishBookVishesh). Positions, widths and headers are
 * frmEnglishBookVishesh.Designer.vb's. The twin of Magazine Vishesh Master.
 */
const spec: ScreenSpec = {
  screen: 'english-book-vishesh',
  panelHeight: 262,
  panelWidth: 1008,
  fields: [
    libNoField({ x: 117, y: 19, w: 200 }, { x: 8, y: 23 }),
    {
      name: 'BookMastKt',
      label: 'Book Name',
      labelAt: { x: 332, y: 22 },
      at: { x: 481, y: 18, w: 200 },
      kt: true,
      nameColumn: 'BookMastName',
      noF2: true,
    },
    {
      name: 'Seq',
      label: 'Seq/Sub Seq',
      labelAt: { x: 691, y: 22 },
      at: { x: 797, y: 18, w: 99 },
      noF2: true,
    },
    { name: 'SubSeq', at: { x: 898, y: 18, w: 99 }, noF2: true },
    {
      name: 'Mark1Kt',
      label: 'Mark',
      labelAt: { x: 8, y: 62 },
      at: { x: 117, y: 58, w: 200 },
      kt: true,
      nameColumn: 'Mark1Name',
    },
    {
      name: 'ColumnNo',
      label: 'Column No/Name',
      labelAt: { x: 332, y: 62 },
      at: { x: 481, y: 58, w: 52 },
      afterPick: columnPick,
    },
    {
      name: 'ColumnMastKt',
      at: { x: 535, y: 58, w: 146 },
      kt: true,
      nameColumn: 'ColumnMastName',
      afterPick: columnPick,
    },
    {
      name: 'MTypeTran',
      label: 'MType',
      labelAt: { x: 691, y: 62 },
      at: { x: 797, y: 58, w: 200 },
      trans: 'MTypeTran',
    },
    { name: 'Numbers', label: 'Numbers', labelAt: { x: 8, y: 102 }, at: { x: 117, y: 98, w: 200 } },
    {
      name: 'DetailTran',
      label: 'Detail',
      labelAt: { x: 334, y: 102 },
      at: { x: 481, y: 98, w: 200 },
      vishayEntry: 'DetailTran',
    },
    {
      name: 'AuthorTypeTran',
      label: 'Author Type',
      labelAt: { x: 691, y: 102 },
      at: { x: 797, y: 98, w: 200 },
      trans: 'AuthorTypeTran',
    },
    {
      name: 'AuthorTran',
      label: 'Author',
      labelAt: { x: 8, y: 142 },
      at: { x: 117, y: 138, w: 200 },
      trans: 'AuthorTran',
    },
    {
      name: 'PageNo',
      label: 'Page No',
      labelAt: { x: 332, y: 142 },
      at: { x: 481, y: 138, w: 200 },
    },
    {
      name: 'BhashaTran',
      label: 'Bhasha',
      labelAt: { x: 691, y: 142 },
      at: { x: 797, y: 138, w: 200 },
      trans: 'BhashaTran',
    },
    {
      name: 'TagTran',
      label: 'Tag',
      labelAt: { x: 8, y: 181 },
      at: { x: 117, y: 177, w: 200 },
      trans: 'TagTran',
    },
    {
      name: 'WorkDoneByKt',
      label: 'Work Done By',
      labelAt: { x: 332, y: 181 },
      at: { x: 481, y: 177, w: 200 },
      kt: true,
      nameColumn: 'WorkDoneByName',
    },
    {
      name: 'PDFPath',
      label: 'PDF Path',
      labelAt: { x: 691, y: 181 },
      at: { x: 797, y: 177, w: 200 },
    },
    {
      name: 'PDFPageNo',
      label: 'PDF PageNo',
      labelAt: { x: 8, y: 220 },
      at: { x: 117, y: 216, w: 200 },
      noF2: true,
    },
    {
      name: 'Remark',
      label: 'Remark',
      labelAt: { x: 332, y: 220 },
      at: { x: 481, y: 216, w: 200 },
    },
  ],
  columns: [
    { header: 'Id', field: 'EnglishBookVisheshKm', width: 5 },
    { header: 'Seq', field: 'Seq', width: 55 },
    { header: 'SubSeq', field: 'SubSeq', width: 55 },
    { header: 'Mark', field: 'Mark1Name', width: 80 },
    { header: 'ColumnNo', field: 'ColumnNo', width: 70 },
    { header: 'Column Name', field: 'ColumnMastName', width: 120 },
    { header: 'MType', field: 'MTypeName', width: 90 },
    { header: 'Numbers', field: 'Numbers', width: 90 },
    { header: 'Detail', field: 'Detail', width: 600 },
    { header: 'Author Type', field: 'AuthorTypeName', width: 100 },
    { header: 'Author Name', field: 'AuthorName', width: 100 },
    { header: 'PageNo', field: 'PageNo', width: 75 },
    { header: 'Bhasha', field: 'BhashaName', width: 85 },
    { header: 'Tag', field: 'TagName', width: 85 },
  ],
  trans: { ...popups, ...vishayPopups(['DetailTran']) },
  copy: { clear: [], loadTrans: [...Object.keys(popups), 'DetailTran'] },
  ...visheshEntrySpec(),
};

export function EnglishBookVishesh(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}
