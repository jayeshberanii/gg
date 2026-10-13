# Leaves (`LeaveM`)

Desktop form: `GGLibrarySolution/Library/Employee/frmLeaveM.vb` (+ `.Designer.vb`, title
"Leave Master", `Inherits Library.frmMasterPage`), repository
`Library.BusinessContract/Concrete/LeaveMRepository.vb`, entity `Library.Entity/EntLeaveM.vb`.
Menu: Employee › Leaves (`LeavesToolStripMenuItem`). The item has no visibility rule, so every
logged-in user can open it. Rights are decided inside the form (see Permissions).

The login flow (`frmLogoutNew.SaveLog`, ported as `apps/api/src/attendance/attendance.service.ts`)
also writes to `LeaveM`. See "Overlap with attendance" below.

## Table and key

- Table `LeaveM`, PK `LeaveMKm` (int IDENTITY, read back with `SELECT @@identity`). The form's
  PrimaryColumn is spelt `"LeaveMkm"`.
- The table has about 28k rows. Statuses: 26,224 Leave Without Approval, 1,684 Approved,
  65 Rejected, 6 Pending, 3 with status 0.
- No `Locked` column, so Ctrl+L / Ctrl+U fail on the desktop (`lockable: false`). No triggers.
- Audit columns: `enuser` + `endate` (`getdate()`) on insert, and `moduser` + `moddate` (date) on
  update. `lblEntry` shows `clsCom.GetEntryUser` on row click (`entryLabel: true`).

