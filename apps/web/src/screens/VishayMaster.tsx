'use client';

import { REFERENCE_T1 } from '@/features/master/FormFields';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec, TransSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/** Color.DarkViolet */
const DARK_VIOLET = '#9400d3';

/** SetForm_Vishay: a popup of names picked from the Vishay list itself. */
const nameOfVishay = (column: string, key: string, kt: string, name: string): TransSpec => ({
  column,
  hidden: [key, kt],
  editable: [],
  lookups: { [name.toLowerCase()]: { setKt: kt, setName: name, next: 'Seq' } },
  tempKey: key,
  firstColumn: name,
});

/**
 * Master › Vishay Master (frmVishayMaster). Field and column positions, widths and headers are
 * the ones in frmVishayMaster.designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'vishay-master',
  panelHeight: 110,
  panelWidth: 1008,
  entryLabel: true,
  fields: [
    { name: 'vishay_nm', label: 'Name', labelAt: { x: 7, y: 22 }, at: { x: 89, y: 18, w: 358 } },
    { name: 'brif', label: 'Brief', labelAt: { x: 7, y: 62 }, at: { x: 89, y: 58, w: 358 } },
    { name: 'remark', label: 'Remark', labelAt: { x: 451, y: 22 }, at: { x: 651, y: 18, w: 348 } },
    // {
    //   name: 'MeaningTran',
    //   label: 'Meanings',
    //   labelAt: { x: 7, y: 142 },
    //   at: { x: 89, y: 138, w: 358 },
    //   trans: 'MeaningTran',
    // },
    // {
    //   name: 'AnyaNameTran',
    //   label: 'Anya Name',
    //   labelAt: { x: 451, y: 22 },
    //   at: { x: 651, y: 18, w: 348 },
    //   trans: 'AnyaNameTran',
    // },
    {
      name: 'uplevalkt',
      label: 'Up Level',
      labelAt: { x: 451, y: 62 },
      at: { x: 651, y: 58, w: 348 },
      kt: true,
      nameColumn: 'uplevalName',
    },
    // { name: 'short_name', at: { x: 651, y: 98, w: 173 } },
    // { name: 'hindiword', at: { x: 826, y: 98, w: 173 } },
    // { name: 'EnglishAnyaNameTran', at: { x: 651, y: 137, w: 173 }, trans: 'EnglishAnyaNameTran' },
    // { name: 'HindiAnyaNameTran', at: { x: 826, y: 137, w: 173 }, trans: 'HindiAnyaNameTran' },
    // { name: 'ReferenceT1', at: { x: 0, y: 0, w: 0 }, hidden: true, trans: 'ReferenceT1' },
  ],
  labels: [
    // { text: 'Short Nm/Hindi Word', at: { x: 451, y: 102 } },
    // { text: 'English/Hindi Anya Name', at: { x: 451, y: 141 } },
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
    AnyaNameTran: {
      column: 'AnyaNameTran',
      hidden: ['VishayAnyaNameKm'],
      editable: ['AnyaName'],
      lookups: {},
      tempKey: 'VishayAnyaNameKm',
      firstColumn: 'AnyaName',
    },
    MeaningTran: {
      column: 'MeaningTran',
      hidden: ['VishayMeaningKm'],
      editable: ['Meaning'],
      lookups: {},
      tempKey: 'VishayMeaningKm',
      firstColumn: 'Meaning',
    },
    EnglishAnyaNameTran: nameOfVishay(
      'EnglishAnyaNameTran',
      'VishayEnglishAnyaNameKm',
      'EnglishNameKt',
      'EnglishName',
    ),
    HindiAnyaNameTran: nameOfVishay(
      'HindiAnyaNameTran',
      'VishayHindiAnyaNameKm',
      'HindiNameKt',
      'HindiName',
    ),
    ReferenceT1: { ...REFERENCE_T1, column: 'ReferenceT1' },
  },
  columns: [
    { header: 'Id', field: 'vishaycokm', width: 80 },
    { header: 'Name', field: 'vishay_nm', width: 150 },
    { header: 'Brief', field: 'brif' },
    { header: 'Remark', field: 'remark', width: 150 },
    // { header: 'Short Name', field: 'short_name' },
    { header: 'UpLevel', field: 'uplevalName', width: 110 },
    // { header: 'Hindi Word', field: 'hindiword', width: 120 },
    { header: 'CountI', field: 'countI', width: 120 },
    { header: 'Counters', field: 'counters', width: 130 },
  ],
  contextMenu: ({ run }) => [
    { kind: 'item', label: 'Update Vishay Count ', onSelect: () => run('update-count') },
    {
      kind: 'submenu',
      label: 'Show In Use',
      items: [
        {
          kind: 'submenu',
          label: 'BookM',
          items: [
            {
              kind: 'item',
              label: 'Subject With Old Entry Type',
              onSelect: () => run('in-use-book-old'),
            },
            {
              kind: 'item',
              label: 'Subject With New Entry Type',
              onSelect: () => run('in-use-book-new'),
            },
            // Enabled = False in the designer.
            { kind: 'item', label: 'Magazine Vishesh', disabled: true, onSelect: () => undefined },
          ],
        },
        { kind: 'item', label: 'Kruti Master', onSelect: () => run('in-use-kruti') },
        // No handler on the desktop.
        // { kind: 'item', label: 'Vishay Relation', disabled: true, onSelect: () => undefined },
        { kind: 'separator' },
        { kind: 'item', label: 'Magazine Vishesh', onSelect: () => run('in-use-magazine-vishesh') },
        {
          kind: 'item',
          label: 'English Book Vishesh',
          onSelect: () => run('in-use-english-book-vishesh'),
        },
      ],
    },
  ],
};

export function VishayMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}
