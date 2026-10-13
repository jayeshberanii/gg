# Letter Bhet (`LetterBhetM` + `LetterBookT`)

Desktop form: `GGLibrarySolution/Library/Issue/frmLetterBhetM.vb` (+ `.Designer.vb`, title
"Letter Bhet"), repository `Library.BusinessContract/Concrete/LetterBhetMRepository.vb`,
entities `Library.Entity/EntLetterBhetM.vb` and `EntLetterBookT` (in `EntLetterDemandM.vb`).
Report: `Library/CrystalReports/LetterBhetReport.rpt`. Menu: Issue › Letter Bhet (no visibility
rule, so everyone sees it).

_Bhet_ = gift. The form records a thank-you / acknowledgement letter for books received as a gift
("Bhet Pahoch" = gift receipt). Its twin is `letter-demand.md`.

Base class `frmMasterPage`, opened maximized, `ClientSize` 1012×708. `SplitContainer1` is
horizontal, at (0,54), 1008×642, with `SplitterDistance = 348`. `dgMain` (1004×282, anchored on
all sides) is in Panel2.

## Table and key

- `LetterbhetM` (the DB spelling; the code writes `LetterBhetM`, and the collation is
  case-insensitive). PK `LetterBhetMkm` (IDENTITY). 586 rows. There are no triggers.
- **No `Locked` column**, so `lockable: false`. The form's Ctrl+L / Ctrl+U calls
  `LockUnlockRecords` and fails with an SQL error on the desktop.
- Audit `enuser`, `endate` (both `date NOT NULL`, `endate = getdate()`), `moduser`, `moddate`.
- Column types: `LetterDate date NOT NULL`, `BhetTypekt int`, **`PartyName nvarchar(50) NOT NULL`**,
  `party_add nvarchar(500)`, **`MobileNo varchar(10)`**, `Vishay nvarchar(250)`,
  `Letter nvarchar(max)`, `inwordkt int`, `LetterNo int` (nullable).

## How `LetterBookT` tells Bhet lines from Demand lines (confirmed)

`LetterBookT(LetterBookKm int IDENTITY PK, TransactionKt int, TransactionName varchar(50), BookName nvarchar(2000), Nakal int)`
is shared by both letter forms. **`TransactionName` is the discriminator.** It holds the literal
parent table name, `'LetterBhetM'` or `'LetterDemandM'`. `TransactionKt` is the parent's PK.

The repositories write it as a literal on INSERT (`AddWithValue("TransactionName", "LetterBhetM")`)
and filter on it in the DELETE (`… WHERE TransactionKt=@Id AND TransactionName='LetterBhetM'`). The
tblSearch `BookTran` F2EntryText and JoinCondition filter on it too. The local DB has 2,111
`LetterBhetM` lines and 2,942 `LetterDemandM` lines. There are **no other values**. Every query
must filter on both columns, because the two parents' PKs overlap.

`Nakal` = number of copies.

## Fields

Two columns: labels at x = 13 / 417, inputs at x = 129 (w 212) / 510 (w 161). Inputs are 29
high in Times New Roman 14.25pt unless noted. TabIndex is in brackets.

| y   | Col 1                                                                                                                                              | Col 2                              | Far right                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| 18  | "Letter Date" → `dtpLetterDate` [1] DateTimePicker `dd-MM-yyyy`                                                                                    | "Letter No" → `txtLetterNo` [17]   | "Book Detail" (label x 686, right-aligned) → `txtBookTran` [21] (785,18, w 124) |
| 58  | "Party Name" → `txtPartyName` [3]                                                                                                                  | "Bhet Type" → `txtBhetTypekt` [11] |                                                                                 |
| 98  | "Party Address" → `txtparty_add` [5]                                                                                                               | "Vishay" → `txtVishay` [13]        |                                                                                 |
| 138 | "Mobile No" → `txtMobileNo` [7]                                                                                                                    | "Inword" → `txtinwordkt` [15]      |                                                                                 |
| 178 | "Letter" (13,182) → `txtLetter` [19] at (129,178), **542×160, Multiline, no scrollbars, font inherited from frmMasterPage = Arial Unicode MS 9pt** |                                    |                                                                                 |

