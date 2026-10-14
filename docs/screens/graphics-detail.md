# Graphics Detail (`graphicbkt`)

Desktop form: `GGLibrarySolution/Library/Graphics/frmGraphicsDetail.vb` (+ `.designer.vb`, title
"Graphics Detail"). It inherits `Library.frmMasterPage`. Repository:
`Library.BusinessContract/Concrete/GraphicBkTRepository.vb`. Entity: `Library.Entity/Entgraphicbkt.vb`.
Menu: Graphics › Graphics Detail (`screen('graphics-detail', …)`). It is also opened from Graphics Master
(Add Detail; For Selected Record › Graphics Detail) and from New Word / New Vishay Master › Show In Use.

There is one row per picture of a book. `Graphickt` points at `GraphicBKM.graphicBkm`. `filepath` is
an absolute Windows path (`Y:\B003955\p4-illus1.JPG`): 70,975 of the rows that have one are on `Y:\`.

Status: **ported** (2026-10-08): `apps/api/src/master/screens/graphics-detail.ts`,
`apps/web/src/screens/GraphicsDetail.tsx`, tests `apps/api/test/master-graphics-detail.integration.test.ts`
and `apps/web/e2e/batch-e.spec.ts`. The items that work on the pictures themselves followed on
2026-10-13 (`apps/api/src/master/screens/graphics-detail-files.ts`, tests
`apps/api/test/master-graphics-detail-files.integration.test.ts`): see
[Files / disk](#files--disk-ported-2026-10-13). The research notes below come from the desktop source and the
local DBLibSQL (2026-10-05) and were checked against the source while porting; see
[the web port](#the-web-port) at the end for what the web does and where it differs.

## Table and key

- Table `graphicbkt`, PK `graphicBkTkm`, an **IDENTITY** column (`SELECT @@identity`). The web must use
  `SCOPE_IDENTITY()` / `OUTPUT`.
- **74,032 rows**: 70,976 with a filepath, 735 with a PatrikaKt, 2,772 Locked. The list needs the
  engine's `listLimit` / paging, or the desktop's behaviour of loading everything has to be decided.
- Children:
  - `GrDetailSubT`: 318k rows, PK `grdetailSubKm`, no identity
  - `GrDetailWordT`: 216k rows, PK `GrDetailWordkm`, no identity
  - `GrdetailOtherRefT`: 1,324 rows, PK `GrdetailOtherRefTKm`, no identity
  - Grouping: `GraphicbktGrpT` (62 rows, no PK) and `GrdetailSelectedPicT` (4 rows, PK
    `GrdetailSelectedPicTKm`, no identity)
  - None of the child tables has an index on `graphicbkt` (only their clustered PKs)
- No triggers. Audit columns `enuser/endate`, `moduser/moddate` (`date`). `Locked bit`.
- Dead column: `vishesh_Revoke`. There is **no `availableat` column** (see the bugs).

## Fields

Times New Roman 14.25. Positions are inside `SplitContainer1.Panel1`. SplitContainer1 is at (0,54),
1008×642, SplitterDistance 296.

| Tab | Label (x,y)             | Control (x,y, w×h)                          | Column                                                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------- | ------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lib No (13,22)          | `txtLibNo` (121,20, 158×29)                 | `Graphickt int`                                        | **Inline F2**: `select graphicBkm,CASE WHEN ISNULL(GraphicBKM.BookTKt,0)=0 THEN GraphicBKM.libno ELSE BookT.Libno END AS libno from GraphicBKM LEFT JOIN BookT ON GraphicBKM.BookTKt=BookT.tid order by GraphicBKM.libno`. Tag = graphicBkm. Not validated (0 is allowed)                                                                                                                                                                                                                                                                                                                                                                                                              |
| 3   | Rec No (285,22)         | `txtRecNo` (409,20, 108×29)                 | `recno int`                                            | required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5   | Ref Place (525,25)      | `txtrefplace` (661,20, 124×29)              | `refplace nvarchar(100)`                               | F2: distinct existing values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | Picture Qty (13,62)     | `txtpictureQty` (121,58, 158×29)            | `pictureQty nvarchar(20)`                              | F2: distinct existing values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | Subject (285,62)        | `txtGrDetailSubTran` (409,58, 108×29)       | child `GrDetailSubT` internal=0                        | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | Grade/Patrika (525,62)  | `txtGrade` (661,58, 61×29)                  | `grade nvarchar(30)`                                   | F2 `select GrwordMkm,wordnm,defination,remark from GrwordM where typenm='grade'`, stored as text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 12  | (same label)            | `txtPatrikaKt` (724,58, 61×29)              | `PatrikaKt int` (+ `PatrikaName` = `Patrika.RecordNo`) | F2 `SELECT DISTINCT PatrikaKm,RecordNo from Patrika INNER JOIN PatrikaMixSignT ON Patrika.PatrikaKm=PatrikaMixSignT.PatrikaKt INNER JOIN visheshMast ON PatrikaMixSignT.MixSignKt=visheshMast.Tid WHERE visheshMast.Vishesh='Graphic' ORDER BY RecordNo` (AddTableInfo `Patrika`)                                                                                                                                                                                                                                                                                                                                                                                                      |
| 14  | Color (13,102)          | `txtcolor` (121,98, 158×29)                 | `color nvarchar(10)`                                   | F2: distinct values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 16  | Material (285,102)      | `txtMaterialTran` (409,98, 108×29)          | `GrDetailWordT` typenm Material                        | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 18  | Style (525,102)         | `txtStyleTran` (661,98, 124×29)             | `GrDetailWordT` typenm Style                           | Popup. **New keeps Style** (text and rows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 20  | Available At (13,142)   | `txtAvailableAtTran` (121,138, 158×29)      | `GrDetailWordT` typenm AvailableAt                     | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 22  | Creator Type (285,142)  | `txtCreatorTypeTran` (409,138, 108×29)      | `GrDetailWordT` typenm CreatorType                     | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 24  | Creator (525,142)       | `txtCreatorTran` (661,138, 124×29)          | `GrDetailWordT` typenm Creator                         | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 26  | Vishesh (13,182)        | `txtVisheshTran` (121,178, 158×29)          | `GrDetailWordT` typenm Vishesh                         | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 28  | Temp Selected (285,182) | `txttempselected` (409,178, 108×29)         | `tempselected nvarchar(255)`                           | F2 `select LTRIM(RTRIM(tempselected)) … group by tempselected`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 30  | IntSubject (525,182)    | `txtIntSubjectTran` (661,178, 124×29)       | child `GrDetailSubT` internal=1                        | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 32  | Samvat Type (13,222)    | `txtsamvtypeKt` (121,218, 158×29)           | `samvtypekt int` (+ `SamvTypeName`)                    | F2 Samvmast (as in Graphics Master)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 34  | Samvat (285,222)        | `txtSamvat` (409,218, 108×29)               | `samvat nvarchar(30)`                                  | F2 sadimst. **Only Leave of this box** recomputes Vik Samvat (not Samvat Type)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 36  | Vikramsamvat (525,222)  | `txtviksamvat` (661,218, 124×29)            | `viksamvat int`                                        | `GetVirSamvat(type, IsNumeric(samvat) ? samvat : Val(samvat.Tag)) - 470`, only when the type is > 0 and the samvat is non-blank. Same formula as Graphics Master                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 38  | Remark (13,262)         | `txtremark` (121,258, 158×29)               | `remark nvarchar(2048)`                                | F2: distinct values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 40  | comment (287,262)       | `txtcomment` (410,258, 109×29)              | `comment nvarchar(255)`                                | F2: distinct values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 42  | Other LibNo (525,262)   | `txtGrdetailOtherRefTran` (661,258, 124×29) | child `GrdetailOtherRefT`                              | Popup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 43  | —                       | `chkPending` "Pending" (796,261)            | `pending bit`                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| —   | —                       | `PicImage` (796,30, 203×213)                | `filepath nvarchar(250)`                               | **Not a text box on the desktop.** The path lives in a form variable `FilePath`, set by FillData, "Select Picture" (OpenFileDialog) and "Remove Picture" (`""`), and saved with the record. Clicking the image runs `Process.Start(FilePath)`. **Web: the picture box itself** (the server's copy of the file, `filepath` a hidden box): click opens the image viewer over **all the pictures of the record's Graphics Master record** (action `master-pictures`: the same Graphickt, with a filepath, RecNo order), at this one, so Previous / Next Page go through that book's pictures; right-click has Select Picture (a file dialog over the server's folders) and Remove Picture |

The F2 lists come from the tblSearch `F2EntryText` of `txt.Name.Substring(3)` unless noted.
`Txt_KeyDown` has a special `txtvishesh` multi-append branch, but there is no such box (dead).

## Validation (`GraphicBkTRepository.GetValidationMessage`)

The form first asks "Are You Sure to Save This Record?" (Yes/No).

1. `Please Enter Rec No` (when `Val(recno) = 0`)

Nothing else is checked. Graphickt can be 0.

After a successful save, a MsgBox titled "Record Saved Successfully" asks
**"Do You Want to Add More With Copying Data?"**. Yes stays in Add mode with every field kept,
and reloads all nine popup tables from the just-saved record (so its child rows are copied into
the next record). `TranKm` becomes 0.

## Grid columns

There are two grids in Panel2:

1. `dgGraphicMaster` (0,0, 1008×64): the parent GraphicBKM row
   (`GetDataTableById("GraphicBKM","graphicBkm",Graphickt)`). It is filled for the current record,
   or for the first list row when no record is selected.

   | Header       | Data column      | Width  |
   | ------------ | ---------------- | ------ |
   | graphicBkm   | `graphicBkm`     | 80     |
   | RecNo        | `RecNo`          | 60     |
   | BookTKt      | `BookTKt`        | hidden |
   | Book Name    | `bkname`         | 120    |
   | LibNo        | `BookTName`      | 90     |
   | Color        |                  | 90     |
   | Grade        |                  | 80     |
   | Vishesh      | `VisheshTran`    |        |
   | AvailableAt  | `AvailableAt`    |        |
   | Work DoneBy  | `WorkDoneByName` |        |
   | Finalized    |                  | 60     |
   | FinalizeDate | `finalizeddate`  | 90     |
   | ProofBy      | `ProofByTran`    |        |

   Its context menu is `ContextMenuStrip1` (the same one as the picture).

2. `dgMain` (0,68, 1008×274):

   | Header      | Data column    | Width  |
   | ----------- | -------------- | ------ |
   | Id          | `graphicBkTkm` | 80     |
   | RecNo       |                | 100    |
   | RefPlace    |                | 110    |
   | Picture Qty |                | 100    |
   | Grade       |                | 100    |
   | File Path   |                | 180    |
   | Color       |                | 100    |
   | VikSamvat   |                | 100    |
   | TemSelected |                | 100    |
   | Comment     |                | 100    |
   | Vishesh     | `VisheshTran`  | 120    |
   | Graphickt   |                | hidden |
   | Pending     |                | 100    |

tblSearch `graphicbkt` rows (all exist):

- plain M: pending, endate, moddate, enuser, graphicBkTkm, Graphickt, moduser, recno, viksamvat,
  color, comment, filepath, grade, pictureQty, refplace, remark, samvat, tempselected, Locked
- `PatrikaKt` (M): `… AS PatrikaName`. `samvtypeKt` (M): `… AS SamvTypeName`
- T with JoinCondition:
  - the Vishesh / CreatorType / Creator / Material / Style / AvailableAt lists from `GrDetailWordT`
  - `GrDetailSubTran` / `IntSubjectTran`: the subjects, with sign `*` → `,` else `-`, and `(remark)`
  - `GrdetailOtherRefTran`: libno-refplace-filepath-remark
  - **a row with `ColumnName=''`** (DisplayName "Lib No"), JoinCondition `(select CASE WHEN ISNULL(BookT.LibNo,'')='' THEN M.libno ELSE BookT.LibNo END from graphicbkt T INNER JOIN GraphicBKM M … where T.graphicBkTkm=graphicbkt.graphicBkTkm) LibNo`. Check that the engine copes with an empty ColumnName
- T without JoinCondition: `SubjTran` "SubjectRem". It has no F2 and is skipped by the SELECT builder

The default condition is empty. Opened from Graphics Master: `WhereCondition " and Graphickt in (<id>)"`
(Add Detail) or `" AND Graphickt IN(<ids>)"`. From Word/Vishay Show In Use: an id list.

## Child tables saved with the record

`Save(Ent, dtSubject, dtWord, dtGrdetail)` runs in one transaction. A child table is replaced only
when its DataTable has columns (the popup was opened, or Add mode). Each replace is
**delete-then-insert**, with ids = `isnull(max(<pk>),0)+1` read inside the transaction. Popups are
`frmDisplayTransNew`, `FormName="GraphicDetail"` (`SetForm_GraphicDetail`).

### `GrDetailSubT`, two popups on one table

- Subject: `TranName="Subject"`, internal=0. IntSubject: `TranType="Internal"`, internal=1.
- Columns: `grdetailSubKm`, `signkt`, `grvishaykt`, `internal` (hidden), **Sign**, **vishaynm**,
  **remark**, `seq`.
- F2s:
  - Sign: `select ColumnMastkm,Name from columnmaster where vibhag = 'sign' order by Name`
  - vishaynm: `select Grvishaykm,vishaynm,defination,Remark from GrVishay WHERE ISNULL(IsCancel,0)<>1 order by vishaynm`
    (AddTableInfo `GrVishay`)
  - remark: a repeating pick from `select 1 as Id,'' wordnm,'' defination UNION select 0 as Id, wordnm,defination from GrwordM where typenm='Remark' and isnull(wordnm,'')<>'' order by wordnm`,
    appended comma-separated. Picking the blank row (Id 1) clears it.
- **seq on popup Save is a global binding group:** `seq = MAX(seq) FROM GrDetailSubT` (all rows), +1
  for each row whose Sign is `*`. Rows after a `*` row share its seq. A first row without `*` gets
  the current global MAX, so it shares another record's group (harmless quirk; keep). "Break and Bind"
  relies on this.
- Form Save: when either subject popup was saved (or in Add mode), `dtSubject` = the rows of the
  _other_ internal flag reloaded from the DB (if only one popup was opened) + both popups' rows.
- Repository:

  ```sql
  delete from GrDetailSubT where graphicbkt=@id;
  insert into GrDetailSubT values(@max+i, @id, grvishaykt, seq, internal, signkt, N'remark')
  ```

  The column order is `grdetailSubKm, graphicbkt, grvishaykt, seq, internal, signkt, remark`.

### `GrDetailWordT` (Vishesh / CreatorType / Creator / Material / Style / AvailableAt)

- Popup `TranName="WordTran"`, `TranType` = the type. Columns: `GrDetailWordkm`, `grwordkt`, `typenm`
  (hidden), **wordnm**, **Remark**, `seq`.
- F2s:
  - wordnm: `select GrwordMkm,wordnm,defination,remark from GrwordM where typenm='<type>' order by wordnm`
    (add-new `grwordm|<type>`)
  - Remark: `select 0 as Id,wordnm,defination from GrwordM where typenm='Remark' order by wordnm`, appended
- Form Save: when a word popup was saved, or in Add mode, the existing rows of the "untouched" types plus
  `typenm=''` rows are reloaded and the popups' rows appended. Note that the reload SQL reads
  `GrwordM.Remark` (the word's remark) instead of `GrDetailWordT.Remark`, so a **kept row's own Remark is
  replaced by the word master's remark** (see bugs).
- Repository:

  ```sql
  delete from GrDetailWordT where graphicbkt=@id;
  insert into GrDetailWordT values(@max+i, @id, grwordkt, seq, 'typenm', N'remark')
  ```

  The column order is `GrDetailWordkm, graphicbkt, grwordkt, seq, typenm, Remark`.

- Existing typenm values (lowercase): style 87,748; vishesh 63,234; availableat 28,786; material
  16,039; creator 9,621; creatortype 9,145; '' 1,137.

### `GrdetailOtherRefT` (Other LibNo)

- Popup `TranName="Grdetail"`. Columns: `GrdetailOtherRefTKm`, `graphicbkt`, `BookTKt` (hidden),
  **BookTName**, **Refplace** (editable), **filepath**, **remark**, `seq`.
- F2s:
  - BookTName: `select tid,libno from bookT where isnull(libno,'')<>'' order by libno`
  - filepath: an OpenFileDialog. **Web: a text cell.** The picker is desktop-only
- Repository:

  ```sql
  delete from GrdetailOtherRefT where graphicbkt=@id;
  insert into GrdetailOtherRefT values(@max+i, @id, 'BookTName', N'Refplace', 'filepath', N'remark', seq, BookTkt)
  ```

  `libno nvarchar(15)` receives the LibNo text, and `filepath` is `nvarchar(150)`.

## Add mode from Graphics Master (Add Detail)

Graphics Master sets `graphicBkm`, `libno`, `StrMode="Add"` and optionally the copied values and DataTables
(see `graphics-master.md`). Load then:

- puts `txtLibNo` = libno / Tag graphicBkm
- runs `FillList()` (filtered to that Graphickt) and `FillGraphicMaster(graphicBkm)`
- enables editing in Add mode

New (Ctrl+N) keeps Lib No (text and Tag) and the Style text and rows, and clears the rest.

## Delete

"Are You Sure to Delete This Record?" → Security password (`InputBoxProc()`) →
`GraphicBkTRepository.Delete(<selected ids>)`. This handles **multiple selected rows**, in one
transaction:

```sql
delete from GrDetailSubT where graphicbkt IN (…);
delete from GrDetailWordT where graphicbkt IN (…);
delete from GrdetailOtherRefT where graphicbkt IN (…);
delete from graphicbkt where graphicBkTkm IN (…);
```

There is no in-use check, and `GraphicbktGrpT` rows are left behind (harmless; also delete them on the web).
Message "Record Deleted ".

## Right-click menus

`cntGrid` on `dgMain`, and `ContextMenuStrip1` on the picture box and `dgGraphicMaster`.

**Ids** below = the selected rows' `graphicBkTkm`, in grid order (`GetIdFrom_GridRecord(…, False)`).
"Password" = `InputBoxProc()` (Security password) unless stated. All the bulk SQL on the desktop is
string-concatenated, outside any transaction, one statement per selected row. On the web it must be
parameterised (`IN ${idList(ids)}`) and run in the request transaction.

When the current record is Locked, FillData **disables** Replace / Insert / Delete in Selected Record
(re-enabled for unlocked records).

### Classification of every item

| Menu path                                                                                                         | Class                              | Notes                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Show Pictures                                                                                                     | **disk → ported (2026-10-13)**     | FormDisplayImage over the selected rows' filepaths                                                                             |
| Show Record From Selected Record › File Not Found on it's Original Location                                       | **disk → ported (2026-10-13)**     | `File.Exists` per row                                                                                                          |
| › Having Same FileName                                                                                            | **DB-only → port**                 | text compare of `filepath`                                                                                                     |
| › Having RefPlace Not Match with FileName                                                                         | **DB-only → port**                 | string compare of refplace vs. the filename part of `filepath`, no disk                                                        |
| › -XXX Deleted Picture                                                                                            | **disk → ported (2026-10-13)**     | `Directory.GetFiles(*.jpg)`                                                                                                    |
| Copy to TempGr And Open with Acdsee - Selected Record                                                             | **disk → ported (2026-10-13)**     | copies to `d:\tempgr\<103/75/93 or 0>`, `Process.Start`                                                                        |
| Print Record › Full Card                                                                                          | dead                               | empty handler                                                                                                                  |
| › Master Column                                                                                                   | dead                               | no handler                                                                                                                     |
| › Ref Place having not filepath for given book                                                                    | **DB-only → port**                 | Excel                                                                                                                          |
| › Selected Column                                                                                                 | engine                             | `Config_Master` `ConfigType='graphicbkt'` ("For M.S. saheb", "All coloumns", "click", "detail master"; none has a ShortcutKey) |
| › Showing Mismatch Of No Of Images                                                                                | **disk → ported (2026-10-13)**     | FolderBrowserDialog + `exec Master..xp_cmdshell 'DIR …'` (**never ported**: the web lists the folder itself)                   |
| › Send to Excel                                                                                                   | engine                             |                                                                                                                                |
| › Duplicate RecordNo                                                                                              | **DB-only → port**                 | Excel                                                                                                                          |
| Replace in Selected Record › Subject / Material / Style / Grade / Available At / Creator / Creator Type / Vishesh | **DB-only → port**                 |                                                                                                                                |
| Insert in Selected Record › (same 8)                                                                              | **DB-only → port**                 |                                                                                                                                |
| Delete in Selected Record › (same 8)                                                                              | **DB-only → port**                 |                                                                                                                                |
| Delete in Selected Record › File Path                                                                             | **DB-only → port**                 | it only blanks the column; password `vis123`                                                                                   |
| Utility › Show File Not Linked for Give Book                                                                      | **disk → ported (2026-10-13)**     |                                                                                                                                |
| › Update Blank Filepath For Given Book                                                                            | **disk → ported (2026-10-13)**     | probes `Y:\<LibNo>\<refplace>.jpg/.bmp/.png` with `File.Exists`, then UPDATE                                                   |
| › Send Image To Folder                                                                                            | **disk → ported (2026-10-13)**     | copies files **and** appends the prefix to `comment`                                                                           |
| › Rename File Name Records                                                                                        | **disk → ported (2026-10-13)**     | physical rename and/or path update. Menu enabled in `cntGrid_Opening`                                                          |
| › Rename File Name With Refpls for selected Reords                                                                | **disk → ported (2026-10-13)**     |                                                                                                                                |
| › insert into grouping records                                                                                    | **DB-only → port** (with fixes)    | GraphicbktGrpT + GrdetailSelectedPicT                                                                                          |
| › Break And Bind                                                                                                  | **DB-only → port**                 | a read-only filter                                                                                                             |
| › Update Patrika For Selected Records                                                                             | **DB-only → port**                 |                                                                                                                                |
| Show For Selected Records › BookM / Graphics Master / Patrika                                                     | navigation → port                  | `open` results (Patrika screen #17 not ported yet: placeholder)                                                                |
| Picture menu › Select Picture                                                                                     | **disk → ported (2026-10-13)**     | OpenFileDialog. Web: a file dialog over the server's folders                                                                   |
| › Remove Picture                                                                                                  | port as "clear the filepath field" | no disk                                                                                                                        |
| › Utility › Request For Book(LabIssue)                                                                            | **DB-only → port** (with fix)      | hidden when the menu opens on the picture (`ContextMenuStrip1_Opening`), so it is only reachable from `dgGraphicMaster`        |

The disk items run on the server's copies of the desktop's folders: see
[Files / disk](#files--disk-ported-2026-10-13).

### DB-only tools: exact SQL

`@ids` = the selected `graphicBkTkm` list. Each step that picks from a list is a frmList1
(`DisplayListForm`, `boolSelectFirst`). The engine's `lists` + a pick dialog fit.

#### Replace in Selected Record (`ReplaceSelectedRecord(list1, list2, type)`)

Pick the old value from list 1, then the new one from list 2, then the password. Run per row, sum the
affected counts n, then:
`"At " & n & " Places " & <old text> & " is Replaced by " & <new text> & " succefully"` (verbatim
typo), then FillList.

| Item                                                                                                                                                 | List 1 (old: values used by the selected rows)                                                                                                                                                                                                                                                | List 2 (new)                                                                                        | UPDATE (parameterised)                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject                                                                                                                                              | `select GrVishay.Grvishaykm,GrVishay.vishaynm,GrVishay.defination from GrVishay inner join GrDetailSubT on GrVishay.Grvishaykm=GrDetailSubT.grvishaykt where GrDetailSubT.graphicbkt in (@ids) group by GrVishay.Grvishaykm,GrVishay.vishaynm,GrVishay.defination order by GrVishay.vishaynm` | `select Grvishaykm,vishaynm,defination from GrVishay WHERE ISNULL(IsCancel,0)<>1 order by vishaynm` | `UPDATE GrDetailSubT SET grvishaykt=@new WHERE graphicbkt IN (@ids) AND grvishaykt=@old`                                                                                                                                                                                                                                                  |
| Material / Style / Available At / Creator / Creator Type / Vishesh (`<t>` = `material`, `style`, `availableat`, `creator`, `creatortype`, `vishesh`) | `select GrDetailWordT.grwordkt,GrwordM.wordnm from GrDetailWordT inner join GrwordM on GrDetailWordT.grwordkt=GrwordM.GrwordMkm where GrwordM.typenm='<t>' and GrDetailWordT.graphicbkt in (@ids) group by GrDetailWordT.grwordkt,GrwordM.wordnm order by GrwordM.wordnm`                     | `select GrwordMkm,wordnm from GrwordM where typenm='<t>' group by GrwordMkm,wordnm order by wordnm` | `UPDATE GrDetailWordT SET grwordkt=@new WHERE graphicbkt IN (@ids) AND grwordkt=@old`. There is no typenm filter; word ids are type-specific. Available At is called **without** a type, so it uses this generic branch. The `"availableat"` branch (`Update GraphicBKT Set availableat=…`) is dead code and would throw (no such column) |
| Grade                                                                                                                                                | `select REPLACE(0,0,0) as Id,grade from GraphicBKT where Graphicbktkm in (@ids) group by grade order by grade`                                                                                                                                                                                | `select GrwordMkm,wordnm,defination,remark from GrwordM where typenm='grade'`                       | intended: `UPDATE graphicbkt SET grade=@newWordnm WHERE graphicBkTkm IN (@ids) AND grade=@oldGrade`. **Dead on the desktop:** list 1's Id is always `'0'` and the code stops on `txt.Tag = "0"`, so nothing ever happens. **Decided:** ported working (see the web port)                                                                  |

#### Insert in Selected Record (`InsertInSelectedRecord(list, type)`)

Pick → password. `Tid = max(<pk>)` (no isnull), +1 per row. Message
`"At " & n & " Places " & <text> & ",Type -" & <type> & " is Inserted succefully"`, then FillList.
Duplicates are not checked (it adds the same word again if present; keep).

| Item                                                               | List                                                                                                               | Statement per row                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject                                                            | `select Grvishaykm,vishaynm,defination,remark,groupnm from GrVishay WHERE ISNULL(IsCancel,0)<>1 order by vishaynm` | `INSERT INTO GrDetailSubT (grdetailSubKm,graphicbkt,grvishaykt,seq,internal,signkt,remark) VALUES (@tid,@row,@pick,100,0,0,'')`                      |
| Material / Style / Available At / Creator / Creator Type / Vishesh | `select GrwordMkm,wordnm from GrwordM where typenm='<t>' group by GrwordMkm,wordnm order by wordnm`                | `INSERT INTO GrDetailWordT (GrDetailWordkm,graphicbkt,grwordkt,seq,typenm,Remark) VALUES (@tid,@row,@pick,100,@t,'')`, with `@t` lowercase as listed |
| Grade                                                              | `select GrwordMkm,wordnm from GrwordM where typenm='grade' group by GrwordMkm,wordnm order by wordnm`              | `UPDATE graphicbkt SET grade=@pickedWordnm WHERE graphicBkTkm=@row` (works on the desktop)                                                           |

Web: `@tid` = `isnull(max(pk),0)+1` inside the transaction, incremented per row.

#### Delete in Selected Record (`DeleteInSelectedRecord(list, type)`)

Pick → password. Message `"At " & n & " Places " & <text> & ",Type -" & <type> & " is Deleted succefully"`,
then FillList.

| Item                                                               | List                                                                                                                                                                                                                         | Statement                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject                                                            | `select GrVishay.Grvishaykm,GrVishay.vishaynm,GrVishay.defination,GrVishay.remark,GrVishay.groupnm from GrVishay inner join GrDetailSubT on … where GrDetailSubT.graphicbkt in (@ids) group by … order by GrVishay.vishaynm` | `DELETE FROM GrDetailSubT WHERE graphicbkt IN (@ids) AND grvishaykt=@pick` (internal and non-internal alike)                                                                                                                                                                                      |
| Material / Style / Available At / Creator / Creator Type / Vishesh | same as Replace list 1 for `<t>`                                                                                                                                                                                             | `DELETE GrDetailWordT WHERE typenm=@t AND graphicbkt IN (@ids) AND grwordkt=@pick`                                                                                                                                                                                                                |
| Grade                                                              | same as Replace list 1                                                                                                                                                                                                       | intended `UPDATE graphicbkt SET grade='' WHERE graphicBkTkm IN (@ids) AND grade=@old`. **Dead on the desktop** (same `'0'` Tag problem). Ported working                                                                                                                                           |
| File Path                                                          | —                                                                                                                                                                                                                            | Password **`vis123`** (hard-coded; `frmDeleteList` also takes the alt password) → env `GRAPHICS_LOCK_PASSWORD` (shared with Ctrl+L/U) → confirm "Are you sure to Delete File Path for Selected Record?" → `UPDATE graphicbkt SET filepath='' WHERE graphicBkTkm IN (@ids)` → FillList. No message |

#### Show Record From Selected Record › Having Same FileName

This is **global**, not limited to the selection:

```sql
select graphicBkTkm from graphicbkt
where filepath in (select filepath from graphicbkt GROUP BY filepath having COUNT(filepath)>1)
  and filepath not like ''
