import { type RawBuilder, sql } from 'kysely';
import { type Executor, idList, isDuplicateKey } from '../../db/legacy-sql.js';
import { trustedSql } from '../../db/trusted-sql.js';
import { gridColumnsSql, loadTblSearch } from '../tbl-search.js';
import { pickListOf } from '../values.js';
import type { ActionResult } from './registry.js';

/** Text box `.Text.Trim`: DBNull and missing read "". */
export const trimmed = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

/** A DateTimePicker's value as the client sends it (yyyy-MM-dd), or null. */
export const pickerDate = (v: unknown): string | null => {
  const s = trimmed(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};

/**
 * A MaskedTextBox "90:00" (txtWorkTime): its text when MaskCompleted, else ''. The desktop
 * passes that text to a `time` column, where '' reads 00:00:00.
 */
export const maskedTime = (v: unknown): string => {
  const s = trimmed(v);
  const m = s.match(/^(\d{0,2}):(\d{2})$/);
  return m && Number(m[1] || 0) < 24 && Number(m[2]) < 60 ? s : '';
};

/**
 * An insert whose key the desktop assigns as `ISNULL(MAX(<pk>), 0) + 1`. The range is held
 * with UPDLOCK + HOLDLOCK until the caller's transaction ends; the desktop does not lock, so
 * the insert can still collide with one of its own and is retried.
 */
export async function insertWithMaxId(
  trx: Executor,
  table: string,
  pk: string,
  insert: (id: number) => Promise<unknown>,
): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    const { rows } = await sql<{ id: number }>`
      SELECT ISNULL(MAX(${sql.ref(pk)}), 0) + 1 AS id FROM ${sql.table(table)} WITH (UPDLOCK, HOLDLOCK)
    `.execute(trx);
    const id = Number(rows[0]!.id);
    try {
      await insert(id);
      return id;
    } catch (err) {
      if (!isDuplicateKey(err) || attempt >= 2) throw err;
    }
  }
}

/**
 * A "Show In Use" item: the distinct ids a query finds, opened in another screen with StrId;
 * `emptyMessage` is the form's MessageBox when there are none.
 */
export async function openInUse(
  db: Executor,
  screen: string,
  query: RawBuilder<{ id: number | string | null }>,
  emptyMessage: string,
): Promise<ActionResult> {
  const { rows } = await query.execute(db);
  const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n !== 0);
  return { kind: 'open', screen, ids, emptyMessage };
}

/**
 * UcSearch "UplevelWithChild" (frmVisheshMaster / frmSampraday Txt_KeyDown): the records under
 * the picked ones. The desktop walks twelve levels down, one query per record, and then lists
 * every record whose up level is the picked one or one of those below it; here each level is
 * one query, and a chain that loops back on itself stops.
 */
export async function uplevelWithChild(
  db: Executor,
  table: string,
  pk: string,
  uplevelColumn: string,
  picked: number[],
): Promise<RawBuilder<unknown>> {
  const parents = new Set(picked.filter((n) => Number.isFinite(n) && n > 0));
  let frontier = [...parents];
  for (let level = 0; level < 12 && frontier.length > 0; level++) {
    const { rows } = await sql<{ id: number }>`
      SELECT ${sql.ref(pk)} AS id FROM ${sql.table(table)} WHERE ${sql.ref(uplevelColumn)} IN ${idList(frontier)}
    `.execute(db);
    frontier = rows.map((r) => Number(r.id)).filter((id) => !parents.has(id));
    for (const id of frontier) parents.add(id);
  }
  return sql`${sql.ref(uplevelColumn)} IN ${idList([...parents])}`;
}

/**
 * TableKt of the forms that keep RefrenceT rows: the columnmaster row naming the table under
 * Vibhag 'TableNm', or 0 when there is none (as GetScalarValue's Nothing converts).
 */
export async function tableKtOf(db: Executor, table: string): Promise<number> {
  const { rows } = await sql<{ id: number }>`
    SELECT ISNULL(ColumnMastkm, 0) AS id FROM columnmaster WHERE Vibhag = 'TableNm' AND Name = ${table}
  `.execute(db);
  return Number(rows[0]?.id ?? 0);
}

