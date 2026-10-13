'use client';

import {
  formatClock,
  type LookupOption,
  parseClock,
  reportedMinutes,
  timeDiff,
  UserType,
  validateWorkLog,
  type WorkLogDetail,
  type WorkLogRow,
} from '@gglib/shared';
import {
  AllCommunityModule,
  type CellKeyDownEvent,
  type ColDef,
  type GridApi,
  ModuleRegistry,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LookupDialog } from '@/components/ui/LookupDialog';
import { useMessageBox } from '@/components/ui/MessageBox';
import { dataGridViewTheme } from '@/components/ui/gridTheme';
import { Button, Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { useAuth } from '@/features/auth/AuthProvider';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * How the window closed. `saved` is a completed past day; for today's report the desktop then
 * asks "Continue LibProgram?", giving `saved-continue` or `saved-exit`.
 */
export type WorkLogResult = 'saved' | 'saved-continue' | 'saved-exit' | 'closed';

type GridRow = WorkLogRow & { key: number };
type Lookup = { kind: 'vibhag' | 'work-type' | 'user'; rowKey?: number };

// frmLogoutNew: header Times New Roman 12.75pt on LightSteelBlue, rows Verdana 12pt.
const gridTheme = dataGridViewTheme({ headerFont: 'var(--font-field)', headerFontSize: 17 });

let nextKey = 1;
const withKeys = (rows: WorkLogRow[]): GridRow[] => rows.map((r) => ({ ...r, key: nextKey++ }));
const toInt = (v: unknown, max: number) => Math.min(Math.max(Math.trunc(Number(v)) || 0, 0), max);

/**
 * The logout work report, frmLogoutNew (CommonLibrary.dll). Opens today's report, or a given
 * day's (`logId`) when completing a pending one.
 */
export function WorkLogDialog({
  logId: initialLogId,
  onDone,
}: {
  logId?: number;
  onDone: (result: WorkLogResult) => void;
}) {
  const { user } = useAuth();
  const msg = useMessageBox();
  const [logId, setLogId] = useState(initialLogId);
  const [detail, setDetail] = useState<WorkLogDetail | null>(null);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupOptions, setLookupOptions] = useState<LookupOption[] | undefined>();
  const [askDate, setAskDate] = useState<LookupOption | null>(null);
  const [saving, setSaving] = useState(false);
  const gridApi = useRef<GridApi<GridRow> | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const load = useCallback(
    async (id: number | undefined) => {
      try {
        const d = await api.get<WorkLogDetail>(
          id === undefined ? '/work-log/current' : `/work-log/${id}`,
        );
        const t = Date.now();
        setDetail(d);
        setRows(withKeys(d.rows));
        setLoadedAt(t);
        setNow(t);
      } catch (err) {
        await msg.alert(errorMessage(err));
        onDoneRef.current('closed');
      }
    },
    [msg],
  );

  useEffect(() => {
    void load(logId);
  }, [load, logId]);

  // Timer1_Tick: today's logout time follows the server clock.
  useEffect(() => {
    if (!detail || detail.isPending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [detail]);

  const logoutTime = useMemo(() => {
    if (!detail) return null;
    if (detail.isPending) return detail.logoutTime;
    const start = parseClock(detail.serverTime) ?? 0;
    const elapsed = Math.max(0, Math.floor((now - loadedAt) / 1000));
    return formatClock((start + elapsed) % 86400);
  }, [detail, now, loadedAt]);

  const totalTime = detail ? timeDiff(detail.loginTime, logoutTime) : null;
  const reportTime = formatClock(reportedMinutes(rows) * 60);
  const remainingTime = timeDiff(reportTime, totalTime);
  const readOnly = detail?.readOnly ?? true;

  const updateRow = (key: number, patch: Partial<WorkLogRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const openLookup = useCallback(
    async (l: Lookup, row?: GridRow) => {
      setLookup(l);
      setLookupOptions(undefined);
      const url =
        l.kind === 'user'
          ? '/work-log/users'
          : l.kind === 'vibhag'
            ? `/work-log/lookups/vibhag?tableName=${encodeURIComponent(row!.tableName)}&workTypeId=${row!.workTypeId}`
            : `/work-log/lookups/work-type?vibhagId=${row!.vibhagId}`;
      try {
        setLookupOptions(await api.get<LookupOption[]>(url));
      } catch (err) {
        setLookup(null);
        await msg.alert(errorMessage(err));
      }
    },
    [msg],
  );

  const columnDefs = useMemo<ColDef<GridRow>[]>(
    () => [
      { headerName: 'Form Name', field: 'tableName', flex: 1, minWidth: 110 },
      { headerName: 'Vibhag', field: 'vibhagName', width: 150, headerTooltip: 'F2 to choose' },
      { headerName: 'Work Type', field: 'workTypeName', width: 140, headerTooltip: 'F2 to choose' },
      {
        headerName: 'Qty',
        field: 'qty',
        width: 70,
        editable: (p) => !readOnly && Boolean(p.data?.isManualEntry),
        valueParser: (p) => toInt(p.newValue, 1_000_000),
      },
      { headerName: 'MistakeCount', field: 'mistakeSum', width: 120 },
      {
        headerName: 'Hrs',
        field: 'hrs',
        width: 70,
        editable: !readOnly,
        valueParser: (p) => toInt(p.newValue, 23),
      },
      {
        headerName: 'Min',
        field: 'min',
        width: 70,
        editable: !readOnly,
        valueParser: (p) => toInt(p.newValue, 59),
      },
      { headerName: 'Remark', field: 'remark', flex: 1, minWidth: 140, editable: !readOnly },
    ],
    [readOnly],
  );

  function onCellKeyDown(e: CellKeyDownEvent<GridRow>) {
    const key = (e.event as KeyboardEvent | undefined)?.key;
    if (key !== 'F2' || readOnly || !e.data) return;
    const field = e.colDef.field;
    if (field === 'vibhagName') {
      e.event?.preventDefault();
      void openLookup({ kind: 'vibhag', rowKey: e.data.key }, e.data);
    } else if (field === 'workTypeName' && e.data.tableName === '') {
      e.event?.preventDefault();
      void openLookup({ kind: 'work-type', rowKey: e.data.key }, e.data);
    }
  }

  function onLookupSelect(option: LookupOption) {
    const l = lookup;
    setLookup(null);
    if (!l) return;
    if (l.kind === 'vibhag') updateRow(l.rowKey!, { vibhagId: option.id, vibhagName: option.name });
    else if (l.kind === 'work-type')
      updateRow(l.rowKey!, { workTypeId: option.id, workTypeName: option.name });
    else setAskDate(option);
  }

  function addRow() {
    const row: GridRow = {
      key: nextKey++,
      workId: 0,
      tableName: '',
      vibhagId: 0,
      vibhagName: '',
      workTypeId: 0,
      workTypeName: '',
      qty: 0,
      mistakeSum: 0,
      hrs: 0,
      min: 0,
      remark: '',
      isManualEntry: true,
    };
    setRows((rs) => [...rs, row]);
    setTimeout(() => gridApi.current?.setFocusedCell(rows.length, 'vibhagName'));
  }

  function deleteRow() {
    const index = gridApi.current?.getFocusedCell()?.rowIndex;
    if (index === undefined || index === null) return;
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  async function findReport(date: string) {
    const target = askDate;
    setAskDate(null);
    if (!target) return;
    try {
      const { logId: id } = await api.get<{ logId: number }>(
        `/work-log/find?userId=${target.id}&date=${date}`,
      );
      setLogId(id);
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  async function save() {
    if (!detail) return;
    if (!totalTime) {
      await msg.alert('The login or logout time of this day is missing');
      return;
    }
    gridApi.current?.stopEditing();
    const messages = validateWorkLog(rows, totalTime);
    if (messages.length > 0) {
      await msg.alert(messages.join('\n'));
      return;
    }
    setSaving(true);
    try {
      await api.put(`/work-log/${detail.logId}`, { rows: rows.map(({ key: _, ...r }) => r) });
    } catch (err) {
      setSaving(false);
      await msg.alert(errorMessage(err));
      return;
    }
    setSaving(false);
    if (detail.isPending) {
      onDone('saved');
      return;
    }
    onDone((await msg.confirm('Continue LibProgram?')) ? 'saved-continue' : 'saved-exit');
  }

  const title = !detail
    ? 'Logout'
    : detail.readOnly
      ? `Logout (${detail.userName} ${formatDate(detail.logDate)})`
      : detail.isPending
        ? `Logout(Pending Login Date: ${formatDate(detail.logDate)})`
        : 'Logout';

  const canReport = user?.userType === UserType.Admin || user?.userType === UserType.AMaster;

  return (
    <>
      <Modal title={title} onClose={() => onDone('closed')} width={984}>
        <div role="toolbar" aria-label="Work report" className="win-toolstrip">
          <ToolButton icon="logout-new" label="New" onClick={addRow} disabled={readOnly} />
          <ToolSeparator />
          <ToolButton icon="logout-delete" label="Delete" onClick={deleteRow} disabled={readOnly} />
          <ToolSeparator />
          {canReport && (
            <>
              <ToolButton
                icon="logout-report"
                label="Report"
                onClick={() => void openLookup({ kind: 'user' })}
              />
              <ToolSeparator />
            </>
          )}
          <ToolButton
            icon="logout-save"
            label="Save & Logout"
            onClick={() => void save()}
            disabled={readOnly || saving || !detail}
          />
          {detail?.readOnly && (
            <span
              className="ml-2 text-[11px] font-bold"
              style={{ fontFamily: 'var(--font-grid-header)' }}
            >
              ({detail.userName} {formatDate(detail.logDate)})
            </span>
          )}
        </div>

        {/* dgMain 779 x 221 on the left; the times stacked on the right (frmLogoutNew). */}
        <div className="flex flex-col gap-2 min-[900px]:flex-row min-[900px]:gap-0">
          <div className="dgv h-[221px] min-w-0 flex-1 min-[900px]:max-w-[779px]">
            <AgGridReact<GridRow>
              theme={gridTheme}
              rowData={rows}
              columnDefs={columnDefs}
              getRowId={(p) => String(p.data.key)}
              onGridReady={(e) => (gridApi.current = e.api)}
              onCellValueChanged={(e) =>
                e.data && updateRow(e.data.key, { [e.colDef.field!]: e.newValue })
              }
              onCellKeyDown={onCellKeyDown}
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              overlayNoRowsTemplate=" "
              loading={!detail}
            />
          </div>
          <dl className="grid grid-cols-[auto_auto] content-start items-baseline gap-x-3 gap-y-[14px] px-3 pt-3 min-[900px]:w-[205px]">
            <Clock label="Login Time" value={detail?.loginTime} />
            <Clock label="Log Out Time" value={logoutTime} />
            <Clock label="Total Time" value={totalTime} />
            <Clock label="Report Time" value={reportTime} />
            <Clock label="Remain.Time" value={remainingTime} />
          </dl>
        </div>
      </Modal>

      {lookup && (
        <LookupDialog
          title={
            lookup.kind === 'user' ? 'User' : lookup.kind === 'vibhag' ? 'Vibhag' : 'Work Type'
          }
          options={lookupOptions}
          onClose={() => setLookup(null)}
          onSelect={onLookupSelect}
        />
      )}
      {askDate && (
        <WorkDateDialog onCancel={() => setAskDate(null)} onOk={(d) => void findReport(d)} />
      )}
    </>
  );
}

function Clock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="whitespace-nowrap" style={{ fontFamily: 'var(--font-field)', fontSize: 17 }}>
        {label}
      </dt>
      <dd className="text-time-red" style={{ fontFamily: 'var(--font-field)', fontSize: 22.4 }}>
        {value ?? ''}
      </dd>
    </>
  );
}

/** VB InputBox("Please Enter Date in MM/dd/yyyy format", "Enter Work Date", today). */
function WorkDateDialog({ onOk, onCancel }: { onOk: (iso: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  });
  const [invalid, setInvalid] = useState(false);

  function submit() {
    const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const iso = m ? `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}` : '';
    if (!m || Number.isNaN(Date.parse(iso))) {
      setInvalid(true);
      return;
    }
    onOk(iso);
  }

  return (
    <Modal title="Enter Work Date" onClose={onCancel} width={380}>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 p-3">
        <label htmlFor="work-date" className="pt-1">
          Please Enter Date in MM/dd/yyyy format
          {invalid && <span className="block text-time-red">Not a valid MM/dd/yyyy date.</span>}
        </label>
        <div className="flex flex-col gap-1.5">
          <Button onClick={submit}>OK</Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
        <input
          id="work-date"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="col-span-2 h-[21px] border border-[#7a7a7a] bg-white px-1 outline-none focus:border-highlight"
        />
      </div>
    </Modal>
  );
}
