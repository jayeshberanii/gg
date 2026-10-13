# Slice 5 — Tirth Raksha, Magazine Vishesh, Tree (v3.3.3.6 → v3.4.3.1)

Paths: `Updated/` = `GGLibrarySolutionUpdated/`, `web/` = `gglib-web/`. Local DB = the restore named in
`apps/api/.env`; every PRESENT/MISSING below was checked there with read-only SELECTs.

Headline:

- **Tirth Raksha is a real rework and the local DB has none of its schema.** 8 new `TirthRakshaM` columns,
  1 new child table, 1 new column on `TirthRakshaReferenceT`, ~11 new `tblSearch` rows, 2 new `UpdateVishay`
  branches, 1 stored procedure and 1 `columnmaster` Vibhag are all MISSING. The web screen is the old screen
  (except Print Report › Main Report, which is already built but has never run).
- **Magazine Vishesh** gains a Proof popup (new table `MagazineVisheshProofT`, MISSING), a Proof search, three
  boxes turned read-only, a formatted Excel export and a re-laid-out panel. `MagazineMRepository.vb` and
  `frmMagazineMaster*` are unchanged in behaviour. English Book Vishesh is byte-identical, so the shared web
  helpers must keep Proof Magazine-only.
- **frmTreeMast** changes do not touch anything `UplevelTree.tsx` / `KrutiTree.tsx` / `AuthorTree.tsx` use.
- Two cross-cutting renames surfaced in these files: `VisheshMast.remark` → `VisheshMast.Vibhag` (column
  MISSING locally) and `authtype.authtyattr` → `authtype.authortype` in the Tirth Raksha author text.

---

### Tirth Raksha Master — `Library/Library/frmTirthRakshaMaster.vb` (+ `.Designer.vb`, `.resx`), `TirthRakshaRepository.vb`, `ITirthRakshaRepository.vb`, `EntTirthRakshaM.vb`

Web counterparts for every entry: `web/apps/api/src/master/screens/tirth-raksha.ts`,
`web/apps/web/src/screens/TirthRakshaMaster.tsx`, note `web/docs/screens/tirth-raksha-master.md`.

#### TR-0. The new screen, complete (reference for the entries below)

Panel (`SplitContainer1` 1008×594, **SplitterDistance 337**, was 642 / 290). All Times New Roman 14.25, boxes
29 high. Right-hand labels moved from x=700 to **x=687**; middle boxes narrowed 192 → **175**.

| Label (x,y)                                          | Box (x,y,w)                                                                                                                  | Tab     | Column / popup                                  | Notes                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------- | ---------------------------------------------- |
| Name(N) (8,22)                                       | `txtTirthRakshaNameTran` 154,18,216                                                                                          | 1       | frmVishayEntry `TirthRakshaName`                | **no longer mandatory**                        |
| **Ref/ShastraNo** (374,22) (was "Reference(P)")      | `txtReferenceTran` 506,18,**122** (was 192)                                                                                  | 3       | popup `Reference` → `TirthRakshaReferenceT`     | first row gives `RefBookTKt` / `RefKrutiMstKt` |
|                                                      | **`txtShastraPathNo`** 629,18,52                                                                                             | 43      | `ShastraPathNo` int                             | **ReadOnly**, new                              |
| **Seq/Book/Kruti Seq** (687,22) (was "Seq/Book Seq") | `txtSeq` 844,18,**52** (was 78)                                                                                              | 5       | `Seq`                                           | ReadOnly                                       |
|                                                      | `txtBookSeq` **897**,18,**52** (was 924 / 78)                                                                                | 36      | `BookSeq`                                       | editable                                       |
|                                                      | **`txtKrutiSeq`** 950,18,52                                                                                                  | 41      | `KrutiSeq` int                                  | editable, new                                  |
| **Author Info/Samp** (8,62) (was "Author(W)")        | `txtAuthTran` 154,58,**107** (was 216)                                                                                       | 7       | popup `Author`                                  |                                                |
|                                                      | **`txtAuthorSampradayKt`** 263,58,107                                                                                        | 42      | `AuthorSampradayKt` int / `AuthorSampradayName` | new Kt box, F2 from tblSearch                  |
| Kruti(K) (374,62)                                    | `txtKrutiTran` 506,58,175                                                                                                    | 9       | popup `Kruti`                                   |                                                |
| Purnata/Group No (687,62)                            | `txtPurnataKt` 844,58,119 ; `txtGroupNo` 964,58,38                                                                           | 13 / 37 | unchanged                                       |                                                |
| Samvat(T)/Bhasha (8,102)                             | `txtSamvatTran` 154,98,107 ; `txtBhashaTran` 263,98,107                                                                      | 15 / 18 | unchanged                                       |                                                |
| Main Person(M) (374,102)                             | `txtMainPersonTran` 506,98,175                                                                                               | 38      | unchanged                                       |                                                |
| Project Name (687,102)                               | `txtProjectKt` 844,98,158                                                                                                    | 21      | unchanged                                       |                                                |
| Kshetra(A) (8,142)                                   | `txtKshetraTran` 154,138,216                                                                                                 | 23      | unchanged                                       |                                                |
| Tirth (374,142)                                      | `txtTirthKt` 506,138,175                                                                                                     | 25      | unchanged                                       |                                                |
| Done By(D) (687,142)                                 | `txtDoneByKt` 844,138,158                                                                                                    | 27      | unchanged, mandatory                            |                                                |
| Vishay(S) (8,182)                                    | `txtVishayTran` 154,178,216                                                                                                  | 29      | unchanged                                       |                                                |
| Peta Vishay(SS) (374,182)                            | `txtPetaVishayTran` 506,178,175                                                                                              | 31      | unchanged                                       |                                                |
| Project Detail (687,182)                             | `txtProjectDetail` 844,178,158                                                                                               | 33      | unchanged                                       |                                                |
| **Granth Name** (8,222)                              | **`txtGranthName`** 154,218,216                                                                                              | 45      | `GranthName` text                               | new                                            |
| **Granth Type** (374,222)                            | **`txtGranthTypeKt`** 506,218,175                                                                                            | 47      | `GranthTypeKt` / `GranthTypeName`               | new Kt box                                     |
| **Grade Subject** (687,222)                          | **`txtGradeSubjectKt`** 844,218,158                                                                                          | 49      | `GradeSubjectKt` / `GradeSubjectName`           | new Kt box                                     |
| **Text/Summary** (8,262)                             | **`txtTextTran`** 154,258,107                                                                                                | 51      | popup `Text` → **`TirthRakshaTextT`**           | new                                            |
|                                                      | **`txtSummaryTran`** 263,258,107                                                                                             | 53      | frmVishayEntry `TirthRakshaSummary`             | new                                            |
| **Subject** (374,262)                                | **`txtSubjectTran`** 506,258,175                                                                                             | 55      | frmVishayEntry `TirthRakshaSubject`             | new                                            |
| **Relevant Photo** (687,262)                         | LinkLabel **`lnkRelevantLatestPhoto`** 810,264 "Latest Photo(n)" ; **`lnkRelevantOldPhoto`** 911,264 "Old Photo(n)" (TNR 12) | 57 / 58 | `Attachments`                                   | new                                            |
| Remark(R1) (8,**300**) (was 8,262)                   | `txtTirthRakshaRemarkTran` 154,**296**,848                                                                                   | 39      | frmVishayEntry `TirthRakshaRemark`              | moved down one row                             |
| ~~Remark(R) (8,222)~~                                | ~~`txtRemark` 154,218,848 multiline~~                                                                                        |         | `Remark`                                        | **removed**                                    |

Grid `dgMain` (`GvMain`, `Updated/…/frmTirthRakshaMaster.vb:34-59`, bound in `FillList` 1208-1231):
Id(5) · Seq(70) · **KrutiSeq** · **ShastraPathNo** · BookSeq · Name(200) · ProjectName · Author · Samvat(ई.सं.) ·
Samvat(Remark)(150) · Kruti · Kshetra · Tirth · Vishay(150) · PetaVishay · RefPageNo · Bhasha · Remark ·
**Ref KrutiNo** (`RefKrutiNo`) · **Ref LibNo** (`RefLibNo`) · **GranthName** · **GranthType** (`GranthTypeName`) ·
**GradeSubject** (`GradeSubjectName`). The hidden `BookTKt` column is **removed**. Unlisted widths are the
DataGridView default 100.

Right-click menu: Print Report › Selected Column, Send To Excel, **Main Report**; Utility › Show All Records,
Update Book Seq, **Update Kruti Seq**, **Update Shastrapath No**, **Add New RefKruti From RefLibNo**; Group No ›
(3 items, unchanged); For Selected Record › Book Master, **Kruti Master**.

Save (one transaction, `Updated/Library.BusinessContract/Concrete/TirthRakshaRepository.vb:130-521`):

