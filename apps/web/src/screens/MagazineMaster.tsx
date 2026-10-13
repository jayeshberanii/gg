'use client';

import type { ChildRow } from '@gglib/shared';
import { useMemo, useState } from 'react';
import { ADDRESS_TRANS } from '@/features/master/commonTrans';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type { FieldSpec, ScreenActions, ScreenSpec, TransSpec } from '@/features/master/types';
import { getVikramSamvat } from './AuthorMaster';
import { BookTranDialog } from './BookTranDialog';
import type { ScreenProps } from './registry';

/** Format(DateTime.Now.Date, "dd/MM/yyyy") */
const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** frmDisplayTransNew.SetForm_MagazineM, and SetForm_Common for the Address. */
const TRANS: Record<string, TransSpec> = {
  // TranName "Address", FormName "Common".
  AddressTran: ADDRESS_TRANS,
  // TranName "BookTran". The row keys (GetMaxId) are thrown away by Save.
  BookTran: {
    column: 'BookTran',
    hidden: ['MagBookmTKm'],
    editable: ['MissingYr', 'MissingaAnk'],
    lookups: {
      bookname: {
        setName: 'BookName',
        setKt: 'bookmastkt',
        also: { PSamvatVK: 2 },
        next: 'MissingYr',
      },
    },
    template: () => [0, '', '', '', 0, 0, null],
    firstColumn: 'BookName',
    onlyWhenTextChanged: true,
  },
  SubscribeTran: {
    column: 'SubscribeTran',
    hidden: ['MagSubscribekm', 'PartyMkt'],
    editable: ['SUptoYr', 'LavajamType', 'Amount', 'Remark'],
    lookups: {
      subdate: {
        setName: 'SubDate',
        next: 'PName',
        input: {
          prompt: 'Please Enter SubDate(Ex-dd/MM/yyyy)',
          initial: (row?: ChildRow) => netString(row?.SubDate).trim() || today(),
          keepOnCancel: true,
        },
      },
      pname: { setName: 'PName', setKt: 'PartyMkt', next: 'SType' },
      stype: { setName: 'SType', next: 'SUptoYr' },
    },
    template: () => [0, '', 0, '', '', '', '', 0, ''],
    firstColumn: 'SubDate',
    onlyWhenTextChanged: true,
  },
  BhashaTran: {
    column: 'BhashaTran',
    hidden: ['MagBhashaKm', 'MagazineKt', 'BhashaKt'],
    editable: ['Remark'],
    lookups: { bhashaname: { setName: 'bhashaname', setKt: 'BhashaKt' } },
    template: () => [0, 0, 0, '', ''],
    firstColumn: 'BhashaName',
    onlyWhenTextChanged: true,
  },
};

