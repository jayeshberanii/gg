# Tirth Raksha Master (`TirthRakshaM`)

Desktop form: `GGLibrarySolution/Library/Library/frmTirthRakshaMaster.vb` (+ `.Designer.vb`,
title "Tirth Raksha", `Inherits Library.frmMasterPage`), repository
`Library.BusinessContract/Concrete/TirthRakshaRepository.vb`, entity
`Library.Entity/EntTirthRakshaM.vb`. Popups: `setform_TirthRaksha` in
`Library/CommonForms/frmDisplayTransNew.vb` (+ its `dgDisplay_CellEndEdit` samvat branch, line
~985), and `frmVishayEntry` for the three Vishay-entry boxes. `CommonRepository.SaveVishayEntry`

- stored procedure `UpdateVishay` write those.

Menu: Library › Tirth Raksha Master (`Frmlibmain.TirthRakshaMasterToolStripMenuItem`, no
visibility rule; `menu.ts` screen `tirth-raksha-master`). MDI child, maximized.

Status: **ported 2026-10-06** (see "Web port" at the end).

## Table and key

- Table `TirthRakshaM`, **IDENTITY** PK `TirthRakshaKm` (`SELECT @@identity`; use
  `OUTPUT INSERTED`). 707 rows locally, `MAX(Seq)` 708, 7 distinct GroupNo values. No
  triggers, no foreign keys.
- **No `Locked` column.** Ctrl+L / Ctrl+U still call `LockUnlockRecords` (after the Security
  password) and fail with a SQL error on the desktop → `lockable: false`. FillData does not
  check Locked either.
- Audit `enuser/endate`, `moduser/moddate` (date). Group changes stamp
  `GroupNoModifiedBy` / `GroupNoModifiedDate`.
- `TransactionName = "TirthRakshaM"`, `PrimaryColumn = "TirthRakshaKm"`, no JoinCond / default
  condition. Grid lists all rows, `ORDER BY TirthRakshaKm DESC` (GetDataTable).

## Fields

SplitContainer horizontal (0,54 / 1008×642, SplitterDistance 290). All labels/boxes Times New
Roman 14.25pt, 29px high. Box columns at x=154 / 506 / 844; rows y=18…258 step 40. Labels carry
the desktop's shortcut letters in brackets (N, W, T, A, S, P, K, M, SS, D, R, R1) — they are
only text; nothing binds those keys.

| Label (x,y)               | Box (Location / width)                   | Tab | Column / popup                                                   | Notes                                                            |
| ------------------------- | ---------------------------------------- | --- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Name(N) (8,22)            | `txtTirthRakshaNameTran` 154,18 / 216    | 1   | `TirthRakshaName` nvarchar(max), VishayEntry `TirthRakshaName`   | F2 → **frmVishayEntry**; required                                |
| Reference(P) (374,22)     | `txtReferenceTran` 506,18 / 192          | 3   | popup → `TirthRakshaReferenceT`                                  | its first row's BookTKt is the record's `BookTKt` (required)     |
| Seq/Book Seq (700,22)     | `txtSeq` 844,18 / 78                     | 5   | `Seq` int                                                        | **ReadOnly**; New fills `GetMaxSeq`; required                    |
|                           | `txtBookSeq` 924,18 / 78                 | 36  | `BookSeq` int                                                    | editable; New / reference change fills `GetMaxBookSeq`; required |
| Author(W) (8,62)          | `txtAuthTran` 154,58 / 216               | 7   | popup → `TirthRakshaAuthorT` (+2 sub-tables); text → `txtAuthor` |                                                                  |
| Kruti(K) (374,62)         | `txtKrutiTran` 506,58 / 192              | 9   | popup → `TirthRakshaKrutiT`                                      |                                                                  |
| Purnata/Group No (700,62) | `txtPurnataKt` 844,58 / 119              | 13  | `PurnataKt` int / `PurnataName`                                  | F2 columnmaster `MagazineVisheshStatus`                          |
|                           | `txtGroupNo` 964,58 / 38                 | 37  | `GroupNo` int                                                    | editable but **never saved** (only the menu sets it)             |
| Samvat(T)/Bhasha (8,102)  | `txtSamvatTran` 154,98 / 107             | 15  | popup → `TirthRakshaSamvatT`; box shows `Isvisan`                |                                                                  |
|                           | `txtBhashaTran` 263,98 / 107             | 18  | popup → `TirthRakshaBhashaT`; → `txtBhasha`                      |                                                                  |
| Main Person(M) (374,102)  | `txtMainPersonTran` 506,98 / 192         | 38  | popup → `TirthRakshaMainPersonT`                                 |                                                                  |
| Project Name (700,102)    | `txtProjectKt` 844,98 / 158              | 21  | `ProjectKt` int / `ProjectName`                                  | F2 columnmaster `TirthRakshaProject`; carried to New             |
| Kshetra(A) (8,142)        | `txtKshetraTran` 154,138 / 216           | 23  | popup → `TirthRakshaKshetraT`                                    |                                                                  |
| Tirth (374,142)           | `txtTirthKt` 506,138 / 192               | 25  | `TirthKt` int / `TirthName`                                      | F2 columnmaster `TirthRakshaTirth`                               |
| Done By(D) (700,142)      | `txtDoneByKt` 844,138 / 158              | 27  | `DoneByKt` int / `DoneByName`                                    | F2 columnmaster `DoneBy`; required; carried to New               |
| Vishay(S) (8,182)         | `txtVishayTran` 154,178 / 216            | 29  | popup → `TirthRakshaVishayT`; → `Vishay`                         |                                                                  |
| Peta Vishay(SS) (374,182) | `txtPetaVishayTran` 506,178 / 192        | 31  | `PetaVishay`, VishayEntry `TirthRakshaPetaVishay`                | F2 → **frmVishayEntry**                                          |
| Project Detail (700,182)  | `txtProjectDetail` 844,178 / 158         | 33  | `ProjectDetail` nvarchar(2000)                                   | F2 earlier values                                                |
| Remark(R) (8,222)         | `txtRemark` 154,218 / **848**, Multiline | 35  | `Remark` nvarchar(2000)                                          | F2 earlier values                                                |
| Remark(R1) (8,262)        | `txtTirthRakshaRemarkTran` 154,258 / 848 | 39  | `txtRemark` nvarchar(max), VishayEntry `TirthRakshaRemark`       | F2 → **frmVishayEntry**                                          |

