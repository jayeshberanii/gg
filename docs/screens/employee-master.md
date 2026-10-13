# Employee Master (`Usecurity`)

Desktop form: `GGLibrarySolution/Library/Employee/frmEmployeeNew.vb` (+ `.Designer.vb`, title
"Employee Master", `Inherits Library.frmMasterPage`), repository
`Library.BusinessContract/Concrete/USecurityRepository.vb`, entity
`Library.Entity/EntUSecurity.vb` (`EntUsecurity` + `EntEmpReportingT`).
Menu: Employee › Employee Master (`NewEmployeeToolStripMenuItem`). The menu item has no visibility
rule, so **every logged-in user can open it**. All access control is row-level and per-field, inside
the form (see Permissions). `Employee_Detail.vb` / `frmEmployee` are the old screens and are not
live.

This is the login table. Treat everything here as security-sensitive.

## Table and key

- Table `Usecurity`, PK `tid` (int IDENTITY; the form's PrimaryColumn is `"Tid"`). The new id comes
  from `SELECT @@identity`.
- No `Locked` column, so the form's Ctrl+L / Ctrl+U would fail on the desktop (`lockable: false`).
- No triggers on `Usecurity`, `EmpReportingT` or `LeaveM`.
- Audit columns: `Createdby` (bigint) + `createdon` (date, `getdate()`) on insert, and `updatedby` +
  `updatedon` on update. There are no `enuser`/`endate` columns. `Endate` (datetime) exists but the
  form never writes it.
- Columns the form never writes: `Modrem`, `Endate`, `UserKt`, `Shortname`, `IsDeveloper`, and
  **`IsAdmin`**. `IsAdmin` is what `IsAdminLogin` reads at login (`frmlogin.vb:95`). It can only be
  set in the database, never from this screen.
- `upwd` is varchar(50), code page 1252, holding `enc(password)` (each char + 128). Read it as
  `CONVERT(varbinary, upwd)` and decode it with `decodeLegacyPassword`, as `auth.service.ts` does.
  Write it with `encodeLegacyPassword`.

## Fields

Layout: everything sits in `SplitContainer1.Panel1` (horizontal split, SplitterDistance 291, form
ClientSize 1012×708). Labels and boxes use Times New Roman 14.25, labels are right-aligned
(MiddleRight), and each box is 29 px high. The values below are Designer Location (x,y) / Size (w).
In the table, "TabIdx" is the Designer TabIndex.

| Label (x,y)                                  | Control (x,y / w)                                            | Column                                           | TabIdx   | Notes                                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee Name (13,18)                        | `txtEmployee_Name` (149,18 / 163)                            | `Employee_Name` nvarchar(50)                     | 109      | F2 = distinct earlier values                                                                                                                                                                                        |
| User Name (13,59)                            | `txtuname` (149,58 / 163)                                    | `uname` varchar(50)                              | 57       | required. **No uniqueness check** (the DB already has duplicates: `guest`×14, `mukesh`×4, …)                                                                                                                        |
| Password (13,100)                            | `txtupwd` (149,98 / 146), PasswordChar `*`                   | `upwd`                                           | 59       | Saved as `enc(Trim(text))`. An empty password is allowed                                                                                                                                                            |
| (none)                                       | `chkShowPassword` (297,107 / 15×14), no text                 | (none)                                           | 167      | Toggles PasswordChar between `*` and none. Visibility rule in Permissions                                                                                                                                           |
| Birth Date (13,141)                          | `dtpDOB` (149,138 / 163), `dd-MM-yyyy`                       | `DOB` date                                       | 161      | Always holds a date (see Bugs)                                                                                                                                                                                      |
| Joining Date (13,182)                        | `dtpDOJ` (149,178 / 163), `dd-MM-yyyy`                       | `DOJ` date                                       | 162      | Same                                                                                                                                                                                                                |
| Reference Name (13,223)                      | `txtRefnm` (149,218 / 163)                                   | `Refnm` nvarchar(50)                             | 65       | F2 = distinct earlier values                                                                                                                                                                                        |
| User Type (13,263)                           | `txtUserTypeKt` (149,258 / 163)                              | `UserTypeKt` int → `UserTypeName`                | 174      | F2 `SELECT UserTypekm,UserType FROM UserTypeMaster ORDER BY UserType` (1 Admin, 2 Master, 3 Operator, 4 Guest, 5 AMaster, 6 Library). Enabled only for IsAdmin or AMaster                                           |
| Address (329,18)                             | `txtAddress` (424,18 / 157)                                  | `Address` nvarchar(150)                          | 73       | F2 distinct                                                                                                                                                                                                         |
| Area (329,59)                                | `txtArea` (424,58 / 157)                                     | `Area`                                           | 75       | F2 distinct                                                                                                                                                                                                         |
| City/Pin (329,100)                           | `txtcity` (424,98 / 92) + `txtPincode` (517,98 / 64)         | `city`, `Pincode`                                | 77 / 163 | F2 distinct (both)                                                                                                                                                                                                  |
| Phoneno (329,141)                            | `txtPhoneno` (424,138 / 157)                                 | `Phoneno`                                        | 80       | F2 distinct                                                                                                                                                                                                         |
| Mobileno (329,182)                           | `txtMobileNo` (424,178 / 157)                                | `Mobileno`                                       | 168      | F2 distinct (tblSearch `Mobileno`, matched case-insensitively). No 10-digit check                                                                                                                                   |
| Email (329,223)                              | `txtEmailID` (424,218 / 157)                                 | `EmailID`                                        | 84       | F2 distinct                                                                                                                                                                                                         |
| IP Address (329,263)                         | `txtIPAddress` (424,258 / 157)                               | `IPAddress` varchar(50)                          | 176      | F2 distinct                                                                                                                                                                                                         |
| Vibhag (593,18)                              | `txtvibhagkt` (703,18 / 134)                                 | `vibhagkt` decimal → `VibhagName` (columnmaster) | 92       | **F2 does nothing**: the tblSearch `F2EntryText` is `''` and `DisplayListForm('')` returns at once. The box shows the loaded name and keeps the loaded Tag, so Vibhag cannot be changed here (only 2 rows have one) |
| Grading (593,59)                             | `txtGrading` (703,58 / 134)                                  | `Grading`                                        | 94       | F2 distinct                                                                                                                                                                                                         |
| Working Hrs (593,100)                        | `txtWorkingHours` MaskedTextBox, Mask `90:00` (703,98 / 134) | `WorkingHours` time                              | 164      | Required (MaskCompleted). FillData pads a 4-char value with `"0"`. Enabled only for privileged users (below); btnNew re-enables it                                                                                  |
| Salary (593,141)                             | `txtper_hor_amount` (703,138 / 134)                          | `per_hor_amount` float                           | 98       | `Val(text)` into an **Integer** entity property (rounds; no fractional rows exist). F2 `''` → nothing                                                                                                               |
| Remark (593,182)                             | `txtRemark` (703,179 / 134)                                  | `Remark` nvarchar(500)                           | 170      | F2 distinct                                                                                                                                                                                                         |
| Reporting To (593,223)                       | `txtReportingToTran` (703,218 / 134)                         | child `EmpReportingT`                            | 172      | F2 opens the popup (see Child tables). Enabled only for IsAdmin or AMaster                                                                                                                                          |
| Leaving Date (593,253)                       | `dtpDOL` (703,249 / 134), **Visible = False** (and `lblDOL`) | `DOL` date                                       | 166      | Never shown. Saved only when Active is unchecked (see Bugs)                                                                                                                                                         |
| (checkbox) Add                               | `chkAdd` (842,17), Checked                                   | `uadd` bit                                       | 158      | Default checked                                                                                                                                                                                                     |
| (checkbox) Modify                            | `chkModify` (920,17), Checked                                | `umodify` bit                                    | 159      | Default checked                                                                                                                                                                                                     |
| (checkbox) Delete                            | `chkdelete` (842,58), Checked                                | `udel` bit                                       | 160      | Default checked                                                                                                                                                                                                     |
| (checkbox) Active                            | `chkIsActive` (918,61), Checked, **Enabled = False**         | `IsActive` bit                                   | 157      | Enabled on row click only for privileged users                                                                                                                                                                      |
| GroupBox "Empolyee Photo" (856,93 / 141×159) | `PicImage` + `btnUpload` "Upload"                            | `Image`                                          | (none)   | **Dead UI**: no handler anywhere. Skip it on the web (no desktop-only message needed)                                                                                                                               |

Not on the form, but written on every save:

- `uview` is always `False`, because `Ent.uview` is never set.
- `Image` is the literal string `'Null'`: `IIf(Ent.Image = Nothing, "Null", …)`. 181 of 189 rows
  hold `'Null'`.

`uadd`/`umodify`/`udel` decide only whether the user must file a work report at logout
(`Frmlibmain_FormClosing`). They are not per-screen rights.

`txtUplevelkt` in `Txt_KeyDown` matches no control (dead code).

## Validation

In `Save()`, in this order:

1. `"Please Enter Working Hours"` when `txtWorkingHours.MaskCompleted = False`. The form then
   focuses the box. This runs **before** the confirm.
2. Confirm `"Are You Sure to Save This Record?"` (Yes/No).
3. `GetValidationMessage`: `"Please Enter User Name"` when `uname = ""`. There is no other rule.

## F2 lookups

Generic handler: `select F2EntryText, AddTableInfo from tblSearch where TransactionName='Usecurity'
and ColumnName in (<box name minus 'txt'>, <same minus 'Name'>)`, then `DisplayListForm(box, F2EntryText,
…, boolSelectFirst=True, AddTableInfo)`.

| Box                                                                                                        | Source                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Employee_Name, Address, Area, city, Pincode, Phoneno, MobileNo, EmailID, Grading, Refnm, Remark, IPAddress | `select <col> from Usecurity where isnull(<col>,'')<>'' group by <col> order by <col>` |
| UserTypeKt                                                                                                 | `SELECT UserTypekm,UserType FROM UserTypeMaster ORDER BY UserType`                     |
| uname, upwd, vibhagkt, per_hor_amount                                                                      | `F2EntryText = ''`, so nothing happens                                                 |
| ReportingToTran                                                                                            | popup frmDisplayTransNew (below)                                                       |
| WorkingHours                                                                                               | MaskedTextBox, not a TextBox: no F2                                                    |

## Grid columns

The grid uses fixed Designer columns (`GvMain`), bound by `DataPropertyName` in `FillList`. The
column set is **not** driven by tblSearch, but the query is the usual `ListGridData` (GetDataTable
over every tblSearch column of `Usecurity`).

| #   | Header        | Width | Bound to                                                                                                                                                                      |
| --- | ------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Id            | 80    | `TId`                                                                                                                                                                         |
| 1   | Employee Name | 130   | `Employee_Name`                                                                                                                                                               |
| 2   | IPAddress     | 125   | `IPAddress`                                                                                                                                                                   |
| 3   | Address       | 100   | `Address`                                                                                                                                                                     |
| 4   | Area          | 100   | `Area`                                                                                                                                                                        |
| 5   | City          | 110   | `City`                                                                                                                                                                        |
| 6   | Pincode       | 120   | `Pincode`                                                                                                                                                                     |
| 7   | PhoneNo       | 120   | `PhoneNo`                                                                                                                                                                     |
| 8   | MobileNo      | 130   | `MobileNo`                                                                                                                                                                    |
| 9   | Email         | 100   | `EmailID`                                                                                                                                                                     |
| 10  | BirthDate     | 100   | `DOB`, `dd-MM-yyyy`                                                                                                                                                           |
| 11  | JoinDate      | 100   | `DOJ`, `dd-MM-yyyy`                                                                                                                                                           |
| 12  | Vibhag        | 100   | **unbound** (its DataPropertyName line is commented out), so blank after FillList. Only `RefreshCurrentGridRecord` fills it (`VibhagName`) after an Edit save. Harmless quirk |
| 13  | Grading       | 100   | `Grading`                                                                                                                                                                     |
| 14  | Reference     | 100   | `Refnm`                                                                                                                                                                       |
| 15  | Salary        | 100   | `per_hor_amount`                                                                                                                                                              |

- **Filter:** `DefaultCond` (the row restriction, below) & `WhereCondition` (default `" AND IsActive=1"`).
- **Order:** the engine's usual newest first.
- **Selection:** FillList calls `dgMain_Click` when there are rows, so the first row is loaded.
  On an empty grid the form starts in New.
- **tblSearch `Usecurity`:** 39 rows, all `IsSearchable = 1`, **including `upwd`**. Every row is
  also `IsPrintable = 1`, again including `upwd`. That puts the encoded password into the search
  box's column list, the GetDataTable result, Print Selected Column and Send To Excel. **The web
  must strip `upwd` from every list, record, search, print and export path.** The only way to read
  it is the gated record field described under Permissions.
- **Search By combo:** `UcSearch1.LoadData(..., boolFillCombo := IsAdminLogin Or tid 5 Or tid 13)`.
  Non-privileged users get an empty Search By combo, so they cannot search.
- **No `Config_Master` layouts:** `Config_Master` has no rows with ConfigType `Usecurity`.

## Derived values

- New id: IDENTITY (`SELECT @@identity`).
- `WorkingHours`: from the mask text (`"hh:mm"`).
- `DOL`: written only when Active is unchecked. The value is `Format(dtpDOL.Value, "MM-dd-yyyy")`
  from the hidden picker. The UPDATE adds `,DOL=@DOL` only then. When the employee is reactivated,
  DOL is **not** cleared. INSERT never writes DOL.

## Child tables saved with the record

`EmpReportingT` (`EmpReportingTKm` IDENTITY, `EmployeeKt`, `ReportingToKt`), edited in a
frmDisplayTransNew popup (TranName `"ReportingTo"`, FormName `"usecurity"`, `SetForm_Usecurity`):

- **Popup rows:** tblSearch `Usecurity` / `ReportingToTran`, Type `T`:
  `SELECT EmployeeKt,EmpReportingT.ReportingToKt,Usecurity.uname As ReportingToName FROM EmpReportingT
INNER JOIN Usecurity ON EmpReportingT.ReportingToKt=Usecurity.tid WHERE EmpReportingT.EmployeeKt IN({Id})`.
  It is loaded the first time F2 is pressed (`FillTransactionDatatable`), with `{Id}` = TranKm.
- **Columns:** `EmployeeKt` and `ReportingToKt` are hidden. A new row is `{Id, 0, ""}`, and an empty
  popup starts with one such row.
- **F2 on the `ReportingToName` cell:** `SELECT tid,uname from usecurity` (all users, including
  inactive), boolSelectFirst. It sets `ReportingToName = uname` and `ReportingToKt = tid`.
- **Text box after OK:** every non-kt/km/id/seq/"cted" cell, joined → `uname1,uname2`.
- **Grid / record text:** tblSearch JoinCondition `(SELECT STUFF((SELECT ',' + u.uname FROM EmpReportingT ER
INNER JOIN Usecurity u ON ER.ReportingToKt=u.tid WHERE ER.EmployeeKt=Usecurity.tid for XML PATH('')),1,1,'')) as ReportingToTran`.
- **Save rule** (in the form, then `DeleteTransaction`, then `Save`):
  - The list of rows is built **only when** the text changed: either a new record with non-empty
    text, or `dtSel.ReportingToTran <> txtReportingToTran.Text`.
  - `DeleteTransaction(tid, text, list)` runs `DELETE FROM EmpReportingT WHERE EmployeeKt=@Id` when
    the text is empty **or** the list is non-empty. For a new record this runs with tid 0, which is
    harmless.
  - `Save` then INSERTs one `EmpReportingT (EmployeeKt, ReportingToKt)` per list row, after the
    Usecurity insert/update. The pattern is delete-insert, keyed by the text changing.
    This matches the engine's `TransSpec` "saved only when the text box no longer reads as loaded"
    (Address).
  - A hand-typed text (without the popup) leaves the list empty: nothing is deleted or inserted,
    so the typed text is lost. Harmless quirk.
- **Copy:** the popup rows are not copied unless the text is edited, because `dtSel` is still the
  source record's. Harmless quirk.

## Right-click menu

| Item                                                                                       | Behaviour                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column                                                             | `clsCom.PrintSelectedColumn(dgMain,'Usecurity','Tid')`, the engine's. **Must not offer `upwd`** (tblSearch marks it printable). The `ReportingToTran` PrintColumn is also broken (`ER.EmployeeKt=u.tid` inside its own alias, so it prints blank or self). Use the JoinCondition version |
| Print Report › Send To Excel                                                               | the engine's `sendToExcel` over the grid columns (no password in the grid)                                                                                                                                                                                                               |
| Utility (visible only to IsAdmin / tid 5 / tid 13, `cntMenu_Opening`) › Show All Employees | FillList with `WhereCondition = ""` (inactive too)                                                                                                                                                                                                                                       |
| Utility › Show Active Employees                                                            | FillList with the default `" AND IsActive=1"`                                                                                                                                                                                                                                            |
| Utility › Show Inactive Employees                                                          | FillList with `" AND IsActive=0"`                                                                                                                                                                                                                                                        |

All three keep `DefaultCond` (the row restriction) and then restore `WhereCondition`. Refresh
resets `DefaultWhereCond` and refills with the current `WhereCondition` (Active).

## Toolbar

The toolbar is frmMasterPage's standard set (New, Save, Modify, Cancel, Copy, Delete, Refresh,
Work Report, Help, Exit, lblEntry).

