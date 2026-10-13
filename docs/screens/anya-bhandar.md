# Anya Bhandar (`AnyaBhandarM`)

Desktop form: `GGLibrarySolution/Library/Library/frmAnyaBhandar.vb` + `.Designer.vb` (inherits
`Library.frmMasterPage`). Repository `Library.BusinessContract/Concrete/AnyaBhandarRepository.vb`
(inherits `CommonRepository`). Entity `Library.Entity/AnyaBhandar.vb` (`EntAnyaBhandar` + four unused
child entity classes). F2 popups: `Library/CommonForms/frmDisplayTransNew.vb` `SetForm_AnyaBhandar`
(line ~9917), plus `frmVishayEntry` for the Subject popup's Vishay cell.
Menu: Library › Anya Bhandar (screen id `anya-bhandar`, no visibility rule: every user).

"Anya bhandar" = another library's holding: a record says "bhandar X holds this book under
size/record number Y", linked to our own `BookM` and one `BookT` library number. The save can create
that `BookM` + `BookT` itself, in the **obtain-book** series (`OB…`).

Also opened with a StrId from: Book Master › Anya Bhandar (`AnyaBhandarM.BookMastKt IN …`), Book
Tran (frmBookTranNew) › Anya Bhandar (`BookTKt IN …`). frmHastprat / frmHastpratLibNoTran also have
an Anya Bhandar item that filters on `AnyaBhandarM.HastpratKt` / `HastpratLibNoKt`: **those columns do
not exist** in the DB, so both items throw on the desktop (not this screen's problem; note it when
porting Hastprat).

## Table and key

- `AnyaBhandarM`, PK `AnyaBhandarKm` (IDENTITY). 20,843 rows locally; every row has BookMastKt and
  BookTKt > 0.
- Columns (live DB): `BhandarKt int NOT NULL`, `RecordNo int NOT NULL`, `Size nvarchar(3)`,
  `BookMastKt int`, `BookName nvarchar(500)`, `ParichayakName/Part/PSamvat/Pages/Price/GMalaNo/ISBNNo
nvarchar(max)`, `PSamvatcokt/PSamvatVK/AvrutiKt/TotalPages/GMalaKt/ShapeKt/BookTKt int`,
  `txtPrakashak/txtAuthor/txtBhasha/txtLipi nvarchar(max)`, `OldLibNo nvarchar(200)`,
  `Remark nvarchar(2000)`, `enuser int, endate date, moduser int, moddate date`.
