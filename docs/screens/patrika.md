# Patrika (`Patrika`)

Desktop form: `GGLibrarySolution/Library/Issue/frmPatrika.vb` (+ `frmPatrika.designer.vb`,
title "Patrika", `Inherits frmMasterPage`), repository
`Library.BusinessContract/Concrete/PatrikaRepository.vb`, entity `Library.Entity/EntPatrika.vb`.
Menu: Issue › Patrika (`Frmlibmain.PatrikaToolStripMenuItem_Click`, MDI child). Also opened by
Lab Issue Master › Send To › Patrika with `StrId` = the selected PatrikaKm list.

**Ported (2026-10-07).** API `apps/api/src/master/screens/patrika.ts`, UI
`apps/web/src/screens/Patrika.tsx`, tests `apps/api/test/master-patrika.integration.test.ts`
and the two Patrika tests in `apps/web/e2e/batch-d.spec.ts`. The menu item is
`screen('patrika', 'Patrika', 'frmPatrika')` in `menu.ts`, with no visibility rule. See
"Web port" at the end for what differs from the desktop.

## Table and key

- Table `Patrika`, PK `PatrikaKm` (IDENTITY), 1,761 rows. There are no triggers.
- No `Locked` column. Ctrl+L / Ctrl+U would fail on the desktop (`lockable: false`).
- Audit columns: `enuser`/`endate` on insert and `moduser`/`moddate` on update, both `date`,
  set with `getdate()`.
- Columns the form never writes: `MixSign nvarchar(50)` (legacy, 32 rows filled) and
  `RecordNo_Revoke int` (84 rows filled, probably by a one-off renumbering). Leave both alone.

Columns (INFORMATION_SCHEMA): `RecordNo varchar(10)`, `CityKt int`, `SamvatTypeKt int`,
`Samvat nvarchar(20)`, `SamvatVK int`, `SizeKt int`, `Pages nvarchar(10)`, `AuthorKt int`,
`SampradayKt int`, `Remark nvarchar(1000)`, `txtPrasang nvarchar(500)`, `txtBhasha nvarchar(100)`.

## Fields

All boxes are TextBoxes in Times New Roman 14.25pt, height 29. Panel `SplitContainer1`
SplitterDistance **165**, panel width 1008. Labels are at x=13 (left column) and x=491 (right
column).

| Label (at)                     | Box                     | Column / pair                             | Location, size   | Tab | Notes                                                                                  |
| ------------------------------ | ----------------------- | ----------------------------------------- | ---------------- | --- | -------------------------------------------------------------------------------------- |
| "Prasang" (13,22)              | `txtPatrikaPrasangTran` | popup `PatrikaPrasangTran` → `txtPrasang` | (144,18) 343×29  | 1   | F2 opens the Prasang popup. **Required**                                               |
| "Nishradata/RecordNo" (491,22) | `txtAuthorKt`           | `AuthorKt` / `AuthorName`                 | (659,18) 244×29  | 3   | F2 tblSearch                                                                           |
|                                | `txtRecordNo`           | `RecordNo`                                | (904,18) 92×29   | 4   | Generated (see Derived values). **Required, unique**                                   |
| "Sampraday/City" (13,58)       | `txtSampradayKt`        | `SampradayKt` / `SampradayName`           | (144,54) 190×29  | 6   | F2 tblSearch                                                                           |
|                                | `txtCityKt`             | `CityKt` / `CityName`                     | (335,54) 152×29  | 7   | F2 tblSearch                                                                           |
| "Samvat" (491,58)              | `txtSamvatTypeKt`       | `SamvatTypeKt` / `SamvatTypeName`         | (659,54) 118×29  | 9   | F2 tblSearch                                                                           |
|                                | `txtSamvat`             | `Samvat`                                  | (778,54) 125×29  | 10  | F2 list of earlier values. Leaving it computes SamvatVK                                |
|                                | `txtSamvatVK`           | `SamvatVK`                                | (904,54) 92×29   | 11  | **ReadOnly**. Vikram Samvat, computed                                                  |
| "Size/Pages" (13,94)           | `txtSizeKt`             | `SizeKt` / `SizeName`                     | (144,90) 190×29  | 13  | F2 tblSearch                                                                           |
|                                | `txtPages`              | `Pages`                                   | (335,90) 152×29  | 14  | no F2 (empty F2EntryText)                                                              |
| "Remark" (491,94)              | `txtRemark`             | `Remark`                                  | (659,90) 337×64  | 16  | **Multiline**. F2 list of earlier values                                               |
| "Bhasha/Mix Sign" (13,129)     | `txtPatrikaBhashaTran`  | popup `PatrikaBhashaTran` → `txtBhasha`   | (144,125) 190×29 | 18  | F2 opens the Bhasha popup. **Required**                                                |
|                                | `txtPatrikaMixSignTran` | popup `PatrikaMixSignTran`                | (335,125) 152×29 | 19  | F2 opens the MixSign popup. Its text is **not** saved to Patrika (only the child rows) |

