# Outsider(Visitor) Master (`OutsiderM`)

Desktop form: `GGLibrarySolution/Library/Issue/frmOutsiderM.vb` (+ `.designer.vb`, title
"Outsider Master"), repository `Library.BusinessContract/Concrete/OutsiderMRepository.vb`.
Menu: Issue › Outsider(Visitor) Master.

The definition is `apps/api/src/master/screens/outsider.ts` and the screen is
`apps/web/src/screens/OutsiderMaster.tsx`.

## Table and key

- Table `OutsiderM`, PK `OutsiderMkm`, an IDENTITY column. There are no triggers.
- No `Locked` column. The form's Ctrl+L / Ctrl+U would fail on the desktop
  (`lockable: false`).

## Fields

| Control             | Column                  | Notes                                                                                                                                                                 |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Party Name          | `partymkt`              | F2 `PartyM`; required                                                                                                                                                 |
| Visit Type          | `VisitTypekt`           | F2 columnmaster `OutVisitType`                                                                                                                                        |
| Visit Date          | `VisitDate`             | DateTimePicker (`FieldSpec.date`)                                                                                                                                     |
| Demand / Suggestion | `demand` / `suggestion` | F2 lists of earlier values                                                                                                                                            |
| Attended By         | `attendedbykt`          | F2 `PartyM`                                                                                                                                                           |
| Attendent Remark    | `AttendentRemark`       | F2 list of earlier values                                                                                                                                             |
| Letter Type         | `LetterTypekt`          | F2 columnmaster `OutLetterType`                                                                                                                                       |
| Demand Approved By  | `DemandApprovedbykt`    | F2 `PartyM`                                                                                                                                                           |
| Approval Comments   | `ApprovalComments`      | F2 list of earlier values                                                                                                                                             |
| WorkDone By         | `WorkDonebykt`          | F2 `PartyM`                                                                                                                                                           |
| Work Remark         | `WorkRemark`            | no F2 (empty `F2EntryText`)                                                                                                                                           |
| Work Time           | `WorkTime` (`time`)     | MaskedTextBox `90:00` (`FieldSpec.mask`). Saved when the mask is complete, else `''`, which SQL stores as 00:00:00. A MaskedTextBox is not a TextBox, so it has no F2 |
| Status              | `Statuskt`              | F2 columnmaster `OutStatus`                                                                                                                                           |
| Output Type         | `OutputTypekt`          | F2 columnmaster `OutputType`                                                                                                                                          |
| DataGiven Date      | `DataGivenDt`           | DateTimePicker                                                                                                                                                        |

## Validation

`"Please Enter Party Name"` (`partymkt = 0`).

## Grid

- **Columns:**
  - Id (80)
  - Visit Date (`dd-MM-yyyy`)
  - Party Name (150)
  - Visit Type
  - Attended By (150)
  - DemandApproved By (35)
  - Work DoneBy
  - Status
  - Work Time (TimeSpan)
- **Hidden:** the Party, Attended By, Demand Approved By and Work Done By kt columns.
- **Order and filter:** newest first, no default condition.

## Work report, entry label

Neither: the form never calls `insertworkreports`, and its `lblEntry` line is commented out.

- **Desktop:** Copy and Work Report are disabled at load, until the first Save or Cancel.
- **Web:** both are on from the start.

## Delete

Confirm → Security password → plain `DELETE`.

## Right-click menu

| Item                                           | Behaviour                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column / Send To Excel | engine's                                                                                                                               |
| Send To › Party Master                         | every party the selected visits name (party, attended by, demand approved by, work done by) → opens `party-master`; "No Records Found" |
| Utility › Show Attachments                     | `CommonLibrary.frmAttachments` → `AttachmentsDialog` (see author-master.md, "Attachments"; ported 2026-10-13)                          |

## Permissions

The menu shows it to admins and the Admin / AMaster user types only (`menu.ts`). The API
refuses everyone else (`@ScreenAccess`).

## Verified

- `apps/api/test/master-issue-small.integration.test.ts` › Outsider:
  - an Operator gets 403
  - validation; add with both dates, the work time and Gujarati text
  - an incomplete mask saves 00:00:00
  - Send To Party Master, delete
