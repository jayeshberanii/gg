# Letter Demand (`LetterDemandM` + `LetterBookT`)

Desktop form: `GGLibrarySolution/Library/Issue/frmLetterDemandM.vb` (+ `.Designer.vb`, title
"Letter Demand"), repository `Library.BusinessContract/Concrete/LetterDemandMRepository.vb`,
entity `Library.Entity/EntLetterDemandM.vb` (which also holds `EntLetterBookT`). Report:
`Library/CrystalReports/LetterDemandReport.rpt`, fed by the stored procedure `Rpt_LetterDemand`.
Menu: Issue › Letter Demand (no visibility rule, so everyone sees it).

The form records a letter **requesting** books or magazine issues from a publisher, author or
party. It is a near-line-for-line twin of `frmLetterBhetM`. **Read `letter-bhet.md` first.** This
note lists only what differs, plus everything specific to Demand. The two diffs
(`diff frmLetterBhetM.vb frmLetterDemandM.vb` and the repositories) are small.

Base class `frmMasterPage`, opened maximized, `ClientSize` 1012×708. `SplitContainer1` is
horizontal, at (0,54), 1008×642, with `SplitterDistance = 294`. `dgMain` is at (0,4), 1001×327.

## Table and key

- `LetterDemandM`, PK `LetterDemandMkm` (IDENTITY). 1,250 rows. There are no triggers.
- **No `Locked` column**, so `lockable: false` (Ctrl+L / U fails on the desktop, as in Bhet).
- Columns:

  | Column               | Type                   |
  | -------------------- | ---------------------- |
  | `LetterDate`         | date NOT NULL          |
  | `LetterNo`           | int                    |
  | `LetterTypekt`       | **int NOT NULL**       |
  | `ConcernedPersonKt`  | int                    |
  | `PartyName`          | nvarchar(200)          |
  | `PartyAddress`       | nvarchar(500)          |
  | `Vishay`             | nvarchar(250)          |
  | `Letter`             | nvarchar(max)          |
  | `PagesAttached`      | int                    |
  | `FollowUpRem`        | nvarchar(250)          |
  | `NextReminderDt`     | date                   |
  | `StatusTypekt`       | int                    |
  | `StatusRemark`       | nvarchar(150)          |
  | `WorkGivenMkt`       | int                    |
  | `MagazineKt`         | int                    |
  | `AuthorKt`           | int                    |
  | `PrakashakKt`        | int                    |
  | `enuser`, `endate`   | NOT NULL (`getdate()`) |
  | `moduser`, `moddate` | —                      |

- Book lines: `LetterBookT` with **`TransactionName = 'LetterDemandM'`**, and `TransactionKt` =
  `LetterDemandMkm`. See `letter-bhet.md` › How LetterBookT tells Bhet lines from Demand lines.
  There are 2,942 lines.

## Fields

Three columns: labels at x = 8 / 368 / 682, inputs at x = 165 / 517 / 840. All inputs are 29
high in Times New Roman 14.25pt. TabIndex is in brackets.

| y   | Col 1                                                                                                       | Col 2                                                                                                  | Col 3                                                                |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 18  | "Letter Date" → `dtpLetterDate` [1] (w 197, `dd-MM-yyyy`)                                                   | "Letter No" → `txtLetterNo` [27] (w 161)                                                               | "NextReminder Date" → `dtpNextReminderDt` [19] (w 158, `dd-MM-yyyy`) |
| 54  | "Concerned Person" → `txtConcernedPersonKt` [29] (w 197)                                                    | "Letter Type" → `txtLetterTypekt` [11] (w 161)                                                         | "Status Type" → `txtStatusTypekt` [21] (w 158)                       |
| 90  | "Party Name/Author" → **two boxes**: `txtPartyName` [3] (165, w 99) and `txtAuthorKt` [32] (265, w 97)      | "Vishay/Prakashak" → **two boxes**: `txtVishay` [13] (517, w 81) and `txtPrakashakKt` [33] (599, w 79) | "Status Remark" → `txtStatusRemark` [23] (w 158)                     |
| 126 | "Party Address" → `txtPartyAddress` [5] (w 197)                                                             | "Page Attached" → `txtPagesAttached` [15] (w 161)                                                      | "WorkGivenMkt" → `txtWorkGivenMkt` [25] (w 158)                      |
| 162 | "Book Detail" → `txtBookTran` [7] (w 197)                                                                   | "FollowUp Remark" → `txtFollowUpRem` [17] (w 161)                                                      | "Magazine" → `txtMagazineKt` [31] (w 158)                            |
| 198 | "Letter" → `txtLetter` [9] at (165,198), **840×84, Multiline, vertical scrollbar, Times New Roman 14.25pt** |                                                                                                        |                                                                      |

