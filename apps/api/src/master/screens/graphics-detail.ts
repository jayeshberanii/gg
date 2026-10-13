import type { ChildRow, FieldValue, GridRow, PickList } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { z } from 'zod';
import { type Executor, idList, inTransaction } from '../../db/legacy-sql.js';
import { trustedSql } from '../../db/trusted-sql.js';
import { loadTblSearch, recordColumnsSql } from '../tbl-search.js';
import { normalizeRow, pickListOf } from '../values.js';
import { get, grid, int, list, nextKey, scalar, table, text, val } from './book-common.js';
import { masterRowsForDetail } from './graphics-master.js';
import { requestLabIssue } from './lab-issue-common.js';
import { openInUse, trimmed } from './master-common.js';
import type { ActionContext, ActionResult, ScreenDefinition } from './registry.js';

const INT_MAX = 2147483647;
const toIds = (list: readonly number[]) => idList(list.length ? list : [0]);

/**
 * The six "WordTran" popups of frmGraphicsDetail (frmDisplayTransNew TranName "WordTran"), each
 * a typenm of GrDetailWordT, by tblSearch column. The type is the popup's frm.TranType.
 */
export const DETAIL_WORD_TYPES: Record<string, string> = {
  VisheshTran: 'Vishesh',
  CreatorTypeTran: 'CreatorType',
  CreatorTran: 'Creator',
  MaterialTran: 'Material',
  StyleTran: 'Style',
  AvailableAtTran: 'AvailableAt',
};

/** The two Subject popups on GrDetailSubT, by tblSearch column, and their `internal` flag. */
const SUBJECT_POPUPS: Record<string, 0 | 1> = { GrDetailSubTran: 0, IntSubjectTran: 1 };

/** The graphicbkt text columns the form writes and their sizes: the desktop's save fails past them. */
const LENGTHS: [field: string, label: string, max: number][] = [
  ['refplace', 'Ref Place', 100],
  ['pictureQty', 'Picture Qty', 20],
  ['grade', 'Grade', 30],
  ['tempselected', 'Temp Selected', 255],
  ['filepath', 'File Path', 250],
  ['remark', 'Remark', 2048],
  ['color', 'Color', 10],
  ['samvat', 'Samvat', 30],
  ['comment', 'Comment', 255],
];

const bitField = (v: unknown) => v === true || v === 1 || text(v).toLowerCase() === 'true';

/** VB's assignment of Val(…) (a Double) to an Integer property: rounded, overflow refused. */
function vbInt(v: unknown, label: string): number {
  const n = Math.round(val(v));
  if (Math.abs(n) > INT_MAX) throw new BadRequestException(`${label} is too large`);
  return n;
}

/** GraphicBkTRepository.GetValidationMessage, verbatim. */
function validationMessage(f: Record<string, FieldValue>): string {
  if (Math.round(val(f.recno)) === 0) return 'Please Enter Rec No';
  return '';
}

/** frmGraphicsDetail.Save's Entgraphicbkt, from the boxes. */
function values(f: Record<string, FieldValue>) {
  return {
    recno: vbInt(f.recno, 'Rec No'),
    refplace: trimmed(f.refplace),
    pictureQty: trimmed(f.pictureQty),
    grade: trimmed(f.grade),
    pending: bitField(f.pending),
    tempselected: trimmed(f.tempselected),
    // The desktop's FilePath variable (the picture box): on the web a plain text box.
    filepath: trimmed(f.filepath),
    Graphickt: int(f.Graphickt),
    remark: trimmed(f.remark),
    color: trimmed(f.color),
    samvtypeKt: int(f.samvtypeKt),
    samvat: trimmed(f.samvat),
    viksamvat: vbInt(f.viksamvat, 'Vikramsamvat'),
    comment: trimmed(f.comment),
    PatrikaKt: int(f.PatrikaKt),
  };
}

/**
 * One Subject popup (GrDetailSubT, no identity): the record's rows of that `internal` flag are
 * replaced by the popup's; the other flag's rows stay (the desktop reloaded and re-inserted
 * them, which comes to the same). Keys are `isnull(max(grdetailSubKm),0)+1` onwards, taken
 * inside the save's transaction with the range held. Rows without a subject picked are dropped
 * (the desktop inserted them with grvishaykt 0). `seq` is the popup's (its Save numbers the
 * binding groups from the table's global MAX(seq)).
 */
async function saveSubjects(trx: Executor, id: number, internal: 0 | 1, rows: ChildRow[]) {
  await sql`DELETE FROM GrDetailSubT WHERE graphicbkt = ${id} AND ISNULL(internal, 0) = ${internal}`.execute(
    trx,
  );
  const keep = rows.filter((r) => int(get(r, 'grvishaykt')) > 0);
  if (keep.length === 0) return;
  let key = await nextKey(trx, 'GrDetailSubT', 'grdetailSubKm');
  for (const r of keep) {
    const remark = text(get(r, 'remark')).trim();
    if (remark.length > 120)
      throw new BadRequestException('Subject Remark cannot be longer than 120 characters');
    await sql`
      INSERT INTO GrDetailSubT (grdetailSubKm, graphicbkt, grvishaykt, seq, internal, signkt, remark)
      VALUES (${key++}, ${id}, ${int(get(r, 'grvishaykt'))}, ${int(get(r, 'seq'))}, ${internal},
        ${int(get(r, 'signkt'))}, ${remark})
    `.execute(trx);
  }
}

/**
 * One word popup (GrDetailWordT, no identity): the record's rows of that typenm are replaced by
 * the popup's, each with its own Remark; the other types' rows (and typenm '') are not touched.
 * The desktop instead rewrote every word row whenever any word popup was saved: two typos in its
 * "keep" logic could delete all Vishesh rows (Creator popup emptied) or none, and the kept rows
 * were reloaded with GrwordM.Remark, overwriting their own Remark. Rows without a word are dropped.
 */
