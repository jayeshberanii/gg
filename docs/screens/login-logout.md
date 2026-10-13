# Login, attendance and Login & Log Out (`log`, `work`)

Desktop sources:

- `Library/CommonForms/frmlogin.vb` (credentials)
- `frmLogoutNew.SaveLog` in CommonLibrary.dll (attendance, run right after login)
- `frmLogoutNew` (the work report shown on logout)
- `Frmlibmain.vb` (the Exit, Login & Log Out and window-close paths)

The DLL sources are decompiled in `../../.legacy-decompiled/CommonLibrary/`.

Menus: Master › Exit (Ctrl+Q), Employee › Login & Log Out, and closing the program
(Logout on the web).

## Tables

| Table             | Key                           | Written by                                                               |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `Usecurity`       | `tid` (identity)              | read only here                                                           |
| `log`             | `logID` (max+1, not identity) | login (insert or `LastLoginTime`), logout (`logouttime`, `totallogtime`) |
| `work`            | `workID` (max+1)              | work report save (delete + reinsert for the log)                         |
| `LeaveM`          | `LeaveMKm` (identity)         | leave forced at login                                                    |
| `DataEditingInfo` | —                             | all of the user's rows deleted at login and on close                     |

## Login (frmlogin.vb)

- Empty user name → "Please Enter User Name". Empty password (after trim) → "Please Enter Password".
- `uname = @u` (case-insensitive SQL collation) and `upwd = enc(password.Trim)`, active
  users only.
  - No match → "Please Enter Current Username And Password".
  - A case-insensitive match that isn't exact → "Invalid User Name Or Password".
- `enc()` adds 128 to each character code. `upwd` is varchar (code page 1252).
- The Left arrow key in User Name clears it. Enter = Login.

## Attendance at the first login of the day (SaveLog)

This is skipped for admins and users 100, 103 and 118. A working day is not a Sunday and
not in `HolidayM`.

- **Absent:**
  - Condition: the last `log` date is before the last working day, and no `LeaveM` row
    covers the first missed day.
  - The user must file a leave from the first missed working day to the last working day,
    choosing any `LeaveType`.
  - `TotalDays` counts the working days in that range.
- **Short hours:**
  - Condition: on the last logged day, `WorkingHours` (default 08:00) minus `totallogtime`
    is more than 30 minutes.
  - Only LC or EG may be chosen. A reason is required. `DiffHr` is that difference.
- **Saving the leave:** `LeaveM` is saved with status "Leave Without Approval".
  - Messages: "Please SELECT LeaveType", "Please Enter Reason".
  - Cancelling the dialog cancels the login.
- **Today's `log` row:** created (max+1), or `LastLoginTime` updated. The user's
  `DataEditingInfo` rows are deleted.
- **Last login message:** "Last LogIn Date / Last LogIn Time / Current LogIn Time". The date
  is shown as dd/MM/yyyy.
- **Pending work reports:** only for users with add, modify and delete rights, who are not
  admin and not an exempt user.
  - A pending day is a past `log` day whose reported work time is more than 15 minutes
    less than its logged time.
  - For each pending day, the user is asked "Do You Want to Fill the Work Report?" (title
    "Your Work Report on: (dd-MM-yyyy) is Pending").
  - Yes opens that day's report.
  - No continues if 2 or fewer days are pending; otherwise the program exits.
  - Closing the report without saving continues into the program.

## Work report (frmLogoutNew)

- **Rows:** from the `GetWorkDetail` procedure, ported in `WorkLogService.rows()` and
  pinned by `apps/api/test/get-work-detail.parity.test.ts`.
  - Automatic rows come from `WorkReportM`. Their Qty and MistakeCount are read-only.
  - Manual rows are added with New. Their Qty can be edited.
- **F2 lookups:**
  - Vibhag: from `ApprisalStandard`, with `IsManualEntry` matching the row; a `BookT` row
    is limited to "BookT Entry"; filtered by the row's work type when one is set.
  - Work Type: manual rows only.
- **Validation (text kept verbatim):**
  - "Please Select Hrs/Min At Line n" (automatic rows only).
  - "Please Select Vibhag / Work Type At Line n".
  - "Total Work Time cannot be Greater than / Less than : HH:mm". The reported time must lie
    between the logged time and 5 minutes less than it.
- **Save & Logout:** in one transaction, delete the day's `work` rows, insert every row
  that has time, and set `logouttime` and `totallogtime`. For a pending day, its stored
  logout time is kept.
  - Today's report then asks "Continue LibProgram?".
- **Report:** only for user types Admin (1) and AMaster (5). Pick a user and a date to
  open that day read-only.

## Who gets the work report

| Path                       | Condition                                      |
| -------------------------- | ---------------------------------------------- |
| Employee › Login & Log Out | add + modify + delete rights (admins included) |
| Master › Exit (Ctrl+Q)     | the above, and not admin                       |
| Closing the program        | the above, and not user 103 or 118             |

Closing the report without saving still stamps the logout time.

## Deliberate differences from the desktop

- The minutes total carries at 60. The desktop subtracts 59, over-counting a minute per carry.
- "Continue LibProgram?" → **No** ends the session. On the desktop the answer had no effect
  from Exit or the Login & Log Out menu.
- `GetWorkDetail`'s lookup in `[DBCoding]` is dropped. Its result was unused, and the
  database isn't on every server.
- Remarks are stored as Unicode. The desktop's un-prefixed string literal turned Gujarati
  into "?".
- Added (the desktop had none):
  - Login rate limiting: 5 failures per user and IP in 15 minutes.
  - A server-side check that users only change their own report.
  - Parameterised SQL.
- The desktop's automatic program-update step (`CopyExe`, `IsValidProgramVersion`) and the
  hidden "User Login / User Logout" buttons are not ported.
