import { z } from 'zod';

/** `EnumUserType` in the desktop's MdlLib.vb (`Usecurity.UserTypeKt`). */
export const UserType = {
  Admin: 1,
  Master: 2,
  Operator: 3,
  Guest: 4,
  AMaster: 5,
} as const;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const clockTime = z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Expected HH:mm:ss');

export const loginRequestSchema = z.object({
  username: z.string(),
  password: z.string(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  isAdmin: z.boolean(),
  userType: z.number().int(),
  rights: z.object({
    add: z.boolean(),
    modify: z.boolean(),
    delete: z.boolean(),
    view: z.boolean(),
  }),
  /** Today's `log.logID`: the attendance row this session belongs to. */
  logId: z.number().int(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const leaveTypeOptionSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  brief: z.string(),
});
export type LeaveTypeOption = z.infer<typeof leaveTypeOptionSchema>;

/**
 * The leave application the desktop forces at the first login of the day (frmLogoutNew.SaveLog):
 * - `absent`: working days since the last login were missed without leave.
 * - `short-hours`: the last working day's logged time fell more than 30 minutes short of the
 *   user's WorkingHours. Only the LC / EG leave types are offered and a reason is required.
 */
export const leaveRequirementSchema = z.object({
  mode: z.enum(['absent', 'short-hours']),
  fromDate: isoDate,
  toDate: isoDate,
  leaveTypes: z.array(leaveTypeOptionSchema),
  diffHr: clockTime.nullable(),
});
export type LeaveRequirement = z.infer<typeof leaveRequirementSchema>;

export const pendingWorkReportSchema = z.object({
  logId: z.number().int(),
  logDate: isoDate,
});
export type PendingWorkReport = z.infer<typeof pendingWorkReportSchema>;

export const loginSuccessSchema = z.object({
  status: z.literal('ok'),
  user: sessionUserSchema,
  /** "Last LogIn Date / Time" shown after login; null when the user has no earlier login. */
  lastLogin: z.object({ date: isoDate, time: clockTime.nullable() }).nullable(),
  currentLoginTime: clockTime,
  /**
   * Past days whose work report is short of the logged time. Only computed for users the
   * desktop asks (see `requiresWorkReport`); declining is allowed while there are at most 2.
   */
  pendingWorkReports: z.array(pendingWorkReportSchema),
});
export type LoginSuccess = z.infer<typeof loginSuccessSchema>;

export const loginLeaveRequiredSchema = z.object({
  status: z.literal('leave-required'),
  /** Short-lived proof that the credentials were already checked. */
  ticket: z.string(),
  leave: leaveRequirementSchema,
});
export type LoginLeaveRequired = z.infer<typeof loginLeaveRequiredSchema>;

export const loginResponseSchema = z.discriminatedUnion('status', [
  loginSuccessSchema,
  loginLeaveRequiredSchema,
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const leaveSubmitRequestSchema = z.object({
  ticket: z.string(),
  leaveTypeId: z.number().int(),
  reason: z.string(),
});
export type LeaveSubmitRequest = z.infer<typeof leaveSubmitRequestSchema>;

/** Most pending work reports a user may decline at login before the app refuses entry. */
export const MAX_DECLINABLE_PENDING_WORK_REPORTS = 2;

/** User ids the desktop hard-codes as exempt from the leave and work-report checks. */
export const ATTENDANCE_EXEMPT_USER_IDS: readonly number[] = [100, 103, 118];

/**
 * Whether the desktop makes this user fill a work report (at login for pending days, and at
 * logout). frmLogoutNew.SaveLog: `uadd And umodify And udel`, not admin, and not one of the
 * exempt ids. This is the login-time rule; the menu and close rules differ slightly (below).
 */
export function requiresWorkReport(user: Pick<SessionUser, 'id' | 'isAdmin' | 'rights'>): boolean {
  return (
    !user.isAdmin &&
    !ATTENDANCE_EXEMPT_USER_IDS.includes(user.id) &&
    user.rights.add &&
    user.rights.modify &&
    user.rights.delete
  );
}

/** Frmlibmain `LogOutToolStripMenuItem1` (Employee › Login & Log Out): admins included. */
export function workReportOnLoginLogoutMenu(user: Pick<SessionUser, 'rights'>): boolean {
  return user.rights.add && user.rights.modify && user.rights.delete;
}

/** Frmlibmain `mnuext` (Master › Exit, Ctrl+Q): skips admins. */
export function workReportOnExitMenu(user: Pick<SessionUser, 'isAdmin' | 'rights'>): boolean {
  return !user.isAdmin && workReportOnLoginLogoutMenu(user);
}

/** Frmlibmain `FormClosing` (closing the app; on the web, Logout): also skips users 103 and 118. */
export function workReportOnClose(user: Pick<SessionUser, 'id' | 'isAdmin' | 'rights'>): boolean {
  return workReportOnExitMenu(user) && user.id !== 103 && user.id !== 118;
}
