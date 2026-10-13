'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { InputBox } from './InputBox';
import { Button, Modal } from './Modal';

export type YesNoCancel = 'yes' | 'no' | 'cancel';

type Pending =
  | { kind: 'alert'; text: string; title: string; resolve: () => void }
  | { kind: 'confirm'; text: string; title: string; resolve: (yes: boolean) => void }
  | { kind: 'yesNoCancel'; text: string; title: string; resolve: (answer: YesNoCancel) => void }
  | {
      kind: 'input';
      text: string;
      title: string;
      initial: string;
      resolve: (value: string | null) => void;
    };

type MessageBoxApi = {
  /** MsgBox(text): waits until the user presses OK. */
  alert: (text: string, title?: string) => Promise<void>;
  /** MsgBox(text, MsgBoxStyle.YesNo): true for Yes. */
  confirm: (text: string, title?: string) => Promise<boolean>;
  /** MsgBox(text, MsgBoxStyle.YesNoCancel). */
  yesNoCancel: (text: string, title?: string) => Promise<YesNoCancel>;
  /** VB's InputBox(prompt, title, default): the typed text, or null for Cancel. */
  input: (text: string, title?: string, initial?: string) => Promise<string | null>;
};

const Ctx = createContext<MessageBoxApi | null>(null);

/**
 * The desktop's MsgBox. Blocking messages stay modal on the web because several flows (login,
 * pending work reports) wait for the answer before continuing.
 */
export function MessageBoxProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);

  const alert = useCallback(
    (text: string, title = 'Library') =>
      new Promise<void>((resolve) =>
        setQueue((q) => [...q, { kind: 'alert', text, title, resolve }]),
      ),
    [],
  );
  const confirm = useCallback(
    (text: string, title = 'Library') =>
      new Promise<boolean>((resolve) =>
        setQueue((q) => [...q, { kind: 'confirm', text, title, resolve }]),
      ),
    [],
  );
  const yesNoCancel = useCallback(
    (text: string, title = 'Library') =>
      new Promise<YesNoCancel>((resolve) =>
        setQueue((q) => [...q, { kind: 'yesNoCancel', text, title, resolve }]),
      ),
    [],
  );
  const input = useCallback(
    (text: string, title = 'Library', initial = '') =>
      new Promise<string | null>((resolve) =>
        setQueue((q) => [...q, { kind: 'input', text, title, initial, resolve }]),
      ),
    [],
  );
  const value = useMemo(
    () => ({ alert, confirm, yesNoCancel, input }),
    [alert, confirm, yesNoCancel, input],
  );

  const current = queue[0];
  const done = (answer: boolean | string) => {
    if (!current) return;
    setQueue((q) => q.slice(1));
    if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'input') current.resolve(typeof answer === 'string' ? answer : null);
    else if (current.kind === 'confirm') current.resolve(answer === true);
    else
      current.resolve(typeof answer === 'string' ? (answer as YesNoCancel) : answer ? 'yes' : 'no');
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {current?.kind === 'input' && (
        <InputBox
          key={queue.length}
          prompt={current.text}
          title={current.title}
          defaultValue={current.initial}
          onOk={(v) => done(v)}
          onCancel={() => {
            setQueue((q) => q.slice(1));
            current.resolve(null);
          }}
        />
      )}
      {current && current.kind !== 'input' && (
        <Modal
          title={current.title}
          width={360}
          className="bg-white"
          onClose={
            current.kind === 'alert'
              ? () => done(true)
              : current.kind === 'yesNoCancel'
                ? () => done('cancel')
                : undefined
          }
          footer={
            current.kind === 'alert' ? (
              <Button onClick={() => done(true)}>OK</Button>
            ) : current.kind === 'yesNoCancel' ? (
              <>
                <Button onClick={() => done('yes')}>Yes</Button>
                <Button onClick={() => done('no')}>No</Button>
                <Button onClick={() => done('cancel')}>Cancel</Button>
              </>
            ) : (
              <>
                <Button onClick={() => done(true)}>Yes</Button>
                <Button onClick={() => done(false)}>No</Button>
              </>
            )
          }
        >
          <p role="alert" className="win-msgbox-body whitespace-pre-line">
            {current.text}
          </p>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useMessageBox(): MessageBoxApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMessageBox needs MessageBoxProvider');
  return ctx;
}
