'use client';

import { canApproveLeave, canEditLeave, type GridValue, type PickList } from '@gglib/shared';
import { useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { InputBox } from '@/components/ui/InputBox';
import { PopupTableDialog } from '@/components/ui/PopupTableDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { FormContext, ScreenActions, ScreenSpec } from '@/features/master/types';
import type { MasterState } from '@/features/master/useMasterScreen';
import { api, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';
import type { ScreenProps } from './registry';

/**
 * Employee › Leaves (frmLeaveM, title "Leave Master"). Positions, widths and headers are
 * frmLeaveM.Designer.vb's. Everyone may add a leave; Modify / Copy / Delete of a saved one are
 * for user type 1 and users 41 / 5; Approve / Reject / Employee Summary for user type 5 and
 * users 41 / 5. The API enforces each of these itself and computes TotalDays and the status.
 */

/** GetTotalDays: TotalDays and the status for the boxes, after From, To or Leave Type changed. */
async function recompute(
  ctx: FormContext,
  change: { from?: string; to?: string; type?: string },
): Promise<void> {
  const from = change.from ?? ctx.fields.LeaveFromDate ?? '';
  const to = change.to ?? ctx.fields.LeaveToDate ?? '';
  const type = change.type ?? ctx.fields.LeaveTypekt ?? '';
  try {
    const q = new URLSearchParams({ from, to, type }).toString();
    const r = await api.get<PickList>(`/master/leaves/lists/total-days?${q}`);
    const row = r.rows[0];
    if (!row) return;
    ctx.setField('TotalDays', String(row[0] ?? ''));
    ctx.setTag('LeaveStatuskt', Number(row[1]) || 0);
    ctx.setField('LeaveStatuskt', String(row[2] ?? ''));
  } catch (err) {
    await ctx.alert(errorMessage(err));
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 8 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

const spec: ScreenSpec = {
  screen: 'leaves',
  panelHeight: 186,
  panelWidth: 1012,
  entryLabel: true,
  modifyBy: canEditLeave,
  fields: [
    {
      name: 'Employeekt',
      label: 'Requested By',
      labelAt: { x: 13, y: 22 },
      at: { x: 136, y: 18, w: 227 },
      kt: true,
      nameColumn: 'EmployeeName',
    },
    {
      name: 'LeaveFromDate',
      label: 'Leave From',
      labelAt: { x: 13, y: 62 },
      at: { x: 136, y: 58, w: 227 },
      date: true,
      onUserChange: (from, ctx) => void recompute(ctx, { from }),
    },
    {
      name: 'LeaveToDate',
      label: 'Leave To',
      labelAt: { x: 13, y: 102 },
      at: { x: 136, y: 98, w: 227 },
      date: true,
      onUserChange: (to, ctx) => void recompute(ctx, { to }),
    },
    {
      name: 'LeaveTypekt',
      label: 'Leave Type',
      labelAt: { x: 13, y: 142 },
      at: { x: 136, y: 138, w: 227 },
      kt: true,
      nameColumn: 'LeaveTypeName',
      afterPick: (picked, ctx) => void recompute(ctx, { type: picked.name }),
    },
    {
      name: 'Reason',
      label: 'Reason',
      labelAt: { x: 370, y: 142 },
      at: { x: 502, y: 138, w: 195 },
      noF2: true,
    },
    {
      name: 'ApprovedBykt',
      label: 'Approved By',
      labelAt: { x: 370, y: 22 },
      at: { x: 502, y: 18, w: 195 },
      kt: true,
      nameColumn: 'ApprovedByName',
      readOnly: true,
      noF2: true,
    },
    {
      name: 'ApprovedDateText',
      label: 'Approved Date',
      labelAt: { x: 370, y: 62 },
      at: { x: 502, y: 58, w: 195 },
      alwaysDisabled: true,
      noF2: true,
    },
    // Nothing ever enables it: its F2 list is unreachable.
    {
      name: 'Comment',
      label: 'Comment',
      labelAt: { x: 370, y: 102 },
      at: { x: 502, y: 98, w: 500 },
      alwaysDisabled: true,
      noF2: true,
    },
    {
      name: 'LeaveStatuskt',
      label: 'Leave Status',
      labelAt: { x: 715, y: 22 },
      at: { x: 844, y: 18, w: 158 },
      kt: true,
      nameColumn: 'LeaveStatusName',
      alwaysDisabled: true,
      noF2: true,
    },
    {
      name: 'TotalDays',
      label: 'Total Days',
      labelAt: { x: 715, y: 62 },
      at: { x: 844, y: 58, w: 158 },
      alwaysDisabled: true,
      noF2: true,
    },
    // Enabled only for an LC / EG leave (Txt_Leave on Leave Type), which the F2 never offers.
    {
      name: 'DiffHour',
      label: 'Hour',
      labelAt: { x: 848, y: 142 },
      at: { x: 789, y: 139, w: 55 },
      options: HOURS,
      disabledColumn: 'DiffHrLocked',
    },
    {
      name: 'DiffMinute',
      label: 'Minute',
      labelAt: { x: 942, y: 141 },
      at: { x: 892, y: 139, w: 47 },
      options: MINUTES,
      disabledColumn: 'DiffHrLocked',
    },
  ],
  columns: [
    { header: 'Id', field: 'LeaveMKm', width: 5 },
    { header: 'Employeekt', field: 'Employeekt', hidden: true },
    { header: 'Employee Name', field: 'EmployeeName', width: 120 },
    { header: 'Leave From', field: 'LeaveFromDate', width: 130, format: 'date' },
    { header: 'Leave To', field: 'LeaveToDate', width: 130, format: 'date' },
    { header: 'Total Days', field: 'TotalDays', width: 120 },
    { header: 'Leave Status', field: 'LeaveStatusName', width: 120 },
    { header: 'Leave Type', field: 'LeaveTypeName', width: 120 },
    { header: 'DiffHrs', field: 'DiffHr', width: 90, format: 'time' },
    { header: 'Approved By', field: 'ApprovedByName', width: 100 },
    { header: 'Approved Date', field: 'ApprovedDate', width: 125, format: 'datetime' },
    { header: 'Comment', field: 'Comment', width: 120 },
    { header: 'EnDate', field: 'endate', width: 100, format: 'date' },
  ],
  deleteFlow: async (a) => {
    await a.alert('Delete Facility is not Available');
  },
};

const RANGE_PROMPT = 'Please Enter Range in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)';

/** dd/MM/yyyy of an ISO date. */
const dmy = (iso: string) => iso.split('-').reverse().join('/');

export function LeavesMaster(props: ScreenProps) {
  const [asking, setAsking] = useState<{
    initial: string;
    then: (value: string) => void;
  } | null>(null);
  const [summary, setSummary] = useState<{ columns: string[]; rows: GridValue[][] } | null>(null);

  function menu(a: ScreenActions, state: MasterState): ContextMenuItem[] {
    const approver = a.user !== null && canApproveLeave(a.user);
    // Approve / Reject act on the right-clicked row (the grid selects it before the menu
    // opens); with several rows selected, on the current one.
    const row = state.selectedRows.length === 1 ? state.selectedRows[0]! : a.currentRow;
    const pk = state.meta?.primaryColumn ?? 'LeaveMKm';
    const rowId = row ? Number(row[pk]) || null : null;
    const today = todayIso();
    const item = (label: string, onSelect: () => void): ContextMenuItem => ({
      kind: 'item',
      label,
      onSelect,
    });
    // InputBox: an empty answer cancels.
    const askRange = (initial: string, then: (range: string) => void) =>
      setAsking({ initial, then: (v) => v !== '' && then(v) });
    return [
      {
        kind: 'submenu',
        label: 'Print Report',
        items: [
          item('Selected Column', a.printSelectedColumn),
          item('Send To Excel', a.sendToExcel),
          ...(approver
            ? [
                item('Employee Summary', () =>
                  askRange(`01/${dmy(today).slice(3)}-${dmy(today)}`, (range) => {
                    void (async () => {
                      const r = await a.call('employee-summary', { range }, []);
                      if (r?.kind === 'table') setSummary({ columns: r.columns, rows: r.rows });
                    })();
                  }),
                ),
              ]
            : []),
        ],
      },
      {
        kind: 'submenu',
        label: 'Utility',
        items: [
          ...(approver && row?.LeaveStatusName === 'Pending' && rowId !== null
            ? [
                item('Approve Leave', () => {
                  const id = rowId;
                  void (async () => {
                    if (await a.confirm('Are You Sure to Approve Leave?'))
                      await a.run('approve', undefined, [id]);
                  })();
                }),
              ]
            : []),
          ...(approver && rowId !== null
            ? [
                item('Reject Leave', () => {
                  const id = rowId;
                  void (async () => {
                    if (await a.confirm('Are You Sure to Reject Leave?'))
                      await a.run('reject', undefined, [id]);
                  })();
                }),
              ]
            : []),
          item('Show Leaves Between Dates', () =>
            askRange(
              `${dmy(today)}-${dmy(today)}`,
              (range) => void a.run('between-dates', { range }, []),
            ),
          ),
          item('Show Leave Without Approval', () => void a.run('without-approval', undefined, [])),
        ],
      },
    ];
  }

  return (
    <>
      <MasterScreen spec={spec} {...props} menu={menu} />
      {asking && (
        <InputBox
          prompt={RANGE_PROMPT}
          defaultValue={asking.initial}
          onOk={(value) => {
            const then = asking.then;
            setAsking(null);
            then(value.trim() === '' ? '' : value);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {summary && (
        <PopupTableDialog
          columns={summary.columns}
          rows={summary.rows}
          onClose={() => setSummary(null)}
        />
      )}
    </>
  );
}
