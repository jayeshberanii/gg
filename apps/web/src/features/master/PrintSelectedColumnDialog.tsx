'use client';

import {
  type GridValue,
  matchesFilter,
  parseSearch,
  type PrintColumnOption,
  type PrintCondition,
  type PrintLayout,
  type PrintResult,
} from '@gglib/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Button, Modal, ToolSeparator } from '@/components/ui/Modal';
import { api, errorMessage } from '@/lib/api';
import { fontCss, usePreferences } from '@/lib/preferences';

const SHORTCUT_MODIFIERS = ['', 'Ctrl', 'Alt', 'Shift'] as const;
const SHORTCUT_DIGITS = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
/** The desktop's ditto mark for a repeated value (RemoveDuplicateForSelectedColumn). */
const DITTO = '"';

type Mode = 'picker' | 'grid';
type Cell = { row: number; col: number };

type Props = {
  screen: string;
  /** Every printable column, in PrintSeq order — the `chk` CheckedListBox's items. */
  columns: PrintColumnOption[];
  /** Config_Master layouts for this screen — `cmbDispConfig`. */
  savedLayouts: PrintLayout[];
  /** The grid's selected records (`dg.SelectedRows`). */
  ids: number[];
  /**
   * Print Report › <layout name>: `PrintSelectedColumn` was given a ConfigStr, so it skips the
   * picker, runs the report and opens straight on the grid with the config panels hidden.
   */
  initialLayout?: PrintLayout | null;
  /** After Save Config / Delete Config, so the screen's layout lists pick the change up. */
  onSaved: () => Promise<void>;
  onClose: () => void;
};

/**
 * `FormPrintWithSelectedColumn` (CommonLibrary.dll), the form behind "Print Report › Selected
 * Column". One window with two faces, as on the desktop:
 *
 * - the picker: `chk`, a multi-column CheckedListBox of every printable column, mirrored into
 *   `dgConfig` (SrNo / Name) which fixes the print order and is reordered with Move Up / Move
 *   Down; `cmbDispConfig` loads a saved Config_Master layout, Save Config / Delete Config
 *   write and drop them, and an optional Ctrl/Alt/Shift + digit shortcut puts a layout in the
 *   grid's own Print Report menu. "Config Condition" and "Config Remark" are saved with it.
 * - the grid (`pnlGrid` / `dgForExcel`): "Display In Grid" runs the report and shows it here,
 *   with the toolbar's search box (`txtSearch`) filtering it and `cngGrid`'s right-click tools
 *   reshaping it. "Back" returns to the picker; CLOSE closes the form.
 *
 * Not ported from `cngGrid` / `ToolStrip1`: Group By, Copy Data, Macros, Record Macro, Create
 * Table and Store Grid.
 */
