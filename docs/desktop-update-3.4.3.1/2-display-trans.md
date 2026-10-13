# Slice 2 — `Library/CommonForms/frmDisplayTransNew.vb` (generic "trans" popup)

Scope: `frmDisplayTransNew.vb` 11,657 → 12,610 lines, 69 hunks. `frmDisplayTransNew.designer.vb` and `.resx` are **identical** in both trees (no new buttons, no new right-click items, no layout change).

All line numbers are `GGLibrarySolutionUpdated/Library/CommonForms/frmDisplayTransNew.vb` unless stated ("Updated/…").

What did NOT change in this file: the toolbar handlers (New/Save/Delete/Up/Down), `TsBtnSave` validation and messages, key handling, the context menu, Compare Data. Every change is inside a `SetForm_*` branch (row template `s=1`, grid setup `s=2`, F2 lookup `s=0`), plus the dispatcher, View Image and one new cell-click handler. The popup never writes to the DB itself; the save SQL quoted below lives in the calling form/repository (other slices) and is given only so the popup's columns and tables are pinned down.

Three things dominate the slice:

1. **`visheshMast.Remark` → `visheshMast.Vibhag`** in every category lookup (49 changed statements, Hastprat included). The local DB has no `Vibhag` column on `visheshMast`.
2. **Seven new popups on screens the web already has** (Book Master ×3, Book Tran ×2, Magazine Vishesh ×1, Tirth Raksha ×1), all backed by tables and `tblSearch` rows the local DB lacks.
3. **Three new `FormName`s for screens that are new in the update** (Shastra Path, Employee Performance Evaluation, J Series).

---

### A. Cross-cutting: `visheshMast` category column renamed `Remark` → `Vibhag`

- **What changed**: every `visheshMast` lookup that filtered on the category now filters on `Vibhag`. Nothing else in those statements changed. Example, `SetForm_BookT` Mark (line 1319):
  old `select Tid,Vishesh,Brief,VisheshNo from VisheshMast v where remark = 'MARK' and v.VisheshNo between 1 and 20  order by VisheshNo`
  new `select Tid,Vishesh,Brief,VisheshNo from VisheshMast v where Vibhag = 'MARK' and v.VisheshNo between 1 and 20  order by VisheshNo`
  Affected lookups by popup (Updated line → category → web lookup that mirrors it today):

  | Popup (`SetForm_*` / TranName)                               | Line                               | Category                                                           | Web lookup today (all still `remark = …`)                                                            |
  | ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
  | BookT / Mark                                                 | 1319                               | MARK                                                               | `apps/api/src/master/screens/book-tran.ts:290` (`trans.MarkTran.markname`) and `:306` (`lists.mark`) |
  | Common / Address (city)                                      | 1845                               | city                                                               | `author.ts:684`, `prakashak.ts:562` (`ADDRESS_TRANS` city)                                           |
  | Kruti / Author (avastha)                                     | 2849                               | Avastha, VisheshNo>0                                               | `kruti.ts:962`                                                                                       |
  | Kruti / Remark (word)                                        | 3090                               | Word                                                               | not ported (branch has no caller in `frmKrutiMasterNew`)                                             |
  | PrakMast / multiauthor (padvi)                               | 3771                               | avastha, visheshno>5                                               | `prakashak.ts:533`                                                                                   |
  | PrakMast / GMala                                             | 3860                               | gmala                                                              | `prakashak.ts:572`                                                                                   |
  | PrakMast / Address (city)                                    | 4000                               | city                                                               | `prakashak.ts:562`                                                                                   |
  | PrakMast / PrakContact                                       | 4120 (two lookups)                 | conttype, contactnm                                                | `prakashak.ts:541`, `:544`                                                                           |
  | PrakMast / Samvat (sthalname)                                | 4287                               | city                                                               | `author.ts:695` (shared constant)                                                                    |
  | PrakMast / PraptiSthan (cityname)                            | 4475                               | City                                                               | `prakashak.ts:600`                                                                                   |
  | Author / Parampara (guru)                                    | 4631                               | Guru                                                               | `author.ts:733`                                                                                      |
  | Author / Visheshan                                           | 4722                               | Visheshan                                                          | `author.ts:753`                                                                                      |
  | Author / AnyName, AnyName2 (avastha)                         | 4763, 4839                         | Avastha                                                            | `author.ts:705`                                                                                      |
  | Author / Contact                                             | 5019 (4 statements), 5046          | conttype, contactnm (+`UpLevelKt`), City                           | `author.ts:769`, `:776`, `:782`, `:786`, `:791`                                                      |
  | Author / Samvat (sthalname)                                  | 5446                               | city                                                               | `author.ts:695`                                                                                      |
  | Sampraday / Sthal                                            | 5941                               | City                                                               | `sampraday.ts:254`                                                                                   |
  | Patrika / MixSign                                            | 6012                               | CHKBX, VisheshNo in (1,3)                                          | `patrika.ts:229`                                                                                     |
  | MagazineVishesh / author (padvi)                             | 6392                               | avastha >5                                                         | `vishesh-entry-common.ts:161`                                                                        |
  | EnglishBookVishesh / author (padvi)                          | 6650                               | avastha >5                                                         | `vishesh-entry-common.ts:161`                                                                        |
  | prakashan (Book Master) / multiauthor (padvi)                | 6897                               | avastha >5                                                         | `book.ts:726` (also used by Anya Bhandar via `BOOK_TRANS.AuthTran`)                                  |
  | prakashan / multivisheshauthor (padvi)                       | 6952                               | avastha                                                            | `book.ts:774`                                                                                        |
  | prakashan / prakcontact, gmala, remark, avrutiremark, samvat | 7016, 7530, 7651, 7672, 7717, 7788 | conttype, contactnm, gmala, gmalat, word, rem, quality, samvatkind | not ported: `frmBookMasterNew` never opens these TranNames (dead branches)                           |
  | AnyaBhandar / multiauthor (padvi)                            | 10374                              | avastha >5                                                         | `book.ts:726` via `anya-bhandar.ts:649`                                                              |
  | TirthRaksha / multiauthor (padvi)                            | 10968                              | avastha >5                                                         | `tirth-raksha.ts:437`                                                                                |
  | TirthRaksha / samvat (sthalname)                             | 11058                              | city                                                               | `author.ts:695` (shared)                                                                             |
  | HastpratLibNo / Mark; Hastprat / 9 lookups                   | 1538; 8768–9646                    | —                                                                  | screen commented out of `menu.ts`; not ported                                                        |