```sql
INSERT INTO TirthRakshaM (TirthRakshaName,txtAuthor,TirthKt,Seq,BookSeq,KrutiSeq,PurnataKt,ProjectKt,DoneByKt,ProjectDetail,RefKrutiMstKt,RefBookTKt,ShastraPathNo,GranthName,GranthTypeKt,AuthorSampradayKt,GradeSubjectKt,enuser,endate) VALUES (…,getdate())
UPDATE TirthRakshaM SET TirthRakshaName=@TirthRakshaName,txtAuthor=@txtAuthor,TirthKt=@TirthKt,Seq=@Seq,BookSeq=@BookSeq,KrutiSeq=@KrutiSeq,PurnataKt=@PurnataKt,ProjectKt=@ProjectKt,DoneByKt=@DoneByKt,ProjectDetail=@ProjectDetail,RefKrutiMstKt=@RefKrutiMstKt,RefBookTKt=@RefBookTKt,ShastraPathNo=@ShastraPathNo,GranthName=@GranthName,GranthTypeKt=@GranthTypeKt,AuthorSampradayKt=@AuthorSampradayKt,GradeSubjectKt=@GradeSubjectKt,moduser=@moduser,moddate=getdate() WHERE TirthRakshaKm=@TirthRakshaKm
```

then BookSeq shift, KrutiSeq shift (TR-4), VishayEntry boxes Name / PetaVishay / Remark / **Subject** /
**Summary**, Author, Samvat (+VikramSamvat/Isvisan/SamvatRemark), Kshetra, Bhasha (+txtBhasha), Kruti,
Reference (**+EntryType**), MainPerson, Vishay (+Vishay), **Text**, Commit. `Remark` and `BookTKt` are no
longer written by anything.

Delete (`:20-100`) is **unchanged**: it does not delete `TirthRakshaTextT` rows, nor the `TirthRakshaSubject` /
`TirthRakshaSummary` VishayEntry lines, nor `Attachments` rows (orphans left behind).

#### TR-1. Record reference moved from `BookTKt` to `RefBookTKt` + `RefKrutiMstKt`

- **What changed**: `TirthRakshaM.BookTKt` is no longer read or written. The record now carries
  `RefBookTKt` and `RefKrutiMstKt`, both from the **first Reference row** (`dtReference.Rows(0)("BookTKt")` /
  `("KrutiMstKt")`). Form `Save` (`Updated/…/frmTirthRakshaMaster.vb:1104-1119`): if the Reference popup was
  not opened it loads the stored rows just to read row 0, then discards them (so they are not re-saved). The
  repository repeats it (`TirthRakshaRepository.vb:140-143`): when `dtReference` has rows, row 0 overwrites
  both values **including zeros**. `FillData` (1274-1283) keeps `RefKrutimstKt`, `RefBookTKt` and
  `RefEntryType` (`SELECT ISNULL(EntryType,'') FROM TirthRakshaReferenceT WHERE TirthRakshaKt=<id>`) in form
  variables instead of the old hidden grid cell. `GetMaxBookSeq` / `SetBookSeq` / the shift now filter on
  `RefBookTKt`.
- **Kind**: behaviour change (also fixes the old "BookTKt comes from another grid row" bug).
- **Web today**: old way. `referenceBook()`, `messages()`, `save` (`BookTKt: bookTKt`, INSERT/UPDATE list with
  `Remark, BookTKt`), `maxBookSeq` (`WHERE BookTKt =`), `update-book-seq` (`WHERE BookTKt =`) in
  `tirth-raksha.ts`; hidden `BookTKt` grid column in `TirthRakshaMaster.tsx`.
- **Web change needed**: compute `RefBookTKt` and `RefKrutiMstKt` server-side from the first Reference row
  sent, else the stored pair; write the new column list above; drop `Remark` and `BookTKt` from the write;
  switch every `BookTKt` filter on `TirthRakshaM` to `RefBookTKt`; drop the hidden grid column.
- **DB prerequisites**: `TirthRakshaM.RefBookTKt` MISSING, `TirthRakshaM.RefKrutiMstKt` MISSING.
  (`TirthRakshaM.BookTKt` and `Remark` are PRESENT locally; whether production kept, renamed or dropped them
  is not determinable from the code — see open questions.)
- **Size**: M

#### TR-2. Validation

- **What changed**: `GetValidationMessage` (`TirthRakshaRepository.vb:106-128`): the
  `- Name(N) is Mandatory` check is commented out; the reference check is now
  `If Val(Ent.RefBookTKt) = 0 And Val(Ent.RefKrutiMstKt) = 0` → `- Reference(P) is Mandatory` (a Kruti-only
  reference is enough; the message text still says "(P)" although the label is now "Ref/ShastraNo").
  Unchanged: `- Seq is Mandatory`, `- BookSeq is Mandatory`, `- Done By(D) is Mandatory`. Consequence: a
  reference with a Kruti and no book leaves `txtBookSeq` empty (TR-3), so the user must type a BookSeq or the
  save is refused with `- BookSeq is Mandatory`. `KrutiSeq` is never validated (0 is saved).
- **Kind**: behaviour change
- **Web today**: old way — `messages()` in `tirth-raksha.ts` pushes `- Name(N) is Mandatory` and tests
  `bookTKt === 0`.
- **Web change needed**: remove the Name line; reference line only when both ids are 0. Remove the
  `Remark(R)` length line; add length lines for the new text columns once their sizes are known.
- **DB prerequisites**: as TR-1.
- **Size**: S

#### TR-3. Kruti Seq and Shastra Path No (new sequences)

- **What changed**: three places fill the boxes.
  - `btnNew_Click` (`frmTirthRakshaMaster.vb:239-257`), from the carried Reference row 0: BookTKt > 0 →
    `txtBookSeq = GetMaxBookSeq`, else `""` (old: always GetMaxBookSeq); KrutiMstKt > 0 →
    `txtKrutiSeq = GetMaxKrutiSeq`, else `""`; `EntryType = "ShastraPath"` →
    `txtShastraPathNo = GetMaxShastraPathNo()`, else `""`.
  - After the Reference popup is saved (745-761): BookTKt > 0 and different from the form's `RefBookTKt` →
    remember it and set BookSeq; same for KrutiMstKt / KrutiSeq; EntryType `ShastraPath` and the record's
    stored `RefEntryType` is not already `ShastraPath` → `GetMaxShastraPathNo()`; any other EntryType →
    `txtShastraPathNo = ""`.
  - Verbatim (`TirthRakshaRepository.vb:598, 666, 933`):
    `SELECT ISNULL(MAX(BookSeq),0)+1 FROM TirthRakshaM WHERE RefBookTKt=<b>` (returns 0 when b ≤ 0),
    `SELECT ISNULL(MAX(KrutiSeq),0)+1 FROM TirthRakshaM WHERE RefKrutimstKt=<k>` (0 when k ≤ 0),
    `SELECT ISNULL(MAX(ShastraPathNo),0)+1 FROM TirthRakshaM`.
- **Kind**: new feature
- **Web today**: not ported. `newDefaults` returns `Seq` (+ `BookSeq` from `params.BookTKt`); the Reference
  popup's `onSaved` calls action `max-book-seq` and compares with the rows the popup was opened with.
