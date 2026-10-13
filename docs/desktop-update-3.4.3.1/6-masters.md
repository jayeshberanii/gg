# Slice 6 — Master menu screens (v3.3.3.6 → v3.4.3.1)

Paths: `Updated/…` = `GGLibrarySolutionUpdated/…`; web paths are relative to `gglib-web/`.
All DB statements below were checked against the local `DBLibSQL` restore (read-only).

**Headlines**

1. `visheshMast.remark` was **renamed to `Vibhag`** (column rename, app-wide: a loose grep finds about 112 desktop SQL strings naming `visheshMast … remark` before and about 122 naming `visheshMast … Vibhag` after). Local DB still has `remark`. The web has at least 37 SQL lines naming `visheshMast` and `remark` together, in 12 API files (SQL split over several lines may hide more), and the local DB has 39 `tblSearch` rows that mention it. This is the single biggest prerequisite in the slice and must be cut over together with the DB.
2. `authtype.authtyattr` is no longer written or shown; author text is now built from `authtype.authortype`.
3. New columns: `ApprisalStandard.IsDisplayInAppraisalReport`, `columnmaster.IsCompleted`, `authmast.AuthorNameRefPatrikaKt` — all MISSING locally.
4. New procs: `ListOrReplaceRecordInUse`, `PrintAuthorCheckReport` — MISSING; `UpdateVishay` is PRESENT but with 2 parameters where the new code passes 3.
5. None of the three desktop bugs named in the task (Vishay MAX-before-identity, Party UpSeq, Prakashak Finished) was fixed on the desktop. Two other web fixes are now matched by the desktop (Author Pattavali rows, Author Sampraday prune list).
6. No form in this slice calls the new context-menu permission filter (`ShowHideContextMenu` in `MdlLib.vb:1646` is called only by `frmBookMasterNew` and `frmKrutiMasterNew`).
7. No form in this slice changed how it constructs or configures `frmDisplayTransNew` (constructor args, `TranName`, `FormName`, `TranType` all identical). The only difference is the data handed to it — see Author Master, "AuthorName popup".

---

### Author Type — `frmAuthorType.vb`, `.designer.vb`, `AuthTypeRepository.vb`, `EntAuthType.vb`

- **What changed**: the Attribute field is removed everywhere. `txtauthtyattr` + its label "Attribute" and grid column `colAttr` ("AuthAttr") are deleted from the designer; `GvMain.Attr` is gone (`Updated/Library/Master/frmAuthorType.vb:34-44`); `Ent.authtyattr` is gone; INSERT is now `INSERT INTO authtype (authtycokm,authortype,remark,short_name,uplevalKt,hindiword,IsPrint)` and UPDATE `SET authortype = @authortype,remark=@remark,short_name=@short_name,uplevalKt=@uplevalKt,hindiword=@hindiword,IsPrint=@IsPrint` (`Updated/Library.BusinessContract/Concrete/AuthTypeRepository.vb:35-41`). `brif` is still not saved.
- **Kind**: removed
- **Web today**: old way. `apps/api/src/master/screens/author-type.ts:29,38,47` writes `authtyattr`; `apps/web/src/screens/AuthorTypeMaster.tsx:18` has the `authtyattr` field and `:50` the `AuthAttr` column; `docs/screens/author-type-master.md` lists both.
- **Web change needed**: drop the field, the grid column and the column from INSERT/UPDATE (existing values must be left untouched, as the desktop now does). Update the note.
- **DB prerequisites**: none. `authtype.authtyattr` PRESENT (still exists; whether production drops it is unknown — see open questions). `tblSearch` row `authtype/authtyattr` PRESENT (harmless).
- **Size**: S

- **What changed**: layout. With Attribute gone the remaining left-column boxes moved up one row and the panel shrank: `SplitContainer1.SplitterDistance` 185 → 140; Brief label (13,62) / box (116,58); Remark label (13,102) / box (116,98); right column unchanged (Short Name y=18, Uplevel y=58, Hindi Word y=98). `chkIsPrint` was moved **out of the panel onto the form itself** at (768,27) (`Me.Controls.Add(Me.chkIsPrint)`, `Updated/Library/Master/frmAuthorType.designer.vb:97-106`), i.e. it now sits in the toolbar strip area above the panel (panel starts at y=54).
- **Kind**: UI/layout
- **Web today**: `AuthorTypeMaster.tsx` uses the old coordinates (`panelHeight: 185`, Brief y=98, Remark y=138, IsPrint in the panel at 529,143).
- **Web change needed**: new coordinates; `panelHeight: 140`; IsPrint drawn beside the toolbar (the engine already places things there for the "Reference" link label, e.g. `ColumnMaster.tsx` `labels[].at {x:797,y:0}` — a checkbox in that position may need a small engine addition).
- **DB prerequisites**: none
- **Size**: S

- Right-click menu, validation message (`"Please Enter AuthorType"`), F2, who-may-edit: unchanged.

### Author type text used by Prakashak — `PrakMastRepository.GetAuthorName`

