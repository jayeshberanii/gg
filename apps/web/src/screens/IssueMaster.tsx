'use client';

import { type GridValue, issuePartyColor, issueRecordIsOld } from '@gglib/shared';
import { useState } from 'react';
import type { ContextMenuItem } from '@/components/ui/ContextMenu';
import { MasterScreen } from '@/features/master/MasterScreen';
import type { FieldSpec, FormContext, ScreenActions, ScreenSpec } from '@/features/master/types';
import { todayIso } from '@/lib/format';
import { BookTranDialog } from './BookTranDialog';
import type { ScreenProps } from './registry';

/**
 * Issue › Issue Master (frmIssueTran, "Issue Register"). Positions, widths and headers are
 * frmIssueTran.Designer.vb's (labels at x 6 / 385 / 715, boxes at x 156 / 513 / 844, every
 * label 4px below its box's top); the behaviour is in docs/screens/issue-master.md.
 */

const text = (v: GridValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());

/** ReadOnlyControls(False): the boxes "continue adding" disables. */
const continued = (c: FormContext) => c.continued;
/** FillData's one-day rule: a loaded record entered before yesterday. */
const old = (c: FormContext) =>
  c.strMode === 'Edit' &&
  c.loaded !== null &&
  issueRecordIsOld(
    Object.entries(c.loaded).find(([k]) => k.toLowerCase() === 'endate')?.[1] ?? null,
    todayIso(),
  );

function box(
  name: string,
  label: string,
  at: { x: number; y: number; w: number },
  labelX: number | null,
  extra: Partial<FieldSpec> = {},
): FieldSpec {
  return {
    name,
    label,
    ...(labelX === null ? {} : { labelAt: { x: labelX, y: at.y + 4 } }),
    at,
    ...extra,
  };
}

const kt = (nameColumn: string): Partial<FieldSpec> => ({ kt: true, nameColumn });

/** yyyy-MM-dd plus `days`. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso || todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The six-month / lost prompts after a Party or Ref Party pick: false for No. */
async function partyAllowed(ctx: FormContext, party: number): Promise<boolean> {
  const r = await ctx.call('party-counts', { party });
  if (r?.kind !== 'form') return false;
  const six = Number(r.fields.six ?? 0);
  const lost = Number(r.fields.lost ?? 0);
  if (six > 0) return ctx.confirm(`You have (${six}) six Months Old Book.\nContinue Issue Book?`);
  if (lost > 0) return ctx.confirm(`You Lost (${lost}) Books.\nContinue Issue Book?`);
  return true;
}

const clearBox = (ctx: FormContext, name: string) => {
  ctx.setField(name, '');
  ctx.setTag(name, 0);
};