- **Web change needed**: fields `KrutiSeq` (editable) and `ShastraPathNo` (readOnly, `alwaysSend`);
  `newDefaults` takes the carried row's BookTKt, KrutiMstKt and EntryType and returns the three values (empty
  when not applicable); replace `max-book-seq` by one action returning BookSeq / KrutiSeq / ShastraPathNo and
  apply the three rules above in `onSaved` (it needs the record's stored EntryType for the ShastraPath rule).
- **DB prerequisites**: `TirthRakshaM.KrutiSeq` MISSING, `TirthRakshaM.ShastraPathNo` MISSING,
  `TirthRakshaReferenceT.EntryType` MISSING.
- **Size**: M

#### TR-4. The BookSeq shift now really runs; new KrutiSeq shift

- **What changed**: old `Save` shifted only `If Ent.IsBookSeqExist = True`, which the form never set (dead
  code). New `Save` (`TirthRakshaRepository.vb:193-208`) asks the DB inside the transaction:
  `SELECT COUNT(TirthRakshaKm) FROM TirthRakshaM WHERE TirthRakshaKm<><id> AND RefBookTKt=<RefBookTKt>` > 0 →
  `UPDATE TirthRakshaM SET BookSeq=BookSeq+1 WHERE TirthRakshaKm<>@TirthRakshaKm AND RefBookTKt=@RefBookTKt AND BookSeq>=@BookSeq`;
  and the same for Kruti:
  `SELECT COUNT(TirthRakshaKm) FROM TirthRakshaM WHERE TirthRakshaKm<><id> AND RefKrutimstKt=<RefKrutiMstKt>` →
  `UPDATE TirthRakshaM SET KrutiSeq=KrutiSeq+1 WHERE TirthRakshaKm<>@TirthRakshaKm AND RefKrutiMstKt=@RefKrutiMstKt AND KrutiSeq>=@KrutiSeq`.
  It runs on **every** save, Add and Edit, with no check that the number changed: re-saving an existing
  record with BookSeq 3 pushes every other record of that book with BookSeq ≥ 3 up by one each time. It also
  runs when the id is 0 (all records with `RefBookTKt = 0` / `RefKrutiMstKt = 0` are treated as one group).
- **Kind**: behaviour change (data-affecting)
- **Web today**: deliberately not ported — comment "The BookSeq shift (IsBookSeqExist) never runs on the
  desktop and is not ported" in `tirth-raksha.ts` `save`; decision 6 in the screen note.
- **Web change needed**: port both shifts inside the save transaction — after the user decides whether the
  "every save shifts" behaviour is wanted as is (open question 3).
- **DB prerequisites**: `RefBookTKt`, `RefKrutiMstKt`, `KrutiSeq` MISSING.
- **Size**: S (after the decision)

#### TR-5. Reference popup: new `EntryType` column

- **What changed**: `TirthRakshaReferenceT` INSERT / UPDATE now include `EntryType`
  (`TirthRakshaRepository.vb:418, 426`):
  `INSERT INTO TirthRakshaReferenceT(TirthRakshaKt,EntryType,KrutiMstKt,BookTKt,PageNo,GathaNo,Remark,Seq,enuser,endate)`.
  In the popup (`frmDisplayTransNew`, not analysed here) a new row starts with `EntryType = "TirthRaksha"`, the
  cursor starts on the EntryType cell and its F2 list is
  `SELECT 'TirthRaksha' AS Id,'TirthRaksha' AS Name UNION SELECT 'ShastraPath' AS Id,'ShastraPath' AS Name`.
  The value drives ShastraPathNo (TR-3, TR-16).
- **Kind**: new feature
- **Web today**: not ported — `POPUPS` `ReferenceTran` child columns in `tirth-raksha.ts` have no EntryType;
  `TRANS.ReferenceTran` in `TirthRakshaMaster.tsx` starts on `KrutiNo`.
- **Web change needed**: add `EntryType: 'text'` to the child table, a two-value list lookup on the cell,
  default `"TirthRaksha"` on new rows, first column `EntryType`. The popup's columns come from the tblSearch
  `ReferenceTran` F2EntryText, which must itself return `EntryType`.
- **DB prerequisites**: `TirthRakshaReferenceT.EntryType` MISSING; tblSearch `TirthRakshaM`/`ReferenceTran`
  row PRESENT but its F2EntryText is the old one (no EntryType) — needs the updated text.
- **Size**: S

#### TR-6. New record fields: Author Sampraday, Granth Name, Granth Type, Grade Subject

- **What changed**: four new boxes (TR-0) saved as `AuthorSampradayKt`, `GranthName`, `GranthTypeKt`,
  `GradeSubjectKt` (`frmTirthRakshaMaster.vb:1098-1102`). The three Kt boxes use the generic F2 path
  (`select isnull(F2EntryText,'') …, AddTableInfo from tblSearch where TransactionName='TirthRakshaM' and
(ColumnName=…)`, line 824) and are loaded by `FillTextBox` from `<X>Kt` + `<X>Name` columns, so their lists
  and name sub-selects live only in tblSearch. Three new grid columns (GranthName, GranthType, GradeSubject).
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: four `FieldSpec`s (three `kt` with `nameColumn` `AuthorSampradayName`,
  `GranthTypeName`, `GradeSubjectName`), the columns in `save`, three grid columns. The lists come from
  tblSearch through the engine once the rows exist.
- **DB prerequisites**: `TirthRakshaM.AuthorSampradayKt`, `GranthName`, `GranthTypeKt`, `GradeSubjectKt` all
  MISSING; tblSearch rows `AuthorSampradayKt`, `GranthName`, `GranthTypeKt`, `GradeSubjectKt` MISSING (so the
  F2 SQL, the Vibhag names and AddTableInfo could not be determined; `columnmaster` has Vibhag `Grade`
  (5 rows) but nothing named Granth*).
- **Size**: M (S for the code, the rest is waiting for the rows)

#### TR-7. `Remark(R)` box removed

- **What changed**: `txtRemark` / label "Remark(R)" deleted from the Designer; `Ent.Remark` commented out in
  the entity and in `Save`; the column left the INSERT/UPDATE. The grid's Remark column still shows `txtRemark`
  (the Remark(R1) Vishay summary), as before. Existing `Remark` text is no longer visible or editable anywhere
  on the form.
- **Kind**: removed
- **Web today**: old way — field `Remark` at (154,218,848) in `TirthRakshaMaster.tsx`; `Remark` written and
  length-checked in `tirth-raksha.ts`.
- **Web change needed**: remove the field, the write and the length line.
- **DB prerequisites**: none (column `Remark` PRESENT locally; tblSearch row `Remark` "Remark(R)" PRESENT and
  searchable — whether production still has either is unknown).
- **Size**: S

#### TR-8. Text popup (`txtTextTran`) — new child table `TirthRakshaTextT`

- **What changed**: F2 on `txtTextTran` opens `frmDisplayTransNew` with **`TranName = "Text"`,
  `FormName = "TirthRaksha"`, `TranId = TranKm`**, `dtDisp = dtText` (`frmTirthRakshaMaster.vb:718-725`); rows
  from tblSearch column `TextTran`. Save (`TirthRakshaRepository.vb:489-510`):
  `INSERT INTO TirthRakshaTextT(TirthRakshaKt,TextTypeKt,Text,CheckedByKt,Seq,enuser,endate) VALUES (…)` /
  `UPDATE TirthRakshaTextT SET TextTypeKt=…,Text=…,CheckedByKt=…,Seq=…,moduser=…,moddate=GETDATE() WHERE TirthRakshaTextKm=…` /
  `DELETE FROM TirthRakshaTextT WHERE TirthRakshaKt=<id> AND TirthRakshaTextKm NOT IN(<kept>)`.
  Seen in the popup code (for the port, not analysed further): hidden `TirthRakshaTextKm`, `TextTypeKt`,
  `CheckedByKt`; `Text` editable; `TextTypeName` F2 =
  `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='TirthRakshaTextType' ORDER BY Name`
  (AddTableInfo `ColumnMaster|TirthRakshaTextType`); `CheckedByName` F2 =
  `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='DoneBy' AND ISNULL(Name,'')<>'' ORDER BY Name`;
  a `ReadyPhoto` link column that opens `CommonLibrary.frmAttachments` with
  `TranName = "TirthRakshaTextReadyPhoto"`, `TranKm = TirthRakshaTextKm`.
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: new `child('Text', { TextTypeKt:'int', Text:'text', CheckedByKt:'int', Seq:'int' })`
  in `POPUPS` (audit columns as the others), a `TextTran` `TransSpec` + two lookups, the box, and
  `TirthRakshaTextT` added to `deleteRecord` (the desktop forgets it; decide — open question 5). The
  ReadyPhoto link is an attachments feature (TR-10).
- **DB prerequisites**: table `TirthRakshaTextT` MISSING; tblSearch `TextTran` row MISSING; `columnmaster`
  Vibhag `TirthRakshaTextType` MISSING (0 rows); Vibhag `DoneBy` PRESENT (66 rows).
- **Size**: M

#### TR-9. Summary and Subject boxes (frmVishayEntry)

- **What changed**: F2 on `txtSummaryTran` / `txtSubjectTran` opens `frmVishayEntry(TranKm, dtSummary|dtSubject)`
  exactly like the Name box (`frmTirthRakshaMaster.vb:585-644`); rows from tblSearch columns `SummaryTran` /
  `SubjectTran`. Save: `SaveVishayEntry(dtSubject, "TirthRakshaSubject", "TirthRakshaM", "TirthRakshaKm", id)`
  and `SaveVishayEntry(dtSummary, "TirthRakshaSummary", …)` (`TirthRakshaRepository.vb:214-215`), which ends
  in `EXEC UpdateVishay '<TransactionName>', '<id>'`. `FillData` shows both through `GetcontString` (1271-1272).
- **Kind**: new feature
- **Web today**: not ported. `VISHAY_ENTRIES` in `tirth-raksha.ts` has Name / PetaVishay / Remark;
  `VISHAY_BOXES` in `TirthRakshaMaster.tsx` the same three.
- **Web change needed**: two more entries in both lists, two `FieldSpec`s with `vishayEntry`, `recordExtras`
  contString for both, both TransactionNames added to `DELETED_ENTRIES` (desktop Delete leaves them — open
  question 5). The `summary` column each one writes is **not determinable** from the VB code: it is whatever
  the production `UpdateVishay` updates and the tblSearch JoinCondition reads.
- **DB prerequisites**: tblSearch rows `SummaryTran`, `SubjectTran` MISSING; `UpdateVishay` PRESENT but has
  **no** `TirthRakshaSubject` / `TirthRakshaSummary` branch (it handles only TirthRakshaName / Vishay /
  PetaVishay / Remark) → needs the production version; the summary columns on `TirthRakshaM` MISSING (names
  unknown).
- **Size**: S (once the DB side is known)

#### TR-10. Relevant Photo links (attachments)

- **What changed**: two LinkLabels. Click → `CommonLibrary.frmAttachments` with
  `TranName = "TirthRakshaRelevantLatestPhoto"` / `"TirthRakshaRelevantOldPhoto"`, `TranKm = TranKm`
  (`frmTirthRakshaMaster.vb:984-996`). `FillData` sets the captions (1285-1286):
  `"Latest Photo" & SELECT CONCAT('(',(SELECT COUNT(*) FROM Attachments WHERE TranName='TirthRakshaRelevantLatestPhoto' AND TranKm=<id>),')')`
  and the same with `Old Photo` / `TirthRakshaRelevantOldPhoto`. Designer placeholder texts are
  "Latest Photo(4)" / "Old Photo(3)". The count is not refreshed after the dialog closes (only on the next
  row click). In a new record `TranKm` is 0, so attachments added before the first save are filed under 0.
- **Kind**: new feature
- **Web today**: not ported. The web has no attachments feature at all: `features/master/desktopOnly.ts`
  `ATTACHMENTS_DESKTOP_ONLY` ("the files are on the desktop computers' drives"), and the Show Attachments
  items on Outsider / Patrika / Letter screens are commented out.
- **Web change needed**: at minimum the "Relevant Photo" label and the two links with the live counts
  (`recordExtras`), opening the same desktop-only message; a real attachments viewer is a separate, larger
  piece of work shared with the other screens.
- **DB prerequisites**: table `Attachments` PRESENT (`AttachmentKm, TranName varchar(50), TranKm, FileName,
FilePath, FileType, enuser, endate`); it holds only `TranName = 'authmast'` rows locally.
- **Size**: S (links + counts) / L (working attachments)

#### TR-11. Grid: seven new columns, one removed

- **What changed**: see TR-0 grid. `RefKrutiNo`, `RefLibNo`, `GranthName`, `GranthTypeName`,
  `GradeSubjectName`, `KrutiSeq`, `ShastraPathNo` must come out of `ListGridData`, i.e. from tblSearch rows.
  `RefreshCurrentGridRecord` (866-889) now applies `GetcontString` to Name, PetaVishay and Remark, takes Remark
  from `TirthRakshaRemarkTran`, and has a slip: `GvMain.GranthName` is set from `dtSel("RefLibNo")`, so after
  an Edit the GranthName cell shows the LibNo until the next Refresh.
- **Kind**: new feature (+ one desktop bug)
- **Web today**: old 17 columns incl. hidden `BookTKt` (`spec.columns` in `TirthRakshaMaster.tsx`). The web
  re-reads the edited row through the list query, so it would not reproduce the GranthName slip.
- **Web change needed**: new column list in the TR-0 order; nothing else (do not copy the slip).
- **DB prerequisites**: tblSearch rows `KrutiSeq`, `ShastraPathNo`, `RefKrutiNo`, `RefLibNo`, `GranthName`,
  `GranthTypeKt`, `GradeSubjectKt` — all MISSING.
- **Size**: S

#### TR-12. Print Report › Main Report (`PrintTirthRakshaReport`)

- **What changed**: new menu item (`frmTirthRakshaMaster.vb:946-956`):
  `clsCom.SetTranIds(True, <selected ids>)`, then `frmWebBrowser(DelTranId:=True)` with
  `url = "Home/PrintTirthRakshaReport"`, MDI child of `Frmlibmain`. The page belongs to the companion site
  (`GGWebSolution/GGWeb/Views/Home/PrintTirthRakshaReport.cshtml`), which runs procedure
  `PrintTirthRakshaReport` over `TranIds`.
- **Kind**: new feature
- **Web today**: **already the new way, never run.** Menu item "Main Report" in `TirthRakshaMaster.tsx`
  → action `main-report` in `tirth-raksha.ts` → `web/apps/api/src/reports/tirth-raksha.ts`
  `tirthRakshaReport`: `EXEC PrintTirthRakshaReport` inside `withTranIds`, one block per record with fields
  `Seq, ShastraPathNo, BookName, GranthName, CreationYear, RefPlace, PageNo, Author, Editor, Publisher,
PublicationYear, Edition` and the texts `OriginalText` ("Original Text :"), `Meaning`, `Definitions`. When
  the procedure is absent it answers 400 "This database does not have the PrintTirthRakshaReport procedure
  the report needs". `docs/screens/reports.md` states it has not run against a database that has the
  procedure.
- **Web change needed**: none in code; verify against a database that has the procedure (column names,
  several result sets or one, row order).
- **DB prerequisites**: procedure `PrintTirthRakshaReport` MISSING (its body is in no source tree); `TranIds`
  PRESENT; `SetTranIds` PRESENT.
- **Size**: S (verification only)

#### TR-13. Print Report › Send To Excel now works

- **What changed**: the handler was empty; now `Dim x2 As New CommonLibrary.SendtoExcel(dgMain)`
  (`frmTirthRakshaMaster.vb:998-1000`).
- **Kind**: bug fix
- **Web today**: old way — `item('Send To Excel', () => undefined, true)` (disabled) in `menu()` of
  `TirthRakshaMaster.tsx`.
- **Web change needed**: enable it with the engine's `a.sendToExcel`.
- **DB prerequisites**: none.
- **Size**: S

#### TR-14. Utility › Update Book Seq — whole-list renumbering rewritten

- **What changed**: `SetBookSeq(BookTKt As String)` (`TirthRakshaRepository.vb:630-659`): was
  `SELECT TirthRakshaKm FROM TirthRakshaM WHERE BookTKt=<b> ORDER BY TirthRakshaKm`; now
  `SELECT RefBookTKt,TirthRakshaKm FROM TirthRakshaM WHERE RefBookTKt IN(SELECT val FROM dbo.SplitString('<list>',',')) ORDER BY RefBookTKt,TirthRakshaKm`,
  numbering 1, 2, … restarting per `RefBookTKt`. The parameter is a comma list, but the menu handler still
  passes the single picked id. The picker SQL is unchanged.
- **Kind**: behaviour change (column) / refactor (list form)
- **Web today**: old way — action `update-book-seq`: `ROW_NUMBER() OVER (ORDER BY TirthRakshaKm) … WHERE BookTKt = ${bookTKt}`.
- **Web change needed**: filter on `RefBookTKt`.
- **DB prerequisites**: `TirthRakshaM.RefBookTKt` MISSING; `dbo.SplitString` PRESENT.
- **Size**: S

#### TR-15. Utility › Update Kruti Seq (new)

- **What changed**: (`frmTirthRakshaMaster.vb:970-982`) picker, `boolSelectFirst:=True`:
  `SELECT DISTINCT TirthRakshaReferenceT.KrutiMstKt,krutiMst.KrutiNo,krutiMst.extranm FROM TirthRakshaReferenceT INNER JOIN krutiMst ON TirthRakshaReferenceT.KrutiMstKt=krutiMst.krutimstkm ORDER BY krutiMst.KrutiNo`;
  picked id > 0 → `SetKrutiSeq`:
  `SELECT RefKrutiMstKt,TirthRakshaKm FROM TirthRakshaM WHERE RefKrutiMstKt IN(SELECT val FROM dbo.SplitString('<id>',',')) ORDER BY RefKrutiMstKt,TirthRakshaKm`,
  then `update TirthRakshaM set KrutiSeq=@KrutiSeq where TirthRakshaKm=@TirthRakshaKm` with 1, 2, …; then
  `FillList()`. No message, no transaction.
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: list `kruti-seq`, action `update-kruti-seq` (one `ROW_NUMBER()` UPDATE as
  `update-book-seq`), menu item, refresh.
- **DB prerequisites**: `RefKrutiMstKt`, `KrutiSeq` MISSING.
- **Size**: S

#### TR-16. Utility › Update Shastrapath No (new)

- **What changed**: (`frmTirthRakshaMaster.vb:935-944`) `MsgBox("Are you sure to update ShastraPathNo", YesNo)`;
  Yes → `SetShastraPathNo` (`TirthRakshaRepository.vb:940-962`):
  `SELECT DISTINCT TirthRakshaKt FROM TirthRakshaReferenceT WHERE EntryType='ShastraPath' ORDER BY TirthRakshaKt`,
  then per row `update TirthRakshaM set ShastraPathNo=@ShastraPathNo where TirthRakshaKm=@TirthRakshaKm` with
  1, 2, …; then `FillList()`. Records that are no longer ShastraPath keep their old number (never cleared).
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: confirm + action `update-shastrapath-no` + menu item, refresh.
- **DB prerequisites**: `TirthRakshaM.ShastraPathNo`, `TirthRakshaReferenceT.EntryType` MISSING.
- **Size**: S

#### TR-17. Utility › Add New RefKruti From RefLibNo (new, bulk copy)

- **What changed**: (`frmTirthRakshaMaster.vb:1018-1041`) picker 1 (selectFirst, no blank row):
  `SELECT DISTINCT TirthRakshaReferenceT.BookTKt,BookT.Libno FROM TirthRakshaReferenceT INNER JOIN BookT ON TirthRakshaReferenceT.BookTKt=BookT.tid ORDER BY BookT.Libno`;
  picker 2 (same options):
  `SELECT DISTINCT krutimstkm,KrutiNo FROM krutiMst K INNER JOIN krutireflibno KR ON K.krutimstkm=KR.krutimstkt INNER JOIN columnmaster colTyp ON KR.ktypeid=colTyp.ColumnMastkm AND colTyp.Name=N'मुद्रित गी.गं भंडारनुं प्रथम पुस्तक' ORDER BY K.KrutiNo`;
  both picked → `AddNewRefKrutiFromRefLibNo(curr_lnid, BookTKt, KrutiMstKt)`; result > 0 →
  `MsgBox("New Records Added Successfully")`, `FillList()`.
  Repository (`TirthRakshaRepository.vb:761-927`): starting numbers `GetMaxSeq()`,
  `GetMaxKrutiSeq(kruti)`, `GetMaxBookSeq(book)`; source rows
  `SELECT TirthRakshaKm,TirthRakshaName,txtAuthor,TirthKt,Vishay,PetaVishay,PurnataKt,GroupNo,ProjectKt,DoneByKt,ProjectDetail,txtRemark,txtBhasha,RefBookTKt,RefKrutimstKt FROM TirthRakshaReferenceT INNER JOIN TirthRakshaM ON TirthRakshaReferenceT.TirthRakshaKt=TirthRakshaM.TirthRakshaKm WHERE BookTKt=<book>`;
  for each source record it builds a new entity (Name, txtAuthor, TirthKt, Purnata, Project, DoneBy,
  ProjectDetail, the three sequence numbers, `RefBookTKt` = picked book, `RefKrutiMstKt` = picked kruti),
  loads **every** popup of the source through its tblSearch F2EntryText (AuthTran 3 sets, Samvat, Kshetra,
  Bhasha, Kruti, Reference, Vishay, MainPerson, Name, Remark, PetaVishay, Text, Summary, Subject), zeroes all
  keys, sets every Reference row's `BookTKt` / `KrutiMstKt` to the picked pair, and calls `Save` (one
  transaction **per record**, not one overall); Seq / BookSeq / KrutiSeq += 1. Always returns 1 unless an
  exception escapes the loop.
  Things that look wrong as written (read from the code, not run):
  - `Ent.GranthName` is never set, so it is `Nothing` and `AddWithValue("@GranthName", Nothing)` sends no
    parameter — `Save` would fail on every record, show its error box and still end with "New Records Added
    Successfully". GranthTypeKt / AuthorSampradayKt / GradeSubjectKt / ShastraPathNo are not copied (0).
  - A source record with several references to the picked book appears several times in the source SELECT
    and would be duplicated that many times.
  - `WHERE BookTKt=` is unqualified: ambiguous if `TirthRakshaM` still has a `BookTKt` column.
  - Each `Save` also runs the TR-4 shifts.
