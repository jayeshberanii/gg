'use client';

import type { GridRow } from '@gglib/shared';
import {
  AllCommunityModule,
  type CellFocusedEvent,
  type ColDef,
  type GridApi,
  type IRowNode,
  ModuleRegistry,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { BigTextBox } from '@/components/ui/BigTextBox';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { startDragSelect } from '@/components/ui/dragSelect';
import { dataGridViewTheme } from '@/components/ui/gridTheme';
import { ptToPx, usePreferences } from '@/lib/preferences';
import type { GridColumnSpec } from './types';

ModuleRegistry.registerModules([AllCommunityModule]);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A cell as a DataGridViewTextBoxColumn shows it (with the column's Format, if any). */
function cellText(value: unknown, format?: GridColumnSpec['format']): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (value === null || value === undefined) return '';
  const text = String(value);
  // SQL date / time values arrive as ISO timestamps (time on 1970-01-01, UTC).
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/);
  if (format === 'date' && iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  if (format === 'datetime' && iso) return `${iso[3]}-${iso[2]}-${iso[1]} ${iso[4]}`;
  if (format === 'datetime12' && iso) {
    const [h, rest] = [Number(iso[4]!.slice(0, 2)), iso[4]!.slice(2)];
    const h12 = String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0');
    return `${iso[3]}-${iso[2]}-${iso[1]} ${h12}${rest}`;
  }
  if (format === 'weekday' && iso) {
    const day = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return WEEKDAYS[day.getUTCDay()]!;
  }
  if (format === 'time' && iso) {
    const fraction = (iso[5] ?? '').padEnd(7, '0');
    return /^0+$/.test(fraction) ? iso[4]! : `${iso[4]}.${fraction}`;
  }
  return text;
}

/** DataGridView_KeyDown's Ctrl +/- zoom: ±2pt, and it refuses to go below 8pt. */
const ZOOM_STEP = 2;
const MIN_POINTS = 8;

export type DataGridProps = {
  /** The rows to show (the DataView after any filter). */
  rows: GridRow[];
  columns: GridColumnSpec[];
  /** A stable key per row (AG Grid's getRowId). */
  rowKey: (row: GridRow) => string;
  /** DataGridView.MultiSelect. */
  multiSelect: boolean;
  menuItems: ContextMenuItem[];
  /** The ContextMenuStrip's accessible name. */
  menuLabel?: string;
  /** Shared with the screen so Send To Excel can follow the order the grid is showing. */
  apiRef?: React.RefObject<GridApi<GridRow> | null>;
  /** dgMain_CellFormatting's ForeColor for a row. */
  rowTextColor?: (row: GridRow) => string | undefined;
  /**
   * ColumnHeadersDefaultCellStyle, when the form's Designer sets its own (the default is the
   * master grids' Arial Unicode MS 9pt in DarkRed).
   */
  header?: { font?: string; fontSize?: number; color?: string };
  /** Shows AG Grid's loading overlay. */
  loading?: boolean;
  /** The current row moved (a click, the arrow keys). */
  onCurrentRowChange?: (row: GridRow | null) => void;
  /** The selected rows changed. */
  onSelectionChange?: (rows: GridRow[]) => void;
  /** The row right-clicked as the context menu opens (null: below the rows). */
  onContextMenuRow?: (row: GridRow | null) => void;
};

/**
 * A DataGridView as the desktop's forms configure it: `ReadOnly = True`,
 * `RowHeadersVisible = False`, `SelectionMode = FullRowSelect` and
 * `AllowUserToOrderColumns = True`, so whole rows select, columns can be dragged into another
 * order and a header click sorts (a bound column's `SortMode` defaults to Automatic).
 *
 * `MultiSelect` True (the DataGridView default) means Ctrl-click toggles a row, Shift-click and
 * Shift+arrows extend from the anchor row, a click-and-drag selects every row it passes over,
 * and Ctrl+A selects every row.
 *
 * Every grid on a form also gets `clsCommon.DataGridView_KeyDown`, which adds F3 (show the
 * current cell in `frmBixtextbox`) and Ctrl +/- (grow or shrink the grid font by 2pt).
 *
 * It holds no screen state: MasterGrid binds it to a master form, and report-style forms
 * (frmLogReport) bind it to their own rows.
 */
export function DataGrid({
  rows,
  columns,
  rowKey,
  multiSelect,
  menuItems,
  menuLabel = 'Record',
  apiRef,
  rowTextColor,
  header,
  loading = false,
  onCurrentRowChange,
  onSelectionChange,
  onContextMenuRow,
}: DataGridProps) {
  const { gridFont } = usePreferences();
  const own = useRef<GridApi<GridRow> | null>(null);
  const api = apiRef ?? own;
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [bigText, setBigText] = useState<{ title: string; value: string } | null>(null);
  /** The grid's own font zoom; the desktop changes the grid's style, not the saved UserConfig. */
  const [zoom, setZoom] = useState(0);
  /** Where Shift+arrows extend the selection from (the last row moved to without Shift). */
  const anchor = useRef<number | null>(null);
  /** Whether the key that moved the current row had Shift; AG Grid's arrow keys don't say. */
  const shiftKey = useRef(false);

  /** getRowId is read once by the grid, so it goes through a ref to see the current key. */
  const rowId = useRef(rowKey);
  rowId.current = rowKey;
  const getRowId = useCallback((p: { data: GridRow }) => rowId.current(p.data), []);

  const points = Math.max(MIN_POINTS, gridFont.sizePt + zoom);
  const theme = useMemo(
    () =>
      dataGridViewTheme({
        cellFont: `'${gridFont.family}', var(--font-grid)`,
        cellFontSize: ptToPx(points),
        rowHeight: Math.round(points * 2),
        ...(header?.font ? { headerFont: header.font } : {}),
        ...(header?.fontSize ? { headerFontSize: header.fontSize } : {}),
        ...(header?.color ? { headerTextColor: header.color } : {}),
      }),
    [gridFont.family, points, header?.font, header?.fontSize, header?.color],
  );

  const columnDefs = useMemo<ColDef<GridRow>[]>(
    () =>
      columns.map((c) => ({
        headerName: c.header,
        field: c.field,
        width: c.width ?? 100,
        hide: c.hidden ?? false,
        sortable: true,
        resizable: true,
        // A DataGridViewTextBoxColumn shows a bit as Convert.ToString does. No inferred data
        // type: AG Grid would draw a boolean as a checkbox and skip the formatter.
        cellDataType: false,
        valueFormatter: (p: { value: unknown }) => cellText(p.value, c.format),
        ...(c.textColor
          ? {
              cellStyle: (p: { data?: GridRow }) => {
                const color = p.data ? c.textColor!(p.data) : undefined;
                return color ? { color } : null;
              },
            }
          : {}),
      })),
    [columns],
  );

  /**
   * A DataGridView selects the row you right-click before opening its ContextMenuStrip, so
   * "Print Report" and the other row actions act on it — unless it is already one of the
   * selected rows, when the whole selection stays.
   */
  function selectRowUnderPointer(e: React.MouseEvent) {
    const grid = api.current;
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('.ag-row');
    const index = rowEl?.getAttribute('row-index');
    const node =
      grid && index !== null && index !== undefined
        ? grid.getDisplayedRowAtIndex(Number(index))
        : undefined;
    onContextMenuRow?.(node?.data ?? null);
    if (!grid || !node || node.isSelected()) return;
    anchor.current = Number(index);
    grid.deselectAll();
    node.setSelected(true);
  }

  /** Select rows `from`..`to` (either order); `add` keeps the rows already selected. */
  function selectRange(grid: GridApi<GridRow>, from: number, to: number, add: boolean) {
    const nodes: IRowNode<GridRow>[] = [];
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
      const n = grid.getDisplayedRowAtIndex(i);
      if (n) nodes.push(n);
    }
    if (!add) grid.deselectAll();
    grid.setNodesSelected({ nodes, newValue: true });
  }

  /**
   * DataGridView mouse selection, on the button going down: a click selects only that row,
   * Ctrl-click toggles it, and Shift-click selects from the anchor row to it (adding to the
   * selection with Ctrl too). Holding the button and dragging then stretches the selection
   * from that row (or from the anchor, after Shift) to the row under the pointer, scrolling
   * past the grid's edge. AG Grid's own click selection keeps the old rows on Shift-click, so
   * it is off.
   */
  function onRowMouseDown(e: React.MouseEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const grid = api.current;
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('.ag-row');
    // The scrolling element around the rows: .ag-grid-viewport since AG Grid 36
    // (.ag-body-viewport before).
    const viewport = e.currentTarget.querySelector<HTMLElement>(
      '.ag-grid-viewport, .ag-body-viewport',
    );
    const attr = rowEl?.getAttribute('row-index');
    if (!grid || !viewport || attr === null || attr === undefined) return;
    const index = Number(attr);
    const node = grid.getDisplayedRowAtIndex(index);
    if (!node) return;
    // MultiSelect = False: every click selects just its row, and a drag selects nothing more.
    const ctrl = multiSelect && (e.ctrlKey || e.metaKey);
    const shift = multiSelect && e.shiftKey && anchor.current !== null;
    /** With Ctrl, the rows already selected stay selected through the drag. */
    const kept = new Set(ctrl ? grid.getSelectedNodes() : []);
    if (shift) selectRange(grid, anchor.current!, index, ctrl);
    else {
      anchor.current = index;
      if (ctrl) node.setSelected(!node.isSelected());
      else {
        grid.deselectAll();
        node.setSelected(true);
      }
    }
    if (!multiSelect) return;
    const from = shift ? anchor.current! : index;
    startDragSelect({
      viewport,
      rowSelector: '.ag-row[row-index]',
      indexOf: (el) => {
        const i = el.getAttribute('row-index');
        return i === null ? null : Number(i);
      },
      startIndex: index,
      onOver: (to) => {
        const nodes: IRowNode<GridRow>[] = [];
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
          const n = grid.getDisplayedRowAtIndex(i);
          if (n) nodes.push(n);
        }
        const wanted = new Set([...kept, ...nodes]);
        const dropped = grid.getSelectedNodes().filter((n) => !wanted.has(n));
        if (dropped.length > 0) grid.setNodesSelected({ nodes: dropped, newValue: false });
        grid.setNodesSelected({ nodes, newValue: true });
      },
    });
  }

  /**
   * FullRowSelect: moving the current row with the keyboard moves the selection with it (or,
   * with Shift, stretches it from the anchor). Either way the screen hears of the new current
   * row. Mouse selection is onRowMouseDown's.
   */
  function onCellFocused(e: CellFocusedEvent<GridRow>) {
    const index = e.rowIndex;
    const node = index === null ? null : e.api.getDisplayedRowAtIndex(index);
    if (index === null || !node) return;
    if (!(e.sourceEvent instanceof MouseEvent)) {
      if (multiSelect && shiftKey.current && anchor.current !== null) {
        selectRange(e.api, anchor.current, index, false);
      } else {
        anchor.current = index;
        e.api.deselectAll();
        node.setSelected(true);
      }
    }
    onCurrentRowChange?.(node.data ?? null);
  }

  /** clsCommon.DataGridView_KeyDown. */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'F3') {
      const grid = api.current;
      const cell = grid?.getFocusedCell();
      if (!grid || !cell) return;
      const row = grid.getDisplayedRowAtIndex(cell.rowIndex)?.data;
      if (!row) return;
      const def = cell.column.getColDef();
      const field = def.field ?? cell.column.getColId();
      const value = row[field];
      e.preventDefault();
      setBigText({
        title: def.headerName ?? field,
        value: value === null || value === undefined ? '' : String(value),
      });
    } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      // DataGridView: Ctrl+A selects every row when MultiSelect is on.
      e.preventDefault();
      api.current?.selectAll();
    } else if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      setZoom((z) => z + ZOOM_STEP);
    } else if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      setZoom((z) => Math.max(MIN_POINTS - gridFont.sizePt, z - ZOOM_STEP));
    }
  }

  return (
    <div
      className="dgv h-full w-full"
      onKeyDownCapture={(e) => (shiftKey.current = e.shiftKey)}
      onKeyDown={onKeyDown}
      onMouseDownCapture={onRowMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        selectRowUnderPointer(e);
        setMenuAt({ x: e.clientX, y: e.clientY });
      }}
    >
      <AgGridReact<GridRow>
        theme={theme}
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={getRowId}
        getRowStyle={
          rowTextColor
            ? (p) => {
                const color = p.data ? rowTextColor(p.data) : undefined;
                return color ? { color } : undefined;
              }
            : undefined
        }
        rowSelection={{
          mode: 'multiRow',
          checkboxes: false,
          headerCheckbox: false,
          enableClickSelection: false,
        }}
        onGridReady={(e) => (api.current = e.api)}
        onCellFocused={onCellFocused}
        onSelectionChanged={(e) => onSelectionChange?.(e.api.getSelectedRows())}
        suppressCellFocus={false}
        overlayNoRowsTemplate=" "
        loading={loading}
      />
      {menuAt && (
        <ContextMenu
          items={menuItems}
          at={menuAt}
          label={menuLabel}
          onClose={() => setMenuAt(null)}
        />
      )}
      {bigText && (
        <BigTextBox title={bigText.title} value={bigText.value} onClose={() => setBigText(null)} />
      )}
    </div>
  );
}
