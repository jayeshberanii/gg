'use client';

import type { GridValue, TransTable, WorkReportEntry } from '@gglib/shared';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMessageBox } from '@/components/ui/MessageBox';
import { PopupTableDialog } from '@/components/ui/PopupTableDialog';
import { api, errorMessage } from '@/lib/api';
import { DisplayTransDialog, newTempId } from './DisplayTransDialog';
import type { TransSpec } from './types';

/** CommonRepository.GetWorkReportData's columns, in its SELECT order (dtDisp). */
const COLUMNS: TransTable['columns'] = [
  { name: 'WorkReportKm', type: 'int' },
  { name: 'RecordNo', type: 'varchar' },
  { name: 'TableName', type: 'varchar' },
  { name: 'ColumnName', type: 'varchar' },
  { name: 'WorkTypeGId', type: 'int' },
  { name: 'WorkType', type: 'nvarchar' },
  { name: 'DoneByGId', type: 'int' },
  { name: 'DoneBy', type: 'nvarchar' },
  { name: 'WorkDate', type: 'varchar' },
  { name: 'Mistake', type: 'nvarchar' },
  { name: 'Remark', type: 'nvarchar' },
  { name: 'alterTime', type: 'varchar' },
];

/** Format(GetCurrentDate, "MM-dd-yyyy"). */
function today(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}-${two(d.getDate())}-${d.getFullYear()}`;
}

/**
 * frmDisplayTransNew.SetForm_Common, TranName "WorkReport": New, Save and Delete are shown
 * disabled, the key columns hidden, Mistake and Remark editable, and the popup opens empty when
 * the record has no work report. F2 on WorkType / DoneBy picks from columnmaster and moves on;
 * Enter on the last row (or F6 / Ctrl+N) adds a row for yourself, dated today.
 */
const WORK_REPORT: TransSpec = {
  column: 'WorkReport',
  common: true,
  hidden: ['WorkReportKm', 'RecordNo', 'TableName', 'ColumnName', 'WorkTypeGId', 'DoneByGId'],
  editable: ['Mistake'],
  lookups: {
    worktype: { setKt: 'WorkTypeGId', setName: 'WorkType', next: 'DoneBy' },
    doneby: { setKt: 'DoneByGId', setName: 'DoneBy', next: 'Mistake' },
  },
  // dtDisp.Rows(0) supplies RecordNo / TableName / ColumnName. The desktop errors on an empty
  // table ("There is no row at position 0"); the web leaves them blank instead.
  template: ({ rows, defaults }) => [
    newTempId(),
    rows[0]?.RecordNo ?? '',
    rows[0]?.TableName ?? '',
    rows[0]?.ColumnName ?? '',
    0,
    '',
    defaults.userId ?? 0,
    defaults.username ?? '',
    today(),
    '',
    '',
    null,
  ],
  firstColumn: 'WorkType',
  disabledButtons: ['new', 'save', 'delete'],
  openEmpty: true,
};

/**
 * btnWorkReport_Click → frmDisplayTransNew (TranName "WorkReport", FormName "Common") over the
 * record's WorkReportM rows. As on the desktop nothing here is written: Save only closes, and
 * the form's CreateWorkReport afterwards just reads WorkReportM again.
 */
export function WorkReportDialog({
  screen,
  recordId,
  onClose,
}: {
  screen: string;
  recordId: number;
  onClose: () => void;
}) {
  const auth = useAuth();
  const msg = useMessageBox();
  const [table, setTable] = useState<TransTable | null>(null);
  const [compare, setCompare] = useState<{ columns: string[]; rows: GridValue[][] } | null>(null);
  /** CompareDataToolStripMenuItem_Click: GetMistakeRemarkDetail(CurrentRow.Cells(0)) in frmPopup. */
  const spec = useMemo<TransSpec>(
    () => ({
      ...WORK_REPORT,
      endMenu: [
        {
          label: 'Compare Data',
          onSelect: (row) => {
            void api
              .get<{ columns: string[]; rows: GridValue[][] }>(
                `/master/${screen}/work-report/${recordId}/compare/${Math.trunc(Number(row?.WorkReportKm) || 0)}`,
              )
              .then(setCompare)
              .catch((err: unknown) => msg.alert(errorMessage(err)));
          },
        },
      ],
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const entries = await api.get<WorkReportEntry[]>(
          `/master/${screen}/work-report/${recordId}`,
        );
        if (!cancelled) setTable({ columns: COLUMNS, rows: entries.map((e) => ({ ...e })) });
      } catch (err) {
        if (!cancelled) {
          await msg.alert(errorMessage(err));
          onClose();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Load once per dialog.
  }, []);

  if (!table) return null;
  const user = auth.status === 'authenticated' ? auth.user : null;
  return (
    <>
      <DisplayTransDialog
        screen={screen}
        spec={spec}
        table={table}
        defaults={{ userId: user?.id ?? 0, username: user?.username ?? '' }}
        onSave={onClose}
        onClose={onClose}
      />
      {compare && (
        <PopupTableDialog
          columns={compare.columns}
          rows={compare.rows}
          onClose={() => setCompare(null)}
        />
      )}
    </>
  );
}
