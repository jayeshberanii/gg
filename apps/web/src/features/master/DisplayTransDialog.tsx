'use client';

import type { ChildRow, GridValue, PickList, TransTable } from '@gglib/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BigTextBox } from '@/components/ui/BigTextBox';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { PickListDialog, type PickResult } from '@/components/ui/PickListDialog';
import { api, errorMessage } from '@/lib/api';
import { fontCss, ptToPx, usePreferences } from '@/lib/preferences';
import { sendTableToExcel } from './sendToExcel';
import { netString } from './transSummary';
import type { TransHelpers, TransLookup, TransSpec } from './types';
import { VishayEntryDialog } from './VishayEntryDialog';

/** New rows' temporary keys (the desktop draws a random -500..-1; these never collide). */
let nextTempId = -1;
export const newTempId = () => nextTempId--;

/** Copy Grid / Copy Cell keep what they copied per user (TempGrid<user> / TempCell<user>). */
let gridClipboard: GridValue[][] = [];
let cellClipboard: { column: number; value: GridValue } | null = null;

type Cell = { row: number; col: number };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * frmDisplayTransNew: a maximized grid of one popup's rows with its ToolStrip (New, Save,
 * Delete, Move Up, Move Down, Exit). Cells are read-only unless the popup unlocks them; F2 —
 * or typing a letter or digit — on a cell with a list opens that list (frmList1) and fills the
 * row from the pick. Enter on the last row adds a row, F4/F5 move it, F6 adds one, Delete
 * removes it, F7/F8 find, Alt+S saves, Esc asks to exit. Save hands the rows back to the form,
 * which keeps them until the record itself is saved.
 */