| Column                        | Notes                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LetterDate`                  | New sets it to `DateTime.Now`. Saved as `MM-dd-yyyy`                                                                                                 |
| `LetterNo`                    | New: `SELECT ISNULL(max(LetterNo),0)+1 FROM LetterbhetM`. Editable, `Val(text)`, **no uniqueness check** (none of the 586 rows is a duplicate today) |
| `PartyName`                   | **free text** (only the text is saved, no FK). F2 is a special PartyM picker (below). Required                                                       |
| `party_add`                   | text. Filled by the Party / Inword F2; F2 also lists earlier values                                                                                  |
| `MobileNo`                    | text, varchar(10). Filled by the Party / Inword F2                                                                                                   |
| `BhetTypekt` / `BhetTypeName` | F2 columnmaster `LbhetType` (one row: "भेट"). Required                                                                                               |
| `Vishay`                      | text. F2 lists earlier values                                                                                                                        |
| `inwordkt` / `InwordName`     | F2 InwordM grid (below). The text shown is the inward's **Vibhag name**                                                                              |
| `Letter`                      | multi-line text, saved **untrimmed**. F2 lists every earlier distinct letter text (tblSearch). Reload trims it (`SetTextbox` … `.Trim`)              |
| `BookTran`                    | the "…Tran" popup box for `LetterBookT` rows (below). Its text is a summary, not a column                                                            |

**New** (`btnNew_Click`):

1. Clear `dtBookT`.
2. Clear Panel1's text boxes **unless `StrId = "0"`**. That is the "opened from Inward" case, so the
   pre-filled Inword survives.
3. `LetterDate = Now`, `LetterNo = GetMaxLetterNo`.
4. `txtLetter` gets this default text (each line ends with CRLF, including the last):

```
सादर प्रणाम,
आपकी ओर से संस्था के ज्ञानभंडार को निम्नोक्त पुस्तक/प्रत भेट के रूप में प्राप्त हुए है,
जिसकी हम विशेषरूप से अनुमोदना करते है । आपकी इस सहकार की भावना आवकार्य है ।
भविष्य में आपके द्वारा प्रकाशित पुस्तकें/प्रतें गीतार्थ गंगा ज्ञानभंडार को प्राप्त होती रहेगी, ऐसी हम अपेक्षा रखते है ।
```

At load, Work Report and Copy are **disabled** (`btnWorkReport.Enabled = False`,
`btnCopy.Enabled = False`) until a later `EnableDisableDataEditing` turns them back on. There is
no entry-user label (`lblEntry` is commented out).

### Opened from Inward

Inward › Send To › Letter Bhet Master sets `StrId` to the linked letters' ids, or "0" when there
are none. With "0", the grid is empty (`… IN(0)`), so Load calls New, which does not clear, and
`txtinwordkt` keeps Tag = inwordkm and Text = the Vibhag name. Party, address and mobile are
**not** pre-filled; the user still has to press F2 on Inword to fill them.

Web (built with Inward Master, 2026-10-07): the inward's `send-to-letter-bhet` action returns
`{ kind: 'open', screen: 'letter-bhet', ids: [], emptyMessage: '', newRecord: { inwordkt, InwordName } }`
in this case. The engine opens Letter Bhet on StrId "0" and runs New with those values over its
new-record defaults (`ScreenProps.initialNew`), so the screen only needs a `kt` field named
`inwordkt` with `nameColumn: 'InwordName'`. With letters it is a plain `open` with their ids.
Letter Bhet has that field (`LetterBhet.tsx`), and `apps/web/e2e/batch-d.spec.ts` ("Inward Master ›
Send To › Letter Bhet") runs the whole round trip in a browser: a new inward, Send To opens Letter
Bhet in Add mode with Inword = the inward's Vibhag, the letter is saved with that `inwordkt`, Send
To then opens Letter Bhet on that letter, and the letter's Send To › Inword Master goes back.

## Validation (`LetterBhetMRepository.GetValidationMessage`)

Run after the confirm "Are You Sure to Save This Record?":

1. `BhetTypekt = 0` → `"Please Enter Bhet Type"`
2. `PartyName = ""` → `"Please Enter Party Name"`

On success: `"Record Saved Successfully"`. The form never calls `insertworkreports`, so
`workReport: false`.

## F2 lookups

| Field                       | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Party Name (`txtPartyName`) | **inline**, select-first: `select partyMkm,PName,(SELECT TOP(1) MobileNo FROM PrakMAddT WHERE ISNULL(MobileNo,'')<>'' AND partyMkt=p.partyMkm)MobileNo,txtAddress,v1.SampradayName sampraday ,v2.Vishesh guru , v3.Vishesh catagory,isnull(Mrecno,0) Mrecno,p.refrence,(SELECT isnull(sum(creditamt)-sum(debitamt),0) from PartyDepositT where PartyMKt=P.PartyMKm) AS ClosingBalance from PartyM p left outer join Sampraday v1 on v1.SampradayKm=p.Sampradaykt left outer join visheshMast v2 on v2.tid=p.Gurukt left outer join visheshMast v3 on v3.tid=p.Categorykt ORDER BY PName`. After a pick: text = PName, `party_add = txtAddress`, and `MobileNo` = the picked MobileNo **only if it is not empty** |
| Inword (`txtinwordkt`)      | **inline**: the InwordM grid rows (`ListGridData('InwordM','inwordkm')`, the same columns as the Inward grid), select-first, searching for the box's current text. After a pick: Tag = inwordkm, text = VibhagName, then `SELECT TOP(1) address,MobileNo FROM PrakMAddT WHERE partyMkt=<picked FromKt>`. **Only if that returns a row**: PartyName Tag/Text = the inward's `fromkt`/`fromName`, `party_add = address`, `MobileNo = MobileNo`                                                                                                                                                                                                                                                                     |
| Bhet Type                   | tblSearch: `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='LbhetType' ORDER BY Name`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| party_add / Vishay / Letter | tblSearch `select <col> from LetterBhetM where isnull(<col>,'')<>'' group by <col> order by <col>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Mobile No / Letter No       | F2EntryText empty: nothing happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Book Detail (`txtBookTran`) | the popup (next section)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Child table: `LetterBookT` (the Book Detail popup)

