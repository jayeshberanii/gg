# Slice 1 — application shell and shared code (v3.3.3.6 → v3.4.3.1)

Paths: `Updated/` = `GGLibrarySolutionUpdated/`, `web/` = `gglib-web/`. DB = local `DBLibSQL` restore.

**Decompiler:** no system .NET, but a .NET 10 runtime ships with VS Code
(`~/.config/Code/User/globalStorage/ms-dotnettools.vscode-dotnet-runtime/.dotnet/10.0.12~x64/dotnet`).
I downloaded the `ilspycmd` 9.1 nupkg into the scratchpad and ran it with `DOTNET_ROLL_FORWARD=LatestMajor`
(nothing installed system-wide). Output: `scratchpad/CommonLibrary-new/` (new DLL) and
`scratchpad/CommonLibrary-old-redo/` (old DLL, same tool, for a clean diff; identical to `.legacy-decompiled`
for the files spot-checked). `Common.BusinessContract.dll` was also rebuilt (2021 → 2025) but decompiles identically.
`Library.BusinessContract.dll` / `Library.Entity.dll` changed too, but their source is in the repo.

---

## A. Cross-cutting findings (affect many screens, not only this slice)

### A1. `visheshMast.remark` was renamed to `visheshMast.Vibhag`

- **What changed**: every SQL on visheshMast that filtered/wrote `remark` now uses `Vibhag` (115 statements in Updated, 0 left on `remark`; `Library.Entity/EntVisheshMast.vb:4` `remark` → `Vibhag`). In this slice: `Updated/Library/CommonForms/frmList1.vb:313-471` (20 list queries, e.g. `select tid, Vishesh from VIsheshmast where Vibhag='quality' order by vishesh`), `frmVGPMmast.vb:83,85,106,129,154` (`insert into VIsheshmast (Tid, Vishesh , Vibhag )`, `select distinct(Vibhag) from visheshMast order by Vibhag`), `Mod Vishesh Samprady etc.vb:61,63`, `frmDisplayTrans.vb` (28 lookups), `Frmlibmain.vb:561` Sampraday Tree `" and Vibhag ='sampraday'"`.
- **Kind**: behaviour change (schema rename)
- **Web today**: old way. `remark` on visheshMast is used in 17 files under `web/apps/api/src/master/screens/` (author.ts, kruti.ts, kruti-actions.ts, book.ts, book-tran.ts, book-actions.ts, graphics-detail.ts, anya-bhandar.ts, tirth-raksha.ts, prakashak.ts, vishesh.ts, party.ts, patrika.ts, issue.ts, sampraday.ts, vishesh-entry-common.ts, registry.ts) plus the Kysely types in `web/packages/db`.
- **Web change needed**: once the production DB has the column, replace `remark` → `Vibhag` in every visheshMast query and regenerate `packages/db`. Must be switched together with the DB (old column name will stop working).
- **DB prerequisites**: `visheshMast.Vibhag` MISSING (local table still has `remark nvarchar(50)`); `tblSearch` row `visheshMast/remark` still present (needs to become `Vibhag`).
- **Size**: M (mechanical, but 17 files + tests)

### A2. Paths moved from code into table `GeneralConfig`

- **What changed**: `MdlLib.vb:61-72` new `EnumGeneralConfig {AttachmentPath=1, ScanPath=2, EBookPath=3, TitlePath=4, GraphicsPath=5, GGUrl=6, TempGRPath=7, LibraryExePath=8, ReferenceTPath=9, MainRoot=10}` and `MdlLib.vb:1712-1730` `GetConfigValueFromConfigName(name)` = `SELECT ConfigValue FROM GeneralConfig WHERE ConfigName=@ConfigName`. Globals `ReferenceTPath = "F:\scantesting\"` and `MainRoot = "I:\LibraryImages"` are commented out (`MdlLib.vb:20-21`). ~45 call sites (Book, BookTran, Hastprat, ViewJpg, Author, Prakashak, GraphicMaster, frmlogin, General Settings). The DLL's `frmAttachments.btnSave_Click` now reads `SELECT ConfigValue FROM GeneralConfig WHERE ConfigName='AttachmentPath'` instead of `\\192.168.0.210\Attachments\Production\`. sqlpath.txt / connection handling is unchanged. `frmWebBrowser` still reads `ggurl.txt` (the `GGUrl` enum member has no caller in this slice).
- **Kind**: refactor with a behaviour change (paths are data now)
- **Web today**: not ported — the web shows "needs the desktop computers" messages with the old literal paths (`web/apps/web/src/screens/AuthorMaster.tsx:760,843`, `BookMaster.tsx:1336`). No reads of these paths.
- **Web change needed**: none functionally. Optional: fix the literal paths in those messages. If file viewing is ever ported, read `GeneralConfig`.
- **DB prerequisites**: table `GeneralConfig` MISSING.
- **Size**: S