- **Kind**: behaviour change (schema rename; no functional difference once the column exists).
- **Web today**: old way everywhere (`remark`), which is the only thing that works on the current DB. The same rename will exist outside this file (e.g. `frmBookTranNew.vb:1906` uses `visheshMast.Vibhag='CHKBX'`), and `vishesh.ts` (Vishesh Master) reads/writes `remark` as the category — those belong to other slices but must move together.
- **Web change needed**: replace `remark` with `Vibhag` in every `visheshMast` category filter (the lines above plus the non-trans ones: `book.ts:113/973/976/1002`, `book-actions.ts:94`, `kruti-actions.ts:205`, `prakashak.ts:232`, `anya-bhandar.ts:471-472`, `vishesh.ts`). Must be switched in one go with the DB change; it cannot be done before.
- **DB prerequisites**: `visheshMast.Vibhag` — **MISSING** (columns present: Tid, Vishesh, remark, Uplevelkt, Brief, PrakMastKt, VisheshNo, ShortNm, Notes, HindiWord, Count, CountI, Locked, txtAnyaName, txtAdyaSthapak, Vishesh_Revoke). Whether the updated DB renamed `remark` or added `Vibhag` beside it and kept `remark` as a free-text remark cannot be told from this file.
- **Size**: S for the trans lookups (mechanical), blocked on the DB.

---

### B. Book Tran (`FormName "BookT"`, `SetForm_BookT`, opened by `Updated/Library/Library/frmBookTranNew.vb:373-393`)

Web: `apps/web/src/screens/BookTranDialog.tsx` (`TRANS.PraptiTran`, `TRANS.MarkTran`) + `apps/api/src/master/screens/book-tran.ts` (`trans`).

**B1. Mark / PraptiTran — TranName compared case-insensitively**

- **What changed**: `If TranName = "Mark"` → `If TranName.ToLower = "mark"`, `"praptitran"` likewise (1305, 1359). Refactor only. Mark lookup: see A.

**B2. NEW popup "MixSign" (`txtMixSignTran`)**

- **What changed** (1329–1358): new branch `TranName.ToLower = "mixsign"`. New row: `BookTranMixSignKm` = random temp id in −500…−2 (`Random.Next(-500,-1)`), `Seq` = row count + 1 (1 for the first, auto-added row when the popup opens empty). Hidden: `BookTranMixSignKm`, `mixsignKt`. New row starts in `mixsignName`. F2 on `mixsignname`:
  `select  Tid  ,Vishesh , v.Brief ,v.Notes ,v.HindiWord   from VisheshMast v  where Vibhag  = 'CHKBX'  and v.VisheshNo in (1,3)   order by vishesh` (first row preselected, typed text searched, `AddTableInfo:="ColumnMaster|Bookmixsign"`); sets `mixsignName` + `mixsignKt`, moves to `Seq`. No editable text columns.
  Caller saves to `BookTranMixSignT` (`frmBookTranNew.vb:758-773`): `INSERT INTO BookTranMixSignT(BookTKt,MixSignKt,Seq,enuser,endate)` for keys ≤ 0, `UPDATE BookTranMixSignT SET MixSignKt=…,Seq=…,moduser=…,moddate=GETDATE() WHERE BookTranMixSignKm=…`, then `DELETE FROM BookTranMixSignT WHERE BookTKt=… AND BookTranMixSignKm NOT IN(…)`.
- **Kind**: new feature.
- **Web today**: not ported. `BookTranDialog.tsx:112` still has the old plain `Mixsign` text box (`addMore: { append: true }`) saved into `BookT.Mixsign` (`book-tran.ts:82,102,115`).
- **Web change needed**: add `MixSignTran` TransSpec (tempKey `BookTranMixSignKm`, hidden `['BookTranMixSignKm','mixsignKt']`, lookup `mixsignname`→`{setKt:'mixsignKt', setName:'mixsignName', next:'Seq'}`, firstColumn `mixsignName`) and a `trans.MixSignTran` + child save on the API. What happens to the old `Mixsign` box is decided in the Book Tran slice.
- **DB prerequisites**: table `BookTranMixSignT` **MISSING**; `tblSearch` row `BookT`/`MixSignTran` (F2EntryText gives the popup its columns) **MISSING**; `visheshMast.Vibhag` **MISSING**.
- **Size**: M (with its save path).

**B3. NEW popup "Condition" (`txtConditionTran`)**

- **What changed** (1459–1513): new branch `TranName.ToLower = "condition"`. New row: `BookTranConditionKm` temp id −500…−2, `Seq` as B2. Hidden: `BookTranConditionKm`, `ConditionKt`, `CheckedByKt`, `DoneByKt`. Editable: `Remark`. New row starts in column index 2. F2 per column:
  - `condition`: `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='BookTranCondition' ORDER BY Name` (no blank row, first row preselected, `AddTableInfo:="ColumnMaster|BookTranCondition"`) → `ConditionKt`/`Condition`, next `CheckedBy`.
  - `checkedby`: `SELECT tid,uname AS CheckedBy FROM Usecurity ORDER BY uname` → `CheckedBy`/`CheckedByKt`, next `checkeddate`.
  - `checkeddate`: InputBox `Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)` defaulting to today `dd/MM/yyyy`; the answer is stored as typed (Cancel stores an empty string), next `DoneBy`.
  - `doneby`: `SELECT tid,uname AS DoneBy FROM Usecurity ORDER BY uname` → `DoneBy`/`DoneByKt`, next `donedate`.
  - `donedate`: same InputBox, next `Remark`.
    Caller saves to `BookTranConditionT` (`frmBookTranNew.vb:792-840`): `INSERT INTO BookTranConditionT(BookTKt,ConditionKt,CheckedByKt,DoneByKt,Remark,Seq,enuser,endate[,CheckedDate][,DoneDate])`, UPDATE of the same columns by `BookTranConditionKm`, `DELETE … WHERE BookTKt=… AND BookTranConditionKm NOT IN(…)`.
- **Kind**: new feature.
- **Web today**: not ported (no Condition box in `BookTranDialog.tsx`).
- **Web change needed**: new `ConditionTran` TransSpec; the two date columns map onto the existing `TransLookup.input` (InputBox) support; API `trans.ConditionTran` with three lookups + child save. Note the user list exposes `Usecurity.uname` only (no passwords) — keep it that way.
- **DB prerequisites**: table `BookTranConditionT` **MISSING**; `tblSearch` `BookT`/`ConditionTran` **MISSING**; `columnmaster` rows with `Vibhag='BookTranCondition'` **MISSING** (0 rows).
- **Size**: M.

