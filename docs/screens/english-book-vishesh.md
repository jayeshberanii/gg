# English Book Vishesh (`EnglishBookVishesh`)

Desktop form: `GGLibrarySolution/Library/Library/frmEnglishBookVishesh.vb` (+ `.Designer.vb`),
repository `Library.BusinessContract/Concrete/EnglishBookVisheshRepository.vb`, entity
`Library.Entity/EntEnglishBookVishesh.vb`, popups `setform_EnglishBookVishesh` in
`Library/CommonForms/frmDisplayTransNew.vb` (FormName "EnglishBookVishesh"), Vishay lines in
`frmVishayEntry`. Menu: Library › English Book Vishesh (`english-book-vishesh`, handler
`EnglishBookVisheshToolStripMenuItem_Click` in `Frmlibmain.vb`). Window title "English Book
Vishesh".

**Near-twin of `magazine-vishesh-master`.** The form and the repository are the same code with
the names swapped (checked with a diff after renaming). This note lists everything, but the
shared behaviour is described in full in `magazine-vishesh-master.md`. The differences are at
the end. Build this screen right after Magazine Vishesh, on the same helper module.

## Table and key

- Table `EnglishBookVishesh`, PK `EnglishBookVisheshKm` (**identity**). 4,951 rows locally.
- `Inherits frmMasterPage`. Audit `enuser`/`endate`, `moduser`/`moddate` (type `date`).
- **No `Locked` column**, so Ctrl+L / Ctrl+U throw after the password. Set `lockable: false`.
- No triggers.
- Summary columns: `Detail` (nvarchar(max), UpdateVishay), `BhashaName`(100), `MTypeName`(500),
  `AuthorTypeName`(500), `AuthorName`(500), `TagName`(**200**).
- Other columns: `Seq` int, `SubSeq` nvarchar(5), `Mark1Kt` int, `ColumnMastKt` int, `Numbers`
  nvarchar(50), `PageNo` nvarchar(250), `WorkDoneByKt` int, `PDFPath` nvarchar(500), `PDFPageNo`
  int, `Remark` nvarchar(3000).

## Opening the screen (menu)

The flow is the same as Magazine's. The picker:

```sql
SELECT DISTINCT BookMastKm,BookName + CASE WHEN ISNULL(Part,'')<>'' THEN ' ' + Part ELSE '' END AS BookName,
  txtBookTran AS LibNo,txtPrakashak AS Prakashak,txtAuthor AS Author,txtVibhag AS Vibhag
FROM EnglishBookVishesh INNER JOIN BookM ON EnglishBookVishesh.BookMastKt=BookM.BookMastkm ORDER BY BookName
```

A pick gives `WhereCondition " AND BookMastKt=<pick>"`. Cancel gives `StrId "0"`, so the grid is
empty and New runs. Author Master and Vishay Master open the form with their own WhereCondition
(Author: `EnglishBookVisheshKm IN (SELECT EnglishBookVisheshKt FROM EnglishBookVisheshAuthorT
WHERE AuthorKt IN …)`; Vishay: VishayEntry `TransactionName='EnglishBookVishesh'`, already in
`vishay.ts`, and correct for this screen).

## Fields

Panel1: 1008 wide, `SplitterDistance = 262`. Everything is Times New Roman 14.25pt, and boxes are
29px high. Nothing is ReadOnly or disabled.