| Column                                      | Notes                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LetterDate`                                | New sets it to `Now`                                                                                                                                                                                                    |
| `LetterNo`                                  | New: `SELECT ISNULL(max(LetterNo),0)+1 FROM LetterDemandM`. Editable, no uniqueness check. **The local DB has duplicates**: 1,250 rows but 1,134 distinct numbers (for example 282–287 twice each). Keep it unvalidated |
| `ConcernedPersonKt` / `ConcernedPersonName` | F2 PartyM                                                                                                                                                                                                               |
| `PartyName`                                 | **free text**. F2 is a one-column list of all party, prakashak and author names; only the text is used. Required                                                                                                        |
| `AuthorKt` / `AuthorName`                   | F2 authmast. Used by the report (books by this author)                                                                                                                                                                  |
| `PartyAddress`                              | text. F2 lists earlier values (no auto-fill from the party, unlike Bhet)                                                                                                                                                |
| `LetterTypekt` / `LetterTypeName`           | F2 columnmaster `lettertype` (one row locally). Required                                                                                                                                                                |
| `Vishay`                                    | text. F2 lists earlier values                                                                                                                                                                                           |
| `PrakashakKt` / `PrakashakName`             | F2 prakmast. Used by the report (books by this publisher)                                                                                                                                                               |
| `PagesAttached`                             | int, `Val(text)`                                                                                                                                                                                                        |
| `FollowUpRem`                               | text. F2 lists earlier values                                                                                                                                                                                           |
| `NextReminderDt`                            | date picker, **always saved** (`MM-dd-yyyy`). New does not reset it (it keeps the last record's date)                                                                                                                   |
| `StatusTypekt` / `StatusTypeName`           | F2 columnmaster `WorkStatus`: Pending, Running, Returned, Returned(AD), Completed, Stop                                                                                                                                 |
| `StatusRemark`                              | text. F2 lists earlier values                                                                                                                                                                                           |
| `WorkGivenMkt` / `WorkGivenMName`           | F2 = the WorkGivenM grid. The text is `WorkRemark`                                                                                                                                                                      |
| `MagazineKt` / `MagazineName`               | F2 magazines with missing issues (below). Used by the report                                                                                                                                                            |
| `Letter`                                    | saved **trimmed** (Bhet saves it untrimmed). F2 lists earlier letters                                                                                                                                                   |
| `BookTran`                                  | the `LetterBookT` popup, exactly as in Bhet but with `'LetterDemandM'`                                                                                                                                                  |

There is **no MobileNo** and **no inwordkt** on Demand.

**New default `txtLetter` text.** The first line ends with CRLF. Lines 2, 4 and 6 below **do not**
end with CRLF: `St.Append` without `& vbCrLf`, so they run straight into the next line with no
space ("…संरक्षक,गच्छाधिपति…", "…यहलक्ष्य…", "…प्रकाशितपुस्तक/…"). The last line also has no CRLF.
The leading spaces are 10 spaces. Keep the text verbatim, glued words included; the saved letters
look like this.

```
सादर प्रणाम,⏎
          प्रावचनिक प्रभावक षड्दर्शनविशारद प. पू. मुनिप्रवर श्री मोहजितविजयजी म. सा. तथा उनके पट्टधर वर्तमानश्रुतमर्मज्ञाता, धर्मतीर्थसंरक्षक,