---

## B. `Library/CommonForms/Frmlibmain.vb` + `.Designer.vb` (menu)

New top-level order: Master, Issue, Library, Graphics, Article, Utility, Windows, Employee, **Admin**. `&Help` (hidden) and `Reports` are gone. Pure renames ignored.

### B1. Menu tree, item by item (only changed/added/removed items; everything else is identical)

| Menu                  | Item (new caption → form)                                                                    | Change                                                                                                                       | Web `menu.ts`                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Library               | **Magazine Vishesh Master** → frmMagazineVisheshNew                                          | caption was "Magazine Vishesh Master New"                                                                                    | live, id `magazine-vishesh-master`, still labelled "… New" (line 116) → rename label (also e2e `batch-c.spec.ts:53,58`, doc)          |
| Library               | Old Magazine Vishesh Master (frmMagazineVishesh)                                             | caption was "Magazine Vishesh Master"; still `Enabled=False`, now also `Visible=False`                                       | commented out (118-120) → keep out; fix comment                                                                                       |
| Library               | **Shastra Path Master** → frmShastraPathMaster (`Frmlibmain.vb:990`)                         | NEW, but `Visible=False` in designer and never shown at runtime                                                              | absent → leave out (hidden for everybody)                                                                                             |
| Library               | **J Series Master** → frmJSeriesMaster (`:1062`)                                             | NEW, visible to all, last item                                                                                               | absent → add `screen('j-series-master','J Series Master','frmJSeriesMaster')`                                                         |
| Article               | **Lekh Inward Entry** → frmLekhNewspaperBagInward (`:1056`)                                  | NEW, visible to all                                                                                                          | absent; whole Article menu is commented out (147-153)                                                                                 |
| Utility               | Word File Update › Admin › {Replace Specific SubString…, GLOBAL SEARCH ENGINE, Export Table} | REMOVED (the nested Admin submenu is gone)                                                                                   | commented out (175-191) → delete the commented block                                                                                  |
| Utility               | "Old Update Counting of Book Image" (hidden)                                                 | removed; the one remaining hidden item keeps the handler                                                                     | never in web                                                                                                                          |
| Utility               | **Global Search Engine** → frmglobal (`:996`)                                                | moved to the end of Utility, `Visible=False`, never shown → unreachable now (admins could open it before)                    | commented out (as `global-search-engine` under Admin) → drop                                                                          |
| Employee              | Employee Master (hidden duplicate → frmEmployee / Employee_Detail)                           | removed                                                                                                                      | never in web                                                                                                                          |
| Employee              | **Log Report** → frmLogReport                                                                | caption was "Old Log Reports"                                                                                                | live, id `old-log-reports`, label "Old Log Reports" (228) → relabel "Log Report" (+ `OldLogReports.tsx` title, e2e `batch-b.spec.ts`) |
| Employee              | Log Reports (frmLogReports), User Control, Set Controls, Message (all were hidden)           | removed                                                                                                                      | never in web                                                                                                                          |
| Employee              | Apprisal Report                                                                              | MOVED to Admin as "Appraisal Report" (spelling fixed) → frmEmpAppraisalReport; was visible to everybody, now Admin-menu rule | commented out in Employee (233) → move to Admin block                                                                                 |
| Employee              | **Employee Performance Evaluation** → frmEmployeePerformanceEvaluation (`:1044`)             | NEW, `Visible=False`, never shown                                                                                            | absent → leave out                                                                                                                    |
| Employee              | **Employee Evaluation** → frmEmployeeEvaluation (`:1050`)                                    | NEW, visible to all                                                                                                          | absent → add                                                                                                                          |
| Admin (new top-level) | **Context Menu Permission** → frmContextMenuPermission (`:1003`)                             | NEW                                                                                                                          | absent                                                                                                                                |
| Admin                 | **Appraisal Report** → frmEmpAppraisalReport (`:1009`)                                       | moved from Employee                                                                                                          | commented out                                                                                                                         |
| Admin                 | **Employee Work Report** → frmDateRange + EmpWorkReport.rpt (`:1015`)                        | moved from the removed `Reports` menu                                                                                        | commented out (236-241)                                                                                                               |
| Admin                 | **Export Table** → frmExportTable (`:1040`)                                                  | moved from Utility › Word File Update › Admin                                                                                | commented out                                                                                                                         |
| Reports (top-level)   | Employee Work Report                                                                         | REMOVED as a menu                                                                                                            | commented out → delete                                                                                                                |
| Issue                 | Missing LibNo → frmIssueMissingLibNo                                                         | NOT new: present in both versions (only its declaration moved)                                                               | commented out (103), unchanged                                                                                                        |