- **Popup:** `frmDisplayTransNew` (the `Library` copy) with `TranName = "LetterBookT"`,
  `FormName = "Common"`, `TranId = id`.
- **Rows:** tblSearch `LetterBhetM`/`BookTran` (Type T) F2EntryText, with `{Id}` replaced:
  `select LetterBookKm,BookName,Nakal from LetterBookT where TransactionKt in ({Id}) AND TransactionName='LetterBhetM'`.
  It is loaded on the first F2 (`FillTransactionDatatable`), and New clears it.
- **`SetForm_Common` for LetterBookT:**
  - `LetterBookKm` is hidden.
  - `BookName` and `Nakal` are editable.
  - New row: `{Id, ""}`, so BookName is blank and Nakal null; the cursor goes to BookName.
  - An empty table gets one blank row.
  - There are no cell lookups.
- **After popup Save:** the box text becomes the generic summary (`transSummary.genericSummary`):
  `Book1-1,Book2-2` (BookName-Nakal, rows joined by ","). A reloaded record instead shows the
  tblSearch JoinCondition `BookTran` = the BookNames only, comma-joined:
  `(SELECT STUFF((SELECT ',' + DB.BookName FROM LetterBookT DB WHERE DB.TransactionKt=LetterbhetM.LetterBhetMkm AND DB.TransactionName='LetterBhetM' for XML PATH('')),1,1,'')) as BookTran`.