async function saveWords(trx: Executor, id: number, type: string, rows: ChildRow[]) {
  await sql`DELETE FROM GrDetailWordT WHERE graphicbkt = ${id} AND typenm = ${type}`.execute(trx);
  const keep = rows.filter((r) => int(get(r, 'grwordkt')) > 0);
  if (keep.length === 0) return;
  let key = await nextKey(trx, 'GrDetailWordT', 'GrDetailWordkm');
  for (const r of keep) {
    // A loaded row keeps its own spelling of the type (most old rows are lower case).
    const own = text(get(r, 'typenm')).trim();
    const typenm = own.toLowerCase() === type.toLowerCase() ? own : type;
    const remark = text(get(r, 'Remark')).trim();
    if (remark.length > 200)
      throw new BadRequestException(`${type} Remark cannot be longer than 200 characters`);
    await sql`
      INSERT INTO GrDetailWordT (GrDetailWordkm, graphicbkt, grwordkt, seq, typenm, Remark)
      VALUES (${key++}, ${id}, ${int(get(r, 'grwordkt'))}, ${int(get(r, 'seq'))}, ${typenm}, ${remark})
    `.execute(trx);
  }
}

/** The Other LibNo popup's text cells and their sizes. */
const OTHER_REF_LENGTHS: [cell: string, label: string, max: number][] = [
  ['BookTName', 'Other LibNo', 15],
  ['Refplace', 'Other LibNo Refplace', 50],
  ['filepath', 'Other LibNo filepath', 150],
  ['remark', 'Other LibNo remark', 50],
];

/**
 * Other LibNo (GrdetailOtherRefT, no identity): delete-insert, keys MAX+1 inside the
 * transaction. A row left completely blank (the popup's starting row) is dropped.
 */
async function saveOtherRefs(trx: Executor, id: number, rows: ChildRow[]) {
  await sql`DELETE FROM GrdetailOtherRefT WHERE graphicbkt = ${id}`.execute(trx);
  const keep = rows.filter(
    (r) =>
      int(get(r, 'BookTKt')) > 0 ||
      OTHER_REF_LENGTHS.some(([cell]) => text(get(r, cell)).trim() !== ''),
  );
  if (keep.length === 0) return;
  let key = await nextKey(trx, 'GrdetailOtherRefT', 'GrdetailOtherRefTKm');
  for (const r of keep) {
    for (const [cell, label, max] of OTHER_REF_LENGTHS) {
      if (text(get(r, cell)).trim().length > max)
        throw new BadRequestException(`${label} cannot be longer than ${max} characters`);
    }
    await sql`
      INSERT INTO GrdetailOtherRefT (GrdetailOtherRefTKm, graphicbkt, libno, Refplace, filepath, remark, seq, BookTKt)
      VALUES (${key++}, ${id}, ${text(get(r, 'BookTName')).trim()}, ${text(get(r, 'Refplace')).trim()},
        ${text(get(r, 'filepath')).trim()}, ${text(get(r, 'remark')).trim()}, ${int(get(r, 'seq'))},
        ${int(get(r, 'BookTKt'))})
    `.execute(trx);
  }
}

// ------------------------------------------------------------------------------------------
// Replace / Insert / Delete in Selected Record
// ------------------------------------------------------------------------------------------

/**
 * The eight types of the three "… in Selected Record" menus, with the Type text their messages
 * name (the desktop's `Type` argument). The type always comes from this map, never from the
 * request as SQL.
 */
const BULK_TYPES = {
  subject: 'Subject',
  material: 'material',
  style: 'style',
  grade: 'grade',
  availableat: 'availableat',
  creator: 'creator',
  creatortype: 'creatortype',
  vishesh: 'vishesh',
} as const;
type BulkType = keyof typeof BULK_TYPES;

function bulkType(v: unknown): BulkType {
  const t = text(v).toLowerCase();
  if (!(t in BULK_TYPES)) throw new BadRequestException('Unknown type');
  return t as BulkType;
}

/** The word ids (GrDetailWordT.grwordkt) of type `t` the selected rows use. */
const usedWords = (t: string, ids: number[]) =>
  sql`SELECT GrDetailWordT.grwordkt, GrwordM.wordnm FROM GrDetailWordT
    INNER JOIN GrwordM ON GrDetailWordT.grwordkt = GrwordM.GrwordMkm
    WHERE GrwordM.typenm = ${t} AND GrDetailWordT.graphicbkt IN ${toIds(ids)}
    GROUP BY GrDetailWordT.grwordkt, GrwordM.wordnm ORDER BY GrwordM.wordnm`;
const allWords = (t: string) =>
  sql`SELECT GrwordMkm, wordnm FROM GrwordM WHERE typenm = ${t} GROUP BY GrwordMkm, wordnm ORDER BY wordnm`;
/** The grades the selected rows have (the desktop's `REPLACE(0,0,0) AS Id`: every Id is 0). */
const usedGrades = (ids: number[]) =>
  sql`SELECT 0 AS Id, grade FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)} GROUP BY grade ORDER BY grade`;

/** Each menu's list, exactly as its handler passes it to DisplayListForm. */
function bulkList(op: 'old' | 'new' | 'insert' | 'delete', t: BulkType, ids: number[]) {
  if (t === 'subject') {
    if (op === 'old')
      return sql`SELECT GrVishay.Grvishaykm, GrVishay.vishaynm, GrVishay.defination FROM GrVishay
        INNER JOIN GrDetailSubT ON GrVishay.Grvishaykm = GrDetailSubT.grvishaykt
        WHERE GrDetailSubT.graphicbkt IN ${toIds(ids)}
        GROUP BY GrVishay.Grvishaykm, GrVishay.vishaynm, GrVishay.defination ORDER BY GrVishay.vishaynm`;
    if (op === 'new')
      return sql`SELECT Grvishaykm, vishaynm, defination FROM GrVishay WHERE ISNULL(IsCancel, 0) <> 1 ORDER BY vishaynm`;
    if (op === 'insert')
      return sql`SELECT Grvishaykm, vishaynm, defination, remark, groupnm FROM GrVishay WHERE ISNULL(IsCancel, 0) <> 1 ORDER BY vishaynm`;
    return sql`SELECT GrVishay.Grvishaykm, GrVishay.vishaynm, GrVishay.defination, GrVishay.remark, GrVishay.groupnm FROM GrVishay
      INNER JOIN GrDetailSubT ON GrVishay.Grvishaykm = GrDetailSubT.grvishaykt
      WHERE GrDetailSubT.graphicbkt IN ${toIds(ids)}
      GROUP BY GrVishay.Grvishaykm, GrVishay.vishaynm, GrVishay.defination, GrVishay.remark, GrVishay.groupnm
      ORDER BY GrVishay.vishaynm`;
  }
  if (t === 'grade') {
    if (op === 'new')
      return sql`SELECT GrwordMkm, wordnm, defination, remark FROM GrwordM WHERE typenm = 'grade'`;
    if (op === 'insert') return allWords('grade');
    return usedGrades(ids);
  }
  return op === 'new' || op === 'insert' ? allWords(t) : usedWords(t, ids);
}

