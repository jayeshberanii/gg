'use client';

import { type GridValue, parseSearch, type PickList } from '@gglib/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fontCss, usePreferences } from '@/lib/preferences';
import { startDragSelect } from './dragSelect';
import { Modal } from './Modal';

export type PickResult = {
  /** The first column of every chosen row (the desktop's `selectedcode`). */
  code: string[];
  /** The display column of the chosen rows (`selectedname`); empty when several were chosen. */
  name: string;
  rows: GridValue[][];
};

type Props = {
  /** What the list is for; shown in place of the desktop's always-"List" window title. */
  title: string;
  list: PickList | undefined;
  /**
   * Enter picks the highlighted row (a form field's F2). Without it, Enter takes every row
   * the filter left, as the search box's F2 does (frmList1 `boolSearchLike`).
   */
  selectFirst?: boolean;
  /** frmList1 adds an empty first row so a field can be cleared (`boolAddBlankRow`). */
  addBlankRow?: boolean;
  /** DisplayListForm's SearchText: what the search box starts with (a popup cell's typed key). */
  initialText?: string;
  onPick: (result: PickResult) => void;
  onCancel: () => void;
};

const BLANK = '​'; // marks the added empty row

/**
 * The F2 list, frmList1 (clsCommon.DisplayListForm): a search box, "Total Records", and the
 * rows. Type to filter with the desktop's search syntax, arrows to move, Esc to cancel.
 *
 * DataGridView1 is `SelectionMode = FullRowSelect` with the default `MultiSelect = True`
 * (GblControl_GridSetting agrees), and DLGOK returns every selected row. So, as there:
 * Ctrl-click toggles a row, Shift-click and Shift+arrows extend from the anchor row, a
 * click-and-drag selects the rows it passes over, Ctrl+A selects all, and Enter or double-click
 * in the grid picks the selection. Down in the search box moves into the grid; Backspace in the
 * grid goes back to the search box.
 */
