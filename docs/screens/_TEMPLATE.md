# <Screen name> (`<TransactionName>`)

Desktop form: `GGLibrarySolution/Library/<Folder>/frm<X>.vb`. Menu: <Menu> › <Item>

## Table and key

- Table: `<table>`, PK `<column>`
- Entity: `Library.Entity/Ent<X>.vb`

## Fields

| Column | Type | Notes (FK pair, default, derived) |
| ------ | ---- | --------------------------------- |

## Validation (`<X>Repository.GetValidationMessage`)

- …

## F2 lookups

| Field | Source (`tblSearch.F2EntryText` / inline SELECT) |
| ----- | ------------------------------------------------ |

## Grid columns

From `tblSearch` rows for this TransactionName.

## Derived values

ID generators, counters, sequence updates.

## Child tables saved with the record

Each `DataTable` parameter of the repository's `Save(...)`.

## Right-click menu

| Item | Behaviour |
| ---- | --------- |

## Reports and printing

`.rpt` files, `Config_Master` print layouts.

## Permissions

What `EnableDisableDataEditing` and `curr_utypeid` checks gate.

## SQL in form event handlers

Anything the form runs directly, outside the repository.
