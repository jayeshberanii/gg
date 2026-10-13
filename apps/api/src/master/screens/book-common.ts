import type { FieldValue, GridValue, PickList } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import type { Executor } from '../../db/legacy-sql.js';
import { ident } from '../../db/trusted-sql.js';
import { normalizeValue, pickListOf } from '../values.js';

/**
 * Small helpers shared by Book Master (frmBookMasterNew) and its Library No form
 * (frmBookTranNew): the VB conversions the desktop relies on, and its list/scalar queries.
 */

export type Row = Record<string, GridValue>;

/** Convert.ToString: bits read "True"/"False", DBNull reads "". */
export const text = (v: unknown) =>
  v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v);

/** VB Val(): the leading number of the text, or 0. */
export const val = (v: unknown) => {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const m = String(v ?? '')
    .trim()
    .match(/^[+-]?(\d+\.?\d*|\.\d+)/);
  return m ? Number(m[0]) : 0;
};

/** clsCom.INint: an integer, 0 for blank; bits read 1/0. */
export const int = (v: unknown) => Math.trunc(val(v));

export const bit = (v: unknown) =>
  v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';

/** DataRow("Column"): DataTable columns are looked up without regard to case. */
export function get(row: Row, name: string): GridValue {
  if (name in row) return row[name]!;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(row)) if (k.toLowerCase() === lower) return v;
  return null;
}

/** Sets a column of a record read back from the database, whatever its case there. */
export function put(row: Row, name: string, value: GridValue) {
  const lower = name.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower) ?? name;
  row[key] = value;
}

/** clsCommon.SignBetweenStr: join with `sign`, skipping blanks (the result keeps one side untrimmed). */
export function signBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  sign = ',',
) {
  const s1 = a ?? '';
  const s2 = b ?? '';
  if (s1.trim() === '' && s2.trim() === '') return '';
  if (s1.trim() === '') return s2;
  if (s2.trim() === '') return s1;
  return s1.trim() + sign + s2.trim();
}

/** clsCommon.GetcontString: drops the " | " separators UpdateVishay writes, "/" becomes a gap. */
export function contString(old: string): string {
  let out = old
    .split(' | ')
    .filter((p) => p !== '|')
    .join('');
  out = out
    .split('/')
    .map((p) => (p === '/' ? ' ' : p.trimEnd()))
    .join('');
  return out;
}

/**
 * A popup's rows as the client sent them (`<column>.Rows`), or null when the form never loaded
 * that popup (its DataTable has no columns).
 */
export function grid(f: Record<string, FieldValue>, column: string): Row[] | null {
  const v = f[`${column}.Rows`];
  return Array.isArray(v) ? (v as Row[]) : null;
}

/** One of the popup's other tables: `.Extra` is the first, `.Extra2`, `.Extra3`… the rest. */
export function extra(f: Record<string, FieldValue>, column: string, n: number): Row[] {
  const v = f[n === 1 ? `${column}.Extra` : `${column}.Extra${n}`];
  return Array.isArray(v) ? (v as Row[]) : [];
}

export async function scalar<T = unknown>(
  db: Executor,
  query: RawBuilder<unknown>,
): Promise<T | undefined> {
  const { rows } = await sql<Record<string, unknown>>`${query}`.execute(db);
  const first = rows[0];
  return first ? (Object.values(first)[0] as T) : undefined;
}

export async function ids(db: Executor, query: RawBuilder<unknown>): Promise<number[]> {
  const { rows } = await sql<{ id: number | string | null }>`${query}`.execute(db);
  return [...new Set(rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n !== 0))];
}

export async function table(
  db: Executor,
  query: RawBuilder<unknown>,
): Promise<{ columns: string[]; rows: GridValue[][] }> {
  const { rows } = await sql<Record<string, unknown>>`${query}`.execute(db);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { columns, rows: rows.map((r) => columns.map((c) => normalizeValue(r[c]))) };
}

/**
 * The next value of a key the application assigns (`select isnull(max(x),0)+1`), locked for
 * the rest of the transaction so two saves cannot take the same one.
 */
export async function nextKey(trx: Executor, tableName: string, column: string): Promise<number> {
  const { rows } = await sql<{ id: number }>`
    SELECT ISNULL(MAX(${ident(column)}), 0) + 1 AS id FROM ${ident(tableName)} WITH (UPDLOCK, HOLDLOCK)
  `.execute(trx);
  return Number(rows[0]!.id);
}

export const list = (query: RawBuilder<unknown>) => (db: Executor) => pickListOf(db, query);

export const SIGN_UNDER_10 = list(
  sql`SELECT columnmastkm, name FROM columnmaster WHERE vibhag = 'sign' AND ISNULL(columnno, 0) < 10 ORDER BY name`,
);

/**
 * SQL Server's own error for a value the database refuses (a letter in an int column, a date
 * it cannot read), which the desktop shows as it is (MsgBox(ex.Message)) before rolling back.
 */
export async function asDesktopError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const e = err as { number?: number; message?: string };
    if ((e.number === 245 || e.number === 241 || e.number === 8114) && e.message)
      throw new BadRequestException(e.message);
    throw err;
  }
}

/**
 * An int column the form fills from a text box (AddWithValue of the text): SQL Server reads ''
 * as 0 and refuses anything but a whole number. That refusal aborts the whole transaction, so
 * it is checked here, with SQL Server's own message, before anything is written.
 */