- **Save (only when the text changed):**
  1. The form builds `lstBookTran` from `dtBookT`, but only if
     `(text <> "" And no loaded record)` or `(loaded.BookTran.Trim <> text.Trim)`. Each row
     becomes `BookName.Trim` and `Val(Nakal)`, so a blank Nakal is 0.
  2. `DeleteTransaction(id, text, lst)`: if the text is empty **or** the list is non-empty,
     `DELETE FROM LetterBookT WHERE TransactionKt=@Id AND TransactionName='LetterBhetM'`.
  3. `Save(Ent, lst)`: INSERT/UPDATE the master, then `INSERT INTO LetterBookT(TransactionKt,TransactionName,BookName,Nakal) VALUES(@id,'LetterBhetM',@BookName,@Nakal)` for each row.

  So this is delete-then-insert, run only when the summary text changed. Clearing the box deletes
  every line. This maps to `TransSpec.onlyWhenTextChanged`.

## Grid columns

From the Designer (`AutoGenerateColumns = False`). Width is 100 where not given.

| #   | Header        | Bound           | Width                                                                                                                                                                                                     |
| --- | ------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Id            | `LetterBhetMkm` | 5                                                                                                                                                                                                         |
| 1   | LetterNo      | `LetterNo`      | 80                                                                                                                                                                                                        |
| 2   | Letter Date   | `LetterDate`    | 100, `dd-MM-yyyy`                                                                                                                                                                                         |
| 3   | Party Name    | `PartyName`     | 120                                                                                                                                                                                                       |
| 4   | Party Address | `party_add`     | 180                                                                                                                                                                                                       |
| 5   | Mobile No     | `MobileNo`      | 100                                                                                                                                                                                                       |
| 6   | Bhet Type     | `BhetTypeName`  | 180                                                                                                                                                                                                       |
| 7   | Vishay        | `Vishay`        | 150                                                                                                                                                                                                       |
| 8   | Inword        | `InwordName`    | 100: `CASE WHEN ISNULL(inwordkt,0)=0 THEN '' ELSE (SELECT Name FROM ColumnMaster INNER JOIN InwordM ON InwordM.Vibhagkt=ColumnMaster.ColumnMastKm WHERE inwordkm=LetterBhetM.InwordKt) End AS InwordName` |

The tblSearch rows exist (GridSeq 0–8). Order: `LetterBhetMkm DESC`. `DefaultCond = ""`, and
`WhereCondition` is public but never set by any caller. Grid style is the same as the other
masters.

## Delete

"Are You Sure to Delete This Record?" → Security password → `DELETE FROM LetterBhetM WHERE LetterBhetMkm=@id`
→ `"Record Deleted "`. There is **no** in-use check, and **the `LetterBookT` lines are not
deleted**. The local DB has 3 orphan Bhet lines (and 7 orphan Demand lines). See bugs.

## Right-click menu (`cntMain`)

| Item                             | Behaviour                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column   | engine's (no Config_Master rows for `LetterBhetM` locally)                                                                                                                                                                                                                                                     |
| Print Report › Send To Excel     | engine's `sendToExcel`                                                                                                                                                                                                                                                                                         |
| Print Report › Print Bhet Pahoch | `LetterBhetReport.rpt` with parameter `LetterBhetMkm` = **the current row** (only one) → `frmReport` viewer. Web: open the HTML print view (below)                                                                                                                                                             |
| Send To › Inword Master          | `SELECT ISNULL(STUFF((SELECT DISTINCT ',' + CAST(Inwordkt AS VARCHAR) FROM LetterBhetM WHERE LetterBhetMKm IN(<selected ids>) FOR XML PATH('')),1,1,''),0)` → if not "" or "0", open `inward-master` with those ids, else `"No Record Found"`. Note that `inwordkt = 0` rows put a "0" into the list; harmless |
| Utility › Show Attachments       | `CommonLibrary.frmAttachments(TranName='LetterBhetM', TranKm)`. **Desktop only** (files deferred): show the `desktopOnly` message                                                                                                                                                                              |

## Reports and printing: `LetterBhetReport.rpt` → HTML print view

