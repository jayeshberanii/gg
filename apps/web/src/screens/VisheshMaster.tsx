'use client';

import type { PickList } from '@gglib/shared';
import { useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { REFERENCE_T1 } from '@/features/master/FormFields';
import { MasterScreen } from '@/features/master/MasterScreen';
// import { sendTextToWord } from '@/features/master/sendToExcel';
import type { ScreenActions, ScreenSpec } from '@/features/master/types';
// import {
//   // buildUplevelTree,
//   type UplevelNode,
//   UplevelTree,
//   // uplevelTreeText,
// } from '@/features/master/UplevelTree';
// import type { MasterState } from '@/features/master/useMasterScreen';
// import { api, errorMessage } from '@/lib/api';
import type { ScreenProps } from './registry';

/** Color.DarkViolet */
const DARK_VIOLET = '#9400d3';

/**
 * Master › Vishesh Master (frmVisheshMaster). Field and column positions, widths and headers are
 * the ones in frmVisheshMaster.Designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'vishesh-master',
  panelHeight: 201,
  panelWidth: 1008,
  fields: [
    { name: 'Vishesh', label: 'Name', labelAt: { x: 13, y: 22 }, at: { x: 116, y: 18, w: 374 } },
    { name: 'Brief', label: 'Brief', labelAt: { x: 13, y: 58 }, at: { x: 116, y: 54, w: 374 } },
    { name: 'Notes', label: 'Notes', labelAt: { x: 13, y: 94 }, at: { x: 116, y: 90, w: 374 } },
    {
      name: 'HindiWord',
      label: 'Hindi Word',
      labelAt: { x: 13, y: 130 },
      at: { x: 116, y: 126, w: 374 },
    },
    {
      name: 'VisheshAnyaNameTran',
      label: 'Anya Name',
      labelAt: { x: 13, y: 166 },
      at: { x: 116, y: 162, w: 374 },
      trans: 'VisheshAnyaNameTran',
    },
    {
      name: 'VisheshNo',
      label: 'Vishesh No',
      labelAt: { x: 513, y: 22 },
      at: { x: 629, y: 18, w: 360 },
    },
    { name: 'remark', label: 'Remark', labelAt: { x: 513, y: 58 }, at: { x: 629, y: 54, w: 360 } },
    {
      name: 'ShortNm',
      label: 'Short Name',
      labelAt: { x: 513, y: 94 },
      at: { x: 629, y: 90, w: 360 },
    },
    {
      name: 'UplevelKt',
      label: 'Up Level',
      labelAt: { x: 513, y: 130 },
      at: { x: 629, y: 126, w: 360 },
      kt: true,
      nameColumn: 'UplevelName',
      // Txt_KeyDown's txtuplevelkt branch: by the Remark box and the loaded record.
      f2Params: (ctx) => ({ remark: ctx.fields.remark ?? '', id: ctx.tranKm }),
    },
    {
      name: 'VisheshAdyaSthapakTran',
      label: 'Adya Sthapak',
      labelAt: { x: 513, y: 166 },
      at: { x: 629, y: 162, w: 360 },
      trans: 'VisheshAdyaSthapakTran',
    },
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
    // SetForm_Vishesh
    VisheshAnyaNameTran: {
      column: 'VisheshAnyaNameTran',
      hidden: ['VisheshAnyaNamekm'],
      editable: ['AnyaName'],
      lookups: {},
      template: ({ seq }) => [0, '', seq],
      firstColumn: 1,
    },
    VisheshAdyaSthapakTran: {
      column: 'VisheshAdyaSthapakTran',
      hidden: ['AuthorKt'],
      editable: [],
      lookups: { adyasthapak: { setKt: 'AuthorKt', setName: 'AdyaSthapak', next: 'Seq' } },
      template: ({ seq }) => [0, '', seq],
      firstColumn: 1,
    },
    ReferenceT1: { ...REFERENCE_T1, column: 'ReferenceT1' },
  },
  columns: [
    { header: 'Id', field: 'Tid', width: 80 },
    { header: 'Remark', field: 'remark', width: 130 },
    { header: 'Name', field: 'Vishesh', width: 150 },
    { header: 'Brief', field: 'Brief' },
    { header: 'Short Name', field: 'ShortNm' },
    { header: 'UpLevel', field: 'UplevelName', width: 110 },
    { header: 'Hindi Word', field: 'HindiWord', width: 120 },
    { header: 'CountI', field: 'CountI', width: 120 },
    { header: 'Counters', field: 'Count', width: 130 },
    { header: 'AdyaSthapak', field: 'txtAdyaSthapak', width: 120 },
  ],
};

export function VisheshMaster(props: ScreenProps) {
  // const [tree, setTree] = useState<UplevelNode[] | null>(null);
  // const [treeSelected, setTreeSelected] = useState<number | null>(null);
  const [picking, setPicking] = useState<{
    list: PickList | undefined;
    onPick: (r: PickResult) => void;
  } | null>(null);

  function menu(a: ScreenActions): ContextMenuItem[] {
    /** In tree mode the For Selected Record items use the selected node (tvTree.SelectedNode.Tag). */
    // const forSelected = () => (tree ? (treeSelected ? [treeSelected] : []) : a.selectedIds);
    const item = (label: string, onSelect: () => void): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
    });
    return [
      // item(tree ? 'Display In Grid' : 'Display In Tree', async () => {
      //   if (tree) return setTree(null);
      //   try {
      //     const rows = await api.get<PickList>('/master/vishesh-master/lists/tree');
      //     setTree(
      //       buildUplevelTree(
      //         state.selectedRows.map((r) => ({ id: Number(r.Tid), text: String(r.Vishesh ?? '') })),
      //         rows,
      //       ),
      //     );
      //   } catch (err) {
      //     await a.alert(errorMessage(err));
      //   }
      // }),
      {
        kind: 'submenu',
        label: 'Print Report',
        items: [
          a.printLayouts.length > 0
            ? {
                kind: 'submenu',
                label: 'Selected Column',
                items: a.printLayouts,
                onSelect: a.printSelectedColumn,
              }
            : item('Selected Column', a.printSelectedColumn),
          item('Send To Excel', a.sendToExcel),
        ],
      },
      // {
      //   kind: 'submenu',
      //   label: 'Utility',
      //   items: [
      //     item('Update Uplevel In Selected Records', () => {
      //       const ids = a.selectedIds;
      //       if (ids.length === 0) return;
      //       setPicking({ list: undefined, onPick: () => undefined });
      //       void state
      //         .fieldPickList('update-uplevel', { ids: ids.join(',') })
      //         .then((list) =>
      //           setPicking({
      //             list,
      //             onPick: (r) => {
      //               setPicking(null);
      //               const kt = Number(r.code[0]);
      //               if (kt > 0) void a.run('update-uplevel', { uplevelKt: kt }, ids);
      //             },
      //           }),
      //         )
      //         .catch(async (err: unknown) => {
      //           setPicking(null);
      //           await a.alert(errorMessage(err));
      //         });
      //     }),
      //   ],
      // },
      // {
      //   kind: 'submenu',
      //   label: 'For Selected Record',
      //   items: [
      //     item('Magazine Master', () => void a.run('in-use-magazine', undefined, forSelected())),
      //     item('Author Master', () => void a.run('in-use-author', undefined, forSelected())),
      //   ],
      // },
      // Visible only while the tree shows (cntMenu_Opening).
      // ...(tree
      //   ? [item('Print Tree', () => sendTextToWord('Vishesh Tree', uplevelTreeText(tree)))]
      //   : []),
    ];
  }

  return (
    <>
      <MasterScreen
        spec={spec}
        {...props}
        menu={menu}
        // gridOverride={(a, state) =>
        //   tree ? (
        //     <UplevelTree
        //       label="Vishesh Tree"
        //       roots={tree}
        //       selectedTag={treeSelected}
        //       onSelect={(tag) => {
        //         setTreeSelected(tag);
        //         void state.loadRecord(tag);
        //       }}
        //       menuItems={menu(a, state)}
        //     />
        //   ) : null
        // }
      />
      {picking && (
        <PickListDialog
          title="Uplevel"
          list={picking.list}
          selectFirst
          onCancel={() => setPicking(null)}
          onPick={picking.onPick}
        />
      )}
    </>
  );
}