/** Refuses a bulk change when a selected record is Locked (the desktop disabled the menus only for a locked current record). */
async function assertUnlocked(db: Executor, ids: number[]) {
  const n = int(
    await scalar(
      db,
      sql`SELECT COUNT(*) FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)} AND ISNULL(Locked, 0) = 1`,
    ),
  );
  if (n > 0) throw new BadRequestException('A selected record is Locked');
}

/** The selected rows that exist, in the order they were selected. */
async function existing(db: Executor, ids: number[]): Promise<number[]> {
  const { rows } = await sql<{ id: number }>`
    SELECT graphicBkTkm AS id FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)}
  `.execute(db);
  const found = new Set(rows.map((r) => Number(r.id)));
  return [...new Set(ids)].filter((id) => found.has(id));
}

const affected = (r: { numAffectedRows?: bigint }) => Number(r.numAffectedRows ?? 0);

/** A picked list row: its Tag (code) and Text (name), as the client sends them. */
function picked(ctx: ActionContext, prefix: string) {
  return { id: int(ctx.params[`${prefix}Id`]), text: text(ctx.params[`${prefix}Text`]) };
}

// ------------------------------------------------------------------------------------------
// insert into grouping records
// ------------------------------------------------------------------------------------------

const groupingRow = z.object({
  GrdetailSelectedPicTKm: z.coerce.number().int().nullish(),
  Title: z.string().max(50).nullish(),
  requiredbykt: z.coerce.number().int().nullish(),
  selectedbykt: z.coerce.number().int().nullish(),
  grvishaykt: z.coerce.number().int().nullish(),
  grwordkt: z.coerce.number().int().nullish(),
  givendate: z.string().nullish(),
  signkt: z.coerce.number().int().nullish(),
  seq: z.coerce.number().int().nullish(),
});

