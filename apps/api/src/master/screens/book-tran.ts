import type { ActionResult, FieldValue, GridValue } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { type Executor, idList, inTransaction } from '../../db/legacy-sql.js';
import { ident } from '../../db/trusted-sql.js';
import { writeWorkReport } from '../work-report-log.js';
import { signFromLibNo, updateTxtBookTran } from './book-actions.js';
import {
  get,
  grid,
  ids,
  int,
  list,
  nextLibNo,
  type Row,
  scalar,
  signBetween,
  text,
  val,
} from './book-common.js';
import { requestLabIssue } from './lab-issue-common.js';
import type { ActionContext, ScreenDefinition } from './registry.js';

/**
 * Book Master's Library No form (frmBookTranNew, "Book Tran"): the BookT rows of a book, opened
 * with F2 on Book Master's Library No box, or for several books from its menu. Table BookT, key
 * tid (identity). It has no menu item of its own, so it is reached through Book Master's access.
 */

const toIds = (list: readonly number[]) => idList(list.length ? list : [0]);

/** frmBookTranNew.IsFirstBook: a first-print book of a sampraday ("प्रथम पुस्तक"). */
export async function isFirstBook(db: Executor, tid: number): Promise<boolean> {
  const n = Number(
    (await scalar(
      db,
      sql`SELECT COUNT(*) FROM krutireflibno KR
        INNER JOIN KrutiSampradayT KS ON KR.krutimstkt = KS.KrutimstKt
        INNER JOIN columnmaster KSc ON KS.SampradayKt = KSc.ColumnMastkm AND ksc.Remark = N'प्रथम पुस्तक'
        INNER JOIN columnmaster KRc ON KR.ktypeid = krc.ColumnMastkm AND KRc.Name = N'मुद्रित गी.गं भंडारनुं प्रथम पुस्तक'
        WHERE BookTKt = ${tid}`,
    )) ?? 0,
  );
  return n > 0;
}

