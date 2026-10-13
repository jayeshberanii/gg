# Slice 7 — Issue, Graphics, Employee, Utility/Article (v3.3.3.6 → v3.4.3.1)

Paths are relative to `GGLibrarySolution/` (old) and `GGLibrarySolutionUpdated/` (new, cited as `Updated/…`). Web paths are relative to `gglib-web/`.

**Headline findings**

- Biggest web changes: Gr Vishay Master (Save now asks Main/Sub and writes `TreeMast`; two new grid columns), Employee Master (who-may-edit rule moved from user ids 5/13 to user type AMaster), Letter Bhet / Letter Demand (now log work reports and show the entry label), Work Report (6 new Show In items), Book Confirmation (multi-row delete, BookM now works), Inward (2 new Send To items).
- **No form in this slice calls `frmDisplayTransNew` differently.** I compared every non-comment `frmDisplayTrans*` line in all 22 `.vb` files, old against new: identical.
- **No form in this slice uses the new context-menu permission mechanism.** `ShowHideContextMenu(cntMenu, TransactionName)` (`Updated/Library/CommonClass/MdlLib.vb:1646`, tables `ContextMenu` / `UserContextMenuPermission` / `TransactionM`) is called only from `frmBookMasterNew.vb:3666` and `frmKrutiMasterNew.vb:5842`.
- No changed validation message and no changed F2 lookup SQL in the live screens of this slice. The only changed F2 SQL is in the Appraisal Report (not on the web).
- The three `.rpt` files are encrypted; what changed inside them cannot be determined here.
- `Library/DLL/CommonLibrary.dll` itself changed (544,768 → 556,032 bytes). The decompiled copy in `.legacy-decompiled/` is the OLD one. `Common.BusinessContract.dll` (holds `WorkReportMRepository`) differs in 40 bytes only, with no string or identifier difference, so the Work Report list SQL is unchanged.

---

## A. Issue menu

### Library/Issue/frmBookConfirmation.vb (+ designer)

- **What changed**: Delete now deletes every selected row. `Updated/Library/Issue/frmBookConfirmation.vb:401-420`: after the confirm and `InputBoxProc()`, it loops `dgMain.SelectedRows` calling `BlTran.Delete(TransactionName, PrimaryColumn, id)`, then `FillList()` and `ClearAll(Me)`. The old code deleted only `dgMain.CurrentRow`, showed `MsgBox("Record Deleted ", MsgBoxStyle.Information, "Information")` and removed that grid row. The new code shows **no** message.
- **Kind**: behaviour change
- **Web today**: old way. `apps/web/src/features/master/useMasterScreen.ts` `remove()` sends `[currentId]` (the spec has no `deleteSelected`) and alerts `Record Deleted `. `apps/web/src/screens/BookConfirmation.tsx` has no `deleteFlow`.
- **Web change needed**: delete all selected ids, show no message, reload the list (which re-applies the Sent-only default condition). A `deleteFlow` like `GrVishayMaster.tsx`'s, or `deleteSelected: true` plus message suppression and a reload. Update `docs/screens/book-confirmation.md` › Delete.
- **DB prerequisites**: none.
- **Size**: S

- **What changed**: right-click For Selected Record › BookM now has a handler (`Updated/…/frmBookConfirmation.vb:577-586`). It opens `frmBookMasterNew` as an MDI child with `WhereCondition = " AND BookMastKm IN(SELECT BookT.BookMastkt FROM BookConfirmation INNER JOIN BookT ON BookConfirmation.BookTKt=BookT.tid WHERE BookConfirmationKm IN(" & <selected rows' ids> & "))"`. There is no "no record" check. The menu item already existed in the old designer with no handler.
- **Kind**: new feature
- **Web today**: `BookConfirmation.tsx` shows BookM **disabled** ("has no Click handler on the desktop").
- **Web change needed**: enable it. Add an action in `apps/api/src/master/screens/book-confirmation.ts` that opens `book-master` with `SELECT DISTINCT BookT.BookMastkt … WHERE BookConfirmationKm IN (ids)` (same shape as `graphics-master.ts` `open-bookm`). The desktop opens the form even with no match, so no empty message.
- **DB prerequisites**: none (`BookConfirmation`, `BookT` PRESENT).
- **Size**: S

- Designer: refactor only (declaration reordering; same controls, captions and menu items).

### Library/Issue/frmInwordMaster.vb (+ designer)

- **What changed**: two new Send To items after Letter Bhet Master (`Updated/Library/Issue/frmInwordMaster.designer.vb`, handlers at `frmInwordMaster.vb:835-865`). Both use the selected rows' `inwordkm`.
  - **Hastprat Master**: if `SELECT COUNT(*) FROM HastpratLibNoT WHERE InwordKt IN(<ids>)` > 0, open `frmHastprat` (MDI child) with `WhereCondition = " AND HastpratKm IN(SELECT DISTINCT HastpratKt FROM HastpratLibNoT WHERE InwordKt IN(<ids>))"`. Otherwise `MsgBox("No Record Found")`.
  - **Hastprat LibNoTran**: same count check, then `frmHastpratLibNoTran.ShowDialog()` with `WhereCondition = " AND HastpratLibNoKm IN(SELECT DISTINCT HastpratLibNoKm FROM HastpratLibNoT WHERE InwordKt IN(<ids>))"`. Otherwise `"No Record Found"`.
- **Kind**: new feature
- **Web today**: not ported. `apps/web/src/screens/InwardMaster.tsx:174-195` has WorkGivenM (commented out), BookM, BookT, Party Master and Letter Bhet Master (commented out). Hastprat Master is commented out of the menu (`packages/shared/src/menu.ts:129`) and no Hastprat Lib No dialog exists on the web.
- **Web change needed**: none until Hastprat is ported. Then add `send-to-hastprat` and `send-to-hastprat-libno` to `inward.ts`, following `send-to-book-m` / `send-to-book-t`. Record both in `docs/screens/inward-master.md` as not ported.
- **DB prerequisites**: `HastpratLibNoT.InwordKt` PRESENT (int).
- **Size**: S once the Hastprat screens exist; blocked until then.