```

None → "There are no File having same file name". Otherwise FillList with `StrId` = those ids
(the window's normal StrId is restored afterwards). Web: a `list` result.

#### › Having RefPlace Not Match with FileName

No SQL. For each selected row:

1. `name` = filepath after the last `\`. If it contains `.`, trim the spaces before the extension.
2. `expected` = `refplace & "." & Right(name, 3)`, only when both refplace and name are non-blank,
   else `""`.
3. The row is a mismatch when `name <> expected` (case-sensitive).

So a 4-letter extension (`.JPEG`) is always a mismatch, and a blank refplace with a non-blank path is
a mismatch. None → "No Records Found". Otherwise FillList by those ids. Do it server-side over the
selected ids (`SELECT graphicBkTkm, refplace, filepath FROM graphicbkt WHERE graphicBkTkm IN (@ids)`),
then the same string rule.

#### Print Record › Ref Place having not filepath for given book

```sql
select refplace from GraphicBKT where filepath = '' and Graphickt = @currentGraphickt
```

`@currentGraphickt` = `txtLibNo.Tag` (the current record's Graphickt). Rows → Send to Excel
(a `table` result, one column `refplace`). The desktop errors when Tag is empty. Web: require a current
record or a picked Lib No.

#### Print Record › Duplicate RecordNo

`FindDuplicate(dt,"RecNo","GraphicBKT","graphicBkTkm", <ids of ALL grid rows>)`:

```sql
select RecNo from GraphicBKT where graphicBkTkm in (@allListIds) group by RecNo having COUNT(RecNo)>1 order by RecNo
```

→ Excel (`table`, one column `RecNo`). Web: pass the current list's ids (or the list filter).

#### Utility › Update Patrika For Selected Records

Pick from `SELECT DISTINCT PatrikaKm,RecordNo from Patrika INNER JOIN PatrikaMixSignT ON Patrika.PatrikaKm=PatrikaMixSignT.PatrikaKt INNER JOIN visheshMast ON PatrikaMixSignT.MixSignKt=visheshMast.Tid WHERE visheshMast.Vishesh='Graphic' ORDER BY RecordNo`.
If picked (> 0): for each selected row, `GetDataById` + `Save(Ent, Nothing, Nothing, Nothing)`. That is
a full UPDATE re-writing the row's own values, children untouched, with **`moduser` = the row's old
moduser** (GetDataById loads it) and `moddate=getdate()`. Then
`"Records Updated Successfully At " & <selected count> & " Places"`. No list refresh, no password.

Web:

```sql
UPDATE graphicbkt SET PatrikaKt=@pick, moduser=@me, moddate=getdate() WHERE graphicBkTkm IN (@ids)
```

Writing the current user instead of the stale moduser is a fix. Say so in the PR.

#### Utility › Break And Bind (a read-only filter)

1. Pick from:

   ```sql
   select DISTINCT GrDetailSubT.grvishaykt, GrVishay.vishaynm from GrDetailSubT
   left outer join GrVishay on GrDetailSubT.grvishaykt=GrVishay.Grvishaykm
   left outer join columnmaster on GrDetailSubT.signkt = columnmaster.ColumnMastkm
   where seq in (select seq from GrDetailSubT group by graphicbkt,seq having count(seq)>1)
     and ISNULL(columnmaster.Name,'')='*' AND ISNULL(grvishaykt,0)>0
   order by vishaynm
   ```

2. If `@v` was picked:

   ```sql
   select ISNULL(STUFF((SELECT ',' + CAST(graphicbkt AS VARCHAR(1000)) from GrDetailSubT
     left outer join GrVishay on GrDetailSubT.grvishaykt=GrVishay.Grvishaykm
     inner join columnmaster on GrDetailSubT.signkt = columnmaster.ColumnMastkm
     where seq in (select seq from GrDetailSubT group by graphicbkt,seq having count(seq)>1)
       and ISNULL(columnmaster.Name,'')='*' AND grvishaykt=@v
     for XML PATH('')),1,1,''),0)
   ```

   This gives `@gids`. On the web, select the ids as rows instead of a STUFF string.

3. Pick (single) from:

   ```sql
   select DISTINCT Main.grvishaykt, GrVishay.vishaynm from GrDetailSubT Main
   left outer join GrVishay on Main.grvishaykt=GrVishay.Grvishaykm
   left outer join columnmaster on Main.signkt = columnmaster.ColumnMastkm
   where seq in (select seq from GrDetailSubT WHERE grvishaykt=@v and ISNULL(internal,0)=0 AND graphicbkt IN (@gids))
     and ISNULL(columnmaster.Name,'')<>'*'
   order by vishaynm
   ```

4. If `@w` was picked:

   ```sql
   select graphicbkt from GrDetailSubT Main
   left outer join columnmaster on Main.signkt = columnmaster.ColumnMastkm
   where seq in (select seq from GrDetailSubT WHERE grvishaykt=@v and ISNULL(internal,0)=0)
     and ISNULL(columnmaster.Name,'')<>'*' and grvishaykt IN (@w)
   ```

   None → "No Records Found". Otherwise FillList by those ids (StrId restored).

The `seq` subqueries are not correlated to graphicbkt. They work only because seq is a global
group counter. Keep them verbatim, binding only `@v`, `@w` and `@gids`. Web: three chained pick
steps (`lists`), then a `list` result.

#### Utility › insert into grouping records

The desktop flow, with bugs:

1. `check` = the `grpnokt` of the first selected row found in `GraphicbktGrpT`
   (`select grpnokt from GraphicbktGrpT where graphicbkt=@row`).
2. **New group** (`check = 0`):
   - `grpno = isnull(max(grpnokt),0)+1`
   - InputBox "Enter Remarks"
   - `mxtranid = isnull(max(GraphicbktGrpkm),0)+1`
   - add one `dtgroup` row per selected row: `(mxtranid+i, grpno, graphicbkt, remarks, seq=i+1)`
   - open the `grouping` popup on `dtgroupdetail`
   - on Save: insert every `dtgroup` row into
     `GraphicbktGrpT (GraphicbktGrpkm,grpnokt,graphicbkt,UseRemark,seq)`, and every `dtgroupdetail`
     row into
     `GrdetailSelectedPicT (GrdetailSelectedPicTKm,grpnokm=grpno,Title,requiredbykt,selectedbykt,grvishaykt,grwordkt,givendate,signkt,seq)`
3. **Existing group**: reload `dtgroupdetail` for `grpnokm=@check`, open the popup, then run the same
   inserts.

The `grouping` popup columns: `GrdetailSelectedPicTKm`, `grpnokm`, `requiredbykt`, `selectedbykt`,
`grvishaykt`, `grwordkt`, `signkt` (hidden), **Title**, **requiredby**, **selectedby**, **vishaynm**,
**wordnm**, **givendate** (default today), **sign**, `seq`. Its F2s:

- requiredby / selectedby: `select ColumnMastkm,name from columnmaster where vibhag ='doneby' order by name`
- vishaynm: `select Grvishaykm,vishaynm,Remark from GrVishay WHERE ISNULL(IsCancel,0)<>1 order by vishaynm`
- wordnm: `select GrwordMkm,wordnm from grwordm order by wordnm` (all types)
- sign: `… vibhag ='sign' …`

The new row id is `GetMaxId(GrdetailSelectedPicT)` +1 per row.

Desktop bugs here (**data-corrupting / throws**):

- `dtgroup` already holds the _current record's_ existing group rows (FillData), so they are
  re-inserted (duplicates).
- If no record was clicked, `dtgroup` has no columns and `Rows.Add` throws.
- Every save re-inserts **all** existing `GrdetailSelectedPicT` rows of the group. In the
  existing-group branch it uses `grpno = 0` (never set).
- `cnn.Open()` is never closed, so the second use throws "connection already open".
- `givendate` is formatted by the locale into a string literal.

Web fix (decided; see the web port):

- new group: insert one `GraphicbktGrpT` row per selected record (MAX+1 ids, the new grpno, the
  remark, seq 1..n), plus the popup rows with `grpnokm = grpno`
- existing group: save the popup rows for that `grpnokm` as delete-insert (or upsert by
  `GrdetailSelectedPicTKm`), and optionally add the selected records that are not yet in the group
  (the desktop never does this; **decided: not added**)
- all in one transaction, parameterised
- the remarks prompt and the popup are an engine gap (an action with a form + child grid)

#### Request For Book(LabIssue) (`ContextMenuStrip1` › Utility, on `dgGraphicMaster`)

Uses `dgGraphicMaster.CurrentRow`: `BookTKt`, BookName → `LabIssueMRepository.GetValidationMessage` →
`Save`. "Book Issued Successfully". **Desktop bug (data-corrupting):** it sets
`Ent.LabIssueMkm = TranKm` (the **graphicbkt id**), so Save runs
`UPDATE LabIssueM SET BookTKt=…, Forkt=0, moduserKt=…, moddate=getdate() WHERE LabIssueMkm=<graphicBkTkm>`.
That overwrites an unrelated lab-issue request whenever the id exists, and it never creates a request.
Unlike Graphics Master, it also skips `GetUserNotReturnedBook`. Web: use the same
`request-lab-issue` helper as Graphics Master / `book-tran.ts` (always INSERT, both checks), on the
parent `Graphickt`'s book.

#### Show For Selected Records

- BookM: `select isnull(STUFF((select ',' + cast(BookMastkt as varchar) from BookT where Tid in (select BookTKt from GraphicBKM where graphicBkm in(<selected Graphickt>)) for XML PATH('')),1,1,''),0)`.
  "0" → "No Record Found". Otherwise open Book Master with StrId.
- Graphics Master: opens with StrId = the selected rows' Graphickt (no empty check).
- Patrika: `SELECT … PatrikaKm FROM Patrika WHERE PatrikaKm IN(SELECT PatrikaKt FROM graphicbkt WHERE graphicBkTkm IN(@ids))`.
  "0" → "No Record Found". Otherwise open frmPatrika (#17, not yet on the web).

## Reports and printing

No `.rpt`. Only Selected Column (`Config_Master`, `ConfigType='graphicbkt'`) and Excel exports
(Send to Excel, Duplicate RecordNo, Ref Place having not filepath).

## Permissions

- Standard toolbar via `EnableDisableDataEditing`. A Locked record is read-only, and also disables
  Replace / Insert / Delete in Selected Record.
- Copy is disabled at load (Work Report is not, here).
- **Ctrl+L / U**: `InputBoxProc("vis123")` → `CommonRepository.LockUnlockRecords("graphicbkt",
"graphicBkTkm", dgMain, lock)` on the selected rows. This is the engine's standard `setLocked`, but
  with the `vis123` password, so it needs an env override (`GRAPHICS_LOCK_PASSWORD`).
- Hard-coded user ids: `curr_lnid` 103 / 75 / 93 pick the `d:\tempgr\<id>` folder (everyone
  else shares `d:\tempgr\0` on their own computer; the web gives every user `<id>`). `cntGrid_Opening` always enables the rename items (a commented-out `curr_lnid = 5`
  check).
- Passwords: `vis123` for Lock/Unlock and Delete › File Path. The Security password (`InputBoxProc()`)
  for Delete, Replace / Insert / Delete in Selected Record and Update Blank Filepath.

## SQL in form event handlers (not listed above)

- FillData:
  - `select GraphicbktGrpkm,grpnokt,graphicbkt,UseRemark,seq from GraphicbktGrpT where graphicbkt=@id`
  - the `GrdetailSelectedPicT` join (`where g.grpnokm=<last grpnokt>`)
  - `select CASE WHEN ISNULL(BookT.LibNo,'')='' THEN GraphicBKM.libno ELSE BookT.LibNo END from GraphicBKM LEFT JOIN BookT ON GraphicBKM.BookTKt=BookT.Tid where graphicBkm=@Graphickt`
    (Lib No text)
- Load: the Config_Master read. Ctrl+F: tblSearch searchable columns (as in Graphics Master).

## Desktop bugs

| Bug                                                                                                                                                                                                                                          | Kind                     | Web                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Word keep-logic typos (`dtVishesh.Rows`, `dtCreator.Rows` instead of `.Columns`): if the Creator popup is the only one opened and it is emptied, **all Vishesh rows are deleted**. If only Vishesh is opened and emptied, nothing is cleared | data-corrupting          | per type: replace the types whose popup was saved, keep the others and `typenm=''` |
| Kept word rows are reloaded with `GrwordM.Remark` instead of `GrDetailWordT.Remark`, so their own remark is overwritten whenever another word popup is saved                                                                                 | data-corrupting          | keep rows by not deleting them (per-type delete)                                   |
| Request For Book(LabIssue) updates `LabIssueM` row `LabIssueMkm = graphicBkTkm`                                                                                                                                                              | data-corrupting          | shared insert helper                                                               |
| Grouping: duplicates, `grpno=0`, connection left open, `Rows.Add` on a column-less table                                                                                                                                                     | data-corrupting / throws | see above                                                                          |
| Replace › Grade and Delete › Grade never run (`'0'` id)                                                                                                                                                                                      | harmless (inert)         | fixed: they work                                                                   |
| Dead `availableat` branch (no such column)                                                                                                                                                                                                   | would throw, unreachable | drop                                                                               |
| Update Patrika keeps the old `moduser`                                                                                                                                                                                                       | harmless quirk           | write the current user                                                             |
| Delete leaves `GraphicbktGrpT` rows                                                                                                                                                                                                          | harmless                 | delete them too                                                                    |
| Subject seq: a first row without `*` joins the global MAX group                                                                                                                                                                              | harmless quirk           | keep                                                                               |
| Ref Place report with no current record: SQL syntax error                                                                                                                                                                                    | throws                   | require a record                                                                   |
| Non-numeric Samvat gives viksamvat -470; only Samvat's Leave recomputes                                                                                                                                                                      | harmless quirk           | keep (same decision as Graphics Master)                                            |

## Files / disk (ported 2026-10-13)

The desktop reads and writes the pictures on its drives; the web does the same on the **server's**
copies of those folders (`apps/api/src/master/library-files.ts`). The database keeps the paths
exactly as the desktop writes them and the grid shows them unchanged; the server maps each one.

| Desktop                                       | Setting (`apps/api/.env`)                           | Used for                                                         |
| --------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `Y:\` (hard-coded in `updateFilePath`)        | `GRAPHICS_DRIVE_PATH` (`Y:`) / `GRAPHICS_DRIVE_DIR` | the pictures: 70,975 of the stored paths are `Y:\<LibNo>\<file>` |
| `d:\tempgr`                                   | `TEMPGR_PATH` / `TEMPGR_DIR`                        | Copy to TempGr                                                   |
| `\\192.168.0.50\Graphics`, `I:\LibraryImages` | `GRAPHICS_*`, `MAIN_ROOT_*`                         | other folders a picture may be picked from or sent to            |

Without a `*_DIR` of its own a folder is `LIBRARY_FILES_DIR/<last part of the path>` (`…/Y`,
`…/tempgr`). **`Y:` is a drive letter of the desktops, not a share name: point `GRAPHICS_DRIVE_DIR`
at whatever share they map Y: to** (it may be the same folder as `GRAPHICS_DIR`). A path under no
configured folder (one row is `C:\Users\…`) is simply a file that does not exist. Names are matched
without regard to case, as Windows does (`library-files.ts` `actualPath`), so `Y:\B1\P1.JPG` finds
`p1.jpg` on a case-sensitive server. Files are only ever written, renamed or deleted inside the
graphics folders (`graphicsDrive`, `graphics`, `mainRoot`, `tempGr`); every path goes through
`toLocalPath`, which refuses `..`.

Actions (`graphics-detail-files.ts`), messages verbatim:

| Item                                            | Action                  | What it does                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PicImage                                        | `GET library-file`      | The record's picture (StretchImage, 203×213) when the file exists; a click opens the image viewer over the Graphics Master record's pictures, at this one (`master-pictures`; the desktop's `Process.Start` showed only this file). Right-click: Select Picture / Remove Picture                                                            |
| Select Picture                                  | `GET library-folder`    | The shared `LibraryFileDialog` (an Open dialog over the server's folders), starting in the record's folder. The pick becomes `filepath`, saved with the record's next Save                                                                                                                                                                  |
| Show Pictures                                   | `show-pictures`         | `GraphicsPicturesDialog` (FormDisplayImage, Designer positions): the selected rows that have a path, six at a time, "LibNo:- …, RefPlace:- …" under each, `<<` `<` `n of m` `>` `>>`, tick boxes, click = open the picture, right-click › Save to Temp Selected (`save-temp-selected`: "Please Enter Temp Selected" appended after a space) |
| File Not Found on it's Original Location        | `file-not-found`        | The selected rows whose file does not exist, as the grid's list; none: "All File Exists in The Dirctory"                                                                                                                                                                                                                                    |
| -XXX Deleted Picture                            | `deleted-picture`       | The records of the current row's folder whose path is not one of the folder's `*.jpg` files (top folder only, so records of sub-folders are listed too, as on the desktop)                                                                                                                                                                  |
| Copy to TempGr And Open with Acdsee             | `copy-to-tempgr`        | `d:\tempgr\<user id>` is made if missing and emptied, each selected picture that exists is copied in as `<Id>.jpg`, and the copies open in the picture viewer (the desktop started ACDSee on the last copy)                                                                                                                                 |
| Print Record › Showing Mismatch Of No Of Images | `image-count-mismatch`  | A folder dialog, then per sub-folder: its `*.jpg` count, the records whose path contains the folder's name, the difference, and a Total row, in the popup grid (right-click › Send To Excel)                                                                                                                                                |
| Utility › Show File Not Linked for Give Book    | `not-linked-files`      | "Not Linked Files Are " + the `*.jpg` files of the current row's folder no record names, or "All Files in current folder are linked with records"                                                                                                                                                                                           |
| › Update Blank Filepath For Given Book          | `update-blank-filepath` | "You are About to update the blank file path Are You Sure ?" (title "Conformation"), the Security password, then every record of the Lib No's book without a path takes `Y:\<LibNo>\<RefPlace>.jpg`, else `.bmp`, else `.png`, whichever exists                                                                                             |
| › Send Image To Folder                          | `send-image-to-folder`  | A folder dialog (with Make New Folder: `make-folder`), the prefix InputBox (title "Prefix Add", today as d + M + yyyy), then each selected picture that exists is copied there as `<prefix> <LibNo> <file name>` and the prefix is added to its `comment` after a comma                                                                     |
| › Rename File Name Records                      | `rename-file`           | "No Files Found" for a row without a path; "Press(Yes) to Rename both Physical FileName and FilePath Record / Press(No) to Rename Only FilePath Record"; "Enter New File Name" (the current name to start with); the file is renamed in its folder (Yes) and `filepath` updated                                                             |
| › Rename File Name With Refpls                  | `rename-with-refplace`  | Each selected picture becomes `<RefPlace>.JPG` on disk and in `filepath`, unless a file of that name is already there                                                                                                                                                                                                                       |

The Other LibNo popup's `filepath` cell stays typed text (the desktop's is an OpenFileDialog).

## Implementation hints

- New `apps/api/src/master/screens/graphics-detail.ts`:
  - table `graphicbkt`, PK `graphicBkTkm` (identity insert); `lockable` + the env password
  - multi-row `deleteRecord` (4 tables + GraphicbktGrpT); no `checkInUse`
  - `validate` = "Please Enter Rec No"
  - `newDefaults` / New keeps Lib No + Style
  - `recordExtras` returns the parent GraphicBKM row for the top mini-grid, plus the Lib No text
- `trans`:
  - `GrDetailSubTran` + `IntSubjectTran` (one table, split by `internal`; the global-seq rule on save)
  - six `WordTran` types on `GrDetailWordT` (per-typenm delete-insert)
  - `GrdetailOtherRefTran` (delete-insert)
  - all with own-table MAX+1 ids inside the transaction (`insertWithMaxId`-style)
- Actions, all parameterised, `IN ${idList(ids)}`:
  - `replace-<type>`, `insert-<type>`, `delete-<type>` (8 types), with a two-step pick for Replace;
    or one generic action with a `type` param validated against a fixed map (never interpolate the
    type into SQL)
  - `delete-filepath`
  - `same-filename`, `refplace-mismatch`, `break-and-bind`: `list` results
  - `refplace-no-filepath`, `duplicate-recno`: `table` results
  - `update-patrika`, `grouping`, `request-lab-issue`
  - `open-bookm`, `open-graphics-master`, `open-patrika`
- Engine gaps:
  - the PictureBox (done 2026-10-13 through `MasterScreenExtras.inPanel`)
  - the **parent mini-grid** (`dgGraphicMaster`) above the list
  - **chained pick lists** for Replace / Break and Bind
  - the grouping action (InputBox + DisplayTrans popup in one action)
  - Add mode opened from Graphics Master with prefilled values and child rows
  - "Add More With Copying Data" after save (stay in Add, copy fields and children)
  - opening the screen filtered by `Graphickt` (not by PK)
  - the empty-`ColumnName` tblSearch row
  - 74k rows: paging / `listLimit`
- The existing `gr-word.ts` / `gr-vishay.ts` `in-use-graphics-detail` actions open this screen by
  `graphicBkTkm` ids. `gr-vishay.ts` Replace already updates `GrDetailSubT.grvishaykt` globally. That is
  not the same as this screen's per-selection Replace.
- Share the Vik Samvat helper with Graphics Master (extract from `AuthorMaster.tsx`).

## The web port

### What is ported

- The form: every box at its Designer position (Times New Roman panel, `win-*` styles), the grid
  with the Designer's columns and widths, and **dgGraphicMaster** above it (the record's Graphics
  Master row: the loaded record's parent, the book Add Detail opened the window for, or the first
  listed row's), with its ContextMenuStrip1 (Select Picture, Remove Picture, Utility › Request For
  Book(LabIssue)).
- **PicImage** and every item that works on the pictures: see
  [Files / disk](#files--disk-ported-2026-10-13). The Other LibNo popup's `filepath` cell is typed text.
- Save with the nine popups in one transaction; "Please Enter Rec No"; New keeps Lib No and the
  Style text and rows; "Do You Want to Add More With Copying Data?" (title "Record Saved
  Successfully") after an Add **or** an Edit: Yes stays in Add with every box kept and all nine popups
  reloaded from the saved record. Work report on Add and Edit (not Delete), lblEntry, F1 help.
- Delete of every selected row (children, then the record) in one transaction.
- Ctrl+L / Ctrl+U with `GRAPHICS_LOCK_PASSWORD` (the desktop's `vis123`; the second Security
  password is accepted too, as InputBoxProc does). A Locked record is read-only (API too) and turns
  Replace / Insert / Delete in Selected Record off.
- Every DB-only menu tool, parameterised and inside one transaction each: Replace / Insert / Delete
  in Selected Record (8 types each, plus Delete › File Path), Having Same FileName, Having RefPlace
  Not Match with FileName, Print Record › Ref Place having not filepath / Selected Column / Send to
  Excel / Duplicate RecordNo, Utility › insert into grouping records / Break And Bind / Update
  Patrika, Show For Selected Records › BookM / Graphics Master / Patrika.
- The windows other screens open: Graphics Master's Add Detail (Add mode, the book's pictures
  listed, the copied boxes and — with `CopyFromGraphicBkm` — the master's popup rows through
  `masterRowsForDetail`) and For Selected Record › Graphics Detail (`ids`, `[0]` = empty grid in
  Add mode); Patrika's and New Word / New Vishay Master's Graphics Detail items (`ids`).
- The list: the newest **5,000** rows (`listLimit`; the desktop loads all 74k). The largest book
  has 3,639 pictures, so a window opened for a book always shows all of its pictures.

### Engine pieces added (opt-in)

- `ScreenSpec.initialNew` {`scope`, `after`}: a window opened for a new record (`open` +
  `newRecord`) can list other records by switches (Add Detail's `WhereCondition`, kept by Refresh)
  and fill popups from the server once the new record is up.
- `ScreenSpec.continueAdding` gained `title` (the question replaces "Record Saved Successfully"),
  `edit` (asked after an Edit too) and `loadTrans` (popups reloaded from the saved record).
- `ScreenActions.pick` accepts a `PickList` (rows an action returned, for lists that depend on
  the selected records).
- `MasterScreenExtras.aboveGrid`: content above the grid in Panel2 (dgGraphicMaster).

### Deliberate differences (user decisions and documented choices)

- Replace › Grade and Delete › Grade **work** (on the desktop they never ran: the old-grade list's
  Id is always 0 and the code stops on Tag "0").
- Bulk tools (Replace / Insert / Delete, File Path, Update Patrika) refuse when a selected record
  is Locked ("A selected record is Locked"); the desktop only disabled the three menus when the
  _current_ record was locked.
- Update Patrika writes the current user as `moduser` (the desktop re-saved each row with its old
  moduser). It runs one parameterised UPDATE; the message counts the selected rows, as before.
- Insert in Selected Record takes its keys (MAX+1 of the table itself) inside the transaction.
- Grouping: Title is typed in the popup (the desktop's popup left it read-only, so it could never be
  filled). An existing group only gets its popup rows saved (upsert by key; rows taken out of the
  popup are deleted); the selected records are not added to it, as on the desktop.
- Subject and word popup rows without a subject / word picked, and fully blank Other LibNo rows,
  are dropped instead of being inserted with id 0 (same as Graphics Master).
- The Subject / word popups' Remark list appends the picked words (several may be picked at
  once) instead of the desktop's pick-again loop; the cell can also be edited directly.
- Ref Place having not filepath with no Lib No on screen says "Please Enter Lib No" (the desktop
  failed with an SQL error).
- Overlong text (Ref Place 100, Picture Qty 20, Grade 30, Temp Selected 255, File Path 250,
  Remark 2048, Color 10, Samvat 30, Comment 255, the popups' remark / libno cells) is refused with
  a message; the desktop failed with SQL's truncation error.
- Show For Selected Records › Graphics Master with no parent opens an empty window (`ids:[0]`),
  as the desktop's StrId "0" did.
- Opening the window from Graphics Master's For Selected Record uses the detail ids (StrId), so a
  Refresh there drops the filter where the desktop's WhereCondition stayed. Add Detail's filter is
  kept by Refresh, as on the desktop.

### Desktop bugs fixed

- Word "keep" typos (`dtVishesh.Rows`, `dtCreator.Rows`): only the word types whose popup was saved
  are replaced (per-typenm delete-insert); other types and `typenm=''` rows are untouched.
- The Remark overwrite: kept word rows are never reloaded from GrwordM, so their own Remark stays.
- Request For Book(LabIssue) inserts a new request through `lab-issue-common.ts` `requestLabIssue`
  (both checks) for the parent's book; the desktop updated the LabIssueM row whose key happened to
  equal the graphicbkt id.
- Grouping: no duplicate GraphicbktGrpT rows, no group number 0, no re-inserted popup rows, one
  transaction, the date bound as a date.
- Delete also removes the record's GraphicbktGrpT rows.
- All string-concatenated SQL (bulk tools, Break And Bind, Show For…) is parameterised.

### Harmless quirks kept

- The Subject popup's binding-group `seq` from the table's global MAX(seq) (a first row without
  "*" joins the current MAX group); Break And Bind's uncorrelated `seq` subqueries.
- Only leaving Samvat recomputes Vikramsamvat; a hand-typed non-numeric Samvat gives −470.
- Replace in Selected Record for words has no typenm filter; Insert adds a word again if present.
- The generic popup summary includes the `internal` column's "False"/"True" text, as the desktop's.

### The pictures: deliberate differences from the desktop

- Everything happens on the **server's** folders. Select Picture, Send Image To Folder and Showing
  Mismatch pick a file or folder of the server (`LibraryFileDialog`, `GraphicsFolderDialog`: the browser cannot name
  a path of the desktop's drives), and only inside the configured folders; a new picture has to be
  put on the share first (there is no upload).
- Programs the desktop started become browser views: the image viewer (`features/master/ImageViewer.tsx`) for PicImage (over the
  master record's pictures, a user-requested addition: the desktop opened the one file), a
  FormDisplayImage picture (over the pictures shown) and Send Image To Folder's copies; the TempGr
  copies in FormDisplayImage instead of ACDSee.
- **Copy to TempGr** uses `d:\tempgr\<user id>` for every user. The desktop used `<id>` for users
  103 / 75 / 93 and `0` for everyone else, which was private only because each computer had its own
  `d:` drive.
- **Send Image To Folder**: Cancel in the folder dialog or the prefix box stops (the desktop went
  on, copying to the drive's root or with an empty prefix). The checks (folder, file names, comment
  length 255) run before anything is copied, the comments are written in one transaction after the
  copies, and the copies then come up as a list; the picked one opens in the image viewer, as View Image's. A prefix
  cannot contain `\ / : * ? " < > |`.
