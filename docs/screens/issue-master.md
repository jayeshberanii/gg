# Issue Master (`IssueTran`)

Desktop form: `GGLibrarySolution/Library/Issue/frmIssueTran.vb` (1321 lines) + `.Designer.vb`
(title **"Issue Register"**, `Inherits Library.frmMasterPage`), repository
`Library.BusinessContract/Concrete/IssueTranRepository.vb` (+ `CommonRepository`), entity
`Library.Entity/EntIssueTran.vb`. Report `Library/CrystalReports/IssueSlipReport.rpt` shown by
`Library/Reports/frmReport.vb`. Menu: Issue › Issue Master (screen id `issue-master`, no
visibility rule in `menu.ts`). **Ported 2026-10-08**: see "Web port" at the end.

Other screens already open it with a list of ids (Book Master, Library No form, Party Master,
Hastprat). On the desktop they set `WhereCondition = " AND IssueTranKm in(…)"`, which **replaces**
`DefaultWhereCond`, so returned and lost rows show too. The web's `kind: 'open'` ids path
already skips `defaultCondition`, which matches. Only `frmLastActivity` sets `StrId`, and that
path _keeps_ the default.

## Table and key

- `IssueTran` (the DB name is lower-case `issuetran`). PK `IssueTranKm`, an IDENTITY column.
  There are no triggers. 138,860 rows, 6,945 not returned (dev DB, 2026-10-05).
- There is one row per issued item: a LibNo (`entrcodekt` → `BookT.Tid`) or a Patrika
  (`PatrikaKt` → `Patrika.Patrikakm`). A _slip_ (`slipno`, e.g. `J 16743`) groups the rows of
  one issue.
- `Locked` bit: Ctrl+L / Ctrl+U take the **Security** password (`InputBoxProc()`), so
  `lockable: true` with the plain lock. Save writes `Locked = returned`, so a returned row
  becomes locked and its toolbar is locked (`EnableDisableDataEditing(…, Locked:=True)`).
- Columns (INFORMATION_SCHEMA): `issue_date datetime`, `party_cokt decimal`, `Ref_partykt int`,
  `MobileNo char(60)` (space-padded), `slipno nvarchar(40)`, `entrcodekt decimal`,
  `due_date datetime`, `returned bit NOT NULL`, `returndate datetime`, `ConfmMarkkt int`,
  `ConfmReport nvarchar(150)`, `ConfmBykt int`, `Confmdt date`, `replacebykt int`,
  `ActionReport nvarchar(150)`, `ActionDt date`, `receivedFromKt int`, `CostBearBykt int`,
  `Amout int` (sic), `remark nvarchar(3000)`, `enuser int`, `endate date`, `moduser int`,
  `moddate date`, `Locked bit`, `issue_no nvarchar(20)`, `givenparty nvarchar(60)`,
  `receiver nvarchar(60)`, `party_add nvarchar(550)`, `Ref_add nvarchar(550)`, `vseq numeric`,
  `peta_ank nvarchar(15)`, `libno nvarchar(15)`, `ISSUEDATE/returndt/DUEDATE int` (legacy),
  `receiverkt int`, `BookMastkt int`, `Adey bit`, `SearcherKt int`, `AnkNo nvarchar(500)`,
  `PatrikaKt int`.
- The form never writes `givenparty`, `receiver`, `Ref_add`, `vseq`, `libno` or the int date
  columns. `peta_ank` is set to `""` in the entity, but neither the INSERT nor the UPDATE
  writes it.

## The panel

`SplitContainer1` is horizontal: `SplitterDistance` 344, width 1008, Panel1 `BackColor` White.
Every box and label is **Times New Roman 14.25 pt**, boxes 29 px high. Form `ClientSize`
1012×708, `KeyPreview`, opens maximized. The positions below are the Designer's.

