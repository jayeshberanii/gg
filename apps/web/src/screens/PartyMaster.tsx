'use client';

import { type ChildRow, UserType } from '@gglib/shared';
import { useMemo, useState } from 'react';
import { ADDRESS_TRANS } from '@/features/master/commonTrans';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type { FieldSpec, ScreenActions, ScreenSpec, TransSpec } from '@/features/master/types';
import { BookTranDialog } from './BookTranDialog';
import type { ScreenProps } from './registry';

/** Format(DateTime.Now.Date, "dd/MM/yyyy") */
const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** frmDisplayTransNew.SetForm_PartyM */
const TRANS: Record<string, TransSpec> = {
  // TranName "Address", FormName "Common".
  AddressTran: ADDRESS_TRANS,
  RelationTran: {
    column: 'RelationTran',
    hidden: ['partyMRelkm'],
    editable: [],
    lookups: {
      tablenm: { setName: 'TableNm', next: 'TableId' },
      tableid: { setName: 'TableId', valueFromTag: true, perRow: true, next: 'Remark' },
    },
    // The popup's partyMRelkm is thrown away: Save gives every row a new MAX + 1.
    template: () => [0, '', 0, ''],
    firstColumn: 'TableNm',
    onlyWhenTextChanged: true,
  },
  DepositTran: {
    column: 'DepositTran',
    hidden: ['partyDepositkm'],
    editable: ['CreditAmt', 'DebitAmt', 'SrNo'],
    lookups: {
      depositdate: {
        setName: 'DepositDate',
        input: {
          prompt: 'Please Enter Deposit Date(Ex-dd/MM/yyyy)',
          initial: (row?: ChildRow) => netString(row?.DepositDate).trim() || today(),
          keepOnCancel: true,
        },
      },
    },
    template: () => [0, today(), 0, 0, 0, 0],
    firstColumn: 'DepositDate',
    onlyWhenTextChanged: true,
  },
  AnyaNameTran: {
    column: 'AnyaNameTran',
    hidden: ['PartyMAnyNmKm', 'BookTKt'],
    editable: ['AnyaNm', 'PageNo'],
    lookups: { libno: { setKt: 'BookTKt', setName: 'LibNo', also: { Samvat: 5 }, next: 'PageNo' } },
    tempKey: 'PartyMAnyNmKm',
    firstColumn: 1,
  },
};

