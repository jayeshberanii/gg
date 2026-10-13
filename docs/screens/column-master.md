# Column Master (`columnmaster`)

Desktop form: `GGLibrarySolution/Library/Master/frmColumnMaster.vb` (+ `.Designer.vb`). It has
**no repository**: Save, the list query and the menu actions are the form's own SQL. Popups
in `Library/CommonForms/frmDisplayTransNew.vb` (`SetForm_ColumnMaster`) and the shared
ReferenceT1. Menu: Master › Column Master.

Generic master engine; this screen supplies `apps/api/src/master/screens/column-master.ts` and
`apps/web/src/screens/ColumnMaster.tsx`.

## Table and key

- Table `columnmaster`, PK `ColumnMastkm`, `MAX + 1` inside the save transaction.
- It has `Locked`, but the form has no Ctrl+L / Ctrl+U (`lockable: false`).
- Grid query built with `UcSearch.GetColumns` (`ucSearchColumns`), newest first.

## Who may change records

`Form_Load` / `FillData`: unless the user is an admin, user type **AMaster**, or user **20**
or **50**, the toolbar is Locked (Save/Modify/Cancel/Delete/Copy off) and **New is off** —
the screen is list-only. The web has `ScreenSpec.writableBy` for the toolbar and
`ScreenDefinition.writableBy`, which makes the server refuse (403) save and edit-lock for
anyone else. The desktop enforced this only in its toolbar.

## Fields

| Box                                                           | Column                                                                        | Notes                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| Name / No / Vibhag / Short Name / Brief / Remark / Hindi Word | `Name` / `ColumnNo` / `Vibhag` / `ShortNm` / `Brief` / `Remark` / `HindiWord` | written with `INSQ`: trimmed, a blank stored as `' '` |
| IsPrint (checkbox)                                            | `IsPrint`                                                                     |                                                       |
| Up Level                                                      | popup → `ColumnUplevelTran`                                                   | text from tblSearch `UplevelTran`                     |
| Reference (link, beside the toolbar)                          | popup → `RefrenceT`                                                           | DarkViolet when the record has references             |

## Validation (Save, in order)

`"Please Enter Vibhag"`, `"Please Enter Name"`.

## Popups

- **Up Level** (TranName "Uplevel", FormName "columnmaster", TranType = the Vibhag box): rows
  `ColumnUplevelTranKm, UplevelKt, UplevelName`; the UplevelName cell lists
  `columnmaster WHERE Vibhag = <TranType>` (or `'Vibhag'` when TranType is `worktype`). The
  web sends the box's value with every lookup (`TransSpec.tranType`).
- **Reference** (ReferenceT1 / Common): `RefrenceT` rows for `Tablekt = <TableKt>` and this
  record. `TableKt` is the `columnmaster` row `Vibhag='TableNm' AND Name='columnmaster'`;
  **this database has none, so it is 0**, as on the desktop — Column Master's references share
  `Tablekt = 0` with other forms that also find no row.

## Delete

`Delete()` is **empty** on the desktop: nothing is ever deleted. The web's Delete does nothing
(`deleteFlow`), and the API refuses a delete (403).

## Copy

No `btnCopy_Click`: Copy does nothing (`noCopy`).

## Work report

`insertworkreports` after Add and Edit (not Delete), with the Reference rows compared row by
row (`workReportTrans: ['ReferenceT1']`; the desktop's column label is "Reference").

## Right-click menu

| Item                                              | Behaviour                                                                                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print › Send To Excel                             | engine's                                                                                                                                                                                                                  |
| Print › Print Selected Column                     | **the engine's generic column picker** over the selected rows. The desktop opens `FormPrintWithSelectedColumn` with a fixed column list (…, UplevalName, ReferenceT) over every grid row; that variant is not ported yet. |
| Print › Print Selected Record                     | Crystal report `ColumnReport` — tells the user it needs the desktop computers                                                                                                                                             |
| For Selected Record › Kruti Master › Vibhag->Head | `KrutiVibhagT.VibhagKt IN (<ids>)` → `kruti-master`; "No Records Found"                                                                                                                                                   |

The grid colours rows with references DarkViolet (`dgMain_CellFormatting`; the desktop ran a
`COUNT(*)` per cell, the web one query per list).

## Desktop bugs not carried over

- **Every edit deleted the record's up levels**: `dtUplevelT` is cleared when a row is
  clicked and only loaded on F2, but Save always rewrites `ColumnUplevelTran` from it. The web
  rewrites it only when the popup was saved.
- **Every edit set `UplevelId` to 0** (from `txtUplevelTran.Tag`, which nothing sets). The web
  leaves `UplevelId` alone.
- **F2 was broken for non-Admin/Master users**: it read `tblSearch` rows of `KrutiMst`
  instead, which exist only for `remark`, so F2 on any other box raised "There is no row at
  position 0". The web uses Column Master's own lists for everyone.

## Not ported

Popup mode (`boolPopupForm` / `Vibhag`, used when another desktop form opens Column Master as
a dialog) — no web screen opens it that way yet.

## Verified

- `apps/api/test/master-column.integration.test.ts`: write rule (Operator refused 403, AMaster
  allowed), validation order, max+1 add, INSQ blanks, IsPrint, up levels saved and kept on a
  plain edit, Uplevel list by TranType, references saved and read back, row colour flag,
  delete refused, Vibhag->Head.
