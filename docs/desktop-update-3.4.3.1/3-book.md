# Slice 3 — Book Master family: desktop v3.3.3.6 -> v3.4.3.1

Paths: `Updated/` = `GGLibrarySolutionUpdated/`. Web paths are relative to `gglib-web/`.
PRESENT / MISSING = state of the local DB (`DBLibSQL` restore).

## Repository / entity check (asked for explicitly)

- There is no `BookM*.vb` / `BookTran*.vb` repository and no `EntBookM` / `EntBookT` entity in either tree (Book Master and
  Book Tran run their own SQL in the form). The only Book-named files are `BookConfirmationRepository.vb`,
  `IBookConfirmationRepository.vb`, `EnglishBookVisheshRepository.vb`, `IEnglishBookVisheshRepository.vb`,
  `EntBookConfirmation.vb`, `EntEnglishBookVishesh.vb`, `EntMagBookmT.vb`: **all identical** in both versions.
- `frmBookMSData.vb` is identical (only its Designer changed). So for Book Master / Book Tran the form diff is the whole story.
- Layout: `frmBookMasterNew.Designer.vb` was re-saved at 96 DPI (AutoScale 7x16, client 1012x708, SplitterDistance 438)
  instead of 150 % (10x22, 1446x974, 602). After scaling, every control is where it was (checked control by control);
  that accounts for almost all of the ~880 changed Designer lines. The `.resx` diff is tray positions only.

## Headline changes (read these first)

1. **Mix Sign is no longer a text column.** `BookM.MixSign` and `BookT.Mixsign` are not written any more; the boxes became
   popups backed by new child tables `BookMixSignT` and `BookTranMixSignT`. Every web feature that reads or writes the text
   columns is now stale.
2. **Three new popups on Book Master** (Sampraday, Mix Sign, Kruti Work) and **two on Library No** (Mix Sign, Condition),
   each with its own new table. All five tables and their `tblSearch` rows are MISSING locally.
3. **Short Name box became "Prak Vishesh Name"**: saves `BookM.PrakVisheshName` (MISSING) instead of `BookM.ShortName`.
4. **Right-click menu visibility is now data-driven** (`ShowHideContextMenu`, tables `ContextMenu` +
   `UserContextMenuPermission`, both MISSING) instead of the hard-coded user-id list.
5. **`VisheshMast.remark` -> `VisheshMast.Vibhag`** and **`authtype.authtyattr` -> `authtype.authortype`** in every query
   touched (cross-cutting; `VisheshMast.Vibhag` is MISSING locally).
6. **`praksnBhashaT` / `praksnLipiT` keys are no longer assigned by the app** (inserts omit the key, so the column must be
   IDENTITY in the target DB; locally it is not).
7. **Lab issue: the "30 days old due books" block is switched off.**

---

### frmBookMasterNew.vb / .Designer.vb — fields and Save

#### 1. Mix Sign box: text + F2 list -> popup on `BookMixSignT`

- **What changed**: `txtMixSign` (Designer, removed) is replaced by `txtMixSignTran` at the same place (797,183 w126).
  The F2 branch that appended picks (`If a <> "" Then txt.Text = a & "," & sender.text`) is deleted
  (`Updated/Library/Library/frmBookMasterNew.vb` ~1507). F2 now opens `frmDisplayTransNew` with `TranName = "MixSign"`,
  `FormName = "Prakashan"` (1311-1317); rows come from `tblSearch` BookM / `MixSignTran` F2EntryText (1157-1158).
  Save no longer writes `MixSign` (INSERT and UPDATE column lists 2018-2043, parameter removed ~2080); `MixSignRem` is
  still written. New block (2180-2203), run when the box text differs from the loaded `MixSignTran` (or is non-empty on Add):
  `INSERT INTO BookMixSignT(BookMastKt,MixSignKt,Seq,enuser,endate) VALUES (<book>,<MixSignKt>,<Seq>,<user>,GETDATE())`
  for key <= 0, else `UPDATE BookMixSignT SET MixSignKt=..,Seq=..,moduser=..,moddate=GETDATE() WHERE BookMixSignKm=..`,
  then `DELETE FROM BookMixSignT WHERE BookMastKt=<book> AND BookMixSignKm NOT IN(<kept>)`.
  Popup grid columns (from frmDisplayTransNew, other slice): `BookMixSignKm` (hidden, new = random -500..-1), `MixSignKt`
  (hidden), `MixSignName`, `Seq`; cell list `select Tid,Vishesh,v.Brief,v.Notes,v.HindiWord from VisheshMast v where Vibhag = 'CHKBX' and v.VisheshNo in (1,3) order by vishesh`.
- **Kind**: behaviour change (data model)
- **Web today**: old way. `apps/web/src/screens/BookMaster.tsx:675` field `MixSign` with `addMore: { append: true }`;
  `apps/api/src/master/screens/book.ts:259,290,299,315` writes `BookM.MixSign`.
- **Web change needed**: replace the field by a `tran('MixSignTran', ...)` popup (model: `MagazineRemarkTran`,
  BookMaster.tsx:462/719, book.ts:154-213); stop writing `MixSign`; add upsert/prune of `BookMixSignT`; record query must
  return `MixSignTran` text; update `docs/screens/book-master.md` ("Mix Sign's F2 keeps picking..." no longer true).
- **DB prerequisites**: `BookMixSignT` MISSING; `tblSearch` BookM/`MixSignTran` (T row: JoinCondition + F2EntryText) MISSING
  (a BookM/`MixSign` M+T pair exists, old); `VisheshMast.Vibhag` MISSING.
- **Size**: M

#### 2. Sampraday popup (`txtSampradayTran`) now live -> `BookSampradayT`

- **What changed**: the box existed in the old Designer but had no code. Now: F2 opens frmDisplayTransNew
  `TranName = "Sampraday"`, `FormName = "Prakashan"` (1304-1310), data from tblSearch BookM/`SampradayTran`. Save block
  (2157-2179), same change-detection rule as above:
  `INSERT INTO BookSampradayT(BookMastKt,SampradayKt,Seq,enuser,endate)` / `UPDATE BookSampradayT SET SampradayKt,Seq,moduser,moddate=GETDATE() WHERE BookSampradayKm=..` /
  `DELETE FROM BookSampradayT WHERE BookMastKt=.. AND BookSampradayKm NOT IN(..)`.
  Popup columns: `BookSampradayKm` (hidden), `SampradayKt` (hidden), `SampradayName`, `Seq`; cell list
  `SELECT ColumnMastkm,name FROM columnmaster where vibhag='BookSampraday' <search> order by name`.
  Tab order moved (TabIndex 79 -> 56, i.e. after Vibhag).