- **lblEntry:** not set (the line is commented out), so `entryLabel` is off.
- **Copy:** asks "Do You Want to Add More With Copying Data?"; Yes → TranKm 0, Add mode. It is a
  plain re-insert, and the password goes along as typed.
- **Delete:** confirm `"Are You Sure to Delete This Record?"` → `InputBoxProc()` (Security password;
  `SECURITY_PASSWORD`/`_ALT` already in env) → `DELETE FROM EmpReportingT WHERE EmployeeKt=@Id` →
  `CommonRepository.Delete('Usecurity','Tid',id)` → message `"Record Deleted "` (Information) → the
  row leaves the grid.
  - Nothing is checked for use: the user's `log`, `work`, `LeaveM` and `WorkReportM` rows remain,
    and so do other employees' `EmpReportingT` rows that point at this user. Harmless quirk; keep.
- **Work Report button:** disabled at load and after every Save, so it is reachable only after
  Cancel (EnableDisableDataEditing mode 2 re-enables it). It opens the generic WorkReport popup.
- **Work report log:** on **Edit** saves only, `insertworkreports('Usecurity','Tid',id,user,dtSel,dtTmpSel)`
  runs, with `updatedby`/`updatedon` copied from old to new so that they do not count as changes.
  There is no log on Add or Delete (the engine's `workReportOn: { add: false, delete: false }`).
  - **Security bug:** the comparison covers every tblSearch column, `upwd` included. The desktop
    therefore writes old and new **encoded passwords** into `WorkReportM.Mistake/Remark`, and the
    DB already holds such rows, e.g. `upwd(ãð)=1`. The Work Report screen shows these columns.
    The web must drop `upwd` before comparing (`workReportAdjust` can delete it from both rows).
    Cleaning up the existing rows is a separate decision.
- **Edit lock:** Modify writes `DataEditingInfo` as usual (`EnableDisableDataEditing` mode 1). The
  engine already does this.
- **Shortcuts:** the usual Ctrl+N/M/S/B/D/W/R/F/Z/Y set. Ctrl+L/U would fail, because the table
  has no Locked column.

## Reports and printing

No `.rpt`. Printing is Print Selected Column only (tblSearch print columns, minus `upwd`), and
export is Send To Excel.

## Permissions

The desktop has two global flags: `IsAdminLogin` is the `Usecurity.IsAdmin` bit (**not** UserType
1), and `curr_utypeid` is `UserTypeKt`. The DB today has IsAdmin = 1 for tids 4, 97, 100, 104 and 118. tid 5 (vishal) and tid 13 (hardik, inactive) are AMaster (5) with no IsAdmin flag.

**Privileged** below means `IsAdminLogin Or tid = 5 Or tid = 13`.

| Rule                                                | Who                                                                                                                                                                                                                                                                     | Desktop code                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Rows listed                                         | Privileged: every row (then the Active/Inactive switch). Everyone else: `DefaultCond = " AND tid=<me>"`, so only their own row, and only while active                                                                                                                   | `frmEmployeeNew_Load`                           |
| New / Delete / Copy                                 | Privileged only. Disabled for others at load, row click, Cancel and after Save                                                                                                                                                                                          | Load, `dgMain_Click`, `btnCancel_Click`, `Save` |
| Modify / Save on a row                              | Privileged, or the viewer's own row (`curr_lnid = row Id`): normal toolbar. Otherwise `EnableDisableDataEditing(Locked:=True)` (New + Refresh only). Non-privileged users only ever see their own row, so in practice everyone who sees a row may edit it               | `FillData`                                      |
| Working Hrs, Active                                 | Enabled only for privileged users (row click). btnNew re-enables Working Hrs for whoever can press New, i.e. the privileged                                                                                                                                             | `dgMain_Click`, `btnNew_Click`                  |
| User Type, Reporting To                             | Enabled only for `IsAdminLogin Or curr_utypeid = 5 (AMaster)`. **An AMaster who is not privileged (e.g. tids 29, 41, 42, 103) can change their own User Type and Reporting To**, including to Admin (1), which then gives Leaves edit rights and the utype-1 menu rules | Load                                            |
| Add / Modify / Delete checkboxes, every other field | Editable by anyone who can edit the row, including **their own `uadd/umodify/udel`**, which switch off their own logout work-report requirement                                                                                                                         | (no gating)                                     |
| Search By combo, Utility menu                       | Privileged only                                                                                                                                                                                                                                                         | `FillList`, `cntMenu_Opening`                   |
| **Show Password checkbox**                          | Visible when the viewer is privileged **or** it is the viewer's own row. **Then hidden again** when the row is tid 100 and the viewer is not tid 100 ("For Security, Vinitbhai Password Suggested By Vinitbhai")                                                        | `FillData`                                      |

Precisely, for the password (`FillData`):

- The desktop **always** loads `deco(upwd)` into the masked `txtupwd`, for any row the viewer can
  see. The checkbox only toggles the mask. A WinForms PasswordChar box cannot be copied from, so
  without the checkbox the password is not readable on screen.
- Row 100 (vinit, IsAdmin) is **listed** to every privileged viewer. Only the Show Password
  checkbox is hidden from them. The plan's "row 100 is hidden" is wrong.
- Saving always re-encodes whatever the masked box holds. So a privileged user can **overwrite**
  tid 100's password by typing into the box without ever seeing it, and a user can always set their
  own password.

Web rule (from the plan, refined):

- **Return the decoded password** in the record only when
  `(privileged || viewer.id === row.tid) && !(row.tid === 100 && viewer.id !== 100)`.
  Otherwise omit the field entirely, and never put `upwd` in any list, search, print or export
  output.
- **On save,** an omitted or untouched password field means "keep the stored value". A typed value
  is encoded with `encodeLegacyPassword` (write-only, so it still works for row 100).
- **Server-side checks** (the desktop had only client-side ones):
  - Non-privileged users may only read and save `tid = self` (`listFilter` + a check in `save` and
    `record`), and may not create or delete.
  - Ignore or keep the stored `WorkingHours`/`IsActive` unless the user is privileged.
  - Ignore or keep `UserTypeKt` and the ReportingTo rows unless the user is IsAdmin or AMaster.

## SQL in form event handlers

- `Txt_KeyDown`: `select isnull(F2EntryText,'') F2EntryText,ISNULL(AddTableInfo,'') AS AddTableInfo from tblSearch where TransactionName='Usecurity' and (ColumnName='…' or ColumnName='…')`
- `FillTransactionDatatable`: `select ColumnName,isnull(replace(F2EntryText,'{Id}',<TranKm>),'') F2EntryText from tblSearch where TransactionName='Usecurity' and Type='T' [AND ColumnName='ReportingToTran']`
- Load: `select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where ConfigType='Usecurity' and isnull(ShortcutKey,'')<>'' order by ConfigName` (returns no rows)
- Ctrl+F: `SELECT Id,DisplayName FROM tblSearch where TransactionName='Usecurity' and IsSearchable=1 order by seq` (**lists upwd**; the web must drop it)

## Desktop bugs

Data-corrupting, or throws (**fix on the web**):

1. **Old and new encoded passwords are written into WorkReportM** by `insertworkreports`. Fix:
   exclude `upwd` from the comparison.
2. **`upwd` is searchable, printable and part of every GetDataTable row.** Fix: strip it from every
   list, record, search, print and export path.
3. **`DeleteTransaction` runs in its own connection before `Save`**, with no transaction. If the
   Usecurity save fails, the reporting rows are already gone. Fix: one transaction.
4. **DOL comes from a hidden picker** that only FillData sets (when the row has a DOL). Deactivating
   an employee who has no DOL therefore stores the previously viewed employee's DOL, or the time the
   form was opened. Fix: when Active is unchecked, `DOL = existing DOL ?? today`.
5. **NULL DOB/DOJ (3 rows each) inherit the previously viewed row's date** on save, because FillData
   leaves the picker alone when the value is NULL. Minor. Fix: keep NULL unless the user changes the
   picker. Otherwise accept the engine's "a picker always holds a date".

Harmless quirks (keep):

- **New keeps the previous row's values** in the checkboxes, date pickers and Working Hrs, because
  `clsCom.clear` only clears TextBoxes. The engine already models this.
- **`uview` is written False** on every save. Its only reader is the login query, which maps it to
  the session's `view`. Keep writing False, or preserve the stored value: the user's call.
- **`Image` is written as the string `'Null'`.** The web should leave the `Image` column untouched,
  since nothing reads it.
- **The Vibhag grid column is blank, and Vibhag has no F2.**
- **Salary is rounded to an Integer.**
- **Duplicate user names are allowed.**
- **Copy does not copy Reporting To.**

Open, needs a decision: a non-privileged user can toggle their own `uadd/umodify/udel`, and an
AMaster can change their own UserType. Both are privilege-relevant. Reproduce them, or restrict them
on the web?

## Files / images / disk

The photo GroupBox (`PicImage`, `btnUpload`) is dead UI and is skipped. Nothing else touches disk.

## Hard-coded passwords

- `InputBoxProc()` defaults (`gganga@123` / the Devanagari alternate) are already
  `SECURITY_PASSWORD` / `SECURITY_PASSWORD_ALT`.
- The tid 100 / 5 / 13 checks are hard-coded user ids, not passwords. Keep them as constants next
  to the menu's other hard-coded ids.

## Implementation hints

- **Fits `ScreenDefinition`:**
  - `table: 'Usecurity'`, `primaryColumn: 'tid'`, `lockable: false`.
  - `workReport: true` with `workReportOn: { add: false, delete: false }`, and `workReportAdjust`
    deleting `upwd`, `updatedby` and `updatedon` from both rows.
  - `listFilter`: `tid = self` unless privileged.
  - A list switch param for Active / All / Inactive (`listWhere` or `params`), reachable only by the
    privileged.
  - `trans.ReportingToTran` with the text-changed save rule (like Address) and a lookup
    `SELECT tid,uname FROM Usecurity`.
  - `deleteRecord` deleting `EmpReportingT` first.
  - `save` doing INSERT/UPDATE + `SELECT SCOPE_IDENTITY()` + `EmpReportingT` delete-insert in the
    same `trx`.
- **`save` and `delete` already receive `user`.** Enforce the row, create, delete and per-field
  rules there, because `writableBy` is screen-wide and `validate` gets no user.
- **Engine gaps:**
  1. A way to keep a column (`upwd`) out of the tblSearch-driven list, record, search-by,
     Print Selected Column and Excel paths. Make it generic, e.g. `secretColumns: ['upwd']`. Then
     add the gated password back through `recordExtras(db, id)`, which needs the viewer
     (`SessionUser`) passed in, and `CONVERT(varbinary, upwd)` + `decodeLegacyPassword`.
  2. Per-user toolbar state on the client: New/Delete/Copy off for the non-privileged; Search By
     combo and Utility menu hidden for them.
  3. Per-user field enablement: Working Hrs and Active for the privileged; User Type and Reporting
     To for IsAdmin or AMaster.
  4. A password field type: masked input + Show Password checkbox, shown only when the server sent
     the value; an empty untouched field means "unchanged".
  5. A `privileged`-style predicate shared by the API and the web (`isAdmin || id 5 || id 13`).
     `SessionUser` already has `isAdmin`, `id` and `userType`.
- **Tests worth writing:**
  - An operator lists only their own row, and gets 403 on another `tid`, on create and on delete.
  - An admin sees row 100 without the `upwd` field.
  - `upwd` never appears in list, search or print output.
  - The password round-trips through `encodeLegacyPassword`, and saving without it keeps the old
    bytes.
  - The work report log for a password change contains no `upwd`.

## Web port (2026-10-06)

Ported as `apps/api/src/master/screens/employee.ts` + `apps/web/src/screens/EmployeeMaster.tsx`,
with the shared rule helpers in `packages/shared/src/employee.ts` (`isEmployeePrivileged`,
`canEditEmployeeUserType`, `canSeeEmployeePassword`; the hard-coded ids 5 / 13 / 100 live there,
not in `menu.ts`). Tests: `apps/api/test/master-employee.integration.test.ts`,
`packages/shared/src/employee.test.ts`, `apps/web/e2e/batch-b.spec.ts`.

### How the password is protected

- `secretColumns: ['upwd']` (new engine option) drops `upwd` from every tblSearch-driven path:
  grid/list, record, Search By (meta + Ctrl+F), search / search-values / range / blank, Print
  Selected Column (the index count is kept so saved layouts still line up) and therefore Send To
  Excel, which exports the grid rows.
- The record gets `upwd` back, decoded, through `recordExtras` only when
  `canSeeEmployeePassword(viewer, tid)` holds (privileged or own row, never row 100 unless the
  viewer is 100). The engine's own internal record reads (work report comparison) pass no viewer
  and never get it.
- The web password box is write-only: Save sends `upwd` only when the user changed it (or on Add);
  an absent `upwd` keeps the stored bytes. A typed value is written with `encodeLegacyPassword`.
- Work report: a password change is logged as `upwd()` → `upwd(changed)`; no value, encoded or
  not, is written to WorkReportM. The engine's work report endpoint shows the desktop's old
  `upwd(<encoded>)` entries as `upwd(***)` for this screen (display only).
- **Not cleaned (user's call):** the local DB already has **95** `WorkReportM` rows for
  `Usecurity` whose Mistake/Remark hold encoded passwords. They are untouched. The separate
  Work Report screen (`work-report`) still shows them as stored.

### Server-side access rules (the desktop only disabled controls)

- `listFilter` (`tid = me` unless privileged) + new `enforceListFilter`: the same filter guards
  record, popup rows (`trans/ReportingToTran/:id`), work report read/add/log, edit lock, save,
  delete and Print Selected Column. Another user's row is 404 / filtered out for a
  non-privileged user.
- New `recordWritableBy`: New / Copy / Delete for the privileged only; Modify / Save for the
  privileged or the user's own row (403 otherwise).
- New `searchableBy`: non-privileged users get an empty Search By and 403 from the search
  endpoints. The Utility actions (Show All / Active / Inactive) are 403 for them.
- F2 distinct-value lists (Employee Name, Address, City, Mobile …) are limited to the rows the
  user may see, so a non-privileged user no longer sees every employee's phone numbers or
  addresses (**deliberate difference**; the desktop ran the tblSearch query over all rows).
- Field rules on save: Working Hrs, Active and DOL change only for the privileged; User Type and
  Reporting To only for IsAdmin or AMaster; otherwise the stored values stay.

### Deliberate differences

- **Privilege escalation restricted (decision):** nobody may change their own User Type
  ("You cannot change your own User Type"), and only IsAdmin may set or clear User Type 1
  ("Only an administrator can set or clear the Admin user type"). On the desktop an AMaster could
  make themself Admin.
- `uview` and `Image` are never overwritten on Edit (the desktop wrote False / `'Null'`). A new
  employee gets `uview` = False as on the desktop and `Image` NULL (nothing reads it).
- `vibhagkt` keeps its stored value on Edit (the desktop UI cannot change it either: its F2 is
  empty); a new record takes the box's Tag as the desktop does.
- The Reporting To popup's blank row (`ReportingToKt` 0) is not inserted.
- Search / Search In Range see inactive employees too (`defaultConditionListOnly`), as UcSearch
  is loaded with DefaultCond only; the grid's default is Active (" AND IsActive=1").
- Like every engine screen, the first grid row is not loaded automatically after FillList; click
  a row (engine-wide behaviour, not specific to this screen).
- Copy of a row whose password the viewer may not see creates the new user with an empty
  password (the desktop copied the masked password it always loaded).

### Desktop bugs fixed

1. Encoded passwords written into WorkReportM → `upwd(changed)` only.
2. `upwd` searchable / printable / in every GetDataTable row → secret column.
3. `DeleteTransaction` outside the save's transaction → Reporting To delete + inserts run in
   the same transaction as the Usecurity write.
4. Stale DOL from the hidden picker → on deactivation `DOL = ISNULL(DOL, today)`.
5. NULL DOB / DOJ inheriting the previous row's date → a picker the user did not touch on a
   record without the date sends '' (new `FieldSpec.keepEmptyDate`) and the server keeps the
   stored value (a new record still gets today, as the desktop's picker would).

### Open question for the user

- A non-privileged user can still switch their own Add / Modify / Delete checkboxes, which turns
  off their own logout work-report requirement. Kept as on the desktop (decision); should the
  web restrict it?
- A privileged non-admin (users 5 / 13) can still overwrite an IsAdmin user's password (e.g.
  row 100) without seeing it, as on the desktop.

### Engine extensions made for this screen (all opt-in)

- API `ScreenDefinition`: `secretColumns`, `enforceListFilter`, `defaultConditionListOnly`,
  `searchableBy`, `recordWritableBy`; `recordExtras` and `f2` now receive the viewer.
  `MasterService` passes the session user to meta, entry, popup rows, F2, search values,
  work report and print (controller). `printColumns` can skip secret rows.
- Web: `FieldSpec.password` (masked box + Show Password checkbox, write-only), `FieldSpec.keepEmptyDate`,
  `ScreenSpec.addDeleteBy` (New / Copy / Delete per user), `ScreenActions.user`; checkbox fields
  now honour `alwaysDisabled` / `editableFor` (no existing checkbox used either).

### Deferred

- Nothing touches disk; the dead photo frame is drawn empty with no button.