const box = (
  name: string,
  label: string,
  labelAt: [number, number],
  at: [number, number, number],
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({
  name,
  label,
  labelAt: { x: labelAt[0], y: labelAt[1] },
  at: { x: at[0], y: at[1], w: at[2] },
  ...extra,
});
const kt = (nameColumn: string): Partial<FieldSpec> => ({ kt: true, nameColumn });
/** EnableDisableBlockParty */
const amasterOnly: Partial<FieldSpec> = { editableFor: (u) => u.userType === UserType.AMaster };

/**
 * Master › Party Master (frmPartyMaster). Field and column positions, widths and headers are the
 * ones in frmPartyMaster.Designer.vb.
 */
const spec: ScreenSpec = {
  screen: 'party-master',
  panelHeight: 190,
  panelWidth: 1008,
  entryLabel: true,
  fields: [
    // box('PrefixNm', 'Prefix', [13, 21], [110, 18, 222]),
    box('PName', 'Party Name', [13, 21], [110, 18, 222]),
    // box('AnyaNameTran', 'Anya Name', [13, 99], [110, 96, 222], { trans: 'AnyaNameTran' }),
    box('AddressTran', 'Address', [341, 21], [457, 18, 184], { trans: 'AddressTran' }),
    box('Sampradaykt', 'Sampraday', [656, 21], [756, 18, 227], kt('SampradayName')),
    box('Gurukt', 'Guru', [13, 60], [110, 57, 222], kt('GuruName')),
    box('Categorykt', 'Category', [341, 60], [457, 57, 184], kt('CategoryName')),
    box('BlockParty', 'Block Party', [13, 99], [110, 96, 222], {
      options: ['Yes', 'No'],
      ...amasterOnly,
    }),
    // box('refrence', 'Refrence', [341, 21], [457, 18, 184]),
    // box('MRecNo', 'MRecNo', [341, 60], [457, 57, 184]),
    // box('GroupNo', 'GroupNo', [341, 99], [457, 96, 184]),
    // box('UplevelKt', 'Uplevel', [341, 138], [457, 135, 184], kt('UplevelName')),
    // box('UpSeq', 'UpSeq', [341, 177], [457, 174, 184]),
    // box('MasterKt', 'Masterid', [341, 216], [457, 213, 184], kt('MasterName')),
    // box('RelationTran', 'Relation', [341, 255], [457, 252, 184], { trans: 'RelationTran' }),
    box('BlockReason', 'Block Reason', [656, 99], [756, 96, 227], amasterOnly),
    // box('ShortNm', 'Short Name', [656, 21], [756, 18, 227]),
    // box('Website', 'Website', [656, 60], [756, 57, 227]),
    box('Remark', 'Remark', [656, 60], [756, 57, 227]),
    box('DepositTran', 'Deposit', [341, 99], [457, 96, 184], { trans: 'DepositTran' }),
    // box('Mixsign', 'Mix Sign', [656, 177], [756, 174, 227]),
  ],
  // groups: [
  //   { text: 'Photo', at: { x: 655, y: 211, w: 163, h: 104 } },
  //   { text: 'FormFilled', at: { x: 829, y: 211, w: 163, h: 104 } },
  // ],
  trans: TRANS,
  columns: [
    { header: 'partyMkm', field: 'partyMkm', width: 5 },
    { header: 'Party Name', field: 'PName', width: 200 },
    { header: 'Address', field: 'txtAddress', width: 250 },
    { header: 'Sampraday', field: 'SampradayName' },
    { header: 'Guru', field: 'GuruName' },
    { header: 'Category', field: 'CategoryName' },
    { header: 'Block Party', field: 'BlockParty' },
    // { header: 'MRecNo', field: 'MRecNo', width: 50 },
    // { header: 'Refrence', field: 'refrence' },
    // { header: 'Mixsign', field: 'Mixsign', width: 75 },
    { header: 'Closing Bal.', field: 'DepositTran' },
  ],
};

export function PartyMaster(props: ScreenProps) {
  const [bookTids, setBookTids] = useState<number[] | null>(null);

  const withMenu = useMemo<ScreenSpec>(
    () => ({
      ...spec,
      contextMenu: (a: ScreenActions) => {
        const send = (label: string, action: string) => ({
          kind: 'item' as const,
          label,
          onSelect: () => void a.run(action),
        });
        return [
          {
            kind: 'submenu',
            label: 'Send To',
            items: [
              // send('BookM', 'send-to-book'),
              // {
              //   kind: 'item',
              //   label: 'BookT',
              //   // frmBookTranNew.strTid, shown as a dialog.
              //   onSelect: async () => {
              //     const result = await a.call('send-to-book-t');
              //     if (result?.kind !== 'open') return;
              //     if (result.ids.length === 0) await a.alert(result.emptyMessage);
              //     else setBookTids(result.ids);
              //   },
              // },
              // send('Kruti Master', 'send-to-kruti'),
              {
                kind: 'item',
                label: 'IssueTran',
                onSelect: async () => {
                  const answer = await a.yesNoCancel(
                    'Only Party(Press Yes)\r\nOnly Ref Party(Press No)\r\nBoth Party And Ref Party(Press Cancel)',
                  );
                  const mode = answer === 'yes' ? 'party' : answer === 'no' ? 'ref' : 'both';
                  await a.run('send-to-issue', { mode });
                },
              },
              send('Inward', 'send-to-inward'),
              // send('WorkGiven', 'send-to-work-given'),
              // Its handler is commented out on the desktop.
              // { kind: 'item', label: 'Catalogue', disabled: true, onSelect: () => undefined },
              // send('Prakashan List Anya Bhandar', 'send-to-prakashan-list'),
              // send('OutsiderM', 'send-to-outsider'),
            ],
          },
        ];
      },
    }),
    [],
  );

  return (
    <>
      <MasterScreen spec={withMenu} {...props} />
      {bookTids && (
        <BookTranDialog bookId={0} tids={bookTids} showAll onClose={() => setBookTids(null)} />
      )}
    </>
  );
}
