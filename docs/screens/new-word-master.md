# New Word Master (`grwordm`)

Desktop form: `GGLibrarySolution/Library/Graphics/frmGrWordMaster.vb` (+ `.designer.vb`, title
"Graphics Word Master"), repository `Library.BusinessContract/Concrete/GrWordMRepository.vb`.
Menu: Graphics › New Word Master.

The definition is `apps/api/src/master/screens/gr-word.ts` and the screen is
`apps/web/src/screens/GrWordMaster.tsx`. Its right-click actions are shared with New Vishay
Master (`graphicsWordActions`).

## Table and key

- Table `grwordm`, PK `GrwordMkm`, assigned as `MAX + 1` (`insertWithMaxId`). There are no
  triggers.
- No `Locked` column, and the form has no Ctrl+L / U (`lockable: false`).

## Fields

| Box        | Column       | Notes                                  |
| ---------- | ------------ | -------------------------------------- |
| Name       | `wordnm`     | required (after Type); `nvarchar(250)` |
| Defination | `defination` | multiline                              |
| Type       | `typenm`     | required; `nvarchar(50)`               |
| Remark     | `remark`     | multiline                              |
| —          | `count`      | written only by Update Count ("n+m")   |

All four boxes have tblSearch F2 lists: the distinct existing values of their column. The
engine reads them live.

## Validation (`GrWordMRepository.GetValidationMessage`)

Stops at the first failure: `"Please Enter Type Name"`, then `"Please Enter Word Name"`.

## Grid

- Columns: Id (80), Type (150), Name (200), Defination (200), Remark (200), Count (120).
- Ordered by `typenm` (FillList passes it as `OrderByCol`; `listOrderBy`).
- There is no default condition.

## Work report

`insertworkreports` runs after every save (Add and Edit), not after a delete
(`workReportOn: { add, edit }`).

## Delete

Confirm → Security password → `CheckInUse`:

- `"Record is used in Graphics Master"` (`GrBookWordT.grwordkt`)
- `"Record is used in Graphics Detail"` (`GrDetailWordT.grwordkt`)

Otherwise a plain `DELETE`. One record (the current row).

## Right-click menu

| Item                                           | Behaviour                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel | engine's                                                                                                                                                                                                                                    |
| Show In Use › Graphics Master                  | `GrBookWordT.graphicbkt` of the selected words → opens `graphics-master`; "No Record Found"                                                                                                                                                 |
| Show In Use › Graphics Detail                  | `GrDetailWordT.graphicbkt` → opens `graphics-detail` (the desktop passes a WhereCondition; the web passes the same ids); "No Record Found"                                                                                                  |
| Utility › Replace                              | frmList1 of the words with the **current row's** Type (`lists/replace-with?id=`). Re-points `GrBookWordT` and `GrDetailWordT` from the current word to the picked one, then "Record Replaced Successfully" and FillList. The old word stays |
| Utility › Update Count For Selected Records    | `EXEC UpdateCount 'GrwordM', '<ids>'` (count = "GrBookWordT+GrDetailWordT"), then FillList. It runs inside the request's transaction: the procedure is quick                                                                                |

## Desktop differences

- **Copy and Work Report:**
  - The desktop disables Copy at load, until the first Save or Cancel re-enables it. The web
    leaves Copy on.
  - Work Report is on in both.
- **Replace:** the desktop builds its UPDATEs and the list SQL by string concatenation. The
  web binds parameters (the Type is looked up from the record id).

## Verified

- `apps/api/test/master-graphics-words.integration.test.ts` › New Word Master:
  - validation order, max + 1, WorkReportM row, edit
  - delete refused in use / allowed when free
  - Replace list limited to the Type, Replace across both link tables
  - Update Count ("1+1" / "0+0"), Show In Use
