'use client';

import { useState } from 'react';
import { Button, Modal } from './Modal';

/**
 * The Security dialog (frmDeleteList, opened by MdlLib.InputBoxProc) shown before Delete and
 * Lock/Unlock. The password is checked on the server, not here.
 */
export function SecurityDialog({
  busy,
  error,
  onOk,
  onCancel,
}: {
  busy?: boolean;
  error?: string;
  onOk: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  return (
    <Modal
      title="Security"
      onClose={onCancel}
      width={452}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOk(password)}>
            Ok
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </>
      }
    >
      <div className="flex items-center gap-2 p-3">
        <label htmlFor="security-password" className="win-label">
          Password
        </label>
        <input
          id="security-password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onOk(password)}
          className="win-textbox w-[298px] flex-1"
          style={{ fontFamily: 'var(--font-ui)', fontSize: 19 }}
        />
      </div>
      {error && <p className="px-3 pb-2 text-time-red">{error}</p>}
    </Modal>
  );
}
