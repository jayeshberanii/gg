# Graphics Master (`GraphicBKM`)

Desktop form: `GGLibrarySolution/Library/Graphics/frmGraphicMaster.vb` (+ `.Designer.vb`, title
"Graphic Master"). It inherits `Library.frmMasterPage`. Repository:
`Library.BusinessContract/Concrete/GraphicBKMRepository.vb`. Entity: `Library.Entity/EntGraphicBKM.vb`.
Menu: Graphics › Graphics Master (`screen('graphics-master', …)` in `menu.ts`).

There is one graphics master row per book that has pictures. Graphics Detail (`graphicbkt`, one row
per picture) hangs off it through `graphicbkt.Graphickt`.

Status: **ported 2026-10-08** (see "Web port" at the end for what the web does differently). These
notes come from the desktop source and the local DBLibSQL (2026-10-05), checked again against
`frmGraphicMaster.vb`, `GraphicBKMRepository.vb` and `SetForm_GraphicMaster` while porting.

## Table and key

- Table `GraphicBKM`, PK `graphicBkm`, an **IDENTITY** column. The desktop reads `SELECT @@identity`.
  The web must use `SCOPE_IDENTITY()` / `OUTPUT inserted`, never MAX + 1.
- 1,340 rows. 1,339 have `BookTKt > 0`, and `recno` has 1,320 distinct values. There are no triggers.
- `Locked bit` exists. Ctrl+L / Ctrl+U are custom (see Permissions).
- Audit columns: `enuser`/`endate` on insert, `moduser`/`moddate` on update (`date`, `getdate()`).
- Dead columns, never written: `vishesh_Revoke nvarchar(150)` and `operatorkt_Revoke int`. Vishesh
  and Operator moved to child tables. `libno nvarchar(20)` is never written either: `Ent.libno` is
  set but not in the INSERT/UPDATE. It is only read as a fallback, in the LibNo join
  (`CASE WHEN ISNULL(BookTKt,0)=0 THEN GraphicBKM.libno …`).

## Fields

Labels and text boxes are Times New Roman 14.25. Positions are inside `SplitContainer1.Panel1`.
SplitContainer1 is at (0,54), 1008×642, SplitterDistance 382.