Hidden 10×10 `dgForExcel` at 704,9 (unused). `TirthRakshaM.VikramSamvat / Isvisan /
SamvatRemark` are set from the first Samvat popup row; `txtBhasha` / `Vishay` from their popups.

On load (`FillData`) the Name, Vishay, Peta Vishay and Remark(R1) boxes show
`clsCom.GetcontString(value)` (drops the " | " separators UpdateVishay writes, "/" parts glued
with trailing spaces trimmed; port in `apps/api/src/master/screens/book-common.ts`). FillList
applies the same to the grid's `TirthRakshaName`, `Vishay`, `PetaVishay`, `txtRemark`.

## Validation (`TirthRakshaRepository.GetValidationMessage`)

After "Are You Sure to Save This Record?". All failures are collected, joined by CrLf
(`SignBetweenStr`), in this order:

1. `TirthRakshaName.Trim = ""` → `- Name(N) is Mandatory`
2. `Val(Seq) = 0` → `- Seq is Mandatory`
3. `Val(BookSeq) = 0` → `- BookSeq is Mandatory`
4. `Val(BookTKt) = 0` → `- Reference(P) is Mandatory`
5. `Val(DoneByKt) = 0` → `- Done By(D) is Mandatory`

`BookTKt` is taken (form `Save`): Add → the Reference popup's first row's `BookTKt` when > 0;
Edit → the grid row's hidden `BookTKt` cell when > 0 (else 0 → message 4). Web: compute it on
the server from the reference rows sent (or the stored value), not from the grid.

## F2 lookups (tblSearch, Type `M`)

| Box           | F2EntryText                                                                                                               | AddTableInfo                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| TirthKt       | `select ColumnMastkm,Name from columnmaster where Vibhag='TirthRakshaTirth' order by Name`                                | `ColumnMaster\|TirthRakshaTirth`      |
| PurnataKt     | `select ColumnMastkm,Name from columnmaster where Vibhag='MagazineVisheshStatus' order by Name`                           | `ColumnMaster\|MagazineVisheshStatus` |
| ProjectKt     | `select ColumnMastkm,Name from columnmaster where Vibhag='TirthRakshaProject' order by Name`                              | `ColumnMaster\|TirthRakshaProject`    |
| DoneByKt      | `select ColumnMastkm,Name from columnmaster where Vibhag='DoneBy' order by Name`                                          | `ColumnMaster\|DoneBy`                |
| ProjectDetail | `select ProjectDetail from TirthRakshaM where isnull(ProjectDetail,'')<>'' group by ProjectDetail order by ProjectDetail` |                                       |
| Remark        | `select Remark from TirthRakshaM where isnull(Remark,'')<>'' group by Remark order by Remark`                             |                                       |

AddTableInfo lets the picker add a new columnmaster row of that Vibhag (DisplayListForm's add
option). Check whether the web picker supports it; if not, that is an engine gap.

Search (UcSearch) is fully tblSearch-driven, including the `F2SearchText` rows of the `…Tran`
columns and the search-only external columns `VishayTran1`, `PetaVishay1Tran`; nothing
form-specific.

## Grid

`dgMain` 1008×348, ReadOnly, FullRowSelect, no row headers, cell style as Magazine Master
(Arial Unicode MS 9 rows, Verdana 12 header). Designer columns (`AutoGenerateColumns=False`);
the query columns come from tblSearch `DisplayInGrid` (`GridColumnName` where set).

