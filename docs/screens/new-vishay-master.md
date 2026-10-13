# New Vishay Master (`GrVishay`)

Desktop form: `GGLibrarySolution/Library/Graphics/frmGrVishayMaster.vb` (+ `.designer.vb`,
title "Graphics Vishay Master"), repository
`Library.BusinessContract/Concrete/GrVishayRepository.vb`. Menu: Graphics › New Vishay
Master.

frmGrWordMaster's twin. The definition is `apps/api/src/master/screens/gr-vishay.ts` and the
screen is `apps/web/src/screens/GrVishayMaster.tsx`. It is a separate table from the Master
menu's `Vishay` (`vishay.ts`).

## Table and key

- Table `GrVishay`, PK `Grvishaykm`, assigned as `MAX + 1`. There are no triggers.
- No `Locked` column (`lockable: false`).

## Fields

| Control                | Column       | Notes                                                                                                          |
| ---------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| Name                   | `vishaynm`   | required                                                                                                       |
| Defination             | `defination` | multiline                                                                                                      |
| Group Name             | `groupnm`    | `nvarchar(50)`                                                                                                 |
| Remark                 | `remark`     | multiline                                                                                                      |
| Cancel (`chkIsCancel`) | `IsCancel`   | `bit`. On the desktop it sits on the form over the toolbar, so on the web it is the engine's `toolbarCheckbox` |

## Validation

`"Please Enter Vishay Name"`.

## Grid

- Columns: Id (80), Name (200), Defination (200), Remark (200), Count, Member, Master,
  Cancel.
- Ordered newest first.
- Member and Master are tblSearch `'' AS …` columns, empty until Show Member/Master fills them.

## Work report

After every save (Add and Edit), not after a delete.

## Delete (all selected rows)

1. "Are You Sure to Delete This Record?" → Security password.
2. `CheckInUse(id, name)` for every selected row. Each row's message is
   `"<name> is used in Graphics Master."` and/or `"<name> is used in Graphics Detail."`,
   joined by `" and "`. The rows are joined by CRLF.
3. If any row is in use, nothing is deleted and the messages are shown.
4. Otherwise every selected row is deleted, then
   `"(<n>) Records Deleted Successfully"` and FillList.

The web does this in the `delete-selected` action, through the screen's `deleteFlow`. The
deletes run in one transaction.

## Right-click menu

| Item                                            | Behaviour                                                                                                                                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel  | engine's                                                                                                                                                                                                                                            |
| Show In Use › Graphics Master / Graphics Detail | `GrbookSubT` / `GrDetailSubT` (`grvishaykt`) → opens `graphics-master` / `graphics-detail`; "No Record Found"                                                                                                                                       |
| Utility › Replace                               | pick any subject; every selected row's `GrbookSubT` / `GrDetailSubT` links move to it; "Records Replaced Successfully"; FillList                                                                                                                    |
| Utility › Update Count For Selected Records     | `EXEC UpdateCount 'GrVishay', '<ids>'`, then FillList                                                                                                                                                                                               |
| Utility › Show Member/Master                    | For the selected rows only, writes into the grid (ActionResult `cells`, nothing re-read). **Member:** the subjects under it in the `TreeMast` tree of `columnmaster` TableNm `GrVishayMembr`, in tree order. **Master:** the subjects it sits under |

## Desktop bugs not carried over

- **Replace's list never opened.** The desktop's statement is
  `select Grvishaykm,vishaynm from GrVishay WHERE order by vishaynm`. SQL Server refuses it,
  so on the desktop Replace shows an error and does nothing. The web lists every subject by
  name, which is what the statement was meant to do.
- **New kept the Cancel tick.** `chkIsCancel` is outside the panel `clsCom.clear` empties, so
  on the desktop New kept the tick of the last record viewed. A new subject could be saved as
  cancelled without anyone noticing. The web clears it on New.
- **Copy at load:** disabled until the first Save or Cancel, as on Word Master. The web
  leaves it on.

## Verified

- `apps/api/test/master-graphics-words.integration.test.ts` › New Vishay Master:
  - validation, max + 1 with IsCancel, edit
  - multi-delete refused with the exact joined message, then allowed (count message)
  - wrong password refused
  - Replace list and multi-row Replace
  - Show Member/Master on a real tree record
