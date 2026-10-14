# Party Master (`PartyM`)

Desktop form: `GGLibrarySolution/Library/Master/frmPartyMaster.vb` (+ `.Designer.vb`),
repository `Library.BusinessContract/Concrete/PartyMRepository.vb`, popups in
`Library/CommonForms/frmDisplayTransNew.vb` (`SetForm_PartyM`, `SetForm_Common`). Menu:
Master › Party Master.

Generic master engine; this screen supplies `apps/api/src/master/screens/party.ts` and
`apps/web/src/screens/PartyMaster.tsx`.

## Table and key

- Table `PartyM`, PK `partyMkm`, `MAX + 1` (`insertWithMaxId`).
- **No `Locked` column** (the grid's L / U call `LockUnlockRecords` and fail) — `lockable: false`.
- Audit `enuser/endate` on insert, `moduser/moddate` on update.

## Fields

| Box                                          | Column                                        | Notes                                    |
| -------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| Prefix / Name / Short Name                   | `PrefixNm` / `PName` / `ShortNm`              | Name required                            |
| Refrence / Remark / Website / Mix Sign       | `refrence` / `Remark` / `Website` / `Mixsign` | Mix Sign F2: columnmaster `PartyMixsign` |
| MRecNo / GroupNo / UpSeq                     | `MRecNo` / `GroupNo` / `UpSeq`                | `Val()`                                  |
| Sampraday / Guru / Category                  | `Sampradaykt` / `Gurukt` / `Categorykt`       | F2 (tblSearch)                           |
| Uplevel / Masterid                           | `UplevelKt` / `MasterKt`                      | F2: other parties                        |
| Block Party (ComboBox Yes/No) / Block Reason | `IsBlocked` / `BlockReason`                   | enabled for user type **AMaster** only   |
| Anya Name / Address / Relation / Deposit     | popups                                        | see below                                |
| Photo / FormFilled                           | GroupBoxes with PictureBoxes                  | nothing ever fills them; drawn empty     |

**Block Party grid column (web addition).** The desktop grid (`GvMain`) has no Block column and
tblSearch's `IsBlocked` row is not `DisplayInGrid`; the web adds one through
`gridColumnsAlso`, showing the form's text (`Yes` / `No`) as `BlockParty`.

## Validation

`"Please Enter Party Name"` (`PName` blank).

## Popups (frmDisplayTransNew)

| Box       | TranName / FormName | Table                  | Save                                                                                                                                                                                                                                                     |
| --------- | ------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Address   | Address / Common    | `PrakMAddT` (partyMkt) | delete-all + insert, only when the box text changed (`SavePrakMAddT`); `txtAddress` = addresses joined by "," + the last row's city                                                                                                                      |
| Relation  | Relation / PartyM   | `PartyMRelT`           | delete-all + insert (each row `MAX + 1`), only when the text changed. TableNm F2: columnmaster `TableNm`; TableId F2: ids of the table named in TableNm (vishay, authmast, prakmast→praksnM, visheshmast, columnmaster, bookmaster→BookM, grvishaymembr) |
| Deposit   | Deposit / PartyM    | `PartyDepositT`        | delete-all + insert, only when the text changed. Date via InputBox "Please Enter Deposit Date(Ex-dd/MM/yyyy)"; empty/Cancel leaves the cell. `SrNo` 0 takes global `MAX(SrNo)+1`. The box shows the balance (credit − debit).                            |
| Anya Name | AnyName / PartyM    | `PartyMAnayNmT`        | upsert by key, then delete the rows no longer listed — only when the popup was opened. LibNo F2 fills BookTKt, LibNo, Samvat.                                                                                                                            |

A popup's rows are also deleted when its box is emptied (`DeleteTransaction` with a blank
text).

## Delete

Confirm → Security password → `CheckInUse` (first hit, verbatim):
Inword Master · WorkGiven Master · Prakashan List Anya Bhandar · KrutiRef · Book Master ·
BookT PraptiTran · Issue Master · BhandarTran(Catalogue Master) · "Current Record Relation
Table is not blank" · Magazine Master · "Current Record uplevel or masterid or mrecno or grpno
is not blank" · Outsider Master. Then the address, relation, deposit and anya-name rows and
the record.

## Work report

`insertworkreports` on **Add and Edit** (Delete logs nothing) — `workReportOn: { delete: false }`.
Up to desktop v3.3.3.6 the Add call was commented out; v3.4.3.1 logs the Add too
(`frmPartyMaster.vb:826`). `lblEntry` shows the entry user.

## Right-click menu

Print Report › Selected Column / Send To Excel, then **Send To** ›

| Item                        | Opens                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| BookM                       | `book-master`: books with a BookT whose praptitran is the party, or `bhandarcokt` = party                        |
| BookT                       | frmBookTranNew (strTid) — the web's Library No dialog, with those BookT ids                                      |
| Kruti Master                | `kruti-master` via `krutireflibno.bhandarkt`                                                                     |
| IssueTran                   | "Only Party(Press Yes) / Only Ref Party(Press No) / Both Party And Ref Party(Press Cancel)" → `issue-master`     |
| Inward                      | `inward-master` (forkt / fromkt)                                                                                 |
| WorkGiven                   | `work-given-master` (Assignedbykt / AssignedTokt) — that menu item is commented out, so it opens the placeholder |
| Catalogue                   | disabled — the desktop handler is commented out                                                                  |
| Prakashan List Anya Bhandar | `book-master-anya-bhandar`                                                                                       |
| OutsiderM                   | `outsider-master`                                                                                                |

Every empty result: "No Record Found".

## Desktop bugs not carried over

- **UpSeq was wiped on every save**: Save reads `txtUpSeq.Tag`, which nothing sets. The web
  saves the box's value.
- **Anya names could be deleted from the wrong party**: `ClearDataTable` never resets
  `dtAnyaName`, so after opening Anya Name on one party and saving another, the second
  party's own anya names were deleted. The web keeps popups per record.
- **Party delete left anya names behind** unless the popup had been opened; the web always
  deletes them.
- **Block Party was enforced only in the UI.** The server now keeps `IsBlocked` /
  `BlockReason` unchanged for anyone but AMaster.
- `CheckInUse` looks at `WorkGivenM.Givenbykt/GivenTokt`, while Send To › WorkGiven reads
  `Assignedbykt/AssignedTokt`. Both kept as they are.

## Permissions

Menu gating, plus AMaster-only Block Party (above).

## Verified

- `apps/api/test/master-party.integration.test.ts`: validation, max+1 add, kt names,
  Block Party (Operator refused, AMaster allowed, kept on a later Operator edit), UpSeq, all
  four popups (txtAddress text, deposit dates and SrNo, anya-name upsert/delete, rows kept
  when a popup is not sent), a bad deposit date, CheckInUse refusal, delete with child
  rows, Relation lists by table, Send To actions.

## Desktop v3.4.3.1

- Adding a party writes a work report (see Work report).
- Send To › "Inword" is now captioned **"Inward"**. The delete refusal `Record is in used in
Inword Master` is unchanged on the desktop (`PartyMRepository.CheckInUse`) and here.
- Not fixed on the desktop: `UpSeq` (the web's fix stands).
