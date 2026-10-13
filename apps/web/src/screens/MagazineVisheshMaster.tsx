'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';
import { commonPopups, libNoField, vishayPopups, visheshEntrySpec } from './visheshEntry';

const VISHAY_BOXES = ['DetailTran', 'SabharTran', 'ReferenceTran', 'HeadNameTran'];
const popups = commonPopups('MagazineVishesh');

/**
 * Library › Magazine Vishesh Master New (frmMagazineVisheshNew, "Magazine Vishesh"). Positions,
 * widths and headers are frmMagazineVisheshNew.Designer.vb's; the grid binds by name (GvMain),
 * so its Sabhar / Reference / Head Name columns show the Vishay summaries.
 */
const spec: ScreenSpec = {
  screen: 'magazine-vishesh-master',
  panelHeight: 263,
  panelWidth: 1008,
  fields: [
    libNoField({ x: 130, y: 18, w: 200 }, { x: 8, y: 22 }),
    {
      name: 'BookMastKt',
      label: 'Book Name',
      labelAt: { x: 356, y: 22 },
      at: { x: 457, y: 18, w: 200 },
      kt: true,
      nameColumn: 'BookMastName',
      noF2: true,
    },
    {
      name: 'Year',
      label: 'Year',
      labelAt: { x: 683, y: 22 },
      at: { x: 794, y: 18, w: 200 },
      noF2: true,
    },
    {
      name: 'Seq',
      label: 'Seq/Sub Seq',
      labelAt: { x: 8, y: 62 },
      at: { x: 130, y: 58, w: 107 },
      noF2: true,
    },
    { name: 'SubSeq', at: { x: 239, y: 58, w: 91 } },
    { name: 'Ank', label: 'Ank', labelAt: { x: 356, y: 62 }, at: { x: 457, y: 58, w: 200 } },
    {
      name: 'DetailTran',
      label: 'Detail',
      labelAt: { x: 683, y: 62 },
      at: { x: 794, y: 58, w: 200 },
      vishayEntry: 'DetailTran',
    },
    {
      name: 'BhashaTran',
      label: 'Bhasha',
      labelAt: { x: 8, y: 102 },
      at: { x: 130, y: 98, w: 200 },
      trans: 'BhashaTran',
    },
    {
      name: 'MTypeTran',
      label: 'MType',
      labelAt: { x: 356, y: 102 },
      at: { x: 457, y: 98, w: 200 },
      trans: 'MTypeTran',
    },
    {
      name: 'StatusKt',
      label: 'Status',
      labelAt: { x: 683, y: 102 },
      at: { x: 794, y: 98, w: 200 },
      kt: true,
      nameColumn: 'StatusName',
    },
    {
      name: 'AuthorTypeTran',
      label: 'Author Type',
      labelAt: { x: 8, y: 142 },
      at: { x: 130, y: 138, w: 200 },
      trans: 'AuthorTypeTran',
    },
    {
      name: 'AuthorTran',
      label: 'Author',
      labelAt: { x: 356, y: 142 },
      at: { x: 457, y: 138, w: 200 },
      trans: 'AuthorTran',
    },
    {
      name: 'PageNo',
      label: 'Page No',
      labelAt: { x: 683, y: 142 },
      at: { x: 794, y: 138, w: 200 },
    },
    { name: 'Sabhar', label: 'Sabhar', labelAt: { x: 8, y: 182 }, at: { x: 130, y: 178, w: 99 } },
    { name: 'SabharTran', at: { x: 231, y: 178, w: 99 }, vishayEntry: 'SabharTran' },
    {
      name: 'Reference',
      label: 'Reference',
      labelAt: { x: 356, y: 182 },
      at: { x: 457, y: 178, w: 99 },
    },
    { name: 'ReferenceTran', at: { x: 558, y: 178, w: 99 }, vishayEntry: 'ReferenceTran' },
    {
      name: 'HeadName',
      label: 'HeadName',
      labelAt: { x: 683, y: 182 },
      at: { x: 794, y: 178, w: 99 },
    },
    { name: 'HeadNameTran', at: { x: 895, y: 178, w: 99 }, vishayEntry: 'HeadNameTran' },
    {
      name: 'WorkDoneByKt',
      label: 'Work Done By',
      labelAt: { x: 8, y: 222 },
      at: { x: 130, y: 218, w: 200 },
      kt: true,
      nameColumn: 'WorkDonebyName',
    },
    {
      name: 'PDFPath',
      label: 'PDF Path',
      labelAt: { x: 356, y: 222 },
      at: { x: 457, y: 218, w: 200 },
    },
    {
      name: 'PDFPageNo',
      label: 'PDF PageNo',
      labelAt: { x: 683, y: 222 },
      at: { x: 794, y: 218, w: 200 },
      noF2: true,
    },
  ],
  columns: [
    { header: 'Id', field: 'MagazineVisheshKm', width: 5 },
    { header: 'Seq', field: 'Seq', width: 45 },
    { header: 'SubSeq', field: 'SubSeq', width: 55 },
    { header: 'Ank', field: 'Ank', width: 45 },
    { header: 'Detail', field: 'Detail', width: 700 },
    { header: 'Bhasha', field: 'BhashaName', width: 50 },
    { header: 'MType', field: 'MTypeName', width: 90 },
    { header: 'Status', field: 'StatusName', width: 80 },
    { header: 'Author Type', field: 'AuthorTypeName', width: 100 },
    { header: 'Author', field: 'AuthorName', width: 100 },
    { header: 'PageNo', field: 'PageNo', width: 75 },
    { header: 'Sabhar', field: 'txtSabhar', width: 80 },
    { header: 'Reference', field: 'txtReference', width: 100 },
    { header: 'Head Name', field: 'txtHeadName', width: 90 },
  ],
  trans: { ...popups, ...vishayPopups(VISHAY_BOXES) },
  // btnCopy_Click: the copy keeps the boxes and gets its own popup rows and Vishay lines.
  copy: { clear: [], loadTrans: [...Object.keys(popups), ...VISHAY_BOXES] },
  ...visheshEntrySpec(),
};

export function MagazineVisheshMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}
