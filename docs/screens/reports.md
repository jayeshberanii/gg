# Report pages (GGWebSolution → gglib-web)

The desktop shows some reports as web pages: `frmWebBrowser` (an MDI child with Save, Print,
Refresh and Exit) opens a page of its companion ASP.NET site, `GGWebSolution`
(`HomeController` + `Views/Home/*.cshtml`, base URL from `ggurl.txt`). The web app builds
those pages itself. It no longer needs that site, and `LEGACY_WEB_URL` is gone.

## How it works

1. A right-click menu item runs its master action as before (same pickers and questions).
2. The action calls a builder in `apps/api/src/reports/` and returns
   `{ kind: 'report', document }` (`ReportDocument`, `packages/shared/src/report.ts`).
3. `useActionRunner` opens `features/report/ReportView`: the desktop's toolbar over the page.
   - **Save** downloads the page as one `.html` file.
   - **Print** copies the page under `<body>` (`#print-report`) and calls `window.print()`;
     the browser paginates, table headers repeat, rows do not split.
   - **Refresh** runs the action again. **Exit** closes the window.

Each builder mirrors one Razor view: same headers (text verbatim), widths, grouping, counters
and conditions. Row order is the procedure's own.

## Reports

| Menu item                                                        | Site page                           | Builder                               | Data                                                                   |
| ---------------------------------------------------------------- | ----------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Author › Author Report (menu commented)                          | `Home/PrintAuthorReport`            | `author.ts` `authorReport`            | `PrintAuthor`                                                          |
| Author › Author Parampara Report                                 | `Home/PrintAuthorParamparaReport`   | `authorParamparaReport`               | `AuthorParamparaReport @PrintReference`                                |
| Author › Author Detail Report (commented), Kruti Author Check    | `Home/PrintAuthorDetail`            | `authorDetailReport`                  | `PrintAuthorDetail @KrutiCheck`, 9 result sets, authors from `TranIds` |
| Author › Kruti Report (commented)                                | `Home/PrintKrutiReport`             | `krutiFromAuthorReport`               | `PrintKrutiFromAuthor`, 3 result sets                                  |
| Book › New Vishesh Report                                        | `Home/PrintVishesh`                 | `book.ts` `visheshReport`             | the site's inline SQL                                                  |
| Book › Vishesh Parishisht Report                                 | `Home/PrintParishishtNew`           | `visheshParishishtReport`             | `PrintVisheshParishisht` + print numbers by SQL                        |
| (none) action `vishesh-parishisht-report-old`                    | `Home/PrintParishisht`              | `visheshParishishtReport(…, true)`    | inline SQL                                                             |
| Book › Lekh Prastavana Report                                    | `Home/PrintLekhPrastavana`          | `lekhPrastavanaReport`                | the site's inline SQL                                                  |
| Book › Book Report                                               | `Home/PrintBookReport`              | `bookReport`                          | `PrintBookReport`, print numbers from `TranIds`                        |
| Kruti › Kruti Report                                             | `Home/KrutiReport`                  | `kruti.ts` `krutiReport`              | `PrintKrutiReport`, Report Nos from `TranIds`                          |
| Kruti › Main Report (commented)                                  | `Home/KrutiAkaradiReport`           | `krutiAkaradiReport`                  | `PrintKrutiAkaradiReport`                                              |
| Kruti › Main Report As Agam Suchi › Main / Pattern 1 / Pattern 2 | `Home/KrutiAkaradiAgamSuchiReport`  | `krutiAgamSuchiReport`                | `PrintKrutiAkaradiAgamSuchiReport`, krutis from `TranIds`              |
| Kruti › परिशिष्ट 1–8, मुख्य कृति…, विषय परिशिष्ट                 | `Home/KrutiAkaradiParishishtReport` | `krutiAkaradiParishishtReport`        | `PrintKrutiAkaradiParishisht @Type` (11 layouts)                       |
| Kruti › परिशिष्ट 9                                               | `Home/KrutiPrakashakReport`         | `krutiPrakashakReport`                | `PrintKrutiPrakashakReport`                                            |
| Tirth Raksha › Print Report › Main Report                        | `Home/PrintTirthRakshaReport`       | `tirth-raksha.ts` `tirthRakshaReport` | `PrintTirthRakshaReport`, records from `TranIds`                       |

