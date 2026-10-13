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
| AuthorIdentityTran, AuthorGuruTran, SamvatTran                 | AuthorIdentityT, AuthorGuruT, AuthorSamvatT            | delete + insert                                   |
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
that open `frmWebBrowser` open the same pages of the desktop's report site in a new tab
(`LEGACY_WEB_URL`, the contents of `ggurl.txt`). Lock Author / Unlock Author accept
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
- The Sampraday upsert prunes against its own ids only (the desktop's list also carried AnyName2 ids).
- Print Books for Selected Author works for several authors (the desktop's SQL lacked the `OR`s).
- Copy/Paste Grid keep the copy in the browser, not in `TempGrid<user>` tables; Paste Grid pastes
  after the current row (the desktop forced row 1).

## Not available on the web

- Show Image of RefrenceT and Show Attachment: files on `F:\scantesting` and
  `\\192.168.0.210\Attachments`, which the web server cannot reach. They say so.
- Report pages (Kruti/Author/Author Detail/Parampara report, Kruti Author Check) need
  `LEGACY_WEB_URL`; without it they say it is not configured.
- Ctrl+numpad-plus / minus in popup cells (frmVGPMmast: add or rename a master entry) — shared
  engine item, not built yet.
- F2 in the search box with "User Master" (frmSearchUser) — shared engine item, not built yet.

## Verified

- `apps/api/test/master-author.integration.test.ts` (8 tests, real DB, rolled back): validation,
  popups and lists, add with 9 popups (non-identity keys, AnyName books, Samvat derivation, New work
  report), edit (unopened popups untouched, rename cascade, Modify work report), in-use delete and
  delete log, the menu actions, F1 admin rule.
- `apps/web/e2e/author-master.spec.ts` (3 tests): layout, New's RecordNo and digits-only box, F2
  popups (AnyName typing, Guru list), save, right-click marking, in-use delete, the Work Type prompt.
