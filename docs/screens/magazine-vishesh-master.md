# Magazine Vishesh Master (`MagazineVishesh`)

Desktop form: `GGLibrarySolution/Library/Library/frmMagazineVisheshNew.vb` (+ `.Designer.vb`),
repository `Library.BusinessContract/Concrete/MagazineVisheshRepository.vb`, entity
`Library.Entity/EntMagazineVishesh.vb`, popups `setform_MagazineVishesh` in
`Library/CommonForms/frmDisplayTransNew.vb` (FormName "MagazineVishesh"), Vishay lines in
`frmVishayEntry`. Menu: Library › Magazine Vishesh Master New (`magazine-vishesh-master`,
handler `MagazineVisheshMasterToolStripMenuItem_Click` in `Frmlibmain.vb`). Window title
"Magazine Vishesh".

`frmMagazineVishesh.vb` (no "New") is the old screen, over `BookMagazineVisheshT`. It is
disabled in the menu. Do not port it.

Near-twin: `english-book-vishesh`. See "Differences from the twin" at the end. One shared
helper module should serve both screens.

## Table and key

- Table `MagazineVishesh`, PK `MagazineVisheshKm` (**identity**; the desktop reads `SELECT @@identity`. Use `OUTPUT INSERTED`).
- `Inherits frmMasterPage`, which provides the standard toolbar and `UcSearch`/`UcPrevNext`.
- Audit: `enuser`/`endate` on insert and `moduser`/`moddate` on update. The date columns are
  of type `date`, set with `getdate()`.
- **No `Locked` column.** Ctrl+L / Ctrl+U still ask for the Security password, then
  `LockUnlockRecords` fails with "Invalid column name 'Locked'" (throws). On the web:
  `lockable: false`.
- No triggers. Local DB has 2,275 rows.
- Denormalised summary columns are written by Save or by `UpdateVishay`: `Detail`, `txtSabhar`,
  `txtReference`, `txtHeadName` (nvarchar(max), from VishayEntry), `BhashaName`(100),
  `MTypeName`(500), `AuthorTypeName`(500), `AuthorName`(500).

## Opening the screen (menu)

The menu click shows a pick list before the form opens (`boolSelectFirst:=True`):

```sql
SELECT DISTINCT BookMastKm,BookName + CASE WHEN ISNULL(Part,'')<>'' THEN ' ' + Part ELSE '' END AS BookName,
  txtBookTran AS LibNo,txtPrakashak AS Prakashak,txtAuthor AS Author,txtVibhag AS Vibhag
FROM MagazineVishesh INNER JOIN BookM ON MagazineVishesh.BookMastKt=BookM.BookMastkm ORDER BY BookName
```

- If the user picks a book: `WhereCondition = " AND BookMastKt=<pick>"`. The grid shows only that
  book's entries.
- If the user cancels: `StrId = "0"`. The grid is empty, so Form_Load calls `btnNew_Click`.
- Refresh calls `FillList()`, which still uses `StrId` and `WhereCondition`, so the filter stays.
  **Utility › Show All Records** clears `WhereCondition` only. When the form was opened with
  `StrId "0"`, Show All still shows nothing. This is a harmless quirk; keep it, or document it.
- Other screens open the form with their own `WhereCondition` and no picker. Author Master,
  For Selected Record › Magazine Vishesh: `MagazineVisheshKm IN (SELECT MagazineVisheshKt FROM
MagazineVisheshAuthorT WHERE AuthorKt IN (…))`, already ported in `author.ts:1306`. Vishay
  Master's in-use item and Global Search also open it.

## Fields

Panel1 of SplitContainer1: 1008 wide, `SplitterDistance = 263`. Every box and label is Times New
Roman 14.25pt, and boxes are 29px high. No box is ReadOnly or disabled in the designer.