| Tab | Label (x,y)             | Control (x,y, w×h)                                                                            | Column                                   | Notes                                                                                                                                                                                                                                |
| --- | ----------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Rec No (13,22)          | `txtrecno` (136,18, 227×29)                                                                   | `recno int`                              | `Val()`. Required. tblSearch has no F2 text                                                                                                                                                                                          |
| 3   | Lib No (379,22)         | `txtBookTKt` (493,18, 195×29)                                                                 | `BookTKt int` (+ display `BookTName`)    | Required. **Inline F2** (below). Picking a book also fills Book Name, Samvat Type, Samvat and Vik Samvat                                                                                                                             |
| 5   | Vishesh (13,62)         | `txtVisheshTran` (136,58, 227×29)                                                             | child `GrBookWordT` typenm `Vishesh`     | Popup. The text is a comma list of `wordnm`                                                                                                                                                                                          |
| 7   | Subject (379,62)        | `txtGrbookSubTran` (493,58, 195×29)                                                           | child `GrbookSubT`                       | Popup                                                                                                                                                                                                                                |
| 9   | Samvat Type (13,102)    | `txtsamvtypeKt` (136,98, 227×29)                                                              | `samvtypekt int` (+ `SamvTypeName`)      | F2 `select Samvatcokm,Samvatname from Samvmast ORDER BY SAMVATCOKM DESC` (AddTableInfo `Samvmast`). Leaving the box recomputes Vik Samvat                                                                                            |
| 11  | Samvat (379,102)        | `txtsamvat` (493,98, 117×29)                                                                  | `samvat nvarchar(50)`                    | F2 `select sadivalue,sadinm from sadimst order by sadinm`: the text gets `sadinm` and the Tag gets `sadivalue`. Leaving the box recomputes Vik Samvat                                                                                |
| 12  | —                       | `txtviksamvat` (611,98, 77×29)                                                                | `viksamvat int`                          | Derived but editable. See Derived values                                                                                                                                                                                             |
| 14  | Finalized Date (13,142) | `txtfinalizeddate` DateTimePicker (136,138, 227×29), custom `dd-MM-yyyy`                      | `finalizeddate date`                     | **Always saved**, today by default, even when Finalized is off. The data shows this (e.g. `finalized=false`, date set)                                                                                                               |
| 16  | Material (379,142)      | `txtMaterialTran` (493,138, 195×29)                                                           | child `GrBookWordT` typenm `Material`    | Popup                                                                                                                                                                                                                                |
| 18  | Proof By (13,182)       | `txtProofByTran` (136,178, 227×29)                                                            | child `GrBookProofByT`                   | Popup                                                                                                                                                                                                                                |
| 20  | WorkDone By (379,182)   | `txtworkdonebykt` (493,178, 195×29)                                                           | `workdonebykt int` (+ `WorkDoneByName`)  | F2 `select ColumnMastkm,Name from columnmaster where Vibhag = 'DoneBy' order by Name`                                                                                                                                                |
| 22  | Grade/Quality (13,222)  | `txtgrade` (136,218, 112×29)                                                                  | `grade nvarchar(30)`                     | F2 `select GrwordMkm,wordnm,defination,remark from GrwordM where typenm='grade'`. Stored as **text** (`wordnm`)                                                                                                                      |
| 23  | (same label)            | `txtQualityKt` (251,218, 112×29)                                                              | `QualityKt int` (+ `QualityName`)        | F2 `select GrwordMkm,wordnm,defination,remark from GrwordM where typenm='Quality'`                                                                                                                                                   |
| 25  | Book Name (379,222)     | `txtbkname` (493,218, 195×29)                                                                 | `bkname nvarchar(255)`                   | Filled by the Lib No F2. Editable                                                                                                                                                                                                    |
| 27  | Available At (13,262)   | `txtavailableat` (136,258, 227×29)                                                            | `availableat nvarchar(150)`              | F2 `select GrwordMkm,wordnm,defination,remark from GrwordM where typenm='availableat'`. Stored as **text** here (Graphics Detail uses word rows instead)                                                                             |
| 29  | Style (379,262)         | `txtStyleTran` (493,258, 195×29)                                                              | child `GrBookWordT` typenm `Style`       | Popup                                                                                                                                                                                                                                |
| 31  | Creator Type (13,302)   | `txtCreatorTypeTran` (136,298, 227×29)                                                        | child `GrBookWordT` typenm `CreatorType` | Popup                                                                                                                                                                                                                                |
| 33  | Creator (379,302)       | `txtCreatorTran` (493,298, 195×29)                                                            | child `GrBookWordT` typenm `Creator`     | Popup                                                                                                                                                                                                                                |
| 35  | Remark (13,342)         | `txtremark` (136,338, 227×29)                                                                 | `remark nvarchar(255)`                   | F2: the distinct existing remarks                                                                                                                                                                                                    |
| 37  | Color (379,342)         | `txtcolor` (493,338, 195×29)                                                                  | `color nvarchar(10)`                     | F2: the distinct existing colors                                                                                                                                                                                                     |
| 39  | Comment (720,302)       | `txtcomment` (823,298, 153×29)                                                                | `comment nvarchar(255)`                  | F2: the distinct existing comments                                                                                                                                                                                                   |
| 41  | Other LibNo (720,342)   | `txtotherlibno` (823,338, 153×29)                                                             | `otherlibno nvarchar(200)`               | F2: the distinct existing values                                                                                                                                                                                                     |
| 0   | —                       | `chkFinalized` "Finalized" (703,30)                                                           | `finalized bit`                          | **On the form, not in Panel1** (the strip above the split). `clsCom.clear(Panel1)` on New therefore **does not reset it** (quirk: it carries over)                                                                                   |
| 1   | —                       | `chkPending` "Pending" (788,30)                                                               | `pending bit`                            | Same as Finalized                                                                                                                                                                                                                    |
| —   | —                       | `PicImage` (724,18, 252×229) and `<< < > >>` buttons (724–930, 247), `txtImgRecNo` (disabled) | —                                        | **Dead UI.** `DisplayImage()` sets `Image = Nothing`. Its body is commented out. FillData still runs `select filepath from GraphicBKT where Graphickt=<id>`. On the web show the "needs the desktop" message, or just an empty frame |

The F2 lists not named inline above come from the tblSearch `F2EntryText` of the column (the engine reads
them live). The column is `txt.Name.Substring(3)`, or with a trailing `Name` stripped. `txtbkname`'s
F2EntryText is empty.

Lib No inline F2 (`Txt_KeyDown`, `txtBookTKt`):