/** Save(): the BookT row, its Prapti rows (when loaded) and Mark rows (when their popup was loaded). */
async function saveBookT(
  trx: Executor,
  userId: number,
  id: number,
  f: Record<string, FieldValue>,
): Promise<number> {
  const add = id === 0;
  const libNo = text(f.Libno).trim();
  const taken = Number(
    (await scalar(
      trx,
      sql`SELECT COUNT(tid) FROM BookT WHERE Tid <> ${id} AND Libno = ${libNo}`,
    )) ?? 0,
  );
  if (taken > 0) throw new BadRequestException('LibNo Already Exist');

  const bookId = add
    ? int(f.BookMastkt)
    : int(await scalar(trx, sql`SELECT BookMastkt FROM BookT WHERE tid = ${id}`));
  const bkGrNo = add
    ? int(
        await scalar(
          trx,
          sql`SELECT ISNULL(MAX(BkGrNo), 0) + 1 FROM BookT WITH (UPDLOCK, HOLDLOCK)`,
        ),
      )
    : int(await scalar(trx, sql`SELECT ISNULL(BkGrNo, 0) FROM BookT WHERE tid = ${id}`));
  const v = {
    SeriesKt: int(f.SeriesKt),
    Libno: libNo,
    PurnataKt: int(f.PurnataKt),
    QualityKt: int(f.QualityKt),
    MediaTypekt: int(f.MediaTypekt),
    Mark: text(f.MarkTran).trim(),
    Mixsign: text(f.Mixsign).trim(),
    MixSignRem: text(f.MixSignRem).trim(),
    Remark: text(f.Remark).trim(),
    MainL: f.MainL === true || f.MainL === 'True' ? 1 : 0,
    CheckRem: text(f.CheckRem).trim(),
    OldLibNo: text(f.OldLibNo).trim(),
    OldLibnoRem: text(f.OldLibnoRem).trim(),
    NewLibno: text(f.NewLibno).trim(),
    CupBoardRackNo: text(f.CupBoardRackNo).trim(),
    Cancelcokt: Math.trunc(val(f.Cancelcokt)),
    CupBoardNo: text(f.CupBoardNo).trim(),
    InwordKt: int(f.InwordKt),
    // Save(): a new row is added to the grid before its seq is taken (Rows.Count + 1), an
    // existing one takes its position in the grid.
    seq: add ? int(f.RowCount) + 2 : int(f.RowIndex) + 1,
  };

  let tid = id;
  if (add) {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO BookT (BookMastkt, SeriesKt, Libno, PurnataKt, QualityKt, MediaTypekt, Mark, Mixsign, MixSignRem, Remark,
        BKGrNo, MainL, CheckRem, OldLibNo, OldLibnoRem, NewLibno, CupBoardRackNo, Cancelcokt, CupBoardNo, endate, moddate,
        enuser, moduser, seq, InwordKt)
      OUTPUT INSERTED.tid AS id
      VALUES (${bookId}, ${v.SeriesKt}, ${v.Libno}, ${v.PurnataKt}, ${v.QualityKt}, ${v.MediaTypekt}, ${v.Mark},
        ${v.Mixsign}, ${v.MixSignRem}, ${v.Remark}, ${bkGrNo}, ${v.MainL}, ${v.CheckRem}, ${v.OldLibNo},
        ${v.OldLibnoRem}, ${v.NewLibno}, ${v.CupBoardRackNo}, ${v.Cancelcokt}, ${v.CupBoardNo},
        CONVERT(date, SYSDATETIME()), CONVERT(date, SYSDATETIME()), ${userId}, ${userId}, ${v.seq}, ${v.InwordKt})
    `.execute(trx);
    tid = Number(rows[0]!.id);
  } else {
    await sql`
      UPDATE BookT SET SeriesKt = ${v.SeriesKt}, Libno = ${v.Libno}, PurnataKt = ${v.PurnataKt}, QualityKt = ${v.QualityKt},
        MediaTypekt = ${v.MediaTypekt}, Mark = ${v.Mark}, Mixsign = ${v.Mixsign}, MixSignRem = ${v.MixSignRem},
        Remark = ${v.Remark}, BKGrNo = ${bkGrNo}, CheckRem = ${v.CheckRem}, OldLibNo = ${v.OldLibNo},
        OldLibnoRem = ${v.OldLibnoRem}, NewLibno = ${v.NewLibno}, CupBoardRackNo = ${v.CupBoardRackNo},
        Cancelcokt = ${v.Cancelcokt}, CupBoardNo = ${v.CupBoardNo}, moddate = CONVERT(date, SYSDATETIME()),
        moduser = ${userId}, seq = ${v.seq}, InwordKt = ${v.InwordKt}
      WHERE Tid = ${id}
    `.execute(trx);
  }

  // PraptiTran: the desktop deletes and re-inserts the loaded rows on every Edit; unloaded, they stay.
  const prapti = grid(f, 'PraptiTran');
  if (prapti !== null) {
    await sql`DELETE FROM PraptiTran WHERE tid = ${tid}`.execute(trx);
    for (const r of prapti) {
      const dor = text(get(r, 'dor')).slice(0, 10);
      await sql`
        INSERT INTO PraptiTran (tid, prapticokt, Praptitypekt, ReceivedViakt, Effortskt, PaidAmount, Refno, remark, dor, seq, extratkt)
        VALUES (${tid}, ${int(get(r, 'prapticokt'))}, ${int(get(r, 'Praptitypekt'))}, ${int(get(r, 'ReceivedViakt'))},
          ${int(get(r, 'Effortskt'))}, ${int(get(r, 'PaidAmount'))}, ${text(get(r, 'Refno'))}, ${text(get(r, 'remark'))},
          ${/^\d{4}-\d{2}-\d{2}$/.test(dor) ? sql`CAST(${dor} AS date)` : null}, ${int(get(r, 'seq'))}, NULL)
      `.execute(trx);
    }
  }

  // BookTranMarkT: upserted by key, pruned to the popup's rows.
  const marks = grid(f, 'MarkTran');
  if (marks !== null) {
    const kept: number[] = [];
    for (const r of marks) {
      const km = int(get(r, 'BookTranMarkTKm'));
      if (km === 0) {
        const { rows } = await sql<{ id: number }>`
          INSERT INTO BookTranMarkT (BookTKt, MarkKt, Seq) OUTPUT INSERTED.BookTranMarkTKm AS id
          VALUES (${tid}, ${int(get(r, 'MarkKt'))}, ${int(get(r, 'seq'))})`.execute(trx);
        kept.push(Number(rows[0]!.id));
      } else {
        await sql`
          UPDATE BookTranMarkT SET MarkKt = ${int(get(r, 'MarkKt'))}, Seq = ${int(get(r, 'Seq'))}
          WHERE BookTranMarkTKm = ${km}`.execute(trx);
        kept.push(km);
      }
    }
    await sql`DELETE FROM BookTranMarkT WHERE BookTKt = ${tid} AND BookTranMarkTKm NOT IN ${toIds(kept)}`.execute(
      trx,
    );
  }

  await updateTxtBookTran(trx, [bookId]);
  return tid;
}

/**
 * The tables that point at a library row, as Delete() checks them (messages verbatim). Since
 * v3.4.3.1 a Book Confirmation counts only while it is 'Sent' and a Lab Issue only while its
 * status is neither Closed nor CancelReq (the fourth entry: the rows that count).
 */
const OPEN_CONFIRMATION = sql`BookConfirmationStatus = 'Sent'`;
const OPEN_LAB_ISSUE = sql`Statuskt NOT IN (SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'LabIssueStatus' AND Name IN ('Closed', 'CancelReq'))`;
const IN_USE: [string, string, string, RawBuilder<unknown>?][] = [
  ['SampradayBriefT', 'BookTKt', '- Sampraday Master(Brief)'],
  ['SampradayRemarkT', 'BookTKt', '- Sampraday Master(Remark)'],
  ['AuthMAnyLibNoT2', 'BookTKt', '- Author Anya LibNo'],
  ['SampradaySthalT', 'BookTKt', '- Author Anya LibNo'],
  ['BookConfirmation', 'BookTKt', '- Book Confirmation', OPEN_CONFIRMATION],
  ['LabIssueM', 'BookTKt', '- Lab Issue', OPEN_LAB_ISSUE],
  ['AuthorParyayT', 'BookTKt', '- Author Master(Paryay)'],
  ['AuthorNoteT', 'BookTKt', '- Author Master(Note)'],
  ['AuthorNoteT2', 'BookTKt', '- Author Master(Note 2)'],
  ['praksnM', 'BookTKt', '- Prakashan'],
  ['PrakMRefLibNoT', 'BookTKt', '- Prakashak Master'],
  ['bhandtran', 'cplibnoKt', '- BhandraTran(Catlogue Master)'],
  ['IssueTran', 'entrcodekt', '- Issue Master'],
  ['praksnlistAnyaBndrM', 'BookTKt', '- Book Master Anya Bhandar'],
  ['AnyaBhandarM', 'BookTKt', '- Anya Bhandar'],
  ['krutireflibno', 'BookTKt', '- Kruti Reference'],
  ['KrutiNoteT', 'BookTKt', '- Kruti Note'],
  ['GraphicBKM', 'BookTKt', '- Graphics Master'],
  ['GrdetailOtherRefT', 'BookTKt', '- Graphic Detail RefrenceT'],
  ['RefrenceT', 'BookTKt', '- Reference Master'],
  ['BookMagazineVisheshT', 'BookTKt', '- Magazine Vishesh Master New'],
  ['EnglishBookVishesh', 'BookTKt', '- English Book Vishesh'],
  ['SampradayAnyaNameT', 'BookTKt', '- Sampraday Anya Name'],
  ['SampradayReferenceT', 'BookTKt', '- Sampraday Reference'],
  ['SampradayNoteT', 'BookTKt', '- Sampraday Note'],
  ['SampradaySamvatT', 'BookTKt', '- Sampraday Samvat'],
  ['AuthorAnyaYogdanT', 'BookTKt', '- Author Anya Yogdan'],
  ['AuthorRefLibno', 'BookTKt', '- Author Reference'],
  ['AuthMContactT', 'BookTKt', '- Author Contact'],
  ['AuthorSampradayT', 'BookTKt', '- Author Sampraday'],
  ['AuthMAnyLibNoT', 'BookTKt', '- Author Anya LibNo'],
  ['AuthorParamparaT', 'BookTKt', '- Author Parampara'],
  ['AuthorVishT', 'BookTKt', '- Author Vishesh'],
  ['AuthorIdentityT', 'BookTKt', '- Author Identity'],
  ['AuthorPattavaliT', 'BookTKt', '- Author Pattavali'],
  ['AuthorSamvatT', 'BookTKt', '- Author Samvat'],
  ['EnglishBookVishesh', 'BookTKt', '- English Book Vishesh'],
  ['MagazineVishesh', 'BookTKt', '- Magazine Vishesh Master New'],
];

/**
 * The references Delete() moves to the chosen other library row before deleting this one. Every
 * Book Confirmation and Lab Issue row moves; the desktop (v3.4.3.1) moves only the ones that do
 * not count as in use and leaves a 'Sent' confirmation or an open lab issue pointing at the
 * deleted row (see the doc).
 */
const TRANSFER: [string, string][] = [
  ['PrakMRefLibNoT', 'BookTKt'],
  ['SampradayBriefT', 'BookTKt'],
  ['SampradayRemarkT', 'BookTKt'],
  ['AuthMAnyLibNoT2', 'BookTKt'],
  ['SampradaySthalT', 'BookTKt'],
  ['BookConfirmation', 'BookTKt'],
  ['LabIssueM', 'BookTKt'],
  ['AuthorParyayT', 'BookTKt'],
  ['AuthorNoteT', 'BookTKt'],
  ['AuthorNoteT2', 'BookTKt'],
  ['praksnM', 'BookTKt'],
  ['bhandtran', 'cplibnoKt'],
  ['IssueTran', 'entrcodekt'],
  ['praksnlistAnyaBndrM', 'BookTKt'],
  ['AnyaBhandarM', 'BookTKt'],
  ['krutireflibno', 'BookTKt'],
  ['KrutiNoteT', 'BookTKt'],
  ['GraphicBKM', 'BookTKt'],
  ['GrdetailOtherRefT', 'BookTKt'],
  ['RefrenceT', 'BookTKt'],
  ['BookMagazineVisheshT', 'BookTKt'],
  ['EnglishBookVishesh', 'BookTKt'],
  ['SampradayAnyaNameT', 'BookTKt'],
  ['SampradayReferenceT', 'BookTKt'],
  ['SampradayNoteT', 'BookTKt'],
  ['SampradaySamvatT', 'BookTKt'],
  ['AuthorAnyaYogdanT', 'BookTKt'],
  ['AuthorRefLibno', 'BookTKt'],
  ['AuthMContactT', 'BookTKt'],
  ['AuthorSampradayT', 'BookTKt'],
  ['AuthMAnyLibNoT', 'BookTKt'],
  ['AuthorParamparaT', 'BookTKt'],
  ['AuthorVishT', 'BookTKt'],
  ['AuthorIdentityT', 'BookTKt'],
  ['AuthorPattavaliT', 'BookTKt'],
  ['AuthorSamvatT', 'BookTKt'],
  ['MagazineVishesh', 'BookTKt'],
];

async function inUse(db: Executor, tid: number): Promise<string> {
  let out = '';
  for (const [t, column, label, counted] of IN_USE) {
    const n = Number(
      (await scalar(
        db,
        sql`SELECT COUNT(*) FROM ${ident(t)} WHERE ${ident(column)} = ${tid} ${counted ? sql`AND ${counted}` : sql``}`,
      )) ?? 0,
    );
    if (n > 0) out = signBetween(out, label, '\r\n');
  }
  return out;
}

const openWhere = async (
  db: Executor,
  screen: string,
  query: RawBuilder<unknown>,
  emptyMessage: string,
): Promise<ActionResult> => ({ kind: 'open', screen, ids: await ids(db, query), emptyMessage });

const numberParam = (ctx: ActionContext, name: string) => int(ctx.params[name]);

export const bookTran: ScreenDefinition = {
  screen: 'book-tran',
  accessScreen: 'book-master',
  table: 'BookT',
  primaryColumn: 'tid',
  lockable: false,
  listOrderAsc: true,
  workReport: true,
  deleteLabelColumn: 'Libno',

  validate: (f) => (text(f.Libno).trim() === '' ? 'Please Enter LibNo' : ''),

  save: (trx, user, id, f) => saveBookT(trx, user.id, id, f),

  trans: {
    // FormName "Book" matches no SetForm_ routine: the Prapti popup is the plain grid.
    PraptiTran: {},
    MarkTran: {
      lookups: {
        markname: list(sql`
          SELECT Tid, Vishesh, Brief, VisheshNo FROM VisheshMast v WHERE remark = 'MARK' AND v.VisheshNo BETWEEN 1 AND 20
          ORDER BY VisheshNo`),
      },
    },
  },

  // SetSelectionRecord: the Info box.
  async recordExtras(db, id) {
    const book = int(await scalar(db, sql`SELECT BookMastkt FROM BookT WHERE tid = ${id}`));
    let info = await signFromLibNo(db, book, false, [id]);
    if (await isFirstBook(db, id)) info = signBetween(info, 'प्रथम पुस्तक');
    return { PM_GBKM_SEL_PLIST_IMG: info };
  },

  lists: {
    mark: list(sql`
      SELECT Tid, Vishesh, Brief, VisheshNo FROM VisheshMast v WHERE remark = 'MARK' AND v.VisheshNo BETWEEN 1 AND 20
      ORDER BY VisheshNo`),
    books: list(
      sql`SELECT BookMastkm, BookName, txtBookTran AS LibNo FROM BookM ORDER BY BookName`,
    ),
    parties: list(sql`SELECT partyMkm, PName FROM PartyM ORDER BY PName`),
  },

  actions: {
    // txtSerieskt's F2: the series' next number goes into the Library No box (MdlLib.GetMemID,
    // which fills the series' gaps since v3.4.3.1).
    async 'next-libno'(db, _user, _selected, ctx) {
      return {
        kind: 'message',
        message: await nextLibNo(db, numberParam(ctx, 'seriesKt'), { fillGaps: true }),
      };
    },
    // The row's LibNos of the same book, for Delete's transfer choice.
    async 'transfer-choices'(db, _user, _selected, ctx) {
      const tid = numberParam(ctx, 'tid');
      const { rows } = await sql<{ Tid: number; LibNo: string | null }>`
        SELECT Tid, LibNo FROM BookT WHERE Tid <> ${tid}
          AND BookMastkt = (SELECT BookMastkt FROM BookT WHERE tid = ${tid}) ORDER BY LibNo`.execute(
        db,
      );
      return {
        kind: 'table',
        title: 'LibNo',
        columns: ['Tid', 'LibNo'],
        rows: rows.map((r) => [r.Tid, r.LibNo] as GridValue[]),
      };
    },
    async 'in-use'(db, _user, _selected, ctx) {
      return { kind: 'message', message: await inUse(db, numberParam(ctx, 'tid')) };
    },
    // Delete(): move the references (when a row to move them to was chosen), then the row.
    async 'delete-libno'(db, user, _selected, ctx) {
      ctx.assertPassword(ctx.params.password);
      const tid = numberParam(ctx, 'tid');
      const to = numberParam(ctx, 'transferTo');
      const { rows } = await sql<{ BookMastkt: number; Libno: string | null }>`
        SELECT BookMastkt, Libno FROM BookT WHERE tid = ${tid}`.execute(db);
      const row = rows[0];
      if (!row) throw new BadRequestException('Record not found');
      await inTransaction(db, async (trx) => {
        if (to > 0) {
          await sql`
            UPDATE BookT SET OldLibNo = CASE WHEN ISNULL(OldLibNo, '') <> '' THEN OldLibNo + ',' ELSE '' END + ${text(row.Libno)},
              OldLibnoRem = N'BS mix project work (Delete)' WHERE Tid = ${to}`.execute(trx);
          for (const [t, column] of TRANSFER) {
            await sql`UPDATE ${ident(t)} SET ${ident(column)} = ${to} WHERE ${ident(column)} = ${tid}`.execute(
              trx,
            );
          }
        }
        await sql`DELETE FROM praptitran WHERE tid = ${tid}`.execute(trx);
        await sql`DELETE FROM BookT WHERE Tid = ${tid}`.execute(trx);
      });
      await writeWorkReport(db, 'BookT', 'tid', tid, user.id, `Delete ${text(row.Libno).trim()}`);
      await updateTxtBookTran(db, [Number(row.BookMastkt)]);
      return { kind: 'message', message: '' };
    },

    // For Selected Record
    async 'show-book-master'(db, _user, selected) {
      return openWhere(
        db,
        'book-master',
        sql`SELECT BookMastkt AS id FROM BookT WHERE tid IN ${toIds(selected)}`,
        '',
      );
    },
    async 'inword-master'(db, _user, selected) {
      return openWhere(
        db,
        'inward-master',
        sql`SELECT InwordKt AS id FROM BookT WHERE tid IN ${toIds(selected)}`,
        'No Record Found',
      );
    },
    async 'party-master'(db, _user, selected) {
      return openWhere(
        db,
        'party-master',
        sql`SELECT DISTINCT P.prapticokt AS id FROM praptitran P INNER JOIN BookT BT ON P.tid = BT.tid WHERE BT.Tid IN ${toIds(selected)}`,
        'No Record Found',
      );
    },
    async 'issue-master'(db, _user, selected) {
      return openWhere(
        db,
        'issue-master',
        sql`SELECT IssueTranKm AS id FROM IssueTran WHERE entrcodekt IN ${toIds(selected)}`,
        'No Record Found',
      );
    },
    async 'anya-bhandar'(db, _user, selected) {
      return openWhere(
        db,
        'anya-bhandar',
        sql`SELECT DISTINCT AnyaBhandarKm AS id FROM AnyaBhandarM WHERE BookTKt IN ${toIds(selected)}`,
        'No Record Found',
      );
    },
    async 'lab-issue-master'(db, _user, selected) {
      return openWhere(
        db,
        'lab-issue-master',
        sql`SELECT LabIssueMkm AS id FROM LabIssueM WHERE BookTKt IN ${toIds(selected)}`,
        'No Record Found',
      );
    },

    // Utility
    async 'transfer-to-book'(db, _user, _selected, ctx) {
      const tid = numberParam(ctx, 'tid');
      const to = numberParam(ctx, 'book');
      const from = int(await scalar(db, sql`SELECT BookMastkt FROM BookT WHERE tid = ${tid}`));
      if (tid === from) {
        return {
          kind: 'message',
          message:
            'tid and bookmastkt value of this libno is same, so unable to transfer this libno',
        };
      }
      if (to <= 0) return { kind: 'message', message: '' };
      ctx.assertPassword(ctx.params.password);
      await inTransaction(db, async (trx) => {
        await sql`UPDATE BookT SET BookMastkt = ${to} WHERE Tid = ${tid}`.execute(trx);
        await updateTxtBookTran(trx, [to, from]);
      });
      return { kind: 'message', message: '' };
    },
    async 'update-mark'(db, _user, selected, ctx) {
      ctx.assertPassword(ctx.params.password);
      const mark = text(ctx.params.mark);
      if (mark === '') return { kind: 'message', message: '' };
      await sql`
        UPDATE BookT SET Mark = CASE WHEN ISNULL(Mark, '') = '' THEN ${mark} ELSE Mark + ${`,${mark}`} END
        WHERE Tid IN ${toIds(selected)}`.execute(db);
      return {
        kind: 'refreshed',
        rows: [],
        message: `Mark Updated in ${selected.length} Records Successfully`,
      };
    },
    // RequestForLabIssue (F6; F7 with a party): lab-issue-common's rules, per selected row.
    async 'request-lab-issue'(db, user, selected, ctx) {
      const items: { id: number; name: string }[] = [];
      for (const tid of selected) {
        items.push({
          id: tid,
          name: text(await scalar(db, sql`SELECT Libno FROM BookT WHERE tid = ${tid}`)),
        });
      }
      const message = await requestLabIssue(
        db,
        user.id,
        items,
        numberParam(ctx, 'forKt'),
        'Book',
        ctx.env.LAB_ISSUE_OLD_DUE_BLOCK,
      );
      return { kind: 'message', message };
    },
    async 'send-book-confirmation'(db, user, selected, ctx) {
      const { rows } = await sql<{ Libno: string }>`
        SELECT DISTINCT BookT.Libno FROM BookConfirmation INNER JOIN BookT ON BookConfirmation.BookTKt = BookT.tid
        WHERE BookConfirmationStatus = 'Sent' AND BookTKt IN ${toIds(selected)}`.execute(db);
      if (rows.length > 0) {
        return {
          kind: 'message',
          message: `LibNo - ${rows.map((r) => text(r.Libno)).join(',')} already Sent`,
        };
      }
      if (ctx.params.ank === undefined) return { kind: 'message', message: 'ask-ank' };
      await inTransaction(db, async (trx) => {
        for (const tid of selected) {
          await sql`
            INSERT INTO BookConfirmation (BookTKt, Ank, BookConfirmationStatus, BookSentByKt, BookSentDate)
            VALUES (${tid}, ${text(ctx.params.ank)}, 'Sent', ${user.id}, GETDATE())`.execute(trx);
        }
      });
      return { kind: 'message', message: '' };
    },
  },
};

export type { Row };
