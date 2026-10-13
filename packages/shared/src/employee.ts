import { type SessionUser, UserType } from './auth.js';

/**
 * Employee Master's (frmEmployeeNew) hard-coded user rules, shared by the API, which enforces
 * them, and the web, which shows the same toolbar and fields. The ids are the desktop's own
 * (`curr_lnid = 5`, `= 13`, `= 100`), like the menu's hard-coded ids.
 */
type Viewer = Pick<SessionUser, 'id' | 'isAdmin' | 'userType'>;

/** vishal and hardik: treated like IsAdminLogin everywhere on the form. */
export const EMPLOYEE_PRIVILEGED_IDS = [5, 13] as const;
/** vinit: "For Security, Vinitbhai Password Suggested By Vinitbhai" (FillData). */
export const EMPLOYEE_PROTECTED_PASSWORD_ID = 100;

/**
 * `IsAdminLogin Or curr_lnid = 5 Or curr_lnid = 13`: sees every employee, may add, copy and
 * delete, edits Working Hrs and Active, and has the Search By combo and the Utility menu.
 * Everyone else sees and edits only their own row.
 */
export function isEmployeePrivileged(user: Viewer): boolean {
  return user.isAdmin || (EMPLOYEE_PRIVILEGED_IDS as readonly number[]).includes(user.id);
}

/** `IsAdminLogin Or curr_utypeid = AMaster`: txtUserTypeKt and txtReportingToTran are enabled. */
export function canEditEmployeeUserType(user: Viewer): boolean {
  return user.isAdmin || user.userType === UserType.AMaster;
}

/**
 * chkShowPassword's visibility (FillData): the viewer is privileged or it is their own row,
 * except that row 100's password is shown to user 100 only. The web sends the decoded password
 * only when this holds, and never anywhere else.
 */
export function canSeeEmployeePassword(viewer: Viewer, rowId: number): boolean {
  if (rowId === EMPLOYEE_PROTECTED_PASSWORD_ID && viewer.id !== EMPLOYEE_PROTECTED_PASSWORD_ID)
    return false;
  return isEmployeePrivileged(viewer) || viewer.id === rowId;
}
