'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BigTextBox } from './BigTextBox';

type Open = {
  title: string;
  value: string;
  /** The text box the value came from, when it can take the edited text back. */
  target?: HTMLInputElement | HTMLTextAreaElement;
};

/**
 * `clsCommon.SetControl`, which `SetTextboxEvent` runs over every control of a form: each
 * TextBox gets `Txt_KeyDown` and each DataGridView `DataGridView_KeyDown`, so F3 opens
 * `frmBixtextbox` on the box's text or the current cell's value. No form's own code mentions
 * it, which is why it is handled here once rather than screen by screen:
 *
 * - a text box (`.win-textbox`): "Save" appears unless the box is ReadOnly, and writes the text
 *   back as typing would. A MaskedTextBox, DateTimePicker or ComboBox is not a TextBox and gets
 *   nothing (`data-bigtext="off"`, or not a text input); UcSearch's and the ToolStrip's boxes
 *   are skipped by SetControl and are not `.win-textbox` here.
 * - a grid's current cell: read-only. A grid whose cells can be edited (DisplayTransDialog)
 *   handles F3 itself, as does DataGrid.
 *
 * F3 is also the browser's "find next"; the desktop has no such thing, so it never gets there.
 */
export function BigTextHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const isOpen = useRef(false);
  isOpen.current = open !== null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'F3' || e.ctrlKey || e.altKey || e.metaKey) return;
      // SearchBar, DataGrid and the grids that edit their cells have their own F3.
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (isOpen.current || !(e.target instanceof HTMLElement)) return;
      const next = fromTextBox(e.target) ?? fromGridCell(e.target);
      if (next) setOpen(next);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {children}
      {open && (
        <BigTextBox
          title={open.title}
          value={open.value}
          canSave={open.target !== undefined}
          onSave={(text) => {
            if (open.target) setText(open.target, text);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function fromTextBox(el: HTMLElement): Open | null {
  const isBox =
    (el instanceof HTMLInputElement && el.type === 'text') || el instanceof HTMLTextAreaElement;
  if (!isBox || !el.classList.contains('win-textbox') || el.dataset.bigtext === 'off') return null;
  const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  return {
    title: el.getAttribute('aria-label') ?? label?.textContent?.trim() ?? 'Text',
    value: el.value,
    ...(el.readOnly ? {} : { target: el }),
  };
}

/** The current cell of the grid the key was pressed in: AG Grid focuses the cell itself. */
function fromGridCell(el: HTMLElement): Open | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return null;
  const cell =
    el.closest<HTMLElement>('[role="gridcell"]') ??
    el
      .closest<HTMLElement>('[role="grid"]')
      ?.querySelector<HTMLElement>('[role="gridcell"][aria-selected="true"]');
  if (!cell) return null;
  return { title: headerOf(cell) || 'Text', value: cell.textContent ?? '' };
}

function headerOf(cell: HTMLElement): string {
  const colId = cell.getAttribute('col-id');
  if (colId !== null) {
    const header = cell
      .closest('[role="grid"], .ag-root')
      ?.querySelector(`.ag-header-cell[col-id="${CSS.escape(colId)}"] .ag-header-cell-text`);
    return header?.textContent?.trim() ?? '';
  }
  if (cell instanceof HTMLTableCellElement) {
    const header = cell.closest('table')?.querySelector('thead tr')?.children[cell.cellIndex];
    return header?.textContent?.trim() ?? '';
  }
  return '';
}

/** Sets a box's text so that React's onChange hears it, as if it had been typed. */
function setText(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