| Label (x,y)          | Box (x,y,w)                     | Tab | Column / behaviour                                                                                       |
| -------------------- | ------------------------------- | --- | -------------------------------------------------------------------------------------------------------- |
| LibNo (8,22)         | txtBookTKt (130,18,200)         | 1   | `BookTKt`, shows `BookTName`. F2 is the form's own list (below). The pick also fills Book Name           |
| Book Name (356,22)   | txtBookMastKt (457,18,200)      | 3   | `BookMastKt`, shows `BookMastName`. F2 does nothing (tblSearch F2EntryText ''). Set by the LibNo pick    |
| Year (683,22)        | txtYear (794,18,200)            | 5   | `Year` int. Saved only if `Val > 0`, otherwise 0. F2 does nothing                                        |
| Seq/Sub Seq (8,62)   | txtSeq (130,58,107)             | 7   | `Seq` int, required. `Ent.Seq = txtSeq.Text` with no Val (see bugs). F2 does nothing                     |
|                      | txtSubSeq (239,58,91)           | 8   | `SubSeq` nvarchar(5), **not trimmed** on save. F2 lists distinct values                                  |
| Ank (356,62)         | txtAnk (457,58,200)             | 10  | `Ank` nvarchar(10), trimmed. F2 lists distinct values                                                    |
| Detail (683,62)      | txtDetailTran (794,58,200)      | 12  | **frmVishayEntry** over VishayEntry `MagazineVisheshDetail`. Shows `GetcontString(Detail)`               |
| Bhasha (8,102)       | txtBhashaTran (130,98,200)      | 14  | popup TranName "Bhasha" → `MagazineVisheshBhashaT`                                                       |
| MType (356,102)      | txtMTypeTran (457,98,200)       | 16  | popup "MType" → `MagazineVisheshMTypeT`                                                                  |
| Status (683,102)     | txtStatusKt (794,98,200)        | 18  | `StatusKt`, shows `StatusName`. F2: tblSearch                                                            |
| Author Type (8,142)  | txtAuthorTypeTran (130,138,200) | 20  | popup "AuthorType" → `MagazineVisheshAuthorTypeT`                                                        |
| Author (356,142)     | txtAuthorTran (457,138,200)     | 22  | popup "Author" → `MagazineVisheshAuthorT`                                                                |
| Page No (683,142)    | txtPageNo (794,138,200)         | 24  | `PageNo` nvarchar(250), trimmed. F2 lists distinct values                                                |
| Sabhar (8,182)       | txtSabhar (130,178,99)          | 26  | `Sabhar` nvarchar(3000), plain text, trimmed. F2 lists distinct values. tblSearch calls it "Old Sabhar"  |
|                      | txtSabharTran (231,178,99)      | 37  | frmVishayEntry over VishayEntry `MagazineVisheshSabhar`. Shows `GetcontString(txtSabhar)`                |
| Reference (356,182)  | txtReference (457,178,99)       | 28  | `Reference` nvarchar(500), plain text. F2 lists distinct values                                          |
|                      | txtReferenceTran (558,178,99)   | 38  | frmVishayEntry over `MagazineVisheshReference`. Shows `GetcontString(txtReference)`                      |
| HeadName (683,182)   | txtHeadName (794,178,99)        | 30  | `HeadName` nvarchar(4000), plain text. F2 lists distinct values                                          |
|                      | txtHeadNameTran (895,178,99)    | 39  | frmVishayEntry over `MagazineVisheshHeadName`. Shows `GetcontString(txtHeadName)`                        |
| Work Done By (8,222) | txtWorkDoneByKt (130,218,200)   | 32  | `WorkDoneByKt`, required, shows `WorkDonebyName`. F2: `select partyMkm,PName from PartyM ORDER BY pname` |
| PDF Path (356,222)   | txtPDFPath (457,218,200)        | 34  | `PDFPath` nvarchar(500), **text only**. Nothing in the form opens the file. F2 lists distinct values     |
| PDF PageNo (683,222) | txtPDFPageNo (794,218,200)      | 36  | `PDFPageNo` int (`Val`). F2 does nothing                                                                 |

- The designer has no Tag box. The tblSearch for this screen has no `TagTran` row either, so the
  form's `dtTag` / "Tag" branches can never run. Do not port them.
- FillTextBox (`SetTextbox`) maps a `txtXKt` box to column `XKt` (its Tag) and column `XName`
  (its text), and any other box to the column of the same name. It also replaces `&gt;` with ">"
  and **`&lt;` with ">"** (a harmless quirk; nothing here holds either).
- Txt_Enter / Txt_Leave turn an editable box's BackColor WhiteSmoke / White.

## New (`btnNew_Click`)

- Keeps the **Book Name, LibNo and Work Done By** boxes (Tag and Text). Clears everything else
  (`clsCom.clear(Panel1)`) and every popup DataTable.
- `txtSeq = SELECT ISNULL(MAX(Seq),0)+1 FROM MagazineVishesh WHERE BookMastKt=<kept book>`. With
  no book, the Tag is 0 and Seq is 1.
- Form_Load calls New when the grid is empty, then disables `btnCopy` (until the next
  EnableDisableDataEditing call).

## Validation

The form first asks **"Are You Sure to Save This Record?"** (Yes/No), then runs
`GetValidationMessage`. Lines are joined with CrLf, verbatim and in this order:

```
- Book Name is Mandatory          (BookMastKt = 0)
- LibNo is Mandatory              (BookTKt = 0)
- Seq is Mandatory                (Seq = 0)
- Work Done By is Mandatory       (WorkDoneByKt = 0)
```

On success the form shows "Record Saved Successfully". In Add mode the new grid row goes at the
top, and the form switches to Edit and Locked. In Edit mode the form refreshes the grid row.

## F2 lookups