- **What changed**: the author-type part of `prakmast.txtAuthor` is now read from the type's **name**, not its attribute: `select isnull(authortype,'') from authtype where authtycokm=…` (was `isnull(authtyattr,'')`) — `Updated/Library.BusinessContract/Concrete/PrakMastRepository.vb:224`. Same function, Padvi short name lookup: `… from VisheshMast VisPad where VisPad.Tid='…' and VisPad.Vibhag='Avastha'` (was `VisPad.remark`) — `:238`.
- **Kind**: behaviour change (text content of `txtAuthor` changes for every Prakashak saved with the Author popup) + column rename
- **Web today**: old way. `apps/api/src/master/screens/prakashak.ts:218` (`SELECT ISNULL(authtyattr, '') FROM authtype …`) and `:232` (`… AND remark = 'Avastha'`). `authorText()` is exported and reused by Tirth Raksha Master. `prakashak.ts:527` also lists `authtyattr` as a third column in the author-type pick list (that list's SQL lives in `frmDisplayTransNew`, not analysed here).
- **Web change needed**: `authortype` instead of `authtyattr` at `:218`; `Vibhag` instead of `remark` at `:232` (and the other `visheshMast` lookups in the file: `:533,541,544,562,572,600`). `docs/screens/prakashak-master.md:31` says "`authtyattr` + sign short name" — update.
- **DB prerequisites**: `visheshMast.Vibhag` MISSING.
- **Size**: S (plus the rename, counted once under Vishesh)

### Apprisal Standard — `frmApprisalStandard.vb`, designer, `ApprisalStandardRepository.vb`, `EntApprisalStandard.vb`

- **What changed**: new checkbox **"Display In Appraisal Report"** (`chkDisplayInAppraisalReport`, at (470,60), size 237×25, TabIndex 33, **checked by default**), saved to new column `IsDisplayInAppraisalReport`. INSERT: `(VibhagKt,WorkTypeKt,PerHourWorkQty,IsManualEntry,IsDisplayInAppraisalReport,TableName,enuser,endate)`; UPDATE adds `IsDisplayInAppraisalReport=@IsDisplayInAppraisalReport` (`Updated/…/ApprisalStandardRepository.vb:82-87,102`). New grid column `colIsDisplayInAppraisalReport` (header "IsDisplayInAppraisalReport") between IsManualEntry and Form Name, **`Visible = False`**. `ClearDataTable()` (called from New and from FillData) now sets Manual Entry unchecked and Display In Appraisal Report **checked** (`Updated/Library/Master/frmApprisalStandard.vb:448-451`), so a new record defaults to 1. On load a NULL reads as unchecked.
- **Kind**: new feature
- **Web today**: not ported. `apps/api/src/master/screens/apprisal-standard.ts` writes five columns; `apps/web/src/screens/ApprisalStandard.tsx` has only `IsManualEntry`.
- **Web change needed**: add the checkbox field (x 470, y 60, w 237), the column in INSERT/UPDATE, a new-record default of checked (`newDefaults`), and the hidden grid column. Consumers of the flag are in other slices (`frmEmployeeEvaluation.vb:437,500` has it only in commented-out SQL; `frmEmpAppraisalReport.vb` reads `ApprisalStandard`).
- **DB prerequisites**: `ApprisalStandard.IsDisplayInAppraisalReport` (bit) MISSING. `tblSearch` row `ApprisalStandard/IsDisplayInAppraisalReport` MISSING (the desktop binds `dtMain.Columns("IsDisplayInAppraisalReport")`, so the row must exist in production).
- **Size**: S

- **What changed**: loading a record whose `IsManualEntry` is NULL no longer throws (`.ToString() <> "" AndAlso … = True`, `:578`).
- **Kind**: bug fix
- **Web today**: `bit()` handles NULL — already new way. **Web change needed**: none. **Size**: —

### Vishay — `frmVishayMaster.vb`, designer, `VishayRepository.vb`, `IVishayRepository.vb`

- **What changed**: new validation — duplicate name. `GetValidationMessage`: after `"Please Enter Vishay Name"`, `else If clsCom.GetScalarValue(String.Format("SELECT COUNT(*) FROM vishay WHERE vishay_nm=N'{0}' AND vishaycokm<>{1}", Ent.vishay_nm, Ent.vishaycokm)) > 0` → message **`Vishay Name - {0} Already Exist`** (`Updated/…/VishayRepository.vb:19-24`). Applies to add and edit.
- **Kind**: behaviour change
- **Web today**: `apps/api/src/master/screens/vishay.ts:113` only checks blank.
- **Web change needed**: add the duplicate check (parameterised; needs DB access in `validate` or at the top of `save`). Note: the local DB already has **96 names used by more than one row**, so editing any of those records will now be refused on both sides until renamed.
- **DB prerequisites**: none
- **Size**: S

- **What changed**: Delete's in-use check replaced. Old: three inline queries (`VishayEntry` by TransactionName, `krutivishayT`, `praksnVishayT`) and message `"Record is in used in below forms" + lines`. New (`Updated/Library/Master/frmVishayMaster.vb:737-740`): `exec ListOrReplaceRecordInUse <curr_lnid>,'Vishay','<id>'`; if it returns any row → `MsgBox("Record is in use",, "Record cannot be deleted")` (title "Record cannot be deleted", no list of forms any more).
- **Kind**: behaviour change
- **Web today**: old way — `vishay.ts` `checkInUse` (three queries, old message); `docs/screens/vishay-master.md` "Delete".
- **Web change needed**: call the procedure, new message. Which tables the procedure covers is not visible in the VB source.
- **DB prerequisites**: procedure `ListOrReplaceRecordInUse` MISSING. From the callers: parameters `(UserId int, TableName, SearchValue [, ReplaceWithId])`; with 3 args it returns rows with at least `TableName` and `Count`; with 4 args it performs the replacement and returns rows.
- **Size**: S once the procedure exists

- **What changed**: new right-click item, last in `cntMenu`: **"Replace In Use Current Vishay With Another Vishay"** (`ReplaceVishayToolStripMenuItem`). Handler (`frmVishayMaster.vb:872-875`) calls `CommonRepository.ListOrReplaceRecordInUse(curr_lnid, "Vishay", <current row id>, "SELECT vishaycokm,vishay_nm FROM vishay WHERE ISNULL(vishay_nm,'')<>'' ORDER BY vishay_nm")` (`Updated/…/CommonRepository.vb:224-254`):
  1. `exec ListOrReplaceRecordInUse {UserId},'Vishay','{id}'`. No rows → `"Vishay is not used in any records"`.
  2. Otherwise sums `Count` and asks (Yes/No): `"Record is used at {total} places."` + one line per row `"{TableName} - {Count}"` + `"Are you sure to replace"`.
  3. Yes → pick list from the SQL above; if a row is picked → `exec ListOrReplaceRecordInUse {UserId},'Vishay','{id}','{pickedId}'`; if it returns rows → `"{total} Recods Replaced Successfully"` (sic), then `VishayRepository.UpdateVishay("", "", pickedId)` = stored procedure `UpdateVishay` with parameters `TransactionName=''`, `Strid=''`, `VishayKt=pickedId`.
     It works on the **current** row only, not the selection. Not filtered through context-menu permissions.
- **Kind**: new feature
- **Web today**: not ported (`VishayMaster.tsx` `contextMenu`).
- **Web change needed**: new action + menu item with the confirm → pick → replace flow.
- **DB prerequisites**: `ListOrReplaceRecordInUse` MISSING. `UpdateVishay` PRESENT but local signature is `(@TransactionName NVARCHAR(50), @Strid VARCHAR(MAX))` — the third parameter `@VishayKt` is MISSING, so the new call fails against the local DB.
- **Size**: M

- Designer: only the new menu item; the other hunks are control reordering.
- **Desktop bugs the web fixed — status in the update**: `VishayRepository.Save` still reads `select ISNULL(max(vishaycokm),0) from Vishay` before the identity insert (`Updated/…/VishayRepository.vb:56`), still re-inserts references on every save. **Not fixed on the desktop**; the web's fixes stand and still differ from the desktop.

### Vishesh — `frmVisheshMaster.vb`, Designer, `VisheshMastRepository.vb`, `EntVisheshMast.vb`

- **What changed**: the category column `visheshMast.remark` is renamed **`Vibhag`** end to end. Entity property `remark` → `Vibhag`; text box `txtremark` → `txtVibhag`; label "Remark" → **"Vibhag"**; grid column `colRemark` ("Remark") → `colVibhag` (header **"Vibhag"**, width 130, same position: second column); INSERT `(Tid,Vishesh,Vibhag,UplevelKt,Brief,VisheshNo,ShortNm,Notes,HindiWord,txtAnyaName,txtAdyaSthapak)`, UPDATE `SET Vishesh = @Vishesh,Vibhag=@Vibhag,…` (`Updated/…/VisheshMastRepository.vb:44-50`). F2 lookups:
  - Up Level, box value `contactnm`: `select tid,vishesh,Vibhag from visheshMast ORDER BY Vibhag,vishesh`
  - Up Level, otherwise: `select tid,vishesh from visheshMast where Vibhag in(select Vibhag from visheshMast where tid =<TranKm>)` (`Updated/Library/Master/frmVisheshMaster.vb:480-484`)
  - Utility › Update Uplevel In Selected Records: `select tid,vishesh from visheshMast where Vibhag in(select Vibhag from visheshMast where tid in(<ids>))` (`VisheshMastRepository.vb:117`)
    No behaviour other than the name changed; validation (`"Please Enter Name"`), menu, tree, delete are identical.
- **Kind**: behaviour change (schema rename + caption change)
- **Web today**: old name everywhere. `apps/api/src/master/screens/vishesh.ts` (save `remark`, both `f2` lists), `apps/web/src/screens/VisheshMaster.tsx:55,70,113` (field `remark`, label/header "Remark", `f2Params`), `docs/screens/vishesh-master.md`. In this slice's other files: `prakashak.ts:232,533,541,544,562,572,600`, `author.ts:684,695,705,733,753,769,776,782,786,791`, `sampraday.ts:254`. Outside the slice (same rename, must go in the same change), files where a same-line grep for `visheshmast` + `remark` hits: anya-bhandar, kruti, kruti-actions, book, book-actions, book-tran, vishesh-entry-common, tirth-raksha. Other screens may reach the column through multi-line SQL or through `tblSearch` text; I did not audit them. `packages/db/src/schema.ts` types too.
- **Web change needed**: rename the column in every SQL string, rename the field/label/header on the Vishesh screen, regenerate DB types. It cannot be made backward compatible without a view or computed column — the web will break against whichever DB shape it is not built for.
- **DB prerequisites**: `visheshMast.Vibhag` MISSING (local has `remark nvarchar(50)`). `tblSearch` row `visheshMast/Vibhag` MISSING (local has `visheshMast/remark` with F2EntryText `select remark from visheshMast where isnull(remark,'')<>'' group by remark order by remark`). 39 local `tblSearch` rows reference `vishesh…remark` in JoinCondition / F2EntryText / AddTableInfo and must already be rewritten in production data — the web reads them live.
- **Size**: M for this slice's files; L across the app

- **Incidental web defect found while reading** (not caused by the update): `apps/api/src/master/screens/vishesh.ts:74` reads `DELETE FROM VisheshAdy                                    aSthapakT WHERE VisheshKt = ${id}` — the table name is split by spaces, so SQL Server parses it as table `VisheshAdy` aliased `aSthapakT` and an edit that re-saves the Adya Sthapak popup on an existing record should fail with "Invalid object name". Not verified by running it.

### Column — `frmColumnMaster.vb`, Designer (no repository)

- **What changed**: new checkbox **"IsCompleted"** (`chkIsCompleted`, at (111,214), 125×25, TabIndex 160, next to IsPrint at (16,214)), saved to new column `columnmaster.IsCompleted` as 0/1 in both INSERT and UPDATE (`Updated/Library/Master/frmColumnMaster.vb:538,546`); cleared on New (`:500`); loaded with `Convert.ToString(…("IsCompleted")).ToLower = "true"` (`:462-466`). Consumer seen elsewhere: `frmDisplayTransNew.vb:2400` lists `columnMaster WHERE Vibhag='KrutiSampraday' AND ISNULL(ISCompleted,0)=0` (other person's file).
- **Kind**: new feature
- **Web today**: not ported (`apps/api/src/master/screens/column-master.ts` save, `apps/web/src/screens/ColumnMaster.tsx` fields).
- **Web change needed**: checkbox field at (111,214) + column in INSERT/UPDATE.
- **DB prerequisites**: `columnmaster.IsCompleted` MISSING. `tblSearch` row `columnmaster/IsCompleted` MISSING (the form's record query is built from `tblSearch` via `UcSearch.GetColumns`; the `IsPrint` row is PRESENT).
- **Size**: S

- **What changed**: new duplicate check in Save, after the Vibhag and Name checks and before the confirm: `select count(*) from columnmaster where ColumnMastkm<><ColumnMastKm> AND Name = N'<txtName trimmed>' and Vibhag =  N'<txtVibhag trimmed>'` > 0 → **`MsgBox("Recor Already Exist")`** (sic) (`:515-518`).
- **Kind**: behaviour change
- **Web today**: `column-master.ts` `validate` has only the two blank checks.
- **Web change needed**: add the check with the same message. The local DB has **33 (Name, Vibhag) pairs used by more than one row**; those rows can no longer be edited without renaming.
- **DB prerequisites**: none
- **Size**: S

- **What changed**: IsPrint is now actually loaded. Old test `Val(dtSel.Rows(0)("IsPrint").ToString) = True` could never be true (`Val("True")` is 0), so the box always loaded unchecked and any edit wrote `IsPrint=0` unless re-ticked; new test compares the text to `"true"` (`:457-461`). The designer's default `chkIsPrint.Checked = True` was also removed (New already cleared it).
- **Kind**: bug fix
- **Web today**: the engine loads the bit as stored — already the new way (the old desktop bug was never reproduced; it is not listed in `docs/screens/column-master.md`).
- **Web change needed**: none (optionally add a line to the note).
- **Size**: —

- **What changed**: new right-click branch **Utility › "Replace In Use Current Record With Another Record"** (third top-level item after Print and For Selected Record). Its handler is an **empty** `Try/Catch` (`:935-941`) — it does nothing.
- **Kind**: new feature (stub)
- **Web today**: not present.
- **Web change needed**: add the item as a no-op only if menu parity matters; otherwise none. See open questions.
- **Size**: S

- Who-may-edit rule (admin, AMaster, users 20 and 50), validation messages `"Please Enter Vibhag"` / `"Please Enter Name"`, empty Delete, popups: unchanged. The desktop bugs the web fixed (up levels wiped on edit, `UplevelId` set to 0) are **still present** in the update (`UplevelId=" & INint(txtUplevelTran.Tag)` is still in the UPDATE).

### Party — `frmPartyMaster.vb`, Designer, `PartyMRepository.vb`

- **What changed**: adding a party now writes a work report: `clsCom1.insertworkreports(TransactionName, PrimaryColumn, partyMkm, curr_lnid)` in the Add branch after the new row is put in the grid (`Updated/Library/Master/frmPartyMaster.vb:826`). Edit still logs with the before/after comparison; Delete still logs nothing.
- **Kind**: behaviour change
- **Web today**: old way — `apps/api/src/master/screens/party.ts:121` `workReportOn: { add: false, delete: false }`; `docs/screens/party-master.md:57` "on Edit only".
- **Web change needed**: `workReportOn: { delete: false }`; update the note.
- **DB prerequisites**: none
- **Size**: S

- **What changed**: right-click Send To item caption "Inword" → **"Inward"** (`Updated/Library/Master/frmPartyMaster.Designer.vb:773`).
- **Kind**: UI/layout
- **Web today**: `apps/web/src/screens/PartyMaster.tsx:176` `send('Inword', …)`.
- **Web change needed**: caption. The in-use refusal text `'Record is in used in Inword Master'` (`party.ts:54`) comes from `PartyMRepository.CheckInUse`, which did not change.
- **Size**: S

- `PartyMRepository.vb`: refactor only (a commented-out block removed). `frmPartyMaster.vb` enum/Save hunks: refactor only (commented lines removed).
- **UpSeq bug — status**: `Ent.UpSeq` is still taken from `txtUpSeq.Tag` and written in INSERT/UPDATE unchanged. **Not fixed on the desktop**; the web's fix stands.

### Author — `frmAuthorMaster.vb`, designer, `AuthMastRepository.vb`, `EntAuthMast.vb`

- **What changed — AuthorName popup gets a Patrika reference** (this is the one place the slice hands `frmDisplayTransNew` different data): the one-row table passed for F2 on `txtauthorname` (`New frmDisplayTransNew(False, True, False, False)`, `TranName = "AuthorName"`, `FormName = "Author"`) now has columns `AuthorName, BookTKt, LibNo, PatrikaKt, PatrikaNo, RefPgNo` (was `AuthorName, BookTKt, LibNo, RefPgNo`) — `Updated/Library/Master/frmAuthorMaster.vb:817-824`; after Save the form copies `PatrikaKt` / `PatrikaNo` back (`:464-465`); on load they come from `dtSel("AuthorNameRefPatrikaKt")` / `dtSel("AuthorNameRefPatrikaNo")` (`:1508-1509`); Save sets `Ent.AuthorNameRefPatrikaKt` (`:1050`) and the repository writes it in INSERT and UPDATE (`Updated/…/AuthMastRepository.vb:270-280,327`). New entity properties `AuthorNameRefPatrikaKt As Integer`, `AuthorNameRefPatrikaNo As String`. The popup's own `PatrikaNo` lookup is in `frmDisplayTransNew` (seen at `:4580`: `SELECT PatrikaKm,RecordNo AS PatrikaNo FROM Patrika ORDER BY PatrikaNo`; whether the AuthorName popup uses exactly that branch is for whoever has that file).
- **Kind**: new feature
- **Web today**: old shape. `apps/web/src/screens/AuthorMaster.tsx:165-190` local popup with `['AuthorName','BookTKt','LibNo','RefPgNo']`; hidden fields `AuthorNameRefBookTKt/…BookTName/…PgNo` (`:583-585`); `apps/api/src/master/screens/author.ts:252-253,298-299,307,313` save only BookTKt + PgNo.
- **Web change needed**: add `PatrikaKt` (hidden) and `PatrikaNo` columns with a Patrika lookup to the local popup, two more hidden fields, and `AuthorNameRefPatrikaKt` in INSERT/UPDATE.
- **DB prerequisites**: `authmast.AuthorNameRefPatrikaKt` (int) MISSING. `tblSearch` row for `authmast/AuthorNameRefPatrikaKt` whose JoinCondition yields `AuthorNameRefPatrikaNo` MISSING (the existing sibling row is `AuthorNameRefBookTKt` → `(select Libno FROM BookT where authmast.AuthorNameRefBookTKt=BookT.tid) AS AuthorNameRefBookTName`). `Patrika.PatrikaKm`, `Patrika.RecordNo` PRESENT.
- **Size**: M

- **What changed — Samvat rows are now upserted, not deleted and re-inserted.** `DeleteTransaction` no longer runs `delete from AuthorSamvatT where Authorkt=…` (`AuthMastRepository.vb:131-135`, commented out; the statement is on `:132`). Save (`:650-675`), when the Samvat popup was loaded (`dtSamvat.Columns.Count > 0`): rows with `AuthorSamvatKm = 0` are inserted (same column list as before) and the new identity is read back; other rows get `UPDATE AuthorSamvatT SET SamvatKindKt=…,Remark=…,AsamvatKt=…,Asamvat=…,Vksamvat=…,BookTKt=…,PageNo=…,SthalKt=…,Seq=…,IsPrint=… WHERE AuthorSamvatKm=…`; then
  `UPDATE authmast SET RefSamvatKt=NULL FROM authmast INNER JOIN AuthorSamvatT ON authmast.authorcokm=AuthorSamvatT.AuthorKt WHERE AuthorKt=<id> AND AuthorSamvatKm NOT IN(<kept ids>)` and
  `DELETE FROM AuthorSamvatT WHERE AuthorKt=<id> AND AuthorSamvatKm NOT IN(<kept ids>)`.
  Effect: `AuthorSamvatKm` values survive a save, so `authmast.RefSamvatKt` (which stores an `AuthorSamvatKm`, possibly of another author) no longer goes stale. As written, the NULL-ing statement clears **this author's** `RefSamvatKt` whenever any of the author's samvat rows is being removed (it joins on the author, not on `RefSamvatKt = AuthorSamvatKm`), and it does not touch other authors pointing at a removed row.
- **Kind**: bug fix
- **Web today**: old way — `author.ts:285` deletes all `AuthorSamvatT` rows of the author when the popup was sent, `:463-470` re-inserts. `docs/screens/author-master.md:75` lists SamvatTran under "delete + insert". Local data shows the damage of the old behaviour: 136 of 436 authors with a `RefSamvatKt` point at a samvat row that no longer exists.
- **Web change needed**: move SamvatTran to the existing `upsert()` helper (key `AuthorSamvatKm`, already a hidden column of the popup in `AuthorMaster.tsx:424`), and add the `RefSamvatKt = NULL` statement before the prune. Check the row-by-row Samvat work-report comparison still lines up.
- **DB prerequisites**: none (`AuthorSamvatT.AuthorSamvatKm` identity PRESENT; `tblSearch` `authmast/SamvatTran` F2EntryText already selects `AuthorSamvatKm`).
- **Size**: M

- **What changed — Pattavali rows are no longer deleted before their upsert.** `DeleteTransaction`'s `delete from AuthorPattavaliT where Authorkt=…` is commented out (`:119-123`); the upsert by `AuthorPattavaliKm` + prune further down is unchanged. In the old version the delete ran first, so the "UPDATE" of every existing row hit nothing and existing rows were lost whenever the popup had been opened.
- **Kind**: bug fix
- **Web today**: already the new way — `author.ts:527-545` upserts and prunes, with no prior delete. **The desktop's fix and the web now agree.**
- **Web change needed**: none.
- **Size**: —

- **What changed — Sampraday prune list reset.** `StrTid = "0"` is now set immediately before the Sampraday upsert loop (`:678`), so the prune `NOT IN(…)` list holds only Sampraday ids.
- **Kind**: bug fix
- **Web today**: already so; `docs/screens/author-master.md:130` records it as a deliberate difference ("the desktop's list also carried AnyName2 ids"). **Now agrees with the desktop** — the note can drop it from "Deliberate differences".
- **Web change needed**: note only.
- **Size**: —

- **What changed — Sampraday box text.** After saving the Sampraday popup the box text is built as `SampradayName` + `(` + **Remark** + `)` per row; the old code repeated the name inside the brackets (`frmAuthorMaster.vb:680`). This text is what is saved as `authmast.txtSampraday`.
- **Kind**: bug fix
- **Web today**: old way — `apps/web/src/features/master/transSummary.ts:46-55` `sampradaySummary` appends `(${name})` when Remark is not blank.
- **Web change needed**: append the trimmed Remark instead.
- **Size**: S

- **What changed — the Sampraday id box is disabled.** `txtSampradaykt.Enabled = False` in the designer (`Updated/Library/Master/frmAuthorMaster.designer.vb:617`); no code re-enables it. The value is still loaded and still saved (`Ent.Sampradaykt = Val(txtSampradaykt.Tag)`), it just cannot be typed in or F2-picked; Sampraday is maintained through the Sampraday popup next to it.
- **Kind**: behaviour change
- **Web today**: `AuthorMaster.tsx:555-559` field `Sampradaykt` is an editable `kt` box.
- **Web change needed**: render it disabled, keep sending its loaded value.
- **Size**: S

- **What changed — new right-click item Print Report › "Author Check Report"** (last item, after Print Author Info). Handler (`frmAuthorMaster.vb:2193-2206`): `clsCom.SetTranIds(True, <selected row ids>)`, `EXEC PrintAuthorCheckReport` (no arguments; it reads the ids from the TranIds mechanism), result sent to Excel if it has rows, then `SetTranIds(False)`. Not filtered through context-menu permissions.
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: new action returning the table (CSV download like the other Excel items), using the web's existing TranIds handling for report procedures.
- **DB prerequisites**: procedure `PrintAuthorCheckReport` MISSING (columns unknown — whatever it returns is shown as is). `SetTranIds` proc and `TranIds` table PRESENT.
- **Size**: S once the procedure exists

- **What changed — new right-click item Show In Use (For Selected Record) › "BookT"** (last item of that submenu, after English Book Vishesh). Handler (`:2784-2813`) opens `frmBookTranNew` as a dialog with `WhereCondition =`
  ` AND tid in( Select DISTINCT AuthorNameRefBookTKt AS BookTKt FROM authmast WHERE authorcokm IN(<ids>) AND ISNULL(AuthorNameRefBookTKt,0)>0`
  ` UNION Select DISTINCT AP.BookTKt FROM AuthorParamparaT AP` + three `OUTER APPLY(SELECT DISTINCT ISNULL(AuthorParamparaT.identity2kt,0) AS GuruKt FROM AuthorParamparaT INNER JOIN columnmaster ON AuthorParamparaT.identity2kt=columnmaster.ColumnMastkm WHERE AuthorParamparaT.AuthorParamparaKm=AP.AuthorParamparaKm AND columnmaster.Name=N'गुरु' | N'विद्यागुरु' | N'गुरुपरंपरा') AS tblGuru | tblVidhyaGuru | tblGuruParampara` + ` WHERE AP.Authorkt IN(<ids>) AND AP.identity2kt=CASE WHEN tblGuru.GuruKt>0 THEN tblGuru.GuruKt WHEN tblVidhyaGuru.GuruKt>0 THEN tblVidhyaGuru.GuruKt WHEN tblGuruParampara.GuruKt>0 THEN tblGuruParampara.GuruKt ELSE -3 END`
  ` UNION Select DISTINCT AuthMAnyLibNoT2.BookTKt FROM AuthMAnyLibNoT2 WHERE AuthorKt IN(<ids>)`
  ` UNION Select DISTINCT AuthorSampradayT.BookTKt FROM AuthorSampradayT WHERE AuthorKt IN(<ids>)`
  ` UNION Select DISTINCT AuthorSamvatT.BookTKt FROM AuthorSamvatT WHERE IsPrint=1 AND AuthorKt IN(<ids>) )`
  where `<ids>` are the selected grid rows. No "nothing found" message — the dialog just opens (empty if nothing matches).
- **Kind**: new feature
- **Web today**: not ported. `apps/web/src/screens/BookTranDialog.tsx` already accepts a `tids` list (used by Book Master's "For Selected Record › BookT").
- **Web change needed**: an action that returns the BookT ids from the query above, and the menu item opening `BookTranDialog` with them.
- **DB prerequisites**: none (all tables/columns PRESENT, incl. `AuthMAnyLibNoT2.AuthorKt`).
- **Size**: M

- **What changed — Print Author Info SQL** (`:2755-2776`): (a) `A.recordno AS RecordNo`; (b) the name's reference now also covers Patrika: `authorname + CASE WHEN ISNULL(AuthorNameRefBookTKt,0)>0 OR ISNULL(AuthorNameRefPatrikaKt,0)>0 OR ISNULL(A.AuthorNameRefPgNo,'')<>'' THEN '(' + LTRIM(RTRIM(ISNULL(COALESCE(BT.Libno,P.RecordNo),'') + '  ' + ISNULL(A.AuthorNameRefPgNo,''))) + ')' ELSE '' END AS Name` with `LEFT JOIN Patrika P ON A.AuthorNameRefPatrikaKt=P.PatrikaKm`; (c) the Guru column no longer uses `OUTER APPLY(SELECT TOP(1) … ORDER BY APSeq)` per parampara row; instead three author-level `OUTER APPLY`s (`tblGuru`, `tblVidhyaGuru`, `tblGuruParampara`, each `SELECT DISTINCT ISNULL(AuthorParamparaT.identity2kt,0) AS GuruKt … WHERE AuthorParamparaT.Authorkt=A.authorcokm AND columnmaster.Name=N'गुरु'` / `N'विद्यागुरु'` / `N'गुरुपरंपरा'`) and the subquery joins `LEFT JOIN columnmaster AS colAPId ON AP.identity2kt=colAPId.ColumnMastkm AND AP.identity2kt= CASE WHEN tblGuru.GuruKt>0 THEN tblGuru.GuruKt WHEN tblVidhyaGuru.GuruKt>0 THEN tblVidhyaGuru.GuruKt WHEN tblGuruParampara.GuruKt>0 THEN tblGuruParampara.GuruKt ELSE -3 END`. Meaning: only the highest-priority kind present for the author (गुरु, else विद्यागुरु, else गुरुपरंपरा) is named. Because it is a LEFT JOIN, parampara rows of other kinds still take part in the concatenation with a NULL name (so they contribute nothing to the string); the old `Vibhag='AuthIdentity'` filter is gone.
- **Kind**: behaviour change
- **Web today**: old SQL in `author.ts:1483-1513` (`author-info`). The menu item itself is commented out in `AuthorMaster.tsx:801`, so users cannot reach it today.
- **Web change needed**: replace the SQL (only matters if the item is re-enabled).
- **DB prerequisites**: `authmast.AuthorNameRefPatrikaKt` MISSING.
- **Size**: S

- **What changed — Show Image of RefrenceT path**: `frmjpg.MainPath = GetConfigValueFromConfigName(EnumGeneralConfig.ReferenceTPath.ToString())` (was the global `ReferenceTPath`) — `:2466`; the value is now read with `SELECT ConfigValue FROM GeneralConfig WHERE ConfigName=@ConfigName` (`MdlLib.vb:1712`). Same one-line change in `frmPrakashakMaster.vb:1434` and `frmPrakashakMasterOld.vb:1362`.
- **Kind**: refactor (config moved to a table)
- **Web today**: n-a — "Show Image of RefrenceT" is not available on the web (`docs/screens/author-master.md:137`, `prakashak-master.md:92`).
- **Web change needed**: none.
- **DB prerequisites**: table `GeneralConfig` MISSING (only matters to the desktop / other slices).
- **Size**: —

- Validation messages, who-may-edit / lock rules (`Locked`, `IsLockedByAdmin`), F2 SQL inside the form: unchanged.

### Prakashak — `frmPrakashakMaster.vb`, `frmPrakashakMasterOld.vb`, `PrakMastRepository.vb`

- `frmPrakashakMaster.vb`: only the `ReferenceTPath` line above (n-a on the web). Designer: no change.
- `frmPrakashakMasterOld.vb`: same one line; not on the web.
- `PrakMastRepository.vb`: the two SQL changes listed under "Author type text used by Prakashak" above (`authortype` instead of `authtyattr`; `VisPad.Vibhag='Avastha'`). Everything else in the 63 changed lines is removal of commented-out code — refactor only.
- **Finished reset bug — status**: `chkFinished` is still never loaded from the record and `Ent.Finished = chkFinished.Checked` is unchanged (`frmPrakashakMaster.vb:814`). **Not fixed on the desktop**; the web's fix stands.

### Sampraday — `frmSampraday.vb`

- Refactor only: an unused form-level `TableKt` variable and its load query were removed, plus commented lines in Save. Repository and entity unchanged. The web's `sampraday.ts:254` has one `visheshMast WHERE remark = 'City'` lookup that falls under the rename.

### Bhasha — `frmBhashaMaster.vb`; Lipi — `frmLipiMaster.vb`

- Refactor only: a commented-out `txtuplevelkt` F2 branch was deleted in each. Repositories, entities and designers unchanged. No web change.

### Not in the slice list but touched

- `Library/Master/frmTreeMast.vb` (+ Designer) changed (new "Relations" count column in both grids, tree now filled alongside the grid instead of replacing it, a new `ShowInUseVishayMaster` helper opening Gr Vishay / Vishay / Vishesh Master with a `WhereCondition`). It is not one of the listed forms (the web's `AuthorTree.tsx` is Author Master's own tree, not this form), so it is **not analysed here** — make sure another slice owns it.

---

## DB objects this slice needs

| Object                                                                                                         | Needed by                                                    | Local DB                                           |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `visheshMast.Vibhag` (rename of `remark`, nvarchar(50) today)                                                  | Vishesh Master, every `visheshMast` category lookup app-wide | **MISSING** (column is still `remark`)             |
| `tblSearch` row `visheshMast` / `Vibhag` (replaces `remark`) + the 39 rows whose SQL mentions `vishesh…remark` | Vishesh grid/search, other screens' joins and F2 lists       | **MISSING** / still old text                       |
| `ApprisalStandard.IsDisplayInAppraisalReport` (bit; Ent: Boolean)                                              | Apprisal Standard                                            | **MISSING**                                        |
| `tblSearch` row `ApprisalStandard` / `IsDisplayInAppraisalReport`                                              | Apprisal Standard grid binding                               | **MISSING**                                        |
| `columnmaster.IsCompleted` (bit; written as 0/1)                                                               | Column Master                                                | **MISSING**                                        |
| `tblSearch` row `columnmaster` / `IsCompleted`                                                                 | Column Master record query                                   | **MISSING**                                        |
| `authmast.AuthorNameRefPatrikaKt` (int; Ent: Integer)                                                          | Author Master save, Print Author Info                        | **MISSING**                                        |
| `tblSearch` row `authmast` / `AuthorNameRefPatrikaKt` yielding `AuthorNameRefPatrikaNo`                        | Author Master load                                           | **MISSING**                                        |
| proc `ListOrReplaceRecordInUse(UserId, TableName, SearchValue [, ReplaceWith])` → rows `TableName`, `Count`    | Vishay delete check + Replace item                           | **MISSING**                                        |
| proc `UpdateVishay(@TransactionName, @Strid, @VishayKt)`                                                       | Vishay Replace item                                          | PRESENT with **2** parameters; `@VishayKt` MISSING |
| proc `PrintAuthorCheckReport` (no parameters, reads TranIds)                                                   | Author Check Report                                          | **MISSING**                                        |
| table `GeneralConfig(ConfigName, ConfigValue, …)`                                                              | ReferenceTPath (desktop only; n-a on web)                    | **MISSING**                                        |
| `authtype.authtyattr`                                                                                          | no longer used by these forms                                | PRESENT                                            |
| `AuthorSamvatT.AuthorSamvatKm` (identity), `tblSearch authmast/SamvatTran` selecting it                        | Samvat upsert                                                | PRESENT                                            |
| `Patrika.PatrikaKm`, `Patrika.RecordNo`                                                                        | AuthorName popup, Print Author Info                          | PRESENT                                            |
| `AuthMAnyLibNoT2.AuthorKt/BookTKt`, `AuthorParamparaT`, `AuthorSampradayT`, `AuthorSamvatT`                    | Show In Use › BookT                                          | PRESENT                                            |
| proc `SetTranIds`, table `TranIds`                                                                             | Author Check Report                                          | PRESENT                                            |
| tables `ContextMenu`, `UserContextMenuPermission`                                                              | not used by any form in this slice                           | MISSING (n-a here)                                 |

No table is new in this slice; all missing items are columns, `tblSearch` rows and procedures. Their definitions are not in the VB source (no `.sql` anywhere), so the procedure bodies and the exact `tblSearch` rows have to come from the production database.

## Open questions for the user

1. **`visheshMast.remark` → `Vibhag`**: has production already been renamed, and will the web be cut over at the same moment as the desktop update? The web cannot serve both shapes; a DB carrying the new schema (or a script of the changes) is needed to build and test against.
2. Can we get the definitions of `ListOrReplaceRecordInUse`, the 3-parameter `UpdateVishay` and `PrintAuthorCheckReport`, and the new/changed `tblSearch` rows, from production?
3. `authtype.authtyattr`: is the column being dropped in production, or only abandoned? (Decides whether the other web screens that still read it — Book, Anya Bhandar, Kruti, Tirth Raksha — break or merely show stale text; those are other slices.)
4. Vishay and Column Master duplicate checks: existing duplicates (96 Vishay names, 33 Column Name+Vibhag pairs locally) become uneditable until renamed. Is that intended, and should the web copy the misspelt messages verbatim (`"Recor Already Exist"`, `"… Recods Replaced Successfully"`)?
5. Column Master's "Utility › Replace In Use Current Record With Another Record" does nothing on the desktop. Show it on the web as a dead item, or leave it out until it is implemented?
6. Author Master Samvat save: the desktop clears the author's `RefSamvatKt` whenever any of that author's samvat rows is removed, even if the referenced row is kept, and leaves other authors' references to a removed row dangling. Copy as is, or clear only references to rows actually removed?
7. Author Type: IsPrint now sits on the toolbar strip at (768,27) on the desktop. Follow that placement exactly on the web?
8. Print Author Info is currently hidden in the web menu (commented out). Should it be re-enabled with the new SQL, alongside the new Author Check Report?
