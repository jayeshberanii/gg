import type { ChildRow, FieldValue, GridValue } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList, inTransaction } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import {
  ddmmyyyy,
  get,
  grid,
  int,
  list,
  nextKey,
  scalar,
  table,
  text,
  val,
} from './book-common.js';
import { requestLabIssue } from './lab-issue-common.js';
import { openInUse, pickerDate, trimmed } from './master-common.js';
import type { ActionContext, ActionResult, ScreenDefinition } from './registry.js';

const INT_MAX = 2147483647;
const toIds = (list: readonly number[]) => idList(list.length ? list : [0]);

/**
 * The five "WordTran" popups (frmDisplayTransNew TranName "WordTran"), each a typenm of
 * GrBookWordT, by tblSearch column. The type is the popup's frm.TranType.
 */
export const GRAPHICS_WORD_TYPES: Record<string, string> = {
  VisheshTran: 'Vishesh',
  CreatorTypeTran: 'CreatorType',
  CreatorTran: 'Creator',
  MaterialTran: 'Material',
  StyleTran: 'Style',
};

/** The GraphicBKM text columns the form writes and their sizes: the desktop's save fails past them. */
const LENGTHS: [field: string, label: string, max: number][] = [
  ['bkname', 'Book Name', 255],
  ['color', 'Color', 10],
  ['grade', 'Grade', 30],
  ['availableat', 'Available At', 150],
  ['samvat', 'Samvat', 50],
  ['remark', 'Remark', 255],
  ['comment', 'Comment', 255],
  ['otherlibno', 'Other LibNo', 200],
];

const bitField = (v: unknown) => v === true || v === 1 || text(v).toLowerCase() === 'true';

/** VB's assignment of Val(…) (a Double) to an Integer property: rounded, overflow refused. */
function vbInt(v: unknown, label: string): number {
  const n = Math.round(val(v));
  if (Math.abs(n) > INT_MAX) throw new BadRequestException(`${label} is too large`);
  return n;
}

/** frmGraphicMaster.Save's EntGraphicBKM, from the boxes. */
function values(f: Record<string, FieldValue>) {
  return {
    recno: vbInt(f.recno, 'RecNo'),
    bkname: trimmed(f.bkname),
    color: trimmed(f.color),
    grade: trimmed(f.grade),
    availableat: trimmed(f.availableat),
    samvtypekt: int(f.SamvTypeKt),
    samvat: trimmed(f.samvat),
    viksamvat: vbInt(f.viksamvat, 'Vik Samvat'),
    workdonebykt: int(f.WorkDoneByKt),
    finalized: bitField(f.finalized),
    // txtfinalizeddate always holds a date, so it is always saved (even with Finalized off).
    finalizeddate: pickerDate(f.finalizeddate) ?? new Date().toISOString().slice(0, 10),
    remark: trimmed(f.remark),
    pending: bitField(f.pending),
    comment: trimmed(f.comment),
    otherlibno: trimmed(f.otherlibno),
    BookTKt: int(f.BookTKt),
    QualityKt: int(f.QualityKt),
  };
}

/** GraphicBKMRepository.GetValidationMessage, verbatim. */
function validationMessage(f: Record<string, FieldValue>): string {
  if (Math.round(val(f.recno)) === 0) return 'Please Enter RecNo';
  if (int(f.BookTKt) === 0) return 'Please Enter LibNo';
  return '';
}

/**
 * Subject (GrbookSubT, no identity): the record's rows are replaced by the popup's, with keys
 * `isnull(max(grbooksubkm),0)+1` onwards taken inside the save's transaction (range held).
 * Rows without a subject picked are dropped (the desktop inserted them with grvishaykt 0).
 */
