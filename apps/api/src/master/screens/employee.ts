import {
  canEditEmployeeUserType,
  type GridRow,
  canSeeEmployeePassword,
  isEmployeePrivileged,
  type SessionUser,
  UserType,
} from '@gglib/shared';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { decodeLegacyPassword, encodeLegacyPassword } from '../../auth/legacy-password.js';
import type { Executor } from '../../db/legacy-sql.js';
import { ident } from '../../db/trusted-sql.js';
import { pickListOf } from '../values.js';
import { bit, get, grid, int, put, val } from './book-common.js';
import { pickerDate, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Employee › Employee Master (frmEmployeeNew, USecurityRepository). Table Usecurity, IDENTITY
 * key tid: the login table, so everything here is security-sensitive.
 *
 * - The password (`upwd`, the desktop's reversible +128 encoding) never leaves the server
 *   through the grid, search, print or export (`secretColumns`). The record carries it,
 *   decoded, only for a viewer who passes chkShowPassword's rule (canSeeEmployeePassword).
 * - Non-privileged users (not IsAdmin, not users 5 / 13) see and edit only their own row; the
 *   API enforces it (`listFilter` + `enforceListFilter` + `recordWritableBy`), where the
 *   desktop only disabled buttons.
 * - No Locked column, no lblEntry. The work report logs Edit saves only, a password change as
 *   `upwd(changed)`.
 */

/** Text boxes whose F2 lists the distinct values already used (tblSearch F2EntryText). */
const DISTINCT_F2 = [
  'Employee_Name',
  'Address',
  'Area',
  'city',
  'Pincode',
  'Phoneno',
  'Mobileno',
  'EmailID',
  'Grading',
  'Refnm',
  'Remark',
  'IPAddress',
] as const;

/** DefaultCond: everyone but the privileged sees only their own row. */
const ownRow = (user: SessionUser) =>
  isEmployeePrivileged(user) ? null : sql`Usecurity.tid = ${user.id}`;

/** VB's CInt of Val(text): rounds half to even (per_hor_amount is an Integer property). */
function vbInteger(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
}

/** MaskedTextBox "90:00".MaskCompleted: at least the second hour digit and both minutes. */
function workingHours(v: unknown): string {
  const s = trimmed(v).replace(/\s/g, '');
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? s : '';
}

type OldRow = { UserTypeKt: number | null };

/**
 * User Type: only IsAdmin or AMaster may change it (txtUserTypeKt.Enabled); on the web nobody
 * may change their own, and only IsAdmin may set or clear Admin (1).
 */
function userTypeFor(user: SessionUser, id: number, wanted: number, old: OldRow | undefined) {
  const stored = old ? (old.UserTypeKt ?? 0) : 0;
  if (!canEditEmployeeUserType(user)) return stored;
  if (wanted === stored) return stored;
  if (id > 0 && id === user.id)
    throw new BadRequestException('You cannot change your own User Type');
  if ((wanted === UserType.Admin || stored === UserType.Admin) && !user.isAdmin)
    throw new BadRequestException('Only an administrator can set or clear the Admin user type');
  return wanted;
}

export const employeeMaster: ScreenDefinition = {
  screen: 'employee-master',
  table: 'Usecurity',
  primaryColumn: 'tid',
  lockable: false,
  // WhereCondition " AND IsActive=1": the grid's default; UcSearch is loaded without it.
  defaultCondition: sql`Usecurity.IsActive = 1`,
  defaultConditionListOnly: true,
  listFilter: ownRow,
  enforceListFilter: true,
  secretColumns: ['upwd'],
  // UcSearch1.LoadData(..., boolFillCombo := IsAdminLogin Or tid 5 Or tid 13)
  searchableBy: isEmployeePrivileged,
  // New / Copy / Delete for the privileged; Modify / Save on a row they may see (their own).
  recordWritableBy: (user, id, op) =>
    isEmployeePrivileged(user) || (op === 'edit' && id === user.id),
  workReport: true,
  workReportOn: { add: false, delete: false },
  // Save(): updatedby / updatedon are copied from the old row so they never count as changes.
  workReportAdjust(oldRow, newRow) {
    put(newRow, 'updatedby', get(oldRow, 'updatedby'));
    put(newRow, 'updatedon', get(oldRow, 'updatedon'));
  },

  // Save(): the Working Hours check runs before the confirm, then GetValidationMessage.
  validate: (f) =>
    workingHours(f.WorkingHours) === ''
      ? 'Please Enter Working Hours'
      : trimmed(f.uname) === ''
        ? 'Please Enter User Name'
        : '',

  /** FillData's `txtupwd.Text = deco(upwd)`, for a viewer chkShowPassword is visible to. */
  async recordExtras(db, id, user): Promise<GridRow> {
    if (!user || !canSeeEmployeePassword(user, id)) return {};
    const { rows } = await sql<{ pwd: Buffer | null }>`
      SELECT CONVERT(varbinary(100), upwd) AS pwd FROM Usecurity WHERE tid = ${id}
    `.execute(db);
    const pwd = rows[0]?.pwd;
    return { upwd: pwd ? decodeLegacyPassword(pwd) : '' };
  },

  async save(trx, user, id, f) {
    const privileged = isEmployeePrivileged(user);
    const old =
      id > 0
        ? (await sql<OldRow>`SELECT UserTypeKt FROM Usecurity WHERE tid = ${id}`.execute(trx))
            .rows[0]
        : undefined;
    if (id > 0 && !old) throw new NotFoundException('Record not found');
    const userType = userTypeFor(user, id, int(f.UserTypeKt), old);
    const active = bit(f.IsActive);
    const v = {
      Employee_Name: trimmed(f.Employee_Name),
      uname: trimmed(f.uname),
      Refnm: trimmed(f.Refnm),
      Address: trimmed(f.Address),
      Area: trimmed(f.Area),
      city: trimmed(f.city),
      Pincode: trimmed(f.Pincode),
      Phoneno: trimmed(f.Phoneno),
      Mobileno: trimmed(f.Mobileno),
      EmailID: trimmed(f.EmailID),
      Grading: trimmed(f.Grading),
      per_hor_amount: vbInteger(val(f.per_hor_amount)),
      Remark: trimmed(f.Remark),
      IPAddress: trimmed(f.IPAddress),
      uadd: bit(f.uadd),
      umodify: bit(f.umodify),
      udel: bit(f.udel),
      // A picker the user never touched on a record without the date sends '' (keep it).
      DOB: pickerDate(f.DOB),
      DOJ: pickerDate(f.DOJ),
      WorkingHours: workingHours(f.WorkingHours),
    };
    // The password box sends only what the user typed: absent means "keep the stored one".
    const typed = typeof f.upwd === 'string' ? f.upwd.trim() : null;
    const pwd = (plain: string) => sql`CONVERT(varchar(50), ${encodeLegacyPassword(plain)})`;

    let tid = id;
    if (id > 0) {
      await sql`
        UPDATE Usecurity SET uname = ${v.uname}, uadd = ${v.uadd}, umodify = ${v.umodify}, udel = ${v.udel},
          Employee_Name = ${v.Employee_Name}, Address = ${v.Address}, Area = ${v.Area}, city = ${v.city},
          Pincode = ${v.Pincode}, Phoneno = ${v.Phoneno}, Mobileno = ${v.Mobileno}, EmailID = ${v.EmailID},
          DOB = ISNULL(CAST(${v.DOB} AS date), DOB), DOJ = ISNULL(CAST(${v.DOJ} AS date), DOJ), per_hor_amount = ${v.per_hor_amount},
          updatedby = ${user.id}, updatedon = GETDATE(), Refnm = ${v.Refnm}, Grading = ${v.Grading},
          Remark = ${v.Remark}, UserTypeKt = ${userType}, IPAddress = ${v.IPAddress}
          ${typed !== null ? sql`, upwd = ${pwd(typed)}` : sql``}
          ${
            privileged
              ? sql`, WorkingHours = ${v.WorkingHours}, IsActive = ${active}
                  ${active ? sql`` : sql`, DOL = ISNULL(DOL, CAST(GETDATE() AS date))`}`
              : sql``
          }
        WHERE tid = ${id}
      `.execute(trx);
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, Employee_Name, Address, Area, city,
          Pincode, Phoneno, Mobileno, EmailID, DOB, DOJ, per_hor_amount, Createdby, createdon, Refnm, vibhagkt,
          Grading, IsActive, WorkingHours, Remark, UserTypeKt, IPAddress)
        OUTPUT INSERTED.tid AS id
        VALUES (${v.uname}, ${pwd(typed ?? '')}, ${v.uadd}, ${v.umodify}, ${v.udel}, 0, ${v.Employee_Name},
          ${v.Address}, ${v.Area}, ${v.city}, ${v.Pincode}, ${v.Phoneno}, ${v.Mobileno}, ${v.EmailID},
          ISNULL(CAST(${v.DOB} AS date), CAST(GETDATE() AS date)),
          ISNULL(CAST(${v.DOJ} AS date), CAST(GETDATE() AS date)),
          ${v.per_hor_amount}, ${user.id}, GETDATE(), ${v.Refnm}, ${int(f.vibhagkt)}, ${v.Grading}, ${active},
          ${v.WorkingHours}, ${v.Remark}, ${userType}, ${v.IPAddress})
      `.execute(trx);
      tid = Number(rows[0]!.id);
    }

    // DeleteTransaction + Save's EmpReportingT inserts, now in the same transaction. Only IsAdmin
    // or AMaster can edit Reporting To; for anyone else the rows stay as they are.
    if (canEditEmployeeUserType(user)) {
      const rows = grid(f, 'ReportingToTran');
      if (trimmed(f.ReportingToTran) === '' || (rows?.length ?? 0) > 0)
        await sql`DELETE FROM EmpReportingT WHERE EmployeeKt = ${tid}`.execute(trx);
      for (const r of rows ?? []) {
        const to = int(get(r, 'ReportingToKt'));
        // The popup's blank row ({Id, 0, ""}) would point at user 0.
        if (to > 0)
          await sql`
            INSERT INTO EmpReportingT (EmployeeKt, ReportingToKt) VALUES (${tid}, ${to})
          `.execute(trx);
      }
    }
    return tid;
  },

  /** Delete(): DeleteTransaction(TranKm, "", Nothing), then the record. */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM EmpReportingT WHERE EmployeeKt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM Usecurity WHERE tid = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  // The distinct-value lists, kept to the rows the user may see (their own, unless privileged).
  f2: Object.fromEntries(
    DISTINCT_F2.map((column) => [
      column.toLowerCase(),
      (db: Executor, _params: Record<string, string>, user?: SessionUser) => {
        const filter = user ? ownRow(user) : sql`1 = 0`;
        return pickListOf(
          db,
          sql`SELECT ${ident(column)} FROM Usecurity
              WHERE ISNULL(${ident(column)}, '') <> '' ${filter ? sql`AND ${filter}` : sql``}
              GROUP BY ${ident(column)} ORDER BY ${ident(column)}`,
        );
      },
    ]),
  ),

  trans: {
    // TranName "ReportingTo", FormName "usecurity" (SetForm_Usecurity): F2 on the name cell.
    ReportingToTran: {
      lookups: {
        reportingtoname: (db) => pickListOf(db, sql`SELECT tid, uname FROM Usecurity`),
      },
    },
  },

  actions: {
    // Utility (cntMenu_Opening: privileged only) › Show All / Active / Inactive Employees.
    async 'show-all'(_db, user, _ids, ctx): Promise<ActionResult> {
      assertPrivileged(user);
      return { kind: 'list', rows: await ctx.list(sql`1 = 1`) };
    },
    async 'show-active'(_db, user, _ids, ctx): Promise<ActionResult> {
      assertPrivileged(user);
      return { kind: 'list', rows: await ctx.list(sql`Usecurity.IsActive = 1`) };
    },
    async 'show-inactive'(_db, user, _ids, ctx): Promise<ActionResult> {
      assertPrivileged(user);
      return { kind: 'list', rows: await ctx.list(sql`Usecurity.IsActive = 0`) };
    },
  },
};

function assertPrivileged(user: SessionUser) {
  if (!isEmployeePrivileged(user)) throw new ForbiddenException('Not allowed');
}