| Label (x,y)               | Box (x,y,w)                    | Tab | Column / behaviour                                                                                                                                 |
| ------------------------- | ------------------------------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| LibNo (8,23)              | txtBookTKt (117,19,200)        | 1   | `BookTKt` / `BookTName`. Form's own F2 (as Magazine's). The pick also fills Book Name                                                              |
| Book Name (332,22)        | txtBookMastKt (481,18,200)     | 3   | `BookMastKt` / `BookMastName`. F2 does nothing                                                                                                     |
| Seq/Sub Seq (691,22)      | txtSeq (797,18,99)             | 5   | `Seq` = `Val(txtSeq.Text)`, required. F2 does nothing                                                                                              |
|                           | txtSubSeq (898,18,99)          | 6   | `SubSeq`, trimmed. **F2 does nothing** (F2EntryText '')                                                                                            |
| Mark (8,62)               | txtMark1Kt (117,58,200)        | 8   | `Mark1Kt` / `Mark1Name`. F2: tblSearch `SELECT ColumnMastkm,Name FROM columnmaster where ISNULL(Name,'')<>'' AND vibhag='Sign' ORDER BY Name`      |
| Column No/Name (332,62)   | txtColumnNo (481,58,52)        | 10  | shows `ColumnNo` (derived from `ColumnMastKt`, **never saved**). F2 = the ColumnMast list below                                                    |
|                           | txtColumnMastkt (535,58,146)   | 11  | `ColumnMastKt` / `ColumnMastName`. F2 = the same list                                                                                              |
| MType (691,62)            | txtMTypeTran (797,58,200)      | 13  | popup "MType" → `EnglishBookVisheshMTypeT`                                                                                                         |
| Numbers (8,102)           | txtNumbers (117,98,200)        | 15  | `Numbers` nvarchar(50), trimmed. F2 lists distinct values                                                                                          |
| Detail (334,102)          | txtDetailTran (481,98,200)     | 17  | **frmVishayEntry** over VishayEntry `EnglishBookVishesh`. Shows `GetcontString(Detail)`                                                            |
| Author Type (691,102)     | txtAuthorTypeTran (797,98,200) | 19  | popup "AuthorType" → `EnglishBookVisheshAuthorTypeT`                                                                                               |
| Author (8,142)            | txtAuthorTran (117,138,200)    | 21  | popup "Author" → `EnglishBookVisheshAuthorT`                                                                                                       |
| Page No (332,142)         | txtPageNo (481,138,200)        | 23  | `PageNo`, trimmed. F2 lists distinct values                                                                                                        |
| Bhasha (691,142)          | txtBhashaTran (797,138,200)    | 25  | popup "Bhasha" → `EnglishBookVisheshBhashaT`                                                                                                       |
| Tag (8,181) (`lbltxtref`) | txtTagTran (117,177,200)       | 27  | popup "Tag" → `EnglishBookVisheshTagT`                                                                                                             |
| Work Done By (332,181)    | txtWorkDoneByKt (481,177,200)  | 29  | `WorkDoneByKt` / `WorkDoneByName`, required. F2: `select partyMkm,PName from PartyM ORDER BY pname`                                                |
| PDF Path (691,181)        | txtPDFPath (797,177,200)       | 31  | `PDFPath`, **text only** (nothing opens the file). F2 lists distinct values                                                                        |
| PDF PageNo (8,220)        | txtPDFPageNo (117,216,200)     | 33  | `PDFPageNo` (`Val`). F2 does nothing                                                                                                               |
| Remark (332,220)          | txtRemark (481,216,200)        | 35  | `Remark` nvarchar(3000), trimmed. F2: `select distinct Remark from EnglishBookVishesh where isnull(Remark,'')<>'' group by Remark order by Remark` |

**Column No / Name F2** (Txt_KeyDown special case, for either box):
`SELECT ColumnMastkm,Name,ColumnNo FROM columnmaster WHERE Vibhag='vishcol' ORDER BY Name`
(selectFirst; 162 rows, the collation is case-insensitive). It sets txtColumnMastkt to Name and
ColumnMastkm, and txtColumnNo to ColumnNo. The tblSearch F2EntryText for `ColumnMastKt` (`…
Vibhag='VishCol'`, without ColumnNo) is never used.

