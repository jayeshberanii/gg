/**
 * A report page of the desktop's companion web site (GGWebSolution, shown in frmWebBrowser):
 * Author Report, Kruti Akaradi, Book Report … The server's action builds it from the report's
 * stored procedure or SQL, mirroring the site's Razor view; the web's ReportView
 * (apps/web/src/features/report) draws it and lets the browser paginate the print, as the site
 * did. Letters and slips (Crystal reports) use PrintDocument instead.
 */
export type ReportDocument = {
  /** The viewer window's title, and the saved file's name. */
  title: string;
  /** The page's own font and size (a view that styles <body>); tables set theirs. */
  font?: ReportFont;
  size?: number;
  blocks: ReportBlock[];
};

/**
 * The fonts the site's views name. The desktop machines have them installed; elsewhere each
 * falls back to Noto Serif Devanagari.
 * - `noto`: 'Noto Serif Devanagari' (most tables);
 * - `ganesh`: DVOT-Ganesh (group headings); `surekh`: DVOT-Surekh;
 * - `shree`: SHREE_DEV_OTF_0708 (Agam Suchi, Author Parampara, Tirth Raksha).
 */
export type ReportFont = 'noto' | 'ganesh' | 'surekh' | 'shree';

export type ReportAlign = 'left' | 'center' | 'right' | 'justify';

export type ReportCell = {
  text: string;
  colSpan?: number;
  rowSpan?: number;
  align?: ReportAlign;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font?: ReportFont;
  /** Font size in px. */
  size?: number;
  /** A grey background: 1 = #BFBFBF, 2 = #D9D9D9 (printed too). */
  shade?: 1 | 2;
  /** Width in percent, for a cell outside the header row that sets the column widths. */
  width?: number;
  /** The text carries the procedure's own markup (Html.Raw): see richTextRuns. */
  rich?: boolean;
  /** Extra space around the text, in px (the Karta Name appendix). */
  padding?: number;
};

export type ReportRow = {
  cells: ReportCell[];
  /** A group heading row: every cell shaded (1 = #BFBFBF, 2 = #D9D9D9). */
  band?: 1 | 2;
  /** Drawn with <th> cells (bold), as the view does for a book's own line. */
  head?: boolean;
};

export type ReportField = { label: string; value: string };

/**
 * A body block:
 * - `table`: a bordered table whose `head` rows repeat on every printed page;
 * - `heading`: a line of its own (an author's name above his tables);
 * - `fields`: "label : value" lines, the label bold; `labelWidth` (percent) lines the values up
 *   in a second column;
 * - `paragraph`: indented running text under a label;
 * - `rule`: a horizontal line; `space`: an empty line; `pageBreak`: the next block starts a
 *   new printed page.
 */
export type ReportBlock =
  | {
      kind: 'table';
      /** Column widths in percent; without them the header cells' own widths decide. */
      columns?: number[];
      head: ReportCell[][];
      rows: ReportRow[];
      font?: ReportFont;
      size?: number;
      /** table-layout: fixed (most views); false lets the content size the columns. */
      fixed?: boolean;
      /** width: 100% (most views); false keeps the table as wide as its content. */
      full?: boolean;
      /** Body cells' default alignment and vertical alignment. */
      align?: ReportAlign;
      top?: boolean;
    }
  | {
      kind: 'heading';
      text: string;
      font?: ReportFont;
      size?: number;
      align?: ReportAlign;
    }
  | { kind: 'fields'; fields: ReportField[]; labelWidth?: number; separator?: string }
  | { kind: 'paragraph'; text: string; indent?: number }
  | { kind: 'rule' }
  | { kind: 'space' }
  | { kind: 'pageBreak' };

/** A piece of a `rich` cell: text in one style, or a line break. */
export type RichRun =
  | { br: true }
  | { br?: false; text: string; bold?: boolean; italic?: boolean; underline?: boolean };

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * The markup a report procedure puts in its text (the views print these columns with Html.Raw),
 * as styled runs: <br>, <b>/<strong>, <i>/<em> and <u> are honoured, every other tag is dropped
 * and its content kept as text, so nothing from the database is ever injected as HTML.
 */
export function richTextRuns(html: string): RichRun[] {
  const runs: RichRun[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  const push = (raw: string) => {
    const text = decodeEntities(raw);
    if (text === '') return;
    runs.push({
      text,
      ...(bold > 0 ? { bold: true } : {}),
      ...(italic > 0 ? { italic: true } : {}),
      ...(underline > 0 ? { underline: true } : {}),
    });
  };
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let last = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    push(html.slice(last, m.index));
    last = m.index + m[0].length;
    const step = m[1] === '/' ? -1 : 1;
    switch (m[2]!.toLowerCase()) {
      case 'br':
        runs.push({ br: true });
        break;
      case 'b':
      case 'strong':
        bold = Math.max(0, bold + step);
        break;
      case 'i':
      case 'em':
        italic = Math.max(0, italic + step);
        break;
      case 'u':
        underline = Math.max(0, underline + step);
        break;
    }
  }
  push(html.slice(last));
  return runs;
}
