# Book Master (`BookM`)

Desktop form: `GGLibrarySolution/Library/Library/frmBookMasterNew.vb` + `.Designer.vb` (no
repository: the form runs its own SQL). Its F2 popups are `Library/CommonForms/frmDisplayTransNew.vb`
(`SetForm_Prakashan`, and `SetForm_BookT` for Mark), plus `frmVishayEntry` for Vishay cells. The
Library No box opens `Library/Library/frmBookTranNew.vb`; "Add/Edit MS Data" opens
`frmBookMSData.vb`. Menu: Library › Book Master (screen id `book-master`).

Web: API `apps/api/src/master/screens/book.ts`, `book-actions.ts`, `book-tran.ts`,
`book-common.ts` (+ the engine in `master.service.ts`); UI `apps/web/src/screens/BookMaster.tsx`,
`BookTranDialog.tsx`, `BookMSDataDialog.tsx`, engine `features/master/DisplayTransDialog.tsx` and
`VishayEntryDialog.tsx`.

## Table and key

- `BookM`, PK `BookMastkm`; library numbers in `BookT` (PK `tid`, FK `BookMastkt`).
- The list shows the newest 100 books (`GetDataTable`'s `@TotRecords`). Operators (user type 3)
  never see books whose library numbers are CM/MS/CP/SN (`DefaultCondition`); the toolbar's
  "Search Not In OB" box hides the OB numbers for everybody while it is ticked (v3.4.3.1, below).
- Ctrl+L / Ctrl+U lock and unlock the selected books with the lock password (`AUTHOR_LOCK_PASSWORD`,
  the one Author Master and Kruti Master use; hard-coded on the desktop).

## The panel

Designed at 150% DPI (AutoScale 10×22, client 1446×974): positions are scaled by 0.7 across and
16/22 down, labels are 11.25 pt. Row 1's boxes are multiline. The boxes are read-only until New or
Modify (`EnableDisableDataEditing`). The MS data boxes (Bhandar, Hastprat No/Size, Pankti Akshar,
LSthal, LSamvat/VK, Adi/Ant Vakya) are not on the panel: the form keeps them in variables, and
"Add/Edit MS Data" edits them.

- Leaving Samvat computes PSamvatVK (`GetVikramSamvat`); leaving Pages computes Total Pages
  (`replacepgnum`: "1-10+5" counts 15).
- Tab in Book Name looks for other "OB" books of the same name: "Book Name Already Exists. Do you
  want to see list?" opens them.
- Group No/Name, Group Pari Name and Part are disabled when the book's group head has no parichayak
  name, and stay so until a record says otherwise (a control's `Enabled`); Save then leaves them.
- F2 on Library No opens frmBookTranNew for the book (nothing for a new book). F2 on Info reads the
  signs from the library numbers (`GetSignFromLibNo`).
- Mix Sign's F2 keeps picking until cancelled and adds the picks after what the box held.

## Business rules (Save)

- `Please Enter BookName`.
- Editing: `Please Enter LibNo in BookT`; for a book with a B0/S0/C0/X0/XP library number,
  `Please Enter Required Fields:` listing Smvt Type, Avruti, GMalaName, Pgs, TotPgs, Price, Size,
  Shape, Prakashak, Author, Bhasha, Lipi when empty.
- Numbers typed into int columns (Nakal …) fail with SQL Server's own message ("Conversion failed
  when converting the nvarchar value 'x' to data type int.") — checked before the transaction.
- Adding a book also adds one blank `BookT` row. `KrutiHeadKt` is always written 0 (as the desktop).
- After the children, `txtPrakashak` and `txtAuthor` are recomputed from the saved rows.

## F2 popups (frmDisplayTransNew, FormName "Prakashan")

| Box                  | Table                                                                   | Notes                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prakashak            | `praksnPrakT`                                                           | Name list also fills NameSelected (+ a space); Pur. is a bit. Rewritten when the box text changed.                                                                                                                       |
| Author               | `praksnAuthorT` (+ `PraksnAuthorAuthTypeT`, `praksnAuthorAuthT`)        | Author type and author cells open nested popups (multi author type / multi author with any name, padvi, sign). Rewritten on Add or when saved.                                                                           |
| Prak Vishesh         | `praksnVisheshT` (+ `PraksnVishAutT`, `PraksnVishBhasT`, `VishayEntry`) | Nested authors and languages; Detail / DetailSummary open frmVishayEntry. Save checks "Please Select ColumnNo at Seq : n" / "Please Type Pgno at Seq : n"; seq continues from the largest in use, one more per "*" mark. |
| Subject              | `BookSubjectT` (+ `VishayEntry`)                                        | Dates by InputBox (dd/MM/yyyy, today); Vishay opens frmVishayEntry ("Please Save Record First" for a new row); rows sorted by Date (none: 31/01/2050) then Seq.                                                          |
| Subject (old)        | —                                                                       | Shown, never saved (as the desktop).                                                                                                                                                                                     |
| Bhasha / Lipi        | `praksnBhashaT` / `praksnLipiT`                                         | Each pick adds the next row. Rewritten when the box text changed.                                                                                                                                                        |
| Vibhag               | `BookVibhagT`                                                           | "/" searches the second column. Rewritten only when saved.                                                                                                                                                               |
| Magazine Remark      | `BookMagazineRemarkT`                                                   | Remark and RefPageNo typed.                                                                                                                                                                                              |
| Kruti / Anya Bhandar | —                                                                       | Read-only lists.                                                                                                                                                                                                         |

Popups that the desktop fills into DataTables on F2 (Prakashak, Author, Vishesh, Subject, Bhasha,
Lipi, Magazine Remark) are sent back on Save when loaded, saved or not.

## frmBookTranNew (Library No)

A frmMasterPage that edits in place: clicking a row loads it (StrMode Edit), Save writes at once
without asking or reporting, an added row clears the boxes for the next. Modify, Cancel, Copy, Work
Report and Help do nothing; there are no Ctrl shortcuts. Show All lists every BookT row with the
panel collapsed and New/Save/Copy/Delete disabled.

- Series' F2 puts the series' next number in LibNo (`GetMemID`, which fills the series' gaps since
  v3.4.3.1, below). `LibNo Already Exist` on duplicates.
- seq: row count + 2 on add, row index + 1 on edit. MainL is set for a book's first row.
- Mark popup (`BookTranMarkT`) and Prapti popup (`praptitran`).
- Delete: where the LibNo is used (27 tables; a Book Confirmation only while 'Sent', a Lab Issue
  only while not Closed / CancelReq, v3.4.3.1); with more rows, choose one to move those references
  to (the old LibNo goes to its OldLibNo); the only row cannot be deleted while in use.
- Closing after a change reloads Book Master's Library No box.

## Delete

"Lib No is in use. Record cannot be deleted" while the book has BookT rows. Otherwise every child
table listed in the form's `DeleteTran` is deleted with the book.

## Right-click menu (cntMenu)

Ported item for item, with the `cntMenu_Opening` visibility (Print and GR only for Admin/AMaster
and the desktop's list of user ids; the report counter, Generate New Report No, Show Record of
GSearchM and Samvat Report In Range only for admins; Copy Subject only when Subject is filled).
Ctrl+G shows the current record's common group, Ctrl+P its parts group. Actions that open another screen open it in a new
window, or say the desktop's "No Record Found".

## Deliberate differences

- Blank Bhasha / Lipi / Vibhag / Prakashak rows (no id picked) are not inserted.
- Prak Vishesh detail (VishayEntry) rows follow their Vishesh row to its new key; orphans are
  removed only after every row is saved (the desktop could delete a row's details before re-pointing
  them).
- Delete removes every `DeleteTran` child table (the desktop missed some and left orphans).
- Vibhag rows are rewritten only when that popup was saved (the desktop rewrote them from a stale
  table).
- MainL in frmBookTranNew is decided on Save (checked for a book's first row); the checkbox does not
  change on New.
- The Magazine Vishesh popup box is invisible on the desktop and is not ported.

## Cards (Print › Full Card Portrait, Samvat Report In Range)

**Full Card Portrait** (`FullCardPortraitToolStripMenuItem_Click`) is on the web: action
`full-card-portrait` (`master/screens/card-actions.ts`), builder
`apps/api/src/reports/book-cards.ts`, output a report page (`ReportDocument`).

- Asks "Do You Want to Print Column No?" (Yes / No). All the answer changes on the desktop is
  whether the Parichayak Name follows the book's name; the same here.
- Data: the handler's two queries over the **selected** rows: the book with its main copy
  (`BookT.MainL = 1`; a book with two main copies gives two cards) and the krutis its copies are
  referred to by (`krutireflibno`), ordered by KrutiNo.
- The template (`\data\prakashan Card.xls`, sheet "Vertical", A–F) is **not in the repo**: its
  heading lines (rows 1–6), widths, fonts and page setup are unknown. Cells per book:

| Line | A                                                                | B                               | C                                   | D–F                                                        |
| ---- | ---------------------------------------------------------------- | ------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| 1    | PrintNo (15 pt)                                                  | BookName Part[(ParichayakName)] | samvat type / PSamvat (two lines)   | kruti 1: `name (bhasha) (KrutiNo)`, author, `Pariman lipi` |
| 2    | Shape - Size                                                     | txtPrakashak                    | Price                               | kruti 2                                                    |
| 3    | Quality                                                          | GMala[ - GMalaNo]               | (PrakSthal: empty)                  | kruti 3                                                    |
| 4    |                                                                  | txtAuthor                       | txtLipi                             | kruti 4                                                    |
| 5    | Avruti                                                           | Pages                           | Bhandar / LibNo / `ISBN- …` (lines) | kruti 5 (more lines when the book has more)                |
| last | txtVishesh (`ShortNm(Detail),…` of `praksnVisheshT`), A–F merged |                                 |                                     |                                                            |

Deliberate differences:

- **The item fails on the desktop as written**: it never opens the copied workbook
  (`objXL.Sheets("Vertical")` with no workbook open), and it reads `PrakSthal`, a column its
  query does not select (the join is commented out). The web prints what the handler is written
  to produce; the PrakSthal cell is empty.
- The desktop splits a Vishesh longer than 2674 characters over two rows and drops one character
  between them; here it is one cell.
- Books are printed in `BookMastkm` order (the desktop's query has no ORDER BY). At most 2000
  cards. One page instead of an Excel workbook; no "Export finished!" message.

**Samvat Report In Range** (admins) is **not ported**; the menu item still says so. The handler
(`SamvatReportInRangeToolStripMenuItem_Click`) asks which of four reports to run
(`frmSearchAndSave`: Kruti / Booke / Author / Prakashak Report, True/False each), then "Press
(Yes) to Show Data in Crystal Report / Press (No) to Show Data in Excel", then a "From-To Report
No" range per report (and "Enter Start Page No" for Book and Prakashak). Its data is fully in the
handler (two long queries plus `CMSP_AuthorReport` / `CMSP_PRINTPRAKREPORT`, after rewriting
`authmast.ktmepno` / `OldAnyanm` and `prakmast.ptempno` without duplicates), and all of it runs
on this database. What is missing is every layout it prints into: the four Crystal reports
(`KrutiReport.rpt`, `BookReport.rpt`, `AuthorReport.rpt`, `PrakashakReport.rpt`) are encrypted and
unreadable, and the Excel branch fills templates that are not in the repo (`swroopheadCard.xls`,
`SamvatRpt.xls`). Only the datasets' column lists are known (`DBLibSQLDataSet.xsd`: KrutiReport
`pno, Group, Swaroop, page, Author, Rsamvatvir, Vishesh, Head`; BookReport `PrintNo, BookName,
Prakashak, txtAuthor, PSamvatVK, TotalPages, VibhagName1 …`; AuthorReport `SrNo, Author, KPNo`).
The report site's Kruti Report, Book Report and Author Report (already on the web, see
`reports.md`) print the same lists from their own procedures. To port this item, a printout or
PDF of each of the four Crystal reports is needed, or the two templates.

Tests: `apps/api/test/reports-cards.integration.test.ts`.

## Files on the library folders (ported 2026-10-13)

The desktop reads the scan / e-book / title / graphics shares named in `scanpath.txt` (v3.4.3.1:
`GeneralConfig`'s ScanPath, EBookPath, TitlePath). The web reads the **server's** copies of those
folders (`apps/api/src/master/library-files.ts`: roots `scan`, `ebook`, `title`, `graphics`; the
settings and the path mapping are described in `graphics-detail.md`, "Files / disk"). A folder that
is not configured answers "The … folder is not configured on the server".

| Item                                           | Action             | What it does                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| For Current Record › View Image of This Book   | `view-image`       | SN / EB / TIT / GR: the `.jpg` / `.tif` / `.pdf` files of the book's first LibNo that has any, in the list form; the picked file opens in the image viewer at that file (Previous / Next Page step through the whole list, a multi-page TIF page by page, a PDF in the browser's PDF viewer; `GET library-file`, `library-file/info`) and the list comes back when the viewer closes, until the list is closed |
| For Current Record › Utility › Check For Image | `check-image`      | `ViewImageSignToolStripMenuItem_Click`: for each LibNo of the row (`txtBookTran` split on ","), `SN` when the scan folder has **more than one** folder or more than one file named `*<LibNo>*.*` anywhere under it (`> 1`, as written), `EB` / `TIT` when the e-book / title folder has at least one. The signs are added to the Info box with `SignBetweenStr`, once per LibNo (so they can repeat)           |
| ScanData Folder Info                           | `scan-folder-info` | The folders at the top of the scan folder; the first 7 characters of every name longer than 7 are a LibNo; `BookName, Libno, Part, PSamvatVK, TotalPages, txtPrakashak, txtAuthor, Avrutiname` of those BookT rows go to Excel. No folders: "Files Not Found"                                                                                                                                                  |

Deliberate differences:

- **Check For Image** sits in "For Current Record › Utility", which is commented out of the web
  menu as a whole (with Delete Petank, Add/Edit MS Data and Copy Subject); the item inside the
  comment is the real one and works as soon as the submenu is shown.
- Check For Image skips blank LibNos (on the desktop a blank one matches every file, so all three
  signs are added), and walks each folder once for all the LibNos instead of twice per LibNo.
- ScanData Folder Info reads the configured scan folder, as v3.4.3.1 does (v3.3.3.6 had
  `\\192.168.0.210\ScanData` in the code). The LibNos are bound as one parameter
  (`libNoList`) instead of going through the shared `TranIds` table. A scan folder whose names
  are all 7 characters or shorter gives an empty sheet (the desktop fails on `Substring`).

## Not available on the web

- Generate New Report No: Crystal Reports / Excel templates on the desktop.
- Samvat Report In Range: see "Cards" above.
- Vishesh Report, Add in Magazine Master, Show MagBookMT, User Detail (frmSearchUser), BookT's
  Update Mix Sign: not built yet; they say so.
- Delete's check of `GranthLibNoT` in the Coding database (a second database the web does not use).

## Verified

- `apps/api/test/master-library-files.integration.test.ts` (real DB rolled back, the folders a
  temporary directory): View Image and the file it serves, Check For Image, ScanData Folder Info,
  and the Library No form's four Utility items.
- `apps/api/test/master-book.integration.test.ts` (7 tests, real DB, rolled back): list limit and
  operator filter, validation (incl. the int conversion message), add with every popup, edit that
  keeps unopened children and Vishesh details, clearing the Prakashak box, delete refused then
  allowed, BookT save / duplicate / seq / marks / next LibNo, lists, actions and lock.
- `apps/web/e2e/book-master.spec.ts` (3 tests): layout and read-only panel, add a book with a
  language, the Library No form (Series F2, in-place save, work type, box refreshed), in-use delete,
  the MS data form from the menu.

## Desktop v3.4.3.1

- **Author-type text (Master batch).** `txtAuthor` on Save (`frmBookMasterNew.vb:2259`,
  `authorText` in `book.ts`) and `praksnAuthorT.txtAuth` in `UpdateTxtAuthor` (`:499`,
  `book-actions.ts`) use the type's name, `authtype.authortype`, instead of `authtyattr`. The
  Author popup's type list (multiauthortype) shows `authtycokm, authortype` only. Text stored
  earlier keeps the old attribute until the book is saved again or UpdateTxtAuthor runs for it.

- **Operator filter, "Search Not In OB" (Book batch).** `GetDataTable` (`frmBookMasterNew.vb:1603`)
  now tests `ISNULL(txtBookTran,'')`, so an Operator sees a book that has no library text at all.
  The new toolbar CheckBox `chkSearchNotInOB` adds `ISNULL(txtBookTran,'') not like '%OB%'` to the
  list and to the single-record query, and ticking or clearing it reloads the grid (`FillList`).
  Web: `bookFilter` in `book.ts` (the screen's `listFilter`, which now also gets the form's
  switches); the box is a `ToolbarCheckbox` with `listSwitch`, sent as `SearchNotInOB: true` with
  the grid, the search box's three searches, the record and every menu action that lists rows.
  Anya Bhandar's own Operator condition did not change on the desktop and is left as it was.
- **Captions and tab order.** "Pages/Total Pages", "GMala Name/No", "Group No/Name",
  "Group Pari Name/Part", "Bhasha/Lipi", "Mix Sign/Remark" (those two labels now at x 691),
  menu "Inward Master"; frmBookMSData "Pankti Akshar" with its boxes and labels at the new
  Designer positions; frmBookTranNew "Inward" / "Inward Master". The TabIndexes were renumbered to
  follow the screen, which the web's field order already did; the one visible change is that
  Subject (old) is TabIndex 0, so it is first in the web's field order too.
- **Parts Group › Show Book of Current Group Parts (Ctrl+P)**: every book with the current row's
  `GrpNo` (action `current-part-group`), like Ctrl+G for the common group.
- **Update Kruti Seq** (was "Update Book Akaradi Seq"): picks a sampraday (`columnmaster`
  `Vibhag = 'KrutiSampraday'`, list `kruti-sampraday`) and runs
  `EXEC PrintKrutiPrakashakReport @SampradayKt` (action `update-kruti-seq`, about 5 s; it
  renumbers `BookM.KrutiAkaradiSeq`). No pick, nothing runs. The old `update-akaradi-seq` action is
  gone.
- **Show BookM Record having no Record in RefLibNo** (commented out in the web menu by hand; the
  action and the commented item are updated): matched by `krutireflibno.BookTKt`, sent to Excel,
  `No Records Found` when empty.
- **Common Group lists**: "Show All Book of Common Group" asks the server for every book with a
  common group, sorted by `CommonGrpNo` (action `all-common-groups`, about 17,000 rows here);
  "Show Common Group Having Single Record" (commented out in the web menu by hand) is the newest
  100 books that are alone in their group (action `common-single`, now a list). Before, both only
  filtered the rows already in the grid.
- **Library No, next number** (`MdlLib.GetMemID`, `nextLibNo(…, { fillGaps: true })` in
  `book-common.ts`): except for the SN and EB series, the first number missing between the series'
  `BookT` numbers — the first row of `EXEC Print_MissingNo 'libary', <prefix>` (one `No` column; a
  cursor over that prefix's `BookT` rows, about 2 s for B0's 62,000) — and with no gap one more
  than the largest of `BookT` and `HastpratLibNoT`. The `BookT` range is read first with
  `UPDLOCK, HOLDLOCK`, as before; F2 on Series runs outside a transaction, so what stops two users
  from saving one number is still Save's `LibNo Already Exist`. Anya Bhandar's own copy
  (`AnyaBhandarRepository.GetMemID`) did not change and still takes `BookT`'s largest + 1.
- **Library No, Delete** (`frmBookTranNew.vb:1062`): a Book Confirmation counts as in use only
  while `BookConfirmationStatus = 'Sent'`, a Lab Issue only while its status is not Closed or
  CancelReq (`IN_USE` in `book-tran.ts`).
- **Library No, Utility menu** (`frmBookTranNew.vb:1867-2021`, ported 2026-10-13; actions in
  `book-tran.ts`). The four items compare the rows' SN / EB mix signs with the scan and e-book
  folders. "In the path" means: the name up to the first `_` of each folder at the top of the
  scan folder (SN), or of each `*.pdf` anywhere under the e-book folder (EB), unless that name
  starts with `SN` / `EB` itself. "Has the sign" means one of `SN`, `SN(SC)`, `SN(Tif-clear)`,
  `SN(Tif-Not Clear)` (SN) or `EB`, `EB (Doc-Original)`, `EB(o)`, `EB(O-Proof)` (EB).
  - "Update SN Not Exist In MixSign But Exist In Path" / "Update EB Not Exist In MixSign But Exist
    In Path" (`UpdateSNEB`, action `mixsign-in-path`): the BookT rows in the path without the
    sign. None: "No Records Found". Else "Total(n) Records Found. / Press(Yes) to see the records
    in Excel / Press(No) to update the records": Yes sends `Tid` + `SNLIbNo` (or `EB LIbNo`) to
    Excel, No gives those rows the sign and says "Records Added Successfully".
  - "Update SN Exist In MixSign But Not Exist In Path" and the fourth item, which the designer
    captions "Update EB Not Exist In MixSign But Exist In Path" again
    (`UpdateEBNotExistInMixSignButExistInPathToolStripMenuItem` → `CheckNoUpdatedSNEBSign("EB")`,
    action `mixsign-not-in-path`): the rows that have the sign and nothing in the path (LibNos
    starting with `SN` / `EB` left out), straight to Excel as `BookTKt` + `SN LIbNo` (both lists
    carry that heading). Despite "Update", nothing is written.
  - **Deliberate difference, until the database is upgraded:** the desktop reads and writes the
    signs in `BookTranMixSignT` (`INSERT … (BookTKt, MixSignKt, Seq, enuser, endate)` with the
    `visheshMast` CHKBX row of `SN` / `EB`). This database has no such table yet, so the web uses
    what the Mixsign box still writes: the names between the commas of `BookT.Mixsign`
    (`,SN,EB,`). "Has the sign" is `',' + Mixsign + ',' LIKE '%,<sign>,%'`; No appends `SN,` /
    `EB,` (`,SN,` to an empty one). The automatic `{SN}` / `{EB}` marks of the old Update Mix Sign
    are not those signs. `hasPathSign` and the UPDATE in `mixsign-in-path` are the two places to
    switch when `BookTranMixSignT` arrives.
  - Other differences: the LibNos are bound as one parameter instead of the shared `TranIds`
    table (so two folders of one LibNo list its row once, not twice); an empty folder says "No
    Records Found" (the desktop fails on `Substring`).

Deliberate differences (v3.4.3.1):

- The search box keeps the Operator's CM/MS/CP/SN condition beside the OB one, NULL-safe. The
  desktop's `FillList` (`:1716-1720`) _assigns_ the OB condition to the string it hands UcSearch,
  dropping the Operator's (which there is still the old form without `ISNULL`): a slip.
- Deleting a library number with a transfer moves **every** Book Confirmation and Lab Issue row to
  the chosen number. The desktop now moves only the ones that do not count as in use (not 'Sent';
  Closed / CancelReq) and leaves a 'Sent' confirmation or an open lab issue pointing at the
  deleted row.
- "Show BookM Record having no Record in RefLibNo" leaves the NULL `BookTKt` rows of
  `krutireflibno` out of its `NOT IN` (there are 3 here; with them the desktop's query finds
  nothing and always says `No Records Found`).
- "Show All Book of Common Group" with no such book shows an empty grid (the desktop's
  `CopyToDataTable` throws and shows the framework's message).
- Update Kruti Seq runs in the request (the default 15 s limit), not on a connection of its own.

Not done (v3.4.3.1), waiting for the upgraded database: the Mix Sign, Sampraday and Kruti Work
popups (`BookMixSignT`, `BookSampradayT`, `BookKrutiWorkT`) and Library No's Mix Sign and Condition
popups (`BookTranMixSignT`, `BookTranConditionT`); "Short Name" → "Prak Vishesh Name"
(`BookM.PrakVisheshName`); the Info box's signs from `BookTranMixSignT`; Add Sampraday; the
rewritten Update MixSign For Selected Record; Import Data From Excel
(`ImportBookMRecordsFromExcel`); the right-click permissions (`ContextMenu`,
`UserContextMenuPermission`: `PRINT_USER_IDS` stays); identity keys on `praksnBhashaT` /
`praksnLipiT`; `visheshMast.Vibhag`. Until then:

- **"Transfer MixSign from BookT to BookM" stays as it is** (the desktop disabled it): on this
  database `BookM.MixSign` and `BookT.Mixsign` are still the live storage. It, the Mix Sign box and
  Library No's "Update Mix Sign" go together with the Mix Sign popups.
- "Copy EB/SN to TempGr" (it copies files to `c:\tempgr` on the PC) is not in the web menu.

Engine pieces added for this batch (opt-in): `ScreenDefinition.listFilter(user, params)` and
`params` on the search / range / blank requests and the record query; `ToolbarCheckbox.listSwitch`
with `ScreenActions.switches`; `switches` on an action request (its `ctx.list` rows follow them);
`save(…, { env })`.

Tests: `master-book.integration.test.ts` (the five "v3.4.3.1:" tests), `e2e/book-master.spec.ts`
(captions, the Search Not In OB box).