---

### C. Book Master (`FormName "Prakashan"`, `setform_prakashan`, opened by `Updated/Library/Library/frmBookMasterNew.vb:1301-1327`)

Web: `apps/web/src/screens/BookMaster.tsx` (`TRANS`) + `apps/api/src/master/screens/book.ts` (`BOOK_TRANS`).

**C1. multiauthortype — `authtyattr` dropped from the author-type list**

- **What changed** (6825): `select authtycokm,authortype,authtyattr from authtype order by authortype` → `select authtycokm,authortype from authtype order by authortype`. The pick list shows one column fewer; what is stored is unchanged. Same change in PrakMast (3691), Hastprat (8697), AnyaBhandar (10302), TirthRaksha (10887).
- **Kind**: UI/layout.
- **Web today**: old way (3 columns) at `book.ts:719` (also serves Anya Bhandar via `anya-bhandar.ts:649`), `prakashak.ts:527`, `tirth-raksha.ts:431`. `author.ts:763` and `kruti.ts:945` already list 2 columns.
- **Web change needed**: drop `authtyattr` from those three SELECTs. (`authtype.authtyattr` itself still exists and is still used by the save-side text builders.)
- **DB prerequisites**: none.
- **Size**: S.

**C2. multiauthor — commented-out SQL deleted** (6861): refactor only. Padvi lookups: see A.

**C3. NEW popup "Sampraday" (`txtSampradayTran`)**

- **What changed** (7818–7847): new branch `TranName = "sampraday"`. Temp id in `BookSampradayKm`, `Seq` auto. Hidden `BookSampradayKm`, `SampradayKt`. Starts in `SampradayName`. F2 on `sampradayname`: `SELECT ColumnMastkm,name FROM columnmaster where vibhag='BookSampraday' " & strSearch & " order by name` (`AddTableInfo:="ColumnMaster|BookSampraday"`) → `SampradayName`/`SampradayKt`, next `Seq`.
  Caller save (`frmBookMasterNew.vb:2158-2177`): `INSERT INTO BookSampradayT(BookMastKt,SampradayKt,Seq,enuser,endate)`, `UPDATE BookSampradayT SET SampradayKt=…,Seq=…,moduser=…,moddate=GETDATE() WHERE BookSampradayKm=…`, `DELETE FROM BookSampradayT WHERE BookMastKt=… AND BookSampradayKm NOT IN(…)`.
- **Kind**: new feature.
- **Web today**: the box exists but is inert: `BookMaster.tsx:699` `{ name: 'SampradayTran', …, noF2: true }` (in the old desktop it had no tblSearch row and no popup branch).
- **Web change needed**: replace `noF2` with a real TransSpec + API `trans.SampradayTran` lookup + child save/load.
- **DB prerequisites**: `BookSampradayT` **MISSING**; `tblSearch` `BookM`/`SampradayTran` **MISSING**; `columnmaster` `Vibhag='BookSampraday'` **MISSING** (0 rows).
- **Size**: M (the three C3–C5 popups share one pattern; together about a day).

**C4. NEW popup "MixSign" (`txtMixSignTran`)**

- **What changed** (7848–7877): `TranName = "mixsign"`. Temp id in `BookmixsignKm`, hidden `BookmixsignKm`, `mixsignKt`, starts in `mixsignName`. F2: `select  Tid  ,Vishesh , v.Brief ,v.Notes ,v.HindiWord   from VisheshMast v  where Vibhag  = 'CHKBX'  and v.VisheshNo in (1,3)   order by vishesh` (`AddTableInfo:="ColumnMaster|Bookmixsign"`) → `mixsignName`/`mixsignKt`, next `Seq`. Caller saves to `BookMixSignT(BookMastKt,MixSignKt,Seq,…)` (`frmBookMasterNew.vb:2182-2201`).
- **Kind**: new feature.
- **Web today**: not ported; the web has the old `MixSign` text field saved into `BookM.MixSign` (`book.ts:259,290,315`) with the old F2 list (`book.ts:973/976`).
- **Web change needed**: new `MixSignTran` TransSpec + API trans; fate of the old text field belongs to the Book Master slice.
- **DB prerequisites**: `BookMixSignT` **MISSING**; `tblSearch` `BookM`/`MixSignTran` **MISSING**; `visheshMast.Vibhag` **MISSING**.
- **Size**: M.

**C5. NEW popup "KrutiWork" (`txtKrutiWorkTran`)**

- **What changed** (7878–7907): `TranName = "krutiwork"`. Temp id in `BookKrutiWorkKm`, hidden `BookKrutiWorkKm`, `KrutiWorkKt`, starts in `KrutiWorkName`. F2: `SELECT ColumnMastkm,name FROM columnmaster where vibhag='BookKrutiWork' " & strSearch & " order by name` (`AddTableInfo:="ColumnMaster|BookKrutiWork"`) → `KrutiWorkName`/`KrutiWorkKt`, next `Seq`. Caller saves to `BookKrutiWorkT(BookMastKt,KrutiWorkKt,Seq,…)` (`frmBookMasterNew.vb:2206-2225`).
- **Kind**: new feature.
- **Web today**: inert box, `BookMaster.tsx:690` (`noF2: true`, comment "No tblSearch row: F2 opens an empty popup on the desktop, and nothing loads or saves it").
- **Web change needed**: as C3.
- **DB prerequisites**: `BookKrutiWorkT` **MISSING**; `tblSearch` `BookM`/`KrutiWorkTran` **MISSING**; `columnmaster` `Vibhag='BookKrutiWork'` **MISSING** (0 rows).
- **Size**: M.

---

### D. Kruti Master (`FormName "Kruti"`, `SetForm_Kruti`)

Web: `apps/web/src/screens/KrutiMaster.tsx` + `apps/api/src/master/screens/kruti.ts`.

**D1. Sampraday popup hides completed sampradays**