export function intText(v: unknown): number {
  const s = text(v);
  if (s.trim() === '') return 0;
  const n = /^\s*[+-]?\d+\s*$/.test(s) ? Number(s) : NaN;
  if (!Number.isSafeInteger(n) || n > 2147483647 || n < -2147483648) {
    throw new BadRequestException(
      /^\s*[+-]?\d+\s*$/.test(s)
        ? `The conversion of the nvarchar value '${s}' overflowed an int column.`
        : `Conversion failed when converting the nvarchar value '${s}' to data type int.`,
    );
  }
  return n;
}

/** "dd/MM/yyyy" as ISO, '' as null; the desktop swaps day and month and lets SQL Server read it. */
export function ddmmyyyy(v: unknown): string | null {
  const s = text(v).trim();
  if (s === '') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m)
    throw new BadRequestException(
      'Conversion failed when converting date and/or time from character string.',
    );
  const [, d, mo, y] = m;
  const iso = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d))
    throw new BadRequestException(
      'The conversion of a varchar data type to a datetime data type resulted in an out-of-range value.',
    );
  return iso;
}

/**
 * GetMemID: the next library number of a series (bookmast.bookprefix + zero-padded counter).
 * The counter's range is held (UPDLOCK, HOLDLOCK) until the caller's transaction ends, so two
 * saves cannot take the same number (Anya Bhandar's obtain-book insert); outside a transaction
 * (Book Tran's F2 on the series) the lock ends with the statement. `LEFT(libno, 2)` is the
 * desktop's test, kept as it is (a one-letter prefix never matches it).
 */
export async function nextLibNo(db: Executor, seriesKt: number): Promise<string> {
  if (seriesKt <= 0) return '';
  const prefix = text(
    await scalar(db, sql`SELECT bookprefix FROM bookmast WHERE bookcodekm = ${seriesKt}`),
  );
  const next = int(
    await scalar(
      db,
      sql`SELECT ISNULL(MAX((RIGHT(libno, 5))), 0) + 1 FROM BookT WITH (UPDLOCK, HOLDLOCK) WHERE LEFT(libno, 2) = ${prefix}`,
    ),
  );
  const digits = String(next).trim();
  const width = prefix.length === 1 ? 6 : 5;
  return digits.length > 6 ? '' : prefix + digits.padStart(Math.max(width, digits.length), '0');
}

/** The BookM columns a book created outside Book Master starts with (AnyaBhandarRepository.Save). */
export type ObtainBookValues = {
  BookName: string;
  ParichayakName: string;
  Part: string;
  PSamvatcokt: number;
  PSamvat: string;
  PSamvatVK: number;
  AvrutiKt: number;
  GMalaKt: number;
  GMalaNo: string;
  Pages: string;
  TotalPages: number;
  Price: string;
  Size: string;
  ShapeKt: number;
  txtPrakashak: string;
  txtAuthor: string;
  txtBhasha: string;
  txtLipi: string;
};

/**
 * Anya Bhandar's "Add New Book Entry": a BookM row and its one BookT row in the obtain-book
 * series (bookmast 'obtain book', prefix OB), numbered by GetMemID inside the caller's
 * transaction. The desktop's narrow inserts are kept: BookM gets no ISBNNo / Remark / moduser,
 * BookT no BkGrNo / seq (see docs/screens/anya-bhandar.md). A library number already in use
 * stops the save with the desktop's "LibNo Already Exist" (and everything is rolled back).
 */
export async function insertObtainBook(
  trx: Executor,
  userId: number,
  v: ObtainBookValues,
): Promise<{ bookId: number; bookTKt: number; libNo: string; seriesKt: number }> {
  const seriesKt = int(
    await scalar(trx, sql`SELECT bookcodekm FROM bookmast WHERE bookname = 'obtain book'`),
  );
  const libNo = await nextLibNo(trx, seriesKt);
  const { rows: book } = await sql<{ id: number }>`
    INSERT INTO BookM (BookName, ParichayakName, Part, PSamvatcokt, Psamvat, PsamvatVK, AvrutiKt, GMalaKt, GMalaNo,
      Pages, TotalPages, Price, Size, ShapeKt, txtPrakashak, txtAuthor, txtBhasha, txtLipi, txtbooktran, enuser, endate)
    OUTPUT INSERTED.BookMastkm AS id
    VALUES (${v.BookName}, ${v.ParichayakName}, ${v.Part}, ${v.PSamvatcokt}, ${v.PSamvat}, ${v.PSamvatVK},
      ${v.AvrutiKt}, ${v.GMalaKt}, ${v.GMalaNo}, ${v.Pages}, ${v.TotalPages}, ${v.Price}, ${v.Size}, ${v.ShapeKt},
      ${v.txtPrakashak}, ${v.txtAuthor}, ${v.txtBhasha}, ${v.txtLipi}, ${libNo}, ${userId}, GETDATE())
  `.execute(trx);
  const bookId = Number(book[0]!.id);
  const taken = int(
    await scalar(trx, sql`SELECT COUNT(tid) FROM BookT WHERE Libno = ${libNo.trim()}`),
  );
  if (taken > 0 || libNo === '') throw new BadRequestException('LibNo Already Exist');
  const { rows: t } = await sql<{ id: number }>`
    INSERT INTO BookT (BookMastkt, SeriesKt, Libno, MainL, enuser, endate)
    OUTPUT INSERTED.tid AS id
    VALUES (${bookId}, ${seriesKt}, ${libNo}, 1, ${userId}, GETDATE())
  `.execute(trx);
  return { bookId, bookTKt: Number(t[0]!.id), libNo, seriesKt };
}

export type { PickList };
