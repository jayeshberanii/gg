# Work Report (`WorkReportM`)

Desktop form: `GGLibrarySolution/Library/Employee/frmWorkReportM.vb` (+ `.designer.vb`),
repository `Common.BusinessContract.WorkReportMRepository` (in `Common.BusinessContract.dll`,
decompiled in `../.legacy-decompiled/Common.BusinessContract/`). Menu: Employee › Work Report.
`frmLogReports` also opens it for one user's day (`StrId` = the day's `WorkReportKm`s).

A **read-only list** of the change log every master screen writes (`insertworkreports`). It
inherits `frmMasterPage` but has no field panel and never calls `EnableDisableDataEditing`:
every toolbar button stays enabled, and only **Refresh** and **Exit** have handlers. Served by
the master engine with its own list query (`ScreenDefinition.listRows`) and `readOnly: true`,
so the engine refuses every write for it.

- API: `apps/api/src/master/screens/work-report.ts`
- UI: `apps/web/src/screens/WorkReport.tsx`

## Table and key

- Table: `WorkReportM`, PK `WorkReportKm` (IDENTITY). ~1.26M rows.
- Columns: `WorkReportKm`, `RecordNo` (nvarchar — the id of the changed record), `TableName`,
  `ColumnName` (the changed table's key column), `WorkTypeGId` (→ `columnmaster`, Vibhag
  `worktype`), `DoneByGId` (→ `Usecurity.tid`), `Workdate` (date), `Mistake` (old values),
  `Remark` (new values), `alterTime` (time), `MistakeCount`.

## List (`WorkReportMRepository.ListGridData`)

`FillList` → `ListGridData(boolDisplayCount, StrId, Top, DefaultWhereCond)`:

```sql
SELECT WorkDate, (SELECT uname FROM Usecurity WHERE tid = DoneByGId) DoneByGIdName, DoneByGId,
  WorkReportKm, (SELECT Name FROM columnmaster WHERE ColumnMastkm = WorkTypeGId AND Vibhag = 'worktype') WorkTypeGIdName,
  WorkTypeGId, ColumnName, Mistake, RecordNo, Remark, TableName, alterTime, 0 Qty
FROM WorkReportM WHERE 1 = 1 <DefaultWhereCond>
  [AND WorkReportKm IN (<StrId>)]
  [AND Workdate >= DATEADD(MONTH, -1, GETDATE())]      -- Top = 1 when StrId is empty
ORDER BY CAST(Workdate AS DATE) DESC, DoneByGIdName, TableName
```

**Display Count** (`boolDisplayCount`) groups instead: `GROUP BY Workdate, DoneByGId,
WorkTypeGId, TableName`, with `COUNT(DoneByGId) Qty` and `0`/`''` for `WorkReportKm`,
`RecordNo`, `ColumnName`, `Mistake`, `Remark`, `alterTime`. The grid then hides RecordNo,
Mistake, Remark, alterTime and shows Qty. Refresh keeps the current mode. Because every
grouped row has `WorkReportKm = 0`, the web grid keys those rows by date/user/type/table.