- **What changed**: form caption `"Inword Master"` → `"Inward Master"`.
- **Kind**: UI/layout
- **Web today**: the window title comes from the menu label, already `'Inward Master'` (`menu.ts:90`).
- **Web change needed**: none.
- **Size**: —

- Removed a commented-out line in `BookTToolStripMenuItem_Click`: refactor only.

### Library/Issue/frmLetterBhetM.vb (+ Designer)

- **What changed**: Save now logs a work report (`Updated/Library/Issue/frmLetterBhetM.vb:629-660`).
  - Add: `clsCom1.insertworkreports(TransactionName, PrimaryColumn, TranKm, curr_lnid)`, only inside `If dtTmp.Rows.Count > 0` (the new row is listable).
  - Edit: `dtTmpSel = BlTran.GetDataTableById(TransactionName, PrimaryColumn, TranKm)` then `clsCom1.insertworkreports(TransactionName, PrimaryColumn, TranKm, curr_lnid, dtSel, dtTmpSel)`.
  - Delete: unchanged, no logging.
- **Kind**: new feature
- **Web today**: old way. `apps/api/src/master/screens/letter-bhet.ts` has no `workReport` flag. `docs/screens/letter-bhet.md:82-84, 367-369` says the form never logs a work report.
- **Web change needed**: set `workReport: true, workReportOn: { add: true, edit: true, delete: false }` on `letterBhet` and verify the engine's before/after comparison with the BookTran popup column. Update the screen note and its tests.
- **DB prerequisites**: `WorkReportM` PRESENT; `tblSearch` rows for `LetterBhetM` PRESENT (15). Local `WorkReportM` has no `LetterBhetM` rows yet, as expected.
- **Size**: S–M

- **What changed**: the entry label is back. `Updated/…/frmLetterBhetM.vb:759`: `lblEntry.Text = clsCom.GetEntryUser(TransactionName, PrimaryColumn, TranKm)` (was commented out). `lblEntry` is the inherited toolbar label of `frmMasterPage`.
- **Kind**: new feature
- **Web today**: no entry label (`LetterBhet.tsx` has no `entryLabel`).
- **Web change needed**: `entryLabel: true` in `LetterBhet.tsx`. The engine's `MasterService.entryUser` already does the rest.
- **DB prerequisites**: `LetterBhetM.enuser/endate/moduser/moddate` PRESENT.
- **Size**: S

- **What changed**: captions `"Inword"` → `"Inward"`: panel label `Label19`, grid header `colInword`, right-click item `"Inword Master"` → `"Inward Master"` (`Updated/Library/Issue/frmLetterBhetM.Designer.vb`).
- **Kind**: UI/layout
- **Web today**: old spellings at `LetterBhet.tsx:61` (`'Inword'`), `:94` (header `'Inword'`), `:107` (`'Inword Master'`).
- **Web change needed**: change the three strings.
- **Size**: S

- Rest of the Designer diff (column declarations without the namespace): refactor only.

### Library/Issue/frmLetterDemandM.vb

- **What changed**: same work-report logging as Letter Bhet (`Updated/Library/Issue/frmLetterDemandM.vb:668-699`): Add → `insertworkreports(TransactionName, PrimaryColumn, TranKm, curr_lnid)`; Edit → with `dtSel, dtTmpSel`.
- **Kind**: new feature
- **Web today**: `letter-demand.ts` has no `workReport`; `docs/screens/letter-demand.md:107-108` says "There is no `insertworkreports` (`workReport: false`) and no entry label."
- **Web change needed**: as Letter Bhet.
- **DB prerequisites**: `tblSearch` `LetterDemandM` PRESENT (23 rows).
- **Size**: S–M (shared with Bhet)

- **What changed**: `lblEntry.Text = clsCom.GetEntryUser(…)` un-commented (`:806`).
- **Kind**: new feature
- **Web today / change**: add `entryLabel: true` in `LetterDemand.tsx`.
- **DB prerequisites**: `LetterDemandM` audit columns PRESENT.
- **Size**: S

- **What changed**: `clsCom.EnableDisableDataEditing(ToolStrip1, 2, TransactionName, TranKm, dgMain)` moved out of both branches and now runs after every successful save (`:699`), including an Add whose new row is not listable.
- **Kind**: bug fix (toolbar state)
- **Web today**: the engine sets the toolbar after every save.
- **Web change needed**: none.
- **Size**: —

### Library/Issue/frmWorkGivenMaster.Designer.vb

- Right-click item caption `"Inword Master"` → `"Inward Master"`. UI/layout. Work Given is not on the web (its Send To is commented out in `InwardMaster.tsx:176`). Web change: none now; use the new caption when it is ported.

### Library/CrystalReports/IssueSlipReport.rpt, LetterBhetReport.rpt, LetterDemandReport.rpt

- **What changed**: all three were re-saved (OLE summary: IssueSlip revision 22 → 23, saved 2024-12-13; LetterBhet 31 → 33, saved 2025-07-19; LetterDemand 34 → 35, saved 2025-07-19).
- **What I can tell** (OLE streams compared with `olefile`; `strings` is not installed here, so I extracted ASCII and UTF-16LE strings with a script):
  - The embedded images are byte-identical in all three (`Embedding 3/CONTENTS` and `Embedding 4/CONTENTS`, 49,494 bytes each), so the logo did not change.
  - `PromptManager` is identical in all three, so the parameter prompts are probably unchanged. The callers are unchanged too: `frmIssueTran.vb` is byte-identical, and the print code in `frmLetterBhetM.vb` / `frmLetterDemandM.vb` is not in the diff. `IssueSlipReport.vb`, `LetterBhetReport.vb`, `LetterDemandReport.vb` are identical.
  - The layout stream `Contents` did change size: IssueSlip 7,626 → 7,618 bytes, LetterBhet 6,301 → 6,066, LetterDemand 6,732 → 6,598. `QESession` (query) changed by 7–9 bytes in each.
  - The new LetterBhet file also carries saved-data streams the old one lacked (`DataSourceManager`, `SavedRecordsStream`, `MemoValuesStream`, …): it was saved with data.