Other captions, Exit Ctrl+Q, Windows menu: unchanged.

### B2. Visibility rules (`Updated/Library/CommonForms/Frmlibmain.vb:88-121`)

- **What changed**:
  - Old `If IsAdminLogin` block for the nested Admin submenu: deleted (replaced by an empty `For Each men … "master"` loop, no effect).
  - `Apprisal Standard`: unchanged (`IsAdminLogin Or curr_lnid = 5 Or curr_lnid = 100`).
  - Utility `Replace Specific SubString…`: unchanged (`IsAdminLogin Or curr_lnid = 13`).
  - New single rule: `If IsAdminLogin Or curr_utypeid = EnumUserType.Admin Or curr_utypeid = EnumUserType.AMaster` → `OutsiderDiary`, **`AdminToolStripMenuItem`** and `ExportTableToolStripMenuItem` visible, else hidden. So the whole Admin menu (Context Menu Permission, Appraisal Report, Employee Work Report, Export Table) is for admins and user types Admin(1)/AMaster(5).
  - Removed rule `IsAdminLogin Or curr_lnid = 100` for Reports › Employee Work Report: user 100 loses it unless Admin/AMaster; user types Admin/AMaster gain it.
  - Export Table: was `IsAdminLogin` only → now also user types Admin/AMaster.
  - Appraisal Report: was everybody → now the Admin rule.
  - Removed: the login-time prompt `select isnull(max(Msgkm),0) from MessageMaster where ReplyUserkt=… and ISNULL(Replied,0)=0` → "Do You Want to Open the Message?" (frmMessages).
  - Exit / Login & Log Out work-report conditions (`uidadd/uidmodify/uiddel`, ids 103/118): unchanged.