`StrId` is kept for the life of the window: Refresh re-applies it (the web passes the
window's `initialIds` on every reload).

### DefaultWhereCond (Form_Load)

- Not admin and not AMaster (`UserTypeKt 5`): `AND DonebyGid IN (<me>, <GetReportingByTid(me)>)`
  — yourself plus the employees reporting to you (`EmpReportingT.ReportingToKt = me`).
- Always: `AND DonebyGid IN (SELECT tid FROM Usecurity WHERE IsActive = 1)`.

It applies to the list and to every UcSearch search (`UcSearch.LoadData(..., WhereCondition)`),
so it is the definition's `listFilter`.

### lblEntry

`FillList` writes the last month's range, `dd/MM/yyyy-dd/MM/yyyy` (a month ago to today), into
`lblEntry`, even when `StrId` limits the list. After UcSearch's **Search In Range** the range
typed there replaces it (`dgMain_DataSourceChanged` copies `UcSearch.lblRange`), and stays
until the next range search.

## Grid columns (designer, `GvMain`)

| Header       | Field             | Width | Notes                          |
| ------------ | ----------------- | ----- | ------------------------------ |
| WorkReportKm | `WorkReportKm`    | 5     |                                |
| RecordNo     | `RecordNo`        | 150   | hidden in Display Count        |
| TableName    | `TableName`       | 150   |                                |
| WorkTypeGid  | `WorkTypeGId`     | —     | `Visible = False`              |
| Work Type    | `WorkTypeGIdName` | 100   |                                |
| DoneByGid    | `DoneByGId`       | 150   | `Visible = False`              |
| Done By      | `DoneByGIdName`   | 100   |                                |
| Workdate     | `WorkDate`        | 200   | `Format = dd-MM-yyyy`          |
| Mistake      | `Mistake`         | 150   | hidden in Display Count        |
| Remark       | `Remark`          | 200   | hidden in Display Count        |
| alterTime    | `alterTime`       | 200   | TimeSpan text; hidden in Count |
| Qty          | `Qty`             | 100   | shown only in Display Count    |

Search By / F2 / F3 / range / blank come from the 10 `tblSearch` rows for `WorkReportM`, live.

## Keys (`frmWorkReportM_KeyDown`)

Only Ctrl+Z / Ctrl+Y (result history), Ctrl+F (Search By list) and Ctrl+R (Refresh). The
other frmMasterPage shortcuts are not handled by this form.

## Right-click menu (`dgclickmnu`)

| Item                        | Behaviour                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Show in › Author            | selected rows whose `TableName` lower-cases to `authmast` → Author Master with their `RecordNo`s; none: "No Records Found"             |
| Show in › Prakshak          | `TableName = 'PrakMast'` (DataView filter, case-insensitive) → Prakashak Master; none: nothing                                         |
| Show in › Kruti Master      | `KrutiMst` → Kruti Master                                                                                                              |
| Show in › Prkshan           | does nothing (the desktop's form call is commented out)                                                                                |
| Show in › BookM             | `BookM` → Book Master                                                                                                                  |
| Show in › BookT             | `BookT` → frmBookTranNew with `strTid` (the web's Book Tran dialog, Show-All mode)                                                     |
| Show in › Graphics Master   | lower-case `graphicbkm` → Graphics Master; none: "No Records Found"                                                                    |
| Show in › Graphics Detail   | `graphicbkt` → Graphics Detail                                                                                                         |
| Show in › Lekh Master       | `TableName = 'lekhmast' AND ColumnName = 'lekhkm'`, newest first → Lekh Master                                                         |
| Show in › Vishesh Master    | `visheshMast` / `Tid`                                                                                                                  |
| Show in › Column Master     | `columnmaster` / `ColumnMastkm`                                                                                                        |
| Show in › Bhash Master      | `bhasmast` / `bhashacokm`                                                                                                              |
| Show in › Lipi Master       | `lipimast` / `lipicodekm`                                                                                                              |
| Show in › Authortype Master | `authtype` / `authtycokm`                                                                                                              |
| Show in › Vishay Master     | `vishay` / `vishaycokm`                                                                                                                |
| Show in › Report            | for the selected rows' (DoneBy, Workdate) days, their `log.logID`s → frmLogReport (Old Log Reports); none: "No Record Found"           |
| Show in › Log Report        | the current row's day → `frmLogout(LogId, True)` (the day's logout work report, read-only unless it is yours); none: "No Record Found" |
| Show in › Magazine Master   | `MagazineM` (any ColumnName)                                                                                                           |
| Show in › Patrika           | lower-case `patrika` → Patrika; none: "No Records Found"                                                                               |
| Display Full Report         | only while in Display Count: back to the detail list                                                                                   |
| Display Count               | only while in the detail list: the grouped count                                                                                       |
| Compare Data                | `GetMistakeRemarkDetail(current WorkReportKm)` → frmPopup with ColName / OldData / NewData                                             |

The Show-in lists come from the selected rows. The desktop's SQL-based ones (Lekh … Vishay,
Magazine) order by `WorkReportKm DESC`; the web does the same client-side. `RecordNo`s that
are not numbers (or `0`, as in Display Count) are skipped.

### Compare Data (`GetMistakeRemarkDetail`)

Ported as `mistakeRemarkDetail()` in `work-report.ts`: cut each of `Mistake`/`Remark` at its
last `=` (the change count), split on `~`, take each part's text before `(` (lower-cased) as
its column, and for every column (Remark's first, then Mistake-only ones) pair the old and new
parts that start with that column, padding the shorter side at the top. The column name is
shown only on its first row.

## Permissions

Menu: Employee › Work Report has no visibility rule. `@ScreenAccess` via the engine's screen
guard. The engine refuses save / delete / lock / edit-lock / work-report writes / print
layouts for this screen (`readOnly`), since the desktop form has no handlers for them.

The Log Report item opens the web's logout work report (`WorkLogDialog`) with the day's log
id. Its API now also lets a user see the logs of employees who report to them (the same
people this screen shows them), not only admins/AMaster.

## Not ported

- `UpdateLogoutTime()` after closing frmLogout unsaved: with `boolPendLog = True` it only
  rewrites the stored logout time and its total, so it is left out.
- Patrika / Graphics Master appending their picks into the form's own `StrId` (so the next
  Refresh would be limited to them) — a desktop bug.
