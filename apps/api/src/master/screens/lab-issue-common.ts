import { sql } from 'kysely';
import type { Executor } from '../../db/legacy-sql.js';
import { int, scalar, text } from './book-common.js';

/**
 * The Lab Issue request rules (LabIssueMRepository's GetValidationMessage, GetUserNotReturnedBook,
 * GetStatusKt and Save), shared by every form that makes LabIssueM rows: Lab Issue Master itself,
 * Book Master's Library No dialog (frmBookTranNew, Type Book), Patrika (Type Patrika) and the
 * Graphics screens. Messages are the desktop's, verbatim.
 */

/** LabIssueM.Type; an empty Type is saved as 'Book' (LabIssueMRepository.Save). */
export type LabIssueType = 'Book' | 'Patrika' | 'Hastprat';

/** columnmaster Vibhag 'LabIssueStatus', looked up by Name as the desktop does. */
export type LabIssueStatus = 'DlvrPen' | 'CancelReq' | 'RetPen' | 'Closed';

export async function labStatusKt(db: Executor, name: LabIssueStatus): Promise<number> {
  return int(
    await scalar(
      db,
      sql`SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'LabIssueStatus' AND Name = ${name}`,
    ),
  );
}

/**
 * GetValidationMessage: '' when the request may be saved. `id` is the request's own key (0 for a
 * new one); `name` is the item's text for the messages (the LibNo / RecordNo); `type` '' counts as
 * not Patrika, as on the desktop (frmLabIssueMaster never sets it). The open-request check matches
 * BookTKt only, not Type (desktop behaviour, kept).
 */
export async function labIssueValidation(
  db: Executor,
  req: { id: number; bookTKt: number; name: string; type: LabIssueType | '' },
): Promise<string> {
  const patrika = req.type === 'Patrika';
  if (req.bookTKt === 0) return patrika ? 'Please Enter Patrika No' : 'Please Enter Lib No';
  const byLab = text(
    await scalar(
      db,
      sql`SELECT CASE WHEN ISNULL(Transferuserkt, 0) > 0 THEN (SELECT uname FROM Usecurity WHERE tid = LabIssueM.Transferuserkt)
        ELSE (SELECT uname FROM Usecurity WHERE tid = LabIssueM.enuserKt) END
        FROM LabIssueM WHERE BookTKt = ${req.bookTKt} AND LabIssueMkm <> ${req.id}
        AND ISNULL(RetbackBykt, 0) = 0 AND ISNULL(CancelReq, 0) = 0`,
    ),
  );
  // The desktop swaps the labels: "Patrika No - " for a book, "Lib No - " for a Patrika.
  if (byLab !== '')
    return `${patrika ? 'Lib No - ' : 'Patrika No - '}${req.name} already Requested For LabIssue By - ${byLab}`;
  if (patrika) return '';
  const byIssue = text(
    await scalar(
      db,
      sql`SELECT PartyM.PName FROM IssueTran INNER JOIN PartyM ON IssueTran.party_cokt = PartyM.partyMkm
        WHERE IssueTran.entrcodekt = ${req.bookTKt} AND ISNULL(returned, 0) = 0`,
    ),
  );
  if (byIssue !== '') return `LibNo - ${req.name} already Requested For Issue By - ${byIssue}`;
  return '';
}

/**
 * GetUserNotReturnedBook: '' unless the party (`forKt` > 0), or else the user, holds books
 * delivered more than 30 days ago and not returned.
 */
export async function userNotReturnedBook(
  db: Executor,
  userId: number,
  forKt: number,
): Promise<string> {
  const n = int(
    await scalar(
      db,
      forKt > 0
        ? sql`SELECT COUNT(L.LabIssueMkm) FROM LabIssueM L INNER JOIN columnmaster C ON L.Statuskt = C.ColumnMastkm
            WHERE (L.forkt = ${forKt}) AND DATEDIFF(DAY, L.DeliveryDt, GETDATE()) > 30 AND c.Vibhag = 'LabIssueStatus' AND c.Name = 'RetPen'`
        : sql`SELECT COUNT(L.LabIssueMkm) FROM LabIssueM L INNER JOIN columnmaster C ON L.Statuskt = C.ColumnMastkm
            WHERE (L.Transferuserkt = ${userId} OR (L.enuserKt = ${userId} AND ISNULL(l.Transferuserkt, 0) = 0 AND ISNULL(l.forkt, 0) = 0))
            AND DATEDIFF(DAY, L.DeliveryDt, GETDATE()) > 30 AND c.Vibhag = 'LabIssueStatus' AND c.Name = 'RetPen'`,
    ),
  );
  return n > 0
    ? `You Cannot Issue any Books\r\nPlease Return${n}  Nos. of 30 days Old Due Books to Issue New Books.`
    : '';
}

/** Save of a new request: status DlvrPen, requested now. Returns its LabIssueMkm. */
export async function insertLabRequest(
  db: Executor,
  req: { bookTKt: number; userId: number; forKt: number; type: LabIssueType | '' },
): Promise<number> {
  const status = await labStatusKt(db, 'DlvrPen');
  const { rows } = await sql<{ id: number }>`
    INSERT INTO LabIssueM (BookTKt, enuserKt, endate, Forkt, StatusKt, Type)
    OUTPUT inserted.LabIssueMkm AS id
    VALUES (${req.bookTKt}, ${req.userId}, GETDATE(), ${req.forKt}, ${status}, ${req.type || 'Book'})
  `.execute(db);
  return Number(rows[0]?.id ?? 0);
}

/**
 * RequestForLabIssue (frmBookTranNew, frmPatrika, frmHastpratLibNoTran, frmGraphicMaster): for
 * each selected item, GetValidationMessage, then GetUserNotReturnedBook, then Save. The first
 * message stops the loop (the requests saved before it stay, as on the desktop, which has no
 * transaction); "Book Issued Successfully" once anything was saved and nothing stopped it.
 */
export async function requestLabIssue(
  db: Executor,
  userId: number,
  items: { id: number; name: string }[],
  forKt: number,
  type: LabIssueType,
): Promise<string> {
  let saved = 0;
  for (const item of items) {
    const problem =
      (await labIssueValidation(db, { id: 0, bookTKt: item.id, name: item.name, type })) ||
      (await userNotReturnedBook(db, userId, forKt));
    if (problem) return problem;
    await insertLabRequest(db, { bookTKt: item.id, userId, forKt, type });
    saved++;
  }
  return saved > 0 ? 'Book Issued Successfully' : '';
}