| #   | Header         | Field             | Width | Visible             |
| --- | -------------- | ----------------- | ----- | ------------------- |
| 0   | Id             | `TirthRakshaKm`   | 5     | yes (5px)           |
| 1   | BookTKt        | `BookTKt`         | 100   | **no**              |
| 2   | Seq            | `Seq`             | 70    | yes                 |
| 3   | BookSeq        | `BookSeq`         | 100   | yes                 |
| 4   | Name           | `TirthRakshaName` | 200   | yes (GetcontString) |
| 5   | ProjectName    | `ProjectName`     | 100   | yes                 |
| 6   | Author         | `txtAuthor`       | 100   | yes                 |
| 7   | Samvat(ई.सं.)  | `Isvisan`         | 100   | yes                 |
| 8   | Samvat(Remark) | `SamvatRemark`    | 150   | yes                 |
| 9   | Kruti          | `KrutiTran`       | 100   | yes                 |
| 10  | Kshetra        | `KshetraTran`     | 100   | yes                 |
| 11  | Tirth          | `TirthName`       | 100   | yes                 |
| 12  | Vishay         | `Vishay`          | 150   | yes (GetcontString) |
| 13  | PetaVishay     | `PetaVishay`      | 100   | yes (GetcontString) |
| 14  | RefPageNo      | `RefPageNo`       | 100   | yes                 |
| 15  | Bhasha         | `txtBhasha`       | 100   | yes                 |
| 16  | Remark         | `txtRemark`       | 100   | yes (GetcontString) |

`RefPageNo` = `STUFF` of `TirthRakshaReferenceT.PageNo` (external column with JoinCondition);
`KrutiTran` / `KshetraTran` = `STUFF` of columnmaster names in Seq order.

## Popups (F2 on a `…Tran` box)

### frmVishayEntry boxes (not frmDisplayTransNew)

`txtTirthRakshaNameTran`, `txtPetaVishayTran`, `txtTirthRakshaRemarkTran` open
`frmVishayEntry(TranKm, dt)` with the rows of the column's F2EntryText (VishayEntry rows of
TransactionName `TirthRakshaName` / `TirthRakshaPetaVishay` / `TirthRakshaRemark`: `Id, RecordKt,
VishayKt, Vishay, VachanKt, Vachan, VibhaktiKt, Vibhakti, AnyaNameKt, Seq`). On OK the box text
= `frm1.txtCode` and the rows replace the record's rows in the form's table.

Save (`SaveVishayEntry(dt, <TransactionName>, "TirthRakshaM", "TirthRakshaKm", id)`, only when
the popup was opened): rows with `VishayKt > 0`; `Id = 0` inserted
(`TransactionName,RecordKt,VishayKt,VachanKt,VibhaktiKt,AnyaNameKt,Seq`), else updated; then
delete this record's other entries and orphans of that TransactionName; then
`EXEC UpdateVishay '<TransactionName>', '<id>'`, which rewrites `TirthRakshaM.TirthRakshaName`
/ `PetaVishay` / `txtRemark` from the entries. (`TirthRakshaVishay` is commented out: the Vishay
box uses `TirthRakshaVishayT` instead.) Book Master's subject entries do the same
(`apps/api/src/master/screens/book.ts` ~479–600).

### frmDisplayTransNew boxes (FormName "TirthRaksha")

All are **upsert** popups: rows with key ≤ 0 inserted (new rows get a random key −500…−1 and
`Seq` = row count + 1), others updated, then `DELETE … WHERE TirthRakshaKt=@id AND <key> NOT
IN(kept)`. Saved only when the popup was opened (its DataTable has columns). Child tables with
audit columns get `enuser/endate` on insert and `moduser/moddate` on update. This matches
`upsertChildRows` in `master-common.ts` (`audit: true`) except where noted.