tblSearch's `ColumnNo` row is **Type 'T', IsExternalColumn**, with JoinCondition `(select
ColumnNo from columnmaster where columnmastkm=EnglishBookVishesh.ColumnMastkt) AS ColumnNo`.
It is a derived display column, not a popup. Make sure the engine does not treat it as a
"…Tran" popup (it would not be, because the name does not end in Tran).

## New

The same as Magazine. It keeps Book Name, LibNo and Work Done By, and sets
`txtSeq = SELECT ISNULL(MAX(Seq),0)+1 FROM EnglishBookVishesh WHERE BookMastKt=<kept book>`.

## Validation

The form first asks "Are You Sure to Save This Record?", then shows these lines (CrLf-joined,
verbatim):

```
- Book Name is Mandatory
- LibNo is Mandatory
- Seq is Mandatory
- Work Done By is Mandatory
```

On success it shows "Record Saved Successfully".

## Grid columns

Order: **`Seq Desc`** (`ListGridData(…, "Seq Desc")`, so `listOrderBy: 'Seq Desc'`).
FillList replaces `Detail` with `GetcontString(Detail)`.

| Header      | Width | Row column           |
| ----------- | ----- | -------------------- |
| Id          | 5     | EnglishBookVisheshKm |
| Seq         | 55    | Seq                  |
| SubSeq      | 55    | SubSeq               |
| Mark        | 80    | Mark1Name            |
| ColumnNo    | 70    | ColumnNo             |
| Column Name | 120   | ColumnMastName       |
| MType       | 90    | MTypeName            |
| Numbers     | 90    | Numbers              |
| Detail      | 600   | Detail               |
| Author Type | 100   | AuthorTypeName       |
| Author Name | 100   | AuthorName           |
| PageNo      | 75    | PageNo               |
| Bhasha      | 85    | BhashaName           |
| Tag         | 85    | TagName              |

tblSearch DisplayInGrid rows (checked): Km(0), Seq(1), SubSeq(2), Mark1Kt(3), ColumnNo(4, external),
ColumnMastKt(5), MTypeTran(6), Numbers(7), DetailTran→Detail(8), AuthorTypeTran(9), AuthorTran(10),
PageNo(11), Remark(11), BhashaTran(12), TagTran(13). The desktop grid has **no Remark column**,
although tblSearch marks it for the grid.

Search By (IsSearchable): LibNo, BookName, Mark, ColumnNo, ColumnName, Detail, PageNo, Remark,
Author, AuthorType, Bhasha, MType, Tag.

The unused `Detail1Tran` row reads **MagazineVishesh** tables (a copy-paste in the data). No box
uses it, so ignore it.

## Derived values

- New Seq = MAX+1 per book.
- Utility › Update Seq: `EXEC UpdateMagazineSeq @Transaction='EnglishBookVishesh',
@BookMastKt=<txtBookMastKt.Tag>`. The procedure has the same cursor logic as for Magazine
  (see that note), over `EnglishBookVishesh`.

## Child tables saved with the record

`Save(Ent, dtMType, dtDetail, dtAuthorType, dtAuthor, dtBhasha, dtTag)` runs in one transaction,
in this order: record, MType, Detail (VishayEntry), AuthorType, Author, Bhasha, Tag. A table is
processed only if its popup was loaded.

| Box               | Table                           | Key                              | Columns                                    | Summary                                                    |
| ----------------- | ------------------------------- | -------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| txtMTypeTran      | `EnglishBookVisheshMTypeT`      | `EnglishBookVisheshMTypeKm`      | MTypeKt, Seq                               | `MTypeName`, ", "                                          |
| txtAuthorTypeTran | `EnglishBookVisheshAuthorTypeT` | `EnglishBookVisheshAuthorTypeKm` | AuthorTypeKt, Seq                          | `AuthorTypeName`, ", "                                     |
| txtAuthorTran     | `EnglishBookVisheshAuthorT`     | `EnglishBookVisheshAuthorKm`     | AuthorKt, AuthAnyaNmKt, PadKt, SignKt, Seq | `AuthorName`: AnyaName, or AuthorName if it is empty, ", " |
| txtBhashaTran     | `EnglishBookVisheshBhashaT`     | `EnglishBookVisheshBhashaKm`     | BhashaKt, Seq                              | `BhashaName`, ","                                          |
| txtTagTran        | `EnglishBookVisheshTagT`        | `EnglishBookVisheshTagKm`        | VishayKt, Seq                              | `TagName` = rows' `VishayName`, ","                        |

The parent column is `EnglishBookVisheshKt`. The save is: key < 0 → INSERT (enuser, GETDATE()),
otherwise UPDATE (moduser, moddate), then delete the rows not kept, then `UPDATE
EnglishBookVishesh SET <summary> = INSQ(joined)` (' ' when empty). All the tables have
`audit: true`, and `upsertChildRows` fits. All their `moddate` columns are `date`.

VishayEntry (one use): `SaveVishayEntry(dtDetail, "EnglishBookVishesh", "EnglishBookVishesh",
"EnglishBookVisheshKm", id)`. That is upsert, delete the rest, orphan clean-up, then `EXEC
UpdateVishay 'EnglishBookVishesh', '<id>'`, which writes `Detail`. The DB has 20,728 rows. The
popup rows come from the `DetailTran` F2EntryText (`… TransactionName = 'EnglishBookVishesh'`).
English inlines the same code that Magazine has as `SetVishayEntry`.

### Popups (FormName "EnglishBookVishesh")

Bhasha, MType, AuthorType and Author are identical to Magazine's (key columns
`EnglishBookVishesh…Km`), with the same lists. See the Magazine note. In addition:

| TranName | Columns (hidden in _italics_)                          | Cell list                                                                                                                                        |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tag      | _EnglishBookVisheshTagKm_, _VishayKt_, VishayName, Seq | vishayname: `SELECT vishaycokm,vishay_nm FROM vishay WHERE ISNULL(vishay_nm,'')<>'' ORDER BY vishay_nm`. Cell = vishay_nm, VishayKt = vishaycokm |

Tag rows F2EntryText: `select EnglishBookVisheshTagKm,VishayKt,ISNULL(vishay.vishay_nm,'''') AS
VishayName,EnglishBookVisheshTagT.Seq from EnglishBookVisheshTagT INNER JOIN vishay ON … where
EnglishBookVisheshKt in ({Id}) order by seq` (the `''''` yields a literal `'` for a missing name).
1,197 rows.

## Delete

Confirm, then the Security password, then the selected rows. One transaction:

```sql
DELETE VishayEntry FROM VishayEntry LEFT JOIN EnglishBookVishesh ON VishayEntry.RecordKt=EnglishBookVishesh.EnglishBookVisheshKm
  WHERE TransactionName='EnglishBookVishesh' AND VishayEntry.RecordKt IN (<ids>)
DELETE FROM EnglishBookVisheshMTypeT WHERE EnglishBookVisheshKt IN(<ids>)
DELETE FROM EnglishBookVisheshAuthorTypeT WHERE EnglishBookVisheshKt IN(<ids>)
DELETE FROM EnglishBookVisheshAuthorT WHERE EnglishBookVisheshKt IN(<ids>)
DELETE FROM EnglishBookVisheshBhashaT WHERE EnglishBookVisheshKt IN(<ids>)
DELETE FROM EnglishBookVisheshTagT WHERE EnglishBookVisheshKt IN(<ids>)
DELETE FROM EnglishBookVishesh WHERE EnglishBookVisheshKm IN(<ids>)
```

Then "Record Deleted ". There is no in-use check and no work report.

## Work report

`insertworkreports` after Add and Edit, not on Delete. The Work Report button is standard.

## Right-click menu

The same items as Magazine: Print Report › Selected Column / Send To Excel; For Selected Record
› BookM (opens the form's current book) / Author (`SELECT COUNT(authorcokm) FROM authmast
WHERE authorcokm IN (SELECT AuthorKt FROM EnglishBookVisheshAuthorT WHERE EnglishBookVisheshKt
IN (<ids>))`, silent when 0); Utility › Update Seq / Show All Records.

Config_Master layouts ('EnglishBookVishesh'): "Print give ms" and "Proof Print". Neither has a
ShortcutKey, so neither is added to the menu.

## Copy

The same **data-corrupting** behaviour as Magazine: loaded popup rows keep their keys, so the
copy updates the original's rows and gets none of its own. The web fix is to reset the keys on
copy.

## Permissions, reports, files, passwords

The same as Magazine: no user checks beyond the menu, no Crystal report, `PDFPath` as plain text,
and only the standard Security password.

## SQL in form event handlers

The same as Magazine with the names swapped, plus the Column No/Name F2 SELECT above.

## Desktop bugs

| Bug                                                                                                    | Class               | Web                                                                  |
| ------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------- |
| Copy saves into the original's child rows                                                              | **data-corrupting** | reset keys on copy                                                   |
| SubSeq > 5 chars, or a summary over its column (`TagName` 200, `BhashaName` 100): SQL truncation error | **throws**          | reject with a clear message (or truncate). Needs the user's decision |
| Ctrl+L / Ctrl+U: no `Locked` column                                                                    | **throws**          | `lockable: false`                                                    |
| Edit's grid refresh shows Detail without `GetcontString` until the next refresh                        | harmless quirk      | reload the row                                                       |
| The `Detail1Tran` tblSearch row points at MagazineVishesh                                              | harmless            | ignore                                                               |
| Remark is marked DisplayInGrid in tblSearch but has no grid column                                     | harmless            | follow the desktop (no Remark column)                                |

## Implementation hints

Use the same shared module as Magazine, with config `{ table: 'EnglishBookVishesh', pk:
'EnglishBookVisheshKm', parent: 'EnglishBookVisheshKt', vishayEntries: [{ column: 'DetailTran',
name: 'EnglishBookVishesh' }], children: [MType, AuthorType, Author, Bhasha, Tag],
listOrderBy: 'Seq Desc' }`. The extras for this screen are `f2.columnno` / `f2.columnmastkt`
(one list that fills both boxes; the client needs an `afterPick` that sets ColumnNo from the
picked row's third column) and the Tag popup. The engine gaps are the same as Magazine's: a
form-level frmVishayEntry box, the menu-time picker, and New with carried values.

## Differences from the twin (`magazine-vishesh-master`)

| Aspect               | English Book Vishesh (this)                                                                                                                                               | Magazine Vishesh                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Own columns          | Mark1Kt, ColumnMastKt (+ ColumnNo shown, not saved), Numbers, Remark                                                                                                      | Year, Ank, StatusKt, Sabhar, Reference, HeadName                  |
| VishayEntry          | 1 (Detail, name `EnglishBookVishesh`)                                                                                                                                     | 4 (`MagazineVisheshDetail/Sabhar/Reference/HeadName`)             |
| Popups               | Bhasha, MType, AuthorType, Author, **Tag**                                                                                                                                | no Tag                                                            |
| Save parameter order | record, MType, Detail, AuthorType, Author, Bhasha, Tag                                                                                                                    | record, the 4 VishayEntry, then Bhasha, MType, AuthorType, Author |
| Grid order           | `Seq Desc`                                                                                                                                                                | PK desc                                                           |
| Seq / SubSeq         | `Val`, trimmed                                                                                                                                                            | raw text (throws), SubSeq not trimmed                             |
| Extra F2             | Column No/Name (`columnmaster` Vibhag 'vishcol')                                                                                                                          | none beyond LibNo                                                 |
| SubSeq F2            | none                                                                                                                                                                      | distinct values                                                   |
| Vishay Master in-use | correct (`EnglishBookVishesh`)                                                                                                                                            | broken (`MagazineVishesh` has 0 rows)                             |
| Same in both         | menu picker, New carry-over, validation text, Delete flow, Update Seq (one proc, `@Transaction` switch), Show All, BookM/Author menu items, work report, no Locked column |                                                                   |

## Web port (2026-10-06)

Built on the same modules as Magazine Vishesh (see "Web port" in magazine-vishesh-master.md for
the engine pieces): API `english-book-vishesh.ts` (config for `vishesh-entry-common.ts`), web
`EnglishBookVishesh.tsx` + `visheshEntry.ts`; tests in `master-vishesh-entry.integration.test.ts`
and `e2e/batch-c.spec.ts`.

- Column No / Name: one server list (`f2.columnno` / `f2.columnmastkt`); the pick fills both
  boxes through `afterPick` with the picked row. ColumnNo is shown, never saved.
- Tag popup (`EnglishBookVisheshTagT`), summary `TagName` joined with ",".
- Grid `Seq Desc`; no Remark column (as the desktop's grid).
- Same fixes as Magazine: Copy resets popup keys and Vishay line Ids; overlong SubSeq 5, Numbers
  50, Page No 250, PDF Path 500, Remark 3000 and summaries (Bhasha 100, Tag 200, others 500) are
  refused with a validation line; `lockable: false`; Show All after a cancelled book list shows
  everything.
- Not ported: the MType list's AddTableInfo (frmVGPMmast), as for Magazine.
