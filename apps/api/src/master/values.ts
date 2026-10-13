import type { GridRow, PickList } from '@gglib/shared';
import { type RawBuilder, sql } from 'kysely';
import type { Executor } from '../db/legacy-sql.js';

/** bigint arrives as a string and dates as Date objects; the grid wants plain values. */
export function normalizeValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}

export function normalizeRow(row: Record<string, unknown>): GridRow {
  const out: GridRow = {};
  for (const [k, v] of Object.entries(row)) out[k] = normalizeValue(v);
  return out;
}

/** Runs a fixed list query as an F2 list. */
export async function pickListOf(db: Executor, query: RawBuilder<unknown>): Promise<PickList> {
  const result = await sql<Record<string, unknown>>`${query}`.execute(db);
  const first = result.rows[0];
  const columns = first ? Object.keys(first) : [];
  return { columns, rows: result.rows.map((r) => columns.map((c) => normalizeValue(r[c]))) };
}
