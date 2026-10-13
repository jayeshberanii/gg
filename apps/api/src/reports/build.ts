import type { ReportBlock, ReportCell, ReportRow } from '@gglib/shared';

type TableBlock = Extract<ReportBlock, { kind: 'table' }>;

/** A plain cell, or one with its own alignment, span … */
export const cell = (text: string, extra: Omit<ReportCell, 'text'> = {}): ReportCell => ({
  text,
  ...extra,
});

/** A header cell: its width in percent, left-aligned unless said otherwise. */
export const th = (text: string, width?: number, extra: Omit<ReportCell, 'text'> = {}) =>
  cell(text, { ...(width === undefined ? {} : { width }), ...extra });

/** A data row of plain cells. */
export const row = (...cells: (string | ReportCell)[]): ReportRow => ({
  cells: cells.map((c) => (typeof c === 'string' ? { text: c } : c)),
});

/** A group heading across the whole table (#BFBFBF for level 1, #D9D9D9 for level 2). */
export const band = (
  level: 1 | 2,
  text: string,
  colSpan: number,
  extra: Omit<ReportCell, 'text'> = {},
): ReportRow => ({
  band: level,
  cells: [{ text, colSpan, align: 'center', ...extra }],
});

/**
 * The views' usual table: 'Noto Serif Devanagari' 15px, fixed layout, full width, a header that
 * repeats on every printed page.
 */
export const table = (
  head: ReportCell[][],
  rows: ReportRow[],
  extra: Partial<Omit<TableBlock, 'kind' | 'head' | 'rows'>> = {},
): TableBlock => ({
  kind: 'table',
  font: 'noto',
  size: 15,
  fixed: true,
  full: true,
  head,
  rows,
  ...extra,
});

/** Distinct values in the order they first appear (the views' "if not seen yet" loops). */
export function distinct<T, K>(items: readonly T[], key: (item: T) => K): K[] {
  const seen = new Set<K>();
  const out: K[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/**
 * LINQ OrderBy on text: .NET's culture comparison is closest to a locale compare, and the sort
 * is stable like OrderBy.
 */
export function orderBy<T>(items: readonly T[], ...keys: ((item: T) => string | number)[]): T[] {
  const collator = new Intl.Collator('hi', { sensitivity: 'variant' });
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const x = key(a);
      const y = key(b);
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : collator.compare(String(x), String(y));
      if (c !== 0) return c;
    }
    return 0;
  });
}
