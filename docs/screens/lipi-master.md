# Lipi Master (`lipimast`)

Desktop form: `GGLibrarySolution/Library/Master/frmLipiMaster.vb` (+ `.designer.vb`),
repository `Library.BusinessContract/Concrete/LipiMastRepository.vb`. Menu: Master › Lipi
Master.

frmBhashaMaster's twin: same layout, same engine features. Served by the generic master
engine; this screen supplies `apps/api/src/master/screens/lipi.ts` and
`apps/web/src/screens/LipiMaster.tsx`.

## Table and key

- Table `lipimast`, PK `lipicodekm`, assigned as `MAX(lipicodekm) + 1` (the repository does
  it outside any transaction; the web app holds `UPDLOCK, HOLDLOCK` and retries on a
  duplicate key — `insertWithMaxId` in `master-common.ts`).
- Has `locked`: Ctrl+L / Ctrl+U lock and unlock (`lockable: true`).

## Fields

| Box                                  | Column                                      | Notes                                                   |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| Name                                 | `lipiname`                                  | required                                                |
| Attr                                 | `lipi_attr`                                 | also written to `shortnm` on save (desktop quirk, kept) |
| Brief / Remark / Hindi Word / Vibhag | `brief` / `remark` / `hindiword` / `vibhag` | trimmed                                                 |
| Column No                            | `columnNo`                                  | `Val()`                                                 |
| Up Level                             | `Uplevelkt`                                 | F2 box, shows `UplevelName` (tblSearch JoinCondition)   |

## Validation (`LipiMastRepository.GetValidationMessage`)

- `lipiname` blank → `"Please Enter Lipi Name"`.

## F2 lookups

All from `tblSearch` (`TransactionName='lipimast'`), read live. Up Level lists
`lipicodekm, lipiname`.

## Grid columns

Id, Name, Attr, ColumnNo, Vibhag, Brief, Remark, UpLevel, Hindi Word, CountI, Counters —
`frmLipiMaster.designer.vb` order and widths.

## Child tables saved with the record

None.

## Right-click menu

| Item                                           | Behaviour                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Print Report › Selected Column / Send To Excel | engine's generic ones                                                                                                          |
| Update Lipi Count                              | `EXEC UpdateBhashaCount 'Lipi', <id>` per selected row (the procedure has a `'Lipi'` branch, so this works on the desktop too) |
| Show In Use › Prakashan List                   | `PrakListLipiT` → opens `book-master-anya-bhandar`; "No Prakashan Available for Current Selection"                             |
| Show In Use › BookM                            | `praksnLipiT.lippikt` → opens `book-master`; "No Book Available for Current Selection"                                         |

## Desktop bugs not carried over

- `RefreshCurrentGridRecord` writes `lipi_attr` into the ColumnNo and Vibhag grid cells
  after a save (display-only). The web grid re-reads the row, so it shows the real values.
- Update Lipi Count's refresh indexes `SelectedRows(i)` / `Rows(i)` inconsistently; the web
  refreshes exactly the selected rows.

## Permissions

Menu gating only: anyone who sees Master › Lipi Master.

## Verified

- `apps/api/test/master-small.integration.test.ts` › Lipi Master: validate, max+1 add,
  shortnm from Attr, Up Level name, edit, lock, update-count, F2 list, in-use action, delete.
