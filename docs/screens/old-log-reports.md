# Old Log Reports (no TransactionName: a report over `log` ⋈ `work`)

Desktop form: `GGLibrarySolution/Library/Employee/frmLogReport.vb` (+ `.Designer.vb`, 460 + 507
lines). Menu: Employee › Old Log Reports (`Frmlibmain.ToolStripMenuItem8`, no visibility rule, so
everyone sees it; `menu.ts` has no `visible` either). Window title "Log Report"; heading label
"Employee Work Report".

Not to be confused with `frmLogReports.vb` (with an **s**), opened by the hidden
(`Visible = False`) "Log Reports" item. It is not in `menu.ts` and is out of scope.

**A plain `Form`, not `frmMasterPage`.** It has no toolbar, no UcSearch, no UcPrevNext, no
tblSearch rows (the DB has none for it) and no repository of its own. Its only repository call is
`CommonRepository.GetReportingByTid`. It is read-only: nothing on it writes, except the side effect
of "Send To Log Report" (see below). All SQL lives in the form.

Opened from:

- the menu, with `StrId = ""`: date-range mode.
- Work Report › Show in › Report (`frmWorkReportM.ReportToolStripMenuItem_Click`), with
  `StrId` = a comma list of `log.logID`s, one per distinct (DoneByGId, Workdate) day among the
  selected rows. On the web this already exists as the `report` action in
  `apps/api/src/master/screens/work-report.ts`, which returns
  `{kind:'open', screen:'old-log-reports', ids: logIds, emptyMessage:'No Record Found'}`.

## Tables (from INFORMATION_SCHEMA, local DBLibSQL)

- `log`: `logID` bigint PK, `uid` int (→ `Usecurity.tid`), `logdate` date, `logintime` time,
  `logouttime` time, `totallogtime` time, `LastLoginTime` time. About 97k rows. 16 (uid, logdate)
  days have 2 log rows.
- `work`: `workID` bigint PK, `logid` bigint (→ log), `vibhagkt` int (→ columnmaster
  Vibhag='Vibhag'), `worktypeID` int (→ columnmaster Vibhag='worktype'), `workquantity` int,
  `worktime` time, `workreports` nvarchar(4000), `remarks` nvarchar(4000), `IsManualEntry`,
  `TableName`, `MistakeCount`. About 413k rows.
- `ApprisalStandard`: `VibhagKt`, `WorkTypeKt`, `PerHourWorkQty` int. There are no duplicate
  (VibhagKt, WorkTypeKt) pairs today, so the LEFT JOIN does not multiply rows. It would if
  someone added a duplicate pair.
- `EmpReportingT`: `EmployeeKt`, `ReportingToKt`.
- Gap rows: columnmaster `Gap` (4203, worktype), `Personal` (6692, Vibhag) and `Lunch` (6693,
  Vibhag). There is also `Personal` 9660 with Vibhag = 'LeaveType'. The gap subquery matches on
  `Name` only, without checking Vibhag, so a work row whose vibhagkt is 9660 would also count.
  No such rows exist; this is a harmless quirk.

## Controls (Designer; form ClientSize 1028×707, BackColor AliceBlue, Maximized)

Fonts: Bookman Old Style 9pt unless noted.

| Control                       | Type                        | Location | Size    | Notes                                                                                                            |
| ----------------------------- | --------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| Label1 "Employee Work Report" | Label, Dock Top             | 0,0      | 1028×29 | LavenderBlush, Bookman 10.8 bold, TopCenter                                                                      |
| btnClose "Close"              | Button                      | 944,0    | 59×31   | Anchor Top/Right, Bookman 10.2 bold italic, Blue; `Me.Close()`                                                   |
| Label2 "Reports Type"         | Label                       | 9,42     |         |                                                                                                                  |
| cmbReportType                 | ComboBox DropDownList       | 102,38   | 193×24  | TabIndex 2. Items `Datewise`, `Userwise`, `Vibhagwise`, `WorkTypewise`. Load sets index 0                        |
| Label4 "From Date"            | Label                       | 311,42   |         |                                                                                                                  |
| dtpFromDate                   | DateTimePicker `dd/MM/yyyy` | 382,41   | 90×22   | No value set, so it starts at **today**                                                                          |
| Label3 "To Date"              | Label                       | 311,74   |         |                                                                                                                  |
| dtpToDate                     | DateTimePicker `dd/MM/yyyy` | 382,74   | 90×22   | Starts at today                                                                                                  |
| rdoFullReport "Full Report"   | RadioButton                 | 490,38   | 93×20   | **Checked** by default                                                                                           |
| rdoShortReport "Short Report" | RadioButton                 | 490,69   | 103×20  |                                                                                                                  |
| btnSearch "Show Report"       | Button                      | 490,92   | 74×19   | Tahoma 9, Blue; runs `FillReport()`                                                                              |
| Label5 "Search By"            | Label                       | 9,74     |         |                                                                                                                  |
| cmbSearchBy                   | ComboBox DropDownList       | 102,71   | 193×24  | Items `""`, `User`, `Vibhag`, `Work Type`, `Work Quantity`, `Work Remark`, `Remark`. Starts blank (no index set) |
| Label6 "Search"               | Label                       | 9,106    |         |                                                                                                                  |
| txtSearch                     | TextBox                     | 102,104  | 193×22  | TextChanged runs `Search()`. F2 opens a lookup (below)                                                           |
| lblRecords                    | Label                       | 790,121  | 206×17  | Bookman 10.2 bold, Crimson, MiddleRight. `"Total Records : " & dgReport.Rows.Count`                              |
| dgReport                      | DataGridView                | 12,145   | 991×521 | See Grid                                                                                                         |

