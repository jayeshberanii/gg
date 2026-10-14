# Kruti Master (`KrutiMst`)

Desktop form: `GGLibrarySolution/Library/Library/frmKrutiMasterNew.vb` + `.designer.vb` (no
repository: the form runs its own SQL). Its F2 popups are `Library/CommonForms/frmDisplayTransNew.vb`
(`SetForm_Kruti`), plus `frmVishayEntry` for the Subject and Title-name cells. Menu: Library ›
Kruti Master (screen id `kruti-master`).

Web: API `apps/api/src/master/screens/kruti.ts` and `kruti-actions.ts` (+ the engine in
`master.service.ts`); UI `apps/web/src/screens/KrutiMaster.tsx`, `KrutiTree.tsx`.

## Table and key

- `krutiMst`, PK `krutimstkm` (identity). The human number is `KrutiNo` (New: max + 1, `finxmaxtid`).
- The grid lists **every** kruti (~45k rows): the form's own `GetDataTable` has its `TOP(100)`
  commented out. Its columns come from tblSearch (`UcSearch.GetColumns`) plus the form's own
  `JoinCondition` (the `tblUplvl` up-level join and two `visheshMast` aliases), which the engine
  now takes as `ScreenDefinition.listJoin`. FillList then appends each kruti's any names to
  `extranm` as `(name,name)` (`decorateList`); a search does not.
- The record query (`GetDataTable(TransactionName, Id)`) returns `grpno`, `groupnm` and
  `Rsamvatvir` twice (a computed column and the raw one). .NET keeps the computed one under the
  name and calls the raw one `…1`; `recordExtras` rebuilds the same pair, since a JS row keeps
  only the last column of a name.

## The panel

`SplitContainer1.SplitterDistance` 349, panel 1006 wide, Times New Roman 14.25 labels and boxes,
AliceBlue. Every box is read-only until New or Modify (`EnableDisableDataEditing` with the
panel); the check boxes stay clickable (only TextBoxes are made read-only).

- `txtsamvattypeName` is a Kt box on `samvattype`; `txtrachsamvat`'s F2 (sadimst) also puts the
  sadi value in `txtRachnaSadi`. Leaving `txtrachsamvat` recomputes `txtRsamvatvir`
  (`GetVikramSamvat`).
- `txtRsamvatvir`, `txtRachnaSadi`, `txtextraid2` are `Enabled = False`. When `extraid2` holds a
  digit other than 0, Samvat Type, Samvat and Samvat Kind are disabled (`txtextraid2_TextChanged`).
- Leaving `txtKrutiNo` checks for another kruti with that number ("Cannot Enter RecordNo n",
  title "RecNo n already Exist") and clears the box.
- `txtgroupnm` shows `(groupno)groupname` of the kruti's group and is enabled only for the group's
  head. F2 on it opens the group's popup, whose Save rewrites `KrutiGroupT` at once (not with the
  record).
- `txtkrutiRelTran` (वि.क्र.): F2 asks "select by KrutiName ?", picks an up-level kruti, adds it and
  asks "Do You Want To Add More Records?"; **Enter** opens the popup itself.
- Hidden: `txtkrutiname`, `txtparimanpattern`, `txtgrpremark`, `chkPending`, `chkPublished`,
  `chkPrapt` (loaded and saved). `chkDummy` sits over the toolbar.

## Business rules (Save)

- `KrutiNo is Null so record can not be saved ` when KrutiNo is 0; a duplicate KrutiNo is refused.
- `Rsamvatvir` is saved as 0 unless it, Samvat Type and Samvat are all filled.
- `vishesh` is always written empty (the desktop writes a blank TextBox); `groupnm` is written
  only while its box is enabled.
- Afterwards `Bhasha`, `Pariman`, `Swaroop`, `Vibhag`, `AuthSamvat` are recomputed from the child
  rows; `Author` / `SAuthor` by `UpdateKrutiAuthor`; and the global
  `Rsamvatvir = 0 where no samvat` reset (`UpdateKrutiSwaroopNo`) runs.
- Authors (`krutiauthT`) and second authors (`krutiSautht`) are rewritten only after their popup
  was saved (`boolAuthorSel`).
- Work report: `insertworkreports` with the desktop's adjustments (samvat and prasasti texts
  joined, locked/count/remark/… copied back) and Note / RefLibNo / Title compared row by row.

## F2 popups (frmDisplayTransNew, FormName "Kruti")