const fields: FieldSpec[] = [
  // Column 1
  box('issue_date', 'Issue Date', { x: 156, y: 18, w: 152 }, 6, {
    date: true,
    disabledWhen: continued,
    // dtpissue_date_ValueChanged: Due = Issue + 90 (Adey or not).
    onUserChange: (v, ctx) => ctx.setField('due_date', addDays(v, 90)),
  }),
  {
    name: 'Adey',
    at: { x: 311, y: 18, w: 69 },
    checkbox: 'Adey',
    // chkAdey_CheckedChanged, Add mode only: Due = Issue + 3, or + 90 unchecked.
    onUserChange: (v, ctx) => {
      if (ctx.strMode === 'Add')
        ctx.setField('due_date', addDays(ctx.fields.issue_date ?? '', v === 'True' ? 3 : 90));
    },
  },
  box('party_cokt', 'Party Name', { x: 156, y: 58, w: 152 }, 6, {
    ...kt('party_coName'),
    readOnlyWhen: old,
    disabledWhen: continued,
    afterPick: (picked, ctx) => {
      if (picked.name === '') return;
      const row = picked.row ?? [];
      void (async () => {
        if (Number(row[10] ?? 0) === 1) {
          await ctx.alert('Party is Blocked', 'Cannot Issue Book');
          await ctx.cancel();
          return;
        }
        if (!(await partyAllowed(ctx, Number(picked.code) || 0))) {
          await ctx.cancel();
          return;
        }
        ctx.setField('party_add', text(row[3]));
        if (text(row[2]) !== '') ctx.setField('MobileNo', text(row[2]));
        ctx.setField('DepositTran', text(row[9]));
      })();
    },
  }),
  // txtCurBalance: the party's deposit balance (the grid's DepositTran).
  box('DepositTran', 'Cur Balance', { x: 311, y: 58, w: 71 }, null, {
    readOnly: true,
    noF2: true,
  }),
  box('party_add', 'Party Address', { x: 156, y: 98, w: 227 }, 6, {
    disabledWhen: continued,
    f2Params: (ctx) => ({ party: ctx.tags.party_cokt ?? 0 }),
  }),
  box('Ref_partykt', 'Ref Party', { x: 156, y: 138, w: 227 }, 6, {
    ...kt('Ref_partyName'),
    readOnlyWhen: (c) => c.strMode === 'Edit',
    disabledWhen: continued,
    afterPick: (picked, ctx) => {
      if (picked.name === '') return;
      const row = picked.row ?? [];
      void (async () => {
        if (Number(row[8] ?? 0) === 1) {
          await ctx.alert('Ref Party is Blocked', 'Cannot Issue Book');
          await ctx.cancel();
          return;
        }
        if (!(await partyAllowed(ctx, Number(picked.code) || 0))) {
          await ctx.cancel();
          return;
        }
        ctx.setField('Ref_add', text(row[2]));
      })();
    },
  }),
  // The ref party's PartyM.txtAddress; never saved.
  box('Ref_add', 'Ref Address', { x: 156, y: 178, w: 227 }, 6, {
    noF2: true,
    disabledWhen: continued,
  }),
  box('MobileNo', 'MobileNo', { x: 156, y: 218, w: 152 }, null, {
    disabledWhen: continued,
    f2Params: (ctx) => ({ party: ctx.tags.party_cokt ?? 0 }),
  }),
  box('slipno', 'SlipNo', { x: 311, y: 218, w: 71 }, null, {
    readOnlyWhen: old,
    // FillData disables the Slip of a recent record; "continue adding" disables it too.
    disabledWhen: (c) => c.continued || (c.strMode === 'Edit' && !old(c)),
    // The letter list, then "<letter> <next> "; Save takes the number again (NewSlip).
    afterPick: (picked, ctx) => {
      const letter = (picked.code || picked.name).trim();
      if (letter === '') return;
      void (async () => {
        const r = await ctx.call('next-slip', { letter });
        if (r?.kind !== 'form') return;
        ctx.setField('slipno', String(r.fields.slipno ?? '')); // "<letter> <n> ", as the desktop shows it
        ctx.setField('NewSlip', text(r.fields.NewSlip as GridValue));
      })();
    },
  }),
  // A slip from the generator: its letter (the number is taken again inside Save).
  { name: 'NewSlip', at: { x: 0, y: 0, w: 0 }, hidden: true },
  box('SearcherKt', 'Searcher', { x: 156, y: 259, w: 78 }, null, kt('SearcherName')),
  box('entrcodekt', 'LibNo', { x: 236, y: 259, w: 73 }, null, {
    ...kt('entrcodeName'),
    readOnlyWhen: old,
    afterPick: (picked, ctx) => {
      if (picked.name === '') return;
      const row = picked.row ?? [];
      void (async () => {
        const r = await ctx.call('check-libno', { tid: Number(picked.code) || 0 });
        if (r?.kind !== 'form') return;
        if (Number(r.fields.lab ?? 0) > 0) {
          await ctx.alert('LibNo is Used in LabIssue');
          clearBox(ctx, 'entrcodekt');
          return;
        }
        if (
          Number(r.fields.firstBook ?? 0) > 0 &&
          !(await ctx.confirm('LibNo is Used in Kruti Main Book\nDo you want to issue?'))
        ) {
          clearBox(ctx, 'entrcodekt');
          return;
        }
        ctx.setField('BookMastKt', text(row[3]));
        ctx.setTag('BookMastKt', Number(row[2]) || 0);
      })();
    },
  }),
  box('PatrikaKt', 'Patrika No', { x: 311, y: 259, w: 73 }, null, {
    ...kt('PatrikaName'),
    readOnlyWhen: old,
    afterPick: (picked, ctx) => {
      if (picked.name === '') return;
      void (async () => {
        const r = await ctx.call('check-patrika', { patrika: Number(picked.code) || 0 });
        if (r?.kind === 'form' && Number(r.fields.lab ?? 0) > 0) {
          await ctx.alert('LibNo is Used in LabIssue');
          clearBox(ctx, 'PatrikaKt');
        }
      })();
    },
  }),
  // TabStop = False; filled by the LibNo pick; its own F2 has no list.
  box('BookMastKt', 'Book Name', { x: 156, y: 298, w: 152 }, null, {
    ...kt('BookMastName'),
    readOnlyWhen: old,
    noF2: true,
  }),
  box('AnkNo', 'Ank', { x: 311, y: 298, w: 73 }, null, { noF2: true }),
  // Column 2
  box('due_date', 'Due Date', { x: 513, y: 18, w: 196 }, 385, {
    date: true,
    disabledWhen: continued,
  }),
  box('returned', 'Returned', { x: 513, y: 58, w: 196 }, 385, {
    options: ['No', 'Yes'],
    bitOptions: true,
    // cmbReturned_SelectedIndexChanged: "No" clears the Return Date.
    onUserChange: (v, ctx) => {
      if (v !== 'Yes') ctx.setField('returndate', '');
    },
  }),
  box('returndate', 'Return Date', { x: 513, y: 98, w: 196 }, 385, {
    mask: '00/00/0000',
    noF2: true,
    disabledWhen: (c) => c.fields.returned !== 'Yes',
  }),
  box('ConfmMarkkt', 'Confirm Mark', { x: 513, y: 138, w: 195 }, 385, {
    ...kt('ConfmMarkName'),
    disabledWhen: continued,
  }),
  box('ConfmReport', 'Confirm Report', { x: 513, y: 178, w: 195 }, 385, {
    disabledWhen: continued,
  }),
  box('ConfmBykt', 'Confirm By', { x: 513, y: 218, w: 195 }, 385, {
    ...kt('ConfmByName'),
    disabledWhen: continued,
  }),
  box('Confmdt', 'Confirm Date', { x: 513, y: 258, w: 195 }, 385, {
    mask: '00/00/0000',
    noF2: true,
    disabledWhen: (c) => c.continued || !((c.tags.ConfmBykt ?? 0) > 0),
  }),
  box('issue_no', 'Old IssueNo', { x: 513, y: 298, w: 196 }, 385, { readOnly: true }),
  // Column 3
  box('replacebykt', 'Replace By', { x: 844, y: 18, w: 158 }, 715, {
    ...kt('replacebyName'),
    disabledWhen: continued,
  }),
  box('ActionDt', 'Action Date', { x: 844, y: 58, w: 158 }, 715, {
    mask: '00/00/0000',
    noF2: true,
    disabledWhen: (c) => !((c.tags.replacebykt ?? 0) > 0),
  }),
  box('ActionReport', 'Action Report', { x: 844, y: 98, w: 158 }, 715, {
    disabledWhen: continued,
  }),
  box('receivedFromKt', 'Received From', { x: 844, y: 138, w: 158 }, 715, {
    ...kt('receivedFromName'),
    disabledWhen: continued,
  }),
  box('CostBearBykt', 'CostBear By', { x: 844, y: 178, w: 158 }, 715, {
    ...kt('CostBearByName'),
    disabledWhen: continued,
  }),
  box('Amout', 'Amount', { x: 844, y: 218, w: 158 }, 715, {
    noF2: true,
    disabledWhen: continued,
  }),
  // tblSearch's column is "IssueTran.remark", so the desktop's F2 throws: none here.
  box('remark', 'Remark', { x: 844, y: 258, w: 158 }, 715, {
    noF2: true,
    disabledWhen: continued,
  }),
  // Only Return Selected sets it.
  box('Receiverkt', 'Receiver', { x: 844, y: 298, w: 158 }, 715, {
    ...kt('ReceiverName'),
    readOnly: true,
  }),
];

