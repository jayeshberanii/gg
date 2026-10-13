import type { FieldValue, GridRow } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { tirthRakshaReport } from '../../reports/tirth-raksha.js';
import { pickListOf } from '../values.js';
import { authorMaster } from './author.js';
import { AUTHOR_LIST, anyNames } from './book.js';
import {
  contString,
  extra,
  get,
  grid,
  int,
  list,
  type Row,
  SIGN_UNDER_10,
  scalar,
  signBetween,
  text,
} from './book-common.js';
import { type ChildTable, openInUse, trimmed, upsertChildRows } from './master-common.js';
import { authorText } from './prakashak.js';
import type { ScreenDefinition } from './registry.js';
import { saveVishayEntry, VISHAY_ENTRY_LOOKUPS } from './vishay-entry.js';

/**
 * Library › Tirth Raksha Master (frmTirthRakshaMaster, TirthRakshaRepository). Table
 * TirthRakshaM, IDENTITY key TirthRakshaKm, no Locked column. Three frmVishayEntry boxes (Name,
 * Peta Vishay, Remark(R1)), eight frmDisplayTransNew popups (SetForm_TirthRaksha) over ten child
 * tables. See docs/screens/tirth-raksha-master.md.
 */

const TABLE = 'TirthRakshaM';
const PK = 'TirthRakshaKm';

/** The frmVishayEntry boxes: tblSearch column → VishayEntry.TransactionName. */
const VISHAY_ENTRIES = [
  { column: 'TirthRakshaNameTran', transactionName: 'TirthRakshaName', summary: 'TirthRakshaName' },
  { column: 'PetaVishayTran', transactionName: 'TirthRakshaPetaVishay', summary: 'PetaVishay' },
  { column: 'TirthRakshaRemarkTran', transactionName: 'TirthRakshaRemark', summary: 'txtRemark' },
];
/** Delete also clears the Vishay box's old VishayEntry lines (its SaveVishayEntry is commented out). */
const DELETED_ENTRIES = [
  'TirthRakshaName',
  'TirthRakshaVishay',
  'TirthRakshaPetaVishay',
  'TirthRakshaRemark',
];

const child = (name: string, columns: ChildTable['columns']): ChildTable => ({
  table: `TirthRaksha${name}T`,
  key: `TirthRaksha${name}Km`,
  parent: 'TirthRakshaKt',
  columns,
  audit: true,
});

/** The plain popups, by tblSearch column, in the order Save writes them. */
const POPUPS: [string, ChildTable][] = [
  [
    'SamvatTran',
    child('Samvat', {
      SamvatKindKt: 'int',
      Remark: 'text',
      AsamvatKt: 'int',
      Asamvat: 'text',
      Vksamvat: 'int',
      Isvisan: 'int',
      BookTKt: 'int',
      PageNo: 'text',
      SthalKt: 'int',
      IsPrint: 'bit',
      Seq: 'int',
    }),
  ],
  ['KshetraTran', child('Kshetra', { KshetraKt: 'int', Seq: 'int' })],
  ['BhashaTran', child('Bhasha', { BhashaKt: 'int', Seq: 'int' })],
  ['KrutiTran', child('Kruti', { KrutiKt: 'int', Seq: 'int' })],
  [
    'ReferenceTran',
    child('Reference', {
      KrutiMstKt: 'int',
      BookTKt: 'int',
      PageNo: 'text',
      GathaNo: 'text',
      Remark: 'text',
      Seq: 'int',
    }),
  ],
  ['MainPersonTran', child('MainPerson', { VishayKt: 'int', Seq: 'int' })],
  ['VishayTran', child('Vishay', { VishayKt: 'int', Seq: 'int' })],
];

/** The Author popup's tables (no audit columns), deleted types first as the repository does. */
const AUTHOR_TABLES = [
  'TirthRakshaAuthorAuthorTypeT',
  'TirthRakshaAuthorAuthorT',
  'TirthRakshaAuthorT',
];
const AUTHOR_KEYS = { author: 'TirthRakshaAuthorKm', link: 'TirthRakshaAuthorKt' };

