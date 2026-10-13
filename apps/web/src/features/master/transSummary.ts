import type { ChildRow, GridValue } from '@gglib/shared';

/** Convert.ToString on a DataRow value: bits read "True"/"False", DBNull reads "". */
export function netString(v: GridValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

/**
 * frmAuthorMaster.Txt_KeyDown after a popup's Save: the text box becomes the rows, each as its
 * non-empty values joined by "-" (skipping …kt/…km/…id/…seq/…cted columns and names of three
 * letters or fewer), the rows joined by ",". Bits count as text, so an IsPrint column adds
 * "-True"/"-False" — the database is full of that, and the desktop keeps writing it.
 */
export function genericSummary(rows: ChildRow[], columns: string[]): string {
  let out = '';
  for (const row of rows) {
    let n = 0;
    let c = 0;
    for (const col of columns) {
      const value = netString(row[col]);
      const lower = col.toLowerCase();
      const counted =
        value !== '' &&
        col.length > 3 &&
        !lower.endsWith('kt') &&
        !lower.endsWith('km') &&
        !lower.endsWith('id') &&
        !lower.endsWith('seq') &&
        !lower.endsWith('cted');
      if (!counted) continue;
      if (n === 1) {
        out += c === 0 ? value.trim() : `-${value.trim()}`;
      } else {
        out += (out.trim() === '' ? '' : ',') + value.trim();
        n = 1;
      }
      c++;
    }
  }
  return out.replace(/,,/g, ',');
}

/** The Sampraday popup's own text: each name, repeated in brackets when it has a Remark. */
export function sampradaySummary(rows: ChildRow[]): string {
  let out = '';
  for (const row of rows) {
    const name = netString(row.SampradayName).trim();
    out += `,${name}`;
    if (netString(row.Remark).trim() !== '') out += `(${name})`;
  }
  if (out !== '') out = out.slice(1);
  return out.replace(/,,/g, ',');
}

const skipped = (col: string) => {
  const lower = col.toLowerCase();
  return (
    col.length <= 3 ||
    lower.endsWith('kt') ||
    lower.endsWith('km') ||
    lower.endsWith('id') ||
    lower.endsWith('seq') ||
    lower.endsWith('cted')
  );
};

/**
 * The generic join: per row, its first counted value after ", " and the rest after "-"
 * (skipping …kt/…km/…id/…seq/…cted columns and names of three letters or fewer); then bits
 * go: "False" to nothing and "True" to "पूर्व". PrakTran's first value is its NameSelected.
 * The text the Prakashan forms (frmBookMasterNew, frmAnyaBhandar) write into a "…Tran" box
 * after its popup's Save (Txt_KeyDown).
 */
export function bookSummary(rows: ChildRow[], columns: string[], prakashak = false): string {
  let out = '';
  for (const row of rows) {
    let n = 0;
    let c = 0;
    for (const col of columns) {
      const value = netString(row[col]);
      if (value === '' || skipped(col)) continue;
      if (n === 1) {
        out += c === 0 ? value.trim() : `-${value.trim()}`;
      } else {
        const lower = col.toLowerCase();
        const first =
          prakashak && (lower === 'prakname' || lower === 'nameselected')
            ? netString(row.nameSelected ?? row.NameSelected ?? null) !== ''
              ? netString(row.nameSelected ?? row.NameSelected ?? null).trim()
              : netString(row.prakname ?? null).trim()
            : value.trim();
        out += (out.trim() === '' ? '' : ', ') + first;
        n = 1;
      }
      c++;
    }
  }
  return out
    .split('False')
    .join('')
    .split('True')
    .join('पूर्व')
    .split(',,')
    .join(',')
    .split('--')
    .join('-');
}
