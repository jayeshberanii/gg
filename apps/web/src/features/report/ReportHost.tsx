'use client';

import type { ReportDocument } from '@gglib/shared';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { ReportView } from './ReportView';

type Open = (document: ReportDocument, refresh?: () => Promise<ReportDocument | null>) => void;

const Ctx = createContext<Open | null>(null);

/**
 * Shows the report windows (ReportView) for the whole app, so any screen's `report` action
 * result (useActionRunner) can open one with `useReportView()(document, refresh)`.
 */
export function ReportHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{
    key: number;
    document: ReportDocument;
    refresh?: () => Promise<ReportDocument | null>;
  } | null>(null);
  const open = useCallback<Open>(
    (document, refresh) =>
      setCurrent((c) => ({ key: (c?.key ?? 0) + 1, document, ...(refresh ? { refresh } : {}) })),
    [],
  );
  return (
    <Ctx.Provider value={open}>
      {children}
      {current && (
        <ReportView
          key={current.key}
          document={current.document}
          refresh={current.refresh}
          onClose={() => setCurrent(null)}
        />
      )}
    </Ctx.Provider>
  );
}

export function useReportView(): Open {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReportView needs ReportHost');
  return ctx;
}
