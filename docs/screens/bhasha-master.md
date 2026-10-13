# Bhasha Master (`bhasmast`)

Desktop form: `GGLibrarySolution/Library/Master/frmBhashaMaster.vb`. Menu: Master › Bhasha
Master.

The pilot screen for the generic master engine (`apps/api/src/master/master.service.ts` +
`apps/web/src/features/master/`). Everything below is served by that engine; this screen
only supplies its `ScreenDefinition` (`apps/api/src/master/screens/bhasha.ts`) and its
`ScreenSpec` (`apps/web/src/screens/BhashaMaster.tsx`).

## Table and key

- Table: `bhasmast`, PK `bhashacokm` (not identity — assigned as `MAX(bhashacokm) + 1`
  under `UPDLOCK, HOLDLOCK`, the desktop's `bhasmastRepository.Save` pattern).
- Entity: `Library.Entity/Entbhasmast.vb`.

## Fields

| Column            | Type    | Notes                                                    |
| ----------------- | ------- | -------------------------------------------------------- |
| `bhashacokm`      | int     | PK, max+1                                                |
| `bhashaname`      | varchar | required                                                 |
| `bhasa_attr`      | varchar | also copied into `shortnm` on save (desktop quirk, kept) |
| `shortnm`         | varchar | not shown on the form; set from `bhasa_attr` in `Save()` |
| `columnNo`        | int     | `Val()` of the text box                                  |
| `vibhag`          | varchar |                                                          |
| `brief`           | varchar |                                                          |
| `remark`          | varchar |                                                          |
| `hindiword`       | varchar |                                                          |
| `UplevelKt`       | int     | F2 box (`UplevelKt`/`UplevelName`), `Val()` of the tag   |
| `countI`, `Count` | int     | grid-only, maintained by `UpdateBhashaCount`             |

## Validation (`bhasmastRepository.GetValidationMessage`)

- `bhashaname` blank → `"Please Enter Letter Type"` (the message text is wrong for this
  screen in the desktop too — kept verbatim, it's what users are trained to recognise).

## F2 lookups

| Field       | Source (`tblSearch.F2EntryText`, live)                          |
| ----------- | --------------------------------------------------------------- |
| `UplevelKt` | `tblSearch` row for `bhasmast`/`UplevelKt`, shows `UplevelName` |

Search-by columns and grid-column headers/widths also come from `tblSearch` at request
time (`loadTblSearch`), not from this screen's code.

## Grid columns

Id, Name, Attr, ColumnNo, Vibhag, Brief, Remark, UpLevel, Hindi Word, CountI, Counters —
`frmBhashaMaster.GvMain` order, reproduced in `BhashaMaster.tsx`'s `columns`.

## Derived values

- New record: `bhashacokm = MAX(bhashacokm) + 1`, retried on a duplicate key (`isDuplicateKey`).
- `shortnm` is always `bhasa_attr` (never independently editable).

## Child tables saved with the record

None — `bhasmast` is a flat table.

## Right-click menu

| Item                         | Behaviour                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update Bhasha Count          | `EXEC UpdateBhashaCount 'Bhash', <id>` per selected row, then refreshes those rows. **Fixed**: the desktop calls the procedure with `'Bhasha'`, which the procedure's `CASE` does not match, so counts silently never update there. The web app passes `'Bhash'` so the counts actually update — see `bhasha.ts`. |
| Show In Use › Kruti Master   | Opens `kruti-master` with the distinct `krutimstkt` from `krutibhasT` for the selected `bhashakt`s; alerts "No Kruti Available for Current Selection" if none.                                                                                                                                                    |
| Show In Use › Prakashan List | Opens `book-master-anya-bhandar` with distinct `prakshnlistnokt` from `PrakListBhashaT`; same empty-selection alert (worded for Prakashan).                                                                                                                                                                       |
| Show In Use › BookM          | Opens `book-master` with distinct `prakshnokt` from `praksnBhashaT`; same pattern.                                                                                                                                                                                                                                |

Print Report and Send To Excel are the shared engine's generic ones — `Config_Master` print
layouts plus `PrintSelectedColumnDialog.tsx`, and a CSV download for Send To Excel.

## Reports and printing

`Config_Master` rows where `ConfigType='bhasmast'` — served generically by the engine; no
screen-specific report. This database currently has **no** `bhasmast` layouts, so Print
Report shows only "Selected Column" here until one is saved with a shortcut key.

## Permissions

- Menu gating only (no per-screen desktop rights ever existed for this form): visible to
  anyone who can see Master › Bhasha Master in `MAIN_MENU`.
- `ScreenParamGuard` refuses the `/master/bhasha-master/...` routes to a user whose menu
  hides the screen, or if the screen id is unknown.

## SQL in form event handlers

- F2 (`Txt_KeyDown`): reads `tblSearch.F2EntryText`/`AddTableInfo` for the focused column
  by name — same live-`tblSearch` behaviour the engine's `f2/:column` route gives every
  screen, so nothing screen-specific here.
- `UpdateBhashaCountToolStripMenuItem_Click`: `EXEC UpdateBhashaCount 'Bhasha', <id>` — see
  the fix above.
- `KrutiMasterToolStripMenuItem_Click` / `PrakashanListToolStripMenuItem_Click` /
  `BookMToolStripMenuItem_Click`: inline `SELECT DISTINCT ... IN (<selected ids>)` against
  `krutibhasT` / `PrakListBhashaT` / `praksnBhashaT` — ported as the three `in-use-*`
  actions above.

## Verified

- `apps/api/test/master-bhasha.integration.test.ts`: 9 integration tests against a real
  transaction (meta/tblSearch, list/record, validate+save max+1+edit, edit lock, delete+lock
  security password, search/F2/range/blank, F2 lists, update-count + in-use actions, unknown
  screen + font preferences). All pass against `DBLibSQL`.
- `apps/web/e2e/bhasha-master.spec.ts`: 4 Playwright tests in a real browser against the
  real API/DB (transaction-scoped, rolled back on exit) — validate-then-save, F2 pick on
  Up Level (skipping the field's own blank-clear row) + the edit lock refusing a second,
  different user, delete gated by a wrong-then-right Security password, and the search box
  filter with Total Records. All pass.
- `pnpm type-check` and `pnpm lint` clean across the monorepo.
