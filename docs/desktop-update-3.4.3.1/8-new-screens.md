# Slice 8 — screens that exist only in `GGLibrarySolutionUpdated` (v3.4.3.1)

Paths are relative to `GGLibrarySolutionUpdated/` unless they start with `gglib-web/`.
"MISSING"/"PRESENT" = checked with read-only queries against the local `DBLibSQL`
(restored 2026-09-22 from `2102026-DBLibSQL.bak`, backup taken 2026-09-21 on `DESKTOP-M8MLLNV`).

## Read this first — findings that change the plan

1. **No DB object of any of the seven screens exists locally**: no table, no stored procedure, no
   `tblSearch` row, no `Config_Master` row, no `columnmaster` Vibhag (`sys.objects`, `tblSearch`,
   `Config_Master`, `columnmaster` all checked; `sys.sql_modules` has no module mentioning
   `JSeries`, `ShastraPath`, `EmployeeEvaluation` or `LekhNewspaper`). The backup is from
   2026-09-21, i.e. _after_ these forms were written (file dates 2025-12 … 2026-03). Either the
   backup comes from a machine that never ran v3.4.3.1's DB scripts, or these features were never
   deployed. Nothing can be built or verified until the user supplies the DDL + `tblSearch` rows
   (there is no `.sql` anywhere in the Updated tree).
2. **Every one of these forms takes its grid columns, record query, F2 lists and popup row
   queries from `tblSearch`** (`ListGridData` → `GetDataTable`, `GetDataTableById`,
   `F2EntryText`, `JoinCondition`). Those rows are MISSING, so join targets, F2 SQL of the plain
   `…Kt` boxes and the popups' SELECTs **cannot be recovered from the VB**; they are marked
   "unknown (tblSearch)" below.
3. **Only three of the seven are live on the desktop**: J Series Master, Newspaper Bag Inward
   (menu caption "Lekh Inward Entry") and Employee Evaluation. Of the rest:
   - `frmLekhInwardEntry` is **never instantiated** (the menu item of that name opens
     `frmLekhNewspaperBagInward`, `Library/CommonForms/Frmlibmain.vb:1057-1061`). Dead code.
   - `frmShastraPathMaster` — menu item `Visible = False`, never shown at runtime, and its Save
     cannot work (see its section). ShastraPath was instead folded into Tirth Raksha Master
     (`TirthRakshaM.ShastraPathNo`, reference `EntryType` 'ShastraPath' — another slice).
   - `frmEmployeePerformanceEvaluation` — menu item `Visible = False`, never shown, and its
     validation very probably always fails (see its section).
   - `frmLekhNewspaperPages` — reachable only via Bag Inward's right-click "Add Pages"; a
     half-built stub whose Save cannot succeed.
4. Menu visibility: `Frmlibmain_Load` has **no rule** for any of the five new menu items
   (`grep` of `Frmlibmain.vb`: only the click handlers, lines 990, 1045, 1051, 1057, 1063). Only
   the Designer's `Visible` decides. `gglib-web/packages/shared/src/menu.ts` leaves out items
   "hidden in the designer and never shown at runtime", so by that convention only
   Library › J Series Master, Article › Lekh Inward Entry and Employee › Employee Evaluation get
   menu entries.
5. `CommonLibrary.dll` was decompiled from the OLD version only. These forms call
   `EnableDisableDataEditing`, `UcSearch.LoadData`, `DisplayListForm(… AddTableInfo:=…)`,
   `insertworkreports`, `GetEntryUser`, `LockUnlockRecords` with signatures that all exist in the
   old decompile, so I assumed unchanged behaviour; that the new DLL behaves the same is not
   verified.

Web today, for all seven: **not ported at all** — no entry in
`gglib-web/packages/shared/src/menu.ts`, no `ScreenDefinition` in
`gglib-web/apps/api/src/master/screens/`, no component in `gglib-web/apps/web/src/screens/`, no
note in `gglib-web/docs/screens/`. The whole `Article` menu is commented out in `menu.ts`
(lines 147-153).

Behaviour common to all seven (identical boilerplate, same as the already-ported
`frmMasterPage` screens — the web master engine already provides it):

- `Inherits Library.frmMasterPage`; MDI child, `WindowState = Maximized`; toolbar New / Save /
  Modify / Cancel / Copy / Delete / Refresh / Work Report / Help / Exit; `UcSearch1`,
  `UcPrevNext1`, `lblEntry` (= `clsCom.GetEntryUser(table, pk, id)`).
- Form `KeyDown` with Ctrl: Z prev / Y next (UcPrevNext history), F = pick Search By
  (`SELECT Id,DisplayName FROM tblSearch where TransactionName='<T>' and IsSearchable=1 order by seq`),
  N New, M Modify, S Save, B Cancel, D Delete, W Work Report, R Refresh (each only when its
  button is enabled), L / U = `InputBoxProc()` (Security password) then
  `BlTran.LockUnlockRecords(TransactionName, PrimaryColumn, dgMain, True|False)`. Whether the
  tables have a `Locked` column is unknown (tables MISSING) → `lockable` undecidable today.
- Load: `FillList()`; `FillData()`; right-click "Print Report › Selected Column" gets one sub-item
  per `Config_Master` row
  (`select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where ConfigType='<T>' and isnull(ShortcutKey,'')<>'' order by ConfigName`,
  shortcut Ctrl/Alt/Shift + digit); if the grid is empty → `btnNew_Click`, else
  `EnableDisableDataEditing(ToolStrip1)`.
- Grid: `BlTran.ListGridData(TransactionName, PrimaryColumn, StrId, , , <cond>)` (the
  `GetDataTable` proc over `tblSearch`); the Designer fixes column order/headers and the form
  binds `DataPropertyName` by name, so the named columns **must** come out of the tblSearch
  query. Row click / Up / Down → `FillData` (`GetDataTableById`) + `GetWorkReportData`.
  `FillTextBox` maps record columns onto boxes by name: `txt<Col>` ← `<Col>`; `txt<X>Kt` gets
  `.Tag` ← `<X>Kt` and `.Text` ← `<X>Name`.
- Modify / Cancel / Exit use the `DataEditingInfo` edit lock (`EnableDisableDataEditing` mode 1 / 2).
  Exit while editing asks "Are you sure to close this form?" (title "Record cannot be saved").
- Save asks "Are You Sure to Save This Record?"; success "Record Saved Successfully"; Add inserts
  the new row at the top of the grid. Delete asks "Are You Sure to Delete This Record?" then the
  Security password. Copy button: its handler only resets `TranKm`/`StrMode` after
  "Do You Want to Add More With Copying Data?" (no data handling of its own).
- Work Report button → `frmDisplayTransNew` with `TranName = "WorkReport"`, `FormName = "Common"`
  (the web's `WorkReportDialog`).
- Right-click "Print Report › Selected Column" → `clsCom.PrintSelectedColumn(dgMain, T, PK)`;
  "Send To Excel" → `New CommonLibrary.SendtoExcel(dgMain)`.
- No file, image, photo or Crystal Report handling in any of the seven, except two _columns_ that
  only carry a path (`ShastraPathM.RelevantPhotoPath`, `ShastraPathTextT.PhotoPath`) — flagged
  there.

---

### 1. J Series Master — `Library/Library/frmJSeriesMaster.vb`

- **What changed**: new master screen, table `JSeriesM` + child `JSeriesIssueT` ("J" series
  items and whom they are issued to).
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: new screen `j-series-master` (menu Library, after Tirth Raksha Master),
  `ScreenDefinition` + `ScreenSpec`, behaviour note. See note below.
- **DB prerequisites**: `JSeriesM` MISSING, `JSeriesIssueT` MISSING, `tblSearch` rows
  `TransactionName='JSeriesM'` MISSING (0 rows), `Config_Master` `ConfigType='JSeriesM'` none
  (optional). Existing: `PartyM` PRESENT (the five hard-coded ids 3109, 3462, 5696, 5626, 6273 all
  PRESENT), `GetDataTable` PRESENT, `WorkReportM` PRESENT, `DataEditingInfo` PRESENT.
- **Size**: M (half day) once the DB objects exist.

#### Behaviour note draft — J Series Master (`JSeriesM`)

Desktop form: `Library/Library/frmJSeriesMaster.vb` (+ `.Designer.vb`, title "J Series Master").
Repository `Library.BusinessContract/Concrete/JSeriesRepository.vb`, interface
`Abstract/IJSeriesRepository.vb`, entity `Library.Entity/EntJSeries.vb`. Popup: `SetForm_JSeries`
in `Library/CommonForms/frmDisplayTransNew.vb:11919-11979`.
Menu: **Library › J Series Master** (last item; `Frmlibmain.Designer.vb:939-943`, visible, no
runtime rule; handler `Frmlibmain.vb:1063`). Not opened from any other form.

**Table and key**

- Table `JSeriesM`, PK `JSeriesKm` (IDENTITY: `SELECT @@identity`). `TransactionName = "JSeriesM"`,
  `PrimaryColumn = "JSeriesKm"`, `DefaultCond = ""` (no default condition, no JoinCond).
- Child `JSeriesIssueT`, PK `JSeriesIssueKm` (IDENTITY), FK `JSeriesKt`.

**Fields** (SplitContainer 1008×642, SplitterDistance 84; boxes Times New Roman 14.25pt, 29px
high; labels Times New Roman 11.25pt)

| Control                                 | Label                    | Column                                                                     | Type (inferred)       | Notes                                                                |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `txtJSeriesName` (115,7 w210, tab 1)    | "J Series Name" (6,14)   | `JSeriesName`                                                              | string                | trimmed; not required (rule commented out)                           |
| `txtJSeriesTypeKt` (465,7 w223, tab 10) | "J Series Type" (367,14) | `JSeriesTypeKt` (`.Tag`) / `JSeriesTypeName` (text, from the record query) | int FK                | F2 from tblSearch (unknown); `Val(Tag)` → 0 when empty; not required |
| `txtJSeriesNo` (797,7 w206, tab 21)     | "J Series No" (715,14)   | `JSeriesNo`                                                                | varchar, 'J' + number | **ReadOnly**; filled on New; derived                                 |
| `txtIssueTran` (115,44 w210, tab 67)    | "Issue" (6,51)           | summary column `IssueTran` of the record query                             | —                     | F2 opens the Issue popup                                             |
| `txtRemark` (465,44 w538, tab 34)       | "Remark" (367,51)        | `Remark`                                                                   | string                | trimmed                                                              |

Audit: `enuser`/`endate` on insert, `moduser`/`moddate` on update (`getdate()`).

**Validation (`JSeriesRepository.GetValidationMessage`)** — returns `""` always. Both rules are
commented out (`- J Series Name Is Mandatory`, `- J Series Type Is Mandatory`), so there is **no
validation**.

**F2 lookups**

| Field                         | Source                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `txtJSeriesTypeKt`            | generic branch: `select isnull(F2EntryText,'') F2EntryText,ISNULL(AddTableInfo,'') AS AddTableInfo from tblSearch where TransactionName='JSeriesM' and (ColumnName='JSeriesTypeKt' or ColumnName='JSeriesTypeKt')` → `DisplayListForm(…, boolSelectFirst True, AddTableInfo)`. **F2EntryText unknown (tblSearch row MISSING)**; no `columnmaster` Vibhag containing "JSeries" exists locally. |
| `txtIssueTran`                | popup, see below                                                                                                                                                                                                                                                                                                                                                                              |
| `txtJSeriesName`, `txtRemark` | same generic branch; meaningful only if tblSearch has F2EntryText for them (unknown)                                                                                                                                                                                                                                                                                                          |

**Grid columns** — `ListGridData` (tblSearch); the Designer fixes: `JSeriesKm` (header
"JSeriesKm", width 5), `JSeriesNo` "J Series No", `JSeriesName` "J Series Name" (200),
`JSeriesTypeName` "JSeries Type" (150), `Remark` "Remark" (300). Grid font Arial Unicode MS 12,
header 9.

**Derived values**

- `GetNewJSeriesNo` (New button, and again inside Save for an insert — the box value is ignored on
  insert): `SELECT 'J' + CAST(ISNULL(MAX(CAST(REPLACE(JSeriesNo,'J','') AS int)),0)+1 AS varchar(5)) FROM JSeriesM`
- On update `JSeriesNo` is written back from the read-only box.

**Child tables saved with the record** — `Save(Ent, dtIssue)`, one `SqlTransaction`, committed
(`JSeriesRepository.vb:17-119`):

```
INSERT INTO JSeriesM (JSeriesName,JSeriesNo,JSeriesTypeKt,Remark,enuser,endate)  VALUES (@JSeriesName,@JSeriesNo,@JSeriesTypeKt,@Remark,@enuser,getdate())
Update JSeriesM SET JSeriesName=@JSeriesName,JSeriesNo=@JSeriesNo,JSeriesTypeKt=@JSeriesTypeKt,Remark=@Remark,moduser=@moduser,moddate=getdate() WHERE JSeriesKm=@JSeriesKm
```

Issue rows, only when the popup was opened (`dtIssue.Columns.Count > 0`); key ≤ 0 → insert:

```
INSERT INTO JSeriesIssueT(JSeriesKt,PartyKt,Remark,Seq,enuser,endate,IssueDate,ReturnDate) VALUES (@JSeriesKt,@PartyKt,@Remark,@Seq,@enuser,GETDATE(),@IssueDate,@ReturnDate)
UPDATE JSeriesIssueT SET PartyKt=@PartyKt,IssueDate=@IssueDate,ReturnDate=@ReturnDate,Remark=@Remark,Seq=@Seq,moduser=@moduser,moddate=GETDATE() WHERE JSeriesIssueKm=@JSeriesIssueKm
DELETE FROM JSeriesIssueT WHERE JSeriesKt=<id> And JSeriesIssueKm Not IN(0, <kept keys>)
```

`IssueDate` / `ReturnDate`: NULL when the cell is empty, else `CType(cell, Date)`.

Issue popup — `frmDisplayTransNew`, `TranName = "Issue"`, `FormName = "JSeries"`,
`TranId = TranKm`; rows from `tblSearch.F2EntryText` of `ColumnName='IssueTran'`, `Type='T'`,
`{Id}` replaced by the record id (**SQL unknown**; columns it must return, from the save and
`SetForm_JSeries`: `JSeriesIssueKm, PartyKt, PartyName, IssueDate, ReturnDate, Remark, Seq`).
`SetForm_JSeries`: new row gets a random key −500…−1 and `Seq` = row count + 1 (first row `Seq`
1); hidden `JSeriesIssueKm`, `PartyKt`; F2 on:

- `PartyName`: `SELECT partyMkm,PName AS PartyName FROM PartyM WHERE partyMkm IN(3109,3462,5696,5626,6273) ORDER BY PName`
  (select-first, search text) → sets `PartyKt` / `PartyName`, moves to `IssueDate`.
- `IssueDate`: `InputBox("Please Enter Issue Date(Ex-dd/MM/yyyy)", , <default>)`, default = today
  `dd/MM/yyyy` when the cell is empty → stores the typed text, moves to `ReturnDate`.
- `ReturnDate`: `InputBox("Please Enter Return Date(Ex-dd/MM/yyyy)", , <today or current value>)`
  → moves to `Remark`.

After the popup's Save the box text is rebuilt from the rows (every non-key / non-`kt` / `km` /
`id` / `seq` column, joined with "-" inside a row and "," between rows — the standard summary,
`transSummary.ts` on the web).