| Box                                                                                  | Source                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| txtBookTKt                                                                           | inline: `SELECT tid,Libno,BookName + CASE WHEN ISNULL(BookM.Part,'')='' THEN '' ELSE ' ' + BookM.Part END AS BookName,BookMastKm FROM BookT INNER JOIN BookM ON BookT.BookMastkt=BookM.BookMastkm WHERE ISNULL(Libno,'')<>'' ORDER BY Libno` (selectFirst). The pick sets LibNo text and tid, and Book Name (with Part) and BookMastKm. **158,662 rows** in the local DB, so it needs server-side search or paging |
| txtStatusKt                                                                          | tblSearch: `SELECT ColumnMastkm,Name FROM columnmaster where ISNULL(Name,'')<>'' AND vibhag=N'MagazineVisheshStatus' ORDER BY Name` (3 rows)                                                                                                                                                                                                                                                                       |
| txtWorkDoneByKt                                                                      | tblSearch: `select partyMkm,PName from PartyM ORDER BY pname`                                                                                                                                                                                                                                                                                                                                                      |
| txtSubSeq / txtAnk / txtPageNo / txtSabhar / txtReference / txtHeadName / txtPDFPath | tblSearch: `select <col> from MagazineVishesh where isnull(<col>,'')<>'' group by <col> order by <col>` (single-column lists. DisplayListForm puts the value in both Text and Tag)                                                                                                                                                                                                                                 |
| txtYear / txtSeq / txtBookMastKt / txtPDFPageNo                                      | F2EntryText '' or no row: nothing happens                                                                                                                                                                                                                                                                                                                                                                          |

Generic branch: `select F2EntryText, AddTableInfo from tblSearch where TransactionName='MagazineVishesh' and (ColumnName='<box minus txt>' or ColumnName='<minus txt and Name>')`. AddTableInfo is null for every row here.

## Grid columns

The desktop binds by name (`GvMain`), not by tblSearch order. The headers and widths below come
from the Designer. Default order is PK desc (no OrderBy). FillList replaces `Detail`, `txtSabhar`,
`txtReference` and `txtHeadName` with `GetcontString(...)` (book-common `contString`).

