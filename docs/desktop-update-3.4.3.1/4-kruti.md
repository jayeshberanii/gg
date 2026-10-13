# Slice 4 — Kruti Master (+ Hastprat, HastpratLibNoTran, Vyakhyan)

Paths: `Updated/` = `GGLibrarySolutionUpdated/`, web = `gglib-web/`. `K.vb` = `Updated/Library/Library/frmKrutiMasterNew.vb`.

Scope facts established first:

- There is **no Kruti / Hastprat / Vyakhyan repository or entity** in either tree (`Library.BusinessContract/Concrete/*Kruti*`, `Library.Entity/EntKruti*` do not exist; the forms run their own SQL). Nothing to diff there.
- **Kruti's calls to `frmDisplayTransNew` are unchanged**: 6 references in both versions and no diff hunk touches any of them (`SetForm_*`, `TranName`, `FormName`, the `dtDisp` queries are identical). Nothing to report for the other person.
- `frmKrutiMasterNew.resx` differs only by the new `AdminLockToolStrip.BackgroundImage` (a JPEG strip) + tray location.
- Save's field list and save mapping are **unchanged** (the INSERT/UPDATE of `krutiMst` are byte-identical; only commented-out code was removed). No new panel fields, no changed validation, no changed F2 SQL on the panel, no tree change, no change to Ctrl+L/Ctrl+U locking, no change to the Save work report.

Four cross-cutting DB changes surfaced in this slice and affect far more than Kruti — see "Cross-cutting" at the end. They are the most important findings here.

---

### frmKrutiMasterNew — grid columns

