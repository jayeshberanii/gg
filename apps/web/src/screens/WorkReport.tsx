'use client';

import type { GridRow, GridValue } from '@gglib/shared';
import { useMemo, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { PopupTableDialog } from '@/components/ui/PopupTableDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { GridColumnSpec, ScreenActions, ScreenSpec } from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import { useWorkspace } from '@/features/shell/Workspace';
import { BookTranDialog } from './BookTranDialog';
import type { ScreenProps } from './registry';

/** frmWorkReportM.Designer.vb's columns (GvMain order); Display Count swaps four for Qty. */
function columns(displayCount: boolean): GridColumnSpec[] {
  return [
    { header: 'WorkReportKm', field: 'WorkReportKm', width: 5 },
    { header: 'RecordNo', field: 'RecordNo', width: 150, hidden: displayCount },
    { header: 'TableName', field: 'TableName', width: 150 },
    { header: 'WorkTypeGid', field: 'WorkTypeGId', hidden: true },
    { header: 'Work Type', field: 'WorkTypeGIdName', width: 100 },
    { header: 'DoneByGid', field: 'DoneByGId', width: 150, hidden: true },
    { header: 'Done By', field: 'DoneByGIdName', width: 100 },
    { header: 'Workdate', field: 'WorkDate', width: 200, format: 'date' },
    { header: 'Mistake', field: 'Mistake', width: 150, hidden: displayCount },
    { header: 'Remark', field: 'Remark', width: 200, hidden: displayCount },
    { header: 'alterTime', field: 'alterTime', width: 200, format: 'time', hidden: displayCount },
    { header: 'Qty', field: 'Qty', width: 100, hidden: !displayCount },
  ];
}

const pad = (n: number) => String(n).padStart(2, '0');
const ddMMyyyy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** FillList's lblEntry: DateAdd(Month, -1, Today) to Today, dd/MM/yyyy. */
function lastMonthRange(): string {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  // DateAdd keeps the day, or the month's last day when it has fewer.
  const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  from.setDate(Math.min(today.getDate(), lastDay));
  return `${ddMMyyyy(from)}-${ddMMyyyy(today)}`;
}

/** The Workdate cell as the log table's date (yyyy-mm-dd). */
// const isoDay = (v: GridValue | undefined) => String(v ?? '').slice(0, 10);

/**
 * Show in › …: the RecordNo of the selected rows written for `table` (and `column`), compared
 * without regard to case as the desktop's DataView filters and SQL do. `newestFirst`: the
 * desktop reads them back from WorkReportM ordered by WorkReportKm DESC.
 */
function recordIds(
  rows: GridRow[],
  table: string,
  opts: { column?: string; newestFirst?: boolean } = {},
): number[] {
  const same = (v: GridValue | undefined, want: string) =>
    String(v ?? '').toLowerCase() === want.toLowerCase();
  const picked = rows.filter(
    (r) => same(r.TableName, table) && (!opts.column || same(r.ColumnName, opts.column)),
  );
  if (opts.newestFirst) picked.sort((a, b) => Number(b.WorkReportKm) - Number(a.WorkReportKm));
  return picked
    .map((r) => Number(String(r.RecordNo ?? '').trim()))
    .filter((n) => Number.isInteger(n) && n !== 0);
}

/** A "Show in" item: which rows, which screen, and whether an empty pick says so. */
type ShowIn = {
  label: string;
  table: string;
  screen: string;
  column?: string;
  newestFirst?: boolean;
  /** MsgBox("No Records Found") when nothing matches (the others just do nothing). */
  sayNone?: boolean;
};

const SHOW_IN_BEFORE_BOOK: ShowIn[] = [
  { label: 'Author', table: 'authmast', screen: 'author-master', sayNone: true },
  { label: 'Prakshak', table: 'PrakMast', screen: 'prakashak-master' },
  { label: 'Kruti Master', table: 'KrutiMst', screen: 'kruti-master' },
];
const SHOW_IN_MASTERS: ShowIn[] = [
  { label: 'Graphics Master', table: 'graphicbkm', screen: 'graphics-master', sayNone: true },
  { label: 'Graphics Detail', table: 'graphicbkt', screen: 'graphics-detail' },
  {
    label: 'Lekh Master',
    table: 'lekhmast',
    column: 'lekhkm',
    screen: 'lekh-master',
    newestFirst: true,
  },
  {
    label: 'Vishesh Master',
    table: 'visheshMast',
    column: 'Tid',
    screen: 'vishesh-master',
    newestFirst: true,
  },
  {
    label: 'Column Master',
    table: 'columnmaster',
    column: 'ColumnMastkm',
    screen: 'column-master',
    newestFirst: true,
  },
  {
    label: 'Bhash Master',
    table: 'bhasmast',
    column: 'bhashacokm',
    screen: 'bhasha-master',
    newestFirst: true,
  },
  {
    label: 'Lipi Master',
    table: 'lipimast',
    column: 'lipicodekm',
    screen: 'lipi-master',
    newestFirst: true,
  },
  {
    label: 'Authortype Master',
    table: 'authtype',
    column: 'authtycokm',
    screen: 'author-type-master',
    newestFirst: true,
  },
  {
    label: 'Vishay Master',
    table: 'vishay',
    column: 'vishaycokm',
    screen: 'vishay-master',
    newestFirst: true,
  },
];
const SHOW_IN_AFTER_REPORTS: ShowIn[] = [
  { label: 'Magazine Master', table: 'MagazineM', screen: 'magazine-master', newestFirst: true },
  { label: 'Patrika', table: 'patrika', screen: 'patrika', sayNone: true },
];

const baseSpec: ScreenSpec = {
  screen: 'work-report',
  panelHeight: 0,
  panelWidth: 1014,
  fields: [],
  columns: columns(false),
  reportOnly: true,
  refreshKeepsIds: true,
  // Display Count's rows all have WorkReportKm 0.
  rowKey: (r) =>
    Number(r.WorkReportKm)
      ? String(r.WorkReportKm)
      : `${r.WorkDate}|${r.DoneByGId}|${r.WorkTypeGId}|${r.TableName}`,
  // lblEntry: the last Search In Range, else FillList's month.
  toolbarLabel: (state) => state.lastRange || lastMonthRange(),
};

/**
 * Employee › Work Report (frmWorkReportM): a read-only list of the WorkReportM change log.
 * See docs/screens/work-report.md.
 */
export function WorkReport(props: ScreenProps) {
  const workspace = useWorkspace();
  const [displayCount, setDisplayCount] = useState(false);
  const [popup, setPopup] = useState<{ columns: string[]; rows: GridValue[][] } | null>(null);
  const [bookTids, setBookTids] = useState<number[] | null>(null);

  const spec = useMemo<ScreenSpec>(
    () => ({ ...baseSpec, columns: columns(displayCount), listParams: { displayCount } }),
    [displayCount],
  );

  function menu(actions: ScreenActions, state: MasterState): ContextMenuItem[] {
    // A DataGridView selects its first row when it is filled.
    const selected = () =>
      state.selectedRows.length > 0 ? state.selectedRows : state.visibleRows.slice(0, 1);
    const current = () => state.currentRow ?? state.visibleRows[0] ?? null;

    const showIn = (s: ShowIn): ContextMenuItem => ({
      kind: 'item',
      label: s.label,
      onSelect: () => {
        const ids = recordIds(selected(), s.table, s);
        if (ids.length > 0) workspace.open(s.screen, ids);
        else if (s.sayNone) void actions.alert('No Records Found');
      },
    });

    const setMode = (count: boolean) => {
      setDisplayCount(count);
      void state.reload(undefined, { displayCount: count });
    };

    return [
      {
        kind: 'submenu',
        label: 'Show in',
        items: [
          ...SHOW_IN_BEFORE_BOOK.map(showIn),
          // The desktop's frmPrakashanMst call is commented out: Prkshan does nothing.
          // { kind: 'item', label: 'Prkshan', onSelect: () => undefined },
          showIn({ label: 'BookM', table: 'BookM', screen: 'book-master' }),
          {
            kind: 'item',
            label: 'BookT',
            onSelect: () => {
              const tids = recordIds(selected(), 'BookT');
              if (tids.length > 0) setBookTids(tids);
            },
          },
          ...SHOW_IN_MASTERS.map(showIn),
          // {
          //   kind: 'item',
          //   label: 'Report',
          //   onSelect: () => {
          //     const days = [
          //       ...new Set(selected().map((r) => `${Number(r.DoneByGId)}|${isoDay(r.WorkDate)}`)),
          //     ];
          //     void actions.run('report', { days: days.join(',') }, []);
          //   },
          // },
          // {
          //   kind: 'item',
          //   label: 'Log Report',
          //   onSelect: () => {
          //     const row = current();
          //     if (!row) return;
          //     void actions.run(
          //       'log-report',
          //       { day: `${Number(row.DoneByGId)}|${isoDay(row.WorkDate)}` },
          //       [],
          //     );
          //   },
          // },
          ...SHOW_IN_AFTER_REPORTS.map(showIn),
        ],
      },
      // dgclickmnu_Opening: only the other mode is offered.
      displayCount
        ? { kind: 'item', label: 'Display Full Report', onSelect: () => setMode(false) }
        : { kind: 'item', label: 'Display Count', onSelect: () => setMode(true) },
      {
        kind: 'item',
        label: 'Compare Data',
        onSelect: () => {
          const row = current();
          if (!row) return;
          void actions
            .call('compare-data', undefined, [Number(row.WorkReportKm) || 0])
            .then((result) => {
              if (result?.kind === 'table')
                setPopup({ columns: result.columns, rows: result.rows });
            });
        },
      },
    ];
  }

  return (
    <>
      <MasterScreen spec={spec} {...props} menu={menu} />
      {popup && (
        <PopupTableDialog
          columns={popup.columns}
          rows={popup.rows}
          onClose={() => setPopup(null)}
        />
      )}
      {bookTids && (
        <BookTranDialog bookId={0} tids={bookTids} showAll onClose={() => setBookTids(null)} />
      )}
    </>
  );
}
