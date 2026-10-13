# Lab Issue Master (`LabIssueM`)

Desktop form: `GGLibrarySolution/Library/Issue/frmLabIssueMaster.vb` (+ `.Designer.vb`, title
"Lab Issue Master", `Inherits frmMasterPage`), repository
`Library.BusinessContract/Concrete/LabIssueMRepository.vb`, entity
`Library.Entity/EntLabIssueM.vb`. Menu: Issue › Lab Issue Master
(`Frmlibmain.LibraryIssueMasterToolStripMenuItem_Click`, MDI child).

Also opened with `StrId` (a list of LabIssueMkm) from:

- Book Master's Library No dialog (frmBookTranNew) › For Current Record › Lab Issue Master
  (`book-tran.ts` action `lab-issue-master` already does this)
- Graphics screens

**Ported 2026-10-07** (see "Web port" at the end). `menu.ts` has
`screen('lab-issue-master', 'Lab Issue Master', 'frmLabIssueMaster')` with no visibility rule.

"Lab issue" is an internal request by a staff user for a library item, which an operator then
delivers and later takes back. The rows are **created mostly outside this form**, by "Request
For LabIssue" in:

- frmBookTranNew (Type `Book`)
- frmPatrika (Type `Patrika`)
- frmHastpratLibNoTran (Type `Hastprat`)
- frmGraphicMaster / frmGraphicsDetail

The repository's `GetValidationMessage` + `GetUserNotReturnedBook` + `Save` are the shared rules
for all of them.

## Table and key

- Table `LabIssueM`, PK `LabIssueMkm` (IDENTITY), **293,620 rows**. No triggers.
- No `Locked` column (`lockable: false`; Ctrl+L / Ctrl+U would fail on the desktop).

| Column                          | Type              | Meaning                                                                                              |
| ------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `BookTKt`                       | int NOT NULL      | the item: `BookT.tid` for Type Book (and Hastprat, see quirks), `Patrika.PatrikaKm` for Type Patrika |
| `Type`                          | varchar(30)       | `Book` / `Patrika` / `Hastprat`. `Save` sets `Book` when empty                                       |
| `enuserKt`                      | int NOT NULL      | requester (`Usecurity.tid`)                                                                          |
| `endate`                        | datetime NOT NULL | request time (`getdate()`)                                                                           |
| `Forkt`                         | int               | "For" party (`PartyM.partyMkm`), 0 = for the requester                                               |
| `moduserKt` / `moddate`         | int / datetime    | last edit                                                                                            |
| `CancelReq`                     | bit               | cancelled                                                                                            |
| `DeliveryBykt` / `DeliveryDt`   | int / datetime    | operator who delivered                                                                               |
| `Transferuserkt` / `TransferDt` | int / datetime    | user who took the request over                                                                       |
| `RetbackBykt` / `RetbackDt`     | int / datetime    | operator who took it back                                                                            |
| `Statuskt`                      | int               | `columnmaster` Vibhag `LabIssueStatus`                                                               |

Status ids (`columnmaster`, looked up by Name at run time, never hard-coded on the desktop):

| ColumnMastkm | Name      | Set by                  | Rows today (Book/Patrika/Hastprat) |
| ------------ | --------- | ----------------------- | ---------------------------------- |
| 9635         | DlvrPen   | `Save` of a new request | 18 / 0 / 0                         |
| 9636         | CancelReq | `CancelReq`             | 13,387 / 36 / 1                    |
| 9637         | RetPen    | `SendDelivery`          | 1,314 / 2 / 0                      |
| 9638         | Closed    | `ReturnBook`            | 278,506 / 355 / 0                  |

Look them up by Name on the web too (`SELECT ColumnMastkm FROM columnmaster WHERE
Vibhag='LabIssueStatus' AND Name=…`).

`GetStatusKt(Ent)` (run by every `Save`, though only an INSERT writes it):

- `DeliveryBykt = 0` → DlvrPen
- delivered and not returned → RetPen
- both → Closed

## Fields

TextBoxes and one CheckBox, Times New Roman 14.25pt, height 29. Panel SplitterDistance
**192**, width 1008. Labels are at x=13 / 370 / 715. Value boxes are at x=136 / 502 / 844.
Most boxes are **Enabled = False** (display only).