async function saveSubjects(trx: Executor, id: number, rows: ChildRow[]) {
  await sql`DELETE FROM GrbookSubT WHERE graphicbkt = ${id}`.execute(trx);
  const keep = rows.filter((r) => int(get(r, 'grvishaykt')) > 0);
  if (keep.length === 0) return;
  let key = await nextKey(trx, 'GrbookSubT', 'grbooksubkm');
  for (const r of keep) {
    await sql`
      INSERT INTO GrbookSubT (grbooksubkm, graphicbkt, grvishaykt, seq)
      VALUES (${key++}, ${id}, ${int(get(r, 'grvishaykt'))}, ${int(get(r, 'seq'))})
    `.execute(trx);
  }
}

/**
 * One word popup (GrBookWordT, no identity and no key): the record's rows of that typenm are
 * replaced by the popup's; the other types' rows (and typenm '') stay. Keys are
 * `isnull(max(GrBookWordkm),0)+1` of GrBookWordT itself (the desktop took GrbookSubT's), taken
 * inside the save's transaction with the range held. Rows without a word picked are dropped.
 */
async function saveWords(trx: Executor, id: number, type: string, rows: ChildRow[]) {
  await sql`DELETE FROM GrBookWordT WHERE graphicbkt = ${id} AND typenm = ${type}`.execute(trx);
  const keep = rows.filter((r) => int(get(r, 'grwordkt')) > 0);
  if (keep.length === 0) return;
  let key = await nextKey(trx, 'GrBookWordT', 'GrBookWordkm');
  for (const r of keep) {
    // A loaded row keeps its own spelling of the type (the old rows are lower case).
    const own = text(get(r, 'typenm')).trim();
    const typenm = own.toLowerCase() === type.toLowerCase() ? own : type;
    await sql`
      INSERT INTO GrBookWordT (GrBookWordkm, graphicbkt, grwordkt, seq, typenm)
      VALUES (${key++}, ${id}, ${int(get(r, 'grwordkt'))}, ${int(get(r, 'seq'))}, ${typenm})
    `.execute(trx);
  }
}

/**
 * Proof By (GrBookProofByT, IDENTITY): rows with key 0 are inserted (Enuser/Endate), the others
 * updated (Moduser/Moddate), then the record's rows no longer listed are deleted. ProofDate is
 * typed dd/MM/yyyy (blank: NULL). Unlike the desktop, a popup saved empty deletes every row.
 */
async function saveProofBy(trx: Executor, userId: number, id: number, rows: ChildRow[]) {
  const kept: number[] = [];
  for (const r of rows.filter((x) => int(get(x, 'ProofByKt')) > 0)) {
    const key = int(get(r, 'GrBookProofByKm'));
    const proofBy = int(get(r, 'ProofByKt'));
    const proofType = int(get(r, 'ProofTypeKt'));
    const date = ddmmyyyy(get(r, 'ProofDate'));
    // clsCom.INSQ: trimmed, a blank as ' '.
    const remark = text(get(r, 'Remark')).trim() || ' ';
    if (remark.length > 500)
      throw new BadRequestException('Proof By Remark cannot be longer than 500 characters');
    const seq = int(get(r, 'Seq'));
    if (key <= 0) {
      const { rows: inserted } = await sql<{ id: number }>`
        INSERT INTO GrBookProofByT (graphicbkt, ProofByKt, ProofTypeKt, ProofDate, Remark, Seq, Enuser, Endate)
        OUTPUT INSERTED.GrBookProofByKm AS id
        VALUES (${id}, ${proofBy}, ${proofType}, ${date}, ${remark}, ${seq}, ${userId}, GETDATE())
      `.execute(trx);
      kept.push(Number(inserted[0]!.id));
    } else {
      await sql`
        UPDATE GrBookProofByT SET ProofByKt = ${proofBy}, ProofTypeKt = ${proofType}, ProofDate = ${date},
          Remark = ${remark}, Seq = ${seq}, Moduser = ${userId}, Moddate = GETDATE()
        WHERE GrBookProofByKm = ${key} AND graphicbkt = ${id}
      `.execute(trx);
      kept.push(key);
    }
  }
  await sql`
    DELETE FROM GrBookProofByT WHERE graphicbkt = ${id} AND GrBookProofByKm NOT IN ${idList([0, ...kept])}
  `.execute(trx);
}

