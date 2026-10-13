'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { WorkLogDialog, type WorkLogResult } from './WorkLogDialog';

type Open = (options?: { logId?: number }) => Promise<WorkLogResult>;

const Ctx = createContext<Open | null>(null);

/** Opens the work report as a modal and resolves when it closes, like ShowDialog(). */
export function WorkLogHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{
    logId?: number;
    resolve: (r: WorkLogResult) => void;
  } | null>(null);

  const open = useCallback<Open>(
    (options = {}) => new Promise((resolve) => setCurrent({ logId: options.logId, resolve })),
    [],
  );
  const value = useMemo(() => open, [open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {current && (
        <WorkLogDialog
          key={current.logId ?? 'current'}
          logId={current.logId}
          onDone={(result) => {
            setCurrent(null);
            current.resolve(result);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function useWorkLog(): Open {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkLog needs WorkLogHost');
  return ctx;
}