- **No `Locked` column** → `lockable: false`. (Desktop Ctrl+L / Ctrl+U asks the Security password
  then runs `update AnyaBhandarM set Locked=…` and fails with SQL's "Invalid column name 'Locked'";
  harmless quirk — on the web just don't offer the lock.)
- `*_Del` shadow tables exist for every table here; no triggers (ignore them, per database.md).
- Entity quirks: `BookMastKt As String`, `AvrutiName/GMalaName As Integer` (never used). Harmless.

## The panel (Designer, 96 DPI, client 1012×708; SplitContainer at y=54, SplitterDistance 285)

Text boxes Times New Roman 14.25 pt, h=29; labels Times New Roman 11.25 pt, right-aligned. Grid:
header Arial Unicode MS 9 pt on LightSteelBlue, selection RGB(10,36,106)/white, wrap; rows Arial
Unicode MS 12 pt; GridColor LightSteelBlue; ReadOnly, FullRowSelect, no row headers.

| Tab | Box                           | Label (at)                      | Box at (x,y,w) | Column / notes                                                                |
| --- | ----------------------------- | ------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| 1   | txtBhandarKt (multiline)      | "Bhandar Name" (8,13)           | 111,9,210      | `BhandarKt` / `BhandarName` (kt pair). F2: tblSearch BhandarKt                |
| 3   | txtBookMastKt (multiline)     | "Book Name" (327,13)            | 465,9,223      | `BookMastKt` (tag) / `BookName` (text, saved as is). F2: special, see below   |
| 5   | txtSize                       | "Size/Record No" (694,13)       | 797,9,102      | `Size` (nvarchar(3)!). F2: distinct sizes                                     |
| 6   | txtRecordNo                   | (same label)                    | 905,9,79       | `RecordNo` int. No F2 (F2EntryText '')                                        |
| 8   | txtPsamvatcokt                | "Samvat" (8,51)                 | 111,47,61      | `PSamvatcokt` / `PSamvatcoName`. F2: samvmast                                 |
| 9   | txtPsamvat                    | –                               | 175,47,79      | `PSamvat` text. F2: distinct                                                  |
| 10  | txtPsamvatVK (ReadOnly)       | –                               | 257,47,64      | `PSamvatVK` int, computed on leave                                            |
| 12  | txtParichayakName (multiline) | "Pari. Name/Part Type" (327,51) | 465,47,152     | `ParichayakName`. F2: distinct                                                |
| 13  | txtPart (multiline)           | –                               | 618,47,70      | `Part`. F2: distinct                                                          |
| 15  | txtAvrutikt                   | "Avruti" (694,51)               | 797,47,206     | `AvrutiKt` / `AvrutiName`. F2: AvrutiMast (AddTableInfo `AvrutiMast           | AvrutiName`) |
| 17  | txtGMalaKt                    | "GMalaName/No" (8,89)           | 111,85,156     | `GMalaKt` / `GMalaName`. F2: VisheshMast remark 'gmala'                       |
| 18  | txtGMalaNo                    | –                               | 268,85,53      | `GMalaNo`. F2: distinct                                                       |
| 20  | txtPages                      | "Pgs/TotPgs" (327,89)           | 465,85,110     | `Pages`. F2: distinct. Leave → TotalPages                                     |
| 21  | txtTotalPages                 | –                               | 578,85,110     | `TotalPages` int (Val)                                                        |
| 23  | txtPrice                      | "Price" (694,89)                | 797,85,206     | `Price` text. F2: distinct                                                    |
| 25  | txtShapekt                    | "Shape" (8,127)                 | 111,123,210    | `ShapeKt` / `ShapeName`. F2: VisheshMast remark 'Shape'                       |
| 47  | txtRemark                     | "Remark" (327,127)              | 465,123,223    | `Remark`. F2: distinct                                                        |
| 29  | txtISBNNo                     | "ISBN No" (694,127)             | 797,123,206    | `ISBNNo`. F2: distinct                                                        |
| 31  | txtPrakTran                   | "Prakashak" (8,165)             | 111,161,210    | popup PrakTran → `AnyaBhandarPrakT`; text saved to `txtPrakashak`             |
| 33  | txtSubjTran                   | "Subject" (327,165)             | 465,161,223    | popup SubjTran → `AnyaBhandarSubjectT` (+VishayEntry)                         |
| 35  | txtBhashaTran                 | "Bhasha" (694,165)              | 797,161,206    | popup → `AnyaBhandarBhashaT`; text → `txtBhasha`                              |
| 38  | txtBookTKt                    | "Library No" (8,203)            | 111,199,210    | `BookTKt` / `BookTName`(=BookT.Libno). F2: special                            |
| 40  | txtOldLibNo                   | "Old Library No" (327,203)      | 465,199,223    | `OldLibNo`. No F2                                                             |
| 36  | txtLipiTran                   | "Lippi" (694,203)               | 797,199,206    | popup → `AnyaBhandarLipiT`; text → `txtLipi`                                  |
| 27  | txtAuthTran                   | "संपादक" (8,241)                | 111,237,210    | popup AuthTran → `AnyaBhandarAuthorT` (+AuthT, AuthTypeT); text → `txtAuthor` |
| 42  | txtMulAuthorTran              | "मूळकर्ता संपादक" (327,241)     | 465,237,223    | popup → `AnyaBhandarMulAuthorT` (no master column)                            |
| 44  | txtAnuAuthorTran              | "अनुवादक संपादक" (694,241)      | 797,237,206    | popup → `AnyaBhandarAnuAuthorT` (no master column)                            |

Record load (FillData → `GetDataTableById` = `GetDataTable` IsDisplayGrid=0) fills boxes by name:
`txt<X>Kt` gets Tag = column `<X>Kt`, Text = column `<X>Name`; others Text = column `<X>`. Every value
gets `&gt;`→`>` and **`&lt;`→`>`** (sic; harmless quirk). The Tran boxes read the tblSearch Type-T
JoinConditions (`txtPrakashak as PrakTran`, `txtAuthor as AuthTran`, `txtBhasha as BhashaTran`,
`txtLipi as LipiTran`, STUFF…FOR XML for SubjTran / MulAuthorTran / AnuAuthorTran).

### Box behaviour

- **Txt_Leave txtPsamvat**: if Samvat type picked (Tag>0) and `txtPsamvat` longer than 2 chars:
  numeric → `PSamvatVK = GetVikramSamvat(type, year)`; else if all but the last char is numeric,
  use that. (The check for `txtPsamvatcokt` compares against a lowercase literal and never matches:
  only leaving txtPsamvat recomputes; harmless.) Web: `getVikramSamvat` from `AuthorMaster.tsx`,
  same as BookMaster.tsx line ~575.
- **Txt_Leave txtPages**: `replacepgnum` → TotalPages ("1-10+5" → 15), identical to Book Master.
- F2 on a Tran box opens its popup with buttons only when the box is not read-only (edit mode).
- `clsCom.SetTextboxEvent` / `SetControl` standard Enter/Leave colours (WhiteSmoke / White).

## Validation (`AnyaBhandarRepository.GetValidationMessage`) — ElseIf chain, first failure only

1. `Please Bhandar Name` (BhandarKt = 0; no "- " prefix, sic)
2. `- Please Enter Book Name` (BookName empty)
3. `- Please Enter Size`
4. `- Please Enter RecrordNo` (RecordNo = 0; typo verbatim)

Form-level, in Save() order:

1. `Are You Sure to Save This Record?` (Yes/No).
2. Mapping `txtRecordNo.Text` into an Integer: non-numeric text throws a VB cast error (MsgBox ex
   text). Web: use `intText()` (SQL Server's conversion message) — RecordNo is NOT NULL int.
3. If BookMastKt tag = 0 **and** Book Name typed **and** new record:
   `Do You want to Add New Book Entry?` — Yes sets `AddBook`, No aborts the save.
4. Validation above → MsgBox, stop.
5. Save; success → `Record Saved Successfully`.

`Size` is nvarchar(3): a longer value fails with SQL Server's truncation error, whole save rolled
back. Keep (or pre-check with the same message). No uniqueness check on (BhandarKt, Size, RecordNo).

## F2 lookups

| Box                                                                                                   | Source                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| txtBhandarKt                                                                                          | tblSearch `BhandarKt`: `select b.partyMkm,b.PName,b.txtAddress as address from PartyM as b WHERE Categorykt=14132 order by b.PName`                                                                                                                                       |
| txtPsamvatcokt                                                                                        | `select samvatcokm ,samvatname from samvmast order by samvatname`                                                                                                                                                                                                         |
| txtAvrutikt                                                                                           | `select Avrutitid,Avrutiname from AvrutiMast order by AvrutiName` (AddTableInfo `AvrutiMast                                                                                                                                                                               | AvrutiName`) |
| txtGMalaKt                                                                                            | `select v.Tid,v.Vishesh from VisheshMast as v where v.remark ='gmala' order by v.Vishesh`                                                                                                                                                                                 |
| txtShapekt                                                                                            | `select Tid,Vishesh,v.Brief ,v.Notes ,v.HindiWord ,v.ShortNm from VisheshMast as v where remark = 'Shape' order by Vishesh`                                                                                                                                               |
| txtSize, txtGMalaNo, txtISBNNo, txtRemark, txtPages, txtParichayakName, txtPart, txtPrice, txtPsamvat | `select <col> from AnyaBhandarM where isnull(<col>,'')<>'' group by <col> order by <col>` (tblSearch)                                                                                                                                                                     |
| txtRecordNo, txtOldLibNo, txtTotalPages, txtPsamvatVK                                                 | none (F2EntryText '' / no row) → `noF2`                                                                                                                                                                                                                                   |
| txtBookTKt                                                                                            | inline: `Select tid, Libno FROM BookT WHERE ISNULL(Libno,'')<>'' ORDER BY LibNo` then `select BookMastKm,BookName FROM BookM WHERE BookMastKm=<picked tid>` → sets Book Name box. **Bug**, see below                                                                      |
| txtBookMastKt                                                                                         | inline: `select distinct BookMastkm,BookName,Part,txtPrakashak AS Prakashak,txtAuthor AS Author,PSamvat AS Samvat,txtBhasha AS Bhasha,Pages,TotalPages,txtBookTran AS LibNo from BookM where isnull(BookName,'')<>'' order by BookName` then the **fill-from-book** below |

### F2 on Book Name: fill from the picked book (Txt_KeyDown, txtBookMastKt)

When a book is picked (Tag > 0):

1. `GetBookDataTable("BookM", id)`: `select <UcSearch.GetColumnsForSelectedRecord("BookM")> from BookM
where BookMastkm=<id>` + for **Operators (curr_utypeid = 3)**: `and txtBookTran not like '%CM%' and
… '%ms%' … '%CP%' … '%SN%'`, `ORDER BY BookM.BookMastkm DESC`. (This is the only operator rule in
   the form: the F2 list itself is not filtered, the fill just finds nothing.) Reuse book.ts
   `operatorFilter` / Book Master's record query.
2. If found, copies into the boxes: Psamvatcokt(+Name), Psamvat, PsamvatVK, ParichayakName, Part,
   AvrutiKt(+AvrutiName), GMalaKt(+GMalaName), GMalaNo, Price, ShapeKt(+ShapeName), Pages,
   TotalPages, ISBNNo, PrakTran, BhasTran→txtBhashaTran, LipiTran. (Not Size; AuthTran commented out.)
3. Library No: `select TOP(1)Tid,LibNo FROM BookT WHERE BookMastkt=<id> ORDER BY tid desc` → txtBookTKt.
4. Replaces the popups' tables with the book's rows, keys **negated** (so Save inserts them as new
   AnyaBhandar rows and, on Edit, prunes the old ones):
   - dtAuthor / dtAuthorAuth / dtAuthorAuthType from `praksnAuthorT` / `praksnAuthorAuthT` /
     `PraksnAuthorAuthTypeT` (form lines 638–640, verbatim SQL there). Authors are filtered:
     an author row typed मूळकर्ता/टीकाकार/अनुवादक/विवेचक/लेखक is dropped (`praksnauthorkm not in (…)`
     since v3.4.3.1; before, `prakashannokt not in (…)`, a per-book test, so a book with a मूळकर्ता
     got no संपादक rows at all), and the type rows drop those types.
     txtAuthTran gets `authortype-authorname` per row **appended** to its old text (not cleared).
   - dtBhasha from `praksnBhashaT` (`-prakshnbhashakm AS AnyaBhandarBhashaKm, <TranKm> AS AnyaBhandarKt,
bhashakt, bhasa_attr, seq`), dtLipi from `praksnLipiT`, dtPrakashak from `praksnPrakT` (same
     columns as the PrakTran F2EntryText), dtSubject from `BookSubjectT` (`-BookSubjectKm AS
AnyaBhandarSubjectKm, EntryType, '' AS Vishay, WorkDoneByKt, WorkDoneByName, PrintDate dd/MM/yyyy,
PrintSeq, Remark, Seq` — Vishay is blank). dsAuthor / dsSubject are NOT refreshed, so opening
     those popups afterwards shows stale nested tables (harmless desktop quirk; web should send
     consistent nested rows).
   - Mul/Anu authors: loads the record's current MulAuthorTran / AnuAuthorTran rows if not loaded,
     then **appends** (key 0): book authors of type मूळकर्ता/टीकाकार → Mul; अनुवादक/विवेचक/लेखक → Anu;
     then Kruti authors of the book's library numbers (`krutireflibno` → `krutiautht`,
     `IsDownLevel` true → Anu, else Mul, skipping AuthorKt already present). Box texts appended with
     SignBetweenStr. On an existing record this duplicates rows already there (quirk).
   - An unused `strGrpNo` (common-group book ids) is computed and ignored.

Web: an action `fillFromBook(bookId)` returning field values + the popup rows; client uses
`afterPick` + `ctx.putTrans(...)`. Engine already has both.

## Grid columns

Designer columns (`gvMain` order) bound in FillList; data from `GetDataTable` IsDisplayGrid=1 using
tblSearch `DisplayInGrid=1` rows (confirmed in DB), ordered `AnyaBhandarKm DESC`, no TOP:

| #   | Header              | Width | DataProperty  | tblSearch source                                                                  |
| --- | ------------------- | ----- | ------------- | --------------------------------------------------------------------------------- |
| 0   | AnyaBhandarKm       | 5     | AnyaBhandarKm |                                                                                   |
| 1   | Bhandar Name        | 150   | BhandarName   | JC `(select PName from PartyM where partyMkm=AnyaBhandarM.BhandarKt) BhandarName` |
| 2   | Size                | 50    | Size          |                                                                                   |
| 3   | RecordNo            | 100   | RecordNo      |                                                                                   |
| 4   | BookMastKt (hidden) |       | BookMastKt    |                                                                                   |
| 5   | BookName -Part      | 230   | BookMastName  | GridColumnName `BookName + '-' + part (when part)`                                |
| 6   | Prakashak           | 150   | txtPrakashak  |                                                                                   |
| 7   | Author              | 80    | txtAuthor     |                                                                                   |
| 8   | PSamvatVK           | 70    | PSamvatVK     |                                                                                   |
| 9   | Bhasha              | 70    | txtBhasha     |                                                                                   |
| 10  | Lipi                | 70    | txtLipi       |                                                                                   |
| 11  | Pages(Total)        | 70    | TotalPages    |                                                                                   |
| 12  | BookTKt (hidden)    |       | BookTKt       |                                                                                   |
| 13  | LibNo               | 70    | BookTName     | JC `(select Libno from BookT where Tid=AnyaBhandarM.BookTKt) BookTName`           |
| 14  | Avruti              | 70    | AvrutiName    | JC `(select Avrutiname from AvrutiMast …) AvrutiName`                             |

No DefaultCond / filter. Searchable columns = tblSearch `IsSearchable=1` (Ctrl+F picker).
Grid click / Up / Down loads the record; lblEntry = `GetEntryUser`.

## Derived values

- **RecordNo** on New and Copy: `SELECT ISNULL(MAX(RecordNo),0)+1 FROM AnyaBhandarM WHERE Size=N'<size>'`
  (string-concatenated; parameterise). Not recomputed when Size is edited afterwards, not checked at
  save.
- **New (btnNew_Click)**: if Size box is empty → `InputBox("Please Enter Size")`; empty/cancel aborts
  New. Clears the panel but **keeps Size and Bhandar** (tag + text) from the previous record, then
  computes RecordNo. On load with an empty grid, New runs automatically (so the Size prompt appears).
- **txtAuthor** (repository, start of Save, only when dtAuthor has rows): rebuilt from the author
  popup rows exactly as Book Master's `authorText` in `book.ts` (the type's name, `authortype` — `authtyattr` up to v3.3.3.6 — + sign short name,
  AnyaName/AuthorName + (Guru) + [Identyty-padvi short] + sign short; `(/)`→` /`, `/,`→`/`) but keyed
  by `AnyaBhandarAuthorKm` / `AnyaBhandarAuthorKt`. With no author rows the typed text is saved.
