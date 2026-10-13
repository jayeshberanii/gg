# Prakashak Master (`prakmast`)

Desktop form: `GGLibrarySolution/Library/Master/frmPrakashakMaster.vb` (+ `.Designer.vb`),
repository `Library.BusinessContract/Concrete/PrakMastRepository.vb`, popups
`SetForm_PrakMast` in `Library/CommonForms/frmDisplayTransNew.vb`. Menu: Master › Prakashak
Master.

Generic master engine; this screen supplies `apps/api/src/master/screens/prakashak.ts` and
`apps/web/src/screens/PrakashakMaster.tsx`.

## Table and key

- Table `prakmast`, **IDENTITY** PK `prakcodekm` (`OUTPUT INSERTED`).
- `recordno` = `MAX(RecordNo) + 1` on insert (the web adds `ISNULL(…, 0)` and holds the range
  with `UPDLOCK, HOLDLOCK`); never changed afterwards. The Record No box is read-only.
- `Locked`: Ctrl+L / Ctrl+U; a locked record opens read-only (`lockedColumns`).
- Audit `enuser/endate`, `moduser/moddate`. F1 opens a field's reference rows (`help`).

## Fields

Three designer columns (Name, Anya Name, Prakar, Subject, Contact, Address, Samvat │ Record
No, GMala, Ref LibNo, Author, Samuday, Remark, Prapti Sthan │ Vibhag, Prak Rel, Status,
Publication Type, Publish Count (`Sampark`), Excel Name, Mudrak). **Finished** is a checkbox
on the form beside the toolbar (`toolbarCheckbox`).

Saved on the record: `prakname`, `Remark`, `Finished`, `MainSubject` (the Subject box's
text), `SamudayKt`, `Sampark`, `StatusKt`, plus:

- `txtPrakName` = name, then `Cont(<contacts>)` and `AName(<any names>)` — from the popups'
  rows as the user left them, or else as stored;