const numbersParam = (ctx: ActionContext, name: string): number[] => {
  const v = ctx.params[name];
  if (Array.isArray(v)) return v.filter((n) => Number.isFinite(n) && n !== 0);
  return text(v)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
};

/**
 * Add Detail with "Do You Want To Copy Master Data?" answered Yes: the record's popup rows as
 * frmGraphicsDetail's popups hold them (frmGraphicMaster.AddDetailToolStripMenuItem_Click
 * renames the columns), keyed by graphicbkt's tblSearch columns, every key 0 so that the new
 * detail gets rows of its own. Graphics Detail calls this when it opens in Add mode with
 * `CopyFromGraphicBkm` in ActionResult.newRecord (see docs/screens/graphics-master.md).
 */
export async function masterRowsForDetail(
  db: Executor,
  graphicBkm: number,
): Promise<Record<string, ChildRow[]>> {
  const out: Record<string, ChildRow[]> = {};
  const { rows: subjects } = await sql<{
    grvishaykt: number;
    vishaynm: string | null;
    seq: number;
  }>`
    SELECT GrbookSubT.grvishaykt, GrVishay.vishaynm, GrbookSubT.seq FROM GrbookSubT
    LEFT OUTER JOIN GrVishay ON GrbookSubT.grvishaykt = GrVishay.Grvishaykm
    WHERE GrbookSubT.graphicbkt = ${graphicBkm}
  `.execute(db);
  out.GrDetailSubTran = subjects.map((s) => ({
    grdetailSubKm: 0,
    signkt: null,
    Sign: null,
    grvishaykt: s.grvishaykt,
    vishaynm: s.vishaynm,
    remark: null,
    internal: null,
    seq: s.seq,
  }));
  for (const [column, type] of Object.entries(GRAPHICS_WORD_TYPES)) {
    const { rows } = await sql<{
      grwordkt: number;
      wordnm: string | null;
      typenm: string | null;
      seq: number;
    }>`
      SELECT GrBookWordT.grwordkt, GrwordM.wordnm, GrBookWordT.typenm, GrBookWordT.seq FROM GrBookWordT
      LEFT OUTER JOIN GrwordM ON GrBookWordT.grwordkt = GrwordM.GrwordMkm
      WHERE GrBookWordT.typenm = ${type} AND GrBookWordT.graphicbkt = ${graphicBkm}
    `.execute(db);
    out[column] = rows.map((w) => ({
      GrDetailWordkm: 0,
      grwordkt: w.grwordkt,
      wordnm: w.wordnm,
      Remark: null,
      typenm: w.typenm,
      seq: w.seq,
    }));
  }
  // One Available At row for the record's availableat text (no row when it is blank).
  const availableAt = text(
    await scalar(db, sql`SELECT availableat FROM GraphicBKM WHERE graphicBkm = ${graphicBkm}`),
  ).trim();
  out.AvailableAtTran = [];
  if (availableAt !== '') {
    // The desktop matched the word in any type; a word of type availableat is preferred here.
    const wordId = int(
      await scalar(
        db,
        sql`SELECT TOP (1) GrwordMkm FROM grwordm WHERE wordnm = ${availableAt}
          ORDER BY CASE WHEN typenm = 'availableat' THEN 0 ELSE 1 END, GrwordMkm`,
      ),
    );
    out.AvailableAtTran.push({
      GrDetailWordkm: 0,
      grwordkt: wordId,
      wordnm: availableAt,
      Remark: '',
      typenm: 'AvailableAt',
      seq: 0,
    });
  }
  return out;
}