- **What I cannot tell**: which fields, labels or text objects changed. `Contents`, `QESession` and `PromptManager` are encrypted (entropy 7.9+ bits/byte, no inflate at any offset). No field name or label is readable in old or new; the only string differences are stream names and noise.
- **Kind**: unknown (layout and/or query edit)
- **Web today**: provisional HTML views (`apps/web/src/features/print/`, `docs/screens/letter-bhet.md:188-237`), already inferred without the `.rpt`.
- **Web change needed**: cannot be derived from the files. Needs a PDF/print sample from v3.4.3.1 or someone with Crystal Reports 13.
- **DB prerequisites**: none known. I did not compare `Rpt_LetterDemand` or the issue-slip source against production.
- **Size**: unknown (S each if only text moved)

---

## B. Graphics menu

### Library/Graphics/frmGrVishayMaster.vb (+ designer, resx), GrVishayRepository.vb, EntGrVishay.vb

- **What changed**: Save asks a different question and can file the new subject in the member tree (`Updated/Library/Graphics/frmGrVishayMaster.vb:441-466`).
  - `"Are You Sure to Save This Record?"` (Yes/No) is **replaced** by `MsgBox("Press(Yes) to Add as Main" & vbCrLf & "Press(No) to Add as Sub", MsgBoxStyle.YesNoCancel)`.
  - Yes → `New_Type = "main"`.
  - No → `New_Type = "sub"` and a pick list (`DisplayListForm`, `boolSelectFirst:=True`) with this SQL:
    `SELECT 1 As Seq,GrVishay.vishaynm AS Vishay,'' AS MasterVishay,TreeMastkm AS MainMasterId,TreeMastkm AS MasterId FROM TreeMast INNER JOIN GrVishay ON TreeMast.recordkt=GrVishay.Grvishaykm WHERE Tablekt=9136 AND ISNULL(masterid,0)=0 UNION SELECT 2 AS Seq,GrVishay.vishaynm AS Vishay,GrVishayMast.vishaynm AS MasterVishay,TrMast.TreeMastkm AS MainMasterId,TreeMast.TreeMastkm AS MasterId FROM TreeMast INNER JOIN GrVishay ON TreeMast.recordkt=GrVishay.Grvishaykm LEFT JOIN TreeMast TrMast ON TreeMast.masterid=TrMast.TreeMastkm INNER JOIN GrVishay GrVishayMast ON TrMast.recordkt=GrVishayMast.Grvishaykm WHERE TreeMast.Tablekt=9136 AND ISNULL(TreeMast.masterid,0)>0 ORDER BY Seq,Vishay`
    The first picked row gives `New_MainMasterIdForSub = MainMasterId` and `New_MasterIdForSub = MasterId`. Nothing picked → `New_Type = ""`.
  - Cancel, or No with nothing picked → **nothing is saved**, no message.
  - The prompt is not limited to Add: it also appears on Edit. On Edit the answer only decides whether the save goes ahead.
  - `GrVishayRepository.Save` (`Updated/Library.BusinessContract/Concrete/GrVishayRepository.vb:66-90`), for a new record with type main or sub, after the `INSERT INTO GrVishay`:
    - `Tablekt = SELECT isnull(ColumnMastkm,0) from columnmaster where Vibhag = 'TableNm' and Name='GrVishayMembr'`
    - sub: `seq = select isnull(max(seq),0)+1 from TreeMast where Tablekt=<Tablekt> and masterid=<New_MasterIdForSub>`
    - main: `seq = select isnull(max(seq),0)+1 from TreeMast where Tablekt=<Tablekt> and ISNULL(masterid,0)=0`, with both master ids set to 0
    - `INSERT INTO TreeMast(Tablekt,recordkt,MainMasterId,masterid,seq) VALUES (@Tablekt,@recordkt,@MainMasterId,@masterid,@seq)` with `recordkt` = the new `Grvishaykm`.
  - This runs on the same connection with no transaction, as before.
  - `EntGrVishay` gains `New_Type As String`, `New_MainMasterIdForSub As Integer`, `New_MasterIdForSub As Integer`. They are not table columns.
- **Kind**: new feature + behaviour change
- **Web today**: old way. The engine asks `Are You Sure to Save This Record?` (`useMasterScreen.ts:540`); `apps/api/src/master/screens/gr-vishay.ts` `save()` inserts `GrVishay` only. `memberMaster()` there already reads `TreeMast` for Show Member/Master.
- **Web change needed**:
  1. `GrVishayMaster.tsx`: replace the save question with a Yes/No/Cancel dialog carrying the two-line text. On No, open a pick list from a new `lists` entry with the SQL above (columns Vishay, MasterVishay; hidden Seq/MainMasterId/MasterId; first row preselected). Abort silently on Cancel or no pick. Check whether the engine's confirm supports three buttons.
  2. `gr-vishay.ts` `save`: accept `newType` / `mainMasterId` / `masterId`; on insert add the `TreeMast` row in the same transaction, with the seq rules above. Resolve `Tablekt` through `tableKtOf(db, 'GrVishayMembr')`, not the literal 9136.
- **DB prerequisites**: `TreeMast` PRESENT (`TreeMastkm, Tablekt, recordkt, MainMasterId, masterid, Brief, Libno, Refplacekt, Pgno, seq, TrLevel, TrSeq`). `columnmaster` row `TableNm`/`GrVishayMembr` PRESENT with `ColumnMastkm = 9136`, matching the form's hard-coded 9136. `TreeMast` holds 8,172 rows for Tablekt 9136, 126 of them main.
- **Size**: M