`clsCom.SetTextboxEvent(Me)` gives txtSearch the UserConfig text font plus F3/double-click to
open the big text box and Ctrl +/- to zoom. It gives dgReport the UserConfig grid font, F3 and
Ctrl +/- (see memory note "Shared WinForms behaviour"). `ResizeControl(Me)` scales everything by
screen/1024×768. Ignore that on the web.

### cmbReportType_SelectedIndexChanged

- Datewise or Userwise: `rdoShortReport.Enabled = True`.
- Otherwise: `rdoShortReport.Enabled = False` and `rdoFullReport.Checked = True`.

Changing the combo or a radio does **not** reload the grid. Only Show Report (and Form_Load)
call `FillReport()`.

## The query (`FillReport`), verbatim

Column part, Short Report:

```sql
select log.logdate logdat,CONVERT(varchar,log.logdate,103) logdate,log.uid,Usecurity.uname,CAST(SUBSTRING(cast(logintime as varchar),1,8) AS VARCHAR) logintime,SUBSTRING(cast(logouttime as varchar),1,8) logouttime,SUBSTRING(cast(totallogtime as varchar),1,8) totallogtime,
'' Vibhag,'' WorkType,'' workquantity,null worktime,'' workreports,'' remarks,0 AS TargetedWorkQty
```

Column part, Full Report:

```sql
select log.logdate logdat, CONVERT(varchar,log.logdate,103) logdate,log.uid,Usecurity.uname, SUBSTRING(cast(logintime as varchar),1,8) logintime,SUBSTRING(cast(logouttime as varchar),1,8) logouttime,SUBSTRING(cast(totallogtime as varchar),1,8) totallogtime,
colVib.Name Vibhag,colWorkType.Name WorkType,work.workquantity,SUBSTRING(cast(work.worktime as varchar),1,8) worktime,work.workreports,work.remarks,
ISNULL(CAST((DATEDIFF(minute,'0:00:00',convert(time,work.worktime))/60.0)* PerHourWorkQty AS INT),0) TargetedWorkQty
```

Common tail:

```sql
,Right('0'+ CAST(tblGap.TotalGapTime/3600 AS VARCHAR(5)),2) + ':' + RIGHT('0' + CAST(tblGap.TotalGapTime%3600/60 AS VARCHAR(5)),2) as totalgaptime,
Right('0'+ CAST((isnull(DATEDIFF(S, '00:00:00', totallogtime),0)-isnull(tblGap.TotalGapTime,0))/3600 AS VARCHAR(5)),2) + ':' + Right('0'+ CAST((isnull(DATEDIFF(S, '00:00:00', totallogtime),0)-isnull(tblGap.TotalGapTime,0))%3600/60 AS VARCHAR(5)),2) as totalworktime
from log
inner join Usecurity on log.uid=Usecurity.tid
left join work on log.logID=work.logid
left join columnmaster colVib on work.vibhagkt=colVib.ColumnMastkm and colVib.Vibhag='Vibhag'
left join columnmaster colWorkType on work.worktypeID=colWorkType.ColumnMastkm and colWorkType.Vibhag='worktype'
left join ApprisalStandard AStd ON AStd.vibhagkt=work.vibhagkt AND AStd.WorkTypeKt=work.worktypeID
OUTER APPLY (SELECT isnull(SUM(DATEDIFF(S, '00:00:00', worktime)),0) AS TotalGapTime From work w1 WHERE w1.workID in(SELECT w2.workId from work w2 inner join columnmaster colVib1 on w2.vibhagkt=colVib1.ColumnMastkm and colVib1.Name in('Personal','Lunch') inner join columnmaster colwTyp1 on w2.worktypeID=colwTyp1.ColumnMastkm and colwTyp1.Name='Gap'  where w2.logid=log.logID))tblGap
WHERE 1=1
```