Label sizes: Prasang 69×21, Nishradata/RecordNo 173×21, Sampraday/City 130×21, Samvat 65×21,
Size/Pages 90×21, Remark 68×21, Bhasha/Mix Sign 136×21.

There are no defaults. `lblEntry` (from frmMasterPage) shows `GetEntryUser` for the clicked row
(`entryLabel: true`).

### SamvatVK (Txt_Leave)

When `txtSamvat` is left, and `txtSamvatTypeKt` has text, its Tag > 0 and the Samvat text is
longer than 2 characters:

- numeric Samvat → `txtSamvatVK = GetVikramSamvat(SamvatTypeKt, Samvat)`
- otherwise, if all but the last character is numeric (e.g. `2050?`) → the same with the last
  character dropped
- else SamvatVK keeps its value

The web already has this as `getVikramSamvat` in `apps/web/src/screens/AuthorMaster.tsx`, used by
Book Master the same way. The handler is also meant to run on leaving `txtSamvatTypeKt`, but it
compares `txt.Name.ToUpper` with the mixed-case `"txtSamvatTypeKt"`, so that half never matches
(harmless quirk: keep).

## Validation (`PatrikaRepository.GetValidationMessage`)

Messages are verbatim and joined with CRLF (`SignBetweenStr`), in this order:

1. `- Prasang is Mandatory` (when `txtPrasang` is `""`)
2. `- RecordNo is Mandatory`
3. `- RecordNo Already Exist`: `SELECT COUNT(PatrikaKm) from Patrika where PatrikaKm<>@id and RecordNo=@RecordNo`.
   This runs even when RecordNo is blank.
4. `- Bhasha is Mandatory` (when `txtBhasha` is `""`)

Before validating, Save asks "Are You Sure to Save This Record?". It shows "Record Saved
Successfully" afterwards.

## F2 lookups

From `tblSearch` (TransactionName `Patrika`, Type M) through the generic `Txt_KeyDown` branch
(`DisplayListForm(..., boolSelectFirst=True, AddTableInfo)`):

| Box                       | F2EntryText                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `txtSampradayKt`          | `SELECT SampradayKm AS Id,SampradayName AS Name FROM Sampraday WHERE ISNULL(SampradayName,'')<>'' ORDER BY SampradayName` |
| `txtCityKt`               | `select Tid AS Id,Vishesh AS Name from visheshMast where remark='city' AND ISNULL(Vishesh,'')<>'' ORDER BY Vishesh`       |
| `txtSizeKt`               | `SELECT Tid,Vishesh,v.Brief,v.Notes,v.HindiWord,v.ShortNm FROM VisheshMast AS v WHERE remark = 'size' ORDER BY Vishesh`   |
| `txtAuthorKt`             | `select authorcokm,authorname from authmast order by authorname`                                                          |
| `txtSamvatTypeKt`         | `select samvatcokm ,samvatname from samvmast order by samvatname`                                                         |
| `txtSamvat`               | `select Samvat from Patrika where isnull(Samvat,'')<>'' group by Samvat order by Samvat`                                  |
| `txtRemark`               | `select Remark from Patrika where isnull(Remark,'')<>'' group by Remark order by Remark`                                  |
| `txtPages`, `txtRecordNo` | empty F2EntryText (no list)                                                                                               |

The three `...Tran` boxes open popups instead (next section).

Ctrl+F opens the tblSearch searchable-column list (`IsSearchable=1`, by `seq`) and moves to the
search box (engine).

## Child tables saved with the record

Each popup is `frmDisplayTransNew` with `FormName = "Patrika"` (`SetForm_Patrika`,
`frmDisplayTransNew.vb:5833`). Rows load from the tblSearch Type-T `F2EntryText` with `{Id}` =
TranKm, the first time the popup opens. A popup that was never opened sends no table, and its
rows are left as they are.

