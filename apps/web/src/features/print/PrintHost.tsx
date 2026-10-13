'use client';

import type { PrintDocument } from '@gglib/shared';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { PrintView } from './PrintView';

type Open = (document: PrintDocument) => void;

const Ctx = createContext<Open | null>(null);

/**
 * Shows the report windows (PrintView) for the whole app, so any screen's `print` action result
 * (useActionRunner) or own handler can open one with `usePrintView()(document)`.
 */
export function PrintHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ key: number; document: PrintDocument } | null>(null);
  const open = useCallback<Open>(
    (document) => setCurrent((c) => ({ key: (c?.key ?? 0) + 1, document })),
    [],
  );
  return (
    <Ctx.Provider value={open}>
      {children}
      {current && (
        <PrintView key={current.key} document={current.document} onClose={() => setCurrent(null)} />
      )}
    </Ctx.Provider>
  );
}

export function usePrintView(): Open {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePrintView needs PrintHost');
  return ctx;
}