| Label (at)                | Box                         | Column / pair                         | Location, size   | Tab | Notes                                      |
| ------------------------- | --------------------------- | ------------------------------------- | ---------------- | --- | ------------------------------------------ |
| "LibNo" (13,22)           | `txtBookTKt`                | `BookTKt` / `BookTName`               | (136,18) 227×29  | 0   | **Editable**. F2 special (below). Required |
| "For" (370,22)            | `txtForkt`                  | `Forkt` / `ForName`                   | (502,18) 195×29  | 34  | **Editable**. F2 tblSearch PartyM          |
| "Status" (715,22)         | `txtStatuskt`               | `Statuskt` / `StatusName`             | (844,18) 158×29  | 35  | disabled                                   |
| "Requested By" (13,62)    | `txtenuserKt`               | `enuserKt` / `enuserName`             | (136,58) 227×29  | 1   | disabled                                   |
| "Delivered By" (370,62)   | `txtDeliveryBykt`           | `DeliveryBykt` / `DeliveryByName`     | (502,58) 195×29  | 6   | disabled                                   |
| "Transfer To" (715,62)    | `txtTransferuserkt`         | `Transferuserkt` / `TransferuserName` | (844,58) 158×29  | 12  | disabled                                   |
| "Request Date" (13,102)   | `txtendate`                 | `endate`                              | (136,98) 227×29  | 2   | disabled. FillData shows `dd-MM-yyyy`      |
| "Deliver Date" (370,102)  | `txtDeliveryDt`             | `DeliveryDt`                          | (502,98) 195×29  | 7   | disabled, `dd-MM-yyyy`                     |
| "Transfer Date" (715,102) | `txtTransferDt`             | `TransferDt`                          | (844,98) 158×29  | 13  | disabled, `dd-MM-yyyy`                     |
| (CheckBox text)           | `chkCancelReq` "Cancel Req" | `CancelReq`                           | (136,142) 116×25 | 38  | disabled. Checked when CancelReq is true   |
| "Return By" (370,146)     | `txtRetbackBykt`            | `RetbackBykt` / `RetbackByName`       | (502,142) 195×29 | 30  | disabled                                   |
| "Return Date" (715,146)   | `txtRetbackDt`              | `RetbackDt`                           | (844,142) 158×29 | 31  | disabled, `dd-MM-yyyy`                     |

FillData rules for the clicked row:

- `DeliveryByKt > 0` → **Delete disabled**, else enabled.
- `RetbackByKt > 0` → `txtBookTKt`, `txtForkt` and **Modify disabled**, else enabled.

`lblEntry` is not set (its line is commented out). At load, the Work Report and Copy buttons
are disabled.

## Validation and save (`Save()`)

"Are You Sure to Save This Record?" → `Ent { LabIssueMkm: TranKm, BookTKt: Tag, BookTName: text,
enuserKt: me, Forkt: txtForkt.Tag }`. `Type` is not set. Then
`GetValidationMessage` (messages verbatim):

1. `BookTKt = 0` → `Please Enter Lib No` (`Please Enter Patrika No` when Type = Patrika, which
   this form never sets).
2. An open request on the same item:

   ```sql
   SELECT CASE WHEN ISNULL(Transferuserkt,0)>0 THEN (SELECT uname FROM Usecurity WHERE tid=LabIssueM.Transferuserkt)
     ELSE (SELECT uname FROM Usecurity WHERE tid=LabIssueM.enuserKt) END
   FROM LabIssueM WHERE BookTKt=@BookTKt AND LabIssueMkm<>@id AND ISNULL(RetbackBykt,0)=0 AND ISNULL(CancelReq,0)=0
   ```

   gives `Patrika No - <BookTName> already Requested For LabIssue By - <uname>`. The desktop
   **swaps** the labels: a non-Patrika type says "Patrika No - ", a Patrika says "Lib No - ".
   Keep them verbatim.

3. Only when Type ≠ `Patrika`:
   `SELECT PartyM.PName FROM IssueTran INNER JOIN PartyM ON IssueTran.party_cokt=PartyM.partyMkm WHERE IssueTran.entrcodekt=@BookTKt AND ISNULL(returned,0)=0`
   gives `LibNo - <BookTName> already Requested For Issue By - <PName>`.
4. If all pass: `GetUserNotReturnedBook(me, Forkt)`.

`GetUserNotReturnedBook(UserKt, Forkt)`. When Forkt > 0:

```sql
SELECT count(L.LabIssueMkm) FROM LabIssueM L INNER JOIN columnmaster C ON L.Statuskt=C.ColumnMastkm
WHERE (L.forkt=@Forkt) AND DATEDIFF(DAY,L.DeliveryDt,GETDATE())>30 AND c.Vibhag='LabIssueStatus' AND c.Name='RetPen'
```

Otherwise:

```sql
... WHERE (L.Transferuserkt=@me OR (L.enuserKt=@me AND isnull(l.Transferuserkt,0)=0 AND isnull(l.forkt,0)=0))
    AND DATEDIFF(DAY,L.DeliveryDt,GETDATE())>30 AND c.Vibhag='LabIssueStatus' AND c.Name='RetPen'
```

When the count n > 0: `You Cannot Issue any Books` + CRLF +
`Please Return<n>  Nos. of 30 days Old Due Books to Issue New Books.` (no space before n, two
after).

`LabIssueMRepository.Save` (not in a transaction):

- **Add**: `INSERT INTO LabIssueM (BookTKt,enuserKt,endate,Forkt,StatusKt,Type) VALUES (@BookTKt,@enuserKt,getdate(),@Forkt,<DlvrPen>,@Type)`.
  Type defaults to `Book`.
- **Edit**: `UPDATE LabIssueM SET BookTKt=@BookTKt,moduserKt=@moduserKt,moddate=getdate(),Forkt=@Forkt WHERE LabIssueMkm=@id`.
  Status, Type and the people/dates are not touched. The form never sets `moduserKt`, so the
  desktop writes **0** (bug, below).

Then "Record Saved Successfully". A new row goes to the top of the grid.

## F2 lookups

- `txtBookTKt`, **Add** mode (`DisplayListForm`, selectFirst):

  ```sql
  SELECT Tid,LibNo,BookName from BookT INNER JOIN BookM ON BookMastkm=BookMastkt
  WHERE ISNULL(Libno,'')<>'' AND tid NOT IN(SELECT BookTKt FROM LabIssueM WHERE ISNULL(LabIssueM.RetbackBykt,0)=0 OR ISNULL(CancelReq,0)=1)
    AND tid not IN(SELECT entrcodekt FROM IssueTran WHERE ISNULL(returned,0)=0) ORDER BY Libno
  ```

  The `OR CancelReq=1` also hides every item that was _ever_ cancelled. That is a desktop quirk:
  keep it, or fix it as "open requests only" (open question).

- `txtBookTKt`, **Edit** mode: the same, restricted to the other copies of the same book:
  `tId = SELECT BookMastkt FROM BookT WHERE tid=<txtBookTKt.Tag>`, then
  `… WHERE BookMastkt=<tId> AND tid NOT IN(…same…) AND tid not IN(…same…) ORDER BY Libno`.
  This is how a request is moved to another copy.
- `txtForkt`: tblSearch `Forkt` F2EntryText `SELECT partyMkm,PName FROM PartyM ORDER BY PName`.
- Disabled boxes cannot take focus, so their tblSearch F2s (Usecurity / status lists) never run.

Both BookTKt lists only cover BookT: you cannot pick a Patrika here (Patrika requests come from
frmPatrika).

## Grid columns

`GetDataTable` with `WhereCondition = DefaultWhereCond & WhereCondition`. Order `LabIssueMkm DESC`.

**Default condition** (`DefaultCond`, also passed to UcSearch, so searches keep it): open rows
only.

```sql
AND (ISNULL(DeliveryBykt,0)=0 OR ISNULL(RetbackBykt,0)=0) AND ISNULL(CancelReq,0)=0
```

That is about 1,334 rows today, against 293k in total.

Designer columns (enum `GvMain`), FullRowSelect, ReadOnly:

| #   | Header         | Width | Data                                                                               | Visible               | Format                            |
| --- | -------------- | ----- | ---------------------------------------------------------------------------------- | --------------------- | --------------------------------- |
| 0   | Id             | 80    | `LabIssueMkm`                                                                      | yes                   |                                   |
| 1   | Type           | 100   | `Type`                                                                             | yes                   |                                   |
| 2   | LibNoKt        |       | `BookTKt`                                                                          | hidden                |                                   |
| 3   | LibNo          | 100   | `BookTName`                                                                        | yes                   |                                   |
| 4   | StatusKt       |       | `StatusKt`                                                                         | hidden                |                                   |
| 5   | Status         | 110   | `StatusName`                                                                       | yes                   |                                   |
| 6   | ReqByKt        |       | `EnUserKt`                                                                         | hidden                |                                   |
| 7   | Request By     | 120   | `EnUserName`                                                                       | yes                   | (`dd-MM-yyyy`, no effect on text) |
| 8   | Request Date   | 125   | `endate`                                                                           | yes                   | `dd-MM-yyyy HH:mm:ss`             |
| 9   | ForKt          |       | `ForKt`                                                                            | hidden                |                                   |
| 10  | For            | 120   | `ForName`                                                                          | yes                   |                                   |
| 11  | Book Name      | 130   | _unbound_ (the mapping is commented out; tblSearch `BookName` has DisplayInGrid=0) | yes, **always empty** |                                   |
| 12  | DeliverByKt    |       | `DeliveryByKt`                                                                     | hidden                |                                   |
| 13  | Deliver By     | 120   | `DeliveryByName`                                                                   | yes                   |                                   |
| 14  | Deliver Date   | 125   | `DeliveryDt`                                                                       | yes                   | `dd-MM-yyyy HH:mm:ss`             |
| 15  | RetByKt        |       | `RetbackByKt`                                                                      | hidden                |                                   |
| 16  | Return By      | 120   | `RetbackByName`                                                                    | yes                   |                                   |
| 17  | Return Date    | 125   | `RetbackDt`                                                                        | yes                   | `dd-MM-yyyy HH:mm:ss`             |
| 18  | Transferuserkt |       | `Transferuserkt`                                                                   | hidden                |                                   |
| 19  | Transfer To    | 120   | `TransferuserName`                                                                 | yes                   |                                   |