/** Add Detail's copied boxes, named after frmGraphicsDetail's (graphicbkt's tblSearch columns). */
async function detailPrefill(db: Executor, id: number): Promise<Record<string, GridValue>> {
  const { rows } = await sql<Record<string, GridValue>>`
    SELECT recno, remark, grade, color, availableat, samvtypekt,
      (SELECT ISNULL(samvatname, '') FROM samvmast WHERE samvatcokm = GraphicBKM.samvtypekt) AS SamvTypeName,
      samvat, viksamvat, comment,
      (SELECT ISNULL(STUFF((SELECT ',' + grwordm.wordnm FROM GrBookWordT INNER JOIN grwordm ON GrBookWordT.grwordkt = grwordm.GrwordMkm
        WHERE GrBookWordT.typenm = 'Vishesh' AND GrBookWordT.graphicbkt = GraphicBKM.graphicBkm FOR XML PATH('')), 1, 1, ''), '')) AS VisheshTran,
      (SELECT ISNULL(STUFF((SELECT ',' + grwordm.wordnm FROM GrBookWordT INNER JOIN grwordm ON GrBookWordT.grwordkt = grwordm.GrwordMkm
        WHERE GrBookWordT.typenm = 'CreatorType' AND GrBookWordT.graphicbkt = GraphicBKM.graphicBkm FOR XML PATH('')), 1, 1, ''), '')) AS CreatorTypeTran,
      (SELECT ISNULL(STUFF((SELECT ',' + grwordm.wordnm FROM GrBookWordT INNER JOIN grwordm ON GrBookWordT.grwordkt = grwordm.GrwordMkm
        WHERE GrBookWordT.typenm = 'Creator' AND GrBookWordT.graphicbkt = GraphicBKM.graphicBkm FOR XML PATH('')), 1, 1, ''), '')) AS CreatorTran,
      (SELECT ISNULL(STUFF((SELECT ',' + grwordm.wordnm FROM GrBookWordT INNER JOIN grwordm ON GrBookWordT.grwordkt = grwordm.GrwordMkm
        WHERE GrBookWordT.typenm = 'Material' AND GrBookWordT.graphicbkt = GraphicBKM.graphicBkm FOR XML PATH('')), 1, 1, ''), '')) AS MaterialTran,
      (SELECT ISNULL(STUFF((SELECT ',' + grwordm.wordnm FROM GrBookWordT INNER JOIN grwordm ON GrBookWordT.grwordkt = grwordm.GrwordMkm
        WHERE GrBookWordT.typenm = 'Style' AND GrBookWordT.graphicbkt = GraphicBKM.graphicBkm FOR XML PATH('')), 1, 1, ''), '')) AS StyleTran,
      (SELECT ISNULL(STUFF((SELECT ',' + GrVishay.vishaynm FROM GrbookSubT LEFT OUTER JOIN GrVishay ON GrbookSubT.grvishaykt = GrVishay.Grvishaykm
        WHERE GrbookSubT.graphicbkt = GraphicBKM.graphicBkm FOR XML PATH('')), 1, 1, ''), '')) AS GrDetailSubTran
    FROM GraphicBKM WHERE graphicBkm = ${id}
  `.execute(db);
  const r = rows[0];
  if (!r) return {};
  return {
    recno: r.recno ?? null,
    remark: text(r.remark).trim(),
    grade: text(r.grade).trim(),
    color: text(r.color).trim(),
    // frm.txtAvailableAtTran.Text = txtavailableat.Text (the detail's popup box).
    AvailableAtTran: text(r.availableat).trim(),
    samvtypeKt: int(r.samvtypekt),
    SamvTypeName: text(r.SamvTypeName),
    samvat: text(r.samvat).trim(),
    viksamvat: r.viksamvat ?? null,
    comment: text(r.comment).trim(),
    VisheshTran: text(r.VisheshTran).trim(),
    GrDetailSubTran: text(r.GrDetailSubTran).trim(),
    CreatorTran: text(r.CreatorTran).trim(),
    CreatorTypeTran: text(r.CreatorTypeTran).trim(),
    MaterialTran: text(r.MaterialTran).trim(),
    StyleTran: text(r.StyleTran).trim(),
  };
}

/**
 * Graphics › Graphics Master (frmGraphicMaster, GraphicBKMRepository). Table GraphicBKM, IDENTITY
 * key graphicBkm. Children GrbookSubT (Subject), GrBookWordT (Vishesh / Creator Type / Creator /
 * Material / Style) and GrBookProofByT (Proof By), saved with the record in one transaction.
 * See docs/screens/graphics-master.md.
 */
