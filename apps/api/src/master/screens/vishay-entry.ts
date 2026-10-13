import { parseSearch } from '@gglib/shared';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { ident } from '../../db/trusted-sql.js';
import { compileFilter } from '../search-sql.js';
import { pickListOf } from '../values.js';
import { get, int, list, type Row, text, val } from './book-common.js';
import type { TransDefinition } from './registry.js';

/**
 * The Vishay lines (frmVishayEntry) a record keeps in VishayEntry, by TransactionName: Book
 * Master's Subject and Vishesh rows, Kruti Master's titles, and the Vishesh entry forms
 * (Magazine Vishesh, English Book Vishesh), which open frmVishayEntry straight from a box.
 */

/**
 * CommonRepository.SaveVishayEntry for one parent row: its Vishay entries under `recordKt`.
 * An existing entry is also moved to `recordKt` — the desktop leaves it on the parent's old
 * key, which its own clean-up then deletes (see docs/screens/book-master.md).
 */
export async function saveVishayEntries(
  trx: Executor,
  transactionName: string,
  recordKt: number,
  rows: Row[],
): Promise<number[]> {
  const kept: number[] = [];
  for (const r of rows) {
    if (val(get(r, 'VishayKt')) <= 0) continue;
    const entryId = int(get(r, 'Id'));
    if (entryId === 0) {
      const { rows: ins } = await sql<{ id: number }>`
        INSERT INTO VishayEntry (TransactionName, RecordKt, VishayKt, VachanKt, VibhaktiKt, AnyaNameKt, Seq)
        OUTPUT INSERTED.VishayEntryKm AS id
        VALUES (${transactionName}, ${recordKt}, ${int(get(r, 'VishayKt'))}, ${int(get(r, 'VachanKt'))},
          ${int(get(r, 'VibhaktiKt'))}, ${int(get(r, 'AnyaNameKt'))}, ${int(get(r, 'Seq'))})`.execute(
        trx,
      );
      kept.push(Number(ins[0]!.id));
    } else {
      await sql`
        UPDATE VishayEntry SET RecordKt = ${recordKt}, VishayKt = ${int(get(r, 'VishayKt'))},
          VachanKt = ${int(get(r, 'VachanKt'))}, VibhaktiKt = ${int(get(r, 'VibhaktiKt'))},
          AnyaNameKt = ${int(get(r, 'AnyaNameKt'))}, Seq = ${int(get(r, 'Seq'))}
        WHERE VishayEntryKm = ${entryId}`.execute(trx);
      kept.push(entryId);
    }
  }
  return kept;
}

/**
 * frmVishayEntry's lists, for the popups whose cells open it (Book Subject's Vishay, Vishesh's
 * detail columns): the Vishay search (its first 50), a Vishay's other names, Vachan, Vibhakti.
 */
export const VISHAY_ENTRY_LOOKUPS: NonNullable<TransDefinition['lookups']> = {
  // CreateVishayList: SearchWithAndOr over Vishay_nm, in the desktop's search syntax.
  've-vishay': (db, row) => {
    const search = text(row.search);
    const parsed =
      search.trim() === ''
        ? null
        : parseSearch(search, [{ column: 'Vishay_nm', dataType: 'String' }]);
    const cond = parsed?.ok ? compileFilter(parsed.filter) : sql`1 = 1`;
    return pickListOf(
      db,
      sql`SELECT TOP (50) vishaycokm, Vishay_nm FROM Vishay WHERE ${cond} ORDER BY Vishay_nm`,
    );
  },
  've-anyaname': (db, row) =>
    pickListOf(
      db,
      sql`SELECT VishayAnyaNameKm, AnyaName FROM VishayAnyaNameT WHERE VishayKt = ${int(row.VishayKt)} ORDER BY AnyaName`,
    ),
  've-vachan': list(sql`SELECT vachancokm, vachan_nm FROM vachan ORDER BY vachan_nm`),
  've-vibhakti': list(sql`SELECT vibhaktikm, vibh_nm FROM vibhakti ORDER BY vibh_nm`),
};

/**
 * CommonRepository.SaveVishayEntry for a record's own lines (one TransactionName, one record):
 * upsert the lines, delete the record's other lines, delete lines whose record is gone, then
 * `EXEC UpdateVishay`, which writes the summary column. `rows` null: the form never loaded
 * the lines (an empty DataTable), so nothing is touched.
 *
 * `summaryColumn`: the column UpdateVishay writes for this TransactionName. With no lines left
 * the procedure only sets it to '' (its last-record branch), but its charindex scan of every
 * line of the TransactionName can take longer than the request timeout (TirthRakshaM: ~15 s),
 * so a caller that names the column gets that UPDATE directly instead.
 */
export async function saveVishayEntry(
  trx: Executor,
  rows: Row[] | null,
  transactionName: string,
  table: string,
  primaryColumn: string,
  recordKt: number,
  summaryColumn?: string,
): Promise<void> {
  if (rows === null) return;
  const kept = await saveVishayEntries(trx, transactionName, recordKt, rows);
  await sql`
    DELETE FROM VishayEntry WHERE TransactionName = ${transactionName} AND RecordKt = ${recordKt}
      ${kept.length ? sql`AND VishayEntryKm NOT IN (SELECT CAST(val AS int) FROM dbo.SplitString(${kept.join(',')}, ','))` : sql``}
  `.execute(trx);
  // The lines of this TransactionName whose record is gone: found first, then deleted by key.
  // A seek of the parent's key per line (LOOP JOIN) needs no memory grant; the single
  // DELETE … LEFT JOIN plan SQL Server picks otherwise needs a workspace grant (17 MB for
  // TirthRakshaM, more for BookSubject) that a server short of memory makes wait
  // (RESOURCE_SEMAPHORE) past the request timeout. The rows deleted are the same.
  const { rows: orphans } = await sql<{ id: number }>`
    SELECT VishayEntry.VishayEntryKm AS id FROM VishayEntry
    LEFT JOIN ${ident(table)} ON VishayEntry.RecordKt = ${ident(table)}.${ident(primaryColumn)}
    WHERE VishayEntry.TransactionName = ${transactionName} AND ISNULL(${ident(table)}.${ident(primaryColumn)}, 0) = 0
    OPTION (LOOP JOIN)
  `.execute(trx);
  if (orphans.length > 0) {
    await sql`DELETE FROM VishayEntry WHERE VishayEntryKm IN ${idList(orphans.map((o) => Number(o.id)))}`.execute(
      trx,
    );
  }
  if (summaryColumn && kept.length === 0) {
    await sql`UPDATE ${ident(table)} SET ${ident(summaryColumn)} = '' WHERE ${ident(primaryColumn)} = ${recordKt}`.execute(
      trx,
    );
    return;
  }
  await sql`EXEC UpdateVishay ${transactionName}, ${String(recordKt)}`.execute(trx);
}