**What the source tells us.** The `.rpt` streams (`Contents`, `QESession`, `PromptManager`) are
Crystal's encrypted/compressed format and **cannot be read here**. Neither `strings` nor
zlib/deflate at any offset worked. What can be recovered:

- **Sections** (`LetterBhetReport.vb`):
  - `Section1` = Report Header
  - four page headers, `PageHeaderSection4`, `PageHeaderSection2`, `PageHeaderSection3`,
    `PageHeaderSection1` (a–d)
  - `Section3` = **Details**
  - `Section4` = Report Footer
  - `Section5` = Page Footer
- **One parameter:** `LetterBhetMkm` (int), from the grid's current row.
- **Two embedded OLE pictures** (`Embedding 3/CONTENTS`, `Embedding 4/CONTENTS`). Both are the
  same 160×103 24-bit BMP: the **Geetarth Ganga logo** (an eye/flame mark with "गीतार्थ गंगा" in
  Devanagari beside it). The LetterDemand report embeds the identical bitmap twice. To extract it
  for `public/legacy/`:
  `python3 -c "import olefile;open('logo.bmp','wb').write(olefile.OleFileIO('LetterBhetReport.rpt').openstream('Embedding 3/CONTENTS').read())"`,
  then convert it to PNG.
- **Data source:** there is **no** `Rpt_LetterBhet` stored procedure (the only letter proc is
  `Rpt_LetterDemand`, see `letter-demand.md`), and no `.xsd` dataset for it. The report reads the
  tables directly, through Crystal's own table links or command (frmReport only applies the
  logon). The Details section must repeat per `LetterBookT` line. The data the HTML view needs is
  therefore, modelled on `Rpt_LetterDemand`'s last branch:

```sql
SELECT L.LetterBhetMkm, L.LetterNo, CONVERT(varchar, L.LetterDate, 103) AS LetterDate,
       L.PartyName AS PName, L.party_add, L.MobileNo, L.Vishay, L.Letter,
       ISNULL(LB.BookName,'') AS BookName, ISNULL(LB.Nakal,0) AS Nakal
FROM LetterBhetM L
LEFT JOIN LetterBookT LB ON LB.TransactionKt = L.LetterBhetMkm AND LB.TransactionName = 'LetterBhetM'
WHERE L.LetterBhetMkm = @LetterBhetMkm
ORDER BY LB.LetterBookKm
```

**Proposed HTML layout (A4 portrait).** This is an inference; confirm it against a real printout.

1. Header: the logo (left) and the institution name; Letter No (`LetterNo`) and Date
   (`dd/MM/yyyy`) on the right.
2. Addressee block: `PartyName`, `party_add`, `MobileNo`.
3. Vishay line: `Vishay`.
4. Body: `Letter`, verbatim, with line breaks kept (`white-space: pre-wrap`), in a Devanagari
   font.
5. Details: a numbered list or table of the books, BookName and Nakal (copies), one row per
   `LetterBookT` line. If there are no lines, show nothing (the LEFT JOIN yields one empty row).
6. Footer: sign-off / institution and the page number.

**Open question for the user:** ask for a printed or PDF sample of a Bhet Pahoch from the desktop,
or for someone with Crystal Reports 13 to open the `.rpt` and export the layout (Report › Export
or screenshots of the Design tab). Ask the same for the Demand report. Only then can the exact
header/footer text, the field placement and any hard-coded wording (address of the institution,
signatory) be reproduced. The section structure above is certain; the text in the sections is
not recoverable from the repo.

## Permissions

The menu item is visible to everyone. Records are never put in the Locked state, because the form
has no owner or `Locked` check.

## Desktop bugs

- **Data-corrupting:** `DeleteTransaction` runs on its own connection **before** `Save`, outside
  any transaction. If the save then fails, the book lines are already gone. A save can fail when:
  - `PartyName` is longer than 50 characters (party names from PartyM easily are), or
  - `MobileNo` is longer than 10 characters (for example "+91 98…"),

  and the result is a truncation error. **Web fix:** one transaction for master and lines.
  Validate `PartyName ≤ 50` and `MobileNo ≤ 10` with a clear message; this is new text, because
  the desktop only shows the SQL error.