| tblSearch ColumnName | Table             | Key                | Columns saved                       | Popup TranName | Cell F2 (`s = 0`)                                                                                                                                 |
| -------------------- | ----------------- | ------------------ | ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PatrikaBhashaTran`  | `PatrikaBhashaT`  | `PatrikaBhashaKm`  | `PatrikaKt, BhashaKt, Seq`          | `Bhasha`       | `BhashaName`: `SELECT bhashacokm,bhasa_attr,bhashaname FROM bhasmast WHERE ISNULL(bhasa_attr,'')<>'' order by bhashaname` (shows bhasa_attr)      |
| `PatrikaPrasangTran` | `PatrikaPrasangT` | `PatrikaPrasangKm` | `PatrikaKt, PrasangKt, Remark, Seq` | `Prasang`      | `PrasangName`: `select columnmastkm,Name from columnmaster where vibhag ='Prasang' ORDER BY Name` (42 rows)                                       |
| `PatrikaMixSignTran` | `PatrikaMixSignT` | `PatrikaMixSignKm` | `PatrikaKt, MixSignKt, Seq`         | `MixSign`      | `MixSignName`: `SELECT Tid,Vishesh,v.Brief,v.Notes,v.HindiWord FROM VisheshMast v WHERE remark='CHKBX' and v.VisheshNo in (1,3) ORDER BY vishesh` |

Load SQL (F2EntryText):

- Bhasha: `SELECT PatrikaBhashaT.PatrikaBhashaKm,PatrikaBhashaT.BhashaKt,bhasmast.bhasa_attr AS BhashaName,PatrikaBhashaT.Seq FROM PatrikaBhashaT INNER JOIN bhasmast ON PatrikaBhashaT.BhashaKt=bhasmast.bhashacokm where PatrikaBhashaT.PatrikaKt ={Id} order by PatrikaBhashaT.seq`
- Prasang: `SELECT PatrikaPrasangT.PatrikaPrasangKm,PatrikaPrasangT.PrasangKt,columnmaster.Name AS PrasangName,PatrikaPrasangT.Remark,PatrikaPrasangT.Seq FROM PatrikaPrasangT INNER JOIN columnmaster ON PatrikaPrasangT.PrasangKt=columnmaster.ColumnMastkm where PatrikaPrasangT.PatrikaKt ={Id} order by PatrikaPrasangT.seq`
- MixSign: `SELECT PatrikaMixSignT.PatrikaMixSignKm,PatrikaMixSignT.MixSignKt,visheshMast.Vishesh AS MixSignName,PatrikaMixSignT.Seq FROM PatrikaMixSignT INNER JOIN visheshMast ON PatrikaMixSignT.MixSignKt=visheshMast.Tid where PatrikaMixSignT.PatrikaKt ={Id} order by PatrikaMixSignT.seq`

Popup set-up (`s = 2`) hides the `…Km` and `…Kt` columns. Prasang also makes `Remark` editable.
An empty popup starts with one blank row and seq 1. A new row (`s = 1`) gets seq =
`Rows.Count + 1`. After a pick, focus moves to `Seq`.

**Save** (`PatrikaRepository.Save`, one transaction with the Patrika row): for each popup that
was loaded (`Columns.Count > 0`), rows with key 0 are INSERTed, the others UPDATEd. Then the
parent's rows whose key is not in the list are DELETEd (`… NOT IN(0,<kept>)`). This is exactly
`upsertChildRows`: `{ table: 'PatrikaBhashaT', key: 'PatrikaBhashaKm', parent: 'PatrikaKt',
columns: { BhashaKt: 'int', Seq: 'int' } }`, and the same for Prasang (`Remark: 'text'`) and
MixSign. The desktop writes Prasang's `Remark` with `INSQ`, so a blank remark is stored as `' '`.
`upsertChildRows` does the same with `text`. No child audit columns.

**Summary text** written back into the box after the popup's OK:

- Prasang: the `PrasangName` cells, comma-joined → `txtPatrikaPrasangTran` → saved as
  `Patrika.txtPrasang`.
- Bhasha and MixSign: the generic summary. Only the name column remains once the
  `kt/km/id/seq/cted` columns are skipped, so it is the names comma-joined (`summary: 'generic'`).
  Bhasha → `Patrika.txtBhasha`. The MixSign text is display only.
- `,,` is collapsed to `,`.

**On reload** the boxes show the tblSearch JoinCondition text (`PatrikaPrasangTran`,
`PatrikaBhashaTran` STUFFs), not the stored `txtPrasang`/`txtBhasha`. The Prasang and Bhasha
STUFFs have **no ORDER BY** (MixSign's orders by Seq), so the text can come back in a different
order. Saving without opening the popup then writes that text into `txtPrasang`/`txtBhasha`
(harmless quirk: keep).

## Grid columns

`GetDataTable` (tblSearch `DisplayInGrid=1`, by GridSeq). Order is `PatrikaKm DESC`. No default
condition.

| #   | Header (Designer) | Width | Data column                                      |
| --- | ----------------- | ----- | ------------------------------------------------ |
| 0   | Id                | 50    | `PatrikaKm`                                      |
| 1   | RecNo             | 50    | `RecordNo`                                       |
| 2   | Prasang           | 180   | `txtPrasang` (GridColumnName: the stored text)   |
| 3   | Sampraday         | 150   | `SampradayName`                                  |
| 4   | City              | 120   | `CityName`                                       |
| 5   | Size              | 70    | `SizeName`                                       |
| 6   | Pages             | 50    | `Pages`                                          |
| 7   | Bhasha            | 100   | `txtBhasha` (GridColumnName)                     |
| 8   | MixSign           | 100   | `PatrikaMixSignTran` (the STUFF, GridColumnName) |
| 9   | Nishradata        | 150   | `AuthorName`                                     |
| 10  | Samvat Type       | 100   | `SamvatTypeName`                                 |
| 11  | Samvat            | 100   | `Samvat`                                         |
| 12  | Remark            | 100   | `Remark`                                         |

FullRowSelect, ReadOnly, AllowUserToOrderColumns, context menu `cntMenu`. After an Edit save,
`RefreshCurrentGridRecord` puts the box text in the Prasang and Bhasha cells.

## Derived values

### RecordNo: `GetRecordNo("Patrika","RecordNo",Prefix)` (`MdlLib.vb:1874`)

```sql
-- Prefix 'P' becomes 'P0' (a 1-character prefix gets a '0'); 'EP' stays 'EP'
Select ISNULL(MAX((RIGHT(RecordNo,5))),0)+1 From Patrika WHERE LEFT(RecordNo,2)='<P0|EP>'
```

The result is padded to 5 digits: `P0` + `01762` = `P001762`, or `EP00002`. At 6 digits it gets
no padding. MAX is taken over the text, which works because the numbers are zero-padded. Data
today: `P0` has 1,760 rows (max `P001761`), `EP` has 1 (`EP00001`).

When it is computed:

- **btnNew** (New, and at load when the grid is empty): Prefix = `EP` if the **current grid
  row's** RecordNo starts with `EP`, else `P`. With no rows, `dgMain.CurrentRow` is Nothing and
  the desktop throws (MsgBox), leaving RecordNo blank (harmless quirk). The web should default to
  `P`.
- **Any key pressed in `txtRecordNo` while in Add mode** asks "Press(Yes) for P Series" + CRLF +
  "Press(No) for EP Series" (title "Select Series") and regenerates. So in Add mode the number
  cannot be typed by hand. In Edit mode the box is free text (still unique-checked).

There is no lock: two users can get the same number. The unique check in validation catches the
second save. On the web, take the number again inside the save transaction, or rely on
validation (desktop parity).

## Delete

"Are You Sure to Delete This Record?" → Security password (`InputBoxProc`) →
`DeleteTransaction(id)` (deletes PatrikaBhashaT, PatrikaPrasangT and PatrikaMixSignT
`WHERE PatrikaKt=id`, on its own connection, errors swallowed) → `CommonRepository.Delete`
(`DELETE FROM Patrika WHERE PatrikaKm=id`) → "Record Deleted " (with the trailing space; title
"Information").

There is **no in-use check**. References left dangling: `graphicbkt.PatrikaKt` (735 rows use it),
`issuetran.PatrikaKt`, `AuthorRefLibno.PatrikaKt`, and `LabIssueM` rows with `Type='Patrika'`
(BookTKt = PatrikaKm). The web blocks the delete in that case (see "Web port") and does the
four deletes in one transaction (`deleteRecord`).

## Work report

- `insertworkreports(TransactionName, PrimaryColumn, TranKm, …)` runs after every successful
  Add and Edit (`workReport: true`). Delete does not log (`workReportOn: { add: true, edit: true }`).
- Work Report button: standard frmDisplayTransNew "WorkReport" (engine).
- Copy is disabled at load (`btnCopy.Enabled = False`). btnCopy only resets TranKm/StrMode after
  "Do You Want to Add More With Copying Data?" (the engine's copy). The desktop Copy keeps the
  popups' DataTables as loaded, so their rows keep their old keys. Saving the copy re-UPDATEs the
  original's child rows (their keys are not 0, and `PatrikaKt` is not in the UPDATE), so the new
  record gets **no** child rows, although its `txtPrasang`/`txtBhasha` text is copied (harmless
  quirk). Copy is disabled at load and only `EnableDisableDataEditing` can re-enable it. On the
  web, either leave Copy off or reset the child keys to 0 (`copy.loadTrans` + `onCopy`). Copy also keeps the RecordNo, which fails "- RecordNo Already
  Exist" until a key is pressed in the RecordNo box.

## Right-click menu (`cntMenu`)

| Item                                                 | Behaviour                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column                       | engine's `PrintSelectedColumn`. The submenu also lists `Config_Master` rows with ConfigType `Patrika` and a ShortcutKey. There are **none** today                                                                                                                                                                                        |
| Print Report › Send To Excel                         | engine's                                                                                                                                                                                                                                                                                                                                 |
| For Selected Record › Graphics Detail                | `SELECT ISNULL(STUFF((SELECT ',' + CAST(graphicBkTkm AS VARCHAR(10)) FROM graphicbkt WHERE PatrikaKt IN(<selected ids>) FOR XML PATH('')),1,1,''),0)`. "0" → "No Record Found", else it opens `frmGraphicsDetail` with `StrId` (MDI). Web: an `open` action on `graphics-detail` (not ported yet; until then the "not available" window) |
| For Selected Record › Utility › Request For LabIssue | one `LabIssueM` request per selected row, `Type='Patrika'`. See below                                                                                                                                                                                                                                                                    |
| Utility › Show Attachments                           | **desktop only** (`CommonLibrary.frmAttachments`, files on disk) → `ATTACHMENTS_DESKTOP_ONLY`                                                                                                                                                                                                                                            |
| Update RecordNo                                      | **`Visible = False`** in the Designer, so users never see it. **Do not port** (see bugs)                                                                                                                                                                                                                                                 |

### Request For LabIssue (`RequestForLabIssue(ForKt = 0)`)

The For party is always 0 here. There is no confirmation. For each selected row, in order:

1. Build `EntLabIssueM { LabIssueMkm: 0, BookTKt: PatrikaKm, BookTName: RecordNo, Type: 'Patrika', enuserKt: me, Forkt: 0 }`.
2. `LabIssueMRepository.GetValidationMessage`. For Type Patrika the IssueTran check is skipped:
   - BookTKt = 0 → `Please Enter Patrika No`
   - an open request (not returned, not cancelled) on the same BookTKt →
     `Lib No - <RecordNo> already Requested For LabIssue By - <uname>` (the labels are swapped in
     the desktop: Patrika says "Lib No"; keep verbatim). `<uname>` is the Transfer user if set,
     else the requester.
3. If that passes, `GetUserNotReturnedBook(me, 0)` → `You Cannot Issue any Books` + CRLF +
   `Please Return<n>  Nos. of 30 days Old Due Books to Issue New Books.`
   (Desktop v3.4.3.1 switched this check off; on the web it runs only with
   `LAB_ISSUE_OLD_DUE_BLOCK=true`, see lab-issue-master.md.)
4. A failure shows the message and **stops**. Rows already inserted stay (no transaction).
5. Otherwise `Save`: `INSERT INTO LabIssueM (BookTKt,enuserKt,endate,Forkt,StatusKt,Type) VALUES (…, getdate(), 0, <DlvrPen=9635>, 'Patrika')`.
6. After the loop, if the last insert succeeded: "Book Issued Successfully".

The full rules and SQL are in `lab-issue-master.md`. Port it by reusing `book-tran.ts`'s
`request-lab-issue` logic, parameterised by type (`'Patrika'`: skip the IssueTran check, swap
the label). Better, move it to a shared `lab-issue-common.ts`.

## Reports and printing

No `.rpt`. Only the grid's Print Selected Column / Send To Excel.

## Permissions

- No menu visibility rule (`menu.ts`), so every logged-in user can open it.
  `@ScreenAccess('patrika')`.
- `clsCom.EnableDisableDataEditing(ToolStrip1)`: the standard toolbar state, not per-user.
- No `curr_utypeid`/`curr_lnid` checks in the form.

## SQL in form event handlers

- Load: `select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where ConfigType='Patrika' and isnull(ShortcutKey,'')<>'' order by ConfigName`
- Graphics Detail and Update RecordNo SQL: above.
- Update RecordNo (hidden): `SELECT PatrikaKm FROM Patrika ORDER BY PatrikaKm`, then for each
  row `GetDataById` + `GetRecordNo(...,'P')` + `Save(Ent, Nothing, Nothing, Nothing)`.

## Desktop bugs

- **Data-corrupting (hidden item, do not port):** Update RecordNo renumbers _every_ Patrika as
  P-series in PK order, so EP records become P. It also goes through `GetDataById`, which reads
  `Ent.Remark = Val(Remark)` and so writes every Remark back as a number (`"0"` for text). Since
  the item is invisible, leave it out of the web.
- **Throws (harmless):** btnNew with an empty grid (`CurrentRow` is Nothing). The web defaults
  the prefix to `P`.
- **Throws (harmless):** Ctrl+L / Ctrl+U: there is no `Locked` column.
- **Dangling references:** Delete leaves graphicbkt / issuetran / AuthorRefLibno / LabIssueM
  references dangling. The web refuses such a delete instead (see "Web port").
- **Harmless quirk (keep):** the Prasang/Bhasha display text has no ORDER BY (above).
- **Harmless quirk (keep):** SamvatVK is not recomputed when the Samvat Type changes.
- **Wrong block (see lab-issue-master.md):** the "already requested" check matches only
  `BookTKt`, not `Type`. A Patrika whose PatrikaKm equals the tid of a BookT row with an open
  request is reported as already requested, and the reverse.

## Implementation hints

- An ordinary master screen: `apps/api/src/master/screens/patrika.ts` + `apps/web/src/screens/Patrika.tsx`.
  `table: 'Patrika'`, `primaryColumn: 'PatrikaKm'`, `lockable: false`, `workReport: true`,
  `workReportOn: { add: true, edit: true }`. The list comes from `GetDataTable` as usual
  (tblSearch GridColumnName already maps Prasang/Bhasha to the stored text).
- `save`: INSERT/UPDATE the 12 columns + audit, then `upsertChildRows` for the three popups that
  were sent (`grid(f, 'PatrikaBhashaTran') !== null`, as `book-tran.ts` does for MarkTran).
  `txtPrasang`/`txtBhasha` come from the box text.
- `trans`: `PatrikaBhashaTran`, `PatrikaPrasangTran`, `PatrikaMixSignTran` with the three cell
  lookups above. On the web `TransSpec`: hidden `…Km`/`…Kt`, editable name/Seq (and Prasang
  Remark). Bhasha and MixSign use `summary: 'generic'`. Prasang needs a custom summary that joins
  `PrasangName` only, because the generic one would append `-<Remark>`.
- `newDefaults` cannot see the current row. Either pass the prefix as an action
  (`'next-recordno'` with `prefix: 'P' | 'EP'`, like `book-tran.ts`'s `next-libno`), or have the
  client pick P/EP from the current row and call it. For the RecordNo box, open the P/EP
  question on the first key press in Add mode (`yesNoCancel`/`confirm` "Select Series").
- Samvat: `onFieldLeave` for `Samvat` using `getVikramSamvat` (move it from `AuthorMaster.tsx`
  to a shared module if a third screen now needs it).
- `deleteRecord`: the three child DELETEs, then the Patrika row, in the transaction.
- Context menu: `graphics-detail` open action (empty → "No Record Found"),
  `request-lab-issue` (shared with book-tran, Type Patrika), Show Attachments → desktop-only
  message. Omit Update RecordNo.
- **Engine gaps:** none blocking. The only new piece is the shared lab-issue request helper.

## Web port

What was ported: the record (12 columns + audit), the three popups (upsert with keys kept,
`upsertChildRows`), validation, the P / EP RecordNo series, Samvat → SamvatVK on leave, Copy,
Delete, the work report (Add and Edit, not Delete), and the right-click menu (Print Report,
Graphics Detail, Request For LabIssue, Show Attachments). Lab Issue Master › Send To › Patrika
now opens this screen with the selected requests' records.

### Engine extensions (generic, opt-in)

- `FieldSpec.onKey(key, ctx)`: a box's own KeyDown for ordinary keys (not Tab, modifiers alone,
  Ctrl/Alt shortcuts, F1/F2); returning true swallows the key. Used for txtRecordNo_KeyDown.
- `FormContext.confirm`: MsgBox YesNo from a form handler ("Select Series").
- `ScreenSpec.onNew.params` also gets `current`, dgMain.CurrentRow's cells (btnNew_Click reads
  the current row's RecordNo for the series).

### Deliberate choices and differences

- **RecordNo**: New calls `new-defaults?prefix=P|EP` with the series of the current grid row's
  RecordNo (`EP…` → EP, else P). With an empty grid it is P (the desktop throws there). A key in
  the RecordNo box in Add mode asks "Press(Yes) for P Series / Press(No) for EP Series" (title
  "Select Series") and fills it from the `next-recordno` action; the key itself is not typed.
  Tab, Ctrl/Alt shortcuts and F1/F2 do not trigger it (on the desktop every KeyDown did,
  modifiers included). The series' MAX uses `TRY_CAST(RIGHT(RecordNo,5) AS int)` so a stray
  RecordNo cannot make the query fail.
- **Validation** runs inside the save's transaction (the unique check needs the database, and
  the RecordNo range is held with UPDLOCK so two saves cannot both pass it). The messages, their
  order and CRLF joining are the desktop's. After them, overlong values are refused with a
  message instead of the desktop's SQL truncation error: RecordNo 10, Prasang 500, Bhasha 100,
  Samvat 20, Pages 10, Remark 1000, the Prasang popup's Remark 500 ("<label> cannot be longer
  than <n> characters").
- **Delete** (decision): refused with an in-use message when the record is referenced, checked
  in this order: `graphicbkt` → "Record is used in Graphics Detail", `issuetran` → "Record is
  used in Issue Master", `AuthorRefLibno` → "Record is used in Author Master", `LabIssueM`
  (Type 'Patrika') → "Record is used in Lab Issue Master". The desktop deletes and leaves those
  references dangling (735 graphicbkt rows, 8 issuetran rows and 393 Patrika lab requests point
  at Patrika rows today). Otherwise the three child tables and the record go in one transaction.
- **Copy** (decision): the three popups are loaded and their row keys set to 0
  (`copyWithNewKeys(…, 'zero')`), so the copy gets its own child rows. RecordNo is kept, as on
  the desktop: Save says "- RecordNo Already Exist" until a key in the RecordNo box picks a new
  number. The desktop disables Copy at load until the first Save/Cancel; the web leaves it to
  the engine's usual toolbar state.
- **Update RecordNo** (hidden on the desktop, data-damaging): not ported.
- **Request For LabIssue** goes through `lab-issue-common.ts` `requestLabIssue` with Type
  'Patrika' and For party 0. The cross-type "already requested" match (BookTKt only) is kept,
  as decided for Lab Issue Master.
- **Graphics Detail** returns `{kind:'open', screen:'graphics-detail', ids}` ("No Record Found"
  when none); until Graphics Detail is ported it opens the "not available" window.
- **Show Attachments**: `ATTACHMENTS_DESKTOP_ONLY`.
- Ctrl+L / Ctrl+U: `lockable: false` (no Locked column).
- An Edit of a record the same user added today logs nothing (the engine's insertworkreports
  port, as on the desktop).

### Desktop bugs fixed

- Delete outside a transaction, with DeleteTransaction's errors swallowed: now one transaction.
- Copy re-saving the original's child rows (the copy got none): fixed by the key reset above.
- Overlong values aborting the save with an SQL error: validation messages.
- New with an empty grid throwing: defaults to P.

### Kept quirks

The Prasang/Bhasha display text from tblSearch has no ORDER BY; SamvatVK is not recomputed when
the Samvat Type is left; the MixSign box text is not saved; Prasang's blank Remark is stored as
' '.

### Deferred

Nothing screen-specific beyond Graphics Detail (its own screen, not ported yet) and the
attachments (files).
