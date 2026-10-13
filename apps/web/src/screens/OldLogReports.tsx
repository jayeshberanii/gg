'use client';

import type { GridRow, GridValue, PickList } from '@gglib/shared';
import type { GridApi } from 'ag-grid-community';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PickListDialog } from '@/components/ui/PickListDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { DataGrid } from '@/features/master/DataGrid';
import { sendTableToExcel } from '@/features/master/sendToExcel';
import type { GridColumnSpec } from '@/features/master/types';
import { useActionRunner } from '@/features/master/useActionRunner';
import { api, errorMessage } from '@/lib/api';
import { fontCss, ptToPx, usePreferences } from '@/lib/preferences';
import type { ScreenProps } from './registry';

const SCREEN = 'old-log-reports';

/** cmbReportType's items. */
const REPORT_TYPES = ['Datewise', 'Userwise', 'Vibhagwise', 'WorkTypewise'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

/** cmbSearchBy's items and the DataTable column each filters (Remark: `remarks`, fixed). */
const SEARCH_BY: Record<string, string | null> = {
  '': null,
  User: 'uname',
  Vibhag: 'Vibhag',
  'Work Type': 'WorkType',
  'Work Quantity': 'workquantity',
  'Work Remark': 'workreports',
  Remark: 'remarks',
};

/** The report's DataTable columns, as SendtoExcel exports them (Short keeps nine). */
const FULL_TABLE = [
  'logdat',
  'logdate',
  'uid',
  'uname',
  'logintime',
  'logouttime',
  'totallogtime',
  'Vibhag',
  'WorkType',
  'workquantity',
  'worktime',
  'workreports',
  'remarks',
  'TargetedWorkQty',
  'totalgaptime',
  'totalworktime',
];
const SHORT_TABLE = [
  'logdat',
  'logdate',
  'uid',
  'uname',
  'logintime',
  'logouttime',
  'totallogtime',
  'totalgaptime',
  'totalworktime',
];

/** FillGrid: colGroup's header and binding per report type. */
const GROUP: Record<ReportType, { header: string; field: string }> = {
  Datewise: { header: 'Date', field: 'logdate' },
  Userwise: { header: 'User', field: 'uname' },
  Vibhagwise: { header: 'Vibhag', field: 'Vibhag' },
  WorkTypewise: { header: 'Work Type', field: 'WorkType' },
};

/**
 * dgReport's columns (GrReport order, Designer widths) as FillGrid shows them: colGroup takes
 * the report type's column, which is then hidden in its own place; Short hides the work
 * columns. colDate is the `logdat` DateTime with no Format, shown with its time.
 */
function gridColumns(type: ReportType, short: boolean): GridColumnSpec[] {
  return [
    { ...GROUP[type], width: 130 },
    {
      header: 'Date',
      field: 'logdat',
      width: 130,
      format: 'datetime',
      hidden: type === 'Datewise',
    },
    { header: 'Userkt', field: 'uid', width: 100, hidden: true },
    { header: 'User', field: 'uname', width: 100, hidden: type === 'Userwise' },
    { header: 'Login Time', field: 'logintime', width: 120 },
    { header: 'Logout Time', field: 'logouttime', width: 125 },
    { header: 'Total Time', field: 'totallogtime', width: 120 },
    { header: 'Total Gap Time', field: 'totalgaptime', width: 125 },
    { header: 'Total WorkTime', field: 'totalworktime', width: 130 },
    { header: 'Vibhag', field: 'Vibhag', width: 160, hidden: short || type === 'Vibhagwise' },
    {
      header: 'Work Type',
      field: 'WorkType',
      width: 160,
      hidden: short || type === 'WorkTypewise',
    },
    { header: 'Work Quantity', field: 'workquantity', width: 145, hidden: short },
    { header: 'Targeted Work Qty', field: 'TargetedWorkQty', width: 100, hidden: short },
    { header: 'Work Time', field: 'worktime', width: 120, hidden: short },
    { header: 'Work Remark', field: 'workreports', width: 200, hidden: short },
    { header: 'Remark', field: 'remarks', width: 200, hidden: short },
  ];
}

/** The search box's filter (dvReport.RowFilter), as the last text change left it. */
type Filter = { field: string; text: string } | { uid: number } | null;

const text = (v: GridValue | undefined) => (v === null || v === undefined ? null : String(v));

/**
 * Search(): `LIKE '%x%'` on the Search By column, or an exact `IN (…)` for a comma list, case
 * insensitive as a DataView compares. The desktop's version threw for a comma list, for Remark,
 * for Work Quantity and on a quote; this is what it meant. A column the table lacks (the work
 * columns of a Short report) matches nothing. After F2 (User) the filter is the picked user.
 */
export function filterRows(rows: GridRow[], filter: Filter): GridRow[] {
  if (!filter) return rows;
  if ('uid' in filter) return rows.filter((r) => Number(r.uid) === filter.uid);
  const parts = filter.text.split(',');
  if (parts.length > 1) {
    const wanted = parts.map((p) => p.trim().toLowerCase());
    return rows.filter((r) => {
      const v = text(r[filter.field]);
      return v !== null && wanted.includes(v.toLowerCase());
    });
  }
  const want = filter.text.toLowerCase();
  return rows.filter((r) => text(r[filter.field])?.toLowerCase().includes(want) ?? false);
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A DateTimePicker with no Value set starts at today. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The day a row is for, as the actions take it: "uid|yyyy-mm-dd". */
const dayOf = (row: GridRow) => `${Number(row.uid)}|${String(row.logdat ?? '').slice(0, 10)}`;

const BOOKMAN = "'Bookman Old Style', var(--font-field)";
const font9: React.CSSProperties = { fontFamily: BOOKMAN, fontSize: ptToPx(9) };
/** dgReport's ColumnHeadersDefaultCellStyle: Bookman Old Style 9pt, ForeColor 64,64,64. */
const GRID_HEADER = { font: BOOKMAN, fontSize: ptToPx(9), color: '#404040' };

/**
 * Employee › Old Log Reports (frmLogReport): a plain read-only form, not frmMasterPage. A header
 * panel (report type, dates, Full / Short, Search By) over dgReport; Show Report reloads, the
 * search box filters the loaded rows. See docs/screens/old-log-reports.md.
 */
export function OldLogReports({ close, initialIds }: ScreenProps) {
  const msg = useMessageBox();
  const auth = useAuth();
  const { textBoxFont } = usePreferences();
  const user = auth.status === 'authenticated' ? auth.user : null;
  const { run } = useActionRunner(SCREEN);

  const [reportType, setReportType] = useState<ReportType>('Datewise');
  const [short, setShort] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [searchBy, setSearchBy] = useState('');
  const [searchText, setSearchText] = useState('');

  const [rows, setRows] = useState<GridRow[]>([]);
  /** The report type and mode the loaded rows were filled with (FillGrid's columns). */
  const [shown, setShown] = useState<{ type: ReportType; short: boolean }>({
    type: 'Datewise',
    short: false,
  });
  const [filter, setFilter] = useState<Filter>(null);
  /** lblRecords: set after FillGrid and after F2, not while typing (as on the desktop). */
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userList, setUserList] = useState<PickList | undefined | null>(null);

  const gridApi = useRef<GridApi<GridRow> | null>(null);
  const currentRow = useRef<GridRow | null>(null);
  const clickedRow = useRef<GridRow | null>(null);
  const keys = useRef(new WeakMap<GridRow, string>());

  const visibleRows = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const columns = useMemo(() => gridColumns(shown.type, shown.short), [shown]);

  /**
   * FillReport + FillGrid: the window's StrId logs (the dates are then ignored), or the date
   * range. The grid shows the new table unfiltered, whatever the search box holds.
   */
  async function fillReport(type = reportType, isShort = short) {
    setLoading(true);
    try {
      const next = await api.post<GridRow[]>(`/master/${SCREEN}/list`, {
        ...(initialIds ? { ids: initialIds } : {}),
        params: { reportType: type, short: isShort, from, to },
      });
      // Full rows repeat a log per work entry, so rows are keyed by their place in the table.
      const map = new WeakMap<GridRow, string>();
      next.forEach((r, i) => map.set(r, String(i)));
      keys.current = map;
      currentRow.current = null;
      setRows(next);
      setShown({ type, short: isShort });
      setFilter(null);
      setCount(next.length);
    } catch (err) {
      await msg.alert(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Form_Load: cmbReportType = Datewise, then FillReport.
  useEffect(() => {
    void fillReport('Datewise', false);
  }, []);

  /** cmbReportType_SelectedIndexChanged: Short only for Datewise / Userwise. */
  function changeReportType(type: ReportType) {
    setReportType(type);
    if (type !== 'Datewise' && type !== 'Userwise') setShort(false);
  }

  /** txtSearch_TextChanged → Search(): with no Search By the filter stays as it was. */
  function changeSearch(value: string) {
    setSearchText(value);
    const t = value.trim();
    if (t === '') setFilter(null);
    else {
      const field = SEARCH_BY[searchBy];
      if (field) setFilter({ field, text: t });
    }
  }

  /** txtSearch_KeyDown F2: the user list for Search By = User; the count updates either way. */
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'F2') return;
    e.preventDefault();
    if (searchBy !== 'User') {
      setCount(visibleRows.length);
      return;
    }
    setUserList(undefined);
    api
      .get<PickList>(`/master/${SCREEN}/f2/txtSearch`)
      .then((l) => setUserList((cur) => (cur === undefined ? l : cur)))
      .catch(async (err: unknown) => {
        setUserList(null);
        await msg.alert(errorMessage(err));
      });
  }

  function pickUser(code: string, name: string) {
    setUserList(null);
    setSearchText(name);
    const uid = Number(code);
    let next: Filter = name.trim() === '' ? null : { field: 'uname', text: name.trim() };
    if (uid > 0) next = { uid };
    setFilter(next);
    setCount(filterRows(rows, next).length);
  }

  /** The row the menu acts on: the one right-clicked, else the current one. */
  const targetRow = () => clickedRow.current ?? currentRow.current ?? visibleRows[0] ?? null;

  /** SendtoExcel(dgReport): the grid's whole DataTable (every SQL column), in its order. */
  function sendToExcel() {
    const shownRows: GridRow[] = [];
    gridApi.current?.forEachNodeAfterFilterAndSort((n) => {
      if (n.data) shownRows.push(n.data);
    });
    const table = shown.short ? SHORT_TABLE : FULL_TABLE;
    sendTableToExcel(
      'Log Report',
      table,
      (shownRows.length > 0 ? shownRows : visibleRows).map((r) =>
        table.map((c) => (c === 'logdat' ? String(r.logdat ?? '').slice(0, 10) : (r[c] ?? null))),
      ),
    );
  }

  // Form_Load hides Send To Excel from Operator, Guest, Master and type 0, except user 182;
  // cntMenu_Opening shows Send To Log Report to user types 1 and 5 only.
  const canExcel = !!user && ([1, 5].includes(user.userType) || user.id === 182);
  // const canLogReport = !!user && [1, 5].includes(user.userType);

  const menuItems: ContextMenuItem[] = [
    ...(canExcel ? [{ kind: 'item' as const, label: 'Send To Excel', onSelect: sendToExcel }] : []),
    {
      kind: 'item',
      label: 'Send To Work Report',
      onSelect: () => {
        const row = targetRow();
        if (row) void run('send-to-work-report', { day: dayOf(row) }, []);
      },
    },
    // ...(canLogReport
    //   ? [
    //       {
    //         kind: 'item' as const,
    //         label: 'Send To Log Report',
    //         onSelect: () => {
    //           const row = targetRow();
    //           if (row) void run('log-report', { day: dayOf(row) }, []);
    //         },
    //       },
    //     ]
    //   : []),
  ];

  const shortAllowed = reportType === 'Datewise' || reportType === 'Userwise';

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-alice-blue" style={font9}>
      {/* Label1: Dock Top, LavenderBlush, TopCenter. */}
      <div
        className="absolute inset-x-0 top-0 text-center"
        style={{
          height: 29,
          background: '#fff0f5',
          fontFamily: BOOKMAN,
          fontSize: ptToPx(10.8),
          fontWeight: 700,
        }}
      >
        Employee Work Report
      </div>
      <button
        type="button"
        className="win-button absolute"
        onClick={close}
        style={{
          right: 25,
          top: 0,
          width: 59,
          height: 31,
          minWidth: 0,
          padding: 0,
          color: '#0000ff',
          fontFamily: BOOKMAN,
          fontSize: ptToPx(10.2),
          fontWeight: 700,
          fontStyle: 'italic',
        }}
      >
        Close
      </button>

      <label className="absolute" style={{ left: 9, top: 42 }} htmlFor="olr-type">
        Reports Type
      </label>
      <select
        id="olr-type"
        className="win-textbox absolute"
        value={reportType}
        onChange={(e) => changeReportType(e.target.value as ReportType)}
        style={{ ...font9, left: 102, top: 38, width: 193, height: 24 }}
      >
        {REPORT_TYPES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>

      <label className="absolute" style={{ left: 311, top: 42 }} htmlFor="olr-from">
        From Date
      </label>
      <input
        id="olr-from"
        type="date"
        className="win-textbox absolute"
        value={from}
        // A DateTimePicker always holds a date.
        onChange={(e) => e.target.value && setFrom(e.target.value)}
        style={{ ...font9, left: 382, top: 41, width: 120, height: 22, padding: '0 2px' }}
      />
      <label className="absolute" style={{ left: 311, top: 74 }} htmlFor="olr-to">
        To Date
      </label>
      <input
        id="olr-to"
        type="date"
        className="win-textbox absolute"
        value={to}
        onChange={(e) => e.target.value && setTo(e.target.value)}
        style={{ ...font9, left: 382, top: 74, width: 120, height: 22, padding: '0 2px' }}
      />

      <label className="absolute flex items-center gap-1" style={{ left: 510, top: 38 }}>
        <input type="radio" name="olr-mode" checked={!short} onChange={() => setShort(false)} />
        Full Report
      </label>
      <label className="absolute flex items-center gap-1" style={{ left: 510, top: 69 }}>
        <input
          type="radio"
          name="olr-mode"
          checked={short}
          disabled={!shortAllowed}
          onChange={() => setShort(true)}
        />
        Short Report
      </label>
      <button
        type="button"
        className="win-button absolute overflow-hidden whitespace-nowrap"
        onClick={() => void fillReport()}
        style={{
          left: 510,
          top: 92,
          width: 74,
          height: 19,
          minWidth: 0,
          padding: 0,
          color: '#0000ff',
          fontFamily: 'Tahoma, var(--font-ui)',
          fontSize: ptToPx(9),
        }}
      >
        Show Report
      </button>

      <label className="absolute" style={{ left: 9, top: 74 }} htmlFor="olr-search-by">
        Search By
      </label>
      <select
        id="olr-search-by"
        className="win-textbox absolute"
        value={searchBy}
        onChange={(e) => setSearchBy(e.target.value)}
        style={{ ...font9, left: 102, top: 71, width: 193, height: 24 }}
      >
        {Object.keys(SEARCH_BY).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="absolute" style={{ left: 9, top: 106 }} htmlFor="olr-search">
        Search
      </label>
      <input
        id="olr-search"
        aria-label="Search"
        className="win-textbox absolute"
        value={searchText}
        onChange={(e) => changeSearch(e.target.value)}
        onKeyDown={onSearchKeyDown}
        style={{ ...fontCss(textBoxFont), left: 102, top: 102, width: 193, height: 'auto' }}
      />

      <div
        className="absolute text-right"
        style={{
          right: 32,
          top: 121,
          width: 206,
          color: '#dc143c',
          fontFamily: BOOKMAN,
          fontSize: ptToPx(10.2),
          fontWeight: 700,
        }}
      >
        {count === null ? 'Total Records' : `Total Records : ${count}`}
      </div>

      <div className="absolute" style={{ left: 12, top: 145, right: 25, bottom: 41 }}>
        <DataGrid
          rows={visibleRows}
          columns={columns}
          rowKey={(r) => keys.current.get(r) ?? ''}
          multiSelect
          menuItems={menuItems}
          menuLabel="Log Report"
          header={GRID_HEADER}
          apiRef={gridApi}
          loading={loading}
          onCurrentRowChange={(r) => (currentRow.current = r)}
          onContextMenuRow={(r) => (clickedRow.current = r)}
        />
      </div>

      {userList !== null && (
        <PickListDialog
          title="User"
          list={userList}
          selectFirst
          onCancel={() => setUserList(null)}
          onPick={(r) => pickUser(r.code[0] ?? '', r.name)}
        />
      )}
    </div>
  );
}