- **What changed**: two new grid columns. `GvMain` gains `Type` (after Id) and `GradeCount` (after Count). `FillList` binds `dtMain.Columns("Type")` and `dtMain.Columns("GradeCount")` (`Updated/…/frmGrVishayMaster.vb:610, 615`). Designer: `colType` header `"Type"`, `colGradeCount` header `"GradeCount"`, both read-only at default width; `colMember` and `colMaster` now have `Width = 150`. Column order: Id, Type, Name, Defination, Remark, Count, GradeCount, Member, Master, Cancel. `RefreshCurrentGridRecord` is unchanged, so these two cells do not refresh after an edit.
- **Kind**: new feature (data-driven)
- **Web today**: `GrVishayMaster.tsx` has the eight old columns; Member and Master have no width.
- **Web change needed**: add the two columns and the two widths, **after** the `tblSearch` rows exist. The columns come from `tblSearch` through `ListGridData`.
- **DB prerequisites**: `tblSearch` rows `TransactionName='GrVishay'`, `ColumnName` `Type` and `GradeCount`: **MISSING**. The local rows are endate, moddate, enuser, Grvishaykm, moduser, defination, groupnm, remark, vishaynm, count, Master, Member, IsCancel. `GrVishay` has no `Type` or `GradeCount` column either, so they must be `JoinCondition` expressions. Their SQL is **not in the source**, so I could not determine it. Against the local DB the updated desktop form itself would fail in `FillList`.
- **Size**: S once the rows exist; blocked on the production `tblSearch` rows.

- **What changed**: panel layout and captions (`Updated/Library/Graphics/frmGrVishayMaster.designer.vb`).
  - `Label4` `"Group Name"` → `"Type/Group Name"`, moved from (525,22) to (493,22).
  - `Label11` `"Defination"` → `"Definition"`. The grid header `colDefination` stays `"Defination"`.
  - A new unbound `TextBox1` at (644,18), 141×29, Times New Roman 14.25. No code references it and its name matches no column, so it stays empty and is never saved. It looks like an unfinished "Type" box.
  - `txtgroupnm` (629,18) 360 wide → (786,18) 213 wide. `txtremark` (629,58) 360 → (644,58) 355. `Label24` (Remark) x 525 → 493. `txtvishaynm` and `txtdefination` 374 → 369 wide.
  - `SplitterDistance` 132 → 124.
- **Kind**: UI/layout
- **Web today**: old positions and captions in `GrVishayMaster.tsx` (`panelHeight: 132`, labels `'Defination'`, `'Group Name'`).
- **Web change needed**: update positions, widths, captions, `panelHeight: 124`; draw the empty extra box, since the web must look like the desktop.
- **Size**: S

- **What changed**: right-click Send To Excel now calls `New CommonLibrary.SendToExcelWithFormatting(dgMain)` instead of `SendtoExcel` (`:712`).
- **Kind**: behaviour change (export formatting)
- **Web today**: the engine's plain `sendToExcel`.
- **Web change needed**: cannot be specified exactly. `SendToExcelWithFormatting` exists only in the new `CommonLibrary.dll`, which is not decompiled. The DLL's new strings and identifiers suggest: font `Noto Serif Devanagari`, a `GGLogo` right-header image, footer `Page &P of &N`, repeated title rows/columns, margins, orientation, gridlines, wrap text, auto-fit rows. The new DLL needs decompiling to port this faithfully.
- **Size**: M (after decompiling)

- Removed commented-out F2 code, `EntGrVishay` property reordering: refactor only.

### Library/Graphics/frmGraphicMaster.vb (+ Designer), GraphicBKMRepository.vb

- **What changed**: two new Utility items after Request For Book(LabIssue) (`Updated/Library/Graphics/frmGraphicMaster.Designer.vb:838`, code `frmGraphicMaster.vb:1112-1156`).
  - `"LibraryNo Exist In Record But Not Exist In Folder"` → `CheckLibNoExistInFolder(False)`
  - `"LibraryNo Not Exist In Record But Exist In Folder"` → `CheckLibNoExistInFolder(True)`
  - The routine lists the top-level folders of `GetConfigValueFromConfigName("GraphicsPath")` (`SELECT ConfigValue FROM GeneralConfig WHERE ConfigName=@ConfigName`, `MdlLib.vb:1712`). It takes each folder name up to the first `_` as a LibNo and loads them with `clsCom.SetTranIds(False)` then `SetTranIds(True, <comma list>)` (stored proc `SetTranIds`, table `TranIds`).
  - Not-in-record: `SELECT Tid,BookT.Libno AS [LIbNo] FROM TranIds INNER JOIN BookT ON TranIds.TranId1=BookT.Libno WHERE tid NOT IN(SELECT BookTKt FROM GraphicBKM) ORDER BY LibNo`
  - Not-in-folder: `SELECT Tid,BookT.Libno AS [LIbNo] FROM GraphicBKM INNER JOIN BookT ON GraphicBKM.BookTKt=BookT.tid WHERE tid NOT IN(SELECT BT.tid FROM TranIds INNER JOIN BookT BT ON TranIds.TranId1=BT.Libno) ORDER BY LibNo`
  - Then `SetTranIds(False)`, and the result goes straight to Excel (`SendtoExcel(dgForExcel)`).