Then, in order:

1. Which logs:
   - `StrId <> ""`: `AND log.LogId in(<StrId>) `. The dates are ignored.
   - Otherwise: `AND log.logdate>='<dtpFromDate MM/dd/yyyy>' and log.logdate<='<dtpToDate MM/dd/yyyy>'`.

   `StrId` is a public field set once when the window opens, so in a window opened from Work
   Report **every** Show Report reuses those log ids. The date pickers never apply in that window.
   Keep this; it is the same idea as Work Report's `refreshKeepsIds`.

2. Scoping. When `IsAdminLogin = False And curr_utypeid <> AMaster(5)`:
   `and (Usecurity.tid IN(<curr_lnid>,<GetReportingByTid(curr_lnid)>))`.
   `GetReportingByTid` (CommonRepository.vb:173) is
   `SELECT ISNULL(STUFF((SELECT ',' + CAST(EmployeeKt AS VARCHAR) FROM EmpReportingT WHERE ReportingToKt =<id> FOR XML PATH('')),1,1,''),0)`.
   So the scope is yourself plus your direct reports, or `<me>,0` when you have none.
   **Unlike Work Report there is no `IsActive = 1` filter**, so inactive users' logs show.
   `IsAdminLogin` is `Usecurity.IsAdmin` (frmlogin.vb:95), which is `user.isAdmin` on the web.
3. Short Report only:
   `group by log.uid,log.logdate,Usecurity.uname,logintime,logouttime,totallogtime,tblGap.TotalGapTime`.
   This gives one row per log row; the `work` join only multiplied it.
4. Order, by report type:
   - Datewise: ` order by logdat,uname`
   - Userwise: ` order by uname,logdat`
   - Vibhagwise: ` order by Vibhag,logdat,uname`
   - WorkTypewise: ` order by WorkType,logdat,uname`

I ran both variants read-only against DBLibSQL and both execute. Example output: time columns
come back as `HH:mm:ss` text, `logdate` as `dd/MM/yyyy`, `totalgaptime`/`totalworktime` as
`HH:mm`, and `logouttime`/`totallogtime` as NULL for an open day.

### Derived values

- **Total Gap Time**: the sum of `worktime` (in seconds) of the log's `work` rows whose Vibhag is
  Personal or Lunch **and** whose work type is Gap, shown as `HH:mm`. `Right('0'+h, 2)`
  truncates hours of 100 or more, which is harmless. OUTER APPLY over SUM always returns a row,
  so a log with no gaps shows `00:00`.
- **Total WorkTime**: `totallogtime` seconds minus the gap seconds, as `HH:mm`. If
  `totallogtime` is NULL (day not closed) while there is gap time, the result is negative and
  prints oddly (e.g. `-1:-5`). This is a harmless quirk; currently 0 such rows exist.
- **Targeted Work Qty** (Full only): `CAST(worktime minutes / 60.0 * ApprisalStandard.PerHourWorkQty AS INT)`,
  or 0 when there is no standard.

## Grid (`dgReport`)

Designer settings: AllowUserToAddRows/DeleteRows False, AllowUserToOrderColumns **True**,
AllowUserToResizeRows False, ReadOnly, RowHeadersVisible False, FullRowSelect, MultiSelect
default (True), GridColor LightSteelBlue, header LightSteelBlue Bookman 9 with wrap, cells
Bookman 10.2, alternating rows White on ForeColor 64,64,64, selection colour 10,36,106. Columns
are designer-bound (`AutoGenerateColumns = False`), so header click sorts (SortMode Automatic).
The form's ContextMenuStrip is `cntMenu`.

Columns in `GrReport` enum order:

