import { type ActionResult, canDeliverLabIssue, labIssueButtonsOff } from '@gglib/shared';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { ids as idsOf, int, list, scalar, text } from './book-common.js';
import {
  insertLabRequest,
  labIssueValidation,
  labStatusKt,
  userNotReturnedBook,
} from './lab-issue-common.js';
import type { ScreenDefinition } from './registry.js';

/**
 * Issue › Lab Issue Master (frmLabIssueMaster, LabIssueMRepository). Table LabIssueM, IDENTITY key
 * LabIssueMkm (~293k rows), no Locked column. A staff user requests a library item, an Operator
 * (user type 3) delivers it and later takes it back. Most requests are made elsewhere (Book
 * Master's Library No dialog, Patrika, Graphics) through lab-issue-common.ts. See
 * docs/screens/lab-issue-master.md.
 */

const ids0 = (list: readonly number[]) => idList(list.length ? list : [0]);

/** The rows FillData / the actions read: the table's own columns. */
async function rowsOf(db: Executor, ids: readonly number[]) {
  const { rows } = await sql<{
    id: number;
    BookTKt: number | null;
    Type: string | null;
    enuserKt: number | null;
    DeliveryBykt: number | null;
    RetbackBykt: number | null;
  }>`
    SELECT LabIssueMkm AS id, BookTKt, Type, enuserKt, DeliveryBykt, RetbackBykt
    FROM LabIssueM WHERE LabIssueMkm IN ${ids0(ids)}
  `.execute(db);
  return rows;
}

/** The LibNo / RecordNo the grid shows for an item (tblSearch BookTKt's JoinCondition). */
async function itemName(db: Executor, bookTKt: number, type: string): Promise<string> {
  return text(
    await scalar(
      db,
      type === 'Patrika'
        ? sql`SELECT RecordNo FROM Patrika WHERE PatrikaKm = ${bookTKt}`
        : sql`SELECT Libno FROM BookT WHERE tid = ${bookTKt}`,
    ),
  );
}

/**
 * txtBookTKt's F2 (Txt_KeyDown): BookT items with a LibNo that have no open request and are not
 * issued. The `OR CancelReq = 1` also hides every item that was ever cancelled (desktop
 * behaviour, kept). In Edit mode only the other copies of the same book (moving a request).
 */
function libNoList(bookMastKt: number | null): RawBuilder<unknown> {
  const free = sql`tid NOT IN (SELECT BookTKt FROM LabIssueM WHERE ISNULL(LabIssueM.RetbackBykt, 0) = 0 OR ISNULL(CancelReq, 0) = 1)
    AND tid NOT IN (SELECT entrcodekt FROM IssueTran WHERE ISNULL(returned, 0) = 0)`;
  return bookMastKt === null
    ? sql`SELECT Tid, LibNo, BookName FROM BookT INNER JOIN BookM ON BookMastkm = BookMastkt
        WHERE ISNULL(Libno, '') <> '' AND ${free} ORDER BY Libno`
    : sql`SELECT Tid, LibNo, BookName FROM BookT INNER JOIN BookM ON BookMastkm = BookMastkt
        WHERE BookMastkt = ${bookMastKt} AND ${free} ORDER BY Libno`;
}

/** Send To: the selected requests of one Type, by their BookTKt (GetSelectedId). */
async function selectedItems(db: Executor, ids: readonly number[], type: string) {
  return (await rowsOf(db, ids))
    .filter((r) => text(r.Type) === type)
    .map((r) => int(r.BookTKt))
    .filter((n) => n !== 0);
}

const message = (text: string): ActionResult => ({ kind: 'message', message: text });

