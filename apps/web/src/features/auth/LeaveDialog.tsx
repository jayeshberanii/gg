'use client';

import type { LeaveRequirement, LookupOption } from '@gglib/shared';
import { useState } from 'react';
import { LookupDialog } from '@/components/ui/LookupDialog';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { formatDate } from '@/lib/format';

type Props = {
  leave: LeaveRequirement;
  busy: boolean;
  onSave: (leaveTypeId: number, reason: string) => void;
  onExit: () => void;
};

const cell = 'border border-control-dark px-1 py-0.5';
const font = { fontFamily: 'Tahoma, var(--font-ui)', fontSize: 12 };

/**
 * The leave application forced at login: frmSearchAndSave in "Save" mode (FormCondition 2),
 * as built by frmLogoutNew.SaveLog. A Name/Value grid: read-only dates, a LeaveType picked with
 * F2 from a list, DiffHr for a short day, and a Reason. Toolbar: Save, Exit.
 */
export function LeaveDialog({ leave, busy, onSave, onExit }: Props) {
  const [leaveType, setLeaveType] = useState<LookupOption | null>(null);
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(false);
  const options = leave.leaveTypes.map((t) => ({ id: t.id, name: t.name }));

  const rows: { name: string; value: React.ReactNode; readOnly?: boolean }[] = [
    { name: 'Date From', value: formatDate(leave.fromDate), readOnly: true },
    { name: 'Date To', value: formatDate(leave.toDate), readOnly: true },
    {
      name: 'LeaveType',
      value: (
        <input
          aria-label="LeaveType"
          readOnly
          value={leaveType?.name ?? ''}
          title="Press F2 to choose"
          onKeyDown={(e) => {
            if (e.key === 'F2' || e.key === 'Enter') {
              e.preventDefault();
              setPicking(true);
            }
          }}
          onDoubleClick={() => setPicking(true)}
          className="w-full bg-transparent outline-none focus:bg-info"
          style={font}
        />
      ),
    },
    ...(leave.diffHr ? [{ name: 'DiffHr', value: leave.diffHr, readOnly: true }] : []),
    {
      name: 'Reason',
      value: (
        <input
          aria-label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full bg-transparent outline-none focus:bg-info"
          style={font}
        />
      ),
    },
  ];

  return (
    <>
      <Modal title="Save" onClose={onExit} width={699} className="bg-alice-blue">
        <div role="toolbar" aria-label="Save" className="win-toolstrip">
          <ToolButton
            icon="sas-save"
            label="Save"
            disabled={busy}
            onClick={() => onSave(leaveType?.id ?? 0, reason.trim())}
          />
          <ToolSeparator />
          <ToolButton icon="sas-exit" label="Exit" onClick={onExit} />
          <ToolSeparator />
        </div>
        <table className="w-full border-collapse bg-white" style={font}>
          <thead>
            <tr>
              <th scope="col" className={`${cell} w-1/3 bg-light-steel-blue text-left font-normal`}>
                Name
              </th>
              <th scope="col" className={`${cell} bg-light-steel-blue text-left font-normal`}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row" className={`${cell} text-left font-normal`}>
                  {r.name}
                </th>
                <td className={`${cell} ${r.readOnly ? 'bg-control' : ''}`}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-1 py-1 text-[11px] text-[#444]">
          {leave.mode === 'absent'
            ? 'You were absent on working days since your last login. Apply for leave to continue.'
            : 'Your last working day was shorter than your working hours. Apply for leave to continue.'}
          {leaveType && ` ${leave.leaveTypes.find((t) => t.id === leaveType.id)?.brief ?? ''}`}
        </p>
      </Modal>
      {picking && (
        <LookupDialog
          title="LeaveType"
          options={options}
          onClose={() => setPicking(false)}
          onSelect={(o) => {
            setLeaveType(o);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
