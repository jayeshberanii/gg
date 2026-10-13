# Magazine Master (`MagazineM`)

Desktop form: `GGLibrarySolution/Library/Library/frmMagazineMaster.vb` (+ `.designer.vb`, title
"Magazine Master", `Inherits Library.frmMasterPage`), repository
`Library.BusinessContract/Concrete/MagazineMRepository.vb` (address rows through
`PrakMastRepository.SavePrakMAddT`), popups `SetForm_MagazineM` and `SetForm_Common` ("Address")
in `Library/CommonForms/frmDisplayTransNew.vb`. Entity `Library.Entity/EntMagazineM.vb` (also
holds `EntMagBhashaT`).

Menu: Library › Magazine Master (`Frmlibmain.MagazineMasterToolStripMenuItem`, no visibility
rule; `menu.ts` screen `magazine-master`). Opens as an MDI child, maximized.

Status: **ported (2026-10-06).** API `apps/api/src/master/screens/magazine.ts`, UI
`apps/web/src/screens/MagazineMaster.tsx`, tests `apps/api/test/master-magazine.integration.test.ts`
and the Magazine Master case in `apps/web/e2e/batch-c.spec.ts`. See "Web port" at the end.

## Table and key

- Table `MagazineM`, **IDENTITY** PK `Magazinekm` (`SELECT @@identity` on the desktop; use
  `OUTPUT INSERTED`). 440 rows locally. No triggers, no foreign keys.
- `Locked` (**int**, all 440 rows NULL locally) exists: Ctrl+L / Ctrl+U → Security password →
  `LockUnlockRecords` on the selected grid rows (`lockable: true`). A locked record opens
  read-only (`EnableDisableDataEditing(ToolStrip1, , , , , True)` in FillData). **On the desktop
  this never works:** LockUnlockRecords writes `Locked='True'`, which an int column refuses
  ("Conversion failed when converting the varchar value 'True' to data type int"), so Ctrl+L
  only shows that error (see Desktop bugs).
- Audit `enuser/endate` on insert, `moduser/moddate` on update (both `date`).
- `TransactionName = "MagazineM"`, `PrimaryColumn = "Magazinekm"`, no JoinCond, no
  DefaultWhereCond, `WhereCondition` only when another form opens this one (none does).
- `MagazineM.BhashaKt` exists in the table but nothing reads or writes it (superseded by
  `MagBhashaT`). Leave it alone.

## Fields

Panel 1 of a horizontal SplitContainer (`Location 0,54`, `Size 1008,642`, SplitterDistance
298). Every label and box is Times New Roman 14.25pt, boxes 29px high. Three columns of boxes
at x=154 / 502 / 844; rows at y=18, 58, 98, 138, 178, 218, 258. Tab order follows the TabIndex
below (labels take the even numbers).

