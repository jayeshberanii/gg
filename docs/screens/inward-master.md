# Inward Master (`InwordM`)

Desktop form: `GGLibrarySolution/Library/Issue/frmInwordMaster.vb` (+ `.designer.vb`, title
"Inword Master"), repository `Library.BusinessContract/Concrete/InwordMRepository.vb`, entity
`Library.Entity/EntInwordM.vb`. Menu: Issue › Inward Master (no visibility rule in
`Frmlibmain_Load`, so every user sees it).

Base class `frmMasterPage`: the standard toolbar, UcSearch and UcPrevNext. `ClientSize` is
1014×708 and the form opens maximized. `SplitContainer1` is horizontal, at (0,51), 1008×642, with
`SplitterDistance = 388`. The form is in Panel1 and `dgMain` (Dock Fill) is in Panel2.

## Table and key

- Table `InwordM`, PK `inwordkm` (IDENTITY). There are no triggers. 3,533 rows in the local DB.
- Has `Locked` (bit), so `lockable: true`. Lock and unlock are **plain L / U on the grid**
  (`dgMain_KeyDown`, no Ctrl), behind the Security password (`InputBoxProc`), via
  `CommonRepository.LockUnlockRecords`.
- Audit: `enuser`, `endate = getdate()` on insert; `moduser`, `moddate = getdate()` on update.

## Fields

All controls use Times New Roman 14.25pt. There are three columns: labels at x = 13 / 366 / 711,
inputs at x = 149 (w 196) / 503 (w 195) / 844 (w 158), and every input is 29 high. Label y is
18 / 59 / 100 / 141 / 182 / 223 / 264 / 305 / 346 by row (the first row's labels sit level with
their boxes; the others 1 to 6 px lower). TabIndex is in brackets.

| y   | Col 1 (label → control)                                                                                                                           | Col 2                                                            | Col 3                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | "In/Out" → `cmbInOut` [1] combo `IN`,`OUT` (DropDown style, not DropDownList)                                                                     | "Vibhag" → `txtVibhagkt` [19]                                    | "VibhagSrNo" → `txtVibhagSrNo` [37]                                                                                                                                              |
| 58  | "Item" → `txtitemkt` [3]                                                                                                                          | "From" (`lbltxtref`) → `txtfromkt` [21]                          | "Prapt Type" → `txtpraptypekt` [39]                                                                                                                                              |
| 98  | "Via" → `txtviakt` [5]                                                                                                                            | "Ref. Name" → `txtRefrenceNm` [23]                               | "In Type" → `txtintypekt` [41]                                                                                                                                                   |
| 138 | "For" → `txtforkt` [7]                                                                                                                            | "Efforts" → `txteffortskt` [25]                                  | "Ref No" → `txtrefno` [43]                                                                                                                                                       |
| 178 | "Paid Amount" → `txtpaidamount` [9]                                                                                                               | "In Date" → `dtpindate` [27] DateTimePicker `dd-MM-yyyy`         | "In By" → `txtinbykt` [45]                                                                                                                                                       |
| 218 | "subject" → `txtsubject` [11]                                                                                                                     | "Detail" → `txtdetail` [29]                                      | "PC Location" → `txtPCLocation` [47]                                                                                                                                             |
| 258 | "Physical Loca." → `txtPhysicallocation` [13]                                                                                                     | "To Returned" → `cmbToReturned` [31] combo `No`,`Yes` (DropDown) | "Status" → `txtStatuskt` [49]                                                                                                                                                    |
| 298 | "Status Remark" → `txtStatusRem` [15]                                                                                                             | "General Rem." → `txtGeneralRemark` [33]                         | "Returned" → `cmbReturned` [51] combo `No`,`Yes`, **DropDownList**                                                                                                               |
| 335 | "Return Date" → `txtReturDate` [17] (y 335, **Enabled = False**, always blank) **or** `dtpreturndate` [25] (y 338, `dd-MM-yyyy`, Visible = False) | "Return Rem." → `txtreturnremark` [35] (y 340)                   | "Work Given" → `txtWorkGivenTran` [53] (y 342): **the count** of `WorkGivenM` rows with `inwordkt = id` (`CheckWorkAsign`). F2 opens Work Given (see below); this is not a popup |

