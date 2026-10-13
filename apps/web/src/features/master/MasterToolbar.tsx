'use client';

import { ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { PrevNext } from './PrevNext';
import type { MasterState } from './useMasterScreen';
import { toolbarCheckboxes } from './types';

/**
 * frmMasterPage's ToolStrip: New, Save, Modify, Cancel, Copy, Delete, Refresh, Work Report,
 * Help, Exit, with the "entered by" label and the Prev/Next control at the right end. Which
 * buttons are enabled follows clsCommon.EnableDisableDataEditing.
 */
export function MasterToolbar({
  state,
  onDelete,
  onWorkReport,
  onExit,
}: {
  state: MasterState;
  onDelete: () => void;
  onWorkReport: () => void;
  onExit: () => void;
}) {
  const editing = state.mode === 'edit';
  const hasRows = state.visibleRows.length > 0;
  // A grid-only form (frmWorkReportM): every button enabled, only Refresh and Exit handled.
  if (state.spec.reportOnly) {
    const none = () => undefined;
    return (
      <div role="toolbar" aria-label="Record" className="win-toolstrip justify-between">
        <div className="flex items-center">
          <ToolButton icon="new" label="New" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="save" label="Save" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="modify" label="Modify" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="cancel" label="Cancel" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="copy" label="Copy" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="delete" label="Delete" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="refresh" label="Refresh" onClick={state.refresh} />
          <ToolSeparator />
          <ToolButton icon="work-report" label="Work Report" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="help" label="Help" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="exit" label="Exit" onClick={onExit} />
          <ToolSeparator />
          <span className="win-toolstrip-text leading-[22px]">
            {state.spec.toolbarLabel?.(state) ?? ''}
          </span>
        </div>
        <div className="flex items-center">
          <PrevNext state={state} />
        </div>
      </div>
    );
  }
  // ShowHideButton on a form that never calls EnableDisableDataEditing (frmBookConfirmation):
  // only the buttons it leaves, always enabled, and Exit.
  if (state.spec.fixedButtons) {
    const shown = state.spec.fixedButtons;
    return (
      <div role="toolbar" aria-label="Record" className="win-toolstrip justify-between">
        <div className="flex items-center">
          {shown.includes('delete') && (
            <>
              <ToolButton
                icon="delete"
                label="Delete"
                onClick={() => state.currentId !== null && onDelete()}
              />
              <ToolSeparator />
            </>
          )}
          {shown.includes('refresh') && (
            <>
              <ToolButton icon="refresh" label="Refresh" onClick={state.refresh} />
              <ToolSeparator />
            </>
          )}
          <ToolButton icon="exit" label="Exit" onClick={onExit} />
          <ToolSeparator />
        </div>
        <div className="flex items-center">
          <PrevNext state={state} />
        </div>
      </div>
    );
  }
  // A form that never calls EnableDisableDataEditing: every button stays enabled, and those
  // without a handler do nothing.
  if (state.spec.editInPlace) {
    const none = () => undefined;
    const off = state.spec.listOnly ?? false;
    return (
      <div role="toolbar" aria-label="Record" className="win-toolstrip justify-between">
        <div className="flex items-center">
          <ToolButton icon="new" label="New" disabled={off} onClick={state.newRecord} />
          <ToolSeparator />
          <ToolButton
            icon="save"
            label="Save"
            disabled={off || state.busy}
            onClick={() => void state.save()}
          />
          <ToolSeparator />
          <ToolButton icon="modify" label="Modify" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="cancel" label="Cancel" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="copy" label="Copy" disabled={off} onClick={none} />
          <ToolSeparator />
          <ToolButton icon="delete" label="Delete" disabled={off} onClick={onDelete} />
          <ToolSeparator />
          <ToolButton
            icon="refresh"
            label="Refresh"
            onClick={() => {
              state.newRecord();
              state.refresh();
            }}
          />
          <ToolSeparator />
          <ToolButton icon="work-report" label="Work Report" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="help" label="Help" onClick={none} />
          <ToolSeparator />
          <ToolButton icon="exit" label="Exit" onClick={onExit} />
          <ToolSeparator />
          <span className="win-toolstrip-text leading-[22px]">{state.entryText}</span>
        </div>
        <div className="flex items-center">
          {toolbarCheckboxes(state.spec).map((c) => (
            <label key={c.name} className="mr-2 flex items-center gap-1 font-sans text-xs">
              <input
                type="checkbox"
                disabled={c.disabled}
                checked={state.fields[c.name] === 'True'}
                onChange={(e) => state.setField(c.name, e.target.checked ? 'True' : 'False')}
              />
              {c.label}
            </label>
          ))}
          <PrevNext state={state} />
        </div>
      </div>
    );
  }
  return (
    <div role="toolbar" aria-label="Record" className="win-toolstrip justify-between">
      <div className="flex items-center">
        <ToolButton
          icon="new"
          label="New"
          disabled={editing || !state.canNew}
          onClick={state.newRecord}
        />
        <ToolSeparator />
        <ToolButton
          icon="save"
          label="Save"
          disabled={!editing || state.busy}
          onClick={() => void state.save()}
        />
        <ToolSeparator />
        <ToolButton
          icon="modify"
          label="Modify"
          disabled={!state.canModify}
          onClick={() => void state.modify()}
        />
        <ToolSeparator />
        <ToolButton
          icon="cancel"
          label="Cancel"
          disabled={!editing}
          onClick={() => void state.cancel()}
        />
        <ToolSeparator />
        <ToolButton
          icon="copy"
          label="Copy"
          disabled={editing || state.justLoaded || state.locked || !state.canCopy}
          onClick={() => void state.copy()}
        />
        <ToolSeparator />
        <ToolButton icon="delete" label="Delete" disabled={!state.canDelete} onClick={onDelete} />
        <ToolSeparator />
        <ToolButton icon="refresh" label="Refresh" disabled={editing} onClick={state.refresh} />
        <ToolSeparator />
        {/* Deliberately unlike the desktop, where btnWorkReport only comes back with the next
            New/Modify/Cancel: here it is on whenever a row is selected. */}
        <ToolButton
          icon="work-report"
          label="Work Report"
          disabled={editing || !hasRows || state.currentId === null}
          onClick={onWorkReport}
        />
        <ToolSeparator />
        <ToolButton icon="help" label="Help" onClick={() => undefined} />
        <ToolSeparator />
        <ToolButton icon="exit" label="Exit" onClick={onExit} />
        <ToolSeparator />
        {state.spec.entryLabel && (
          <span className="win-toolstrip-text leading-[22px]">{state.entryText}</span>
        )}
      </div>
      <div className="flex items-center">
        {toolbarCheckboxes(state.spec).map((c) => (
          <label key={c.name} className="mr-2 flex items-center gap-1 font-sans text-xs">
            <input
              type="checkbox"
              disabled={c.disabled}
              checked={state.fields[c.name] === 'True'}
              onChange={(e) => state.setField(c.name, e.target.checked ? 'True' : 'False')}
            />
            {c.label}
          </label>
        ))}
        <PrevNext state={state} />
      </div>
    </div>
  );
}