| #   | Name               | Header                   | Width | Bound to                                    | Visible                           |
| --- | ------------------ | ------------------------ | ----- | ------------------------------------------- | --------------------------------- |
| 0   | colGroup           | Group → renamed per type | 130   | per type (below)                            | always                            |
| 1   | colDate            | Date                     | 130   | `logdat` (the **date value**, not the text) | hidden in Datewise                |
| 2   | colUserkt          | Userkt                   | 100   | `uid`                                       | `Visible = False`                 |
| 3   | colUser            | User                     | 100   | `uname`                                     | hidden in Userwise                |
| 4   | colLoginTime       | Login Time               | 120   | `logintime`                                 |                                   |
| 5   | colLogoutTime      | Logout Time              | 125   | `logouttime`                                |                                   |
| 6   | colTotalTime       | Total Time               | 120   | `totallogtime`                              |                                   |
| 7   | colTotalGapTime    | Total Gap Time           | 125   | `totalgaptime`                              |                                   |
| 8   | colTotalWorkTime   | Total WorkTime           | 130   | `totalworktime`                             |                                   |
| 9   | colVibhag          | Vibhag                   | 160   | `Vibhag`                                    | Full only; hidden in Vibhagwise   |
| 10  | colWorkType        | Work Type                | 160   | `Worktype`                                  | Full only; hidden in WorkTypewise |
| 11  | colWorkQuantity    | Work Quantity            | 145   | `workquantity`                              | Full only                         |
| 12  | colTargetedWorkQty | Targeted Work Qty        | 100   | `TargetedWorkQty`                           | Full only                         |
| 13  | colWorkTime        | Work Time                | 120   | `WorkTime`                                  | Full only                         |
| 14  | colWorkRemark      | Work Remark              | 200   | `WorkReports`                               | Full only                         |
| 15  | colRemark          | Remark                   | 200   | `Remarks`                                   | Full only                         |

### "Grouping" modes (`FillGrid`)

There is **no real grouping or subtotalling**. The commented-out code that blanked repeated
values and coloured group starts is dead. A mode is just the ORDER BY plus what the first column
shows:

| Report type  | colGroup header | colGroup bound to           | Column hidden because it repeats colGroup | ORDER BY                |
| ------------ | --------------- | --------------------------- | ----------------------------------------- | ----------------------- |
| Datewise     | Date            | `logdate` (dd/MM/yyyy text) | colDate                                   | logdat, uname           |
| Userwise     | User            | `uname`                     | colUser                                   | uname, logdat           |
| Vibhagwise   | Vibhag          | `Vibhag`                    | colVibhag                                 | Vibhag, logdat, uname   |
| WorkTypewise | Work Type       | `WorkType`                  | colWorkType                               | WorkType, logdat, uname |

FillGrid first resets colDate, colUser, colVibhag, colWorkType and the Full-only columns to
visible. Then, for a Short report, it hides columns 9–15.

**Short Report** also replaces the table with
`dtReport.DefaultView.ToTable(True, "logdat","logdate","uid","uname","logintime","logouttime","totallogtime","totalgaptime","totalworktime")`.
That is a DISTINCT over those 9 columns, so the Short table has only those columns. This matters
for Excel and for Search, below. Short is only possible for Datewise and Userwise.

In Userwise, colDate shows the `logdat` **DateTime** with no Format. WinForms renders it with the
machine culture's date and time, e.g. `30-09-2026 00:00:00` on en-IN. On the web, show it as
`dd-MM-yyyy` or as the desktop does; ask if it matters. Harmless quirk.

`lblRecords = "Total Records : " & dgReport.Rows.Count` is set after FillGrid and after F2, but
**not** after typing in txtSearch. That is a harmless quirk; the web can keep it or always update
the count.

## Search (`txtSearch_TextChanged` → `Search`): client-side DataView filter

Filtering is done on the loaded rows (`dvReport.RowFilter`), with no SQL. An empty text clears
the filter. Each Search By value maps to a column:

| Search By     | Column filtered              | Single value | Comma list (intended) |
| ------------- | ---------------------------- | ------------ | --------------------- |
| (blank)       | nothing; the text is ignored |              |                       |
| User          | `uname`                      | `LIKE '%x%'` | `in ('a','b')`        |
| Vibhag        | `Vibhag`                     | LIKE         | in                    |
| Work Type     | `WorkType`                   | LIKE         | in                    |
| Work Quantity | `WorkQuantity`               | LIKE         | in                    |
| Work Remark   | `workreports`                | LIKE         | in                    |
| Remark        | `Remark`                     | LIKE         | in                    |

Desktop bugs here. All of them **throw**, and the desktop shows `MsgBox(ex.Message)`:

- **Comma list**: the loop does `StrSearch = IIf(i=0,"",",") + "'" + StSearch(i) + "'"`, which
  assigns instead of appending. The filter becomes `uname in (,'last')`, a syntax error.
  **Fix on web**: build the intended IN list of all the values (exact match).
- **Remark**: the DataTable column is `remarks`, so `Remark LIKE …` throws "column not found"
  every time. **Fix**: filter `remarks`.
- **Work Quantity** in a Full report: `workquantity` is an int, and DataView `LIKE` on Int32
  throws. In Short mode the column is not in the table at all, and the same applies to Vibhag,
  Work Type, Work Remark and Remark, which throws "column not found". **Fix**: compare on text
  (`String(v).includes(x)`). In Short mode those filters match nothing, or are disabled.