export const graphicsMaster: ScreenDefinition = {
  screen: 'graphics-master',
  table: 'GraphicBKM',
  primaryColumn: 'graphicBkm',
  lockable: true,
  // FillData: a Locked row is read-only (EnableDisableDataEditing(…, True)).
  lockedColumns: ['Locked'],
  // clsCom1.insertworkreports after every Save (Add and Edit); Delete logs nothing.
  workReport: true,
  workReportOn: { add: true, edit: true, delete: false },

  validate: (f) => validationMessage(f),

  async save(trx, user, id, f) {
    const message = validationMessage(f);
    if (message) throw new BadRequestException(message);
    for (const [field, label, max] of LENGTHS) {
      if (trimmed(f[field]).length > max) {
        throw new BadRequestException(`${label} cannot be longer than ${max} characters`);
      }
    }
    const v = values(f);
    let recordId = id;
    if (id > 0) {
      const updated = await sql`
        UPDATE GraphicBKM SET recno = ${v.recno}, bkname = ${v.bkname}, color = ${v.color}, grade = ${v.grade},
          availableat = ${v.availableat}, SamvTypeKt = ${v.samvtypekt}, samvat = ${v.samvat}, viksamvat = ${v.viksamvat},
          WorkDoneByKt = ${v.workdonebykt}, finalized = ${v.finalized}, finalizeddate = ${v.finalizeddate},
          remark = ${v.remark}, pending = ${v.pending}, comment = ${v.comment}, otherlibno = ${v.otherlibno},
          BookTKt = ${v.BookTKt}, QualityKt = ${v.QualityKt}, moduser = ${user.id}, moddate = GETDATE()
        WHERE graphicBkm = ${id}
      `.execute(trx);
      if (Number(updated.numAffectedRows ?? 0) === 0)
        throw new BadRequestException('Record not found');
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO GraphicBKM (recno, bkname, color, grade, availableat, SamvTypeKt, samvat, viksamvat, WorkDoneByKt,
          finalized, finalizeddate, remark, pending, comment, otherlibno, BookTKt, QualityKt, enuser, endate)
        OUTPUT INSERTED.graphicBkm AS id
        VALUES (${v.recno}, ${v.bkname}, ${v.color}, ${v.grade}, ${v.availableat}, ${v.samvtypekt}, ${v.samvat},
          ${v.viksamvat}, ${v.workdonebykt}, ${v.finalized}, ${v.finalizeddate}, ${v.remark}, ${v.pending},
          ${v.comment}, ${v.otherlibno}, ${v.BookTKt}, ${v.QualityKt}, ${user.id}, GETDATE())
      `.execute(trx);
      recordId = Number(rows[0]!.id);
    }
    // Only the popups the user saved come with rows; the others' rows are left as they are.
    const subjects = grid(f, 'GrbookSubTran');
    if (subjects) await saveSubjects(trx, recordId, subjects);
    for (const [column, type] of Object.entries(GRAPHICS_WORD_TYPES)) {
      const words = grid(f, column);
      if (words) await saveWords(trx, recordId, type, words);
    }
    const proofBy = grid(f, 'ProofByTran');
    if (proofBy) await saveProofBy(trx, user.id, recordId, proofBy);
    return recordId;
  },

  async checkInUse(db, id) {
    const n = int(await scalar(db, sql`SELECT COUNT(*) FROM graphicbkt WHERE Graphickt = ${id}`));
    return n > 0 ? 'Record is used in Graphics Detail' : '';
  },

  /**
   * CommonRepository.Delete, plus the popups' rows in the same transaction (the desktop left
   * them behind; nothing else reads them).
   */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM GrbookSubT WHERE graphicbkt = ${id}`.execute(trx);
    await sql`DELETE FROM GrBookWordT WHERE graphicbkt = ${id}`.execute(trx);
    await sql`DELETE FROM GrBookProofByT WHERE graphicbkt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM GraphicBKM WHERE graphicBkm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  f2: {
    /** txtBookTKt (Txt_KeyDown): every library number with its book and samvat. */
    booktkt: list(sql`
      SELECT T.Tid, T.Libno, M.BookName + CASE WHEN ISNULL(M.Part, '') <> '' THEN '(' + M.Part + ')' ELSE '' END AS BookName,
        S.samvatname, M.PSamvat, T.bookmastkt, M.PSamvatcokt
      FROM BookT T INNER JOIN BookM M ON T.BookMastkt = M.BookMastkm
      LEFT JOIN samvmast S ON M.PSamvatcokt = S.samvatcokm
      WHERE ISNULL(T.LibNo, '') <> '' ORDER BY T.Libno`),
  },

  // frmDisplayTransNew.SetForm_GraphicMaster (s = 0).
  trans: {
    GrbookSubTran: {
      lookups: {
        vishaynm: list(
          sql`SELECT Grvishaykm, vishaynm, defination, remark, groupnm FROM GrVishay WHERE ISNULL(IsCancel, 0) <> 1 ORDER BY vishaynm`,
        ),
      },
    },
    ...Object.fromEntries(
      Object.entries(GRAPHICS_WORD_TYPES).map(([column, type]) => [
        column,
        {
          lookups: {
            wordnm: (db: Executor) =>
              pickListOf(
                db,
                sql`SELECT GrwordMkm, wordnm, defination, remark FROM GrwordM WHERE typenm = ${type} ORDER BY wordnm`,
              ),
          },
        },
      ]),
    ),
    ProofByTran: {
      lookups: {
        proofby: list(
          sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'DoneBy' AND ISNULL(Name, '') <> '' ORDER BY Name`,
        ),
        prooftype: list(
          sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'ProofType' AND ISNULL(Name, '') <> '' ORDER BY Name`,
        ),
      },
    },
  },

  actions: {
    /** Delete(): CheckRecordInUse, asked before the confirmation as the desktop does. */
    async 'in-use'(db, _user, ids): Promise<ActionResult> {
      const n = int(
        await scalar(db, sql`SELECT COUNT(*) FROM graphicbkt WHERE Graphickt = ${int(ids[0])}`),
      );
      return { kind: 'message', message: n > 0 ? 'Record is used in Graphics Detail' : '' };
    },

    /**
     * Ctrl+L / Ctrl+U (InputBoxProc("vis123") → GRAPHICS_LOCK_PASSWORD; the second Security
     * password still works): LockUnlockRecords on the selected rows, and on their Graphics
     * Detail rows too. n is the GraphicBKM rows changed.
     */
    async 'lock-records'(db, _user, ids, ctx): Promise<ActionResult> {
      ctx.assertPassword(ctx.params.password, ctx.env.GRAPHICS_LOCK_PASSWORD ?? '');
      const lock = bitField(ctx.params.lock);
      const n = await inTransaction(db, async (trx) => {
        const r =
          await sql`UPDATE GraphicBKM SET Locked = ${lock ? 1 : 0} WHERE graphicBkm IN ${toIds(ids)}`.execute(
            trx,
          );
        await sql`UPDATE graphicbkt SET Locked = ${lock ? 1 : 0} WHERE Graphickt IN ${toIds(ids)}`.execute(
          trx,
        );
        return Number(r.numAffectedRows ?? 0);
      });
      return {
        kind: 'refreshed',
        rows: [],
        message: lock
          ? `Locked Successfully in ${n} Records`
          : `Unlocked Successfully in ${n} Records`,
      };
    },

    /**
     * Add Detail: Graphics Detail in Add mode for the current row (`ids[0]`), its Lib No set;
     * with `copy` (Yes to "Do You Want To Copy Master Data?") the master's boxes too, and
     * `CopyFromGraphicBkm` for the popup rows (masterRowsForDetail).
     */
    async 'add-detail'(db, _user, ids, ctx): Promise<ActionResult> {
      const id = int(ids[0]);
      const { rows: found } = await sql<{ libno: string | null }>`
        SELECT CASE WHEN ISNULL(GraphicBKM.BookTKt, 0) = 0 THEN GraphicBKM.libno ELSE BookT.Libno END AS libno
        FROM GraphicBKM LEFT JOIN BookT ON GraphicBKM.BookTKt = BookT.Tid WHERE graphicBkm = ${id}
      `.execute(db);
      // The desktop throws with no current row; here it says so.
      if (found.length === 0) return { kind: 'message', message: 'No Record Found' };
      const libno = text(found[0]!.libno);
      const copy = bitField(ctx.params.copy);
      return {
        kind: 'open',
        screen: 'graphics-detail',
        ids: [],
        emptyMessage: '',
        newRecord: {
          Graphickt: id,
          LibNo: libno,
          ...(copy ? { ...(await detailPrefill(db, id)), CopyFromGraphicBkm: id } : {}),
        },
      };
    },

    /**
     * Print Duplicate No: the RecNos that occur more than once among the grid's rows, to Excel.
     * The desktop read the ids from a grid column that does not exist and failed.
     */
    async 'duplicate-no'(db, _user, _ids, ctx): Promise<ActionResult> {
      const all = numbersParam(ctx, 'gridIds');
      return {
        kind: 'table',
        title: 'Duplicate No',
        ...(await table(
          db,
          sql`SELECT RecNo FROM GraphicBKM WHERE graphicBkm IN ${toIds(all)} GROUP BY RecNo HAVING COUNT(RecNo) > 1 ORDER BY RecNo`,
        )),
      };
    },

    /** For Selected Record › BookM: Book Master with the selected rows' books. */
    async 'open-bookm'(db, _user, ids): Promise<ActionResult> {
      return openInUse(
        db,
        'book-master',
        sql<{ id: number }>`SELECT DISTINCT BookMastkt AS id FROM BookT
          WHERE Tid IN (SELECT BookTKt FROM GraphicBKM WHERE graphicBkm IN ${toIds(ids)})`,
        'No Graphics Available for Current Selection',
      );
    },

    /**
     * For Selected Record › Graphics Detail: frmGraphicsDetail with WhereCondition
     * " AND Graphickt IN(<selected>)", as the detail rows' ids. With none the window still
     * opens, empty (ids [0], the desktop's empty grid in Add mode).
     */
    async 'open-graphics-detail'(db, _user, ids): Promise<ActionResult> {
      const { rows } = await sql<{ id: number }>`
        SELECT graphicBkTkm AS id FROM graphicbkt WHERE Graphickt IN ${toIds(ids)} ORDER BY graphicBkTkm
      `.execute(db);
      const found = rows.map((r) => Number(r.id)).filter((n) => n > 0);
      return {
        kind: 'open',
        screen: 'graphics-detail',
        ids: found.length > 0 ? found : [0],
        emptyMessage: '',
      };
    },

    /**
     * Utility › Request For Book(LabIssue): a LabIssueM request for each selected row's book
     * (For party 0, Type Book). The messages name the row's Book Name, as on the desktop.
     */
    async 'request-lab-issue'(db, user, ids, ctx): Promise<ActionResult> {
      const { rows } = await sql<{ id: number; BookTKt: number | null; bkname: string | null }>`
        SELECT graphicBkm AS id, BookTKt, bkname FROM GraphicBKM WHERE graphicBkm IN ${toIds(ids)}
      `.execute(db);
      const byId = new Map(rows.map((r) => [Number(r.id), r]));
      const items = ids
        .filter((id) => byId.has(id))
        .map((id) => ({ id: int(byId.get(id)!.BookTKt), name: text(byId.get(id)!.bkname) }));
      return {
        kind: 'message',
        message: await requestLabIssue(
          db,
          user.id,
          items,
          0,
          'Book',
          ctx.env.LAB_ISSUE_OLD_DUE_BLOCK,
        ),
      };
    },
  },
};