- **Kind**: new feature
- **Web today**: not ported — `BookMaster.tsx:699` `{ name: 'SampradayTran', ..., noF2: true }` (an inert box).
- **Web change needed**: make it a popup; save/prune `BookSampradayT`; load its text.
- **DB prerequisites**: `BookSampradayT` MISSING; tblSearch BookM/`SampradayTran` MISSING; `columnmaster` rows with
  `Vibhag='BookSampraday'` MISSING (0 rows).
- **Size**: M (S once item 1's pattern exists)

#### 3. Kruti Work popup (`txtKrutiWorkTran`) now live -> `BookKrutiWorkT`

- **What changed**: same pattern. F2: `TranName = "KrutiWork"`, `FormName = "Prakashan"` (1318-1324). Save (2205-2228):
  `INSERT INTO BookKrutiWorkT(BookMastKt,KrutiWorkKt,Seq,enuser,endate)` / `UPDATE ... WHERE BookKrutiWorkKm=..` /
  `DELETE FROM BookKrutiWorkT WHERE BookMastKt=.. AND BookKrutiWorkKm NOT IN(..)`. Popup columns `BookKrutiWorkKm`,
  `KrutiWorkKt` (hidden), `KrutiWorkName`, `Seq`; list `SELECT ColumnMastkm,name FROM columnmaster where vibhag='BookKrutiWork' <search> order by name`.
  TabIndex 78 -> 43 (after Bind Paper).
- **Kind**: new feature
- **Web today**: not ported — `BookMaster.tsx:690` `KrutiWorkTran` with `noF2: true`.
- **Web change needed**: as item 2.
- **DB prerequisites**: `BookKrutiWorkT` MISSING; tblSearch BookM/`KrutiWorkTran` MISSING; columnmaster `Vibhag='BookKrutiWork'` MISSING (0 rows).
- **Size**: S-M

Notes common to items 1-3: the three DataTables are reset in `ClearDataTable` (3076-3078). Delete was **not** extended:
the three new tables are not removed with the book (nor is `BookMagazineRemarkT` — the web already deletes more than the
desktop here, so add the three to the web's delete list). Copy has no handling for them either.

#### 4. "Short Name" -> "Prak Vishesh Name"

- **What changed**: `txtShortName` removed, `txtPrakVisheshName` added at the same place (465,405 w223); label `Label5`
  "Short Name" -> "Prak Vishesh Name". Save writes `PrakVisheshName=@PrakVisheshName` (`txtPrakVisheshName.Text.Trim`)
  and no longer writes `ShortName` (2027, 2043, 2115). F2 is the generic tblSearch lookup by box name (`PrakVisheshName`).
- **Kind**: behaviour change
- **Web today**: old way — `BookMaster.tsx:720` field `ShortName`; `book.ts:280,293,303,322` writes `BookM.ShortName`.
- **Web change needed**: rename field, label and column.
- **DB prerequisites**: `BookM.PrakVisheshName` MISSING (`BookM.ShortName nvarchar(200)` present); tblSearch
  BookM/`PrakVisheshName` MISSING (BookM/`ShortName` present: `select ShortName from bookm WHERE ISNULL(ShortName,'')<>'' group by ShortName ORDER BY ShortName`).
- **Size**: S

#### 5. Bhasha / Lipi rows: key no longer supplied

- **What changed**: `insert into praksnBhashaT(prakshnokt,bhashakt,seq) values(...)` (2128) and
  `insert into praksnLipiT(prakashankt,lippikt,Seq) values(...)` (2233); the `select isnull(max(...),0)+1` and the
  explicit key are gone. Same in `AnyaBhandarRepository.vb` (see there).
- **Kind**: behaviour change (schema: key must now be IDENTITY)
- **Web today**: old way — `book.ts:330` `nextKey(trx, 'praksnBhashaT', 'prakshnbhashakm')`, `book.ts:342` for
  `praksnLipiT`; `anya-bhandar.ts:392,397`.
- **Web change needed**: omit the key in those four inserts once the DB has identity keys (an explicit key then fails with
  "Cannot insert explicit value for identity column"). Must be switched together with the DB.
- **DB prerequisites**: `praksnBhashaT.prakshnbhashakm` and `praksnLipiT.prakshnlipikm` are NOT identity locally (is_identity = 0) -> schema change MISSING.
- **Size**: S

#### 6. Author text uses the full author-type name; `VisheshMast.Vibhag`

- **What changed**: `UpdateTxtAuthor` (498): `',' + AT.authtyattr` -> `',' + AT.authortype`; (519) `VisPad.remark='Avastha'`
  -> `VisPad.Vibhag='Avastha'`. Save's author text (2258): `select isnull(authtyattr,'') from authtype` ->
  `select isnull(authortype,'') from authtype`; (2272) `VisPad.remark='Avastha'` -> `VisPad.Vibhag='Avastha'`.
  Also Full Card Portrait (3981-3983: `VQ/VS/VG.remark` -> `.Vibhag`), Samvat Report In Range (4870), Transfer MixSign list (6858).
- **Kind**: behaviour change (stored `praksnAuthorT.txtAuth` / `BookM.txtAuthor` text changes: e.g. the type's full name instead of its attribute form)
- **Web today**: old way — `book.ts:99` (authtyattr), `book.ts:113` (`remark = 'Avastha'`), `book-actions.ts:81` and `:94`
  (`updateTxtAuthor`), `prakashak.ts:218,232` (the shared `authorText`), plus `remark = ...` lists at `book.ts:726,774,973,976,1002`, `book-tran.ts:290,306`, `anya-bhandar.ts:471,472`.
- **Web change needed**: switch `authtyattr` -> `authortype` in the text builders; switch `remark` -> `Vibhag` on
  VisheshMast wherever the desktop did (cross-cutting; coordinate with the other slices).
- **DB prerequisites**: `authtype.authortype` PRESENT; `VisheshMast.Vibhag` MISSING (only `remark` exists locally).
- **Size**: S here (M across the app)

#### 7. Operator filter is NULL-safe; new "Search Not In OB" checkbox

- **What changed**: `GetDataTable` (1603-1608, 1619-1624): operator condition is now
  `and ISNULL(txtBookTran,'') not like '%CM%' and ISNULL(txtBookTran,'') not like '%ms%' and ISNULL(txtBookTran,'') not like '%CP%' and ISNULL(txtBookTran,'') not like '%SN%'`
  (books with NULL `txtBookTran` are now visible to operators). New checkbox `chkSearchNotInOB` "Search Not In OB"
  (form top, right-anchored, 614,3, left of IsPrint): when checked adds `and ISNULL(txtBookTran,'') not like '%OB%'` to
  both the list and the single-record query; toggling it calls `FillList()` (6308).
  Quirk in `FillList` (1718-1720): the search control's condition is **assigned**, not appended
  (`stDispCond = " and ISNULL(txtBookTran,'') not like '%OB%'"`), so with the box checked an operator's CM/ms/CP/SN
  condition is dropped from `UcSearch1.LoadData` (and that operator string is still the old non-ISNULL form).
- **Kind**: bug fix + new feature
- **Web today**: old way — `book.ts:839-842` `operatorFilter` (no ISNULL), also `anya-bhandar.ts:464`; no checkbox
  (`BookMaster.tsx:598` has only the IsPrint toolbar checkbox).
- **Web change needed**: ISNULL in `operatorFilter`; add a second toolbar checkbox that adds the OB condition to list,
  search and record queries. Decide whether to reproduce the dropped-operator-condition quirk (suggest: no).
- **DB prerequisites**: none.
- **Size**: S-M

#### 8. Labels / captions

- **What changed**: "Pgs/TotPgs" -> "Pages/Total Pages"; "GMalaName/No" -> "GMala Name/No"; "Grp No/Name" ->
  "Group No/Name"; "Grp Pari Nm/Part" -> "Group Pari Name/Part"; "Bhasha/Lippi" -> "Bhasha/Lipi"; "Mix Sign/Rem" ->
  "Mix Sign/Remark"; "Short Name" -> "Prak Vishesh Name". Tab order renumbered to follow the screen (Kruti Work after
  Bind Paper, Part No after Print No, Sampraday after Vibhag, Subject (old) TabIndex 0). `ColBookkm` width 8 -> 5.
- **Kind**: UI/layout
- **Web today**: old captions in `BookMaster.tsx` label list.
- **Web change needed**: update captions and tab order.
- **DB prerequisites**: none. **Size**: S

#### 9. Validation, lock, work report on Save

- No change to the Save validation (`Please Enter BookName`, `Please Enter LibNo in BookT`, required-fields list), to
  the lock password, or to the `insertworkreports(TransactionName, PrimaryColumn, BookMastkm, curr_lnid, dtSel, dtTmpSel)`
  call. Only dead commented code was removed. **Web change needed**: none. (The work-report diff will include the new
  `SampradayTran` / `MixSignTran` / `KrutiWorkTran` / `PrakVisheshName` columns automatically if it is driven by tblSearch.)

---

### frmBookMasterNew.vb — derived values

#### 10. Info box (`GetSignFromLibNo`): mix signs come from `BookTranMixSignT`

- **What changed** (608-609): was `select isnull(stuff((select distinct ',' + Mixsign from BookT where Tid in(..) for XML PATH('')),1,1,''),'')`;
  now `SELECT ISNULL(STUFF((SELECT ',' + visheshMast.Vishesh from BookTranMixSignT INNER JOIN visheshMast on BookTranMixSignT.MixSignKt=visheshMast.Tid where BookTranMixSignT.BookTKt IN(..) for XML PATH('')),1,1,''),'')`
  (no DISTINCT any more); still wrapped as `{...}`.
- **Kind**: behaviour change
- **Web today**: old way — `book-actions.ts:1353-1359` (`signFromLibNo`, reads `BookT.Mixsign`).
- **Web change needed**: new query. **DB prerequisites**: `BookTranMixSignT` MISSING. **Size**: S

---

### frmBookMasterNew.vb — right-click menu (cntMenu)

#### 11. Visibility now through `ShowHideContextMenu(cntMenu, TransactionName)`

- **What changed** (`cntMenu_Opening`, 3666): the hard-coded rule (Admin / AMaster / user ids 22, 29, 54, 64, 127, 38, 44,
  134, 93, 129, 68, 1, 182 see Print and GR) is commented out. Replaced by the shared `ShowHideContextMenu`
  (`Updated/Library/CommonClass/MdlLib.vb:1646`, UTF-16): reads
  `SELECT C.ContextMenuName,CASE WHEN ISNULL(UC.IsVisible,0)=1 THEN 'y' ELSE 'n' END AS IsVisible from UserContextMenuPermission UC INNER JOIN ContextMenu C ON UC.ContextMenuKt=C.ContextMenuKm LEFT JOIN TransactionM T ON C.TransactionKt=T.TransactionKm WHERE UserKt=<user> AND (ISNULL(C.TransactionKt,0)=0 OR ISNULL(T.TransactionName,'')=N'BookM')`
  and, three levels deep, hides an item whose **caption** matches a row unless that row is visible. Items with no row keep
  their Designer visibility (so by default everything shows, including Print and GR for everyone).
  Still hard-coded before that call: Copy Subject only when Subject is filled. The admin-only items (report counter,
  Generate New Report No, Show Record of GSearchM, Samvat Report In Range) — I did not see their rule change in the diff.
  Only frmBookMasterNew calls it in this slice (frmBookTranNew and frmAnyaBhandar do not).
- **Kind**: behaviour change (permissions)
- **Web today**: old way — `BookMaster.tsx:909-913` `printVisible` with `PRINT_USER_IDS`. Note: many menu items are
  commented out in `BookMaster.tsx` today (WorkGiven/Selection/Catalog/Prakashan List/Granth Mala/Party Master, the
  For Current Record > Utility group, Common Group > Utility, several Utility items, the whole Filter submenu), although
  `docs/screens/book-master.md` says the menu is "ported item for item".
- **Web change needed**: a shared context-menu permission filter (server returns the user's ContextMenu rows for the
  screen; the client hides by caption), replacing `printVisible`. This is an engine feature shared with other slices.
- **DB prerequisites**: `ContextMenu` MISSING, `UserContextMenuPermission` MISSING, `TransactionM` PRESENT.
- **Size**: M (shared)

#### 12. New item: Parts Group > "Show Book of Current Group Parts" (Ctrl+P)

- **What changed** (6233-6258): if the current row's `PartGrpNo` > 0: reload **all** books (`TotRecords = 0`, i.e. without
  the newest-100 limit), then filter `GrpNo = <PartGrpNo>` and show.
- **Kind**: new feature
- **Web today**: not ported (Ctrl+G does the equivalent for the common group: `showCurrentCommonGroup`).
- **Web change needed**: add the item and the Ctrl+P shortcut, modelled on the common-group one. **DB**: none. **Size**: S

#### 13. New item: For Selected Record > Utility > "Add Sampraday"

- **What changed** (6260-6306): pick from `SELECT ColumnMastkm,Name FROM columnmaster where Vibhag='BookSampraday' ORDER BY Name`.
  For each selected book without that sampraday (`SELECT COUNT(*) FROM BookSampradayT WHERE BookMastKt=.. AND SampradayKt=..` = 0):
  `Seq = SELECT ISNULL(MAX(Seq),0)+1 FROM BookSampradayT WHERE BookMastKt=..`;
  `INSERT INTO BookSampradayT(BookMastKt,SampradayKt,enuser,endate,Seq) VALUES(..,..,<user>,GETDATE(),<Seq>)`; then a
  **work report per book**: `clsCom1.insertworkreports(TransactionName, PrimaryColumn, <book>, curr_lnid, dtT1, dtT2, "Modify")`
  where dtT1/dtT2 hold the comma-joined sampraday names before/after in a column `SampradayTran` (note the new 7th
  argument "Modify" — the mode is passed explicitly, no work-type prompt implied; confirm in CommonLibrary's slice).
  Messages: `Sampraday Added in (<n>) Records` / `Sampraday already added in selected records`.
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: new action + menu item + work-report entry.
- **DB prerequisites**: `BookSampradayT` MISSING; columnmaster `Vibhag='BookSampraday'` MISSING.
- **Size**: S-M

#### 14. "Update MixSign For Selected Record" rewritten

- **What changed** (3697-3722): list is now `select v.Tid,v.Vishesh,v.brief from visheshMast v where v.Vibhag='chkbx' order by v.Vishesh`
  (first column hidden, single pick). For each selected book, if `SELECT COUNT(*) FROM BookMixSignT WHERE BookMastKt=.. AND MixSignKt=..` = 0:
  `INSERT INTO BookMixSignT(BookMastKt,MixSignKt,enuser,endate) VALUES(..,..,<user>,GETDATE())` (no Seq). Message
  unchanged in form (`Mixsign Sucessfully updated in <n> Records  `, title `Mixsign Updated Sucessfully`) but `<n>` is now
  the number of rows inserted. Old: `update BookM set Mixsign = mixsign + ',' + '<name>' where Bookmastkm in (..)`.
- **Kind**: behaviour change
- **Web today**: old way in the API (`book-actions.ts:905-917` `update-mix-sign`, list `book.ts:973`); the menu item is
  commented out in `BookMaster.tsx:1291`.
- **Web change needed**: rewrite the action against `BookMixSignT` (pass the Tid, not the name).
- **DB prerequisites**: `BookMixSignT` MISSING; `VisheshMast.Vibhag` MISSING. **Size**: S

#### 15. "Transfer MixSign from BookT to BookM" is disabled

- **What changed**: Designer `TransferMixSignFromBookTToBookMToolStripMenuItem.Enabled = False`. (Its code still exists,
  only its list query changed to `Vibhag = 'CHKBX'`.)
- **Kind**: removed
- **Web today**: live — `BookMaster.tsx:1164` + `book-actions.ts:634-664` (`transfer-mix-sign`, rewrites the text columns).
- **Web change needed**: show the item disabled (and retire the action; it edits columns that are no longer used).
- **DB**: none. **Size**: S

#### 16. "Update Book Akaradi Seq" -> "Update Kruti Seq", different procedure

- **What changed** (6115-6138): caption "Update Kruti Seq". Asks for a sampraday
  (`SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag ='KrutiSampraday' ORDER BY Name`); if one is picked runs
  `EXEC PrintKrutiPrakashakReport @SampradayKt`. Old: `exec UpdateBookKrutiAkaradiSeq` with no prompt.
- **Kind**: behaviour change
- **Web today**: old way — `BookMaster.tsx:1333` 'Update Book Akaradi Seq' -> `book-actions.ts:1034` `EXEC UpdateBookKrutiAkaradiSeq`.
- **Web change needed**: rename, add the pick, call the other procedure.
- **DB prerequisites**: proc `PrintKrutiPrakashakReport(@SampradayKt int)` PRESENT; columnmaster `Vibhag='KrutiSampraday'` PRESENT (30 rows).
- **Size**: S

#### 17. "Show BookM Record having no Record in RefLibNo": by key, to Excel

- **What changed** (3627-3645): query now
  `select distinct BookMastkm,BookName from BookM inner join BookT on BookM.BookMastkm=BookT.BookMastkt where tid not in(select BookTKt from krutireflibno)`
  (was `LibNo not in(select RefLibNo from krutireflibno)`); result goes to Send-to-Excel instead of a popup; empty -> `No Records Found`.
- **Kind**: bug fix / behaviour change
- **Web today**: old query — `book-actions.ts:612-619` (`no-ref-libno`, already an Excel-style result); menu item commented out (`BookMaster.tsx:1141`).
- **Web change needed**: new WHERE (guard NULL `BookTKt`, as the web already does for RefLibNo) + the empty message.
- **DB prerequisites**: `krutireflibno.BookTKt` PRESENT. **Size**: S

#### 18. Common Group lists now query the whole table

- **What changed**:
  - "Show All Book of Common Group" (6661-6688): reloads all books (`TotRecords = 0`), keeps rows with numeric
    `CommonGrpNo > 0`, **sorted by CommonGrpNo**. Old: filtered only the rows already loaded (newest 100).
    (`CopyToDataTable` throws when no row qualifies -> a MsgBox with the framework's message.)
  - Common Group > Utility > "Show Common Group Having Single Record" (3516-3535): now a server query with
    `WhereCondition = " AND BookMastKm IN(select BookMastkm from BookM WHERE CommonGrpNo IN(SELECT CommonGrpNo from BookM WHERE (CommonGrpNo >0) GROUP BY CommonGrpNo HAVING COUNT(CommonGrpNo)=1))"`
    through `GetDataTable` (so still limited to the newest N of the matches, and subject to the operator / OB filters). Old: RowFilter on the loaded rows.
- **Kind**: bug fix
- **Web today**: old way — `BookMaster.tsx:1095-1097` filters `state.rows`; `common-single` (`book-actions.ts:595`) returns ids that the (commented-out) item intersects with `state.rows`.
- **Web change needed**: both should fetch from the server (ids -> load rows), the first ordered by CommonGrpNo.
- **DB**: none. **Size**: S-M

#### 19. New item: Utility > "Import Data From Excel"

- **What changed** (6175-6231): file dialog; reads the first sheet via ACE OLEDB (`Excel 12.0 Xml;HDR=YES;IMEX=1`),
  drops columns named F1/F2/F3, then `ImportBookMRecordsFromExcel` (stored procedure) with a table-valued parameter
  `BookMImport` (the sheet) and `UserKt`; then `Data Imported Successfully` and the list reloads. The column mapping is
  inside the procedure (the `Ind*` variables in the form are unused).
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: an upload + call of the procedure. Cannot be specified until the procedure and its table type exist to read.
- **DB prerequisites**: proc `ImportBookMRecordsFromExcel` MISSING; its table type MISSING (only type `CompareExcel` exists).
- **Size**: M-L (blocked)

#### 20. File-share items (web has deferred files/images)

- **What changed**: paths come from table `GeneralConfig` (`SELECT ConfigValue FROM GeneralConfig WHERE ConfigName=@ConfigName`;
  names `ScanPath`, `EBookPath`, `TitlePath`, `GraphicsPath`, `MainRoot`, ...) instead of `scanpath.txt` next to the EXE —
  in View Image (693-705), Check For Image (~5663), ScanData Folder Info (6347, was the literal `\\192.168.0.210\ScanData`).
  New item For Selected Record > Utility > "Copy EB/SN to TempGr" (619-682, 6312): copies the selected books' scan folders
  and e-book files to `c:\tempgr\<user id>` on the PC after emptying it; messages `Total {0} Files And {1} Directories Copied to TempGr` / `No Files Copied to TempGr`.
  No DB writes in any of these.
- **Kind**: refactor (config source) + new feature (client-side file copy)
- **Web today**: not ported (`notOnWeb(...)` for SN/EB/GR; TIT, Check For Image and ScanData Folder Info commented out).
- **Web change needed**: none now. If files are ever served, read the roots from `GeneralConfig`. "Copy EB/SN to TempGr" has no web meaning (it writes to the user's C: drive) -> `notOnWeb`.
- **DB prerequisites**: `GeneralConfig` MISSING. **Size**: S (a `notOnWeb` entry)

#### 21. Other menu details

- "Inword Master" caption -> "Inward Master" (web `BookMaster.tsx:966` says 'Inword Master'). S.
- Refactor only: dead code removed in ShowReportTable, FindMismatchOfLibNo, AddInNew (common group), TransferMixSign, work-report block, Samvat report.

---

### frmBookTranNew.vb / .designer.vb (Library No)

#### 22. Mix Sign box -> popup on `BookTranMixSignT`

- **What changed**: `TxtMixsign` removed, `txtMixSignTran` at the same place (533,41 w117). F2: frmDisplayTransNew
  `TranName = "MixSign"`, `FormName = "BookT"` (`Updated/Library/Library/frmBookTranNew.vb` 379-385), rows from tblSearch
  BookT/`MixSignTran`; after Save the box text = the rows' `MixSignName` joined (409-414). `BookT.Mixsign` is no longer
  written (INSERT/UPDATE 654-670). Save (754-776), when the popup was loaded:
  `INSERT INTO BookTranMixSignT(BookTKt,MixSignKt,Seq,enuser,endate) VALUES (<tid>,..,..,<user>,GETDATE())` (key <= 0) /
  `UPDATE BookTranMixSignT SET MixSignKt=..,Seq=..,moduser=..,moddate=GETDATE() WHERE BookTranMixSignKm=..` /
  `DELETE FROM BookTranMixSignT WHERE BookTKt=<tid> AND BookTranMixSignKm NOT IN(<kept>)`.
  Quirk: with the popup loaded and zero rows, `TmpId.Substring(1)` throws on an empty string -> the whole save fails (MsgBox). Web: just delete all.
  Grid column "Mix Sign" binds `MixSignTran` (506, 588, 616, 955). Popup columns `BookTranMixSignKm` (hidden), `MixSignKt` (hidden), `MixSignName`, `Seq`; same CHKBX list as item 1 (`VisheshNo in (1,3)`; the old BookT list was `in (2,3)`).
- **Kind**: behaviour change (data model)
- **Web today**: old way — `BookTranDialog.tsx:112` field `Mixsign` (`addMore: { append: true }`), `:138` grid field `Mixsign`; `book-tran.ts:82,102-115` writes `BookT.Mixsign`.
- **Web change needed**: popup like the Mark popup (`BookTranMarkT`, book-tran.ts ~150-160); stop writing `Mixsign`; grid column from `MixSignTran`.
- **DB prerequisites**: `BookTranMixSignT` MISSING; tblSearch BookT/`MixSignTran` MISSING (BookT/`Mixsign` M row present).
- **Size**: M

#### 23. New Condition popup -> `BookTranConditionT`

- **What changed**: new box `txtConditionTran` (193,149 w51) beside Prapti, whose box shrank to w51 (was 103); label
  "Prapti" -> "Prapti/Condition". F2: `TranName = "Condition"`, `FormName = "BookT"` (386-392); box text = rows'
  `Condition` joined (415-420). Save (778-843):
  `INSERT INTO BookTranConditionT(BookTKt,ConditionKt,CheckedByKt,DoneByKt,Remark,Seq,enuser,endate[,CheckedDate][,DoneDate])`,
  or `UPDATE BookTranConditionT SET ConditionKt,CheckedByKt,DoneByKt,Remark,Seq,moduser,moddate=GETDATE()[,CheckedDate][,DoneDate] WHERE BookTranConditionKm=..`
  (dates typed dd/MM/yyyy, swapped to MM/dd/yyyy; a blank date is left out, so an update never clears one), then
  `DELETE FROM BookTranConditionT WHERE BookTKt=<tid> AND BookTranConditionKm NOT IN(<kept>)` (same empty-list throw as item 22).
  Popup columns: `BookTranConditionKm`, `ConditionKt`, `CheckedByKt`, `DoneByKt` (hidden), `Condition`, `CheckedBy`,
  `CheckedDate`, `DoneBy`, `DoneDate`, `Remark` (typed), `Seq`. Lists: Condition
  `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='BookTranCondition' ORDER BY Name`; CheckedBy / DoneBy
  `SELECT tid,uname AS CheckedBy FROM Usecurity ORDER BY uname`; dates by InputBox
  `Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)` defaulting to today.
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: new box + popup + save.
- **DB prerequisites**: `BookTranConditionT` MISSING; tblSearch BookT/`ConditionTran` MISSING; columnmaster `Vibhag='BookTranCondition'` MISSING (0 rows).
- **Size**: M

#### 24. Delete: Book Confirmation and Lab Issue count only while open

- **What changed** (1062-1066): in-use checks are now
  `SELECT COUNT(*) FROM BookConfirmation WHERE BookTKt='<tid>' AND BookConfirmationStatus='Sent'` and
  `SELECT COUNT(*) FROM LabIssueM WHERE BookTKt='<tid>' AND Statuskt NOT IN(SELECT ColumnMastkm FROM columnmaster WHERE Vibhag='LabIssueStatus' AND Name in('Closed','CancelReq'))`.
  Transfer (1268-1272) now moves the complement only:
  `UPDATE BookConfirmation SET BookTKt=<to> where BookTKt=<tid> AND BookConfirmationStatus<>'Sent'` and
  `UPDATE LabIssueM SET BookTKt=<to> where BookTKt=<tid> AND Statuskt IN(SELECT ColumnMastkm FROM columnmaster WHERE Vibhag='LabIssueStatus' AND Name in('Closed','CancelReq'))`.
  Consequence as written: when the number is in use for another reason and the user confirms the transfer, a 'Sent'
  confirmation or an open lab issue keeps pointing at the deleted row (the dialog listed it as in use, but it is not moved).
- **Kind**: behaviour change
- **Web today**: old way — `book-tran.ts:172-173` (`IN_USE`, plain counts) and `:215-216` (`TRANSFER`, unconditional).
- **Web change needed**: conditions on those two entries in both lists. Ask about the orphan consequence (open question 6).
- **DB prerequisites**: `BookConfirmation.BookConfirmationStatus` PRESENT; columnmaster `LabIssueStatus` PRESENT (4 rows).
- **Size**: S

#### 25. Menu

- **What changed**: new top-level submenu "Utility" with four items that scan the scan / e-book shares and compare with
  `BookTranMixSignT` (1867-2021): "Update SN Not Exist In MixSign But Exist In Path" and "Update EB Not Exist In MixSign
  But Exist In Path" (list, then Yes = Excel / No = `INSERT INTO BookTranMixSignT(BookTKt,MixSignKt,Seq,enuser,endate) SELECT BookT.tid,<SN or EB Tid>,1,<user>,GETDATE() FROM BookT INNER JOIN TranIds ...`,
  message `Records Added Successfully`), "Update SN Exist In MixSign But Not Exist In Path" and a second item also
  captioned "Update EB Not Exist In MixSign But Exist In Path" (both only export a list to Excel, despite "Update").
  For Current Record > Utility > "Update Mix Sign" is now `Enabled = False`. "Inword Master" -> "Inward Master";
  label "Inword" -> "Inward". Update Mark's list uses `Vibhag = 'MARK'` (1787). No `ShowHideContextMenu` here.
- **Kind**: new feature (file-share dependent) / removed / UI
- **Web today**: Update Mix Sign "not built yet; they say so"; no Utility submenu; captions old (`BookTranDialog.tsx:91` 'Inword').
- **Web change needed**: captions; show Update Mix Sign disabled; the four Utility items need the office shares -> `notOnWeb`; `remark = 'MARK'` -> `Vibhag` (`book-tran.ts:290,306`).
- **DB prerequisites**: `TranIds` PRESENT; `GeneralConfig` MISSING; VisheshMast rows `CHKBX`/`SN` (Tid 2134) and `EB` (Tid 1563) PRESENT (under `remark`).
- **Size**: S

#### 26. Row load order — refactor only

- `FillData(False)` now runs before the row is read and the boxes filled (158-166), and `ClearDataTable` also resets `dtSel` (942-944): fixes boxes being cleared after the fill. No web change (the web loads the row in one step). The Check-For-Image path lookup uses `GeneralConfig` (1592-1608).

### frmBookMSData.designer.vb

- **What changed**: label "Pankti Aksr" -> "Pankti Akshar" and a few boxes/labels nudged by 3-14 px. No control added or removed; `.vb` identical.
- **Kind**: UI/layout. **Web today**: `BookMSDataDialog.tsx` old caption. **Web change needed**: caption (positions optional). **DB**: none. **Size**: S

### frmViewJpg.vb (image viewer)

- **What changed**: the share roots come from `GeneralConfig` (`MainRoot`, `ScanPath`, `EBookPath`, `TitlePath`,
  `GraphicsPath`) instead of the global `MainRoot` and `scanpath.txt`; a "GR" type is handled; ~300 lines of
  commented-out old code deleted. It still only opens the file with the PC's default program.
- **Non-image behaviour**: none changed — no counters, no DB writes in either version.
- **Kind**: refactor. **Web today**: not ported (deferred). **Web change needed**: none. **DB**: `GeneralConfig` MISSING. **Size**: —

### FormPrakashanList.vb

- **What changed**: `ISNULL(dbo.authtype.authtyattr,'') AS authortype` -> `ISNULL(dbo.authtype.authortype,'') AS authortype`
  in four author-type queries; `VIsheshmast where remark = 'City'` / `'GMALA'` -> `Vibhag = ...` in the two F2 lists;
  dead commented code removed. The `BookTKt` / `Bt.LibNo` joins were already there.
- **Kind**: behaviour change (displayed author-type text) + the Vibhag rename
- **Web today**: no screen of its own in my slice's file list (Book Master's "Prakashan List Anya Bhandar" item is commented out; it opens screen id `book-master-anya-bhandar`). I did not locate or analyse that screen's files.
- **Web change needed**: if that screen is ported, the same two substitutions. **DB**: `VisheshMast.Vibhag` MISSING. **Size**: S

### frmAnyaBhandar.vb + AnyaBhandarRepository.vb

#### 27. Book Name F2 list gains "SamvatType"

- **What changed** (`Updated/Library/Library/frmAnyaBhandar.vb:601`):
  `select distinct BookMastkm,BookName,Part,txtPrakashak AS Prakashak,txtAuthor AS Author,samvmast.samvatname AS SamvatType,PSamvat AS Samvat,txtBhasha AS Bhasha,Pages,TotalPages,txtBookTran AS LibNo from BookM LEFT JOIN samvmast ON BookM.PSamvatcokt=samvmast.samvatcokm where isnull(BookName,'')<>'' order by BookName`,
  opened with `boolSelectFirst:=True`.
- **Kind**: UI. **Web today**: old list — `anya-bhandar.ts:693-694`. **Web change needed**: add the column + join. **DB**: none. **Size**: S

#### 28. Fill-from-book: author filter is now per author, type name is the full name

- **What changed** (636-638): `dtAuthor` and `dtAuthorAuth` exclude **authors** having one of the five types
  (`praksnauthorkm not in (select praksnauthorkt from PraksnAuthorAuthTypeT ... authortype in(N'मूळकर्ता',N'टीकाकार',N'अनुवादक',N'विवेचक',N'लेखक'))`;
  `praksnauthorkt not in (...)` for the names) instead of dropping every author of a **book** that has any such type
  (`prakashannokt not in (...)`). Type text uses `authtype.authortype` instead of `authtyattr` (dtAuthor and dtAuthorAuthType).
- **Kind**: bug fix
- **Web today**: old way, kept on purpose — `docs/screens/anya-bhandar.md` decision 3 ("keeps the desktop's per-book author filter"); `anya-bhandar.ts:490,532` use `authtyattr`, the `DONE_BY_BOOK_TYPES` filter is per book.
- **Web change needed**: per-author filter; `authortype`; update decision 3 in the note.
- **DB**: none. **Size**: S

#### 29. Fill-from-book: Kruti authors also from the book's common group

- **What changed** (685-689): `WHERE BookTKt In (Select Tid from BookT where BookMastkt = <book>)` plus, when the book's
  `CommonGrpNo` > 0, `OR BookTKt In (Select Tid from BookT INNER JOIN BookM ON BookT.BookMastkt=BookM.BookMastkm where CommonGrpNo=<no>)`.
  Old: the book's own numbers only (the `IsCommonGroup` 1/0 pair was a no-op).
- **Kind**: behaviour change
- **Web today**: old way — `anya-bhandar.ts:583-587` (`... AND krutireflibno.IsCommonGroup IN (0, 1)`).
- **Web change needed**: add the common-group branch. **DB**: none. **Size**: S

#### 30. Repository: author text and book child keys

- **What changed** (`Updated/Library.BusinessContract/Concrete/AnyaBhandarRepository.vb`): (69) `isnull(authtyattr,'')` ->
  `isnull(authortype,'')`; (83) `VisPad.remark='Avastha'` -> `VisPad.Vibhag='Avastha'`; AddBook's
  `insert into praksnBhashaT(prakshnokt,bhashakt,seq)` (316) and `insert into praksnLipiT(prakashankt,lippikt,seq)` (350) without the key.
- **Kind**: behaviour change. **Web today**: old way — `prakashak.ts:218,232` (`authorText`), `anya-bhandar.ts:392,397`.
- **Web change needed**: covered by items 5 and 6. **DB**: as items 5, 6. **Size**: S

#### 31. Work Report button no longer disabled at load

- **What changed** (146): `'btnWorkReport.Enabled = False` commented out (Copy is still disabled at load).
- **Kind**: bug fix. **Web today**: already the new way (`MasterToolbar.tsx:195` keeps Work Report enabled on purpose). **Web change needed**: none (drop the "deliberate difference" wording). **Size**: —
- Refactor only: a duplicated `Bhasha` DataPropertyName line removed (1044).

### LabIssueMRepository.vb

#### 32. `GetUserNotReturnedBook` always returns ""

- **What changed** (331-343): the whole body is commented out ("Start Temporary Comment Suggested by Vishalbhai"), so the
  message `You Cannot Issue any Books` / `Please Return<n>  Nos. of 30 days Old Due Books to Issue New Books.` never appears.
- **Kind**: removed (marked temporary)
- **Web today**: old way — `lab-issue-common.ts:67-85` `userNotReturnedBook`, called from `lab-issue.ts:117`, `:221` and `lab-issue-common.ts:119` (the request-for-lab-issue path Book Tran uses).
- **Web change needed**: make the check return '' (keep the code behind a flag, since the desktop calls it temporary).
- **DB**: none. **Size**: S

---

## Calls to frmDisplayTransNew that changed (the form itself is another slice)

| Caller                                     | New call                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frmBookMasterNew `Txt_KeyDown` (1304-1324) | `TranName = "Sampraday"`, `"MixSign"`, `"KrutiWork"`, all with `FormName = "Prakashan"`, `dtDisp` = the box's table; result copied back at 1380-1385 and the box text rebuilt by the existing generic loop |
| frmBookTranNew (379-392)                   | `TranName = "MixSign"` and `"Condition"`, `FormName = "BookT"`; texts rebuilt from `MixSignName` / `Condition` (409-420)                                                                                   |
| frmAnyaBhandar                             | no change (2 uses in both versions)                                                                                                                                                                        |

No existing call changed its arguments.

## (1) DB objects this slice needs

| Object                                                                                                                                                            | Local DB              | Columns as far as the code shows                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BookSampradayT`                                                                                                                                                  | MISSING               | `BookSampradayKm` int IDENTITY (read back with `@@identity`), `BookMastKt` int, `SampradayKt` int (columnmaster), `Seq` int, `enuser` int, `endate` datetime (GETDATE()), `moduser` int, `moddate` datetime                                                                        |
| `BookMixSignT`                                                                                                                                                    | MISSING               | `BookMixSignKm` int IDENTITY, `BookMastKt` int, `MixSignKt` int (VisheshMast.Tid), `Seq` int (NULL allowed: item 14 inserts without it), `enuser`, `endate`, `moduser`, `moddate`                                                                                                  |
| `BookKrutiWorkT`                                                                                                                                                  | MISSING               | `BookKrutiWorkKm` int IDENTITY, `BookMastKt` int, `KrutiWorkKt` int (columnmaster), `Seq` int, `enuser`, `endate`, `moduser`, `moddate`                                                                                                                                            |
| `BookTranMixSignT`                                                                                                                                                | MISSING               | `BookTranMixSignKm` int IDENTITY, `BookTKt` int, `MixSignKt` int, `Seq` int, `enuser`, `endate`, `moduser`, `moddate`                                                                                                                                                              |
| `BookTranConditionT`                                                                                                                                              | MISSING               | `BookTranConditionKm` int IDENTITY, `BookTKt` int, `ConditionKt` int (columnmaster), `CheckedByKt` int (Usecurity.tid), `CheckedDate` date/datetime NULL, `DoneByKt` int, `DoneDate` date/datetime NULL, `Remark` nvarchar(?), `Seq` int, `enuser`, `endate`, `moduser`, `moddate` |
| `BookM.PrakVisheshName`                                                                                                                                           | MISSING               | nvarchar, length unknown (`ShortName` is nvarchar(200))                                                                                                                                                                                                                            |
| `BookM.MixSign`, `BookT.Mixsign`                                                                                                                                  | PRESENT               | no longer written; must accept NULL/default on INSERT                                                                                                                                                                                                                              |
| `VisheshMast.Vibhag`                                                                                                                                              | MISSING               | replaces (or duplicates?) `remark` nvarchar(50)                                                                                                                                                                                                                                    |
| `authtype.authortype`                                                                                                                                             | PRESENT               | nvarchar(100)                                                                                                                                                                                                                                                                      |
| `praksnBhashaT.prakshnbhashakm`, `praksnLipiT.prakshnlipikm` as IDENTITY                                                                                          | MISSING (plain int)   |                                                                                                                                                                                                                                                                                    |
| `ContextMenu`                                                                                                                                                     | MISSING               | `ContextMenuKm`, `ContextMenuName`, `TransactionKt` (from the SELECT only)                                                                                                                                                                                                         |
| `UserContextMenuPermission`                                                                                                                                       | MISSING               | `UserKt`, `ContextMenuKt`, `IsVisible` (from the SELECT only)                                                                                                                                                                                                                      |
| `TransactionM`                                                                                                                                                    | PRESENT               |                                                                                                                                                                                                                                                                                    |
| `GeneralConfig`                                                                                                                                                   | MISSING               | `ConfigName`, `ConfigValue`                                                                                                                                                                                                                                                        |
| `TranIds`                                                                                                                                                         | PRESENT               | `Id` identity, `TranId1..3`                                                                                                                                                                                                                                                        |
| proc `PrintKrutiPrakashakReport(@SampradayKt int)`                                                                                                                | PRESENT               |                                                                                                                                                                                                                                                                                    |
| proc `ImportBookMRecordsFromExcel(@BookMImport <table type>, @UserKt)`                                                                                            | MISSING               | table type unknown (only `CompareExcel` exists)                                                                                                                                                                                                                                    |
| tblSearch BookM: `SampradayTran`, `MixSignTran`, `KrutiWorkTran` (Type T: JoinCondition for the box text + F2EntryText for the popup rows), `PrakVisheshName` (M) | MISSING               | F2EntryText must return the popup columns listed in items 1-3                                                                                                                                                                                                                      |
| tblSearch BookT: `MixSignTran`, `ConditionTran` (T)                                                                                                               | MISSING               | columns as in items 22-23                                                                                                                                                                                                                                                          |
| columnmaster `Vibhag` = `BookSampraday`, `BookKrutiWork`, `BookTranCondition`                                                                                     | MISSING (0 rows each) |                                                                                                                                                                                                                                                                                    |
| columnmaster `Vibhag` = `KrutiSampraday` (30), `LabIssueStatus` (4)                                                                                               | PRESENT               |                                                                                                                                                                                                                                                                                    |
| `krutireflibno.BookTKt`, `BookConfirmation.BookConfirmationStatus`, `praksnlistAnyaBndrM.BookTKt`                                                                 | PRESENT               |                                                                                                                                                                                                                                                                                    |

## (2) Open questions for the user

1. **Updated database.** Almost everything here needs objects the local restore lacks. Can we get a current backup (or the
   upgrade script)? In particular the five new tables' exact definitions, the six new `tblSearch` rows (their
   JoinCondition / F2EntryText SQL is not in the source), `ContextMenu` / `UserContextMenuPermission` / `GeneralConfig`
   contents, and `ImportBookMRecordsFromExcel`.
2. **Old Mix Sign data.** Was the text in `BookM.MixSign` / `BookT.Mixsign` migrated into `BookMixSignT` /
   `BookTranMixSignT`, and are the old columns kept? (Decides whether the web may still show the old text anywhere.)
3. **`VisheshMast.remark` vs `Vibhag`**: renamed, or a new column beside `remark`? The web has `remark = '...'` in many screens.
4. **Cut-over.** While some PCs still run v3.3.3.6 against the same DB the two versions disagree (key assignment for
   `praksnBhashaT` / `praksnLipiT`, Mix Sign storage). Will all desktops be upgraded at once, and should the web switch on the same day?
5. **Menu items commented out in the web's Book Master** (`BookMaster.tsx`): intentional trimming, or to be restored and
   governed by the new ContextMenu permissions? And with no ContextMenu rows for a user, the desktop now shows Print and
   GR to everyone — is that the intended default for the web too?
6. **Library No delete** (item 24): after a confirmed transfer, a 'Sent' book confirmation or an open lab issue is left
   pointing at the deleted number. Reproduce, or block the delete while such rows exist?
7. **Lab issue 30-day block** (item 32) is commented out as "temporary". Remove it on the web too, or keep it switchable?
8. **"Search Not In OB"** (item 7): on the desktop, ticking it drops an operator's CM/ms/CP/SN restriction from the
   search box's condition. Assume that is a slip and keep both conditions on the web?
9. **Import Data From Excel** and the four share-scanning Library No utilities: wanted on the web at all?
10. **Short Name**: is the old `ShortName` data to be shown anywhere, or simply abandoned in favour of Prak Vishesh Name?

## Not determined

- The SQL of the new `tblSearch` rows (not in source, not in the local DB).
- Whether `insertworkreports`' new 7th argument (`"Modify"`) changes prompting — it lives in `CommonLibrary` (another slice).
- The web files of the "Prakashan List Anya Bhandar" screen (FormPrakashanList) were not looked up.
- I did not re-verify the admin-only menu rules line by line beyond the diff (the diff shows no change to them).