- A `'` in the text breaks the RowFilter. **Fix**: plain string matching on the client.

Matching is case-insensitive (DataView default). The `%` wildcards mean "contains".

## F2 on txtSearch (`txtSearch_KeyDown`)

Only when Search By = **User**. It runs `clsCom.DisplayListForm(txtSearch, <sql>, , , , , , True)`
(boolSelectFirst = True: frmList1 with the first row selected; it sets txtSearch.Text = uname and
Tag = tid).

- Operator(3), 0 or Guest(4):
  `SELECT DISTINCT usecurity.tid,usecurity.uname FROM usecurity inner join log ON usecurity.tid=log.uid WHERE log.uid=<curr_lnid> OR log.uid IN(SELECT EmployeeKt FROM EmpReportingT WHERE ReportingToKt=<curr_lnid>) ORDER BY uname`
- Everyone else:
  `select distinct usecurity.tid,usecurity.uname from usecurity inner join log on usecurity.tid=log.uid order by uname`

Note that a **Master(2)** user without admin rights gets the unscoped list here, even though the
report itself is scoped to them and their reports. Picking someone outside the scope just filters
to nothing. Harmless. On the web, scope the lookup like the report.

Setting the text fires TextChanged (a LIKE filter on uname). Then, if `Val(Tag) > 0`, it sets
`RowFilter = "uid = <tag>"`, which is the exact user. After **any** F2 (whatever Search By is),
`dgReport.DataSource = dvReport.ToTable` (a snapshot of the filtered rows) and lblRecords is
updated.

## Right-click menu (`cntMenu`)

| Item                | Visible                                                                                                                                                                                     | Behaviour |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Send To Excel       | Form_Load hides it for curr_utypeid Oprator(3), 0, Guest(4) and **Master(2)**, unless `curr_lnid = 182`. So Admin(1), AMaster(5) and user 182 see it. It gates on **utypeid**, not IsAdmin. | See below |
| Send To Work Report | always                                                                                                                                                                                      | See below |
| Send To Log Report  | `cntMenu_Opening`: only curr_utypeid 1 or 5                                                                                                                                                 | See below |

### Send To Excel

The menu item adds a leading `'` to the cells of colGroup (Datewise only), Login, Logout, Total,
Total Gap, Total Work and (Full only) Work Time, so Excel keeps them as text. It then calls
`CommonLibrary.SendtoExcel(dgReport)` and strips the `'` again. Because the grid is bound, the
prefix is written into the DataTable too.

`SendtoExcel` exports **the grid's whole DataSource DataTable**, not the visible grid columns.
That means every SQL column with its SQL name, hidden `uid` included. Full mode exports 16
columns: `logdat, logdate, uid, uname, logintime, logouttime, totallogtime, Vibhag, WorkType,
workquantity, worktime, workreports, remarks, TargetedWorkQty, totalgaptime, totalworktime`.
Short mode exports 9. The rows are the current filter's rows (DataView → ToTable). The export is
an Aspose/Spire .xls with a "गीतार्थ गंगा" watermark header, saved to `excelfiles/<uid>/` and
opened.