| Label (x,y)             | Box (Location / Size)              | Tab | Column (type)                               | Notes                                                                               |
| ----------------------- | ---------------------------------- | --- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Name (8,22)             | `txtMName` 154,18 / 216            | 1   | `MName` nvarchar(350)                       | required. F2 = distinct earlier names                                               |
| Samvat (382,22)         | `txtsamvatcokt` 502,18 / 195       | 3   | `samvatcokt` int / `samvatcoName`           | F2 `samvmast`                                                                       |
| Selection Rem (715,22)  | `txtSelectionRem` 844,18 / 158     | 5   | `SelectionRem` nvarchar(150)                | F2 earlier values                                                                   |
| Series (8,62)           | `txtSeries` 154,58 / 216           | 7   | `Series` varchar(**3**)                     | F2 fixed list B / S / BS (free text otherwise; >3 chars fails the INSERT, see bugs) |
| First/Break Yr (382,62) | `txtFirstYr` 502,58 / 66           | 9   | `FirstYr` nvarchar(50)                      | on Leave computes FYearVK (below)                                                   |
|                         | `txtFYearVK` 569,58 / 66           | 10  | `FYearVK` int                               | **ReadOnly + Enabled=False**; saved as `Val(text)`                                  |
|                         | `txtBreakYr` 636,58 / 61           | 11  | `BreakYr` nvarchar(350)                     | F2 earlier values                                                                   |
| Available Rem (715,62)  | `txtAvailableRem` 844,58 / 158     | 13  | `AvailableRem` nvarchar(250)                | F2 earlier values                                                                   |
| Series Remark (8,102)   | `txtSeriesRem` 154,98 / 216        | 15  | `SeriesRem` nvarchar(50)                    | F2 earlier values                                                                   |
| Last Yr (382,102)       | `txtCloseYr` 502,98 / 109          | 18  | `CloseYr` nvarchar(150)                     | on Leave computes CYearVK                                                           |
|                         | `txtCYearVK` 612,98 / 85           | 19  | `CYearVK` int                               | **ReadOnly** (still enabled); saved as `Val(text)`                                  |
| Missing Rem (715,102)   | `txtMissingRem` 844,98 / 158       | 21  | `MissingRem` nvarchar(50)                   | F2 earlier values                                                                   |
| MType (8,142)           | `txtMTypekt` 154,138 / 216         | 23  | `MTypekt` int / `MTypeName`                 | F2 columnmaster `Mtype`                                                             |
| Register No (382,142)   | `txtRegisterNo` 502,138 / 195      | 25  | `RegisterNo` nvarchar(50)                   | F2 earlier values                                                                   |
| Pub Status (715,142)    | `txtPubStatuskt` 844,138 / 158     | 27  | `PubStatuskt` int / `PubStatusName`         | F2 columnmaster `MagPubStatus`                                                      |
| BookT (8,182)           | `txtBookTran` 154,178 / 216        | 29  | popup → `MagBookmT`                         | summary text column `BookTran`                                                      |
| SubscribeT (382,182)    | `txtSubscribeTran` 502,178 / 195   | 31  | popup → `MagSubscribeT`                     | summary `SubscribeTran`                                                             |
| Rcv Status (715,182)    | `txtRcvStatuskt` 844,178 / 158     | 33  | `RcvStatuskt` int / `RcvStatusName`         | F2 columnmaster `MagRcvStatus`                                                      |
| Address (8,222)         | `txtAddressTran` 154,218 / 216     | 35  | popup → `PrakMAddT` (`Magazinekt`)          | summary `AddressTran`                                                               |
| Sampraday (382,222)     | `txtSampradayKt` 502,218 / 195     | 37  | `SampradayKt` int / `SampradayName`         | F2 `Sampraday`                                                                      |
| Bhasha (715,222)        | `txtBhashaTran` 844,218 / 158      | 39  | popup → `MagBhashaT`                        | summary `BhashaTran`                                                                |
| Cont Person (8,262)     | `txtContactPersonKt` 154,258 / 216 | 41  | `ContactPersonKt` int / `ContactPersonName` | F2 `authmast`                                                                       |
| Remark (382,262)        | `txtRemark` 502,258 / 195          | 49  | `Remark` nvarchar(1000)                     | F2 earlier values                                                                   |

A hidden 10×10 `dgForExcel` (475,98) only feeds the Missing Ank export.

FK pairs follow the desktop naming rule (`SetTextbox`): a box named `txt<X>kt` gets its Tag from
column `<X>kt` and its text from `<X>Name`. All values are `.Text.Trim`; ints are `Val(Tag)`.

### Vikram samvat (Txt_Leave)

- Leaving `txtFirstYr`: if Samvat is picked (`Tag > 0`) and FirstYr is longer than 2 chars,
  `txtFYearVK = GetVikramSamvat(samvatcokt, FirstYr)` when FirstYr is numeric, or of FirstYr
  minus its last character when only that part is numeric ("1990?" → 1990). Otherwise the box
  is left as it was (not cleared).
- Leaving `txtCloseYr`: the same into `txtCYearVK`.
- Use `getVikramSamvat` from `apps/web/src/screens/AuthorMaster.tsx` (port of
  `MdlLib.GetVikramSamvat`).
