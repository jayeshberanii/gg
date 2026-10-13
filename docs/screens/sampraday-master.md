# Sampraday Master (`Sampraday`)

Desktop form: `GGLibrarySolution/Library/Master/frmSampraday.vb` (+ `.Designer.vb`),
repository `Library.BusinessContract/Concrete/SampradayRepository.vb`, popups
`SetForm_Sampraday` in `Library/CommonForms/frmDisplayTransNew.vb`. Menu: Master › Sampraday
Master.

Generic master engine; this screen supplies `apps/api/src/master/screens/sampraday.ts` and
`apps/web/src/screens/SampradayMaster.tsx`. Tree: `features/master/UplevelTree.tsx`; popup
saves: `upsertChildRows()` in `master-common.ts`.

## Table and key

- Table `Sampraday`, **IDENTITY** PK `SampradayKm` (`OUTPUT INSERTED`).
- **No `Locked` column** (the form wires Ctrl+L / Ctrl+U; they fail) — `lockable: false`.
- Audit `enuser/endate`, `moduser/moddate`.

## Fields

| Box                                                                            | Column / popup                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Name (required, unique) / Short Name                                           | `SampradayName` / `ShortNm`                                                                            |
| Up Level / Up Level1                                                           | `UplevelKt` / `Uplevel1Kt`, F2: every sampraday by name                                                |
| Brief · Notes · Remark · Anya Name · Sthal · Samvat · Reference · Adya Sthapak | eight popups (below); Anya Name's and Adya Sthapak's text is saved as `txtAnyaName` / `txtAdyaSthapak` |

The designer's hidden Samvat / SamvatType / SamvatVK boxes are never saved; they are left out.

## Validation (`GetValidationMessage`)

- blank name → `"Please Enter Name"`;
- another sampraday with the same name → `"Name Already Exist"` (checked at save time — it
  needs the database; the desktop's message wins over the blank one, an edge the web does
  not reproduce).

## Popups (FormName "Sampraday")

Each saved only when opened: key 0 (or less) inserted, others updated, rows no longer listed
deleted.

| Box            | Table                                               | Cell lists                                                                                |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Anya Name      | `SampradayAnyaNameT`                                | LibNo                                                                                     |
| Adya Sthapak   | `SampradayAdyaSthapakT`                             | authors (with their sampraday)                                                            |
| Reference      | `SampradayReferenceT`                               | LibNo, RefPlace (columnmaster `Refplace`)                                                 |
| Notes          | `SampradayNoteT`                                    | Note type (columnmaster `SampradayNote`), LibNo                                           |
| Samvat         | `SampradaySamvatT`                                  | Samvat type (samvmast), LibNo. SamvatVK is not computed by the popup (as on the desktop). |
| Brief / Remark | `SampradayBriefT` / `SampradayRemarkT` (with audit) | LibNo                                                                                     |
| Sthal          | `SampradaySthalT` (with audit)                      | city (visheshMast `City`), LibNo                                                          |

## Delete

Confirm → Security password → the record and **all eight** popups' rows. No in-use check (as
on the desktop).

## Work report

`insertworkreports` after Add and Edit; not Delete. `lblEntry` shows the entry user.

## Search: UplevelWithChild

As Vishesh Master: F2 lists sampradays that have children; picking one lists every record
below it (shared `uplevelWithChild()`).

## Right-click menu

| Item                                                           | Behaviour                                                                                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display In Tree / Display In Grid                              | tree of the selected rows; roots read "Name(SamvatType)", children "Name(VK,VK)" from `SampradaySamvatT`                                                               |
| Print Report › Selected Column / Send To Excel                 | engine's                                                                                                                                                               |
| Utility › Update Uplevel / Update Uplevel1 In Selected Records | pick a sampraday, set it on the selection (never on itself); "Records Updated Successfully"                                                                            |
| For Selected Record › Magazine Master                          | `MagazineM.SampradayKt` → `magazine-master`                                                                                                                            |
| For Selected Record › Author Master                            | "Show From Sampraday(Press Yes) / Show From SampradayTran(Press No) / Show In Both(Press Cancel)" → `authmast.Sampradaykt` and/or `AuthorSampradayT` → `author-master` |
| For Selected Record › Utility › Set LinkWithSadi               | pick from columnmaster `LinkWithSadi`, set `LinkedSadiKt`; "Total (n) records updated successfully"                                                                    |
| Print Tree (tree mode only)                                    | tab-indented text to Word                                                                                                                                              |

In tree mode the For Selected Record items use the selected node.

## Desktop bugs not carried over

- **Delete left five child tables behind** (`DeleteTransaction` removes only anya names,
  adya sthapaks and references); the web deletes the notes, samvats, briefs, remarks and
  sthals too.
- Set LinkWithSadi with nothing picked ran `UPDATE … SET LinkedSadiKt= WHERE …` (a SQL
  error); the web does nothing.

## Verified

- `apps/api/test/master-sampraday.integration.test.ts`: validation, duplicate name, identity add
  with all eight popups, popup upsert, delete with every child table, Update Uplevel /
  Uplevel1, Set LinkWithSadi, UplevelWithChild, F2 and tree lists, Author / Magazine in-use.