/** A record's RefrenceT rows as the ReferenceT1 popup shows them (FillData's dtReference). */
export async function referenceStatement(
  db: Executor,
  table: string,
  id: number,
): Promise<string[]> {
  return [
    `SELECT r.RefrenceTkm, r.Subhead, r.WordNm, r.Example, r.BookTKt, BookT.LibNo AS BookTName, r.Refplacekt,
       cRefPlace.Name RefPlace, r.Pgno, r.Seq
     FROM RefrenceT R LEFT JOIN columnmaster cRefPlace ON r.Refplacekt = cRefPlace.ColumnMastkm
     LEFT JOIN BookT ON r.BookTKt = BookT.Tid
     WHERE r.Tablekt = ${await tableKtOf(db, table)} AND r.RecordKt = ${Math.trunc(id)} ORDER BY seq`,
  ];
}

/**
 * The grid query of another master (BlCommon.ListGridData(<table>, <pk>)), newest first, for a
 * form's own F2 list (frmLetterBhetM's Inword, frmLetterDemandM's Work Given, Book Master's
 * Selection). `transactionName` and `primary` are constants of the calling screen.
 */
export async function masterGrid(db: Executor, transactionName: string, primary: string) {
  const rows = await loadTblSearch(db, transactionName);
  return pickListOf(
    db,
    sql`SELECT ${trustedSql(gridColumnsSql(rows).replace(/&gt;/g, '>').replace(/&lt;/g, '<'))}
      FROM ${trustedSql(transactionName)} WHERE 1 = 1 ORDER BY ${trustedSql(primary)} DESC`,
  );
}

/** A popup's child table as its repository saves it (upsert by key, then delete the rest). */
export type ChildTable = {
  table: string;
  key: string;
  /** The column pointing at the record. */
  parent: string;
  /**
   * Row column → how it is written: `int` (INint), `text` (INSQ: trimmed, blank as ' '),
   * `bit` (a CheckBox cell: true / 'True' / 1).
   */
  columns: Record<string, 'int' | 'text' | 'bit'>;
  /** The table has enuser/endate and moduser/moddate. */
  audit?: boolean;
};

/**
 * The repositories' popup save: rows whose key is 0 or less are inserted, the others updated,
 * then the parent's rows that are no longer listed deleted. Row columns are read without
 * regard to case, as DataRow("…") does.
 */
export async function upsertChildRows(
  trx: Executor,
  t: ChildTable,
  parentId: number,
  rows: Record<string, unknown>[],
  userId: number,
): Promise<void> {
  const get = (row: Record<string, unknown>, name: string) => {
    const k = Object.keys(row).find((c) => c.toLowerCase() === name.toLowerCase());
    return k === undefined ? null : row[k];
  };
  const toInt = (v: unknown) => {
    const m = String(v ?? '')
      .trim()
      .match(/^[+-]?\d+/);
    return m ? Number(m[0]) : 0;
  };
  const kept: number[] = [];
  for (const row of rows) {
    const key = toInt(get(row, t.key));
    const cols = Object.entries(t.columns).map(([name, kind]) => ({
      name,
      value:
        kind === 'int'
          ? toInt(get(row, name))
          : kind === 'bit'
            ? ['true', '1'].includes(String(get(row, name) ?? '').toLowerCase())
            : trimmed(get(row, name)) || ' ',
    }));
    if (key <= 0) {
      const names = [sql.ref(t.parent), ...cols.map((c) => sql.ref(c.name))];
      const values = [sql`${parentId}`, ...cols.map((c) => sql`${c.value}`)];
      if (t.audit) {
        names.push(sql.ref('enuser'), sql.ref('endate'));
        values.push(sql`${userId}`, sql`GETDATE()`);
      }
      const { rows: inserted } = await sql<{ id: number }>`
        INSERT INTO ${sql.table(t.table)} (${sql.join(names)}) OUTPUT INSERTED.${sql.ref(t.key)} AS id
        VALUES (${sql.join(values)})
      `.execute(trx);
      kept.push(Number(inserted[0]!.id));
    } else {
      const sets = cols.map((c) => sql`${sql.ref(c.name)} = ${c.value}`);
      if (t.audit) sets.push(sql`moduser = ${userId}`, sql`moddate = GETDATE()`);
      await sql`UPDATE ${sql.table(t.table)} SET ${sql.join(sets)} WHERE ${sql.ref(t.key)} = ${key}`.execute(
        trx,
      );
      kept.push(key);
    }
  }
  await sql`
    DELETE FROM ${sql.table(t.table)} WHERE ${sql.ref(t.parent)} = ${parentId} AND ${sql.ref(t.key)} NOT IN ${idList([0, ...kept])}
  `.execute(trx);
}
