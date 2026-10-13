'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenSpec } from '@/features/master/types';
import { graphicsShowInUse } from './GrWordMaster';
import type { ScreenProps } from './registry';

/**
 * Graphics › New Vishay Master (frmGrVishayMaster). Positions, widths and headers are
 * frmGrVishayMaster.designer.vb's ("Graphics Vishay Master").
 */
const spec: ScreenSpec = {
  screen: 'new-vishay-master',
  panelHeight: 132,
  panelWidth: 1008,
  fields: [
    { name: 'vishaynm', label: 'Name', labelAt: { x: 13, y: 22 }, at: { x: 116, y: 18, w: 374 } },
    {
      name: 'defination',
      label: 'Defination',
      labelAt: { x: 13, y: 62 },
      at: { x: 116, y: 58, w: 374 },
      h: 54,
    },
    {
      name: 'groupnm',
      label: 'Group Name',
      labelAt: { x: 525, y: 22 },
      at: { x: 629, y: 18, w: 360 },
    },
    {
      name: 'remark',
      label: 'Remark',
      labelAt: { x: 525, y: 62 },
      at: { x: 629, y: 58, w: 360 },
      h: 54,
    },
  ],
  // chkIsCancel sits on the form at (770, 27), over the toolbar, not in the panel.
  toolbarCheckbox: { name: 'IsCancel', label: 'Cancel', right: 164 },
  columns: [
    { header: 'Id', field: 'Grvishaykm', width: 80 },
    { header: 'Name', field: 'vishaynm', width: 200 },
    { header: 'Defination', field: 'defination', width: 200 },
    { header: 'Remark', field: 'remark', width: 200 },
    { header: 'Count', field: 'count' },
    { header: 'Member', field: 'Member' },
    { header: 'Master', field: 'Master' },
    { header: 'Cancel', field: 'IsCancel' },
  ],
  // Delete(): every selected row, all checked for use before any is deleted.
  deleteFlow: async (a) => {
    if (a.selectedIds.length === 0) return;
    if (!(await a.confirm('Are You Sure to Delete This Record?'))) return;
    const password = await a.askPassword();
    if (password === null) return;
    await a.run('delete-selected', { password });
  },
  contextMenu: (a) => [
    graphicsShowInUse(a),
    {
      kind: 'submenu',
      label: 'Utility',
      items: [
        {
          kind: 'item',
          label: 'Replace',
          onSelect: async () => {
            if (a.selectedIds.length === 0) return;
            const r = await a.pick('replace-with', { title: 'Replace', addBlankRow: true });
            const to = Number(r?.code[0]);
            if (to > 0) await a.run('replace', { replaceWith: to });
          },
        },
        {
          kind: 'item',
          label: 'Update Count For Selected Records',
          onSelect: () => void a.run('update-count'),
        },
        {
          kind: 'item',
          label: 'Show Member/Master',
          onSelect: () => void a.run('show-member-master'),
        },
      ],
    },
  ],
};

export function GrVishayMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}
