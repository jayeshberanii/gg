import type { GridRow } from './master.js';

/**
 * frmIssueTran's rules that both the form and the API need. See docs/screens/issue-master.md.
 */

/** dd-MM-yyyy (or yyyy-MM-dd…) of a record value, as yyyy-MM-dd; '' when it is no date. */
function isoDate(v: unknown): string {
  const s =
    v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : '';
}

/**
 * FillData's one-day rule: a record whose `endate` is empty or older than yesterday (`today` is
 * yyyy-MM-dd) keeps its Party, Ref Party, Slip, LibNo, Book and Patrika (ReadOnly).
 */
export function issueRecordIsOld(endate: unknown, today: string): boolean {
  const entered = isoDate(endate);
  if (entered === '') return true;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return entered < d.toISOString().slice(0, 10);
}

/** The record columns FillData makes ReadOnly on an old record. */
export const ISSUE_KEPT_WHEN_OLD = [
  'party_cokt',
  'Ref_partykt',
  'slipno',
  'entrcodekt',
  'BookMastkt',
  'PatrikaKt',
] as const;

/** The record columns that can never change on Edit (Ref Party ReadOnly, Slip disabled). */
export const ISSUE_KEPT_ON_EDIT = ['Ref_partykt', 'slipno'] as const;

/** The columns an Edit of this record must leave as stored (FillData's ReadOnly / Enabled). */
export function issueKeptColumns(record: GridRow | null, today: string): readonly string[] {
  if (!record) return ISSUE_KEPT_ON_EDIT;
  const key = Object.keys(record).find((k) => k.toLowerCase() === 'endate');
  return issueRecordIsOld(key === undefined ? null : record[key], today)
    ? ISSUE_KEPT_WHEN_OLD
    : ISSUE_KEPT_ON_EDIT;
}

/** DarkRed: dgMain_CellFormatting's Party Name colour for a party with a lost book. */
export const ISSUE_LOST_COLOR = '#8b0000';

/**
 * dgMain_CellFormatting (column 5, Party Name): DarkRed when the row's Confirm Mark contains
 * "lost", or the server's `HasLost` flag (decorateList) says the party / ref party has an
 * unreturned lost book.
 */
export function issuePartyColor(row: GridRow): string | undefined {
  const mark = Object.keys(row).find((k) => k.toLowerCase() === 'confmmarkname');
  const name = mark === undefined ? '' : String(row[mark] ?? '');
  return name.toLowerCase().includes('lost') || Number(row.HasLost ?? 0) > 0
    ? ISSUE_LOST_COLOR
    : undefined;
}