```sql
select T.Tid,T.Libno,M.BookName + CASE WHEN ISNULL(M.Part,'')<>'' THEN '(' + M.Part + ')' ELSE '' END AS BookName,
       S.samvatname,M.PSamvat,T.bookmastkt,M.PSamvatcokt
from BookT T inner join BookM M on T.BookMastkt=M.BookMastkm
LEFT JOIN samvmast S ON M.PSamvatcokt=S.samvatcokm
WHERE ISNULL(T.LibNo,'')<>'' order by T.Libno
```

A pick sets: `txtbkname = BookName`, `txtBookTKt = Libno`/Tag `Tid`, `txtsamvtypeKt = samvatname`/Tag
`PSamvatcokt`, `txtsamvat = PSamvat`, then `GetVikramSamvat()`.

F1 on any box: `tblSearch.HelpText` "Table|…|RecordId" opens the ReferenceT1 popup. No GraphicBKM row has
HelpText, so this is effectively dead.

## Validation (`GraphicBKMRepository.GetValidationMessage`)

The form first asks "Are You Sure to Save This Record?" (Yes/No). Then validation stops at the
first failure:

1. `Please Enter RecNo` (when `Val(recno) = 0`)
2. `Please Enter LibNo` (when `BookTKt = 0`)

On success: `Record Saved Successfully`.

## Grid columns

The desktop grid is fixed (`GvMain`, `AutoGenerateColumns = False`). The list SELECT is the usual
tblSearch-built one (`ListGridData`), and every `GraphicBKM` tblSearch row exists in the DB.

| Header         | Data column      | Width  |
| -------------- | ---------------- | ------ |
| Id             | `graphicBkm`     | 5      |
| RecNo          | `RecNo`          | 100    |
| LibNo          | `BookTName`      | 100    |
| Book Name      | `bkname`         | 130    |
| Color          | `Color`          | 110    |
| Grade          | `Grade`          | 100    |
| Vishesh        | `VisheshTran`    | 120    |
| Viksamvat      | `VikSamvat`      | 100    |
| Proof By       | `ProofByTran`    | 130    |
| Work DoneBy    | `WorkDoneByName` | 130    |
| Finalized Date | `finalizeddate`  | 100    |
| BookTKt        | `BookTKt`        | hidden |

Grid styles: rows Arial Unicode MS 9, a LightSteelBlue cell style, selection colour (10,36,106), and
Verdana 12 headers. There is no default condition (`DefaultCond = ""`). The window can be opened with
`StrId` (an id list) from Graphics Detail › Show For Selected Records › Graphics Master, and from New
Word / New Vishay Master › Show In Use (`openInUse`).

tblSearch rows (seq order), with JoinConditions:

- `BookTKt` "LibNo" (M): `(SELECT CASE WHEN ISNULL(GraphicBKM.BookTKt,0)=0 THEN GraphicBKM.libno ELSE (SELECT BookT.Libno FROM BookT WHERE tid=GraphicBKM.BookTKt) END) AS BookTName`
- `ProofByTran` "Proof By" (T): a STUFF list of `columnmaster.Name` via `GrBookProofByT.ProofByKt`
- `SamvTypeKt` (M): `… AS SamvTypeName`. `WorkDoneByKt` (M): `… AS WorkDoneByName`. `QualityKt` (M): `(SELECT GrwordM.wordnm …) AS QualityName`
- `VisheshTran`, `CreatorTypeTran`, `CreatorTran`, `MaterialTran`, `StyleTran` (T): STUFF lists of
  `grwordm.wordnm` from `GrBookWordT` with `typenm='Vishesh'`, `'CreatorType'`, `'Creator'`, `'Material'`, `'Style'`
- `GrbookSubTran` "Subject" (T): a STUFF list of `GrVishay.vishaynm` from `GrbookSubT`
- plain M: finalized, pending, endate, finalizeddate, moddate, enuser, graphicBkm, moduser, recno,
  viksamvat, availableat, bkname, color, comment, grade, otherlibno, remark, samvat, Locked

The Type-T rows' `F2EntryText` (with `{Id}`) is the SELECT that loads each popup.

## Derived values