- **Quirk (keep):** the samvat box was meant to retrigger it too, but the code compares
  `txt.Name.ToUpper = "txtsamvatcokt"` (upper vs lower case), so picking a samvat afterwards
  does not recompute. The VK boxes are not cleared when the year is cleared either.

## Validation (`MagazineMRepository.GetValidationMessage`)

Only one rule, after the "Are You Sure to Save This Record?" Yes/No:

1. `MName = ""` → `"Please Enter Magazine Name"`

## F2 lookups (tblSearch, TransactionName `MagazineM`, Type `M`)

| Box                                                                                              | F2EntryText (verbatim)                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MName                                                                                            | `select MName from MagazineM where isnull(MName,'')<>'' group by MName order by MName`                                                                                                     |
| Series                                                                                           | `SELECT 'B' AS Id,'B' AS Name UNION ALL SELECT 'S' AS Id,'S' AS Name UNION ALL SELECT 'BS' AS Id,'BS' AS Name`                                                                             |
| SeriesRem, AvailableRem, BreakYr, CloseYr, FirstYr, MissingRem, RegisterNo, SelectionRem, Remark | `select <col> from MagazineM where isnull(<col>,'')<>'' group by <col> order by <col>`                                                                                                     |
| MTypekt                                                                                          | `select ColumnMastkm,Name,Brief,Remark,HindiWord  from columnmaster where Vibhag ='Mtype' order by Name`                                                                                   |
| PubStatuskt                                                                                      | same, `Vibhag ='MagPubStatus'`                                                                                                                                                             |
| RcvStatuskt                                                                                      | same, `Vibhag ='MagRcvStatus'`                                                                                                                                                             |
| samvatcokt                                                                                       | `SELECT samvatcokm,samvatname FROM samvmast ORDER BY samvatname`                                                                                                                           |
| SampradayKt                                                                                      | `select SampradayKm, SampradayName, Brief from Sampraday ORDER BY SampradayName`                                                                                                           |
| ContactPersonKt                                                                                  | `select authmast.authorcokm,authmast.authorname,visheshMast.Vishesh AS Sampraday from authmast left join visheshMast on authmast.Sampradaykt=visheshMast.Tid order by authmast.authorname` |

FYearVK / CYearVK have empty F2EntryText. No AddTableInfo on any row. Ctrl+F opens the search-by
picker (`tblSearch ... IsSearchable=1 order by seq`), as on every master.

## Grid

`dgMain` (Panel 2, 1008×340, ReadOnly, FullRowSelect, no row headers, LightSteelBlue
alternating rows in Arial Unicode MS 9; header Verdana 12). `AutoGenerateColumns = False`: the
**designer columns** are the grid, in this order; the query columns come from tblSearch
`DisplayInGrid` (via `GetDataTable`, `ORDER BY Magazinekm DESC`, all rows).

| #   | Header        | Field           | Width | Visible |
| --- | ------------- | --------------- | ----- | ------- |
| 0   | Id            | `Magazinekm`    | 90    | yes     |
| 1   | MName         | `MName`         | 120   | yes     |
| 2   | Series        | `Series`        | 100   | yes     |
| 3   | Series Remark | `SeriesRem`     | 120   | yes     |
| 4   | MTytpeKt      | `MTypekt`       | 100   | **no**  |
| 5   | MType         | `MTypeName`     | 100   | yes     |
| 6   | Samvat        | `samvatcoName`  | 100   | yes     |
| 7   | FirstYr       | `FirstYr`       | 100   | yes     |
| 8   | FYearVK       | `FYearVK`       | 100   | yes     |
| 9   | Break Yr      | `BreakYr`       | 100   | yes     |
| 10  | Last Yr       | `CloseYr`       | 100   | yes     |
| 11  | CYearVK       | `CYearVK`       | 100   | yes     |
| 12  | RegisterNo    | `RegisterNo`    | 100   | yes     |
| 13  | Sampraday     | `SampradayName` | 100   | yes     |
| 14  | PubStatusKt   | `PubStatuskt`   | 100   | **no**  |
| 15  | PubStatus     | `PubStatusName` | 100   | yes     |
| 16  | RcvStatusKt   | `RcvStatuskt`   | 100   | **no**  |
| 17  | RcvStatus     | `RcvStatusName` | 100   | yes     |
| 18  | Bhasha        | `txtBhasha`     | 100   | yes     |