| Box                      | Table(s)                                                                         | Notes                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Kruti Anya Name          | `KrutiNmT`                                                                       | Name type (`NameType`).                                                                                                              |
| Author / SAuthor         | `krutiauthT` / `krutiSautht`                                                     | Author list shows every any-name; the box reads `type name(guru)[identity] (avastha)`.                                               |
| Pariman / SubPariman     | `krutiparimnT` / `krutisubparimnT`                                               | Sign, Pariman type (`ParimnType`), sign.                                                                                             |
| Title                    | `KrutiSubTitleT` (+ `KrutiSubTitleRagT`, `VishayEntry` 'KrutiTitleSubTitleName') | RagaName opens the rag popup, txtSubTitleNm opens frmVishayEntry; "Update Pariman Count" puts the total into a सर्वगाथा Pariman row. |
| Vishay                   | `krutivishayT`                                                                   | Sign, KrutiMSubject, vachan, vibhakti.                                                                                               |
| वि.क्र. (up level)       | `krutiRelT`                                                                      | See above.                                                                                                                           |
| Swaroop                  | `krutiSwaropT`                                                                   | "/" searches the second column.                                                                                                      |
| Rag                      | `KrutiRagT` (+ `KrutiRagTRagTypeT`, `KrutiRagTRanNmT`)                           | Rag type / rag name cells open their own popups.                                                                                     |
| RefLibNo                 | `krutiRefLibno`                                                                  | Save: a RefLibNo and TypeName per row, at most one IsPrint. Right-click "Show Book Detail".                                          |
| Note                     | `KrutiNoteT`                                                                     | Save: book, page and column per row.                                                                                                 |
| Bhasha / Vibhag / Sampr. | `krutibhasT` / `KrutiVibhagT` / `KrutiSampradayT`                                |                                                                                                                                      |
| कृति विषय                | `KrutiSubjectT` (+ `VishayEntry` 'KrutiSubject')                                 | As Book Master's Book Subject.                                                                                                       |

## Delete

"You can not delete Group's Master Record First Remove Group Member" while other krutis share its
group; "Delete the Kruti No n Kruti Name :- x? ", the Security password; then every use that
stops it, in one message (v3.4.3.1, see below). The work report says `DEL-<name>`.

## Right-click menu (cntMenu)

Ported item for item (items the user commented out in `KrutiMaster.tsx` stay out). Print Report
is shown only to Admin / AMaster and user ids 22, 29, 54, 64, 38, 182. Lock / Unlock By Admin are
panel buttons since v3.4.3.1 (below), with the form's own password (`KRUTI_LOCK_PASSWORD`).
Ctrl+L / Ctrl+U (the hidden Lock Selected Kruti items) use the Security
password (`LockUnlockTransaction`). Ctrl+9 is Insert Ref Library No, Ctrl+T Toggle MultiSelect.
Report pages are built by the API and shown in the web's report window (see `reports.md`);
tables the desktop sends to Excel download as CSV.

## Deliberate differences

- A popup's table is rewritten only when that popup was opened; the desktop deletes and re-inserts
  every child table on each Save from what it loaded. The result is the same except for what the
  desktop loses: `KrutiMulT` (never loaded, so wiped on every save) and subtitle names.
- Subtitle names (`VishayEntry`) follow their subtitle to its new key; the desktop left them on the
  old key and its own clean-up deleted them. A kruti whose titles are only partly named saves (the
  desktop failed with "The source contains no DataRows").
- Editing leaves `KrutiHeadkt` alone. The desktop writes `Val(txtVibhagTran.Tag)`, a Tag nothing
  sets, so every desktop edit zeroes it (915 krutis still have one; the Update Kruti Swarop Head
  menu item reads it; Vibhag did until v3.4.3.1).
- Blank popup rows (no id picked) are not inserted.
- Delete removes every child table, including second authors, sub pariman, vibhag, sampraday and
  subjects, which the desktop left behind.
- The Title popup's rag cell is RagaName; the desktop's column index points at Antvakya since
  txtSubTitleNm was added.
- The second-author popup works when empty (the desktop failed on its missing UpdateAuthorSamvat
  column).
- New clears the panel's check boxes (the desktop kept the previous record's).
- Replace LibNo In › Reference / Note honours "No" (the desktop replaced either way).
- Add RefLibNo in selection Master inserts with column names (the desktop's positional insert no
  longer fits `SelectionM` and always failed).
