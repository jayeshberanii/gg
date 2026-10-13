'use client';

import { useState } from 'react';
import { Button, Modal } from './Modal';

/**
 * VB's InputBox(prompt, title, default): the prompt at the top left, OK and Cancel on the
 * right, the text box underneath.
 */
export function InputBox({
  prompt,
  title = 'Library',
  defaultValue = '',
  error,
  onOk,
  onCancel,
}: {
  prompt: string;
  title?: string;
  defaultValue?: string;
  error?: string;
  onOk: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <Modal title={title} onClose={onCancel} width={420} initialFocus="input">
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 p-3">
        <label htmlFor="inputbox" className="pt-1 whitespace-pre-line">
          {prompt}
          {error && <span className="block text-time-red">{error}</span>}
        </label>
        <div className="flex flex-col gap-1.5">
          <Button onClick={() => onOk(value)}>OK</Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
        <input
          id="inputbox"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onOk(value)}
          className="col-span-2 h-[21px] border border-[#7a7a7a] bg-white px-1 outline-none focus:border-highlight"
        />
      </div>
    </Modal>
  );
}