const spec: ScreenSpec = {
  screen: 'issue-master',
  panelHeight: 344,
  panelWidth: 1008,
  entryLabel: true,
  // Save writes Locked = Returned: a returned row has the Locked toolbar.
  lockedColumns: ['Locked'],
  fields,
  labels: [
    { text: 'Mobile/Slip No', at: { x: 6, y: 222 } },
    { text: 'Search/LibNo/PNo', at: { x: 8, y: 262 } },
    { text: 'Book Name/Ank', at: { x: 6, y: 302 } },
  ],
  columns: [
    { header: 'IssuTranKm', field: 'IssueTranKm', width: 90 },
    { header: 'entrcodekt', field: 'entrcodekt', hidden: true },
    { header: 'LibNo', field: 'entrcodeName', width: 120 },
    { header: 'Ank', field: 'AnkNo', width: 80 },
    { header: 'Party_Cokt', field: 'party_cokt', hidden: true },
    // dgMain_CellFormatting: DarkRed for a lost book (this cell only).
    { header: 'Party Name', field: 'party_coName', width: 270, textColor: issuePartyColor },
    { header: 'Party Category', field: 'PartyCategory', width: 150 },
    { header: 'Cur Balance', field: 'DepositTran', width: 100 },
    { header: 'SlipNo', field: 'SlipNo', width: 130 },
    { header: 'Issue Date', field: 'issue_date', width: 110, format: 'date' },
    { header: 'MobileNo', field: 'MobileNo', width: 100 },
    { header: 'Returned', field: 'returned', width: 100 },
    { header: 'ReturnDate', field: 'returndate', width: 120, format: 'date' },
    { header: 'Ref_Partykt', field: 'Ref_partykt', hidden: true },
    { header: 'Confirm Mark', field: 'ConfmMarkName', width: 100 },
  ],
  // Txt_Leave: Confirm By / Replace By without a pick clear their dates.
  onFieldLeave: (name, _fields, tags): Record<string, string> | null => {
    if (name === 'ConfmBykt' && !((tags.ConfmBykt ?? 0) > 0)) return { Confmdt: '' };
    if (name === 'replacebykt' && !((tags.replacebykt ?? 0) > 0)) return { ActionDt: '' };
    return null;
  },
  // Save(): the party's six-month-old books change the question.
  saveQuestion: async ({ tags, action }) => {
    const r = await action('save-six-month', { party: tags.party_cokt ?? 0 });
    const ask = 'Are You Sure to Save This Record?';
    return r?.kind === 'form' && Number(r.fields.six ?? 0) > 0
      ? `Return 6 Month Old Book.\n${ask}`
      : ask;
  },
  // After an Add: the next row keeps party, ref, address, mobile, slip, dates and searcher.
  continueAdding: {
    question: 'Do You Want to Continue With Add New Record?',
    clear: ['entrcodekt', 'BookMastKt', 'PatrikaKt', 'NewSlip'],
    defaults: ['issue_no'],
    fromRow: { slipno: 'SlipNo' },
  },
  searchF2: {
    'return date': returnDateSearch,
    returned: async (a) => {
      const picked = await a.pick('returned-values', { selectFirst: true });
      const code = picked?.code[0];
      if (code === undefined || code === '') return;
      await a.run('search-returned', { returned: Number(code) });
    },
  },
};

