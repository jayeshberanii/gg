'use client';

import type { GridValue } from '@gglib/shared';
import { useState } from 'react';
import { sendTableToExcel } from '@/features/master/sendToExcel';
import { ContextMenu } from './ContextMenu';
import { Modal } from './Modal';

/**
 * CommonLibrary.frmPopup: a maximized, read-only grid of a table (columns filling the width,
 * text wrapping) with "Send To Excel" on its right-click menu; Esc closes it.
 */
export function PopupTableDialog({
  title = '',
  columns,
  rows,
  onClose,
}: {
  title?: string;
  columns: string[];
  rows: GridValue[][];
  onClose: () => void;
}) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  return (
    <Modal
      title={title}
      maximized
      onClose={onClose}
      className="bg-thistle"
      // The grid takes focus, so Esc (frmPopup_KeyDown) reaches the dialog.
      initialFocus='[role="grid"]'
    >
      <div
        tabIndex={0}
        role="grid"
        aria-label={title || 'Popup'}
        className="h-full overflow-auto bg-white outline-none"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0">
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="border border-control-dark bg-light-steel-blue px-1 text-left font-normal text-[#404040]"
                  style={{
                    fontFamily: "'Arial Unicode MS', var(--font-grid-header)",
                    fontSize: 12,
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} style={{ minHeight: 24 }}>
                {row.map((v, c) => (
                  <td
                    key={c}
                    role="gridcell"
                    onMouseDown={() => setCurrent({ r, c })}
                    className={`border border-light-steel-blue px-1 break-words whitespace-pre-wrap ${
                      current.r === r && current.c === c ? 'bg-selection text-white' : ''
                    }`}
                    style={{
                      fontFamily: "'Arial Unicode MS', var(--font-grid-header)",
                      fontSize: 16,
                    }}
                  >
                    {v === null || v === undefined
                      ? ''
                      : typeof v === 'boolean'
                        ? v
                          ? 'True'
                          : 'False'
                        : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {menuAt && (
        <ContextMenu
          label="Popup"
          at={menuAt}
          onClose={() => setMenuAt(null)}
          items={[
            {
              kind: 'item',
              label: 'Send To Excel',
              onSelect: () => sendTableToExcel(title || 'Popup', columns, rows),
            },
          ]}
        />
      )}
    </Modal>
  );
}
