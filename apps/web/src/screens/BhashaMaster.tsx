'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/**
 * Master › Bhasha Master (frmBhashaMaster). Field and column positions, widths and headers are
 * the ones in frmBhashaMaster.Designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'bhasha-master',
  panelHeight: 185,
  panelWidth: 1008,
  fields: [
    { name: 'bhashaname', label: 'Name', labelAt: { x: 13, y: 22 }, at: { x: 116, y: 18, w: 374 } },
    { name: 'brief', label: 'Brief', labelAt: { x: 13, y: 62 }, at: { x: 116, y: 58, w: 374 } },
    { name: 'remark', label: 'Remark', labelAt: { x: 13, y: 102 }, at: { x: 116, y: 98, w: 374 } },
    {
      name: 'hindiword',
      label: 'Hindi Word',
      labelAt: { x: 13, y: 142 },
      at: { x: 116, y: 138, w: 374 },
    },
    {
      name: 'columnNo',
      label: 'Column No',
      labelAt: { x: 525, y: 22 },
      at: { x: 629, y: 18, w: 360 },
    },
    { name: 'vibhag', label: 'Vibhag', labelAt: { x: 525, y: 62 }, at: { x: 629, y: 58, w: 360 } },
    {
      name: 'bhasa_attr',
      label: 'Attr',
      labelAt: { x: 525, y: 102 },
      at: { x: 629, y: 98, w: 360 },
    },
    {
      name: 'UplevelKt',
      label: 'Up Level',
      labelAt: { x: 525, y: 142 },
      at: { x: 629, y: 138, w: 360 },
      kt: true,
      nameColumn: 'UplevelName',
    },
  ],
  columns: [
    { header: 'Id', field: 'bhashacokm', width: 80 },
    { header: 'Name', field: 'bhashaname', width: 150 },
    { header: 'Attr', field: 'bhasa_attr' },
    { header: 'ColumnNo', field: 'columnNo' },
    { header: 'Vibhag', field: 'vibhag' },
    { header: 'Brief', field: 'brief' },
    { header: 'Remark', field: 'remark', width: 130 },
    { header: 'UpLevel', field: 'UplevelName', width: 110 },
    { header: 'Hindi Word', field: 'hindiword', width: 120 },
    { header: 'CountI', field: 'countI', width: 120 },
    { header: 'Counters', field: 'count', width: 130 },
  ],
  contextMenu: ({ run }) => [
    // { kind: 'item', label: 'Update Bhasha Count', onSelect: () => run('update-count') },
    {
      kind: 'submenu',
      label: 'Show In Use',
      items: [
        { kind: 'item', label: 'Kruti Master', onSelect: () => run('in-use-kruti') },
        // { kind: 'item', label: 'Prakashan List', onSelect: () => run('in-use-prakashan-list') },
        { kind: 'item', label: 'BookM', onSelect: () => run('in-use-book') },
      ],
    },
  ],
};

export function BhashaMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}