- **What changed** (2400): `SELECT columnmastkm,Name FROM columnMaster WHERE Vibhag='KrutiSampraday' ORDER BY Name` → `SELECT columnmastkm,Name FROM columnMaster WHERE Vibhag='KrutiSampraday' AND ISNULL(ISCompleted,0)=0 ORDER BY Name`.
- **Kind**: behaviour change.
- **Web today**: old way — `kruti.ts:895` (`trans.SampradayTran.sampradayname`). `kruti.ts:1109/1112` (`lists['kruti-sampraday*']`) are toolbar lists, not this popup; whether they changed is the Kruti slice's question.
- **Web change needed**: add `AND ISNULL(ISCompleted, 0) = 0` to `kruti.ts:895`. Column Master would also need the flag to be settable (other slice).
- **DB prerequisites**: `columnmaster.ISCompleted` **MISSING**.
- **Size**: S.

**D2. Subtitle (Title) popup — temp keys and name-based columns; rag popup opened from the right column**

- **What changed** (3316–3400):
  - New/first row is now built by column name: `krutiSubTitleKm` = random temp id −500…−2, `Seq` = count+1 (1 when the popup opens empty); all other cells NULL. Old: positional `{TranId, Id, "", …}` with `Id = MaxId`.
  - After New, the cursor goes to `SubTitleNo` **of the current row** (`dgDisplay("SubTitleNo", dgDisplay.CurrentRow.Index)`), not of the new row (old: column 3 of the row below).
  - F2 handlers are keyed by column name instead of index: `refplace` (was index 3) and `raganame` (was index **9**). With the caller's column order (`krutimstkt,krutiSubTitleKm,SubTitleNo,Refplace,SubTitleNm,txtSubTitleNm,pariman,parimanpattern,adivakya,antvakya,RagaName,desi,refpgno,remark,seq` — `frmKrutiMasterNew.vb:1975`, unchanged) index 9 is `antvakya` and RagaName is 10, so in the old build F2 on Antvakya opened the rag popup and F2 on RagaName did nothing. After the rag popup saves, focus goes to `RefPgNo` (was index 11 = hidden `desi`).
  - Lookup SQL unchanged: `select ColumnMastkm,Name from columnmaster where vibhag='RefPlace' order by Name`.
- **Kind**: bug fix (+ refactor).
- **Web today**: already the new way — `KrutiMaster.tsx:287-320` (`KrutiSubTitleTran`): `tempKey: 'krutiSubTitleKm'`, `firstColumn: 'SubTitleNo'`, lookups keyed `refplace`, nested rag popup keyed `raganame`.
- **Web change needed**: none (the web puts the cursor on the new row's SubTitleNo; the desktop's "current row" looks like an oversight — not worth copying unless asked).
- **DB prerequisites**: none.
- **Size**: —

**D3. Author (avastha), Remark (word)**: Vibhag rename only, see A.

---

### E. Author Master (`FormName "Author"`, `SetForm_Author`)

Web: `apps/web/src/screens/AuthorMaster.tsx` + `apps/api/src/master/screens/author.ts`.

**E1. AuthorName popup gains a Patrika reference**

- **What changed** (4568–4585; caller `Updated/Library/Master/frmAuthorMaster.vb:453-469, 818-823`): the one-row popup behind F2 on `txtauthorname` now has columns `AuthorName, BookTKt, LibNo, PatrikaKt, PatrikaNo, RefPgNo` (old: `AuthorName, BookTKt, LibNo, RefPgNo`). `PatrikaKt` is hidden. After the `libno` pick the cursor goes to `PatrikaNo` (was `RefPgNo`). New F2 on `patrikano`: `SELECT PatrikaKm,RecordNo AS PatrikaNo FROM Patrika ORDER BY PatrikaNo` (no first-row preselect) → `patrikano`/`PatrikaKt`, next `RefPgNo`. The caller stores it in `authmast.AuthorNameRefPatrikaKt` (`AuthMastRepository.vb:270-327`) and the grid's name suffix becomes `COALESCE(BT.Libno,P.RecordNo)` (`frmAuthorMaster.vb:2760-2769`).
- **Kind**: new feature.
- **Web today**: old way. `AuthorMaster.tsx:180-188` builds the local popup from `AuthorNameRefBookTKt / AuthorNameRefBookTName / AuthorNameRefPgNo` only; `author.ts:252-313` saves only `AuthorNameRefBookTKt`, `AuthorNameRefPgNo`; `author.ts:1488-1510` builds the name without Patrika. A `patrikano` list already exists for another popup (`author.ts:832`, same SQL).
- **Web change needed**: add `PatrikaKt`/`PatrikaNo` to the local popup's columns, `toRow`/`fromRow`, hidden list and lookups (`libno.next = 'PatrikaNo'`, `patrikano → RefPgNo`); new hidden form fields `AuthorNameRefPatrikaKt`/name; API load/save of the column; name expression with `COALESCE(BT.Libno, P.RecordNo)` + `LEFT JOIN Patrika`.
- **DB prerequisites**: `authmast.AuthorNameRefPatrikaKt` **MISSING** (`AuthorNameRefBookTKt`, `AuthorNameRefPgNo` present); `Patrika` table present.
- **Size**: S–M.

**E2. Parampara, Visheshan, AnyName, AnyName2, Contact, Samvat**: Vibhag rename only, see A.

---

### F. Prakashak Master (`FormName "PrakMast"`, `SetForm_PrakMast`)

- multiauthortype (3691): `authtyattr` dropped from the list — see C1 (`prakashak.ts:527`, old way).
- multiauthor, GMala, Address, PrakContact, Samvat, PraptiSthan: Vibhag rename only — see A. No column, validation or flow change.

### G. Sampraday Master (5941), Patrika MixSign (6012), English Book Vishesh author (6650), Common Address (1845)

- Vibhag rename only — see A.

---

### H. Magazine Vishesh (`FormName "MagazineVishesh"`, `setform_MagazineVishesh`, opened by `Updated/Library/Library/frmMagazineVisheshNew.vb:505-512`)

Web: `apps/web/src/screens/MagazineVisheshMaster.tsx` + `screens/visheshEntry.ts` + `apps/api/src/master/screens/magazine-vishesh.ts` / `vishesh-entry-common.ts`.

**H1. NEW popup "Proof" (`txtProofTran`)**