- **Kind**: new feature
- **Web today**: not ported.
- **Web change needed**: two pick lists, one action that copies the records server-side (reuse the screen's
  own `save` with rows loaded from tblSearch and keys cleared), menu item, the message, refresh. Decide first
  whether it works on the desktop at all and what it should do (open question 4).
- **DB prerequisites**: everything in TR-1, TR-3, TR-5, TR-8, TR-9 (MISSING); `krutireflibno`, `columnmaster`
  type row — PRESENT (already used by the Reference KrutiNo list).
- **Size**: L

#### TR-18. For Selected Record › Kruti Master (new)

- **What changed**: (`frmTirthRakshaMaster.vb:1002-1016`) opens `frmKrutiMasterNew` with `StrId` set to the
  **query text**
  `SELECT DISTINCT KrutiMstKt FROM TirthRakshaReferenceT WHERE TirthRakshaReferenceT.TirthRakshaKt IN(<selected ids>) UNION SELECT DISTINCT KrutiKt FROM TirthRakshaKrutiT WHERE TirthRakshaKrutiT.TirthRakshaKt IN(<selected ids>)`,
  MDI child. Note the second half returns `TirthRakshaKrutiT.KrutiKt`, which is a `columnmaster` id
  (Vibhag `TirthRakshaKruti`), not a `krutiMst` key — so it can pull unrelated Kruti records whose key
  happens to equal a columnmaster id (desktop bug).
