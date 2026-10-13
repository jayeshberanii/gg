import { sql } from 'kysely';
import { idList } from '../../db/legacy-sql.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Issue › Book Confirmation (frmBookConfirmation, BookConfirmationRepository). Table
 * BookConfirmation, IDENTITY key BookConfirmationKm. Rows are made by Book Master's Library No
 * dialog (F8 "Send Book Confirmation", SendBookConfirmation); this screen only lists them,
 * receives them and deletes them. Its toolbar keeps Delete and Refresh (ShowHideButton) and it
 * has no Save at all. No Locked column, no work report.
 */
export const bookConfirmation: ScreenDefinition = {
  screen: 'book-confirmation',
  table: 'BookConfirmation',
  primaryColumn: 'BookConfirmationKm',
  lockable: false,
  defaultCondition: sql`BookConfirmationStatus = 'Sent'`,

  // The form has no Save button or handler.
  validate: () => 'Book Confirmation records are not saved here',
  save: () => Promise.reject(new Error('Book Confirmation has no Save')),

  actions: {
    /**
     * Utility › Receive Confirmation: the selected rows still "Sent" are received by this user
     * now (ReceiveBookConfirmation), then FillList.
     */
    async receive(db, user, ids, ctx): Promise<ActionResult> {
      const { rows } = await sql<{ id: number }>`
        SELECT BookConfirmationKm AS id FROM BookConfirmation
        WHERE BookConfirmationKm IN ${idList(ids.length ? ids : [0])} AND BookConfirmationStatus = 'Sent'
      `.execute(db);
      if (rows.length === 0)
        return { kind: 'message', message: 'Please select record with Statu as Sent' };
      await sql`
        UPDATE BookConfirmation SET BookReceivedByKt = ${user.id}, BookReceivedDate = GETDATE(),
          BookConfirmationStatus = 'Received'
        WHERE BookConfirmationKm IN ${idList(rows.map((r) => Number(r.id)))}
      `.execute(db);
      return { kind: 'list', rows: await ctx.list() };
    },
    /** Utility › Show All Records: FillList without DefaultCond. */
    async 'show-all'(_db, _user, _ids, ctx): Promise<ActionResult> {
      return { kind: 'list', rows: await ctx.list(sql`1 = 1`) };
    },
  },
};
