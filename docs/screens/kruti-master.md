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
group; "Delete the Kruti No n Kruti Name :- x? ", the Security password; "Records in used anthor
plase !" while it has an up level (`krutiRelT`). The work report says `DEL-<name>`.

## Right-click menu (cntMenu)

Ported item for item. Print Report is shown only to Admin / AMaster and user ids 22, 29, 54, 64,
38, 182; Lock / Unlock By Admin only to admins and AMaster, with the form's own password
(`KRUTI_LOCK_PASSWORD`). Ctrl+L / Ctrl+U (the hidden Lock Selected Kruti items) use the Security
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
  sets, so every desktop edit zeroes it (915 krutis still have one; the Vibhag and Update Kruti
  Swarop Head menu items read it).
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

## Not available on the web

- Full Card Landscape / Portrait, Old Full Card, Old Selected Card, Crystal Report, Main Report As
  Agam Suchi New: Excel templates and Crystal Reports on the desktop computers.
- Swroop Report / Purna Swroop Report do nothing on the desktop either (their data table is
  always empty).
- Note Report's third choice (Short) fails on the desktop and says so here.

## Verified

- `apps/api/test/master-kruti.integration.test.ts` (real DB, rolled back).
- `apps/web/e2e/kruti-master.spec.ts`.