- **Vik Samvat**: `GetVikramSamvat()` runs on Leave of `txtsamvat` / `txtsamvtypeKt` and after the
  Lib No pick. It needs a Samvat Type and a Samvat text:
  `viksamvat = GetVirSamvat(samvtypeKt, IsNumeric(samvat) ? samvat : samvat.Tag) - 470`.
  `GetVirSamvat` (`MdlLib.vb:442`, `vir` per type):
  - type 3 or 7: `s`
  - type 2 or 6: `s+470`
  - type 4: `s+526`
  - type 5: `s+604`
  - type 8: `526-s`
  - type 9: `-s`
  - type 10: `470-s`
  - any other type, or `s <= 0`: 0

  So a non-numeric Samvat (e.g. "15वीं") that was not picked from the sadimst F2 in this session
  gives **-470** (harmless quirk; such rows exist, e.g. `viksamvat=-470`). `AuthorMaster.tsx`
  already has a vir-samvat helper. Extract it to a shared helper.

- There are no human-readable ID generators. `recno` is typed by the user, and duplicates are allowed (see
  Print Duplicate No).

## Child tables saved with the record

`Save(Ent, dtSubject, dtWord, dtProofBy)` runs in one transaction: UPDATE/INSERT the master, then
the children. Each popup is a `frmDisplayTransNew` with `FormName = "GraphicMaster"`
(`SetForm_GraphicMaster`). The popup's rows are loaded from the tblSearch Type-T `F2EntryText`
with `{Id}` = the record id. On popup Save, `seq` is renumbered to `i+1`.

### `GrbookSubT` (Subject). No identity. PK `grbooksubkm`. 55 rows

- Popup `TranName="Subject"`. Columns: `grbooksubkm` (hidden), `grvishaykt` (hidden),
  `vishaynm`, `seq`.
- The vishaynm F2 is `select Grvishaykm,vishaynm,defination,remark,groupnm from GrVishay WHERE ISNULL(IsCancel,0)<>1 order by vishaynm`.
- Saved only if the popup was opened (the DataTable has columns):
  `delete from GrbookSubT where graphicbkt=@id`, then for each row
  `insert into GrbookSubT values(@max+i, @id, grvishaykt, seq)`, where
  `@max = isnull(max(grbooksubkm),0)+1` from `GrbookSubT`. **Delete-then-insert.**

### `GrBookWordT` (Vishesh / CreatorType / Creator / Material / Style). No identity, **no PK**. 3,189 rows

- Popup `TranName="WordTran"`, `TranType` = the type. Columns: `GrBookWordkm`, `grwordkt`,
  `typenm` (all hidden), `wordnm`, `seq`.
- The wordnm F2 is `select GrwordMkm,wordnm,defination,remark from GrwordM where typenm='<TranType>' order by wordnm`
  (AddTableInfo `grwordm|<type>`, so add-new is allowed).
- The box text is a comma list of `wordnm`.
- Save (form `Save()`):
  - In Edit, `dtWord` is first loaded with **all** of the record's word rows. If no word popup was
    opened, all of them are deleted and re-inserted with new ids (pointless churn).
  - If any word popup was saved (`boolCleardtWord`), `dtWord` is rebuilt. It keeps the existing
    rows whose type was "not touched" plus `typenm=''` rows:
    `… WHERE graphicbkt=@id AND (ISNULL(typenm,'')='' OR typenm='<X>' …)`, where type X counts as
    untouched when its DataTable has 0 rows and some other type has rows. All the popups' rows
    are then appended.
  - Repository: `delete from GrBookWordT where graphicbkt=@id`, then
    `insert into GrBookWordT values(@max+i, @id, grwordkt, seq, 'typenm')`.
- Existing typenm values are lowercase: creator 212, vishesh 1751, creatortype 198, style 1016,
  material 12.

### `GrBookProofByT` (Proof By). **IDENTITY** `GrBookProofByKm`. 715 rows

- Popup `TranName="ProofBy"`. Columns: `GrBookProofByKm`, `ProofByKt`, `ProofTypeKt` (hidden),
  `ProofBy`, `ProofType`, `ProofDate`, `Remark` (editable), `Seq`.
- F2s:
  - ProofBy: `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='DoneBy' AND ISNULL(Name,'')<>'' ORDER BY Name`
  - ProofType: `… Vibhag='ProofType' …` (2 rows)
  - ProofDate: an InputBox "Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)", defaulting to
    today. The repository swaps it to MM/dd/yyyy.
- **Upsert, ids kept** (`upsertChildRows` fits):
  - a row with km = 0 gets `INSERT (graphicbkt,ProofByKt,ProofTypeKt,ProofDate,Remark,Seq,Enuser,Endate=getdate())`
  - any other row gets `UPDATE … ,Moduser,Moddate=getdate()`
  - then `DELETE FROM GrBookProofByT WHERE graphicbkt=@id AND GrBookProofByKm NOT IN(<kept>)`
