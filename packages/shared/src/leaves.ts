import { type SessionUser, UserType } from './auth.js';

/**
 * Employee › Leaves' (frmLeaveM) hard-coded user rules, shared by the API, which enforces them,
 * and the web, which shows the same toolbar and menu. The ids are the desktop's own
 * (`curr_lnid = 41`, `= 5`). `IsAdmin` is not consulted anywhere on this form.
 */
type Viewer = Pick<SessionUser, 'id' | 'userType'>;

/** The two users the form treats like an editor and an approver (`curr_lnid = 41 Or = 5`). */
export const LEAVE_SPECIAL_IDS = [41, 5] as const;

const special = (user: Viewer) => (LEAVE_SPECIAL_IDS as readonly number[]).includes(user.id);

/**
 * frmLeaveM_Load's DefaultCond: user types Admin (1) and AMaster (5) see every leave; everyone
 * else only `EmployeeKt = me OR enuser = me`.
 */
export function seesAllLeaves(user: Viewer): boolean {
  return user.userType === UserType.Admin || user.userType === UserType.AMaster;
}

/**
 * dgMain_Click / btnCancel_Click: `curr_utypeid = 1 Or curr_lnid = 41 Or curr_lnid = 5` may
 * modify a saved leave. Everyone else gets the Locked toolbar (New and Refresh only).
 */
export function canEditLeave(user: Viewer): boolean {
  return user.userType === UserType.Admin || special(user);
}

/**
 * cntMenu_Opening: `curr_utypeid = 5 Or curr_lnid = 41 Or curr_lnid = 5` get Approve Leave,
 * Reject Leave and Employee Summary. An Admin-type user (1) is not included.
 */
export function canApproveLeave(user: Viewer): boolean {
  return user.userType === UserType.AMaster || special(user);
}

/** columnmaster `LeaveStatus` names, which the form always looks up by name. */
export const LeaveStatus = {
  WithoutApproval: 'Leave Without Approval',
  Pending: 'Pending',
  Approved: 'Approved',
  Rejected: 'Rejected',
} as const;

/** The Leave Type text the form treats as LC / EG (`Text.ToLower.Trim = "eg" Or "lc"`). */
export function isLcEgLeaveType(name: string | null | undefined): boolean {
  const t = (name ?? '').trim().toLowerCase();
  return t === 'lc' || t === 'eg';
}

/**
 * GetTotalDays' status: a leave starting today or earlier (`FDate < DateTime.Now`) is "Leave
 * Without Approval", one starting tomorrow or later "Pending". Dates are yyyy-MM-dd.
 */
export function leaveStatusFor(fromIso: string, todayIso: string): string {
  return fromIso <= todayIso ? LeaveStatus.WithoutApproval : LeaveStatus.Pending;
}