| Column          | Type          | Notes                                                                                                              |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Employeekt`    | int           | → `Usecurity.tid`, shown as `EmployeeName` (= `uname`)                                                             |
| `LeaveFromDate` | date          |                                                                                                                    |
| `LeaveToDate`   | date          |                                                                                                                    |
| `Reason`        | nvarchar(150) |                                                                                                                    |
| `TotalDays`     | int           |                                                                                                                    |
| `LeaveStatuskt` | int           | → columnmaster `LeaveStatus`, shown as `LeaveStatusName`                                                           |
| `ApprovedBykt`  | int           | → Usecurity, shown as `ApprovedByName`. The form writes **-1** when nobody approved; the login flow leaves it NULL |
| `ApprovedDate`  | datetime      | NULL unless the mask is complete                                                                                   |
| `Comment`       | nvarchar(150) |                                                                                                                    |
| `LeaveTypekt`   | int           | → columnmaster `LeaveType`, shown as `LeaveTypeName`                                                               |
| `DiffHr`        | time          | hours:minutes, for LC/EG                                                                                           |

columnmaster values used by name (the code always looks them up by `Vibhag` + `Name`, never by id):

- **LeaveStatus:** 9655 `Leave Without Approval`, 9656 `Pending`, 9657 `Approved`, 9658 `Rejected`.
- **LeaveType** (ColumnNo):
  - Marriage 1, Medical 2, Death 3, Outstation 4, Religious 5, Exam 6, Personal 7
  - SPL 20 ("मात्र Ladies Member ज …")
  - "संस्थानां काम माटे बहारगाम" 21
  - LC 101, EG 102, LC EG 103, PG 104

## Fields

Layout: `SplitContainer1.Panel1` (horizontal split, SplitterDistance 186, ClientSize 1012×708).
Text boxes and labels use Times New Roman 14.25 and 29 px high boxes. The DateTimePickers use the
default font, 24 px high. Hour/Minute and their labels use Bookman Old Style 10.2.

| Label (x,y)            | Control (x,y / w)                                                                | Column           | TabIdx | Rules                                                                                                                                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- | ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requested By (13,22)   | `txtEmployeekt` (136,18 / 227)                                                   | `Employeekt`     | 0      | F2 `select tid,Employee_Name from Usecurity where tid>0 and IsActive=1 ORDER BY uname` (any user may pick anyone). New fills Tag = current user and Text = `SELECT UName FROM USecurity WHERE Tid=<me>`. After an F2 pick the box shows `Employee_Name`, but loaded rows show `uname`. Harmless |
| Leave From (13,62)     | `dtpLeaveFromDate` (136,58 / 227), `dd-MM-yyyy`                                  | `LeaveFromDate`  | 1      | New = tomorrow                                                                                                                                                                                                                                                                                  |
| Leave To (13,102)      | `dtpLeaveToDate` (136,98 / 227), `dd-MM-yyyy`                                    | `LeaveToDate`    | 2      | New = tomorrow                                                                                                                                                                                                                                                                                  |
| Leave Type (13,142)    | `txtLeaveTypekt` (136,138 / 227)                                                 | `LeaveTypekt`    | 3      | F2 `select ColumnMastkm,Name,Brief from columnmaster where ColumnNo<100 and Vibhag='LeaveType' ORDER BY ColumnNo`. **LC/EG/LC EG/PG (ColumnNo ≥ 100) are not offered here**; only the login flow creates them. Its `Leave` handler: see Derived values                                          |
| Reason (370,142)       | `txtReason` (502,138 / 195)                                                      | `Reason`         | 4      | no F2 (`''`)                                                                                                                                                                                                                                                                                    |
| Approved By (370,22)   | `txtApprovedBykt` (502,18 / 195), **ReadOnly**                                   | `ApprovedBykt`   | 13     | shows `ApprovedByName`                                                                                                                                                                                                                                                                          |
| Approved Date (370,62) | `txtApprovedDate` MaskedTextBox `00/00/0000` (502,58 / 195), **Enabled = False** | `ApprovedDate`   | 14     | shown as `dd-MM-yyyy`                                                                                                                                                                                                                                                                           |
| Comment (370,102)      | `txtComment` (502,98 / 500), **Enabled = False**                                 | `Comment`        | 15     | Nothing ever enables it. It is effectively read-only and re-saved as loaded (trimmed). The F2 list `select Comment from LeaveM … group by Comment` is unreachable                                                                                                                               |
| Leave Status (715,22)  | `txtLeaveStatuskt` (844,18 / 158), **Enabled = False**                           | `LeaveStatuskt`  | 16     | Set by code only                                                                                                                                                                                                                                                                                |
| Total Days (715,62)    | `txtTotalDays` (844,58 / 158), **Enabled = False**                               | `TotalDays`      | 17     | Set by code only. New = `1` (hard-coded)                                                                                                                                                                                                                                                        |
| Hour (848,142)         | `cmbHour` (789,139 / 55), DropDownList, **Enabled = False**                      | `DiffHr` hours   | 20     | items `00`…`07`                                                                                                                                                                                                                                                                                 |
| Minute (942,141)       | `cmbMinute` (892,139 / 47), DropDownList, **Enabled = False**                    | `DiffHr` minutes | 22     | items `00,05,…,55`                                                                                                                                                                                                                                                                              |

- **Hour/Minute:** enabled only after leaving Leave Type with text `eg` or `lc` (trimmed, any
  case), which the F2 list never offers. So on this form they are effectively always disabled. They
  still save whatever they show: FillData loads `DiffHr.Substring(0,2)/(3,2)`, and New does not
  clear them.
- **New** (`NewEntry`) also disables Approved By, Approved Date and Comment. They stay disabled for
  the rest of the form's life.

## Validation

1. **btnSave** asks `"Are You Sure to Save This Record?"` **first**, then calls `Save()`. The
   Approve and Reject menu items call `Save()` directly after their own confirm.
2. **Before validating, `Save()` applies the SPL rule:** when `LeaveTypekt` is SPL, the status
   becomes **Approved**.
3. **`GetValidationMessage`**, in order:
   1. `"Please Enter Employee Name"` when `Employeekt = 0`.
   2. `"LeaveFrom Date Cannot be Greater Then LeaveTo Date"` when From > To.
   3. `"Please Enter Leave Type"` when `LeaveTypekt = 0`.
   4. `"Leave Already Applied By - " & <name>`, where `<name>` comes from
      `SELECT ISNULL(Usecurity.Employee_Name,'') FROM LeaveM INNER JOIN Usecurity ON LeaveM.enuser=Usecurity.tid WHERE LeaveMKm<><id> AND Employeekt=<emp> AND LeaveFromDate>='<from MM/dd/yyyy>' AND LeaveToDate<='<to MM/dd/yyyy>'`.
      - This is **not an overlap test**. It only finds another leave of the same employee lying
        entirely inside the new range.
      - The name is the **entering user's** Employee_Name (`enuser`), not the employee's.
      - Keep it as is; parameterise the dates.

## F2 lookups

The generic handler is the same as Employee Master's: tblSearch `LeaveM` by box name, with
`DisplayListForm(..., boolSelectFirst=True)`.

| Box                                            | Source                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Employeekt                                     | `select tid,Employee_Name from Usecurity where tid>0 and IsActive=1 ORDER BY uname`                            |
| LeaveTypekt                                    | `select ColumnMastkm,Name,Brief from columnmaster where ColumnNo<100 and Vibhag='LeaveType' ORDER BY ColumnNo` |
| Reason, ApprovedBykt, LeaveStatuskt, TotalDays | `''` (nothing happens)                                                                                         |
| Comment                                        | its list exists but the box is disabled                                                                        |

## Grid columns

The grid uses fixed Designer columns, bound in `FillList` (`RowHeadersVisible = False`) over the
usual `ListGridData`, i.e. GetDataTable over the tblSearch `LeaveM` columns.

| #   | Header        | Width  | Bound to          | Format                                                                             |
| --- | ------------- | ------ | ----------------- | ---------------------------------------------------------------------------------- |
| 0   | Id            | **5**  | `LeaveMKm`        | (effectively hidden)                                                               |
| 1   | Employeekt    | (none) | `EmployeeKt`      | Visible = False                                                                    |
| 2   | Employee Name | 120    | `EmployeeName`    |                                                                                    |
| 3   | Leave From    | 130    | `LeaveFromDate`   | `dd-MM-yyyy`                                                                       |
| 4   | Leave To      | 130    | `LeaveToDate`     | `dd-MM-yyyy`                                                                       |
| 5   | Total Days    | 120    | `TotalDays`       |                                                                                    |
| 6   | Leave Status  | 120    | `LeaveStatusName` |                                                                                    |
| 7   | Leave Type    | 120    | `LeaveTypeName`   |                                                                                    |
| 8   | DiffHrs       | 90     | `DiffHr`          | `HH:mm` (on a TimeSpan; see how outsider-master's Work Time `time` column renders) |
| 9   | Approved By   | 100    | `ApprovedByName`  |                                                                                    |
| 10  | Approved Date | 125    | `ApprovedDate`    | `dd-MM-yyyy HH:mm:ss`                                                              |
| 11  | Comment       | 120    | `Comment`         |                                                                                    |
| 12  | EnDate        | 100    | `EnDate`          | `dd-MM-yyyy`                                                                       |

- **Filter:** `DefaultCond` (below) & any utility condition. Order: the engine's usual newest first.
- **Search:** `UcSearch1.LoadData(..., DefaultCond)` fills the Search By combo for everyone.
- **No first-row load:** unlike Employee Master, FillList does **not** call `dgMain_Click`, so the
  form opens with the grid filled but the boxes empty (TranKm 0) until a row is clicked. On an
  empty grid it starts in New.
- **tblSearch `LeaveM`:** 13 rows, all `IsSearchable = 1`, none `IsPrintable`. Print Selected
  Column therefore has no columns.
- **No `Config_Master` layouts:** `Config_Master` has no rows with ConfigType `LeaveM`.

## Derived values

**TotalDays and Status** (`GetTotalDays()` in the form):

- It runs only while `boolChangeDate` is True. That flag is set by `Enter` on either date picker,
  or just before the Leave Type `Leave` handler calls it. Each call resets it to False.
- When it runs:
  - **TotalDays** is `0` when the Leave Type text is `eg`/`lc`. Otherwise it is
    `LeaveMRepository.GetTotalDays(from, to)`: every day from..to that is not a Sunday and has no
    `HolidayM` row (`SELECT COUNT(*) FROM HolidayM WHERE HolidayDate='MM-dd-yyyy'`, one query per
    day). It is 0 when from > to. This is exactly `countWorkingDays(from, to, holidaysBetween(...))`.
  - **Status:** if `From(midnight) < DateTime.Now`, so **today or earlier**, the status becomes
    **"Leave Without Approval"**. Otherwise (tomorrow or later) it becomes **"Pending"**. The plan's
    "past from-date" should read "from-date today or earlier".
- On a modify by an editor, touching a date therefore **resets an Approved/Rejected status** to
  Pending or Leave Without Approval. Keep.

**Leave Type `Leave` handler:**

- Text `eg`/`lc`: enable Hour/Minute, TotalDays `0`.
- Otherwise: disable Hour/Minute and recompute TotalDays and Status as above.
- "LC EG" is not treated as LC/EG. Harmless.

**Save mapping:**

| Column          | Value                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `LeaveStatuskt` | the status box's Tag, forced to **Approved** when the type is SPL                                                 |
| `ApprovedBykt`  | the Tag, or **-1** when 0                                                                                         |
| `ApprovedDate`  | parsed from the mask `dd/MM/yyyy` when MaskCompleted, else NULL. The UPDATE writes `ApprovedDate=NULL` explicitly |
| `DiffHr`        | `TimeSpan(hour, min, 0)` → `"hh:mm:ss"`, with blank read as 0                                                     |
| `enuser`        | current user (INSERT only), with `endate = getdate()`                                                             |
| `moduser`       | current user (UPDATE only), with `moddate = getdate()`                                                            |

`Reason` and `Comment` are trimmed.

## Child tables saved with the record

None. `dtAddress`, `dtBookmT` and `dtSubscribeT` are declared but never used.

## Right-click menu (`cntMenu` on `dgMain`)

| Item                                  | Visible to                                                                                                                     | Behaviour                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column        | all                                                                                                                            | `PrintSelectedColumn(dgMain,'LeaveM','LeaveMkm')`. There are no printable tblSearch rows, so the list is empty                                                                                                  |
| Print Report › Send To Excel          | all                                                                                                                            | the engine's `sendToExcel` over the grid                                                                                                                                                                        |
| Print Report › **Employee Summary**   | `curr_utypeid = 5` (AMaster) **or tid 41 or tid 5**. Admin user type (1) is **not** included (that condition is commented out) | Summary popup, below                                                                                                                                                                                            |
| Utility › **Approve Leave**           | the same group, **and** the current row's Leave Status is exactly `"Pending"` (the date condition is commented out)            | Confirm `"Are You Sure to Approve Leave?"` → ApprovedBy Tag = me, ApprovedDate = today, status = **Approved** → `Save()` (SPL rule, validation, UPDATE)                                                         |
| Utility › **Reject Leave**            | the same group (any status)                                                                                                    | Confirm `"Are You Sure to Reject Leave?"` → ApprovedBy = me, ApprovedDate = today, status = **Rejected** → `Save()`                                                                                             |
| Utility › Show Leaves Between Dates   | all                                                                                                                            | below                                                                                                                                                                                                           |
| Utility › Show Leave Without Approval | all                                                                                                                            | FillList with `DefaultCond & " AND Employeekt=enuser AND LeaveStatuskt in(select ColumnMastkm from columnmaster where Vibhag='leavestatus' AND Name='Leave Without Approval')"`, then the condition is restored |

**Approve / Reject act on the loaded record**, not the right-clicked row. The visibility test reads
`dgMain.CurrentRow` (a right-click does not move it), but `Save()` uses TranKm and the boxes. Before
any row has been clicked, TranKm is 0, so approving tries an INSERT with an empty employee and fails
with "Please Enter Employee Name". **On the web, run them as server actions on the current row's id.**
The action:

1. Loads the row.
2. Sets `ApprovedBykt = me`, `ApprovedDate = today` (date only), the status, `moduser` and `moddate`.
3. Applies the SPL rule and the validation for parity.

**Show Leaves Between Dates:**

- InputBox `"Please Enter Range in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)"`, defaulting to
  `<today>-<today>` (`dd/MM/yyyy-dd/MM/yyyy`). An empty answer cancels.
- If `Split("-")` does not give 2 parts: `"Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)"`.
- Filter (the SQL takes the dates as `MM/dd/yyyy` strings):
  `DefaultCond & " AND '<to>' >= CAST(LeaveFromDate AS DATE) AND '<from>' <= CAST(LeaveToDate AS DATE)"`.
  That is a true overlap with the range. Parameterise it.
- Malformed dates throw a SQL or substring error, shown in a MsgBox. The web should show the
  "Proper Value" message instead.

**Employee Summary:**

- Same InputBox prompt and error message, defaulting to `01/<MM>/<yyyy>-<today>`.
- It runs five queries, with the dates concatenated as `'" & FromDate & "'` (a culture-formatted
  DateTime: **parameterise them as ISO dates**):
  1. `SELECT L.Employeekt,ISNULL(SUM(L.TotalDays),0) TotalDays FROM LeaveM L INNER JOIN columnmaster C ON L.LeaveTypekt=C.ColumnMastkm AND C.Vibhag='LeaveType' AND c.Name NOT IN('LC','EG') WHERE L.LeaveFromDate>=@from AND L.LeaveToDate<=@to GROUP BY L.Employeekt`
  2. `SELECT L.Employeekt,COUNT(C.Name) TotLCEG,CAST(CAST(SUM(DATEDIFF(MINUTE,'0:00:00',L.DiffHr)) as numeric(10,2))/60 as NUMERIC(10,2)) TotLCEGHrs FROM LeaveM L INNER JOIN columnmaster C ON L.LeaveTypekt=C.ColumnMastkm AND C.Vibhag='LeaveType' AND c.Name IN('LC','EG') WHERE L.LeaveFromDate>=@from AND L.LeaveToDate<=@to GROUP BY L.Employeekt`
  3. `SELECT L.uid AS Employeekt, count(*) TotPGDays,CAST(CAST(SUM(DATEDIFF(MINUTE,'0:00:00',W.worktime)) as numeric(10,2))/60 as NUMERIC(10,2)) TotPGHrs FROM work W INNER JOIN log L ON W.logid=L.logID LEFT JOIN columnmaster CW ON W.worktypeID=CW.ColumnMastkm AND CW.Vibhag='WorkType' LEFT JOIN columnmaster CV ON W.vibhagkt=CV.ColumnMastkm AND CV.Vibhag='Vibhag' WHERE L.logdate>=@from AND L.logdate<=@to AND (CW.Name='Gap' OR CV.Name='Personal') GROUP BY l.uid`
  4. `WITH PAGING AS (SELECT l.uid AS Employeekt,CAST(CAST(DATEDIFF(MINUTE,'0:00:00',u.WorkingHours) AS NUMERIC(10,2))/60 AS NUMERIC(10,2))*COUNT(*) AS ActualHrs,SUM(CAST(CAST(DATEDIFF(MINUTE,'0:00:00',totallogtime) AS NUMERIC(10,2))/60 AS NUMERIC(10,2))) AS TotalLogTime FROM log l INNER JOIN Usecurity u ON l.uid=u.tid WHERE logdate>=@from AND logdate<=@to and totallogtime is not null GROUP BY u.WorkingHours,l.uid) SELECT Employeekt,ActualHrs,TotalLogTime,(ActualHrs-TotalLogTime) AS ActualGap from PAGING`
  5. The base rows, one per employee who has a leave **inside** the range:
     `SELECT L.Employeekt,U.uname,0 AS 'Tot Leave(In day)',0 AS 'Tot LC/EG(In Day)',0.0 AS 'Tot LC-EG(IN Hrs)',0 AS 'Tot PG(In Days)',0.0 AS 'Tot PG(In Hrs)',0.0 AS 'Total Gap(In Hrs)',0.0 AS 'Actual Hrs',0.0 AS 'Total Logtime',0.0 AS 'Actual Gap(In Hrs)' FROM LeaveM L INNER JOIN Usecurity U ON L.Employeekt=U.tid WHERE l.LeaveFromDate>=@from AND L.LeaveToDate<=@to GROUP by L.Employeekt,U.uname ORDER BY U.uname`
- Each base row is filled from 1–4 by Employeekt. Missing values stay 0.
  `Total Gap(In Hrs) = Tot LC-EG(IN Hrs) + Tot PG(In Hrs)`.
- The result is shown in `CommonLibrary.frmPopup` (WindowState Normal). The columns are
  `Employeekt`, `uname` and the nine headed above, exactly as named.
- On the web: an action returning `{ kind: 'table' }` → `PopupTableDialog`. It is a read-only
  report. No `.rpt` is involved.

## Toolbar

The toolbar is frmMasterPage's standard set.

- **Delete:** shows `"Delete Facility is not Available"` and does nothing. The real delete is
  commented out. Keep the button and the message.
- **Copy:** disabled at load. Mode 2 (after a Save or Cancel) enables it. "Do You Want to Add More
  With Copying Data?" → TranKm 0 / Add, so the next Save inserts a duplicate. That duplicate is
  normally stopped by "Leave Already Applied By - …".
- **Work Report button:** disabled at load and enabled by mode 2. It opens the generic WorkReport
  popup.
- **Work report log:** none. `Save()` never calls `insertworkreports`, so set `workReport: false`
  or log nothing.
- **Cancel:** for editors (below), mode 2 (unlock). Otherwise the Locked toolbar.
- **Shortcuts:** the usual set. Ctrl+L/U fail (no Locked column).

## Reports and printing

Employee Summary popup (above), Send To Excel, and an empty Print Selected Column. No `.rpt`.

## Permissions

Uses `curr_utypeid` (UserTypeKt) and hard-coded tids. `IsAdmin` is **not** consulted on this form.

| Rule                                            | Who                                                                                                                                                                       | Code                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Rows listed                                     | UserType 1 (Admin) or 5 (AMaster): every row. Everyone else: `" AND (EmployeeKt=<me> OR enuser=<me>)"`, i.e. their own leaves and the ones they entered for others        | `frmLeaveM_Load`                         |
| New                                             | everyone. The Locked toolbar keeps New enabled, and the user may pick **any** active employee                                                                             | `EnableDisableDataEditing(Locked:=True)` |
| Modify / Save of an existing row, Cancel unlock | **UserType 1, or tid 41, or tid 5**. Everyone else gets the Locked toolbar on row click (New + Refresh only), so they cannot change even their own leave once it is saved | `dgMain_Click`, `btnCancel_Click`        |
| Delete                                          | nobody (message)                                                                                                                                                          | `Delete`                                 |
| Approve, Reject, Employee Summary               | **UserType 5, or tid 41, or tid 5**. So an Admin-type user (1) can edit but not approve. tids 100 and 118 (IsAdmin + AMaster) can approve                                 | `cntMenu_Opening`                        |
| Between Dates, Without Approval, Excel, Print   | everyone, always inside their `DefaultCond`                                                                                                                               | (none)                                   |

Web enforcement (the desktop had only client-side checks):

- `listFilter` = the DefaultCond above. It also applies to record reads.
- `save`:
  - `id > 0` requires UserType 1 or tid 41/5.
  - `id = 0` is allowed for everyone.
  - Do **not** use `writableBy`, since it would block New for everyone else.
- `delete`: always refused with the message.
- Approve/Reject actions: require UserType 5 or tid 41/5, the target row within the user's filter,
  and (for Approve) status Pending.
- Employee Summary action: the same group.

## SQL in form event handlers

- `GetTotalDays` / `NewEntry` / Approve / Reject / `Save`: `SELECT ColumnMastKm FROM ColumnMaster WHERE Vibhag='LeaveStatus' AND Name='Leave Without Approval' | 'Pending' | 'Approved' | 'Rejected'` and `SELECT ColumnMastKm FROM ColumnMaster WHERE Vibhag='LeaveType' AND Name='SPL'`
- `NewEntry`: `SELECT UName FROM USecurity WHERE Tid=<me>`
- `LeaveMRepository.GetTotalDays`: `SELECT COUNT(*) FROM HolidayM WHERE HolidayDate='<MM-dd-yyyy>'`, once per day in the range
- `Txt_KeyDown`: the tblSearch F2 query (as Employee Master's)
- Utility filters, Employee Summary: above
- Load: the `Config_Master` query for `LeaveM` (returns no rows)

## Overlap with attendance (`apps/api/src/attendance/`)

- **`working-days.ts`:** `countWorkingDays(from, to, holidays)` (Sundays and HolidayM excluded,
  both ends included) **is** `LeaveMRepository.GetTotalDays`. With `holidaysBetween(db, from, to)`
  from `db/legacy-sql.ts` it replaces the per-day HolidayM queries. Reuse both as they are.
- **`attendance.service.ts` › `submitLeave`:** the login-time leave. It inserts `LeaveM` with:
  - status `Leave Without Approval`, by the same columnmaster name subquery the form uses
  - `TotalDays = countWorkingDays(...)` for the absent case, `0` for short hours
  - `enuser = self`, `endate = GETDATE()`, `DiffHr`
  - `ApprovedBykt` **NULL**, where the form writes -1
  - leave types: all `LeaveType` rows (short hours: LC/EG only), where the form's F2 has
    `ColumnNo<100`

  So rows the form edits may have come from login, with types (LC/EG/PG) the form's F2 cannot
  choose. The form must still load and save them with the type unchanged (the Tag survives).

- **`leaveRequirement`:** checks `LeaveM` coverage of the first missed day
  (`LeaveFromDate <= d AND LeaveToDate >= d`) to decide whether login must ask for a leave. A leave
  entered here in advance therefore suppresses the login prompt. Nothing to change; just don't
  break it.
- **Suggested shared helper:** a small `leave-common.ts` (`leaveStatusId(db, name)`,
  `isLcEg(typeName)`, the TotalDays rule) used by both `attendance.service.ts` and the Leaves
  screen definition, so the status names and the TotalDays rule live in one place.

## Desktop bugs

Data-corrupting, or throws (**fix on the web**):

1. **TotalDays and Status go stale.** `boolChangeDate` lets only the _first_ date change after
   entering a picker recompute, so further keyboard changes in the same picker leave TotalDays wrong
   in the saved row. New also starts with TotalDays `1` regardless of Sundays and holidays. Fix:
   recompute on every user change of From, To or Type, and recompute on the server in `save` when
   the dates or type differ from the stored row: 0 for LC/EG, else `countWorkingDays`. Do not
   recompute on a plain load, or on approve/reject.
2. **Approve/Reject before any row click** try to insert a blank leave. Fix: act on the current
   row's id, server-side.
3. **Employee Summary and both utility filters build SQL from culture-formatted date strings.** Fix:
   parameterised ISO dates, and the "Proper Value" message for bad input.
4. **Reject of an SPL leave is saved as Approved**, because the SPL rule runs inside `Save()` after
   Reject sets Rejected. The stored status contradicts the user's action. **Needs the user's
   decision.** Suggested: apply the SPL auto-approve only to ordinary saves, not to Reject.

Harmless quirks (keep):

- **The Comment box is never editable.**
- **Hour/Minute keep the previous row's values on New** and are saved even when disabled. DiffHr is
  only summed for LC/EG, so this does no harm.
- **`ApprovedBykt = -1`** when nobody approved.
- **The Id column is 5 px wide.**
- **The Requested By text differs** after an F2 pick (`Employee_Name` instead of `uname`).
- **"LC EG" is not treated as LC/EG.**
- **The "Leave Already Applied" test is containment, not overlap.**
- **Changing the dates of an approved leave resets its status.**
- **The form opens with nothing selected.**
- **Copy is enabled only after a Save or Cancel.**

## Files / images / disk

None.

## Hard-coded passwords

None. The form's Security dialog is only reached through Ctrl+L/U, which fail anyway. tids 41 and 5
are hard-coded user ids: keep them as named constants.

## Implementation hints

- **`ScreenDefinition`:**
  - `table: 'LeaveM'`, `primaryColumn: 'LeaveMKm'`, `lockable: false`, `entryLabel: true`,
    no `workReport`.
  - `listFilter` as above.
  - `validate` with the four messages (the containment check needs the db, so do it in `save` or
    give `validate` a db).
  - `save` with the SPL rule, TotalDays/status, -1, the audit columns and the permission check.
  - `deleteRecord` throwing "Delete Facility is not Available" (or a client-side message only).
  - `newDefaults`: the Employee pair = self, From = To = tomorrow, TotalDays 1 (or computed, per
    bug 1), status Pending.
- **Client:**
  - Leave Type `onLeave` → server call for TotalDays/status (or compute client-side with a
    holidays fetch).
  - Hour/Minute as the DropDownList fields with the Designer items.
  - Approved By, Approved Date, Comment, Status and Total Days disabled.
- **Actions:**
  - `approve`, `reject`: per-row via `contextMenu(actions)` with `actions.currentRow`, visible by
    user group and `LeaveStatusName === 'Pending'`.
  - `betweenDates`, `withoutApproval`: list switches through `listWhere` / `params`. They need an
    InputBox-style prompt.
  - `employeeSummary` → `{ kind: 'table' }`.
- **Engine gaps:**
  1. "Insert allowed for all, update only for some": a per-row Locked toolbar, decided by user,
     with New still enabled. `writableBy` is all-or-nothing today.
  2. Context menu items visible per user **and** per row. `contextMenu` receives `ScreenActions`
     with `currentRow`, so this is probably covered without engine changes.
  3. A text InputBox prompt for an action's parameter (date range), with the desktop's default
     text.
  4. The form does not auto-select the first row at load (a `selectFirstOnLoad: false` flag), if
     we keep that quirk.
- **Tests:**
  - An operator sees only `Employeekt = self OR enuser = self` rows, can insert, and gets 403 on
    update and on approve.
  - UserType 1 can update but not approve.
  - tid 41 can approve, and Approve sets ApprovedBykt, ApprovedDate and status.
  - SPL saves as Approved.
  - A from-date of today gives Leave Without Approval; tomorrow gives Pending.
  - TotalDays skips Sundays and HolidayM; LC/EG give 0.
  - The containment message names the entering user.
  - Delete is refused.
  - Employee Summary totals for a fixture range.

## Web port (2026-10-06)

Ported as `apps/api/src/master/screens/leaves.ts` + `apps/web/src/screens/LeavesMaster.tsx`.
Shared pieces: `packages/shared/src/leaves.ts` (`seesAllLeaves`, `canEditLeave`,
`canApproveLeave`, `LEAVE_SPECIAL_IDS = [41, 5]`, `LeaveStatus`, `isLcEgLeaveType`,
`leaveStatusFor`) and `apps/api/src/attendance/leave-common.ts` (`leaveStatusIdSql`,
`leaveStatusId`, `leaveTypeId`, `leaveTotalDays` over `countWorkingDays` + `holidaysBetween`).
`attendance.service.ts` now takes its status subquery from `leave-common.ts`; its behaviour is
unchanged. Tests: `apps/api/test/master-leaves.integration.test.ts`,
`packages/shared/src/leaves.test.ts`, `apps/web/e2e/batch-b.spec.ts` (Leaves tests).

### Server-side rules (the desktop only enabled/disabled controls)

- `listFilter` = DefaultCond (`Employeekt = me OR enuser = me` unless user type 1 / 5) with
  `enforceListFilter`, so record, entry label, work report, edit lock, save and the list actions
  all stay inside it.
- `recordWritableBy`: add for everyone; edit (save of an existing row, edit lock) and delete only
  for `canEditLeave` (type 1, tids 41 / 5). Delete then always fails with "Delete Facility is not
  Available"; the web's Delete button shows that message without calling the API.
- `approve` / `reject` actions: `canApproveLeave` (type 5, tids 41 / 5), the row must be inside
  the user's DefaultCond, Approve needs status exactly `Pending`; then the four validation rules
  run on the stored row (parity), a record lock held by another user refuses (409), and the
  UPDATE sets ApprovedBykt = me, ApprovedDate = today (date only), the status, moduser, moddate.
  They act on the right-clicked row (decision), not on whatever the boxes hold.
- `employee-summary`: `canApproveLeave` only; parameterised ISO dates; not limited by DefaultCond
  (as on the desktop). Shown in `PopupTableDialog`.
- `between-dates` / `without-approval`: list actions inside DefaultCond; bad range text gives the
  "Proper Value" message (400).

### Decisions applied (remaining-screens-decisions.md › leaves)

- **Bug 4:** Reject of an SPL leave stays Rejected; the SPL auto-approve applies to ordinary saves
  only (and Approve sets Approved anyway).
- **Bug 1 (TotalDays / Status):** the web boxes recompute on every user change of From, To or
  Leave Type (server list `total-days`). On save the server recomputes **TotalDays every time**
  from the dates and type being saved (0 for LC/EG). The **status** is recomputed on an add and
  when the dates or the type changed, so editing only the Reason of an approved leave keeps it
  approved. If "always recompute" was meant for the status too, change `changed` in `save`.
- Containment check kept (not an overlap test), dates parameterised, entering user's
  Employee_Name in the message (an entering user without Employee_Name blocks nothing, as on the
  desktop).

### Engine additions (opt-in)

- `ScreenDefinition.newDefaults(db, user)`: the signed-in user is passed (Requested By = me).
- Web `startNew`: a default named like a `kt` field sets its Tag, one named like its
  `nameColumn` sets its text.
- Web `ScreenSpec.modifyBy`: Modify / Copy / Delete of a saved record for these users only, New
  for everyone (the Locked toolbar).
- Web `FieldSpec.onUserChange` (DateTimePicker / DropDownList ValueChanged) and grid format
  `datetime` (`dd-MM-yyyy HH:mm:ss`).

### Differences kept small or not ported

- Approved By / Approved Date / Comment are saved as stored (ApprovedBykt NULL → -1, as the form
  writes it); ApprovedDate is not truncated to its date on an ordinary save.
- Hour / Minute are enabled only for a loaded LC / EG row (`DiffHrLocked` from recordExtras);
  they clear on New (the desktop kept the previous row's values, harmless). Their font follows the
  engine's DropDownList style, not Bookman Old Style 10.2.
- Tabbing through Leave Type without changing it no longer recomputes the status.
- A non-editor keeps Modify disabled even right after saving a new leave (the desktop's mode 2
  briefly enabled it; the API would refuse the edit anyway).
