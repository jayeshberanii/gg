# Holiday (`HolidayM`)

Desktop form: `GGLibrarySolution/Library/Employee/frmHolidayM.vb` (+ `.designer.vb`),
repository `Library.BusinessContract/Concrete/HolidayMRepository.vb`, entity
`Library.Entity/EntHolidayM.vb`. Menu: Employee › Holiday.

Served by the generic master engine. This screen supplies
`apps/api/src/master/screens/holiday.ts` and `apps/web/src/screens/HolidayMaster.tsx`.
`apps/api/src/attendance/working-days.ts` already reads this table: a working day is not a
Sunday and not a `HolidayDate`.

## Table and key

- Table `HolidayM`, PK `HolidayMKm`, an IDENTITY column (`SELECT @@identity` on the desktop,
  `OUTPUT INSERTED` on the web). There are no triggers.
- There is no `Locked` column. The form's Ctrl+L / Ctrl+U would fail on the desktop, so they
  are off on the web (`lockable: false`).

## Fields

| Control                                       | Column              | Notes                                                                                                                                    |
| --------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Holiday Name (`txtHolidayName`)               | `HolidayName`       | trimmed, required. **`varchar`**: Gujarati text is stored as `?`. The desktop does the same, so keep holiday names in Latin script       |
| Holiday Date (`dtpHolidayDate`, `dd-MM-yyyy`) | `HolidayDate`       | `date`. The picker always holds a date. New keeps the date shown (`clsCom.clear` skips pickers); the engine's `FieldSpec.date` does this |
| —                                             | `enuser`/`endate`   | set on add (`GETDATE()`)                                                                                                                 |
| —                                             | `moduser`/`moddate` | set on edit only                                                                                                                         |

## Validation (`HolidayMRepository.GetValidationMessage`)

- `HolidayName` blank → `"Please Enter Holiday Name"`.
- The web also refuses a missing or malformed date with `"Please Enter Holiday Date"`. The
  desktop picker can't produce one; this check guards the API.

## F2 lookups

None. The tblSearch rows have an empty `F2EntryText`, and none are `IsSearchable`, so the
search box has no columns.

## Grid columns

Id (80), Holiday Name (400), Holiday Date (125, `dd-MM-yyyy`), Day (the same `HolidayDate`,
format `dddd`), ModUser (tblSearch's `modusername`), Mod Date (`dd-MM-yyyy`).

## List condition

- **Default:** `DefaultCond` = `DATEPART(YEAR,HolidayDate)=DATEPART(YEAR,GETDATE())`. The
  grid shows this year's holidays, and Refresh goes back to that.
- **Search:** `UcSearch1.LoadData` always gets `DefaultCond`, so search and Search In Range
  stay inside this year even after Show All. This is the engine's opt-in
  `ScreenDefinition.defaultCondition`.
- **Show All Records:** the same list without the condition.

## Child tables saved with the record

None.

## Right-click menu

| Item                                           | Behaviour                                                    |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Print Report › Selected Column / Send To Excel | engine's generic ones (no `Config_Master` layouts exist yet) |
| Show All Records                               | action `show-all`: every holiday, newest first               |

## Work report

The form never calls `insertworkreports`, so the web logs nothing either.

- **Desktop:** the toolbar's Work Report and Copy buttons are disabled in `Form_Load`.
  `EnableDisableDataEditing` mode 2 turns both back on after the first Save or Cancel.
- **Web:** both are on from the start, as on every engine screen.

## Delete

"Are You Sure to Delete This Record?" → Security password → plain `DELETE`. There is no in-use
check. The engine does exactly this, and the server checks the password.

## Permissions

Menu gating only: anyone who sees Employee › Holiday. No `curr_utypeid` checks in the form.

## Verified

- `apps/api/test/master-holiday.integration.test.ts`:
  - validation, add (identity, enuser) and edit (moduser, date)
  - this-year default list, StrId list, Show All Records
  - delete refused with a wrong password and allowed with the right one