export function DisplayTransDialog({
  screen,
  spec,
  table,
  extra,
  extras,
  defaults = {},
  viewOnly = false,
  tranType,
  onSave,
  onClose,
}: {
  screen: string;
  /** frm.TranType: a value of the form's that the cell lists depend on, sent with every lookup. */
  tranType?: string;
  spec: TransSpec;
  table: TransTable;
  extra?: TransTable;
  /** Every extra table of the popup's DataSet (`extra` is the first). */
  extras?: TransTable[];
  defaults?: Record<string, GridValue>;
  /** Opened from a ReadOnly box: frmDisplayTransNew(False, False, False, False), no edit buttons. */
  viewOnly?: boolean;
  onSave: (
    rows: ChildRow[],
    extra?: TransTable,
    extras?: TransTable[],
    info?: { pariCount: number },
  ) => void;
  onClose: () => void;
}) {
  const msg = useMessageBox();
  const { gridFont } = usePreferences();
  const columns = table.columns;
  const isHidden = (name: string) => spec.hidden.some((h) => eq(h, name));
  const visible = useMemo(() => columns.filter((c) => !isHidden(c.name)), [columns]);
  const isEditable = (name: string) => eq(name, 'remark') || spec.editable.some((e) => eq(e, name));
  const isBit = (name: string) => columns.find((c) => c.name === name)?.type === 'bit';
  const seqColumn = columns.find((c) => eq(c.name, 'seq'))?.name;

  const [rows, setRows] = useState<ChildRow[]>(() => {
    const start = table.rows.map((r) => ({ ...r }));
    // SetForm_<X>(…, 2): a popup never opens empty, unless it says so.
    return start.length === 0 && !spec.openEmpty ? [makeRow(start, 1)] : start;
  });
  /** The DataSet's other tables (dsDisp), as the nested popups leave them. */
  const extraTables = extras ?? (extra ? [extra] : []);
  const [extrasRows, setExtrasRows] = useState<ChildRow[][]>(() =>
    extraTables.map((t) => t.rows.map((r) => ({ ...r }))),
  );
  const extraRows = extrasRows[0] ?? [];
  const setExtraRows = (f: (xs: ChildRow[]) => ChildRow[]) =>
    setExtrasRows((all) => all.map((xs, i) => (i === 0 ? f(xs) : xs)));
  const setExtraTable = (index: number, f: (xs: ChildRow[]) => ChildRow[]) =>
    setExtrasRows((all) => all.map((xs, i) => (i === index ? f(xs) : xs)));
  /** A child popup (TransSpec.children) or frmVishayEntry (TransSpec.vishayEntry) over a row. */
  const [child, setChild] = useState<{ row: number; column: string } | null>(null);
  const [vishay, setVishay] = useState<{ row: number; column: string } | null>(null);
  const [cur, setCur] = useState<Cell>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<{ value: string; caretEnd: boolean } | null>(null);
  const [picking, setPicking] = useState<{
    row: number;
    column: string;
    lookup: TransLookup;
    list: PickList | undefined;
    initialText: string;
    typed: string;
  } | null>(null);
  const [nested, setNested] = useState<{ row: number } | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [finding, setFinding] = useState(false);
  /** F3 (clsCommon.DataGridView_KeyDown): the current cell in frmBixtextbox. */
  const [bigText, setBigText] = useState<{ value: string; canSave: boolean } | null>(null);
  /** A cell that asks with an InputBox (TransLookup.input). */
  const [asking, setAsking] = useState<{ row: number; column: string; lookup: TransLookup } | null>(
    null,
  );
  const [find, setFind] = useState<{ text: string; row: number } | null>(null);
  const [cutRows, setCutRows] = useState<ChildRow[]>([]);
  const listCache = useRef(new Map<string, PickList>());
  /** frm.PariCount: set by "Update Pariman Count", read by the form after Save. */
  const [pariCount, setPariCount] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(1028);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridWidth(el.clientWidth));
    ro.observe(el);
    setGridWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  /** SetGridColumnWidth: narrow grids spread their columns over the width (less 120px). */
  const widths = useMemo(() => {
    const own = (name: string) => Object.entries(spec.widths ?? {}).find(([k]) => eq(k, name))?.[1];
    const spread = visible.filter((c) => !eq(c.name, 'seq'));
    const total = spread.reduce((sum, c) => sum + (own(c.name) ?? 100), 0);
    const each =
      total < gridWidth && spread.length > 0 ? Math.floor((gridWidth - 120) / spread.length) : null;
    return visible.map((c) => {
      if (each !== null && !eq(c.name, 'seq')) return each;
      return own(c.name) ?? 100;
    });
  }, [visible, gridWidth]);

  function makeRow(current: ChildRow[], seq: number): ChildRow {
    const row: ChildRow = {};
    if (spec.template) {
      const values = spec.template({ rows: current, seq, defaults });
      columns.forEach((c, i) => {
        const v = values[i] ?? null;
        row[c.name] = c.type === 'bit' ? v === true || v === 1 : v;
      });
    } else {
      for (const c of columns) row[c.name] = null;
      if (spec.tempKey) row[spec.tempKey] = newTempId();
      if (seqColumn) row[seqColumn] = seq;
    }
    return row;
  }

  const colIndex = (name: string | number) =>
    typeof name === 'number'
      ? Math.max(
          0,
          visible.findIndex((c) => c.name === columns[name]?.name),
        )
      : Math.max(
          0,
          visible.findIndex((c) => eq(c.name, name)),
        );

  const columnAt = (i: number) => visible[i]?.name ?? '';
  /** DataRow("name"): a spec's column name, as the table spells it. */
  const named = (name: string) => columns.find((c) => eq(c.name, name))?.name ?? name;

  function setCell(rowIndex: number, patch: ChildRow) {
    setRows((rs) => rs.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)));
  }

  const renumber = (rs: ChildRow[]) =>
    seqColumn ? rs.map((r, i) => ({ ...r, [seqColumn]: i + 1 })) : rs;

  /** SearchCondition("", 1): add a row and move to its first cell. */
  function addRow() {
    if (spec.newRowDisabled || viewOnly) return;
    setRows((rs) => {
      const next = [...rs, makeRow(rs, rs.length + 1)];
      setCur({ row: next.length - 1, col: colIndex(spec.firstColumn) });
      return next;
    });
  }

  function deleteRow() {
    if (rows.length === 0) return;
    setRows((rs) => {
      const next = rs.filter((_, i) => i !== cur.row);
      return spec.common ? next : renumber(next);
    });
    setCur((c) => ({ ...c, row: Math.max(0, Math.min(c.row, rows.length - 2)) }));
  }

  function move(up: boolean) {
    const to = up ? cur.row - 1 : cur.row + 1;
    if (to < 0 || to >= rows.length) return;
    setRows((rs) => {
      const next = [...rs];
      [next[cur.row], next[to]] = [next[to]!, next[cur.row]!];
      return renumber(next);
    });
    setCur((c) => ({ ...c, row: to }));
  }

  async function save() {
    if (viewOnly) return;
    // TsBtnSave renumbers seq, unless the popup numbers its rows itself (TransSpec.beforeSave).
    let out = spec.beforeSave ? rows : renumber(rows);
    if (spec.beforeSave) {
      const checked = await spec.beforeSave(out, helpers);
      if (typeof checked === 'string') {
        await msg.alert(checked);
        gridRef.current?.focus();
        return;
      }
      out = checked;
    }
    const tables = extraTables.map((t, i) => ({ columns: t.columns, rows: extrasRows[i] ?? [] }));
    onSave(out, tables[0], tables.length > 0 ? tables : undefined, { pariCount });
  }

  async function exit() {
    if (await msg.confirm('Are You Sure to Exit?')) onClose();
  }

  const helpers: TransHelpers = {
    lookup: (name, row) =>
      api.post<PickList>(`/master/${screen}/trans/${spec.column}/lookup/${name}`, {
        row: tranType === undefined ? row : { ...row, TranType: tranType },
      }),
  };

  /** SearchCondition(txt, 0) on the current cell. */
  async function openLookup(rowIndex: number, column: string, typed: string) {
    if (spec.nested && eq(spec.nested.column, column)) {
      setNested({ row: rowIndex });
      return;
    }
    const childSpec = spec.children?.[column.toLowerCase()];
    if (childSpec) {
      setChild({ row: rowIndex, column: column.toLowerCase() });
      return;
    }
    const entry = spec.vishayEntry?.[column.toLowerCase()];
    if (entry) {
      const key = rows[rowIndex]?.[entry.parentKey];
      if (entry.unsavedMessage && (Number(key) || 0) === 0) {
        await msg.alert(entry.unsavedMessage);
        return;
      }
      setVishay({ row: rowIndex, column: column.toLowerCase() });
      return;
    }
    const lookup = spec.lookups[column.toLowerCase()];
    if (lookup?.input) {
      setAsking({ row: rowIndex, column, lookup });
      return;
    }
    if (!lookup) {
      if (typed && isEditable(column)) setEditing({ value: typed, caretEnd: true });
      else if (!typed && isEditable(column))
        setEditing({ value: netString(rows[rowIndex]?.[column]), caretEnd: true });
      return;
    }
    const name = lookup.lookup ?? column.toLowerCase();
    const initialText =
      (lookup.searchPrefix ?? '') + (typed && !lookup.noSearchText ? `*${typed}` : '');
    const cached = lookup.perRow ? undefined : listCache.current.get(name);
    setPicking({ row: rowIndex, column, lookup, list: cached, initialText, typed });
    if (cached) return;
    try {
      const list = await helpers.lookup(name, rows[rowIndex] ?? {});
      if (!lookup.perRow) listCache.current.set(name, list);
      setPicking((p) => (p && p.column === column && p.row === rowIndex ? { ...p, list } : p));
    } catch (err) {
      setPicking(null);
      await msg.alert(errorMessage(err));
    }
  }

  async function applyPick(p: NonNullable<typeof picking>, result: PickResult | null) {
    setPicking(null);
    const { lookup, column } = p;
    let row = { ...(rows[p.row] ?? {}) };
    if (result && result.rows.length > 0) {
      const nameIndex = result.rows[0]!.length > 1 ? 1 : 0;
      const name =
        result.rows.length === 1
          ? netString(result.rows[0]![nameIndex]).replace('​', '')
          : result.rows.map((r) => netString(r[nameIndex])).join(',');
      const tag = result.code[0] ?? '';
      const target = named(lookup.setName ?? column);
      if (lookup.append)
        row[target] = signBetween(netString(row[target]).trim(), result.code.join(','));
      else if (lookup.valueFromTag) row[target] = tag;
      else row[target] = name;
      if (lookup.setKt) row[named(lookup.setKt)] = Number(tag) || 0;
      for (const [col, idx] of Object.entries(lookup.also ?? {}))
        row[named(col)] = result.rows[0]![idx] ?? null;
      if (lookup.after) row = await lookup.after(row, result, helpers);
      setCell(p.row, row);
      if (lookup.addRowAfter) {
        // After a pick the cursor goes down a row, adding one on the last row.
        setRows((rs) => (p.row === rs.length - 1 ? [...rs, makeRow(rs, rs.length + 1)] : rs));
        setCur({ row: p.row + 1, col: colIndex(lookup.next ?? column) });
      } else if (lookup.next) setCur({ row: p.row, col: colIndex(lookup.next) });
    } else {
      if (lookup.clearOnCancel) {
        row[named(lookup.setName ?? column)] = '';
        if (lookup.setKt) row[named(lookup.setKt)] = 0;
        setCell(p.row, row);
      }
      if (lookup.alwaysNext && lookup.next) setCur({ row: p.row, col: colIndex(lookup.next) });
      else if (p.typed && isEditable(column)) setEditing({ value: p.typed, caretEnd: true });
    }
    gridRef.current?.focus();
  }

  async function commitEdit(value: string) {
    const column = columnAt(cur.col);
    setEditing(null);
    let row = { ...(rows[cur.row] ?? {}), [column]: value };
    if (spec.onCellEdit) {
      try {
        row = await spec.onCellEdit(row, column, helpers);
      } catch (err) {
        await msg.alert(errorMessage(err));
      }
    }
    setCell(cur.row, row);
    gridRef.current?.focus();
  }

  function toggleBit(rowIndex: number, column: string) {
    if (!isEditable(column)) return;
    setCell(rowIndex, { [column]: !(rows[rowIndex]?.[column] === true) });
  }

  /** F7: every cell containing the text turns red; the first one becomes current. */
  function startFind(text: string) {
    setFinding(false);
    if (text.trim() === '') return;
    const hit = firstMatch(text, -1);
    setFind({ text, row: hit?.row ?? -1 });
    if (hit) setCur(hit);
  }

  function firstMatch(text: string, afterRow: number): Cell | null {
    for (let r = afterRow + 1; r < rows.length; r++) {
      for (let c = 0; c < visible.length; c++) {
        if (netString(rows[r]![visible[c]!.name]).includes(text)) return { row: r, col: c };
      }
    }
    return null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing || picking || nested || finding || child || vishay || asking || bigText) return;
    const column = columnAt(cur.col);
    const key = e.key;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (key === 'Enter') {
      handled();
      if (cur.row === rows.length - 1) addRow();
      else setCur((c) => ({ ...c, row: c.row + 1 }));
    } else if (key === 'F2') {
      handled();
      void openLookup(cur.row, column, '');
    } else if (key === 'F4') {
      handled();
      move(true);
    } else if (key === 'F5') {
      handled();
      move(false);
    } else if (key === 'F6' || (e.ctrlKey && key.toLowerCase() === 'n')) {
      handled();
      addRow();
    } else if (key === 'Delete') {
      handled();
      deleteRow();
    } else if (key === 'Escape') {
      handled();
      void exit();
    } else if (e.altKey && key.toLowerCase() === 's') {
      handled();
      if (spec.buttons?.save !== false && !viewOnly) void save();
    } else if (key === 'F3') {
      handled();
      // Savebut: the cell is not ReadOnly. A check box cell has no text to edit.
      if (column && rows[cur.row])
        setBigText({
          value: netString(rows[cur.row]![column]),
          canSave: isEditable(column) && !isBit(column) && !viewOnly,
        });
    } else if (key === 'F7') {
      handled();
      setFinding(true);
    } else if (key === 'F8') {
      handled();
      if (find) {
        const hit = firstMatch(find.text, cur.row);
        if (hit) {
          setFind({ ...find, row: hit.row });
          setCur(hit);
        }
      }
    } else if (e.ctrlKey && ['1', '2', '3', '4'].includes(key)) {
      handled();
      if (key === '1') copyGrid();
      else if (key === '2') pasteGrid();
      else if (key === '3') copyCell();
      else pasteCell();
    } else if (key === 'ArrowDown') {
      handled();
      setCur((c) => ({ ...c, row: Math.min(rows.length - 1, c.row + 1) }));
    } else if (key === 'ArrowUp') {
      handled();
      setCur((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
    } else if (key === 'ArrowRight' || (key === 'Tab' && !e.shiftKey)) {
      handled();
      setCur((c) => ({ ...c, col: Math.min(visible.length - 1, c.col + 1) }));
    } else if (key === 'ArrowLeft' || (key === 'Tab' && e.shiftKey)) {
      handled();
      setCur((c) => ({ ...c, col: Math.max(0, c.col - 1) }));
    } else if (key === 'Home') {
      handled();
      setCur((c) => ({ ...c, col: 0 }));
    } else if (key === 'End') {
      handled();
      setCur((c) => ({ ...c, col: visible.length - 1 }));
    } else if (key === ' ' && isBit(column)) {
      handled();
      toggleBit(cur.row, column);
    } else if (
      !e.ctrlKey &&
      !e.altKey &&
      key.length === 1 &&
      /^(Key[A-Z]|Digit\d|Numpad\d)$/.test(e.code)
    ) {
      // dgDisplay_KeyDown + KeyPress: a letter or digit opens the cell's list with that key.
      handled();
      if (isBit(column)) return;
      void openLookup(cur.row, column, key);
    }
  }

  function copyGrid() {
    gridClipboard = rows.slice(cur.row).map((r) => columns.map((c) => r[c.name] ?? null));
  }
  function pasteGrid() {
    if (gridClipboard.length === 0) return;
    setRows((rs) => {
      const pasted = gridClipboard.map((values) => {
        const row: ChildRow = {};
        columns.forEach((c, i) => (row[c.name] = values[i] ?? null));
        return row;
      });
      return [...rs.slice(0, cur.row + 1), ...pasted, ...rs.slice(cur.row + 1)];
    });
  }
  function copyCell() {
    cellClipboard = { column: cur.col, value: rows[cur.row]?.[columnAt(cur.col)] ?? null };
  }
  function pasteCell() {
    if (!cellClipboard) return;
    const column = columnAt(cellClipboard.column);
    if (column) setCell(cur.row, { [column]: cellClipboard.value });
  }
  function cutRow() {
    const row = rows[cur.row];
    if (!row) return;
    setCutRows([row]);
    setRows((rs) => rs.filter((_, i) => i !== cur.row));
  }
  async function pasteRow() {
    let at = cur.row;
    if (at === rows.length - 1 && (await msg.confirm('Paste after current or before current row?')))
      at += 1;
    setRows((rs) => [...rs.slice(0, at), ...cutRows, ...rs.slice(at)]);
    setCutRows([]);
  }
  async function pasteFromExcel() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      await msg.alert('The browser did not allow reading the clipboard.');
      return;
    }
    const lines = text.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    setRows((rs) => {
      const next = rs.map((r) => ({ ...r }));
      while (next.length < cur.row + lines.length) next.push(makeRow(next, next.length + 1));
      lines.forEach((line, i) => {
        line.split('\t').forEach((value, j) => {
          const column = columnAt(cur.col + j);
          if (column) next[cur.row + i]![column] = value;
        });
      });
      return next;
    });
  }

  const menu: ContextMenuItem[] = [
    { kind: 'item', label: 'Copy Grid', shortcut: 'Ctrl+1', onSelect: copyGrid },
    { kind: 'item', label: 'Paste Grid', shortcut: 'Ctrl+2', onSelect: pasteGrid },
    { kind: 'item', label: 'Copy Cell', shortcut: 'Ctrl+3', onSelect: copyCell },
    { kind: 'item', label: 'Paste Cell', shortcut: 'Ctrl+4', onSelect: pasteCell },
    { kind: 'item', label: 'Cut Row', onSelect: cutRow },
    {
      kind: 'item',
      label: 'Paste Row',
      disabled: cutRows.length === 0,
      onSelect: () => void pasteRow(),
    },
    { kind: 'item', label: 'Paste Data From Excel', onSelect: () => void pasteFromExcel() },
    // UpdatePariCount: the Pariman column's total, which Kruti Master's Title popup hands back.
    {
      kind: 'item',
      label: 'Update Pariman Count',
      onSelect: () => {
        const col = columns.find((c) => eq(c.name, 'pariman'))?.name;
        if (!col) return;
        setPariCount(
          Math.max(
            0,
            rows.reduce((sum, r) => sum + parimanValue(netString(r[col])), 0),
          ),
        );
      },
    },
    ...(spec.menu ?? []).map<ContextMenuItem>((m) => ({
      kind: 'item',
      label: m.label,
      onSelect: () => {
        void m
          .apply(rows, helpers)
          .then(setRows)
          .catch((err: unknown) => msg.alert(errorMessage(err)));
      },
    })),
    {
      kind: 'item',
      label: 'Send To Excel',
      onSelect: () =>
        sendTableToExcel(
          spec.column,
          visible.map((c) => c.name),
          rows.map((r) => visible.map((c) => r[c.name] ?? null)),
        ),
    },
    ...(spec.endMenu ?? []).map<ContextMenuItem>((m) => ({
      kind: 'item',
      label: m.label,
      onSelect: () => m.onSelect(rows[cur.row]),
    })),
  ];

  const buttons = viewOnly
    ? { new: false, save: false, delete: false, upDown: false }
    : { new: true, save: true, delete: true, upDown: true, ...spec.buttons };
  const anyEdit = buttons.new || buttons.save || buttons.delete;
  const headerFont: React.CSSProperties = {
    fontFamily: "'Microsoft Sans Serif', var(--font-ui)",
    fontSize: 16,
  };
  const cellFont = fontCss(gridFont);
  const rowHeight = Math.round(gridFont.sizePt * 2);

  return (
    <Modal
      title="frmDisplayTransNew"
      maximized
      onClose={onClose}
      className="flex flex-col bg-alice-blue"
    >
      <div role="toolbar" aria-label="Rows" className="win-toolstrip">
        {buttons.new && (
          <>
            <ToolButton
              icon="new"
              label="New"
              disabled={spec.disabledButtons?.includes('new')}
              onClick={addRow}
            />
            <ToolSeparator />
          </>
        )}
        {buttons.save && (
          <>
            <ToolButton
              icon="save"
              label="Save"
              disabled={spec.disabledButtons?.includes('save')}
              onClick={() => void save()}
            />
            <ToolSeparator />
          </>
        )}
        {buttons.delete && (
          <>
            <ToolButton
              icon="delete"
              label="Delete"
              disabled={spec.disabledButtons?.includes('delete')}
              onClick={deleteRow}
            />
            <ToolSeparator />
          </>
        )}
        {buttons.upDown && anyEdit && (
          <>
            <ToolButton icon="move-up" label="Move Up" onClick={() => move(true)} />
            <ToolSeparator />
            <ToolButton icon="move-down" label="Move Down" onClick={() => move(false)} />
            <ToolSeparator />
          </>
        )}
        <ToolButton icon="exit" label="Exit" onClick={() => void exit()} />
      </div>
      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-label={spec.column}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
        className="mt-px min-h-0 flex-1 overflow-auto bg-white outline-none"
      >
        <table
          className="border-collapse"
          style={{ tableLayout: 'fixed', width: widths.reduce((a, b) => a + b, 0) }}
        >
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              {visible.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  className="truncate border border-control-dark bg-light-steel-blue px-1 text-left font-normal text-[#404040]"
                  style={{ ...headerFont, height: 25 }}
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} style={{ height: rowHeight }}>
                {visible.map((c, ci) => {
                  const current = r === cur.row && ci === cur.col;
                  const value = row[c.name];
                  const found = find && netString(value).includes(find.text);
                  const bit = c.type === 'bit';
                  return (
                    <td
                      key={c.name}
                      role="gridcell"
                      aria-selected={current}
                      onMouseDown={() => {
                        if (editing && !current) void commitEdit(editing.value);
                        setCur({ row: r, col: ci });
                      }}
                      onDoubleClick={() =>
                        isEditable(c.name) &&
                        !bit &&
                        setEditing({ value: netString(value), caretEnd: true })
                      }
                      className={`border border-light-steel-blue px-1 ${spec.wrap ? 'whitespace-pre-wrap break-words' : 'truncate whitespace-pre'} ${
                        current && !editing ? 'bg-selection text-white' : ''
                      } ${found && !current ? 'text-[#ff0000]' : ''}`}
                      style={{ ...cellFont, fontSize: ptToPx(gridFont.sizePt) }}
                    >
                      {current && editing ? (
                        <CellEditor
                          initial={editing.value}
                          caretEnd={editing.caretEnd}
                          onCommit={(v) => void commitEdit(v)}
                          onCancel={() => {
                            setEditing(null);
                            gridRef.current?.focus();
                          }}
                        />
                      ) : bit ? (
                        <input
                          type="checkbox"
                          aria-label={c.name}
                          checked={value === true}
                          disabled={!isEditable(c.name)}
                          onChange={() => toggleBit(r, c.name)}
                          className="block"
                        />
                      ) : (
                        netString(value)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {menuAt && (
        <ContextMenu items={menu} at={menuAt} label="Rows" onClose={() => setMenuAt(null)} />
      )}

      {picking && (
        <PickListDialog
          title={picking.column}
          list={picking.list}
          selectFirst={picking.lookup.selectFirst ?? true}
          initialText={picking.initialText}
          onCancel={() => void applyPick(picking, null)}
          onPick={(result) => void applyPick(picking, result)}
        />
      )}

      {bigText && (
        <BigTextBox
          title={columnAt(cur.col)}
          value={bigText.value}
          canSave={bigText.canSave}
          onSave={(text) => {
            setBigText(null);
            if (text !== bigText.value) void commitEdit(text);
          }}
          onClose={() => setBigText(null)}
        />
      )}

      {finding && (
        <InputBox
          prompt="Enter Search Word"
          title="Search Detail"
          onOk={startFind}
          onCancel={() => setFinding(false)}
        />
      )}

      {asking?.lookup.input && (
        <InputBox
          prompt={asking.lookup.input.prompt}
          defaultValue={asking.lookup.input.initial(rows[asking.row])}
          onOk={(value) => {
            const a = asking;
            setAsking(null);
            if (a.lookup.input?.keepOnCancel && value === '') return void gridRef.current?.focus();
            setCell(a.row, { [named(a.lookup.setName ?? a.column)]: value });
            if (a.lookup.next) setCur({ row: a.row, col: colIndex(a.lookup.next) });
            gridRef.current?.focus();
          }}
          onCancel={() => {
            // An InputBox's Cancel returns "", which the desktop writes into the cell too
            // (unless the form checks for it first: `keepOnCancel`).
            const a = asking;
            setAsking(null);
            if (a.lookup.input?.keepOnCancel) return void gridRef.current?.focus();
            setCell(a.row, { [named(a.lookup.setName ?? a.column)]: '' });
            if (a.lookup.next) setCur({ row: a.row, col: colIndex(a.lookup.next) });
            gridRef.current?.focus();
          }}
        />
      )}

      {nested &&
        spec.nested &&
        (() => {
          const n = spec.nested;
          const parentId = rows[nested.row]?.[n.parentKey] ?? null;
          const childRows = extraRows
            .filter((x) => x[n.childKey] === parentId)
            .sort((a, b) => Number(a.Seq ?? a.seq ?? 0) - Number(b.Seq ?? b.seq ?? 0));
          return (
            <DisplayTransDialog
              screen={screen}
              spec={n.spec}
              table={{ columns: extra?.columns ?? [], rows: childRows }}
              onClose={() => setNested(null)}
              onSave={(saved) => {
                // The parent's LibNo cell lists the books; the book rows move under this row.
                const libs = saved.map((x) => ({ ...x, [n.childKey]: parentId }));
                setExtraRows((xs) => [...xs.filter((x) => x[n.childKey] !== parentId), ...libs]);
                setCell(nested.row, {
                  [n.column]: libs.map((x) => netString(x.LibNo ?? x.Libno)).join(','),
                });
                setNested(null);
                gridRef.current?.focus();
              }}
            />
          );
        })()}
      {child &&
        spec.children?.[child.column] &&
        (() => {
          const c = spec.children![child.column]!;
          const parentId = rows[child.row]?.[c.parentKey] ?? null;
          const table = extraTables[c.extra];
          const mine = (extrasRows[c.extra] ?? [])
            .filter((x) => x[c.childKey] === parentId)
            .sort((a, b) => Number(a.Seq ?? a.seq ?? 0) - Number(b.Seq ?? b.seq ?? 0));
          return (
            <DisplayTransDialog
              screen={screen}
              spec={c.spec}
              table={{ columns: table?.columns ?? [], rows: mine }}
              onClose={() => {
                setChild(null);
                gridRef.current?.focus();
              }}
              onSave={(saved) => {
                // The parent's rows for this row are replaced, and the cell reads them.
                const own = saved.map((x) => ({ ...x, [c.childKey]: parentId }));
                setExtraTable(c.extra, (xs) => [
                  ...xs.filter((x) => x[c.childKey] !== parentId),
                  ...own,
                ]);
                const cellColumn =
                  visible.find((v) => eq(v.name, child.column))?.name ?? child.column;
                setCell(child.row, { [cellColumn]: c.cell(own) });
                setChild(null);
                gridRef.current?.focus();
              }}
            />
          );
        })()}

      {vishay &&
        spec.vishayEntry?.[vishay.column] &&
        (() => {
          const v = spec.vishayEntry![vishay.column]!;
          const recordKt = rows[vishay.row]?.[v.parentKey] ?? null;
          const table = extraTables[v.extra];
          const mine = (extrasRows[v.extra] ?? [])
            .filter((x) => x.RecordKt === recordKt)
            .sort((a, b) => Number(a.Seq ?? a.seq ?? 0) - Number(b.Seq ?? b.seq ?? 0));
          return (
            <VishayEntryDialog
              screen={screen}
              column={spec.column}
              recordKt={recordKt}
              columns={table?.columns.map((c) => c.name) ?? []}
              rows={mine}
              onClose={() => {
                setVishay(null);
                gridRef.current?.focus();
              }}
              onSave={(saved, code) => {
                setExtraTable(v.extra, (xs) => [
                  ...xs.filter((x) => x.RecordKt !== recordKt),
                  ...saved,
                ]);
                const cellColumn =
                  visible.find((c) => eq(c.name, vishay.column))?.name ?? vishay.column;
                setCell(vishay.row, { [cellColumn]: code.trim() });
                setVishay(null);
                gridRef.current?.focus();
              }}
            />
          );
        })()}
    </Modal>
  );
}

/** clsCommon.SignBetweenStr: join with `sign`, skipping blanks. */
function signBetween(a: string, b: string, sign = ','): string {
  if (a.trim() === '' && b.trim() === '') return '';
  if (a.trim() === '') return b;
  if (b.trim() === '') return a;
  return `${a.trim()}${sign}${b.trim()}`;
}

/** The DataGridViewTextBoxEditingControl: Enter or Tab commits, Esc cancels. */
function CellEditor({
  initial,
  caretEnd,
  onCommit,
  onCancel,
}: {
  initial: string;
  caretEnd: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (caretEnd) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, [caretEnd]);
  return (
    <input
      ref={ref}
      aria-label="Cell"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      className="w-full bg-white text-black outline-none"
    />
  );
}

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

/** MdlLib.CalFromToValue: "1-10+15" counts 10 + 1. */
export function calFromToValue(str: string): number {
  const chars = [...str.trim()];
  let fno = 0;
  let sno = 0;
  let minus = 0;
  let add = 0;
  chars.forEach((ch, i) => {
    if (/[0-9]/.test(ch)) {
      fno = fno * 10 + Number(ch);
      sno = sno * 10 + Number(ch);
    }
    if (ch === '-') {
      minus = fno;
      fno = 0;
      sno = 0;
    }
    if (ch === '+' || i === chars.length - 1) {
      if (minus > 0) {
        if (sno === minus) add += 1;
        else {
          add += sno - minus + 1;
          minus = 0;
        }
      } else add += fno;
      fno = 0;
      sno = 0;
    }
  });
  return add;
}

/** One row's share of UpdatePariCount: a number, the number before "(", or a range. */
export function parimanValue(p: string): number {
  if (isNumeric(p)) return Math.round(Number(p));
  const at = p.indexOf('(');
  if (at >= 0) {
    const head = p.slice(0, at).trim();
    return isNumeric(head) ? Math.round(Number(head)) : calFromToValue(head);
  }
  return calFromToValue(p);
}