| Tab | Label (x,y)              | Control                   | Column / Tag                           | Location | Size  | Notes                                                                                                   |
| --- | ------------------------ | ------------------------- | -------------------------------------- | -------- | ----- | ------------------------------------------------------------------------------------------------------- |
| 1   | Issue Date (6,22)        | `dtpissue_date` DTP       | `issue_date`                           | 156,18   | 152   | `dd-MM-yyyy`. New: today. ValueChanged → Due = Issue + 90 (always, Adey or not)                         |
| 2   | —                        | `chkAdey` CheckBox "Adey" | `Adey`                                 | 311,24   | 69×25 | Add mode only: checked → Due = Issue + 3, unchecked → Issue + 90                                        |
| 4   | Party Name (6,62)        | `txtparty_cokt`           | `party_cokt` / `party_coName`          | 156,58   | 152   | inline F2, see below. Required                                                                          |
| 5   | —                        | `txtCurBalance`           | (grid `DepositTran`)                   | 311,58   | 71    | ReadOnly. Party's deposit balance                                                                       |
| 7   | Party Address (6,102)    | `txtparty_add`            | `party_add`                            | 156,98   | 227   | F2: that party's `PrakMAddT` addresses                                                                  |
| 9   | Ref Party (6,142)        | `txtRef_partykt`          | `Ref_partykt` / `Ref_partyName`        | 156,138  | 227   | inline F2, see below                                                                                    |
| 11  | Ref Address (6,182)      | `txtRef_add`              | — (display only)                       | 156,178  | 227   | FillData: `PartyM.txtAddress` of the ref party. Never saved                                             |
| 13  | Mobile/Slip No (6,222)   | `txtMobileNo`             | `MobileNo`                             | 156,218  | 152   | F2: that party's `PrakMAddT.MobileNo`s                                                                  |
| 14  | (same label)             | `txtslipno`               | `slipno`                               | 311,218  | 71    | F2 slip generator                                                                                       |
| 16  | Search/LibNo/PNo (8,262) | `txtSearcherKt`           | `SearcherKt` / `SearcherName`          | 156,259  | 78    | New: the signed-in user. F2 tblSearch: `select tid,uname from Usecurity order by uname`. Required       |
| 17  | (same label)             | `txtentrcodekt`           | `entrcodekt` / `entrcodeName` (LibNo)  | 236,259  | 73    | inline F2, see below                                                                                    |
| 18  | (same label)             | `txtPatrikaKt`            | `PatrikaKt` / `PatrikaName` (RecordNo) | 311,259  | 73    | inline F2, see below                                                                                    |
| 20  | Book Name/Ank (6,302)    | `txtBookMastKt`           | `BookMastkt` / `BookMastName`          | 156,298  | 152   | `TabStop = False`. Filled by the LibNo F2. Its own F2 has an empty F2EntryText, so it does nothing      |
| 21  | (same label)             | `txtAnkNo`                | `AnkNo`                                | 311,298  | 73    | free text                                                                                               |
| 23  | Due Date (385,22)        | `dtpdue_date` DTP         | `due_date`                             | 513,18   | 196   | `dd-MM-yyyy`. New: Issue + 90                                                                           |
| 25  | Returned (385,62)        | `cmbReturned`             | `returned`                             | 513,58   | 196   | DropDownList `{"No","Yes"}`. New: "No". "Yes" enables Return Date, "No" disables and clears it          |
| 27  | Return Date (385,102)    | `txtreturndate` Masked    | `returndate`                           | 513,98   | 196   | Mask `00/00/0000` (dd/MM/yyyy). Enabled = False until Returned = Yes                                    |
| 29  | Confirm Mark (385,142)   | `txtConfmMarkkt`          | `ConfmMarkkt` / `ConfmMarkName`        | 513,138  | 195   | tblSearch F2: columnmaster `isue_confirm`                                                               |
| 31  | Confirm Report (385,182) | `txtConfmReport`          | `ConfmReport`                          | 513,178  | 195   | tblSearch F2: earlier values                                                                            |
| 33  | Confirm By (385,222)     | `txtConfmBykt`            | `ConfmBykt` / `ConfmByName`            | 513,218  | 195   | tblSearch F2: columnmaster `DoneBy`. Leave: a tag > 0 enables Confirm Date, else disables and clears it |
| 35  | Confirm Date (385,262)   | `txtConfmdt` Masked       | `Confmdt`                              | 513,258  | 195   | Mask `00/00/0000`, Enabled = False by default                                                           |
| 37  | Old IssueNo (385,302)    | `txtissue_no`             | `issue_no`                             | 513,298  | 196   | ReadOnly, `ForeColor` InfoText. New: `GetMaxIssueNo()`                                                  |
| 39  | Replace By (715,22)      | `txtreplacebykt`          | `replacebykt` / `replacebyName`        | 844,18   | 158   | tblSearch F2: columnmaster `isue_replby`. Leave → enables / clears Action Date                          |
| 41  | Action Date (715,62)     | `txtActionDt` Masked      | `ActionDt`                             | 844,58   | 158   | Mask `00/00/0000`, Enabled = False by default                                                           |
| 43  | Action Report (715,102)  | `txtActionReport`         | `ActionReport`                         | 844,98   | 158   | tblSearch F2: earlier values                                                                            |
| 45  | Received From (715,142)  | `txtreceivedFromKt`       | `receivedFromKt` / `receivedFromName`  | 844,138  | 158   | tblSearch F2: columnmaster `isue_rcvd_from`                                                             |
| 47  | CostBear By (715,182)    | `txtCostBearBykt`         | `CostBearBykt` / `CostBearByName`      | 844,178  | 158   | tblSearch F2: columnmaster `isue_costpaid_by`                                                           |
| 49  | Amount (715,222)         | `txtAmout`                | `Amout` (int, `Val()`)                 | 844,218  | 158   |                                                                                                         |
| 51  | Remark (715,262)         | `txtremark`               | `remark`                               | 844,258  | 158   | F2 throws (see the bugs section)                                                                        |
| 53  | Receiver (715,302)       | `txtReceiverKt`           | `Receiverkt` / `ReceiverName`          | 844,298  | 158   | ReadOnly, InfoText. Only Return Selected sets it                                                        |

Labels sit at the same y + 4 as their box, 21 px high. The panel has no group boxes. `SetTextbox`
pairs every `txt<X>kt` box with column `<X>kt` (the Tag) and `<X>Name` (the text). That is how
Receiver shows `ReceiverName`.

### Enable / read-only rules

These come from `ReadOnlyControls(flg)`, whose name is misleading: it sets **`Enabled = flg`**.
It covers Issue Date, Party, Party Address, Ref Party, Ref Address, Mobile, Slip, Due Date,
Confirm Mark / Report / By / Date, Replace By, Action Report, Received From, CostBear By, Amount
and Remark.

- **New** (`btnNew_Click`) and selecting a row (`dgMain_Click`) call `ReadOnlyControls(True)`,
  so all of them are enabled.
- **New** also clears the panel and sets Old IssueNo = `GetMaxIssueNo()`, Issue Date = today,
  Due = +90, Returned = "No", Adey off, Searcher = current user. Confirm Date and Action Date
  are cleared and disabled. Party, Ref Party, Slip, LibNo, Book and Patrika are made editable.
- **Opening a record** (`FillData`) applies a 1-day rule: when `endate` is empty or **older than
  yesterday**, Party, Ref Party, Slip, LibNo, Book Name and Patrika are `ReadOnly`. Otherwise
  (entered today or yesterday), Party, LibNo, Book and Patrika stay editable, Ref Party is
  ReadOnly, and Slip is **disabled**.
- On the desktop, ReadOnly does not stop F2: `Txt_KeyDown` still fires and `DisplayListForm`
  writes the box. The web should block F2 on a read-only box.
- FillData also sets: Returned "Yes"/"No". Return Date is enabled and shows `dd-MM-yyyy` only
  when Returned. Confirm Date is enabled only when Confirm By > 0, and Action Date only when
  Replace By > 0. Adey is set from the row. Cur Balance comes from the grid row's `DepositTran`.
  Ref Address comes from `PartyM.txtAddress`.

## Validation

Save first asks **"Are You Sure to Save This Record?"**. When the party has a six-month-old
book, it asks **"Return 6 Month Old Book." + vbCrLf + "Are You Sure to Save This Record?"**
instead. That check:

```sql
SELECT COUNT(*) FROM issuetran INNER JOIN columnmaster ON issuetran.ConfmMarkkt = columnmaster.ColumnMastkm
WHERE party_cokt=<party> AND ISNULL(returned,0)=0 AND columnmaster.Name NOT LIKE 'lost%'
  AND DATEDIFF(MONTH,due_date,GETDATE())>6
```

Then `IssueTranRepository.GetValidationMessage` runs. These are checked in order, and the first
one that fails is shown, verbatim:

1. `party_cokt = 0` → `Please Enter Party Name`
2. `entrcodekt = 0 And PatrikaKt = 0` → `Please Enter LibNo`
3. MobileNo not empty and (length ≠ 10 or not numeric) → `Please Enter MobileNo in Proper Format(10 digit)`
4. `SearcherKt = 0` → `Please Enter Searcher`

(A commented-out `Please Enter SlipNo` rule exists. Slip is optional.)

## F2 lookups

All of these are `clsCom.DisplayListForm(txt, "<SQL>", , , , , , True, , dtT)`, with
`boolSelectFirst = True`.