`txtBhasha` is BhashaTran's `GridColumnName` (`STUFF` of `bhasmast.bhashaname` over
`MagBhashaT`). `Remark` and `ContactPersonName` are in the query (DisplayInGrid) but have no
designer column, so they are not shown. Header "MTytpeKt" is the designer's typo (hidden).

## Child tables saved with the record (F2 popups, frmDisplayTransNew)

The four `…Tran` boxes open frmDisplayTransNew with the rows of their tblSearch Type `T`
F2EntryText (`{Id}` = TranKm). On OK the box text becomes the generic summary (non-key cells of
each row joined by "-", rows by ","; the form's own loop, same as other masters' `transSummary`).

| Box / column    | Popup (TranName, FormName)   | Table / key                                           | F2EntryText (rows)                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddressTran`   | `Address`, `Common`          | `PrakMAddT` / `prakMAddkm` (identity), `Magazinekt`   | `SELECT PrakMAddT.prakMAddkm,PrakMAddT.PrakashakName,PrakMAddT.address,PrakMAddT.citykt,ISNULL(visheshMast.Vishesh,'') AS City,isnull(PrakMAddT.pincode,'') as pincode,… Pname,MobName,MobileNo,PrakMAddT.seq FROM PrakMAddT … WHERE PrakMAddT.magazineKt ={Id} AND ISNULL(PrakMAddT.magazineKt,0)>0 ORDER BY PrakMAddT.seq` (no StateKt / State columns) |
| `BookTran`      | `BookTran`, `MagazineM`      | `MagBookmT` / `MagBookmTKm` (identity)                | `SELECT DISTINCT MB.MagBookmTKm,ISNULL(B.BookName,'') AS BookName,MB.MissingYr,MB.MissingaAnk,B.PSamvatVK,MB.bookmastkt,B.txtBookTran FROM MagBookmT MB LEFT JOIN BookM B ON MB.bookmastkt=B.BookMastkm WHERE MB.Magazinekt ={Id}`                                                                                                                        |
| `SubscribeTran` | `SubscribeTran`, `MagazineM` | `MagSubscribeT` / `MagSubscribekm` (identity)         | `SELECT DISTINCT MS.MagSubscribekm,Convert(varchar,SubDate,103)  SubDate,Ms.PartyMkt,ISNULL(P.PName,'') AS PName,MS.SType,Ms.SUptoYr,MS.LavajamType,MS.Amount,MS.Remark FROM MagSubscribeT MS LEFT JOIN PartyM P ON MS.PartyMkt=P.partyMkm WHERE MS.Magazinekt={Id}`                                                                                      |
| `BhashaTran`    | `BhashaTran`, `MagazineM`    | `MagBhashaT` / `MagBhashaKm` (identity), `MagazineKt` | `select MagBhashaT.MagazineKt,MagBhashaT.MagBhashaKm,MagBhashaT.bhashakt,bhasmast.bhashaname,MagBhashaT.Remark from MagBhashaT inner join bhasmast on bhasmast.bhashacokm=MagBhashaT.bhashakt where MagBhashaT.MagazineKt in ({Id}) order by MagBhashaT.MagBhashaKm`                                                                                      |

Popup cell behaviour (`SetForm_MagazineM`):

- **BookTran**: hidden `MagBookmTKm`; editable `MissingYr`, `MissingaAnk`. F2 on `BookName` →
  `SELECT BookMastkm,BookName,PSamvatVK FROM BookM` (no ORDER BY) sets `bookname`,
  `bookmastkt`, `PSamvatVK`, then moves to MissingYr. New row template
  `{GetMaxId(MagBookmT), "", "", "", 0, 0}`; the key is ignored on save.
- **SubscribeTran**: hidden `MagSubscribekm`, `PartyMkt`; editable `SUptoYr`, `LavajamType`,
  `Amount`, `Remark`. F2 on `SubDate` → InputBox `"Please Enter SubDate(Ex-dd/MM/yyyy)"`,
  default today (`dd/MM/yyyy`) or the cell value, then → PName. F2 on `PName` →
  `SELECT partyMkm,PName FROM PartyM` (sets PName + PartyMkt, → SType). F2 on `SType` →
  `SELECT 'Free' AS Id,'Free' AS Name UNION ALL SELECT 'Paid' AS Id,'Paid' AS Name` (→ SUptoYr).
- **BhashaTran**: hidden `MagBhashaKm`, `MagazineKt`, `BhashaKt`; editable `Remark`. F2 on
  `BhashaName` → `SELECT bhashacokm,bhashaname FROM bhasmast`.
- **Address**: the shared Address popup (`ADDRESS_TRANS` in
  `apps/web/src/features/master/commonTrans.ts`): hidden `prakMAddkm, citykt, statekt,