- **Data leftover:** Delete leaves the `LetterBookT` lines behind. **Web fix:** delete them in the
  same transaction, `WHERE TransactionKt=@id AND TransactionName='LetterBhetM'`.
- **Throws:** the Party F2 assigns `dtT.Rows(0)("txtAddress")` directly, so a NULL address raises
  an InvalidCast MsgBox. The Inword F2 builds `partyMkt=<FromKt>`, so an inward with no From (17
  rows) raises an SQL syntax error. **Web:** treat NULL as '' and skip the address lookup.
- **Throws:** Ctrl+L / Ctrl+U (no `Locked` column). Web: `lockable: false`.
- **Harmless quirk:** Copy (when enabled) does not copy the book lines, because `dtSel` still
  holds the source record, so the text has "not changed".
- **Harmless quirk:** `TableKt` (columnmaster TableNm 'Vishay') is loaded and never used.

## SQL in form event handlers

The Party and Inword F2s (above), the Send To query, `GetMaxLetterNo`, and
`SELECT isnull(ColumnMastkm,0) from columnmaster where Vibhag = 'TableNm' and Name='Vishay'`
(unused).

## Implementation hints

- A `ScreenDefinition` like `outsider.ts`:
  - `table: 'LetterBhetM'`, `primaryColumn: 'LetterBhetMkm'`, `lockable: false`,
    `workReport: false`
  - `newDefaults` → `{ LetterNo: max+1, LetterDate: today, Letter: <default text> }`
  - `deleteRecord` that also deletes the lines
  - `trans: { BookTran: {} }` (rows from tblSearch, `{Id}` replaced by the engine)
- Web `TransSpec` for `BookTran`:
  - `hidden: ['LetterBookKm']`, `editable: ['BookName','Nakal']`, no lookups
  - `summary: 'generic'`, `onlyWhenTextChanged: true`
  - a blank first row when the table is empty
- Save: in one transaction:
  1. INSERT/UPDATE the master.
  2. If the BookTran text changed (or is now empty), delete the lines and insert them, with
     `TransactionName = 'LetterBhetM'`.
- Party F2: a `lookups.PartyName` with the inline SQL. It is a **free-text field whose F2 fills
  three boxes** (`afterPick` sets `party_add`, and `MobileNo` if non-empty). The pick's Tag is not
  saved.
- Inword F2: the list is the InwordM grid. `afterPick` calls an action (for example
  `inwardParty`) that returns `{fromkt, fromName, address, MobileNo}` from
  `PrakMAddT TOP(1) WHERE partyMkt = fromkt`, and fills only if a row exists.
- `txtLetter`: a multi-line field (`h: 160`) in Arial Unicode MS 9pt.
- **New shared piece:** `apps/web/src/features/print/`, a PrintView window that renders a server
  payload (`actions.printBhetPahoch(ids[0])` → the rows above) as A4 HTML with `@media print`
  CSS, plus `window.print()` so the user can Print or Save as PDF. This screen is the first user
  (plan row 15), and Letter Demand and Issue Slip reuse it.
- Show Attachments → `desktopOnly`.

## Web port (2026-10-07)

**Files.** API `apps/api/src/master/screens/letter-bhet.ts`, shared with Letter Demand through
`letter-common.ts` (LetterBookT lines, LetterNo, overflow checks, print-page helpers). Web
`apps/web/src/screens/LetterBhet.tsx` + `letterCommon.ts` (the Book Detail popup and the
right-click menu, shared with Letter Demand). Print view `apps/web/src/features/print/`. Tests
`apps/api/test/master-letters.integration.test.ts` and `apps/web/e2e/batch-d.spec.ts`.

