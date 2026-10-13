'use client';

import type { ChildRow } from '@gglib/shared';
import { copyWithNewKeys } from '@/features/master/commonTrans';
import { MasterScreen } from '@/features/master/MasterScreen';
import { netString } from '@/features/master/transSummary';
import type { FieldSpec, FormContext, ScreenSpec, TransSpec } from '@/features/master/types';
import { getVikramSamvat } from './AuthorMaster';
import type { ScreenProps } from './registry';

/**
 * Txt_KeyDown after the Prasang popup's Save: only the PrasangName cells, comma-joined (the
 * generic join would add "-<Remark>").
 */
function prasangSummary(rows: ChildRow[]): string {
  let out = '';
  for (const row of rows) {
    const name = netString(row.PrasangName ?? row.prasangname).trim();
    if (name === '') continue;
    out += (out.trim() === '' ? '' : ',') + name;
  }
  return out.replace(/,,/g, ',');
}

/**
 * frmDisplayTransNew.SetForm_Patrika. A new row is {0, 0, "", Rows.Count + 1} (Prasang has a
 * Remark too) and starts in Seq; a pick moves to Seq. Copy gives every row key 0, so the copy
 * gets rows of its own (the desktop's copy re-saved the original's rows).
 */
const TRANS: Record<string, TransSpec> = {
  PatrikaBhashaTran: {
    column: 'PatrikaBhashaTran',
    hidden: ['PatrikaBhashaKm', 'BhashaKt'],
    editable: [],
    lookups: { bhashaname: { setKt: 'BhashaKt', setName: 'BhashaName', next: 'Seq' } },
    template: ({ seq }) => [0, 0, '', seq],
    firstColumn: 'Seq',
    onCopy: copyWithNewKeys('PatrikaBhashaKm', 'zero'),
    summary: 'generic',
  },
  PatrikaPrasangTran: {
    column: 'PatrikaPrasangTran',
    hidden: ['PatrikaPrasangKm', 'PrasangKt'],
    editable: ['Remark'],
    lookups: { prasangname: { setKt: 'PrasangKt', setName: 'PrasangName', next: 'Seq' } },
    template: ({ seq }) => [0, 0, '', '', seq],
    firstColumn: 'Seq',
    onCopy: copyWithNewKeys('PatrikaPrasangKm', 'zero'),
    summary: (rows) => prasangSummary(rows),
  },
  PatrikaMixSignTran: {
    column: 'PatrikaMixSignTran',
    hidden: ['PatrikaMixSignKm', 'MixSignKt'],
    editable: [],
    lookups: { mixsignname: { setKt: 'MixSignKt', setName: 'MixSignName', next: 'Seq' } },
    template: ({ seq }) => [0, 0, '', seq],
    firstColumn: 'Seq',
    onCopy: copyWithNewKeys('PatrikaMixSignKm', 'zero'),
    summary: 'generic',
  },
};

const box = (name: string, at: [number, number, number], extra: Partial<FieldSpec> = {}) =>
  ({ name, at: { x: at[0], y: at[1], w: at[2] }, ...extra }) as FieldSpec;
const kt = (nameColumn: string): Partial<FieldSpec> => ({ kt: true, nameColumn });

const isNumeric = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);

/**
 * Txt_Leave: leaving Samvat with a Samvat Type picked and more than 2 characters fills SamvatVK
 * (a year with one trailing non-digit, "2050?", counts as its number). The handler was meant to
 * run on leaving the Samvat Type too, but compares the name in the wrong case, so it never does.
 */
function onFieldLeave(
  name: string,
  fields: Record<string, string>,
  tags: Record<string, number>,
): Record<string, string> | null {
  if (name !== 'Samvat') return null;
  const year = fields.Samvat ?? '';
  const kind = tags.SamvatTypeKt ?? 0;
  if ((fields.SamvatTypeKt ?? '') === '' || kind <= 0 || year.trim().length <= 2) return null;
  if (isNumeric(year.trim()))
    return { SamvatVK: String(getVikramSamvat(kind, Math.round(Number(year)))) };
  const head = year.substring(0, year.trim().length - 1);
  if (isNumeric(head)) return { SamvatVK: String(getVikramSamvat(kind, Math.round(Number(head)))) };
  return null;
}

/**
 * txtRecordNo_KeyDown: any key in Add mode asks for the series ("Select Series") and puts its
 * next RecordNo in the box, so the number cannot be typed by hand there. In Edit mode the box is
 * free text (still checked for uniqueness on Save).
 */