**Right-click menu** (`cntMenu`, attached to `dgMain`)

| Item                                                     | Behaviour             |
| -------------------------------------------------------- | --------------------- |
| Print Report › Selected Column (+ Config_Master layouts) | `PrintSelectedColumn` |
| Print Report › Send To Excel                             | `SendtoExcel(dgMain)` |

**Save flow / work report** — after Save: `clsCom1.insertworkreports("JSeriesM","JSeriesKm",id,curr_lnid,dtSel,dtTmpSel)`
for Add (both tables empty → an Add entry) and Edit (old vs new record) → `workReport: true`.
Delete logs nothing.

**Delete** — `Delete()` calls `BlTran.DeleteTransaction(id)` first, which is
`Throw New NotImplementedException()` (`JSeriesRepository.vb:136-138`) → the form shows "The method
or operation is not implemented." and **nothing is deleted**. The intended next step,
`BlTran.Delete("JSeriesM","JSeriesKm",id)` (CommonRepository's plain delete) + "Record Deleted ",
is never reached. Child rows would be orphaned by it anyway.

**Reports and printing** — Selected Column only; no `.rpt`.

**Permissions** — none beyond the menu: `EnableDisableDataEditing(ToolStrip1)` with no user
check. `btnCopy.Enabled = False` after load.

**SQL in form event handlers** — the tblSearch queries above; nothing else.

**Desktop bugs (do not reproduce silently — decide)**

- `ReturnDate` is saved from the **IssueDate** cell: `AddWithValue("ReturnDate", CType(dtIssue.Rows(i)("IssueDate"), Date))`
  (`JSeriesRepository.vb:89`). An issue with a return date but no issue date throws.
- `SetForm_JSeries` s=1 (add row) sets the current cell to column `"VibhagName"`, and the
  IssueDate F2 reads `Cells("DepositDate")` when the cell already has a value
  (`frmDisplayTransNew.vb:11937`, `11954`) — both copy-paste leftovers that throw (and show the
  error box) unless the F2EntryText happens to return such columns (not verifiable).
- Dates are typed as free text and parsed with the machine's culture.
- Delete never works (above).

**Closest web pattern / engine fit** — `gglib-web/apps/api/src/master/screens/tirth-raksha.ts`
for one plain upsert popup (`upsertChildRows`, `audit: true`, as its Kshetra popup) +
`newDefaults` for the number; panel as simple as `lipi.ts` / `LipiMaster.tsx`. The generic engine
fits as is, provided the popup can take a typed date cell (check how `DisplayTransDialog`
handles the desktop's `InputBox` cells before assuming).

---

### 2. Shastra Path Master — `Library/Library/frmShastraPathMaster.vb`

- **What changed**: new master screen `ShastraPathM` with eight child tables, modelled on Tirth
  Raksha Master.
- **Kind**: new feature — **hidden and not functional on the desktop**.
- **Web today**: not ported. (`tirth-raksha.ts` / `TirthRakshaMaster.tsx` are the same shape.)
- **Web change needed**: recommend **none now** (see open question 2). If wanted: a screen built
  like Tirth Raksha, minus its group / BookSeq logic.
- **DB prerequisites**: `ShastraPathM`, `ShastraPathAuthorT`, `ShastraPathAuthorAuthorT`,
  `ShastraPathAuthorAuthorTypeT`, `ShastraPathReferenceT`, `ShastraPathTextT`,
  `ShastraPathSamvatT` all MISSING; `tblSearch` `TransactionName='ShastraPathM'` MISSING;
  `columnmaster` Vibhag `ShastraPathTextType` MISSING (0 rows); proc `UpdateVishay` PRESENT but
  its local body has no `ShastraPath…` branch (so it would not write the summary columns);
  `VishayEntry` PRESENT. Lookup tables PRESENT: `authmast`, `authtype`, `AuthMAnyNmT`,
  `Sampraday`, `visheshMast`, `samvmast`, `sadimst`, `BookT`, `BookM`, `AvrutiMast`,
  `columnmaster` (Vibhag `Sign` 21 rows, `AuthSamKind` 72, `DoneBy` 66).
- **Size**: L (day+).

#### Behaviour note draft — Shastra Path Master (`ShastraPathM`)

Desktop form: `Library/Library/frmShastraPathMaster.vb` (+ `.Designer.vb`, title "ShastraPath
Master"). Repository `Concrete/ShastraPathRepository.vb`, interface
`Abstract/IShastraPathRepository.vb`, entity `Library.Entity/EntShastraPathM.vb`. Popups:
`setform_ShastraPath` in `frmDisplayTransNew.vb:11413-11851`; `frmVishayEntry`;
`CommonRepository.SaveVishayEntry` (`Concrete/CommonRepository.vb:181-222`).

Opened from: **Library › Shastra Path Master** — `ShastraPathMasterToolStripMenuItem.Visible = False`
(`Frmlibmain.Designer.vb:498-503`), never made visible → unreachable from the menu. Also
**Work Report › right-click › Show In › Shastra Path Master**
(`Library/Employee/frmWorkReportM.vb:816-837`): collects `RecordNo` of the selected rows whose
`TableName` is `shastrapathm`, "No Records Found" when none, else opens the form with
`StrId = <ids>`. (That item exists in the web's Work Report only if the other slice adds it.)

**Table and key** — `ShastraPathM`, PK `ShastraPathKm` (IDENTITY). No default condition; the form
honours a `WhereCondition` passed by a caller.

**Fields** (SplitContainer SplitterDistance 225; box columns x=159 / 506 / 844, rows y=18 … 178
step 40)

| Control (x,y)                    | Label              | Column                                        | Notes                                                                                                                                     |
| -------------------------------- | ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `txtMatterKt` (159,18)           | "Matter/Tirth"     | `MatterKt` / `MatterName`                     | F2 from tblSearch (unknown)                                                                                                               |
| `txtReferenceTran` (506,18)      | "Reference"        | summary `ReferenceTran`                       | popup                                                                                                                                     |
| `txtShastraPathNo` (844,18)      | "ShastraPath No"   | `ShastraPathNo` int                           | ReadOnly; New: `finxmaxtid("ShastraPathM","ShastraPathNo")` = `select isnull(max(ShastraPathNo ),0) from ShastraPathM` + 1 (1 when empty) |
| `txtGranthName` (159,58)         | "Granth Name"      | `GranthName`                                  | trimmed                                                                                                                                   |
| `txtTextTran` (506,58)           | "Text"             | summary `TextTran`                            | popup                                                                                                                                     |
| `txtSamvatTran` (844,58)         | "Samvat"           | summary `SamvatTran`                          | popup                                                                                                                                     |
| `txtGranthTypeKt` (159,98)       | "Granth Type"      | `GranthTypeKt` / `GranthTypeName`             | F2 from tblSearch (unknown)                                                                                                               |
| `txtSummaryTran` (506,98)        | "Summary"          | `SummaryTran` (shown through `GetcontString`) | `frmVishayEntry`                                                                                                                          |
| `txtProjectDetailKt` (844,98)    | "Project Detail"   | `ProjectDetailKt` / `ProjectDetailName`       | F2 from tblSearch (unknown)                                                                                                               |
| `txtAuthTran` (159,138)          | "Author"           | summary `AuthTran`                            | popup                                                                                                                                     |
| `txtSubjectTran` (506,138)       | "Subject"          | `SubjectTran` (`GetcontString`)               | `frmVishayEntry`                                                                                                                          |
| `txtRemarkTran` (844,138)        | "Remark"           | `RemarkTran` (`GetcontString`)                | `frmVishayEntry`                                                                                                                          |
| `txtAuthorSampradayKt` (159,178) | "Author Sampraday" | `AuthorSampradayKt` / `AuthorSampradayName`   | F2 from tblSearch (unknown)                                                                                                               |
| `txtGradeSubjectKt` (506,178)    | "Grade Subject"    | `GradeSubjectKt` / `GradeSubjectName`         | F2 from tblSearch (unknown)                                                                                                               |

Columns written but with no control: `txtAuthor`, `RelevantPhotoPath` (**file path — web defers
files/images**), `Summary`, `Subject`, `Remark` (the form never sets these entity properties),
`VikramSamvat`, `Isvisan`, `SamvatRemark` (from the first Samvat row).

**Validation** — `ShastraPathRepository.GetValidationMessage` is
`Throw New NotImplementedException()` (`ShastraPathRepository.vb:15-17`), and the form calls it
(`frmShastraPathMaster.vb:733`) → every Save ends in the form's `Catch` with "The method or
operation is not implemented.". **Save never reaches the repository.**

**Save (as written, never executed)** — `Save(Ent, dtAuthor, dtAuthorAuthType, dtAuthorAuth, dtReference, dtText, dtSummary, dtSubject, dtSamvat, dtRemark)`:

```
INSERT INTO ShastraPathM (ShastraPathNo,MatterKt,GranthName,GranthTypeKt,txtAuthor,RelevantPhotoPath,AuthorSampradayKt,GradeSubjectKt,Summary,Subject,ProjectDetailKt,Remark,enuser,endate) VALUES (@ShastraPathNo,@MatterKt,@GranthName,@GranthTypeKt,@txtAuthor,@RelevantPhotoPath,@AuthorSampradayKt,@GradeSubjectKt,@Summary,@Subject,@ProjectDetailKt,@Remark,@enuser,getdate())
UPDATE ShastraPathM SET ShastraPathNo=@ShastraPathNo,MatterKt=@MatterKt,GranthName=@GranthName,GranthTypeKt=@GranthTypeKt,txtAuthor=@txtAuthor,RelevantPhotoPath=@RelevantPhotoPath,AuthorSampradayKt=@AuthorSampradayKt,GradeSubjectKt=@GradeSubjectKt,Summary=@Summary,Subject=@Subject,ProjectDetailKt=@ProjectDetailKt,Remark=@Remark,moduser=@moduser,moddate=getdate() WHERE ShastraPathKm=@ShastraPathKm
```

then, in this order:

1. `SaveVishayEntry(dtSubject,"ShastraPathSubject","ShastraPathM","ShastraPathKm",id)`, same for
   `dtSummary` → `"ShastraPathSummary"`, `dtRemark` → `"ShastraPathRemark"`, and
   `SaveVishayEntry(dtText,"ShastraPathText","ShastraPathM","ShastraPathTextKm",id)` (passes the
   Text popup's _row_ table, not `dtTextText`; wrong table/column pairing).
2. Author (nested, as Tirth Raksha / Prakashak): `ShastraPathAuthorT(ShastraPathKt,txtAuth,Seq,enuser,endate)`
   with `txtAuth` = `authortype` + "-" + `authorname`; per author
   `ShastraPathAuthorAuthorTypeT(ShastraPathKt,ShastraPathAuthorKt,AuthorTypeKt,SignKt,Seq,enuser,endate)`
   and `ShastraPathAuthorAuthorT(ShastraPathKt,ShastraPathAuthorKt,authorkt,padkt,signkt,AuthAnyaNmKt,Seq,enuser,endate)`;
   updates set the same columns + `moduser/moddate`; then `DELETE … WHERE ShastraPathKt=<id> AND <key> NOT IN(<kept>)`
   for the three tables (type, author, then parent).
3. Reference: `ShastraPathReferenceT(ShastraPathKt,BookTKt,PageNo,Remark,Seq,enuser,endate)`,
   upsert + delete-not-kept.
4. Text: `ShastraPathTextT(ShastraPathKt,TextTypeKt,CheckedByKt,PhotoPath,Seq,enuser,endate)`,
   upsert + delete-not-kept (`PhotoPath` — **file path, deferred on the web**; the column is
   hidden in the popup and nothing sets it).
5. Samvat: `ShastraPathSamvatT(ShastraPathKt,SamvatKindKt,Remark,AsamvatKt,Asamvat,Vksamvat,Isvisan,BookTKt,PageNo,SthalKt,IsPrint,seq,enuser,endate)`,
   upsert + delete-not-kept, then
   `UPDATE ShastraPathM SET VikramSamvat=@VikramSamvat,Isvisan=@Isvisan,SamvatRemark=@SamvatRemark WHERE ShastraPathKm=@ShastraPathKm`
   from the first Samvat row (0 when none).

Even with validation fixed this Save cannot work: `Ent.txtAuthor`, `RelevantPhotoPath`,
`Summary`, `Subject`, `Remark` are `Nothing` (ADO.NET then omits the parameter → "expects the
parameter … which was not supplied"), and **there is no `MyTrans.Commit()`** in `Save`
(`ShastraPathRepository.vb:19-247`; the only Commit, line 302, is in Delete) → everything rolls
back when the connection closes.

**F2 lookups / popups** (rows from `tblSearch.F2EntryText`, Type 'T', `{Id}` = record id — SQL
unknown; cell lists verbatim from `setform_ShastraPath`):

| Box                                                 | Popup                                                                                                                                                                                                           | Cell lists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `txtAuthTran`                                       | `frmDisplayTransNew` `TranName="Author"`, `FormName="ShastraPath"`, DataSet of 3 tables (`dtAuthor1`, `dtAuthorAuth`, `dtAuthorAuthType`); col 2 opens child `multiauthortype`, col 3 opens child `multiauthor` | `select authtycokm,authortype from authtype order by authortype`; `select columnmastkm,name from columnmaster where vibhag = 'sign' and isnull(columnno,0)<10 order by name`; author list `select a.authorcokm,a.txtauthorname AS authorname,isnull(a.txtGuru,'') As Guru,a.identyty,isnull(a.count,0) count,isnull(a.recordno,0) recordno ,isnull(c.name,'') as vibhag,a.txtParampara as Parampara,txtGuru AS Guru,isnull(v.SampradayName,'') as samprady,a.txtSampraday AS SampradayTran,isnull(a.vksamvat,0) vksamvat,a.authorname as mainname from authmast as a  left outer join columnmaster as c on a.vibhagkt=c.columnmastkm left outer join Sampraday as v on a.sampradayKt=v.SampradayKm`; any-name `select REPLACE(0,0,0) as id,authorname as AnyaName from authmast where authorcokm=<authorkt> union select AuthAnyaNmKm as ID,AnyaName  from AuthMAnyNmT where AuthmastKt=<authorkt>`; padvi `select tid,vishesh from visheshmast where Vibhag='avastha' and isnull(visheshno,0)>5 order by vishesh` |
| `txtSamvatTran`                                     | `TranName="Samvat"`                                                                                                                                                                                             | `select ColumnMastkm,Name,isnull(Brief,N'') as Brief,isnull(Remark,N'') as Remark from columnmaster where Vibhag='AuthSamKind' order by Name`; `select Samvatcokm,Samvatname  from Samvmast ORDER BY SAMVATCOKM DESC`; `select sadivalue,sadinm from sadimst order by sadinm`; `select Tid,LibNo from BookT WHERE ISNULL(LibNo,'')<>'' ORDER BY LibNo`; `select Tid,Vishesh from visheshmast where Vibhag='city' and ISNULL(vishesh,'')<>'' order by Vishesh`; Vksamvat via `GetVikramSamvat`, `Isvisan = Vksamvat − 56` (same as Tirth Raksha's)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `txtReferenceTran`                                  | `TranName="Reference"`                                                                                                                                                                                          | LibNo: `SELECT BookT.Tid,BookT.Libno,BookM.BookName + CASE WHEN ISNULL(BookM.part,'')='' THEN '' ELSE ' ' + BookM.Part END AS BookName,bookm.PSamvatVK AS Samvat,AvrutiMast.Avrutiname As Avruti,BookM.txtAuthor AS Author FROM BookT INNER JOIN BookM ON BookT.BookMastkt=BookM.BookMastkm LEFT JOIN AvrutiMast ON BookM.Avrutikt=AvrutiMast.Avrutitid WHERE ISNULL(BookT.Libno,'')<>'' ORDER BY BookT.Libno`; editable PageNo, Remark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `txtTextTran`                                       | `TranName="Text"`, DataSet (`dtText`, `dtTextText`)                                                                                                                                                             | `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='ShastraPathTextType' ORDER BY Name` (AddTableInfo `ColumnMaster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ShastraPathTextType`); `Text`cell →`frmVishayEntry`over`dtTextText`("Please Save Record First" when the row key is 0; "Please Click on Modify from Main Record to Save Text" + "Are you sure to opn Detail?" when not editing);`SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='DoneBy' AND ISNULL(Name,'')<>'' ORDER BY Name` |
| `txtRemarkTran`, `txtSummaryTran`, `txtSubjectTran` | `frmVishayEntry(TranKm, dt)` straight from the box                                                                                                                                                              | VishayEntry rows of `ShastraPathRemark` / `ShastraPathSummary` / `ShastraPathSubject`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Grid columns** — Designer: `ShastraPathKm` "Id" (5), `ShastraPathNo` "No" (70), `MatterName`
"Matter" (200), `GranthName` "Granth Name" (200), `txtAuthor` "Author Name" (200),
`GradeSubjectName` "Grade", `SubjectTran` "Subject" (200, through `GetcontString`).

**Delete** — `ShastraPathRepository.Delete(StrId)` in one committed transaction: the four
`DELETE VishayEntry FROM VishayEntry LEFT JOIN ShastraPathM ON VishayEntry.RecordKt=ShastraPathM.ShastraPathKm WHERE TransactionName='ShastraPath{Remark|Summary|Subject|Text}' AND VishayEntry.RecordKt IN (<id>)`,
then `DELETE FROM` `ShastraPathAuthorAuthorTypeT`, `ShastraPathAuthorAuthorT`,
`ShastraPathAuthorT`, `ShastraPathSamvatT`, `ShastraPathReferenceT`, `ShastraPathTextT`
`WHERE ShastraPathKt IN(<id>)`, then `DELETE FROM ShastraPathM WHERE ShastraPathKm IN(<id>)`;
"Record Deleted ". No work-report entry.

**Right-click menu** — `cntMenu` is defined (Print Report › Selected Column / Send To Excel;
For Selected Record › Book Master) but **never assigned to `dgMain.ContextMenuStrip`** in the
Designer or code → no context menu appears. Book Master's handler would open
`frmBookMasterNew` with
`WhereCondition = " AND BookMastKm IN(SELECT DISTINCT BookT.BookMastkt FROM ShastraPathReferenceT INNER JOIN BookT ON ShastraPathReferenceT.BookTKt=BookT.tid WHERE ShastraPathReferenceT.ShastraPathKt IN(<selected ids>))"`.

**Work report** — `insertworkreports` on Add and on Edit (old vs new). **Permissions** — none.
**Reports** — Selected Column only.

**Closest web pattern / engine fit** — `tirth-raksha.ts` + `TirthRakshaMaster.tsx` almost
one-to-one (nested author popup, Samvat popup with `withVksamvat`, `FieldSpec.vishayEntry`
boxes, `upsertChildRows`, custom `deleteRecord`). Engine fits as is.

---

### 3. Lekh Inward Entry — `Library/Article/frmLekhInwardEntry.vb`

- **What changed**: a new form class `frmLekhInwardEntry` (table `LekhInwardM`) exists in the
  project (`Library.vbproj:199-202`), but **nothing creates it** — `grep -rn "frmLekhInwardEntry"`
  over the Updated tree finds only its own two files. The menu item captioned "Lekh Inward Entry"
  opens `frmLekhNewspaperBagInward` (screen 4).
- **Kind**: new feature, dead code (superseded by screens 4 / 5 — the later file dates,
  2026-03-07 vs 2025-12-24, agree).
- **Web today**: not ported.
- **Web change needed**: recommend **none** (open question 3).
- **DB prerequisites**: `LekhInwardM` MISSING; `tblSearch` `TransactionName='LekhInwardM'` MISSING.
- **Size**: S–M if wanted anyway (a flat master like `holiday.ts`).

#### Behaviour note draft — Lekh Inward Entry (`LekhInwardM`)

Form title "Lekh Inward Entry"; repository `Concrete/LekhInwardRepository.vb`, entity
`Library.Entity/EntLekhInwardM.vb`. Table `LekhInwardM`, PK `LekhInwardKm` (IDENTITY). No default
condition.

| Control (x,y w)                                                   | Label               | Column            | Notes                                                                                          |
| ----------------------------------------------------------------- | ------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `txtTitle` (82,10 w200)                                           | "Title"             | `Title`           | trimmed; **kept on New**                                                                       |
| `dtpBagReceivedDate` (443,10 w200), DateTimePicker `dd-MM-yyyy`   | "Bag Received Date" | `BagReceivedDate` | sent as `MM/dd/yyyy` text; always has a value; **kept on New**                                 |
| `txtNewspaperDate` (799,13 w200), MaskedTextBox mask `00/00/0000` | "Newspaper Date"    | `NewsPaperDate`   | NULL unless the mask is complete; parsed as dd/MM/yyyy; **kept on New**; shown as `dd-MM-yyyy` |
| `txtPageNo` (82,50)                                               | "Page No"           | `PageNo`          | text                                                                                           |
| `txtLekhNo` (443,50)                                              | "Lekh No"           | `LekhNo`          | text                                                                                           |
| `txtMixedNewspaper` (799,50)                                      | "Mixed Newspaper"   | `MixedNewspaper`  | text                                                                                           |
| `txtRemark` (83,90)                                               | "Remark"            | `Remark`          | text                                                                                           |
| `txtErrors` (444,90)                                              | "Errors"            | `Errors`          | text                                                                                           |
| `txtCorrection` (799,90)                                          | "Correction"        | `Correction`      | text                                                                                           |

- **Validation**: `GetValidationMessage` has one rule, "Please Enter Bag Received Date", but the
  form **never calls it**; Save goes straight to the repository.
- **F2**: `Txt_KeyDown` reacts to F2 / F3 with an empty body — no lookups.
- **Grid** (tblSearch): `LekhInwardKm` "Id" (5), `Title`, `BagReceivedDate` "Bag Received Date"
  (180, format `d`), `NewspaperDate` (120), `PageNo`, `LekhNo`, `MixedNewspaper` (250), `Errors`,
  `Correction`.
- **Save** (one transaction, committed):
  `INSERT INTO LekhInwardM (Title,BagReceivedDate,NewsPaperDate,PageNo,LekhNo,Remark,Errors,Correction,MixedNewspaper,enuser,endate)  VALUES (@Title,@BagReceivedDate,@NewsPaperDate,@PageNo,@LekhNo,@Remark,@Errors,@Correction,@MixedNewspaper,@enuser,getdate())` /
  `Update LekhInwardM SET Title=@Title,BagReceivedDate=@BagReceivedDate,NewsPaperDate=@NewsPaperDate,PageNo=@PageNo,LekhNo=@LekhNo,Remark=@Remark,Errors=@Errors,Correction=@Correction,MixedNewspaper=@MixedNewspaper,moduser=@moduser,moddate=getdate() WHERE LekhInwardKm=@LekhInwardKm`.
- **Delete**: asks, takes the password, then does nothing (the delete call is commented out).
- **Work report**: `insertworkreports` on Add and Edit. **Right-click**: `cntMenu` (Print
  Report › Selected Column / Send To Excel) is not attached to the grid. **Permissions**: none
  (an admin/AMaster-only toolbar rule is commented out).
- **Closest web pattern**: `holiday.ts` / `HolidayMaster.tsx`; engine fits as is.

---

### 4. Lekh Newspaper Bag Inward — `Library/Article/frmLekhNewspaperBagInward.vb`

- **What changed**: new screen recording which newspaper issue (newspaper + date) arrived in
  which bag on which day. This is what **Article › Lekh Inward Entry** opens.
- **Kind**: new feature
- **Web today**: not ported; the `Article` menu is commented out in `menu.ts`.
- **Web change needed**: new screen (suggested id `lekh-inward-entry`, desktop form
  `frmLekhNewspaperBagInward`), an `Article` menu with this item, `ScreenDefinition` +
  `ScreenSpec`, behaviour note.
- **DB prerequisites**: `LekhNewspaperBagInward` MISSING, `LekhNewspaperBagInwardM` MISSING (the
  UPDATE's table name — see bugs), `LekhNewspaperDate` MISSING, `tblSearch`
  `TransactionName='LekhNewspaperBagInward'` MISSING, `columnmaster` Vibhag `LekhNewspaper`
  MISSING (0 rows; only `LekhMark` exists). `columnmaster` table PRESENT.
- **Size**: M (half day) once the DB objects exist.

#### Behaviour note draft — Newspaper Bag Inward (`LekhNewspaperBagInward`)

Desktop form: `Library/Article/frmLekhNewspaperBagInward.vb` (+ `.Designer.vb`, title
"Newspaper Bag Inward"). Repository `Concrete/LekhNewspaperBagInwardRepository.vb`, interface
`Abstract/ILekhNewspaperBagInwardRepository.vb`. Entity **`EntLekhNewspaperBagInward`**, which
lives inside `Library.Entity/EntLekhNewspaperDate.vb` (that file holds three classes:
`EntLekhNewspaperDate` — unused by any form —, `EntLekhNewspaperBagInward`,
`EntLekhNewspaperPage`).
Menu: **Article › Lekh Inward Entry** (`Frmlibmain.Designer.vb:561`, `578-582`, visible, no
runtime rule; handler `Frmlibmain.vb:1057`). The `Article` top menu is visible to everyone.

**Table and key** — `TransactionName = "LekhNewspaperBagInward"`,
`PrimaryColumn = "LekhNewspaperBagInwardKm"` (IDENTITY). Parent/lookup table
`LekhNewspaperDate` (`LekhNewspaperDateKm` IDENTITY; one row per newspaper + date), created on
demand by Save. No default condition.

**Fields** (SplitterDistance 127)

| Control (x,y w)                                                 | Label                      | Column                                                                         | Notes                                                                                                                                                        |
| --------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dtpBagReceivedDate` (160,10 w123), DateTimePicker `dd-MM-yyyy` | "Bag Received Date" (8,14) | `LekhNewspaperBagInward.BagReceivedDate`                                       | sent as `MM/dd/yyyy` text; **kept on New**                                                                                                                   |
| `txtNewspaperKt` (480,12 w200)                                  | "Newspaper Name" (333,16)  | `.Tag` → `LekhNewspaperDate.NewspaperKt`; text ← record column `NewspaperName` | F2 / F3 list; **kept on New** (Tag and text)                                                                                                                 |
| `dtpNewspaperDate` (849,10 w150), DateTimePicker `dd-MM-yyyy`   | "Newspaper Date" (707,14)  | `LekhNewspaperDate.NewsPaperDate`                                              | always a date (the repository's "NewsPaperDate IS NULL" branches are unreachable); on New it keeps whatever it shows (`clsCom.clear` only empties TextBoxes) |
| `txtRemark` (160,50, 839×57, multiline)                         | "Remark" (8,54)            | `Remark`                                                                       | trimmed                                                                                                                                                      |

**Validation (`LekhNewspaperBagInwardRepository.GetValidationMessage`)**, joined with CrLf:

- `- Bag Received Date is Mandatory` (never fires: the picker always has a value)
- `- Newspaper Name is Mandatory` (`Val(NewspaperKt) = 0`)

**F2 lookups** — F2 **or F3** on `txtNewspaperKt`:
`SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='LekhNewspaper' ORDER BY Name` with
`AddTableInfo:="columnmaster|LekhNewspaper"` (the list can add a new newspaper to
`columnmaster`). Inline in the form (`frmLekhNewspaperBagInward.vb:399-401`), not from tblSearch.

**Grid columns** (tblSearch query must return these names): `LekhNewspaperBagInwardKm` "Id" (5),
`BagReceivedDate` "Bag Received Date" (160, format `d`), `NewspaperName` "Newspaper Name" (250),
`NewspaperDate` "Newspaper Date" (120, `d`), `Remark` "Remark" (400). The record query must also
return `NewspaperKt` (for the box's Tag). The joins to `LekhNewspaperDate` / `columnmaster` live
in tblSearch (unknown).

**Save** (`Save(Ent)`, one transaction, committed; `LekhNewspaperBagInwardRepository.vb:16-97`)

1. Find the newspaper-date row:
   `SELECT ISNULL(LekhNewspaperDateKm,0) FROM LekhNewspaperDate WHERE NewspaperKt=<kt> AND NewsPaperDate='<MM/dd/yyyy>'`
   (0 when no row).
2. If 0: `INSERT INTO LekhNewspaperDate (NewspaperKt,NewsPaperDate,enuser,endate)  VALUES (@NewspaperKt,@NewsPaperDate,@enuser,getdate())`, `SELECT @@identity`.
3. Add: `INSERT INTO LekhNewspaperBagInward (LekhNewspaperDateKt,BagReceivedDate,Remark,enuser,endate)  VALUES (@LekhNewspaperDateKt,@BagReceivedDate,@Remark,@enuser,getdate())`
   Edit: `Update LekhNewspaperBagInwardM SET LekhNewspaperDateKt=@LekhNewspaperDateKt,BagReceivedDate=@BagReceivedDate,Remark=@Remark,moduser=@moduser,moddate=getdate() WHERE LekhNewspaperBagInwardKm=@LekhNewspaperBagInwardKm`

Nothing prevents two bag rows for the same newspaper date. `LekhNewspaperDate` rows are never
deleted or cleaned up.

**Delete** — asks "Are You Sure to Delete This Record?", takes the Security password, then
**does nothing** (the `BlTran.Delete` block is commented out, `frmLekhNewspaperBagInward.vb:529-543`).

**Right-click menu** (`cntMenu`, attached to `dgMain`)

| Item                                           | Behaviour                                                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel | standard                                                                                                                                  |
| Add Pages                                      | opens `frmLekhNewspaperPages` as an MDI child with `txtLekhNewspaperDateKt.Tag = <grid Id>` and `.Text = <NewspaperDate cell>` (screen 5) |

**Work report** — `insertworkreports` on Add and on Edit → `workReport: true`, not on delete.
**Permissions** — none. **Reports** — Selected Column only.
**SQL in form event handlers** — the F2 list above.

**Desktop bugs**

- INSERT goes to `LekhNewspaperBagInward`, UPDATE to `LekhNewspaperBagInward**M**` — one of the
  two names is wrong (which one exists is unknown: both MISSING locally). `TransactionName`
  (used by the grid and the edit lock) is the name without `M`.
- "Add Pages" hands over the **bag row's id** (`LekhNewspaperBagInwardKm`) as if it were a
  `LekhNewspaperDateKm`.

**Closest web pattern / engine fit** — `holiday.ts` / `HolidayMaster.tsx` (date picker fields,
flat save) plus `ScreenDefinition.f2` for the inline newspaper list (add-new through
AddTableInfo: check whether the web F2 picker supports it — the Tirth Raksha note lists it as a
possible gap). New-keeps-values is `ScreenSpec.onNew`. Engine fits as is.

---

### 5. Lekh Newspaper Pages — `Library/Article/frmLekhNewspaperPages.vb`

- **What changed**: new form (table `LekhNewspaperPage`), opened only from Bag Inward's "Add
  Pages". **Unfinished**: its Save cannot succeed and its grid binding does not match its grid.
- **Kind**: new feature (stub)
- **Web today**: not ported.
- **Web change needed**: none until the user says how it is meant to work (open question 4);
  a faithful port would be a window that lists nothing and saves nothing.
- **DB prerequisites**: `LekhNewspaperPage` MISSING, `LekhNewspaperPageM` MISSING (UPDATE's
  name), `LekhNewspaperDate` MISSING, `tblSearch` `TransactionName='LekhNewspaperPage'` MISSING,
  `columnmaster` Vibhag `LekhNewspaper` MISSING.
- **Size**: S to port as-is (menu action + placeholder), M to build the screen the entity implies.

#### Behaviour note draft — Newspaper Pages (`LekhNewspaperPage`)

Form title "Newspaper Pages"; repository `Concrete/LekhNewspaperPageRepository.vb`, entity
`EntLekhNewspaperPage` (in `Library.Entity/EntLekhNewspaperDate.vb`). `TransactionName =
"LekhNewspaperPage"`, PK `LekhNewspaperPageKm` (IDENTITY). No menu item; `New
frmLekhNewspaperPages` only at `frmLekhNewspaperBagInward.vb:638`.

**Controls** (SplitterDistance 92; several still have Designer default names)

| Control (x,y)                                                   | Label                            | Bound to                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `txtLekhNewspaperDateKt` (197,10 w224)                          | "Newspaper Name(Date)"           | set by the caller; never read by Save                                                                                          |
| `txtNewspaperKt` (519,10 w167)                                  | "Page No" (label sits before it) | F2 / F3: `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='LekhNewspaper' ORDER BY Name` (`AddTableInfo:="columnmaster | LekhNewspaper"`) — a newspaper list under a "Page No" label; never read by Save; Tag/text kept on New |
| `txtRemark` (197,45, multiline)                                 | "Remark"                         | `Remark` — the only value Save reads                                                                                           |
| `TextBox1` (519,45)                                             | "Lekh No"                        | nothing                                                                                                                        |
| `chkFinalCheck` (673,14) "Final Check By" + `TextBox2` (817,10) | —                                | nothing                                                                                                                        |
| `CheckBox1` (673,49) "Correction By" + `TextBox3` (817,45)      | —                                | nothing                                                                                                                        |

Entity fields with no code behind them: `LekhNewspaperDateKt`, `PageNo` (Integer), `LekhNo`,
`IsFinalCheck`, `FinalCheckByKt`, `FinalCheckDate`, `IsCorrection`, `CorrectionByKt`,
`CorrectionDate`.

- **Validation** (`GetValidationMessage`: `- Newspaper Date is Mandatory` when
  `LekhNewspaperDateKt = 0`, `- PageNo is Mandatory` when `PageNo = 0`) is **never called** by
  the form.
- **Save**: the form sets only `Remark`, `enuser`, `moduser`. Repository:
  `INSERT INTO LekhNewspaperPage (LekhNewspaperDateKt,PageNo,LekhNo,Remark,enuser,endate)  VALUES (@LekhNewspaperDateKt,@PageNo,@LekhNo,@Remark,@enuser,getdate())` /
  `Update LekhNewspaperPageM SET LekhNewspaperDateKt=@LekhNewspaperDateKt,PageNo=@PageNo,LekhNo=@LekhNo,Remark=@Remark,moduser=@moduser,moddate=getdate() WHERE LekhNewspaperPageKm=@LekhNewspaperPageKm`.
  `Ent.LekhNo` is `Nothing`, so ADO.NET does not send `@LekhNo` and the statement fails (error
  box, nothing saved). Not run; inferred from `AddWithValue(…, Nothing)` semantics. Had it run,
  it would write `LekhNewspaperDateKt = 0`, `PageNo = 0`.
- **Grid**: the Designer has 5 columns (`Id`, "Newspaper Name(Date)", "PageNo", "LekhNo",
  "Remark") but `FillList` binds positions 0-4 to `LekhNewspaperPageKm`, `BagReceivedDate`,
  `NewspaperName`, `NewspaperDate`, `Remark` (the Bag Inward enum, copied) — if the tblSearch
  query lacks those names `FillList` throws and the grid stays empty.
- **Values passed by "Add Pages"** are lost: with an empty grid Load calls `btnNew_Click`, whose
  `clsCom.clear` empties every TextBox's Text and Tag; with rows, the first row click does.
- **Delete**: confirm + password, then nothing (commented out). **Context menu**: defined, not
  attached. **Work report**: `insertworkreports` on Add / Edit (unreachable). **Permissions**: none.

**Closest web pattern** — would be `holiday.ts`-sized with a `listCondition` on the parent
newspaper date (as `frmMagazineVisheshNew`'s `BookMastKt` window parameter); not specifiable
from this code.

---

### 6. Employee Evaluation — `Library/Employee/frmEmployeeEvaluation.vb`

- **What changed**: new screen listing per-employee, per-period work evaluations
  (`EmployeeEvaluation` + `EmployeeEvaluationDetail`), which a stored procedure generates every
  time the form opens. Shows a detail grid per Vibhag / Work Type and a "top performers" grid;
  lets privileged users edit a remark; "Mark Evaluation Done"; jumps to Work Report / Log Report
  for the selected rows.
- **Kind**: new feature
- **Web today**: not ported. The jump targets exist: `work-report.ts` / `WorkReport.tsx`,
  `old-log-reports.ts` / `OldLogReports.tsx`.
- **Web change needed**: new screen `employee-evaluation` (menu Employee, after Leaves —
  desktop order: …, Tasks, Show Last Activity, [Employee Performance Evaluation hidden],
  Employee Evaluation); `ScreenDefinition` with `listFilter`, `writableBy`, custom save,
  actions; a custom component (two extra read-only grids in the panel, search-box F2 / F3
  override); and a way to open Work Report / Old Log Reports with a condition (engine gap below).
- **DB prerequisites**: `EmployeeEvaluation` MISSING, `EmployeeEvaluationDetail` MISSING, proc
  `AddEmployeeEvaluation` MISSING, `tblSearch` `TransactionName='EmployeeEvaluation'` MISSING.
  PRESENT: `dbo.SplitString` (TF), `ApprisalStandard` (`VibhagKt`, `WorkTypeKt`), `columnmaster`
  (Vibhag `Vibhag` 224 rows, `worktype` 72), `Usecurity` (`tid`, `uname`), `WorkReportM`
  (`DoneByGId`, `Workdate`), `log` (`logID`, `uid`, `logdate`), `work` (`workID`, `logid`,
  `vibhagkt`, `worktypeID`), `DataEditingInfo`.
- **Size**: L (day+).

#### Behaviour note draft — Employee Evaluation (`EmployeeEvaluation`)

Desktop form: `Library/Employee/frmEmployeeEvaluation.vb` (+ `.Designer.vb`, title "Employee
Evaluation"). Repository `Concrete/EmployeeEvaluationRepository.vb`, interface
`Abstract/IEmployeeEvaluationRepository.vb`, entity `Library.Entity/EntEmployeeEvaluation.vb`
(`EntEmployeeEvaluation` + `EntEmployeeEvaluationDetail`).
Menu: **Employee › Employee Evaluation** (last item; `Frmlibmain.Designer.vb:808`, `868-872`,
visible, no runtime rule; handler `Frmlibmain.vb:1051`). Not opened from elsewhere.

**Table and key** — `EmployeeEvaluation`, PK `EmployeeEvaluationKm`; detail
`EmployeeEvaluationDetail` (`EmployeeEvaluationDetailKm`, FK `EmployeeEvaluationKt`). **No VB
code inserts into either**: rows come from the stored procedure.

**Load** (`frmEmployeeEvaluation_Load`, lines 127-182)

1. Not admin and not AMaster (`Not IsAdminLogin And curr_utypeid <> EnumUserType.AMaster`):
   `DefaultCond = " AND EmployeeKt=<curr_lnid>"` — own evaluations only. It is passed to
   `ListGridData` and to `UcSearch.LoadData` (so searches stay inside it) → `listFilter`.
2. `BlTran.AddEvaluation(DateTime.Now)` → `EXEC AddEmployeeEvaluation @Dat='<MM/dd/yyyy>'`
   (CommandType.StoredProcedure; the UPDATE text built just before it is discarded). **Runs on
   every open, for every user**, and is what creates the evaluation rows. Body unknown.
3. `FillList()`, `FillData()`, `FillTopOutputPercent()`.
4. Toolbar: non-privileged → `EnableDisableDataEditing(ToolStrip1, Locked:=True)` (Save, Modify,
   Cancel, Delete, Copy off); privileged → normal. Then `DisableButtons()` for everyone: **New,
   Work Report, Copy, Delete disabled**.

**Fields** (panel, SplitterDistance 238)

| Control (x,y w)                       | Label                  | Column                                | Notes                                                                                   |
| ------------------------------------- | ---------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `txtEvaluationFromDate` (183,8 w125)  | "Evaluation From Date" | `EvaluationFromDate`                  | ReadOnly; `dd/MM/yyyy`                                                                  |
| `txtEvaluationToDate` (482,8 w125)    | "Evaluation To Date"   | `EvaluationToDate`                    | ReadOnly; `dd/MM/yyyy`                                                                  |
| `txtEvaluationDone` (183,50 w125)     | "Evaluation Done"      | `EvaluationDone` (bit, shown as text) | ReadOnly                                                                                |
| `txtEvaluationDoneDate` (482,50 w125) | "Evaluation Done Date" | `EvaluationDoneDate`                  | ReadOnly; `dd/MM/yyyy`, blank when NULL                                                 |
| `txtRemark` (183,92 w426)             | "Remark"               | `Remark`                              | the only editable field                                                                 |
| `dgTopPerformance` (623,8, 374×113)   | —                      | query below                           | read-only grid: "No" (30), "Employee Name" (125), "Vibhag" (125), "Output Percent" (N2) |
| `dgDetail` (2,130, 1008×98)           | —                      | query below                           | read-only grid, see columns below                                                       |

All three grids: header back colour LightSteelBlue, header fore colour DarkRed, selection
back colour RGB(10,36,106) / white, full-row select.

**Validation** — `GetValidationMessage` throws `NotImplementedException` but is **not called**.
No validation.

**Save** (privileged users only: Modify → Save) — `Ent` = id, trimmed `Remark`, `moduser`; no
transaction:

```
UPDATE EmployeeEvaluation SET Remark=@Remark,moduser=@moduser,moddate=getdate() WHERE EmployeeEvaluationKm=@EmployeeEvaluationKm
```

The repository first reads `SELECT ISNULL(EvaluationDone,0) AS EvaluationDone FROM EmployeeEvaluation WHERE EmployeeEvaluationKm=<id>`
and would call `UpdateEvaluationDone` when the entity says done and the row is not — the form
never sets `Ent.EvaluationDone`, so that branch is dead. After Save: "Record Saved
Successfully", edit lock released, `DisableButtons()`. The grid row is **not** refreshed. No
work-report entry.

**New / Delete / Copy / Work Report** — `btnNew_Click` is empty. Delete would call
`BlTran.Delete(id)` = `NotImplementedException`. All four buttons are disabled after Load and
after Save; **Cancel does not re-apply `DisableButtons()`**, so after Modify → Cancel the shared
toolbar code may re-enable them (New does nothing, Delete shows the not-implemented error, Work
Report opens the standard dialog). On the web: keep them off.

**Grid columns (`dgMain`)** — tblSearch query must return: `EmployeeEvaluationKm` "Id" (5),
`EmployeeKt` (hidden), `EmployeeName` "Employee Name" (140), `EvaluationDone` "Evaluation Done"
(105, text column), `EvaluationFromDate` "Evaluation From" (105, `d`), `EvaluationToDate`
"Evaluation To" (`d`), `TimeTaken` "Time Taken", `WorkQty` "Work Qty", `TargetedWorkQty`
"Targeted Work Qty" (120), `CurrentOutputPercent` (140), `LastOutputPercent` (140),
`LastToLastOutputPercent` (165), `CurrentMistakePercent` (145), `LastMistakePercent` (140),
`LastToLastMistakePercent` (170) — headers are the names with spaces. Record query also:
`Remark`, `EvaluationDoneDate`.

**Detail grid** (`GetDetailDataTable`, filled on every row click; lines 668-685):

```
SELECT EmployeeEvaluationDetailKm,VibhagKt,colVib.Name AS Vibhag,WorkTypeKt,colWTyp.Name As WorkType,TimeTaken,ISNULL(WorkQty,0) AS WorkQty,ISNULL(TargetedWorkQty,0) AS TargetedWorkQty,CurrentOutputPercent,LastOutputPercent,LastToLastOutputPercent,CurrentMistakePercent,LastMistakePercent,LastToLastMistakePercent From EmployeeEvaluationDetail E INNER JOIN columnmaster colVib ON E.VibhagKt=colVib.ColumnMastkm INNER JOIN columnmaster colWTyp ON E.WorkTypeKt=colWTyp.ColumnMastkm WHERE EmployeeEvaluationKt=<id>
  [ AND VibhagKt IN(SELECT val FROM dbo.SplitString('<StrVibhagKt>',','))]
  [ AND WorkTypeKt IN(SELECT val FROM dbo.SplitString('<StrWorkTypeKt>',','))]
```

Columns: Id (5), Vibhag (125), Work Type (125), Time Taken, Work Qty, Targeted Work Qty (120),
then the six percent columns as in the main grid.

**Top performance grid** (`FillTopOutputPercent`, lines 710-745; the latest evaluation period =
that of the row with the highest `EmployeeEvaluationKm`):

```
WITH PAGING AS( Select ROW_NUMBER() OVER(PARTITION BY colVib.Name ORDER BY colVib.Name ASC,MAX(ED.CurrentOutputPercent) DESC) GroupRowNumber,U.uname,colVib.Name AS Vibhag,MAX(ED.CurrentOutputPercent) AS OutputPercent From EmployeeEvaluationDetail ED INNER JOIN columnmaster colVib ON ED.VibhagKt=colVib.ColumnMastkm INNER JOIN EmployeeEvaluation E ON ED.EmployeeEvaluationKt=E.EmployeeEvaluationKm INNER JOIN Usecurity U ON E.EmployeeKt=U.tid INNER JOIN(SELECT TOP(1)EvaluationFromDate,EvaluationToDate FROM EmployeeEvaluation ORDER BY EmployeeEvaluationKm DESC) AS tbl ON E.EvaluationFromDate=tbl.EvaluationFromDate AND E.EvaluationToDate=tbl.EvaluationToDate WHERE 1=1
  [ AND ED.VibhagKt IN(SELECT val FROM dbo.SplitString('<StrVibhagKt>',',')) ]
GROUP BY U.uname,colVib.Name ) Select ROW_NUMBER()OVER(ORDER BY OutputPercent DESC) AS Seq,uname AS EmployeeName,Vibhag,OutputPercent FROM PAGING WHERE OutputPercent>0
  [ AND GroupRowNumber=1 ]      -- only when no Vibhag filter is set
ORDER BY OutputPercent DESC
```

Note: it is **not** restricted by `DefaultCond` — every user sees all employees' top figures.

**F2 / F3 in the search box** (`Txt_KeyDown`, lines 425-545; attached to every TextBox, acts on
the Search By combo's text):

- Search By = **"Vibhag"**: list
  `SELECT DISTINCT ColumnMastkm,Name FROM EmployeeEvaluationDetail E INNER JOIN ApprisalStandard AST ON E.VibhagKt=AST.VibhagKt INNER JOIN columnmaster ON AST.VibhagKt=columnmaster.ColumnMastkm WHERE vibhag='vibhag' [AND E.EmployeeEvaluationKt IN(<ids in the grid>) ]ORDER BY Name`
  — the bracketed part only for **F2** (F3 = over all evaluations). On a pick (the Tag may hold
  several ids): `StrVibhagKt = <ids>`; grid reloaded with
  `AND EmployeeEvaluationKm IN(SELECT EmployeeEvaluationKt FROM EmployeeEvaluationDetail WHERE VibhagKt IN(SELECT val FROM dbo.SplitString('<ids>',',')))`
  (+ `AND EmployeeEvaluationKm IN(<ids in the grid>)` for F2) **in place of** the default
  condition for that one load (so a non-privileged user's F3 lists other employees' rows —
  desktop leak); detail and top grids refilled; then for every grid row the cells are
  overwritten from the filtered detail rows: `WorkQty` = Σ, `TargetedWorkQty` = Σ,
  `CurrentOutputPercent` = `Math.Round(WorkQty / TargetedWorkQty * 100, 2)` (0 when the target is
  0), `TimeTaken` =
  `SELECT Right('00' + CAST(SUM(TotalMinutes)/60 AS VARCHAR),3) + ':' + Right('0' + CAST(SUM(TotalMinutes)%60 AS VARCHAR),2) AS TotalTimeTaken From ( SELECT CAST(LEFT(TimeTaken,CHARINDEX(':',TimeTaken)-1) AS int) * 60 + CAST(RIGHT(TimeTaken,LEN(TimeTaken) - CHARINDEX(':',TimeTaken)) AS int) AS TotalMinutes From EmployeeEvaluationDetail T WHERE EmployeeEvaluationKt=<row id> AND VibhagKt IN(SELECT val FROM dbo.SplitString('<StrVibhagKt>',',')) GROUP BY TimeTaken ) AS tbl`
  (so `TimeTaken` is text `HHH:MM`; the `GROUP BY TimeTaken` drops duplicate times — desktop
  quirk). Rows without detail get 0 / 0 / 0.
- Search By = **"Work Type"**: the same with `WorkTypeKt` / `vibhag='WorkType'` and
  `StrWorkTypeKt`; it recomputes Work Qty / Targeted / Current Output Percent but not Time Taken,
  and does not refill the top grid.
- `StrVibhagKt` / `StrWorkTypeKt` are **sticky**: never cleared (not by Refresh either), so the
  detail and top grids stay filtered until the window is closed.

**Right-click menu** (`cntMenu`, attached to `dgMain`)

| Item                                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel | standard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| For Selected Records › Mark Evaluation Done    | selected rows whose `EvaluationDone` is empty / False; none → nothing. "Are you sure to set Evaluation Done for selected Records?" → `UPDATE EmployeeEvaluation SET EvaluationDone=@EvaluationDone,EvaluationDoneDate=@EvaluationDoneDate,EvaluationDoneByKt=@EvaluationDoneByKt,moduser=@moduser,moddate=getdate() WHERE EmployeeEvaluationKm IN(SELECT val FROM dbo.SplitString(@StrId,','))` (1, now, current user, current user) → "Evaluation For (n) Records Done Successfully" → the cells are set to True. **No permission check**: a non-privileged user can mark their own evaluation done.                                                                                                                                                   |
| — separator —                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| For Selected Records › Work Report             | opens `frmWorkReportM` with `WhereCondition = " AND DoneByGId IN(<distinct EmployeeKt>) AND WorkDate>='<earliest From, MM/dd/yyyy>' AND WorkDate<='<latest To>'"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| For Selected Records › Log Report              | opens `frmLogReport` with `dtpFromDate` / `dtpToDate` = earliest From / latest To and `StrWorkWhereCondition = "SELECT DISTINCT work.WorkId FROM log INNER JOIN work ON log.logID=work.logid WHERE log.uid IN(<users>) AND work.vibhagkt IN(<VibhagKt of the selected rows' details>) AND work.worktypeID IN(<WorkTypeKt …>) AND log.logdate>='<from>' AND log.logdate<='<to>'"`, the two id lists from `SELECT STUFF((SELECT DISTINCT ',' + CAST(VibhagKt AS VARCHAR(5)) FROM EmployeeEvaluationDetail WHERE EmployeeEvaluationKt IN(<ids>) FOR XML PATH('')),1,1,'')` (and `WorkTypeKt`). `frmLogReport.StrWorkWhereCondition` is itself new in Updated (`Library/Employee/frmLogReport.vb:11`, `261-262`: `AND work.workID in(<it>)`) — other slice. |

**Reports and printing** — Selected Column only. **Locking** — Ctrl+L / U as everywhere
(`Locked` column unknown).

**Permissions** — list: own rows unless admin / AMaster (`listFilter`); edit Remark: admin /
AMaster only (`writableBy`); Mark Evaluation Done: anyone (desktop) — open question 6.

**Closest web pattern / engine fit** — nearest are `work-report.ts` / `WorkReport.tsx` (a list
screen with `listFilter` and "open another screen for the selected rows") and `leaves.ts` /
`LeavesMaster.tsx` (privileged-only actions on selected rows). The engine covers the list, the
remark save, the filter and the actions, but **not as is**:

- the panel needs two extra query-backed grids (custom component around `MasterScreen`, with
  `recordExtras` or dedicated `lists`/actions for the detail and top-performer rows);
- the search-box F2 / F3 override that re-filters and overwrites grid cells has no equivalent
  (`searchOverrides` gives the list and a condition, not the per-row recomputation);
- `workspace.open(screen, ids?, newRecord?)` (`gglib-web/apps/web/src/features/shell/Workspace.tsx:183`)
  cannot pass a condition; Work Report / Old Log Reports need a typed window parameter
  (users + date range [+ vibhag / work-type ids]) turned into SQL on the server — never the
  desktop's raw `WhereCondition` string;
- running `AddEmployeeEvaluation` on open is a write on a GET-like path: make it an explicit
  call when the window opens.

---

### 7. Employee Performance Evaluation — `Library/Employee/frmEmployeePerformanceEvaluation.vb`

- **What changed**: new master screen `EmployeePerformanceEvaluationM` (manual appraisal record:
  employee, period, rating, previous / current / next output and mistake percentages, week /
  good points, remark), with Vibhag and Work Type child lists and figures computed by
  `Rpt_EmployeePerformance`.
- **Kind**: new feature — **menu item hidden** (`Visible = False`, `Frmlibmain.Designer.vb:861-866`,
  never shown) and Save very probably always blocked (below).
- **Web today**: not ported.
- **Web change needed**: recommend **none now** (open question 5).
- **DB prerequisites**: `EmployeePerformanceEvaluationM`, `EmployeePerformanceEvaluationVibhagT`,
  `EmployeePerformanceEvaluationWorkTypeT` MISSING; `tblSearch`
  `TransactionName='EmployeePerformanceEvaluationM'` MISSING; proc `Rpt_EmployeePerformance`
  PRESENT **with the old signature** (`@FromDate date, @ToDate date, @EmpKt, @VibhagKt,
@WorkTypeKt varchar(1000)`; its body has no `OutputPercentage`, `AvgErrorPerCard_Qty` or
  `IsTotalReport`) → the new signature (`@StrEmpKt`, `@StrVibhagKt`, `@StrWorkTypeKt`,
  `@IsTotalReport`, plus `@IsDatewiseReport` used by `frmEmpAppraisalReport`) is MISSING.
  `Rpt_EmployeePerformanceNew` also exists locally but has the old parameters too.
  `columnmaster` Vibhag `Vibhag` / `worktype` PRESENT; `Usecurity` PRESENT.
- **Size**: M–L (L with the computed figures).

#### Behaviour note draft — Employee Performance Evaluation (`EmployeePerformanceEvaluationM`)

Desktop form: `Library/Employee/frmEmployeePerformanceEvaluation.vb` (+ `.Designer.vb`, title
"Employee Performance Evaluation"). Repository
`Concrete/EmployeePerformanceEvaluationRepository.vb`, entity
`Library.Entity/EntEmployeePerformanceEvaluationM.vb`. Popups:
`SetForm_EmployeePerformanceEvaluation` (`frmDisplayTransNew.vb:11852-11918`).
Menu: Employee › Employee Performance Evaluation — hidden; handler `Frmlibmain.vb:1045`. No
other opener.

**Table and key** — `EmployeePerformanceEvaluationM`, PK `EmployeePerformanceEvaluationKm`
(IDENTITY). Non-privileged users: `DefaultCond = " AND EmployeeKt=<curr_lnid>"` (list + search).

**Fields** (SplitterDistance 198; box columns x=207 / 536 / 857, w137)

| Control (x,y)                                  | Label                      | Column                              | Notes                                                                                                                                                                                                                                   |
| ---------------------------------------------- | -------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `txtEmployeekt` (207,14)                       | "Employee"                 | `EmployeeKt` (Tag) / `EmployeeName` | required; F2 from tblSearch (unknown)                                                                                                                                                                                                   |
| `dtpEvaluationFromDate` (536,14), `dd-MM-yyyy` | "Evaluation From"          | `EvaluationFromDate` (date)         |                                                                                                                                                                                                                                         |
| `dtpEvaluationToDate` (857,14), `dd-MM-yyyy`   | "Evaluation To"            | `EvaluationToDate` (date)           |                                                                                                                                                                                                                                         |
| `txtVibhagTran` (207,51)                       | "Vibhag"                   | summary `VibhagTran`                | popup                                                                                                                                                                                                                                   |
| `txtWorkTypeTran` (535,51)                     | "Work Type"                | summary `WorkTypeTran`              | popup                                                                                                                                                                                                                                   |
| `cmbRating` (857,51), DropDownList             | "Rating"                   | `Rating` (text)                     | items `""`, `Poor`, `Average`, `Good`, `Excellent`; not cleared by New, and **never loaded from the record** (`FillData` fills only TextBoxes and the two pickers), so it shows the last choice and an Edit overwrites `Rating` with it |
| `txtPreviousOutputPercent` (207,88)            | "Previous Output Percent"  | `PreviousOutputPercent` (float)     | ReadOnly, computed                                                                                                                                                                                                                      |
| `txtCurrentOutputPercent` (536,88)             | "Current Output Percent"   | `CurrentOutputPercent`              | ReadOnly, computed                                                                                                                                                                                                                      |
| `txtNextOutputPercent` (857,88)                | "Next Output Percent"      | `NextOutputPercent`                 | typed; `Val()`                                                                                                                                                                                                                          |
| `txtPreviousMistakePercent` (207,125)          | "Previous Mistake Percent" | `PreviousMistakePercent`            | ReadOnly, computed                                                                                                                                                                                                                      |
| `txtCurrentMistakePercent` (536,125)           | "Current Mistake Percent"  | `CurrentMistakePercent`             | ReadOnly, computed                                                                                                                                                                                                                      |
| `txtNextMistakePercent` (857,125)              | "Next Mistake Percent"     | `NextMistakePercent`                | typed; `Val()`                                                                                                                                                                                                                          |
| `txtWeekPoints` (207,162)                      | "Week Points"              | `WeekPoints`                        | text                                                                                                                                                                                                                                    |
| `txtGoodPoints` (536,162)                      | "Good Points"              | `GoodPoints`                        | text                                                                                                                                                                                                                                    |
| `txtRemark` (857,162)                          | "Remark"                   | `Remark`                            | text                                                                                                                                                                                                                                    |

**Validation (`GetValidationMessage`)** — as written:

- `- Employee Name Mandatory` (`Val(EmployeeKt) = 0`)
- `- Evaluation From Date is Mandatory` (`Ent.EvaluationFromDate = ""`)
- `- Evaluation To Date is Mandatory` (`Ent.EvaluationToDate = ""`)

`EvaluationFromDate` is a `Date`; with `Option Strict Off` the comparison converts `""` to a
Date, which throws; the `Catch` then returns `ex.Message` as the validation message. If so,
**every Save is refused** with a conversion error text. Not run — inferred from VB semantics.

**Derived values** — `CalculatePerformanceEvaluation` (lines 504-563), run when the From / To
picker or the Vibhag / Work Type box changes after having had focus (the Employee box's trigger
is dead: `OldEmployeeKt` is never assigned):

1. `EXEC Rpt_EmployeePerformance @FromDate, @ToDate [, @StrEmpKt = <employee id>] [, @StrVibhagKt = <ids of the popup rows>] [, @StrWorkTypeKt = <ids>], @IsTotalReport = 1`
   → first row's `OutputPercentage` → Current Output Percent, `AvgErrorPerCard_Qty` → Current
   Mistake Percent.
2. `SELECT TOP(1)* FROM EmployeePerformanceEvaluationM WHERE EvaluationFromDate<='<from, MM/dd/yyyy>' ORDER BY EmployeePerformanceEvaluationKm DESC`
   (no employee filter — any employee's latest record) → the same proc for that record's period
   → Previous Output / Mistake Percent.

**Child tables saved with the record** — `Save(Ent, dtVibhag, dtWorkType)`, one transaction,
committed:

```
INSERT INTO EmployeePerformanceEvaluationM (EmployeeKt,EvaluationFromDate,EvaluationToDate,Rating,PreviousOutputPercent,CurrentOutputPercent,NextOutputPercent,PreviousMistakePercent,CurrentMistakePercent,NextMistakePercent,WeekPoints,GoodPoints,Remark,enuser,endate) VALUES (@EmployeeKt,@EvaluationFromDate,@EvaluationToDate,@Rating,@PreviousOutputPercent,@CurrentOutputPercent,@NextOutputPercent,@PreviousMistakePercent,@CurrentMistakePercent,@NextMistakePercent,@WeekPoints,@GoodPoints,@Remark,@enuser,getdate())
UPDATE EmployeePerformanceEvaluationM SET EmployeeKt=@EmployeeKt,EvaluationFromDate=@EvaluationFromDate,EvaluationToDate=@EvaluationToDate,Rating=@Rating,PreviousOutputPercent=@PreviousOutputPercent,CurrentOutputPercent=@CurrentOutputPercent,NextOutputPercent=@NextOutputPercent,PreviousMistakePercent=@PreviousMistakePercent,CurrentMistakePercent=@CurrentMistakePercent,NextMistakePercent=@NextMistakePercent,WeekPoints=@WeekPoints,GoodPoints=@GoodPoints,Remark=@Remark,moduser=@moduser,moddate=getdate() WHERE EmployeePerformanceEvaluationKm=@EmployeePerformanceEvaluationKm
```

Popups (only when opened), upsert + delete-not-kept:
`EmployeePerformanceEvaluationVibhagT(EmployeePerformanceEvaluationKt,VibhagKt,enuser,endate)` /
`SET VibhagKt=…,moduser=…,moddate=GETDATE() WHERE EmployeePerformanceEvaluationVibhagKm=…`;
`EmployeePerformanceEvaluationWorkTypeT(EmployeePerformanceEvaluationKt,WorkTypeKt,enuser,endate)`
likewise. **`Seq` is shown in the popups but not saved.**

Popups: `frmDisplayTransNew`, `FormName = "EmployeePerformanceEvaluation"`, `TranName =
"Vibhag"` / `"WorkType"`, rows from tblSearch F2EntryText of `VibhagTran` / `WorkTypeTran`
(unknown; columns needed: `EmployeePerformanceEvaluationVibhagKm, VibhagKt, VibhagName, Seq` /
`…WorkTypeKm, WorkTypeKt, WorkTypeName, Seq`). Hidden: the key and the `…Kt`. Cell lists:
`select ColumnMastkm,Name from columnmaster where vibhag='Vibhag' order by Name` and
`select ColumnMastkm,Name from columnmaster where vibhag='WorkType' order by Name`, both with
`AddTableInfo:="ColumnMaster|TirthRakshaKshetra"` (copy-paste: "add new" would create a
`TirthRakshaKshetra` row — do not port the add).

**Grid columns** — `EmployeePerformanceEvaluationKm` "Id" (5), `EmployeeName` (120),
`EvaluationFromDate` "Evaluation From" (110, `dd-MM-yyyy`), `EvaluationToDate` "Evaluation To"
(`dd-MM-yyyy`), `Rating`, `PreviousOutputPercent` "Prev Output Percent" (140),
`CurrentOutputPercent` (140), `NextOutputPercent` (140), `PreviousMistakePercent` "Prev Mistake
Percent" (140), `CurrentMistakePercent` (150), `NextMistakePercent` (140), `WeekPoints`,
`GoodPoints`, `Remark`.

**Delete** — one committed transaction: `DELETE FROM EmployeePerformanceEvaluationVibhagT WHERE EmployeePerformanceEvaluationKt IN(<id>)`,
the same for `…WorkTypeT`, then `DELETE FROM EmployeePerformanceEvaluationM WHERE EmployeePerformanceEvaluationKm IN(<id>)`;
"Record Deleted ".

**Right-click menu** — defined (Print Report › Selected Column / Send To Excel) but not attached
to the grid. **Work report** — both `insertworkreports` calls are commented out → none.

**Permissions** — admin / AMaster: full. Everyone else: own rows only, toolbar `Locked:=True`
(no Save / Modify / Delete), and an empty Search By combo
(`UcSearch1.LoadData(…, DefaultCond, IIf(IsAdminLogin Or curr_utypeid = EnumUserType.AMaster, True, False))`)
→ `listFilter` + `writableBy` + `searchableBy`, exactly as `employee.ts`.

**Closest web pattern / engine fit** — `employee.ts` for the privilege model, `tirth-raksha.ts`
Kshetra-style popups (`upsertChildRows`), a `ScreenDefinition.actions` entry for the computed
percentages (called from the panel when the period / popups change). Engine fits apart from a
combo-box field bound to free text (check `FieldSpec.options`, which today models bit columns)
and "recompute on field change".

---

## (1) DB objects this slice needs

Types: **I** = inferred from the Ent class / parameters / usage (no DDL exists); audit columns
(`enuser int, endate datetime, moduser int, moddate datetime`) inferred from `getdate()` and
user ids. Whether any table has `Locked` (needed for Ctrl+L / U) is unknown.

| Object                                                                                                                                                                                      | Kind  | Local DB                        | Used by | Columns as far as the code shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JSeriesM`                                                                                                                                                                                  | table | MISSING                         | 1       | `JSeriesKm` int IDENTITY PK; `JSeriesName` nvarchar (I); `JSeriesNo` varchar ('J'+≤5 digits) (I); `JSeriesTypeKt` int; `Remark` nvarchar (I); audit                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `JSeriesIssueT`                                                                                                                                                                             | table | MISSING                         | 1       | `JSeriesIssueKm` int IDENTITY PK; `JSeriesKt` int; `PartyKt` int → `PartyM.partyMkm`; `IssueDate` date/datetime NULL; `ReturnDate` date/datetime NULL; `Remark` nvarchar (I); `Seq` int; audit                                                                                                                                                                                                                                                                                                                                                                       |
| `ShastraPathM`                                                                                                                                                                              | table | MISSING                         | 2       | `ShastraPathKm` int IDENTITY PK; `ShastraPathNo` int; `MatterKt` int; `GranthName` nvarchar; `GranthTypeKt` int; `txtAuthor` nvarchar; `RelevantPhotoPath` nvarchar; `AuthorSampradayKt` int; `GradeSubjectKt` int; `Summary`, `Subject`, `Remark` nvarchar; `ProjectDetailKt` int; `VikramSamvat` int; `Isvisan` int; `SamvatRemark` nvarchar; audit (all I)                                                                                                                                                                                                        |
| `ShastraPathAuthorT`                                                                                                                                                                        | table | MISSING                         | 2       | `ShastraPathAuthorKm` IDENTITY; `ShastraPathKt`; `txtAuth` nvarchar; `Seq`; audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ShastraPathAuthorAuthorTypeT`                                                                                                                                                              | table | MISSING                         | 2       | `ShastraPathAuthorAuthorTypeKm` IDENTITY; `ShastraPathKt`; `ShastraPathAuthorKt`; `AuthorTypeKt`; `SignKt`; `Seq`; audit                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ShastraPathAuthorAuthorT`                                                                                                                                                                  | table | MISSING                         | 2       | `ShastraPathAuthorAuthorKm` IDENTITY; `ShastraPathKt`; `ShastraPathAuthorKt`; `authorkt`; `padkt`; `signkt`; `AuthAnyaNmKt`; `Seq`; audit                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ShastraPathReferenceT`                                                                                                                                                                     | table | MISSING                         | 2       | `ShastraPathReferenceKm` IDENTITY; `ShastraPathKt`; `BookTKt`; `PageNo` nvarchar; `Remark` nvarchar; `Seq`; audit                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ShastraPathTextT`                                                                                                                                                                          | table | MISSING                         | 2       | `ShastraPathTextKm` IDENTITY; `ShastraPathKt`; `TextTypeKt`; `CheckedByKt`; `PhotoPath` nvarchar; `Seq`; audit                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ShastraPathSamvatT`                                                                                                                                                                        | table | MISSING                         | 2       | `ShastraPathSamvatKm` IDENTITY; `ShastraPathKt`; `SamvatKindKt`; `Remark`; `AsamvatKt`; `Asamvat` nvarchar; `Vksamvat` int; `Isvisan` int; `BookTKt`; `PageNo` nvarchar; `SthalKt`; `IsPrint` bit/int; `seq`; audit                                                                                                                                                                                                                                                                                                                                                  |
| `LekhInwardM`                                                                                                                                                                               | table | MISSING                         | 3       | `LekhInwardKm` IDENTITY; `Title`; `BagReceivedDate` date; `NewsPaperDate` date NULL; `PageNo`, `LekhNo`, `Remark`, `Errors`, `Correction`, `MixedNewspaper` (all String in the Ent → n/varchar); audit                                                                                                                                                                                                                                                                                                                                                               |
| `LekhNewspaperDate`                                                                                                                                                                         | table | MISSING                         | 4, 5    | `LekhNewspaperDateKm` IDENTITY; `NewspaperKt` int → `columnmaster`; `NewsPaperDate` date NULL; audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `LekhNewspaperBagInward` (INSERT) / `LekhNewspaperBagInwardM` (UPDATE)                                                                                                                      | table | both MISSING                    | 4       | `LekhNewspaperBagInwardKm` IDENTITY; `LekhNewspaperDateKt` int; `BagReceivedDate` date; `Remark` nvarchar; audit                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `LekhNewspaperPage` (INSERT) / `LekhNewspaperPageM` (UPDATE)                                                                                                                                | table | both MISSING                    | 5       | `LekhNewspaperPageKm` IDENTITY; `LekhNewspaperDateKt` int; `PageNo` int; `LekhNo` n/varchar; `Remark`; audit. Ent-only (never written): `IsFinalCheck` bit, `FinalCheckByKt` int, `FinalCheckDate`, `IsCorrection` bit, `CorrectionByKt` int, `CorrectionDate`                                                                                                                                                                                                                                                                                                       |
| `EmployeeEvaluation`                                                                                                                                                                        | table | MISSING                         | 6       | `EmployeeEvaluationKm` (PK; filled by the proc); `EmployeeKt` int → `Usecurity.tid`; `EvaluationFromDate`, `EvaluationToDate` date; `EvaluationDone` bit; `EvaluationDoneDate` datetime NULL; `EvaluationDoneByKt` int; `Remark`; `TimeTaken` varchar 'H:MM'; `WorkQty`, `TargetedWorkQty` int; `CurrentOutputPercent`, `LastOutputPercent`, `LastToLastOutputPercent`, `CurrentMistakePercent`, `LastMistakePercent`, `LastToLastMistakePercent` float/decimal; `moduser`, `moddate` (the summary figures may instead be computed by the tblSearch query — unknown) |
| `EmployeeEvaluationDetail`                                                                                                                                                                  | table | MISSING                         | 6       | `EmployeeEvaluationDetailKm`; `EmployeeEvaluationKt`; `VibhagKt`, `WorkTypeKt` int → `columnmaster`; `TimeTaken` varchar 'H:MM'; `WorkQty`, `TargetedWorkQty` int NULL; the six percent columns                                                                                                                                                                                                                                                                                                                                                                      |
| `EmployeePerformanceEvaluationM`                                                                                                                                                            | table | MISSING                         | 7       | `EmployeePerformanceEvaluationKm` IDENTITY; `EmployeeKt` int; `EvaluationFromDate`, `EvaluationToDate` date; `Rating` varchar; `PreviousOutputPercent`, `CurrentOutputPercent`, `NextOutputPercent`, `PreviousMistakePercent`, `CurrentMistakePercent`, `NextMistakePercent` float (Double in the Ent); `WeekPoints`, `GoodPoints`, `Remark` nvarchar; audit                                                                                                                                                                                                         |
| `EmployeePerformanceEvaluationVibhagT`                                                                                                                                                      | table | MISSING                         | 7       | `EmployeePerformanceEvaluationVibhagKm` IDENTITY; `EmployeePerformanceEvaluationKt`; `VibhagKt`; audit                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `EmployeePerformanceEvaluationWorkTypeT`                                                                                                                                                    | table | MISSING                         | 7       | `EmployeePerformanceEvaluationWorkTypeKm` IDENTITY; `EmployeePerformanceEvaluationKt`; `WorkTypeKt`; audit                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `AddEmployeeEvaluation(@Dat)`                                                                                                                                                               | proc  | MISSING                         | 6       | generates the evaluation rows; body unknown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Rpt_EmployeePerformance` new signature (`@FromDate`, `@ToDate`, `@StrEmpKt`, `@StrVibhagKt`, `@StrWorkTypeKt`, `@IsTotalReport`; result columns `OutputPercentage`, `AvgErrorPerCard_Qty`) | proc  | MISSING (old signature PRESENT) | 7       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `UpdateVishay` with `ShastraPathSubject` / `Summary` / `Remark` / `Text` branches                                                                                                           | proc  | PRESENT, branches MISSING       | 2       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tblSearch` rows `JSeriesM`                                                                                                                                                                 | data  | MISSING                         | 1       | grid/record columns + `JSeriesTypeKt` F2 + `IssueTran` (Type T)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tblSearch` rows `ShastraPathM`                                                                                                                                                             | data  | MISSING                         | 2       | + Type T: `AuthTran`, `RemarkTran`, `SummaryTran`, `SubjectTran`, `SamvatTran`, `ReferenceTran`, `TextTran`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tblSearch` rows `LekhInwardM`                                                                                                                                                              | data  | MISSING                         | 3       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tblSearch` rows `LekhNewspaperBagInward`                                                                                                                                                   | data  | MISSING                         | 4       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tblSearch` rows `LekhNewspaperPage`                                                                                                                                                        | data  | MISSING                         | 5       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tblSearch` rows `EmployeeEvaluation`                                                                                                                                                       | data  | MISSING                         | 6       | incl. searchable rows with DisplayName "Vibhag" and "Work Type"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tblSearch` rows `EmployeePerformanceEvaluationM`                                                                                                                                           | data  | MISSING                         | 7       | + Type T: `VibhagTran`, `WorkTypeTran`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `columnmaster` Vibhag `LekhNewspaper`                                                                                                                                                       | data  | MISSING (0 rows)                | 4, 5    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `columnmaster` Vibhag `ShastraPathTextType`                                                                                                                                                 | data  | MISSING (0 rows)                | 2       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Config_Master` layouts for the seven ConfigTypes                                                                                                                                           | data  | none (optional)                 | all     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Existing objects the screens read or write (all verified PRESENT): `PartyM` (read; ids 3109,
3462, 5626, 5696, 6273 exist), `columnmaster` (read; Vibhag `Vibhag` 224, `worktype` 72, `Sign`
21, `AuthSamKind` 72, `DoneBy` 66; written by "add new" in F2 lists), `Usecurity` (read),
`ApprisalStandard` (read: `VibhagKt`, `WorkTypeKt`), `dbo.SplitString` (TF), `GetDataTable`
(proc), `tblSearch`, `Config_Master`, `WorkReportM` (written by `insertworkreports`; read via
the Work Report jump), `DataEditingInfo` (edit lock), `log` / `work` (read via the Log Report
jump), `VishayEntry` (written, screen 2), `authmast`, `authtype`, `AuthMAnyNmT`, `Sampraday`,
`visheshMast`, `samvmast`, `sadimst`, `BookT`, `BookM`, `AvrutiMast` (read, screen 2).

## (2) Open questions for the user

1. **Where is the schema?** None of these tables / procs / `tblSearch` rows is in the
   2026-09-21 backup. Is there a newer production DB (or the developer's DDL + data scripts for
   v3.4.3.1)? Without the `tblSearch` rows the grids' joins, the `…Kt` F2 lists (J Series Type;
   ShastraPath Matter / Granth Type / Author Sampraday / Grade Subject / Project Detail;
   Performance-Evaluation Employee) and every popup's row query are unknown, and without
   `AddEmployeeEvaluation` Employee Evaluation has no data.
2. **Shastra Path Master**: hidden in the menu, cannot save on the desktop, and ShastraPath now
   lives inside Tirth Raksha Master. Skip it on the web? (Also: should Work Report's "Show In ›
   Shastra Path Master" be left out?)
3. **`frmLekhInwardEntry`** is dead code (nothing opens it). Confirm it is not to be ported and
   that "Lekh Inward Entry" on the web means the Newspaper Bag Inward screen.
4. **Newspaper Pages** ("Add Pages") is an unfinished stub. Port nothing, show a "not available"
   placeholder, or is there a specification of what it should do (page no, lekh no, final check /
   correction by)?
5. **Employee Performance Evaluation** is hidden and (very probably) cannot save. Skip it?
6. **Employee Evaluation**: (a) should "Mark Evaluation Done" be limited to admin / AMaster on
   the web (the desktop lets anyone do it, including for their own row)? (b) the F3 list and the
   top-performers grid show other employees' data to non-privileged users — keep or restrict?
   (c) is running `AddEmployeeEvaluation` on every open acceptable from the web?
7. **Desktop defects to fix or keep** in the live screens: J Series — Delete never works
   (`DeleteTransaction` not implemented) and Return Date is saved from the Issue Date cell;
   Bag Inward — Delete does nothing, Edit updates a differently named table
   (`LekhNewspaperBagInwardM`), "Add Pages" passes the wrong id. Proposed default: implement the
   evident intent (delete record + its issue rows; save the real Return Date; update the same
   table the insert uses) and record it under "deliberate differences" — please confirm.
8. **Table names**: which exists in production — `LekhNewspaperBagInward` or
   `LekhNewspaperBagInwardM`, `LekhNewspaperPage` or `LekhNewspaperPageM`?
9. **J Series party list** is hard-coded to five `PartyM` ids (3109, 3462, 5696, 5626, 6273).
   Keep the hard-coded list on the web?
10. **Menu**: the web's `Article` menu is commented out. Add it with only "Lekh Inward Entry", or
    also list Read Lekh / Lekh Master as "not available" items?