| Box (column)                   | Table / key                                                                                                | Saved columns                                                                                                | Cells (hidden; editable; F2)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Samvat (`SamvatTran`)          | `TirthRakshaSamvatT` / `TirthRakshaSamvatKm`                                                               | SamvatKindKt, Remark, AsamvatKt, Asamvat, Vksamvat, Isvisan, BookTKt, PageNo, SthalKt, IsPrint, Seq (+audit) | hidden TirthRakshaSamvatKm, SamvatKindKt, AsamvatKt, BookTKt, SthalKt; editable Asamvat, PageNo, IsPrint; F2 SamvatKindName (`columnmaster Vibhag='AuthSamKind'`, cols Name/Brief/Remark), AsamvatName (`select Samvatcokm,Samvatname from Samvmast ORDER BY SAMVATCOKM DESC`), Asamvat (`select sadivalue,sadinm from sadimst order by sadinm`), LibNo (`select Tid,LibNo from BookT WHERE ISNULL(LibNo,'')<>'' ORDER BY LibNo`), SthalName (`visheshmast remark='city'`) |
| Kshetra (`KshetraTran`)        | `TirthRakshaKshetraT` / `TirthRakshaKshetraKm`                                                             | KshetraKt, Seq (+audit)                                                                                      | F2 KshetraName: `columnmaster vibhag='TirthRakshaKshetra'` (AddTableInfo)                                                                                                                                                                                                                                                                                                                                                                                                  |
| Bhasha (`BhashaTran`)          | `TirthRakshaBhashaT` / `TirthRakshaBhashaKm`                                                               | BhashaKt, Seq (+audit); then `txtBhasha` = BhashaName list (",")                                             | F2 BhashaName: `SELECT bhashacokm,bhashaname FROM bhasmast` (note: the F2EntryText shows `bhasa_attr`, the picker writes `bhashaname`)                                                                                                                                                                                                                                                                                                                                     |
| Kruti (`KrutiTran`)            | `TirthRakshaKrutiT` / `TirthRakshaKrutiKm`                                                                 | KrutiKt, Seq (+audit)                                                                                        | F2 KrutiName: `columnmaster vibhag='TirthRakshaKruti'` (AddTableInfo). **Not** KrutiMst                                                                                                                                                                                                                                                                                                                                                                                    |
| Reference (`ReferenceTran`)    | `TirthRakshaReferenceT` / `TirthRakshaReferenceKm`                                                         | KrutiMstKt, BookTKt, PageNo, GathaNo, Remark, Seq (+audit)                                                   | hidden key, KrutimstKt, BookTKt; editable PageNo, GathaNo, Remark; F2 KrutiNo (query below), LibNo (`SELECT Tid,LibNo,BookName+part,txtPrakashak,txtAuthor,PSamvatVK FROM BookT INNER JOIN BookM … WHERE ISNULL(LibNo,'')<>'' ORDER BY Libno`) filling BookTKt, LibNo, BookName, Prakashak, AuthorName, Samvat                                                                                                                                                             |
| Main Person (`MainPersonTran`) | `TirthRakshaMainPersonT` / `TirthRakshaMainPersonKm`                                                       | VishayKt, Seq (+audit)                                                                                       | F2 VishayName: `SELECT vishaycokm,vishay_nm FROM vishay WHERE ISNULL(vishay_nm,'')<>'' ORDER BY vishay_nm` (AddTableInfo `vishay`)                                                                                                                                                                                                                                                                                                                                         |
| Vishay (`VishayTran`)          | `TirthRakshaVishayT` / `TirthRakshaVishayKm`                                                               | VishayKt, Seq (+audit); then `Vishay` = VishayName list (", ")                                               | F2 VishayName or VishayNo: `select columnmastkm,name,ColumnNo from columnmaster where vibhag = 'TirthRakshaVishay' order by columnno` (AddTableInfo)                                                                                                                                                                                                                                                                                                                       |
| Author (`AuthTran`)            | `TirthRakshaAuthorT` / `TirthRakshaAuthorKm` + `TirthRakshaAuthorAuthorTypeT` + `TirthRakshaAuthorAuthorT` | see below                                                                                                    | three result sets; cell 2 (authortype) opens **multiauthortype**, cell 3 (authorname) opens **multiauthor**                                                                                                                                                                                                                                                                                                                                                                |

Reference KrutiNo picker (verbatim):

```sql
SELECT DISTINCT K.krutimstkm,K.KrutiNo,tblKrutiRef.Tid,tblKrutiRef.LibNo,tblKrutiRef.BookName,tblKrutiRef.Prakashak,tblKrutiRef.AuthorName,tblKrutiRef.Samvat
From krutiMst K
OUTER APPLY (SELECT TOP(1) KR.krutimstkt,BT.tid AS Tid,BT.Libno,BM.BookName + CASE WHEN ISNULL(BM.part,'')='' THEN '' ELSE ' ' + BM.Part END AS BookName,BM.txtPrakashak AS Prakashak,BM.txtAuthor AS AuthorName,BM.PSamvatVK As Samvat FROM krutireflibno KR INNER JOIN columnmaster colTyp ON KR.ktypeid=colTyp.ColumnMastkm AND colTyp.Name=N'मुद्रित गी.गं भंडारनुं प्रथम पुस्तक' INNER JOIN BookT BT ON KR.BookTKt=BT.tid INNER JOIN BookM BM ON BT.BookMastkt=BM.BookMastkm WHERE KR.krutimstkt=K.krutimstkm) AS tblKrutiRef
WHERE K.krutimstkm=tblKrutiRef.krutimstkt
ORDER BY K.krutimstkm
```

It fills KrutiMstKt, KrutiNo, BookTKt, LibNo, BookName, Prakashak, AuthorName, Samvat (→ LibNo).

**Samvat computation** (on picking AsamvatName / Asamvat, and CellEndEdit of those cells): when
`AsamvatKt > 0` and Asamvat is longer than 2 chars: `Vksamvat = GetVikramSamvat(AsamvatKt,
Asamvat)` if numeric, else of `select ISNULL(sadivalue,0) from sadimst where sadinm=<Asamvat>`;
then `Isvisan = Vksamvat - 56`. Same as Author Master's Samvat popup (`AuthorMaster.tsx`), plus
the Isvisan line. After saving the rows: `UPDATE TirthRakshaM SET VikramSamvat, Isvisan,
SamvatRemark` = first row's `Vksamvat`, `Isvisan`, `Remark` (0 / 0 / '' when no rows).