category`; F2 on PrakashakName / City / CategoryName (`PrakMCat`). No State column here.

### How Save writes them (delete + insert, inside the record's transaction)

The form builds each list **only when the box text changed**: `(text <> "" and new record)` or
`(dtSel.<col> <> box text)`. The repository then:

1. On edit, `DeleteTransaction` per table: `DELETE FROM <table> WHERE Magazinekt=@Id` when the
   box is **empty** or its list is non-empty. So clearing a box deletes all its rows; an
   unchanged box keeps them.
2. Inserts every listed row (keys ignored):
   - `PrakMAddT` via `SavePrakMAddT(lst, …, MagazineKt:=id)`:
     `(PrakMastKt,PartyMKt,Magazinekt,AuthorCoKt,PrakashakName,address,citykt,StateKt,pincode,phoneno,email,remark,category,seq,Pname,MobName,MobileNo)`
     with PrakMastKt/PartyMKt/AuthorCoKt = 0 and **StateKt = 0** (the form never fills it).
     Same as party/author: `apps/api/src/master/screens/party.ts` lines ~178–230.
   - `MagBookmT (Magazinekt,bookmastkt,MissingYr,MissingaAnk)` (trimmed text).
   - `MagSubscribeT (Magazinekt,PartyMkt,SType,SUptoYr,LavajamType,Amount,Remark,SubDate)`;
     SubDate from the `dd/MM/yyyy` cell, rewritten as `MM-dd-yyyy`, NULL when blank.
     `Amount = Val(…)` (int).
   - `MagBhashaT (Magazinekt,BhashaKt,Remark)`.
3. Commit only when every step returned > 0.

`MagazineMRepository.UpdateMagBookmT` (update by `MagBookmTKm`) exists but nothing calls it.

## Save flow

1. "Are You Sure to Save This Record?" Yes/No.
2. Validation (above). 3. Repository Save in one transaction (insert / update the record, then
   children). 4. "Record Saved Successfully".
3. Add: the new row is fetched with `ListGridData(…, TranKm)` and inserted at the top of the
   grid; Edit: `RefreshCurrentGridRecord` (see bugs) and `insertworkreports(… dtSel, dtTmpSel)`.

## Copy

`btnCopy`: "Do You Want to Add More With Copying Data?" Yes → `TranKm = 0`, `StrMode = "Add"`
only. Main fields are kept. **Children are not copied** unless the user edits a popup box,
because the "text changed" test still compares with the old record's `dtSel`. The web's `copy`
spec should therefore clear nothing and not carry popup rows unless re-opened (or decide to
carry them; see open questions).

## Delete

"Are You Sure to Delete This Record?" → Security password (`InputBoxProc`) →
`DeleteTransaction(TranKm, "", "", "", Nothing, …)` (no transaction) → `Delete(MagazineM,
Magazinekm, id)` → "Record Deleted " (Information). **No work report** on delete, and none on
Add either: the form logs **Edit only** (`workReport: true, workReportOn: { edit: true }`).

## Right-click menu (`cntMenu` on dgMain)

| Item                                      | Behaviour                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column            | engine's PrintSelectedColumn. Its dropdown lists Config_Master rows of type `MagazineM` **with a ShortcutKey**; the two local layouts (`M_master`, `Magadd`) have none, so the dropdown is empty and only the dialog is reachable                                                                                 |
| Print Report › Send To Excel              | **no handler** on the desktop (does nothing). Show disabled                                                                                                                                                                                                                                                       |
| Print Report › Missing Ank(Sampradaywise) | picker `SELECT DISTINCT Sampraday.SampradayKm,Sampraday.SampradayName from MagazineM inner join Sampraday on MagazineM.SampradayKt=Sampraday.SampradayKm ORDER BY Sampraday.SampradayName`; if a Tag came back, `GetMissingAnkReport(tag)` → `SendtoExcel` (an Excel sheet). Web: a `table` result + Excel export |
| Send To › BookM                           | selected rows' ids; if `SELECT COUNT(*) FROM magbookmt WHERE MagazineKt IN(ids)` = 0 → `"No Record Found"`; else opens Book Master with `AND BookMastKm IN(SELECT DISTINCT bookmastkt FROM magbookmt WHERE magazinekt IN(ids))` → `openInUse(db, 'book-master', …)`                                               |
| Send To › BookT                           | same count check; else frmBookTranNew (dialog) with `AND Tid IN(SELECT DISTINCT tid FROM MagBookmT INNER JOIN BookT ON MagBookmT.bookmastkt=BookT.BookMastkt WHERE Magazinekt IN(ids) AND ISNULL(MagBookmT.bookmastkt,0)>0)` → `openInUse(db, 'book-tran', …)` like party.ts `send-to-book-t`                     |

Missing Ank SQL (`GetMissingAnkReport`, verbatim apart from the id list, which must be bound):

```sql
WITH paging as (
SELECT row_number() over(partition by v.SampradayName order by v.SampradayName) GroupRowNumber,
  row_number() over(order by v.SampradayName) RowNumber, V.SampradayName AS Sampraday, M.MName,
  B.BookName, B.txtBookTran, MB.MissingaAnk, MB.MissingYr, ISNULL(B.PSamvatVK,0) PSamvatVK,
  colPubStatus.Name AS PubStatus
FROM MagazineM M LEFT JOIN Sampraday V ON M.SampradayKt=V.SampradayKm
INNER JOIN MagBookmT MB ON M.Magazinekm=MB.Magazinekt
INNER JOIN BookM B ON Mb.bookmastkt=B.BookMastkm
LEFT JOIN columnmaster colPubStatus ON M.PubStatuskt=colPubStatus.ColumnMastkm
WHERE M.SampradayKt IN(<ids>) AND ((ISNULL(MissingaAnk,'')<>'' ) OR (B.txtBookTran LIKE'%EB%'
  AND ISNULL(MB.MissingYr,'')='' AND ISNULL(MB.MissingaAnk,'')='')) )
