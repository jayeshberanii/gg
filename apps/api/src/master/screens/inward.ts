import { ownerLocked } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { val } from './bhasha.js';
import { openInUse, pickerDate, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/** nvarchar sizes of InwordM's text columns (detail is nvarchar(max)), with the form's labels. */
const TEXT_LIMITS: [column: string, label: string, max: number][] = [
  ['RefrenceNm', 'Ref. Name', 150],
  ['refno', 'Ref No', 150],
  ['subject', 'subject', 500],
  ['PCLocation', 'PC Location', 500],
  ['Physicallocation', 'Physical Loca.', 250],
  ['StatusRem', 'Status Remark', 500],
  ['GeneralRemark', 'General Rem.', 250],
  ['returnremark', 'Return Rem.', 500],
];

const INT_MAX = 2_147_483_647;

/** `Val(text)` into an Integer property: VB rounds; past Int32 the desktop throws. */
function intOf(v: unknown): number {
  return Math.round(val(v));
}

/** GetVibhagSrNo: the Vibhag's next serial number. */
async function nextVibhagSrNo(db: Executor, vibhagkt: number, lock = false): Promise<number> {
  const { rows } = await (
    lock
      ? sql<{
          n: number;
        }>`SELECT ISNULL(MAX(VibhagSrNo), 0) + 1 AS n FROM InwordM WITH (UPDLOCK, HOLDLOCK) WHERE Vibhagkt = ${vibhagkt}`
      : sql<{
          n: number;
        }>`SELECT ISNULL(MAX(VibhagSrNo), 0) + 1 AS n FROM InwordM WHERE Vibhagkt = ${vibhagkt}`
  ).execute(db);
  return Number(rows[0]?.n ?? 1);
}

const ids0 = (ids: number[]) => idList(ids.length ? ids : [0]);

async function bookTCount(db: Executor, ids: number[]): Promise<number> {
  const { rows } = await sql<{
    n: number;
  }>`SELECT COUNT(*) AS n FROM BookT WHERE InwordKt IN ${ids0(ids)}`.execute(db);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Issue › Inward Master (frmInwordMaster, InwordMRepository). Table InwordM, IDENTITY key
 * inwordkm, Locked bit. Saves log the work report (Add and Edit, not Delete). A non-admin cannot
 * change a record someone else entered (FillData's owner lock). See docs/screens/inward-master.md.
 */
export const inwardMaster: ScreenDefinition = {
  screen: 'inward-master',
  table: 'InwordM',
  primaryColumn: 'inwordkm',
  lockable: true,
  lockedColumns: ['Locked'],
  lockedWhen: (record, user) => ownerLocked(record, user),
  workReport: true,
  workReportOn: { add: true, edit: true, delete: false },

  /**
   * InwordMRepository.GetValidationMessage's first rule (the VibhagSrNo one needs the database
   * and runs in `save`), plus the overflows the desktop lets SQL Server throw on.
   */
  validate(f) {
    if (val(f.Vibhagkt) === 0) return 'Please Enter Vibhag';
    for (const [column, label, max] of TEXT_LIMITS)
      if (trimmed(f[column]).length > max)
        return `${label} cannot be longer than ${max} characters`;
    if (Math.abs(intOf(f.paidamount)) > INT_MAX) return 'Paid Amount is too large';
    if (Math.abs(intOf(f.VibhagSrNo)) > INT_MAX) return 'VibhagSrNo is too large';
    return '';
  },

  // btnCopy_Click: the copy's VibhagSrNo is the Vibhag's next (onNew.params sends the Vibhag).
  async newDefaults(db, _user, params) {
    const vibhagkt = val(params?.vibhagkt);
    const defaults: Record<string, number> = {};
    if (vibhagkt > 0) defaults.VibhagSrNo = await nextVibhagSrNo(db, vibhagkt);
    return defaults;
  },

  /** txtWorkGivenTran: CheckWorkAsign, the count of Work Given rows for this inward. */
  async recordExtras(db, id) {
    const { rows } = await sql<{
      n: number;
    }>`SELECT COUNT(*) AS n FROM WorkGivenM WHERE inwordkt = ${id}`.execute(db);
    return { WorkGivenTran: Number(rows[0]?.n ?? 0) };
  },

  // InwordMRepository.CheckInUse (LetterBhetM.inwordkt is not checked, as on the desktop).
  async checkInUse(db, id) {
    const count = async (q: ReturnType<typeof sql<{ n: number }>>) =>
      Number((await q.execute(db)).rows[0]?.n ?? 0);
    if (await count(sql`SELECT COUNT(inwordkt) AS n FROM WorkGivenM WHERE inwordkt = ${id}`))
      return 'Record is in used in Work Assign Master';
    if (await count(sql`SELECT COUNT(inwordkt) AS n FROM BookT WHERE inwordkt = ${id}`))
      return 'Record is in used in BookT';
    return '';
  },

  async save(trx, user, id, f) {
    const vibhagkt = val(f.Vibhagkt);
    let srNo = intOf(f.VibhagSrNo);
    // GetValidationMessage's second rule.
    if (srNo > 0) {
      const { rows } = await sql<{ n: number }>`
        SELECT COUNT(VibhagSrNo) AS n FROM InwordM WITH (UPDLOCK, HOLDLOCK)
        WHERE Vibhagkt = ${vibhagkt} AND VibhagSrNo = ${srNo} AND inwordkm <> ${id}
      `.execute(trx);
      if (Number(rows[0]?.n ?? 0) > 0)
        throw new BadRequestException(`VibhagSrNo ${srNo} is already assigned`);
    }
    // Save: a blank serial number is the Vibhag's next, taken inside the transaction.
    if (vibhagkt > 0 && srNo === 0) srNo = await nextVibhagSrNo(trx, vibhagkt, true);
    const v = {
      Vibhagkt: vibhagkt,
      itemkt: val(f.itemkt),
      praptypekt: val(f.praptypekt),
      viakt: val(f.viakt),
      RefrenceNm: trimmed(f.RefrenceNm),
      fromkt: val(f.fromkt),
      forkt: val(f.forkt),
      indate: pickerDate(f.indate),
      inbykt: val(f.inbykt),
      detail: trimmed(f.detail),
      PCLocation: trimmed(f.PCLocation),
      Physicallocation: trimmed(f.Physicallocation),
      ToReturned: trimmed(f.ToReturned) === 'Yes',
      Statuskt: val(f.Statuskt),
      StatusRem: trimmed(f.StatusRem),
      GeneralRemark: trimmed(f.GeneralRemark),
      returned: trimmed(f.returned) === 'Yes',
      // dtpreturndate.Value is saved whether or not Returned is Yes (the picker is only hidden).
      returndate: pickerDate(f.returndate),
      returnremark: trimmed(f.returnremark),
      intypekt: val(f.intypekt),
      effortskt: val(f.effortskt),
      paidamount: intOf(f.paidamount),
      refno: trimmed(f.refno),
      InOut: trimmed(f.InOut) === 'OUT',
      VibhagSrNo: srNo,
      subject: trimmed(f.subject),
    };
    if (id > 0) {
      await sql`
        UPDATE InwordM SET Vibhagkt = ${v.Vibhagkt}, itemkt = ${v.itemkt}, praptypekt = ${v.praptypekt},
          viakt = ${v.viakt}, RefrenceNm = ${v.RefrenceNm}, fromkt = ${v.fromkt}, forkt = ${v.forkt},
          indate = ${v.indate}, inbykt = ${v.inbykt}, detail = ${v.detail}, PCLocation = ${v.PCLocation},
          Physicallocation = ${v.Physicallocation}, ToReturned = ${v.ToReturned}, Statuskt = ${v.Statuskt},
          StatusRem = ${v.StatusRem}, GeneralRemark = ${v.GeneralRemark}, returned = ${v.returned},
          returndate = ${v.returndate}, returnremark = ${v.returnremark}, moduser = ${user.id},
          moddate = GETDATE(), intypekt = ${v.intypekt}, effortskt = ${v.effortskt},
          paidamount = ${v.paidamount}, refno = ${v.refno}, InOut = ${v.InOut},
          VibhagSrNo = ${v.VibhagSrNo}, subject = ${v.subject}
        WHERE inwordkm = ${id}
      `.execute(trx);
      return id;
    }
    const { rows } = await sql<{ id: number }>`
      INSERT INTO InwordM (Vibhagkt, itemkt, praptypekt, viakt, RefrenceNm, fromkt, forkt, indate,
        inbykt, detail, PCLocation, Physicallocation, ToReturned, Statuskt, StatusRem, GeneralRemark,
        returned, returndate, returnremark, enuser, endate, intypekt, effortskt, paidamount, refno,
        InOut, VibhagSrNo, subject)
      OUTPUT INSERTED.inwordkm AS id
      VALUES (${v.Vibhagkt}, ${v.itemkt}, ${v.praptypekt}, ${v.viakt}, ${v.RefrenceNm}, ${v.fromkt},
        ${v.forkt}, ${v.indate}, ${v.inbykt}, ${v.detail}, ${v.PCLocation}, ${v.Physicallocation},
        ${v.ToReturned}, ${v.Statuskt}, ${v.StatusRem}, ${v.GeneralRemark}, ${v.returned},
        ${v.returndate}, ${v.returnremark}, ${user.id}, GETDATE(), ${v.intypekt}, ${v.effortskt},
        ${v.paidamount}, ${v.refno}, ${v.InOut}, ${v.VibhagSrNo}, ${v.subject})
    `.execute(trx);
    return Number(rows[0]!.id);
  },

  f2: {
    /** txtVibhagkt: the form's own list (tblSearch has no F2EntryText for it). */
    vibhagkt: (db) =>
      pickListOf(
        db,
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'vibhag' ORDER BY Name`,
      ),
  },

  actions: {
    /** After a Vibhag pick (Txt_KeyDown): txtVibhagSrNo = GetVibhagSrNo(Vibhag). */
    async 'next-vibhag-srno'(db, _user, _ids, ctx): Promise<ActionResult> {
      const vibhagkt = val(ctx.params.vibhagkt);
      return {
        kind: 'form',
        fields: { VibhagSrNo: vibhagkt > 0 ? await nextVibhagSrNo(db, vibhagkt) : null },
        trans: {},
      };
    },

    /**
     * F2 on txtWorkGivenTran (Edit mode): frmWorkGivenMaster with InwordKm, i.e. this inward's
     * Work Given rows, or — with none — a new one for this inward.
     */
    async 'work-given-of'(db, _user, ids): Promise<ActionResult> {
      const id = ids[0] ?? 0;
      const { rows } = await sql<{ id: number }>`
        SELECT WorkGivenMkm AS id FROM WorkGivenM WHERE inwordkt = ${id} ORDER BY WorkGivenMkm DESC
      `.execute(db);
      return {
        kind: 'open',
        screen: 'work-given-master',
        ids: rows.map((r) => Number(r.id)),
        emptyMessage: '',
        newRecord: { inwordkt: id },
      };
    },

    /** Send To › WorkGivenM. */
    'send-to-work-given': (db, _user, ids) =>
      openInUse(
        db,
        'work-given-master',
        sql<{
          id: number;
        }>`SELECT DISTINCT WorkGivenMkm AS id FROM WorkGivenM WHERE InwordKt IN ${ids0(ids)}`,
        'No Record Found',
      ),

    /** Send To › BookM: the books whose library numbers came in with these inwards. */
    async 'send-to-book-m'(db, _user, ids): Promise<ActionResult> {
      if ((await bookTCount(db, ids)) === 0)
        return { kind: 'open', screen: 'book-master', ids: [], emptyMessage: 'No Record Found' };
      return openInUse(
        db,
        'book-master',
        sql<{
          id: number;
        }>`SELECT DISTINCT bookmastkt AS id FROM BookT WHERE InwordKt IN ${ids0(ids)}`,
        'No Record Found',
      );
    },

    /** Send To › BookT: frmBookTranNew (a dialog) with those library numbers. */
    async 'send-to-book-t'(db, _user, ids): Promise<ActionResult> {
      if ((await bookTCount(db, ids)) === 0)
        return { kind: 'open', screen: 'book-tran', ids: [], emptyMessage: 'No Record Found' };
      return openInUse(
        db,
        'book-tran',
        sql<{ id: number }>`SELECT DISTINCT Tid AS id FROM BookT WHERE InwordKt IN ${ids0(ids)}`,
        'No Record Found',
      );
    },

    /** Send To › Party Master: the For and From parties of the selected inwards. */
    'send-to-party': (db, _user, ids) =>
      openInUse(
        db,
        'party-master',
        sql<{ id: number }>`
          SELECT DISTINCT p.id FROM InwordM CROSS APPLY (VALUES (ForKt), (FromKt)) AS p(id)
          WHERE inwordkm IN ${ids0(ids)} AND ISNULL(p.id, 0) > 0`,
        'No Record Found',
      ),

    /**
     * Send To › Letter Bhet Master: the letters of the selected inwards. With none, frmLetterBhetM
     * opens empty in Add mode with Inword pre-filled from the grid's current row (`currentId`):
     * Tag = its inwordkm, Text = its Vibhag name.
     */
    async 'send-to-letter-bhet'(db, _user, ids, ctx): Promise<ActionResult> {
      const { rows } = await sql<{ id: number }>`
        SELECT DISTINCT LetterBhetMKm AS id FROM LetterBhetM WHERE InwordKt IN ${ids0(ids)}
      `.execute(db);
      const letters = rows.map((r) => Number(r.id)).filter((n) => n > 0);
      if (letters.length > 0)
        return { kind: 'open', screen: 'letter-bhet', ids: letters, emptyMessage: '' };
      const current = val(ctx.params.currentId) || (ids[0] ?? 0);
      const { rows: named } = await sql<{ name: string | null }>`
        SELECT c.Name AS name FROM InwordM i LEFT JOIN columnmaster c ON c.ColumnMastkm = i.Vibhagkt
        WHERE i.inwordkm = ${current}
      `.execute(db);
      return {
        kind: 'open',
        screen: 'letter-bhet',
        ids: [],
        emptyMessage: '',
        newRecord: { inwordkt: current, InwordName: named[0]?.name ?? '' },
      };
    },
  },
};
