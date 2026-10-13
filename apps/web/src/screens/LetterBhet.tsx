'use client';

import { MasterScreen } from '@/features/master/MasterScreen';
import type { FieldSpec, ScreenSpec } from '@/features/master/types';
import { BOOK_TRAN, letterMenu } from './letterCommon';
import type { ScreenProps } from './registry';

/** Designer columns: labels at x 13 / 417, boxes at x 129 (w 212) / 510 (w 161). */
const C1 = { label: 13, x: 129, w: 212 };
const C2 = { label: 417, x: 510, w: 161 };

const box = (
  name: string,
  label: string,
  col: typeof C1,
  y: number,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({
  name,
  label,
  labelAt: { x: col.label, y: y + 4 },
  at: { x: col.x, y, w: col.w },
  ...extra,
});

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Issue › Letter Bhet (frmLetterBhetM, "Letter Bhet"). Positions, widths and headers are
 * frmLetterBhetM.Designer.vb's; the behaviour is in docs/screens/letter-bhet.md. Inward Master's
 * Send To › Letter Bhet Master opens it in Add mode with Inword filled in (ScreenProps.initialNew
 * with `inwordkt` / `InwordName`).
 */
const spec: ScreenSpec = {
  screen: 'letter-bhet',
  panelHeight: 348,
  panelWidth: 1008,
  fields: [
    box('LetterDate', 'Letter Date', C1, 18, { date: true }),
    box('PartyName', 'Party Name', C1, 58, {
      // Txt_KeyDown's PartyM list: the address and (when it has one) the mobile come along.
      afterPick: (picked, ctx) => {
        if (!picked.name || !picked.row) return;
        ctx.setField('party_add', cellText(picked.row[3]).trim());
        const mobile = cellText(picked.row[2]).trim();
        if (mobile !== '') ctx.setField('MobileNo', mobile);
      },
    }),
    box('party_add', 'Party Address', C1, 98),
    box('MobileNo', 'Mobile No', C1, 138, { noF2: true }),
    {
      name: 'Letter',
      label: 'Letter',
      labelAt: { x: 13, y: 182 },
      at: { x: 129, y: 178, w: 542 },
      h: 160,
    },
    box('LetterNo', 'Letter No', C2, 18, { noF2: true }),
    box('BhetTypekt', 'Bhet Type', C2, 58, { kt: true, nameColumn: 'BhetTypeName' }),
    box('Vishay', 'Vishay', C2, 98),
    box('inwordkt', 'Inword', C2, 138, {
      kt: true,
      nameColumn: 'InwordName',
      f2SearchText: true,
      // The picked inward's From party, address and mobile, when the party has an address row.
      afterPick: (picked, ctx) => {
        const inwordkm = Number(picked.code) || 0;
        if (inwordkm <= 0) return;
        void (async () => {
          const r = await ctx.call('inward-party', { inwordkm });
          if (r?.kind !== 'form') return;
          for (const [k, v] of Object.entries(r.fields)) ctx.setField(k, cellText(v));
        })();
      },
    }),
    {
      name: 'BookTran',
      label: 'Book Detail',
      labelAt: { x: 686, y: 22 },
      at: { x: 785, y: 18, w: 124 },
      trans: 'BookTran',
    },
  ],
  trans: { BookTran: BOOK_TRAN },
  columns: [
    { header: 'Id', field: 'LetterBhetMkm', width: 5 },
    { header: 'LetterNo', field: 'LetterNo', width: 80 },
    { header: 'Letter Date', field: 'LetterDate', width: 100, format: 'date' },
    { header: 'Party Name', field: 'PartyName', width: 120 },
    { header: 'Party Address', field: 'party_add', width: 180 },
    { header: 'Mobile No', field: 'MobileNo', width: 100 },
    { header: 'Bhet Type', field: 'BhetTypeName', width: 180 },
    { header: 'Vishay', field: 'Vishay', width: 150 },
    { header: 'Inword', field: 'InwordName', width: 100 },
  ],
};

export function LetterBhet(props: ScreenProps) {
  return (
    <MasterScreen
      spec={spec}
      {...props}
      menu={(a) =>
        letterMenu(a, {
          printLabel: 'Print Bhet Pahoch',
          printAction: 'print-bhet-pahoch',
          sendTo: { label: 'Inword Master', action: 'send-to-inward' },
          attachmentsLabel: 'Show Attachments',
        })
      }
    />
  );
}