SELECT case when GroupRowNumber=1 then Sampraday else '' end Sampraday, BookName, txtBookTran,
  MissingaAnk, MissingYr, PSamvatVK, PubStatus from paging order by RowNumber
```

Columns out: Sampraday (only on each group's first row), BookName, txtBookTran, MissingaAnk,
MissingYr, PSamvatVK, PubStatus. (`MName` is selected in the CTE but not output.)

## Reports and printing

No Crystal report. Only PrintSelectedColumn (Config_Master `MagazineM`: `M_master`
`13,3,4,7,10,11,12,14,17,20,21,22,19,18`, `Magadd` `13,4,20`) and the Missing Ank Excel.

## Permissions

None beyond the menu (no `curr_utypeid` / `curr_lnid` checks). Toolbar via
`EnableDisableDataEditing`; Locked records read-only. Delete and Lock/Unlock need the Security
password (`assertPassword`).

## SQL in form event handlers

- Load: `select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where
ConfigType='MagazineM' and isnull(ShortcutKey,'')<>'' order by ConfigName`
- Send To: `SELECT COUNT(*) FROM magbookmt WHERE MagazineKt IN(<ids>)` and the two
  WhereConditions above. Missing Ank picker above.
- F2 on a popup box: `select isnull(replace(F2EntryText,'{Id}',<TranKm>),'') from tblSearch …`.

No files, images or disk access. No hard-coded passwords.

## Desktop bugs

- **Throws — Ctrl+L / Ctrl+U always fail.** `LockUnlockRecords` writes `Locked='True'` into the
  int `MagazineM.Locked`. Web: writes 1 / 0 (engine-wide, same result for bit columns).
- **Data-corrupting — Delete leaves `MagBhashaT` rows behind and shows an error.** `Delete()`
  passes `Nothing` as the Bhasha text, `Nothing.Trim` throws inside `DeleteTransaction` after
  PrakMAddT / MagBookmT / MagSubscribeT were deleted; the MsgBox "Object reference not set…"
  appears and the record is still deleted. The local DB has **46 orphan MagBhashaT rows** (and
  3 orphan MagBookmT rows). Web: delete all four child tables and the record in one transaction.
- **Data-corrupting — delete is not atomic.** On delete, DeleteTransaction runs outside any
  transaction and the record is deleted on a separate connection. (Save is safe: a failed step
  skips the Commit and closing the connection rolls back.) Web: one transaction.
- **Throws — `Series` is varchar(3)** while the box is free text; a longer value fails the
  INSERT/UPDATE ("String or binary data would be truncated"). Web: max length 3 on the box (or
  a validation message) instead of a SQL error. Similar lengths: `SeriesRem`/`RegisterNo`/
  `MissingRem`/`FirstYr` 50, `SelectionRem`/`CloseYr` 150, `AvailableRem` 250. Use the
  column lengths as `maxLength`.
- **Throws — bad SubDate.** A SubDate that is not `d/m/y` makes `ls(1)` throw (the whole save
  aborts with the exception text) or SQL reject the date. Web: validate in the popup.
- Harmless quirk: after an Edit, `RefreshCurrentGridRecord` fills the Sampraday and Bhasha
  cells from `GetDataById`, which never reads `SampradayName` / `txtBhasha`, so those two cells
  go blank until Refresh. Web: refresh the row from the list query (no need to copy).
- Harmless quirk: the Vikram-samvat recompute on the samvat box never fires (case compare).
- Harmless quirk: the Address popup rows lose `StateKt` (always 0); the magazine F2EntryText has
  no State column at all.
- Harmless quirk: Copy does not carry popup rows (see Copy).

## Implementation hints

- A plain engine screen: `apps/api/src/master/screens/magazine.ts` +
  `apps/web/src/screens/MagazineMaster.tsx`, `lockable: true`, `workReport: true,