- **What changed** (6403–6450): new branch `TranName = "proof"`. Temp id in `MagazineVisheshProofKm`, `Seq` auto. Hidden: `MagazineVisheshProofKm`, `ProofTypeKt`, `PartyKt`. Editable: `Remark`. Starts in `ProofType`. F2:
  - `prooftype`: `select columnmastkm,name,ColumnNo from columnmaster where vibhag = 'ProofType' order by columnno` (first row preselected, `AddTableInfo:="columnmaster|ProofType"`) → `ProofTypeKt`/`ProofType`, next `Party`.
  - `party`: `SELECT partyMkm,PName AS Party FROM PartyM WHERE LEN(ISNULL(PName,''))>1 ORDER BY PName` → `PartyKt`/`Party`, next `SentDate`.
  - `sentdate`, `receiveddate`: InputBox `Please Enter Date in dd/MM/yyyy Format(Ex.:- (01/12/2015)` defaulting to today; stored as typed; next `ReceivedDate` / `Remark`.
    Repository (`Updated/Library.BusinessContract/Concrete/MagazineVisheshRepository.vb:252-268`): rows are keyed by **BookTKt**, not by the Magazine Vishesh record: `INSERT INTO MagazineVisheshProofT(BookTKt,ProofTypeKt,PartyKt,SentDate,ReceivedDate,Remark,Seq,enuser,endate)` (key < 0), UPDATE by `MagazineVisheshProofKm`, `DELETE FROM MagazineVisheshProofT WHERE BookTKt=… AND MagazineVisheshProofKm NOT IN(…)`. The record delete at `:374` runs `DELETE FROM MagazineVisheshProofT WHERE MagazineVisheshKt IN(…)`, a column the INSERT never fills.
- **Kind**: new feature.
- **Web today**: not ported (no Proof box in `MagazineVisheshMaster.tsx`; `visheshEntry.ts` has Bhasha/MType/AuthorType/Author/Tag popups only).
- **Web change needed**: new `ProofTran` popup spec in `visheshEntry.ts` (Magazine Vishesh only — English Book Vishesh has no such branch), API lookups `prooftype`, `party`, child load/save keyed on `BookTKt`.
- **DB prerequisites**: `MagazineVisheshProofT` **MISSING**; `tblSearch` `MagazineVishesh`/`ProofTran` **MISSING**; `columnmaster` `Vibhag='ProofType'` present (2 rows).
- **Size**: M.

**H2. author (padvi)**: Vibhag rename, see A.

---

### I. Graphics Detail (`FormName "GraphicDetail"`, `SetForm_GraphicDetail`, TranName "Subject", TranType "Internal" or not)

Web: `apps/web/src/screens/GraphicsDetail.tsx` (`subjectTrans`, keys `GrDetailSubTran` and `IntSubjectTran`) + `apps/api/src/master/screens/graphics-detail.ts`.

**I1. New Subject rows start with Sign "\*"**

- **What changed** (2158–2176): on every call the branch loads `SELECT ColumnMastkm AS SignKt,Name AS SignName FROM columnmaster where Vibhag='Sign' AND Name='*'` and uses it for the new row and for the first row of an empty popup: `{…grdetailSubKm, SignKt, SignName, 0, "", "", Internal, seq}` (old: `0, ""` for sign).
- **Kind**: behaviour change.
- **Web today**: old way — `GraphicsDetail.tsx:101` `template: ({ seq }) => [0, 0, '', 0, '', '', internal, seq]`. Because `beforeSave` (lines 104-111) opens a new binding group for each row whose Sign is `*`, the new default makes each added subject its own group unless the user clears the sign.
- **Web change needed**: default `signkt`/`Sign` of new rows to the `*` sign (look the id up on the server; it is `ColumnMastkm = 10` in the local DB but must not be hard-coded).
- **DB prerequisites**: `columnmaster` row `Vibhag='Sign'`, `Name='*'` — PRESENT (id 10).
- **Size**: S.

**I2. Warning when a subject is already used in more than 500 records**

- **What changed** (2190–2203): after picking a subject (column index 4, list unchanged: `select Grvishaykm,vishaynm,defination,Remark from GrVishay WHERE ISNULL(IsCancel,0)<>1 order by vishaynm`), the popup runs `SELECT COUNT(*) FROM GrDetailSubT where grvishaykt=<id>`; if the count is **> 500** it asks, Yes/No, title `Vishay is already used in more than (<cnt>) records`, text `<vishay name> is used in more than (<cnt>) records` + newline + `Are you sure to continue?`. No → the pick is discarded (cell unchanged, cursor stays).
- **Kind**: new feature (validation).
- **Web today**: not present; `vishaynm` lookup at `GraphicsDetail.tsx:99` sets the cell directly.
- **Web change needed**: an `after` hook on the `vishaynm` lookup that calls a new count lookup and uses `helpers.confirm`; reject the pick on No.
- **DB prerequisites**: none (in the local DB subjects 53, 27, 64 already exceed 500: 7,846 / 5,528 / 5,397 uses).
- **Size**: S.

---

### J. Tirth Raksha Master (`FormName "TirthRaksha"`, `setform_TirthRaksha`)

Web: `apps/web/src/screens/TirthRakshaMaster.tsx` + `apps/api/src/master/screens/tirth-raksha.ts`.

**J1. Reference popup: new `EntryType` column, page number and edition filled by the lookups**