/** The popup's givendate: a date it loaded (ISO) or today's (the column is read-only). */
function givenDate(v: string | null | undefined): string {
  const iso = (v ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const dmy = (v ?? '').match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return new Date().toISOString().slice(0, 10);
}

/** The group the first selected record (in selection order) belongs to, or 0. */
async function groupOf(db: Executor, ids: number[]): Promise<number> {
  for (const id of ids) {
    const g = int(
      await scalar(db, sql`SELECT TOP (1) grpnokt FROM GraphicbktGrpT WHERE graphicbkT = ${id}`),
    );
    if (g !== 0) return g;
  }
  return 0;
}

/** The grouping popup's rows of group `g` (FillData's / the menu's dtgroupdetail query). */
async function groupRows(db: Executor, g: number): Promise<ChildRow[]> {
  const { rows } = await sql<Record<string, unknown>>`
    SELECT g.GrdetailSelectedPicTKm, g.grpnokm, g.Title, g.requiredbykt, c1.Name AS requiredby, g.selectedbykt,
      c2.Name AS selectedby, g.grvishaykt, v.vishaynm, g.grwordkt, gw.wordnm, g.givendate, g.signkt, c3.Name AS sign, g.seq
    FROM GrdetailSelectedPicT AS g
    LEFT OUTER JOIN columnmaster AS c1 ON g.requiredbykt = c1.ColumnMastkm
    LEFT OUTER JOIN columnmaster AS c2 ON g.selectedbykt = c2.ColumnMastkm
    LEFT OUTER JOIN columnmaster AS c3 ON g.signkt = c3.ColumnMastkm
    LEFT OUTER JOIN GrVishay AS v ON g.grvishaykt = v.Grvishaykm
    LEFT OUTER JOIN grwordm AS gw ON g.grwordkt = gw.GrwordMkm
    WHERE g.grpnokm = ${g} ORDER BY g.seq
  `.execute(db);
  return rows.map((r) => normalizeRow(r));
}

// ------------------------------------------------------------------------------------------
// The parent GraphicBKM row (dgGraphicMaster)
// ------------------------------------------------------------------------------------------

/** GraphicBKMRepository.GetDataTableById("GraphicBKM","graphicBkm", id): its tblSearch columns. */
async function graphicMasterRow(db: Executor, id: number): Promise<GridRow | null> {
  const rows = await loadTblSearch(db, 'GraphicBKM');
  const columns = recordColumnsSql(rows).replace(/&gt;/g, '>').replace(/&lt;/g, '<');
  const { rows: found } = await sql<Record<string, unknown>>`
    SELECT ${trustedSql(columns)} FROM GraphicBKM WHERE graphicBkm = ${id}
  `.execute(db);
  return found[0] ? normalizeRow(found[0]) : null;
}

/** The Graphickt values of the selected rows. */
async function parentsOf(db: Executor, ids: number[]): Promise<number[]> {
  const { rows } = await sql<{ id: number }>`
    SELECT DISTINCT Graphickt AS id FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)}
  `.execute(db);
  return rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
}

/** Break And Bind's first list: subjects bound (sign *) into a group somewhere. */
const BREAK_BIND_SUBJECTS = sql`
  SELECT DISTINCT GrDetailSubT.grvishaykt, GrVishay.vishaynm FROM GrDetailSubT
  LEFT OUTER JOIN GrVishay ON GrDetailSubT.grvishaykt = GrVishay.Grvishaykm
  LEFT OUTER JOIN columnmaster ON GrDetailSubT.signkt = columnmaster.ColumnMastkm
  WHERE seq IN (SELECT seq FROM GrDetailSubT GROUP BY graphicbkt, seq HAVING COUNT(seq) > 1)
    AND ISNULL(columnmaster.Name, '') = '*' AND ISNULL(grvishaykt, 0) > 0
  ORDER BY vishaynm`;

/** Break And Bind's @gids: the details whose bound group holds subject `v`. */
function breakBindGroupIds(v: number): RawBuilder<unknown> {
  return sql`SELECT graphicbkt FROM GrDetailSubT
    LEFT OUTER JOIN GrVishay ON GrDetailSubT.grvishaykt = GrVishay.Grvishaykm
    INNER JOIN columnmaster ON GrDetailSubT.signkt = columnmaster.ColumnMastkm
    WHERE seq IN (SELECT seq FROM GrDetailSubT GROUP BY graphicbkt, seq HAVING COUNT(seq) > 1)
      AND ISNULL(columnmaster.Name, '') = '*' AND grvishaykt = ${v}`;
}

/**
 * Graphics › Graphics Detail (frmGraphicsDetail, GraphicBkTRepository). Table graphicbkt,
 * IDENTITY key graphicBkTkm, one row per picture of a Graphics Master book. Children GrDetailSubT
 * (Subject / IntSubject), GrDetailWordT (six word types) and GrdetailOtherRefT (Other LibNo),
 * saved with the record in one transaction. See docs/screens/graphics-detail.md.
 */
export const graphicsDetail: ScreenDefinition = {
  screen: 'graphics-detail',
  table: 'graphicbkt',
  primaryColumn: 'graphicBkTkm',
  lockable: true,
  // FillData: a Locked row is read-only (EnableDisableDataEditing(…, True)).
  lockedColumns: ['Locked'],
  // clsCom1.insertworkreports after every Save (Add and Edit); Delete logs nothing.
  workReport: true,
  workReportOn: { add: true, edit: true, delete: false },
  // ListGridData loads all 74k rows on the desktop; the web shows the newest 5,000 (the largest
  // book has 3,639 pictures, so a window opened for one book always shows all of them).
  listLimit: 5000,
  // Add Detail's WhereCondition " and Graphickt in (<id>)" (kept by Refresh).
  listCondition: (params) => {
    const g = int(params.graphickt);
    return g > 0 ? sql`Graphickt = ${g}` : null;
  },

  // Txt_KeyDown's F1: a box's tblSearch HelpText reference rows.
  help: true,

  validate: (f) => validationMessage(f),

  async save(trx, user, id, f) {
    const message = validationMessage(f);
    if (message) throw new BadRequestException(message);
    for (const [field, label, max] of LENGTHS) {
      if (trimmed(f[field]).length > max)
        throw new BadRequestException(`${label} cannot be longer than ${max} characters`);
    }
    const v = values(f);
    let recordId = id;
    if (id > 0) {
      const updated = await sql`
        UPDATE graphicbkt SET recno = ${v.recno}, refplace = ${v.refplace}, pictureQty = ${v.pictureQty},
          grade = ${v.grade}, pending = ${v.pending}, tempselected = ${v.tempselected}, filepath = ${v.filepath},
          Graphickt = ${v.Graphickt}, remark = ${v.remark}, color = ${v.color}, samvtypeKt = ${v.samvtypeKt},
          samvat = ${v.samvat}, viksamvat = ${v.viksamvat}, comment = ${v.comment}, PatrikaKt = ${v.PatrikaKt},
          moduser = ${user.id}, moddate = GETDATE()
        WHERE graphicBkTkm = ${id}
      `.execute(trx);
      if (affected(updated) === 0) throw new BadRequestException('Record not found');
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO graphicbkt (recno, refplace, pictureQty, grade, pending, tempselected, filepath, Graphickt,
          remark, color, samvtypeKt, samvat, viksamvat, comment, PatrikaKt, enuser, endate)
        OUTPUT INSERTED.graphicBkTkm AS id
        VALUES (${v.recno}, ${v.refplace}, ${v.pictureQty}, ${v.grade}, ${v.pending}, ${v.tempselected},
          ${v.filepath}, ${v.Graphickt}, ${v.remark}, ${v.color}, ${v.samvtypeKt}, ${v.samvat}, ${v.viksamvat},
          ${v.comment}, ${v.PatrikaKt}, ${user.id}, GETDATE())
      `.execute(trx);
      recordId = Number(rows[0]!.id);
    }
    // Only the popups the user saved (or a new record started with) come with rows.
    for (const [column, internal] of Object.entries(SUBJECT_POPUPS)) {
      const rows = grid(f, column);
      if (rows) await saveSubjects(trx, recordId, internal, rows);
    }
    for (const [column, type] of Object.entries(DETAIL_WORD_TYPES)) {
      const rows = grid(f, column);
      if (rows) await saveWords(trx, recordId, type, rows);
    }
    const refs = grid(f, 'GrdetailOtherRefTran');
    if (refs) await saveOtherRefs(trx, recordId, refs);
    return recordId;
  },

  /**
   * GraphicBkTRepository.Delete: the popups' rows and the record in one transaction, plus its
   * grouping rows (GraphicbktGrpT), which the desktop left behind. No in-use check.
   */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM GrDetailSubT WHERE graphicbkt = ${id}`.execute(trx);
    await sql`DELETE FROM GrDetailWordT WHERE graphicbkt = ${id}`.execute(trx);
    await sql`DELETE FROM GrdetailOtherRefT WHERE graphicbkt = ${id}`.execute(trx);
    await sql`DELETE FROM GraphicbktGrpT WHERE graphicbkT = ${id}`.execute(trx);
    return affected(await sql`DELETE FROM graphicbkt WHERE graphicBkTkm = ${id}`.execute(trx));
  },

  f2: {
    /** txtLibNo (Txt_KeyDown): every Graphics Master book, by library number. */
    graphickt: list(sql`
      SELECT graphicBkm, CASE WHEN ISNULL(GraphicBKM.BookTKt, 0) = 0 THEN GraphicBKM.libno ELSE BookT.Libno END AS libno
      FROM GraphicBKM LEFT JOIN BookT ON GraphicBKM.BookTKt = BookT.tid ORDER BY GraphicBKM.libno`),
  },

  // frmDisplayTransNew.SetForm_GraphicDetail (s = 0).
  trans: {
    ...Object.fromEntries(
      Object.keys(SUBJECT_POPUPS).map((column) => [
        column,
        {
          lookups: {
            sign: list(
              sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'sign' ORDER BY Name`,
            ),
            vishaynm: list(
              sql`SELECT Grvishaykm, vishaynm, defination, Remark FROM GrVishay WHERE ISNULL(IsCancel, 0) <> 1 ORDER BY vishaynm`,
            ),
            // The remark words, appended comma-separated (the desktop's repeating pick).
            remark: list(
              sql`SELECT wordnm, defination FROM GrwordM WHERE typenm = 'Remark' AND ISNULL(wordnm, '') <> '' ORDER BY wordnm`,
            ),
            /** TsBtnSave's `select MAX(seq) from GrDetailSubT`, the start of the binding groups. */
            maxseq: async (db: Executor): Promise<PickList> => ({
              columns: ['seq'],
              rows: [[int(await scalar(db, sql`SELECT MAX(seq) FROM GrDetailSubT`))]],
            }),
          },
        },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(DETAIL_WORD_TYPES).map(([column, type]) => [
        column,
        {
          lookups: {
            wordnm: (db: Executor) =>
              pickListOf(
                db,
                sql`SELECT GrwordMkm, wordnm, defination, remark FROM GrwordM WHERE typenm = ${type} ORDER BY wordnm`,
              ),
            remark: list(
              sql`SELECT wordnm, defination FROM GrwordM WHERE typenm = 'Remark' ORDER BY wordnm`,
            ),
          },
        },
      ]),
    ),
    GrdetailOtherRefTran: {
      lookups: {
        booktname: list(
          sql`SELECT tid, libno FROM bookT WHERE ISNULL(libno, '') <> '' ORDER BY libno`,
        ),
      },
    },
    // Utility › insert into grouping records (TranName "grouping"): not a record popup.
    grouping: {
      lookups: {
        requiredby: list(
          sql`SELECT ColumnMastkm, name FROM columnmaster WHERE vibhag = 'doneby' ORDER BY name`,
        ),
        selectedby: list(
          sql`SELECT ColumnMastkm, name FROM columnmaster WHERE vibhag = 'doneby' ORDER BY name`,
        ),
        vishaynm: list(
          sql`SELECT Grvishaykm, vishaynm, Remark FROM GrVishay WHERE ISNULL(IsCancel, 0) <> 1 ORDER BY vishaynm`,
        ),
        wordnm: list(sql`SELECT GrwordMkm, wordnm FROM grwordm ORDER BY wordnm`),
        sign: list(
          sql`SELECT ColumnMastkm, name FROM columnmaster WHERE vibhag = 'sign' ORDER BY name`,
        ),
      },
    },
  },

  lists: {
    /** Update Patrika For Selected Records / txtPatrikaKt: the Patrikas marked "Graphic". */
    patrika: list(sql`
      SELECT DISTINCT PatrikaKm, RecordNo FROM Patrika
      INNER JOIN PatrikaMixSignT ON Patrika.PatrikaKm = PatrikaMixSignT.PatrikaKt
      INNER JOIN visheshMast ON PatrikaMixSignT.MixSignKt = visheshMast.Tid
      WHERE visheshMast.Vishesh = 'Graphic' ORDER BY RecordNo`),
    /** Break And Bind, first list. */
    'break-bind-subjects': list(BREAK_BIND_SUBJECTS),
    /** Break And Bind, second list: the other subjects of the groups holding the first pick. */
    'break-bind-members': (db, params) => {
      const v = int(params.v);
      return pickListOf(
        db,
        sql`SELECT DISTINCT Main.grvishaykt, GrVishay.vishaynm FROM GrDetailSubT Main
          LEFT OUTER JOIN GrVishay ON Main.grvishaykt = GrVishay.Grvishaykm
          LEFT OUTER JOIN columnmaster ON Main.signkt = columnmaster.ColumnMastkm
          WHERE seq IN (SELECT seq FROM GrDetailSubT WHERE grvishaykt = ${v} AND ISNULL(internal, 0) = 0
              AND graphicbkt IN (${breakBindGroupIds(v)}))
            AND ISNULL(columnmaster.Name, '') <> '*'
          ORDER BY vishaynm`,
      );
    },
  },

  actions: {
    /**
     * Ctrl+L / Ctrl+U (InputBoxProc("vis123") → GRAPHICS_LOCK_PASSWORD; the second Security
     * password still works): LockUnlockRecords on the selected rows.
     */
    async 'lock-records'(db, _user, ids, ctx): Promise<ActionResult> {
      ctx.assertPassword(ctx.params.password, ctx.env.GRAPHICS_LOCK_PASSWORD ?? '');
      const lock = bitField(ctx.params.lock);
      const n = affected(
        await sql`UPDATE graphicbkt SET Locked = ${lock ? 1 : 0} WHERE graphicBkTkm IN ${toIds(ids)}`.execute(
          db,
        ),
      );
      return {
        kind: 'refreshed',
        rows: [],
        message: lock
          ? `Locked Successfully in ${n} Records`
          : `Unlocked Successfully in ${n} Records`,
      };
    },

    /** FillGraphicMaster: the parent GraphicBKM row (`ids[0]`) for dgGraphicMaster. */
    async 'graphic-master-row'(db, _user, ids): Promise<ActionResult> {
      const row = int(ids[0]) > 0 ? await graphicMasterRow(db, int(ids[0])) : null;
      return { kind: 'list', rows: row ? [row] : [] };
    },

    /**
     * Add Detail with "Do You Want To Copy Master Data?" answered Yes: the master's popup rows
     * for the new detail (graphics-master.ts masterRowsForDetail), as a `form` result.
     */
    async 'master-rows'(db, _user, _ids, ctx): Promise<ActionResult> {
      const rows = await masterRowsForDetail(db, int(ctx.params.graphicBkm));
      return {
        kind: 'form',
        fields: {},
        trans: Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { rows: r }])),
      };
    },

    /** The list a "… in Selected Record" menu item shows (old / new value, or the one to insert / delete). */
    async 'bulk-list'(db, _user, ids, ctx): Promise<ActionResult> {
      const t = bulkType(ctx.params.type);
      const op = text(ctx.params.op);
      if (op !== 'old' && op !== 'new' && op !== 'insert' && op !== 'delete')
        throw new BadRequestException('Unknown list');
      const picks = await pickListOf(db, bulkList(op, t, ids));
      return { kind: 'table', title: 'List', columns: picks.columns, rows: picks.rows };
    },

    /**
     * Replace in Selected Record (ReplaceSelectedRecord): the old value picked from what the
     * selected rows use, the new one from the full list, then the Security password. Grade works
     * here: on the desktop its old-value list has Id 0 on every row, so it always stopped.
     */
    async 'bulk-replace'(db, _user, ids, ctx): Promise<ActionResult> {
      const t = bulkType(ctx.params.type);
      ctx.assertPassword(ctx.params.password);
      const old = picked(ctx, 'old');
      const now = picked(ctx, 'new');
      if (t !== 'grade' && (old.id <= 0 || now.id <= 0))
        throw new BadRequestException('Nothing was picked');
      const rows = await existing(db, ids);
      if (rows.length === 0) return { kind: 'message', message: '' };
      await assertUnlocked(db, rows);
      const n = await inTransaction(db, async (trx) => {
        if (t === 'grade')
          return affected(
            await sql`UPDATE graphicbkt SET grade = ${now.text} WHERE graphicBkTkm IN ${toIds(rows)} AND grade = ${old.text}`.execute(
              trx,
            ),
          );
        if (t === 'subject')
          return affected(
            await sql`UPDATE GrDetailSubT SET grvishaykt = ${now.id} WHERE graphicbkt IN ${toIds(rows)} AND grvishaykt = ${old.id}`.execute(
              trx,
            ),
          );
        // No typenm filter, as on the desktop: a word's id belongs to one type.
        return affected(
          await sql`UPDATE GrDetailWordT SET grwordkt = ${now.id} WHERE graphicbkt IN ${toIds(rows)} AND grwordkt = ${old.id}`.execute(
            trx,
          ),
        );
      });
      return {
        kind: 'refreshed',
        rows: [],
        message: `At ${n} Places ${old.text} is Replaced by ${now.text} succefully`,
      };
    },

    /** Insert in Selected Record (InsertInSelectedRecord): the pick added to every selected row. */
    async 'bulk-insert'(db, _user, ids, ctx): Promise<ActionResult> {
      const t = bulkType(ctx.params.type);
      ctx.assertPassword(ctx.params.password);
      const pick = picked(ctx, 'pick');
      if (pick.id <= 0) throw new BadRequestException('Nothing was picked');
      const rows = await existing(db, ids);
      if (rows.length === 0) return { kind: 'message', message: '' };
      await assertUnlocked(db, rows);
      const n = await inTransaction(db, async (trx) => {
        if (t === 'grade')
          return affected(
            await sql`UPDATE graphicbkt SET grade = ${pick.text} WHERE graphicBkTkm IN ${toIds(rows)}`.execute(
              trx,
            ),
          );
        // Keys MAX+1 of the table itself, inside the transaction (the desktop read MAX outside it).
        let key =
          t === 'subject'
            ? await nextKey(trx, 'GrDetailSubT', 'grdetailSubKm')
            : await nextKey(trx, 'GrDetailWordT', 'GrDetailWordkm');
        let count = 0;
        for (const row of rows) {
          const r =
            t === 'subject'
              ? await sql`INSERT INTO GrDetailSubT (grdetailSubKm, graphicbkt, grvishaykt, seq, internal, signkt, remark)
                  VALUES (${key++}, ${row}, ${pick.id}, 100, 0, 0, '')`.execute(trx)
              : await sql`INSERT INTO GrDetailWordT (GrDetailWordkm, graphicbkt, grwordkt, seq, typenm, Remark)
                  VALUES (${key++}, ${row}, ${pick.id}, 100, ${BULK_TYPES[t]}, '')`.execute(trx);
          count += affected(r);
        }
        return count;
      });
      return {
        kind: 'refreshed',
        rows: [],
        message: `At ${n} Places ${pick.text},Type -${BULK_TYPES[t]} is Inserted succefully`,
      };
    },

    /** Delete in Selected Record (DeleteInSelectedRecord). Grade works here too (see Replace). */
    async 'bulk-delete'(db, _user, ids, ctx): Promise<ActionResult> {
      const t = bulkType(ctx.params.type);
      ctx.assertPassword(ctx.params.password);
      const pick = picked(ctx, 'pick');
      if (t !== 'grade' && pick.id <= 0) throw new BadRequestException('Nothing was picked');
      const rows = await existing(db, ids);
      if (rows.length === 0) return { kind: 'message', message: '' };
      await assertUnlocked(db, rows);
      const n = await inTransaction(db, async (trx) => {
        if (t === 'grade')
          return affected(
            await sql`UPDATE graphicbkt SET grade = '' WHERE graphicBkTkm IN ${toIds(rows)} AND grade = ${pick.text}`.execute(
              trx,
            ),
          );
        if (t === 'subject')
          return affected(
            await sql`DELETE FROM GrDetailSubT WHERE graphicbkt IN ${toIds(rows)} AND grvishaykt = ${pick.id}`.execute(
              trx,
            ),
          );
        return affected(
          await sql`DELETE FROM GrDetailWordT WHERE typenm = ${BULK_TYPES[t]} AND graphicbkt IN ${toIds(rows)}
            AND grwordkt = ${pick.id}`.execute(trx),
        );
      });
      return {
        kind: 'refreshed',
        rows: [],
        message: `At ${n} Places ${pick.text},Type -${BULK_TYPES[t]} is Deleted succefully`,
      };
    },

    /**
     * Delete in Selected Record › File Path: InputBoxProc("vis123") (GRAPHICS_LOCK_PASSWORD, the
     * second Security password too), then the Yes/No, then the selected rows' filepath blanked.
     */
    async 'delete-filepath'(db, _user, ids, ctx): Promise<ActionResult> {
      ctx.assertPassword(ctx.params.password, ctx.env.GRAPHICS_LOCK_PASSWORD ?? '');
      const rows = await existing(db, ids);
      if (rows.length === 0) return { kind: 'message', message: '' };
      await assertUnlocked(db, rows);
      await sql`UPDATE graphicbkt SET filepath = '' WHERE graphicBkTkm IN ${toIds(rows)}`.execute(
        db,
      );
      return { kind: 'refreshed', rows: [] };
    },

    /** Show Record From Selected Record › Having Same FileName (every record, not the selection). */
    async 'same-filename'(_db, _user, _ids, ctx): Promise<ActionResult> {
      const rows = await ctx.list(sql`graphicBkTkm IN (SELECT graphicBkTkm FROM graphicbkt
        WHERE filepath IN (SELECT filepath FROM graphicbkt GROUP BY filepath HAVING COUNT(filepath) > 1)
          AND filepath NOT LIKE '')`);
      if (rows.length === 0)
        return { kind: 'message', message: 'There are no File having same file name' };
      return { kind: 'list', rows };
    },

    /**
     * › Having RefPlace Not Match with FileName: the selected rows whose file name (after the
     * last `\`, spaces before the extension trimmed) is not `<refplace>.<last 3 letters>`.
     */
    async 'refplace-mismatch'(db, _user, ids, ctx): Promise<ActionResult> {
      const { rows } = await sql<{ id: number; refplace: string | null; filepath: string | null }>`
        SELECT graphicBkTkm AS id, refplace, filepath FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)}
      `.execute(db);
      const bad = rows
        .filter((r) => {
          const path = text(r.filepath);
          let name = path.slice(path.lastIndexOf('\\') + 1);
          if (name.trim() !== '' && name.includes('.')) {
            const dot = name.indexOf('.');
            name = name.trim().slice(0, dot).trim() + name.slice(dot);
          }
          const ref = text(r.refplace);
          const expected =
            ref.trim() !== '' && name.trim() !== '' ? `${ref}.${name.slice(-3)}` : '';
          return name !== expected;
        })
        .map((r) => Number(r.id));
      if (bad.length === 0) return { kind: 'message', message: 'No Records Found' };
      return { kind: 'list', rows: await ctx.list(sql`graphicBkTkm IN ${toIds(bad)}`) };
    },

    /** Utility › Break And Bind, after its two lists: the details of the picked pair. */
    async 'break-and-bind'(_db, _user, _ids, ctx): Promise<ActionResult> {
      const v = int(ctx.params.v);
      const w = int(ctx.params.w);
      const rows = await ctx.list(sql`graphicBkTkm IN (SELECT graphicbkt FROM GrDetailSubT Main
        LEFT OUTER JOIN columnmaster ON Main.signkt = columnmaster.ColumnMastkm
        WHERE seq IN (SELECT seq FROM GrDetailSubT WHERE grvishaykt = ${v} AND ISNULL(internal, 0) = 0)
          AND ISNULL(columnmaster.Name, '') <> '*' AND grvishaykt = ${w})`);
      if (rows.length === 0) return { kind: 'message', message: 'No Records Found' };
      return { kind: 'list', rows };
    },

    /** Print Record › Ref Place having not filepath for given book (txtLibNo's book), to Excel. */
    async 'refplace-no-filepath'(db, _user, _ids, ctx): Promise<ActionResult> {
      const g = int(ctx.params.graphickt);
      // The desktop failed with an SQL error when no Lib No was on screen.
      if (g <= 0) return { kind: 'message', message: 'Please Enter Lib No' };
      return {
        kind: 'table',
        title: 'Ref Place',
        ...(await table(
          db,
          sql`SELECT refplace FROM graphicbkt WHERE filepath = '' AND Graphickt = ${g}`,
        )),
      };
    },

    /** Print Record › Duplicate RecordNo: the RecNos used twice among the grid's rows, to Excel. */
    async 'duplicate-recno'(db, _user, _ids, ctx): Promise<ActionResult> {
      const v = ctx.params.gridIds;
      const all = Array.isArray(v) ? v : [];
      return {
        kind: 'table',
        title: 'Duplicate RecordNo',
        ...(await table(
          db,
          sql`SELECT RecNo FROM graphicbkt WHERE graphicBkTkm IN ${toIds(all)} GROUP BY RecNo HAVING COUNT(RecNo) > 1 ORDER BY RecNo`,
        )),
      };
    },

    /**
     * Utility › Update Patrika For Selected Records: PatrikaKt of every selected row. Fix: the
     * current user is written as moduser (the desktop re-saved each row with its old moduser).
     */
    async 'update-patrika'(db, user, ids, ctx): Promise<ActionResult> {
      const patrika = int(ctx.params.patrika);
      if (patrika <= 0) return { kind: 'message', message: '' };
      const rows = await existing(db, ids);
      await assertUnlocked(db, rows);
      await sql`UPDATE graphicbkt SET PatrikaKt = ${patrika}, moduser = ${user.id}, moddate = GETDATE()
        WHERE graphicBkTkm IN ${toIds(rows)}`.execute(db);
      return {
        kind: 'message',
        message: `Records Updated Successfully At ${ids.length} Places`,
      };
    },

    /**
     * Utility › insert into grouping records, first step: the group the selection already belongs
     * to (the first selected row found in GraphicbktGrpT), 0 for a new one, and its popup rows.
     */
    async 'grouping-start'(db, _user, ids): Promise<ActionResult> {
      const group = await groupOf(db, ids);
      return {
        kind: 'form',
        fields: { group },
        trans: { grouping: { rows: group > 0 ? await groupRows(db, group) : [] } },
      };
    },

    /**
     * The grouping popup's Save, in one transaction. A new group (no selected row grouped yet):
     * number MAX(grpnokt)+1, one GraphicbktGrpT row per selected record with the remark, and the
     * popup's rows. An existing group: only its popup rows, upserted by key (rows taken out are
     * deleted). Fixes: the desktop re-inserted the current record's group rows and every popup row
     * on each save, used group number 0 for an existing group, and left its connection open.
     */
    async 'grouping-save'(db, _user, ids, ctx): Promise<ActionResult> {
      let parsed: z.infer<typeof groupingRow>[];
      try {
        parsed = z
          .array(groupingRow)
          .max(500)
          .parse(JSON.parse(text(ctx.params.rows) || '[]'));
      } catch {
        throw new BadRequestException('Invalid grouping rows');
      }
      const remarks = text(ctx.params.remarks).trim();
      if (remarks.length > 50)
        throw new BadRequestException('Remarks cannot be longer than 50 characters');
      const rows = await existing(db, ids);
      if (rows.length === 0) return { kind: 'message', message: '' };
      await inTransaction(db, async (trx) => {
        let group = await groupOf(trx, rows);
        if (group === 0) {
          group = await nextKey(trx, 'GraphicbktGrpT', 'grpnokt');
          let key = await nextKey(trx, 'GraphicbktGrpT', 'GraphicbktGrpkm');
          let seq = 1;
          for (const row of rows) {
            await sql`INSERT INTO GraphicbktGrpT (GraphicbktGrpkm, grpnokt, graphicbkT, UseRemark, seq)
              VALUES (${key++}, ${group}, ${row}, ${remarks}, ${seq++})`.execute(trx);
          }
        }
        const kept: number[] = [];
        let next = 0;
        for (const r of parsed) {
          const own = int(r.GrdetailSelectedPicTKm);
          const v = {
            title: text(r.Title).trim(),
            requiredby: int(r.requiredbykt),
            selectedby: int(r.selectedbykt),
            vishay: int(r.grvishaykt),
            word: int(r.grwordkt),
            date: givenDate(r.givendate),
            sign: int(r.signkt),
            seq: int(r.seq),
          };
          const exists =
            own > 0 &&
            int(
              await scalar(
                trx,
                sql`SELECT COUNT(*) FROM GrdetailSelectedPicT WHERE GrdetailSelectedPicTKm = ${own} AND grpnokm = ${group}`,
              ),
            ) > 0;
          if (exists) {
            await sql`UPDATE GrdetailSelectedPicT SET Title = ${v.title}, requiredbykt = ${v.requiredby},
                selectedbykt = ${v.selectedby}, grvishaykt = ${v.vishay}, grwordkt = ${v.word}, givendate = ${v.date},
                signkt = ${v.sign}, seq = ${v.seq}
              WHERE GrdetailSelectedPicTKm = ${own}`.execute(trx);
            kept.push(own);
          } else {
            if (next === 0)
              next = await nextKey(trx, 'GrdetailSelectedPicT', 'GrdetailSelectedPicTKm');
            await sql`INSERT INTO GrdetailSelectedPicT (GrdetailSelectedPicTKm, grpnokm, Title, requiredbykt, selectedbykt,
                grvishaykt, grwordkt, givendate, signkt, seq)
              VALUES (${next}, ${group}, ${v.title}, ${v.requiredby}, ${v.selectedby}, ${v.vishay}, ${v.word}, ${v.date},
                ${v.sign}, ${v.seq})`.execute(trx);
            kept.push(next++);
          }
        }
        await sql`DELETE FROM GrdetailSelectedPicT WHERE grpnokm = ${group}
          AND GrdetailSelectedPicTKm NOT IN ${idList([0, ...kept])}`.execute(trx);
      });
      return { kind: 'message', message: '' };
    },

    /**
     * ContextMenuStrip1 › Utility › Request For Book(LabIssue), on dgGraphicMaster: a LabIssueM
     * request for the parent's book (`ids[0]` = Graphickt). Fix: the desktop set LabIssueMkm to
     * the graphicbkt id, so it overwrote an unrelated request instead of creating one.
     */
    async 'request-lab-issue'(db, user, ids): Promise<ActionResult> {
      const { rows } = await sql<{ BookTKt: number | null; bkname: string | null }>`
        SELECT BookTKt, bkname FROM GraphicBKM WHERE graphicBkm = ${int(ids[0])}
      `.execute(db);
      const r = rows[0];
      if (!r) return { kind: 'message', message: '' };
      return {
        kind: 'message',
        message: await requestLabIssue(
          db,
          user.id,
          [{ id: int(r.BookTKt), name: text(r.bkname) }],
          0,
          'Book',
        ),
      };
    },

    /** Show For Selected Records › BookM: Book Master with the selected rows' books. */
    async 'open-bookm'(db, _user, ids): Promise<ActionResult> {
      const parents = await parentsOf(db, ids);
      return openInUse(
        db,
        'book-master',
        sql<{ id: number }>`SELECT DISTINCT BookMastkt AS id FROM BookT
          WHERE Tid IN (SELECT BookTKt FROM GraphicBKM WHERE graphicBkm IN ${toIds(parents)})`,
        'No Record Found',
      );
    },

    /** › Graphics Master: the selected rows' Graphics Master records (none: an empty window). */
    async 'open-graphics-master'(db, _user, ids): Promise<ActionResult> {
      const parents = await parentsOf(db, ids);
      return {
        kind: 'open',
        screen: 'graphics-master',
        ids: parents.length > 0 ? parents : [0],
        emptyMessage: '',
      };
    },

    /** › Patrika: the Patrikas of the selected rows. */
    async 'open-patrika'(db, _user, ids): Promise<ActionResult> {
      return openInUse(
        db,
        'patrika',
        sql<{ id: number }>`SELECT PatrikaKm AS id FROM Patrika
          WHERE PatrikaKm IN (SELECT PatrikaKt FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)})`,
        'No Record Found',
      );
    },
  },
};