Ported: the grid (tblSearch), the field panel at the designer's positions, validation (messages
verbatim), New (today, `GetMaxLetterNo`, the default letter verbatim), the Party and Inword F2s
with their fills, the tblSearch F2s, the Book Detail popup (`onlyWhenTextChanged`, generic
summary), Save, Delete (confirm + Security password), Print Report (Selected Column with its
layouts, Send To Excel, Print Bhet Pahoch), Send To › Inword Master, and Utility › Show
Attachments (the "needs the desktop" message).

**Engine additions** (opt-in, used here first):

- `FieldSpec.f2SearchText`: the F2 list's search box starts with the box's text
  (DisplayListForm's SearchText; the Inword box).
- `masterGrid` moved from `book-actions.ts` to `master-common.ts` (another master's grid as an
  F2 list: InwordM here, WorkGivenM in Letter Demand).
- ActionResult kind `print` (`PrintDocument`, `packages/shared/src/print.ts`) and the shared
  **PrintView** (`features/print/PrintView.tsx`, `PrintHost.tsx`): a report window with the
  document as plain A4 sheets, which calls `window.print()` as soon as it opens (and again from
  its Print button), so the user can print or save as PDF. Any action may return it; the generic
  action runner opens it. A document is pages of: a header block (the report logo, heading lines,
  labelled values on the right), body blocks (`lines`, `fields`, `text` kept as written, and
  `table` = repeating rows, optionally numbered) and a footer. The sheets are drawn a second time
  under `<body>` (`#print-report`) so only they print, across as many sheets as needed. Issue Slip
  will reuse it.
- The logo is `apps/web/public/legacy/report-logo.png`, converted from the `.rpt`'s
  `Embedding 3/CONTENTS` BMP (the command above, then PIL to PNG).

**Print Bhet Pahoch is provisional.** The `.rpt` cannot be read, so the layout is an inference
from its data (marked in `letter-common.ts` and shown on screen above the page, never printed):
logo; Letter No and Date (dd/MM/yyyy) on the right; the party name, address and "Mobile No: …";
"Vishay : …"; the letter as written; a numbered table of the books (Book Name, Nakal), left out
when there are none. No institution address, sign-off or fixed wording is invented. Still open:
**the user was asked for a printed sample** of a Bhet Pahoch (and a Demand) to replace this.

**Deliberate differences and desktop bugs fixed:**

- Master and book lines are saved **in one transaction**; the lines are read and rewritten only
  inside it (the desktop deleted them on another connection first, so a failing save lost them).
- **Overflows are validation messages** (new text): "Party Name cannot be longer than 50
  characters", "Party Address … 500", "Mobile No … 10", "Vishay … 250", "Letter No is too large",
  and for a line "Book Name cannot be longer than 2000 characters" / "Nakal is too large".
- **Delete removes the letter's LetterBookT lines** (`TransactionName = 'LetterBhetM'` and
  `TransactionKt`) in the delete's transaction. The 3 existing orphan lines are left alone.
- The server re-checks the "text changed" rule itself (against the stored BookNames), so rows
  sent while the box still reads as loaded are ignored. A popup row with no BookName is dropped
  (the desktop inserted it as an empty line). A new record never runs the desktop's
  `DELETE … WHERE TransactionKt=0`.
- Party F2 with a NULL address puts '' (the desktop threw); an Inword with no From fills nothing
  (the desktop raised an SQL syntax error).
- The letter is saved with CRLF line breaks, as the desktop's TextBox gives (a browser textarea
  gives LF); Bhet still saves it untrimmed.
- `lockable: false`: Ctrl+L / Ctrl+U ask for the password and then show the engine's
  "Invalid column name 'Locked'." (the desktop's SQL error), changing nothing.
- Print uses the grid's current row, as the desktop; with no row nothing happens (the desktop
  throws).
- Kept (harmless quirks): no LetterNo uniqueness check; Copy does not copy the book lines (the
  loaded record still matches the box); `TableKt` not read at all (it was never used). Not
  copied: Work Report and Copy start disabled on the desktop until the first Save/Cancel; on the
  web they follow the engine's usual toolbar state (the form never logs a work report, so the
  Work Report popup has nothing of its own to show).