- **Web**: use `sendTableToExcel('...', columns, rows)` from `features/master/sendToExcel.ts`
  with the table's own column names, to match the desktop. Drop the `'` hack, because CSV keeps
  text. Gate the menu item with the same rule, and the matching API check (if export is
  server-side) with `[1,5].includes(userType) || id === 182`. Unknown userType 0 is treated as
  hidden.

### Send To Work Report

Runs only if there is a current cell:

```sql
SELECT ISNULL(STUFF((SELECT ',' + CAST(WorkReportKm AS VARCHAR(MAX)) FROM WorkReportM WHERE DoneByGId=<current row colUserkt> AND Workdate='<dvReport(CurrentRow.Index)("logdat") MM/dd/yyyy>' FOR XML PATH('')),1,1,''),0)
```

- `"0"` shows `MsgBox("No Record Found")`.
- Otherwise it opens `frmWorkReportM` with `StrId = <those ids>` as an MDI child. Work Report
  then lists exactly those `WorkReportKm`s, still under its own DefaultWhereCond (self plus
  reports, active users only). Refresh keeps them.
- Desktop bug: the date is read from `dvReport` **by grid row index**. After a header-click sort,
  or after F2 (DataSource is then a ToTable snapshot), the index can point at another row, giving
  the wrong day. This is a wrong result, not data corruption. **Fix on web**: use the clicked
  row's own `logdat`/`uid`.
- **Web**: an action `send-to-work-report` returns
  `{kind:'open', screen:'work-report', ids, emptyMessage:'No Record Found'}`. Scope the ids
  query with `visibleWorkUsers(user, sql\`DoneByGId\`)`from`work-report.ts`. Work Report
already opens with `initialIds`and`refreshKeepsIds`.

### Send To Log Report (Admin / AMaster only)

1. Runs `select LogId from log where logdate='<colDate value MM/dd/yyyy>' AND uid='<colUserkt>'`.
   GetScalarValue takes the first row; there are 16 duplicate days.
2. Opens `CommonLibrary.frmLogout(lgId, True)` as a dialog: that day's logout work report.
3. If it closes without saving, calls `frm.UpdateLogoutTime()`. With `boolPendLog = True` this
   rewrites `log.logouttime` with the stored one and recomputes `totallogtime`. That is a write.

Work Report's identical "Show in › Log Report" was ported **without** the UpdateLogoutTime
rewrite (docs/screens/work-report.md, "Not ported"). Do the same here: return
`{kind:'work-log', logId}` (opens `WorkLogDialog`) or `{kind:'message', message:'No Record Found'}`
when there is no log. Gate it on `isAdmin`-equivalent userType 1 or 5, both in the menu and on the
API.

Note: `colDate` is the hidden column in Datewise, but its value is still bound, so this works in
every mode.

## Permissions

- Screen: menu item visible to everyone, enforced with `@ScreenAccess('old-log-reports')`.
- Rows: the scoping above (server-side; the desktop's SQL does it, and the web must too). This
  includes **the StrId path**: the web's `ids` must still be filtered by scope. Work Report's
  `report` action already limits the log ids it builds to visible users, but a crafted request
  must not bypass that.
- Excel: utypeid 1 or 5, or user 182.
- Send To Log Report: utypeid 1 or 5.
- No EnableDisableDataEditing; nothing editable.

## Reports and printing

No Crystal report and no Print Selected Column. The only export is Send To Excel.

## Files / disk

Only SendtoExcel's local `excelfiles/` folder, which becomes a browser download on the web.
Nothing to defer.

## Hard-coded values

No passwords. Hard-coded user id `182` (Excel exception). Keep it as the desktop rule, as
`menu.ts` does with ids 5/13/100.

## Desktop bugs summary

| Bug                                                                   | Class             | Web                             |
| --------------------------------------------------------------------- | ----------------- | ------------------------------- |
| Comma-list search builds `in (,'x')`                                  | throws            | Fix: real IN list               |
| "Remark" filters a non-existent `Remark` column                       | throws            | Fix: `remarks`                  |
| LIKE on int `workquantity`; Short mode filters missing columns        | throws            | Fix: text match; no-op in Short |
| `'` in search text breaks RowFilter                                   | throws            | Fix: plain string match         |
| Send To Work Report picks the date by row index (wrong after sort/F2) | wrong result      | Fix: use the row itself         |
| UpdateLogoutTime rewrite after the Log Report dialog                  | write side effect | Not ported (as in Work Report)  |
| lblRecords not updated on typing                                      | quirk             | Keep or update; harmless        |
| Negative Total WorkTime text when totallogtime is NULL                | quirk             | Keep the SQL as is              |
| F2 user list unscoped for Master(2)                                   | quirk             | Scope it like the report        |
| Gap subquery matches `Name='Personal'` of any Vibhag type             | quirk             | Keep                            |
| StrId window ignores the dates forever                                | quirk             | Keep                            |

## Implementation hints

This is the first **non-frmMasterPage** screen. `MasterScreen` always renders the frmMasterPage
toolbar / UcSearch / PrevNext, which this form does not have. So:

**API.** There are two options.

1. (Preferred, least new plumbing) A `ScreenDefinition` in
   `apps/api/src/master/screens/old-log-reports.ts`, registered in `registry.ts`, with:
   - `screen: 'old-log-reports'`, `table: 'log'`, `primaryColumn: 'logID'`, `lockable: false`,
     `readOnly: true`, `validate`/`save` refusing, as `work-report.ts` does. `meta()` calls
     `loadTblSearch('log')`, which returns no rows and is harmless. Check that `Config_Master`
     has no `log` layouts.
   - `listRows(db, { ids, params })`, which builds the SQL above with Kysely `sql` fragments.
     The params are `reportType` ∈ the 4 names (zod enum), `short` boolean, and `from`/`to`
     (`yyyy-mm-dd`, bound as `CAST(@p AS date)`, **not** an `MM/dd/yyyy` literal). Use `ids`
     (StrId) via `idList()` from `db/legacy-sql.ts`. Implement scoping as its own function:
     `(user.isAdmin || user.userType === UserType.AMaster) ? sql\`\` : sql\`AND (Usecurity.tid = ${id} OR Usecurity.tid IN (SELECT EmployeeKt FROM EmpReportingT WHERE ReportingToKt = ${id}))\``.
Do **not** reuse `visibleWorkUsers`as is, because it adds`IsActive = 1`, which this
     report does not have. Factor out the non-IsActive half and share it.
   - Do the Short-mode DISTINCT in SQL (the GROUP BY already makes rows unique) and return only
     the 9 columns, so the Excel columns match.
   - `actions`: `send-to-work-report` (params `uid`, `day`) and `log-report` (params `uid`,
     `day`; gated to userType 1/5). These are near copies of `logIdOf` / `log-report` in
     `work-report.ts`; extract `logIdOf` to share it.
   - `listFilter` is not used: scoping must apply to the ids path too, so put it inside
     `listRows`, or pass it as `filter` through `listFilter` (the engine hands it to `listRows`
     as `filter`). Either works. Using `listFilter` keeps it in one place.
   - User F2: a `lists`/`f2` entry with the scoped `SELECT DISTINCT tid, uname …` (both
     variants above).
2. Or a small dedicated Nest controller/service with `@ScreenAccess('old-log-reports')`. This is
   cleaner, but duplicates engine plumbing (guard, actions, error shape).

**Web.** `apps/web/src/screens/OldLogReports.tsx`, registered in `screens/registry.tsx`.

- Do not wrap `MasterScreen`; its `reportOnly` mode still draws the frmMasterPage toolbar.
  Write a custom component instead:
  - the header panel at the Designer positions (WinForms `win-*` classes, Label1 strip, Close
    button);
  - local state for reportType / short / from / to / searchBy / text;
  - a POST to `/api/master/old-log-reports/list` with `{ ids: initialIds, params }`. Look at how
    `useMasterScreen.listBody` shapes it.
- For the grid, reuse AG Grid with `components/ui/gridTheme.ts` (`dataGridViewTheme`), plus F3
  BigTextBox and Ctrl +/- zoom like `MasterGrid`. `MasterGrid` takes a `MasterState`. Either
  extract a state-free core from it (preferred, since this is the first of several report-style
  forms), or build a minimal adapter object. Use `rowKey` (logID plus row index), because Full
  rows repeat logID per work row and some logs have no work rows. Client-side sort and column
  reordering should be on.
- Do the search filter client-side, as the desktop does, with the bugs fixed (table above).
- Context menu: `components/ui/ContextMenu.tsx`.
  - Excel uses `sendTableToExcel` from the rows currently shown, with the SQL column names.
  - The action results come back through the same handling MasterScreen does: `open` →
    `workspace.open`, `work-log` → `useWorkLog()`, `message` → alert. Extract that `switch`
    from `MasterScreen.tsx` (~l.220–250) into a hook so this screen can reuse it.
- Default dates: today. Initial load runs immediately (Form_Load calls FillReport).

**Reuse from Work Report.** `WorkReport.tsx`'s `reportOnly` spec shows only the opening-with-ids
pattern (`initialIds`, `refreshKeepsIds`) and the context-menu building style. The `ShowIn`
helpers do not apply. `work-report.ts` gives `visibleWorkUsers` (scoping, minus IsActive),
`logIdOf`/`parseDay` (the "uid|yyyy-mm-dd" day format, which you can reuse for the two actions)
and the `report` action that already opens this screen with log ids.

**Engine gaps.**

- There is no non-frmMasterPage screen host yet.
- `MasterGrid` is coupled to `MasterState`.
- Action-result handling lives inside `MasterScreen`.
- `ScreenDefinition` has no first-class "report" kind. `readOnly` + `listRows` is enough.

**Tests.**

- Integration test against DBLibSQL:
  - Full and Short row shapes.
  - Scoping for an operator: only self plus EmpReportingT reports, inactive users included.
  - The ids path is scoped.
  - Gap time for a known log, e.g. logID 96958 → TotalGapTime 1500 s = `00:25`.
  - Send To Work Report ids.
- Playwright: open, switch modes, Short disabled for Vibhagwise, search, and the menu gating.

## Ported (2026-10-06)

- **API**: `apps/api/src/master/screens/old-log-reports.ts`, registered in `registry.ts` as a
  read-only `ScreenDefinition` on `log` / `logID` (save and validate refuse, as Work Report's do).
  `listRows` runs FillReport's SQL with Kysely fragments: params `reportType` (zod enum of the 4
  names), `short`, `from`/`to` (`yyyy-mm-dd`, bound as `CAST(@p AS date)`; today when absent).
  `ids` (StrId) replace the dates. Short returns only the 9 ToTable columns (the GROUP BY already
  makes them distinct); Short with Vibhagwise/WorkTypewise is served as Full, as the form forces.
- **Scoping** (server-side, every path): `listFilter` = `reportingScope(user, log.uid)` — the
  self-plus-EmpReportingT half of Work Report's `visibleWorkUsers`, now factored out and shared
  (`work-report.ts`), **without** IsActive. The engine applies it to the date path and the ids path
  alike, so a crafted `ids` list cannot reach other users' logs. `logIdOf` / `parseDay` are shared
  with Work Report too (`logIdOf` now takes the scope condition).
- **F2 (Search By = User)**: `f2.txtsearch`, `SELECT DISTINCT tid, uname … INNER JOIN log`,
  scoped like the report.
- **Actions**: `send-to-work-report` (`day` = "uid|yyyy-mm-dd" of the clicked row) →
  `{kind:'open', screen:'work-report', ids, emptyMessage:'No Record Found'}`, ids scoped with
  `visibleWorkUsers`; `log-report` → `{kind:'work-log', logId}` or "No Record Found", refused (403)
  unless userType is 1 or 5, and the log looked up within the report's scope.
- **Web**: `apps/web/src/screens/OldLogReports.tsx`, a custom component (not `MasterScreen`) with
  the Designer's header panel (Label1 strip, Close, Reports Type, dates, Full/Short, Show
  Report, Search By, Search, lblRecords) over a `DataGrid`. Form_Load fills at once (Datewise,
  Full, today–today or the StrId logs).
- **Engine pieces (generic, every existing screen unchanged)**:
  - `features/master/DataGrid.tsx`: MasterGrid's DataGridView behaviour (FullRowSelect,
    MultiSelect mouse/keyboard selection, drag select, header sort, column reorder, F3, Ctrl +/-,
    right-click selection, context menu) without `MasterState`. `MasterGrid` is now a thin binding
    of it to the master state. New opt-in props: `onContextMenuRow` (the row right-clicked) and
    `header` (a Designer's own ColumnHeadersDefaultCellStyle; `dataGridViewTheme` takes
    `headerTextColor`). F3 now reads the column's own field/header, so two columns bound to one
    field (colGroup + colUser) both show their value.
  - `features/master/useActionRunner.ts`: the action call + result `switch` taken out of
    `MasterScreen` (message / open / table / url / work-log, plus refreshed / list / cells when the
    caller supplies row targets). `MasterScreen` uses it unchanged.