- **What changed** (11181–11240):
  - New rows get `EntryType = "TirthRaksha"` and the cursor starts in `EntryType` (was column index 2).
  - New F2 on `entrytype`: `SELECT 'TirthRaksha' AS Id,'TirthRaksha' AS Name UNION SELECT 'ShastraPath' AS Id,'ShastraPath' AS Name` (no blank row, first preselected) → `EntryType`, next `KrutiNo`.
  - `krutino` list gains a 9th column and fills `PageNo`: `SELECT DISTINCT K.krutimstkm,K.KrutiNo,tblKrutiRef.Tid,tblKrutiRef.LibNo,tblKrutiRef.BookName,tblKrutiRef.Prakashak,tblKrutiRef.AuthorName,tblKrutiRef.Samvat,ISNULL(tblKrutiRef.KrutiRefPgNo,'') AS KrutiRefPgNo From krutiMst K OUTER APPLY (SELECT TOP(1) KR.krutimstkt,BT.tid AS Tid,BT.Libno,BM.BookName + CASE WHEN ISNULL(BM.part,'')='' THEN '' ELSE ' ' + BM.Part END AS BookName,BM.txtPrakashak AS Prakashak,BM.txtAuthor AS AuthorName,BM.PSamvatVK As Samvat,KR.refpgno AS KrutiRefPgNo FROM krutireflibno KR INNER JOIN columnmaster colTyp ON KR.ktypeid=colTyp.ColumnMastkm AND colTyp.Name=N'मुद्रित गी.गं भंडारनुं प्रथम पुस्तक' INNER JOIN BookT BT ON KR.BookTKt=BT.tid INNER JOIN BookM BM ON BT.BookMastkt=BM.BookMastkm WHERE KR.krutimstkt=K.krutimstkm) AS tblKrutiRef WHERE K.krutimstkm=tblKrutiRef.krutimstkt ORDER BY K.krutimstkm`; on pick also `PageNo = KrutiRefPgNo`.
  - `libno` list gains `Avrutiname` **before** `Samvat` and fills a new `AvrutiName` cell: `SELECT Tid,LibNo,BookM.BookName + CASE WHEN ISNULL(BookM.part,'')='' THEN '' ELSE ' ' + BookM.Part END AS BookName,BookM.txtPrakashak AS Prakashak,BookM.txtAuthor AS AuthorName,AvrutiMast.Avrutiname,BookM.PSamvatVK As Samvat FROM BookT INNER JOIN BookM ON BookT.BookMastkt=BookM.BookMastkm LEFT JOIN AvrutiMast ON BookM.Avrutikt=AvrutiMast.Avrutitid WHERE ISNULL(LibNo,'')<>'' ORDER BY Libno`.
  - Repository now writes the type: `INSERT INTO TirthRakshaReferenceT(TirthRakshaKt,EntryType,KrutiMstKt,BookTKt,PageNo,GathaNo,Remark,Seq,enuser,endate)` / `UPDATE … SET EntryType=…` (`TirthRakshaRepository.vb:418,426`); the form reacts to `EntryType = "ShastraPath"` on the first row (`frmTirthRakshaMaster.vb:252, 754-755, 1277`) — Tirth Raksha slice.
