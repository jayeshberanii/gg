'use client';

import type { GridRow } from '@gglib/shared';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { FieldSpec, ScreenSpec } from '@/features/master/types';
import { BOOK_TRAN, letterMenu } from './letterCommon';
import type { ScreenProps } from './registry';

/** Designer columns: labels at x 8 / 368 / 682, boxes at x 165 (w 197) / 517 (w 161) / 840 (w 158). */
const C1 = { label: 8, x: 165, w: 197 };
const C2 = { label: 368, x: 517, w: 161 };
const C3 = { label: 682, x: 840, w: 158 };

const box = (
  name: string,
  label: string,
  col: typeof C1,
  y: number,
  labelY: number,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({
  name,
  label,
  labelAt: { x: col.label, y: labelY },
  at: { x: col.x, y, w: col.w },
  ...extra,
});

/** A box that shares a label with its neighbour ("Party Name/Author"): no label of its own. */
const half = (
  name: string,
  label: string,
  x: number,
  w: number,
  extra: Partial<FieldSpec> = {},
) => ({
  name,
  label,
  at: { x, y: 90, w },
  ...extra,
});

/** A `date` column as the local date it names (DataGridView compares the Date with Now). */
function localDate(v: unknown): Date | null {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * dgMain_CellFormatting: Running with a past reminder date in red, Completed in green. A NULL
 * reminder date counts as not overdue (the desktop throws per cell).
 */
export function demandRowColor(row: GridRow, now = new Date()): string | undefined {
  const status = String(row.StatusTypeName ?? '')
    .trim()
    .toLowerCase();
  const due = localDate(row.NextReminderDt);
  if (status === 'running' && due !== null && due < now) return '#ff0000';
  if (status === 'completed') return '#008000';
  return undefined;
}

/**
 * Issue › Letter Demand (frmLetterDemandM, "Letter Demand"). Positions, widths and headers are
 * frmLetterDemandM.Designer.vb's; the behaviour is in docs/screens/letter-demand.md.
 */
const spec: ScreenSpec = {
  screen: 'letter-demand',
  panelHeight: 294,
  panelWidth: 1008,
  fields: [
    // Column 1
    box('LetterDate', 'Letter Date', C1, 18, 23, { date: true }),
    box('ConcernedPersonKt', 'Concerned Person', C1, 54, 58, {
      kt: true,
      nameColumn: 'ConcernedPersonName',
    }),
    half('PartyName', 'Party Name', 165, 99),
    half('AuthorKt', 'Author', 265, 97, { kt: true, nameColumn: 'AuthorName' }),
    box('PartyAddress', 'Party Address', C1, 126, 128),
    box('BookTran', 'Book Detail', C1, 162, 163, { trans: 'BookTran' }),
    {
      name: 'Letter',
      label: 'Letter',
      labelAt: { x: 8, y: 198 },
      at: { x: 165, y: 198, w: 840 },
      h: 84,
    },
    // Column 2
    box('LetterNo', 'Letter No', C2, 18, 23, { noF2: true }),
    box('LetterTypekt', 'Letter Type', C2, 54, 58, { kt: true, nameColumn: 'LetterTypeName' }),
    half('Vishay', 'Vishay', 517, 81),
    half('PrakashakKt', 'Prakashak', 599, 79, { kt: true, nameColumn: 'PrakashakName' }),
    box('PagesAttached', 'Page Attached', C2, 126, 128, { noF2: true }),
    box('FollowUpRem', 'FollowUp Remark', C2, 162, 163),
    // Column 3
    box('NextReminderDt', 'NextReminder Date', C3, 18, 23, { date: true }),
    box('StatusTypekt', 'Status Type', C3, 54, 58, { kt: true, nameColumn: 'StatusTypeName' }),
    box('StatusRemark', 'Status Remark', C3, 90, 93),
    box('WorkGivenMkt', 'WorkGivenMkt', C3, 126, 128, {
      kt: true,
      nameColumn: 'WorkGivenMName',
      f2SearchText: true,
    }),
    box('MagazineKt', 'Magazine', C3, 162, 163, { kt: true, nameColumn: 'MagazineName' }),
  ],
  labels: [
    { text: 'Party Name/Author', at: { x: 8, y: 93 } },
    { text: 'Vishay/Prakashak', at: { x: 368, y: 93 } },
  ],
  trans: { BookTran: BOOK_TRAN },
  rowTextColor: (row) => demandRowColor(row),
  columns: [
    { header: 'Id', field: 'LetterDemandMkm', width: 5 },
    { header: 'LetterNo', field: 'LetterNo', width: 100 },
    { header: 'Letter Date', field: 'LetterDate', width: 100, format: 'date' },
    { header: 'Concerned Person', field: 'ConcernedPersonName', width: 100 },
    { header: 'Party Name', field: 'PartyName', width: 120 },
    { header: 'Party Address', field: 'PartyAddress', width: 180 },
    { header: 'Letter Type', field: 'LetterTypeName', width: 130 },
    { header: 'Vishay', field: 'Vishay', width: 150 },
    { header: 'Pg. Attach', field: 'PagesAttached', width: 100 },
    { header: 'Followup Rem', field: 'FollowUpRem', width: 100 },
    { header: 'NextRem Date', field: 'NextReminderDt', width: 100, format: 'date' },
    { header: 'Status Type', field: 'StatusTypeName', width: 120 },
    { header: 'Status Remark', field: 'StatusRemark', width: 100 },
    { header: 'WorkGiven', field: 'WorkGivenMName', width: 100 },
    { header: 'Magazine', field: 'MagazineName', width: 100 },
  ],
};

export function LetterDemand(props: ScreenProps) {
  return (
    <MasterScreen
      spec={spec}
      {...props}
      menu={(a) =>
        letterMenu(a, {
          printLabel: 'Print Demand',
          printAction: 'print-demand',
          // sendTo: { label: 'WorkGiven Master', action: 'send-to-work-given' },
          attachmentsLabel: 'Show Attachment',
        })
      }
    />
  );
}
