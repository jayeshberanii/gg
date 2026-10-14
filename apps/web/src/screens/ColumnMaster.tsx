'use client';

import { UserType } from '@gglib/shared';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { REFERENCE_T1 } from '@/features/master/FormFields';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenActions, ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/** Color.DarkViolet */
const DARK_VIOLET = '#9400d3';

/**
 * Master › Column Master (frmColumnMaster). Field and column positions, widths and headers are
 * the ones in frmColumnMaster.Designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'column-master',
  panelHeight: 268,
  panelWidth: 1006,
  entryLabel: true,
  noCopy: true,
  // Form_Load / FillData: only admins, AMaster and users 20 and 50 may change records.
  writableBy: (u) => u.isAdmin || u.userType === UserType.AMaster || u.id === 20 || u.id === 50,
  fields: [
    { name: 'Name', label: 'Name', labelAt: { x: 12, y: 18 }, at: { x: 111, y: 17, w: 338 } },
    { name: 'Brief', label: 'Brief', labelAt: { x: 12, y: 72 }, at: { x: 111, y: 68, w: 338 } },
    { name: 'Remark', label: 'Remark', labelAt: { x: 12, y: 124 }, at: { x: 111, y: 119, w: 338 } },
    {
      name: 'HindiWord',
      label: 'Hindi Word',
      labelAt: { x: 12, y: 174 },
      at: { x: 111, y: 170, w: 338 },
    },
    { name: 'ColumnNo', label: 'No', labelAt: { x: 476, y: 18 }, at: { x: 582, y: 17, w: 338 } },
    { name: 'Vibhag', label: 'Vibhag', labelAt: { x: 476, y: 72 }, at: { x: 582, y: 68, w: 338 } },
    {
      name: 'ShortNm',
      label: 'Short Name',
      labelAt: { x: 476, y: 124 },
      at: { x: 582, y: 119, w: 338 },
    },
    {
      name: 'UplevelTran',
      label: 'Up Level',
      labelAt: { x: 476, y: 174 },
      at: { x: 582, y: 170, w: 338 },
      trans: 'UplevelTran',
    },
    { name: 'IsPrint', at: { x: 16, y: 214, w: 78 }, checkbox: 'IsPrint' },
    // No box of its own on the desktop: the Reference link opens this popup.
    { name: 'ReferenceT1', at: { x: 0, y: 0, w: 0 }, hidden: true, trans: 'ReferenceT1' },
  ],
  labels: [
    {
      // lnkColumnReference sits on the form beside the toolbar, not in the panel.
      text: 'Reference',
      at: { x: 797, y: 0 },
      sizePt: 9,
      onClick: (ctx) => ctx.openTrans('ReferenceT1'),
      color: (ctx) => (ctx.loaded?.HasReference ? DARK_VIOLET : '#000000'),
    },
  ],
  trans: {
    UplevelTran: {
      column: 'UplevelTran',
      hidden: ['ColumnUplevelTranKm', 'UplevelKt'],
      editable: [],
      lookups: { uplevelname: { setKt: 'UplevelKt', setName: 'UplevelName' } },
      template: () => [0, 0, ''],
      firstColumn: 'UplevelName',
      tranType: 'Vibhag',
    },
    ReferenceT1: { ...REFERENCE_T1, column: 'ReferenceT1' },
  },
  columns: [
    { header: 'ColumnMastkm', field: 'ColumnMastkm', width: 5 },
    { header: 'Vibhag', field: 'Vibhag', width: 165 },
    { header: 'Name', field: 'Name', width: 240 },
    { header: 'ColumnNo', field: 'ColumnNo' },
    { header: 'ShortNm', field: 'ShortNm', width: 130 },
    { header: 'Brief', field: 'Brief', width: 160 },
    { header: 'Remark', field: 'Remark', width: 240 },
  ],
  rowTextColor: (row) => (row.HasReference ? DARK_VIOLET : undefined),
  // Delete() is empty on the desktop.
  deleteFlow: async () => undefined,
};

/** cntMenu: Print › …, For Selected Record › Kruti Master › Vibhag->Head. */
function menu(a: ScreenActions): ContextMenuItem[] {
  return [
    {
      kind: 'submenu',
      label: 'Print',
      items: [
        { kind: 'item', label: 'Send To Excel', onSelect: a.sendToExcel },
        a.printLayouts.length > 0
          ? {
              kind: 'submenu',
              label: 'Print Selected Column',
              items: a.printLayouts,
              onSelect: a.printSelectedColumn,
            }
          : { kind: 'item', label: 'Print Selected Column', onSelect: a.printSelectedColumn },
        // Not ported: ColumnReport.rpt is Crystal-encrypted, so neither its fields nor its layout
        // can be read (docs/screens/column-master.md).
        // {
        //   kind: 'item',
        //   label: 'Print Selected Record',
        //   onSelect: () =>
        //     void a.alert(
        //       'Print Selected Record (Crystal Report ColumnReport) needs the desktop computers and cannot run in the web app.',
        //     ),
        // },
      ],
    },
    {
      kind: 'submenu',
      label: 'For Selected Record',
      items: [
        {
          kind: 'submenu',
          label: 'Kruti Master',
          items: [
            { kind: 'item', label: 'Vibhag->Head', onSelect: () => void a.run('vibhag-head') },
          ],
        },
      ],
    },
  ];
}

export function ColumnMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} menu={menu} />;
}
