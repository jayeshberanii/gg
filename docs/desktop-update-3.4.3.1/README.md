# Desktop update v3.3.3.6 → v3.4.3.1

`../../../GGLibrarySolutionUpdated` is the desktop app at v3.4.3.1, a strict successor of
`../../../GGLibrarySolution` (v3.3.3.6), which gglib-web was ported from. These files are the
change inventory, one per slice of the diff, written 2026-10-13. Each entry gives the desktop
change, what the web did at that date, the web change needed and the database objects it needs.

| File                           | Slice                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `1-shell-common.md`            | Main menu, MdlLib, shared forms, context-menu permissions, the new `CommonLibrary.dll` |
| `2-display-trans.md`           | `frmDisplayTransNew` (the generic child-grid popup), per calling screen                |
| `3-book.md`                    | Book Master, Library No, Anya Bhandar, lab issue                                       |
| `4-kruti.md`                   | Kruti Master (+ Hastprat, Vyakhyan, not on the web)                                    |
| `5-tirth-magazine.md`          | Tirth Raksha, Magazine Vishesh, the tree form                                          |
| `6-masters.md`                 | Master menu screens                                                                    |
| `7-issue-graphics-employee.md` | Issue, Graphics, Employee, Utility, Article                                            |
| `8-new-screens.md`             | Screens that exist only in v3.4.3.1 (draft behaviour notes)                            |

## The database is the gate

The local `DBLibSQL` (backup taken 2026-09-21) has **none** of the update's schema. The desktop
tree has no SQL scripts, so the following cannot be built or verified until a database upgraded
for v3.4.3.1 (or its DDL plus the new `tblSearch` rows and procedures) is available:

- `visheshMast.remark` renamed to `Vibhag` (every category lookup, ~36 web queries, ~39 `tblSearch` rows)
- `praksnBhashaT` / `praksnLipiT` keys as identity (Book Master and Anya Bhandar inserts)
- Mix Sign as child tables (`BookMixSignT`, `BookTranMixSignT`); `BookSampradayT`, `BookKrutiWorkT`,
  `BookTranConditionT`, `BookM.PrakVisheshName`
- `ContextMenu` + `UserContextMenuPermission` (per-user right-click permissions), `GeneralConfig`, `LogEntry`
- Tirth Raksha rework (8 `TirthRakshaM` columns, `TirthRakshaTextT`, `TirthRakshaReferenceT.EntryType`,
  `PrintTirthRakshaReport`), `MagazineVisheshProofT`
- `ApprisalStandard.IsDisplayInAppraisalReport`, `columnmaster.IsCompleted`, `authmast.AuthorNameRefPatrikaKt`
- procedures `ListOrReplaceRecordInUse`, `PrintAuthorCheckReport`, `ImportBookMRecordsFromExcel`,
  3-parameter `UpdateVishay`, new `Rpt_EmployeePerformance`
- every new screen's tables: `JSeriesM`, `EmployeeEvaluation`, `LekhNewspaperBagInward`, …

The web must switch to the new schema at the same moment the database does: it cannot serve both.

## Status

Changes that need none of the above are being carried into the web in four batches (Masters,
Kruti, Book, Issue/Graphics/Employee). Each screen's own note in `../screens/` records what was
changed and any deliberate difference from the desktop.

### Shared pieces carried over

- **Search box, F2 / F3 with "Not In"** (`UcSearch.txtSearch_KeyDown` in the new
  `CommonLibrary.dll`; `MasterService.search`): for a column whose `F2SearchText` has two
  statements the condition is one clause, `LTRIM(RTRIM(pk)) <In|Not In> (<statement 2 with the
picked values>)`. "Not In" therefore returns every record without a matching child row, the
  ones with no child rows at all included (before: only records that had some other child). As on
  the desktop, an F2 (within grid) "Not In" is not limited to the grid's records, and a NULL in
  statement 2's result makes "Not In" find nothing. The desktop's `TranIds` scratch table for the
  grid's ids is not used: the web binds them as one parameter. Test:
  `master-sampraday.integration.test.ts`.
- **Next Library No fills gaps** (`MdlLib.GetMemID`): see `../screens/book-master.md`.
- **Lab issue's 30-day block** is behind `LAB_ISSUE_OLD_DUE_BLOCK` (off): see
  `../screens/lab-issue-master.md`.