export const labIssueMaster: ScreenDefinition = {
  screen: 'lab-issue-master',
  table: 'LabIssueM',
  primaryColumn: 'LabIssueMkm',
  lockable: false,
  // DefaultCond: open requests only (also UcSearch's WhereCondition).
  defaultCondition: sql`(ISNULL(DeliveryBykt, 0) = 0 OR ISNULL(RetbackBykt, 0) = 0) AND ISNULL(CancelReq, 0) = 0`,
  // Show All Records / of Current User load the whole table on the desktop (~293k rows): the
  // web shows the newest 5000 (also the default grid's cap; it has ~1.3k open rows today).
  listLimit: 5000,
  // FillData: Delete off for a delivered row, Modify off for a returned one.
  buttonsOff: (record) => labIssueButtonsOff(record),
  // insertworkreports runs after Save, but in Add mode TranKm is still 0 then: Edit only.
  workReport: true,
  workReportOn: { add: false, edit: true, delete: false },

  validate: (fields) => (int(fields.BookTKt) === 0 ? 'Please Enter Lib No' : ''),

  /**
   * Save(): GetValidationMessage (with Type unset, as the form leaves it), then
   * GetUserNotReturnedBook, then LabIssueMRepository.Save. Add inserts a Book request (status
   * DlvrPen); Edit changes only BookTKt and Forkt, stamping moduserKt (the desktop wrote 0).
   */
  async save(trx, user, id, fields, { env }) {
    const bookTKt = int(fields.BookTKt);
    const forKt = int(fields.Forkt);
    let name: string;
    if (id > 0) {
      const [row] = await rowsOf(trx, [id]);
      if (!row) throw new BadRequestException('Record not found');
      const type = text(row.Type);
      // Fix: the LibNo list offers BookT items only, so a Patrika request keeps its item.
      if (type === 'Patrika' && bookTKt !== int(row.BookTKt))
        throw new BadRequestException('LibNo cannot be changed for a Patrika request');
      name = await itemName(trx, bookTKt, bookTKt === int(row.BookTKt) ? type : 'Book');
    } else {
      name = await itemName(trx, bookTKt, 'Book');
    }
    const problem =
      (await labIssueValidation(trx, { id, bookTKt, name, type: '' })) ||
      (await userNotReturnedBook(trx, user.id, forKt, env.LAB_ISSUE_OLD_DUE_BLOCK));
    if (problem) throw new BadRequestException(problem);
    if (id === 0) return insertLabRequest(trx, { bookTKt, userId: user.id, forKt, type: 'Book' });
    await sql`
      UPDATE LabIssueM SET BookTKt = ${bookTKt}, moduserKt = ${user.id}, moddate = GETDATE(), Forkt = ${forKt}
      WHERE LabIssueMkm = ${id}
    `.execute(trx);
    return id;
  },

  f2: {
    async booktkt(db, params) {
      if (params.mode !== 'Edit') return list(libNoList(null))(db);
      const book = int(
        await scalar(db, sql`SELECT BookMastkt FROM BookT WHERE tid = ${int(params.bookTKt)}`),
      );
      return list(libNoList(book))(db);
    },
  },

  lists: {
    // Update For(Party): DisplayListForm over the parties.
    parties: list(sql`SELECT partyMkm, PName FROM PartyM ORDER BY PName`),
  },

  actions: {
    /**
     * Utility › Cancel Request for Selected Records. Fix: every selected row must be the user's
     * own (the desktop checked only the current row, then cancelled them all). Without
     * `confirmed` it answers 'ask-confirm' for the client's Yes/No.
     */
    async 'cancel-request'(db, user, ids, ctx) {
      const rows = await rowsOf(db, ids);
      if (rows.length === 0 || rows.some((r) => int(r.enuserKt) !== user.id))
        return message('only User Requested the Book Only can Cancell the Request');
      if (ctx.params.confirmed !== true) return message('ask-confirm');
      const status = await labStatusKt(db, 'CancelReq');
      const { numAffectedRows } = await sql`
        UPDATE LabIssueM SET CancelReq = 1, Statuskt = ${status}
        WHERE LabIssueMkm IN ${ids0(ids)} AND ISNULL(DeliveryBykt, 0) = 0
      `.execute(db);
      const n = Number(numAffectedRows ?? 0);
      return n > 0
        ? { kind: 'refreshed', rows: [], message: `(${n}) Records Cancelled Successfully` }
        : message('No Records Canceled');
    },

    /** Utility › Deliver Selected Book (F4): Operators only; DlvrPen rows become RetPen. */
    async deliver(db, user, ids) {
      if (!canDeliverLabIssue(user))
        throw new ForbiddenException('U have no right to Deliver the Books');
      const [pending, next] = [await labStatusKt(db, 'DlvrPen'), await labStatusKt(db, 'RetPen')];
      const { numAffectedRows } = await sql`
        UPDATE LabIssueM SET DeliveryBykt = ${user.id}, DeliveryDt = GETDATE(), Statuskt = ${next}
        WHERE Statuskt = ${pending} AND LabIssueMkm IN ${ids0(ids)}
      `.execute(db);
      const n = Number(numAffectedRows ?? 0);
      return n > 0
        ? { kind: 'refreshed', rows: [], message: `${n} Books Delivered Successfully` }
        : message('No Books Delivered');
    },

    /** Utility › Return Selected Book (F5): Operators only; RetPen rows become Closed. */
    async return(db, user, ids) {
      if (!canDeliverLabIssue(user))
        throw new ForbiddenException('U have no right to Return the Books');
      const [pending, next] = [await labStatusKt(db, 'RetPen'), await labStatusKt(db, 'Closed')];
      const { numAffectedRows } = await sql`
        UPDATE LabIssueM SET RetbackBykt = ${user.id}, RetbackDt = GETDATE(), Statuskt = ${next}
        WHERE Statuskt = ${pending} AND LabIssueMkm IN ${ids0(ids)}
      `.execute(db);
      const n = Number(numAffectedRows ?? 0);
      return n > 0
        ? { kind: 'refreshed', rows: [], message: `${n} Books Returned Successfully` }
        : message('No Books Returned');
    },

    /**
     * Utility › Transfer Current Book To Me (the current row, sent as the only id): not for the
     * requester themself; no status check (desktop behaviour).
     */
    async 'transfer-to-me'(db, user, ids) {
      const id = ids[0] ?? 0;
      const { numAffectedRows } = await sql`
        UPDATE LabIssueM SET Transferuserkt = ${user.id}, TransferDt = GETDATE()
        WHERE LabIssueMkm = ${id} AND enuserKt <> ${user.id}
      `.execute(db);
      return Number(numAffectedRows ?? 0) > 0
        ? { kind: 'refreshed', rows: [], message: 'Book Transferred Successfully' }
        : message('');
    },

    /**
     * Utility › Update For(Party) For Selected Records: the selected undelivered rows get the
     * picked party. Without `party` it answers 'ask-party' (or the desktop's message when every
     * selected row is delivered). Fix: no party (the picker cancelled) changes nothing, and
     * moduserKt is the current user (the desktop wrote the old one back).
     */
    async 'update-for-party'(db, user, ids, ctx) {
      const open = (await rowsOf(db, ids)).filter((r) => int(r.DeliveryBykt) === 0);
      if (open.length === 0) return message('Selected Books Already Delivered');
      const party = int(ctx.params.party);
      if (ctx.params.party === undefined) return message('ask-party');
      if (party <= 0) return message('');
      const problem = await userNotReturnedBook(
        db,
        user.id,
        party,
        ctx.env.LAB_ISSUE_OLD_DUE_BLOCK,
      );
      if (problem) return message(problem);
      await sql`
        UPDATE LabIssueM SET Forkt = ${party}, moduserKt = ${user.id}, moddate = GETDATE()
        WHERE LabIssueMkm IN ${ids0(open.map((r) => Number(r.id)))} AND ISNULL(DeliveryBykt, 0) = 0
      `.execute(db);
      return { kind: 'refreshed', rows: [] };
    },

    /** Utility › Show All Records: FillList without DefaultCond (capped at listLimit). */
    async 'show-all'(_db, _user, _ids, ctx) {
      return { kind: 'list', rows: await ctx.list(sql`1 = 1`, { limit: true }) };
    },

    /** Utility › Show All Records of Current User: the user's requests, closed ones too. */
    async 'show-mine'(_db, user, _ids, ctx) {
      return { kind: 'list', rows: await ctx.list(sql`enuserKt = ${user.id}`, { limit: true }) };
    },

    /** Send To › BookM: the books of the selected Book requests. */
    async 'send-to-book-m'(db, _user, ids) {
      const items = await selectedItems(db, ids, 'Book');
      if (items.length === 0) return message('Please Select Book Record');
      return {
        kind: 'open',
        screen: 'book-master',
        ids: await idsOf(db, sql`SELECT BookMastkt AS id FROM BookT WHERE tid IN ${ids0(items)}`),
        emptyMessage: 'No Record Found',
      };
    },

    /** Send To › BookT: the Library No dialog (frmBookTranNew) over the selected Book requests. */
    async 'send-to-book-t'(db, _user, ids) {
      const items = await selectedItems(db, ids, 'Book');
      if (items.length === 0) return message('Please Select Book Record');
      return {
        kind: 'open',
        screen: 'book-tran',
        ids: await idsOf(db, sql`SELECT Tid AS id FROM BookT WHERE tid IN ${ids0(items)}`),
        emptyMessage: 'No Record Found',
      };
    },

    /** Send To › Patrika: Patrika with the selected Patrika requests' records. */
    async 'send-to-patrika'(db, _user, ids) {
      const items = await selectedItems(db, ids, 'Patrika');
      if (items.length === 0) return message('Please Select Patrika Record');
      return { kind: 'open', screen: 'patrika', ids: items, emptyMessage: '' };
    },
  },
};