| Box                              | SQL (verbatim) and what happens after                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LibNo** `txtentrcodekt`        | `SELECT Tid,LibNo,BookMastKm,LTRIM(RTRIM(BookM.BookName + ' ' + ISNULL(BookM.Part,''))) AS BookName from BookT INNER JOIN BookM ON BookMastkm=BookMastkt INNER JOIN bookmast ON BookT.SeriesKt=bookmast.bookcodekm WHERE ((bookmast.bookprefix = 'M0') OR (bookmast.bookprefix NOT IN('OB','EB','SN','WB','YB','HY') AND tid NOT IN (SELECT entrcodekt FROM issuetran WHERE ISNULL(returned,0) = 0)))`. So **M0** numbers are always offered, even when already issued. OB/EB/SN/WB/YB/HY are never offered. Everything else is offered only when not currently issued (lost-but-unreturned counts as issued). BookT rows with no series are dropped by the INNER JOIN. After a pick: (1) `SELECT COUNT(LabIssueMkm) FROM LabIssueM WHERE BookTKt=<tid> AND Type='Book' AND Statuskt IN(9635,9637)` > 0 (9635 DlvrPen, 9637 RetPen) → **"LibNo is Used in LabIssue"**, box cleared. (2) `frmBookTranNew.IsFirstBook(tid)` → **"LibNo is Used in Kruti Main Book" + vbCrLf + "Do you want to issue?"** Yes/No; No clears the box. (3) Book Name box = `BookName`, Tag = `BookMastKm`. IsFirstBook SQL: `SELECT COUNT(*) From krutireflibno KR INNER JOIN KrutiSampradayT KS ON KR.krutimstkt=KS.KrutimstKt INNER JOIN columnmaster KSc ON KS.SampradayKt=KSc.ColumnMastkm AND ksc.Remark=N'प्रथम पुस्तक' INNER JOIN columnmaster KRc ON KR.ktypeid=krc.ColumnMastkm AND KRc.Name=N'मुद्रित गी.गं भंडारनुं प्रथम पुस्तक' WHERE BookTKt=<tid>` (`Library/Library/frmBookTranNew.vb:1784`) |
| **Patrika** `txtPatrikaKt`       | `select Patrikakm,RecordNo from Patrika ORDER BY RecordNo`. Then `SELECT COUNT(LabIssueMkm) FROM LabIssueM WHERE BookTKt=<patrikakm> AND Type='Patrika' AND Statuskt IN(9635,9637)` > 0 → **"LibNo is Used in LabIssue"**, box cleared. There are no issued / series exclusions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Party** `txtparty_cokt`        | `select partyMkm,PName,(SELECT TOP(1) MobileNo FROM PrakMAddT WHERE ISNULL(MobileNo,'')<>'' AND partyMkt=p.partyMkm)MobileNo,txtAddress,v1.SampradayName sampraday ,v2.Vishesh guru , v3.Vishesh catagory,isnull(Mrecno,0) Mrecno,p.refrence,(SELECT isnull(sum(creditamt)-sum(debitamt),0) from PartyDepositT where PartyMKt=P.PartyMKm) AS ClosingBalance,CAST(ISNULL(p.IsBlocked,0) AS INT) AS IsBlocked from PartyM p left outer join Sampraday v1 on v1.SampradayKm=p.Sampradaykt left outer join visheshMast v2 on v2.tid=p.Gurukt left outer join visheshMast v3 on v3.tid=p.Categorykt ORDER BY PName`. Blocked party → MsgBox **"Party is Blocked"**, title **"Cannot Issue Book"**, then **Cancel + reselect the grid row** (the whole Add is abandoned). Otherwise it counts six-month-old books and lost books (both SQLs below). `cnt > 0` → **"You have (n) six Months Old Book." + vbCrLf + "Continue Issue Book?"** Yes/No. Else `cntLost > 0` → **"You Lost (n) Books." + vbCrLf + "Continue Issue Book?"**. No → Cancel + reselect the row. Yes (or no warning) → Party Address = `txtAddress`, Mobile = `MobileNo` when not empty, Cur Balance = `ClosingBalance`                                                                                                                                                                                                                                                                                                   |
| **Ref Party** `txtRef_partykt`   | Same SQL without the MobileNo and ClosingBalance columns. Blocked → **"Ref Party is Blocked"** / "Cannot Issue Book". The same six-month / lost prompts, counted for the ref party. Yes → Ref Address = `txtAddress`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Mobile** `txtMobileNo`         | `select  MobileNo from PrakMAddT where partyMkt=<party tag>`. With no party chosen this is a SQL syntax error, shown as a MsgBox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Party Address** `txtparty_add` | `SELECT address FROM PrakMAddT WHERE partyMkt=<party tag> AND ISNULL(address,'')<>''`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Slip** `txtslipno`             | First a list `SELECT 'J' AS SlipNo UNION SELECT 'R' AS SlipNo UNION SELECT 'D' AS SlipNo`. Then box = `"<letter> <n> "` (trimmed on save), where n = `SELECT ISNULL(MAX(CAST(SUBSTRING(slipno,3,LEN(slipno)-1) AS INTEGER)),0)+1 FROM IssueTran WHERE slipno LIKE '<letter> %'`. Today that gives J 16744, R 11416, D 12518                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| everything else                  | `select isnull(F2EntryText,'') F2EntryText,ISNULL(AddTableInfo,'') AS AddTableInfo from tblSearch where TransactionName='IssueTran' and (ColumnName='<box name minus txt>' or ColumnName='<…minus Name>')` → that list (rows below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Six-month and lost counts. Both use `<id>` for party _or_ ref party:

```sql
SELECT COUNT(*) FROM issuetran INNER JOIN columnmaster ON issuetran.ConfmMarkkt = columnmaster.ColumnMastkm
WHERE (issuetran.party_cokt=<id> OR issuetran.Ref_partykt=<id>) AND ISNULL(returned,0)=0
  AND columnmaster.Name NOT LIKE 'lost%' AND DATEDIFF(MONTH,due_date,GETDATE())>6
SELECT COUNT(*) FROM IssueTran INNER JOIN columnmaster ON IssueTran.ConfmMarkkt=columnmaster.ColumnMastkm
WHERE columnmaster.Name like 'Lost%' AND (issuetran.party_cokt=<id> OR issuetran.Ref_partykt=<id>)
```

Because of the INNER JOIN, a row with no Confirm Mark never counts as six months old. Today
that is 6,719 of the 6,945 open rows (see the open questions). The lost count includes
_returned_ lost rows.

tblSearch F2 lists (`F2EntryText`, verbatim):

- ConfmMarkkt: `select c.ColumnMastkm,c.Name,c.Brief,c.Remark,c.HindiWord from columnmaster as c where  c.Vibhag ='isue_confirm' order by c.Name`.
  Today it has ten marks, seven of them "Lost …", plus Renew, Transfer to Another Name, and
  Yes book With Party.
- ConfmBykt: `… where Vibhag ='DoneBy' order by Name`
- CostBearBykt: `… Vibhag ='isue_costpaid_by'`
- receivedFromKt: `… Vibhag ='isue_rcvd_from'`
- replacebykt: `… Vibhag ='isue_replby'`
- SearcherKt: `select tid,uname from Usecurity order by uname`
- ActionReport / ConfmReport: `select <col> from IssueTran where isnull(<col>,'')<>'' group by <col> order by <col>`
- issue_no: the same pattern. It reaches the ReadOnly Old IssueNo box (see the bugs section).
- PatrikaKt: overridden by the inline list.
- Remark: tblSearch's column is `IssueTran.remark`, so no row matches (see the bugs section).

MaskedTextBoxes and DateTimePickers have no F2.

## Grid columns

The grid is **hard-coded in the Designer**: `dgMain` binds to named columns of the
`GetDataTable` result. `AutoGenerateColumns = False`, FullRowSelect, MultiSelect (the default),
ReadOnly, no row headers, `AllowUserToOrderColumns`. The header style is LightSteelBlue
background, **DarkRed** text, Arial Unicode MS 9 pt, wrap, height 25. Rows use Verdana 12 pt,
height 24, grid colour LightSteelBlue, selection RGB(10,36,106) on white.

| #   | Header           | Field           | Width |                           |
| --- | ---------------- | --------------- | ----- | ------------------------- |
| 0   | IssuTranKm (sic) | `IssueTranKm`   | 90    |                           |
| 1   | entrcodekt       | `entrcodekt`    | —     | hidden                    |
| 2   | LibNo            | `entrcodeName`  | 120   |                           |
| 3   | Ank              | `AnkNo`         | 80    |                           |
| 4   | Party_Cokt       | `Party_Cokt`    | —     | hidden                    |
| 5   | Party Name       | `party_coName`  | 270   | ForeColor rule below      |
| 6   | Party Category   | `PartyCategory` | 150   | tblSearch Type T subquery |
| 7   | Cur Balance      | `DepositTran`   | 100   | tblSearch Type T subquery |
| 8   | SlipNo           | `slipno`        | 130   |                           |
| 9   | Issue Date       | `issue_date`    | 110   |                           |
| 10  | MobileNo         | `MobileNo`      | 100   |                           |
| 11  | Returned         | `returned`      | 100   |                           |
| 12  | ReturnDate       | `returndate`    | 120   |                           |
| 13  | Ref_Partykt      | `Ref_Partykt`   | —     | hidden                    |
| 14  | Confirm Mark     | `ConfmMarkName` | 100   |                           |

- **Order:** `IssueTranKm DESC`, all rows (no `TotRecords`).
- **Default condition:** `DefaultWhereCond = " And ISNULL(Returned,0)=0 AND ISNULL(ConMark.Name,'') Not Like 'Lost%'"`.
  It needs the form's `JoinCond = " LEFT JOIN ColumnMaster AS ConMark ON ConMark.ColumnMastKm=IssueTran.ConfmMarkkt"`.
  The join is passed to the list **and to the record query** (`GetDataTableById(…, JoinCond)`),
  because tblSearch's ConfmMarkkt JoinCondition is `ConMark.Name AS ConfmMarkName`.
  `UcSearch1.LoadData(…, Cond)` gets the default, so searches stay inside it.
- **Row colour (`dgMain_CellFormatting`, column 5 only):** Party Name is DarkRed when this row's
  Confirm Mark contains "lost", **or** the party / ref party has any unreturned lost row:
  `SELECT COUNT(*) FROM IssueTran INNER JOIN columnmaster ON IssueTran.ConfmMarkkt=columnmaster.ColumnMastkm WHERE ISNULL(IssueTran.returned,0)=0 AND columnmaster.Name like 'Lost%' AND (issuetran.party_cokt=<party> OR issuetran.Ref_partykt = CASE WHEN <ref>=0 THEN -1 ELSE <ref> END)`.
  Otherwise it is Black. The desktop runs this per painted cell. The web should compute it once
  per list (a `decorateList` column) and use `rowTextColor`.
- tblSearch `IssueTran` has 46 Type M/T rows for the select and search. Type T rows 680
  (Party Category) and 679 (DepositTran) carry JoinConditions. DepositTran has an F2EntryText
  with `{Id}` (a deposit ledger), but no box on this form opens it. Rows 47–78 (BookName, Part,
  … DueLibNoWithBook) are Type T with no ColumnName and are not used here.
- **Search box specials** (`Txt_KeyDown` on `txtsearch`, F2):
  - Search By **"Return Date"**: InputBox `Please Enter Range in dd/MM/yyyy HH:mm:ss Format(Ex.:- (01/12/2015 00:00:00 - 31/12/2015 23:00:00)`,
    default `<today> 00:00:00 - <today> 23:00:00`. Not two parts split by "-" →
    `Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015 00:00:00 - 31/12/2015 23:00:00)`.
    Otherwise the grid shows `returndate BETWEEN from AND to` with the default condition
    switched off.
  - Search By **"Returned"**: a list `SELECT 0 AS Id,0 AS Returned UNION SELECT 1 AS Id,1 As Returned`,
    then `WhereCondition = " AND Returned=<pick>"` (this replaces the default, so lost rows
    show), then `WhereCondition = DefaultWhereCond`.
- Ctrl+F opens a picker of searchable columns
  (`SELECT Id,DisplayName FROM tblSearch where TransactionName='IssueTran' and IsSearchable=1 order by seq`).

## Derived values

- **`GetMaxIssueNo`**: `VLDIGIT = Select MAX((right(issue_no,9)))+1 From IssueTran`, then
  `"I" + VLDIGIT zero-padded to 9` (e.g. `I000138727`). The max is a _string_ max of the last 9
  characters. When VLDIGIT has more than 9 digits the result is `""`. It runs at New and again
  after each "continue adding" save, and the box's text is what gets saved. It is not
  recomputed in the transaction, so two users can save the same number (4 duplicates exist).
  The web should compute it inside the save transaction when `id = 0`, and use `newDefaults`
  for the display.
- **Slip number**: the F2 generator above. This is not "continue adding": continue simply
  keeps the box text.
- **Due date**: Issue + 90, or Issue + 3 with Adey (Add mode).
- **Save values**: dates are written as `MM-dd-yyyy` strings. Masked dates are parsed as
  dd/MM/yyyy only when `MaskCompleted`, else NULL. `Returned = "Yes"` → `returned = 1`,
  `Locked = 1`; otherwise both 0. `enuser`/`endate = getdate()` on insert,
  `moduser`/`moddate = getdate()` on update. IDs and numbers go through `Val()`.

## Save (`IssueTranRepository.Save`)

The INSERT and the UPDATE are single statements in a transaction.

- **INSERT** columns: issue_no, issue_date, returned, due_date, party_cokt, entrcodekt,
  MobileNo, slipno, ConfmMarkkt, ConfmReport, ConfmBykt, replacebykt, ActionReport,
  receivedFromKt, CostBearBykt, Amout, Ref_partykt, remark, enuser, endate=getdate(), Locked,
  party_add, BookMastkt, SearcherKt, Adey, AnkNo, PatrikaKt, returndate|NULL, Confmdt|NULL,
  ActionDt|NULL. Then `SELECT @@identity`.
- **UPDATE**: the same columns (moduser/moddate instead of enuser/endate). The three dates are
  set to the value or NULL. It does **not** touch `Receiverkt`.
- **After an Add**:
  1. "Record Saved Successfully".
  2. The new row is inserted at the top of the grid.
  3. **"Do You Want to Continue With Add New Record?"** Yes/No.
  4. **Yes ("continue adding")**: `ReadOnlyControls(False)` _disables_ Party, addresses, Ref,
     Mobile, Slip, dates, the confirm / action / amount / remark boxes. New Old IssueNo; LibNo,
     Book Name and Patrika are cleared; focus goes to LibNo. Still enabled: LibNo, Patrika, Ank,
     Searcher, Adey, Returned / Return Date. So the next row keeps the party, ref, address,
     mobile, slip, dates and searcher.
  5. **No**: the new row is selected and the mode is Edit.
- **After an Edit**:
  1. "Record Saved Successfully".
  2. `clsCom1.insertworkreports(TransactionName, PrimaryColumn, id, curr_lnid, dtSel, dtTmpSel)`.
     The work report logs **Edit only**: Add and Delete never log (`workReportOn: { add: false, delete: false }`).
  3. When `party_cokt` or `Ref_partykt` changed: **`UpdateSameSlipRecords(slipno, id, party, ref)`**
     runs `SELECT ISNULL(STUFF(( SELECT ',' + CAST(IssueTranKm AS VARCHAR) FROM IssueTran WHERE slipno =N'<slip>' AND IssueTranKm<><id> FOR XML PATH('')),1,1,''),0)`,
     then `Update IssueTran SET party_cokt=@party_cokt,Ref_partykt=@Ref_partykt WHERE IssueTranKm IN(<ids>)`.
     When c > 0: **"(c) Records updated for SlipNo -<slip>"**. These copies are not
     work-reported and do not change moduser.
  4. The grid row is refreshed.
- There are no child tables and no F2 popups (frmDisplayTransNew). Copy (`btnCopy_Click`)
  asks "Do You Want to Add More With Copying Data?" and on Yes switches to Add with the panel
  as is.

## Delete

Confirm **"Are You Sure to Delete This Record?"** → Security password (`InputBoxProc()`) → plain
`DELETE` of the current row → "Record Deleted " (Information). There is no CheckInUse and no
work report.

## Right-click menu (`cntMenu`)

| Item                                             | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column                   | engine's `PrintSelectedColumn` (with JoinCond). Config_Master `IssueTran` has 13 layouts, none with a ShortcutKey, so none are menu items of their own                                                                                                                                                                                                                                                                                                                                                            |
| Print Report › Send To Excel                     | engine's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Print Report › Issue Slip › **All**              | `PrintIssueSlip(False)`, see Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Print Report › Issue Slip › **Issue Only**       | `PrintIssueSlip(True)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Send To › BookM                                  | `select ISNULL(STUFF((SELECT ',' + CAST(BookMastkt AS VARCHAR) from BookT where tid in (<selected entrcodekt>) for XML PATH('')),1,1,''),0)` → `book-master` with those ids; "0" → **"No Record Found"**                                                                                                                                                                                                                                                                                                          |
| Send To › BookT                                  | the selected rows' `entrcodekt` that exist in BookT → frmBookTranNew dialog (`strTid`) → web `BookTranDialog`; "No Record Found"                                                                                                                                                                                                                                                                                                                                                                                  |
| Send To › PartyMaster                            | **"Only Party(Press Yes)" / "Only Ref Party(Press No)" / "Both Party And Ref Party(Press Cancel)"** (YesNoCancel), then the selected rows' party ids, ref ids or both → `party-master` (it opens even with no ids)                                                                                                                                                                                                                                                                                                |
| Utility › **Return Selected Record** (F6)        | **"Are You Sure To Return Selected Records?"** → for each selected id `Update IssueTran SET returndate=getdate(),returned=1,Locked=1,Receiverkt=@Receiverkt WHERE IssueTranKm=@IssueTranKm and returned=0` (Receiverkt = current user) → **"<n> Records Returned Successfully"** (n = number selected). The grid is not refreshed                                                                                                                                                                                 |
| Utility › Show All Records                       | `FillList(False)`: no default condition, so every row (138k). The web should page or limit this (see the hints)                                                                                                                                                                                                                                                                                                                                                                                                   |
| Utility › Show Lost Books                        | default replaced by `" AND ISNULL(ConMark.Name,'') Like 'Lost%'"` (returned or not)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Utility › Show Issued Books Having Single Copy   | default replaced by `" AND Returned<>1 AND BookMastKt in (SELECT BookMastkm FROM BookM INNER JOIN IssueTran ON BookM.BookMastkm=IssueTran.BookMastKt WHERE returned<>1 AND LEN(txtBookTran)-LEN(REPLACE(txtBookTran,',',''))+1=1)"`                                                                                                                                                                                                                                                                               |
| Utility › Show Issued Books Having Multiple Copy | default replaced by `" AND Returned<>1 AND BookMastKt in (SELECT BookMastkm FROM BookM INNER JOIN IssueTran IT ON BookM.BookMastkm=IT.BookMastKt WHERE returned<>1 AND LEN(txtBookTran)-LEN(REPLACE(txtBookTran,',',''))>1 AND LEN(txtBookTran)-LEN(REPLACE(txtBookTran,',',''))+1=(SELECT COUNT(*) FROM IssueTran WHERE returned<>1 AND BookMastkt=IT.BookMastKt))"`. In practice this means books with **3 or more** LibNos (`BookM.txtBookTran` holds 2+ commas) whose **every** copy is out. Keep it verbatim |
| Utility › **Replace LibNo For Selected Records** | `InputBoxProc("vis123")` (see Permissions) → list `SELECT Tid,LibNo,BookMastKm,BookName from BookT INNER JOIN BookM ON BookMastkm=BookMastkt WHERE ISNULL(BookT.Libno,'')<>'' ORDER BY Libno` (no issued / series / lab exclusions). For each selected row: `GetDataById` → set entrcodekt, BookMastKt → `Save(Ent)` → **"(n) Records Updated Successfully"**. It is data-corrupting (see the bugs section)                                                                                                       |

The toolbar is the standard frmMasterPage one (New, Save, Modify, Cancel, Delete, Copy, Work
Report, Refresh, Help, Exit; Ctrl+N/S/M/B/D/W/R, Ctrl+Z/Y prev/next). Help opens the
`RefrenceT` rows of `columnmaster Vibhag='HelpFormName' AND Name='IssueTran'` in a ReferenceT1
popup, which the web toolbar does not implement yet. Exit while editing asks "Are you sure to
close this form?" / "Record cannot be saved".

## Reports and printing: `IssueSlipReport.rpt`

`PrintIssueSlip(PrintIssueOnly)` creates the typed `IssueSlipReport`, sets **three
parameters** and shows it in `frmReport` (a CrystalReportViewer MDI child):

- `SlipNo` = current row's SlipNo cell
- `IssueTranKm` = current row's id
- `PrintIssueOnly` = `True` for "Issue Only", `False` for "All"

`frmReport` logs every report table on with server/DB from `sqlpath.txt` and the **hard-coded SQL
login `lib` / `lib123456`**. So the report runs its **own SQL** against the DB, and no dataset is
pushed. The `IssueSlip` table in `CommonClass/DBLibSQLDataSet.xsd` belongs to the older
`IssueSlipReportOld.rpt`, whose wrapper has only the `SlipNo` parameter.

**What could be read from the .rpt.** I parsed the OLE compound file. Its report-definition
streams (`Contents`, `DataSourceManager`, `QESession`, `PromptManager`,
`ReportParametersStream`) are **encrypted or compressed by Crystal**, with uniform byte
distribution and no zlib. The SQL command, the record selection formula and the text objects
**cannot be recovered on Linux without Crystal Reports**. What is certain:

- There are 5 sections (`Section1`–`Section5`: Report Header, Page Header, Details, Report
  Footer, Page Footer, in Crystal's default order) and the 3 parameters above.
- There is one embedded picture, stored twice (`Embedding 3` and `Embedding 4`, identical): a
  160×103 24-bit BMP of the **"गीतार्थ गंगा" logo** (a stylised eye/drop emblem on the left,
  "गीतार्थ / गंगा" in black Devanagari on the right, white background). Two identical OLE
  embeddings usually mean the logo is placed twice. Most likely the slip is printed in two
  copies on one page (library copy and party copy), each with its header. **This is an
  inference.**
- To extract the logo, read the `Embedding 3/CONTENTS` stream of the .rpt (a plain `BM` file,
  49,494 bytes) and save it as `apps/web/public/legacy/issue-slip-logo.png`. It is not in
  `public/legacy/` yet.

**Proposed HTML reconstruction.** This is inferred from the parameters, the old dataset's fields
and the form. It must be confirmed against a real printout (see the open questions).

- **Data:** the rows of the slip.

  ```sql
  SELECT it.IssueTranKm, it.issue_no, it.issue_date, it.due_date, it.slipno,
         p.PName AS PartyName,
         COALESCE(NULLIF(LTRIM(RTRIM(it.party_add)),''), p.txtAddress) AS PartyAdd,
         LTRIM(RTRIM(it.MobileNo)) AS MobileNo,
         rp.PName AS RefPartyName, rp.txtAddress AS RefAdd,
         bt.LibNo, LTRIM(RTRIM(bm.BookName + ' ' + ISNULL(bm.Part,''))) AS BookName,
         it.AnkNo, pt.RecordNo AS PatrikaNo, it.returned, it.returndate,
         u.uname AS Searcher, it.Adey
  FROM IssueTran it
  LEFT JOIN PartyM p  ON p.partyMkm  = it.party_cokt
  LEFT JOIN PartyM rp ON rp.partyMkm = it.Ref_partykt
  LEFT JOIN BookT bt  ON bt.Tid      = it.entrcodekt
  LEFT JOIN BookM bm  ON bm.BookMastkm = it.BookMastkt
  LEFT JOIN Patrika pt ON pt.Patrikakm = it.PatrikaKt
  LEFT JOIN Usecurity u ON u.tid = it.SearcherKt
  WHERE (CASE WHEN ISNULL(@SlipNo,'') = '' THEN CASE WHEN it.IssueTranKm = @IssueTranKm THEN 1 END
              WHEN it.slipno = @SlipNo THEN 1 END) = 1
    AND (@PrintIssueOnly = 0 OR ISNULL(it.returned,0) = 0)
  ORDER BY it.IssueTranKm
  ```

  Why `IssueTranKm` is a parameter: 20,564 rows have no slip (19,249 NULL, 1,315 empty), so a
  slip-less row must print alone.

- **Header** (once per copy): logo at the left; "गीतार्थ गंगा" title; caption "Issue Slip";
  Slip No; Issue Date and Due Date (`dd-MM-yyyy`); Party Name, Party Address, Mobile No; Ref
  Party and its address when present.
- **Details:** one line per row. Columns: Sr, LibNo (or Patrika RecordNo when there is no
  LibNo), Book Name (with Part), Ank No. In the "All" mode it also shows the Returned status
  and Return Date.
- **Footer:** item count, Searcher, signature lines (party / library).
- "Issue Only" prints only the slip's unreturned rows. "All" prints every row of the slip.
- Gujarati/Devanagari text needs a Unicode font (the grid uses Arial Unicode MS). Use
  `@media print` like `PrintSelectedColumnDialog` does.

## Permissions

- The menu has no rule, so everyone who can log in sees it.
- `EnableDisableDataEditing` is the standard one, with `DataEditingInfo` edit locks. A row with
  `Locked = 1` (every returned row) gets the Locked toolbar: New and Refresh only.
- Ctrl+L / Ctrl+U and Delete take the Security password (`SECURITY_PASSWORD` /
  `SECURITY_PASSWORD_ALT`).
- **Replace LibNo** calls `InputBoxProc("vis123")`. `frmDeleteList` accepts either its first
  password (`vis123`) **or** the default second one (`MdlLib.vb:344`, the same as
  `SECURITY_PASSWORD_ALT`). On the web this becomes
  `ctx.assertPassword(ctx.params.password, ctx.env.ISSUE_REPLACE_PASSWORD ?? '')`, with a new
  optional `ISSUE_REPLACE_PASSWORD` in `config/env.ts` and `.env.example`, the same way
  `KRUTI_LOCK_PASSWORD` is done.
- `frmReport.vb` hard-codes the SQL login `lib` / `lib123456` for every Crystal report. This is
  not relevant to the web, which uses its own connection, but it is worth flagging.

## Desktop bugs

- **Data-corrupting: Replace LibNo rewrites the whole row from `GetDataById`.** The web fix:
  `UPDATE IssueTran SET entrcodekt=@tid, BookMastkt=@bm, moduser=@user, moddate=GETDATE() WHERE IssueTranKm IN (…)`,
  in one transaction. What the round-trip does today:
  - `issue_no = Val("I000…") = 0`, which saves `"0"`. **844 rows** in the DB have
    `issue_no = '0'`.
  - `Adey = Val("True") = 0`, which clears Adey.
  - `MobileNo = Val(…)`, which saves `"0"` when blank.
  - `Locked` is never read, so it saves 0 and **unlocks returned rows**.
  - Dates go through `Convert.ToString(DateTime)` strings (the locale day/month risk).
  - `moduser` keeps the previous modifier.
  - There is no work report.
- **Data-corrupting: `UpdateSameSlipRecords` with an empty slip.** `WHERE slipno = N''` matches
  every slip-less row (1,315 today). Changing the party of one slip-less row reassigns them
  all. A NULL slip throws instead, after the save. The slip is also concatenated into the SQL,
  so a `'` breaks it. Fix: skip when the slip is blank, and bind it as a parameter.
- **Data-corrupting (minor): F2 ignores ReadOnly.** Old IssueNo (ReadOnly) still opens the
  tblSearch `issue_no` list and takes an existing number, which saves a duplicate. Likewise
  LibNo, Party and Slip on a record older than a day. Fix: no F2 on read-only boxes.
- **Throws (harmless): F2 on Remark.** tblSearch's column is `IssueTran.remark`, so
  `dtT.Rows(0)` → "There is no row at position 0." Web: no F2 on Remark (or bind the `remark`
  list deliberately).
- **Throws (harmless): cancelling the LibNo / Patrika F2** while the box holds text →
  "There is no row at position 0." Mobile / Party Address F2 with no party → SQL error.
- **Harmless quirk: Return Selected's message.** It shows the number _selected_, and only if
  the _last_ UPDATE hit a row. Rows with `returned` NULL are skipped (`returned=0`), and the grid
  is not refreshed. Web: report the real count and return the refreshed rows (`kind: 'list'`).
- **Harmless quirk:** changing the Issue Date resets Due to +90 even when Adey is checked.
- **Harmless quirk: the "Returned" search** resets `WhereCondition` to the default afterwards,
  which loses an opener's id filter.
- **Harmless quirk:** `GetMaxIssueNo` is not concurrency-safe (see Derived values).
- **Performance:** the row colour runs one query per painted Party Name cell, and Show All
  loads 138k rows.

## Files and disk

None. The form touches no files or images. The .rpt logo is an embedded resource.

## Implementation hints

- **API** `apps/api/src/master/screens/issue.ts`:
  - `table: 'IssueTran'`, `primaryColumn: 'IssueTranKm'`, `lockable: true`.
  - `listJoin` = the ConMark LEFT JOIN, and
    `defaultCondition: sql\`ISNULL(Returned,0)=0 AND ISNULL(ConMark.Name,'') NOT LIKE 'Lost%'\``.
  - `workReport: true`, `workReportOn: { add: false, delete: false }`.
  - `validate` with the four messages; `save` with the INSERT/UPDATE above. On Edit, run the
    fixed `UpdateSameSlipRecords` in the same transaction and return the count for the
    message.
  - `newDefaults` → `{ issue_no, SearcherKt/SearcherName, issue_date, due_date }`.
- **`f2` overrides:** `txtentrcodekt`, `txtpatrikakt`, `txtparty_cokt`, `txtref_partykt`,
  `txtmobileno` / `txtparty_add` (params: party), `txtslipno` (params: letter).
  The post-pick checks (lab issue, Kruti first book, blocked, six-month, lost) should be one
  `lists`/`actions` call that returns the counts. The client then asks the Yes/No questions
  (`afterPick`).
- **`actions`:**
  - `return-selected`
  - `replace-libno` (params: password, tid)
  - `show-all`, `show-lost`, `show-single-copy`, `show-multi-copy` → `ctx.list(sql\`…\`)`
  - `send-bookm`, `send-bookt`, `send-party` (params: which) → `kind: 'open'`
  - `search-return-date` (from, to), `search-returned` (0/1)
- **`decorateList`:** add a `HasLost` flag for the row colour with **one** grouped query. The
  web's `rowTextColor` reads it (column 5 only, so the colour applies to the Party Name cell,
  not the whole row).
- **Engine gaps:**
  1. **The record query has no join.** `master.service.ts` `record()` calls `select(..., grid=false)`,
     so `ConMark.Name AS ConfmMarkName` fails. The engine needs `listJoin` applied to the record
     query too (a `recordJoin` flag), or a `recordExtras` that supplies `ConfmMarkName` while
     the tblSearch column is skipped.
  2. **Continue adding after Save:** no `ScreenSpec` hook asks "Do You Want to Continue With
     Add New Record?" and keeps the panel with some boxes disabled and others cleared. It
     needs an `afterAdd` hook, or an extension of `afterSave` with `ctx`.
  3. **Record-dependent read-only** (the `endate` 1-day rule) and per-mode enabling
     (Return Date ↔ Returned, Confirm Date ↔ Confirm By, Action Date ↔ Replace By).
     `disabledColumn` / `onFieldLeave` cover part of this. The rule needs something like
     `readOnlyWhen(row)`.
  4. **`FormContext` has `alert` but no `confirm`** for the F2 Yes/No prompts (Kruti main book,
     six-month, lost). On No, the form cancels the whole Add.
  5. **Search-box F2 specials** (Return Date range InputBox, Returned 0/1). `searchOverrides`
     is close (values + where), but the range needs an input prompt.
  6. **Issue Slip print view:** there is no report engine yet. It needs a new
     `GET /master/issue-master/slip?id=&issueOnly=` (or an action returning rows) and a printable
     HTML page / window.
  7. **Show All Records** returns about 138k rows. Check that the grid copes, or page it.
- **Web UI** `apps/web/src/screens/IssueMaster.tsx`: `panelHeight: 344`, `panelWidth: 1008`,
  the 15 hard-coded `columns` above, `lockedColumns: ['Locked']`, `entryLabel: true`, and a
  `contextMenu` with the items above.

## Open questions for the user

1. **Issue Slip layout:** the .rpt cannot be decoded here. Could someone open
   `IssueSlipReport.rpt` in Crystal Reports on Windows and send three things?
   - Database › Show SQL Query
   - Report › Selection Formulas › Record
   - one PDF export or a photo of a printed slip, in each mode

   Until then the HTML slip follows the inferred layout above.

2. **The six-month warning** ignores rows with no Confirm Mark (INNER JOIN), which is 97% of
   open issues. Keep that (desktop parity), or count them (LEFT JOIN)?
3. **Replace LibNo:** confirm that the fixed web version should change only LibNo and Book
   (not reset issue_no, Adey, Mobile or Locked). Should the 844 existing `issue_no = '0'` rows
   be left alone?

## Web port (2026-10-08)

Files: `apps/api/src/master/screens/issue.ts` (ScreenDefinition `issue-master`),
`packages/shared/src/issue.ts` (the one-day rule and the Party Name colour, shared by both
sides), `apps/web/src/screens/IssueMaster.tsx`. Tests: `apps/api/test/master-issue.integration.test.ts`,
the "Issue Master" test in `apps/web/e2e/batch-d.spec.ts`. Env: `ISSUE_REPLACE_PASSWORD`
(desktop value `vis123`; the second Security password is accepted too, as on the desktop).

### What was ported

- Panel, grid (the 15 Designer columns, Issue Date / ReturnDate as dd-MM-yyyy), toolbar,
  entry label, Locked toolbar for returned rows (`lockedColumns`), Ctrl+L / Ctrl+U, Delete with
  the Security password (no work report), work report on Edit only.
- The ConMark join on the grid, the search, the menu lists **and the record query**
  (new engine option `recordJoin`), so `ConfmMarkName` loads.
- The default condition (open, not lost), and the 10,000-row cap (`listLimit`) for the grid and
  Show All Records.
- Validation (the four messages verbatim), Save's "Return 6 Month Old Book." question
  (`saveQuestion`, Confirm-Mark-only count as on the desktop — **flagged**: rows with no Confirm
  Mark never count), the INSERT / UPDATE, `Locked = returned`.
- F2 lists: LibNo (with the lab-issue and Kruti-main-book checks), Patrika (lab-issue check),
  Party / Ref Party (blocked → Cancel + reload the row; six-month and lost prompts; address,
  mobile, balance), Mobile and Party Address (by party), the slip generator, the tblSearch
  lists for the other Kt / report boxes.
- "Do You Want to Continue With Add New Record?" (`continueAdding`): Yes keeps party, ref,
  address, mobile, slip (the number the server assigned), dates, searcher; clears LibNo, Book,
  Patrika; takes a new Old IssueNo; disables the boxes ReadOnlyControls(False) disables.
- The one-day rule (`readOnlyWhen` / `disabledWhen`), Return Date ↔ Returned, Confirm Date ↔
  Confirm By, Action Date ↔ Replace By, Due = Issue + 90 / Adey + 3 (Add mode).
- Right-click: Print Report › Selected Column (+ layouts) / Send To Excel / Issue Slip › All /
  Issue Only; Send To › BookM / BookT (Library No dialog) / PartyMaster (Yes/No/Cancel); Utility ›
  Return Selected Record (F6), Show All Records, Show Lost Books, Show Issued Books Having Single
  / Multiple Copy, Replace LibNo For Selected Records.
- Search By "Return Date" (range InputBox) and "Returned" (0/1 list) on F2 (`searchF2`), both
  without the default condition, as on the desktop.
- Party Name DarkRed for lost books: one grouped query per list (`decorateList` → `HasLost`),
  applied to that cell only (`GridColumnSpec.textColor`).

### Issue Slip print (PROVISIONAL)

`IssueSlipReport.rpt` is Crystal-encrypted. The `print-slip` action builds a plain A4 page from
the query proposed above (the current row's slip, or the row alone when it has no slip; "Issue
Only" leaves out returned rows), with the Geetarth Ganga logo already extracted for the letters
(`public/legacy/report-logo.png`, the same emblem), header (Slip No, Issue Date, Due Date),
party block, numbered item table (LibNo or Patrika No, Book Name, Ank No; "All" adds Returned
and Return Date) and a footer (items, searcher, signature lines). The layout is marked
provisional on screen and in the code, pending a sample printout (open question 1).

### Deliberate differences / desktop bugs fixed

- **IssueNo and a generated slip number are taken inside the save transaction** (UPDLOCK +
  HOLDLOCK). The Old IssueNo box is display-only; Copy no longer saves the copied IssueNo. The
  slip box's generated number is replaced by the next free one at Save (hidden `NewSlip` flag),
  so two users cannot get the same new slip.
- **Replace LibNo changes only `entrcodekt` and `BookMastkt`** (plus moduser / moddate) in one
  UPDATE; the desktop's GetDataById → Save round trip reset issue_no to '0', cleared Adey,
  zeroed a blank Mobile and unlocked returned rows. The 844 existing `issue_no = '0'` rows are
  left alone. It asks for the password first, then the LibNo (desktop order).
- **UpdateSameSlipRecords** runs in the save's transaction, parameterised, and never for a blank
  slip (the desktop reassigned every slip-less row's party).
- **F2 does not open on a ReadOnly box** (Old IssueNo, Receiver, Cur Balance, and the boxes the
  one-day rule makes ReadOnly). The server also refuses an Edit that changes them:
  Ref Party and Slip never change on Edit; Party, LibNo, Book and Patrika not on a record
  entered before yesterday. After an Add answered "No", the web treats the new row as loaded
  (Ref Party ReadOnly, Slip disabled), where the desktop left them editable until a row click.
- No F2 on Remark (the desktop throws) and Mobile / Party Address with no party list nothing
  (the desktop shows an SQL error). Masked dates that are not real dates (31/02) are refused
  with "<box> is not a valid date" (the desktop throws).
- Return Selected reports the rows really returned and refreshes them (the desktop counts the
  selection and does not refresh); nothing is said when none was open.
- Send To › PartyMaster with no ids says "No Record Found" (the desktop opens an empty Party
  Master).
- The LibNo F2 query uses NOT EXISTS instead of the desktop's `tid NOT IN (…)`: the same rows
  (124,710 today), 1.5 s instead of about 2 minutes on the dev server.
- Overlong text (slip 40, party address 550, reports 150, remark 3000, Ank 500) and an Amount
  past Int32 are refused with a message.

### Kept quirks

- The six-month counts use the Confirm Mark INNER JOIN (decision; flagged above).
- Changing the Issue Date resets Due to +90 even with Adey.
- The Show Single / Multiple Copy conditions are verbatim.
- Help (RefrenceT popup of the toolbar) is not on the web toolbar yet (engine-wide).

### Engine extensions made for this screen

- API: `ScreenDefinition.recordJoin`; `save` may return `{ id, message }` (shown after
  "Record Saved Successfully", `SaveResult.message`); `decorateList` now also runs on menu
  lists (`ctx.list`) and search results.
- Web: `FieldSpec.readOnlyWhen` / `disabledWhen`; `FormContext.cancel` / `continued`;
  `ScreenSpec.continueAdding`, `saveQuestion`, `searchF2`; `ScreenActions.input`;
  `GridColumnSpec.textColor`; a CheckBox's change runs `onUserChange`; a date in a
  `00/00/0000` mask loads as dd/MM/yyyy.