Not ported: `Home/Index` (a hard-coded test of PrintVishesh whose view no longer compiles) and
`Common/*` (stubs). The `/Coding` pages (Vishay Kosh, Charts) read a second database,
`DBCoding`; they are a later phase.

## Shared pieces (`apps/api/src/reports/`)

- `run.ts`
  - `reportRows(source, query)`: all rows of a statement. A procedure with several result sets
    comes back as one list; `rowsWith(rows, column)` picks a set by a column only it has.
  - Outside a transaction the statement runs on its own connection with no time limit (the
    appendix procedures run for half a minute; a pooled connection allows 15 s). Inside one
    (the tests) it runs in that transaction.
  - `withTranIds(source, ids, fn)`: `SetTranIds 1`, the report, `SetTranIds 0`, in one
    transaction.
  - `col(row, name)`: case-insensitive column lookup (the procedures are not consistent).
- `build.ts`: `table`, `row`, `cell`, `th`, `band`, `distinct`, `orderBy`.

## Deliberate differences from the site

- **TranIds.** The desktop writes the selection to the one shared `TranIds` table, opens the
  page, and clears the table when the window closes. Here it is written, read and cleared in
  one transaction, so two users cannot print each other's selection.
- **Author Detail Report** prints the selected authors. On the desktop this item passes
  `AuthorKm=` in the URL, which the site ignores, and never fills `TranIds`, so it prints
  whatever was left there (usually nothing).
- **No SQL built from request text.** Id lists are bound parameters; the appendix `Type` must
  be one of the known kinds (400 otherwise).
- **Statements run once.** The site ran every statement twice (`ExecuteNonQuery`, then `Fill`).
- **One query instead of one per row** for New Vishesh's publisher names and the Parishisht
  print numbers; the result is the same text.
- **Markup in report text.** Four columns are printed with `Html.Raw` on the site (Agam Suchi
  `KrutiDetail`; Author Report `Sampraday`, `Samvat`, `Visheshan`). Here only `<br>`, `<b>`,
  `<i>`, `<u>` are honoured; any other tag is dropped and its text kept.
- **View bugs not copied.** ShodhGranth's first column is numbered (the view prints 0 on every
  line); Apurna's group heading spans all four columns (the view spans three); an appendix
  with no rows shows an empty table (the view throws); a Vibhag with no printed book no longer
  breaks New Vishesh.
- **Fonts.** The views name `DVOT-Ganesh`, `DVOT-Surekh`, `SHREE_DEV_OTF_0708` and
  `Noto Serif Devanagari`, none of which the site ships. They stay first in each font stack;
  the app loads Noto Serif Devanagari as the fallback.

## Depends on the database version

- `PrintTirthRakshaReport` and the fourth argument of `PrintKrutiAkaradiAgamSuchiReport`
  (Pattern 1) came with the later desktop (`GGLibrarySolutionUpdated`). On an older database
  Tirth Raksha's report and Pattern 1 each answer 400 with a message naming the procedure. Main and Pattern 2 pass three arguments and
  work on both. **Neither path has been run against a database that has them.**
- `PrintKrutiFromAuthor` (Author › Kruti Report) fails inside the 2026-10 backup itself
  (`dbo.GetNumberOfWords` is called with too few arguments) and lists `ReportNo = 1` only. The
  builder follows the site's view; it has not been seen working.
- Pattern 2's Kruti No and परिशिष्ट 9's `PrathamPustakLibNo` / `Avruti` columns are blank when
  the procedure does not return them.

## Tests

- `apps/api/test/reports-{author,book,kruti,tirth-raksha}.integration.test.ts`: each report
  against the real DB, compared with its procedure's own rows; `TranIds` empty afterwards.
- `reports-own-connection.integration.test.ts`: the untimed-connection path.
- `packages/shared/src/report.test.ts` (`richTextRuns`), `apps/api/src/reports/book.test.ts`.
- `apps/web/e2e/reports.spec.ts`: the report window's Print, Save, Refresh and Exit.