Notes on the tblSearch rows (TransactionName `LabIssueM`, all present in the DB):

- `BookTKt` JoinCondition `CASE WHEN Type='Patrika' THEN (SELECT RecordNo FROM Patrika WHERE PatrikaKm=BooktKt) ELSE (SELECT Libno FROM BookT WHERE tid=BooktKt) END AS BookTName`.
- `TransferDt` is DisplayInGrid but has no Designer column, so it is not shown.
- `moduserKt`, `moddate` and `CancelReq` are searchable, not in the grid.

**Row colours** (`dgMain_CellFormatting`, ForeColor). These are driven by the people columns,
not by Statuskt:

- `RetbackByKt > 0` → **DarkGreen** (returned)
- `DeliveryByKt = 0` → Black (pending delivery, or cancelled)
- delivered and not returned → **DarkRed**

Web: `rowTextColor`.

## Delete

"Are You Sure to Delete This Record?" → Security password → `CommonRepository.Delete`
(`DELETE FROM LabIssueM WHERE LabIssueMkm=id`) → "Record Deleted ". Delete is disabled for a
delivered row (FillData), so the web must refuse it server-side when `DeliveryBykt > 0`. No
work report.

## Work report

`insertworkreports(TransactionName, PrimaryColumn, TranKm, …)` runs after Save. In **Add** mode
`TranKm` is still 0 when it is called, and `insertworkreports` returns at once for id 0. So only
**Edit** is logged (`workReport: true, workReportOn: { edit: true }`). The Work Report button is
disabled at load.

## Right-click menu (`cntMenu`)

Every action works on the **selected rows** (`GetIdFrom_GridRecord(..., AllRecords=False)`),
unless it says "current row". After an action the desktop refreshes only the current row
(`RefreshCurrentGridRecord`). The web should reload the list.