- **Showing Mismatch Of No Of Images** shows its table in the popup grid. The desktop bound it to
  dgMain, whose columns belong to graphicbkt, so the rows came up blank; it also listed the folders
  with `xp_cmdshell` on the SQL Server, which the web never runs.
- **-XXX Deleted Picture**: the desktop's loop built its `FilePath not in (…)` list wrongly for a
  folder with a single record (that record was always listed) and failed on a folder without .jpg
  files ("Index was outside the bounds of the array."); both cases give the right list here.
- **Show File Not Linked**: one file per line (the desktop ran the names together).
- **Rename File Name Records / With Refpls** refuse when a record is Locked ("A selected record is
  Locked"), like the web's other bulk tools; the name must be a file name, and a physical rename is
  checked before anything changes (missing file: "Could not find file '…'."; name taken: "Cannot
  create a file when that file already exists."), so the record and the file never disagree.
  With Refpls skips rows it cannot rename (blank path or Ref Place, missing file) and goes on,
  then names the first missing file; the desktop stopped at the first such row.
- **Save to Temp Selected** with nothing ticked does nothing (the desktop failed on `in ()`), and
  a NULL `tempselected` takes the text (the desktop's `NULL + …` stayed NULL).
- **Update Blank Filepath** with no Lib No on screen says "Please Enter Lib No" (SQL error on the
  desktop). It does not look at Locked, as on the desktop (it has the Security password).
- New clears the picture. The desktop's `FilePath` variable survived New, so a new record silently
  took the previous record's picture.
- Still not ported: Print Record › Full Card / Master Column (no handler on the desktop; hidden),
  and the Other LibNo popup's file picker (typed text).