/** Val() of a box going to an int column, kept inside the column's range. */
const intVal = (v: unknown) => {
  const n = int(v);
  return Math.abs(n) <= 2147483647 ? n : 0;
};

/** SignBetweenStr over the rows' `column` (txtBhasha with ",", Vishay with ", "). */
function joined(rows: Row[], column: string, sign: string): string {
  let out = '';
  for (const r of rows) out = signBetween(out, text(get(r, column)), sign);
  return out;
}

/** The Author popup's txtAuth of a row: SignBetweenStr(authortype, authorname, "-"). */
const authText = (r: Row) =>
  signBetween(text(get(r, 'authortype')), text(get(r, 'authorname')), '-');

/**
 * The record's BookTKt (Save): the Reference popup's first row when the user opened it and it
 * names a book; otherwise the stored one (`null`: an Edit whose stored value is still to read).
 */
function referenceBook(f: Record<string, FieldValue>, id: number): number | null {
  const rows = grid(f, 'ReferenceTran');
  const first = rows?.[0] ? intVal(get(rows[0], 'BookTKt')) : 0;
  if (first > 0) return first;
  return id > 0 ? null : 0;
}

/**
 * GetValidationMessage (CrLf-joined, in its order), then the lengths the desktop's INSERTs fail
 * on ("String or binary data would be truncated"), refused here with a line of their own.
 */
function messages(f: Record<string, FieldValue>, bookTKt: number): string {
  const lines: string[] = [];
  if (trimmed(f.TirthRakshaNameTran) === '') lines.push('- Name(N) is Mandatory');
  if (intVal(f.Seq) === 0) lines.push('- Seq is Mandatory');
  if (intVal(f.BookSeq) === 0) lines.push('- BookSeq is Mandatory');
  if (bookTKt === 0) lines.push('- Reference(P) is Mandatory');
  if (intVal(f.DoneByKt) === 0) lines.push('- Done By(D) is Mandatory');
  const tooLong = (value: string, max: number, label: string) => {
    if (value.length > max) lines.push(`- ${label} cannot be longer than ${max} characters`);
  };
  tooLong(trimmed(f.ProjectDetail), 2000, 'Project Detail');
  tooLong(trimmed(f.Remark), 2000, 'Remark(R)');
  const bhasha = grid(f, 'BhashaTran');
  if (bhasha) tooLong(joined(bhasha, 'BhashaName', ','), 50, 'Bhasha');
  for (const r of grid(f, 'AuthTran') ?? []) tooLong(authText(r), 1500, 'Author');
  for (const r of grid(f, 'SamvatTran') ?? []) {
    tooLong(trimmed(get(r, 'Remark')), 100, 'Samvat Remark');
    tooLong(trimmed(get(r, 'Asamvat')), 30, 'Samvat');
    tooLong(trimmed(get(r, 'PageNo')), 50, 'Samvat PageNo');
  }
  for (const r of grid(f, 'ReferenceTran') ?? []) {
    tooLong(trimmed(get(r, 'PageNo')), 50, 'Reference PageNo');
    tooLong(trimmed(get(r, 'GathaNo')), 100, 'Reference GathaNo');
    tooLong(trimmed(get(r, 'Remark')), 500, 'Reference Remark');
  }
  return [...new Set(lines)].join('\r\n');
}

/**
 * The Author popup's save: TirthRakshaAuthorT rows, then each one's types and authors (under the
 * new key of a new row), then the rows no longer listed. The desktop built these statements by
 * concatenation, so a quote in a name broke the save; here every value is a parameter.
 */