- txtPrakashak / txtBhasha / txtLipi are saved **as the box text** (no recompute, unlike Book Master).
- **Obtain-book library number** (AddBook) — inline copy of `GetMemID`:
  ```
  ObSeriesKt = SELECT bookcodekm from bookmast WHERE bookname='obtain book'     -- 13 locally ('obtain book ', prefix 'OB')
  vnumchr    = Select bookprefix from bookmast WHERE bookcodekm=<ObSeriesKt>    -- 'OB'
  VLDIGIT    = Select ISNULL(MAX((right(libno, 5))),0)+1 From BookT where Left(libno,2)='<vnumchr>'
  LibNo      = prefix + VLDIGIT zero-padded to 5 digits (6 if the prefix is 1 char)  -- next: OB08568
  ```
  This is exactly `nextLibNo(db, seriesKt)` in **`book-tran.ts`** (not book-common.ts). Move it to
  `book-common.ts` (or import from book-tran.ts) and wrap the MAX in UPDLOCK/HOLDLOCK like `nextKey`.
  (Desktop GetMemID leaves LibNo unchanged when VLDIGIT has >6 digits; nextLibNo returns ''.)

## Save (`AnyaBhandarRepository.Save`) — one transaction

Parameters: Ent + dtPrakashak, dtAuthorAuth, dtAuthorAuthType, dtAuthor, dtBhasha, dtLipi,
dtSubject, dtSubjectVishay, dtMulAuthor, dtAnuAuthor. A table that was never loaded has no columns
and is skipped (web: `grid()` returns null). Order:

