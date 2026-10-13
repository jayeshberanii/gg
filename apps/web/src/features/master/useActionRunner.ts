'use client';

import type { ActionResult, GridRow } from '@gglib/shared';
import { useMessageBox } from '@/components/ui/MessageBox';
import { usePrintView } from '@/features/print/PrintHost';
import { useWorkspace } from '@/features/shell/Workspace';
import { useWorkLog } from '@/features/work-log/WorkLogHost';
import { api, errorMessage } from '@/lib/api';
import { sendTableToExcel } from './sendToExcel';
import type { ActionParams } from './types';

/** What a screen does with the results that change its grid's rows. */
export type ActionRowTargets = {
  /** `refreshed`: the grid reloaded. */
  replaceRows: (rows: GridRow[]) => void;
  /** `list`: the grid now shows exactly these rows. */
  showRows: (rows: GridRow[]) => void;
  /** `cells`: some rows' cells changed. */
  patchRows: (rows: GridRow[]) => void;
};

export type ActionRunner = {
  /** POST action/<name>, returning what it produced (or null after showing an error). */
  call: (action: string, params?: ActionParams, ids?: number[]) => Promise<ActionResult | null>;
  /** A right-click action, with its result shown the way the desktop's handler shows it. */
  run: (action: string, params?: ActionParams, ids?: number[]) => Promise<void>;
};

/**
 * Runs a screen's right-click actions (`/master/<screen>/action/<name>`) and handles their
 * results: a message box, another window (`open`, or a new record there), a CSV download (`table`), a report
 * to print (`print`), the work log
 * dialog, a URL, or new rows for the grid (`rows`; a screen without them ignores those).
 * `defaultIds` are sent when the caller names none (the grid's selected records).
 */
export function useActionRunner(
  screen: string,
  { defaultIds = [], rows }: { defaultIds?: number[]; rows?: ActionRowTargets } = {},
): ActionRunner {
  const msg = useMessageBox();
  const workspace = useWorkspace();
  const openWorkLog = useWorkLog();
  const openPrint = usePrintView();

  async function call(
    action: string,
    params?: ActionParams,
    ids?: number[],
  ): Promise<ActionResult | null> {
    try {
      return await api.post<ActionResult>(`/master/${screen}/action/${action}`, {
        ids: ids ?? defaultIds,
        ...(params ? { params } : {}),
      });
    } catch (err) {
      await msg.alert(errorMessage(err));
      return null;
    }
  }

  async function run(action: string, params?: ActionParams, ids?: number[]) {
    const result = await call(action, params, ids);
    if (!result) return;
    switch (result.kind) {
      case 'message':
        if (result.message) await msg.alert(result.message);
        break;
      case 'refreshed':
        if (result.message) await msg.alert(result.message);
        rows?.replaceRows(result.rows);
        break;
      case 'list':
        if (result.message) await msg.alert(result.message);
        rows?.showRows(result.rows);
        break;
      case 'cells':
        if (result.message) await msg.alert(result.message);
        rows?.patchRows(result.rows);
        break;
      case 'open':
        if (result.ids.length > 0) workspace.open(result.screen, result.ids);
        // No records: a new one in that screen, pre-filled, or the form's "No Record Found".
        else if (result.newRecord) workspace.open(result.screen, undefined, result.newRecord);
        else if (result.emptyMessage) await msg.alert(result.emptyMessage);
        break;
      case 'table':
        if (result.rows.length === 0 && result.emptyMessage) await msg.alert(result.emptyMessage);
        else sendTableToExcel(result.title, result.columns, result.rows);
        if (result.message) await msg.alert(result.message);
        break;
      case 'url':
        window.open(result.url, '_blank', 'noopener');
        break;
      case 'work-log':
        await openWorkLog({ logId: result.logId });
        break;
      case 'form':
        // Only the screen's own handler (call) puts these values into the form.
        if (result.message) await msg.alert(result.message);
        break;
      case 'print':
        // frmReport: the report's A4 pages, with the print dialog.
        if (result.message) await msg.alert(result.message);
        openPrint(result.document);
        break;
    }
  }

  return { call, run };
}