| Header      | Width | Row column (from the tblSearch grid SQL)          |
| ----------- | ----- | ------------------------------------------------- |
| Id          | 5     | MagazineVisheshKm                                 |
| Seq         | 45    | Seq                                               |
| SubSeq      | 55    | SubSeq                                            |
| Ank         | 45    | Ank                                               |
| Detail      | 700   | Detail (DetailTran's GridColumnName)              |
| Bhasha      | 50    | BhashaName                                        |
| MType       | 90    | MTypeName                                         |
| Status      | 80    | StatusName                                        |
| Author Type | 100   | AuthorTypeName                                    |
| Author      | 100   | AuthorName                                        |
| PageNo      | 75    | PageNo                                            |
| Sabhar      | 80    | **txtSabhar** (VishayEntry summary, not `Sabhar`) |
| Reference   | 100   | **txtReference**                                  |
| Head Name   | 90    | **txtHeadName**                                   |

tblSearch rows with `DisplayInGrid` that produce these columns (all checked in the DB):
`MagazineVisheshKm`(0), `Seq`(1), `SubSeq`(2), `Ank`(3), `DetailTran`→Detail(4),
`SabharTran`→txtSabhar(4), `BhashaTran`→BhashaName(5), `MTypeTran`(6), `StatusKt`→StatusName(7),
`AuthorTypeTran`(8), `AuthorTran`(9), `PageNo`(10), `Sabhar`(11), `ReferenceTran`→txtReference(12),
`HeadNameTran`→txtHeadName(13).

Grid style: ReadOnly, no row headers, `ContextMenuStrip = cntMenu`. Cell style 1 is LightSteelBlue
/ DarkRed / Arial Unicode MS 9 (selection back color 10,36,106). The other style is Verdana 12.

Search By (IsSearchable, in Seq order): BookName, Seq, Status, Year, Ank, Detail, Reference
(T), HeadName (T), Sabhar (T), HeadName, PageNo, Reference, Old Sabhar, SubSeq, Author, AuthorType,
Bhasha, MType.

Unused tblSearch row `Detail1Tran` (TransactionName 'MagazineVishesh', IsSearchable false, no box).
Its F2EntryText reads VishayEntry `TransactionName='MagazineVishesh'`, which has **0 rows** in
the DB. Ignore it.

## Derived values

- The New Seq is MAX+1 per book (above).
- **Utility › Update Seq**: `EXEC UpdateMagazineSeq @Transaction='MagazineVishesh',
@BookMastKt=<txtBookMastKt.Tag>`. It uses the _form's_ Book box, not the grid selection. There
  is no confirmation and no message, then FillList runs. The procedure (verbatim logic): a cursor
  over the book's rows `ORDER BY Seq, ISNULL(SubSeq,'')` sets `Seq = @Cnt`. @Cnt starts at 1 and
  goes up when Seq changes **or** when Seq and SubSeq are both equal to the previous row's. A row
  with the same Seq but another SubSeq keeps the previous counter. The procedure starts with a
  stray `SELECT @BookMastKt`, which returns a result set that can be ignored. Call the procedure
  as it is.
- The Bhasha / MType / AuthorType / Author summaries are rebuilt from the popup rows on Save
  (below). Detail and the txt\* columns are rebuilt by `UpdateVishay`.

## Child tables saved with the record

`Save(Ent, dtDetail, dtBhasha, dtMType, dtAuthorType, dtAuthor, dtSabhar, dtReference,
dtHeadName)` runs in one transaction. A table is processed **only if its popup was loaded**
(`Columns.Count > 0`). FillData / New reset them all to empty DataTables, so a popup that was
never opened leaves its rows and summary alone.

### Popup tables (upsert, then delete the rest): `upsertChildRows` fits as is

| Box               | Table                        | Key                           | Columns written                            | Summary written to the record                                                      |
| ----------------- | ---------------------------- | ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| txtBhashaTran     | `MagazineVisheshBhashaT`     | `MagazineVisheshBhashaKm`     | BhashaKt, Seq                              | `BhashaName` = rows' `BhashaName` joined with **","** (SignBetweenStr default)     |
| txtMTypeTran      | `MagazineVisheshMTypeT`      | `MagazineVisheshMTypeKm`      | MTypeKt, Seq                               | `MTypeName` joined with ", "                                                       |
| txtAuthorTypeTran | `MagazineVisheshAuthorTypeT` | `MagazineVisheshAuthorTypeKm` | AuthorTypeKt, Seq                          | `AuthorTypeName` joined with ", "                                                  |
| txtAuthorTran     | `MagazineVisheshAuthorT`     | `MagazineVisheshAuthorKm`     | AuthorKt, AuthAnyaNmKt, PadKt, SignKt, Seq | `AuthorName` = per row `AnyaName` if non-empty else `AuthorName`, joined with ", " |

- Parent column `MagazineVisheshKt`. Every row with key `< 0` is INSERTed (with `enuser`,
  `GETDATE()`); every other row is UPDATEd (with `moduser`, `moddate=GETDATE()`). Then
  `DELETE … WHERE MagazineVisheshKt=<id> AND <key> NOT IN (0,<kept>)`. Then
  `UPDATE MagazineVishesh SET <summary> = INSQ(joined)`. **INSQ writes ' ' for an empty
  string.** So emptying a popup stores a single space, not NULL or ''. SignBetweenStr skips
  blanks.
- The columns are int (INint), so they work with `upsertChildRows` (`audit: true`).
- `MagazineVisheshMTypeT.moddate` is `nchar(10)`. `GETDATE()` lands there truncated
  ("Oct 5 202"), as the existing data shows. Harmless; keep `GETDATE()`.

### VishayEntry (four uses, `CommonRepository.SaveVishayEntry`)

| Box              | VishayEntry.TransactionName | Summary column (UpdateVishay) | Rows in DB |
| ---------------- | --------------------------- | ----------------------------- | ---------- |
| txtDetailTran    | `MagazineVisheshDetail`     | `Detail`                      | 76,578     |
| txtSabharTran    | `MagazineVisheshSabhar`     | `txtSabhar`                   | 379        |
| txtReferenceTran | `MagazineVisheshReference`  | `txtReference`                | 79         |
| txtHeadNameTran  | `MagazineVisheshHeadName`   | `txtHeadName`                 | 10,808     |

`SaveVishayEntry(dt, name, "MagazineVishesh", "MagazineVisheshKm", id)`, for a loaded table
only:

1. Rows with `VishayKt > 0` only. `Id = 0`: `INSERT INTO VishayEntry(TransactionName,RecordKt,
VishayKt,VachanKt,VibhaktiKt,AnyaNameKt,Seq)`. Otherwise `UPDATE VishayEntry SET VishayKt,
VachanKt, VibhaktiKt, AnyaNameKt, Seq WHERE VishayEntryKm=Id` (RecordKt is not changed).
2. `DELETE VishayEntry … WHERE TransactionName=<name> AND RecordKt IN (<id>) [AND VishayEntryKm NOT IN (<kept>)]`.
3. Orphan clean-up: `DELETE VishayEntry FROM VishayEntry LEFT JOIN MagazineVishesh ON RecordKt=MagazineVisheshKm WHERE TransactionName=<name> AND ISNULL(MagazineVisheshKm,0)=0`.
4. `EXEC UpdateVishay <name>, '<id>'`. It writes "vishay | vachan | vibhakti / …" into the
   summary column, or '' when no lines are left.

The popup's rows (the tblSearch F2EntryText for `DetailTran` / `SabharTran` / `ReferenceTran`
/ `HeadNameTran`, `{Id}` = record) are: `Id, RecordKt, VishayKt, Vishay, VachanKt, Vachan,
VibhaktiKt, Vibhakti, AnyaNameKt, Seq`. `SetVishayEntry` opens `frmVishayEntry(TranKm, dt)`. On
its Save the box gets `frm1.txtCode`, and the dt rows with `RecordKt = TranKm` are replaced by
the dialog's lines (RecordKt = TranKm).