const box = (
  name: string,
  label: string,
  labelAt: [number, number] | null,
  at: [number, number, number],
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({
  name,
  label,
  ...(labelAt ? { labelAt: { x: labelAt[0], y: labelAt[1] } } : {}),
  at: { x: at[0], y: at[1], w: at[2] },
  ...extra,
});
const kt = (nameColumn: string): Partial<FieldSpec> => ({ kt: true, nameColumn });

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

/**
 * Txt_Leave: leaving First Yr / Last Yr with a Samvat picked fills its Vikram samvat box (a year
 * with one trailing non-digit, "1990?", counts as its number). The samvat box was meant to
 * recompute too, but its name is compared in the wrong case, so it never does.
 */
function onFieldLeave(
  name: string,
  fields: Record<string, string>,
  tags: Record<string, number>,
): Record<string, string> | null {
  const target = name === 'FirstYr' ? 'FYearVK' : name === 'CloseYr' ? 'CYearVK' : null;
  if (!target) return null;
  const year = fields[name] ?? '';
  const kind = tags.samvatcokt ?? 0;
  if ((fields.samvatcokt ?? '') === '' || kind <= 0 || year.trim().length <= 2) return null;
  if (isNumeric(year.trim()))
    return { [target]: String(getVikramSamvat(kind, Math.round(Number(year)))) };
  const head = year.substring(0, year.trim().length - 1);
  if (isNumeric(head)) return { [target]: String(getVikramSamvat(kind, Math.round(Number(head)))) };
  return null;
}

/**
 * Library › Magazine Master (frmMagazineMaster). Positions, widths and headers are
 * frmMagazineMaster.designer.vb's; the grid shows the designer's columns.
 */
const spec: ScreenSpec = {
  screen: 'magazine-master',
  panelHeight: 298,
  panelWidth: 1008,
  entryLabel: true,
  lockedColumns: ['Locked'],
  fields: [
    box('MName', 'Name', [8, 22], [154, 18, 216]),
    box('samvatcokt', 'Samvat', [382, 22], [502, 18, 195], kt('samvatcoName')),
    box('SelectionRem', 'Selection Rem', [715, 22], [844, 18, 158]),
    box('Series', 'Series', [8, 62], [154, 58, 216]),
    box('FirstYr', 'First/Break Yr', [382, 62], [502, 58, 66]),
    box('FYearVK', 'FYearVK', null, [569, 58, 66], {
      readOnly: true,
      alwaysDisabled: true,
      alwaysSend: true,
      noF2: true,
    }),
    box('BreakYr', 'Break Yr', null, [636, 58, 61]),
    box('AvailableRem', 'Available Rem', [715, 62], [844, 58, 158]),
    box('SeriesRem', 'Series Remark', [8, 102], [154, 98, 216]),
    box('CloseYr', 'Last Yr', [382, 102], [502, 98, 109]),
    box('CYearVK', 'Last YrVK', null, [612, 98, 85], {
      readOnly: true,
      alwaysSend: true,
      noF2: true,
    }),
    box('MissingRem', 'Missing Rem', [715, 102], [844, 98, 158]),
    box('MTypekt', 'MType', [8, 142], [154, 138, 216], kt('MTypeName')),
    box('RegisterNo', 'Register No', [382, 142], [502, 138, 195]),
    box('PubStatuskt', 'Pub Status', [715, 142], [844, 138, 158], kt('PubStatusName')),
    box('BookTran', 'BookT', [8, 182], [154, 178, 216], { trans: 'BookTran' }),
    box('SubscribeTran', 'SubscribeT', [382, 182], [502, 178, 195], { trans: 'SubscribeTran' }),
    box('RcvStatuskt', 'Rcv Status', [715, 182], [844, 178, 158], kt('RcvStatusName')),
    box('AddressTran', 'Address', [8, 222], [154, 218, 216], { trans: 'AddressTran' }),
    box('SampradayKt', 'Sampraday', [382, 222], [502, 218, 195], kt('SampradayName')),
    box('BhashaTran', 'Bhasha', [715, 222], [844, 218, 158], { trans: 'BhashaTran' }),
    box('ContactPersonKt', 'Cont Person', [8, 262], [154, 258, 216], kt('ContactPersonName')),
    box('Remark', 'Remark', [382, 262], [502, 258, 195]),
  ],
  trans: TRANS,
  onFieldLeave,
  columns: [
    { header: 'Id', field: 'Magazinekm', width: 90 },
    { header: 'MName', field: 'MName', width: 120 },
    { header: 'Series', field: 'Series', width: 100 },
    { header: 'Series Remark', field: 'SeriesRem', width: 120 },
    { header: 'MTytpeKt', field: 'MTypekt', width: 100, hidden: true },
    { header: 'MType', field: 'MTypeName', width: 100 },
    { header: 'Samvat', field: 'samvatcoName', width: 100 },
    { header: 'FirstYr', field: 'FirstYr', width: 100 },
    { header: 'FYearVK', field: 'FYearVK', width: 100 },
    { header: 'Break Yr', field: 'BreakYr', width: 100 },
    { header: 'Last Yr', field: 'CloseYr', width: 100 },
    { header: 'CYearVK', field: 'CYearVK', width: 100 },
    { header: 'RegisterNo', field: 'RegisterNo', width: 100 },
    { header: 'Sampraday', field: 'SampradayName', width: 100 },
    { header: 'PubStatusKt', field: 'PubStatuskt', width: 100, hidden: true },
    { header: 'PubStatus', field: 'PubStatusName', width: 100 },
    { header: 'RcvStatusKt', field: 'RcvStatuskt', width: 100, hidden: true },
    { header: 'RcvStatus', field: 'RcvStatusName', width: 100 },
    { header: 'Bhasha', field: 'txtBhasha', width: 100 },
  ],
};

export function MagazineMaster(props: ScreenProps) {
  const [bookTids, setBookTids] = useState<number[] | null>(null);

  const menu = useMemo(
    () => (a: ScreenActions) => [
      {
        kind: 'submenu' as const,
        label: 'Print Report',
        items: [
          // Its dropdown lists the Config_Master layouts that have a ShortcutKey.
          a.printLayouts.length > 0
            ? {
                kind: 'submenu' as const,
                label: 'Selected Column',
                items: a.printLayouts,
                onSelect: a.printSelectedColumn,
              }
            : { kind: 'item' as const, label: 'Selected Column', onSelect: a.printSelectedColumn },
          // SendToExcelToolStripMenuItem has no Click handler on the desktop.
          {
            kind: 'item' as const,
            label: 'Send To Excel',
            disabled: true,
            onSelect: () => undefined,
          },
          {
            kind: 'item' as const,
            label: 'Missing Ank(Sampradaywise)',
            onSelect: async () => {
              const r = await a.pick('missing-ank-sampraday', { addBlankRow: true });
              const ids = (r?.code ?? []).map(Number).filter((n) => n > 0);
              if (ids.length > 0) await a.run('missing-ank', { sampraday: ids }, []);
            },
          },
        ],
      },
      {
        kind: 'submenu' as const,
        label: 'Send To',
        items: [
          { kind: 'item' as const, label: 'BookM', onSelect: () => void a.run('send-to-book') },
          {
            kind: 'item' as const,
            label: 'BookT',
            // frmBookTranNew with a WhereCondition, shown as a dialog.
            onSelect: async () => {
              const result = await a.call('send-to-book-t');
              if (result?.kind !== 'open') return;
              if (result.ids.length === 0) await a.alert(result.emptyMessage);
              else setBookTids(result.ids);
            },
          },
        ],
      },
    ],
    [],
  );

  return (
    <>
      <MasterScreen spec={spec} {...props} menu={menu} />
      {bookTids && (
        <BookTranDialog bookId={0} tids={bookTids} showAll onClose={() => setBookTids(null)} />
      )}
    </>
  );
}