- **Kind**: new feature (reads a disk folder)
- **Web today**: not ported. `GraphicsMaster.tsx:258-266` has Utility › Request For Book(LabIssue) only.
- **Web change needed**: a decision. The check needs the graphics share to be readable. Either leave it desktop-only (as Graphics Detail's disk items are) or have the API read the folder if the server can reach the path, without using the shared `TranIds` scratch table. Record it in `docs/screens/graphics-master.md`.
- **DB prerequisites**: `GeneralConfig` table: **MISSING** (see the table at the end). Proc `SetTranIds` PRESENT, table `TranIds` PRESENT.
- **Size**: M if ported, S to document as desktop-only.

- `frmGraphicMaster.vb:688` (a commented-out `OperatorKt` line removed) and `GraphicBKMRepository.vb` (commented-out old SQL removed): refactor only. The INSERT and UPDATE are unchanged.

### Library/Graphics/frmGraphicsDetail.vb (+ designer)

- **What changed**: four items removed from the Print Record submenu, with their handlers (`Updated/Library/Graphics/frmGraphicsDetail.designer.vb`; old `frmGraphicsDetail.vb:1539-1598`):
  - `"Full Card"` (empty handler)
  - `"Master Column"` (no handler)
  - `"Ref Place having not filepath for given book"` (Excel of `select refplace from GraphicBKT where filepath = '' and Graphickt = <LibNo tag>`)
  - `"Showing Mismatch Of No Of Images "` (used `xp_cmdshell`)
  - The submenu is now Selected Column, Send To Excel, Duplicate RecordNo.
- **Kind**: removed
- **Web today**: already the new way in the menu. `GraphicsDetail.tsx:357-378` has all four commented out. The API still has the action `refplace-no-filepath` (`graphics-detail.ts:776`), now unreachable.
- **Web change needed**: optional cleanup: delete the commented entries and the `refplace-no-filepath` action and its test; update `docs/screens/graphics-detail.md:263-267, 360`.
- **DB prerequisites**: none.
- **Size**: S

### Library/Graphics/frmGrWordMaster.vb (+ Designer)

- **What changed**: `Label11` `"Defination"` → `"Definition"`. The grid header is unchanged.
- **Kind**: UI/layout
- **Web today**: `GrWordMaster.tsx:40` label `'Defination'`.
- **Web change needed**: change the label only (keep header `'Defination'` at `:58`).
- **Size**: S
- Removed commented-out F2 code: refactor only.

### Library/Graphics/FormGraphicsWordMaster.vb

- **What changed**: the four list and record SELECTs now qualify `remark` (`isnull(GrWordM.remark,'')`, `isnull(GrVishay.remark,'')`). They join `Usecurity` twice, and `Usecurity` has a `Remark` column (PRESENT locally), so the unqualified name was ambiguous. Everything else is deleted comments.
- **Kind**: bug fix
- **Web today**: n-a. Both menu entries for this form are commented out (`menu.ts:138, 140`).
- **Web change needed**: none.
- **Size**: —

---

## C. Employee menu

### Library/Employee/frmWorkReportM.vb (+ designer)

- **What changed**: six new Show in items after Patrika (`Updated/Library/Employee/frmWorkReportM.designer.vb`; handlers `frmWorkReportM.vb:722-860`). Each collects the `RecordNo` of the selected rows whose `TableName`, lower-cased, equals the value below. None → `MsgBox("No Records Found")`. Otherwise it opens the form as an MDI child with `StrId` = those ids.

  | Caption                     | TableName (lower-cased) | Form                  | Web screen                       |
  | --------------------------- | ----------------------- | --------------------- | -------------------------------- |
  | English Book Vishesh        | `englishbookvishesh`    | frmEnglishBookVishesh | `english-book-vishesh` (live)    |
  | Magazine Vishesh Master New | `magazinevishesh`       | frmMagazineVisheshNew | `magazine-vishesh-master` (live) |
  | Hastprat Master             | `hastpratm`             | frmHastprat           | not ported                       |
  | Tirth Raksha Master         | `tirthraksham`          | frmTirthRakshaMaster  | `tirth-raksha-master` (live)     |
  | Shastra Path Master         | `shastrapathm`          | frmShastraPathMaster  | new form, not on the web         |
  | Anya Bhandar                | `anyabhandarm`          | frmAnyaBhandar        | `anya-bhandar` (live)            |

  Full order now: Author, Prakshak, Kruti Master, Prkshan, BookM, BookT, Graphics Master, Graphics Detail, Lekh Master, Vishesh Master, Column Master, Bhash Master, Lipi Master, Authortype Master, Vishay Master, Report, Log Report, Magazine Master, Patrika, then the six above.

- **Kind**: new feature
- **Web today**: `apps/web/src/screens/WorkReport.tsx:81-140` ends at Patrika.
- **Web change needed**: add four `showIn` entries with `sayNone: true` for the live screens (tables `englishbookvishesh`, `magazinevishesh`, `tirthraksham`, `anyabhandarm`). Leave Hastprat Master and Shastra Path Master commented out until those screens exist. Update `docs/screens/work-report.md`.
- **DB prerequisites**: none new. Local `WorkReportM` already has rows for `AnyaBhandarM` (22,812), `EnglishBookVishesh` (7,020), `MagazineVishesh` (2,880), `TirthRakshaM` (801), `HastpratM` (4). Table `ShastraPathM` is MISSING (per the brief), which only matters for the unported item.
- **Size**: S

- **What changed**: new public `WhereCondition`, appended to the list condition: `BlCommon.ListGridData(boolDisplayCount, StrId, IIf(boolLast30 = True And StrId = "", 1, 0), DefaultWhereCond & WhereCondition)` (`:125`). The only caller that sets it is the new `frmEmployeeEvaluation.vb:871`, with `" AND DoneByGId IN(<users>) AND WorkDate>='<MM/dd/yyy>' AND WorkDate<='<MM/dd/yyy>'"`. `StrId` now starts as `""` instead of `Nothing`.
- **Kind**: new feature (an entry point from a form not on the web)
- **Web today**: n-a; `work-report.ts` has no such filter.
- **Web change needed**: none until Employee Evaluation is ported.
- **Size**: —

- **Reporting scope: unchanged.** `frmWorkReportM_Load` (`:55-61`) is identical in both versions: when not `IsAdminLogin` and `curr_utypeid <> AMaster`, `DefaultCond &= " and DonebyGid IN(" & curr_lnid & "," & GetReportingByTid(curr_lnid) & ")"`, then always `" AND DonebyGid IN(SELECT tid FROM Usecurity where IsActive=1)"`. `CommonRepository.GetReportingByTid` is identical, and the repository DLL is unchanged (see headline).

- **What changed**: Show in › Patrika no longer overwrites the form's own `StrId`. The old code appended the Patrika ids to the form-level `StrId`, so later refreshes of the Work Report were filtered by those ids as if they were `WorkReportKm`s, and repeated use kept accumulating. The new code uses a local `tids` (`:687-705`). Graphics Master got a local `StrId` for the same reason.
- **Kind**: bug fix
- **Web today**: already the new way; `showIn` in `WorkReport.tsx` holds no form state.
- **Web change needed**: none.
- **Size**: —

- One commented-out line removed at `:379`: refactor only.

### Library/Employee/frmEmployeeNew.vb

- **What changed**: the privileged-user rule moved from hard-coded ids to the user type. Every `IsAdminLogin Or curr_lnid = 5 Or curr_lnid = 13` became `IsAdminLogin Or curr_utypeid = EnumUserType.AMaster` (and the negated form likewise). Sites in `Updated/Library/Employee/frmEmployeeNew.vb`:
  - `:108` list restricted to own row (`DefaultCond &= " AND tid=" & curr_lnid`)
  - `:152`, `:221`, `:659`, `:826` New / Delete / Copy disabled
  - `:715` Search By combo filled
  - `:786` own-or-privileged may edit and sees Show Password
  - `:832` Working Hrs and Active enabled
  - Unchanged: the user-100 password rule (`:795`) and the User Type / Reporting To rule (`:158`, already admin-or-AMaster).
- **Kind**: behaviour change (who may edit)
- **Web today**: old way. `packages/shared/src/employee.ts:11-22`: `EMPLOYEE_PRIVILEGED_IDS = [5, 13]`, `isEmployeePrivileged = isAdmin || id in [5, 13]`. Used by `apps/api/src/master/screens/employee.ts` (`ownRow`, `searchableBy`, `recordWritableBy`, `assertPrivileged`) and by `EmployeeMaster.tsx` (`addDeleteBy`, `editableFor`, the Utility menu) and `canSeeEmployeePassword`.
- **Web change needed**: `isEmployeePrivileged = user.isAdmin || user.userType === UserType.AMaster`; drop `EMPLOYEE_PRIVILEGED_IDS`. It becomes the same test as `canEditEmployeeUserType`. Update `employee.test.ts`, the comments in `employee.ts` / `EmployeeMaster.tsx`, and `docs/screens/employee-master.md` (lines 184, 240, 317, 342, 361, 434).
- **Effect on local data**: users 5 (vishal) and 13 (hardik, inactive) are both AMaster and stay privileged. Newly privileged AMaster non-admins: 29 alpesh, 41 rajubhai, 42 mrugendra, 103 neha (active), plus 31 nikul and 59 kaivan (inactive).
- **DB prerequisites**: none.
- **Size**: S

- **What changed**: the Utility menu's visibility test is now **inverted** (`:889-896`):
  ```vb
  'If IsAdminLogin Or curr_lnid = 5 Or curr_lnid = 13 Then
  If Not IsAdminLogin And curr_utypeid <> EnumUserType.AMaster Then
      UtilityToolStripMenuItem.Visible = True
  Else
      UtilityToolStripMenuItem.Visible = False
  End If
  ```
  As written, Utility (Show All / Active / Inactive Employees) is now shown to ordinary users and hidden from admins and AMasters. It reads like a copy-paste slip from the other sites. For an ordinary user the items would in any case list only their own row, since `DefaultCond` still has `AND tid=<me>`.
- **Kind**: behaviour change (probably a desktop bug)
- **Web today**: Utility is shown to the privileged only (`EmployeeMaster.tsx:199`) and the API refuses the actions for others (`employee.ts:247-264`).
- **Web change needed**: none until the user decides (open question 1). My recommendation is to keep it privileged-only under the new AMaster rule.
- **Size**: S

### Library/Employee/frmLogReport.vb

- **What changed**: Send To Excel is hidden from user types Operator, Guest, Master and 0, now except users **182, 38 and 68** (was 182 only): `If curr_lnid <> 182 And curr_lnid <> 38 And curr_lnid <> 68 Then SendToExcelToolStripMenuItem.Visible = False` (`Updated/Library/Employee/frmLogReport.vb:39`).
- **Kind**: behaviour change (hard-coded ids)
- **Web today**: `apps/web/src/screens/OldLogReports.tsx:289`: `canExcel = [1, 5].includes(user.userType) || user.id === 182`.
- **Web change needed**: add ids 38 and 68. Check whether the API export path gates on the same rule and change it there too.
- **DB prerequisites**: none. Locally 38 = jagdish (type 0), 68 = vaghu (type 3).
- **Size**: S

- **What changed**: Send To Log Report is visible to `curr_utypeid = 1 Or curr_utypeid = 5 Or curr_lnid = 68` (was types 1 and 5 only) (`:441`).
- **Kind**: behaviour change
- **Web today**: `old-log-reports.ts:73-76` `canSendToLogReport` = user type Admin or AMaster. The menu item itself is commented out in `OldLogReports.tsx:290, 302-308`.
- **Web change needed**: add `|| user.id === 68` to `canSendToLogReport` (and to the commented `canLogReport`).
- **Size**: S

- **What changed**: new public `StrWorkWhereCondition`. When set, the report's WHERE uses `AND work.workID in(<that sub-select>)` instead of the `StrId` / date-range condition (`:261-270`). The only setter is the new `frmEmployeeEvaluation.vb:906`. New public `strFromDate` / `strToDate` are declared and never used. The reporting scope right after it (`:273-276`, own id + `GetReportingByTid` unless admin/AMaster) is unchanged.
- **Kind**: new feature (an entry point from a form not on the web)
- **Web today / change**: n-a; none until Employee Evaluation is ported.
- **Size**: —

- Removed commented-out SQL: refactor only. The report SQL is otherwise unchanged.

### Library/Employee/frmEmpAppraisalReport.vb (+ designer, resx) — commented out of the web menu

The report was rebuilt around a new version of `Rpt_EmployeePerformance`. Parameters are now `@FromDate`, `@ToDate` (typed `Date`), optional `@StrEmpKt`, `@StrVibhagKt`, `@StrWorkTypeKt` (`VarChar(1000)` comma lists; the three F2 boxes are multi-select and show the comma-joined names) and `@IsDatewiseReport` (bit), with `CommandTimeout = 0`. A new check box `"Print Datewise"` toggles a new `Date` column. New visible columns: `Output Percentage`, `Total Mistakes` (`TotalErrors_Qty`), `Avg Mistakes` (`AvgErrorPerCard_Qty`), `TotalErrors_Review`, `Avg Error Reviewed`; hidden ones: `PerHourWorkQty` and the ErrorFreeCard / ErrorCard / ActualErrorPerCard pairs. Rows with `PerHourWorkQty > 0` are coloured by Output Percentage: under 80 red, 80–100 dark orange, over 100 to 120 green, over 120 blue. The Vibhag and WorkType F2 lists changed to `SELECT DISTINCT ColumnMastkm,Name from ApprisalStandard AST INNER JOIN columnmaster ON AST.VibhagKt=columnmaster.ColumnMastkm WHERE AST.IsDisplayInAppraisalReport=1 AND vibhag='vibhag' ORDER BY Name` (and the same on `WorkTypeKt` / `'WorkType'`). The old optional-parameter test (`IsNot Nothing OrElse … <> 0`) was always true; it is now `AndAlso … <> "0"`. DB prerequisites: `Rpt_EmployeePerformance` is PRESENT but in its **old** shape (`@FromDate, @ToDate, @EmpKt, @VibhagKt, @WorkTypeKt`), so the new parameters and result columns are MISSING. `ApprisalStandard.IsDisplayInAppraisalReport` is MISSING; that column also touches the live Apprisal Standard screen, which belongs to another slice. Size if ever ported: M–L.

### Library/Employee/frmTask.vb (+ designer) — commented out of the web menu

The default list rule changed (`Updated/Library/Employee/frmTask.vb:193-206`). The see-everything exception moved from user 59 (kaivan) to user **100** (vinit). Everyone else gets `" and TaskStatusKt NOT IN(<Closed>,<Cancelled>)" & " and (enuser IN(<me + my reports>) OR AssignedToKt=<me>)"`, which is the same filter as before. In Show All Tasks (`:416-423`) user 100 no longer has the condition replaced, so for user 100 that item re-lists the default open-only view rather than all tasks. The designer diff has no real change. DB prerequisites: none new (`columnmaster` `TaskStatus` rows, `EmpReportingT` PRESENT). Size if ported: part of porting the screen.

---

## D. Not on the web

**Library/Utility/frmExportTable.vb (+ designer).** `cmbDatabase_SelectedIndexChanged` now always sets the destination server to `192.168.0.50` (was `.212` for `dblibsql`, `.210` otherwise), and the designer default text changed the same way. The rest is deleted commented-out path lists. An admin deployment tool with hard-coded LAN addresses; nothing to port. DB prerequisites: none.

**Library/Utility/FrmImportData.vb.** The six author-type lookups now match on `authtype.authortype` instead of `authtype.authtyattr`: `select authtycokm from authtype where authortype like N'<text>%'`. A bug fix in the Excel import's author-type resolution. One commented-out INSERT was removed. DB prerequisites: `authtype.authortype` PRESENT (`authtyattr` is too). Carry the corrected column over if the import is ever ported.

**Library/Utility/frmglobal.vb.** `txtsearch_TextChanged` gained null and empty guards (`dvforsearch IsNot Nothing AndAlso … Table.Columns.Count > 0`): a crash fix when typing before any search has run. One commented-out line removed. DB prerequisites: none.

**Library/Utility/frmComplain.vb.** One commented-out SQL line removed; refactor only. The companion form `frmComplainMaster.*` exists only in the old tree (removed). DB prerequisites: none (`ComplainMaster` PRESENT).

**Library/Utility/UpdateDocFile.vb.** Delete now takes the id from the grid's current row (`delete from Rfileword where Docid=<dgword.CurrentRow.Cells("Docid").Value>`) instead of `dt.Rows(dgword.CurrentRow.Index)(0)`, and no longer removes the row from `dt` by index. This fixes deleting the wrong word when the grid is sorted or filtered. DB prerequisites: `Rfileword` (`Docid, word, newword, remarks`) PRESENT.

**Library/Article/FormReadArticles.vb.** The ~230 changed lines are deleted blank lines and comments only: refactor only, no behaviour change. DB prerequisites: none.

**Library/Article/frmLekhEntry.vb (+ designer).** `txtImportantData` changed from a multi-line `TextBox` to a `RichTextBox` (the old `TabStop = False` is gone). One commented-out line removed in the `.vb`. If Lekh entry is ported, Important Data is a rich-text box on the desktop; whether RTF markup or plain text is stored I did not determine (the save code is unchanged, so it stores whatever `.Text` returns, i.e. plain text). DB prerequisites: `filelekhM.ImportantData` PRESENT.

**Library/Article/frmLekhMasterNew.vb.** Deleted commented-out lines only (16): refactor only. DB prerequisites: none.

---

## Seen in these folders but not in my assigned list

Not analysed beyond their calls into my forms:

- New in `Library/Employee/`: `frmEmployeeEvaluation.*`, `frmEmployeePerformanceEvaluation.*` (the callers of `frmWorkReportM.WhereCondition` and `frmLogReport.StrWorkWhereCondition`).
- New in `Library/Article/`: `frmLekhInwardEntry.*`, `frmLekhNewspaperBagInward.*`, `frmLekhNewspaperPages.*`.
- Removed from the tree: `Employee/frmLogReports.*`, `frmMessageEntry.*`, `frmMessages.*`, `UserControl.*`; `Utility/frmComplainMaster.*`.

---

## (1) DB objects this slice needs

| Object                                                                                                                 | Needed by                                                     | Local DB                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `tblSearch` rows `GrVishay` / `Type` and `GrVishay` / `GradeCount`                                                     | Gr Vishay grid                                                | **MISSING** — definitions not in source       |
| `GeneralConfig` table, row `ConfigName='GraphicsPath'`                                                                 | Graphics Master folder checks                                 | **MISSING**                                   |
| `Rpt_EmployeePerformance` with `@StrEmpKt, @StrVibhagKt, @StrWorkTypeKt, @IsDatewiseReport` and the new result columns | Appraisal Report (not on web)                                 | **MISSING** (old 5-parameter version present) |
| `ApprisalStandard.IsDisplayInAppraisalReport`                                                                          | Appraisal Report F2 lists                                     | **MISSING**                                   |
| `ShastraPathM` table                                                                                                   | Work Report › Show in › Shastra Path Master (unported target) | **MISSING** (per brief)                       |
| `TreeMast` (`Tablekt, recordkt, MainMasterId, masterid, seq`, …)                                                       | Gr Vishay save                                                | PRESENT                                       |
| `columnmaster` `Vibhag='TableNm'`, `Name='GrVishayMembr'` (= 9136)                                                     | Gr Vishay save and pick list                                  | PRESENT                                       |
| `HastpratLibNoT.InwordKt`                                                                                              | Inward › Send To › Hastprat…                                  | PRESENT                                       |
| `LetterBhetM` / `LetterDemandM` `enuser, endate, moduser, moddate`                                                     | entry label                                                   | PRESENT                                       |
| `tblSearch` rows for `LetterBhetM` (15), `LetterDemandM` (23); `WorkReportM`                                           | letters' work report                                          | PRESENT                                       |
| `BookConfirmation`, `BookT`                                                                                            | Book Confirmation BookM                                       | PRESENT                                       |
| Proc `SetTranIds`, table `TranIds`                                                                                     | Graphics Master folder checks                                 | PRESENT                                       |
| `Usecurity.Remark`                                                                                                     | cause of the FormGraphicsWordMaster fix                       | PRESENT                                       |
| `authtype.authortype`                                                                                                  | FrmImportData                                                 | PRESENT                                       |
| `Rfileword.Docid`, `filelekhM.ImportantData`, `ComplainMaster`, `EmpReportingT`                                        | section D / Tasks                                             | PRESENT                                       |

**Missing objects, as far as the code reveals them**

- `GeneralConfig`: `ConfigName` (string, matched with `=`), `ConfigValue` (string, read with `CType(…, String)`). The key, lengths and any other columns are not revealed in my slice. Known `ConfigName` values, from `EnumGeneralConfig` (`Updated/Library/CommonClass/MdlLib.vb:61-72`): `AttachmentPath, ScanPath, EBookPath, TitlePath, GraphicsPath, GGUrl, TempGRPath, LibraryExePath, ReferenceTPath, MainRoot`.
- `tblSearch` `GrVishay`/`Type` and `GrVishay`/`GradeCount`: only the names `Type` and `GradeCount` are known (they must come back as result columns of `ListGridData`). `JoinCondition`, `Type` (M/T), `seq` and `DisplayName` are unknown.
- `ApprisalStandard.IsDisplayInAppraisalReport`: compared with `=1`, so bit or int.
- `Rpt_EmployeePerformance` result columns the form binds: `EmployeeName, LogDate, Vibhag, WorkType, TimeTaken, PerHourWorkQty, WorkQty, TargetedWorkQty, Variation, OutputPercentage, ErrorFreeCard_Qty, ErrorCard_Qty, TotalErrors_Qty, ActualErrorPerCard_Qty, AvgErrorPerCard_Qty, ErrorFreeCard_Review, ErrorCard_Review, TotalErrors_Review, ActualErrorPerCard_Review, AvgErrorPerCard_Review`. The proc body is not in source.

## (2) Open questions for the user

1. **Employee Master › Utility menu.** The updated desktop shows Utility (Show All / Active / Inactive Employees) to ordinary users and hides it from admins and AMasters (`frmEmployeeNew.vb:892`), the opposite of every other check on the form. Should the web copy that literally, or keep Utility for admin/AMaster only (my recommendation)?
2. **Gr Vishay `Type` and `GradeCount`.** Can you supply the production `tblSearch` rows for `GrVishay` (or a fresh DB restore)? The columns cannot be added without their SQL.
3. **Gr Vishay Save prompt.** The Main/Sub question also appears when editing an existing subject, where the answer changes nothing except that Cancel aborts. Port it literally, or ask only on Add?
4. **Gr Vishay extra box.** The new empty `TextBox1` beside Group Name ("Type/Group Name") is never read or saved. Draw it on the web as-is, or leave it out?
5. **Crystal reports.** The three `.rpt` files changed but are unreadable here. Can you provide a printout or PDF of the Issue Slip, Letter Bhet and Letter Demand from v3.4.3.1 so the provisional HTML views can be compared?
6. **Graphics Master folder checks.** Should the two "LibraryNo … In Folder" items exist on the web at all? They need the API server to read the graphics share (`GeneralConfig.GraphicsPath`). If yes, what path does the server see?
7. **Send To Excel formatting.** Gr Vishay now exports through `SendToExcelWithFormatting`, which lives only in the new, undecompiled `CommonLibrary.dll`. Should the new DLL be decompiled so this can be ported, and is the formatted export wanted on the web?
8. **Hard-coded user ids.** Old Log Reports now names users 38 and 68 (Excel) and 68 (Send To Log Report); Tasks names user 100. Copy the ids as they are (the current web convention), or express them some other way?