- **What changed**: enum `GVKruti` (`K.vb:36-60`) drops `SAuthor` and adds `Sampraday`, `Remark` at the end. Designer: column `colKarta2` ("कर्ता2", width 250) removed; `colSampraday` (HeaderText `Sampraday`, width 200) and `colRemark` (HeaderText `Remark`, default width 100) added after `PNo`. Bound in FillList to `dtMain("SampradayTran")` and `dtMain("Remark")` (`K.vb:1855`, `1872`). After a save, `RefreshCurrentGridRecord` puts `txtSampradayTran.Text.Trim` and `remark` in the row (`K.vb:2901` adds `'' AS SampradayTran`, `2923`, `3009`, `3024`).
- **Kind**: UI/layout (behaviour: the Remark cell is also the source for "Append Remark", below).
- **Web today**: `apps/web/src/screens/KrutiMaster.tsx:749-771` — old way: last column is `{ header: 'कर्ता2', field: 'SAuthor', width: 250 }`, no Sampraday / Remark.
- **Web change needed**: replace the `SAuthor` column with `{ header: 'Sampraday', field: 'SampradayTran', width: 200 }` and add `{ header: 'Remark', field: 'remark', width: 100 }`. Check the list rows really carry both (they should: both are tblSearch columns of `KrutiMst`).
- **DB prerequisites**: tblSearch `KrutiMst`/`SampradayTran` (Id 722, type T with JoinCondition) PRESENT; tblSearch `KrutiMst`/`remark` (Id 701, type M) PRESENT; `KrutiSampradayT` PRESENT. **Correction (Kruti batch):** both rows have `DisplayInGrid` NULL locally, so the list query does not carry them (the upgraded data must flag them, or the updated desktop's FillList would fail on `dtMain.Columns("SampradayTran")`). The web adds them itself (`gridColumnsAlso`), see `docs/screens/kruti-master.md`.
- **Size**: S

### frmKrutiMasterNew — right-click menu filtered by ContextMenu permissions; Print Report no longer limited by user id

- **What changed**: `cntMenu_Opening` (`K.vb:5840-5852`) no longer contains the rule "Print Report only for Admin / AMaster / user ids 22, 29, 54, 64, 38, 182". It now calls `ShowHideContextMenu(cntMenu, TransactionName)` (new, `Updated/Library/CommonClass/MdlLib.vb:1646`), then shows `Replace Records` only when `IsAdminLogin Or curr_utypeid = AMaster`.
  `ShowHideContextMenu` runs
  `SELECT C.ContextMenuName,CASE WHEN ISNULL(UC.IsVisible,0)=1 THEN 'y' ELSE 'n' END AS IsVisible from UserContextMenuPermission UC INNER JOIN ContextMenu C ON UC.ContextMenuKt=C.ContextMenuKm LEFT JOIN TransactionM T ON C.TransactionKt=T.TransactionKm WHERE UserKt=<curr_lnid> AND (ISNULL(C.TransactionKt,0)=0 OR ISNULL(T.TransactionName,'')=N'KrutiMst')`
  and walks the menu **three levels deep** (top items, their drop-downs, and those items' drop-downs; deeper levels are not looked at). An item is matched by its **caption text** (`ContextMenuName = item.Text`, exact, including trailing spaces such as `"Print Report "`). If a row exists for this user the item becomes hidden unless `IsVisible = 1`; an item with **no row for the user is left as it is** (visible). So Print Report is now visible to everybody unless a permission row hides it.
  Only Kruti and Book Master call `ShowHideContextMenu` in the updated app.
- **Kind**: behaviour change (permission mechanism replaces hard-coded user ids)
- **Web today**: `KrutiMaster.tsx:835` `PRINT_USER_IDS = [22, 29, 54, 64, 38, 182]` and `printVisible` (`:997-1001`) — old way. No ContextMenu permission mechanism anywhere in the web for this screen.
- **Web change needed**: drop `PRINT_USER_IDS`/`printVisible`; add a shared "context menu permissions for (user, TransactionName)" lookup (API, by the query above) and apply it to the Kruti menu by label, three levels deep; add the `Replace Records` admin/AMaster rule after it. The shared helper is presumably owned by whoever has MdlLib / Book Master — it should be built once. Server side, the actions behind hidden items should refuse too (the desktop only hides).
- **DB prerequisites**: `ContextMenu` MISSING; `UserContextMenuPermission` MISSING; `TransactionM` PRESENT (has `TransactionKm, TransactionName, FormName, PrimaryColumnName`; row 27 = `KrutiMst`).
- **Size**: M (S for Kruti once the shared helper exists)

### frmKrutiMasterNew — Lock / Unlock By Admin moved from the menu to two panel buttons, AMaster only, password asked once

- **What changed**:
  - Menu items `Lock By Admin` / `Unlock By Admin` (were under Show For Selected Kruti › Utility, visible to `IsAdminLogin Or AMaster`) are **removed**.
  - New `AdminLockToolStrip` inside the panel (`SplitContainer1.Panel1`) at `Location (668, 304)`, size 64x25, `BackColor Red` with a background image, holding `btnAdminLock` (image `Resources.lock`, tooltip `Lock By Admin`), a separator, `btnAdminUnlock` (image `Resources.lock_open`, text `Unlock By Admin`). Form_Load: `AdminLockToolStrip.Visible = (curr_utypeid = EnumUserType.AMaster)` (`K.vb:158-162`) — **Admin users who are not AMaster no longer get it**.
  - `LockByAdmin` (`K.vb:5391-5445`): first asks `"Are You Sure To Lock Selected Records?"` / `"Are You Sure To Unlock Selected Records?"` (Yes/No); then the password `alpesh@kruti` **only while `boolAskForAdminLockPassword` is True** — it is set False after the first successful run, so the password is asked once per opened form. The update, the `Lock` work report per changed row and the messages `"(n ) Records Locked Successfully"` / `"(n ) Records UnLocked Successfully"` are unchanged.
- **Kind**: behaviour change + UI/layout
- **Web today**: `KrutiMaster.tsx:1082-1091` — the two menu items for `user.isAdmin || AMaster`, password asked every time, no confirmation; API `kruti-actions.ts:284` `'lock-by-admin'` checks `KRUTI_LOCK_PASSWORD` on every call.
- **Web change needed**: remove the two menu items; add the two buttons to the panel at the desktop position for AMaster only; ask the confirmation first; ask the password only the first time per window. The API should keep verifying the password on each call (the web can remember the entered password for the window and resend it) and should restrict the action to AMaster.
- **DB prerequisites**: `krutiMst.LockedByAdmin` — already used by the web; nothing new.
- **Size**: S–M (a panel-level toolbar is new for this screen; lock/lock_open icons must be extracted from `Resources`)

### frmKrutiMasterNew — Delete: Tirth Raksha use check, all reasons in one message

- **What changed**: `Delete()` (`K.vb:2194-2262`). After the group check, the confirmation and the Security password, it now collects reasons per kruti:
  - `select count(*) from TirthRakshaKrutiT where KrutiKt=<id>` > 0 **or** `select count(*) from TirthRakshaReferenceT where KrutiMstKt=<id>` > 0 → `"KrutiMstKm - <id> is used in TirthRaksha Master"`
  - `select COUNT(*) from krutiRelT where krutimstkt = <id>` > 0 → `"KrutiMstKm - <id> is used in वि.क्र."`
    Reasons are joined with a leading CR/LF each and shown in one `MsgBox` (OK only); nothing is deleted. The old message `"Records in used anthor plase !"` no longer exists.
- **Kind**: behaviour change (new referential check, changed message)
- **Web today**: `apps/api/src/master/screens/kruti.ts:997-1011` `checkInUse` — old way: only `krutiRelT`, message `'Records in used anthor plase !'`; no Tirth Raksha check (a kruti used by Tirth Raksha can be deleted today).
- **Web change needed**: add the two Tirth Raksha counts and return the new texts (both lines when both apply). The web's `'delete-with-tran'` action is a separate desktop menu item that did not change — leave it.
- **DB prerequisites**: `TirthRakshaKrutiT(KrutiKt)` PRESENT; `TirthRakshaReferenceT(KrutiMstKt)` PRESENT.
- **Size**: S

### frmKrutiMasterNew — UpdateKrutiAuthor uses `authtype.authortype` and `visheshMast.Vibhag`

- **What changed**: `K.vb:960` the denormalised `krutiMst.Author` / `SAuthor` string now starts with `isnull(at.authortype ,'') + case when isnull(at.authortype,'')<>'' then '-' else '' end` (was `at.authtyattr` in both places), and `K.vb:965` joins `VisheshMast VisAvastha on kt.avasthaid=VisAvastha.Tid and VisAvastha.Vibhag='Avastha'` (was `VisAvastha.remark='Avastha'`).
- **Kind**: behaviour change (the stored author text changes for every author type whose `authortype` differs from `authtyattr`) + schema rename (see Cross-cutting)
- **Web today**: `kruti-actions.ts:196-205` `updateKrutiAuthor` — old way on both points (`at.authtyattr`, `VisAvastha.remark = 'Avastha'`).
- **Web change needed**: switch to `at.authortype`; switch to `VisAvastha.Vibhag` once the column exists (Cross-cutting 1). Also `kruti.ts:962` (avastha list: `visheshMast WHERE Remark = N'Avastha'`).
- **DB prerequisites**: `authtype.authortype` PRESENT (and `authtyattr` still PRESENT); `visheshMast.Vibhag` **MISSING** (local DB still has `visheshMast.remark`).
- **Size**: S

### frmKrutiMasterNew — "Show For Selected Kruti" renamed, new item TirthRaksha Master

- **What changed**: the first top-level menu caption is now `"For Selected  Kruti "` (was `"Show For Selected  Kruti "`). Its drop-down is now: BookM, Author Card, Swarop, Vibhag, Party Master(Bhandar), Book (hidden), **TirthRaksha Master**, separator, Utility, **Replace Records**. `TirthRakshaMasterToolStripMenuItem_Click` (`K.vb:5529`) opens `frmTirthRakshaMaster` with
  `WhereCondition = " AND TirthRakshaKm IN(SELECT DISTINCT TirthRakshaKt FROM TirthRakshaReferenceT WHERE TirthRakshaReferenceT.KrutiMstKt IN(<selected ids>) UNION SELECT DISTINCT TirthRakshaKt FROM TirthRakshaKrutiT WHERE TirthRakshaKrutiT.KrutiKt IN(<selected ids>))"`. No "nothing found" message.
- **Kind**: new feature + UI/layout
- **Web today**: `KrutiMaster.tsx:1060` label `'Show For Selected  Kruti '`; no Tirth Raksha item. The Tirth Raksha web screen exists (`tirth-raksha-master`, `apps/api/src/master/screens/tirth-raksha.ts`).
- **Web change needed**: rename the label; add a `'tirth-raksha-master'` action returning `openWhere(db, 'tirth-raksha-master', <the union above>, '')` and the menu item.
- **DB prerequisites**: `TirthRakshaReferenceT`, `TirthRakshaKrutiT`, `TirthRakshaM` PRESENT.
- **Size**: S

### frmKrutiMasterNew — For Selected Kruti › Vibhag reads KrutiVibhagT of the selected rows

- **What changed**: `VibhagToolStripMenuItem_Click` (`K.vb:3412-3437`). Old: the distinct `KrutiHeadkt` of **every row in the grid**. New:
  `SELECT ISNULL(STUFF((SELECT DISTINCT ',' + CAST(VibhagKt AS VARCHAR(30)) FROM KrutiVibhagT WHERE KrutimstKt IN(<selected rows>) FOR XML PATH('')),1,1,''),'')`; when the result is `""` or `"0"` → `MsgBox("No Records Found")`, else opens `frmColumnMaster` with those ids.
- **Kind**: bug fix (KrutiHeadkt is the dead column the web note already calls out)
- **Web today**: `kruti-actions.ts:262-269` `'vibhag-master'` — old way (`KrutiHeadkt` of `gridIds`, empty message `''`); `KrutiMaster.tsx:1070` passes `{ gridIds: a.gridIds }`.
- **Web change needed**: query `SELECT DISTINCT VibhagKt AS id FROM KrutiVibhagT WHERE KrutimstKt IN (selected)`, empty message `'No Records Found'`, pass the selected ids instead of the grid ids. Update `docs/screens/kruti-master.md` (the "Vibhag … menu items read it" remark about `KrutiHeadkt`).
- **DB prerequisites**: `KrutiVibhagT(KrutimstKt, VibhagKt)` PRESENT.
- **Size**: S

### frmKrutiMasterNew — For Selected Kruti › Utility › Append Remark (new)

- **What changed**: `AppendRemarkToolStripMenuItem_Click` (`K.vb:5650-5676`). `InputBox("Please Enter Remark")`; for each selected row `NewRemark = <typed text> + <the row's Remark grid cell>` — the text is put **in front** of the existing remark, with no separator, despite the name — then `UPDATE KrutiMst SET remark=@remark WHERE krutimstkm =@krutimstkm` and the grid cell is updated. No password, no work report, no `moduser`/`moddate`, no message. Cancelling the InputBox returns `""`, so the loop still runs and rewrites each remark with its own value (the `IsNot Nothing` test never fails).
- **Kind**: new feature
- **Web today**: not ported (new). The Utility submenu is at `KrutiMaster.tsx:1073-1093`.
- **Web change needed**: menu item + action `'append-remark'` (`remark = @text + ISNULL(remark,'')` per selected id is the same result if taken from the DB; the desktop takes the grid cell value, which is the list's `remark`). Do nothing on cancel/empty.
- **DB prerequisites**: none new.
- **Size**: S

### frmKrutiMasterNew — For Selected Kruti › Replace Records (new, Admin/AMaster only)

- **What changed**: new submenu `Replace Records` with three items; the submenu is visible only when `IsAdminLogin Or AMaster` (`K.vb:5844-5848`).
  1. **`कृति परि. नाम`** (`K.vb:6114-6152`): `InputBox("Enter Existing Text")`, then `InputBox("Enter New Replace Text")` (either empty → stop). Per selected row: old = `SELECT extranm FROM krutiMst WHERE krutimstkm = <id>`, new = `SELECT REPLACE(extranm,N'<search>',N'<replace>') AS extranm …`. Only when the old value `.Contains(search)` and the trimmed values differ: `UPDATE krutimst SET extranm=REPLACE(extranm,N'<search>',N'<replace>') where krutimstkm =<id>`, the grid cell becomes the new name + `(` any-names `)` (any-names = `KrutiNmT.Anyaname` joined by `,` in `seq` order, omitted when empty), and `insertworkreports("KrutiMst", "krutimstkm", id, user, dtOld, dtNew, "Modify")`. End: `"(n) Records Replaced Successfully"` when n > 0. Search/replace texts are concatenated into the SQL unescaped on the desktop.
  2. **`प्रकार`** → `FindAndReplace("Ktype", "krutitypekt", "KrutiTypeName")`; 3. **`पूर्णता`** → `FindAndReplace("Purn", "PurnaKt", "PurnaName")` (`K.vb:6159-6199`):
     - pick the original: `SELECT DISTINCT V.Tid AS Id,V.Vishesh AS Name FROM krutiMst K INNER JOIN visheshMast V ON K.<col>=V.Tid WHERE K.KrutiMstKm IN(<selected>) AND ISNULL(V.Vishesh,'')<>'' AND V.Vibhag='<Type>' ORDER BY V.Vishesh` (`boolSelectFirst`);
     - pick the replacement: `SELECT V.Tid AS Id,V.Vishesh AS Name FROM visheshMast V WHERE ISNULL(V.Vishesh,'')<>'' AND Vibhag='<Type>' ORDER BY V.Vishesh`;
     - per selected row whose current name equals the original (trimmed) and differs from the replacement: `UPDATE krutimst SET <col>=<replacement Tid> where krutimstkm =<id>`, the grid's प्रकार / पूर्ण cell is set, and a `"Modify"` work report with old/new `KrutiTypeName` / `PurnaName`. End: `"(n) Records Replaced Successfully"` when n > 0.
       No password on any of the three; `moduser`/`moddate` are not touched.
- **Kind**: new feature
- **Web today**: not ported (new).
- **Web change needed**: submenu (admin/AMaster) + three actions; parameterise the texts; work reports through the existing `prepareWorkReport` path with work type `Modify`; refresh the affected rows.
- **DB prerequisites**: `visheshMast.Vibhag` **MISSING** (local has `remark`; rows exist as `remark='Ktype'` 6, `'Purn'` 32); everything else present.
- **Size**: M

### frmKrutiMasterNew — Utility › Replace In Selected › "कर्ता 1" › Author / Avastha

- **What changed**: the item `Author` under Utility › Replace In Selected is now a submenu captioned **`कर्ता 1`** with two items.
  - **Author** (`K.vb:5554-5582`, replaces the old `AuthorToolStripMenuItem1_Click`): now asks the **Security password first** (`InputBoxProc()`). Source list (unchanged SQL): `select krutiauthT.authorcokt,authmast.authorname as Author from authmast inner join krutiauthT on authmast.authorcokm=krutiauthT.authorcokt where krutiauthT.krutimstkt in (<selected>) group by krutiauthT.authorcokt,authmast.authorname order by authmast.authorname`; destination list now `select Authorcokm,Authorname,recordno,vksamvat,Identyty,Count from Authmast  order by Authorname` (both with `boolSelectFirst`). Then `update krutiauthT set authorcokt =<to> where ISNULL(authorcokt,0)=<from> and krutimstkt in (<selected>)`, then **`UpdateKrutiAuthor("Author1", <selected>)`** (new: the denormalised `krutiMst.Author` is rebuilt), then `"(n) Records Updated Successfully"` where n is the **number of selected rows** (the affected count is computed but not shown). It no longer reloads the whole list (`FillList()` removed), so the grid's कर्ता1 cells stay stale until refreshed.
  - **Avastha** (new, `K.vb:5584-5612`): password; source `SELECT DISTINCT krutiautht.AvasthaId,visheshMast.Vishesh AS Avastha FROM krutiautht INNER JOIN visheshMast ON krutiautht.avasthaid=visheshMast.Tid where krutiauthT.krutimstkt in (<selected>) ORDER BY visheshMast.Vishesh`; destination `SELECT Tid,Vishesh FROM visheshMast WHERE Vibhag='Avastha' ORDER BY Vishesh`; `update krutiauthT set avasthaid =<to> where ISNULL(avasthaid,0)=<from> and krutimstkt in (<selected>)`; `UpdateKrutiAuthor("Author1", <selected>)`; `"(n) Records Updated Successfully"` with n = rows that had the source avastha (counted before the update).
  - Desktop defect not to copy: when the source is picked and the destination popup is cancelled, the guard `txDestination IsNot Nothing` is always true, so it runs `set authorcokt = where …` and shows the SQL error.
- **Kind**: behaviour change (Author) + new feature (Avastha)
- **Web today**: `KrutiMaster.tsx:1262-1272` single item `Author`, no password, then `state.reload()`; API `kruti-actions.ts:538-542` `'replace-author'` — old way (no `ISNULL`, no `updateKrutiAuthor`, no message).
- **Web change needed**: turn the item into the `कर्ता 1` submenu; Author: ask the Security password, call `updateKrutiAuthor(db, 'Author1', selected)` after the update, return the message; add `'avasthas-of'` + `'replace-avastha'`; require both picks.
- **DB prerequisites**: `visheshMast.Vibhag` **MISSING** (destination list of Avastha); rest present.
- **Size**: S–M

### frmKrutiMasterNew — new top-level menu "Filter › Show Records By Work" + new dialog frmKrutiWorkFilter

- **What changed**: new last top-level item `Filter` with one item `Show Records By Work` (`K.vb:5614-5648`). It is the only opener of the new form `Updated/Library/Library/frmKrutiWorkFilter.vb` (+ `.Designer.vb`, `.resx`).
  **The dialog** ("Kruti Work Filter", client size 583x147, Times New Roman 14.25): toolbar `btnSearch` (its text is "Save") and `btnExit` ("Close"); `Work From Date` and `Work To Date` — two `DateTimePicker`s, custom format `dd/MM/yyyy`, default today; `Work Type`, `Sampraday`, `Work Done By` — three read-only text boxes filled from list popups, each **multi-select** (the box shows the chosen names joined by `,`, its Tag holds the ids):
  - Work Done By (F2): `SELECT tid,uname AS Name FROM Usecurity WHERE IsActive=1 ORDER BY uname`
  - Work Type (**any key**, the handler has no F2 test): `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='WorkType' ORDER BY Name`
  - Sampraday (any key): `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='KrutiSampraday' ORDER BY Name`
    A box is cleared by picking the list's blank first row (correction, Kruti batch: `DisplayListForm` adds one by default); no validation. Search closes with `boolSearch = True`; Close with False.
    **The filter**: the list is reloaded with
    `SELECT DISTINCT K.krutimstkm FROM krutiMst K INNER JOIN WorkReportM W ON K.krutimstkm=W.RecordNo AND W.TableName='KrutiMst' Left JOIN KrutiSampradayT KS ON K.krutimstkm=KS.KrutimstKt WHERE W.Workdate>='<from MM/dd/yyyy>' AND W.Workdate<='<to MM/dd/yyyy>' [AND W.WorkTypeGId in(<ids>)] [AND W.DoneByGId IN(<ids>)] [AND KS.SampradayKt in(<ids>)]`
    used as `where KrutiMstkm in(<that>)` in the normal list query (`StrId` is set for one `FillList()` and then restored, so Refresh returns to the previous list). `FillList` still appends the any-names to `extranm`.
- **Kind**: new feature
- **Web today**: not ported (new). The web already has the pattern: actions that return `{ kind: 'list', rows: await ctx.list(sql\`…\`) }` (`kruti-actions.ts:855-870` `'show-vk-zero'`).
- **Web change needed**: a small dialog component (two dates, three multi-pick boxes over the three lists) + menu item + action `'show-by-work'` returning `ctx.list(krutiMst.krutimstkm IN (<the query, parameterised>))`. `WorkReportM.RecordNo` is `nvarchar`, `Workdate` is `date` — compare accordingly.
- **DB prerequisites**: `WorkReportM(RecordNo, TableName, Workdate, WorkTypeGId, DoneByGId)` PRESENT; `Usecurity.IsActive` PRESENT; `columnmaster` Vibhag `WorkType` PRESENT (72 rows); `KrutiSampradayT` PRESENT.
- **Size**: M

### frmKrutiMasterNew — Utility › "Mark Samprad As Complete" (new, does nothing)

- **What changed**: new first item of the Utility menu, caption `Mark Samprad As Complete`; its handler is an empty `Try` (`K.vb:5678-5684`).
- **Kind**: new feature (stub)
- **Web today**: not ported.
- **Web change needed**: none until the desktop gives it a body (or add an inert item for parity — user's call).
- **DB prerequisites**: none.
- **Size**: S

### frmKrutiMasterNew — Main Report As Agam Suchi: Main / Pattern 1 / Pattern 2

- **What changed**: the item is now a submenu: `Main` → `PrintAgamSuchiReport(0, 0)`, `Pattern 1(Start With Purnata In Kruti Detail)` → `(1, 0)`, `Pattern 2(Print KrutiNo First)` → `(0, 1)` (`K.vb:6081-6113`); the report URL gained `&IsStartWithPurnataInKrutiDetail={3}&PrintKrutiNoFirst={4}`.
- **Kind**: new feature
- **Web today**: **already the new way** — `KrutiMaster.tsx:1011-1018` `agamSuchi(pattern)` and the three items at `:1171-1179`; API `kruti-actions.ts:456-471` maps pattern 1 → `startWithPurnata`, 2 → `krutiNoFirst`.
- **Web change needed**: none.
- **DB prerequisites**: none new.
- **Size**: —

### frmKrutiMasterNew — Main Report With Reference: longer "Akaradi" sampraday list

- **What changed**: `MainRepWithRefToolStripMenuItem_Click` (`K.vb:5136`), "Yes" branch list is now
  `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag ='KrutiSampraday' AND Name IN(N'अकारादि लीस्ट',N'क आदि लीस्ट',N'त, थ, द, ध, न आदि लीस्ट',N'ट, ठ, ड, ढ, ण आदि लीस्ट',N'प, फ, ब, भ, म आदि लीस्ट',N'य, र, ल, व आदि लीस्ट',N'श, ष, स, ह आदि लीस्ट') ORDER BY Name` (was the first two names only).
- **Kind**: behaviour change
- **Web today**: `apps/api/src/master/screens/kruti.ts:1111-1113` list `'kruti-sampraday-akaradi'` — old way (two names).
- **Web change needed**: extend the `IN (...)` to the seven names.
- **DB prerequisites**: all seven names PRESENT in `columnmaster` (15333, 15461, 16593, 15853, 16590, 16591, 16592).
- **Size**: S

### frmKrutiMasterNew — keyboard shortcut guards (desktop regression, do not copy)

- **What changed**: in `frmKrutiMasterNew_KeyDown`, Ctrl+N is now guarded by `btnAdminLock.Enabled` and Ctrl+S by `btnAdminUnlock.Enabled` (were `btnNew.Enabled` / `btnSave.Enabled`), `K.vb:89`, `93`; and `Refresh()` sets `btnAdminUnlock.Enabled = True` where it used to set `btnSave.Enabled = True` (`K.vb:3039`). The new lock buttons are never disabled, so Ctrl+N / Ctrl+S now fire regardless of the toolbar state. `btnAdminLock.Text` is still "New". This looks like an accidental rename (the new buttons were made from copies of New/Save), not a decision.
- **Kind**: behaviour change (unintended)
- **Web today**: the engine's toolbar shortcuts follow the buttons' enabled state (old, correct behaviour).
- **Web change needed**: none (see open question 3).
- **DB prerequisites**: none.
- **Size**: —

### frmKrutiMasterNew — refactor only

- `StrId` moved to a "Public Variables" region; renames `PrintReportToolStripMenuItem1` → `PrintReportToolStripMenuItem`, `PrintSelectedColumnToolStripMenuItem1` → `…MenuItem`, `SendToExcelToolStripMenuItem1` → `…MenuItem` (captions unchanged; these captions are what ContextMenu rows match on).
- `KrutiSubjectT` insert/update: `.Trim` added to the already-quoted `INSQ(Remark)` literal (`K.vb:2458`, `2473`) — `INSQ` trims the value itself, so no change in what is stored.
- Removed commented-out code in Save, GetDataTable, btnCopy, the card export, the group delete; grid column declarations moved inside the Designer.
- Old `MainReportAsAgamSuchiToolStripMenuItem_Click` replaced by `PrintAgamSuchiReport` (above).

---

### New: frmKrutiWorkFilter.vb (+ Designer, resx)

Covered under "Filter › Show Records By Work" above. Opened only from `frmKrutiMasterNew.ShowRecordsByWorkToolStripMenuItem_Click`; registered in `Library.vbproj`; no other caller.

---

### frmHastprat.vb / .Designer.vb (no web screen — `hastprat-master` is commented out of `menu.ts:129`)

Mostly corrections so the form works on the current schema, plus configuration moving into the database. (1) Every reference to `HastpratLibNoT.Tid` becomes `HastpratLibNoT.HastpratLibNoKm` (about 20 queries: F2 sign, mix-sign, selection, reference popups, Party/Issue/Graphics/Kruti jumps, delete of `praptitran`) — the local DB has only `HastpratLibNoKm`, so the old queries could not have run. (2) Scan / e-book / title / graphics folders are no longer read from `scanpath.txt` beside the EXE but from `GetConfigValueFromConfigName(EnumGeneralConfig.ScanPath | EBookPath | TitlePath | GraphicsPath)` = `SELECT ConfigValue FROM GeneralConfig WHERE ConfigName=@ConfigName`; "Scan Data Folder Info" also uses `ScanPath` instead of the hard-coded `\\192.168.0.210\ScanData`. (3) `HastpratAuthorT.txtAuth` is built from `authtype.authortype` instead of `authtyattr`, and `VisheshMast … remark='Avastha' / 'chkbx' / 'CHKBX'` becomes `Vibhag=…`. (4) Save: on insert only `enuser, endate` are written (no `moddate/moduser`); child rows (`HastpratBhashaT`, `HastpratLipiT`, `HastpratVibhagT`) stamp `GETDATE()` instead of the date string; the stored `txtBhasha` / `txtLipi` texts are built from the popup's `bhasa_attr` / `lipi_attr` columns instead of `BhashaName` / `LipiName`. (5) Menu: `Update Book Akaradi Seq` (`exec UpdateBookKrutiAkaradiSeq`) removed; new `Import Data From Excel` at the top of Utility with an empty handler; caption `Inword Master` → `Inward Master`. The jump to Kruti Master (`frm.StrId = …`) is unchanged apart from the column rename.
DB prerequisites: `GeneralConfig` **MISSING**; `visheshMast.Vibhag` **MISSING**; `HastpratM`, `HastpratLibNoT(HastpratLibNoKm)`, `HastpratBhashaT`, `HastpratLipiT`, `HastpratVibhagT`, `HastpratAuthorT`, `Bhasmast.bhasa_attr`, `lipimast.lipi_attr`, `authtype.authortype` PRESENT.
Shared with live web screens: only through the cross-cutting items below (visheshMast rename, `authortype`) and `GeneralConfig` (whoever ports scan/e-book path handling for Book Master needs it; the web has no `scanpath`/`GeneralConfig` code today).

### frmHastpratLibNoTran.vb / .designer.vb (no web screen)

(1) Delete: the whole "Libno is Used In Below Transactions" block (about 26 use checks across Catalogue, Issue, Anya Bhandar, Kruti Reference/Note, Graphics, Reference, Magazine Vishesh, English Book Vishesh, Sampraday and Author child tables, plus the Coding database) is **commented out**; `StrInUse` is therefore always empty and a Hastprat LibNo is now deleted after the password alone. (2) Delete fix: `delete from HastpratLibNoTPraptiT where HastpratLibNoKt = …` (was the non-existent `HastpratLibNoKm` column of that table). (3) Scan/e-book/title paths from `GeneralConfig` instead of `scanpath.txt`. (4) Mark list `VisheshMast … where Vibhag = 'MARK'` (was `remark`). (5) Captions `Inword` → `Inward`, `Inword Master` → `Inward Master`; the designer otherwise only reorders `AnyaBhandarToolStripMenuItem`.
DB prerequisites: `GeneralConfig` **MISSING**; `visheshMast.Vibhag` **MISSING**; `HastpratLibNoTPraptiT(HastpratLibNoKt)` PRESENT.
Note for live web screens: because the use checks are gone, Kruti reference / note rows that link to a Hastprat LibNo can now be left pointing at a deleted one (the checks that prevented it are gone) — web Kruti reads of those links should not assume the row exists. (Link column names not verified against the DB in this slice.)

### frmVyakhyan.vb (no web screen — `vyakhyan-master` commented out of `menu.ts:111`; Designer identical)

Three small changes, all on tables that Book Master also writes, so they matter to the web even though Vyakhyan itself is not ported: (1) `praksnAuthorT.txtAuth` is built from `AT.authortype` instead of `AT.authtyattr` (both the bulk update at `:292` and the per-row save at `:821`); (2) `VisheshMast VisPad … VisPad.Vibhag='Avastha'` instead of `remark` (`:313`, `:835`); (3) **`insert into praksnBhashaT(prakshnokt,bhashakt,Seq) values(…)` and `insert into praksnLipiT(prakashankt,lippikt,Seq) values(…)` — the key column is no longer supplied and the `select isnull(max(prakshnbhashakm),0)+1` / `max(prakshnlipikm)+1` lookups are gone** (`:796`, `:804`). The same change is in `Updated/Library/Library/frmBookMasterNew.vb:2128`, `:2232`. See Cross-cutting 3.

---

## Cross-cutting findings from this slice (affect live web screens)

1. **`visheshMast.remark` is renamed to `visheshMast.Vibhag`.** `Library.Entity/EntVisheshMast.vb` replaces `Public Property remark` with `Public Property Vibhag`; `VisheshMastRepository` inserts/updates `Vibhag`; every `visheshMast … remark = '…'` filter in the updated app (frmDisplayTransNew 53, frmList1 19, frmDisplayTrans 14, Book, BookTran, Hastprat, Kruti, Vyakhyan, FormPrakashanList) now says `Vibhag`; none still says `remark`. Local DB: `visheshMast` has `remark` and **no `Vibhag`**. The web filters `visheshMast` by `remark` in roughly 36 places (a grep count, not hand-checked) across the 19 API screen files that touch the table (in this slice: `kruti.ts:962`, `kruti-actions.ts:205`), and 37 `tblSearch` rows (F2EntryText / JoinCondition, e.g. `KrutiMst` `krutitypekt`, `prasastitypekt`, `PurnaKt`, `rachnasthalkt`) still say `remark = '…'` in the local data. If production renames the column, all of these break at once; the tblSearch rows are data and must be updated with the schema.
2. **Author-type text: `authtype.authortype` replaces `authtype.authtyattr`** in the denormalised author strings (`krutiMst.Author`/`SAuthor`, `praksnAuthorT.txtAuth`, `HastpratAuthorT.txtAuth`). Both columns exist locally. Web uses `authtyattr` in `kruti-actions.ts:196-197`, `book-actions.ts:82`, `book.ts:99`, `prakashak.ts:218`, `anya-bhandar.ts:490`, `:532` (the non-Kruti ones belong to other slices; listed so they are not missed).
3. **`praksnBhashaT.prakshnbhashakm` and `praksnLipiT.prakshnlipikm` must be IDENTITY in the updated database** (the updated Book Master and Vyakhyan insert without them; locally both are `NOT NULL`, not identity). The web's Book Master inserts explicit keys from `nextKey(...)` (`apps/api/src/master/screens/book.ts:330-346`), which SQL Server rejects on an identity column. Belongs to the Book slice; flagged here because Vyakhyan shows the same change.
4. **`GeneralConfig(ConfigName, ConfigValue)`** replaces `scanpath.txt` (names from `EnumGeneralConfig`: AttachmentPath, ScanPath, EBookPath, TitlePath, GraphicsPath, GGUrl, TempGRPath, LibraryExePath, ReferenceTPath, MainRoot). MISSING locally.

## DB objects this slice needs

| Object                                                                                                                 | Used by                                                         | Local DB                       |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `ContextMenu` table                                                                                                    | Kruti right-click filter (`ShowHideContextMenu`)                | **MISSING**                    |
| `UserContextMenuPermission` table                                                                                      | same                                                            | **MISSING**                    |
| `TransactionM` (`TransactionKm`, `TransactionName`)                                                                    | same                                                            | PRESENT (27 = KrutiMst)        |
| `visheshMast.Vibhag` column                                                                                            | UpdateKrutiAuthor, Replace Records, Avastha, Hastprat, Vyakhyan | **MISSING** (`remark` present) |
| `GeneralConfig` table                                                                                                  | Hastprat, HastpratLibNoTran paths                               | **MISSING**                    |
| `praksnBhashaT.prakshnbhashakm`, `praksnLipiT.prakshnlipikm` as IDENTITY                                               | Vyakhyan (and Book Master)                                      | **NOT identity** locally       |
| `authtype.authortype`                                                                                                  | author strings                                                  | PRESENT                        |
| `TirthRakshaKrutiT(KrutiKt, TirthRakshaKt)`, `TirthRakshaReferenceT(KrutiMstKt, TirthRakshaKt)`, `TirthRakshaM`        | Kruti delete check, TirthRaksha Master jump                     | PRESENT                        |
| `KrutiVibhagT(KrutimstKt, VibhagKt)`                                                                                   | Vibhag jump                                                     | PRESENT                        |
| `KrutiSampradayT`, tblSearch `KrutiMst`/`SampradayTran`, `KrutiMst`/`remark`                                           | grid columns, work filter                                       | PRESENT                        |
| `WorkReportM(RecordNo nvarchar, TableName, Workdate date, WorkTypeGId, DoneByGId)`                                     | work filter                                                     | PRESENT                        |
| `Usecurity.IsActive`                                                                                                   | work filter                                                     | PRESENT                        |
| `columnmaster` Vibhag `WorkType` (72 rows), `KrutiSampraday` incl. the 7 "आदि लीस्ट" names                             | work filter, Main Report With Reference                         | PRESENT                        |
| `HastpratLibNoT.HastpratLibNoKm`, `HastpratLibNoTPraptiT.HastpratLibNoKt`, `Bhasmast.bhasa_attr`, `lipimast.lipi_attr` | Hastprat                                                        | PRESENT                        |

Missing tables, as far as the code shows them:

- **`ContextMenu`** (`Updated/Library.Entity/EntContextMenu.vb` + the SELECT in `ShowHideContextMenu`): `ContextMenuKm` int (key; identity not confirmed from this slice), `TransactionKt` int (→ `TransactionM.TransactionKm`; 0/NULL = applies to every screen), `ContextMenuName` nvarchar (the menu item's caption), `enuser` int, `endate`, `moduser` int, `moddate`.
- **`UserContextMenuPermission`** (same entity file): `UserContextMenuPermissionKm` int (key), `ContextMenuKt` int, `UserKt` int (→ `Usecurity.tid`), `IsVisible` bit. Audit columns not determined (the INSERT/UPDATE live in the repository of another slice).
- **`GeneralConfig`**: `ConfigName` (string, matches the enum member name), `ConfigValue` (string). Other columns not determined from this slice.
- **`visheshMast.Vibhag`**: same type/role as today's `remark` (the discriminator: 'Avastha', 'Ktype', 'Purn', 'Ptype', 'city', 'MARK', 'chkbx', …).

## Open questions for the user

1. **visheshMast**: in production, was `remark` renamed to `Vibhag` (old name gone), or was `Vibhag` added beside it? And were the `tblSearch` F2/JoinCondition rows that say `remark = '…'` updated? The web cannot serve both DB versions with one query text; we need to know which DB the web will run against and when.
2. **ContextMenu data**: we need the production rows of `ContextMenu` and `UserContextMenuPermission` (or a newer DB restore) to see which Kruti items are hidden for whom — in particular whether "Print Report " is restricted there now that the hard-coded user-id rule is gone. Until then the web would show Print Report to everyone.
3. **Ctrl+N / Ctrl+S in Kruti Master** now work even when New / Save are disabled (the guards point at the new lock buttons). Treat as a desktop slip and keep the web as it is, or copy it?
4. **Lock/Unlock By Admin** is now only for AMaster users (plain Admin lost it) and asks its password once per window. Confirm both are intended before the web removes it for Admin.
5. **Append Remark** puts the typed text in front of the existing remark with no space, and writes no work report. Port as is, or append/add a separator?
6. **Mark Samprad As Complete** and Hastprat's **Import Data From Excel** have empty handlers. Show them on the web as inert items, or leave them out until they do something?
7. **Replace In Selected › Author** shows the count of selected rows, not of changed rows, and no longer refreshes the grid. Copy exactly, or report the changed count and refresh the rows?
8. The web's Kruti menu currently has several desktop items commented out in `KrutiMaster.tsx` (e.g. "For Current Record › Copy Subject", "Toggle MultiSelect", "Main Report", परिशिष्ट "कृतिना पुस्तकनानाम…") although `docs/screens/kruti-master.md` says the menu is ported item for item. Was that a stand-in for the ContextMenu permissions (so they should come back under the new mechanism), or a separate decision?