function recordNoKey(_key: string, ctx: FormContext): boolean {
  if (ctx.mode !== 'edit' || ctx.strMode !== 'Add') return false;
  void (async () => {
    const p = await ctx.confirm(
      'Press(Yes) for P Series\nPress(No) for EP Series',
      'Select Series',
    );
    const r = await ctx.call('next-recordno', { prefix: p ? 'P' : 'EP' }, []);
    if (r?.kind === 'form') ctx.setField('RecordNo', netString(r.fields.RecordNo));
  })();
  return true;
}

/**
 * Issue › Patrika (frmPatrika). Positions, widths and headers are frmPatrika.designer.vb's.
 * "Update RecordNo" (Visible = False on the desktop, and data-damaging) is not ported.
 */
const spec: ScreenSpec = {
  screen: 'patrika',
  panelHeight: 165,
  panelWidth: 1008,
  entryLabel: true,
  labels: [
    { text: 'Prasang', at: { x: 13, y: 22 } },
    { text: 'Nishradata/RecordNo', at: { x: 491, y: 22 } },
    { text: 'Sampraday/City', at: { x: 13, y: 58 } },
    { text: 'Samvat', at: { x: 491, y: 58 } },
    { text: 'Size/Pages', at: { x: 13, y: 94 } },
    { text: 'Remark', at: { x: 491, y: 94 } },
    { text: 'Bhasha/Mix Sign', at: { x: 13, y: 129 } },
  ],
  fields: [
    box('PatrikaPrasangTran', [144, 18, 343], { trans: 'PatrikaPrasangTran' }),
    box('AuthorKt', [659, 18, 244], kt('AuthorName')),
    box('RecordNo', [904, 18, 92], { noF2: true, onKey: recordNoKey }),
    box('SampradayKt', [144, 54, 190], kt('SampradayName')),
    box('CityKt', [335, 54, 152], kt('CityName')),
    box('SamvatTypeKt', [659, 54, 118], kt('SamvatTypeName')),
    box('Samvat', [778, 54, 125]),
    box('SamvatVK', [904, 54, 92], { readOnly: true, alwaysSend: true, noF2: true }),
    box('SizeKt', [144, 90, 190], kt('SizeName')),
    box('Pages', [335, 90, 152], { noF2: true }),
    box('Remark', [659, 90, 337], { h: 64 }),
    box('PatrikaBhashaTran', [144, 125, 190], { trans: 'PatrikaBhashaTran' }),
    box('PatrikaMixSignTran', [335, 125, 152], { trans: 'PatrikaMixSignTran' }),
  ],
  trans: TRANS,
  onFieldLeave,
  // btnNew_Click: the series of the current grid row's RecordNo (EP… → EP, else P; P when
  // the grid is empty, where the desktop throws).
  onNew: {
    params: ({ current }) => ({
      prefix: netString(current?.RecordNo).startsWith('EP') ? 'EP' : 'P',
    }),
  },
  copy: {
    clear: [],
    loadTrans: ['PatrikaBhashaTran', 'PatrikaPrasangTran', 'PatrikaMixSignTran'],
  },
  columns: [
    { header: 'Id', field: 'PatrikaKm', width: 50 },
    { header: 'RecNo', field: 'RecordNo', width: 50 },
    { header: 'Prasang', field: 'txtPrasang', width: 180 },
    { header: 'Sampraday', field: 'SampradayName', width: 150 },
    { header: 'City', field: 'CityName', width: 120 },
    { header: 'Size', field: 'SizeName', width: 70 },
    { header: 'Pages', field: 'Pages', width: 50 },
    { header: 'Bhasha', field: 'txtBhasha', width: 100 },
    { header: 'MixSign', field: 'PatrikaMixSignTran', width: 100 },
    { header: 'Nishradata', field: 'AuthorName', width: 150 },
    { header: 'Samvat Type', field: 'SamvatTypeName', width: 100 },
    { header: 'Samvat', field: 'Samvat', width: 100 },
    { header: 'Remark', field: 'Remark', width: 100 },
  ],
  contextMenu: (a) => [
    {
      kind: 'submenu',
      label: 'For Selected Record',
      items: [
        { kind: 'item', label: 'Graphics Detail', onSelect: () => void a.run('graphics-detail') },
        {
          kind: 'submenu',
          label: 'Utility',
          items: [
            {
              kind: 'item',
              label: 'Request For LabIssue',
              onSelect: () => void a.run('request-lab-issue'),
            },
          ],
        },
      ],
    },
    {
      kind: 'submenu',
      label: 'Utility',
      items: [{ kind: 'item', label: 'Show Attachments', onSelect: a.showAttachments }],
    },
  ],
};

export function Patrika(props: ScreenProps) {
  return <MasterScreen spec={spec} {...props} />;
}