| Item                                             | Behaviour (messages verbatim)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel   | engine's. Config_Master has 12 `LabIssueM` layouts, but **all have an empty ShortcutKey**, so none appear in the submenu (they are used through the Print Selected Column dialog)                                                                                                                                                                                                                                                                                                                                                               |
| Send To › BookM                                  | the selected rows with `Type = 'Book'` → their BookTKt; none → "Please Select Book Record". `SELECT ISNULL(STUFF((SELECT ',' + CAST(BookMastkt AS VARCHAR) from BookT where tid in (<ids>) for XML PATH('')),1,1,''),0)`; "0" → "No Record Found"; else open `book-master` with those ids (title suffix "-> Word Search")                                                                                                                                                                                                                       |
| Send To › BookT                                  | Type Book rows, the same message; `SELECT … CAST(Tid AS VARCHAR) from BookT where tid in (<ids>)`; "0" → "No Record Found"; else open the Library No dialog (frmBookTranNew, `strTid`) as a modal. Web: open `BookTranDialog` for those tids                                                                                                                                                                                                                                                                                                    |
| Send To › Patrika                                | Type Patrika rows; none → "Please Select Patrika Record"; else open `patrika` with StrId = those BookTKt (PatrikaKm)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Utility › Cancel Request for Selected Records    | **current row's** `EnUserKt <> me` → "only User Requested the Book Only can Cancell the Request". Then "Are u Sure to cancel request for Current Book?" (Yes/No) → `UPDATE LabIssueM SET CancelReq=1,Statuskt=<CancelReq> WHERE LabIssueMkm In(<selected>) AND ISNULL(DeliveryBykt,0)=0` → "(<n>) Records Cancelled Successfully" / "No Records Canceled". **Bug:** only the current row's owner is checked, so other users' selected requests are cancelled too (see bugs)                                                                     |
| Utility › Deliver Selected Book (**F4**)         | `curr_utypeid <> 3` → "U have no right to Deliver the Books". "Are u Sure to Deliver Selected Books?" → `UPDATE LabIssueM SET DeliveryBykt=@me,DeliveryDt=getdate(),Statuskt=<RetPen> WHERE statuskt=<DlvrPen> and LabIssueMkm IN(<selected>)` → "<n> Books Delivered Successfully" / "No Books Delivered"                                                                                                                                                                                                                                      |
| Utility › Return Selected Book (**F5**)          | `curr_utypeid <> 3` → "U have no right to Return the Books". "Are Selected Books Returned Back to Library?" → `UPDATE LabIssueM SET RetbackBykt=@me,RetbackDt=getdate(),Statuskt=<Closed> WHERE statuskt=<RetPen> and LabIssueMkm IN(<selected>)` → "<n> Books Returned Successfully" / "No Books Returned"                                                                                                                                                                                                                                     |
| Utility › Transfer Current Book To Me            | **current row**: "Are u Sure to Transfer Current Book On your Account?" → `UPDATE LabIssueM SET Transferuserkt=@me,TransferDt=getdate() WHERE LabIssueMkm=@id and enuserkt<>@me` → "Book Transferred Successfully" (nothing when 0 rows: the requester cannot transfer to themself). No status check: a closed or cancelled row can be "transferred" too (harmless quirk; it does not affect the overdue count, which looks only at RetPen)                                                                                                     |
| Utility › Show All Records                       | FillList with **no** default condition (all 293k rows), then the default is restored for the next refresh                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Utility › Show All Records of Current User       | FillList with `AND (enuserKt=@me)` **instead of** the default condition (closed and cancelled included), then the default is restored                                                                                                                                                                                                                                                                                                                                                                                                           |
| Utility › Update For(Party) For Selected Records | keeps the selected rows with `DeliveryByKt = 0`; none → "Selected Books Already Delivered" (title "Records Cannot Be Updated"). Pick a party (`SELECT partyMkm,PName FROM PartyM ORDER BY PName`) → `GetUserNotReturnedBook(me, party)` message stops it → for each row `GetDataById` + `Forkt = party` + `Save` (the Edit UPDATE: BookTKt unchanged, `moduserKt` = the row's **old** moduserKt, moddate now). No success message, no refresh. **Bug:** cancelling the picker still runs it with party 0 and clears For on every row (see bugs) |

The commented-out `cntMenu_Opening` shows an earlier design that hid items by role and row. It
is dead code: all items are always visible.

## Reports and printing

No `.rpt`. Only Print Selected Column (Config_Master `LabIssueM` layouts) / Send To Excel.

## Permissions

- The menu shows it to every logged-in user (`@ScreenAccess('lab-issue-master')`).
- **Deliver and Return need `curr_utypeid = 3` (Oprator)**, exactly. Admin and Master users are
  refused too. Enforce `user.userType === UserType.Oprator` server-side in both actions.
- Cancel: only the requester (current row on the desktop).
- `EnableDisableDataEditing(ToolStrip1)`: standard toolbar state. The FillData rules above
  disable Delete for delivered rows and Modify for returned rows. Enforce both server-side.

## SQL in form event handlers

- Load: `select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where ConfigType='LabIssueM' and isnull(ShortcutKey,'')<>'' order by ConfigName`
- The F2 and Send To SQL above.

## Desktop bugs

- **Data-corrupting (fix on the web):** Update For(Party): `txt.Text IsNot Nothing` is always
  true, so cancelling the party picker sets `Forkt = 0` on all the selected undelivered rows.
  Web: stop when the picker is cancelled.
- **Data-corrupting (fix on the web):** Cancel Request checks only the current row's requester
  and then cancels **all** selected undelivered rows, other users' included. Web: refuse when any
  selected row's `enuserKt` is not the user (message as desktop), or cancel only the user's own
  rows. User's decision, below.
- **Audit loss (fix on the web):** an Edit save writes `moduserKt = 0` (the form never sets
  it). Update For(Party) writes the old `moduserKt` back. Web: `moduserKt = current user` in both.
- **Harmless quirk (keep):** an Add save is not work-reported (TranKm = 0 when logging).
- **Harmless quirk (keep):** the swapped "Patrika No - " / "Lib No - " labels in the
  already-requested message.
- **Harmless quirk (keep):** the Book Name grid column is always empty.
- **Harmless quirk (keep):** Transfer To Me works on closed or cancelled rows.
- **Harmless quirk:** Hastprat rows show `BookT.Libno` for their BookTKt in the LibNo column
  (the JoinCondition knows only Patrika vs. everything else). Not this screen's concern.
- **Wrong block (kept, decision 1):** the already-requested check and the Add-mode F2 match on
  `BookTKt` only, not `Type`. A Patrika and a BookT row with the same numeric id block each
  other.
- **Throws (harmless):** Ctrl+L / Ctrl+U: no `Locked` column.

## Implementation hints

- `apps/api/src/master/screens/lab-issue.ts` + `apps/web/src/screens/LabIssueMaster.tsx`.
  `table: 'LabIssueM'`, `primaryColumn: 'LabIssueMkm'`, `lockable: false`,
  `defaultCondition: sql\`(ISNULL(DeliveryBykt,0)=0 OR ISNULL(RetbackBykt,0)=0) AND ISNULL(CancelReq,0)=0\``,
`workReport: true, workReportOn: { edit: true }`.
- **Move the request rules into a shared module** (`lab-issue-common.ts`):
  - `labIssueValidation(db, { id, bookTKt, bookTName, type })`
  - `userNotReturnedBook(db, userId, forKt)`
  - `statusKt(db, name)`
  - `insertRequest(db, …)`

  `book-tran.ts`'s `request-lab-issue` already inlines them. Refactor it to use the module, and
  reuse it from `patrika.ts` (Type Patrika) and later Hastprat / Graphics.

- `validate` (sync) can only check BookTKt = 0. The DB checks belong in `save` (throw
  `BadRequestException` with the verbatim text), as `book-tran.ts` does for "LibNo Already
  Exist".
- `save`: INSERT with status DlvrPen and Type `Book`. On Edit, UPDATE BookTKt/Forkt/moduserKt/moddate
  only. Refuse Edit when `RetbackBykt > 0`.
- `f2`: `txtbooktkt` with params `{ mode, bookTKt }` for the Add/Edit lists. `txtForkt` uses
  tblSearch.
- Actions (all on `ids`, re-reading the rows server-side):
  - `cancel-request`
  - `deliver` (utype 3)
  - `return` (utype 3)
  - `transfer-to-me` (current id)
  - `update-for-party` (party param; refuse when it is missing)
  - `show-all` (`ctx.list(sql\`1 = 1\`)`, as `book-confirmation.ts` does)
  - `show-mine` (`ctx.list(sql\`enuserKt = ${user.id}\`)`)
  - Send To: `book-master` / `book-tran` / `patrika` as `open` results, filtered by Type, with
    the "Please Select … Record" messages client-side.
- Web: `rowTextColor` for the three colours. Use the `confirm` texts above. Hide the disabled
  fields as `alwaysDisabled`.
- **Engine gaps:**
  1. Grid date format `dd-MM-yyyy HH:mm:ss`: `GridColumnSpec.format` has `date`, `time`,
     `weekday` and `datetime12` only. Add a 24-hour `datetime`.
  2. F-key shortcuts on menu items (F4 Deliver, F5 Return; frmBookTranNew's F6/F7/F8). The
     engine's menu shortcuts are Ctrl-only (`types.ts:482`).
  3. Show All loads 293k rows. Check that the grid copes, or page it (`listLimit` applies only
     to the unfiltered grid).
  4. Per-row toolbar state (Delete off when delivered, Modify off when returned). Something like
     `lockedColumns`, but split per button, is needed. Or let the server refuse with a message.

---

## Feeding actions on Book Master's Library No dialog (frmBookTranNew)

Desktop: `Library/Library/frmBookTranNew.vb`, right-click on `dgBook` › For Current Record ›
Utility. These are the screen's sources for LabIssueM and BookConfirmation. The web already
has them in `apps/api/src/master/screens/book-tran.ts` (actions `request-lab-issue` and
`send-book-confirmation`) and `apps/web/src/screens/BookTranDialog.tsx` (menu items at
l. 309–325). I checked them against the desktop.

### Request For LabIssue (**F6**) and Request LabIssue for MS (**F7**)

Desktop `RequestForLabIssue(ForKt)` (l. 174):

- F6 calls it with ForKt 0.
- F7 first picks a party with `SELECT partyMkm,PName FROM PartyM ORDER BY PName` and runs only
  when `Val(txt.Tag) > 0`.
- For each selected `dgBook` row: `Ent { Type: 'Book', BookTKt: Tid, BookTName: LibNo cell,
enuserKt: me, Forkt }` → `GetValidationMessage` → `GetUserNotReturnedBook(me, ForKt)` → on a
  message, MsgBox and **stop** (earlier rows stay inserted, no transaction) → `Save` (INSERT,
  status DlvrPen, Type Book).
- After the loop: "Book Issued Successfully" if the last insert succeeded.
- No confirmation question.

`book-tran.ts` `request-lab-issue` **matches**:

- the same three checks in the same order, per row
- the verbatim messages, including the swapped `Patrika No - <libno> already Requested For LabIssue By - …`,
  `LibNo - … already Requested For Issue By - …`, and the overdue text with its spacing
- the INSERT with `GETDATE()`, Type `'Book'` and status looked up by Name
- partial inserts on failure, and the success message only when something was saved

The web reads LibNo from the DB, not the grid cell (same value). The F7 party pick is in
`BookTranDialog.tsx` (`pick('Party', named('parties'))`, run only when > 0), which matches.

Differences / gaps:

- Done: F6 / F7 / F8 run the items (the engine's F-key menu shortcuts), while the dialog's grid
  has the focus.
- Done: `book-tran.ts` now calls `requestLabIssue` in `lab-issue-common.ts` (same checks, order,
  messages and partial inserts).
- The cross-type `BookTKt` collision is inherited (open question 1).

### Send Book Confirmation (**F8**)

Desktop `SendBookConfirmationToolStripMenuItem_Click` (l. 1746):

1. "Are you sure to send confirmation for selected records?" (Yes/No).
2. `BookConfirmationRepository.CheckBookSent(<selected tids>)`:
   `SELECT ISNULL(STUFF((SELECT DISTINCT ',' + BookT.Libno FROM BookConfirmation INNER JOIN BookT ON BookConfirmation.BookTKt=BookT.tid WHERE BookConfirmationStatus='Sent' AND BookTKt IN(<ids>) FOR XML PATH('')),1,1,''),'')`.
   Non-empty → "LibNo - <list> already Sent" and stop.
3. `InputBox("Please Enter Ank")`. **Cancel returns "" and still sends** with an empty Ank.
4. `SendBookConfirmation(me, ids, Ank)`: in **one transaction**, per tid,
   `INSERT INTO BookConfirmation (BookTKt,Ank,BookConfirmationStatus,BookSentByKt,BookSentDate) VALUES (@tid,@Ank,'Sent',@me,getdate())`.
5. No success message.

`book-tran.ts` `send-book-confirmation` + `BookTranDialog.tsx` **match**:

- the confirm text
- the Sent check and its message (DISTINCT LibNos joined with `,`)
- the `ask-ank` round trip with `?? ''`, so Cancel still sends with an empty Ank, like the
  desktop
- the transaction INSERT with status `'Sent'`
- no success message

Only difference: with no rows selected the desktop's `IN()` throws a SQL error (MsgBox). The web
uses `IN (0)`, asks for the Ank and inserts nothing (harmless).

The rows then appear in Issue › Book Confirmation (`book-confirmation.md`, already ported).

### Lab Issue Master (For Current Record)

Desktop: `SELECT ISNULL(STUFF((SELECT ',' + CAST(LabIssueMkm AS VARCHAR) FROM LabIssueM WHERE BookTKt IN(<selected>) FOR XML PATH('')),1,1,''),0)`.
"0" → "No Record Found", else it opens Lab Issue Master with StrId **and closes the dialog**
(`Me.Close()`). `book-tran.ts` `lab-issue-master` does the open with the same message. Check
that the dialog closes once `lab-issue-master` is registered. It does not filter by `Type`, so a
Patrika request with the same numeric id also shows up (same collision).

## Decisions (orchestrator defaults; the user has not overridden them)

1. The "already requested" check and the LibNo F2 match on `BookTKt` only, not `Type`: desktop
   behaviour kept (flagged above).
2. Cancel Request on several rows: refused, with the desktop's message, when any selected row was
   requested by another user.
3. The Add-mode LibNo F2 hiding every item ever cancelled: desktop behaviour kept.
4. Show All Records (and of Current User): the engine's large-list limit, `listLimit` 5000 (the
   newest 5000), not all ~293k rows.

## Web port (2026-10-07)

Files:

- API: `apps/api/src/master/screens/lab-issue.ts` (ScreenDefinition `lab-issue-master`),
  `lab-issue-common.ts` (the shared request rules: `labStatusKt`, `labIssueValidation`,
  `userNotReturnedBook`, `insertLabRequest`, `requestLabIssue`), used by `book-tran.ts` and meant
  for Patrika (`Type 'Patrika'`) and Graphics next.
- Shared: `packages/shared/src/lab-issue.ts` (`canDeliverLabIssue`, `labIssueButtonsOff`,
  `labIssueRowColor`), used by both the API and the screen.
- Web: `apps/web/src/screens/LabIssueMaster.tsx`; `BookTranDialog.tsx` items now carry F6 / F7 / F8.
- Tests: `apps/api/test/master-lab-issue.integration.test.ts` (13 tests, incl. Book Tran's request),
  `packages/shared/src/lab-issue.test.ts`, `apps/web/e2e/batch-d.spec.ts` (two Lab Issue tests).

Engine extensions (all opt-in):

- `ScreenDefinition.buttonsOff` / `ScreenSpec.buttonsOff`: FillData turning Modify and Delete off
  separately per record; the API refuses the edit lock / save (`modify`) and the delete
  (`delete`) with 403.
- `ActionContext.list(where, { limit: true })`: a menu list capped at the screen's `listLimit`.
- Function-key shortcuts on right-click menu items: an item with `shortcut: 'F4'` (… `'F12'`) runs
  on that key while the grid the menu belongs to has the focus (WinForms runs a ContextMenuStrip's
  ShortcutKeys only for its own control). Works for `contextMenu` and a whole `menu`.
- `FieldSpec.datetimeText: 'date'`: a datetime shown as dd-MM-yyyy in a text box.

Server-side rules: Deliver / Return need user type exactly 3 (403 "U have no right to …"
otherwise; the menu shows the same message before asking); Delete refused for a delivered row,
Modify (edit lock, save) for a returned one; Cancel Request refused when any selected row is
another user's.

Deliberate differences:

- After Deliver, Return, Cancel, Transfer and Update For(Party) the selected rows are re-read
  (the desktop refreshed the current row only; Update For(Party) refreshed nothing).
- Show All Records / of Current User show the newest 5000 rows; the default grid is capped the
  same way (it has ~1.3k open requests today).
- Update For(Party): picking the list's blank row counts as cancelling (no change), like F7 on
  Book Tran (`Val(txt.Tag) > 0`).
- Send To runs server-side on the selected requests (Type read from the table, not the grid).
- After an Add the new row is current but the boxes keep what was typed until another row is
  clicked (the engine does not reload the current row on a click; the desktop's FillData runs on
  every click). Harmless.

Desktop bugs fixed:

- Update For(Party) with the picker cancelled cleared For on every selected undelivered row: now
  nothing changes.
- Cancel Request checked only the current row's requester and then cancelled all selected rows:
  now refused when any selected row is another user's.
- An Edit save wrote `moduserKt = 0`, Update For(Party) wrote the old moduserKt back: both write
  the current user.
- Editing a Patrika request could move it onto a BookT item (the LibNo list offers BookT items
  only, while Type stayed 'Patrika'): the API refuses a changed LibNo on a Patrika request
  ("LibNo cannot be changed for a Patrika request").

Kept quirks: Add not work-reported (Edit is: Work Type asked), the swapped "Patrika No - " / "Lib
No - " labels, the always-empty Book Name column, Transfer To Me on closed / cancelled rows, Edit's
validation running with Type unset (so a Patrika row's For change also checks IssueTran for its
id), Copy doing nothing (`noCopy`).

Deferred: none specific to this screen. Send To › Patrika opens `patrika`, which shows the "not
available on the web yet" window until Patrika is ported.

## Desktop v3.4.3.1

- **The "30 days old due books" block is off.** `LabIssueMRepository.GetUserNotReturnedBook`
  (`:331-343`) has its whole body commented out ("Temporary Comment Suggested by Vishalbhai"), so
  `You Cannot Issue any Books` / `Please Return<n>  Nos. of 30 days Old Due Books to Issue New Books.`
  never appears: not on Save, not in Update For(Party), not in Request For LabIssue (Book Master's
  Library No form, Patrika, Graphics Master, Graphics Detail).
  Web: the check is kept behind the env flag `LAB_ISSUE_OLD_DUE_BLOCK` (`apps/api/.env.example`;
  default `false`, i.e. the desktop's behaviour today). `true` brings the check back unchanged
  (`userNotReturnedBook` in `lab-issue-common.ts`). The engine hands Save the server's settings
  for it (`save(…, { env })`).
- Tests: `master-lab-issue.integration.test.ts` — "does not hold 30-day-old due books …" (off)
  and the second `describe`, run with the flag on.
