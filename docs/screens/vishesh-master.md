# Vishesh Master (`visheshMast`)

Desktop form: `GGLibrarySolution/Library/Master/frmVisheshMaster.vb` (+ `.Designer.vb`),
repository `Library.BusinessContract/Concrete/VisheshMastRepository.vb`, popups
`SetForm_Vishesh` in `Library/CommonForms/frmDisplayTransNew.vb`. Menu: Master › Vishesh
Master.

Generic master engine; this screen supplies `apps/api/src/master/screens/vishesh.ts` and
`apps/web/src/screens/VisheshMaster.tsx`. The tree view is the shared
`features/master/UplevelTree.tsx` (Sampraday Master uses it too).

## Table and key

- Table `visheshMast`, PK `Tid` (not an identity), `MAX + 1` inside the save transaction.
- `Locked`: Ctrl+L / Ctrl+U (`lockable: true`).
- `remark` is the record's category (Guru, Category, city, ContactNm, …); other screens'
  F2 lists read `visheshMast WHERE remark = …`.
- No audit columns.

## Fields

| Box                                                                | Column                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Name (required) / Brief / Notes / Hindi Word / Remark / Short Name | `Vishesh` / `Brief` / `Notes` / `HindiWord` / `remark` / `ShortNm`             |
| Vishesh No                                                         | `VisheshNo` (`Val`)                                                            |
| Up Level                                                           | `UplevelKt` (shows `UplevelName`)                                              |
| Anya Name / Adya Sthapak                                           | popups; their box text is saved as `txtAnyaName` / `txtAdyaSthapak`            |
| Reference (link beside the toolbar)                                | popup (RefrenceT, `Tablekt` = columnmaster `TableNm`/`visheshMast`, 9073 here) |

**Up Level F2** (the form's own, `ScreenDefinition.f2.uplevelkt`): with Remark
`contactnm` every vishesh with its remark; otherwise the vishesh sharing the _loaded
record's_ remark (`WHERE remark IN (SELECT remark … WHERE tid = <record>)` — so a new record
gets an empty list, as on the desktop).

## Validation

`"Please Enter Name"`.

## Popups (FormName "Vishesh")

| Box          | Table                 | Notes                                                                                   |
| ------------ | --------------------- | --------------------------------------------------------------------------------------- |
| Anya Name    | `VisheshAnyaNameT`    | AnyaName editable                                                                       |
| Adya Sthapak | `VisheshAdyaSthapakT` | AdyaSthapak F2: authors joined to `visheshMast` on `Sampradaykt = Tid` (as the desktop) |
| Reference    | `RefrenceT`           | ReferenceT1 / Common                                                                    |

Save: a popup that was loaded is deleted and re-inserted; one never opened is left alone.

## Delete

Confirm → Security password → the record. **Fixed:** the desktop called `DeleteTransaction`
with no tables, so references, anya names and adya sthapaks were left behind; the web
deletes them too. No in-use check (as on the desktop).

## Work report

`insertworkreports` after Add and Edit; not Delete.

## Search: UplevelWithChild

`tblSearch` has a search column `UplevelWithChild`. F2 lists the vishesh that have children;
picking one lists every record below it (the desktop walks 12 levels down with one query per
record; `uplevelWithChild()` in `master-common.ts` does one query per level and stops on a
loop). Engine hook: `ScreenDefinition.searchOverrides`.

## Right-click menu

| Item                                                  | Behaviour                                                                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display In Tree / Display In Grid                     | the tree replaces the grid: one root per selected row, children by `Uplevelkt`, expanded; clicking a node loads it                                                                                 |
| Print Report › Selected Column / Send To Excel        | engine's                                                                                                                                                                                           |
| Utility › Update Uplevel In Selected Records          | pick from the vishesh sharing the selection's remarks, then `UPDATE visheshMast SET UplevelKt = <pick> WHERE Tid IN (<sel>) AND Tid <> <pick>`; "Records Updated Successfully"                     |
| For Selected Record › Magazine Master / Author Master | **desktop quirk kept:** they compare the vishesh ids with `SampradayKt` (copied from Sampraday Master) → `magazine-master` / `author-master`; "No Records Found". In tree mode: the selected node. |
| Print Tree (tree mode only)                           | the tree as tab-indented text to Word                                                                                                                                                              |

## Verified

- `apps/api/test/master-vishesh.integration.test.ts`: validation, max+1 add, all three popups,
  popups kept on a plain edit, delete with child rows, Up Level F2 by remark / ContactNm,
  Update Uplevel (never its own), UplevelWithChild search, tree list, grid columns.