/** Search By "Return Date", F2: the range InputBox (dd/MM/yyyy HH:mm:ss - dd/MM/yyyy HH:mm:ss). */
async function returnDateSearch(a: ScreenActions) {
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const answer = await a.input(
    'Please Enter Range in dd/MM/yyyy HH:mm:ss Format(Ex.:- (01/12/2015 00:00:00 - 31/12/2015 23:00:00)',
    `${today} 00:00:00 - ${today} 23:00:00`,
  );
  if (answer === null) return;
  const parts = answer.split('-');
  if (parts.length !== 2) {
    await a.alert(
      'Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015 00:00:00 - 31/12/2015 23:00:00)',
    );
    return;
  }
  await a.run('search-return-date', { from: parts[0]!.trim(), to: parts[1]!.trim() });
}

function menu(a: ScreenActions, openBookT: (ids: number[]) => void): ContextMenuItem[] {
  const item = (label: string, onSelect: () => void, shortcut?: string): ContextMenuItem => ({
    kind: 'item',
    label,
    onSelect,
    ...(shortcut ? { shortcut } : {}),
  });
  const printSlip = (issueOnly: boolean) => {
    if (a.currentId !== null) void a.run('print-slip', { issueOnly }, [a.currentId]);
  };
  return [
    {
      kind: 'submenu',
      label: 'Print Report',
      items: [
        // Form_Load adds the Config_Master layouts with a shortcut under Selected Column.
        a.printLayouts.length > 0
          ? {
              kind: 'submenu',
              label: 'Selected Column',
              items: a.printLayouts,
              onSelect: a.printSelectedColumn,
            }
          : item('Selected Column', a.printSelectedColumn),
        item('Send To Excel', a.sendToExcel),
        {
          kind: 'submenu',
          label: 'Issue Slip',
          items: [item('All', () => printSlip(false)), item('Issue Only', () => printSlip(true))],
        },
      ],
    },
    {
      kind: 'submenu',
      label: 'Send To',
      items: [
        item('BookM', () => void a.run('send-bookm')),
        // frmBookTranNew over those LibNos, as a dialog.
        item('BookT', async () => {
          const r = await a.call('send-bookt');
          if (r?.kind !== 'open') return;
          if (r.ids.length === 0) await a.alert(r.emptyMessage);
          else openBookT(r.ids);
        }),
        item('PartyMaster', async () => {
          const answer = await a.yesNoCancel(
            'Only Party(Press Yes)\nOnly Ref Party(Press No)\nBoth Party And Ref Party(Press Cancel)',
          );
          const which = answer === 'yes' ? 'party' : answer === 'no' ? 'ref' : 'both';
          await a.run('send-party', { which });
        }),
      ],
    },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [
        item(
          'Return Selected Record',
          async () => {
            if (a.selectedIds.length === 0) return;
            if (await a.confirm('Are You Sure To Return Selected Records?'))
              await a.run('return-selected');
          },
          'F6',
        ),
        item('Show All Records', () => void a.run('show-all')),
        item('Show Lost Books', () => void a.run('show-lost')),
        item('Show Issued Books Having Single Copy', () => void a.run('show-single-copy')),
        item('Show Issued Books Having Multiple Copy', () => void a.run('show-multi-copy')),
        item('Replace LibNo For Selected Records', async () => {
          if (a.selectedIds.length === 0) return;
          const password = await a.askPassword();
          if (password === null) return;
          const r = await a.call('replace-libno', { password });
          if (r?.kind !== 'message' || r.message !== 'ask-libno') {
            if (r?.kind === 'message' && r.message) await a.alert(r.message);
            return;
          }
          const picked = await a.pick('replace-libnos', { selectFirst: true });
          const tid = Number(picked?.code[0]) || 0;
          if (tid > 0) await a.run('replace-libno', { password, tid });
        }),
      ],
    },
  ];
}

export function IssueMaster(props: ScreenProps) {
  const [bookTids, setBookTids] = useState<number[] | null>(null);
  return (
    <>
      {/* The whole cntMenu: Issue Slip sits inside Print Report. */}
      <MasterScreen spec={spec} {...props} menu={(a) => menu(a, setBookTids)} />
      {bookTids && (
        <BookTranDialog bookId={0} tids={bookTids} showAll onClose={() => setBookTids(null)} />
      )}
    </>
  );
}