export function PrintSelectedColumnDialog({
  screen,
  columns,
  savedLayouts,
  ids,
  initialLayout = null,
  onSaved,
  onClose,
}: Props) {
  const msg = useMessageBox();
  const { gridFont, search } = usePreferences();

  // Picker state. Opened from a saved layout's own menu item, the dialog starts on the grid
  // with that layout already loaded, so "Back" lands on the picker showing its columns.
  const [mode, setMode] = useState<Mode>(initialLayout ? 'grid' : 'picker');
  const [checked, setChecked] = useState<number[]>(initialLayout?.columnIndices ?? []);
  const [orderSel, setOrderSel] = useState<number | null>(null);
  const [layoutId, setLayoutId] = useState<number | null>(initialLayout?.id ?? null);
  const [remark, setRemark] = useState(initialLayout?.remark ?? '');
  const [condition, setCondition] = useState<PrintCondition[]>(initialLayout?.condition ?? []);
  const [shortcutMod, setShortcutMod] = useState(initialLayout?.shortcut.split('|')[0] ?? '');
  const [shortcutDigit, setShortcutDigit] = useState(initialLayout?.shortcut.split('|')[1] ?? '');
  const [namingConfig, setNamingConfig] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The config panels are hidden while a layout's own menu item drives the form. */
  const [configPanels, setConfigPanels] = useState(initialLayout === null);

  // Grid state. `cols`/`rows` are the working copy the right-click tools reshape (dtGrid).
  const [title, setTitle] = useState('');
  const [cols, setCols] = useState<string[]>([]);
  const [rows, setRows] = useState<GridValue[][]>([]);
  const [text, setText] = useState('');
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [focus, setFocus] = useState<Cell | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [sortBy, setSortBy] = useState<string[]>([]);
  const [sortPick, setSortPick] = useState('');
  const ran = useRef(false);

  const nameOf = (index: number) => columns.find((c) => c.index === index)?.name ?? '';

  /** clsCommon.PrintSelectedColumn's second query: the chosen columns for the chosen records. */
  async function run(req: { layoutId: number } | { columnIndices: number[] }) {
    setBusy(true);
    try {
      const result = await api.post<PrintResult>(`/master/${screen}/print`, { ids, ...req });
      setTitle(result.title);
      setCols(result.columns);
      setRows(result.rows);
      setAnchor(null);
      setFocus(null);
      setText('');
      setSortBy([]);
      setMode('grid');
    } catch (err) {
      await msg.alert(errorMessage(err));
      if (mode === 'grid' && cols.length === 0) onClose();
    } finally {
      setBusy(false);
    }
  }

  // Opened from a layout's menu item: run that layout's report once, as the form opens.
  useEffect(() => {
    if (!initialLayout || ran.current) return;
    ran.current = true;
    void run({ layoutId: initialLayout.id });
  }, [initialLayout]);

  // ---- picker ------------------------------------------------------------------------

  /** chk_ItemCheck → FillConfigGrid: dgConfig keeps its order, new picks go on the end. */
  function toggle(index: number) {
    setChecked((c) => (c.includes(index) ? c.filter((i) => i !== index) : [...c, index]));
    setOrderSel(null);
  }

  /** MoveUpDown: swaps the selected dgConfig row with its neighbour. */
  function move(delta: number) {
    if (orderSel === null) return;
    const to = orderSel + delta;
    if (to < 0 || to >= checked.length) return;
    setChecked((c) => {
      const next = [...c];
      [next[orderSel], next[to]] = [next[to]!, next[orderSel]!];
      return next;
    });
    setOrderSel(to);
  }

  /** cmbDispConfig_SelectedIndexChanged; the blank first entry only clears the ticks (Refresh1). */
  function loadLayout(idText: string) {
    setOrderSel(null);
    if (idText === '') {
      setLayoutId(null);
      setChecked([]);
      return;
    }
    const layout = savedLayouts.find((l) => l.id === Number(idText));
    if (!layout) return;
    setLayoutId(layout.id);
    setChecked(layout.columnIndices);
    setRemark(layout.remark);
    if (layout.condition.length > 0) setCondition(layout.condition);
    const [mod = '', digit = ''] = layout.shortcut.split('|');
    setShortcutMod(mod);
    setShortcutDigit(digit);
  }

  async function saveConfig(name: string) {
    setNamingConfig(false);
    if (name.trim() === '') return; // SaveConfig: an empty InputBox answer cancels the save.
    setBusy(true);
    try {
      const saved = await api.post<PrintLayout>(`/master/${screen}/print-layouts`, {
        configId: layoutId ?? undefined,
        name: name.trim(),
        columnIndices: checked,
        remark: remark.trim() || undefined,
        shortcut: shortcutMod && shortcutDigit ? `${shortcutMod}|${shortcutDigit}` : undefined,
        condition: condition.length > 0 ? condition : undefined,
      });
      setLayoutId(saved.id);
      await onSaved();
      await msg.alert('Configuration Saved Successfully');
    } catch (err) {
      await msg.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** tsBtnDeleteConfig_Click. The desktop deletes without asking; this confirms first. */
  async function deleteConfig() {
    if (layoutId === null) return;
    if (!(await msg.confirm('Are You Sure to Delete This Configuration?'))) return;
    setBusy(true);
    try {
      await api.del(`/master/${screen}/print-layouts/${layoutId}`);
      setLayoutId(null);
      setChecked([]);
      setRemark('');
      setShortcutMod('');
      setShortcutDigit('');
      setOrderSel(null);
      await onSaved();
    } catch (err) {
      await msg.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** tsbtnDisplayGrid_Click: to the grid with the picked columns, or back to the picker. */
  function toggleGrid() {
    if (mode === 'picker') {
      if (checked.length === 0) {
        void msg.alert('Please select at least one column.');
        return;
      }
      void run({ columnIndices: checked });
    } else {
      setConfigPanels(true);
      setMode('picker');
    }
  }

  // ---- grid --------------------------------------------------------------------------

  /** txtSearch_TextChanged: the desktop's own search syntax over every displayed column. */
  const visible = useMemo(() => {
    if (text.trim() === '') return rows;
    const targets = cols.map((_, i) => ({ column: String(i), dataType: 'String' }));
    const parsed = parseSearch(text, targets, true, search);
    if (!parsed.ok) return rows;
    return rows.filter((row) =>
      matchesFilter(Object.fromEntries(row.map((v, i) => [String(i), v])), parsed.filter),
    );
  }, [rows, text, cols, search]);

  const range = useMemo(() => {
    if (!anchor || !focus) return null;
    return {
      r0: Math.min(anchor.row, focus.row),
      r1: Math.max(anchor.row, focus.row),
      c0: Math.min(anchor.col, focus.col),
      c1: Math.max(anchor.col, focus.col),
    };
  }, [anchor, focus]);

  function selectCell(e: React.MouseEvent, row: number, col: number) {
    if (e.shiftKey && anchor) setFocus({ row, col });
    else {
      setAnchor({ row, col });
      setFocus({ row, col });
    }
  }

  /** DeleteSelectedRowFromGrid, on the rows the search box currently leaves visible. */
  function removeRows() {
    if (!range) return;
    const drop = new Set(visible.slice(range.r0, range.r1 + 1));
    setRows((r) => r.filter((row) => !drop.has(row)));
    setAnchor(null);
    setFocus(null);
  }

  /** DeleteSelectedColumnFromGrid. */
  function removeColumns() {
    if (!range) return;
    const keep = (_: unknown, i: number) => i < range.c0 || i > range.c1;
    setCols((c) => c.filter(keep));
    setRows((r) => r.map((row) => row.filter(keep)));
    setAnchor(null);
    setFocus(null);
  }

  /** MoveGridColumn: the selected column swaps with its neighbour. */
  function moveColumn(delta: number) {
    if (!range) return;
    const from = range.c0;
    const to = from + delta;
    if (to < 0 || to >= cols.length) return;
    const swap = <T,>(a: T[]) => {
      const next = [...a];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    };
    setCols(swap);
    setRows((r) => r.map(swap));
    setAnchor({ row: range.r0, col: to });
    setFocus({ row: range.r1, col: to });
  }

  /**
   * RemoveDuplicateForSelectedColumnToolStripMenuItem: in each selected column, a value equal
   * to the one above it becomes a ditto mark.
   */
  function removeDuplicates() {
    if (!range) return;
    const shown = new Set(visible);
    setRows((r) => {
      const next = r.map((row) => (shown.has(row) ? [...row] : row));
      for (let c = range.c0; c <= range.c1; c++) {
        let previous = '';
        for (let i = 0; i < r.length; i++) {
          if (!shown.has(r[i]!)) continue;
          const row = next[i]!;
          const cell = row[c];
          if (cell === null || cell === undefined) continue;
          const value = String(cell);
          if (value === previous) row[c] = DITTO;
          else previous = value;
        }
      }
      return next;
    });
  }

  /**
   * Sort(): reorders by the columns listed in `dgSort`. The desktop's own row filter here is
   * broken (a boolean is stringified into the DataTable filter, which drops every row unless
   * the first row's second cell is non-empty), so this just sorts and keeps all the rows.
   */
  function applySort() {
    setSorting(false);
    if (sortBy.length === 0) return;
    const indexes = sortBy.map((name) => cols.indexOf(name)).filter((i) => i >= 0);
    setRows((r) =>
      [...r].sort((a, b) => {
        for (const i of indexes) {
          const x = a[i];
          const y = b[i];
          if (typeof x === 'number' && typeof y === 'number') {
            if (x !== y) return x - y;
            continue;
          }
          const c = String(x ?? '').localeCompare(String(y ?? ''));
          if (c !== 0) return c;
        }
        return 0;
      }),
    );
  }

  /** SendToExcelToolStripMenuItem_Click, over the grid as it now stands. */
  function sendGridToExcel() {
    const csvCell = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols, ...visible].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || screen}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const gridMenu: ContextMenuItem[] = [
    { kind: 'item', label: 'Send To Excel', onSelect: sendGridToExcel },
    { kind: 'item', label: 'Remove Selected Row', disabled: !range, onSelect: removeRows },
    { kind: 'item', label: 'Remove Selected Column', disabled: !range, onSelect: removeColumns },
    { kind: 'item', label: 'Sort Record', onSelect: () => setSorting(true) },
    {
      kind: 'item',
      label: 'Remove Duplicate for Selected Column',
      disabled: !range,
      onSelect: removeDuplicates,
    },
    {
      kind: 'item',
      label: 'Move Selected Column ToLeft',
      disabled: !range || range.c0 === 0,
      onSelect: () => moveColumn(-1),
    },
    {
      kind: 'item',
      label: 'Move Selected Column To Right',
      disabled: !range || range.c1 >= cols.length - 1,
      onSelect: () => moveColumn(1),
    },
  ];

  // ---- render ------------------------------------------------------------------------

  const cellStyle = fontCss(gridFont);
  const unsorted = cols.filter((c) => !sortBy.includes(c));

  return (
    <Modal title="Select Column" onClose={onClose} width={1012} className="bg-thistle">
      <div className="flex h-[min(568px,84vh)] flex-col">
        <div role="toolbar" aria-label="Select Column" className="win-toolstrip shrink-0">
          <select
            aria-label="Saved Layout"
            value={layoutId ?? ''}
            onChange={(e) => loadLayout(e.target.value)}
            className="win-toolstrip-field w-[121px]"
          >
            <option value="" />
            {savedLayouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <ToolSeparator />
          <button
            type="button"
            className="win-toolstrip-text"
            disabled={busy || checked.length === 0}
            onClick={() => setNamingConfig(true)}
          >
            Save Config
          </button>
          <ToolSeparator />
          <button
            type="button"
            className="win-toolstrip-text"
            disabled={busy || layoutId === null}
            onClick={() => void deleteConfig()}
          >
            Delete Config
          </button>
          {mode === 'grid' && (
            <>
              <ToolSeparator />
              <input
                aria-label="Search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="win-toolstrip-field w-[150px]"
              />
            </>
          )}
          <ToolSeparator />
          <button type="button" className="win-toolstrip-text" disabled={busy} onClick={toggleGrid}>
            {mode === 'picker' ? 'Display In Grid' : 'Back'}
          </button>
          <ToolSeparator />
          <span className="win-toolstrip-text">Shortcut</span>
          <select
            aria-label="Shortcut modifier"
            value={shortcutMod}
            onChange={(e) => setShortcutMod(e.target.value)}
            className="win-toolstrip-field w-[75px]"
          >
            {SHORTCUT_MODIFIERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="Shortcut digit"
            value={shortcutDigit}
            onChange={(e) => setShortcutDigit(e.target.value)}
            className="win-toolstrip-field w-[75px]"
          >
            {SHORTCUT_DIGITS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {mode === 'picker' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 gap-1 p-1">
              {/* chk: a MultiColumn CheckedListBox — items run down a column, then wrap. */}
              <div
                role="group"
                aria-label="Columns"
                className="min-w-0 flex-1 overflow-auto border border-control-dark bg-white p-1"
                style={{ columnWidth: 180, columnGap: 8 }}
              >
                {columns.map((c) => (
                  <label
                    key={c.index}
                    className="flex cursor-default items-center gap-1.5 px-1 py-px text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked.includes(c.index)}
                      onChange={() => toggle(c.index)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>

              {configPanels && (
                <div className="flex w-[274px] shrink-0 flex-col gap-1">
                  {/* dgConfig: the print order, SrNo + Name. */}
                  <div className="h-[284px] overflow-auto border border-control-dark bg-info">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0">
                        <tr>
                          <th
                            scope="col"
                            className="w-10 border border-control-dark bg-light-steel-blue px-1 text-left font-normal"
                          >
                            SrNo
                          </th>
                          <th
                            scope="col"
                            className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal"
                          >
                            Name
                          </th>
                        </tr>
                      </thead>
                      <tbody role="listbox" aria-label="Print Order">
                        {checked.map((index, pos) => (
                          <tr
                            key={index}
                            role="option"
                            aria-selected={orderSel === pos}
                            onMouseDown={() => setOrderSel(pos)}
                            className={`cursor-default ${orderSel === pos ? 'bg-selection text-white' : ''}`}
                          >
                            <td className="border border-[#d4d0c8] px-1">{pos + 1}</td>
                            <td
                              className="border border-[#d4d0c8] px-1 font-bold"
                              style={{
                                fontFamily: 'Arial, sans-serif',
                                fontSize: 12,
                                color: orderSel === pos ? '#fff' : 'violet',
                              }}
                            >
                              {nameOf(index)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between">
                    <Button
                      className="w-[108px]"
                      disabled={orderSel === null || orderSel <= 0}
                      onClick={() => move(-1)}
                    >
                      Move Up
                    </Button>
                    <Button
                      className="w-[108px]"
                      disabled={orderSel === null || orderSel >= checked.length - 1}
                      onClick={() => move(1)}
                    >
                      Move Down
                    </Button>
                  </div>

                  {/* pnlCondition: prefilled only for the desktop's Prakashan and Vishay forms. */}
                  <div className="flex h-[152px] flex-col border border-control-dark bg-thistle">
                    <div className="win-toolstrip shrink-0">
                      <span className="win-toolstrip-caption">Config Condition</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto bg-white">
                      <table className="w-full border-collapse text-xs">
                        <thead className="sticky top-0">
                          <tr>
                            <th
                              scope="col"
                              className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal"
                            >
                              Column
                            </th>
                            <th
                              scope="col"
                              className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal"
                            >
                              Condition
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {condition.map((c, i) => (
                            <tr key={c.column}>
                              <td className="border border-[#d4d0c8] px-1">{c.column}</td>
                              <td className="border border-[#d4d0c8] p-0">
                                <select
                                  aria-label={`Condition for ${c.column}`}
                                  value={c.value}
                                  onChange={(e) =>
                                    setCondition((rowsIn) =>
                                      rowsIn.map((r, j) =>
                                        i === j ? { ...r, value: e.target.value } : r,
                                      ),
                                    )
                                  }
                                  className="w-full bg-white text-xs"
                                >
                                  {['', 'Short', 'Long', 'Left'].map((v) => (
                                    <option key={v} value={v}>
                                      {v}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {configPanels && (
              <div className="mx-1 mb-1 flex h-[70px] shrink-0 flex-col border border-control-dark bg-thistle">
                <div className="win-toolstrip shrink-0">
                  <span className="win-toolstrip-caption">Config Remark</span>
                </div>
                <textarea
                  aria-label="Config Remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  className="min-h-0 flex-1 resize-none border-0 bg-white px-1 text-xs"
                />
              </div>
            )}
          </div>
        ) : (
          /* pnlGrid: the report, plus its CLOSE strip. */
          <div className="relative m-1 flex min-h-0 flex-1 flex-col border border-black bg-black">
            <div role="toolbar" aria-label="Report" className="win-toolstrip shrink-0">
              <button type="button" className="win-toolstrip-text" onClick={onClose}>
                CLOSE
              </button>
            </div>
            <div
              id="print-area"
              className="min-h-0 flex-1 overflow-auto bg-white"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuAt({ x: e.clientX, y: e.clientY });
              }}
            >
              <table className="w-full border-collapse" style={cellStyle}>
                <caption className="hidden print:block print:py-2 print:text-left print:font-bold">
                  {title}
                </caption>
                <thead className="sticky top-0">
                  <tr>
                    {cols.map((c, i) => (
                      <th
                        key={`${c}-${i}`}
                        scope="col"
                        className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal text-dark-red"
                        style={{ fontFamily: 'Arial, sans-serif', fontSize: '10.7px' }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => {
                        const on =
                          range !== null &&
                          r >= range.r0 &&
                          r <= range.r1 &&
                          c >= range.c0 &&
                          c <= range.c1;
                        return (
                          <td
                            key={c}
                            onMouseDown={(e) => selectCell(e, r, c)}
                            className={`cursor-default border border-[#d4d0c8] px-1 whitespace-pre ${on ? 'bg-selection text-white' : ''}`}
                          >
                            {cell === null ? '' : String(cell)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* pnlSort: "Order By" plus dgSort, applied on Close. */}
            {sorting && (
              <div className="absolute left-1/2 top-1/3 w-[317px] -translate-x-1/2 border border-control-dark bg-thistle">
                <div role="toolbar" aria-label="Sort" className="win-toolstrip">
                  <button type="button" className="win-toolstrip-text" onClick={applySort}>
                    Close
                  </button>
                </div>
                <div className="flex items-center gap-1 p-1 text-xs">
                  <span>Order By</span>
                  <select
                    aria-label="Order By"
                    value={sortPick}
                    onChange={(e) => {
                      if (e.target.value === '') return;
                      setSortBy((s) => [...s, e.target.value]);
                      setSortPick('');
                    }}
                    className="win-toolstrip-field flex-1"
                  >
                    <option value="" />
                    {unsorted.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="w-16 border border-control-dark bg-light-steel-blue px-1 text-left"
                      >
                        Order No
                      </th>
                      <th
                        scope="col"
                        className="border border-control-dark bg-light-steel-blue px-1 text-left"
                      >
                        Column
                      </th>
                      <th
                        scope="col"
                        className="w-16 border border-control-dark bg-light-steel-blue px-1 text-left"
                      >
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortBy.map((c, i) => (
                      <tr key={c} className="bg-white">
                        <td className="border border-[#d4d0c8] px-1">{i + 1}</td>
                        <td className="border border-[#d4d0c8] px-1">{c}</td>
                        <td className="border border-[#d4d0c8] px-1">
                          <button
                            type="button"
                            aria-label={`Delete ${c}`}
                            onClick={() => setSortBy((s) => s.filter((x) => x !== c))}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {menuAt && (
              <ContextMenu
                items={gridMenu}
                at={menuAt}
                label="Report"
                onClose={() => setMenuAt(null)}
              />
            )}
          </div>
        )}
      </div>

      {namingConfig && (
        <InputBox
          prompt="Please Enter Configuration Name"
          defaultValue={savedLayouts.find((l) => l.id === layoutId)?.name ?? ''}
          onOk={(name) => void saveConfig(name)}
          onCancel={() => setNamingConfig(false)}
        />
      )}
    </Modal>
  );
}
