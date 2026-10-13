import type { GridRow, GridValue, WorkReportPrompt } from '@gglib/shared';
import { sql } from 'kysely';
import type { Executor } from '../db/legacy-sql.js';

/**
 * CommonLibrary.ComanFunction.insertworkreports: after a form saves, log what changed in
 * WorkReportM (one row per record, user and day, updated as the day goes on). Ported from the
 * decompiled source, including its string formats, because the desktop reads and appends to
 * the same rows.
 */

/** clsCommon.SignBetweenStr: join with `sign`, skipping blanks. */
export function signBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  sign = ',',
): string {
  const s1 = (a ?? '').trim();
  const s2 = (b ?? '').trim();
  if (s1 === '' && s2 === '') return '';
  if (s1 === '') return b ?? '';
  if (s2 === '') return a ?? '';
  return `${s1}${sign}${s2}`;
}

/** VB Val(): the leading number of the text, or 0. */
function val(v: unknown): number {
  const m = String(v ?? '')
    .trim()
    .match(/^[+-]?(\d+\.?\d*|\.\d+)/);
  return m ? Number(m[0]) : 0;
}

/** Convert.ToString on a DataRow value: booleans read "True"/"False", null reads "". */
export function netString(v: GridValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

/** clsCommon.GetMistakeCount: how many distinct columns a "col(old)~col(old)=n" text names. */
export function mistakeCount(mistake: string): number {
  const eq = mistake.lastIndexOf('=');
  const parts = (eq >= 0 ? mistake.slice(0, eq) : mistake).split('~');
  const names = new Set<string>();
  for (const p of parts) {
    const at = p.indexOf('(');
    if (p.trim() !== '' && at > 0 && p.slice(0, at).trim() !== '')
      names.add(p.slice(0, at).toLowerCase());
  }
  return names.size;
}

/**
 * clsCommon.CompareDataTable: a popup's old and new rows as the "col(value)" lists the work
 * report stores, row by row, skipping seq and …kt/…km columns.
 */
export function compareTables(
  oldRows: Record<string, GridValue>[],
  newRows: Record<string, GridValue>[],
  columns: string[],
  mainColumn: string,
): { old: string; new: string } {
  const count = Math.max(oldRows.length, newRows.length);
  let strOld = '';
  let strNew = '';
  for (const raw of columns) {
    const col = raw.trim();
    const lower = col.toLowerCase();
    if (lower === 'seq' || lower.endsWith('kt') || lower.endsWith('km')) continue;
    let o = '';
    let n = '';
    for (let j = 0; j < count; j++) {
      const ov = j < oldRows.length ? netString(oldRows[j]![col]).trim() : undefined;
      const nv = j < newRows.length ? netString(newRows[j]![col]).trim() : undefined;
      if (ov !== undefined && nv === undefined && ov !== '') {
        o = signBetween(o, `${mainColumn}(${col}(${ov}))`, '~');
        n = signBetween(n, `${mainColumn}(${col}())`, '~');
      } else if (nv !== undefined && ov === undefined && nv !== '') {
        o = signBetween(o, `${mainColumn}(${col}())`, '~');
        n = signBetween(n, `${mainColumn}(${col}(${nv}))`, '~');
      } else if (ov !== undefined && nv !== undefined && ov !== nv) {
        o = signBetween(o, `${mainColumn}(${col}(${ov}))`, '~');
        n = signBetween(n, `${mainColumn}(${col}(${nv}))`, '~');
      }
    }
    if (o !== '' || n !== '') {
      strOld = signBetween(strOld, o, '~');
      strNew = signBetween(strNew, n, '~');
    }
  }
  return { old: strOld, new: strNew };
}

async function workTypeId(db: Executor, name: string): Promise<number> {
  const { rows } = await sql<{ id: number }>`
    SELECT ISNULL(ColumnMastkm, 0) AS id FROM columnmaster WHERE Vibhag = 'WorkType' AND Name = ${name}
  `.execute(db);
  return Number(rows[0]?.id ?? 0);
}

const LOCK_TYPES = sql`(SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'worktype' AND Name = 'Lock')`;

/** The WorkType choices a modification asks for (ColumnNo 100), as frmList1 lists them. */
export async function modifyWorkTypes(db: Executor) {
  const { rows } = await sql<{
    ColumnMastkm: number;
    Name: string;
    Brief: string | null;
    Remark: string | null;
    ColumnNo: number | null;
  }>`
    SELECT ColumnMastkm, Name, Brief, Remark, ColumnNo FROM columnmaster
    WHERE vibhag = 'WorkType' AND ColumnNo = '100' ORDER BY Name
  `.execute(db);
  return rows;
}

/**
 * The first insertworkreports overload (DataTable dtOld, dtNew): compare the record before
 * and after the save. Returns what to write, or — for a modification, where the desktop makes
 * the user pick the Work Type — what to ask. `null` when nothing is logged.
 */
export async function prepareWorkReport(
  db: Executor,
  table: string,
  primaryColumn: string,
  id: number,
  userId: number,
  oldRow: GridRow | null,
  newRow: GridRow | null,
  workTypeName = '',
): Promise<
  | null
  | {
      kind: 'write';
      workTypeId: number;
      mistake: string;
      remark: string;
      mistakeCount: number;
      workTypeName: string;
    }
  | { kind: 'ask'; pending: WorkReportPrompt }
> {
  const explicitType = workTypeName;
  const typeName = workTypeName === '' ? 'Modify' : workTypeName;
  if (id === 0) return null;
  const { rows: fresh } = await sql<{ n: number }>`
    SELECT COUNT(WorkReportKm) AS n FROM WorkReportM
    WHERE RecordNo = ${String(id)} AND DoneByGId = ${userId} AND Workdate >= CAST(GETDATE() - 1 AS date)
      AND WorkTypeGId IN (SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'worktype' AND Name = 'New')
  `.execute(db);
  if (Number(fresh[0]!.n) > 0) return null;

  let text = '';
  let text2 = '';
  if (oldRow && newRow) {
    for (const [name, oldValue] of Object.entries(oldRow)) {
      let o = netString(oldValue).trim();
      let n = netString(newRow[name]).trim();
      if (typeof oldValue === 'number' || typeof newRow[name] === 'number') {
        o = String(val(o));
        n = String(val(n));
      }
      const lower = name.toLowerCase();
      const skipped =
        ['moddate', 'moduser', 'modusername', 'endate', 'enuser', 'enusername'].includes(lower) ||
        lower.startsWith('txt') ||
        lower.endsWith('kt');
      if (skipped || o === n) continue;
      if (o.length > 3000) o = 'Ltxt';
      if (n.length > 3000) n = 'Ltxt';
      if (lower.endsWith('tran')) {
        text = text.includes(lower)
          ? signBetween(text, o, '~')
          : signBetween(text, `${lower}(${o})`, '~');
        text2 = text2.includes(name)
          ? signBetween(text2, n, '~')
          : signBetween(text2, `${name}(${n})`, '~');
        continue;
      }
      text = signBetween(text, `${lower}(${o.replace(/~/g, '`')})`, '~');
      text2 = signBetween(text2, `${name}(${n.replace(/~/g, '`')})`, '~');
    }
  }

  // Today's entry for this record by this user (not a Lock entry): its type is the default
  // pick, and what it already logged is kept in front of today's new changes.
  const { rows: today } = await sql<{
    WorkTypeName: string;
    Mistake: string | null;
    Remark: string | null;
  }>`
    SELECT columnmaster.Name AS WorkTypeName, WorkReportM.Mistake, WorkReportM.Remark FROM WorkReportM
    INNER JOIN columnmaster ON WorkReportM.WorkTypeGId = columnmaster.ColumnMastkm
    WHERE TableName = ${table} AND ColumnName = ${primaryColumn} AND Workdate = CAST(GETDATE() AS date)
      AND DoneByGId = ${userId} AND RecordNo = ${String(id)}
      AND WorkTypeGId ${typeName.toLowerCase() === 'lock' ? sql`IN (SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'worktype' AND Name = ${typeName})` : sql`NOT IN ${LOCK_TYPES}`}
  `.execute(db);
  let defaultType = '';
  if (today[0]) {
    defaultType = today[0].WorkTypeName;
    const upToEq = (s: string | null) => {
      const text0 = s ?? '';
      const at = text0.lastIndexOf('=');
      return at >= 0 ? text0.slice(0, at) : text0;
    };
    text = signBetween(upToEq(today[0].Mistake), text, '~');
    text2 = signBetween(upToEq(today[0].Remark), text2, '~');
  }

  const count = mistakeCount(text);
  if (text !== '') text = signBetween(text, String(count), '=');
  if (text2 !== '') text2 = signBetween(text2, String(count), '=');

  if (oldRow) {
    // A modification: the Work Type is asked for, unless exactly one type offers itself.
    const types =
      explicitType !== ''
        ? await sql<{ ColumnMastkm: number }>`
      SELECT ColumnMastkm FROM columnmaster WHERE vibhag = 'WorkType' AND Name = ${typeName}
    `
            .execute(db)
            .then((r) => r.rows)
        : await modifyWorkTypes(db);
    if (types.length !== 1) {
      return {
        kind: 'ask',
        pending: { recordId: id, defaultType, mistake: text, remark: text2, mistakeCount: count },
      };
    }
    return decide(db, Number(types[0]!.ColumnMastkm), text, text2, count, typeName);
  }
  return decide(db, await workTypeId(db, 'New'), text, text2, count, typeName);
}

/** The end of the first overload: write only if the type differs, or a Modify changed something. */
export async function decide(
  db: Executor,
  chosenTypeId: number,
  mistake: string,
  remark: string,
  count: number,
  typeName = 'Modify',
) {
  const modifyId = await workTypeId(db, typeName);
  const write =
    (chosenTypeId === modifyId && mistake !== '' && remark !== '' && mistake !== remark) ||
    chosenTypeId !== modifyId;
  return write
    ? {
        kind: 'write' as const,
        workTypeId: chosenTypeId,
        mistake,
        remark,
        mistakeCount: count,
        workTypeName: typeName,
      }
    : null;
}

/**
 * The second insertworkreports overload (string alter): add today's WorkReportM row for this
 * record and user, or update it when there already is one and there is something to say.
 */
export async function writeWorkReport(
  db: Executor,
  table: string,
  primaryColumn: string,
  id: number,
  userId: number,
  remark: string,
  workTypeId = 0,
  mistake = '',
  count = 0,
  workTypeName = '',
): Promise<void> {
  const alter = remark.trim();
  const mis = mistake.trim();
  const isLock = workTypeName.toLowerCase() === 'lock';
  const typeFilter = isLock
    ? sql`AND WorkTypeGId = ${workTypeId}`
    : sql`AND WorkTypeGId NOT IN ${LOCK_TYPES}`;
  const effectiveCount = isLock ? 0 : count;
  const { rows } = await sql<{ n: number }>`
    SELECT ISNULL(COUNT(*), 0) AS n FROM WorkReportM
    WHERE TableName = ${table} AND ColumnName = ${primaryColumn} AND Workdate = CAST(GETDATE() AS date)
      AND DoneByGId = ${userId} AND RecordNo = ${String(id)} ${typeFilter}
  `.execute(db);
  if (Number(rows[0]!.n) === 0) {
    await sql`
      INSERT INTO WorkReportM (RecordNo, TableName, ColumnName, WorkTypeGId, DoneByGId, Workdate, Mistake, Remark, alterTime, MistakeCount)
      VALUES (${String(id)}, ${table}, ${primaryColumn}, ${workTypeId}, ${userId}, CONVERT(date, GETDATE()), ${mis},
        ${alter}, CONVERT(time, GETDATE()), ${effectiveCount})
    `.execute(db);
  } else if (mis !== '' || alter !== '') {
    await sql`
      UPDATE WorkReportM SET Remark = ${alter}, alterTime = CONVERT(time, GETDATE())
        ${workTypeId > 0 ? sql`, WorkTypeGId = ${workTypeId}` : sql``}
        ${mis !== '' ? sql`, Mistake = ${mis}` : sql``}
        , MistakeCount = ${String(effectiveCount)}
      WHERE TableName = ${table} AND ColumnName = ${primaryColumn} AND Workdate = CONVERT(date, GETDATE())
        AND DoneByGId = ${userId} AND RecordNo = ${String(id)} ${typeFilter}
    `.execute(db);
  }
}
