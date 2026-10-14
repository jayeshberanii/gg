# Author Master (`authmast`)

Desktop form: `GGLibrarySolution/Library/Master/frmAuthorMaster.vb` + `.designer.vb`;
repository `Library.BusinessContract/Concrete/AuthMastRepository.vb`; entity
`Library.Entity/EntAuthMast.vb`. Its F2 popups are `Library/CommonForms/frmDisplayTransNew.vb`
(`SetForm_Author`, and `SetForm_Common` for Address and the F1 reference popup). Menu: Master ›
Author Master (screen id `author-master`).

Web: API `apps/api/src/master/screens/author.ts` (+ engine `master.service.ts`,
`work-report-log.ts`); UI `apps/web/src/screens/AuthorMaster.tsx`, `AuthorTree.tsx`, engine
`features/master/DisplayTransDialog.tsx`.

## Table and key

- `authmast`, PK `authorcokm` (identity).
- `GetTableKt()` looks up `columnmaster` `Vibhag='TableNm' AND Name='PrakMast'` (not
  'AuthMast'). It is what `CheckInUse` joins `RefrenceT` on — kept as is.

## The panel

Every box is a TextBox at its designer position; labels are shared ("Done By/Grade" covers two
boxes), so the boxes carry no labels of their own. `txtLibNo` is invisible but loaded and saved.
`txtSignInfo` (read-only) shows `SEL` when a `SelectionM` row uses the author. `chkGuru` sits on the
form over the toolbar (x 775, anchored right). `lblEntry` shows who entered/modified the record
(`clsCommon.GetEntryUser`). `lnkRefSamvat` opens frmPopup with the referenced `AuthorSamvatT` row.
RecordNo and ReportNo accept digits only. A record with `Locked` or `IsLockedByAdmin` set cannot be
modified, deleted or copied.

Every "…Tran" box is an ordinary, editable text box holding a summary; F2 opens its popup. After
the popup's Save the box is rewritten from its rows by `Txt_KeyDown`'s generic join (each row's
non-empty values joined by `-`, rows by `,`; bit columns count, so loaded rows add `-True`/`-False`
— 144 authors' `txtGuru` in the DB look like that, and the desktop keeps writing it). Sampraday has
its own join. The box's text is what Save writes to `Identyty`, `txtParampara`, `txtGuru` and
`txtSampraday`.

## Business rules (`GetValidationMessage` + `Save`)

- `Please Enter Name`, `Please Enter DoneBy`, then `RecordNo Already Exists` (checked for a new
  record too: `authorcokm <> 0`).
- Save asks "Are You Sure to Save This Record?"; renaming an existing author also asks "Do You Want
  To Add Entry In AnyaName And Related Transactions?". Yes adds the old name to `AuthMAnyNmT` (unless
  there) and points `praksnAuthorAuthT`/`krutiautht` rows with no `AuthAnyaNmKt` at it.
- `txtAuthorName = authorname + "(" + any names + ")" + "(" + Sign + ")"` (empty parts dropped); the
  any names come from the AnyName popup if opened, else from the DB.
- `samvatkindkt`/`vksamvat` (`SetSamvatDetail`): the last `IsPrint` Samvat row; otherwise the first
  kind in a fixed order of preference (रचना संवत्, विद्यमान् सं., …); otherwise the first row's kind.
  `samvatdetail` is just its text box — not derived.