- All of this runs **only when the popup has ≥1 row**.

After save: Add mode inserts the new list row at the top. Edit refreshes the current grid row
(`RefreshCurrentGridRecord` → `GetDataById`, see bugs). `clsCom1.insertworkreports` runs after every save
(Add and Edit).

## Delete

1. `CheckRecordInUse`: `SELECT COUNT(*) FROM graphicbkt WHERE Graphickt=@id`. If any exist, show
   `Record is used in Graphics Detail` (MsgBox titled "Record Cannot Be Deleted").
2. "Are You Sure to Delete This Record?" → Security password (`InputBoxProc()` = `SECURITY_PASSWORD`
   / `_ALT`).
3. `CommonRepository.Delete`: `DELETE FROM GraphicBKM WHERE graphicBkm=@Id`. The current row only.
   Message "Record Deleted " (Information).

The children `GrbookSubT`, `GrBookWordT` and `GrBookProofByT` are **not** deleted: they become orphans
(harmless quirk). The web should delete them in the same transaction. That is safe, because nothing
else reads them.

## Right-click menu (`cntMenu` on the grid)

| Item                                  | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add Detail                            | Opens Graphics Detail in Add mode for the current row: `graphicBkm` = row Id, `libno` = `txtBookTKt.Text`, `WhereCondition = " and Graphickt in (<id>)"`. Asks "Do You Want To Copy Master Data?". **Yes** copies these into the new detail: Vishesh text, remark, grade, color, RecNo, availableat (as text into `txtAvailableAtTran`), samvat type (name re-read from samvmast), samvat, viksamvat and comment. It also copies the Subject / Creator / Vishesh / CreatorType / Style / Material rows (popup tables, columns renamed `grbooksubkm→grdetailSubKm` and `GrBookWordKm→GrDetailWordKm`, with blank Remark/sign/internal added), plus one AvailableAt word row (`SELECT ISNULL(GrwordMkm,0) FROM grwordm WHERE wordnm=N'<availableat>'`). **Engine gap:** open another screen in Add mode with prefilled fields and child rows |
| Print Report › Selected Column        | `clsCom.PrintSelectedColumn` with the `Config_Master` layouts for `ConfigType='GraphicBKM'` ("Mater", "master coloum"; neither has a ShortcutKey, so neither is listed as a sub-item). Engine's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Print Report › Send To Excel          | engine's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Print Full Card                       | empty handler. Dead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Print Duplicate No                    | `FindDuplicate(dt,"RecNo","GraphicBKM","graphicBkm", GetIdFrom_GridRecord(dgMain,"graphicBkm"))` → `select RecNo from GraphicBKM where graphicBkm in(<all grid ids>) group by RecNo having COUNT(RecNo)>1 order by RecNo` → Excel. **Desktop bug (throws):** the grid has no column named `graphicBkm` (it is `colId`), so `dg.Rows(i).Cells("graphicBkm")` throws before any SQL runs (MsgBox). The intent is clear (the RecNos listed more than once among the grid's rows, as Author / Kruti's "Duplicate RecNo"). Web: `duplicate-no` with the ids of every grid row, parameterised, as a `table` result (one column RecNo) sent to Excel                                                                                                                                                                                              |
| For Selected Record › BookM           | `select isnull(STUFF((select ',' + cast(BookMastkt as varchar) from BookT where Tid in (select BookTKt from GraphicBKM where graphicBkm in(<selected ids>)) for XML PATH('')),1,1,''),'')`. Empty → "No Graphics Available for Current Selection". Otherwise opens Book Master with `StrId`. Web: `open` result for `book-master`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| For Selected Record › Graphics Detail | opens Graphics Detail with `WhereCondition " AND Graphickt IN(<selected ids>)"`. Web: open `graphics-detail` filtered by Graphickt (an engine gap if the open result only carries PK ids; alternatively resolve the detail ids server-side: `SELECT graphicBkTkm FROM graphicbkt WHERE Graphickt IN (…)`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Utility › Request For Book(LabIssue)  | For each **selected** row: `EntLabIssueM {LabIssueMkm=0, BookTKt=row.BookTKt, BookTName=row.BookName, enuserKt=me, Forkt=0}` → `LabIssueMRepository.GetValidationMessage`, then `GetUserNotReturnedBook(me,0)`. The first message stops the loop (rows already saved stay). Then `Save` (INSERT LabIssueM). If any was saved: "Book Issued Successfully". **Reuse `book-tran.ts` `request-lab-issue`** (extract a helper). Note that the message text shows the **book name** here, not the LibNo                                                                                                                                                                                                                                                                                                                                          |

## Reports and printing

No `.rpt`. Printing is only Selected Column (Config_Master) and Excel.

## Permissions

- Standard frmMasterPage toolbar with `clsCom.EnableDisableDataEditing(ToolStrip1)`. A row with
  `Locked = True` makes it read-only (`EnableDisableDataEditing(…, True)`).
- At load, Work Report and Copy are disabled (`btnWorkReport.Enabled = False`,
  `btnCopy.Enabled = False`) until the first Save/Cancel re-enables them. Copy only resets to
  Add mode keeping the field values.
- **Ctrl+L / Ctrl+U** need `InputBoxProc("vis123")`. This is a **hard-coded password** and
  `frmDeleteList` also accepts the alt password. Move it to env, e.g. `GRAPHICS_LOCK_PASSWORD`
  (`ctx.assertPassword(p, env.GRAPHICS_LOCK_PASSWORD)`). Then `GraphicBKMRepository.LockUnlockRecords`:

  ```sql
  UPDATE GraphicBKM SET Locked=@lock WHERE graphicBkm IN (<selected ids>);
  UPDATE graphicbkt SET Locked=@lock WHERE Graphickt IN (<selected ids>);
  ```

  The second statement **cascades to all details**. Message: "Locked Successfully in n Records" /
  "Unlocked Successfully in n Records" (with a space). n = rows hit by the first UPDATE. This is not
  the engine's `setLocked` (one table only, and its unlock message lacks the space), so it needs a custom
  action or an engine hook.

- No `curr_utypeid` / user-id checks in the form. Menu gating is in `menu.ts`.

## SQL in form event handlers

- Load: `select ConfigId,ConfigName,ShortcutKey,ConfigStr from Config_Master where ConfigType='GraphicBKM' and isnull(ShortcutKey,'')<>'' order by ConfigName`
- Ctrl+F: `SELECT Id,DisplayName FROM tblSearch where TransactionName='GraphicBKM' and IsSearchable=1 order by seq`
- FillData: `select filepath from GraphicBKT where Graphickt=@id` (for the dead picture box)
- Save (Edit): the GrBookWordT reload above
- Add Detail: the samvmast name and grwordm id lookups above

## Desktop bugs

| Bug                                                                                                                                                                                                                     | Kind                                     | Web                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GrBookWordT` ids come from `max(grbooksubkm)` of **GrbookSubT** (copy-paste). The DB has 2,049 duplicate `GrBookWordkm` values (no PK, so it never throws)                                                             | data-corrupting                          | use `isnull(max(GrBookWordkm),0)+1` from GrBookWordT                                             |
| Every Edit save with no word popup opened deletes and re-inserts all word rows with new (colliding) ids                                                                                                                 | data-corrupting (ids churn)              | touch GrBookWordT only when a word popup was saved                                               |
| Opening the Creator Type popup, emptying it while the other four types are empty in this session: `dtWord = dtCreatorType.Clone` has columns and no rows, so **all** of the record's word rows are deleted (every type) | data-corrupting                          | per type: replace the rows of the types whose popup was saved, keep the others (and `typenm=''`) |
| Emptying one word popup while another type has rows keeps the emptied type's old rows (it can't be cleared)                                                                                                             | harmless quirk → fix with the rule above | same rule                                                                                        |
| ProofBy popup saved with 0 rows deletes nothing, so the last proof-by can't be removed                                                                                                                                  | harmless quirk                           | decide: delete all when the popup is saved empty (recommended)                                   |
| `GetDataById` reads `dr("libno")`, which isn't in the tblSearch SELECT: it throws after `recno`, MsgBox. After an Edit save the grid row shows blanks until refresh                                                     | throws (display only)                    | refresh the row from the list query                                                              |
| Print Duplicate No passes a non-existent column name                                                                                                                                                                    | throws                                   | see the menu table                                                                               |
| Delete leaves orphan child rows                                                                                                                                                                                         | harmless                                 | delete the children too                                                                          |
| New doesn't reset Finalized / Pending (outside Panel1); Finalized Date always saved                                                                                                                                     | harmless quirk                           | keep (decide on the checkboxes)                                                                  |
| Non-numeric Samvat gives viksamvat -470                                                                                                                                                                                 | harmless quirk                           | keep, or look up `sadimst.sadivalue` by `sadinm` (decide)                                        |

## Files / disk

Only the dead picture box (`filepath` of the details). Nothing to port. Show `desktopOnlyMessage`
or an empty frame.

## Implementation hints

- New `apps/api/src/master/screens/graphics-master.ts`: table `GraphicBKM`, PK `graphicBkm`
  (identity insert, like the other identity tables), `lockable` with a custom lock action (the
  cascade above, plus the env password), `checkInUse` (Graphics Detail), and `deleteRecord`, which
  also deletes the 3 child tables.
- `trans`: `GrbookSubTran` (delete-insert, MAX+1 ids), five `WordTran` types sharing
  `GrBookWordT` (delete-insert _per typenm_ with own-table MAX+1), and `ProofByTran` (`upsertChildRows`,
  identity). The engine's `DisplayTransDialog` needs the WordTran / Subject / ProofBy column sets
  above. ProofDate is a dd/MM/yyyy text input.
- Actions:
  - `request-lab-issue`: share with `book-tran.ts`
  - `print-duplicate-no`: `table` result
  - `open-bookm`: `open` result
  - `open-graphics-detail`: `open`, by Graphickt
  - `add-detail`: an engine gap, opening `graphics-detail` in Add with prefill. A minimal version
    passes `graphicBkm` + LibNo and lets the detail fetch the master values itself when the
    user answers Yes
- Vik Samvat: extract the `AuthorMaster.tsx` vir-samvat code into a shared helper (also needed by
  Graphics Detail).
- `gr-word.ts` / `gr-vishay.ts` already open this screen by ids (`openInUse('graphics-master', …)`),
  so the screen must accept an id list (`StrId`).

## Web port (2026-10-08)

Files: `apps/api/src/master/screens/graphics-master.ts` (ScreenDefinition `graphicsMaster`),
`apps/web/src/screens/GraphicsMaster.tsx`, `apps/api/test/master-graphics-master.integration.test.ts`,
`apps/web/e2e/batch-e.spec.ts`.

What is ported: the panel (Designer positions; the picture box as an empty frame), the fixed grid
columns, the Lib No inline F2 (fills Book Name, Samvat Type, Samvat and Vik Samvat), the
tblSearch F2s of the other boxes, Vik Samvat on leaving Samvat / Samvat Type (and after a Samvat
pick), the seven popups (five word types, Subject, Proof By with its dd/MM/yyyy InputBox), Save with
its children in one transaction, the work report after Add and Edit, Copy, the Locked read-only
state, Ctrl+L / Ctrl+U, Delete (in-use first, then the question and the Security password) and
every right-click item.

Engine extension: `ScreenSpec.toolbarCheckbox` may be a list (chkFinalized and chkPending both sit
outside the panel). Existing screens keep their single checkbox.

### The open results Graphics Detail receives (for the graphics-detail port)

Both items return their `open` result; the receiving side is wired in graphics-detail (2026-10-08:
`ScreenSpec.initialNew` lists the book's pictures and, with `CopyFromGraphicBkm`, fills the popups
through its `master-rows` action; see graphics-detail.md › The web port):

- **For Selected Record › Graphics Detail** (`open-graphics-detail`):
  `{kind:'open', screen:'graphics-detail', ids:[<graphicBkTkm…>], emptyMessage:''}`. The desktop's
  `WhereCondition " AND Graphickt IN(<selected>)"` is resolved on the server to the detail rows' own
  ids (StrId), so nothing new is needed on the receiving side. With no detail rows the result is
  `ids:[0]`: the window opens on an empty grid in Add mode, as the desktop's does. Difference: a
  Refresh there drops the StrId, where the desktop's WhereCondition stayed.
- **Add Detail** (`add-detail`, current row, after "Do You Want To Copy Master Data?"):
  `{kind:'open', screen:'graphics-detail', ids:[], emptyMessage:'', newRecord:{…}}`, which opens
  graphics-detail in Add mode through the existing `initialNew` pre-fill (`useMasterScreen.startNew`).
  `newRecord` always has `Graphickt` (the master's graphicBkm: txtLibNo's Tag) and `LibNo` (its text).
  With Yes it also has the copied boxes, named after graphicbkt's columns / boxes: `recno`, `remark`,
  `grade`, `color`, `AvailableAtTran` (the master's availableat text), `samvtypeKt` + `SamvTypeName`,
  `samvat`, `viksamvat`, `comment`, `VisheshTran`, `GrDetailSubTran`, `CreatorTran`,
  `CreatorTypeTran`, `MaterialTran`, `StyleTran`, plus `CopyFromGraphicBkm` (= graphicBkm).
  The receiving side must:
  1. map `Graphickt` / `LibNo` onto its Lib No kt box, and `samvtypeKt` / `SamvTypeName` onto its
     Samvat Type box (rename the keys to its own FieldSpec names if they differ);
  2. list the details of `Graphickt` (the desktop's `WhereCondition " and Graphickt in (<id>)"`;
     `initialIds` is `[0]` with a newRecord, so it needs a listCondition / param of its own);
  3. when `CopyFromGraphicBkm` is set, start its popups with the master's rows: call
     `masterRowsForDetail(db, graphicBkm)` (exported from `graphics-master.ts`) from one of its own
     actions or newDefaults. It returns rows keyed by graphicbkt's tblSearch columns
     (`GrDetailSubTran`, `VisheshTran`, `CreatorTypeTran`, `CreatorTran`, `MaterialTran`,
     `StyleTran`, `AvailableAtTran`), shaped like those popups' F2EntryText rows, with every key 0
     (so they are inserted for the new detail). These popups must then be saved with the new record
     (onNew.trans-style `opened` state). The Available At row looks the word up preferring
     `typenm='availableat'` (the desktop took the first word of any type with that text).
     The copied values are read from the saved record on the server, not from the boxes on screen (the
     desktop read its text boxes, which show the same record unless it was being edited).

### Desktop bugs fixed

- GrBookWordT keys: `isnull(max(GrBookWordkm),0)+1` of GrBookWordT itself (the desktop took
  GrbookSubT's), read inside the save's transaction with the range held (UPDLOCK, HOLDLOCK). The
  2,049 existing duplicate GrBookWordkm values are left alone.
- GrBookWordT is touched only for the word popups the user saved, per type: that type's rows are
  replaced, the other types' rows (and `typenm=''` rows) stay. No more delete-and-reinsert of every
  word on each Edit save, no wipe of every type when Creator Type is emptied, and an emptied popup
  really clears its type.
- Proof By saved empty deletes all the record's proof-by rows (the desktop deleted nothing). The
  UPDATE also checks the row belongs to the record.
- Print Duplicate No works (see the menu table).
- Delete removes the record's GrbookSubT / GrBookWordT / GrBookProofByT rows in the same
  transaction (the desktop left orphans).
- After an Edit save the grid row is refreshed from the list query (the desktop's GetDataById threw
  on `libno` and blanked the row).
- Text longer than its column (Book Name 255, Color 10, Grade 30, Available At 150, Samvat 50,
  Remark 255, Comment 255, Other LibNo 200, a Proof By Remark 500) gives "<Label> cannot be longer
  than <n> characters" instead of SQL Server's truncation error; a RecNo / Vik Samvat past int gives
  "… is too large".
- `vis123` (Ctrl+L / Ctrl+U) is the env var `GRAPHICS_LOCK_PASSWORD` (`.env.example`; the local
  `.env` has the desktop's value); the second Security password still works, as in frmDeleteList.
  Lock / Unlock run in one transaction (both UPDATEs) on the selected rows.
- Request For Book(LabIssue) goes through `lab-issue-common.ts` `requestLabIssue` (Type Book, For
  party 0), so requests are created with the desktop's checks and status.

### Deliberate differences

- Popup rows with nothing picked (the blank row a new popup starts with) are not saved (the desktop
  inserted them with grwordkt / grvishaykt / ProofByKt 0, showing as blanks or not at all).
- A word row keeps its own spelling of typenm (old rows are lower case); new rows get the popup's
  TranType (`Vishesh`, `CreatorType`, …), as on the desktop.
- Copy carries the record's popup rows into the copy with their keys reset to 0 (Patrika's rule).
  On the desktop a copy saved only the popups opened in that session, and its Proof By rows were
  rewritten onto the original's keys.
- Add Detail with no current row says "No Record Found" (the desktop threw).

### Kept quirks

- New does not reset Finalized / Pending (they are outside Panel1); Finalized Date is always saved.
- A hand-typed, non-numeric Samvat gives Vik Samvat −470 (the sadimst pick's value is used when the
  Samvat was picked).
- Print Full Card does nothing (its handler is empty).

### Deferred

- The picture box and its `<< < > >>` buttons (dead on the desktop: DisplayImage never loads an
  image): an empty frame, no buttons.
- F1 reference popup: no GraphicBKM tblSearch row has HelpText, so it is not wired.