- **Kind**: new feature
- **Web today**: not ported; only `book-master` exists (`openInUse(db, 'book-master', …)`).
- **Web change needed**: action `kruti-master` with `openInUse(db, 'kruti-master', …)` and the menu item.
  Port the UNION as written or only the first half (open question 6).
- **DB prerequisites**: none new.
- **Size**: S

#### TR-19. `txtAuthor` text: author type name and Avastha filter

- **What changed**: `GetAuthorName` (`TirthRakshaRepository.vb:535, 549`):
  `select isnull(authtyattr,'') from authtype where authtycokm=…` → `select isnull(authortype,'') from authtype …`;
  `… from VisheshMast VisPad where VisPad.Tid='…' and VisPad.remark='Avastha'` → `… and VisPad.Vibhag='Avastha'`.
  So `TirthRakshaM.txtAuthor` now starts with the full author-type name instead of its short attribute, and
  the Avastha lookup reads a renamed column.
- **Kind**: behaviour change (text) + schema rename
- **Web today**: old way — `authorText()` in `web/apps/api/src/master/screens/prakashak.ts` (shared with
  Prakashak Master; Tirth Raksha passes `AUTHOR_KEYS`) selects `authtyattr` and filters
  `remark = 'Avastha'`. The Tirth Raksha `padvi` lookup in `tirth-raksha.ts` also uses
  `visheshmast WHERE remark = 'avastha'`.