Column map (the desktop's `SetTextbox` matches `txt<Column>`, and `…kt` boxes show `<col>Name`):

| Column                                                               | Type          | Control / notes                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InOut`                                                              | bit           | `cmbInOut`: OUT = 1, IN = 0 (`SelectedItem = "OUT"`). Shows "OUT"/"IN"                                                                                                                        |
| `Vibhagkt` / `VibhagName`                                            | int           | F2 inline (below); **required**. Picking it sets `VibhagSrNo = GetVibhagSrNo`                                                                                                                 |
| `VibhagSrNo`                                                         | int           | editable number. 0 or blank at save → the repository assigns `MAX+1` per Vibhag                                                                                                               |
| `itemkt`, `praptypekt`, `viakt`, `intypekt`, `effortskt`, `Statuskt` | int           | columnmaster F2s (below)                                                                                                                                                                      |
| `fromkt`, `forkt`                                                    | int           | PartyM F2                                                                                                                                                                                     |
| `inbykt`                                                             | int           | Usecurity F2                                                                                                                                                                                  |
| `RefrenceNm`                                                         | nvarchar(150) | F2 earlier values                                                                                                                                                                             |
| `refno`                                                              | nvarchar(150) | F2 earlier values                                                                                                                                                                             |
| `paidamount`                                                         | int           | `Val(text)`                                                                                                                                                                                   |
| `indate`                                                             | datetime      | `dtpindate`, saved as the date (`MM-dd-yyyy`)                                                                                                                                                 |
| `subject`                                                            | nvarchar(500) | F2 earlier values                                                                                                                                                                             |
| `detail`                                                             | nvarchar(max) | single-line box; F2 earlier values                                                                                                                                                            |
| `PCLocation`                                                         | nvarchar(500) | **file path.** Desktop F2 opens an OpenFileDialog. **Web: plain text field**; F2 shows the `desktopOnly` message (decision 2026-10-05), or falls back to the tblSearch list of earlier values |
| `Physicallocation`                                                   | nvarchar(250) | F2 earlier values                                                                                                                                                                             |
| `ToReturned`                                                         | bit           | `cmbToReturned` Yes/No                                                                                                                                                                        |
| `StatusRem`                                                          | nvarchar(500) | F2 earlier values                                                                                                                                                                             |
| `GeneralRemark`                                                      | nvarchar(250) | F2 earlier values                                                                                                                                                                             |
| `returned`                                                           | bit           | `cmbReturned` Yes/No. **Yes** shows `dtpreturndate` and hides `txtReturDate`. Anything else shows the disabled blank box (`cmbReturned_SelectedIndexChanged`)                                 |
| `returndate`                                                         | datetime      | **always saved** from `dtpreturndate.Value`, even when Returned = No and the picker is hidden. None of the 3,533 rows is NULL. Keep this behaviour                                            |
| `returnremark`                                                       | nvarchar(500) | F2 earlier values                                                                                                                                                                             |
| `Locked`, `enuser`, `endate`, `moduser`, `moddate`                   |               | not on the form                                                                                                                                                                               |

**New** (`btnNew`) runs `clsCom.clear(Panel1)`, which clears **TextBoxes only** (text and Tag).
The three combos and both date pickers **keep the previous record's values**. That is a harmless
quirk. On the web, reset them to IN / No / No / today, or keep the desktop behaviour; either is
fine.

## Validation (`InwordMRepository.GetValidationMessage`)

Run after the confirm "Are You Sure to Save This Record?":

1. `Vibhagkt = 0` → `"Please Enter Vibhag"`
2. otherwise, if `VibhagSrNo > 0` and
   `SELECT COUNT(VibhagSrNo) FROM InwordM WHERE Vibhagkt=@v AND VibhagSrNo=@n AND inwordkm<>@id`
   is greater than 0 → `"VibhagSrNo " & n & " is already assigned"`

On success: `"Record Saved Successfully"`.

## F2 lookups

| Field                                                                                                    | Source                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vibhag (`txtVibhagkt`)                                                                                   | **inline** `select ColumnMastkm,Name from columnmaster WHERE Vibhag='vibhag' ORDER BY Name` (224 rows; tblSearch's F2EntryText is empty). After a pick: `txtVibhagSrNo = SELECT ISNULL(MAX(VibhagSrNo),0)+1 FROM InwordM WHERE Vibhagkt=@v`                                                  |
| Item                                                                                                     | tblSearch: `select ColumnMastkm,Name from columnmaster WHERE Vibhag='InItem' ORDER BY Name`                                                                                                                                                                                                  |
| Prapt Type                                                                                               | `… Vibhag='bkPrapType'`                                                                                                                                                                                                                                                                      |
| Via                                                                                                      | `… Vibhag='bkPrapVia'`                                                                                                                                                                                                                                                                       |
| In Type                                                                                                  | `… Vibhag='intype'`                                                                                                                                                                                                                                                                          |
| Efforts                                                                                                  | `… Vibhag='bkPrapEfort'`                                                                                                                                                                                                                                                                     |
| Status                                                                                                   | `… Vibhag='WorkStatus'`                                                                                                                                                                                                                                                                      |
| From, For                                                                                                | `select partyMkm,PName,txtAddress,v1.Vishesh sampraday ,v2.Vishesh guru , Mrecno,v3.Vishesh, refrence from PartyM p left outer join visheshMast v1 on v1.tid=Sampradaykt left outer join visheshMast v2 on v2.tid=Gurukt left outer join visheshMast v3 on v3.tid=Categorykt order by PName` |
| In By                                                                                                    | `select tid,uname from Usecurity order by uname`                                                                                                                                                                                                                                             |
| detail, GeneralRemark, refno, subject, PCLocation, Physicallocation, RefrenceNm, returnremark, StatusRem | tblSearch `select <col> from InwordM where isnull(<col>,'')<>'' group by <col> order by <col>`                                                                                                                                                                                               |
| Paid Amount                                                                                              | tblSearch row is **broken SQL**: `select (PaidAmount from InwordM …`. The desktop shows the SQL error. Web: no F2 on this field (or a corrected list). Harmless                                                                                                                              |
| VibhagSrNo                                                                                               | F2EntryText `''`: nothing happens                                                                                                                                                                                                                                                            |
| Work Given (`txtWorkGivenTran`)                                                                          | not a lookup. In Edit mode it opens `frmWorkGivenMaster` with `InwordKm = id` (Add mode: nothing). Work Given is commented out of the menu and not ported, so the web shows "not available on the web yet"                                                                                   |

## Grid columns

From the Designer (`AutoGenerateColumns = False`), bound to the GetDataTable result. The headers
are the Designer's. Width is 100 where not given.

| #   | Header     | Bound column | Width                                                                                |
| --- | ---------- | ------------ | ------------------------------------------------------------------------------------ |
| 0   | inwordkm   | `inwordkm`   | 5 (effectively hidden)                                                               |
| 1   | Vibhag     | `VibhagName` | 150                                                                                  |
| 2   | VibhagSrNo | `VibhagSrNo` | 100                                                                                  |
| 3   | InOut      | `InOut`      | 100: tblSearch `GridColumnName` = `CASE WHEN InOut=1 THEN 'OUT' ELSE 'IN' END InOut` |
| 4   | InDate     | `InDat`      | 100, `dd-MM-yyyy`: `GridColumnName` = `InDate AS InDat`                              |
| 5   | In Type    | `intypeName` | 100                                                                                  |
| 6   | From       | `fromName`   | 100                                                                                  |
| 7   | For        | `forName`    | 150                                                                                  |
| 8   | item       | `itemName`   | 150                                                                                  |
| 9   | Subject    | `subject`    | 100                                                                                  |
| 10  | Detail     | `detail`     | 200                                                                                  |
| 11  | Status     | `StatusName` | 100                                                                                  |

The tblSearch rows (`DisplayInGrid=1`, `GridSeq` 0–12) exist in the local DB, plus `Locked` at
GridSeq 12. Order: `inwordkm DESC`. There is no default condition. Grid style: header
LightSteelBlue / DarkRed in Arial Unicode MS 9pt, rows in Verdana 12pt, full-row select, no row
headers.

The search combo comes from tblSearch `IsSearchable = 1`, ordered by `seq`. UcSearch's "User
Master" option (frmSearchUser) is the shared engine item that is not built yet.

## Derived values

- `VibhagSrNo`: `SELECT ISNULL(MAX(VibhagSrNo),0)+1 FROM InwordM WHERE Vibhagkt=@v`, run on the
  Vibhag F2 pick, on Copy, and in `Save` when `Vibhagkt > 0 AND VibhagSrNo = 0`. The local DB
  has no duplicate (Vibhagkt, VibhagSrNo) pairs.
- `txtWorkGivenTran` = `SELECT COUNT(*) FROM WorkGivenM WHERE inwordkt=@id` (read-only on the web).

## Child tables saved with the record

None. The tblSearch Type T rows `workassignCnt`, `BookTCnt` and `InwordAssignT` have no SQL and
are never used by the form.

## Copy

"Do You Want to Add More With Copying Data?" → Yes: `inwordkm = 0`, mode Add. If
`Val(txtviakt.Tag) > 0`, it also sets `txtVibhagSrNo = GetVibhagSrNo(Vibhagkt)`.
**Bug (harmless quirk):** it tests **Via**, not Vibhag. With Via empty, the copied VibhagSrNo is
kept and Save then says "VibhagSrNo n is already assigned". On the web, test Vibhag. The user only
gains from this.

## Delete

- **Toolbar Delete:** Security password (`InputBoxProc`) → `CheckInUse`. A non-empty result is
  shown and stops the delete → `DELETE FROM InwordM WHERE inwordkm=@id` → `"Record Deleted "`
  (Information).
- **Ctrl+D:** first "Are You Sure to Delete This Record?", then the password, then the same path,
  which asks for the password **a second time**. That is a harmless quirk. The web asks once.
- `CheckInUse`, in order:
  1. `SELECT COUNT(inwordkt) FROM WorkGivenM WHERE inwordkt=@id` > 0 → `"Record is in used in Work Assign Master"`
  2. `SELECT COUNT(inwordkt) FROM BookT WHERE inwordkt=@id` > 0 → `"Record is in used in BookT"`
- `LetterBhetM.inwordkt` is **not** checked. A letter can point to a deleted inward; the
  letter's grid then shows a blank Inword. Keep this.

## Work report

`clsCom1.insertworkreports(TransactionName, PrimaryColumn, id, curr_lnid, dtSel, dtTmpSel)`
runs after every successful **Add and Edit** save, but not after Delete:
`workReport: true, workReportOn: { add: true, edit: true }`. The Work Report button
(frmDisplayTransNew "WorkReport") is the standard one.

## Right-click menu (`cntMenu` on `dgMain`)

The selected ids are `clsCom.GetIdFrom_GridRecord(dgMain, inwordkm)`: all selected rows.

| Item                            | Behaviour                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column  | engine's PrintSelectedColumn. Config_Master has **no** `InwordM` layouts locally, but the form adds any it finds as sub-items                                                                                                                                                                                                                                                                     |
| (no Send To Excel on this form) | —                                                                                                                                                                                                                                                                                                                                                                                                 |
| Send To › WorkGivenM            | `SELECT ISNULL(STUFF((SELECT DISTINCT ',' + CAST(WorkGivenMkm AS VARCHAR) FROM WorkGivenM WHERE InwordKt IN(<ids>) FOR XML PATH('')),1,1,''),0)` → if not "0", open Work Given with those ids, else `"No Record Found"`. Work Given is not ported, so the web returns the "not available" result after the No Record check                                                                        |
| Send To › BookM                 | if `SELECT COUNT(*) FROM BookT WHERE InwordKt IN(<ids>)` > 0 → open `book-master` with `WhereCondition = " AND BookMastKm IN(SELECT DISTINCT bookmastkt FROM BookT WHERE InwordKt IN(<ids>))"`, else `"No Record Found"`                                                                                                                                                                          |
| Send To › BookT                 | same count → open `frmBookTranNew` **as a dialog** with `WhereCondition = " AND Tid IN(SELECT DISTINCT Tid FROM BookT WHERE InwordKt IN(<ids>))"` (web: the `book-tran` screen), else `"No Record Found"`                                                                                                                                                                                         |
| Send To › Party Master          | distinct `ForKt` (>0) of the ids, merged with distinct `FromKt` (>0) (`SignBetweenStr`) → `"No Record Found"` if both are empty, else open `party-master` with those ids                                                                                                                                                                                                                          |
| Send To › Letter Bhet Master    | `SELECT ISNULL(STUFF((SELECT DISTINCT ',' + CAST(LetterBhetMKm AS VARCHAR) FROM LetterBhetM WHERE InwordKt IN(<ids>) FOR XML PATH('')),1,1,''),0)` → open `letter-bhet` with `StrId` = those ids. If the result is "0", the letter form opens **empty in Add mode with Inword pre-filled**: Tag = the current row's `inwordkm`, Text = its Vibhag name. See `letter-bhet.md` › Opened from Inward |

## Reports and printing

No Crystal report. There is only PrintSelectedColumn.

## Permissions

The menu item is visible to everyone. `FillData` puts the toolbar in its **Locked** state
(`EnableDisableDataEditing(..., True)`: Modify, Delete and Copy off) when:

- `Locked = 1`, **or**
- the user is not an admin (`IsAdminLogin` = `user.isAdmin`) **and** `EnUser <> curr_lnid`.

Non-admins can only edit inward rows they entered themselves. This is the first ported screen
where this owner rule is live. Only frmWorkGivenMaster has it live as well; Prakashak, Issue
(frmIssueTran) and Magazine have the same line commented out (with an extra "EnUser blank" case).

## Files / disk

`PCLocation` F2 = OpenFileDialog. Deferred: text field plus the `desktopOnly` message.

## Desktop bugs

- **Harmless quirk:** Copy tests Via instead of Vibhag (above). On the web, test Vibhag.
- **Harmless quirk:** Ctrl+D asks for the password twice.
- **Harmless quirk:** the Paid Amount F2 SQL is broken (tblSearch data).
- **Harmless quirk:** New keeps the combos and dates.
- **Throws:** `GetDataById` does `Ent.intypeName = Val(...)`. The method is unused by the form, so
  there is nothing to port.

## SQL in form event handlers

Listed above: the Vibhag F2, `GetVibhagSrNo`, `CheckWorkAsign`, the Send To queries, and the
`Config_Master` read `select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where ConfigType='InwordM' and isnull(ShortcutKey,'')<>'' order by ConfigName`.

## Web port (2026-10-07)

API `apps/api/src/master/screens/inward.ts`, UI `apps/web/src/screens/InwardMaster.tsx`, tests
`apps/api/test/master-inward.integration.test.ts` and `apps/web/e2e/batch-d.spec.ts`.

What is ported: the 28-column INSERT / UPDATE with the desktop's audit columns, both validation
messages, `VibhagSrNo` (MAX + 1 per Vibhag on the F2 pick, on Copy and in Save when blank, the
Save one inside the transaction with UPDLOCK), the inline Vibhag F2, every tblSearch F2, the
Work Given count box, `CheckInUse` with its two messages, the work report on Add and Edit, lblEntry,
Locked (Ctrl+L / Ctrl+U), the owner lock, Print Report › Selected Column (with any Config_Master
layouts under it) and all five Send To items.

Engine pieces added here (generic, opt-in):

- **Owner lock**: `ownerLocked(record, user)` in `@gglib/shared`, used as
  `ScreenDefinition.lockedWhen` (the API reads the row with `SELECT *` and refuses the edit lock,
  save and delete with 403 "This record was entered by another user") and `ScreenSpec.lockedWhen`
  (Locked toolbar: Modify, Delete and Copy off). Adding stays open; Ctrl+L / Ctrl+U are not
  affected. Work Given (the only other form where it is live on the desktop) can reuse it as is.
- **Open another screen in Add mode, pre-filled**: `ActionResult` `open` with `ids: []` and
  `newRecord` (a ...Kt box's id under its own name, its text under its name column, other boxes
  by name). The client opens the screen on StrId "0" and calls New with those values over its
  new-record defaults (`ScreenProps.initialNew`). Send To › Letter Bhet Master returns
  `newRecord: { inwordkt, InwordName }` when the inwards have no letter; the F2 on Work Given
  returns `newRecord: { inwordkt }` when the inward has no Work Given rows. The letter-bhet screen
  only needs a `kt` field `inwordkt` with `nameColumn: 'InwordName'`.
- **`FieldSpec.visibleWhen(fields)`**: Return Date is the date picker while Returned = Yes and
  the disabled blank box otherwise. A hidden box is still saved.
- **`FieldSpec.bitOptions`**: a combo over a bit column (In/Out, To Returned, Returned).
- **Grid column aliased to its own name**: tblSearch's `CASE WHEN InOut=1 THEN 'OUT' ELSE 'IN' END
InOut` puts `InOut` in the grid query twice. The desktop's DataTable keeps the first and names
  the second `InOut1`; the driver kept the last, so the grid showed true / false.
  `gridColumnsSql` now names the second `<column>1`, as the DataTable does (a bare column such as
  WorkReportM's `WorkDate` is left alone). This also affects Author Master's `vksamvat` list
  value, which no web grid column shows. The GetDataTable parity test compares like with like.

Deliberate choices and differences:

- **New** keeps the three combos, as `clsCom.clear` does (`onNew.keep`); the date pickers keep
  their dates (engine default). A first New with nothing shown leaves the combos blank, which
  saves as IN / No / No.
- **Copy** gives the copy its Vibhag's next VibhagSrNo when a **Vibhag** is set (the desktop tests
  Via; see Desktop bugs). Copy is off on a locked or owner-locked record, as on the desktop.
- **Delete** asks once (confirm, then the Security password); Ctrl+D asks the password once too.
- **Lock / unlock** are the engine's Ctrl+L / Ctrl+U; the desktop's grid takes plain L / U (with or
  without Ctrl). Same password, same messages.
- **The VibhagSrNo uniqueness check** runs in `save` (it needs the database) after the Vibhag
  check, with the desktop's message.
- **Overflows** (Ref. Name / Ref No over 150, subject / PC Location / Status Remark / Return Rem.
  over 500, Physical Loca. / General Rem. over 250, Paid Amount or VibhagSrNo past Int32) are
  refused with a validation message ("… cannot be longer than n characters", "Paid Amount is too
  large"); the desktop lets SQL Server throw.
- **Paid Amount** has no F2 (its tblSearch SQL is broken); **VibhagSrNo** has none either.
- **PC Location** is a plain text box; F2 shows the "needs the desktop computers" message.
- **Work Given** box: read-only count; F2 (Edit mode) runs `work-given-of`, which opens Work Given
  Master on that inward's rows (or to add one for it). Work Given is commented out of the menu, so
  the window says "not available on the web yet".
- **Send To › BookT** opens the Library No dialog (`BookTranDialog`) with those Tids, as Party and
  Magazine Master do. **Send To › Letter Bhet Master** reads the grid's current row for the
  pre-filled Inword, as the desktop does.
- The combos are DropDownList selects on the web (the desktop's In/Out and To Returned also accept
  typed text, which saves as IN / No anyway).

Desktop bugs: none fixed beyond the overflow messages and the Copy/Via quirk above; the other
harmless quirks are kept or listed. Deferred: the PC Location file dialog (files are deferred),
UcSearch's "User Master" search (engine-wide, not built yet).

The tblSearch data, the Locked flag and the audit columns were checked against the local DB
(3,533 rows, no NULL `enuser`).