- **Tests**: `apps/api/test/master-old-log-reports.integration.test.ts` (Full/Short shapes and
  values, gap and work time, TargetedWorkQty, order, operator scoping incl. inactive reports, the
  ids path, Master(2) scoped, admin/AMaster unscoped, logID 96958 = 00:25, scoped F2, Send To
  Work Report ids, Send To Log Report gating, write refusal, bad params). Playwright:
  two tests in `apps/web/e2e/batch-b.spec.ts`.

### Deliberate choices and differences

- Send To Excel exports the desktop's SQL columns with their raw names (16 Full / 9 Short, `uid`
  included), in the grid's current order, as a CSV (`sendTableToExcel`); no `'` prefix hack.
  `logdat` is written as `yyyy-mm-dd`. Gated as the desktop does: userType 1 or 5, or user 182.
  The export is client-side from rows the user already sees, so there is no API check to add.
- colDate (Userwise / Vibhagwise / WorkTypewise) keeps the desktop's full date-time display
  (`dd-MM-yyyy 00:00:00`).
- The UpdateLogoutTime rewrite after Send To Log Report is not ported (same as Work Report).
- Send To Work Report and Send To Log Report act on the **right-clicked row** (falling back to
  the current row), not on the row index.
- Search fixes: a comma list is an exact, case-insensitive IN over all values (each value
  trimmed); Remark filters `remarks`; Work Quantity compares as text; quotes are plain text; in a
  Short report the work-column filters match nothing (the desktop threw). Faithful otherwise:
  typing with a blank Search By leaves the previous filter; changing Search By alone does not
  refilter; Show Report shows the new rows unfiltered whatever the box holds; after an F2 pick
  the filter is the picked user (`uid =`).
- lblRecords updates after Show Report and after F2, not while typing (desktop quirk, kept).
- The F2 user list is scoped like the report for everyone (the desktop left Master(2) unscoped).
- Layout: Designer positions, except that the HTML date inputs need 120px (not 90), so the radios
  and Show Report sit 20px further right; the grid stretches to the window (anchored 12/145 to
  25/41 from the edges, standing in for ResizeControl's scaling) and lblRecords stays aligned to
  its right edge.

### Not ported / deferred

- Nothing file-related exists on this form. The hidden "Log Reports" form (`frmLogReports`) stays
  out of scope.
