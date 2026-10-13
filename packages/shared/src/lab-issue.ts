import { type SessionUser, UserType } from './auth.js';
import { type GridRow, recordInt } from './master.js';

/**
 * frmLabIssueMaster's rules that both the toolbar / menu and the API need.
 */

/**
 * Deliver Selected Book (F4) and Return Selected Book (F5): `curr_utypeid <> 3` → "U have no
 * right to …". Exactly user type 3 (Oprator): Admin and Master users are refused too.
 */
export function canDeliverLabIssue(user: Pick<SessionUser, 'userType'>): boolean {
  return user.userType === UserType.Operator;
}

/**
 * FillData's per-row toolbar state: a delivered row (DeliveryByKt > 0) has Delete off, a
 * returned one (RetbackByKt > 0) has Modify off. Columns are matched without regard to case.
 */
export function labIssueButtonsOff(record: GridRow): { modify: boolean; delete: boolean } {
  return {
    modify: recordInt(record, 'RetbackBykt') > 0,
    delete: recordInt(record, 'DeliveryBykt') > 0,
  };
}

/**
 * dgMain_CellFormatting's ForeColor: returned rows DarkGreen, undelivered rows (pending or
 * cancelled) black, delivered and not returned rows DarkRed.
 */
export function labIssueRowColor(record: GridRow): string | undefined {
  if (recordInt(record, 'RetbackBykt') > 0) return '#006400';
  if (recordInt(record, 'DeliveryBykt') === 0) return undefined;
  return '#8b0000';
}