- **Kind**: new feature / behaviour change.
- **Web today**: old way. `TirthRakshaMaster.tsx:206-223` (`ReferenceTran`): no `entrytype` lookup, `firstColumn: 'KrutiNo'`, `krutino.also` has no PageNo, and `libno.also: { BookName: 2, Prakashak: 3, AuthorName: 4, Samvat: 5 }` is **positional** — with the new SQL index 5 is Avrutiname and Samvat moves to 6. API `tirth-raksha.ts:446-463` and `LIBNO_RICH` (`:251-254`) hold the old SQL; the reference save (`:125-160`) writes no `EntryType`.
- **Web change needed**: new lookup `entrytype` (two fixed rows), default `EntryType: 'TirthRaksha'` in the row template, `firstColumn: 'EntryType'`; new `krutino` SQL + `also.PageNo: 8`; new `libno` SQL + `also: { …, AvrutiName: 5, Samvat: 6 }` (check `LIBNO_RICH`'s other users before changing it in place); save `EntryType`.
- **DB prerequisites**: `TirthRakshaReferenceT.EntryType` **MISSING**; the `tblSearch` row `TirthRakshaM`/`ReferenceTran` is present but its F2EntryText has neither `EntryType` nor `AvrutiName` (the popup addresses both by name, so the updated row must select them) — **data MISSING**; `krutireflibno.refpgno` present; `AvrutiMast` present.
- **Size**: M.

**J2. NEW popup "Text" (`txtTextTran`, opened by `frmTirthRakshaMaster.vb:718-725`)**

- **What changed** (11302–11410): new branch `TranName = "text"`. Temp id in `TirthRakshaTextKm`, `Seq` auto. Hidden: `TirthRakshaTextKm`, `TextTypeKt`, `CheckedByKt`. Editable: `Text` (typed in the grid; the frmVishayEntry variant is commented out). The `ReadyPhoto` column is replaced by a link column (header `Ready Photo`). Starts in column index 2. F2:
  - `texttypename`: `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='TirthRakshaTextType' ORDER BY Name` (no blank row, first preselected, `AddTableInfo:="ColumnMaster|TirthRakshaTextType"`) → `TextTypeKt`/`TextTypeName`, next `Text`.
  - `checkedbyname`: `SELECT ColumnMastkm,Name FROM columnmaster WHERE Vibhag='DoneBy' AND ISNULL(Name,'')<>'' ORDER BY Name` (`AddTableInfo:="columnmaster|DoneBy"`) → `CheckedByName`/`CheckedByKt`, next `Seq`.
  - Click on a `ReadyPhoto` link (new handler `dgDisplay_CellContentClick`, 12595–12609, only for FormName `tirthraksha` + TranName `text`): opens `CommonLibrary.frmAttachments` with `TranName = "TirthRakshaTextReadyPhoto"`, `TranKm = TirthRakshaTextKm` of that row. For an unsaved row that key is the negative temp id.
    Repository (`TirthRakshaRepository.vb:490-507`): `INSERT INTO TirthRakshaTextT(TirthRakshaKt,TextTypeKt,Text,CheckedByKt,Seq,enuser,endate)` (key ≤ 0), `UPDATE TirthRakshaTextT SET TextTypeKt=…,Text=…,CheckedByKt=…,Seq=…,moduser=…,moddate=GETDATE() WHERE TirthRakshaTextKm=…`, `DELETE FROM TirthRakshaTextT WHERE TirthRakshaKt=… AND TirthRakshaTextKm NOT IN(…)`.
- **Kind**: new feature.
- **Web today**: not ported (no `TextTran` in either file).
- **Web change needed**: new `TextTran` TransSpec + API trans/child save. The Ready Photo link is `frmAttachments`, which the web treats as desktop-only everywhere (`features/master/desktopOnly.ts`, `ATTACHMENTS_DESKTOP_ONLY`) — show the same message unless attachments get ported.
- **DB prerequisites**: `TirthRakshaTextT` **MISSING**; `tblSearch` `TirthRakshaM`/`TextTran` **MISSING** (so the exact column list/order, incl. what `ReadyPhoto` selects, is not recoverable locally); `columnmaster` `Vibhag='TirthRakshaTextType'` **MISSING** (0 rows); `Vibhag='DoneBy'` present (66 rows); `Attachments` table present.
- **Size**: M.

**J3. multiauthortype (10887)**: `authtyattr` dropped, see C1 (`tirth-raksha.ts:431`, old way). **multiauthor, samvat**: Vibhag rename, see A.

---

### K. Anya Bhandar (`SetForm_AnyaBhandar`)

- multiauthortype (10302): `authtyattr` dropped; multiauthor (10374): Vibhag rename. Web reuses Book's lookups (`anya-bhandar.ts:649` → `BOOK_TRANS.AuthTran`), so C1 and A cover it. No other change.

---

### L. Popup-wide changes

**L1. Dispatcher** (12038–12043): three new `FormName`s routed — `shastrapath` → `setform_ShastraPath`, `employeeperformanceevaluation` → `SetForm_EmployeePerformanceEvaluation`, `jseries` → `SetForm_JSeries`. See M.

**L2. View Image path comes from the DB**

- **What changed** (12460): `frmjpg.MainPath = ReferenceTPath` (a hard-coded global, `"F:\scantesting\"` in old `MdlLib.vb:25`) → `GetConfigValueFromConfigName(EnumGeneralConfig.ReferenceTPath.ToString())`, i.e. `SELECT ConfigValue FROM GeneralConfig WHERE ConfigName=@ConfigName` with `ConfigName = 'ReferenceTPath'` (Updated `MdlLib.vb:61-70, 1712-1717`).
- **Kind**: refactor (configuration moved to a table).
- **Web today**: the popup's right-click "View Image" is not ported (no trace in `DisplayTransDialog.tsx`).
- **Web change needed**: none for this slice.
- **DB prerequisites**: table `GeneralConfig` **MISSING**.
- **Size**: —

**L3. `frmDisplayTransNew_Load`** (52): a commented-out line removed. Refactor only.

---

### M. Popups of screens that are not on the web

- **Hastprat** (`SetForm_HastpratLibNo` Mark 1538; `setform_Hastprat` 8697–9646): Vibhag rename + `authtyattr` dropped only. Screen commented out of `menu.ts`.
- **Shastra Path Master** — NEW screen (`Updated/Library/Library/frmShastraPathMaster.vb:531-555`; desktop menu "Shastra Path Master", `Frmlibmain.Designer.vb:502`), not in `menu.ts`. `setform_ShastraPath` (11413–11851) is a copy of the Tirth Raksha branches under new key names: `author` (nested `multiauthortype`/`multiauthor` on `ShastraPathAuthorKm`/`ShastraPathAuthorAuthorTypeKm`/`ShastraPathAuthorAuthorKm`), `samvat` (`ShastraPathSamvatKm`; AuthSamKind / Samvmast / sadimst / LibNo / city lists with Vikram-samvat calculation, `Isvisan = Vksamvat − 56`), `reference` (`ShastraPathReferenceKm`; list `SELECT BookT.Tid,BookT.Libno,BookM.BookName + CASE WHEN ISNULL(BookM.part,'')='' THEN '' ELSE ' ' + BookM.Part END AS BookName,bookm.PSamvatVK AS Samvat,AvrutiMast.Avrutiname As Avruti,BookM.txtAuthor AS Author FROM BookT INNER JOIN BookM ON BookT.BookMastkt=BookM.BookMastkm LEFT JOIN AvrutiMast ON BookM.Avrutikt=AvrutiMast.Avrutitid WHERE ISNULL(BookT.Libno,'')<>'' ORDER BY BookT.Libno`), `text` (`ShastraPathTextKm`; type list `Vibhag='ShastraPathTextType'`, checked-by list `Vibhag='DoneBy'`, and F2 on `Text` opens `frmVishayEntry` after the messages `Please Save Record First` (key 0) / `Please Click on Modify from Main Record to Save Text` + newline + `Are you sure to opn Detail?`). Belongs to the slice that covers the new screen; when it is ported its TransSpecs can be cloned from `TirthRakshaMaster.tsx`.
- **Employee Performance Evaluation** — NEW screen (`Updated/Library/Employee/frmEmployeePerformanceEvaluation.vb:409-422`; desktop menu `Frmlibmain.Designer.vb:865`), not in `menu.ts`. Two one-lookup popups (11852–11918): `vibhag` (key `EmployeePerformanceEvaluationVibhagKm`, list `select ColumnMastkm,Name from columnmaster where vibhag='Vibhag' order by Name`) and `worktype` (key `EmployeePerformanceEvaluationWorkTypeKm`, list `select ColumnMastkm,Name from columnmaster where vibhag='WorkType' order by Name`); both pass `AddTableInfo:="ColumnMaster|TirthRakshaKshetra"` (copy-paste from Tirth Raksha).
- **J Series Master** — NEW screen (`Updated/Library/Library/frmJSeriesMaster.vb:398-406`; desktop menu `Frmlibmain.Designer.vb:943`), not in `menu.ts`. One popup `issue` (11919–11979), key `JSeriesIssueKm`, hidden `PartyKt`: party list restricted to five hard-coded ids `SELECT partyMkm,PName AS PartyName FROM PartyM WHERE partyMkm IN(3109,3462,5696,5626,6273) ORDER BY PName`; `issuedate` InputBox `Please Enter Issue Date(Ex-dd/MM/yyyy)`, `returndate` InputBox `Please Enter Return Date(Ex-dd/MM/yyyy)` (Cancel keeps the old value). Two apparent slips in the desktop code: New puts the cursor in a column named `VibhagName`, and an existing issue date is re-offered from a column named `DepositDate`; neither name appears elsewhere in the branch.

---

## DB objects this slice relies on

| Object                                                                                                                                                     | Needed by              | Local DB                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `visheshMast.Vibhag` (category column, replaces `remark` in filters)                                                                                       | A, B2, C4              | **MISSING**                                                               |
| `columnmaster.ISCompleted`                                                                                                                                 | D1                     | **MISSING**                                                               |
| `authmast.AuthorNameRefPatrikaKt` (int)                                                                                                                    | E1                     | **MISSING**                                                               |
| `TirthRakshaReferenceT.EntryType` (string: `TirthRaksha` / `ShastraPath`)                                                                                  | J1                     | **MISSING**                                                               |
| `BookTranMixSignT`                                                                                                                                         | B2                     | **MISSING**                                                               |
| `BookTranConditionT`                                                                                                                                       | B3                     | **MISSING**                                                               |
| `BookSampradayT`                                                                                                                                           | C3                     | **MISSING**                                                               |
| `BookMixSignT`                                                                                                                                             | C4                     | **MISSING**                                                               |
| `BookKrutiWorkT`                                                                                                                                           | C5                     | **MISSING**                                                               |
| `MagazineVisheshProofT`                                                                                                                                    | H1                     | **MISSING**                                                               |
| `TirthRakshaTextT`                                                                                                                                         | J2                     | **MISSING**                                                               |
| `GeneralConfig` (`ConfigName`, `ConfigValue`; row `ReferenceTPath`)                                                                                        | L2                     | **MISSING**                                                               |
| ShastraPath*, JSeries*, EmployeePerformanceEvaluation* tables                                                                                              | M                      | **MISSING** (none exist; child table names not established in this slice) |
| `tblSearch` rows `BookT`/`MixSignTran`, `BookT`/`ConditionTran`                                                                                            | B2, B3                 | **MISSING**                                                               |
| `tblSearch` rows `BookM`/`SampradayTran`, `MixSignTran`, `KrutiWorkTran`                                                                                   | C3–C5                  | **MISSING**                                                               |
| `tblSearch` row `MagazineVishesh`/`ProofTran`                                                                                                              | H1                     | **MISSING**                                                               |
| `tblSearch` row `TirthRakshaM`/`TextTran`                                                                                                                  | J2                     | **MISSING**                                                               |
| `tblSearch` row `TirthRakshaM`/`ReferenceTran` with `EntryType` and `AvrutiName` in F2EntryText                                                            | J1                     | row PRESENT, new columns **MISSING**                                      |
| `columnmaster` rows `Vibhag` = `BookTranCondition`, `BookSampraday`, `BookKrutiWork`, `TirthRakshaTextType`, `ShastraPathTextType`                         | B3, C3, C5, J2, M      | **MISSING** (0 rows each)                                                 |
| `columnmaster` rows `Vibhag` = `ProofType` (2), `DoneBy` (66), `Vibhag` (224), `WorkType` (72), `Sign`/`*` (id 10), `KrutiSampraday` (30), `RefPlace` (12) | H1, J2, M, I1, D1, D2  | PRESENT                                                                   |
| `Attachments` (AttachmentKm, TranName, TranKm, FileName, FilePath, FileType, enuser, endate)                                                               | J2 link                | PRESENT                                                                   |
| `Patrika`, `AvrutiMast`, `krutireflibno.refpgno`, `authtype.authtyattr`, `Usecurity`, `PartyM`, `GrDetailSubT`                                             | E1, J1, C1, B3, H1, I2 | PRESENT                                                                   |

Columns of the missing tables, as far as the code shows (key columns are identity — the code reads `SELECT @@identity` after INSERT; `…Kt`/`Seq` are written with `INint`, text with `INSQ`; all carry `enuser, endate, moduser, moddate`):

| Table                   | Columns                                                                                                                                                                                                                                                       | Source                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `BookTranMixSignT`      | `BookTranMixSignKm` (PK), `BookTKt` int, `MixSignKt` int (→ visheshMast.Tid), `Seq` int                                                                                                                                                                       | `frmBookTranNew.vb:758-773`                 |
| `BookTranConditionT`    | `BookTranConditionKm` (PK), `BookTKt` int, `ConditionKt` int (→ columnmaster), `CheckedByKt` int (→ Usecurity.tid), `CheckedDate` date/datetime null, `DoneByKt` int, `DoneDate` date/datetime null, `Remark` nvarchar, `Seq` int                             | `frmBookTranNew.vb:792-840`                 |
| `BookSampradayT`        | `BookSampradayKm` (PK), `BookMastKt` int, `SampradayKt` int (→ columnmaster), `Seq` int                                                                                                                                                                       | `frmBookMasterNew.vb:2161-2177`             |
| `BookMixSignT`          | `BookMixSignKm` (PK), `BookMastKt` int, `MixSignKt` int (→ visheshMast.Tid), `Seq` int                                                                                                                                                                        | `frmBookMasterNew.vb:2185-2201`             |
| `BookKrutiWorkT`        | `BookKrutiWorkKm` (PK), `BookMastKt` int, `KrutiWorkKt` int (→ columnmaster), `Seq` int                                                                                                                                                                       | `frmBookMasterNew.vb:2209-2225`             |
| `MagazineVisheshProofT` | `MagazineVisheshProofKm` (PK), `BookTKt` int, `ProofTypeKt` int, `PartyKt` int (→ PartyM), `SentDate` null, `ReceivedDate` null, `Remark` nvarchar, `Seq` int; plus `MagazineVisheshKt` (only referenced by the delete at `MagazineVisheshRepository.vb:374`) | `MagazineVisheshRepository.vb:252-268, 374` |
| `TirthRakshaTextT`      | `TirthRakshaTextKm` (PK), `TirthRakshaKt` int, `TextTypeKt` int, `Text` nvarchar, `CheckedByKt` int (→ columnmaster `DoneBy`), `Seq` int                                                                                                                      | `TirthRakshaRepository.vb:490-507`          |
| `GeneralConfig`         | `ConfigName`, `ConfigValue` (strings)                                                                                                                                                                                                                         | Updated `MdlLib.vb:1717`                    |

Lengths and exact date types are not recoverable from the code. The popups' displayed column lists and order come from the missing `tblSearch.F2EntryText` rows, so only the column names the code touches are known (listed per popup above).

## Open questions for the user

1. **`visheshMast.Vibhag`**: in the updated production DB, was `remark` renamed to `Vibhag`, or was `Vibhag` added and `remark` kept as a real remark? The web's Vishesh Master and ~35 lookups depend on the answer, and the switch has to happen at the same moment the DB is updated.
2. Can we get a current backup/schema of the production DB (or the upgrade script)? Eleven tables/columns and eight `tblSearch` rows this slice needs are absent locally, and the new popups' column lists live only in those `tblSearch` rows.
3. **Book Master / Book Tran MixSign**: once the MixSign popups exist, do the old free-text `BookM.MixSign` / `BookT.Mixsign` boxes stay, become read-only summaries, or go away? (Decided by the Book slices, but it determines whether the web keeps the old field.)
4. **Tirth Raksha Text › Ready Photo** opens the desktop attachments window. Keep it as the existing "needs the desktop" message, or is this the moment to port attachments?
5. **Kruti Subtitle**: after New the desktop now leaves the cursor on the _current_ row's SubTitleNo rather than the new row. The web goes to the new row. Keep the web's behaviour?
6. **Graphics subject > 500 warning**: three subjects already exceed 500 uses, so the prompt will appear on every pick of those. Confirm that is intended on the web too.
7. Are Shastra Path Master, Employee Performance Evaluation and J Series Master in scope for the web now? Their popups are listed in M but not sized here.
