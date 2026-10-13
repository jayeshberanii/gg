'use client';

import { useState } from 'react';
import { Button, Modal } from './Modal';

/**
 * `frmBixtextbox` (CommonLibrary.dll), opened with F3 on a grid cell through
 * `clsCommon.DataGridView_KeyDown` → `bigtext1`: a 503×303 window holding one multiline box
 * (Microsoft Sans Serif 10.8pt) so a long value can be read in full. "&Save" only appears when
 * the cell is editable (`Savebut`, i.e. the cell is not read-only) — a master grid is
 * `ReadOnly = True`, so there it is just a viewer. "&Close" leaves the value alone.
 *
 * The desktop leaves the window's caption at the designer's literal "frmBixtextbox"; this uses
 * the column's name instead, which is what that caption was clearly meant to say.
 */
export function BigTextBox({
  title,
  value,
  canSave = false,
  onSave,
  onClose,
}: {
  title: string;
  value: string;
  canSave?: boolean;
  onSave?: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={503}
      className="bg-control p-0.5"
      initialFocus="textarea"
      footer={
        <>
          {canSave && (
            <Button className="w-[67px]" onClick={() => onSave?.(text.replace(/\n/g, '\r\n'))}>
              Save
            </Button>
          )}
          <Button className="w-[67px]" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <textarea
        aria-label={title}
        readOnly={!canSave}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-[266px] w-full resize-none border border-[#7a7a7a] bg-white px-1 outline-none"
        style={{ fontFamily: "'Microsoft Sans Serif', Tahoma, sans-serif", fontSize: '14.4px' }}
      />
    </Modal>
  );
}