### Popups (frmDisplayTransNew, FormName "MagazineVishesh")

Rows come from tblSearch Type 'T' F2EntryText with `{Id}` replaced. New row (s=1, or s=2 when
empty): key = `Random.Next(-500,-1)` (use the engine's `tempKey`), and `Seq = count+1` (the
auto row on an empty popup gets Seq 1). Remember to make the temp keys unique: the desktop's
`New Random()` can repeat. After a popup Save, the box text is the generic join (FormName is not
"Common", so Delete renumbers seq).

| TranName   | Columns (hidden in _italics_)                                                                                                    | Cell lists (s=0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bhasha     | _MagazineVisheshBhashaKm_, _BhashaKt_, bhashaname, Seq                                                                           | bhashaname: `select bhashacokm,bhashaname,bhasa_attr from bhasmast order by bhashaname`. Cell = `bhasa_attr`, kt = bhashacokm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| MType      | _MagazineVisheshMTypeKm_, _MTypeKt_, MTypeName, MTypeNo, Seq                                                                     | mtypename or mtypeno: `select columnmastkm,name,ColumnNo from columnmaster where vibhag = 'MagazineVisheshType' order by columnno`, AddTableInfo `columnmaster\|MagazineVisheshType`. Sets MTypeName=name, MTypeNo=ColumnNo, MTypeKt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AuthorType | _MagazineVisheshAuthorTypeKm_, _AuthorTypeKt_, AuthorTypeName, Seq                                                               | authortypename: `SELECT authtycokm,authortype FROM authtype WHERE ISNULL(authortype,'')<>'' ORDER BY authortype`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Author     | _MagazineVisheshAuthorKm_, _AuthorKt_, AuthorName, _AuthAnyaNmKt_, AnyaName, _padkt_, Padvi, Guru, identyty, _signkt_, Sign, Seq | authorname: `select a.authorcokm,a.txtauthorname AS authorname,isnull(a.txtGuru,'') As Guru,a.identyty,isnull(a.count,0) count,isnull(a.recordno,0) recordno ,isnull(c.name,'') as vibhag,a.txtParampara as Parampara,txtGuru AS Guru,isnull(v.SampradayName,'') as samprady,isnull(a.vksamvat,0) vksamvat,a.authorname as mainname from authmast as a left outer join columnmaster as c on a.vibhagkt=c.columnmastkm left outer join Sampraday as v on a.sampradayKt=v.SampradayKm` (no ORDER BY). The pick sets AuthorName=AnyaName=`mainname`, AuthAnyaNmKt=0, AuthorKt, Guru, identyty, then moves to AnyaName. anyaname: `SELECT AuthAnyaNmKm,AnyaName FROM AuthMAnyNmT WHERE AuthmastKt=<row AuthorKt> ORDER BY AnyaName` (selectFirst, per row; only a pick changes it). padvi: `select tid,vishesh from visheshmast where remark='avastha' and isnull(visheshno,0)>5 order by vishesh`. **The cell is assigned even on cancel** (it takes txtPopup's text and tag), then focus moves to Sign. sign: `select columnmastkm,name from columnmaster where vibhag = 'sign' and isnull(columnno,0)<10 order by name` (= `SIGN_UNDER_10`), also assigned unconditionally, then focus moves to seq |

Book Master's and Kruti Master's author popups use the same "mainname" list, so check
`book.ts` / `kruti.ts` for a reusable lookup.

## Delete

Delete asks "Are You Sure to Delete This Record?", then the Security password (`InputBoxProc`).
It applies to **every selected row** (`GetIdFrom_GridRecord(…, False)`, so set
`deleteSelected: true`). In one transaction:

```sql
DELETE VishayEntry FROM VishayEntry LEFT JOIN MagazineVishesh ON VishayEntry.RecordKt=MagazineVishesh.MagazineVisheshKm
  WHERE TransactionName='MagazineVisheshDetail' AND VishayEntry.RecordKt IN (<ids>)
-- same for 'MagazineVisheshSabhar', 'MagazineVisheshReference', 'MagazineVisheshHeadName'
DELETE FROM MagazineVisheshMTypeT WHERE MagazineVisheshKt IN(<ids>)
DELETE FROM MagazineVisheshAuthorTypeT WHERE MagazineVisheshKt IN(<ids>)
DELETE FROM MagazineVisheshAuthorT WHERE MagazineVisheshKt IN(<ids>)
DELETE FROM MagazineVisheshBhashaT WHERE MagazineVisheshKt IN(<ids>)
DELETE FROM MagazineVishesh WHERE MagazineVisheshKm IN(<ids>)
```

Then the form removes the rows from the grid, reloads the current row, and shows
"Record Deleted " (Information, title "Information"; note the trailing space). There is no
in-use check and no work report for the delete.

## Work report

- `insertworkreports(TransactionName, PrimaryColumn, TranKm, curr_lnid, dtSel, dtTmpSel)` after
  Add and after Edit. In Edit mode `dtTmpSel` is the reloaded record. Not on Delete:
  `workReport: true, workReportOn: { delete: false }`.
- The toolbar Work Report button (`btnWorkReport`) is the standard frmDisplayTransNew
  "WorkReport"/"Common" popup.

## Right-click menu (`cntMenu`)

| Item                           | Behaviour                                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column | `clsCom.PrintSelectedColumn(dgMain, "MagazineVishesh", PK)` (engine's). Saved layouts are added below only if they have a ShortcutKey. The four Config_Master rows ("print", "PRINT NEW", "print newn", "dabhi") have none, so none appear in the menu. The picker still lists them |
| Print Report › Send To Excel   | engine's (`SendtoExcel(dgMain)`)                                                                                                                                                                                                                                                    |
| For Selected Record › BookM    | opens Book Master with `StrId = txtBookMastKt.Tag`, the **form's current record's** book, not the selection                                                                                                                                                                         |
| For Selected Record › Author   | ids = selected rows. If `SELECT COUNT(authorcokm) FROM authmast WHERE authorcokm IN (SELECT AuthorKt FROM MagazineVisheshAuthorT WHERE MagazineVisheshKt IN (<ids>)) > 0`, opens Author Master with that WhereCondition. Otherwise **nothing happens (no message)**                 |
| Utility › Update Seq           | `UpdateMagazineSeq` (above), then FillList                                                                                                                                                                                                                                          |
| Utility › Show All Records     | `WhereCondition = ""`, then FillList (StrId is kept)                                                                                                                                                                                                                                |

Keyboard (Form_KeyDown, Ctrl+): Z/Y prev/next, F the search-column picker, N/M/S/B/D/W/R the
toolbar buttons, L/U lock (fails, see above).

## Copy (`btnCopy_Click`)

"Do You Want to Add More With Copying Data?" → Yes sets `TranKm = 0` and `StrMode = "Add"`,
keeping the boxes and whatever popup DataTables were loaded. **Data-corrupting:** those rows
keep their positive keys or VishayEntry Ids. The save then UPDATEs the _original_ record's
child rows in place (they stay on the original) and gives the copy no child rows. It still
writes the popup summary text (BhashaName etc.) on the copy, and UpdateVishay blanks the copy's
Detail. **Web fix:** on copy, load the popups and reset every key/Id to a new temp key / 0, so
the copy gets its own rows (engine `copy: { loadTrans: [...] }` plus `onCopy` resetting keys).

## Reports and printing

No Crystal report. Only PrintSelectedColumn layouts (`Config_Master` ConfigType
'MagazineVishesh') and Send To Excel. The tblSearch printable columns are the engine's.

## Permissions

There are no `curr_utypeid` / `curr_lnid` checks in the form. EnableDisableDataEditing is the
standard one (Mode 1 on New/Modify, Mode 2 on Cancel/Save). The panel is not passed, so the boxes
stay editable in normal mode (no `lockPanel`). Menu access: the `magazine-vishesh-master` item
in `menu.ts`.

## SQL in form event handlers

- Form_Load: `select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where ConfigType='MagazineVishesh' and isnull(ShortcutKey,'')<>'' order by ConfigName`
- New: `SELECT ISNULL(MAX(Seq),0)+1 FROM MagazineVishesh WHERE BookMastKt=<Tag>`
- Ctrl+F: `SELECT Id,DisplayName FROM tblSearch where TransactionName='MagazineVishesh' and IsSearchable=1 order by seq`
- F2 on a box: the inline LibNo SELECT, and `select isnull(replace(F2EntryText,'{Id}',<TranKm>),'') from tblSearch where TransactionName='MagazineVishesh' and ColumnName='<col>'`
- The Author menu item's COUNT (above). The menu picker (above).

## Files / disk

`PDFPath` is a text column only. The form never opens, browses or copies the file. Keep it as a
text box. `desktopOnly.ts` is not needed.

## Hard-coded passwords

Only the standard Security password (`InputBoxProc`) for Delete and Lock, which the engine
already handles (`SECURITY_PASSWORD`).

## Desktop bugs

| Bug                                                                                                                                                                                                | Class                              | Web                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Copy saves the original's child rows instead of copying them (above)                                                                                                                               | **data-corrupting**                | reset keys on copy                                                                                     |
| `Ent.Seq = txtSeq.Text`: non-numeric text gives an InvalidCast MsgBox                                                                                                                              | **throws**                         | `int()`; a blank or non-number gives 0, so "- Seq is Mandatory"                                        |
| SubSeq > 5 chars / Ank > 10 chars: SQL truncation error, save lost                                                                                                                                 | **throws**                         | reject with a clear message (or give the boxes `maxLength` 5 / 10)                                     |
| Popup summaries overflow their columns (`BhashaName` 100, the others 500): SQL truncation error, save lost                                                                                         | **throws**                         | reject with a message, or truncate. Needs the user's decision                                          |
| Ctrl+L / Ctrl+U: no `Locked` column, so a SQL error after the password                                                                                                                             | **throws**                         | `lockable: false`                                                                                      |
| Edit's `RefreshCurrentGridRecord` puts plain `Sabhar`/`Reference`/`HeadName` and the un-`GetcontString`'d Detail into the grid row until the next refresh                                          | harmless quirk                     | just reload the row through the list query (no need to copy)                                           |
| `SetTextbox` turns `&lt;` into ">"                                                                                                                                                                 | harmless quirk                     | ignore                                                                                                 |
| The record's Book Name shows `BookName` without Part (tblSearch JoinCondition), but the LibNo pick shows it with Part                                                                              | harmless quirk                     | keep                                                                                                   |
| Show All Records keeps `StrId "0"` after a cancelled picker                                                                                                                                        | harmless quirk                     | keep                                                                                                   |
| Padvi / Sign cells are overwritten even when their list is cancelled                                                                                                                               | harmless quirk                     | keep (`clearOnCancel`-like)                                                                            |
| Author menu item: no message when nothing is found                                                                                                                                                 | harmless quirk                     | keep                                                                                                   |
| Vishay Master › Show In Use › Magazine Vishesh queries VishayEntry `TransactionName='MagazineVishesh'` (0 rows; this form saves `MagazineVisheshDetail`), so it always says "No Records Available" | harmless quirk, but in `vishay.ts` | flag for vishay-master. The fix would be to read `MagazineVisheshDetail`; it needs the user's decision |

## Implementation hints

- Engine pieces that fit: the tblSearch-driven grid, search and record (all the columns above
  are already in tblSearch); `ScreenDefinition.trans` for the four popups, with lookups;
  `upsertChildRows` (`audit: true`) for the four child tables; `book-common`'s `contString`,
  `grid()`, `signBetween`, `SIGN_UNDER_10`; `deleteRecord` + `deleteSelected`; `workReport`;
  `f2.booktkt` for the LibNo list; `actions` for Update Seq and the Author in-use item
  (`openInUse`).
- **Shared helper module** (e.g. `apps/api/src/master/screens/vishesh-entry-common.ts`), keyed by
  a small config `{ table, pk, prefix, vishayEntries: [{ column, transactionName }], children: [...] }`.
  Contents: the child-table save loop with summaries, the SaveVishayEntry port (`book.ts:479`
  already has one for praksnVisheshT, so generalise it to `(trx, name, table, pk, recordKt,
rows)`), the delete, the Update Seq action, the LibNo F2, the popup lookups (Bhasha / MType /
  AuthorType / Author / Tag) and the menu-picker list.
- **Engine gaps:**
  1. **frmVishayEntry on a form box.** `VishayEntryDialog` is only reachable from a
     `DisplayTransDialog` cell (`TransSpec.vishayEntry`). These forms open it straight from
     `txtDetailTran` etc. Needs a `FieldSpec.vishayEntry: { column }` (or an `onF2` that mounts
     the dialog), with the rows loaded and sent like any popup (`grid(f, 'DetailTran')`). The
     box text is the dialog's txtCode.
  2. **Menu-time picker.** The window must show the book list first, then open with
     `WhereCondition BookMastKt=<pick>`, or with `StrId 0` on cancel. That needs a ScreenSpec
     hook such as `openWith: { list, toCondition }` plus a server list. `initialIds` alone does
     not keep the condition for Refresh / Show All.
  3. **New with carried values.** `newDefaults(db)` cannot see the form. New must keep three
     boxes and compute Seq from the kept book. Needs a client `onNew(ctx)` hook, or
     `newDefaults(db, params)` with the Book Tag.
  4. Copy must reset popup keys (an `onCopy` per TransSpec already exists; VishayEntry rows
     need their `Id` set to 0).
  5. AddTableInfo on the MType cell list (`columnmaster|MagazineVisheshType`, DisplayListForm's
     "add a new item"): check whether `PickListDialog` supports it; Book Master's popups may
     already.

## Differences from the twin (`english-book-vishesh`)

| Aspect                                                   | Magazine Vishesh (this)                                                                   | English Book Vishesh                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Table / PK / prefix                                      | `MagazineVishesh` / `MagazineVisheshKm` / `MagazineVishesh…T`, parent `MagazineVisheshKt` | `EnglishBookVishesh` / `EnglishBookVisheshKm` / `EnglishBookVishesh…T` |
| Own columns                                              | Year, Ank, StatusKt, Sabhar, Reference, HeadName                                          | Mark1Kt, ColumnMastKt (+ derived ColumnNo), Numbers, Remark            |
| VishayEntry uses                                         | 4: Detail/Sabhar/Reference/HeadName (`MagazineVishesh<X>` names)                          | 1: Detail, TransactionName **`EnglishBookVishesh`**                    |
| Popups                                                   | Bhasha, MType, AuthorType, Author                                                         | the same + **Tag** (`EnglishBookVisheshTagT`, VishayKt)                |
| Grid order                                               | PK desc                                                                                   | `Seq Desc`                                                             |
| Seq parse                                                | `txtSeq.Text` (throws on text)                                                            | `Val(txtSeq.Text)`                                                     |
| SubSeq                                                   | not trimmed                                                                               | trimmed                                                                |
| Form-specific F2                                         | LibNo                                                                                     | LibNo + ColumnNo/ColumnMastkt (`columnmaster` Vibhag 'vishcol')        |
| Validation, New, Delete flow, menu, Update Seq, Show All | identical                                                                                 | identical (with its own names)                                         |
| Form class                                               | `frmMagazineVisheshNew` (a "New" exists beside an old one)                                | `frmEnglishBookVishesh`                                                |

## Web port (2026-10-06)

Ported, with English Book Vishesh, on one helper module:

- API: `apps/api/src/master/screens/vishesh-entry-common.ts` (`visheshEntryScreen(config)`),
  `magazine-vishesh.ts` (this screen's config), `vishay-entry.ts` (shared `saveVishayEntry`,
  CommonRepository.SaveVishayEntry, moved with `saveVishayEntries` / `VISHAY_ENTRY_LOOKUPS`
  out of `book.ts`; Book and Kruti Master use the same functions, unchanged).
- Web: `apps/web/src/screens/MagazineVisheshMaster.tsx` + `visheshEntry.ts` (shared popups,
  New carry-over, book list, right-click menu).
- Tests: `apps/api/test/master-vishesh-entry.integration.test.ts`, `apps/web/e2e/batch-c.spec.ts`.

New, generic engine pieces (opt-in, no other screen changed):

- `FieldSpec.vishayEntry` (+ `vishayEntryTrans(column)` in `commonTrans.ts`): F2 on a form box
  opens VishayEntryDialog over the record's lines; its Save keeps them (sent as
  `<column>.Rows`) and the box shows the dialog's txtCode.
- `ScreenSpec.onNew { keep, params }` + `ScreenDefinition.newDefaults(db, user, params)`: New
  keeps LibNo / Book Name / Work Done By and asks the server the kept book's next Seq.
- `ScreenSpec.openWith` + `ScreenDefinition.listCondition(params)`: the menu's book list is shown
  before the window; a pick becomes the window's WhereCondition (a list switch sent with every
  FillList, so Refresh keeps it), a cancel opens on StrId "0". `ScreenActions.showAll()` drops it.
  UcSearch is not limited by it (the form loads UcSearch with DefaultCond only).
- `copyWithNewKeys(column, 'temp' | 'zero')` (TransSpec.onCopy): Copy gives every popup row a new
  temporary key and every Vishay line Id 0.
- `ScreenActions.tags / refresh`, `FieldSpec.afterPick` gets the picked row.

Deliberate choices and fixes:

- **Copy (data-corrupting on the desktop):** all eight popups/Vishay boxes are loaded and their
  keys reset, so the copy gets its own rows and the original's are never touched.
- **Overlong values are refused with a validation line** instead of the desktop's SQL truncation
  error: SubSeq 5, Ank 10, Page No 250, Sabhar 3000, Reference 500, HeadName 4000, PDF Path 500,
  and the popup summaries (Bhasha 100, MType / Author Type / Author 500), e.g.
  "- SubSeq cannot be longer than 5 characters", after the Mandatory lines.
- `Ent.Seq = txtSeq.Text` threw on anything but a whole number: the web reads a non-number as 0,
  so "- Seq is Mandatory". Year is `Val()` (> 0, else 0).
- Ctrl+L / U: `lockable: false`; the API answers "Invalid column name 'Locked'." as the desktop.
- After an edit the grid row is re-read through the list query (contString'd), not the raw values.
- Popup rows with key 0 are inserted (`upsertChildRows`); the desktop would UPDATE nothing and
  lose them. The engine never sends key 0.
- **Show All Records after a cancelled book list** shows every record (the desktop kept StrId "0"
  and so still showed nothing). Harmless quirk dropped for a simpler, generic scope.
- Delete of several selected rows runs one transaction per record (the desktop: one for all).
- Not ported: the MType cell list's AddTableInfo (Ctrl+numpad add, frmVGPMmast — not in the
  engine yet); the dead `Detail1Tran` / Tag branches.
- Vishay Master › Show In Use › Magazine Vishesh now reads `MagazineVisheshDetail` (fixed in
  `vishay.ts`, noted in vishay-master.md).
