# Apprisal Standard (`ApprisalStandard`)

Desktop form: `GGLibrarySolution/Library/Master/frmApprisalStandard.vb` (+ `.designer.vb`,
title "Appraisal Standards"), repository
`Library.BusinessContract/Concrete/ApprisalStandardRepository.vb`. Menu: Master › Apprisal
Standard.

Generic master engine; this screen supplies `apps/api/src/master/screens/apprisal-standard.ts`
and `apps/web/src/screens/ApprisalStandard.tsx`.

## Table and key

- Table `ApprisalStandard`, IDENTITY PK `ApprisalStandardKm` (the desktop reads
  `SELECT @@identity`; the web uses `OUTPUT INSERTED`).
- No `Locked` column (`lockable: false`).
- Audit: `enuser`/`endate` on insert, `moduser`/`moddate` on update (`curr_lnid` → session
  user id).

## Fields

| Box                     | Column           | Notes                                                            |
| ----------------------- | ---------------- | ---------------------------------------------------------------- |
| Vibhag                  | `VibhagKt`       | F2: `columnmaster WHERE Vibhag='vibhag'`; shows `VibhagName`     |
| Work Type               | `WorkTypeKt`     | F2: `columnmaster WHERE Vibhag='worktype'`; shows `WorkTypeName` |
| Work Qty(Per Hour)      | `PerHourWorkQty` | `Val()`                                                          |
| Form Name               | `TableName`      | F2: distinct `tblSearch.TransactionName`                         |
| Manual Entry (checkbox) | `IsManualEntry`  | bit                                                              |

## Validation (`GetValidationMessage`, first failure only)

1. `VibhagKt = 0` → `"Please Enter Vibhag"`
2. `WorkTypeKt = 0` → `"Please Enter Work Type"`

## Grid columns

Id (width 5), Vibhag, Work Type, Work Qty(Per Hour), IsManualEntry, Form Name.

## Delete

Confirm, Security password, plain single-row delete. No in-use check.

## Right-click menu

Print Report › Selected Column / Send To Excel only (engine's generic ones).

## Work report

None (no `insertworkreports`).

## Permissions

`Frmlibmain_Load` shows the item only to admins and users 5 and 100; `menu.ts` has that rule,
so the API refuses (403) everyone else.

## Desktop bugs not carried over

- `ApprisalStandardRepository.GetDataById` filters `where authorcokm in (…)` (copy-paste);
  the form never calls it, so nothing to port.

## Verified

- `apps/api/test/master-small.integration.test.ts` › Apprisal Standard: 403 for a non-admin,
  validation order, identity add, names from columnmaster, edit, audit columns.
