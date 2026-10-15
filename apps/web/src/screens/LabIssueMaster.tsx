'use client';

import { canDeliverLabIssue, labIssueButtonsOff, labIssueRowColor } from '@gglib/shared';
import { useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { FieldSpec, ScreenActions, ScreenSpec } from '@/features/master/types';
import { BookTranDialog } from './BookTranDialog';
import type { ScreenProps } from './registry';

/**
 * Issue › Lab Issue Master (frmLabIssueMaster). Positions, widths and headers are
 * frmLabIssueMaster.Designer.vb's: labels at x 13 / 370 / 715, boxes at x 136 / 502 / 844, all
 * but LibNo and For disabled (Enabled = False).
 */
const C1 = { label: 13, x: 136, w: 227 };
const C2 = { label: 370, x: 502, w: 195 };
const C3 = { label: 715, x: 844, w: 158 };

function box(
  name: string,
  label: string,
  col: typeof C1,
  y: number,
  extra: Partial<FieldSpec> = {},
): FieldSpec {
  return {
    name,
    label,
    labelAt: { x: col.label, y: y + 4 },
    at: { x: col.x, y, w: col.w },
    alwaysDisabled: true,
    ...extra,
  };
}

const kt = (nameColumn: string): Partial<FieldSpec> => ({
  kt: true,
  nameColumn,
});

function buildSpec(openBookT: (ids: number[]) => void): ScreenSpec {
  return {
    screen: 'lab-issue-master',
    panelHeight: 192,
    panelWidth: 1008,
    // btnCopy_Click only resets TranKm outside of editing: Copy does nothing.
    noCopy: true,
    fields: [
      box('BookTKt', 'LibNo', C1, 18, {
        ...kt('BookTName'),
        alwaysDisabled: false,
        // Txt_KeyDown: the free LibNos in Add mode, the book's other copies in Edit mode.
        f2Params: (ctx) => ({ mode: ctx.strMode, bookTKt: ctx.tags.BookTKt ?? 0 }),
      }),
      box('Forkt', 'For', C2, 18, { ...kt('ForName'), alwaysDisabled: false }),
      box('Statuskt', 'Status', C3, 18, kt('StatusName')),
      box('enuserKt', 'Requested By', C1, 58, kt('enuserName')),
      box('DeliveryBykt', 'Delivered By', C2, 58, kt('DeliveryByName')),
      box('Transferuserkt', 'Transfer To', C3, 58, kt('TransferuserName')),
      // FillData shows the dates as dd-MM-yyyy.
      box('endate', 'Request Date', C1, 98, { datetimeText: 'date' }),
      box('DeliveryDt', 'Deliver Date', C2, 98, { datetimeText: 'date' }),
      box('TransferDt', 'Transfer Date', C3, 98, { datetimeText: 'date' }),
      // {
      //   name: 'CancelReq',
      //   at: { x: 136, y: 142, w: 116 },
      //   checkbox: 'Cancel Req',
      //   alwaysDisabled: true,
      // },
      box('RetbackBykt', 'Return By', C2, 142, kt('RetbackByName')),
      box('RetbackDt', 'Return Date', C3, 142, { datetimeText: 'date' }),
    ],
    columns: [
      { header: 'Id', field: 'LabIssueMkm', width: 80 },
      { header: 'Type', field: 'Type', width: 100 },
      { header: 'LibNoKt', field: 'BookTKt', hidden: true },
      { header: 'LibNo', field: 'BookTName', width: 100 },
      { header: 'StatusKt', field: 'Statuskt', hidden: true },
      { header: 'Status', field: 'StatusName', width: 110 },
      { header: 'ReqByKt', field: 'enuserKt', hidden: true },
      { header: 'Request By', field: 'enuserName', width: 120 },
      { header: 'Request Date', field: 'endate', width: 125, format: 'datetime' },
      { header: 'ForKt', field: 'Forkt', hidden: true },
      { header: 'For', field: 'ForName', width: 120 },
      // Unbound on the desktop (its mapping is commented out), so always empty.
      { header: 'Book Name', field: 'BkName', width: 130 },
      { header: 'DeliverByKt', field: 'DeliveryBykt', hidden: true },
      { header: 'Deliver By', field: 'DeliveryByName', width: 120 },
      { header: 'Deliver Date', field: 'DeliveryDt', width: 125, format: 'datetime' },
      { header: 'RetByKt', field: 'RetbackBykt', hidden: true },
      { header: 'Return By', field: 'RetbackByName', width: 120 },
      { header: 'Return Date', field: 'RetbackDt', width: 125, format: 'datetime' },
      { header: 'Transferuserkt', field: 'Transferuserkt', hidden: true },
      { header: 'Transfer To', field: 'TransferuserName', width: 120 },
      // Web-only: the desktop grid ends at Transfer To (txtTransferDt is on the form only).
      { header: 'Transfer Date', field: 'TransferDt', width: 125, format: 'datetime' },
    ],
    // dgMain_CellFormatting.
    rowTextColor: (row) => labIssueRowColor(row),
    // FillData: Delete off for a delivered row, Modify off for a returned one.
    buttonsOff: (record) => labIssueButtonsOff(record),
    contextMenu: (a) => menu(a, openBookT),
  };
}

function menu(a: ScreenActions, openBookT: (ids: number[]) => void): ContextMenuItem[] {
  const item = (label: string, onSelect: () => void, shortcut?: string): ContextMenuItem => ({
    kind: 'item',
    label,
    onSelect,
    ...(shortcut ? { shortcut } : {}),
  });

  /** Deliver / Return: user type 3 only (curr_utypeid <> 3), then the question. */
  async function operatorAction(action: string, refused: string, question: string) {
    if (!a.user || !canDeliverLabIssue(a.user)) {
      await a.alert(refused);
      return;
    }
    if (await a.confirm(question)) await a.run(action);
  }

  return [
    {
      kind: 'submenu',
      label: 'Send To',
      items: [
        item('BookM', () => void a.run('send-to-book-m')),
        // frmBookTranNew over those LibNos, as a dialog.
        item('BookT', async () => {
          const r = await a.call('send-to-book-t');
          if (r?.kind === 'message') await a.alert(r.message);
          else if (r?.kind === 'open') {
            if (r.ids.length === 0) await a.alert(r.emptyMessage);
            else openBookT(r.ids);
          }
        }),
        item('Patrika', () => void a.run('send-to-patrika')),
      ],
    },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [
        item('Cancel Request for Selected Records', async () => {
          const r = await a.call('cancel-request');
          if (r?.kind !== 'message') return;
          if (r.message !== 'ask-confirm') {
            await a.alert(r.message);
            return;
          }
          if (await a.confirm('Are u Sure to cancel request for Current Book?'))
            await a.run('cancel-request', { confirmed: true });
        }),
        item(
          'Deliver Selected Book',
          () =>
            void operatorAction(
              'deliver',
              'U have no right to Deliver the Books',
              'Are u Sure to Deliver Selected Books?',
            ),
          'F4',
        ),
        item(
          'Return Selected Book',
          () =>
            void operatorAction(
              'return',
              'U have no right to Return the Books',
              'Are Selected Books Returned Back to Library?',
            ),
          'F5',
        ),
        // item('Transfer Current Book To Me', async () => {
        //   if (a.currentId === null) return;
        //   if (await a.confirm('Are u Sure to Transfer Current Book On your Account?'))
        //     await a.run('transfer-to-me', undefined, [a.currentId]);
        // }),
        item('Show All Records', () => void a.run('show-all')),
        item('Show All Records of Current User', () => void a.run('show-mine')),
        // item('Update For(Party) For Selected Records ', async () => {
        //   const r = await a.call('update-for-party');
        //   if (r?.kind !== 'message') return;
        //   if (r.message !== 'ask-party') {
        //     await a.alert(r.message, 'Records Cannot Be Updated');
        //     return;
        //   }
        //   const picked = await a.pick('parties', { selectFirst: true });
        //   // Fix: a cancelled picker changes nothing (the desktop cleared For).
        //   const party = Number(picked?.code[0]) || 0;
        //   if (party > 0) await a.run('update-for-party', { party });
        // }),
      ],
    },
  ];
}

export function LabIssueMaster(props: ScreenProps) {
  const [bookTids, setBookTids] = useState<number[] | null>(null);
  const [spec] = useState(() => buildSpec(setBookTids));
  return (
    <>
      <MasterScreen spec={spec} {...props} />
      {bookTids && (
        <BookTranDialog bookId={0} tids={bookTids} showAll onClose={() => setBookTids(null)} />
      )}
    </>
  );
}