- **Kind**: behaviour change
- **Web today**: `web/packages/shared/src/menu.ts` — Outsider rule already matches (93-96). No Admin menu; the old Admin submenu and Reports menu exist only as comments with the OLD rules (`isAdmin`, `u.isAdmin || u.id === 100`). The MessageMaster prompt was never ported.
- **Web change needed**: add an `Admin` menu with `visible: (u) => u.isAdmin || u.userType === UserType.Admin || u.userType === UserType.AMaster`, containing the four items (commented out or live per the user's choice); delete the commented nested Admin submenu and Reports menu; move `apprisal-report` out of Employee; relabel the two captions; add J Series Master, Employee Evaluation, Lekh Inward Entry entries (their screens belong to other slices).
- **DB prerequisites**: none for the menu itself.
- **Size**: S

### B3. Other `Frmlibmain.vb` changes

- Graphics › Word Master query: `isnull(remark,'')` → `isnull(GrwordM.remark,'')` (`:198`; ambiguity fix because Usecurity has `Remark`). **Bug fix**. Web: `graphics-word-master` not ported/commented out → none. S.
- General Settings (`:569-613`): "ReferenceTPath" default now from `GeneralConfig`; the entered value is no longer stored anywhere (assignment commented out). Web: `general-settings` commented out/not ported → none.
- Removed handlers/dead code (Timer2, empty stubs, Employee detail): refactor only.

---

## C. `Library/CommonClass/MdlLib.vb`

### C1. `ShowHideContextMenu` (new, `MdlLib.vb:1646-1693`) — see section F.

### C2. `GetMemID` — next LibNo now reuses gaps and looks at Hastprat numbers (`MdlLib.vb:1607-1644`)

- **What changed**: after reading `bookprefix`: if prefix is `SN` or `EB` → no gap search; otherwise `exec Print_MissingNo 'libary','<prefix>'` and, if it returns rows, the next number is the **first missing number** (`dtMissing.Rows(0)("No")`). Otherwise: `Select ISNULL(MAX((right(libno,5))),0)+1 AS LibNo From BookT where  Left(libno,2)='<p>' UNION Select ISNULL(MAX((right(libno,5))),0)+1 AS LibNo From HastpratLibNoT where  Left(libno,2)='<p>' ORDER BY Libno DESC` (max over BookT **and** HastpratLibNoT). Old: only `MAX(right(libno,5))+1` from BookT. Callers: `frmBookTranNew.vb:442`, `frmHastpratLibNoTran.vb:373`. (`AnyaBhandarRepository.GetMemID` is a separate copy — other slice.)
- **Kind**: behaviour change
- **Web today**: old way — `web/apps/api/src/master/screens/book-common.ts:192-204` `nextLibNo()` (BookT max only, with UPDLOCK/HOLDLOCK); used by Book Tran F2 on series and Anya Bhandar.
- **Web change needed**: in `nextLibNo` (for the Book Tran caller; check the Anya Bhandar copy separately): skip for SN/EB, else take the first row of `EXEC Print_MissingNo 'libary', prefix`; fall back to the BookT ∪ HastpratLibNoT max. Keep the zero-padding.
- **DB prerequisites**: proc `Print_MissingNo` PRESENT (has the `'libary'` branch); `HastpratLibNoT` PRESENT.
- **Size**: S–M

### C3. `LockUnlockTransaction` password (`MdlLib.vb:1384-1390`)

- **What changed**: removed `pass = "gganga@123"` only for `authmast/BookM/krutimst` (others got `InputBoxProc("")`, i.e. an empty first password). Now always `InputBoxProc()` → default Security passwords for every table (Prakashak, Hastprat included).
- **Kind**: bug fix
- **Web today**: already the new way — engine `setLocked` uses the Security password (`master.service.ts:903`), Book/Author use `AUTHOR_LOCK_PASSWORD` (= the same desktop literal).
- **Web change needed**: none. **Size**: —

### C4. Small items

- `ConvertHindiNumberToEnglish` (new, `:1695-1710`): `hindiDigits` is an empty string in the source, so it returns its input unchanged; no callers in the Updated tree. None.
- Removed commented `ReadArticle`, comments in `GetVikramSamvat`/`GetIdFrom_GridRecord`: refactor only. `enc`/`deco`, Samvat conversion, `InputBoxProc` defaults, work-report helpers: **unchanged**.

---

## D. Other files in the slice

- **`frmlogin.vb:145`** — self-update source `"\\192.168.0.50\libprg"` → `GetConfigValueFromConfigName("LibraryExePath")`, `/` → `\` in copy paths. Refactor; web n/a. Login check itself unchanged.
- **`frmList1.vb`, `frmVGPMmast.vb`, `Mod Vishesh Samprady etc.vb`, `frmDisplayTrans.vb`** — only A1 (remark → Vibhag), plus in `frmDisplayTrans.vb:1997,2008` the author-type list dropped `authtyattr`: `SELECT authtycokm,authortype FROM authtype …` and the cell now takes `authortype` instead of `authtyattr`. Web: old popup `frmDisplayTrans` is not ported (web ports `frmDisplayTransNew`); `authtype.authtyattr` still PRESENT in DB. None beyond A1.
- **`MasterPages/frmMasterPage.designer.vb`** — toolbar tooltips now carry shortcuts: `New(Ctrl+N)`, `Save(Ctrl+S)`, `Modify(Ctrl+M)`, `Cancel(Ctrl+B)`, `Copy(Ctrl+C)`, `Delete(Ctrl+D)`, button text `Refresh(Ctrl+R)`, `Work Report(Ctrl+W)`. **UI/layout**. It is the template form (nothing inherits it); whether each real form got the same tooltips is in the per-form designers (other slices). Web: `web/apps/web/src/features/master/MasterToolbar.tsx` labels are plain ("New", "Save", …). Change needed: only if the per-screen designers confirm it — then S.
- **`MasterPages/frmWebBrowser.vb`** — comments removed. Refactor only.
- **`CommonRepository.vb:224-254` + `ICommonRepository.vb:12`** — new `ListOrReplaceRecordInUse(UserId, TableName, SearchValue, SearchString)`: runs `exec ListOrReplaceRecordInUse {UserId},'Vishay','{id}'` (table name is hard-coded "Vishay" regardless of the argument); no rows → `"Vishay is not used in any records"`; else `"Record is used at {n} places." + per-table "TableName - Count" lines + "Are you sure to replace"` (Yes/No) → pick list (`SearchString`) → `exec ListOrReplaceRecordInUse {UserId},'Vishay','{id}','{newId}'` → `"{n} Recods Replaced Successfully"` → `VishayRepository.UpdateVishay("", "", newId)`. Only caller: `Master/frmVishayMaster.vb:738,874` (Vishay Master slice). **New feature**. Web: absent (`vishay.ts`). DB: proc `ListOrReplaceRecordInUse` MISSING. Size M (belongs to the Vishay Master item).
- **`BackupDetailMRepository.vb:358`** — ExternalHDD path `\\192.168.0.50\F` → `\\192.168.0.50\H`; comments removed. Web: Backup Detail not ported (commented out in menu). None.

---

## E. Files deleted in the update

| File                                            | What it was                                                          | Web counterpart                                               | Action                 |
| ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| `Employee/frmMessages.vb`, `frmMessageEntry.vb` | internal messages (`MessageMaster`), hidden menu item + login prompt | none (no `MessageMaster` reference in web)                    | none                   |
| `Employee/frmLogReports.vb`                     | hidden "Log Reports"                                                 | none (web's `old-log-reports` is `frmLogReport`, which stays) | only the relabel in B1 |
| `Employee/UserControl.vb`                       | hidden "User Control"                                                | none                                                          | none                   |
| `Utility/frmComplainMaster.vb`                  | empty class (3 lines); menu opens `frmComplainList`, which remains   | none (`complain-master` commented out)                        | none                   |
| `CommonForms/frmCommonEntry.vb`                 | empty class (3 lines)                                                | none                                                          | none                   |

Nothing has to be removed from gglib-web. Tables `MessageMaster` etc. remain in the DB.

---

## F. Context-menu permission feature (new)

**Files**: `Updated/Library/Admin/frmContextMenuPermission.vb` (the live screen, opened by Admin › Context Menu Permission), `frmContextMenuManagement.vb` (earlier tree-view variant; **not opened from anywhere**), `Library.BusinessContract/Concrete/ContextMenuRepository.vb`, `Abstract/IContextMenuRepository.vb`, `Library.Entity/EntContextMenu.vb`, hook `MdlLib.ShowHideContextMenu`.

**Tables**

- `ContextMenu(ContextMenuKm identity, TransactionKt, ContextMenuName, enuser, endate, moduser, moddate)` — one row per right-click caption to control. `TransactionKt` → `TransactionM.TransactionKm`; 0 = "Common" (applies on every form).
- `UserContextMenuPermission(UserContextMenuPermissionKm identity, ContextMenuKt, UserKt, IsVisible bit)` — per **user** only (user type is shown in the grid for filtering, permissions are not stored per type).
- `TransactionM(TransactionKm, TransactionName, FormName, PrimaryColumnName)` — existing table, 53 rows (e.g. 9 `BookM`/"Book Master", 27 `KrutiMst`/"Kruti Master").

**Registration (admin screen)** — standard master page (`TransactionName = "ContextMenu"`, `PrimaryColumn = "ContextMenuKm"`, UcSearch/UcPrevNext, grid Id / Transaction Name / Menu Name via `ListGridData`, so it needs `tblSearch` rows for `ContextMenu`). Fields: Transaction (F2: `SELECT 0 AS TransactionKm,'Common' AS FormName UNION ALL SELECT TransactionKm,FormName FROM TransactionM ORDER BY TransactionKm`, no blank row) and Menu Name (free text — must equal the menu item's caption exactly). Right grid = all active users: new record `select 0 AS UserContextMenuPermissionKm,UTyp.UserType,U.tid AS UserKt,U.Employee_Name AS UserName,CAST(0 AS BIT) AS IsVisible,… FROM Usecurity U LEFT JOIN UserTypeMaster UTyp ON U.UserTypeKt=UTyp.UserTypekm WHERE U.IsActive=1 ORDER BY U.uname`; existing record joins `UserContextMenuPermission … AND UP.ContextMenuKt=<id>` (so users activated after the record was created do not appear and cannot be given a row). "Search User Info" box filters User Type OR User Name. Grid right-click: For Selected Record › "Set IsVisible As True" / "Set IsVisible As False" — sets the selected rows and **saves immediately** (no confirm). Toolbar Save: "Are You Sure to Save This Record?" → `ContextMenuRepository.Save` (INSERT/UPDATE ContextMenu, then INSERT rows with Id 0 and UPDATE rows whose IsVisible changed, one transaction) → "Record Saved Successfully". No validation (blank name allowed), no work-report log. Delete: "Are You Sure to Delete This Record?" → Security password → `DELETE FROM UserContextMenuPermission WHERE ContextMenuKt IN(..)`; `DELETE FROM ContextMenu WHERE ContextMenuKm IN(..)` → "Record Deleted ".

**Filtering hook** — `ShowHideContextMenu(cntMenu, TransactionName)`:
`SELECT C.ContextMenuName,CASE WHEN ISNULL(UC.IsVisible,0)=1 THEN 'y' ELSE 'n' END AS IsVisible from UserContextMenuPermission UC INNER JOIN ContextMenu C ON UC.ContextMenuKt=C.ContextMenuKm LEFT JOIN TransactionM T ON C.TransactionKt=T.TransactionKm WHERE UserKt=<curr_lnid> AND (ISNULL(C.TransactionKt,0)=0 OR ISNULL(T.TransactionName,'')=N'<TransactionName>')`
then walks the menu three levels deep; for each item whose **Text** equals a `ContextMenuName`: `Visible = (IsVisible = 'y')`. Items with no row for the user are left as they are (default = visible). No bypass for IsAdminLogin. Hides only; a hidden item's keyboard shortcut is not separately blocked.

**Callers (whole Updated tree)**: only two, both in `cntMenu_Opening`:

- `Library/Library/frmBookMasterNew.vb:3666` — it **replaces** the hard-coded rule (user types Admin/AMaster or ids 22,29,54,64,127,38,44,134,93,129,68,1,182 see `Print` and `GR`), which is now commented out. The IsAdmin rules for Restart Last Report Counter / Generate New Rep / Samvat Report In Range / Show Record Of GSearchM and the Copy Subject rule run before it and can be overridden by table rows.
- `Library/Library/frmKrutiMasterNew.vb:5842` — called first; it **replaces** the rule for `Print Report` (types Admin/AMaster or ids 22,29,54,64,38,182). The code after it still forces by `IsAdminLogin Or AMaster` (Replace Records, and the rest of that handler — Kruti slice).
  No other form calls it, and `CommonLibrary.dll` does not reference it.

- **Kind**: new feature
- **Web today**: old way. `web/apps/web/src/screens/BookMaster.tsx:818,909-913` (`PRINT_USER_IDS` + user type → `printVisible`) and `KrutiMaster.tsx:835,1001`. Context menus are built per screen (`menu` prop / `spec.contextMenu` in `web/apps/web/src/features/master/MasterScreen.tsx:32,308-320`, items typed `ContextMenuItem`). The gating is client-side only for these items.
- **Web change needed**:
  1. API: endpoint returning the current user's rows for a screen (same SELECT, keyed by the screen's `def.table` = TransactionName); cache per window open.
  2. Engine: one filter in `MasterScreen.tsx` where `menuItems` is assembled — recurse through items/submenus, and where `label` equals a `ContextMenuName` set hidden = not IsVisible; unknown labels untouched. Apply to Book Master and Kruti Master (the only desktop callers) and remove the two `PRINT_USER_IDS` lists; simplest is an opt-in flag on the screen spec.
  3. Server enforcement of hidden actions (the web's rule that the API mirrors the menu): map action ids to captions for at least Book `Print`/`GR` and Kruti `Print Report`.
  4. New screen "Context Menu Permission" (`@ScreenAccess('context-menu-permission')`, master engine + a users grid with the two right-click actions), under the new Admin menu.
     Until production has data in these tables, nothing is hidden — i.e. Print/GR would become visible to everybody, exactly as on the new desktop.
- **DB prerequisites**: `ContextMenu` MISSING; `UserContextMenuPermission` MISSING; `tblSearch` rows for `TransactionName='ContextMenu'` MISSING; `TransactionM` PRESENT; `UserTypeMaster` PRESENT.
- **Size**: L (hook + removal of hard-coded lists: M; admin screen: M)

---

## G. `CommonLibrary.dll` (decompiled diff, old → new)

Unchanged (0 lines): `UcPrevNext`, `frmDisplayTransNew` (the DLL's class), `frmList1`, `frmMultiCheckbox`, `frmSearchAndSave`, `frmDeleteList`, `PrintHelper`, `ComanFunction` (`insertworkreports`), `clsDataEditingInfo`, `UcSearchNew`, `ucDatagridPaging`, `frmLogout`, `FormMacro`, and the rest.

### G1. `UcSearch.txtSearch_KeyDown` — F2/F3 search with "Not In"

- **What changed**: for a column whose `F2SearchText` has two statements, old built `pk IN (<stmt2 with IN({TID}) → <In|Not In>(values)>)` and, for "Not In", added `AND pk NOT IN (<stmt2 with IN(values)>)`. New builds one clause: `LTRIM(RTRIM(pk)) <In|Not In> (<stmt2 with {TID} → (Select Val FROM dbo.splitstring(N'<values>','~'))>)`. So "Not In" now returns every record that has **no** matching child (including records with no children at all), instead of records that have some other child and no matching one. Also the F2 value list no longer inlines the grid ids: it calls `SetTranIds(1, <grid ids>)` and replaces `{Id}` with `SELECT TranId1 FROM TranIds`.
- **Kind**: behaviour change ("Not In") + performance refactor (TranIds)
- **Web today**: old way — `web/apps/api/src/master/master.service.ts` `search()` (two-clause form when `req.notIn`) and `fillTemplate()` (`notIn` parameter); UI `web/apps/web/src/features/master/SearchBar.tsx`.
- **Web change needed**: in `search()` for `statements.length >= 2`: `AND LTRIM(RTRIM(pk)) ${inOrNot} (<stmt2 filled with IN values>)`; drop the second clause and the `notIn` argument of `fillTemplate`. Do not adopt TranIds for `{Id}` (shared global table; the web binds one parameter).
- **DB prerequisites**: `TranIds` PRESENT, proc `SetTranIds` PRESENT (not needed by the web change).
- **Size**: S

### G2. `frmLogoutNew.SaveLog` — records the machine a user logged in from

- **What changed**: user query adds `ISNULL(IPAddress,'') AS IPAddress`. When today's `log` row already existed (i.e. on a repeat login the same day, where `LastLoginTime` is updated), it takes `Dns.GetHostName()` and its first address, and if that differs from `Usecurity.IPAddress` and `SELECT COUNT(LogEngryId) FROM LogEntry WHERE logID=… And HostName='…' AND IPAddress='…'` is 0: `INSERT INTO LogEntry(logID,logintime,HostName,IPAddress) VALUES(@LogId,@LogInTime,@HostName,@IpAddress)`. Not done on the first login of the day. Everything else (leave prompt, pending work reports, ids 100/103/118) unchanged.
- **Kind**: new feature (audit)
- **Web today**: `web/apps/api/src/attendance/attendance.service.ts:142-160` `startSession` updates `LastLoginTime` only. `Usecurity.IPAddress` is already edited in Employee Master (`employee.ts`).
- **Web change needed**: optional/decision — on the existing-log branch insert a `LogEntry` row with the request's client IP (and a host name the browser cannot supply) when it differs from `Usecurity.IPAddress`.
- **DB prerequisites**: `LogEntry` MISSING; `Usecurity.IPAddress` PRESENT.
- **Size**: S

### G3. `SendtoExcel` / new `SendToExcelWithFormatting`

- **What changed**: `SendtoExcel(dg)` truncates every cell to 32,767 characters before writing (Excel cell limit; **bug fix**). New class `SendToExcelWithFormatting(dg, CenterHeader, LeftFooter, RepeatRows="$1:$1", RepeatColumns="$A:$B")`: visible columns wider than 5 px, font "Noto Serif Devanagari" (header 9 bold, cells 10, wrapped, top-aligned), column width = px/7, GG logo in the right header, "Page &P of &N" centre footer, date `dd-MM-yyyy` right footer, gridlines, landscape, cm margins, saved as `excelfiles/<uid>/<uid>_<guid>.xlsx` and opened. Callers: `Graphics/frmGrVishayMaster.vb:712`, `Library/frmMagazineVisheshNew.vb:850` (those slices).
- **Kind**: bug fix + new feature
- **Web today**: `web/apps/web/src/features/master/sendToExcel.ts` downloads CSV (no cell limit handling, no formatting).
- **Web change needed**: truncation — none needed for CSV (optional parity). The formatted export needs a real .xlsx writer; scope with the two calling screens.
- **Size**: S (truncate) / M (formatted xlsx, counted in the callers' slices)

### G4. `clsCommon`

- `SetControl`: RichTextBox controls now get the same treatment as TextBox — configured font, double-click and **F3** open the big-text editor (`bigtext1`), Ctrl +/- change font size by 2 (min 8). **New feature**. Web: `web/apps/web/src/components/ui/BigTextBox.tsx` / `FormFields.tsx` do this for text boxes; applies only where a ported form uses a RichTextBox — check per screen. S.
- `GetConnectionString("DBLibSQL")`: `Connection Timeout=360000` → `Connection Timeout=0`. Web n/a (`db.module.ts` has its own timeouts).

### G5. Layout / n-a

- `FormPrintWithSelectedColumn`: only control positions/sizes (grid 1163→1007 wide, right-hand panels moved left). **UI/layout**. Web `PrintSelectedColumnDialog.tsx`: none or cosmetic.
- `frmAttachments.btnSave_Click`: path from `GeneralConfig` (A2). Web: attachments not ported.
- Resources: new `GGLogo` bitmap (used by G3).

---

## (1) DB objects this slice needs

| Object                                                          | Local DB | Notes / columns as far as the code shows                                                                                                                                                                                         |
| --------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextMenu` (table)                                           | MISSING  | `ContextMenuKm` int identity (read back with `@@identity`), `TransactionKt` int (0/NULL = Common), `ContextMenuName` nvarchar (length unknown), `enuser` int, `endate` datetime (`getdate()`), `moduser` int, `moddate` datetime |
| `UserContextMenuPermission` (table)                             | MISSING  | `UserContextMenuPermissionKm` int identity, `ContextMenuKt` int, `UserKt` int, `IsVisible` bit                                                                                                                                   |
| `tblSearch` rows, `TransactionName='ContextMenu'`               | MISSING  | grid needs `ContextMenuKm`, `TransactionKt`, `TransactionName` (join to TransactionM), `ContextMenuName`                                                                                                                         |
| `GeneralConfig` (table)                                         | MISSING  | `ConfigName`, `ConfigValue` (strings); names: AttachmentPath, ScanPath, EBookPath, TitlePath, GraphicsPath, GGUrl, TempGRPath, LibraryExePath, ReferenceTPath, MainRoot. Other columns unknown                                   |
| `LogEntry` (table)                                              | MISSING  | `LogEngryId` (sic; key, presumably identity), `logID` int, `logintime` (time, 'HH:mm:ss'), `HostName`, `IPAddress` (strings)                                                                                                     |
| `visheshMast.Vibhag` (column)                                   | MISSING  | rename of `remark` (local: `remark nvarchar(50)`)                                                                                                                                                                                |
| `ListOrReplaceRecordInUse` (proc)                               | MISSING  | params (UserId, TableName, SearchValue[, ReplaceValue]); result columns `TableName`, `Count`                                                                                                                                     |
| `TransactionM`                                                  | PRESENT  | 53 rows                                                                                                                                                                                                                          |
| `UserTypeMaster`, `Usecurity.IPAddress`                         | PRESENT  |                                                                                                                                                                                                                                  |
| `Print_MissingNo` (proc, `'libary'` branch), `HastpratLibNoT`   | PRESENT  | for C2                                                                                                                                                                                                                           |
| `TranIds`, `SetTranIds`                                         | PRESENT  |                                                                                                                                                                                                                                  |
| `MessageMaster`                                                 | PRESENT  | no longer used by the desktop                                                                                                                                                                                                    |
| `JSeriesM`, `ShastraPathM`, `LekhInwardM`, `EmployeeEvaluation` | MISSING  | menu targets; detailed in other slices                                                                                                                                                                                           |

## (2) Open questions for the user

1. Is the production DB already migrated (`visheshMast.Vibhag`, `ContextMenu`, `UserContextMenuPermission`, `GeneralConfig`, `LogEntry`, `ListOrReplaceRecordInUse`)? Can we get a fresh restore or the DDL? The web must switch `remark` → `Vibhag` at the same moment as the DB.
2. Admin menu: which of its four items should be live on the web (Context Menu Permission, Appraisal Report, Employee Work Report, Export Table)? Three of them are currently commented out.
3. Context-menu permissions: apply only to Book Master and Kruti Master (as the desktop does) or to every web screen? And should hidden actions also be refused by the API?
4. With empty permission tables, Print/GR in Book Master and Print Report in Kruti Master become visible to everyone. Are the production rows already filled in, or should the web keep the hard-coded id lists until they are?
5. Hidden-in-designer new items (Shastra Path Master, Employee Performance Evaluation): leave out of the web menu, as other hidden items were?
6. `LogEntry` (host name/IP of logins): wanted on the web, where only the client IP is available?
7. Renames "Old Log Reports" → "Log Report" and "Magazine Vishesh Master New" → "Magazine Vishesh Master": rename the web labels (and screen ids `old-log-reports` stay)?
8. LibNo numbering now fills gaps (`Print_MissingNo`) for all prefixes except SN/EB — confirm this should apply to the web's Book Tran and Anya Bhandar.