async function saveAuthors(trx: Executor, id: number, authors: Row[], types: Row[], names: Row[]) {
  const keptAuthors: number[] = [];
  const keptTypes: number[] = [];
  const keptNames: number[] = [];
  for (const a of authors) {
    const oldKey = int(get(a, 'TirthRakshaAuthorKm'));
    let key = oldKey;
    if (oldKey <= 0) {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO TirthRakshaAuthorT (TirthRakshaKt, txtAuth, Seq) OUTPUT INSERTED.TirthRakshaAuthorKm AS id
        VALUES (${id}, ${authText(a)}, ${int(get(a, 'seq'))})`.execute(trx);
      key = Number(rows[0]!.id);
    } else {
      await sql`
        UPDATE TirthRakshaAuthorT SET txtAuth = ${authText(a)}, Seq = ${int(get(a, 'seq'))}
        WHERE TirthRakshaAuthorKm = ${oldKey}`.execute(trx);
    }
    keptAuthors.push(key);
    for (const t of types.filter((r) => int(get(r, 'TirthRakshaAuthorKt')) === oldKey)) {
      const tKey = int(get(t, 'TirthRakshaAuthorAuthorTypeKm'));
      if (tKey <= 0) {
        const { rows } = await sql<{ id: number }>`
          INSERT INTO TirthRakshaAuthorAuthorTypeT (TirthRakshaKt, TirthRakshaAuthorKt, AuthorTypeKt, SignKt, Seq)
          OUTPUT INSERTED.TirthRakshaAuthorAuthorTypeKm AS id
          VALUES (${id}, ${key}, ${int(get(t, 'authortypekt'))}, ${int(get(t, 'signkt'))}, ${int(get(t, 'seq'))})
        `.execute(trx);
        keptTypes.push(Number(rows[0]!.id));
      } else {
        await sql`
          UPDATE TirthRakshaAuthorAuthorTypeT SET AuthorTypeKt = ${int(get(t, 'authortypekt'))},
            SignKt = ${int(get(t, 'signkt'))}, Seq = ${int(get(t, 'seq'))}
          WHERE TirthRakshaAuthorAuthorTypeKm = ${tKey}`.execute(trx);
        keptTypes.push(tKey);
      }
    }
    for (const n of names.filter((r) => int(get(r, 'TirthRakshaAuthorKt')) === oldKey)) {
      const nKey = int(get(n, 'TirthRakshaAuthorAuthorKm'));
      if (nKey <= 0) {
        const { rows } = await sql<{ id: number }>`
          INSERT INTO TirthRakshaAuthorAuthorT (TirthRakshaKt, TirthRakshaAuthorKt, authorkt, padkt, signkt, AuthAnyaNmKt, Seq)
          OUTPUT INSERTED.TirthRakshaAuthorAuthorKm AS id
          VALUES (${id}, ${key}, ${int(get(n, 'authorkt'))}, ${int(get(n, 'padkt'))}, ${int(get(n, 'signkt'))},
                  ${int(get(n, 'AuthAnyaNmKt'))}, ${int(get(n, 'seq'))})`.execute(trx);
        keptNames.push(Number(rows[0]!.id));
      } else {
        await sql`
          UPDATE TirthRakshaAuthorAuthorT SET authorkt = ${int(get(n, 'authorkt'))}, padkt = ${int(get(n, 'padkt'))},
            signkt = ${int(get(n, 'signkt'))}, AuthAnyaNmKt = ${int(get(n, 'AuthAnyaNmKt'))}, Seq = ${int(get(n, 'seq'))}
          WHERE TirthRakshaAuthorAuthorKm = ${nKey}`.execute(trx);
        keptNames.push(nKey);
      }
    }
  }
  await sql`DELETE FROM TirthRakshaAuthorAuthorTypeT WHERE TirthRakshaKt = ${id}
    AND TirthRakshaAuthorAuthorTypeKm NOT IN ${idList([0, ...keptTypes])}`.execute(trx);
  await sql`DELETE FROM TirthRakshaAuthorAuthorT WHERE TirthRakshaKt = ${id}
    AND TirthRakshaAuthorAuthorKm NOT IN ${idList([0, ...keptNames])}`.execute(trx);
  await sql`DELETE FROM TirthRakshaAuthorT WHERE TirthRakshaKt = ${id}
    AND TirthRakshaAuthorKm NOT IN ${idList([0, ...keptAuthors])}`.execute(trx);
}

/** GetMaxBookSeq: the next BookSeq of a book. */
async function maxBookSeq(db: Executor, bookTKt: number): Promise<number> {
  return Number(
    (await scalar(
      db,
      sql`SELECT ISNULL(MAX(BookSeq), 0) + 1 FROM TirthRakshaM WHERE BookTKt = ${bookTKt}`,
    )) ?? 1,
  );
}

/** UpdateGroupNo: the selected records' GroupNo, stamped with who changed it and when. */
async function updateGroupNo(db: Executor, groupNo: number, ids: number[], userId: number) {
  await sql`
    UPDATE TirthRakshaM SET GroupNo = ${groupNo}, GroupNoModifiedBy = ${userId}, GroupNoModifiedDate = GETDATE()
    WHERE TirthRakshaKm IN ${idList(ids.length ? ids : [0])}`.execute(db);
}

const vibhag = (name: string) =>
  list(sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = ${name} ORDER BY Name`);
const VISHAY_LIST = list(
  sql`SELECT columnmastkm, name, ColumnNo FROM columnmaster WHERE vibhag = 'TirthRakshaVishay' ORDER BY columnno`,
);
const LIBNO_RICH = list(sql`
  SELECT Tid, LibNo, BookM.BookName + CASE WHEN ISNULL(BookM.part, '') = '' THEN '' ELSE ' ' + BookM.Part END AS BookName,
    BookM.txtPrakashak AS Prakashak, BookM.txtAuthor AS AuthorName, BookM.PSamvatVK AS Samvat
  FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm WHERE ISNULL(LibNo, '') <> '' ORDER BY Libno`);

export const tirthRakshaMaster: ScreenDefinition = {
  screen: 'tirth-raksha-master',
  table: TABLE,
  primaryColumn: PK,
  // The table has no Locked column: Ctrl+L / Ctrl+U fail after the password, as on the desktop.
  lockable: false,
  // insertworkreports after Add and Edit; Delete is not logged.
  workReport: true,
  workReportOn: { delete: false },

  /**
   * GetValidationMessage. An Edit whose Reference popup was not opened takes the stored
   * BookTKt, which `save` reads and checks with the same lines.
   */
  validate: (f, id) => {
    const book = referenceBook(f, id);
    return book === null ? '' : messages(f, book);
  },

  async save(trx, user, id, f) {
    let bookTKt = referenceBook(f, id);
    if (bookTKt === null) {
      bookTKt = intVal(
        await scalar(
          trx,
          sql`SELECT ISNULL(BookTKt, 0) FROM TirthRakshaM WHERE TirthRakshaKm = ${id}`,
        ),
      );
      const message = messages(f, bookTKt);
      if (message) throw new BadRequestException(message);
    }
    const authors = grid(f, 'AuthTran');
    // AuthTran's second result set is the authors (dtAuthorAuth), its third their types.
    const types = extra(f, 'AuthTran', 2);
    const names = extra(f, 'AuthTran', 1);
    const storedText = async (column: 'txtAuthor' | 'TirthRakshaName') =>
      text(
        await scalar(
          trx,
          sql`SELECT ISNULL(${sql.ref(column)}, '') FROM TirthRakshaM WHERE TirthRakshaKm = ${id}`,
        ),
      );
    // GetAuthorName: from the popup's rows, or the stored text when it was not opened.
    const txtAuthor = authors
      ? await authorText(trx, authors, types, names, AUTHOR_KEYS)
      : id > 0
        ? await storedText('txtAuthor')
        : '';
    // The Name box shows GetcontString of the name; written back unopened it would lose the
    // " | " structure UpdateVishay wrote, so an Edit that never opened the Name popup keeps it.
    const name =
      id > 0 && grid(f, 'TirthRakshaNameTran') === null
        ? await storedText('TirthRakshaName')
        : trimmed(f.TirthRakshaNameTran);
    const v = {
      TirthRakshaName: name,
      txtAuthor,
      TirthKt: intVal(f.TirthKt),
      Seq: intVal(f.Seq),
      BookSeq: intVal(f.BookSeq),
      PurnataKt: intVal(f.PurnataKt),
      ProjectKt: intVal(f.ProjectKt),
      DoneByKt: intVal(f.DoneByKt),
      ProjectDetail: trimmed(f.ProjectDetail),
      Remark: trimmed(f.Remark),
      BookTKt: bookTKt,
    };
    let recordId = id;
    if (id > 0) {
      await sql`
        UPDATE TirthRakshaM SET TirthRakshaName = ${v.TirthRakshaName}, txtAuthor = ${v.txtAuthor}, TirthKt = ${v.TirthKt},
          Seq = ${v.Seq}, BookSeq = ${v.BookSeq}, PurnataKt = ${v.PurnataKt}, ProjectKt = ${v.ProjectKt},
          DoneByKt = ${v.DoneByKt}, ProjectDetail = ${v.ProjectDetail}, Remark = ${v.Remark}, BookTKt = ${v.BookTKt},
          moduser = ${user.id}, moddate = GETDATE()
        WHERE TirthRakshaKm = ${id}`.execute(trx);
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO TirthRakshaM (TirthRakshaName, txtAuthor, TirthKt, Seq, BookSeq, PurnataKt, ProjectKt, DoneByKt,
          ProjectDetail, Remark, BookTKt, enuser, endate)
        OUTPUT INSERTED.TirthRakshaKm AS id
        VALUES (${v.TirthRakshaName}, ${v.txtAuthor}, ${v.TirthKt}, ${v.Seq}, ${v.BookSeq}, ${v.PurnataKt},
          ${v.ProjectKt}, ${v.DoneByKt}, ${v.ProjectDetail}, ${v.Remark}, ${v.BookTKt}, ${user.id}, GETDATE())
      `.execute(trx);
      recordId = Number(rows[0]!.id);
    }
    // The BookSeq shift (IsBookSeqExist) never runs on the desktop and is not ported.

    for (const e of VISHAY_ENTRIES)
      await saveVishayEntry(
        trx,
        grid(f, e.column),
        e.transactionName,
        TABLE,
        PK,
        recordId,
        e.summary,
      );
    if (authors) await saveAuthors(trx, recordId, authors, types, names);

    for (const [column, table] of POPUPS) {
      const rows = grid(f, column);
      if (rows === null) continue;
      await upsertChildRows(trx, table, recordId, rows, user.id);
      if (column === 'SamvatTran') {
        // The first row's samvat goes on the record. With no rows the desktop passed Nothing for
        // SamvatRemark and the save failed; here the three are cleared.
        const first = rows[0];
        await sql`
          UPDATE TirthRakshaM SET VikramSamvat = ${first ? intVal(get(first, 'Vksamvat')) : 0},
            Isvisan = ${first ? intVal(get(first, 'Isvisan')) : 0},
            SamvatRemark = ${first ? text(get(first, 'Remark')) : ''}
          WHERE TirthRakshaKm = ${recordId}`.execute(trx);
      } else if (column === 'BhashaTran') {
        await sql`UPDATE TirthRakshaM SET txtBhasha = ${trimmed(joined(rows, 'BhashaName', ',')) || ' '}
          WHERE TirthRakshaKm = ${recordId}`.execute(trx);
      } else if (column === 'VishayTran') {
        await sql`UPDATE TirthRakshaM SET Vishay = ${trimmed(joined(rows, 'VishayName', ', ')) || ' '}
          WHERE TirthRakshaKm = ${recordId}`.execute(trx);
      }
    }
    return recordId;
  },

  /** btnNew_Click: Seq = GetMaxSeq; BookSeq = GetMaxBookSeq of the carried reference's book. */
  async newDefaults(db, _user, params): Promise<GridRow> {
    const seq = Number(
      (await scalar(db, sql`SELECT ISNULL(MAX(Seq), 0) + 1 FROM TirthRakshaM`)) ?? 1,
    );
    if (params?.BookTKt === undefined) return { Seq: seq };
    return { Seq: seq, BookSeq: await maxBookSeq(db, intVal(params.BookTKt)) };
  },

  /** FillList: the vishay columns show GetcontString of their text. */
  async decorateList(_db, rows: GridRow[]) {
    for (const r of rows)
      for (const c of ['TirthRakshaName', 'Vishay', 'PetaVishay', 'txtRemark'])
        if (c in r) r[c] = contString(text(r[c]));
    return rows;
  },

  /** FillData: the Name, Vishay, Peta Vishay and Remark(R1) boxes show GetcontString. */
  async recordExtras(db, id) {
    const { rows } = await sql<Record<string, unknown>>`
      SELECT TirthRakshaName, Vishay, PetaVishay, txtRemark FROM TirthRakshaM WHERE TirthRakshaKm = ${id}`.execute(
      db,
    );
    const r = rows[0] ?? {};
    return {
      TirthRakshaNameTran: contString(text(r.TirthRakshaName)),
      VishayTran: contString(text(r.Vishay)),
      PetaVishayTran: contString(text(r.PetaVishay)),
      TirthRakshaRemarkTran: contString(text(r.txtRemark)),
    };
  },

  /** Delete(StrId): the Vishay lines and every child table's rows, then the record. */
  async deleteRecord(trx, _user, id) {
    for (const name of DELETED_ENTRIES) {
      await sql`DELETE FROM VishayEntry WHERE TransactionName = ${name} AND RecordKt = ${id}`.execute(
        trx,
      );
    }
    const tables = [...AUTHOR_TABLES, ...POPUPS.map(([, t]) => t.table)];
    for (const t of tables)
      await sql`DELETE FROM ${sql.table(t)} WHERE TirthRakshaKt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM TirthRakshaM WHERE TirthRakshaKm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  trans: {
    ...Object.fromEntries(VISHAY_ENTRIES.map((e) => [e.column, { lookups: VISHAY_ENTRY_LOOKUPS }])),
    // TranName "Author" and its sub-popups "multiauthortype" / "multiauthor".
    AuthTran: {
      lookups: {
        authortype: list(sql`SELECT authtycokm, authortype FROM authtype ORDER BY authortype`),
        sign: SIGN_UNDER_10,
        authorname: AUTHOR_LIST,
        anyaname: anyNames,
        padvi: list(
          sql`SELECT tid, vishesh FROM visheshmast WHERE remark = 'avastha' AND ISNULL(visheshno, 0) > 5 ORDER BY vishesh`,
        ),
      },
    },
    // Author Master's Samvat lists (AuthSamKind, Samvmast, sadimst, LibNo, city).
    SamvatTran: { lookups: authorMaster.trans!.SamvatTran!.lookups! },
    KshetraTran: { lookups: { kshetraname: vibhag('TirthRakshaKshetra') } },
    BhashaTran: { lookups: { bhashaname: list(sql`SELECT bhashacokm, bhashaname FROM bhasmast`) } },
    KrutiTran: { lookups: { krutiname: vibhag('TirthRakshaKruti') } },
    ReferenceTran: {
      lookups: {
        krutino: list(sql`
          SELECT DISTINCT K.krutimstkm, K.KrutiNo, tblKrutiRef.Tid, tblKrutiRef.LibNo, tblKrutiRef.BookName,
            tblKrutiRef.Prakashak, tblKrutiRef.AuthorName, tblKrutiRef.Samvat
          FROM krutiMst K
          OUTER APPLY (SELECT TOP (1) KR.krutimstkt, BT.tid AS Tid, BT.Libno,
              BM.BookName + CASE WHEN ISNULL(BM.part, '') = '' THEN '' ELSE ' ' + BM.Part END AS BookName,
              BM.txtPrakashak AS Prakashak, BM.txtAuthor AS AuthorName, BM.PSamvatVK AS Samvat
            FROM krutireflibno KR
            INNER JOIN columnmaster colTyp ON KR.ktypeid = colTyp.ColumnMastkm
              AND colTyp.Name = N'मुद्रित गी.गं भंडारनुं प्रथम पुस्तक'
            INNER JOIN BookT BT ON KR.BookTKt = BT.tid INNER JOIN BookM BM ON BT.BookMastkt = BM.BookMastkm
            WHERE KR.krutimstkt = K.krutimstkm) AS tblKrutiRef
          WHERE K.krutimstkm = tblKrutiRef.krutimstkt
          ORDER BY K.krutimstkm`),
        libno: LIBNO_RICH,
      },
    },
    MainPersonTran: {
      lookups: {
        vishayname: list(
          sql`SELECT vishaycokm, vishay_nm FROM vishay WHERE ISNULL(vishay_nm, '') <> '' ORDER BY vishay_nm`,
        ),
      },
    },
    VishayTran: { lookups: { vishayname: VISHAY_LIST } },
  },

  lists: {
    /** Utility › Update Book Seq: the books the references name (boolSelectFirst). */
    'book-seq': (db) =>
      pickListOf(
        db,
        sql`SELECT DISTINCT TirthRakshaReferenceT.BookTKt, BookT.Libno, BookM.BookName
            FROM TirthRakshaReferenceT INNER JOIN BookT ON TirthRakshaReferenceT.BookTKt = BookT.tid
            INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm ORDER BY BookT.Libno`,
      ),
    /** Group No › Add In Existing Group: the groups in use. */
    groups: (db) =>
      pickListOf(
        db,
        sql`SELECT DISTINCT GroupNo AS Id, GroupNo FROM TirthRakshaM WHERE ISNULL(GroupNo, 0) > 0 ORDER BY GroupNo`,
      ),
  },

  actions: {
    // Print Report › Main Report (frmWebBrowser, Home/PrintTirthRakshaReport): the selected
    // records, built here (reports/tirth-raksha.ts).
    'main-report': async (db, _user, ids, ctx) => ({
      kind: 'report',
      document: await tirthRakshaReport({ db, env: ctx.env }, ids),
    }),
    /** After the Reference popup names another book: txtBookSeq = GetMaxBookSeq(it). */
    async 'max-book-seq'(db, _user, _ids, ctx) {
      return {
        kind: 'cells',
        rows: [{ BookSeq: await maxBookSeq(db, intVal(ctx.params.bookTKt)) }],
      };
    },
    /** Utility › Update Book Seq (SetBookSeq): the book's records numbered 1, 2, … by key. */
    async 'update-book-seq'(db, _user, _ids, ctx) {
      const bookTKt = intVal(ctx.params.bookTKt);
      if (bookTKt > 0) {
        await sql`
          UPDATE t SET BookSeq = r.n
          FROM TirthRakshaM t INNER JOIN (
            SELECT TirthRakshaKm, ROW_NUMBER() OVER (ORDER BY TirthRakshaKm) AS n FROM TirthRakshaM WHERE BookTKt = ${bookTKt}
          ) r ON t.TirthRakshaKm = r.TirthRakshaKm`.execute(db);
      }
      return { kind: 'message', message: '' };
    },
    /** Group No › Add In New Group: MAX(GroupNo) + 1 for the selected records. */
    async 'group-new'(db, user, ids) {
      const groupNo = Number(
        (await scalar(
          db,
          sql`SELECT ISNULL(MAX(GroupNo), 0) + 1 FROM TirthRakshaM WITH (UPDLOCK, HOLDLOCK)`,
        )) ?? 1,
      );
      await updateGroupNo(db, groupNo, ids, user.id);
      return {
        kind: 'cells',
        rows: [{ GroupNo: groupNo }],
        message: `${ids.length} Records Added in New GroupNo ${groupNo} Successfully`,
      };
    },
    /** Group No › Add In Existing Group: the picked group (nothing when none was picked). */
    async 'group-existing'(db, user, ids, ctx) {
      const groupNo = intVal(ctx.params.groupNo);
      if (groupNo <= 0) return { kind: 'message', message: '' };
      await updateGroupNo(db, groupNo, ids, user.id);
      return {
        kind: 'cells',
        rows: [{ GroupNo: groupNo }],
        message: `${ids.length} Records Updated in GroupNo ${groupNo} Successfully`,
      };
    },
    /** Group No › Delete From Group: GroupNo 0 (still stamped with who and when). */
    async 'group-delete'(db, user, ids) {
      await updateGroupNo(db, 0, ids, user.id);
      return {
        kind: 'cells',
        rows: [{ GroupNo: 0 }],
        message: `Groups Delete From ${ids.length} Records Successfully`,
      };
    },
    /** For Selected Record › Book Master: the books of the selected records' references. */
    'book-master': (db, _user, ids) =>
      openInUse(
        db,
        'book-master',
        sql<{ id: number }>`
          SELECT DISTINCT BookT.BookMastkt AS id FROM TirthRakshaReferenceT
          INNER JOIN BookT ON TirthRakshaReferenceT.BookTKt = BookT.tid
          WHERE TirthRakshaReferenceT.TirthRakshaKt IN ${idList(ids.length ? ids : [0])}`,
        '',
      ),
  },
};