- Delete From Group says when the kruti is the group head (the desktop's message was unreachable).

- Ctrl+T and Ctrl+9 are browser shortcuts (new tab, last tab) that a page cannot take over; the
  menu items do the same.

## Cards (Print Report › Full Card …, Main Report As Agam Suchi New)

Code: `apps/api/src/reports/kruti-cards.ts`, actions in `master/screens/card-actions.ts`
(`full-card-portrait`, `full-card-landscape`, `agam-suchi-new`). Output: a report page
(`ReportDocument`, see `reports.md`) with Save and Print.

What the source gives and what it does not:

- The Excel templates (`\data\KrutiCard.xls`, `\data\KrutiMater Card.xls`) are **not in the
  repo** (there is no `data` folder beside the EXE). The handlers decide which value goes into
  which cell; the template's own heading lines (rows 1–5), column widths, fonts, borders and page
  setup are unknown. The web page has no heading lines and its column widths are a guess.
- The `.rpt` files are Crystal's encrypted format and cannot be read (see `letter-bhet.md`).

**Full Card Portrait** (`FullCardPortraitToolStripMenuItem_Click`, sheet "Vertical", A–G). For
every row the grid shows (`dv.ToTable`, in the grid's order): the record as `GetDataTable` reads
it (the tblSearch column list) and tblSearch's `KrutiNoteTran` / `krutiRelTran` queries.

| Line | A                     | B                                                               | C                                         | D–G                   |
| ---- | --------------------- | --------------------------------------------------------------- | ----------------------------------------- | --------------------- |
| 1    | KrutiNo (15 pt)       | extranm (BhashaTran)                                            | SwaroopTran                               | note 1                |
| 2    | up levels' KrutiNo    | AuthorTran                                                      | KrutiTypeName                             | note 2                |
| 3    | PurnaName             | KrutiParimnTran " ," prasastitypeName, a space, prasastipariman | samvattypeName rachsamvat(samvatkindName) | note 3                |
| 4    | krutireflibnoTran     | KrutiNmTran                                                     | rachnasthalname                           | note 4                |
| 5…   |                       |                                                                 |                                           | notes past the fourth |
| last | adivakya (A–C merged) |                                                                 |                                           | antvakya (D–G merged) |

A note's cells: D `ColShortNm-SeriesName`, E `wordnm`, F the publication, G
`<RefPlace> पृष्ठ-<pgno> <Sign>`.

**Full Card Landscape** (`FullCardToolStripMenuItem_Click`, sheet "Sheet1", A–H): line 1
KrutiNo, krutiname, –, `[कर्ता  ]samvattypeName rachsamvat` (कर्ता when `extraid2` contains 1);
line 2 –, extranm, –, rachnasthalname; line 3 PurnaName, –, KrutiTypeName, KrutiHeadName; line 4
granthagra, –, `prasastitypeName prasastipariman`, –; notes in E–H (E is
`KrutiColName-SeriesName`); last line adivakya (A–C), antvakya (E–H). The cells marked – are
filled from text boxes the handler never loads (`FillCommonDataTable` is commented out), so they
are empty: up levels, other names, swaroop, bhasha, author, pariman, lib nos, mul.

**Main Report As Agam Suchi New** (`MainReportAsAgamSuchiNewToolStripMenuItem_Click`): the same
questions as Main Report As Agam Suchi (Sampraday, its krutis, "Do yo Want to Print Adi/Ant
Vakya?"), `SetTranIds`, then Crystal `KrutiAkaradiAgamSuchiReport.rpt` with `@SampradayKt`,
`@PrintAdiAnt`, `@PrintSwaroopShortName = 0`. Its procedure is
`PrintKrutiAkaradiAgamSuchiCrystalReport`: one line per kruti carrying its group's number, name
and size (`MainSeqStr`, `KrutiParichayakName`, `MainSeqCountStr`). **The layout is provisional**:
the lines are printed under "`<MainSeqStr>. <name> (<count>)`" headings in the seven columns of
the Agam Suchi page (क्रम, स्वरूप, उ.क्र., कर्ता, भाषा, संवत्, detail), which shows the same list.
`RefLibNo` / `RefPgNo` are returned but not printed (unknown whether the Crystal layout shows
them).

Deliberate differences:

- **These items fail on the desktop as written**; the web prints what the handlers are written
  to produce.
  - Landscape never opens the copied workbook (`objXL.Sheets("Sheet1")` with no workbook), so it
    stops with Excel's error before writing a cell. It also reads `KrutiHeadName`, which the
    record query does not return (empty here).
  - Both read the note's `prakashankt`, a column tblSearch's note query no longer has, so
    Portrait stops at the first kruti that has a note. The web prints the note's book copy
    (`BooktName`, the LibNo), as the form's own note summary does (`-प्र.क्र.-<LibNo>`).
- One page instead of an Excel workbook; no "Export finished!" message. Orientation is chosen in
  the browser's print dialog.
- Each kruti is a table of its own; the desktop's 1-point separator row and the Adi/Ant row
  height (14/16 pt per 50 characters) are not reproduced: the row grows with its text.
- At most 2000 cards in one page (400 above that); the three queries run once for all krutis
  instead of once per kruti.
- `TranIds` is written, read and cleared in one transaction (see `reports.md`).

Not ported, and why:

- **Crystal Report** (`KrutiFullCard`, parameters `@StrId`, `@IsReport = 1`): `KrutiFullCard.rpt`
  is not in the repo, not in `Library.vbproj` as an embedded resource and not inside the built
  `Library.exe` (which embeds the 14 other reports), so the desktop cannot load it either. Only
  the generated class `KrutiFullCard.vb` (three sections) exists. Its data is probably the
  procedure `PrintKruti @StrId, @IsReport`; the layout is not recoverable.
- **Old Full Card** ("KrutiMater Card.xls", sheet "Kruti New Card"): the template is missing and
  the handler cannot run: it reads `kartaremark` from the grid (no such column in tblSearch or
  `krutiMst`) and `sankhya`, `Sign`, `prakashan` from a note query that does not select them.
- **Old Selected Card**: opens `FormPrintWithSelectedColumn` with thirteen column names and a SQL
  text, and does nothing with the result; "Display In Grid" only closes that form, and the form
  never reads `SqlStr`. Nothing is printed on the desktop.

Tests: `apps/api/test/reports-cards.integration.test.ts`.

## Not available on the web

- Crystal Report, Old Full Card, Old Selected Card: see "Cards" above (none of them produces
  anything on the desktop either).
- Swroop Report / Purna Swroop Report do nothing on the desktop either (their data table is
  always empty).
- Note Report's third choice (Short) fails on the desktop and says so here.

## Verified

- `apps/api/test/master-kruti.integration.test.ts` (real DB, rolled back).
- `apps/web/e2e/kruti-master.spec.ts`.

## Desktop v3.4.3.1

- **Author-type text (Master batch).** `UpdateKrutiAuthor` (`frmKrutiMasterNew.vb:960`,
  `updateKrutiAuthor` in `kruti-actions.ts`) builds `Author` / `SAuthor` from the type's name,
  `authtype.authortype`, instead of `authtyattr`.

Kruti batch (source: `GGLibrarySolutionUpdated/Library/Library/frmKrutiMasterNew.vb`,
`.designer.vb`, `frmKrutiWorkFilter.vb` + Designer; inventory
`docs/desktop-update-3.4.3.1/4-kruti.md`). The database is still the v3.3.3.6 one.

- **Grid.** The `कर्ता2` (`SAuthor`) column is gone; `Sampraday` (`SampradayTran`, 200) and
  `Remark` (100) follow `PNo`. This database's tblSearch rows for them (722, 701) exist but are
  not `DisplayInGrid`, so the screen adds them to its grid query itself
  (`ScreenDefinition.gridColumnsAlso`, new, opt-in); `remark` is selected as `krutiMst.remark`
  because the form's join has `visheshMast` aliases with a `remark` of their own. Once tblSearch
  flags the rows the option does nothing.
- **Delete.** After the password: `KrutiMstKm - <id> is used in TirthRaksha Master`
  (`TirthRakshaKrutiT.KrutiKt` or `TirthRakshaReferenceT.KrutiMstKt`) and
  `KrutiMstKm - <id> is used in वि.क्र.` (`krutiRelT`), each on its own line (a line break
  before each, as the desktop builds it), in one message. "Records in used anthor plase !" is
  gone.
- **Menu.** `Show For Selected  Kruti ` is now `For Selected  Kruti `. New in it:
  - `TirthRaksha Master`: opens Tirth Raksha Master on the records that refer to the selected
    krutis (`TirthRakshaReferenceT` UNION `TirthRakshaKrutiT`); with none, an empty window, as
    the desktop.
  - `Vibhag` reads `KrutiVibhagT` of the **selected** rows (was `KrutiHeadkt` of every grid
    row); none: `No Records Found`.
  - `Utility › Append Remark`: the typed text is put **in front** of the remark with no
    separator (as the desktop, despite the name). No password, work report or `moduser`.
  - `Replace Records` (IsAdmin or AMaster; the API refuses everyone else):
    `कृति परि. नाम` (`Enter Existing Text` / `Enter New Replace Text`, `REPLACE(extranm, …)`
    where the name holds the text), `प्रकार` and `पूर्णता` (`FindAndReplace`: the type to
    replace among the selected krutis', then the new one; rows are matched by the type's
    **name**, as the desktop compares). Each changed kruti gets a `Modify` work report;
    `(n) Records Replaced Successfully`. `moduser` / `moddate` are not touched, as there.
  - `Utility › Replace In Selected › कर्ता 1 › Author / Avastha` (was the item `Author`): the
    Security password first, the swap in `krutiauthT`, then `UpdateKrutiAuthor("Author1", …)`,
    then `(n) Records Updated Successfully` — n is the number of **selected rows** for Author and
    the number of author rows that had the old avastha for Avastha, as the desktop computes them.
  - `Filter › Show Records By Work` (new top-level item): the Kruti Work Filter dialog
    (`KrutiWorkFilterDialog.tsx`, the Designer's 583x147 layout, Times New Roman 14.25): two
    dates starting on today, and `Work Type`, `Sampraday` (any key opens the list) and
    `Work Done By` (F2) filled from multi-select lists (names joined by `,`; picking the list's
    blank row empties a box). Search (its tooltip is "Save" on the desktop) lists the krutis with
    a `WorkReportM` row (`TableName = 'KrutiMst'`) between the dates, of those types / users, in
    those sampradays; the list stays until Refresh. `RecordNo` is nvarchar, so the kruti id is
    compared as text; the dates are bound as dates.
  - `Main Report With Reference`: the "Yes" list has the seven `… आदि लीस्ट` sampradays.
- **Lock / Unlock By Admin.** The two menu items are gone. `AdminLockToolStrip` (668, 304;
  64x25, the desktop's `lock` / `lock-open` icons in `public/legacy/icons/`) sits in the panel for
  **AMaster only** (`MasterScreen`'s new `inPanel`). A click asks
  `Are You Sure To Lock Selected Records?` / `… Unlock …`, then the password only until one run
  got through in that window. The web keeps the typed password for the window and sends it
  again; the API checks it on every call and refuses users who are not AMaster.
- **visheshMast.** New SQL ported from statements that say `Vibhag` on the updated desktop
  (Avastha list, Replace Records) uses `remark` here, marked
  `// v3.4.3.1: remark -> Vibhag once the DB is upgraded`.

Deliberate differences (v3.4.3.1):

- Append Remark does nothing when the input is cancelled or empty (the desktop then rewrites
  every selected remark with its own grid value), and it reads the remark from the database, not
  from the grid cell.
- Replace In Selected › Author / Avastha need both picks (the desktop runs
  `set authorcokt = where …` when the second list is cancelled and shows the SQL error), and the
  affected grid rows are refreshed afterwards (the desktop leaves कर्ता1 stale; the old web
  reloaded the whole list).
- Replace Records binds the search / replace texts as parameters (the desktop concatenates them,
  so a `'` breaks its statement); a replacement type outside the category is refused.
- Lock / Unlock By Admin and Replace Records are enforced by the API, not only hidden.
- Ctrl+N / Ctrl+S: the updated desktop guards them with `btnAdminLock.Enabled` /
  `btnAdminUnlock.Enabled` (buttons copied from New / Save and never disabled), so they fire
  whatever the toolbar's state. A slip; the web keeps following New / Save.
- The filter dialog's dates are the browser's date boxes (dd/MM/yyyy on en-IN systems), as every
  DateTimePicker on the web; Tab, Esc and a bare modifier key do not open a box's list.

Not done (v3.4.3.1), waiting for the upgraded database:

- The right-click menu's per-user permissions (`ContextMenu`, `UserContextMenuPermission` are
  missing): `PRINT_USER_IDS` still decides Print Report.
- The Sampraday popup's `ISCompleted` filter (`columnmaster.IsCompleted` is missing).
- `Utility › Mark Samprad As Complete`: its handler is empty on the desktop; left out.
- `visheshMast.remark` → `Vibhag`, and the tblSearch flags for the two new grid columns.

Tests: `master-kruti.integration.test.ts` ("runs the v3.4.3.1 menu items", the delete test, the
lock test) and `e2e/kruti-master.spec.ts` (two v3.4.3.1 tests; the e2e scenario has an `amaster`
user and `KRUTI_LOCK_PASSWORD`).
