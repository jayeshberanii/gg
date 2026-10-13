import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import * as Tedious from 'tedious';
import type { Env } from '../config/env.js';
import { type Executor, inTransaction } from '../db/legacy-sql.js';
import { connectLongRunning } from '../db/long-running.js';

/** One row of a report procedure, by column name. */
export type ReportRow = Record<string, unknown>;

/**
 * Where a report reads from. The report procedures run for up to a minute (the report site
 * and the desktop give them no time limit), longer than a pooled connection allows a
 * statement, so outside a transaction they run on a connection of their own with no limit
 * (db/long-running.ts). Inside one (the tests' rolled-back transaction) they run in it.
 */
export type ReportSource = {
  db: Executor;
  env: Env;
  /** The report's own connection, while withTranIds holds one open. */
  conn?: Tedious.Connection;
};

/** A stored procedure's own error, which the desktop shows as it is (MsgBox(ex.Message)). */
export async function runProc<T>(statement: () => Promise<T>): Promise<T> {
  try {
    return await statement();
  } catch (err) {
    // A statement that raises several errors arrives as one AggregateError.
    const first = err instanceof AggregateError ? (err.errors[0] as unknown) : err;
    const e = first as { number?: number; message?: string } | null;
    if (typeof e?.number === 'number' && e.message) throw new BadRequestException(e.message);
    throw err;
  }
}

/** The tedious type of a bound value, as Kysely's SQL Server driver picks it. */
function parameterType(value: unknown): (typeof Tedious.TYPES)[keyof typeof Tedious.TYPES] {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return Tedious.TYPES.Float;
    return value >= -2147483648 && value <= 2147483647 ? Tedious.TYPES.Int : Tedious.TYPES.BigInt;
  }
  if (typeof value === 'bigint') return Tedious.TYPES.BigInt;
  if (typeof value === 'boolean') return Tedious.TYPES.Bit;
  if (value instanceof Date) return Tedious.TYPES.DateTime;
  return Tedious.TYPES.NVarChar;
}

/** One statement on the report's own connection: every row of every result set. */
function requestRows(
  conn: Tedious.Connection,
  text: string,
  parameters: readonly unknown[],
): Promise<ReportRow[]> {
  return new Promise((resolve, reject) => {
    const rows: ReportRow[] = [];
    const request = new Tedious.Request(text, (err) => (err ? reject(err) : resolve(rows)));
    parameters.forEach((value, i) =>
      request.addParameter(String(i + 1), parameterType(value), value),
    );
    request.on('row', (cells) => {
      const row: ReportRow = {};
      for (const c of Array.isArray(cells) ? cells : Object.values(cells)) {
        row[c.metadata.colName] = c.value;
      }
      rows.push(row);
    });
    conn.execSql(request);
  });
}

const transaction = (conn: Tedious.Connection, step: 'begin' | 'commit' | 'rollback') =>
  new Promise<void>((resolve, reject) => {
    const done = (err: Error | null | undefined) => (err ? reject(err) : resolve());
    if (step === 'begin') conn.beginTransaction(done);
    else if (step === 'commit') conn.commitTransaction(done);
    else conn.rollbackTransaction(done);
  });

/**
 * Every row a report statement returns. A procedure with several result sets (GetDataSet on
 * the report site) comes back as one list, each row keyed by its own set's columns, in order:
 * pick a set out with `rowsWith`.
 */
export async function reportRows(
  source: ReportSource,
  query: RawBuilder<unknown>,
): Promise<ReportRow[]> {
  const { db, env } = source;
  return runProc(async () => {
    if (!source.conn && db.isTransaction) {
      return (await sql<ReportRow>`${query}`.execute(db)).rows;
    }
    const compiled = query.compile(db);
    if (source.conn) return requestRows(source.conn, compiled.sql, compiled.parameters);
    const conn = await connectLongRunning(env);
    try {
      return await requestRows(conn, compiled.sql, compiled.parameters);
    } finally {
      conn.close();
    }
  });
}

/** The rows of the result set that has this column (a name no other set of the procedure has). */
export function rowsWith(rows: readonly ReportRow[], column: string): ReportRow[] {
  return rows.filter((r) => hasColumn(r, column));
}

/** DataRow("Column"): columns are looked up without regard to case. */
export function col(row: ReportRow, name: string): unknown {
  if (name in row) return row[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(row)) if (key.toLowerCase() === lower) return row[key];
  return null;
}

function hasColumn(row: ReportRow, name: string): boolean {
  if (name in row) return true;
  const lower = name.toLowerCase();
  return Object.keys(row).some((key) => key.toLowerCase() === lower);
}

/**
 * Runs a report whose procedure reads its selection from the TranIds table (clsCom.SetTranIds
 * before frmWebBrowser, cleared when the form closes). TranIds is one table for everybody, so
 * the ids are written, read and cleared in one transaction: SetTranIds truncates the table,
 * which other sessions wait on until this one ends, so two users' selections cannot mix.
 */
export async function withTranIds<T>(
  source: ReportSource,
  ids: readonly (number | string)[],
  fn: (source: ReportSource) => Promise<T>,
): Promise<T> {
  const { db, env } = source;
  if (db.isTransaction) {
    return inTransaction(db, async (trx) => {
      await sql`EXEC SetTranIds 1, ${ids.join(',')}`.execute(trx);
      const result = await fn({ db: trx, env });
      await sql`EXEC SetTranIds 0`.execute(trx);
      return result;
    });
  }
  const conn = await connectLongRunning(env);
  try {
    await transaction(conn, 'begin');
    try {
      const own = { db, env, conn };
      await reportRows(own, sql`EXEC SetTranIds 1, ${ids.join(',')}`);
      const result = await fn(own);
      await reportRows(own, sql`EXEC SetTranIds 0`);
      await transaction(conn, 'commit');
      return result;
    } catch (err) {
      await transaction(conn, 'rollback').catch(() => undefined);
      throw err;
    }
  } finally {
    conn.close();
  }
}

/** Whether the database has this stored procedure (a report added after an older backup). */
export async function procedureExists(db: Executor, name: string): Promise<boolean> {
  const { rows } = await sql<{ id: number | null }>`
    SELECT OBJECT_ID(${name}, 'P') AS id
  `.execute(db);
  return rows[0]?.id != null;
}

/** How many parameters the procedure takes (0 when the database has no such procedure). */
export async function procedureParameterCount(db: Executor, name: string): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM sys.parameters WHERE object_id = OBJECT_ID(${name}, 'P')
  `.execute(db);
  return Number(rows[0]?.n ?? 0);
}

/** DataRow text: '' for NULL, numbers and bits as the site's views print them. */
export function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