workReportOn: { edit: true }`. Closest models: `party.ts` (Address popup + delete-insert
  children with `onlyWhenTextChanged: true`, `send-to-book-t`), `outsider.ts` for the plain
  fields.
- Children are **delete + insert** keyed on "box text changed / box empty", not
  `upsertChildRows`. Mirror party.ts: `grid(f, '<col>')` rows present → delete + insert; box
  empty → delete; otherwise keep.
- Trans specs: `AddressTran: ADDRESS_TRANS`; `BookTran` (lookup `bookname` → setKt
  `bookmastkt`, also `PSamvatVK`, next `MissingYr`); `SubscribeTran` (SubDate input dialog with
  today's date, `pname` → PartyMkt, `stype` fixed list); `BhashaTran` (`bhashaname` → BhashaKt).
  All with `onlyWhenTextChanged: true`. Check `TransLookup.input` covers the SubDate InputBox.
- Field `onLeave` for FirstYr / CloseYr → VK boxes (BookMaster.tsx has the same pattern for
  PSamvatVK).
- Grid columns from the designer table above, not from tblSearch.
- Missing Ank: an action returning `{ kind: 'table', … }` after a `lists` picker; ids bound
  with `idList`.
- Engine gaps: none obvious. Possibly the BookM picker size (`SELECT … FROM BookM` with no
  filter) — reuse whatever Book lookups already do for paging.

## Decisions (orchestrator defaults, `remaining-screens-decisions.md`)

1. Delete removes all child rows (MagBhashaT, MagBookmT, MagSubscribeT, PrakMAddT) and the record
   in one transaction.
2. The existing orphans are left alone: **46 `MagBhashaT`** and **3 `MagBookmT`** rows point at
   no MagazineM row locally (0 MagSubscribeT, 0 PrakMAddT). The web only stops creating more.
3. Copy matches the desktop: no popup rows are copied (see Copy).
4. Series over 3 characters (and every other overlong text, below) is rejected with a
   validation message.

## Web port

What was ported: the whole form — 22 boxes at the designer positions, the 6 `…kt` lookups and
the free-text F2 lists (tblSearch), the Vikram-samvat Txt_Leave for First Yr / Last Yr, the four
popups (Address = the shared `ADDRESS_TRANS`; BookT, SubscribeT with the SubDate InputBox, Bhasha
per SetForm_MagazineM), delete-and-insert of the children keyed on "box text changed / box
emptied", the designer grid columns, entry label, Locked read-only state, Ctrl+L / Ctrl+U,
Edit-only work report (with the work-type prompt), and the right-click menu: Print Report ›
Selected Column (with the shortcut layouts, none locally), Send To Excel (disabled: no handler on
the desktop), Missing Ank(Sampradaywise) (picker, then the report as an Excel download), Send To
› BookM (opens Book Master) and › BookT (the Library No dialog).

Engine extensions (generic, opt-in):

- `ScreenDefinition.lockedColumns`: a record whose column is true cannot be edit-locked, saved
  or deleted through the API (403 "This record is Locked"), mirroring FillData's read-only state.
  Only Magazine Master sets it so far.
- `MasterService.setLocked` writes `Locked = 1 / 0` instead of `'True' / 'False'`: identical for
  every bit column, and it makes Ctrl+L work on the int `Locked` columns (MagazineM, bhandtran).

Deliberate differences / desktop bugs fixed:

- **Ctrl+L / Ctrl+U work** (the desktop's always failed on the int column, above). A record with
  `Locked = 1` opens read-only; the desktop's own `dtSel("Locked") = True` test would only ever
  have matched a value it could not write.
- **Delete is one transaction over all four child tables + the record** (the desktop threw on
  the Bhasha text, leaving MagBhashaT rows, and ran outside any transaction). Still no work
  report on delete, as on the desktop.
- **Overlong values and bad dates are validation messages**, not an aborted save: after the
  desktop's "Please Enter Magazine Name" come `"<Label> cannot be longer than <n> characters"`
  for Name 350, Series 3, Series Remark 50, First Yr 50, Break Yr 350, Last Yr 150, Register No
  50, Selection Rem 150, Available Rem 250, Missing Rem 50, Remark 1000; the popup cells
  MissingYr 50, MissingaAnk 500, SType / SUptoYr / LavajamType 50, Remark 1000; `SubDate "<x>" is
not a date (Ex-dd/MM/yyyy)` (a real d/M/yyyy date is required; the desktop let SQL Server read
  its swapped "M-d-yyyy" string); FYearVK / CYearVK / Amount outside the int range.
- After an Edit the grid row is refreshed from the list query, so Sampraday and Bhasha no longer
  go blank until Refresh (the desktop's RefreshCurrentGridRecord quirk).
- Send To › BookT: when the magazines have MagBookmT rows but none with a book that has a
  library number, the desktop opens an empty Library No dialog; the web shows "No Record Found".
- Missing Ank downloads the report (the web's Excel export) instead of opening Excel; picking
  nothing (or the blank row) runs nothing, as the desktop's `If tx.Tag <> ""`.

Kept harmless quirks: the samvat box never recomputes the VK boxes; the VK boxes are not
cleared with the year; Address rows get StateKt 0; Copy carries no popup rows unless a popup is
re-opened and saved (the box text still compares with the copied record's); the BookT popup's
F2 lists every BookM row unordered (107k rows, windowed list).

Deferred: nothing (no files, images or Crystal reports on this form).
