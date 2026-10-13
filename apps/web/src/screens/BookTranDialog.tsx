'use client';

import { desktopOnlyMessage } from '@/features/master/desktopOnly';
import type { ActionResult, ChildRow, PickList } from '@gglib/shared';
import { useMemo, useRef, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
import { Modal } from '@/components/ui/Modal';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type { FormContext, ScreenActions, ScreenSpec, TransSpec } from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import { useWorkspace } from '@/features/shell/Workspace';
import { api, errorMessage } from '@/lib/api';

/**
 * Book Master's Library No form (frmBookTranNew), opened by F2 on txtBookTran or from "For
 * Selected Record › BookT". It is a frmMasterPage that edits its rows in place: a clicked row
 * is loaded for editing, Save writes it at once, and nothing asks before it does.
 *
 * Designed at 96 DPI (AutoScale 7×16): the designer's positions are used as they are.
 */

const joined = (column: string) => (rows: ChildRow[]) => {
  let out = '';
  for (const r of rows) {
    const v = netString(r[column] ?? null).trim();
    if (v === '') continue;
    out = out === '' ? v : `${out},${v}`;
  }
  return out;
};

const TRANS: Record<string, TransSpec> = {
  // FormName "Book": frmDisplayTransNew has no SetForm_Book, so the grid is shown as it is.
  PraptiTran: {
    column: 'PraptiTran',
    hidden: [],
    editable: [],
    lookups: {},
    firstColumn: 0,
    newRowDisabled: true,
    summary: (rows) => joined('party_name')(rows),
  },
  // SetForm_BookT, TranName "Mark".
  MarkTran: {
    column: 'MarkTran',
    hidden: ['BookTranMarkTKm', 'MarkKt'],
    editable: [],
    lookups: { markname: { setKt: 'MarkKt', setName: 'MarkName' } },
    template: ({ seq }) => [0, 0, '', seq],
    firstColumn: 'MarkName',
    summary: (rows) => joined('MarkName')(rows),
  },
};

type Deps = {
  /** The dialog's current grid, for Save's seq (dgBook.Rows.Count / CurrentRow.Index). */
  current: () => MasterState | null;
  bookId: number;
  pickSeries: (ctx: FormContext) => void;
  saved: () => void;
};

function buildSpec(deps: Deps, showAll: boolean): ScreenSpec {
  return {
    screen: 'book-tran',
    // btnShowAll collapses the panel.
    panelHeight: showAll ? 0 : 185,
    panelWidth: 907,
    editInPlace: true,
    listOnly: showAll,
    entryLabel: true,
    toolbarCheckbox: { name: 'MainL', label: 'MainL', right: 185, disabled: true },
    labels: [
      ['Series', 7, 9],
      ['Media Type', 7, 45],
      ['Kabaat/Rack No', 7, 81],
      ['Old LibNo', 7, 117],
      ['Prapti', 7, 153],
      ['LibNo', 245, 9],
      ['Mark', 245, 45],
      ['BKGrNo', 245, 81],
      ['Old LibRem', 245, 117],
      ['Cancel', 245, 153],
      ['Purnata', 447, 9],
      ['Mixsign', 447, 45],
      ['Issue', 447, 81],
      ['NewLibNo', 447, 117],
      ['Inward', 447, 153],
      ['Quality', 656, 9],
      ['Mixsign Rem', 656, 45],
      ['Check Rem', 656, 81],
      ['Remark', 656, 117],
      ['Info', 656, 153],
    ].map(([text, x, y]) => ({ text: text as string, at: { x: x as number, y: y as number } })),
    fields: [
      {
        name: 'SeriesKt',
        at: { x: 141, y: 5, w: 103 },
        kt: true,
        nameColumn: 'SeriesName',
        onF2: deps.pickSeries,
      },
      { name: 'Libno', at: { x: 346, y: 5, w: 97 } },
      { name: 'PurnataKt', at: { x: 533, y: 5, w: 117 }, kt: true, nameColumn: 'PurnataName' },
      { name: 'QualityKt', at: { x: 758, y: 5, w: 139 }, kt: true, nameColumn: 'QualityName' },
      { name: 'MediaTypekt', at: { x: 141, y: 41, w: 103 }, kt: true, nameColumn: 'MediaTypeName' },
      { name: 'MarkTran', at: { x: 346, y: 41, w: 97 }, trans: 'MarkTran' },
      // txtMixSign: the picks are added after what the box held.
      { name: 'Mixsign', at: { x: 533, y: 41, w: 117 }, addMore: { append: true } },
      { name: 'MixSignRem', at: { x: 758, y: 41, w: 139 } },
      { name: 'CupBoardNo', at: { x: 141, y: 77, w: 51 } },
      { name: 'CupBoardRackNo', at: { x: 193, y: 77, w: 51 } },
      { name: 'BKGrNo', at: { x: 346, y: 77, w: 97 } },
      // No SetForm_ and no rows behind it: F2 shows an empty popup on the desktop.
      { name: 'IssueTran', at: { x: 533, y: 77, w: 117 }, noF2: true },
      { name: 'CheckRem', at: { x: 758, y: 77, w: 139 } },
      { name: 'OldLibNo', at: { x: 141, y: 113, w: 103 } },
      { name: 'OldLibnoRem', at: { x: 346, y: 113, w: 97 } },
      { name: 'NewLibno', at: { x: 533, y: 113, w: 117 } },
      { name: 'Remark', at: { x: 758, y: 113, w: 139 } },
      { name: 'PraptiTran', at: { x: 141, y: 149, w: 103 }, trans: 'PraptiTran' },
      { name: 'Cancelcokt', at: { x: 346, y: 149, w: 97 } },
      { name: 'InwordKt', at: { x: 533, y: 149, w: 117 }, kt: true, nameColumn: 'InwordName' },
      { name: 'PM_GBKM_SEL_PLIST_IMG', at: { x: 758, y: 149, w: 139 }, noF2: true },
    ],
    trans: TRANS,
    columns: [
      { header: 'Tid', field: 'tid', width: 5 },
      { header: 'BookMastkt', field: 'BookMastkt', width: 5 },
      { header: 'Lib No', field: 'Libno', width: 100 },
      { header: 'Purnata', field: 'PurnataName', width: 100 },
      { header: 'Quality', field: 'QualityName', width: 93 },
      { header: 'Media Type', field: 'MediaTypeName', width: 93 },
      { header: 'Mark', field: 'MarkTran', width: 93 },
      { header: 'Mix Sign', field: 'Mixsign', width: 94 },
      { header: 'Remark', field: 'Remark', width: 93 },
      { header: 'KabaatNo', field: 'CupBoardNo', width: 85 },
      { header: 'Issue', field: 'IssueTran', width: 93 },
      { header: 'LabIssue', field: 'LabIssueTran', width: 93 },
      { header: 'Inwordkt', field: 'InwordKt', width: 10 },
    ],
    validate: (ctx) => ((ctx.fields.Libno ?? '').trim() === '' ? 'Please Enter LibNo' : ''),
    // Save(): the book, and seq from the row's place in the grid. A new row is the book's main
    // one (chkMainL) when the book has none yet.
    beforeSave: async (ctx) => {
      const state = deps.current();
      const rows = state?.visibleRows ?? [];
      const index = rows.findIndex((r) => Number(r.tid) === state?.currentId);
      return {
        BookMastkt: deps.bookId,
        RowCount: rows.length,
        RowIndex: Math.max(index, 0),
        MainL: ctx.strMode === 'Add' ? rows.length === 0 : ctx.fields.MainL === 'True',
      };
    },
    afterSave: () => deps.saved(),
  };
}

type Dialog =
  | {
      kind: 'pick';
      title: string;
      list: PickList | undefined;
      resolve: (r: PickResult | null) => void;
    }
  | { kind: 'input'; prompt: string; resolve: (v: string | null) => void };

export function BookTranDialog({
  bookId,
  tids,
  showAll: openedWithIds,
  onClose,
}: {
  bookId: number;
  /** The rows to show: the book's (F2 on txtBookTran) or the selected books' (the menu). */
  tids: number[];
  /** strTid was given: "For Selected Record › BookT" (no book's rows are being edited). */
  showAll: boolean;
  /** `changed`: a row was saved or deleted (frm.boolSave), so Library No reads again. */
  onClose: (changed: boolean) => void;
}) {
  const msg = useMessageBox();
  const workspace = useWorkspace();
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const stateRef = useRef<MasterState | null>(null);
  const changed = useRef(false);

  function pick(title: string, load: () => Promise<PickList>): Promise<PickResult | null> {
    return new Promise((resolve) => {
      setDialog({ kind: 'pick', title, list: undefined, resolve });
      load()
        .then((list) =>
          setDialog((d) => (d?.kind === 'pick' && d.title === title ? { ...d, list } : d)),
        )
        .catch(async (err: unknown) => {
          setDialog(null);
          resolve(null);
          await msg.alert(errorMessage(err));
        });
    });
  }
  const ask = (prompt: string) =>
    new Promise<string | null>((resolve) => setDialog({ kind: 'input', prompt, resolve }));
  const f2 = (name: string) => () => api.get<PickList>(`/master/book-tran/f2/${name}`);
  const named = (name: string) => () => api.get<PickList>(`/master/book-tran/lists/${name}`);

  const spec = useMemo(
    () =>
      buildSpec(
        {
          current: () => stateRef.current,
          bookId,
          // txtSerieskt's F2: the series, then its next number in Library No.
          pickSeries: (ctx) => {
            void (async () => {
              const r = await pick('Series', f2('SeriesKt'));
              const kt = Number(r?.code[0]) || 0;
              if (!r || kt <= 0) return;
              ctx.setTag('SeriesKt', kt);
              ctx.setField('SeriesKt', r.name);
              const next = await ctx.call('next-libno', { seriesKt: kt }, []);
              if (next?.kind === 'message') ctx.setField('Libno', next.message);
            })();
          },
          saved: () => {
            changed.current = true;
          },
        },
        showAll,
      ),
    [showAll],
  );

  /** A menu item that opens another screen closes this form (Me.Close()). */
  async function openOther(a: ScreenActions, action: string) {
    const r: ActionResult | null = await a.call(action);
    if (r?.kind !== 'open') return;
    if (r.ids.length === 0) {
      if (r.emptyMessage) await a.alert(r.emptyMessage);
      return;
    }
    workspace.open(r.screen, r.ids);
    onClose(changed.current);
  }

  function menu(a: ScreenActions, state: MasterState): ContextMenuItem[] {
    stateRef.current = state;
    const item = (label: string, onSelect: () => void, shortcut?: string): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
      ...(shortcut ? { shortcut } : {}),
    });
    const tid = state.currentId ?? 0;
    return [
      {
        kind: 'submenu',
        label: 'For Selected Record',
        items: [
          item('Show BookMaster', () => void openOther(a, 'show-book-master')),
          item('Inward Master', () => void openOther(a, 'inword-master')),
          item('Party Master', () => void openOther(a, 'party-master')),
          item('Issue Master', () => void openOther(a, 'issue-master')),
          item('Anya Bhandar', () => void openOther(a, 'anya-bhandar')),
          item('Lab Issue Master', () => void openOther(a, 'lab-issue-master')),
          {
            kind: 'submenu',
            label: 'Utility',
            items: [
              item('Transfer Current LibNo to Another Group', async () => {
                if (
                  !(await a.confirm(
                    'You are going to Transfer current LibNo to Some Another BookGroup Are You Sure ? ',
                  ))
                )
                  return;
                const row = state.rows.find((r) => Number(r.tid) === tid);
                if (Number(row?.tid) === Number(row?.BookMastkt)) {
                  await a.alert(
                    'tid and bookmastkt value of this libno is same, so unable to transfer this libno',
                    'Master Libno Can not Be transfer',
                  );
                  return;
                }
                const book = Number((await pick('Book', named('books')))?.code[0]) || 0;
                if (book <= 0) return;
                const password = await a.askPassword();
                if (password === null) return;
                const r = await a.call('transfer-to-book', { tid, book, password }, []);
                if (r?.kind === 'message' && r.message) await a.alert(r.message);
                changed.current = true;
                state.newRecord();
                state.refresh();
              }),
              item(
                'Update Mix Sign',
                () => void a.alert('Update Mix Sign (BookT) is not available on the web yet.'),
              ),
              item('Update Mark', async () => {
                const password = await a.askPassword();
                if (password === null) return;
                const r = await pick('Mark', named('mark'));
                if (r && r.name !== '') await a.run('update-mark', { mark: r.name, password });
              }),
              // ShortcutKeys F6 / F7 / F8 (frmBookTranNew.designer.vb).
              item(
                'Request For LabIssue',
                () => void a.run('request-lab-issue', { forKt: 0 }),
                'F6',
              ),
              item(
                'Request LabIssue for MS',
                async () => {
                  const party = Number((await pick('Party', named('parties')))?.code[0]) || 0;
                  if (party > 0) await a.run('request-lab-issue', { forKt: party });
                },
                'F7',
              ),
              item(
                'Send Book Confirmation',
                async () => {
                  if (!(await a.confirm('Are you sure to send confirmation for selected records?')))
                    return;
                  const r = await a.call('send-book-confirmation');
                  if (r?.kind !== 'message') return;
                  if (r.message !== 'ask-ank') {
                    if (r.message) await a.alert(r.message);
                    return;
                  }
                  const ank = (await ask('Please Enter Ank')) ?? '';
                  await a.run('send-book-confirmation', { ank });
                },
                'F8',
              ),
            ],
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'Filter',
        items: [
          item(
            'User Detail',
            () => void a.alert('User Detail (frmSearchUser) is not available on the web yet.'),
          ),
        ],
      },
      a.printLayouts.length > 0
        ? {
            kind: 'submenu',
            label: 'Print Selected Columns',
            items: a.printLayouts,
            onSelect: a.printSelectedColumn,
          }
        : item('Print Selected Columns', a.printSelectedColumn),
      // v3.4.3.1: the four items compare BookTranMixSignT with the folders of the office's scan
      // and e-book shares (the last two captions are the desktop's, the fourth a repeat).
      {
        kind: 'submenu',
        label: 'Utility',
        items: [
          'Update SN Not Exist In MixSign But Exist In Path',
          'Update EB Not Exist In MixSign But Exist In Path',
          'Update SN Exist In MixSign But Not Exist In Path',
          'Update EB Not Exist In MixSign But Exist In Path',
        ].map((label) =>
          item(
            label,
            () =>
              void a.alert(
                desktopOnlyMessage(
                  `${label} (it reads the scan and e-book folders of the office's shares)`,
                ),
              ),
          ),
        ),
      },
    ];
  }

  /** Delete(): confirm, where the LibNo is used, a row to move those to, then the password. */
  async function deleteFlow(a: ScreenActions, state: MasterState) {
    if (!(await a.confirm('Are You Sure to Delete This Record?'))) return;
    const tid = state.strMode === 'Edit' ? (state.currentId ?? 0) : 0;
    let transferTo = 0;
    if (tid > 0) {
      const used = await a.call('in-use', { tid }, []);
      const inUse = used?.kind === 'message' ? used.message : '';
      if (state.visibleRows.length > 1) {
        if (
          inUse !== '' &&
          !(await a.confirm(
            `Libno is Used In Below Transactions\r\n${inUse}`,
            'Press(Yes) to Delete LibNo And Replace LibNo in Below Transactions\r\nPress(No) to Cancel',
          ))
        )
          return;
        const choices = await a.call('transfer-choices', { tid }, []);
        const r = await pick('LibNo', async () =>
          choices?.kind === 'table'
            ? { columns: choices.columns, rows: choices.rows }
            : { columns: [], rows: [] },
        );
        transferTo = Number(r?.code[0]) || 0;
        if (transferTo === 0) return;
      } else if (inUse !== '') {
        await a.alert(
          `Libno is Used In Below Transactions\r\n${inUse}`,
          'Record Cannot Be Deleted',
        );
        return;
      }
    }
    const password = await a.askPassword();
    if (password === null || tid === 0) return;
    const r = await a.call('delete-libno', { tid, transferTo, password }, []);
    if (!r) return;
    changed.current = true;
    state.newRecord();
    state.refresh();
  }

  const fullSpec: ScreenSpec = { ...spec, deleteFlow };

  return (
    <Modal
      title="Book Tran"
      width={911}
      onClose={() => onClose(changed.current)}
      className="bg-alice-blue"
    >
      <div className="relative" style={{ height: 457 }}>
        <MasterScreen
          key={showAll ? 'all' : 'book'}
          spec={fullSpec}
          windowId={-1}
          close={() => onClose(changed.current)}
          initialIds={showAll ? undefined : tids.length > 0 || openedWithIds ? tids : [0]}
          menu={menu}
        />
        {/* btnShowAll: every BookT row, with New / Save / Delete off and the panel collapsed. */}
        <button
          type="button"
          className="win-button absolute top-[2px] right-[6px] h-[23px] w-[64px] text-xs"
          disabled={showAll}
          onClick={() => setShowAll(true)}
        >
          Show All
        </button>
      </div>

      {dialog?.kind === 'pick' && (
        <PickListDialog
          title={dialog.title}
          list={dialog.list}
          selectFirst
          onCancel={() => {
            const d = dialog;
            setDialog(null);
            d.resolve(null);
          }}
          onPick={(r) => {
            const d = dialog;
            setDialog(null);
            d.resolve(r);
          }}
        />
      )}
      {dialog?.kind === 'input' && (
        <InputBox
          prompt={dialog.prompt}
          onOk={(v) => {
            const d = dialog;
            setDialog(null);
            d.resolve(v);
          }}
          onCancel={() => {
            const d = dialog;
            setDialog(null);
            d.resolve(null);
          }}
        />
      )}
    </Modal>
  );
}