**Reference → BookTKt / BookSeq**: after the popup OK, if row 0's `BookTKt > 0` and differs from
the grid's current row `BookTKt`, the grid cell is overwritten and `txtBookSeq =
GetMaxBookSeq(BookTKt)`.

**Author** (structure as Prakashak/Book Master author popups):

- Result sets: authors (`TirthRakshaKt, TirthRakshaAuthorKm, authortype, authorname, seq`),
  `dtAuthorAuth` (`…AuthorAuthorKm, TirthRakshaAuthorKt, authorkt, authorname, AuthAnyaNmKt,
AnyaName, padkt, Padvi, Guru, identyty, signkt, Sign, seq`), `dtAuthorAuthType`
  (`…AuthorAuthorTypeKm, TirthRakshaAuthorKt, authortypekt, authortype, signkt, Sign, seq`).
- multiauthortype: F2 col 4 `select authtycokm,authortype,authtyattr from authtype order by
authortype`; col 6 `select columnmastkm,name from columnmaster where vibhag = 'sign' and
isnull(columnno,0)<10 order by name`. Parent cell = `authortype (sign) ,…` joined.
- multiauthor: F2 authorname (authmast list incl. Guru, identyty, vibhag, …; sets authorname,
  AnyaName = main name, AuthAnyaNmKt 0, authorkt, Guru, identyty), AnyaName (`select
