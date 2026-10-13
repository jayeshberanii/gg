import type { DB } from '@gglib/db';
import { type Kysely, sql, type Transaction } from 'kysely';

export type Executor = Kysely<DB> | Transaction<DB>;

/**
 * Runs `fn` in a transaction, or inside the caller's transaction when `db` already is one.
 * Tests hand services a transaction that they roll back afterwards.
 */
export function inTransaction<T>(db: Executor, fn: (trx: Executor) => Promise<T>): Promise<T> {
  return db.isTransaction ? fn(db) : db.transaction().execute(fn);
}

/**
 * Today's date and the time on the SQL Server clock. The desktop app uses GETDATE()
 * everywhere, so the web app must too, or the two would disagree about "today".
 */
export async function serverNow(db: Executor): Promise<{ date: string; time: string }> {
  const { rows } = await sql<{ d: string; t: string }>`
    SELECT CONVERT(varchar(10), GETDATE(), 23) AS d, CONVERT(varchar(8), GETDATE(), 108) AS t
  `.execute(db);
  return { date: rows[0]!.d, time: rows[0]!.t };
}

/** HolidayM dates in [from, to] as ISO strings. */
export async function holidaysBetween(
  db: Executor,
  from: string,
  to: string,
): Promise<Set<string>> {
  const { rows } = await sql<{ d: string }>`
    SELECT CONVERT(varchar(10), HolidayDate, 23) AS d FROM HolidayM
    WHERE HolidayDate BETWEEN CAST(${from} AS date) AND CAST(${to} AS date)
  `.execute(db);
  return new Set(rows.map((r) => r.d));
}

/**
 * Next id for a table whose key the application assigns (`SELECT ISNULL(MAX(x),0)+1`, as the
 * desktop does). UPDLOCK + HOLDLOCK hold the range until the caller's transaction ends, so two
 * web requests cannot take the same id. The desktop does not lock, so an insert can still hit
 * a duplicate key; callers must be inside a transaction and may retry.
 */
export async function nextId(
  trx: Executor,
  table: 'log' | 'work',
  column: 'logID' | 'workID',
): Promise<number> {
  const { rows } = await sql<{ id: string | number }>`
    SELECT ISNULL(MAX(${sql.ref(column)}), 0) + 1 AS id
    FROM ${sql.table(table)} WITH (UPDLOCK, HOLDLOCK)
  `.execute(trx);
  return Number(rows[0]!.id);
}

/** True for SQL Server's duplicate-key errors (2627 primary key / unique constraint, 2601 index). */
export function isDuplicateKey(err: unknown): boolean {
  const n = (err as { number?: number } | null)?.number;
  return n === 2627 || n === 2601;
}

/**
 * A list of numbers as a subquery for `IN (...)`, bound as one parameter and split by the
 * desktop's own dbo.SplitString (the database runs at compatibility level 100, so OPENJSON
 * and STRING_SPLIT are not available).
 */
export function idList(ids: readonly number[]) {
  const safe = ids.filter((n) => Number.isFinite(n)).map((n) => String(Math.trunc(n)));
  return sql`(SELECT CAST(val AS bigint) FROM dbo.SplitString(${safe.join(',')}, ','))`;
}

/** Text values for `IN (...)`, separated by '~' as UcSearch does. */
export function textList(values: readonly string[]) {
  return sql`(SELECT val FROM dbo.SplitString(${values.join('~')}, '~'))`;
}
