'use client';

import { useState } from 'react';
import { Button, Modal } from './Modal';

/**
 * CommonLibrary.frmMultiCheckbox: up to eight check boxes in a group (1–8 on the keyboard tick
 * them, Enter is Ok, Esc Cancel) and "Select All", which a single-select caller disables.
 * Ok returns the ticked positions as "1,3,…" (strSelection).
 */
export function MultiCheckboxDialog({
  items,
  multiSelect = false,
  onOk,
  onCancel,
}: {
  items: string[];
  multiSelect?: boolean;
  onOk: (selection: string) => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const toggle = (i: number, value?: boolean) =>
    setChecked((c) => c.map((v, j) => (j === i ? (value ?? !v) : v)));
  const all = checked.every(Boolean);

  function ok() {
    const picked = checked.map((v, i) => (v ? String(i + 1) : '')).filter(Boolean);
    if (picked.length === 0 && multiSelect) return setChecked(items.map(() => true));
    onOk(picked.join(','));
  }

  return (
    <Modal title="frmMultiCheckbox" width={519} onClose={onCancel} className="bg-control">
      <div
        className="relative h-[155px]"
        onKeyDown={(e) => {
          const n = Number(e.key);
          if (n >= 1 && n <= items.length) {
            e.preventDefault();
            toggle(n - 1, true);
          } else if (e.key === '0' && multiSelect) {
            e.preventDefault();
            setChecked(items.map(() => !all));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            ok();
          }
        }}
      >
        <label className="absolute left-[11px] top-[5px] flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={all}
            disabled={!multiSelect}
            onChange={(e) => setChecked(items.map(() => e.target.checked))}
          />
          Select All
        </label>
        <fieldset className="absolute left-[9px] top-[20px] h-[101px] w-[498px] border border-[#d5dfe5] px-1">
          <div className="mt-[14px] grid grid-cols-5 gap-y-[6px]">
            {items.map((name, i) => (
              <label key={name} className="flex w-[86px] items-center gap-1 text-xs">
                <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <Button className="absolute left-[11px] top-[127px] w-[32px] min-w-0 px-0" onClick={ok}>
          Ok
        </Button>
        <Button
          className="absolute left-[49px] top-[127px] w-[50px] min-w-0 px-0"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
