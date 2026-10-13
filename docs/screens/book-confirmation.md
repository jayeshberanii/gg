# Book Confirmation (`BookConfirmation`)

Desktop form: `GGLibrarySolution/Library/Issue/frmBookConfirmation.vb` (+ `.designer.vb`),
repository `Library.BusinessContract/Concrete/BookConfirmationRepository.vb`. Menu: Issue ›
Book Confirmation.

The definition is `apps/api/src/master/screens/book-confirmation.ts` and the screen is
`apps/web/src/screens/BookConfirmation.tsx`.

## What it is

A list of books sent to someone for confirmation, and their receipt.

- **Where rows come from:** they are made elsewhere, by F8 "Send Book Confirmation"
  (`SendBookConfirmation`) on Book Master's Library No dialog (frmBookTranNew) and on
  frmHastpratLibNoTran.
- **What this screen does:** it only lists, receives and deletes them.

## Table and key

- Table `BookConfirmation`, PK `BookConfirmationKm`, IDENTITY.
- Status `BookConfirmationStatus` is `'Sent'` or `'Received'`.
- No `Locked` column, so the form's Ctrl+L / U would fail (`lockable: false`).

## Toolbar

- **Buttons:** `ShowHideButton(ToolStrip1, 0,0,0,0,0,1,1,0,0)` leaves only Delete, Refresh
  and Exit.
- **Always enabled:** the form never calls `EnableDisableDataEditing`, so every button stays
  enabled. Exit closes at once, and an empty grid does not start New.
- **Keys:** `Form_KeyDown` knows Ctrl+Z / Y / F / D / R / L / U.
- **Engine:** this is `ScreenSpec.fixedButtons`. There is no Save; the server refuses one.

## Panel (all ReadOnly)

LibNo/Ank (`BookTKt` → `BookTName`, `Ank`), Status, Sent By (`BookSentByKt` →
`BookSentByName`), Sent Date, Received By, Received Date. The dates show as `Convert.ToString`
does on the desktops: `dd-MM-yyyy HH:mm:ss` (`FieldSpec.datetimeText`).

## Grid

- **Columns:**
  - BookConfirmationkm (5)
  - LibNo, Ank, Status
  - SentByKt (hidden)
  - Sent By (140), Sent Date (200, `dd-MM-yyyy hh:mm:ss`, 12-hour, no AM/PM)
  - Received By (140), Received Date (200, same format)
- **Row colours:** `dgMain_CellFormatting` draws Received rows green and Sent rows black.
- **Default condition:** `BookConfirmationStatus='Sent'`, also inside search
  (`defaultCondition`). Show All Records lifts it until the next Refresh.

## Right-click menu

| Item                                           | Behaviour                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| For Selected Record › BookM                    | shown, disabled: it has no Click handler on the desktop                                                                                                                                                                                                                                                             |
| Print Report › Selected Column / Send To Excel | engine's                                                                                                                                                                                                                                                                                                            |
| Utility › Receive Confirmation                 | Shown only when the current row is Sent and was sent by someone else (`cntMain_Opening`). "Are you sure to receive confirmation for selected records?" The selected **Sent** rows get received by / now / `Received`, then FillList. None Sent → "Please select record with Statu as Sent" (the desktop's spelling) |
| Utility › Show All Records                     | the list without the default condition                                                                                                                                                                                                                                                                              |

## Delete

Confirm → Security password → plain `DELETE`. No in-use check.

## Not on this screen

`SendBookConfirmation` (F8 on frmBookTranNew) creates the rows. It is ported with Lab Issue's
"Request for Lab Issue" into `book-tran.ts` (plan Batch D).

## Verified

- `apps/api/test/master-issue-small.integration.test.ts` › Book Confirmation:
  - Sent-only default list, Show All, Save refused
  - Receive only Sent rows (and its message when none)
  - delete with password