गच्छाधिपति प. पू. आचार्य भगवंत श्रीमद्विजय युगभूषणसूरीश्वरजी महाराजा (पंडित म. सा.) के मार्गदर्शन में हमारी संस्था सन् 1992 में स्थापित हुई है ।⏎
          उपलब्ध श्रुतज्ञान का दोहन करके संलग्न शास्त्रपाठों से युक्त 10,008 विषयों का समृद्ध विशाल ज्ञानकोष का सर्जन करना संस्था का मुख्य लक्ष्य हैं । यह
लक्ष्य के साथ साथ संस्था में ज्ञानभंडार का भी निर्माण हुआ है,  जिसमें 1,25,000 से अधिक पुस्तकें/प्रतें उपलब्ध हैं । जिसके कारण पू. साधु-साध्वीजी
भगवंतों को स्वाध्याय, संशोधन  हेतु, ग्रंथ सुलभता से प्राप्त होते हैं ।⏎
          आपके /आपकी संस्था द्वारा प्रकाशित निम्नलिखित पुस्तक/प्रत/मेगेझिन हमारे ज्ञानभंडार को भेट स्वरूप में भेजिये और साथ में आपके द्वारा प्रकाशित
पुस्तक/प्रत/मेगेझिन की सूचि भी भेजिये ऐसी नम्र विनंती है ।
```

(⏎ marks a real CRLF. The other line breaks above are only for readability: those pieces are
concatenated directly. Copy the exact literals from `frmLetterDemandM.vb` `btnNew_Click`, lines
264–270. The two older variants there are commented out.)

At load, Work Report and Copy are disabled, as in Bhet. There is no `insertworkreports`
(`workReport: false`) and no entry label.

## Validation (`LetterDemandMRepository.GetValidationMessage`)

Run after "Are You Sure to Save This Record?":

1. `LetterTypekt = 0` → `"Please Enter Letter Type"`
2. `PartyName = ""` → `"Please Enter Party Name"`

Then `"Record Saved Successfully"`.

## F2 lookups

All come from tblSearch except Work Given. The rows exist locally.

| Field                                                   | Source                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concerned Person                                        | `select partyMkm,PName from PartyM where ISNULL(PName,'')<>''  order by PName`                                                                                                                                                                                                                                                                                                                     |
| Party Name                                              | `select distinct PName AS Name from PartyM where ISNULL(PName,'')<>'' union all select distinct prakname AS Name from prakmast where ISNULL(prakname,'')<>'' union all select distinct authorname as name from authmast order by Name` (one column, so the text is all that is picked)                                                                                                             |
| Author                                                  | `select authorcokm,txtAuthorName AS Author,Identyty,txtGuru AS Guru,visheshMast.Vishesh AS Sampraday,txtParampara AS Parampara from authmast inner join visheshMast on authmast.Sampradaykt=visheshMast.Tid order by txtAuthorName`. Note the INNER JOIN: authors with no Sampraday are not listed. Keep this                                                                                      |
| Prakashak                                               | `select prakcodekm,prakname from prakmast order by prakname`                                                                                                                                                                                                                                                                                                                                       |
| Letter Type                                             | `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='lettertype' ORDER BY Name`                                                                                                                                                                                                                                                                                                               |
| Status Type                                             | `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='WorkStatus' ORDER BY Name`                                                                                                                                                                                                                                                                                                               |
| Magazine                                                | `SELECT distinct M.Magazinekm,M.MName FROM MagazineM M INNER JOIN MagBookmT MB ON M.Magazinekm=MB.Magazinekt INNER JOIN BookM B ON Mb.bookmastkt=B.BookMastkm LEFT JOIN columnmaster colPubStatus ON M.PubStatuskt=colPubStatus.ColumnMastkm WHERE ((ISNULL(MissingaAnk,'')<>'' ) OR (B.txtBookTran LIKE'%EB%' AND ISNULL(MB.MissingYr,'')='' AND ISNULL(MB.MissingaAnk,'')='')) order by M.MName` |
| Work Given (`txtWorkGivenMkt`)                          | **inline**: the WorkGivenM grid rows (`ListGridData('WorkGivenM','WorkGivenMKm')`: WorkGivenMKm, WorkRemark, VibhagName, StatusName, GivenToName, GivenDt, ItemName, WorkTypeName, StatusDate, GivenbyName, StatusRem, …), select-first, searching for the box text. Text = WorkRemark, Tag = WorkGivenMKm. 4,684 rows                                                                             |
| PartyAddress, Vishay, FollowUpRem, StatusRemark, Letter | `select <col> from LetterDemandM where isnull(<col>,'')<>'' group by <col> order by <col>`                                                                                                                                                                                                                                                                                                         |
| Book Detail                                             | popup: `select LetterBookKm,BookName,Nakal from LetterBookT where TransactionKt in ({Id}) AND TransactionName='LetterDemandM'`                                                                                                                                                                                                                                                                     |
| Letter No, Pages Attached                               | no F2EntryText: nothing happens                                                                                                                                                                                                                                                                                                                                                                    |

## Child table

The same as Bhet, with `'LetterDemandM'`: delete-then-insert, only when the BookTran text changed.
The same non-transactional bug (below) applies.

## Grid columns

From the Designer (15 columns, `AutoGenerateColumns = False`). Width is 100 where not given.

| #   | Header           | Bound                 | Width             |
| --- | ---------------- | --------------------- | ----------------- |
| 0   | Id               | `LetterDemandMkm`     | 5                 |
| 1   | LetterNo         | `LetterNo`            | 100               |
| 2   | Letter Date      | `LetterDate`          | 100, `dd-MM-yyyy` |
| 3   | Concerned Person | `ConcernedPersonName` | 100               |
| 4   | Party Name       | `PartyName`           | 120               |
| 5   | Party Address    | `PartyAddress`        | 180               |
| 6   | Letter Type      | `LetterTypeName`      | 130               |
| 7   | Vishay           | `Vishay`              | 150               |
| 8   | Pg. Attach       | `PagesAttached`       | 100               |
| 9   | Followup Rem     | `FollowUpRem`         | 100               |
| 10  | NextRem Date     | `NextReminderDt`      | 100, `dd-MM-yyyy` |
| 11  | Status Type      | `StatusTypeName`      | 120               |
| 12  | Status Remark    | `StatusRemark`        | 100               |
| 13  | WorkGiven        | `WorkGivenMName`      | 100               |
| 14  | Magazine         | `MagazineName`        | 100               |

The tblSearch grid rows exist (GridSeq 0–14). `AuthorName` and `PrakashakName` are fetched but not
shown. Order: `LetterDemandMkm DESC`, with no default condition.

**Row colour (`dgMain_CellFormatting`, applied to every cell of the row):**

- Status Type = "running" (trimmed, case-insensitive) and `NextReminderDt < Now` → **Red**
  (overdue reminder).
- Otherwise, Status Type = "completed" → **Green**.
- Otherwise → Black.

No row has a NULL `NextReminderDt` locally. On the desktop a NULL would throw a MsgBox per cell; on
the web, treat NULL as not overdue. The engine already has this: `ScreenSpec.rowTextColor(row)` (`MasterGrid` `getRowStyle`).

## Delete

The same as Bhet: confirm → password → plain DELETE, no in-use check, and the `LetterBookT` lines
are left behind (7 orphans locally). Web fix: delete the lines too.

## Right-click menu (`cntMain`)

| Item                           | Behaviour                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print Report › Selected Column | engine's (no Config_Master rows locally)                                                                                                                                                                                                                                                                    |
| Print Report › Send To Excel   | engine's                                                                                                                                                                                                                                                                                                    |
| Print Report › Print Demand    | `LetterDemandReport.rpt` with parameter `LetterDemandMkm` = the current row → `frmReport`. Web: the HTML print view (below)                                                                                                                                                                                 |
| Send To › WorkGiven Master     | `SELECT ISNULL(STUFF((SELECT DISTINCT ',' + CAST(WorkGivenMKt AS VARCHAR) FROM LetterDemandM WHERE LetterDemandMKm IN(<ids>) FOR XML PATH('')),1,1,''),0)` → if not ""/"0", open Work Given, else `"No Record Found"`. Work Given is not ported, so the web gives the "not available on the web yet" result |
| Utility › Show Attachment      | `frmAttachments` → `AttachmentsDialog` (see author-master.md, "Attachments")                                                                                                                                                                                                                                |

There is no Send To for Author, Prakashak or Magazine, despite the plan's hint. Those are FK
fields on the form (F2 lookups), not menu links.

## Reports and printing: `LetterDemandReport.rpt` → HTML print view

The `.rpt` is encrypted (see `letter-bhet.md`). What it is known to contain:

- the same eight sections as Bhet (Report Header, page headers a–d, Details, Report Footer, Page
  Footer)
- one parameter `LetterDemandMkm`
- the same Geetarth Ganga logo BMP embedded twice
- extra streams `ReportParametersStream`, `MemoValuesStream`, `SavedRecordsStream` and
  `DataSourceManager`, which mean saved data and a stored-procedure data source

The data source is almost certainly **`dbo.Rpt_LetterDemand @LetterDemandMkm`**. It is the only
letter report proc in DBLibSQL (created 2017-07-08), and its parameter name equals the report's.
Verbatim:

```sql
CREATE PROCEDURE Rpt_LetterDemand (@LetterDemandMkm INT) AS BEGIN
SELECT DISTINCT 0 AS Sort1,L.LetterDemandMkm,LetterNo,convert(varchar,L.LetterDate,103) AS LetterDate,PartyName AS PName,L.Vishay,L.Letter,ltrim(CASE WHEN ISNULL(MB.MissingYr,'')<>'' THEN '-' + MB.MissingYr ELSE '' END + CASE WHEN ISNULL(MB.MissingaAnk,'')<>'' THEN ' ' + MB.MissingaAnk ELSE '' END) AS BookName,0 AS Nakal,
(select ISNULL(STUFF((select ',' + PrakMAddT.PrakashakName from PrakMAddT where Magazinekt=L.MagazineKt for xml path('')),1,1,''),'')) AS Prakashak
FROM LetterDemandM L
INNER JOIN MagBookmT MB ON L.MagazineKt = MB.Magazinekt
INNER JOIN BookM BM ON MB.BookMastkt=BM.BookMastkm
WHERE (ISNULL(MB.MissingYr,'')<>'' OR ISNULL(MB.MissingaAnk,'')<>'') AND L.LetterDemandMkm=@LetterDemandMkm
union all
SELECT DISTINCT 1 AS Sort1,L.LetterDemandMkm,LetterNo,convert(varchar,L.LetterDate,103) AS LetterDate,PartyName AS PName,L.Vishay,L.Letter,B.BookName + IIF(isnull(B.Part,'')='','','-' + B.Part) AS BookName,1 AS Nakal,P.prakname AS Prakashak
FROM LetterDemandM L
INNER JOIN prakmast P ON L.PrakashakKt=P.prakcodekm
INNER JOIN praksnPrakT PP ON PP.prakashakkt=P.prakcodekm
INNER JOIN BookM B ON PP.prakashannokt=B.BookMastkm
INNER JOIN BookT BT ON B.BookMastkm=BT.BookMastkt
WHERE BT.Libno LIKE 'ob%' AND L.LetterDemandMkm=@LetterDemandMkm
union all
SELECT DISTINCT 1 AS Sort1,L.LetterDemandMkm,LetterNo,convert(varchar,L.LetterDate,103) AS LetterDate,PartyName AS PName,L.Vishay,L.Letter,B.BookName + IIF(isnull(B.Part,'')='','','-' + B.Part) AS BookName,1 AS Nakal,A.authorname AS Prakashak
FROM LetterDemandM L
INNER JOIN authmast A ON L.AuthorKt=A.authorcokm
INNER JOIN praksnAuthorAuthT PP ON PP.authorkt=A.authorcokm
INNER JOIN BookM B ON PP.prakashannokt=B.BookMastkm
INNER JOIN BookT BT ON B.BookMastkm=BT.BookMastkt
WHERE BT.Libno LIKE 'ob%' AND L.LetterDemandMkm=@LetterDemandMkm
union all
SELECT DISTINCT 2 AS Sort1,L.LetterDemandMkm,LetterNo,convert(varchar,L.LetterDate,103) AS LetterDate,L.PartyName AS PName,L.Vishay,L.Letter,ISNULL(LB.BookName,'') AS BookName,ISNULL(LB.Nakal,0) AS Nakal,'' AS Prakashak
FROM LetterDemandM L
LEFT JOIN LetterBookT LB ON L.LetterDemandMkm=LB.TransactionKt and LB.TransactionName='LetterDemandM'
WHERE L.LetterDemandMkm=@LetterDemandMkm
END
```

The result has one row per item. Every row repeats the header fields: `LetterNo`, `LetterDate`
(`dd/mm/yyyy`), `PName`, `Vishay` and `Letter`. The items are:

- **Sort1 = 0:** the chosen Magazine's **missing issues**. `BookName` = "-<MissingYr> <MissingaAnk>",
  and `Prakashak` = the magazine's publisher names from PrakMAddT.
- **Sort1 = 1:** books (`BookName[-Part]`) of the chosen **Prakashak** or **Author** whose copies
  have a `LibNo` starting with `ob` (4,130 BookT rows match). Nakal = 1, and `Prakashak` = the
  prakashak or author name. The meaning of the `ob` prefix is not in the code; ask the user if it
  matters for the layout.
- **Sort1 = 2:** the `LetterBookT` lines typed in the Book Detail popup. The LEFT JOIN means one
  row with an empty BookName when there are none.

`DISTINCT` per branch, `UNION ALL` across branches, **no ORDER BY**. The report presumably groups
or sorts on `Sort1`, so the HTML should order by Sort1 and then by the server's order. Running the
SELECT for id 1295 locally returns Sort1 = 1 and Sort1 = 2 rows.

**Web plan.**

- The API runs the same SELECT, parameterised. Call the proc itself
  (`EXEC Rpt_LetterDemand @id`), since it is read-only and owned by the shared DB, or inline its
  text.
- **Proposed A4 layout** (an inference until the user supplies a printed sample):
  1. Logo header.
  2. Letter No and Date.
  3. "To" `PName`.
  4. Vishay.
  5. The `Letter` body (`pre-wrap`).
  6. A numbered list of the items, grouped by Sort1:
     - missing magazine issues (with the publisher)
     - the publisher's / author's books
     - the requested books, with Nakal
  7. Footer.
- Hide empty BookName rows.
- **Open question:** a real printout of the Demand letter. The same request covers Bhet.

## Permissions

The menu item is visible to everyone. There is no owner or lock rule.

## Desktop bugs

- **Data-corrupting:** the same as Bhet. `DeleteTransaction` deletes the book lines before a
  `Save` that can still fail. The likely failure here: `PartyName` > 200 or `StatusRemark` > 150
  characters (truncation), or `Val` overflow. Web: one transaction plus max-length validation.
- **Data leftover:** Delete leaves the `LetterBookT` lines behind. Web: delete them.
- **Throws:** Ctrl+L / U (no `Locked` column). Web: `lockable: false`.
- **Throws (latent):** `CellFormatting` on a NULL `NextReminderDt`. Web: treat it as not overdue.
- **Harmless quirk:** duplicate `LetterNo`s exist (no check). Keep.
- **Harmless quirk:** the default letter text has three missing spaces (lines glued). Keep verbatim.
- **Harmless quirk:** New keeps the previous `NextReminderDt`.

## SQL in form event handlers

The Work Given F2 (`ListGridData('WorkGivenM','WorkGivenMKm')`), the Send To WorkGiven query,
`GetMaxLetterNo`, and the unused `TableKt` read (the same as Bhet).

## Implementation hints

- Build Demand with Bhet's definition, parameterised: one shared helper for the
  `LetterBookT` trans and the save/delete with `TransactionName`, plus two `ScreenDefinition`s.
  - `table: 'LetterDemandM'`, `primaryColumn: 'LetterDemandMkm'`, `lockable: false`,
    `workReport: false`
  - `newDefaults` → `LetterNo`, `LetterDate`, `Letter`
- Fields: the two paired boxes on y 90 (PartyName + AuthorKt, Vishay + PrakashakKt) are ordinary
  fields placed side by side. The labels "Party Name/Author" and "Vishay/Prakashak" cover both.
- `lookups.WorkGivenMkt`: the WorkGivenM grid list (it can reuse the master list SQL for
  `WorkGivenM` from tblSearch, even though the screen is not ported).
- Grid row colouring: `ScreenSpec.rowTextColor` (exists).
- Print: reuse the PrintView from Letter Bhet. Use an action `printDemand(ids[0])` that returns the
  proc's rows.

## Web port (2026-10-07)

**Files.** API `apps/api/src/master/screens/letter-demand.ts` on the shared `letter-common.ts`;
web `apps/web/src/screens/LetterDemand.tsx` on the shared `letterCommon.ts`. Tests in
`apps/api/test/master-letters.integration.test.ts` and `apps/web/e2e/batch-d.spec.ts`. Everything
in `letter-bhet.md` › Web port that is not Bhet-specific applies here too (one transaction for
master and lines, Delete removes the lines — the 7 existing orphans are left alone — the server's
own "text changed" check, blank popup rows dropped, CRLF letters, `lockable: false` (Ctrl+L / U end in
the desktop's "Invalid column name 'Locked'."), the shared
PrintView).

Ported: the grid with `dgMain_CellFormatting`'s colours (`rowTextColor`: Running with a past
NextReminderDt red, Completed green; a NULL date is not overdue, where the desktop threw per
cell), the three-column panel with the two paired boxes under one label each, validation
verbatim, New (today, `GetMaxLetterNo`, the default letter verbatim with its glued pieces; the
NextReminder date is kept, as on the desktop), every tblSearch F2 (Author keeps its INNER JOIN),
the Work Given F2 (the WorkGivenM grid via `masterGrid`, search box seeded with the box's text:
`FieldSpec.f2SearchText`), the Book Detail popup, Save (Letter trimmed; NextReminderDt always
saved), Delete, Print Report (Selected Column, Send To Excel, Print Demand), Send To › WorkGiven
Master (Work Given is not on the web yet, so that window says so; no linked record gives "No
Record Found"), Utility › Show Attachment.

**Overflow messages** (new text): "Party Name cannot be longer than 200 characters", "Party
Address … 500", "Vishay … 250", "FollowUp Remark … 250", "Status Remark … 150", "Letter No is too
large", "Page Attached is too large".

**Print Demand is provisional** (see letter-common.ts). It runs `EXEC Rpt_LetterDemand @id`
(parameterised) and lays the rows out like Letter Bhet: logo, Letter No and Date, "PName",
"Vishay : …", the letter, then one numbered table per Sort1 group, each left out when empty:
"Magazine (missing issues)" (Issue, Prakashak), "Books" (Book Name, Prakashak / Author: the
Prakashak's or Author's books held only as `ob…` copies) and "Book Detail" (Book Name, Nakal);
rows with an empty BookName are dropped. The group titles are the web's own words until the user
sends a printed sample (asked).
