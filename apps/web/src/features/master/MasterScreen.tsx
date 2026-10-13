'use client';

import type { GridRow, PickList, PrintLayout } from '@gglib/shared';
import type { GridApi } from 'ag-grid-community';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { SecurityDialog } from '@/components/ui/SecurityDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, errorMessage } from '@/lib/api';
import type { ScreenProps } from '@/screens/registry';
import { FormFields } from './FormFields';
import { MasterGrid } from './MasterGrid';
import { MasterToolbar } from './MasterToolbar';
import { PrintSelectedColumnDialog } from './PrintSelectedColumnDialog';
import { SearchBar } from './SearchBar';
import { sendToExcel } from './sendToExcel';
import type { FormContext, PickOptions, ScreenActions, ScreenSpec } from './types';
import { useActionRunner } from './useActionRunner';
import { type ListScope, type MasterState, useMasterScreen } from './useMasterScreen';
import { WorkReportDialog } from './WorkReportDialog';

type Secured =
  | { purpose: 'delete' }
  | { purpose: 'lock'; lock: boolean }
  | { purpose: 'password'; resolve: (password: string | null) => void };

/** What a screen component can hand the engine beyond its spec. */
export type MasterScreenExtras = {
  /** The whole right-click menu, for a form whose menu is not Print Report + extras. */
  menu?: (actions: ScreenActions, state: MasterState) => ContextMenuItem[];
  /** Shown in place of the grid (Author Master's Display In Tree). */
  gridOverride?: (actions: ScreenActions, state: MasterState) => ReactNode | null;
  /**
   * Shown above the grid, in SplitContainer1.Panel2 (frmGraphicsDetail's dgGraphicMaster, the
   * record's Graphics Master row). It stays enabled while a record is edited.
   */
  aboveGrid?: (actions: ScreenActions, state: MasterState) => ReactNode;
  /**
   * Controls inside the fields panel that are not boxes (frmKrutiMasterNew's AdminLockToolStrip,
   * a ToolStrip in SplitContainer1.Panel1). `x` scales a designer x position as the fields' are.
   */
  inPanel?: (actions: ScreenActions, state: MasterState, x: (v: number) => number) => ReactNode;
};

/**
 * A master form: frmMasterPage's layout (toolbar, search box, the fields above the grid) with
 * the behaviour of its forms. Screens supply their fields, grid columns and right-click items
 * through `spec`. A form whose menu item asks for a record first (ScreenSpec.openWith) shows
 * that list before the window itself.
 */
export function MasterScreen(props: { spec: ScreenSpec } & ScreenProps & MasterScreenExtras) {
  const { spec, initialIds } = props;
  const msg = useMessageBox();
  const asks = Boolean(spec.openWith) && !initialIds;
  const [scope, setScope] = useState<ListScope | null>(asks ? null : {});
  const [list, setList] = useState<PickList | undefined>(undefined);
  useEffect(() => {
    if (!asks || !spec.openWith) return;
    const query = `/master/${spec.screen}/lists/${encodeURIComponent(spec.openWith.list)}`;
    api
      .get<PickList>(query)
      .then(setList)
      .catch(async (err: unknown) => {
        await msg.alert(errorMessage(err));
        setScope({ ids: [0] });
      });
  }, []);
  if (scope === null) {
    return (
      <div className="h-full bg-alice-blue">
        <PickListDialog
          title={spec.openWith?.title ?? 'List'}
          list={list}
          selectFirst
          // Cancel: StrId "0", so the window opens on an empty grid (and New).
          onCancel={() => setScope({ ids: [0] })}
          onPick={(r) => {
            const params = spec.openWith!.toParams(r);
            setScope(params ? { params } : { ids: [0] });
          }}
        />
      </div>
    );
  }
  return <MasterWindow {...props} scope={scope} />;
}