REPLACE(0,0,0) as id,authorname as AnyaName from authmast where authorcokm=<authorkt> union
select AuthAnyaNmKm as ID,AnyaName from AuthMAnyNmT where AuthmastKt=<authorkt>`), Padvi
  (`visheshmast remark='avastha' and isnull(visheshno,0)>5`), Sign (as above).
- Save: author rows `txtAuth = SignBetweenStr(authortype, authorname, "-")`, Seq; sub rows by
  `TirthRakshaAuthorKt` (inserted with the new author key). Deletes in order AuthorType, Author,
  AuthorT for keys not kept. No audit columns on these three tables.
- `TirthRakshaM.txtAuthor = GetAuthorName(...)`, the same algorithm as Prakashak Master's
  `txtAuthor` (`authtyattr` + sign ShortNm per type; AnyaName or AuthorName, `(Guru)`,
  `[Identyty-avastha ShortNm]`, sign ShortNm; then `.Replace("(/)"," /").Replace("/,","/")`).
  When the popup was not opened on an edit, the stored `txtAuthor` is kept. Reuse prakashak.ts.

## Derived values / sequences (verbatim)

- `GetMaxSeq`: `SELECT ISNULL(MAX(Seq),0)+1 FROM TirthRakshaM` → `txtSeq` on New (newDefaults).
- `GetMaxBookSeq(b)`: `SELECT ISNULL(MAX(BookSeq),0)+1 FROM TirthRakshaM WHERE BookTKt=<b>` →
  `txtBookSeq` on New (when the carried reference has rows) and after a Reference change.
- `SetBookSeq(b)` (menu Update Book Seq): `SELECT TirthRakshaKm FROM TirthRakshaM WHERE
BookTKt=<b> ORDER BY TirthRakshaKm`, then `update TirthRakshaM set BookSeq=@i where
TirthRakshaKm=@id` with i = 1, 2, … (no transaction).
- `IsBookSeqExist` + `UPDATE TirthRakshaM SET BookSeq=BookSeq+1 WHERE TirthRakshaKm<>@id AND
BookTKt=@BookTKt AND BookSeq>=@BookSeq` exist in Save but **never run**: the form never sets
  `Ent.IsBookSeqExist` (always False). Do not port the shift.
- Group: `select ISNULL(max(GroupNo),0)+1 from TirthRakshaM` for a new group.

## New (btnNew_Click) — carries data over

1. Keep Project (Tag/Text), Done By (Tag/Text) and the Reference box text.
2. If the Reference rows were not loaded, load **the current record's** reference rows
   (F2EntryText with `{Id}` = TranKm). Copy them with `TirthRakshaReferenceKm = 0` and
   `PageNo = ""`.
3. Clear the form, `TranKm = 0`, `txtSeq = GetMaxSeq`.
4. Restore Project, Done By, the Reference text and rows; if there are rows, `txtBookSeq =
GetMaxBookSeq(row0.BookTKt)`.

So a new entry starts with the previous record's book reference(s), project and done-by. On load
with an empty grid the same runs with nothing to carry.

## Save flow

Confirm → validation → `Save(...)` in one transaction: `txtAuthor` (GetAuthorName) → INSERT /
UPDATE `TirthRakshaM (TirthRakshaName, txtAuthor, TirthKt, Seq, BookSeq, PurnataKt, ProjectKt,
DoneByKt, ProjectDetail, Remark, BookTKt)` → VishayEntry boxes (Name, PetaVishay, Remark R1) →
Author → Samvat (+ VK/Isvisan/SamvatRemark) → Kshetra → Bhasha (+ txtBhasha) → Kruti →
Reference → MainPerson → Vishay (+ Vishay) → Commit. "Record Saved Successfully". Add inserts
the new grid row on top; Edit refreshes the row. **Work report: Add** (`insertworkreports(…,
TranKm, curr_lnid)`) **and Edit** (old/new compare); none on delete →
`workReport: true, workReportOn: { add: true, edit: true }`.

`GroupNo` and `txtBhasha` are not in the INSERT/UPDATE (txtBhasha comes from its popup).

## Copy

Same as other masters: "Do You Want to Add More With Copying Data?" Yes → `TranKm = 0`,
`StrMode = "Add"`. Popups the user had opened still hold the source record's rows **with their
keys**; on save, keys > 0 are UPDATEd in place (they stay under the source record) and the
`NOT IN` delete for the new id finds nothing — so the new record gets none of those rows, and any
edit made to them after Copy lands on the source record (see bugs). Popups not opened are simply
not saved for the new record.

## Delete

"Are You Sure to Delete This Record?" → Security password → `Delete(id)` in one transaction:
VishayEntry of `TirthRakshaName`, `TirthRakshaVishay`, `TirthRakshaPetaVishay`,
`TirthRakshaRemark` for the id; then `TirthRakshaAuthorAuthorTypeT`, `TirthRakshaAuthorAuthorT`,
`TirthRakshaAuthorT`, `TirthRakshaSamvatT`, `TirthRakshaKshetraT`, `TirthRakshaReferenceT`,
`TirthRakshaKrutiT`, `TirthRakshaBhashaT`, `TirthRakshaMainPersonT`, `TirthRakshaVishayT`
(`WHERE TirthRakshaKt IN(id)`), then the record. "Record Deleted " (Information). No work
report. Port as `deleteRecord`.

## Right-click menu (`cntMenu`)

| Item                              | Behaviour                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column    | engine PrintSelectedColumn. Config_Master `TirthRakshaM`: `PRINT`, `print ms`, `All` — none has a ShortcutKey, so the dropdown is empty                                                                                                                                                                                                                             |
| Print Report › Send To Excel      | handler is **empty** (does nothing). Show disabled                                                                                                                                                                                                                                                                                                                  |
| Utility › Show All Records        | **no handler**. Show disabled                                                                                                                                                                                                                                                                                                                                       |
| Utility › Update Book Seq         | picker (selectFirst) `SELECT DISTINCT TirthRakshaReferenceT.BookTKt,BookT.Libno,BookM.BookName FROM TirthRakshaReferenceT INNER JOIN BookT ON TirthRakshaReferenceT.BookTKt=BookT.tid INNER JOIN BookM ON BookT.BookMastkt=BookM.BookMastkm ORDER BY BookT.Libno`; if a BookTKt was picked → `SetBookSeq(it)` then FillList (refresh). No message                   |
| Group No › Add In New Group       | `n = ISNULL(max(GroupNo),0)+1`; `UpdateGroupNo(n, selected ids, user)`: per id `update TirthRakshaM set GroupNo=@GroupNo,GroupNoModifiedBy=@user,GroupNoModifiedDate=GETDATE() where TirthRakshaKm=@id` (one transaction). Message `"{count} Records Added in New GroupNo {n} Successfully"`; `txtGroupNo = n`                                                      |
| Group No › Add In Existing Group  | picker `SELECT DISTINCT GroupNo AS Id,GroupNo FROM TirthRakshaM WHERE ISNULL(GroupNo,0)>0 ORDER BY GroupNo`; if > 0 → UpdateGroupNo(it, …). `"{count} Records Updated in GroupNo {n} Successfully"`; `txtGroupNo = n`                                                                                                                                               |
| Group No › Delete From Group      | UpdateGroupNo(0, …) (stamps the modified-by/date too). `"Groups Delete From {count} Records Successfully"`; `txtGroupNo = 0`                                                                                                                                                                                                                                        |
| For Selected Record › Book Master | opens Book Master with `AND BookMastKm IN(SELECT DISTINCT BookT.BookMastkt FROM TirthRakshaReferenceT INNER JOIN BookT ON TirthRakshaReferenceT.BookTKt=BookT.tid WHERE TirthRakshaReferenceT.TirthRakshaKt IN(<selected ids>))` — no empty check → `openInUse(db, 'book-master', …)` (the engine's empty message is fine; desktop just opens an empty Book Master) |

`{count}` is `dgMain.SelectedRows.Count`. Group actions need a refresh of the affected rows only
if GroupNo were in the grid (it is not).

## Reports and printing

No Crystal report. Print Report › Main Report (added in the later desktop version,
`MainReportToolStripMenuItem_Click`) shows the report site's `Home/PrintTirthRakshaReport` page
for the selected records (see `reports.md`). PrintSelectedColumn layouts: (`PRINT`
`20,21,10,11,12,13,14,3,16,6,7,19,1,2,15,23,9,25,27,28`, `print ms`, `All`).

## Permissions

Menu only. No `curr_utypeid` / `curr_lnid` checks. `EnableDisableDataEditing` for toolbar
state; Delete needs the Security password.

## SQL in form event handlers

Config_Master load (as every master), the Group / Update Book Seq pickers and the Book Master
WhereCondition above, `select isnull(replace(F2EntryText,'{Id}',<TranKm>),'') from tblSearch …`.
Everything else is in the repository. No files/images/disk. No hard-coded passwords.

## Desktop bugs

- **Data-corrupting — Copy edits the source record's child rows.** After Copy the opened
  popups keep the source record's keys, so saving UPDATEs those rows in place (the parent link
  `TirthRakshaKt` / `RecordKt` is not in the UPDATE): the new record gets none of them and any
  change made after Copy alters the source record. Vishay entries likewise. Web: on Copy, reset
  every popup key to ≤ 0 (`copy.loadTrans` with keys cleared) so rows are inserted for the new
  record.
- **Data-corrupting — Name overwritten in another format.** On an edit without opening the Name
  popup, `TirthRakshaName` is written from the box, which holds `GetcontString(stored)` (the
  " | " / "/" structure stripped) instead of what UpdateVishay wrote. Web: when the Name popup
  was not opened, keep the stored `TirthRakshaName`.
- **Data-corrupting (rare) — BookTKt from the grid.** The reference popup in Add mode writes the
  new BookTKt into the _current grid row's_ hidden cell (another record); a later Edit + Save of
  that record saves the wrong BookTKt. Also with an empty grid that line throws (first record
  ever: BookSeq not filled). Web: BookTKt comes from the record's own reference rows / stored
  value on the server.
- **Throws — `txtBhasha` is nvarchar(50)**: a long Bhasha list fails the UPDATE and the whole
  save. Web: same truncation risk; truncate or validate (decision needed, see questions).
- **Throws — quotes in author text.** Author rows are written with string-built
  `N'<authortype-authorname>'`; an apostrophe breaks the SQL. Web: parameters.
- **Throws — Ctrl+L / Ctrl+U** (no Locked column). Web: `lockable: false`.
- Harmless quirk: `txtGroupNo` is editable but never saved.
- Harmless quirk: `UpdateGroupNo` returns the requested number even when it failed, so the
  success message shows anyway; on a connection failure its `Rollback` on Nothing throws.
- Harmless quirk: popup new-row keys are random in −500…−1 and can collide (two new author rows
  could share sub-rows). Web: use the engine's `tempKey` sequence.
- Harmless quirk: the BookSeq shift on save is dead code (IsBookSeqExist never set).
- Harmless quirk: the Bhasha popup's list shows `bhasa_attr` from the F2EntryText but its picker
  writes `bhashaname` into the same cell, so `txtBhasha` mixes the two forms. Keep.

## Implementation hints

- Large screen: `apps/api/src/master/screens/tirth-raksha.ts` + `TirthRakshaMaster.tsx`.
  `lockable: false`, `workReport: true, workReportOn: { add: true, edit: true }`,
  `newDefaults` (Seq), custom `deleteRecord`.
- Child tables: `upsertChildRows` with `audit: true` fits Samvat (note `EnUser/EnDate` casing,
  `IsPrint` bit), Kshetra, Bhasha, Kruti, Reference, MainPerson, Vishay. Author: reuse
  `prakashak.ts`'s nested author save and `GetAuthorName` (`nested` TransSpec with
  multiauthortype/multiauthor children, as Book/Prakashak).
- Samvat popup: reuse Author Master's Samvat spec (VK computation, sadimst lookup) + `Isvisan =
Vksamvat − 56`.
- VishayEntry boxes: SaveVishayEntry + `EXEC UpdateVishay` exist in `book.ts` / `kruti.ts`.
- **Engine gap: frmVishayEntry opened directly from a form text box.** Today `VishayEntryDialog`
  opens only from a popup cell (`TransSpec.vishayEntry`). Three boxes here need it from the
  panel (Magazine Vishesh and English Book Vishesh probably need the same; coordinate).
- **Engine gap: New carrying values** (Project, Done By, reference rows with keys/PageNo cleared,
  BookSeq from them). `newDefaults` takes no current-record input; needs a client-side hook or
  a `newDefaults(db, currentId)` variant.
- Possible gap: F2 picker "add new" for AddTableInfo columnmaster lists.
- Reference popup result must also set BookSeq on the form (`onSaved`-style callback calling
  `GetMaxBookSeq`).

## Decisions (orchestrator defaults, the user has not overridden them)

1. Copy: copied child rows get new keys (inserted for the copy); the source record's rows are
   never touched.
2. When the Name popup was not opened, the stored `TirthRakshaName` is kept.
3. The Reference popup in Add mode does not write into another record.
4. `txtBhasha` over 50: refused with a validation message.
5. Author text is parameterised.
6. The BookSeq shift that never runs on the desktop is not ported.

## Web port (2026-10-06)

- API: `apps/api/src/master/screens/tirth-raksha.ts` (registered in `registry.ts`).
- Web: `apps/web/src/screens/TirthRakshaMaster.tsx` (registered in `screens/registry.tsx`).
- Tests: `apps/api/test/master-tirth-raksha.integration.test.ts`, the Tirth Raksha test in
  `apps/web/e2e/batch-c.spec.ts`.

Reused: `FieldSpec.vishayEntry` + `vishayEntryTrans` (Name, Peta Vishay, Remark(R1)),
`saveVishayEntry` / `VISHAY_ENTRY_LOOKUPS`, `upsertChildRows` (audit) for the seven plain popups,
`copyWithNewKeys`, `ScreenSpec.onNew` + `newDefaults(db, user, params)`, Author Master's Samvat
lists and `withVksamvat`, Prakashak Master's author popups and `authorText` (GetAuthorName, now
exported with the author key names as a parameter; Prakashak's own call is unchanged).

New, generic engine pieces (opt-in; no other screen changes behaviour):

- `ScreenSpec.onNew.trans`: popups whose rows New carries into the new record (the form's rows,
  or the record on screen's, loaded then), transformed by the screen and saved with it;
  `onNew.params` now also gets them (`trans`). Here: the Reference rows with new keys and PageNo
  cleared, and BookSeq = GetMaxBookSeq of their first book.
- `TransSpec.onSaved` gets the popup's saved `rows` and the rows it was opened with (`before`).
- `ScreenActions.setField`: a menu item that writes into the panel (Group No › … → txtGroupNo).
- `saveVishayEntry(…, summaryColumn?)`: with no lines left, the summary column is set to ''
  directly instead of `EXEC UpdateVishay` (which does exactly that, after a scan that took up to
  15–28 s here). Only Tirth Raksha passes it.
- `saveVishayEntry`'s orphan clean-up (lines whose record is gone) now finds the lines with a
  `LOOP JOIN` SELECT and deletes them by key. Same rows deleted, for every screen; the old
  single `DELETE … LEFT JOIN` needed a hash-join memory grant that, with the dev server short of
  memory, waited (RESOURCE_SEMAPHORE) past the 15 s request timeout (BookSubject's never ran at
  all: error 8645 after 4 minutes).

Behaviour as ported:

- Validation lines verbatim, CrLf-joined, then length lines ("- X cannot be longer than N
  characters") for what the desktop's INSERTs would fail on: Project Detail 2000, Remark(R)
  2000, Bhasha summary 50 (`txtBhasha`), Author row text 1500 (`txtAuth`), Samvat Remark 100 /
  Samvat 30 / Samvat PageNo 50, Reference PageNo 50 / GathaNo 100 / Remark 500.
- `BookTKt` is computed on the server: the Reference popup's first row when it was opened and
  names a book, else the stored value (Edit), else 0 ("- Reference(P) is Mandatory"). An Edit
  that relies on the stored value is checked inside the save.
- The Reference popup's Save asks the server for GetMaxBookSeq (action `max-book-seq`) when its
  first row names another book than the rows it was opened with.
- New: Project, Done By and the Reference box are kept; the Reference rows are carried (keys and
  PageNo cleared); Seq = `MAX(Seq)+1`, BookSeq from the carried first row's book.
- Copy keeps the boxes (Seq included, as on the desktop) and loads every popup and Vishay box
  with new keys / Id 0.
- Samvat cells: picking AsamvatName / Asamvat or editing them recomputes Vksamvat and
  Isvisan = Vksamvat − 56. After saving the rows the first row's Vksamvat / Isvisan / Remark go
  to `VikramSamvat` / `Isvisan` / `SamvatRemark`.
- Grid and the Name / Vishay / Peta Vishay / Remark(R1) boxes show GetcontString.
- Right-click: Print Report › Selected Column (+ layouts with a shortcut, none today), Send To
  Excel (disabled: empty handler), Utility › Show All Records (disabled: no handler), Update
  Book Seq (picker with selectFirst, then SetBookSeq as one `ROW_NUMBER()` UPDATE, then
  Refresh), Group No › Add In New Group / Add In Existing Group / Delete From Group (one UPDATE
  for the selection, GroupNoModifiedBy/Date stamped, the desktop's messages, txtGroupNo set),
  For Selected Record › Book Master (`open` book-master; nothing when no book).
- Delete: current row only, Security password, all ten child tables and the four VishayEntry
  TransactionNames in one transaction; no work report. Work report on Add and Edit.
- `lockable: false` (Ctrl+L/U fail as on the desktop: no Locked column). Permissions: menu only
  (`@ScreenAccess` through the master controller; no visibility rule for this item).

Desktop bugs fixed:

- Copy edited the source record's child rows / Vishay lines (keys now reset).
- An Edit without opening the Name popup overwrote `TirthRakshaName` with its GetcontString
  form (the stored name is kept).
- BookTKt came from the grid's current row, which the Reference popup in Add mode overwrote
  (another record); with an empty grid that line threw (server-side BookTKt now).
- `txtBhasha` over 50 and other overlong values threw ("String or binary data would be
  truncated"): validation lines instead.
- Quotes in author type / name text broke the Author save (parameters now).
- Emptying the Samvat popup made the save fail (`SamvatRemark` passed as Nothing): the three
  record columns are cleared to 0 / 0 / ''.

Kept quirks: txtGroupNo editable but never saved; the Bhasha rows show `bhasa_attr` while the
list writes `bhashaname`; Copy keeps the source's Seq; Update Book Seq says nothing.

Deferred / not ported:

- AddTableInfo ("add new" from the F2 list, frmVGPMmast) for Tirth / Purnata / Project / Done By
  and the Kshetra / Kruti / Vishay / Main Person cell lists — not in the engine yet.
- The dead `IsBookSeqExist` BookSeq shift.
