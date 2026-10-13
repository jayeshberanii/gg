import type { GridValue } from './master.js';

/**
 * A printed report: the web's stand-in for a Crystal report shown in frmReport (Letter Bhet,
 * Letter Demand, later Issue Slip). The server's `print` action fills it from the report's data;
 * the web's PrintView (apps/web/src/features/print) lays it out as plain A4 pages and calls
 * window.print(), so the user can print it or save it as PDF.
 *
 * Every page has the same three parts: a header block (the institution's logo, heading lines
 * beside it, labelled values on the right), the body blocks, and an optional footer.
 */
export type PrintDocument = {
  /** The viewer window's title, and the PDF's default file name. */
  title: string;
  /**
   * The layout is a reconstruction (the .rpt files are Crystal-encrypted, so the real one is
   * unknown): this note is shown above the pages on screen, never printed.
   */
  provisional?: string;
  /** One per record printed; each starts on a new sheet. */
  pages: PrintPage[];
};

export type PrintPage = {
  header: {
    /** The Geetarth Ganga logo the reports embed (public/legacy/report-logo.png). */
    logo?: boolean;
    /** Lines beside the logo (a heading). */
    lines?: string[];
    /** Labelled values on the right (Letter No, Date …). */
    fields?: PrintField[];
  };
  blocks: PrintBlock[];
  footer?: string[];
};

export type PrintField = { label: string; value: string };

export type PrintColumn = {
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Share of the table's width, in percent. */
  width?: number;
};

/**
 * A body block:
 * - `lines`: plain lines one under another (an address), under an optional title;
 * - `fields`: labelled values, one per line;
 * - `text`: a paragraph printed as written, line breaks kept (a letter's body);
 * - `table`: repeating rows, numbered when `numbered` (a "No." column first).
 */
export type PrintBlock =
  | { kind: 'lines'; title?: string; lines: string[] }
  | { kind: 'fields'; fields: PrintField[] }
  | { kind: 'text'; text: string }
  | {
      kind: 'table';
      title?: string;
      numbered?: boolean;
      columns: PrintColumn[];
      rows: GridValue[][];
    };