- **Web change needed**: give `authorText` an option for the type column so Tirth Raksha uses `authortype`
  while Prakashak keeps its own (check Prakashak's updated repository before changing the default). The
  `remark` → `Vibhag` rename is database-wide and belongs to whoever owns VisheshMast; it must be switched
  everywhere at once.
- **DB prerequisites**: `authtype.authortype` PRESENT; `VisheshMast.Vibhag` MISSING (the column is still
  `remark` locally).
- **Size**: S (here); the rename itself is cross-cutting

#### TR-20. New-record carry-over, form plumbing

- **What changed**: `btnNew_Click` no longer writes anything into the grid; BookSeq is cleared when the
  carried reference has no book (TR-3). `ClearDataTable` also resets `dtSummary`, `dtSubject`, `dtText` and
  the three `Ref*` variables. `FillTransactionDatatable` learned `SummaryTran`, `SubjectTran`, `TextTran`.
- **Kind**: refactor only, apart from TR-3.
- **Web today / change**: covered by TR-3, TR-8, TR-9. Copy (`copy.loadTrans: Object.keys(TRANS)`) will pick
  the new popups up automatically once they are in `TRANS`.
- **Size**: —

#### TR-21. Calls into `frmDisplayTransNew` from this form

| Call site                                                               | Old             | New                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2 `txtTextTran` (`:718-725`)                                           | —               | **new**: `TranName="Text"`, `FormName="TirthRaksha"`, `TranId=TranKm`, `dtDisp=dtText.Copy`; result `dtText = frm.dtDisp.Copy` (no `dsDisp`)      |
| F2 `txtReferenceTran` (`:694-701`, result `:743-761`)                   | same parameters | parameters unchanged; `dtDisp` now carries an `EntryType` column; the result handler is the TR-3 logic instead of writing the grid's BookTKt cell |
| Author, Samvat, Kshetra, Bhasha, Kruti, MainPerson, Vishay, Work Report |                 | unchanged                                                                                                                                         |

`frmVishayEntry` gets two more callers (Summary, Subject); `frmVishayEntry.vb` itself is unchanged.

---

### Magazine Vishesh — `Library/Library/frmMagazineVisheshNew.vb` (+ `.Designer.vb`), `MagazineVisheshRepository.vb`, `IMagazineVisheshRepository.vb`

Web counterparts: `web/apps/api/src/master/screens/magazine-vishesh.ts` (+ shared `vishesh-entry-common.ts`),
`web/apps/web/src/screens/MagazineVisheshMaster.tsx` (+ shared `visheshEntry.ts`), note
`web/docs/screens/magazine-vishesh-master.md`. `frmEnglishBookVishesh.vb`, `EnglishBookVisheshRepository.vb`,
`frmVishayEntry.vb`, `EntMagazineVishesh.vb`, `frmMagazineVisheshNew.resx` and the old `frmMagazineVishesh.vb`
have **zero** differences.

#### MV-1. Proof popup (`txtProofTran`) — new table `MagazineVisheshProofT`, keyed by the book copy

- **What changed**: new box `txtProofTran` (471,138,200, TabIndex 40) under the label "Proof". F2 opens
  `frmDisplayTransNew` with **`TranName = "Proof"`, `FormName = "MagazineVishesh"`, `TranId = TranKm`**
  (`Updated/…/frmMagazineVisheshNew.vb:504-511`). The rows are loaded with `{Id}` replaced by
  **`txtBookTKt.Tag`**, not the record id (`:402`,
  `IIf(ColumnName = "ProofTran", txtBookTKt.Tag, TranKm)`), so the proofs belong to the LibNo and every
  Magazine Vishesh record of that copy shows and edits the same rows. Save
  (`Updated/…/MagazineVisheshRepository.vb:237-273`), only when the popup was opened:
  - dates arrive as `dd/MM/yyyy` text and are re-ordered to `MM/dd/yyyy` by `Split("/")`; empty → `NULL`;
  - key `< 0` →
    `INSERT INTO MagazineVisheshProofT(BookTKt,ProofTypeKt,PartyKt,SentDate,ReceivedDate,Remark,Seq,enuser,endate) VALUES (<Ent.BookTKt>,…,GETDATE())`
    (note `< 0`, not `<= 0`: a row with key 0 is UPDATEd and silently lost);
  - else `UPDATE MagazineVisheshProofT SET ProofTypeKt=…,PartyKt=…,SentDate=…,ReceivedDate=…,Remark=…,Seq=…,moduser=…,moddate=GETDATE() WHERE MagazineVisheshProofKm=…`;
  - `DELETE FROM MagazineVisheshProofT WHERE BookTKt=<Ent.BookTKt> AND MagazineVisheshProofKm NOT IN(<kept>)`.
    Delete of a record (`:374`) adds
    `DELETE FROM MagazineVisheshProofT WHERE MagazineVisheshKt IN(<ids>)` — a column the INSERT never fills;
    if the table has no `MagazineVisheshKt` column this statement throws and every delete fails (not
    determinable without the table).
    Seen in the popup code (for the port): hidden `MagazineVisheshProofKm`, `ProofTypeKt`, `PartyKt`; `Remark`
    editable; `ProofType` F2 =
    `select columnmastkm,name,ColumnNo from columnmaster where vibhag = 'ProofType' order by columnno`
    (AddTableInfo `columnmaster|ProofType`); `Party` F2 =
    `SELECT partyMkm,PName AS Party FROM PartyM WHERE LEN(ISNULL(PName,''))>1 ORDER BY PName`; `SentDate` /
    `ReceivedDate` ask through `InputBox("Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)", …)`
    defaulting to today.
- **Kind**: new feature
- **Web today**: not ported. `magazine-vishesh.ts` `children`: Bhasha, MType, AuthorType, Author.
- **Web change needed**: a fifth popup for Magazine Vishesh only (English Book Vishesh must not get it): rows
  loaded by the form's BookTKt, child table parented on `BookTKt`, two lookups, two date cells, the box.
  `vishesh-entry-common.ts` assumes every child hangs off the record id (`deleteRecord`,
  `upsertChildRows(trx, table, recordId, …)`), so it needs a per-child parent override. Exclude Proof from
  `copy.loadTrans` (a copy of the same LibNo already shares the rows; re-keying them would duplicate). Decide
  what Delete does (open question 8).
- **DB prerequisites**: table `MagazineVisheshProofT` MISSING; tblSearch `MagazineVishesh` / `ProofTran` row
  MISSING (popup SQL, the grid/box sub-select); `columnmaster` Vibhag `ProofType` PRESENT (2 rows); `PartyM`
  PRESENT.
- **Size**: M

#### MV-2. Search by "Proof" (F2 or F3 in the search box)

- **What changed**: new block at the end of `Txt_KeyDown` (`frmMagazineVisheshNew.vb:573-590`): in
  `txtSearch`, on **F2 or F3**, when the Search By combo text is `Proof`, a list opens:
  `SELECT DISTINCT BookTKt,BookT.Libno,BookM.BookName,colProof.Name AS ProofType,PartyM.PName AS Party,CONVERT(VARCHAR(12),SentDate,103) AS SentDate,CONVERT(VARCHAR(12),ReceivedDate,103) AS ReceivedDate,MagazineVisheshProofT.Remark from MagazineVisheshProofT INNER JOIN BookT ON MagazineVisheshProofT.BookTKt=BookT.tid INNER JOIN BookM ON BookT.BookMastkt=BookM.BookMastkm LEFT JOIN columnmaster AS colProof ON MagazineVisheshProofT.ProofTypeKt=colProof.ColumnMastkm LEFT JOIN PartyM ON MagazineVisheshProofT.PartyKt=PartyM.partyMkm where 1=1 ORDER BY Libno`.
  A pick sets `WhereCondition = " and BookTKt IN(<picked BookTKt>)"`, runs `FillList()` + `FillData()`, then
  restores the previous WhereCondition (so the next Refresh returns to the previous scope). The old empty
  `If txt.Name.ToLower = "txtsearch"` branch was removed, which is what lets the new block be reached.
- **Kind**: new feature
- **Web today**: not ported. The engine has the hook: `ScreenSpec.searchF2` (`features/master/types.ts:735`);
  whether it also fires on F3 was not checked.
- **Web change needed**: `searchF2: { Proof: … }` on the Magazine Vishesh spec: a pick list (server `lists`
  entry with the SQL above), then show only that copy's records.
- **DB prerequisites**: `MagazineVisheshProofT` MISSING; a searchable tblSearch row whose DisplayName is
  `Proof` MISSING.
- **Size**: S–M

#### MV-3. Sabhar, Reference and HeadName plain boxes are now read-only

- **What changed**: Designer: `txtSabhar.ReadOnly = True`, `txtReference.ReadOnly = True`,
  `txtHeadName.ReadOnly = True` (were editable). They are still read into `Ent.Sabhar` / `Reference` /
  `HeadName` and saved, so the stored text is preserved; only typing is blocked. `Txt_KeyDown` does not test
  ReadOnly, so F2 on them still opens the "distinct earlier values" list and can still replace the text.
- **Kind**: behaviour change
- **Web today**: old way — `Sabhar`, `Reference`, `HeadName` are plain editable `FieldSpec`s in
  `MagazineVisheshMaster.tsx`.
- **Web change needed**: mark the three `readOnly` with `alwaysSend` (as Tirth Raksha's `Seq` does), so the
  stored text is still saved. The engine's read-only boxes do not open F2 (`types.ts` comment on
  `readOnlyWhen`), whereas the desktop's still do — decide whether that F2 matters here.
- **DB prerequisites**: none.
- **Size**: S

#### MV-4. Send To Excel is now a formatted workbook

- **What changed**: `SendToExcelToolStripMenuItem1_Click` (`frmMagazineVisheshNew.vb:848-851`): was
  `New CommonLibrary.SendtoExcel(dgMain)`; now
  `New CommonLibrary.SendToExcelWithFormatting(dgMain, String.Format("Magazine Vishesh ({0} - {1})", txtBookTKt.Text.Trim, txtBookMastKt.Text.Trim), "1st proof in GG" & vbCrLf & "2nd proof", "$1:$1", "$A:$B")`.
  `SendToExcelWithFormatting` is a new class in `CommonLibrary.dll`; the decompiled copy in
  `.legacy-decompiled/` is the old DLL and does not contain it. The form keeps an unused private
  `SendToExcelNew` with the same arguments (its call is commented out), which is the best available
  description: visible columns wider than 5 px only; bold header row; cells "Noto Serif Devanagari" 10, wrap,
  top-left; column width = grid width / 7; landscape; gridlines printed; centre header = the title above;
  right header = the GG logo (50×25); left footer = `1st proof in GG` / `2nd proof`; centre footer
  `Page &P of &N`; right footer today `dd-MM-yyyy`; margins L 0.9 / R 1 / T 1.6 / B 1.5 cm, header 0.7,
  footer 0.4 cm; row 1 and columns A:B repeat on every page; saved as
  `excelfiles/<user id>/<user id>_<guid>.xlsx` and opened. That the DLL class does exactly this is an
  assumption.
- **Kind**: behaviour change
- **Web today**: old way — the engine's `sendToExcel` (`features/master/sendToExcel.ts`) downloads a plain
  CSV named after the screen.
- **Web change needed**: a real `.xlsx` with page setup for this screen (needs an xlsx writer; CSV cannot
  carry headers, footers, repeat rows or fonts). Confirm the wanted layout first (open question 9).
- **DB prerequisites**: none.
- **Size**: M

#### MV-5. Panel re-laid out

- **What changed** (Designer, old → new): left boxes x 130 → **159**; middle labels x 356 → **370**, middle
  boxes x 457 → **471**; `txtSeq` 130,58,107 → **159,58,99**; `txtSubSeq` 239,58,91 → **260,58,99**;
  label `Label26` "Author Type" → **"Author Type/Name"**; `txtAuthorTypeTran` 130,138,200 → **159,138,99**;
  `txtAuthorTran` 457,138,200 → **260,138,99** (now beside Author Type); label `Label16` "Author" (356,142) →
  **"Proof"** (370,142) with `txtProofTran` at 471,138,200; `txtSabhar` 130 → 159, `txtSabharTran` 231 → 260,
  `txtReference` 457 → 471, `txtReferenceTran` 558 → 572; `txtBookTKt`, `txtBhashaTran`, `txtWorkDoneByKt`
  130 → 159; `txtBookMastKt`, `txtAnk`, `txtMTypeTran`, `txtPDFPath` 457 → 471. Right-hand column (x 683 /
  794 / 895) and the grid columns are unchanged. TabIndex values are unchanged (Proof = 40).
- **Kind**: UI/layout
- **Web today**: old positions and labels in `MagazineVisheshMaster.tsx` `fields`.
- **Web change needed**: update the coordinates and the two labels; add the Proof box.
- **DB prerequisites**: none.
- **Size**: S

#### MV-6. Edited row shows the Vishay summaries through `GetcontString`

- **What changed**: `RefreshCurrentGridRecord` (`:655-670`) now sets Detail / Sabhar / Reference / HeadName
  cells with `clsCom.GetcontString(…)`.
- **Kind**: bug fix
- **Web today**: already the new way (the edited row is re-read through the list query; note lines 341, 436).
- **Web change needed**: none.
- **Size**: —

#### MV-7. One-line items

- `IMagazineVisheshRepository.Save` / `Save(…)` gained the `dtProof` argument — refactor only (covered by MV-1).
- Commented-out `DetailTran` block and `Imports Spire.Xls / System.IO / Spire.Xls.Core` — refactor only.
- `ClearDataTable` resets `dtProof` — refactor only.

#### MV-8. Calls into `frmDisplayTransNew` from this form

| Call site                                         | Old | New                                                                                                                                    |
| ------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F2 `txtProofTran` (`:504-511`, result `:525-526`) | —   | **new**: `TranName="Proof"`, `FormName="MagazineVishesh"`, `TranId=TranKm`, `dtDisp=dtProof.Copy`; rows pre-loaded by `txtBookTKt.Tag` |
| Bhasha, MType, AuthorType, Author, Work Report    |     | unchanged                                                                                                                              |

### `Library.BusinessContract/Concrete/MagazineMRepository.vb`

- Two commented-out blocks (old inline `PrakMAddT` and `MagBookmT` INSERT loops) deleted — **refactor only**,
  no executable line changed. `frmMagazineMaster.vb` / `.designer.vb` are identical. Web `magazine.ts` /
  `MagazineMaster.tsx`: nothing to do.

---

### Tree — `Library/Master/frmTreeMast.vb` (+ `.Designer.vb`, `.resx`)

Web today for every entry: **not ported.** `vishay-tree`, `sampraday-tree` and `vishay-member` are commented
out in `web/packages/shared/src/menu.ts` (lines 73, 74, 141) and no screen is registered.

Do the changes touch the existing web tree components? **No.**

- `web/apps/web/src/features/master/UplevelTree.tsx` (used by `SampradayMaster.tsx`, `VisheshMaster.tsx`)
  and `web/apps/web/src/screens/KrutiTree.tsx` / `AuthorTree.tsx` (these two live under `screens/`, not
  `features/master/`) build their trees from each table's own up-level column. None reads `TreeMast`.
- The only web code that reads `TreeMast` is `web/apps/api/src/master/screens/gr-vishay.ts` (New Vishay
  Master › Utility › Show Member/Master). Its queries use `TreeMastkm`, `masterid`, `recordkt`, `Tablekt`,
  `seq` — none of which changed; no `TreeMast` column was added or renamed.
- One related change outside this slice's files: the Sampraday Tree launch in `Frmlibmain.vb:561` now passes
  `" and Vibhag ='sampraday'"` instead of `" and remark ='sampraday'"` (the VisheshMast rename, see TR-19).

Changes, for whenever the tree screens are ported:

- **TM-1. "Relations" column in both grids** — main grid:
  `(SELECT COUNT(*) FROM TreeMast T1 WHERE T1.MainMasterId=TreeMast.TreeMastkm) AS Relations`
  (`Updated/Library/Master/frmTreeMast.vb:550-551`); sub grid:
  `(SELECT COUNT(*) FROM TreeMast T1 WHERE T1.masterid=TreeMast.TreeMastkm) AS Relations` (`:588`). New
  columns `colRelations1` / `colRelations` (header "Relations", width 70, read-only) before Seq. Main grid:
  Vishay 185 → 335 wide and **Brief now hidden**; sub grid Vishay 285 → 335. Kind: new feature. DB: none
  (`TreeMast` PRESENT, columns unchanged). Size S.
- **TM-2. Layout** — `dgMain` / `tvTree` 515×656 → 484×636, `dgSub` (524,52) 488×656 → (495,52) 484×636; all
  three lost the Right anchor (they no longer stretch with the window). Kind: UI/layout. Size S.
- **TM-3. The tree no longer replaces the main grid by itself** — `FillTree` used to end with
  `tvTree.Visible = True : dgMain.Visible = False`; both lines are commented (`:645-646`), and `FillTree()`
  is now also called on load, `Refresh1`, `AddMaster` and after the main grid's Save Seq
  (`SaveSeqToolStripMenuItem1_Click`), and `FillMainGrid()` after two tree-side edit paths (`:519`, `:540`). Net effect: the grid stays on screen and the tree is kept current in the
  background; only "Display In Tree" switches the view. Kind: behaviour change. Size S.
- **TM-4. Clicking the sub grid filters the main grid only in "all members" mode** — new flag
  `boolDisplayMainFromSub`, set when `FillSubGrid("", "")` runs (load / refresh) and never reset;
  `dgSub_Click` runs `FillMainGrid(<MainMasterId of the selected sub rows>)` only when it is set. As the flag
  is set during load, the old behaviour effectively remains (the guard is always true after load). Kind:
  behaviour change with no visible effect found. Size —.
- **TM-5. "Show In Use" renamed "For Selected Records" + new item "Vishay Master"** (both menus) —
  `ShowInUseVishayMaster` (`:438-460`): by `TableName`, opens `frmGrVishayMaster` (`grvishay`),
  `frmVishayMaster` (`vishay`) or `frmVisheshMaster` (`visheshmast`) with
  `WhereCondition = " AND <Tablecokm> IN(<Recordkt of the selected rows>)"`. Kind: new feature. Size S.
- **TM-6. New submenu "For Current Record" › "Save Vishay Remark"** (both menus) — `SaveRemark` (`:1398-1417`):
  `SELECT Remark FROM <TableName> WHERE <Tablecokm>=<RecordKt>` → `InputBox("Please Enter Remark", DefaultResponse:=<it>)`;
  non-empty → `UPDATE <TableName> SET Remark=N'<text>' WHERE <Tablecokm>=<RecordKt>` (string-built: an
  apostrophe breaks it; injection candidate — parameterise) → `MsgBox("Record Saved Succefully")`. An empty
  answer changes nothing, so a remark cannot be cleared. Hidden when `TableName` is `visheshmast`
  (`cntMain_Opening` / `cntSub_Opening`). Wiring slip: the sub-grid item `SaveVishayRemarkToolStripMenuItem1`
  is handled by **two** subs (`:1391` for the sub row and `:1419` `Handles … , SaveVishayRemarkToolStripMenuItem1.Click`
  for the main row), so it asks twice — once per grid. Kind: new feature (+ desktop bug). DB: `Vishay.remark`
  and `GrVishay.remark` PRESENT. Size S.
- **TM-7.** Dead commented code removed in the Graphic Detail handler — refactor only.

No call into `frmDisplayTransNew` exists in `frmTreeMast.vb`, before or after.

---

## 1. Database objects this slice needs

| Object                                                                                                                                               | Needed by                    | Local DB                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `TirthRakshaM.KrutiSeq` (int)                                                                                                                        | TR-3, 4, 15                  | MISSING                                                                                    |
| `TirthRakshaM.RefKrutiMstKt` (int)                                                                                                                   | TR-1, 4, 15                  | MISSING                                                                                    |
| `TirthRakshaM.RefBookTKt` (int)                                                                                                                      | TR-1, 4, 14                  | MISSING                                                                                    |
| `TirthRakshaM.ShastraPathNo` (int)                                                                                                                   | TR-3, 16                     | MISSING                                                                                    |
| `TirthRakshaM.GranthName` (string, length unknown)                                                                                                   | TR-6                         | MISSING                                                                                    |
| `TirthRakshaM.GranthTypeKt` (int)                                                                                                                    | TR-6                         | MISSING                                                                                    |
| `TirthRakshaM.AuthorSampradayKt` (int)                                                                                                               | TR-6                         | MISSING                                                                                    |
| `TirthRakshaM.GradeSubjectKt` (int)                                                                                                                  | TR-6                         | MISSING                                                                                    |
| `TirthRakshaM` summary columns written by `UpdateVishay` for `TirthRakshaSummary` / `TirthRakshaSubject`                                             | TR-9                         | MISSING (names unknown)                                                                    |
| `TirthRakshaM.BookTKt`, `TirthRakshaM.Remark` (no longer used)                                                                                       | TR-1, 7                      | PRESENT (fate in production unknown)                                                       |
| `TirthRakshaReferenceT.EntryType` (string: `TirthRaksha` / `ShastraPath`)                                                                            | TR-3, 5, 16                  | MISSING                                                                                    |
| table `TirthRakshaTextT`                                                                                                                             | TR-8                         | MISSING                                                                                    |
| table `MagazineVisheshProofT`                                                                                                                        | MV-1, 2                      | MISSING                                                                                    |
| procedure `PrintTirthRakshaReport`                                                                                                                   | TR-12                        | MISSING                                                                                    |
| procedure `UpdateVishay` with `TirthRakshaSubject` / `TirthRakshaSummary` branches                                                                   | TR-9                         | PRESENT, branches MISSING                                                                  |
| `VisheshMast.Vibhag` (replaces `remark`)                                                                                                             | TR-19, Sampraday Tree launch | MISSING (`remark` PRESENT)                                                                 |
| `authtype.authortype`                                                                                                                                | TR-19                        | PRESENT                                                                                    |
| `dbo.SplitString`, `TranIds`, `SetTranIds`, `Attachments`, `TreeMast`                                                                                | TR-14/15, TR-12, TR-10, TM-1 | PRESENT                                                                                    |
| tblSearch `TirthRakshaM`: `KrutiSeq`, `ShastraPathNo`, `RefKrutiNo`, `RefLibNo`, `GranthName`, `GranthTypeKt`, `GradeSubjectKt`, `AuthorSampradayKt` | TR-6, 11                     | all MISSING                                                                                |
| tblSearch `TirthRakshaM`: `TextTran`, `SummaryTran`, `SubjectTran` (Type T, with F2EntryText)                                                        | TR-8, 9, 17                  | all MISSING                                                                                |
| tblSearch `TirthRakshaM` / `ReferenceTran` F2EntryText returning `EntryType`                                                                         | TR-5                         | row PRESENT, old text                                                                      |
| tblSearch `MagazineVishesh` / `ProofTran` (Type T) and a searchable row displayed as `Proof`                                                         | MV-1, 2                      | MISSING                                                                                    |
| `columnmaster` Vibhag `TirthRakshaTextType`                                                                                                          | TR-8                         | MISSING (0 rows)                                                                           |
| `columnmaster` Vibhag for Granth Type / Grade Subject / Author Sampraday lists                                                                       | TR-6                         | not determinable (Vibhag names are only in the missing tblSearch rows; `Grade` has 5 rows) |
| `columnmaster` Vibhag `ProofType`                                                                                                                    | MV-1                         | PRESENT (2 rows)                                                                           |
| `columnmaster` Vibhag `DoneBy`                                                                                                                       | TR-8                         | PRESENT (66 rows)                                                                          |
| Config_Master rows                                                                                                                                   | —                            | none new in this slice                                                                     |

Missing tables, as far as the code shows them:

`TirthRakshaTextT` (from the INSERT/UPDATE/DELETE in `TirthRakshaRepository.vb:489-510` and the popup):

| Column                                   | Type                                    | Source                                             |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------- |
| `TirthRakshaTextKm`                      | int IDENTITY, PK                        | `SELECT @@identity`                                |
| `TirthRakshaKt`                          | int                                     | parent `TirthRakshaM.TirthRakshaKm`                |
| `TextTypeKt`                             | int                                     | `INint`; columnmaster Vibhag `TirthRakshaTextType` |
| `Text`                                   | nvarchar (length unknown, probably max) | `INSQ`                                             |
| `CheckedByKt`                            | int                                     | `INint`; columnmaster Vibhag `DoneBy`              |
| `Seq`                                    | int                                     | `INint`                                            |
| `enuser`, `endate`, `moduser`, `moddate` | int / date(time)                        | audit                                              |

The popup also shows `TextTypeName`, `CheckedByName` and `ReadyPhoto`; these are expected to be computed in
the tblSearch F2EntryText, not stored (assumption — the text is missing).

`MagazineVisheshProofT` (from `MagazineVisheshRepository.vb:237-273, 374` and the popup):

| Column                                   | Type                      | Source                                                                       |
| ---------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `MagazineVisheshProofKm`                 | int IDENTITY, PK          | `SELECT @@identity`                                                          |
| `BookTKt`                                | int                       | parent `BookT.tid`                                                           |
| `ProofTypeKt`                            | int                       | columnmaster Vibhag `ProofType`                                              |
| `PartyKt`                                | int                       | `PartyM.partyMkm`                                                            |
| `SentDate`                               | date/datetime, NULL       | written as `'MM/dd/yyyy'` or `NULL`                                          |
| `ReceivedDate`                           | date/datetime, NULL       | same                                                                         |
| `Remark`                                 | nvarchar (length unknown) | `INSQ`                                                                       |
| `Seq`                                    | int                       |                                                                              |
| `enuser`, `endate`, `moduser`, `moddate` | int / date(time)          | audit                                                                        |
| `MagazineVisheshKt`                      | int ?                     | referenced **only** by the record Delete; never inserted — existence unknown |

## 2. Open questions for the user

1. **Schema source.** Can we get the production schema for the objects marked MISSING — ideally a fresh
   backup, or at least the `CREATE` scripts for `TirthRakshaTextT`, `MagazineVisheshProofT`, the new
   `TirthRakshaM` / `TirthRakshaReferenceT` columns, procedures `PrintTirthRakshaReport` and `UpdateVishay`,
   and the `tblSearch` rows of `TirthRakshaM` and `MagazineVishesh`? The F2 lists of Granth Type, Grade
   Subject and Author Sampraday, the summary columns of Summary / Subject and the Proof / Text popup queries
   exist only there.
2. **`TirthRakshaM.BookTKt` → `RefBookTKt`:** was the column renamed (data carried over) or is `RefBookTKt` a
   new column that was back-filled? Same for `Remark`: was the old Remark(R) text moved somewhere, or is it
   simply no longer shown?
3. **Sequence shift on every save (TR-4).** The desktop now pushes other records' BookSeq / KrutiSeq up on
   every save, even when the number did not change, so re-saving a record renumbers its neighbours. Port it
   exactly, or shift only when the number is new or changed?
4. **Add New RefKruti From RefLibNo (TR-17).** As written it appears to fail on every record (GranthName not
   supplied) while still reporting success. Is this utility used in production, and what should it do —
   including whether Granth / Sampraday / Grade values and the ShastraPathNo should be copied?
5. **Delete leaves orphans (TR-0).** Deleting a Tirth Raksha record does not remove its Text rows, its
   Subject / Summary Vishay lines or its attachments. Should the web delete them (recommended) or match the
   desktop?
6. **For Selected Record › Kruti Master (TR-18)** mixes Kruti keys with `columnmaster` ids from the Kruti(K)
   popup. Port only the reference half?
7. **Relevant Photo / Ready Photo (TR-10, TR-8).** The web has no attachments feature (the files sit on
   desktop drives). Show the links with counts and a "desktop only" message for now, or is a web attachments
   store wanted in this round?
8. **Magazine Vishesh proofs (MV-1).** Proof rows belong to the LibNo, not to one record. On deleting a
   record the desktop runs a delete by `MagazineVisheshKt` that probably matches nothing (or fails if the
   column does not exist). Should deleting a record leave the copy's proofs alone?
9. **Formatted Excel export (MV-4).** The exact output of the new `SendToExcelWithFormatting` is in a DLL we
   have no source for. Is the layout described in MV-4 (taken from the form's unused twin routine) what
   users get, and is an `.xlsx` with that page setup required on the web, or is the current CSV acceptable?
10. **`- Reference(P) is Mandatory`** still names "(P)" although the label is now "Ref/ShastraNo", and a
    Kruti-only reference still fails on `- BookSeq is Mandatory` unless a BookSeq is typed. Keep both as on
    the desktop?
