'use client';

import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { ScreenActions, ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';

/** The Show In Use submenu frmGrWordMaster and frmGrVishayMaster share. */
export function graphicsShowInUse(a: ScreenActions): ContextMenuItem {
  return {
    kind: 'submenu',
    label: 'Show In Use',
    items: [
      {
        kind: 'item',
        label: 'Graphics Master',
        onSelect: () => void a.run('in-use-graphics-master'),
      },
      {
        kind: 'item',
        label: 'Graphics Detail',
        onSelect: () => void a.run('in-use-graphics-detail'),
      },
    ],
  };
}

/**
 * Graphics › New Word Master (frmGrWordMaster). Positions, widths and headers are
 * frmGrWordMaster.designer.vb's ("Graphics Word Master").
 */
const spec: ScreenSpec = {
  screen: 'new-word-master',
  panelHeight: 128,
  panelWidth: 1008,
  fields: [
    { name: 'wordnm', label: 'Name', labelAt: { x: 13, y: 22 }, at: { x: 116, y: 18, w: 374 } },
    {
      name: 'defination',
      label: 'Defination',
      labelAt: { x: 13, y: 62 },
      at: { x: 116, y: 58, w: 374 },
      h: 54,
    },
    { name: 'typenm', label: 'Type', labelAt: { x: 554, y: 22 }, at: { x: 629, y: 18, w: 360 } },
    {
      name: 'remark',
      label: 'Remark',
      labelAt: { x: 554, y: 62 },
      at: { x: 629, y: 58, w: 360 },
      h: 54,
    },
  ],
  columns: [
    { header: 'Id', field: 'GrwordMkm', width: 80 },
    { header: 'Type', field: 'typenm', width: 150 },
    { header: 'Name', field: 'wordnm', width: 200 },
    { header: 'Defination', field: 'defination', width: 200 },
    { header: 'Remark', field: 'remark', width: 200 },
    { header: 'Count', field: 'count', width: 120 },
  ],
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
            const from = a.currentId;
            if (from === null) return;
            // frmList1 with the words of the current row's Type (first column hidden).
            const r = await a.pick('replace-with', { title: 'Replace', params: { id: from } });
            const to = Number(r?.code[0]);
            if (to > 0) await a.run('replace', { replaceWith: to }, [from]);
          },
        },
        {
          kind: 'item',
          label: 'Update Count For Selected Records',
          onSelect: () => void a.run('update-count'),
        },
      ],
    },
  ],
};

export function GrWordMaster(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}
