# Parishisht Namsuchi (`ParishistNamSuchiM`)

Desktop form: `GGLibrarySolution/Library/Master/frmParishistNamSuchi.vb` (+ `.Designer.vb`,
title "Parishist Nam Suchi"), repository
`Library.BusinessContract/Concrete/ParishistNamSuchiRepository.vb`. Menu: Master › Parishisht
Namsuchi.

Generic master engine; this screen supplies `apps/api/src/master/screens/parishisht-namsuchi.ts`
and `apps/web/src/screens/ParishishtNamsuchi.tsx`.

## Table and key

- Table `ParishistNamSuchiM` (note the `M`), IDENTITY PK `ParishistNamSuchiKm`
  (`OUTPUT INSERTED`; the desktop reads `@@identity`).
- No `Locked` column. Audit `enuser/endate`, `moduser/moddate`.

## Fields

| Box                            | Column                   | Notes                                                         |
| ------------------------------ | ------------------------ | ------------------------------------------------------------- |
| Name                           | `Name`                   |                                                               |
| (next to the Publication link) | `ParishistPublicationKt` | F2: `ParishistPublicationM`; shows `ParishistPublicationName` |

## Validation (`GetValidationMessage`) — both messages, one per line

- `ParishistPublicationKt = 0` → `"- Publication is Mandatory"`
- `Name` blank → `"- Name is Mandatory"` (joined with `vbCrLf` by `SignBetweenStr`)

## Grid

Id (width 5), ParishistPublicationKt (hidden), Publication, Name. FillList sorts
`ParishistPublicationKt Desc, Name asc` — the new engine option `listOrderBy`.

## Delete

Confirm + Security password, then **every selected row** in one go
(`DELETE … WHERE ParishistNamSuchiKm IN (…)`) — the new web option `deleteSelected`. No
in-use check.

## Work report

`insertworkreports` after Save (Add and Edit); not after Delete — `workReport: true` with the
new `workReportOn: { delete: false }`. `lblEntry` shows the entry user (`entryLabel`).

## Right-click menu

Print Report › Selected Column / Send To Excel / **Print Parishisht**:
`exec PrintParishistNamSuchi <current row's ParishistPublicationKt>` into Excel (columns
Namsuchi, PrintNo). The procedure LIKE-matches every name against `praksnVisheshT`
(~73k rows) and takes about 70 s for publication 1 (434 rows); the desktop reads it with an unlimited
`CommandTimeout`. The web runs it through `queryLongRunning` (own connection, no request
timeout, `src/db/long-running.ts`), so it finishes as on the desktop — the user waits.

## Publication link

`lnkPublication` opens `frmParishistPublication` as a dialog. That form's class is **empty**:
a frmMasterPage with Publication / Vibhag boxes and a grid that nothing fills, loads or saves.
The web opens the same empty dialog ("Parishisht Publication"). Publications and their
vibhags (`ParishistPublicationM`, `ParishistPublicationVibhagT`) are maintained in the DB
directly, on the desktop as here.

## Desktop bugs not carried over

- After an edit, `RefreshCurrentGridRecord` only rewrites the Id cell, so the changed name
  or publication shows only after Refresh. The web grid shows the saved row.

## Permissions

Menu gating only.

## Verified

- `apps/api/test/master-small.integration.test.ts` › Parishisht Namsuchi: combined validation
  message, identity add with publication name, list order, multi-row delete, no work report
  on delete, Print Parishisht guard. The full Print Parishisht run is checked against the DB
  outside a test transaction (the procedure would wait on the test's uncommitted rows).
