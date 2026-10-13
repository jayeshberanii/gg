'use client';

import type { GridRow } from '@gglib/shared';
import type { GridApi } from 'ag-grid-community';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { DataGrid } from './DataGrid';
import type { MasterState } from './useMasterScreen';

/**
 * dgMain: a master form's record list, a DataGrid bound to the screen's state. Moving to a row
 * loads it into the form (dgMain_Click / dgMain_KeyUp); `MultiSelect` is the form's (True by
 * default, as GblControl_GridSetting sets it), so Print, Lock and the other row actions act on
 * every selected row.
 */
export function MasterGrid({
  state,
  menuItems,
  apiRef,
}: {
  state: MasterState;
  menuItems: ContextMenuItem[];
  /** Shared with MasterScreen so Send To Excel can follow the order the grid is showing. */
  apiRef?: React.RefObject<GridApi<GridRow> | null>;
}) {
  const pk = state.meta?.primaryColumn ?? '';
  return (
    <DataGrid
      rows={state.visibleRows}
      columns={state.spec.columns}
      rowKey={(row) => state.spec.rowKey?.(row) ?? String(row[pk])}
      multiSelect={state.multiSelect}
      menuItems={menuItems}
      apiRef={apiRef}
      rowTextColor={state.spec.rowTextColor}
      loading={!state.meta}
      onCurrentRowChange={(row) => {
        state.setCurrentRow(row);
        const id = row ? Number(row[pk]) : null;
        if (id !== null && id !== state.currentId) void state.loadRecord(id);
      }}
      onSelectionChange={(selected) => {
        state.setSelectedRows(selected);
        state.setSelectedIds(selected.map((r) => Number(r[pk])).filter(Number.isFinite));
      }}
    />
  );
}
