'use client';

import { ownerLocked } from '@gglib/shared';
import { useMemo, useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { LibraryFileDialog } from '@/features/master/LibraryFileDialog';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { FieldSpec, FormContext, ScreenActions, ScreenSpec } from '@/features/master/types';
import type { ScreenProps } from './registry';
import { BookTranDialog } from './BookTranDialog';

/** Designer columns: labels at x 13 / 366 / 711, boxes at x 149 / 503 / 844. */
const C1 = { label: 13, x: 149, w: 196 };
const C2 = { label: 366, x: 503, w: 195 };
const C3 = { label: 711, x: 844, w: 158 };

function box(
  name: string,
  label: string,
  col: typeof C1,
  y: number,
  labelY: number,
  extra: Partial<FieldSpec> = {},
): FieldSpec {
  return {
    name,
    label,
    labelAt: { x: col.label, y: labelY },
    at: { x: col.x, y, w: col.w },
    ...extra,
  };
}

/** A ...Kt box: shows `<col>Name`, keeps the id. */
const kt = (
  name: string,
  nameColumn: string,
  label: string,
  col: typeof C1,
  y: number,
  ly: number,
) => box(name, label, col, y, ly, { kt: true, nameColumn });

// const RETURNED = (f: Record<string, string>) => f.returned === 'Yes';

/**
 * Issue › Inward Master (frmInwordMaster, "Inword Master"). Positions, widths and headers are
 * frmInwordMaster.designer.vb's; the behaviour is in docs/screens/inward-master.md.
 */
const buildSpec = (): ScreenSpec => ({
  screen: 'inward-master',
  panelHeight: 240,
  panelWidth: 1008,
  entryLabel: true,
  lockedColumns: ['Locked'],
  // FillData: a non-admin's toolbar is Locked on a record someone else entered.
  lockedWhen: (record, user) => ownerLocked(record, user),
  fields: [
    // Column 1
    box('InOut', 'In/Out', C1, 18, 18, { options: ['IN', 'OUT'], bitOptions: true }),
    kt('itemkt', 'itemName', 'Item', C1, 58, 59),
    kt('viakt', 'viaName', 'Via', C1, 98, 100),
    // kt('forkt', 'forName', 'For', C1, 138, 141),
    // tblSearch's F2EntryText for paidamount is broken SQL (the desktop shows the error).
    box('paidamount', 'Paid Amount', C1, 138, 141, { noF2: true }),
    // box('subject', 'subject', C1, 218, 223),
    // box('Physicallocation', 'Physical Loca.', C1, 258, 264),
    // box('StatusRem', 'Status Remark', C1, 178, 182,),
    // txtReturDate (disabled, always blank) or dtpreturndate, by cmbReturned.
    // {
    //   name: 'ReturDate',
    //   at: { x: C1.x, y: 335, w: C1.w },
    //   readOnly: true,
    //   alwaysDisabled: true,
    //   noF2: true,
    //   visibleWhen: (f) => !RETURNED(f),
    // },
    // {
    //   name: 'returndate',
    //   label: 'Return Date',
    //   at: { x: C1.x, y: 338, w: C1.w },
    //   date: true,
    //   visibleWhen: RETURNED,
    // },
    // Column 2
    {
      ...kt('Vibhagkt', 'VibhagName', 'Vibhag', C2, 18, 18),
      // Txt_KeyDown: a picked Vibhag gets its next VibhagSrNo.
      afterPick: (picked, ctx) => {
        const vibhagkt = Number(picked.code) || 0;
        if (vibhagkt <= 0) return;
        void (async () => {
          const r = await ctx.call('next-vibhag-srno', { vibhagkt });
          if (r?.kind === 'form' && r.fields.VibhagSrNo !== null)
            ctx.setField('VibhagSrNo', String(r.fields.VibhagSrNo));
        })();
      },
    },
    kt('fromkt', 'fromName', 'From', C2, 58, 59),
    box('RefrenceNm', 'Ref. Name', C2, 98, 100),
    // kt('effortskt', 'effortsName', 'Efforts', C2, 138, 141),
    box('indate', 'In Date', C2, 138, 141, { date: true }),
    box('detail', 'Detail', C2, 178, 182),
    // box('ToReturned', 'To Returned', C2, 258, 264, { options: ['No', 'Yes'], bitOptions: true }),
    // box('GeneralRemark', 'General Rem.', C2, 298, 305),
    // box('returnremark', 'Return Rem.', C2, 340, 346),
    // Column 3
    box('VibhagSrNo', 'VibhagSrNo', C3, 18, 18, { noF2: true }),
    // kt('praptypekt', 'praptypeName', 'Prapt Type', C3, 58, 59),
    kt('intypekt', 'intypeName', 'In Type', C3, 58, 59),
    box('refno', 'Ref No', C3, 98, 100),
    // kt('inbykt', 'InByName', 'In By', C3, 178, 182),
    // F2 is an OpenFileDialog on the desktop: here it lists the library folders the server
    // reaches (LibraryFileDialog), and the box can still be typed into.
    // box('PCLocation', 'PC Location', C3, 218, 223, { onF2: pickFile }),
    kt('Statuskt', 'StatusName', 'Status', C3, 138, 141),
    // box('returned', 'Returned', C3, 298, 305, { options: ['No', 'Yes'], bitOptions: true }),
    // CheckWorkAsign's count; F2 opens Work Given for this inward (Edit mode only).
    // box('WorkGivenTran', 'Work Given', C3, 342, 346, {
    //   readOnly: true,
    //   onF2: (ctx) => {
    //     if (ctx.strMode === 'Add' || ctx.tranKm <= 0) return;
    //     void ctx.run('work-given-of', undefined, [ctx.tranKm]);
    //   },
    // }),
  ],
  // labels: [{ text: 'Return Date', at: { x: 13, y: 346 } }],
  columns: [
    { header: 'inwordkm', field: 'inwordkm', width: 5 },
    { header: 'Vibhag', field: 'VibhagName', width: 150 },
    { header: 'VibhagSrNo', field: 'VibhagSrNo', width: 100 },
    { header: 'InOut', field: 'InOut', width: 100 },
    { header: 'InDate', field: 'InDat', width: 100, format: 'date' },
    { header: 'In Type', field: 'intypeName', width: 100 },
    { header: 'From', field: 'fromName', width: 100 },
    // { header: 'For', field: 'forName', width: 150 },
    { header: 'item', field: 'itemName', width: 150 },
    // { header: 'Subject', field: 'subject', width: 100 },
    { header: 'Detail', field: 'detail', width: 200 },
    { header: 'Status', field: 'StatusName', width: 100 },
  ],
  // clsCom.clear empties the text boxes only: the combos keep the record's values.
  onNew: {
    keep: ['InOut', 'ToReturned', 'returned'],
    params: ({ tags }): Record<string, number> =>
      tags.Vibhagkt ? { vibhagkt: tags.Vibhagkt } : {},
  },
  // btnCopy_Click: the copy gets its Vibhag's next VibhagSrNo (the desktop tests Via; see the note).
  copy: { clear: [], loadTrans: [], newDefaults: true },
});

export function InwardMaster(props: ScreenProps) {
  const [bookTids, setBookTids] = useState<number[] | null>(null);
  /** txtPCLocation's OpenFileDialog, with the box it fills. */
  const [picking, setPicking] = useState<FormContext | null>(null);
  const spec = useMemo(() => buildSpec(), []);

  const menu = (a: ScreenActions): ContextMenuItem[] => [
    {
      kind: 'submenu',
      label: 'Print Report',
      items: [
        // Form_Load adds the Config_Master layouts under Selected Column itself.
        a.printLayouts.length > 0
          ? {
              kind: 'submenu',
              label: 'Selected Column',
              items: a.printLayouts,
              onSelect: a.printSelectedColumn,
            }
          : { kind: 'item', label: 'Selected Column', onSelect: a.printSelectedColumn },
      ],
    },
    {
      kind: 'submenu',
      label: 'Send To',
      items: [
        // { kind: 'item', label: 'WorkGivenM', onSelect: () => void a.run('send-to-work-given') },
        { kind: 'item', label: 'BookM', onSelect: () => void a.run('send-to-book-m') },
        {
          kind: 'item',
          label: 'BookT',
          // frmBookTranNew with a WhereCondition, shown as a dialog.
          onSelect: async () => {
            const result = await a.call('send-to-book-t');
            if (result?.kind !== 'open') return;
            if (result.ids.length === 0) await a.alert(result.emptyMessage);
            else setBookTids(result.ids);
          },
        },
        { kind: 'item', label: 'Party Master', onSelect: () => void a.run('send-to-party') },
        // {
        //   kind: 'item',
        //   label: 'Letter Bhet Master',
        //   onSelect: () => void a.run('send-to-letter-bhet', { currentId: a.currentId ?? 0 }),
        // },
      ],
    },
  ];

  return (
    <>
      <MasterScreen spec={spec} {...props} menu={menu} />
      {bookTids && (
        <BookTranDialog bookId={0} tids={bookTids} showAll onClose={() => setBookTids(null)} />
      )}
      {picking && (
        <LibraryFileDialog
          screen="inward-master"
          initialPath={picking.fields.PCLocation ?? ''}
          onCancel={() => setPicking(null)}
          onPick={(path) => {
            // If DLGOPENFile.FileName.Trim <> "" Then txtPCLocation.Text = DLGOPENFile.FileName
            picking.setField('PCLocation', path);
            setPicking(null);
          }}
        />
      )}
    </>
  );
}