- `txtAuthor` = `GetAuthorName`: per author row, its types (the type's name, `authortype` — `authtyattr` up to v3.3.3.6 — + sign short name)
  and names (any name or author name, `(Guru)`, `[Identity-avastha]`, sign short name),
  joined by "-" and ","; kept as stored when the Author popup was not opened.

## Validation

1. Ref LibNo box empty → `"Please Enter RefLibNo"` (the form's own check; it wins).
2. Name blank → `"Please Enter Name"`.
3. Another prakashak with the same non-zero recordno → `"RecordNo <n> is already in use"`
   (checked at save time).

## Popups (FormName "PrakMast")

Each is saved only when opened (Contact and Anya Name are also read for `txtPrakName`): key
≤ 0 inserted, others updated, rows no longer listed deleted (`upsertChildRows`).

| Box              | Table                                                                                                             | Cell lists                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Anya Name        | `PrakMAnayNmT`                                                                                                    | name type (`PrakMNameType`), LibNo (+ Samvat)                                                                                            |
| Contact          | `prakContactT`                                                                                                    | contact type (`conttype`), contact (`contactnm`), LibNo                                                                                  |
| Prak Rel         | `PrakMRelT`                                                                                                       | prakashak, relation (`PrakRelType`), LibNo                                                                                               |
| Address          | `PrakMAddT`                                                                                                       | prakashak name, city, state, category (`PrakMCat`), LibNo                                                                                |
| GMala            | `PrakMgmalaT`                                                                                                     | gmala (visheshMast `gmala`), LibNo                                                                                                       |
| Subject          | `prakMSubT`                                                                                                       | sign, subject (`PrakMSubject`), type (`PrakMSubjType`)                                                                                   |
| Ref LibNo        | `PrakMRefLibNoT`                                                                                                  | LibNo                                                                                                                                    |
| Excel Name       | `PrakMExcelNameT`                                                                                                 | —                                                                                                                                        |
| Samvat           | `PrakMSamvatT`                                                                                                    | as Author Master's Samvat popup (Vikram samvat computed); the first row's kind / VK samvat also go to `prakmast.samvatcokt / vikramsmvt` |
| Prakar           | `PrakMPrakarT`                                                                                                    | prakar, sub prakar                                                                                                                       |
| Vibhag           | `PrakMVibhagT`                                                                                                    | `PrakMVibhag`                                                                                                                            |
| Publication Type | `PrakMPublicationTypeT`                                                                                           | `PrakMPublicationType`                                                                                                                   |
| Prapti Sthan     | `PrakMPraptiSthanT`                                                                                               | city, state, LibNo                                                                                                                       |
| Mudrak           | `PrakMMudrakT`                                                                                                    | LibNo                                                                                                                                    |
| Author           | `PrakMAuthorT` + sub-popups **multiauthortype** (`PrakMAuthorAuthTypeT`) and **multiauthor** (`PrakMAuthorAuthT`) | as Book Master's author popup                                                                                                            |

After an edit, every book of the prakashak gets `BookM.txtPrakashak` rebuilt (the
repository's three UPDATEs, verbatim).

## Delete

Confirm → Security password → the record, **and its popups' rows** (all the tables above,
the author tables and its RefrenceT rows). Work report "Delete <name>".

## Work report

`insertworkreports` after Add, Edit and Delete. `lblEntry` shows the entry user.

## Right-click menu

| Item                                                                                                                                                                                      | Behaviour                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel                                                                                                                                            | engine's                                                                                                                              |
| marked as physically checked                                                                                                                                                              | `Exist = N'PC'`; "Selected Records Marked Successfully"                                                                               |
| show active only                                                                                                                                                                          | grid: `Finished = 1`                                                                                                                  |
| Update BookCount / Update Count for Selected Prakashak                                                                                                                                    | `UpdatePrakashakBookCount` / `UpdatePrakashakCount` (long procedures, no timeout), then refresh                                       |
| Show in Use › BookM / Authmaster / Selection Master / Prakashan List                                                                                                                      | → `book-master` / `author-master` / `selection-master` / `book-master-anya-bhandar`, with the desktop's messages                      |
| Show in Use › Related Prakashak                                                                                                                                                           | grid: the selected prakashaks that have relations                                                                                     |
| Find Missing RecNo / Find Duplicate RecNo                                                                                                                                                 | `Print_MissingNo 'prakmast'` / duplicate recordnos over the grid's rows, to Excel                                                     |
| Show Half … › AnyaName-Contact Name / Prakashak Name                                                                                                                                      | **desktop quirk:** its partial match starts from " " and matches every row, so the grid keeps the rows it had — the web does the same |
| Show Half … › Starting Part - Prakashak Name                                                                                                                                              | grid: names whose first half another shares                                                                                           |
| Update Finance in Selected                                                                                                                                                                | pick (`PrakMFin`), set `FinanceKt`; "Finance Updated in Selected Records"                                                             |
| Print Contact For Selected Grid Records                                                                                                                                                   | "Please Enter ManualNo From-To(Ex:1-100)" → `PrintPrakashakContact a, b` to Excel                                                     |
| Show Image of RefrenceT                                                                                                                                                                   | the scanned images are on the desktop file share — not on the web                                                                     |
| Filter › Show Records Used in Selection Master                                                                                                                                            | grid: prakashaks in `SelectionM`                                                                                                      |
| Print Full Card, Print Selected Column, Print Card New, Print Book For Selected Prakashak, Utility Store Grid Temporary, Send To Prakshan Master, Having Not Short Name, Reports Of Count | shown, **disabled** — no (or an empty) handler on the desktop                                                                         |
| … › AnyaName-Contac Name By Function                                                                                                                                                      | disabled — its query is invalid SQL and always failed                                                                                 |

Hidden on the desktop and left out: "find books for selected Prakashak", Lock / Unlock
Selected Records (Ctrl+L / Ctrl+U still work).

## Desktop bugs not carried over

- **Finished was cleared by every edit**: `chkFinished` is never loaded from the record, so
  saving an edit wrote `Finished = 0` unless the user ticked it again. The web loads it.
- **Delete left every popup's rows behind** (contacts, addresses, authors, …); deleted here.
- The Mudrak popup's save checked `dtPraptiSthan` instead of `dtMudrak`.
- A new recordno was `NULL` on an empty table (`MAX + 1` without `ISNULL`).
- No rollback on failure: the web's save is one transaction.

## Verified

- `apps/api/test/master-prakashak.integration.test.ts`: validation order, identity add with
  the next recordno, txtPrakName with Cont/AName, Finished kept across an edit, samvat on the
  record, popups kept on a plain edit, duplicate recordno, nested authors and txtAuthor,
  delete with the author tables, menu actions (mark, finance, duplicates, print-contact format,
  active only, in-use).

## Desktop v3.4.3.1

- **Author-type text.** The denormalised author text is built from the type's name
  (`authtype.authortype`) instead of its attribute (`authtype.authtyattr`), and the
  author-type pick list (multiauthortype) shows two columns (`authtycokm`, `authortype`) —
  the attribute column is gone. Text stored earlier keeps the old attribute until the record
  is saved again (the desktop does not rewrite it either).
  (`PrakMastRepository.GetAuthorName:224`; `authorText` in `prakashak.ts`, shared with Tirth
  Raksha and Anya Bhandar.)
- Not carried over yet: `visheshMast.remark` → `Vibhag` (the DB still has `remark`).
- Not fixed on the desktop: the Finished reset (the web's fix stands).
