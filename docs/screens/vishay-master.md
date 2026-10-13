# Vishay Master (`Vishay`)

Desktop form: `GGLibrarySolution/Library/Master/frmVishayMaster.vb` (+ `.designer.vb`),
repository `Library.BusinessContract/Concrete/VishayRepository.vb`, popups `SetForm_Vishay`
in `Library/CommonForms/frmDisplayTransNew.vb`. Menu: Master › Vishay Master.

Generic master engine; this screen supplies `apps/api/src/master/screens/vishay.ts` and
`apps/web/src/screens/VishayMaster.tsx`.

## Table and key

- Table `Vishay`, **IDENTITY** PK `vishaycokm` (`OUTPUT INSERTED`).
- `Locked`: Ctrl+L / Ctrl+U. Audit `enuser/endate`, `moduser/moddate`.

## Fields

| Box                                                        | Column                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Name (required) / Brief / Remark                           | `vishay_nm` / `brif` / `remark`                                |
| Up Level                                                   | `uplevalkt` (shows `uplevalName`)                              |
| Short Nm / Hindi Word                                      | `short_name` / `hindiword`                                     |
| Anya Name / Meanings / English Anya Name / Hindi Anya Name | popups                                                         |
| Reference (link beside the toolbar)                        | popup (RefrenceT, `Tablekt` = columnmaster `TableNm`/`Vishay`) |

## Validation

`"Please Enter Vishay Name"`, then (v3.4.3.1, add and edit) `"Vishay Name - {0} Already Exist"`
when another subject has the same name (`SELECT COUNT(*) FROM vishay WHERE vishay_nm = … AND
vishaycokm <> …`, checked at the top of `save`, parameterised).

## Popups (FormName "Vishay")

Each is saved only when it was opened: rows with key ≤ 0 inserted, others updated, rows no
longer listed deleted.

| Box               | Table                                                    | Also rebuilds                            |
| ----------------- | -------------------------------------------------------- | ---------------------------------------- |
| Anya Name         | `VishayAnyaNameT` (AnyaName)                             | `Vishay.AnyaName` = names joined by ", " |
| Meanings          | `VishayMeaningT` (Meaning)                               | —                                        |
| English Anya Name | `VishayEnglishAnyaNameT` (EnglishNameKt, F2 over Vishay) | `Vishay.EnglishAnyaName`                 |
| Hindi Anya Name   | `VishayHindiAnyaNameT` (HindiNameKt, F2 over Vishay)     | `Vishay.HIndiAnyaName`                   |
| Reference         | `RefrenceT`                                              | replaced when the popup was saved        |

## Delete

Confirm → Security password → refused while the subject is used:
`"Record is in used in below forms"` + one line per `VishayEntry.TransactionName`, `- कृति
विषय` (krutivishayT), `- Book Old Subject` (praksnVishayT). Otherwise the record only (the
desktop deletes nothing else either).

## Work report

`insertworkreports` after Add and Edit; not Delete. `lblEntry` shows the entry user.

## Right-click menu

| Item                                                    | Behaviour                                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel          | engine's                                                                                                                      |
| Update Vishay Count                                     | `EXEC UpdateBhashaCount 'vishay', <id>` per selected row; "Records Updated Successfully"                                      |
| Show In Use › BookM › Subject With Old / New Entry Type | books via `VishayEntry` + `BookSubjectT` (EntryType Old / not Old) → `book-master`; "No Book Available for Current Selection" |
| Show In Use › BookM › Magazine Vishesh                  | disabled (Enabled = False in the designer)                                                                                    |
| Show In Use › Kruti Master                              | `KrutiSubjectT` → `kruti-master`                                                                                              |
| Show In Use › Vishay Relation                           | disabled — no handler on the desktop                                                                                          |
| Show In Use › Magazine Vishesh / English Book Vishesh   | → `magazine-vishesh-master` / `english-book-vishesh`; "No Records Available for Current Selection"                            |

## Desktop bugs not carried over

- **Show In Use › Magazine Vishesh never found anything.** The desktop reads VishayEntry
  `TransactionName='MagazineVishesh'`, which has no rows: Magazine Vishesh Master
  (frmMagazineVisheshNew) saves its Detail lines as `MagazineVisheshDetail`. The web reads
  `MagazineVisheshDetail`, so the item opens the records whose Detail uses the subject
  (fixed 2026-10-06, while porting magazine-vishesh-master). English Book Vishesh's item was
  already right (`EnglishBookVishesh`).

- **A new subject's rows went to the previous subject.** `vishaycokm` is an identity, but
  Save reads `MAX(vishaycokm)` _before_ the insert and uses it as the new id: the popups'
  rows, the references and the `AnyaName` / `EnglishAnyaName` / `HindiAnyaName` texts were
  written to the subject before it. The web uses the inserted identity.
- **References doubled on every save**: FillData loads them and Save inserts them all again
  without deleting. The web replaces them only when the Reference popup was saved.
- A Hindi anya-name row with key 0 was updated (nothing) instead of inserted; the web inserts
  any row with key ≤ 0.

## Verified

- `apps/api/test/master-vishay.integration.test.ts`: validation, identity add with every popup
  on the new subject (nothing on the previous one), text write-backs, anya-name edit/delete,
  references not doubled, in-use refusal message, delete, Update Vishay Count, Kruti in-use.

## Desktop v3.4.3.1

- **Carried over:** the duplicate-name check above. The local DB has 96 names used by more
  than one row; those records cannot be saved again until one of them is renamed (on the
  desktop too).
- **Waiting for the upgraded DB:** Delete's in-use check through the procedure
  `ListOrReplaceRecordInUse` (message "Record is in use", title "Record cannot be deleted") and
  the new right-click item "Replace In Use Current Vishay With Another Vishay" (same procedure,
  plus the 3-parameter `UpdateVishay`). Neither exists in the current DB, so Delete still uses
  the three inline queries and the old message.
- Not fixed on the desktop: MAX-before-identity and references re-inserted on every save (the
  web's fixes stand).