- Kt boxes and numbers are written as 0 when empty, text as '' (the desktop's VB defaults).
- New starts RecordNo at `MAX(recordno)+1`.

## F2 popups (frmDisplayTransNew)

Rows come from `tblSearch.F2EntryText` for the column (Type 'T', `{Id}` = the record); the columns
and their types from `sys.dm_exec_describe_first_result_set`. Per popup: which columns are hidden,
which are typable (`remark` always is), the cell lists and where the cursor goes next, and the row a
new line gets — all in `AuthorMaster.tsx` (`TRANS`), with the cell lists' SQL in `author.ts`.
Behaviour of the popup itself: opens maximized with one blank row if empty; F2 or typing a letter
or digit on a list cell opens the list seeded with `*<key>`; Enter on the last row adds a row;
F4/F5 move, F6 adds, Delete removes, F7/F8 find, Alt+S saves, Esc asks "Are You Sure to Exit?";
right-click has Copy/Paste Grid and Cell, Cut/Paste Row, Paste Data From Excel, Send To Excel.
Samvat recomputes `Vksamvat` (`GetVikramSamvat`, sadi names via `sadimst`) as the desktop does.
AnyName's LibNo cell opens a nested popup over its books (`multiLibNo`). The Name1 box has its own
local popup (`AuthorName`: the name's reference book and page).

| Box                                                            | Popup rows                                             | Saved as                                          |
| -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| AuthMAnyNmTran / AuthMAnyNm2Tran                               | AuthMAnyNmT(2) + AuthMAnyLibNoT(2)                     | upsert by id + prune, both tables                 |
| AuthorParamparaTran                                            | AuthorParamparaT                                       | delete + insert, key max+1                        |
| AuthorVishTran                                                 | AuthorVishT                                            | delete + insert, key max+1                        |
| AuthMContactTran                                               | AuthMContactT                                          | delete + insert, key max+1                        |
| AuthMSubTran                                                   | AuthMSubT                                              | delete + insert, key max+1                        |
| AuthUnavailKrutiTran                                           | AuthUnavailKrutiT                                      | delete + insert, key max+1                        |
| AuthorNoteTran / AuthorNote2Tran                               | AuthorNoteT / AuthorNoteT2                             | delete + insert                                   |
| AuthorRefLibnoTran                                             | AuthorRefLibno (`reflibno` = LibNo, `lipi` = lipiname) | delete + insert                                   |
| AuthorIdentityTran, AuthorGuruTran                             | AuthorIdentityT, AuthorGuruT                           | delete + insert                                   |
| SamvatTran                                                     | AuthorSamvatT                                          | upsert by `AuthorSamvatKm` + prune (v3.4.3.1)     |
| AuthorPattavaliTran, SampradayTran, AnyaYogdanTran, ParyayTran | …                                                      | upsert by id + prune                              |
| AddressTran                                                    | PrakMAddT (`AuthorcoKt`)                               | only when its text changed from the loaded record |
| KrutiTran                                                      | the author's Kruti names                               | not saved (a read-only list)                      |

**Only popups the user opened are rewritten** (the desktop only passes DataTables with columns).
Web payload: the text box under its column name, the rows under `<column>.Rows`, a second result
set under `<column>.Extra`.

After the save: every author whose guru this one is gets `txtGuru` rebuilt; on edit, each Kruti
whose first author this is gets `krutimst.AuthSamvat` updated.

## Work report (insertworkreports)

Every Save and Delete is logged in `WorkReportM` (`work-report-log.ts`, ported from
`ComanFunction.insertworkreports` both overloads, `CompareDataTable`, `GetMistakeCount`). A new
record logs "New"; a modification by someone who did not create it in the last day compares the
record before/after, then asks for the Work Type (the five `ColumnNo=100` types, pre-searched with
today's type) — the web asks after "Record Saved Successfully", like the desktop. An opened Samvat
popup is logged row by row. Delete logs "Delete <name>". Lock Selected Records logs a Lock entry.

## Delete

"Are You Sure to Delete This Author ==> <name>", the Security password, then `CheckInUse` (messages
verbatim: Book Master, kruti Master, Author Parampara Data, …, Author Reference Data).

## F1

`tblSearch.HelpText` ("Table|Key|RecordKt") names `RefrenceT` rows about the field; F1 shows them in
the ReferenceT1 popup. Only an administrator's Save is written (`SaveReference`); the API enforces it.

## Right-click menu (cmsSamv)

All visible items are ported, in the desktop's order, with its messages. Ids follow the desktop:
`GetSelectedTranId` (tree node in tree mode, else selected rows), selected rows, all grid rows
(Find Missing/Duplicate RecNo, Half Name match), or ticked tree nodes (Author Detail Report, Author
Reference, Kruti Author Check). Tables the desktop pushes into Excel download as CSV. Report items
that open `frmWebBrowser` show the same pages of the desktop's report site, built by the API and
shown in the web's own report window (see `reports.md`). Lock Author / Unlock Author accept
`AUTHOR_LOCK_PASSWORD` or the second Security password (the desktop hard-codes the first one in
source; here it is server config). Update pno in Auth-Prak Master runs on its own connection with
no timeout. Display In Tree asks Uplevel/Downlevel and गुरुपरंपरा/वाचकवंश परंपरा, then shows the
515×296 tree; Print Tree / Print Selected Tree download a Word document.

Hidden on the desktop and not ported: For Program Purpose, View Image, Rename Guru, Delete books /
Delete author not in use, Update ASamvatVK in Entrmast (`Visible = False`, no handlers).

## Deliberate differences

- Author Reference popup: the desktop hides rows whose book sits in a "/" cupboard rack and then
  deletes them on save; the web keeps them.
- `AuthUnavailKrutiT.enuser`: the desktop writes a never-set local (0); the web writes the user.
- New rows' temporary ids are unique negatives (the desktop draws random -500..-1, which can
  collide and mix two new any names' books).
- Update Count shows its message once, not once per author.
- **Samvat save, `RefSamvatKt`** (v3.4.3.1). When Samvat rows are removed, the desktop runs
  `UPDATE authmast SET RefSamvatKt=NULL FROM authmast INNER JOIN AuthorSamvatT ON
authorcokm=AuthorKt WHERE AuthorKt=<id> AND AuthorSamvatKm NOT IN(<kept>)`: it clears **this
  author's** reference whenever any of its rows is removed, even when the referenced row stays,
  and leaves other authors pointing at a removed row. The web clears `RefSamvatKt` exactly
  where it points at a row being removed — for any author — and nowhere else.
- Samvat rows: a row whose `AuthorSamvatKm` is not one of this author's rows is inserted as
  new (the desktop would UPDATE whichever row has that key, another author's included).
- Print Books for Selected Author works for several authors (the desktop's SQL lacked the `OR`s).
- Copy/Paste Grid keep the copy in the browser, not in `TempGrid<user>` tables; Paste Grid pastes
  after the current row (the desktop forced row 1).

## Desktop v3.4.3.1

Carried over:

- **Samvat rows are upserted** by `AuthorSamvatKm` (insert for key 0, update otherwise, then
  prune) instead of delete + insert, so the keys `authmast.RefSamvatKt` stores survive a save.
  See the two deliberate differences above. The row-by-row Samvat work report is unchanged (it
  compares the popup's rows before the save with the rows sent).
- **Sampraday box text**: `SampradayName(Remark)` per row — the old code repeated the name in
  the brackets (`transSummary.ts` `sampradaySummary`). This is what `txtSampraday` stores.
- **The Sampraday id box** (`Sampradaykt`, beside the Sampraday popup box) is disabled
  (`alwaysDisabled`); its value is still loaded and sent.
- **Show In Use (For Selected Record) › BookT**: the Library No dialog (`BookTranDialog`) over
  the BookT ids of the desktop's UNION query for the selected grid rows — the name's reference
  book, the Guru parampara rows (first kind present among गुरु, विद्यागुरु, गुरुपरंपरा), AnyName2
  books, Sampraday books and printed Samvat rows (action `in-use-book-t`). Like the desktop it
  shows no message and opens empty when nothing matches.
- **Now the same as the desktop** (they were web-only fixes before): Pattavali rows are upserted
  with no prior delete, and the Sampraday prune list holds only Sampraday ids.

Waiting for the upgraded database (not built): the Patrika reference in the Name popup
(`authmast.AuthorNameRefPatrikaKt`), Print Report › Author Check Report (procedure
`PrintAuthorCheckReport`), and Print Author Info's new SQL (same missing column; the item is
commented out in the web menu anyway). Show Image of RefrenceT now reads its path from
`GeneralConfig` on the desktop; the web reads `REFERENCET_PATH` (see the section below).

## Show Image of RefrenceT for Selected Record (frmDisplayImages, ported 2026-10-13)

Desktop (`frmAuthorMaster.vb:2423`): for the grid's selected rows,
`select distinct r.LibNo, r.Pgno from RefrenceT R where isnull(r.LibNo,'')<>'' AND isnull(r.Pgno,'')<>'' AND r.Tablekt=<TableKt> and r.RecordKt in(<ids>)`,
each row a `clsImages` (Folder = LibNo, File = Pgno), handed to `frmDisplayImages` with
`MainPath = ReferenceTPath` (`F:\scantesting\`; v3.4.3.1: `GeneralConfig`'s ReferenceTPath).
`TableKt` is the `columnmaster` row 'PrakMast' on **both** Author and Prakashak Master, so an
author and a prakashak with the same id share their reference rows.

`frmDisplayImages_Load` turns each row into files: the folder is the first directory anywhere
under MainPath whose path contains `<LibNo>_`, else `<MainPath><LibNo>`; the files are
`<page>.jpg` for each page of Pgno — a comma list, or `from-to` for a run of page numbers. Files
that do not exist are collected into "Following Files Not Found : " + one path per line, shown
once the form has loaded. The form (maximized, LightSteelBlue, title "frmDisplayImages") shows the
files six at a time in two rows of three 330×330 boxes (StretchImage), with a toolbar: Exit,
`<<`, `<`, "Page" [combo of pages] "of" [pages], `>`, `>>`, "Total Records" [count]. A double
click on a picture opens the file (`Process.Start`), or says "Image not Found" on an empty box.

Web: action `refrence-images` (`apps/api/src/master/reference-images.ts`) does the lookup against
the server's copy of the folder (root `referenceT`: `REFERENCET_PATH` / `REFERENCET_DIR`, or
`LIBRARY_FILES_DIR/scantesting`) and returns the files by their desktop paths plus the message;
`DisplayImagesDialog` is the form (maximized dialog, same toolbar, the boxes grow with the window
as `ResizeControl` does), each picture served by `GET /api/master/<screen>/library-file?path=`.
A double click opens the image viewer (`features/master/ImageViewer.tsx`) over all the files, at that picture.

Deliberate differences (desktop slips not copied):

- **Pages.** The desktop sets the page count to `lstFiles.Count / 6` rounded to the nearest whole
  number (banker's rounding), so 7, 8, 13 or 14 pictures leave the last ones on no page; `>>` goes
  to the last page but keeps the previous page's pictures. The web has ⌈n / 6⌉ pages and every
  button shows that page's pictures.
- **Pgno with commas.** The desktop splits on "," but then tests the _whole_ text for a range, so
  `1-3,7` shows 1 to 3 and never 7, and `1,2-4,6-8` looks for `2-4.jpg`. The web reads each comma
  part on its own (`1-3,7` → 1, 2, 3, 7), trims blanks around a part, and takes a part that is not
  two numbers around one "-" as a file name. A run is capped at 1,000 pages.
- File names are matched without regard to case (the desktop's `File.Exists` on Windows does the
  same; the server's file system may not).
- The "Files Not Found" message comes before the dialog opens rather than over it. With no row
  selected the desktop fails on `Substring`; the web opens the empty form.
- The form is a dialog over the screen, not another MDI child.

Tests: `apps/api/test/master-library-files.integration.test.ts`.

## Not available on the web

- Show Attachment: `CommonLibrary.frmAttachments`, ported as `AttachmentsDialog` (see
  "Attachments" below).

## Attachments (CommonLibrary.frmAttachments)

Shared by Author Master, Letter Bhet, Letter Demand, Patrika and Outsider Master (Utility › Show
Attachment(s)): `TranName` = the form's table, `TranKm` = the record on the form. A definition
opts in with `attachments: true`; the routes are `/api/master/<screen>/attachments/<id>`
(`attachments.service.ts`).

- Rows: `Attachments (AttachmentKm identity, TranName, TranKm, FileName varchar(50), FilePath
varchar(150), FileType varchar(5), enuser, endate)`. `lblEntry` = `GetEntryUser` on
  `enuser` / `endate` only.
- Desktop: New = OpenFileDialog (one file, a row with id 0); Save asks "Are you sure to save these
  attachments?", inserts the new rows, copies each file (overwriting) to
  `\\192.168.0.210\Attachments\Production\<TranName>/<TranKm>/<FileName>` (also the stored
  `FilePath`; v3.4.3.1 reads the folder from `GeneralConfig.AttachmentPath`) and closes; Delete
  asks "Are you sure to delete selected records?", deletes rows and files, then "(n) Records
  Deleted Successfully"; double click on File Name opens the file, or "File At Location : <name>
  Does Not Exists" (title "File Not Found").
- Web: the same, with two settings. `ATTACHMENT_SHARE` is the folder as the desktops reach it
  (what goes into `FilePath`); `ATTACHMENT_DIR` is that folder as the API server reaches it. A
  file is found by `<ATTACHMENT_DIR>/<TranName>/<TranKm>/<FileName>` whatever host the stored
  path names, so rows saved by either application open in both once the folder is the same one.
  Without `ATTACHMENT_DIR` the rows are listed but cannot be opened or changed (503).
- Differences: a name or extension that does not fit the columns is refused (the desktop fails
  with SQL Server's truncation error); a file already gone does not stop Delete; images, PDF and
  text open in a browser tab, any other type downloads; 30 MB per file.
- Ctrl+numpad-plus / minus in popup cells (frmVGPMmast: add or rename a master entry) — shared
  engine item, not built yet.
- F2 in the search box with "User Master" (frmSearchUser) — shared engine item, not built yet.

## Verified

- `apps/api/test/master-author.integration.test.ts` (10 tests, real DB, rolled back): Samvat
  upsert and `RefSamvatKt`, Show In Use › BookT, validation,
  popups and lists, add with 9 popups (non-identity keys, AnyName books, Samvat derivation, New work
  report), edit (unopened popups untouched, rename cascade, Modify work report), in-use delete and
  delete log, the menu actions, F1 admin rule.
- `apps/web/e2e/author-master.spec.ts` (3 tests): layout, New's RecordNo and digits-only box, F2
  popups (AnyName typing, Guru list), save, right-click marking, in-use delete, the Work Type prompt.
