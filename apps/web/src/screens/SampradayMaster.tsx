'use client';

import type { PickList } from '@gglib/shared';
import { useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import { sendTextToWord } from '@/features/master/sendToExcel';
import type { FieldSpec, ScreenActions, ScreenSpec, TransSpec } from '@/features/master/types';
import {
  buildUplevelTree,
  type UplevelNode,
  UplevelTree,
  uplevelTreeText,
} from '@/features/master/UplevelTree';
import type { MasterState } from '@/features/master/useMasterScreen';
import { api, errorMessage } from '@/lib/api';
import type { ScreenProps } from './registry';

const LIBNO_TO_PAGENO = { setKt: 'BookTKt', setName: 'LibNo', next: 'PageNo' };

/** SetForm_Sampraday: its popups, their hidden / editable columns, lists and new rows. */
const TRANS: Record<string, TransSpec> = {
  SampradayAnyaNameTran: {
    column: 'SampradayAnyaNameTran',
    hidden: ['SampradayAnyaNameKm', 'BookTKt'],
    editable: ['AnyaName', 'Page'],
    lookups: { libno: { setKt: 'BookTKt', setName: 'LibNo', next: 'Page' } },
    template: ({ seq }) => [0, '', 0, '', '', seq],
    firstColumn: 'AnyaName',
  },
  SampradayAdyaSthapakTran: {
    column: 'SampradayAdyaSthapakTran',
    hidden: ['SampradayAdyaSthapakKm', 'AuthorKt'],
    editable: [],
    lookups: { adyasthapak: { setKt: 'AuthorKt', setName: 'AdyaSthapak', next: 'Seq' } },
    template: ({ seq }) => [0, 0, '', seq],
    firstColumn: 'AdyaSthapak',
  },
  SampradayReferenceTran: {
    column: 'SampradayReferenceTran',
    hidden: ['SampradayReferenceKm', 'BookTKt', 'RefPlaceKt'],
    editable: ['RefPgNo', 'Remark'],
    lookups: {
      libno: { setKt: 'BookTKt', setName: 'LibNo', next: 'RefPlaceName' },
      refplacename: { setKt: 'RefPlaceKt', setName: 'RefPlaceName', next: 'RefPgNo' },
    },
    template: ({ seq }) => [0, 0, '', 0, '', '', '', seq],
    firstColumn: 'LibNo',
  },
  SampradayNoteTran: {
    column: 'SampradayNoteTran',
    hidden: ['SampradayNoteKm', 'NoteTypeKt', 'BookTKt'],
    editable: ['Notes', 'PageNo'],
    lookups: {
      libno: LIBNO_TO_PAGENO,
      notetypename: { setKt: 'NoteTypeKt', setName: 'NoteTypeName', next: 'Notes' },
    },
    template: ({ seq }) => [0, 0, '', '', 0, '', '', seq],
    firstColumn: 'NoteTypeName',
  },
  SampradaySamvatTran: {
    column: 'SampradaySamvatTran',
    hidden: ['SampradaySamvatKm', 'SamvatTypeKt', 'BookTKt'],
    editable: ['Samvat', 'PageNo'],
    lookups: {
      samvattypename: { setKt: 'SamvatTypeKt', setName: 'SamvatTypeName', next: 'Samvat' },
      libno: LIBNO_TO_PAGENO,
    },
    template: ({ seq }) => [0, 0, '', '', 0, 0, '', '', seq],
    firstColumn: 'SamvatTypeName',
  },
  SampradayBriefTran: {
    column: 'SampradayBriefTran',
    hidden: ['SampradayBriefKm', 'BookTKt'],
    editable: ['Brief', 'PageNo'],
    lookups: { libno: LIBNO_TO_PAGENO },
    template: ({ seq }) => [0, '', 0, '', '', seq],
    firstColumn: 'Brief',
  },
  SampradayRemarkTran: {
    column: 'SampradayRemarkTran',
    hidden: ['SampradayRemarkKm', 'BookTKt'],
    editable: ['Remark', 'PageNo'],
    lookups: { libno: LIBNO_TO_PAGENO },
    template: ({ seq }) => [0, '', 0, '', '', seq],
    firstColumn: 'Remark',
  },
  SampradaySthalTran: {
    column: 'SampradaySthalTran',
    hidden: ['SampradaySthalKm', 'SthalKt', 'BookTKt'],
    editable: ['PageNo'],
    lookups: {
      libno: LIBNO_TO_PAGENO,
      sthal: { setKt: 'SthalKt', setName: 'Sthal', next: 'LibNo' },
    },
    template: ({ seq }) => [0, 0, '', 0, '', '', seq],
    firstColumn: 'Sthal',
  },
};

const tran = (name: string, x: number, y: number, w: number): FieldSpec => ({
  name,
  at: { x, y, w },
  trans: name,
});

/**
 * Master › Sampraday Master (frmSampraday). Field and column positions, widths and headers are
 * the ones in frmSampraday.Designer.vb. Its hidden Samvat boxes are never saved and are left out.
 */
const spec: ScreenSpec = {
  screen: 'sampraday-master',
  panelHeight: 201,
  panelWidth: 1008,
  entryLabel: true,
  fields: [
    {
      name: 'SampradayName',
      label: 'Name',
      labelAt: { x: 11, y: 22 },
      at: { x: 157, y: 18, w: 333 },
    },
    tran('SampradayBriefTran', 157, 54, 333),
    tran('SampradayNoteTran', 157, 90, 333),
    tran('SampradayRemarkTran', 157, 126, 333),
    tran('SampradayAnyaNameTran', 157, 162, 206),
    tran('SampradaySthalTran', 364, 162, 126),
    {
      name: 'ShortNm',
      label: 'Short Name',
      labelAt: { x: 494, y: 22 },
      at: { x: 658, y: 18, w: 342 },
    },
    { name: 'UplevelKt', at: { x: 658, y: 54, w: 170 }, kt: true, nameColumn: 'UplevelName' },
    { name: 'Uplevel1Kt', at: { x: 830, y: 54, w: 170 }, kt: true, nameColumn: 'Uplevel1Name' },
    tran('SampradaySamvatTran', 658, 90, 342),
    tran('SampradayReferenceTran', 658, 126, 342),
    tran('SampradayAdyaSthapakTran', 658, 162, 342),
  ],
  labels: [
    { text: 'Brief', at: { x: 11, y: 58 } },
    { text: 'Notes', at: { x: 11, y: 94 } },
    { text: 'Remark', at: { x: 11, y: 130 } },
    { text: 'Anya Name / Sthal', at: { x: 11, y: 166 } },
    { text: 'Up Level /Up Level1', at: { x: 494, y: 58 } },
    { text: 'Samvat', at: { x: 494, y: 94 } },
    { text: 'Reference', at: { x: 494, y: 130 } },
    { text: 'Adya Sthapak', at: { x: 494, y: 166 } },
  ],
  trans: TRANS,
  columns: [
    { header: 'Id', field: 'SampradayKm', width: 80 },
    { header: 'Name', field: 'SampradayName', width: 150 },
    { header: 'UpLevel', field: 'UplevelName', width: 110 },
    { header: 'Short Name', field: 'ShortNm' },
    { header: 'Brief', field: 'Brief' },
    { header: 'Remark', field: 'Remark', width: 120 },
    { header: 'AdyaSthapak', field: 'txtAdyaSthapak', width: 120 },
    { header: 'AnyaName', field: 'txtAnyaName' },
    { header: 'SamvatType', field: 'SampradaySamvatTran' },
    { header: 'Sthal', field: 'Sthal', width: 150 },
    { header: 'LinkWithSadi', field: 'LinkedSadiName', width: 150 },
  ],
};

export function SampradayMaster(props: ScreenProps) {
  const [tree, setTree] = useState<UplevelNode[] | null>(null);
  const [treeSelected, setTreeSelected] = useState<number | null>(null);
  const [picking, setPicking] = useState<{
    title: string;
    list: PickList | undefined;
    onPick: (r: PickResult) => void;
  } | null>(null);

  /** DisplayListForm over one of the screen's lists, then `then` with the picked id. */
  function pick(a: ScreenActions, title: string, list: string, then: (id: number) => void) {
    setPicking({ title, list: undefined, onPick: () => undefined });
    api
      .get<PickList>(`/master/sampraday-master/lists/${list}`)
      .then((rows) =>
        setPicking({
          title,
          list: rows,
          onPick: (r) => {
            setPicking(null);
            const id = Number(r.code[0]);
            if (id > 0) then(id);
          },
        }),
      )
      .catch(async (err: unknown) => {
        setPicking(null);
        await a.alert(errorMessage(err));
      });
  }

  function menu(a: ScreenActions, state: MasterState): ContextMenuItem[] {
    /** In tree mode the For Selected Record items use the selected node (tvTree.SelectedNode.Tag). */
    const forSelected = () => (tree ? (treeSelected ? [treeSelected] : []) : a.selectedIds);
    const item = (label: string, onSelect: () => void): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
    });
    const updateUplevel = (label: string, action: string) =>
      item(label, () => {
        const ids = a.selectedIds;
        if (ids.length === 0) return;
        pick(a, 'Sampraday', 'sampradays', (kt) => void a.run(action, { uplevelKt: kt }, ids));
      });
    return [
      item(tree ? 'Display In Grid' : 'Display In Tree', async () => {
        if (tree) return setTree(null);
        try {
          const rows = await api.get<PickList>('/master/sampraday-master/lists/tree');
          setTree(
            buildUplevelTree(
              // The root reads the grid's name with its SamvatType cell in brackets.
              state.selectedRows.map((r) => {
                const samvat = String(r.SampradaySamvatTran ?? '').trim();
                return {
                  id: Number(r.SampradayKm),
                  text: `${String(r.SampradayName ?? '')}${samvat === '' ? '' : `(${samvat})`}`,
                };
              }),
              rows,
            ),
          );
        } catch (err) {
          await a.alert(errorMessage(err));
        }
      }),
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
      {
        kind: 'submenu',
        label: 'Utility',
        items: [
          updateUplevel('Update Uplevel In Selected Records', 'update-uplevel'),
          updateUplevel('Update Uplevel1 In Selected Records', 'update-uplevel1'),
        ],
      },
      {
        kind: 'submenu',
        label: 'For Selected Record',
        items: [
          item('Magazine Master', () => void a.run('in-use-magazine', undefined, forSelected())),
          item('Author Master', async () => {
            const ids = forSelected();
            const answer = await a.yesNoCancel(
              'Show From Sampraday(Press Yes)\r\nShow From SampradayTran(Press No)\r\nShow In Both(Press Cancel)',
            );
            const mode = answer === 'yes' ? 'own' : answer === 'no' ? 'tran' : 'both';
            await a.run('in-use-author', { mode }, ids);
          }),
          {
            kind: 'submenu',
            label: 'Utility',
            items: [
              item('Set LinkWithSadi', () => {
                const ids = a.selectedIds;
                if (ids.length === 0) return;
                pick(
                  a,
                  'LinkWithSadi',
                  'link-with-sadi',
                  (kt) => void a.run('set-link-with-sadi', { linkedSadiKt: kt }, ids),
                );
              }),
            ],
          },
        ],
      },
      // Visible only while the tree shows (cntMenu_Opening).
      ...(tree
        ? [item('Print Tree', () => sendTextToWord('Sampraday Tree', uplevelTreeText(tree)))]
        : []),
    ];
  }

  return (
    <>
      <MasterScreen
        spec={spec}
        {...props}
        menu={menu}
        gridOverride={(a, state) =>
          tree ? (
            <UplevelTree
              label="Sampraday Tree"
              roots={tree}
              selectedTag={treeSelected}
              onSelect={(tag) => {
                setTreeSelected(tag);
                void state.loadRecord(tag);
              }}
              menuItems={menu(a, state)}
            />
          ) : null
        }
      />
      {picking && (
        <PickListDialog
          title={picking.title}
          list={picking.list}
          selectFirst
          onCancel={() => setPicking(null)}
          onPick={picking.onPick}
        />
      )}
    </>
  );
}
