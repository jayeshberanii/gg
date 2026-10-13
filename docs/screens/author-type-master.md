# Author Type Master (`authtype`)

Desktop form: `GGLibrarySolution/Library/Master/frmAuthorType.vb` (+ `.designer.vb`),
repository `Library.BusinessContract/Concrete/AuthTypeRepository.vb`. Menu: Master › Author
Type Master.

Generic master engine; this screen supplies `apps/api/src/master/screens/author-type.ts` and
`apps/web/src/screens/AuthorTypeMaster.tsx`.

## Table and key

- Table `authtype`, PK `authtycokm`, `MAX + 1` (`insertWithMaxId`).
- **No `Locked` column.** The desktop still wires Ctrl+L / Ctrl+U, which fail with
  "Invalid column name 'Locked'." — `lockable: false` gives the same refusal.
- No audit columns.

## Fields

| Box                              | Column                                | Notes                                                                                                                                   |
| -------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Name                             | `authortype`                          | required                                                                                                                                |
| Brief                            | `brif`                                | shown and loaded, **never saved** — the repository's INSERT/UPDATE leave it out. Kept (an edit is silently dropped, as on the desktop). |
| Remark / Short Name / Hindi Word | `remark` / `short_name` / `hindiword` |                                                                                                                                         |
| Uplevel                          | `uplevalkt`                           | F2 (`select authtycokm,authortype from authtype`), shows `UplevalName`                                                                  |
| IsPrint (checkbox)               | `IsPrint`                             | bit. On the form itself at (768,27), over the toolbar strip (`toolbarCheckbox`), not in the panel.                                      |

## Validation (`AuthTypeRepository.GetValidationMessage`)

- `authortype` blank → `"Please Enter AuthorType"`.

## Grid columns

Id, Author Type, Brief, Remark, Short Name, UpLevel, Hindi Word, CountI, Counters.

## Right-click menu

| Item                                           | Behaviour                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel | engine's generic ones                                                                                                                                                                                           |
| Show Records Not Used In Book                  | grid shows only `authtycokm NOT IN (SELECT AUTHTYCOKT FROM AUTHTRAN)`                                                                                                                                           |
| Update AuthorType Count                        | `EXEC UpdateBhashaCount 'AuthType', <id>`. The procedure has **no** `'AuthType'` branch, so nothing is counted, on the desktop or here. Kept as called; a real count needs a procedure change the desktop owns. |
| Show In Use › Kruti Master                     | `krutiauthT WHERE authorcokt IN (<ids>)` → `kruti-master`. **Desktop quirk kept:** it compares author ids with the author type ids (`authtycokt` would be right).                                               |
| Show In Use › Prakashan List                   | `praklistauthortype.authortype` → `book-master-anya-bhandar`                                                                                                                                                    |
| Show In Use › Author Master                    | `AuthMSubT.authtypekt` → `author-master`; "No Author Available for Current Selection"                                                                                                                           |
| Show In Use › BookM › Author                   | `PraksnAuthorAuthTypeT.authortypekt` → `book-master`; "No Record Found"                                                                                                                                         |
| Show In Use › BookM › Magazine Vishesh         | `BookMagazineVisheshAuthorTypeT.AuthorTypeKt` → `book-master`; "No Record Found"                                                                                                                                |

The two BookM items pass a WhereCondition on the desktop (`BookMastKm IN (…)`); opening
Book Master with those ids gives the same rows.

## Desktop v3.4.3.1

- The **Attribute** box, its "AuthAttr" grid column and `authtyattr` in INSERT / UPDATE are
  gone. The column still exists; values already stored are left untouched (a new record gets
  NULL). The denormalised author texts of other screens now use `authortype` instead.
- Layout: Brief and Remark moved up one row (y 58 / 98), the panel is 140 high
  (`SplitterDistance`), and IsPrint moved out of the panel onto the toolbar strip. The web
  draws it with the engine's existing `toolbarCheckbox` (as Prakashak's Finished), so, like
  those, it sits at the toolbar's right end beside the record navigator.

## Work report

None — the form never calls `insertworkreports`; Work Report and Copy start disabled (the
engine's `justLoaded`, as for Bhasha).

## Permissions

Menu gating only.

## Verified

- `apps/api/test/master-small.integration.test.ts` › Author Type Master: validate, max+1,
  IsPrint round trip, Brief not saved, `authtyattr` not written on add and kept on edit, Uplevel name, edit, not-used-in-book list, in-use
  action, lock refused.