export function PickListDialog({
  title,
  list,
  selectFirst = false,
  addBlankRow = true,
  initialText = '',
  onPick,
  onCancel,
}: Props) {
  const { gridFont, search } = usePreferences();
  const [text, setText] = useState(initialText);
  /** The current row (DataGridView.CurrentRow). */
  const [active, setActive] = useState(0);
  /** Where Shift-click and Shift+arrows extend from. */
  const [anchor, setAnchor] = useState(0);
  /** The selected rows, when they are not just the current one. */
  const [chosen, setChosen] = useState<number[]>([]);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const columns = list?.columns ?? [];
  const rows = useMemo(() => {
    const base = list?.rows ?? [];
    if (!addBlankRow || base.length === 0) return base;
    const first = base[0]![0];
    if (first === 0 || first === '' || first === null) return base;
    return [columns.map((_, i) => (i === 0 ? BLANK : '')), ...base];
  }, [list, addBlankRow, columns]);

  /** Numeric columns need a number in the search box, as in the desktop's grid. */
  const targets = useMemo(() => {
    const numeric = (i: number) =>
      rows.some((r) => typeof r[i] === 'number') &&
      rows.every((r) => r[i] === null || r[i] === '' || r[i] === BLANK || typeof r[i] === 'number');
    if (columns.length === 1) return [{ column: '0', dataType: numeric(0) ? 'decimal' : 'String' }];
    return columns
      .slice(1)
      .map((_, i) => ({ column: String(i + 1), dataType: numeric(i + 1) ? 'decimal' : 'String' }));
  }, [columns, rows]);

  const [error, setError] = useState('');
  const visible = useMemo(() => {
    if (text.trim() === '') return rows;
    const parsed = parseSearch(text, targets, true, search);
    if (!parsed.ok) return rows;
    return rows.filter((row) =>
      parsed.filter.every((g) =>
        g.terms[g.join === 'and' ? 'every' : 'some']((t) => {
          const cell = row[Number(t.column)];
          if (cell === BLANK) return false;
          if (t.kind === 'number') return Number(cell) === t.value;
          const a = String(cell ?? '').toLowerCase();
          const b = t.text.toLowerCase();
          const hit =
            t.kind === 'equals'
              ? a.trim() === b.trim()
              : t.anyBefore && t.anyAfter
                ? a.includes(b)
                : t.anyBefore
                  ? a.endsWith(b)
                  : a.startsWith(b);
          return t.negate ? !hit : hit;
        }),
      ),
    );
  }, [rows, text, targets, search]);

  useEffect(() => {
    setActive(0);
    setAnchor(0);
    setChosen([]);
  }, [text]);

  /** DataGridView.SelectedRows, top to bottom. */
  const selection = useMemo(
    () =>
      chosen.length > 0
        ? [...chosen].sort((a, b) => a - b)
        : visible.length > 0
          ? [Math.min(active, visible.length - 1)]
          : [],
    [chosen, active, visible.length],
  );
  const selectedSet = useMemo(() => new Set(selection), [selection]);

  const range = (from: number, to: number) =>
    Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => Math.min(from, to) + i);

  /** Move the current row; with Shift the selection runs from the anchor to it. */
  function moveTo(index: number, extend: boolean) {
    const to = Math.max(0, Math.min(visible.length - 1, index));
    setActive(to);
    if (extend) setChosen(range(anchor, to));
    else {
      setAnchor(to);
      setChosen([]);
    }
  }

  // Only the rows in view are rendered: some lists (every LibNo) run to 150,000 rows.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(400);
  const rowHeight = Math.round(gridFont.sizePt * 1.333 * 1.25) + 3;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) setViewHeight(el.clientHeight);
  }, [list]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = active * rowHeight;
    const header = 26;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight - header)
      el.scrollTop = top + rowHeight - el.clientHeight + header;
  }, [active, rowHeight]);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 20);
  const last = Math.min(visible.length, Math.ceil((scrollTop + viewHeight) / rowHeight) + 20);

  const nameColumn = columns.length > 1 ? 1 : 0;
  const cellText = (v: GridValue | undefined) => (v === BLANK || v == null ? '' : String(v));

  function pick(indices: number[]) {
    const picked = indices.map((i) => visible[i]!).filter(Boolean);
    if (picked.length === 0) return onCancel();
    onPick({
      code: picked.map((r) => cellText(r[0])),
      name: picked.length === 1 ? cellText(picked[0]![nameColumn]) : '',
      rows: picked,
    });
  }

  const focusGrid = () => scrollRef.current?.focus({ preventScroll: true });

  /** Arrow, Page and Home/End keys, as a DataGridView moves its current row. */
  function navigate(e: React.KeyboardEvent): boolean {
    const page = Math.max(1, Math.floor(viewHeight / rowHeight) - 1);
    const to =
      e.key === 'ArrowDown'
        ? active + 1
        : e.key === 'ArrowUp'
          ? active - 1
          : e.key === 'PageDown'
            ? active + page
            : e.key === 'PageUp'
              ? active - page
              : e.key === 'Home' && e.ctrlKey
                ? 0
                : e.key === 'End' && e.ctrlKey
                  ? visible.length - 1
                  : null;
    if (to === null) return false;
    e.preventDefault();
    moveTo(to, e.shiftKey);
    return true;
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "'") return e.preventDefault(); // frmList1 blocks the apostrophe
    if (e.key === 'ArrowDown') {
      // txtDescription_KeyDown: Down puts the focus in the grid.
      navigate(e);
      focusGrid();
    } else if (e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') {
      navigate(e);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectFirst) pick(selection);
      else pick(visible.map((_, i) => i)); // every row the filter left (boolSearchLike)
    }
  }

  /** DataGridView1_KeyDown, plus the DataGridView's own multi-select keys. */
  function onGridKeyDown(e: React.KeyboardEvent) {
    if (navigate(e)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(selection);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      inputRef.current?.focus();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setChosen(visible.map((_, i) => i));
    }
  }

  /**
   * The button going down selects, as in a DataGridView; holding it and dragging selects every
   * row from there (or from the anchor, after Shift) to the one under the pointer, keeping the
   * rows already selected when Ctrl is down. Past the top or bottom the list scrolls.
   */
  function onRowMouseDown(e: React.MouseEvent, index: number) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection; focus goes to the grid instead
    focusGrid();
    setActive(index);
    const kept = e.ctrlKey ? selection : [];
    if (e.shiftKey) {
      setChosen(range(anchor, index));
    } else if (e.ctrlKey) {
      setAnchor(index);
      setChosen(
        selectedSet.has(index) ? selection.filter((i) => i !== index) : [...selection, index],
      );
    } else {
      setAnchor(index);
      setChosen([]);
    }
    const viewport = scrollRef.current;
    if (!viewport) return;
    const from = e.shiftKey ? anchor : index;
    startDragSelect({
      viewport,
      topInset: () => viewport.querySelector('thead')?.getBoundingClientRect().height ?? 0,
      rowSelector: 'tr[data-row]',
      indexOf: (el) => Number(el.dataset.row),
      startIndex: index,
      onOver: (to) => setChosen([...new Set([...kept, ...range(from, to)])]),
    });
  }

  const gridStyle = fontCss(gridFont);

  return (
    <Modal title={title} onClose={onCancel} width={799} className="bg-alice-blue">
      <div className="flex h-[min(467px,70vh)] flex-col">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            aria-label={`Search ${title}`}
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const parsed = parseSearch(e.target.value, targets, true, search);
              setError(parsed.ok ? '' : parsed.message);
            }}
            onKeyDown={onSearchKeyDown}
            className="w-[418px] max-w-[55%] border border-[#7a7a7a] bg-white px-1 outline-none focus:border-highlight"
            style={{ fontFamily: 'var(--font-grid-header)', fontSize: '18.4px', height: 32 }}
          />
          {error && <span className="text-time-red">{error}</span>}
          <span
            className="ml-auto pr-2 font-bold"
            style={{ fontFamily: "'Bookman Old Style', Bookman, serif", fontSize: 16 }}
          >
            Total Records : {visible.length}
          </span>
        </div>
        <div
          ref={scrollRef}
          tabIndex={0}
          onKeyDown={onGridKeyDown}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="mt-1 min-h-0 flex-1 overflow-auto border border-control-dark bg-white outline-none focus:border-highlight"
        >
          <table className="w-full border-collapse" style={gridStyle}>
            <thead className="sticky top-0">
              <tr>
                {columns.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className="border border-control-dark bg-light-steel-blue px-1 py-0.5 text-left font-normal text-dark-red"
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      fontSize: '10.7px',
                      width: i === 0 && columns.length > 1 ? 5 : undefined,
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={bodyRef} role="listbox" aria-label={title} aria-multiselectable>
              {list === undefined ? (
                <tr>
                  <td className="px-1 py-1">Loading…</td>
                </tr>
              ) : (
                <>
                  {first > 0 && <tr aria-hidden style={{ height: first * rowHeight }} />}
                  {visible.slice(first, last).map((row, k) => {
                    const i = first + k;
                    const selected = selectedSet.has(i);
                    return (
                      <tr
                        key={i}
                        data-row={i}
                        style={{ height: rowHeight }}
                        role="option"
                        aria-selected={selected}
                        onMouseDown={(e) => onRowMouseDown(e, i)}
                        onDoubleClick={() => pick(selection)}
                        className={`cursor-default ${selected ? 'bg-selection text-white' : ''}`}
                      >
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="overflow-hidden border border-[#d4d0c8] px-1 whitespace-pre"
                          >
                            {cellText(cell)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {last < visible.length && (
                    <tr aria-hidden style={{ height: (visible.length - last) * rowHeight }} />
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