1. **Authors (edit only, if dtAuthor has rows)**: `delete from AnyaBhandarAuthorAuthTypeT / AnyaBhandarAuthorAuthT /
AnyaBhandarAuthorT where AnyaBhandarKt=<id>`; recompute txtAuthor (above).
2. **Edit, obtain-book re-link** (see Bugs #1):
   `PrevObBookTKt = SELECT ISNULL(BookTKt,0) FROM AnyaBhandarM INNER JOIN BookT ON AnyaBhandarM.BookTKt=BookT.Tid
WHERE AnyaBhandarKm=<id> AND BookT.SeriesKt=<ObSeriesKt>`; if >0 and ≠ new BookTKt:
   `NewSeriesKt = SELECT ISNULL(SeriesKt,0) FROM BookT WHERE Tid=<new BookTKt>` then
   `UPDATE BookT SET SeriesKt=<NewSeriesKt>,LibNo='<Ent.LibNo>' WHERE BookTKt=<Ent.BookTKt>` → throws.
3. **AddBook** (new record, Book Name typed, no book picked, user said Yes):
   1. LibNo = next OB number (above); overwrites whatever txtBookTKt held.
   2. `INSERT INTO BookM(BookName,ParichayakName,Part,PSamvatcokt,Psamvat,PsamvatVK,AvrutiKt,GMalaKt,GMalaNo,
Pages,TotalPages,Price,Size,ShapeKt,txtPrakashak,txtAuthor,txtBhasha,txtLipi,txtbooktran,enuser,endate)`
      — values from the Ent (txtAuthor already recomputed; txtbooktran = LibNo; endate getdate();
      no ISBNNo, no Remark, no moduser) → `@@identity` = BookMastKt.
   3. `select COUNT(tid) from BookT where Libno='<LibNo>'` > 0 → MsgBox `LibNo Already Exist`, return 0
      (transaction not committed → rolled back on dispose; no "saved" message).
   4. `INSERT INTO BookT(BookMastkt,SeriesKt,Libno,MainL,enuser,endate) VALUES (<book>,<ObSeriesKt>,<LibNo>,1,<user>,getdate())`
      → `@@identity` = BookTKt. Note: no seq, BkGrNo, moddate/moduser — unlike `saveBookT` in
      book-tran.ts (which sets BkGrNo = MAX+1 and seq). Keep the desktop's narrower insert, or reuse
      saveBookT's BkGrNo rule — **open question**.
4. `INSERT INTO AnyaBhandarM (BhandarKt,RecordNo,Size,BookMastKt,BookName,ParichayakName,Part,PSamvatcokt,PSamvat,
PSamvatVK,AvrutiKt,Pages,TotalPages,Price,GMalaKt,GMalaNo,ShapeKt,ISBNNo,txtPrakashak,txtAuthor,txtBhasha,txtLipi,
BookTKt,OldLibNo,Remark,enuser,endate)` (getdate()) → `@@identity`; or `UPDATE … SET <same>, moduser, moddate=getdate()
WHERE AnyaBhandarKm=@id`. All parameterised. `PSamvatVK`/`TotalPages` = Val(); BookMastKt/BookTKt =
   Val(tag).
5. Child tables (below). If AddBook, each also writes the matching **book** child row.
6. Commit. Then the form: `insertworkreports(TransactionName, PrimaryColumn, id, user, dtSel, dtTmpSel)`
   for Add and Edit (→ `workReport: true`, Add+Edit, not Delete).

### Child tables saved with the record

All child keys are IDENTITY except the `praksn*` book tables (MAX+1, assigned by the app). Child
tables have no audit columns. Values are string-concatenated on the desktop (INint / INSQ) —
parameterise everything (author `txtAuth` is `N'…'` with no quote escaping: an apostrophe in a name
breaks the save — throws, fix by parameters).

| Popup (tblSearch T col)          | Table, key                                                                                                                                                                                                                                                                                 | Save rule                                                                                                                                                                                                                                | AddBook also writes                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PrakTran                         | `AnyaBhandarPrakT` (AnyaBhandarPrakKm): PrakashakKt, Seq, Purva bit, nameSelected, PrakTypekt, Remark, SignKt                                                                                                                                                                              | upsert by key (≤0 insert), then on Edit delete the rest. Fits `upsertChildRows` (`Purva: 'bit'`; nameSelected/Remark text)                                                                                                               | `praksnPrakT(prashnprakkm,prakashannokt,prakashakkt,seq,purva,nameSelected,PrakTypekt,remark,signkt)`, key `max(prashnprakkm)+1`, then +1 **before** the first insert (skips one; and no ISNULL → throws on an empty table). Every row |
| BhashaTran                       | `AnyaBhandarBhashaT` (AnyaBhandarBhashaKm): BhashaKt, Seq                                                                                                                                                                                                                                  | upsert/prune; rows with BhashaKt ≤ 0 skipped                                                                                                                                                                                             | `praksnBhashaT(prakshnbhashakm,prakshnokt,bhashakt,seq)`, `isnull(max)+1` then +1 before insert                                                                                                                                        |
| LipiTran                         | `AnyaBhandarLipiT` (AnyaBhandarLipiKm): LippiKt, Seq                                                                                                                                                                                                                                       | upsert/prune; LippiKt ≤ 0 skipped                                                                                                                                                                                                        | `praksnLipiT(prakshnlipikm,prakashankt,lippikt,seq)`, same                                                                                                                                                                             |
| AuthTran (3 tables)              | `AnyaBhandarAuthorT` (txtAuth = SignBetweenStr(authortype, authorname, "-"), Seq), `AnyaBhandarAuthorAuthTypeT` (AnyaBhandarAuthorKt, AnyaBhandarKt, AuthorTypeKt, SignKt, Seq), `AnyaBhandarAuthorAuthT` (AnyaBhandarAuthorKt, AnyaBhandarKt, authorkt, padkt, signkt, seq, AuthAnyaNmKt) | **delete-insert**, only when dtAuthor has rows (deleting all authors in the popup leaves the old rows: quirk, keep). Nested rows matched on the popup's temp key `AnyaBhandarAuthorKm` = `AnyaBhandarAuthorKt`                           | `praksnAuthorT` / `PraksnAuthorAuthTypeT` / `praksnAuthorAuthT`, keys `isnull(max)+1` each, +1 per row                                                                                                                                 |
| SubjTran                         | `AnyaBhandarSubjectT` (AnyaBhandarSubjectKm): EntryType, Vishay, WorkDoneByKt, PrintSeq, Remark, Seq, PrintDate (dd/MM/yyyy swapped to MM/dd/yyyy literal; omitted when blank, i.e. an update never clears it)                                                                             | upsert; prune on Edit; **only when dtSubject has rows** (removing every subject keeps them: quirk)                                                                                                                                       | `BookSubjectT(BookMastKt,EntryType,Vishay,WorkDoneByKt,PrintSeq,Remark,Seq[,PrintDate])` for new rows; no VishayEntry for the book                                                                                                     |
| SubjTran extra (dtSubjectVishay) | `VishayEntry` TransactionName `'AnyaBhandarSubject'`, RecordKt = subject key                                                                                                                                                                                                               | `CommonRepository.SaveVishayEntry(dtSubjectVishay, "AnyaBhandarSubject", "AnyaBhandarSubjectT", "AnyaBhandarSubjectKm", dtSubjectVishay.Rows(0)("RecordKt"), …)` then `EXEC UpdateVishay 'AnyaBhandarSubject', '<RecordKt>'`. **Bug #3** | –                                                                                                                                                                                                                                      |
| MulAuthorTran                    | `AnyaBhandarMulAuthorT` (AnyaBhandarMulAuthorKm): AuthorKt, Seq                                                                                                                                                                                                                            | upsert (key = 0 insert; the popup's new rows are -1 → **UPDATE … WHERE km=-1**, a silent no-op: Bug #4), then delete the rest — on Add too                                                                                               | –                                                                                                                                                                                                                                      |
| AnuAuthorTran                    | `AnyaBhandarAnuAuthorT` (AnyaBhandarAnuAuthorKm): AuthorKt, Seq                                                                                                                                                                                                                            | same as Mul (same -1 bug)                                                                                                                                                                                                                | –                                                                                                                                                                                                                                      |

The Author/Prakashak/Bhasha/Lipi popups loaded via fill-from-book carry negative keys → inserted.

### Popups (frmDisplayTransNew `SetForm_AnyaBhandar`, FormName "AnyaBhandar")

Rows come from tblSearch F2EntryText with `{Id}` = TranKm (verified in the DB; AuthTran has 3
result sets: dtAuthor1, dtAuthorAuth, dtAuthorAuthType; SubjTran has 2: dtSubject, dtSubjectVishay).
On popup Save, seq is renumbered 1..n **except** for `author` and `multiauthor` (user-typed Seq kept).
Text written back to the box after Save: generic loop (same as Book Master's: per row the first
non-key column, then the rest joined "-", rows joined ", "; Prakashak uses NameSelected else
prakname; "False"→"", "True"→"पूर्व", ",,"→",", "--"→"-"). Subject: the Vishay cells concatenated
(`SignBetweenStr(tmp, vishay, "")`).

| TranName              | Columns / new row                                                                                                                                                                  | Cell lookups (s=0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| author                | AnyaBhandarAuthorKm (hidden; new = min−1 or −1), authortype, authorname, Seq (editable)                                                                                            | authortype → nested **multiauthortype**; authorname → nested **multiauthor**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| multiauthortype       | AnyaBhandarAuthorAuthTypeKm, AnyaBhandarAuthorKt, authortypekt, authortype, signkt, Sign, seq                                                                                      | authortype: `select authtycokm,authortype from authtype order by authortype`; Sign: `select columnmastkm,name from columnmaster where vibhag = 'sign' and isnull(columnno,0)<10 order by name` (= `SIGN_UNDER_10`). Cell text = `authortype (sign) ,` joined                                                                                                                                                                                                                                                                                                                                     |
| multiauthor           | AnyaBhandarAuthorAuthKm, AnyaBhandarAuthorKt, authorkt, authorname, AuthAnyaNmKt, AnyaName, padkt, Padvi, Guru, identyty, signkt, Sign, seq                                        | authorname: AUTHOR_LIST (same SQL as book.ts `AUTHOR_LIST`) → sets authorname/AnyaName = mainname, AuthAnyaNmKt 0, authorkt, Guru, identyty; AnyaName: `anyNames`; Padvi: `select tid,vishesh from visheshmast where remark='avastha' and isnull(visheshno,0)>5 order by vishesh`; Sign: SIGN_UNDER_10                                                                                                                                                                                                                                                                                           |
| prakashak             | AnyaBhandarPrakKm, AnyaBhandarKt, prakashakkt, prakname, purva (checkbox), nameSelected, PrakTypekt, PrakType, Remark, signkt, sign, seq; new row key = frm.TranId (never set → 0) | prakname (col 3): prakmast list with addresses/contacts/gmala/any names (as book.ts PrakTran `prakname`), sets prakashakkt, prakname, nameselected = mainname + " "; nameSelected (col 5): `select replace(0,0,0) as id,prakname as anyanm from prakmast where prakcodekm=<kt> union select replace(0,0,0),anyanm from prakmanaynmt where prakmastkt=<kt>`; PrakType (col 7): `select columnmastkm,name from columnmaster where vibhag = N'prakoption' and isnull(columnno,0)>0 order by name`; sign (col 10): `… vibhag like 'sign' and isnull(columnno,0)<10 …`                                |
| bhasha                | AnyaBhandarBhashaKm, AnyaBhandarKt, bhashakt, bhasa_attr, seq                                                                                                                      | `select bhashacokm,bhashaname,bhasa_attr from bhasmast order by bhashaname`; adds the next row after a pick on the last row                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| lipi                  | AnyaBhandarLipiKm, AnyaBhandarKt, lippikt, lipi_attr, seq                                                                                                                          | `select lipicodekm,lipiname,lipi_attr from lipimast order by lipiname`; same add-next                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| mulauthor / anuauthor | Anya…AuthorKm (hidden, new = **−1**), AuthorKt (hidden), AuthorName, seq                                                                                                           | `SELECT authorcokm,authorname FROM authmast ORDER BY authorname`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| subject               | AnyaBhandarSubjectKm (hidden, new 0), EntryType (new "Main Title(New)"), Vishay, WorkDoneByKt (hidden), WorkDoneByName, PrintDate, PrintSeq, Remark, Seq                           | EntryType: `SELECT 'MainTitle' As Id,'Main Title(New)' AS Name UNION SELECT 'SubTitle','Sub Title(New)' UNION SELECT 'Old','Old'`; PrintDate: InputBox `Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)` default today; WorkDoneByName: `SELECT DISTINCT partyMkm,PName FROM PartyM WHERE Categorykt IN(1577,1581) ORDER BY PName`; Vishay: key 0 → `Please Save Reord First` (sic); not in edit → `Please Click on Modify from Main Record to Save Detail` + newline + `Are you sure to opn Detail?`; else frmVishayEntry (engine `vishayEntry` on TransSpec, `VISHAY_ENTRY_LOOKUPS`) |

## Right-click menu

| Item                              | Behaviour                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| For Selected Record › Book Master | ids = `SELECT … DISTINCT BookMastKm FROM BookM WHERE BookMastKm IN (<selected rows' BookMastKt>)`; none → `No Record Found`; else open frmBookMasterNew with StrId → `{kind:'open', screen:'book-master', ids, emptyMessage:'No Record Found'}` (`openInUse`) |
| Print Report › Selected Column    | `clsCom.PrintSelectedColumn(dgMain, "AnyaBhandarM", "AnyaBhandarKm")` → engine `printSelectedColumn`                                                                                                                                                          |
| Print Report › <layouts>          | Config_Master `ConfigType='AnyaBhandarM' and isnull(ShortcutKey,'')<>''` — locally the two layouts ("Jain Vidhya Shada", "… 2") have empty ShortcutKey, so **no sub-items appear** (engine `printLayouts` presumably applies the same filter; check)          |
| Print Report › Send To Excel      | `SendtoExcel(dgMain)` → engine                                                                                                                                                                                                                                |

## Toolbar / keys (frmMasterPage)

Standard New / Modify / Save / Cancel / Delete / Refresh / Work Report / Copy / Exit, Ctrl+N/M/S/B/D/
W/R, Ctrl+Z/Y prev/next, Ctrl+F search-column picker. Work Report and Copy are disabled at Form_Load
(until EnableDisableDataEditing re-enables them on the next state change). Exit in edit mode:
`Are you sure to close this form?` (title `Record cannot be saved`).

- **Copy**: `Do You Want to Add More With Copying Data?` → loads every popup's rows of the current
  record (`FillTransactionDatatable()`), TranKm = 0, Add mode, RecordNo recomputed for the size.
  **Bug #5**: the copied child rows keep their keys, so Save updates the original record's rows
  instead of inserting (only authors, delete-insert, come across). Web: `copy` +
  `TransSpec.onCopy` resetting keys to ≤0 (Book/Kruti already do this).
- **Delete**: `Are You Sure to Delete This Record?` → Security password (`InputBoxProc`, desktop
  hard-coded `gganga@123` / alt; web already uses `SECURITY_PASSWORD` / `SECURITY_PASSWORD_ALT`) →
  `DELETE FROM AnyaBhandarM WHERE AnyaBhandarKm=@Id` → `Record Deleted ` (title Information). No
  CheckInUse, no work report. **Bug #6**: the 9 child tables + VishayEntry are left orphaned. The
  BookM/BookT it may have created are (correctly) left alone.

## Reports and printing

No `.rpt`. Only Print Selected Column + Config_Master layouts + Send To Excel.

## Permissions

Menu: everyone. No `curr_utypeid` / `curr_lnid` checks besides the Operator CM/ms/CP/SN filter in
the fill-from-book query. `EnableDisableDataEditing(ToolStrip1, …)` = the standard mode switching
(no per-screen rights).

## SQL in form event handlers

All quoted above: Config_Master layouts (Load), RecordNo (New / Copy), tblSearch reads
(FillTransactionDatatable, F2), the Book Name / Library No F2 SQL and the fill-from-book block
(form lines 602–707), Book Master menu STUFF query.

## Files / images / disk

None. No hard-coded passwords except InputBoxProc's (already in env).

## Desktop bugs

1. **Throws — editing a record whose library number is an OB number and changing it**:
   `UPDATE BookT … WHERE BookTKt=…` — BookT has no `BookTKt` column (key is `tid`), so the whole
   save fails ("Invalid column name 'BookTKt'") and rolls back. Even with `Tid`, the statement would
   only rewrite the new BookT row's own SeriesKt/LibNo with themselves (a no-op). Web fix: skip it and
   save normally. (Open question: was the intent to release/rename the old OB BookT row?)
2. **Wrong book — F2 on Library No** looks up `BookM WHERE BookMastKm = <BookT.tid>`, so the Book
   Name box gets an unrelated book (or none) and Save stores that wrong BookMastKt.
   Data-corrupting → fix: `SELECT BookM.BookMastKm, BookName FROM BookT JOIN BookM ON BookM.BookMastKm
= BookT.BookMastkt WHERE BookT.tid = @tid`.
3. **Data-corrupting — Subject Vishay entries**: SaveVishayEntry uses the first dtSubjectVishay row's
   RecordKt for every new entry and for its delete/UpdateVishay, so editing the Vishay of two subjects
   in one save puts the second subject's new entries under the first and never refreshes the second.
   Fix: save per subject (`saveVishayEntries(trx, 'AnyaBhandarSubject', subjectKm, rowsOfThatSubject)`
   for each, prune per subject, `EXEC UpdateVishay` per subject), as book.ts does.
4. **Data loss — new Mul/Anu author rows**: the popup gives new rows key −1 but the repository
   inserts only key = 0, so a row added in the popup becomes `UPDATE … WHERE …Km=-1` (nothing), then
   is pruned. Only rows added by fill-from-book (key 0) are ever saved. Fix: insert when key ≤ 0
   (`upsertChildRows`).
5. **Copy** keeps child keys (see Copy). Fix: reset keys on copy.
6. **Delete** orphans child rows. Fix: `deleteRecord` deleting `AnyaBhandar{Prak,Bhasha,Lipi,Author,
AuthorAuth,AuthorAuthType,Subject,MulAuthor,AnuAuthor}T` + `VishayEntry` (TransactionName
   'AnyaBhandarSubject' for its subjects) first.
7. **Throws** — praksnPrakT key `max(prashnprakkm)+1` without ISNULL (empty table only; harmless
   locally) and the skipped key value (harmless); all MAX+1 keys are race-prone → use `nextKey` /
   `insertWithMaxId` per insert.
8. **Throws** — apostrophes in author names (`N'…'` concatenation) / names in INSQ text. Parameterise.
9. Harmless quirks to keep: `&lt;`→`>` on load; first validation message lacks "- "; "RecrordNo",
   "Reord", "opn"; author filter per book; deleting all rows of the Author or Subject popup keeps the
   old rows; Mul/Anu rows appended (duplicated) by fill-from-book on an existing record; Lock keys
   fail (no Locked column — just don't offer them).

## Implementation hints

- API `apps/api/src/master/screens/anya-bhandar.ts` (+ `anya-bhandar-actions.ts` if large),
  `ScreenDefinition { screen:'anya-bhandar', table:'AnyaBhandarM', primaryColumn:'AnyaBhandarKm',
lockable:false, workReport:true, workReportOn:{add:true, edit:true, delete:false} }`; register in
  `registry.ts`; web `apps/web/src/screens/AnyaBhandar.tsx`, `@ScreenAccess('anya-bhandar')`.
- `validate` = the four messages above (ElseIf → return the first). Put the "Add New Book Entry?"
  question in the web `beforeSave` (returns `{ AddBook: true }` or null), and re-check server-side
  that AddBook is honoured only when id = 0, BookMastKt tag = 0 and BookName non-empty.
- Reuse from `book-common.ts`: `text/val/int/get/grid/extra/signBetween/scalar/nextKey/intText/
ddmmyyyy/asDesktopError/SIGN_UNDER_10`. From `book-tran.ts`: `nextLibNo` (move to book-common).
  From `book.ts`: export and generalise `authorText` (key column names as parameters), reuse
  `AUTHOR_LIST`, `anyNames`, `VISHAY_ENTRY_LOOKUPS`, `saveVishayEntries`, the PrakTran `prakname`
  lookup and `operatorFilter`. From `master-common.ts`: `upsertChildRows` for Prak/Bhasha/Lipi/
  Subject*/Mul/Anu (subject needs PrintDate via `ddmmyyyy`, so maybe a small custom loop),
  `openInUse` for the Book Master item.
- Write one helper in book-common (e.g. `insertObtainBook(trx, user, fields, children)`) that does
  the AddBook block: next OB LibNo (locked), BookM insert (desktop's column list), LibNo-exists
  check (`LibNo Already Exist` as 400 → rollback), BookT insert, and the praksn*/BookSubjectT
  copies with `nextKey`. Use `OUTPUT INSERTED` instead of `@@identity`.
- `trans` keys: PrakTran, AuthTran (3 tables: rows + `.Extra` dtAuthorAuth + `.Extra2`
  dtAuthorAuthType, `nested` author type / author specs like Book's), BhashaTran, LipiTran,
  SubjTran (`vishayEntry` with `unsavedMessage: 'Please Save Reord First'`), MulAuthorTran,
  AnuAuthorTran. Seq renumbered on popup save except author/multiauthor.
- Fields: `Size` and `BhandarKt` survive New.

### Engine gaps

- **New prompt + kept fields**: btnNew asks `Please Enter Size` when Size is empty (cancel aborts
  New) and keeps Size + Bhandar. Needs something like `ScreenSpec.beforeNew` / `keepOnNew: string[]`.
- **newDefaults with params**: RecordNo depends on Size (`newDefaults(db)` takes no input today);
  either pass the kept fields or compute RecordNo through an action called from the client.
- **Fill-from-book**: `afterPick` on txtBookMastKt → action → set fields + `putTrans` for 7 popups
  with negative keys (Mul/Anu appended). Probably fits existing hooks; check `putTrans` can replace a
  popup not yet loaded and carry `.Extra` tables.
- Config_Master layout submenu filter on empty ShortcutKey — verify engine matches.

## Decisions (orchestrator defaults, binding; the user has not overridden them)

1. Bug #1 (editing a record on an OB number with another library number): the web saves normally
   and runs no BookT update (the desktop's `UPDATE BookT … WHERE BookTKt` never worked).
2. AddBook's BookT row keeps the desktop's minimal insert (BookMastkt, SeriesKt, Libno, MainL=1,
   enuser, endate; no BkGrNo / seq).
3. Fill-from-book filters the authors one by one, as desktop v3.4.3.1 does: an author row typed
   मूळकर्ता/टीकाकार/अनुवादक/विवेचक/लेखक is left out, the book's other authors come over. (Up to
   v3.3.3.6 the test was per book — one such author and the book gave no संपादक rows at all — and
   the web had kept that as a harmless quirk.)
4. `nextLibNo` moved from book-tran.ts to book-common.ts with UPDLOCK/HOLDLOCK; Book Tran's
   `next-libno` action uses it unchanged. `authorText` is the one exported from prakashak.ts
   (key column names as a parameter).
5. Bugs #2–#8 fixed (see "Desktop bugs").

## What was ported (web)

- API `apps/api/src/master/screens/anya-bhandar.ts` (`anyaBhandar`, registered in `registry.ts`):
  validate (VB's RecordNo conversion message first, then the four messages verbatim, then one
  line per value a column cannot hold: Size 3, Book Name 500, Old Library No 200, Remark 2000,
  Prakashak NameSelected 150 / Remark 100, संपादक txtAuth 1500, Subject EntryType 30 / Remark
  2000), save in one transaction with every child table, `newDefaults` (RecordNo by Size),
  `deleteRecord`, popup lookups, F2 lists for Book Name and Library No, actions
  `fill-from-book`, `book-of-libno`, `book-master`. Work report on Add and Edit only.
- `book-common.ts`: `nextLibNo` (moved, locked) and `insertObtainBook` (BookM + BookT in the
  'obtain book' series, "LibNo Already Exist" as a 400 that rolls everything back). The praksn* /
  BookSubjectT copies of AddBook are in anya-bhandar.ts, keyed with `nextKey` (locked MAX + 1).
- Web `apps/web/src/screens/AnyaBhandar.tsx` (registered as `anya-bhandar`): Designer geometry,
  11.25 pt labels, the seven popups (Author with its type/author sub-popups, Prakashak, Bhasha,
  Lipi, Subject with frmVishayEntry on its Vishay cell, Mul/Anu authors), Txt_Leave for PSamvatVK
  and TotalPages, New's Size InputBox (keeps Size + Bhandar), Copy (every popup, keys of its own,
  RecordNo recomputed), Save's "Do You want to Add New Book Entry?", fill-from-book on the Book
  Name pick, the number's book on the Library No pick, the right-click menu.
- Engine extensions (generic, opt-in): ActionResult kind `form` (fields + popup rows for the
  screen's own handler); `MessageBox.input` (InputBox); `ScreenSpec.onNew.ask`; `beforeSave`
  gets `tags`; `FormContext.putTrans` takes `extras`; Book Master's `bookSummary` moved to
  `features/master/transSummary.ts` and shared.
- Tests: `apps/api/test/master-anya-bhandar.integration.test.ts`, `apps/web/e2e/batch-c.spec.ts`
  (Anya Bhandar test).

## Deliberate differences

- No Lock / Unlock (no Locked column; the desktop's keys throw).
- The Subject popup's "Please Click on Modify…" question is not asked: the desktop never shows it
  either (the box is never ReadOnly, so boolShowSave is always true).
- Fill-from-book sends the Subject popup with an empty Vishay table (the desktop left stale nested
  tables in dsSubject); the Vishay lines are not copied from the book (as the desktop: its Vishay
  column comes back blank).
- A praksn key of 0 in the data negates to 0; such a row is still inserted (key ≤ 0).
- The RecordNo conversion error is reported by the server, i.e. after the AddBook question (the
  desktop throws before it).
- The Book Name F2 list drops the desktop's DISTINCT (BookMastkm is the key, so the rows are the same).

## Fixed desktop bugs (as listed above)

#2 Library No F2 now fills the number's own book; #3 Vishay lines saved per subject (each under
its own key, UpdateVishay per subject, orphan lines removed); #4 new Mul/Anu rows (key −1) are
inserted; #5 Copy gives every popup's rows new keys (Subject's Vishay lines follow them); #6
Delete removes the nine child tables and the subjects' Vishay lines in one transaction (existing
orphans left alone); #7 praksn* keys locked MAX + 1, no skipped key; #8 everything parameterised.

## Deferred

Nothing file-related on this form. The Config_Master print layouts with a ShortcutKey appear under
Selected Column (none locally).

## Desktop v3.4.3.1

- **Author-type text.** The denormalised author text is built from the type's name
  (`authtype.authortype`) instead of its attribute (`authtype.authtyattr`), and the
  author-type pick list (multiauthortype) shows two columns (`authtycokm`, `authortype`) —
  the attribute column is gone. Text stored earlier keeps the old attribute until the record
  is saved again (the desktop does not rewrite it either).
  Here that is `txtAuthor` on save (`authorText` in `prakashak.ts`) and the `authortype` column
  of the Author popup rows read from a book (`frmAnyaBhandar.vb:635,637`).
- **Book Name F2 list** (`frmAnyaBhandar.vb:601`): a `SamvatType` column (`samvmast.samvatname`,
  by `BookM.PSamvatcokt`) between Author and Samvat.
- **Fill-from-book, authors** (`:636-638`): filtered per author, not per book (decision 3). The
  web's `NOT IN` leaves a NULL `praksnauthorkt` out of the sub-query (none in the data today; one
  would make the desktop's query return no author).
- **Fill-from-book, Kruti authors** (`:685-689`): the Kruti references of the book's library
  numbers and, when the book has a `CommonGrpNo`, of every library number of that common group's
  books (the old `IsCommonGroup` 1/0 pair was a no-op and is gone).
- Not changed on the desktop, so not here: the Operator's CM/MS/CP/SN condition (still without
  `ISNULL`) and `AnyaBhandarRepository.GetMemID` (the new book's OB number is still `BookT`'s
  largest + 1; Book Master's Library No form now fills gaps, see book-master.md).
- Waiting for the upgraded database: `praksnBhashaT` / `praksnLipiT` identity keys in AddBook,
  `VisheshMast.Vibhag`.
- Tests: `master-anya-bhandar.integration.test.ts` ("v3.4.3.1: SamvatType …").