function MasterWindow({
  spec,
  close,
  initialIds,
  initialNew,
  menu,
  gridOverride,
  aboveGrid,
  inPanel,
  scope,
}: { spec: ScreenSpec; scope: ListScope } & ScreenProps & MasterScreenExtras) {
  const state = useMasterScreen(
    spec,
    initialIds,
    spec.openWith && !initialIds ? scope : undefined,
    initialNew,
  );
  const msg = useMessageBox();
  const auth = useAuth();
  const [panelHeight, setPanelHeight] = useState(spec.panelHeight);
  const [secured, setSecured] = useState<Secured | null>(null);
  const [securityError, setSecurityError] = useState('');
  const [workReportOpen, setWorkReportOpen] = useState(false);
  /** The Select Column form, opened blank or straight onto a saved layout's report. */
  const [printing, setPrinting] = useState<{ layout: PrintLayout | null } | null>(null);
  /** Ctrl+F: the searchable columns, to pick "Search By" from. */
  const [searchByList, setSearchByList] = useState<PickList | null>(null);
  /** ScreenActions.pick: the list being shown and who waits for its answer. */
  const [picking, setPicking] = useState<{
    title: string;
    list: PickList | undefined;
    opts: PickOptions;
    resolve: (r: PickResult | null) => void;
  } | null>(null);
  const [workTypes, setWorkTypes] = useState<PickList | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const gridApi = useRef<GridApi<GridRow> | null>(null);

  /**
   * SendtoExcel takes the grid's own DataSource, so it follows whatever order the grid is
   * showing — including a sort the user made by clicking a column header.
   */
  function exportGrid() {
    const displayed: GridRow[] = [];
    gridApi.current?.forEachNodeAfterFilterAndSort((n) => {
      if (n.data) displayed.push(n.data);
    });
    sendToExcel(spec.screen, spec.columns, displayed.length > 0 ? displayed : state.visibleRows);
  }

  /** PrintSelectedColumn works on dg.SelectedRows, so there has to be one. */
  async function openPrint(layout: PrintLayout | null) {
    if (state.selectedIds.length === 0) {
      await msg.alert('Please select at least one record.');
      return;
    }
    setPrinting({ layout });
  }

  /** btnWorkReport_Click: with a row selected, outside of Add/Modify (see MasterToolbar). */
  const openWorkReport = () => {
    if (state.mode === 'edit' || state.visibleRows.length === 0 || state.currentId === null) return;
    setWorkReportOpen(true);
  };

  /** Delete(): confirm first, then the Security dialog. */
  async function askDelete() {
    if (spec.deleteFlow) {
      await spec.deleteFlow(actions, state);
      return;
    }
    const pk = state.meta?.primaryColumn ?? '';
    const row = state.rows.find((r) => Number(r[pk]) === state.currentId);
    const question = spec.deleteQuestion?.(row) ?? 'Are You Sure to Delete This Record?';
    if (await msg.confirm(question)) setSecured({ purpose: 'delete' });
  }

  /** btnExit_Click: while a record is being edited, confirm before closing. */
  async function exit() {
    // These forms never disable btnModify, so btnExit_Click closes at once.
    if (spec.editInPlace || spec.reportOnly || spec.fixedButtons) {
      close();
      return;
    }
    if (state.mode === 'edit' || !state.canModify) {
      if (!(await msg.confirm('Are you sure to close this form?', 'Record cannot be saved')))
        return;
      await state.cancel();
    }
    close();
  }

  /** Form_KeyDown: the form's Ctrl shortcuts. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || !root.current?.contains(document.activeElement)) return;
      // frmBookTranNew has no Form_KeyDown.
      if (spec.editInPlace) return;
      const key = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      // frmWorkReportM_KeyDown: only the history, Search By and Refresh.
      if (spec.reportOnly && !['z', 'y', 'f', 'r'].includes(key)) return;
      // A ShowHideButton form: the history, Search By, Refresh, locks and its Delete.
      if (spec.fixedButtons) {
        if (!['z', 'y', 'f', 'r', 'l', 'u', 'd'].includes(key)) return;
        if (key === 'd' && !(spec.fixedButtons.includes('delete') && state.currentId !== null))
          return;
        if (key === 'd') {
          run(() => void askDelete());
          return;
        }
      }
      const own = spec.ctrlKeys?.[key];
      if (own) {
        if (state.mode === 'normal') run(() => own(actions, state));
        return;
      }
      if (key === 'z') run(() => state.goHistory(state.historyIndex - 1));
      else if (key === 'y') run(() => state.goHistory(state.historyIndex + 1));
      else if (key === 'f')
        run(() =>
          setSearchByList({
            columns: ['Id', 'DisplayName'],
            rows: (state.meta?.searchColumns ?? []).map((c) => [c.id, c.displayName]),
          }),
        );
      else if (key === 'n' && state.mode === 'normal' && state.canNew) run(state.newRecord);
      else if (key === 'm' && state.canModify) run(() => void state.modify());
      else if (key === 's' && state.mode === 'edit') run(() => void state.save());
      else if (key === 'b' && state.mode === 'edit') run(() => void state.cancel());
      else if (key === 'd' && state.canDelete) run(() => void askDelete());
      else if (key === 'r' && state.mode === 'normal') run(state.refresh);
      else if (key === 'w') run(openWorkReport);
      else if ((key === 'l' || key === 'u') && spec.lockAction) {
        const lockAction = spec.lockAction;
        run(() => {
          void (async () => {
            const password = await actions.askPassword();
            if (password !== null)
              await actions.run(lockAction, { password, lock: key === 'l' }, state.selectedIds);
          })();
        });
      } else if (key === 'l' || key === 'u')
        run(() => setSecured({ purpose: 'lock', lock: key === 'l' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** A work type to pick after a modification (insertworkreports' WorkType loop). */
  useEffect(() => {
    if (!state.workReportPrompt || workTypes) return;
    void api
      .get<PickList>(`/master/${spec.screen}/work-report-types`)
      .then(setWorkTypes)
      .catch((err: unknown) => msg.alert(errorMessage(err)));
  }, [state.workReportPrompt]);

  const { call, run } = useActionRunner(spec.screen, {
    defaultIds: state.selectedIds,
    switches: state.switches,
    rows: {
      replaceRows: state.replaceRows,
      showRows: state.showRows,
      patchRows: state.patchRows,
    },
  });

  const printLayoutItems: ContextMenuItem[] = (state.meta?.printLayouts ?? []).map<ContextMenuItem>(
    (l) => ({
      kind: 'item',
      label: l.name,
      shortcut: l.shortcut.replace('|', '+'),
      onSelect: () => void openPrint(l),
    }),
  );

  const actions: ScreenActions = {
    selectedIds: state.selectedIds,
    currentId: state.currentId,
    currentRow: state.currentRow,
    gridIds: state.visibleIds,
    run,
    call,
    alert: msg.alert,
    confirm: msg.confirm,
    input: (prompt, initial) => msg.input(prompt, undefined, initial),
    yesNoCancel: msg.yesNoCancel,
    user: auth.status === 'authenticated' ? auth.user : null,
    tags: state.tags,
    refresh: state.refresh,
    switches: state.switches,
    setField: state.setField,
    showAll: state.showAll,
    printSelectedColumn: () => void openPrint(null),
    printLayouts: printLayoutItems,
    sendToExcel: exportGrid,
    askPassword: () =>
      new Promise<string | null>((resolve) => setSecured({ purpose: 'password', resolve })),
    pick: (list, opts = {}) =>
      new Promise<PickResult | null>((resolve) => {
        const title = opts.title ?? 'List';
        if (typeof list !== 'string') {
          setPicking({ title, list, opts, resolve });
          return;
        }
        setPicking({ title, list: undefined, opts, resolve });
        const query = new URLSearchParams(
          Object.entries(opts.params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString();
        api
          .get<PickList>(
            `/master/${spec.screen}/lists/${encodeURIComponent(list)}${query ? `?${query}` : ''}`,
          )
          .then((l) => setPicking((p) => (p && p.resolve === resolve ? { ...p, list: l } : p)))
          .catch(async (err: unknown) => {
            setPicking(null);
            resolve(null);
            await msg.alert(errorMessage(err));
          });
      }),
  };

  const menuItems: ContextMenuItem[] = menu
    ? menu(actions, state)
    : [
        {
          kind: 'submenu',
          label: 'Print Report',
          items: [
            { kind: 'item', label: 'Selected Column', onSelect: () => void openPrint(null) },
            { kind: 'item', label: 'Send To Excel', onSelect: exportGrid },
            ...printLayoutItems,
          ],
        },
        ...(spec.contextMenu?.(actions) ?? []),
      ];

  /**
   * ToolStripMenuItem.ShortcutKeys of the right-click menu's items (frmLabIssueMaster's F4 / F5,
   * frmBookTranNew's F6 / F7 / F8): the key runs the item while the grid the menu belongs to
   * has the focus (WinForms processes a ContextMenuStrip's shortcuts only for its own control),
   * which it cannot have while a record is being edited. Only function keys: the Ctrl ones are
   * `ScreenSpec.ctrlKeys`.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!/^F\d{1,2}$/.test(e.key) || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      const grid = document.activeElement?.closest('[role="grid"], [role="treegrid"]');
      if (!grid || !root.current?.contains(grid)) return;
      if (state.mode === 'edit' && !spec.editInPlace) return;
      const item = shortcutItem(menuItems, e.key);
      if (!item) return;
      e.preventDefault();
      item.onSelect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** FormFields' F2 on a popup box, for a LinkLabel that opens the popup itself. */
  const openTransRef = useRef<((key: string) => void) | null>(null);
  const formContext: FormContext = {
    fields: state.fields,
    tags: state.tags,
    strMode: state.strMode,
    tranKm: state.tranKm,
    mode: state.mode,
    setField: state.setField,
    setTag: state.setTag,
    loaded: state.loaded,
    alert: msg.alert,
    confirm: msg.confirm,
    cancel: state.cancelAndReload,
    continued: state.continued,
    run,
    call,
    loadTrans: state.loadTrans,
    openTrans: (key) => openTransRef.current?.(key),
    putTrans: (key, rows, opts) => {
      const field = spec.fields.find((f) => f.trans === key);
      if (field) state.saveTrans(key, field.name, rows, undefined, opts?.extras, opts);
    },
  };

  function onSplitterDown(e: React.PointerEvent) {
    const startY = e.clientY;
    const startHeight = panelHeight;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) =>
      setPanelHeight(
        Math.max(60, Math.min(startHeight + ev.clientY - startY, window.innerHeight - 200)),
      );
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  }

  /** ScreenSpec.initialNew.after: once, when the new record another screen asked for is up. */
  const initialNewDone = useRef(false);
  useEffect(() => {
    if (!state.initialNewReady || initialNewDone.current || !initialNew) return;
    initialNewDone.current = true;
    void spec.initialNew?.after?.(initialNew, formContext);
  }, [state.initialNewReady]);

  const override = gridOverride?.(actions, state) ?? null;

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-alice-blue">
      <MasterToolbar
        state={state}
        onDelete={() => void askDelete()}
        onWorkReport={openWorkReport}
        onExit={() => void exit()}
      />
      <SearchBar state={state} actions={actions} />
      {!spec.reportOnly && (
        <>
          <div style={{ height: panelHeight }} className="shrink-0 overflow-hidden">
            <FormFields
              state={state}
              ctx={formContext}
              openTransRef={openTransRef}
              panelExtra={inPanel ? (x) => inPanel(actions, state, x) : undefined}
            />
          </div>
          <div
            role="separator"
            aria-label="Resize"
            onPointerDown={onSplitterDown}
            className="h-1 shrink-0 cursor-row-resize bg-control"
          />
        </>
      )}
      {aboveGrid?.(actions, state)}
      {/* EnableDisableDataEditing: the grid is disabled while a record is being edited. */}
      <div
        className="min-h-0 flex-1"
        aria-disabled={(state.mode === 'edit' && !spec.editInPlace) || undefined}
        {...(state.mode === 'edit' && !spec.editInPlace ? { inert: true } : {})}
      >
        {override ?? <MasterGrid state={state} menuItems={menuItems} apiRef={gridApi} />}
      </div>

      {workReportOpen && state.currentId !== null && (
        <WorkReportDialog
          screen={spec.screen}
          recordId={state.currentId}
          onClose={() => setWorkReportOpen(false)}
        />
      )}

      {printing && (
        <PrintSelectedColumnDialog
          screen={spec.screen}
          columns={state.meta?.printColumns ?? []}
          savedLayouts={state.meta?.savedPrintLayouts ?? []}
          ids={state.selectedIds}
          initialLayout={printing.layout}
          onSaved={state.reloadMeta}
          onClose={() => setPrinting(null)}
        />
      )}

      {searchByList && (
        <PickListDialog
          title="Search By"
          list={searchByList}
          selectFirst
          addBlankRow={false}
          onCancel={() => setSearchByList(null)}
          onPick={(r) => {
            setSearchByList(null);
            if (r.code[0]) state.setSearchBy(r.code[0]);
            root.current?.querySelector<HTMLInputElement>('input[aria-label="Search"]')?.focus();
          }}
        />
      )}

      {picking && (
        <PickListDialog
          title={picking.title}
          list={picking.list}
          selectFirst={picking.opts.selectFirst ?? true}
          addBlankRow={picking.opts.addBlankRow ?? false}
          onCancel={() => {
            setPicking(null);
            picking.resolve(null);
          }}
          onPick={(r) => {
            setPicking(null);
            picking.resolve(r);
          }}
        />
      )}

      {state.workReportPrompt && (
        <PickListDialog
          title="Work Type"
          list={workTypes}
          selectFirst
          addBlankRow={false}
          initialText={state.workReportPrompt.defaultType}
          onCancel={() => void msg.alert('Please Select WorkType')}
          onPick={(r) => {
            const id = Number(r.code[0]);
            if (id > 0) void state.logWorkReport(id);
            else void msg.alert('Please Select WorkType');
          }}
        />
      )}

      {secured && (
        <SecurityDialog
          busy={state.busy}
          error={securityError}
          onCancel={() => {
            if (secured.purpose === 'password') secured.resolve(null);
            setSecured(null);
            setSecurityError('');
          }}
          onOk={async (password) => {
            let ok: boolean | undefined;
            if (secured.purpose === 'password') {
              secured.resolve(password);
              ok = true;
            } else if (secured.purpose === 'delete') ok = await state.remove(password);
            else if (secured.purpose === 'lock') ok = await state.setLocked(secured.lock, password);
            if (ok) {
              setSecured(null);
              setSecurityError('');
            }
          }}
        />
      )}
    </div>
  );
}

/** The enabled menu item, at any depth, whose ShortcutKeys is `key`. */
function shortcutItem(
  items: ContextMenuItem[],
  key: string,
): Extract<ContextMenuItem, { kind: 'item' }> | null {
  for (const item of items) {
    if (item.kind === 'item' && item.shortcut === key && !item.disabled) return item;
    if (item.kind === 'submenu') {
      const found = shortcutItem(item.items, key);
      if (found) return found;
    }
  }
  return null;
}
