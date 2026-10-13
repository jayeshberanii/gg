import { type ChildRow, type FieldValue, type GridRow, UserType } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { normalizeRow, pickListOf } from '../values.js';
import { BOOK_TRANS } from './book.js';
import {
  bit,
  ddmmyyyy,
  extra,
  get,
  grid,
  insertObtainBook,
  int,
  list,
  nextKey,
  type Row,
  scalar,
  signBetween,
  text,
} from './book-common.js';
import { type ChildTable, openInUse, trimmed, upsertChildRows } from './master-common.js';
import { authorText } from './prakashak.js';
import type { ScreenDefinition } from './registry.js';
import { saveVishayEntries, VISHAY_ENTRY_LOOKUPS } from './vishay-entry.js';

/**
 * Library › Anya Bhandar (frmAnyaBhandar, AnyaBhandarRepository): another library's holding of a
 * book. Table AnyaBhandarM, IDENTITY key AnyaBhandarKm, no Locked column. Seven
 * frmDisplayTransNew popups (SetForm_AnyaBhandar) over nine child tables; a new record whose
 * Book Name was typed can create the BookM + BookT itself, in the obtain-book (OB) series.
 * See docs/screens/anya-bhandar.md.
 */

const TABLE = 'AnyaBhandarM';
const PK = 'AnyaBhandarKm';
const VISHAY_TRANSACTION = 'AnyaBhandarSubject';

const child = (name: string, columns: ChildTable['columns']): ChildTable => ({
  table: `AnyaBhandar${name}T`,
  key: `AnyaBhandar${name}Km`,
  parent: 'AnyaBhandarKt',
  columns,
});

const PRAK = child('Prak', {
  PrakashakKt: 'int',
  Seq: 'int',
  Purva: 'bit',
  nameSelected: 'text',
  PrakTypekt: 'int',
  Remark: 'text',
  SignKt: 'int',
});
const BHASHA = child('Bhasha', { BhashaKt: 'int', Seq: 'int' });
const LIPI = child('Lipi', { LippiKt: 'int', Seq: 'int' });
const MUL_AUTHOR = child('MulAuthor', { AuthorKt: 'int', Seq: 'int' });
const ANU_AUTHOR = child('AnuAuthor', { AuthorKt: 'int', Seq: 'int' });

/** Every child table, the Author popup's sub-tables first (Delete removes them all). */
const CHILD_TABLES = [
  'AnyaBhandarAuthorAuthTypeT',
  'AnyaBhandarAuthorAuthT',
  'AnyaBhandarAuthorT',
  'AnyaBhandarPrakT',
  'AnyaBhandarBhashaT',
  'AnyaBhandarLipiT',
  'AnyaBhandarSubjectT',
  'AnyaBhandarMulAuthorT',
  'AnyaBhandarAnuAuthorT',
];
const AUTHOR_KEYS = { author: 'AnyaBhandarAuthorKm', link: 'AnyaBhandarAuthorKt' };

/**
 * `Ent.RecordNo = txtRecordNo.Text`: VB's String → Integer conversion, which throws (before
 * anything else happens) for a blank or non-numeric box and rounds a decimal to even.
 */
export function vbInteger(v: unknown): number {
  const s = text(v);
  if (!/^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s))
    throw new BadRequestException(`Conversion from string "${s}" to type 'Integer' is not valid.`);
  const n = Number(s);
  const floor = Math.floor(n);
  const diff = n - floor;
  const rounded = diff > 0.5 || (diff === 0.5 && floor % 2 !== 0) ? floor + 1 : floor;
  if (rounded > 2147483647 || rounded < -2147483648)
    throw new BadRequestException('Arithmetic operation resulted in an overflow.');
  return rounded;
}

/** The Author popup's txtAuth of a row: SignBetweenStr(authortype, authorname, "-"). */
const authText = (r: Row) =>
  signBetween(text(get(r, 'authortype')), text(get(r, 'authorname')), '-');

/**
 * GetValidationMessage (an ElseIf chain: the first failure only), then the lengths the desktop's
 * INSERTs fail on ("String or binary data would be truncated"), refused here with a line each.
 */
function messages(f: Record<string, FieldValue>): string {
  const recordNo = vbInteger(f.RecordNo);
  if (int(f.BhandarKt) === 0) return 'Please Bhandar Name';
  if (trimmed(f.BookName) === '') return '- Please Enter Book Name';
  if (trimmed(f.Size) === '') return '- Please Enter Size';
  if (recordNo === 0) return '- Please Enter RecrordNo';
  const lines: string[] = [];
  const tooLong = (value: string, max: number, label: string) => {
    if (value.length > max) lines.push(`- ${label} cannot be longer than ${max} characters`);
  };
  tooLong(trimmed(f.Size), 3, 'Size');
  tooLong(trimmed(f.BookName), 500, 'Book Name');
  tooLong(trimmed(f.OldLibNo), 200, 'Old Library No');
  tooLong(trimmed(f.Remark), 2000, 'Remark');
  for (const r of grid(f, 'PrakTran') ?? []) {
    tooLong(trimmed(get(r, 'nameSelected')), 150, 'Prakashak NameSelected');
    tooLong(trimmed(get(r, 'Remark')), 100, 'Prakashak Remark');
  }
  for (const r of grid(f, 'AuthTran') ?? []) tooLong(authText(r), 1500, 'संपादक');
  for (const r of grid(f, 'SubjTran') ?? []) {
    tooLong(trimmed(get(r, 'EntryType')), 30, 'Subject EntryType');
    tooLong(trimmed(get(r, 'Remark')), 2000, 'Subject Remark');
  }
  return [...new Set(lines)].join('\r\n');
}

/** Val() of a box going to an int column, kept inside the column's range. */
const intVal = (v: unknown) => {
  const n = int(v);
  return Math.abs(n) <= 2147483647 ? n : 0;
};

/**
 * The Author popup's save: delete-insert (only when it has rows, as the desktop does), each
 * row's types and authors under the new key of their row. With `bookId`, the same rows also
 * go to the new book's praksnAuthor tables (keys MAX + 1, locked). Every value is a parameter
 * (the desktop concatenated N'…', so an apostrophe broke the save).
 */
async function saveAuthors(
  trx: Executor,
  id: number,
  editing: boolean,
  authors: Row[],
  types: Row[],
  names: Row[],
  bookId: number | null,
) {
  const of = (rows: Row[], a: Row) =>
    rows.filter((r) => int(get(r, 'AnyaBhandarAuthorKt')) === int(get(a, 'AnyaBhandarAuthorKm')));
  if (bookId !== null) {
    let authorKm = await nextKey(trx, 'praksnAuthorT', 'praksnauthorkm');
    let typeKm = await nextKey(trx, 'PraksnAuthorAuthTypeT', 'praksnauthorauthtypekm');
    let nameKm = await nextKey(trx, 'praksnAuthorAuthT', 'praksnauthorauthkm');
    for (const a of authors) {
      await sql`INSERT INTO praksnAuthorT (praksnauthorkm, prakashannokt, Seq, txtAuth)
        VALUES (${authorKm}, ${bookId}, ${int(get(a, 'seq'))}, ${authText(a)})`.execute(trx);
      for (const t of of(types, a)) {
        await sql`INSERT INTO PraksnAuthorAuthTypeT (praksnauthorauthtypekm, praksnauthorkt, prakashannokt, AuthorTypeKt, SignKt, Seq)
          VALUES (${typeKm++}, ${authorKm}, ${bookId}, ${int(get(t, 'authortypekt'))}, ${int(get(t, 'signkt'))},
            ${int(get(t, 'seq'))})`.execute(trx);
      }
      for (const n of of(names, a)) {
        await sql`INSERT INTO praksnAuthorAuthT (praksnauthorauthkm, praksnauthorkt, prakashannokt, authorkt, padkt, signkt, seq, AuthAnyaNmKt)
          VALUES (${nameKm++}, ${authorKm}, ${bookId}, ${int(get(n, 'authorkt'))}, ${int(get(n, 'padkt'))},
            ${int(get(n, 'signkt'))}, ${int(get(n, 'seq'))}, ${int(get(n, 'AuthAnyaNmKt'))})`.execute(
          trx,
        );
      }
      authorKm++;
    }
  }
  if (editing) {
    for (const t of CHILD_TABLES.slice(0, 3))
      await sql`DELETE FROM ${sql.table(t)} WHERE AnyaBhandarKt = ${id}`.execute(trx);
  }
  for (const a of authors) {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO AnyaBhandarAuthorT (AnyaBhandarKt, Seq, txtAuth) OUTPUT INSERTED.AnyaBhandarAuthorKm AS id
      VALUES (${id}, ${int(get(a, 'seq'))}, ${authText(a)})`.execute(trx);
    const key = Number(rows[0]!.id);
    for (const t of of(types, a)) {
      await sql`INSERT INTO AnyaBhandarAuthorAuthTypeT (AnyaBhandarAuthorKt, AnyaBhandarKt, AuthorTypeKt, SignKt, Seq)
        VALUES (${key}, ${id}, ${int(get(t, 'authortypekt'))}, ${int(get(t, 'signkt'))}, ${int(get(t, 'seq'))})`.execute(
        trx,
      );
    }
    for (const n of of(names, a)) {
      await sql`INSERT INTO AnyaBhandarAuthorAuthT (AnyaBhandarAuthorKt, AnyaBhandarKt, authorkt, padkt, signkt, seq, AuthAnyaNmKt)
        VALUES (${key}, ${id}, ${int(get(n, 'authorkt'))}, ${int(get(n, 'padkt'))}, ${int(get(n, 'signkt'))},
          ${int(get(n, 'seq'))}, ${int(get(n, 'AuthAnyaNmKt'))})`.execute(trx);
    }
  }
}

/**
 * The Subject popup: upsert by key (a new row also goes to the new book's BookSubjectT), prune
 * on Edit, then each subject's Vishay lines (frmVishayEntry) under its own key. The desktop
 * saved every new line under the first line's RecordKt and refreshed only that subject.
 */
async function saveSubjects(
  trx: Executor,
  id: number,
  editing: boolean,
  rows: Row[],
  entries: Row[] | null,
  bookId: number | null,
) {
  const kept: number[] = [];
  const keys: { old: number; key: number }[] = [];
  for (const r of rows) {
    const old = int(get(r, 'AnyaBhandarSubjectKm'));
    const printDate = ddmmyyyy(get(r, 'PrintDate'));
    const date = printDate === null ? null : sql`CAST(${printDate} AS date)`;
    const v = {
      EntryType: trimmed(get(r, 'EntryType')) || ' ',
      Vishay: trimmed(get(r, 'Vishay')) || ' ',
      WorkDoneByKt: int(get(r, 'WorkDoneByKt')),
      PrintSeq: int(get(r, 'PrintSeq')),
      Remark: trimmed(get(r, 'Remark')) || ' ',
      Seq: int(get(r, 'seq')),
    };
    let key = old;
    if (old <= 0) {
      if (bookId !== null) {
        await sql`INSERT INTO BookSubjectT (BookMastKt, EntryType, Vishay, WorkDoneByKt, PrintSeq, Remark, Seq, PrintDate)
          VALUES (${bookId}, ${v.EntryType}, ${v.Vishay}, ${v.WorkDoneByKt}, ${v.PrintSeq}, ${v.Remark}, ${v.Seq}, ${date})`.execute(
          trx,
        );
      }
      const { rows: ins } = await sql<{ id: number }>`
        INSERT INTO AnyaBhandarSubjectT (AnyaBhandarKt, EntryType, Vishay, WorkDoneByKt, PrintSeq, Remark, Seq, PrintDate)
        OUTPUT INSERTED.AnyaBhandarSubjectKm AS id
        VALUES (${id}, ${v.EntryType}, ${v.Vishay}, ${v.WorkDoneByKt}, ${v.PrintSeq}, ${v.Remark}, ${v.Seq}, ${date})`.execute(
        trx,
      );
      key = Number(ins[0]!.id);
    } else {
      // A blank PrintDate is left as it was (the desktop omits it from the UPDATE).
      await sql`
        UPDATE AnyaBhandarSubjectT SET EntryType = ${v.EntryType}, Vishay = ${v.Vishay}, WorkDoneByKt = ${v.WorkDoneByKt},
          PrintSeq = ${v.PrintSeq}, Remark = ${v.Remark}, Seq = ${v.Seq}
          ${date === null ? sql`` : sql`, PrintDate = ${date}`}
        WHERE AnyaBhandarSubjectKm = ${old} AND AnyaBhandarKt = ${id}`.execute(trx);
    }
    kept.push(key);
    keys.push({ old, key });
  }
  if (editing) {
    await sql`DELETE FROM AnyaBhandarSubjectT WHERE AnyaBhandarKt = ${id}
      AND AnyaBhandarSubjectKm NOT IN ${idList([0, ...kept])}`.execute(trx);
  }
  // Each subject's Vishay lines in turn (those of the subjects gone: deleteOrphanEntries).
  if (entries === null) return;
  for (const { old, key } of keys) {
    const lines = entries.filter((e) => old !== 0 && int(get(e, 'RecordKt')) === old);
    const had = int(
      await scalar(
        trx,
        sql`SELECT COUNT(*) FROM VishayEntry WHERE TransactionName = ${VISHAY_TRANSACTION} AND RecordKt = ${key}`,
      ),
    );
    if (lines.length === 0 && had === 0) continue;
    const ids = await saveVishayEntries(trx, VISHAY_TRANSACTION, key, lines);
    await sql`DELETE FROM VishayEntry WHERE TransactionName = ${VISHAY_TRANSACTION} AND RecordKt = ${key}
      AND VishayEntryKm NOT IN ${idList([0, ...ids])}`.execute(trx);
    if (ids.length === 0) {
      await sql`UPDATE AnyaBhandarSubjectT SET Vishay = '' WHERE AnyaBhandarSubjectKm = ${key}`.execute(
        trx,
      );
    } else {
      await sql`EXEC UpdateVishay ${VISHAY_TRANSACTION}, ${String(key)}`.execute(trx);
    }
  }
}

/** The lines of AnyaBhandarSubject whose subject row is gone (found by key, then deleted). */
async function deleteOrphanEntries(trx: Executor) {
  const { rows } = await sql<{ id: number }>`
    SELECT v.VishayEntryKm AS id FROM VishayEntry v
    LEFT JOIN AnyaBhandarSubjectT s ON v.RecordKt = s.AnyaBhandarSubjectKm
    WHERE v.TransactionName = ${VISHAY_TRANSACTION} AND s.AnyaBhandarSubjectKm IS NULL
    OPTION (LOOP JOIN)`.execute(trx);
  if (rows.length > 0)
    await sql`DELETE FROM VishayEntry WHERE VishayEntryKm IN ${idList(rows.map((r) => Number(r.id)))}`.execute(
      trx,
    );
}

async function save(
  trx: Executor,
  userId: number,
  id: number,
  f: Record<string, FieldValue>,
): Promise<number> {
  const message = messages(f);
  if (message) throw new BadRequestException(message);
  const editing = id > 0;
  const authors = grid(f, 'AuthTran');
  // AuthTran's second result set is the authors (dtAuthorAuth), its third their types.
  const names = extra(f, 'AuthTran', 1);
  const types = extra(f, 'AuthTran', 2);
  // With author rows txtAuthor is rebuilt from them (as Book Master's GetAuthorName); without,
  // the box text is saved.
  const txtAuthor =
    authors && authors.length > 0
      ? await authorText(trx, authors, types, names, AUTHOR_KEYS)
      : trimmed(f.AuthTran);
  const v = {
    BhandarKt: intVal(f.BhandarKt),
    RecordNo: vbInteger(f.RecordNo),
    Size: trimmed(f.Size),
    BookMastKt: intVal(f.BookMastKt),
    BookName: trimmed(f.BookName),
    ParichayakName: trimmed(f.ParichayakName),
    Part: trimmed(f.Part),
    PSamvatcokt: intVal(f.PSamvatcokt),
    PSamvat: trimmed(f.PSamvat),
    PSamvatVK: intVal(f.PSamvatVK),
    AvrutiKt: intVal(f.AvrutiKt),
    Pages: trimmed(f.Pages),
    TotalPages: intVal(f.TotalPages),
    Price: text(f.Price),
    GMalaKt: intVal(f.GMalaKt),
    GMalaNo: text(f.GMalaNo),
    ShapeKt: intVal(f.ShapeKt),
    ISBNNo: text(f.ISBNNo),
    txtPrakashak: trimmed(f.PrakTran),
    txtAuthor,
    txtBhasha: trimmed(f.BhashaTran),
    txtLipi: trimmed(f.LipiTran),
    BookTKt: intVal(f.BookTKt),
    OldLibNo: trimmed(f.OldLibNo),
    Remark: trimmed(f.Remark),
  };
  // "Do You want to Add New Book Entry?" answered Yes: only a new record whose Book Name was
  // typed rather than picked. (Editing a record on an OB number runs no BookT update: the
  // desktop's `UPDATE BookT … WHERE BookTKt` named a column BookT does not have and failed.)
  let bookId: number | null = null;
  if (bit(f.AddBook) && !editing && v.BookMastKt === 0 && v.BookName !== '') {
    const book = await insertObtainBook(trx, userId, v);
    bookId = book.bookId;
    v.BookMastKt = book.bookId;
    v.BookTKt = book.bookTKt;
  }

  let recordId = id;
  if (editing) {
    await sql`
      UPDATE AnyaBhandarM SET BhandarKt = ${v.BhandarKt}, RecordNo = ${v.RecordNo}, Size = ${v.Size},
        BookMastKt = ${v.BookMastKt}, BookName = ${v.BookName}, ParichayakName = ${v.ParichayakName}, Part = ${v.Part},
        PSamvatcokt = ${v.PSamvatcokt}, PSamvat = ${v.PSamvat}, PSamvatVK = ${v.PSamvatVK}, AvrutiKt = ${v.AvrutiKt},
        Pages = ${v.Pages}, TotalPages = ${v.TotalPages}, Price = ${v.Price}, GMalaKt = ${v.GMalaKt},
        GMalaNo = ${v.GMalaNo}, ShapeKt = ${v.ShapeKt}, ISBNNo = ${v.ISBNNo}, txtPrakashak = ${v.txtPrakashak},
        txtAuthor = ${v.txtAuthor}, txtBhasha = ${v.txtBhasha}, txtLipi = ${v.txtLipi}, BookTKt = ${v.BookTKt},
        OldLibNo = ${v.OldLibNo}, Remark = ${v.Remark}, moduser = ${userId}, moddate = GETDATE()
      WHERE AnyaBhandarKm = ${id}`.execute(trx);
  } else {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO AnyaBhandarM (BhandarKt, RecordNo, Size, BookMastKt, BookName, ParichayakName, Part, PSamvatcokt, PSamvat,
        PSamvatVK, AvrutiKt, Pages, TotalPages, Price, GMalaKt, GMalaNo, ShapeKt, ISBNNo, txtPrakashak, txtAuthor,
        txtBhasha, txtLipi, BookTKt, OldLibNo, Remark, enuser, endate)
      OUTPUT INSERTED.AnyaBhandarKm AS id
      VALUES (${v.BhandarKt}, ${v.RecordNo}, ${v.Size}, ${v.BookMastKt}, ${v.BookName}, ${v.ParichayakName}, ${v.Part},
        ${v.PSamvatcokt}, ${v.PSamvat}, ${v.PSamvatVK}, ${v.AvrutiKt}, ${v.Pages}, ${v.TotalPages}, ${v.Price},
        ${v.GMalaKt}, ${v.GMalaNo}, ${v.ShapeKt}, ${v.ISBNNo}, ${v.txtPrakashak}, ${v.txtAuthor}, ${v.txtBhasha},
        ${v.txtLipi}, ${v.BookTKt}, ${v.OldLibNo}, ${v.Remark}, ${userId}, GETDATE())`.execute(trx);
    recordId = Number(rows[0]!.id);
  }

  const prak = grid(f, 'PrakTran');
  if (prak) {
    if (bookId !== null) {
      let km = await nextKey(trx, 'praksnPrakT', 'prashnprakkm');
      for (const r of prak) {
        await sql`INSERT INTO praksnPrakT (prashnprakkm, prakashannokt, prakashakkt, seq, purva, nameSelected, PrakTypekt, remark, signkt)
          VALUES (${km++}, ${bookId}, ${int(get(r, 'prakashakkt'))}, ${int(get(r, 'seq'))}, ${bit(get(r, 'purva'))},
            ${trimmed(get(r, 'nameSelected')) || ' '}, ${int(get(r, 'PrakTypekt'))}, ${trimmed(get(r, 'Remark')) || ' '},
            ${int(get(r, 'signkt'))})`.execute(trx);
      }
    }
    await upsertChildRows(trx, PRAK, recordId, prak, userId);
  }

  // Bhasha / Lipi rows without a language / script are skipped (and so pruned).
  for (const [column, table, kt, book] of [
    ['BhashaTran', BHASHA, 'BhashaKt', 'bhasha'],
    ['LipiTran', LIPI, 'LippiKt', 'lipi'],
  ] as const) {
    const rows = grid(f, column);
    if (!rows) continue;
    const used = rows.filter((r) => int(get(r, kt)) > 0);
    if (bookId !== null) {
      if (book === 'bhasha') {
        let km = await nextKey(trx, 'praksnBhashaT', 'prakshnbhashakm');
        for (const r of used)
          await sql`INSERT INTO praksnBhashaT (prakshnbhashakm, prakshnokt, bhashakt, seq)
            VALUES (${km++}, ${bookId}, ${int(get(r, kt))}, ${int(get(r, 'seq'))})`.execute(trx);
      } else {
        let km = await nextKey(trx, 'praksnLipiT', 'prakshnlipikm');
        for (const r of used)
          await sql`INSERT INTO praksnLipiT (prakshnlipikm, prakashankt, lippikt, seq)
            VALUES (${km++}, ${bookId}, ${int(get(r, kt))}, ${int(get(r, 'seq'))})`.execute(trx);
      }
    }
    await upsertChildRows(trx, table, recordId, used, userId);
  }

  // Deleting every row of the Author popup leaves the old rows (only rows are saved), as on the desktop.
  if (authors && authors.length > 0)
    await saveAuthors(trx, recordId, editing, authors, types, names, bookId);

  // Likewise the Subject popup.
  const subjects = grid(f, 'SubjTran');
  if (subjects && subjects.length > 0) {
    const sent = f['SubjTran.Extra'];
    await saveSubjects(
      trx,
      recordId,
      editing,
      subjects,
      Array.isArray(sent) ? (sent as Row[]) : null,
      bookId,
    );
    await deleteOrphanEntries(trx);
  }

  // Mul / Anu authors: rows whose key is 0 or less are inserted (the desktop inserted key 0
  // only, so a row added in the popup, key −1, was lost), the rest updated, the others deleted.
  for (const [column, table] of [
    ['MulAuthorTran', MUL_AUTHOR],
    ['AnuAuthorTran', ANU_AUTHOR],
  ] as const) {
    const rows = grid(f, column);
    if (rows) await upsertChildRows(trx, table, recordId, rows, userId);
  }
  return recordId;
}

// ------------------------------------------------------------------------------------------
// F2 on Book Name: the picked book's values (Txt_KeyDown, txtBookMastKt)
// ------------------------------------------------------------------------------------------

const DONE_BY_BOOK_TYPES = sql`(SELECT authtycokm FROM authtype WHERE authortype IN (N'मूळकर्ता', N'टीकाकार', N'अनुवादक', N'विवेचक', N'लेखक'))`;
/** The book's author rows (praksnauthorkm) that carry one of those types. */
const TYPED_AUTHOR_ROWS = sql`(SELECT praksnauthorkt FROM PraksnAuthorAuthTypeT WHERE authortypekt IN ${DONE_BY_BOOK_TYPES} AND praksnauthorkt IS NOT NULL)`;

async function rowsOf(db: Executor, query: ReturnType<typeof sql>): Promise<ChildRow[]> {
  const { rows } = await sql<Record<string, unknown>>`${query}`.execute(db);
  return rows.map(normalizeRow);
}

/**
 * The fill from a picked book: its boxes (GetBookDataTable — nothing for an Operator when the
 * book carries a CM/MS/CP/SN number), its latest library number, and its popup rows with their
 * keys negated so that Save inserts them for this record. An author typed
 * मूळकर्ता/टीकाकार/अनुवादक/विवेचक/लेखक is dropped (per author since v3.4.3.1; before, one such
 * author dropped every author of the book). The Mul/Anu author candidates are the book's
 * authors of those types and the Kruti authors of its library numbers and, since v3.4.3.1, of
 * the library numbers of its common group; the form appends them to its own rows.
 */
export async function fillFromBook(
  db: Executor,
  user: { userType: number },
  bookId: number,
  tranKm: number,
) {
  const operator =
    user.userType === UserType.Operator
      ? sql`AND txtBookTran NOT LIKE '%CM%' AND txtBookTran NOT LIKE '%ms%' AND txtBookTran NOT LIKE '%CP%' AND txtBookTran NOT LIKE '%SN%'`
      : sql``;
  const [book] = await rowsOf(
    db,
    sql`SELECT BookM.PSamvatcokt, (SELECT samvatname FROM samvmast WHERE samvatcokm = BookM.Psamvatcokt) AS PSamvatcoName,
          BookM.PSamvat, BookM.PSamvatVK, BookM.ParichayakName, BookM.Part, BookM.Avrutikt AS AvrutiKt,
          (SELECT Avrutiname FROM AvrutiMast WHERE Avrutitid = BookM.Avrutikt) AS AvrutiName, BookM.GMalaKt,
          (SELECT Vishesh FROM VisheshMast WHERE Tid = BookM.Gmalakt AND remark = 'GMALA') AS GMalaName, BookM.GMalaNo,
          BookM.Price, BookM.ShapeKt, (SELECT Vishesh FROM VisheshMast WHERE Tid = BookM.ShapeKt AND remark = 'Shape') AS ShapeName,
          BookM.Pages, BookM.TotalPages, BookM.ISBNNo, BookM.txtPrakashak AS PrakTran, BookM.txtBhasha AS BhashaTran,
          BookM.txtLipi AS LipiTran
        FROM BookM WHERE BookMastkm = ${bookId} ${operator}`,
  );
  if (!book) return null;
  const fields: GridRow = { ...book };
  const [lib] = await rowsOf(
    db,
    sql`SELECT TOP (1) Tid, LibNo FROM BookT WHERE BookMastkt = ${bookId} ORDER BY tid DESC`,
  );
  if (lib) {
    fields.BookTKt = lib.Tid ?? 0;
    fields.BookTName = lib.LibNo ?? '';
  }
  const authors = await rowsOf(
    db,
    sql`SELECT -praksnauthorkm AS AnyaBhandarAuthorKm,
          STUFF((SELECT ',' + ISNULL(authtype.authortype, '') + CASE WHEN ISNULL(colAT.Name, '') = '' THEN '' ELSE '(' + colAT.Name + ')' END
            FROM PraksnAuthorAuthTypeT INNER JOIN authtype ON PraksnAuthorAuthTypeT.authortypekt = authtype.authtycokm
            LEFT JOIN columnmaster colAT ON PraksnAuthorAuthTypeT.signkt = colAT.ColumnMastkm AND colAT.vibhag = 'Sign'
            WHERE Main.praksnauthorkm = PraksnAuthorAuthTypeT.praksnauthorkt FOR XML PATH('')), 1, 1, '') AS authortype,
          STUFF((SELECT ',' + CASE WHEN ISNULL(praksnAuthorAuthT.AuthAnyaNmKt, 0) = 0 THEN authmast.authorname ELSE AuthMAnyNmT.AnyaName END
              + CASE WHEN ISNULL(authmast.Identyty, '') = '' THEN '' ELSE '(' + authmast.Identyty + ')' END
              + CASE WHEN ISNULL(visheshMast.Vishesh, '') = '' THEN '' ELSE '(' + visheshMast.Vishesh + ')' END
              + CASE WHEN ISNULL(colA.Name, '') = '' THEN '' ELSE '(' + colA.Name + ')' END
            FROM praksnAuthorAuthT LEFT JOIN visheshMast ON visheshMast.Tid = praksnAuthorAuthT.padkt
            LEFT OUTER JOIN authmast ON praksnAuthorAuthT.authorkt = authmast.authorcokm
            LEFT JOIN AuthMAnyNmT ON praksnAuthorAuthT.AuthAnyaNmKt = AuthMAnyNmT.AuthAnyaNmKm
            LEFT JOIN columnmaster colA ON praksnAuthorAuthT.signkt = colA.ColumnMastkm AND colA.vibhag = 'Sign'
            WHERE Main.praksnauthorkm = praksnAuthorAuthT.praksnauthorkt FOR XML PATH('')), 1, 1, '') AS authorname,
          seq
        FROM praksnAuthorT Main WHERE prakashannokt = ${bookId} AND praksnauthorkm NOT IN ${TYPED_AUTHOR_ROWS}
        ORDER BY seq`,
  );
  const authorNames = await rowsOf(
    db,
    sql`SELECT -praksnAuthorAuthT.praksnauthorauthkm AS AnyaBhandarAuthorAuthKm, -praksnAuthorAuthT.praksnauthorkt AS AnyaBhandarAuthorKt,
          praksnAuthorAuthT.authorkt, ISNULL(authmast.authorname, '') AS authorname, praksnAuthorAuthT.AuthAnyaNmKt,
          CASE WHEN ISNULL(praksnAuthorAuthT.AuthAnyaNmKt, 0) = 0 THEN authmast.authorname ELSE AuthMAnyNmT.AnyaName END AS AnyaName,
          praksnAuthorAuthT.padkt, ISNULL(visheshMast.Vishesh, '') AS Padvi, ISNULL(authmast.txtGuru, '') AS Guru,
          ISNULL(authmast.Identyty, '') AS identyty, ISNULL(praksnAuthorAuthT.signkt, 0) AS signkt,
          ISNULL(columnmaster.Name, '') AS Sign, praksnAuthorAuthT.seq
        FROM praksnAuthorAuthT LEFT OUTER JOIN visheshMast ON visheshMast.Tid = praksnAuthorAuthT.padkt
        LEFT OUTER JOIN authmast ON praksnAuthorAuthT.authorkt = authmast.authorcokm
        LEFT JOIN AuthMAnyNmT ON praksnAuthorAuthT.AuthAnyaNmKt = AuthMAnyNmT.AuthAnyaNmKm
        LEFT OUTER JOIN columnmaster ON columnmaster.ColumnMastkm = praksnAuthorAuthT.signkt
        WHERE praksnAuthorAuthT.prakashannokt = ${bookId} AND praksnauthorkt NOT IN ${TYPED_AUTHOR_ROWS}
        ORDER BY praksnAuthorAuthT.seq`,
  );
  // With no author rows the type rows are cleared too.
  const authorTypes =
    authors.length === 0
      ? []
      : await rowsOf(
          db,
          sql`SELECT -PraksnAuthorAuthTypeT.praksnauthorauthtypekm AS AnyaBhandarAuthorAuthTypekm,
                -PraksnAuthorAuthTypeT.praksnauthorkt AS AnyaBhandarAuthorKt, PraksnAuthorAuthTypeT.authortypekt,
                ISNULL(authtype.authortype, '') AS authortype, ISNULL(PraksnAuthorAuthTypeT.signkt, 0) AS signkt,
                ISNULL(columnmaster.name, '') AS Sign, PraksnAuthorAuthTypeT.seq
              FROM PraksnAuthorAuthTypeT LEFT OUTER JOIN authtype ON PraksnAuthorAuthTypeT.authortypekt = authtype.authtycokm
              LEFT OUTER JOIN columnmaster ON PraksnAuthorAuthTypeT.signkt = columnmaster.ColumnMastkm
              WHERE PraksnAuthorAuthTypeT.prakashannokt = ${bookId} AND authortypekt NOT IN ${DONE_BY_BOOK_TYPES}
              ORDER BY PraksnAuthorAuthTypeT.seq`,
        );
  const bhasha = await rowsOf(
    db,
    sql`SELECT -praksnBhashaT.prakshnbhashakm AS AnyaBhandarBhashaKm, ${tranKm} AS AnyaBhandarKt, praksnBhashaT.bhashakt,
          bhasmast.bhasa_attr, praksnBhashaT.seq
        FROM praksnBhashaT INNER JOIN bhasmast ON praksnBhashaT.bhashakt = bhasmast.bhashacokm
        WHERE praksnBhashaT.prakshnokt = ${bookId} ORDER BY praksnBhashaT.seq, praksnBhashaT.prakshnbhashakm`,
  );
  const lipi = await rowsOf(
    db,
    sql`SELECT -praksnLipiT.prakshnlipikm AS AnyaBhandarLipiKm, ${tranKm} AS AnyaBhandarKt, praksnLipiT.lippikt,
          lipimast.lipi_attr, praksnLipiT.seq
        FROM praksnLipiT INNER JOIN lipimast ON praksnLipiT.lippikt = lipimast.lipicodekm
        WHERE praksnLipiT.prakashankt = ${bookId} ORDER BY praksnLipiT.seq, praksnLipiT.prakshnlipikm`,
  );
  const prak = await rowsOf(
    db,
    sql`SELECT -praksnPrakT.prashnprakkm AS AnyaBhandarPrakKm, ${tranKm} AS AnyaBhandarKt, praksnPrakT.prakashakkt,
          prakmast.prakname, praksnPrakT.purva, ISNULL(praksnPrakT.nameSelected, '') AS nameSelected,
          ISNULL(praksnPrakT.PrakTypekt, 0) AS PrakTypekt, ISNULL(columnmaster.Name, '') AS PrakType, praksnPrakT.Remark,
          praksnPrakT.signkt, ISNULL(columnmaster1.Name, '') AS sign, praksnPrakT.seq
        FROM praksnPrakT INNER JOIN prakmast ON praksnPrakT.prakashakkt = prakmast.prakcodekm
        LEFT OUTER JOIN columnmaster ON praksnPrakT.PrakTypekt = columnmaster.ColumnMastkm
        LEFT OUTER JOIN columnmaster AS columnmaster1 ON praksnPrakT.signkt = columnmaster1.ColumnMastkm
        WHERE praksnPrakT.prakashannokt = ${bookId} ORDER BY praksnPrakT.seq`,
  );
  const subjects = await rowsOf(
    db,
    sql`SELECT -BookSubjectKm AS AnyaBhandarSubjectKm, EntryType, '' AS Vishay, WorkDoneByKt, PartyM.PName AS WorkDoneByName,
          CONVERT(varchar(15), PrintDate, 103) AS PrintDate, PrintSeq, BookSubjectT.Remark, Seq
        FROM BookSubjectT LEFT JOIN PartyM ON BookSubjectT.WorkDoneByKt = PartyM.partyMkm
        WHERE BookMastKt = ${bookId} ORDER BY BookSubjectT.Seq`,
  );
  const bookAuthors = (types: ReturnType<typeof sql>) =>
    rowsOf(
      db,
      sql`SELECT authorkt AS AuthorKt, authmast.authorname AS AuthorName FROM praksnAuthorAuthT
          INNER JOIN authmast ON praksnAuthorAuthT.authorkt = authmast.authorcokm
          WHERE prakashannokt = ${bookId} AND praksnauthorkt IN (SELECT praksnauthorkt FROM PraksnAuthorAuthTypeT
            WHERE authortypekt IN (SELECT authtycokm FROM authtype WHERE authortype IN ${types}))`,
    );
  const mul = await bookAuthors(sql`(N'मूळकर्ता', N'टीकाकार')`);
  const anu = await bookAuthors(sql`(N'अनुवादक', N'विवेचक', N'लेखक')`);
  // The Kruti authors of the book's library numbers and of its common group's (v3.4.3.1).
  const commonGrpNo = int(
    await scalar(db, sql`SELECT ISNULL(CommonGrpNo, 0) FROM BookM WHERE BookMastkm = ${bookId}`),
  );
  const kruti = await rowsOf(
    db,
    sql`SELECT DISTINCT krutiautht.authorcokt AS AuthorKt, authmast.authorname AS AuthorName, IsDownLevel
        FROM krutireflibno INNER JOIN krutiMst ON krutireflibno.krutimstkt = krutimstkm
        INNER JOIN krutiautht ON krutiMst.krutimstkm = krutiautht.krutimstkt
        INNER JOIN authmast ON krutiautht.authorcokt = authmast.authorcokm
        WHERE BookTKt IN (SELECT Tid FROM BookT WHERE BookMastkt = ${bookId})
          ${
            commonGrpNo > 0
              ? sql`OR BookTKt IN (SELECT Tid FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm WHERE CommonGrpNo = ${commonGrpNo})`
              : sql``
          }`,
  );
  return {
    fields,
    trans: {
      AuthTran: { rows: authors, extras: [authorNames, authorTypes] },
      BhashaTran: { rows: bhasha },
      LipiTran: { rows: lipi },
      PrakTran: { rows: prak },
      // The Vishay lines are not copied (the desktop's Vishay column comes back blank).
      SubjTran: { rows: subjects, extras: [[]] },
      MulAuthorTran: { rows: mul },
      AnuAuthorTran: { rows: anu },
      KrutiAuthors: { rows: kruti },
    },
  };
}

// ------------------------------------------------------------------------------------------
// The definition
// ------------------------------------------------------------------------------------------

export const anyaBhandar: ScreenDefinition = {
  screen: 'anya-bhandar',
  table: TABLE,
  primaryColumn: PK,
  // No Locked column: the desktop's Ctrl+L / Ctrl+U fail after the password; not offered here.
  lockable: false,
  // insertworkreports after Add and Edit; Delete is not logged.
  workReport: true,
  workReportOn: { delete: false },

  validate: (f) => messages(f),

  save: (trx, user, id, f) => save(trx, user.id, id, f),

  /** btnNew_Click / btnCopy_Click: RecordNo = the size's largest + 1. */
  async newDefaults(db, _user, params) {
    const size = (params?.Size ?? '').trim();
    const next = int(
      await scalar(
        db,
        sql`SELECT ISNULL(MAX(RecordNo), 0) + 1 FROM AnyaBhandarM WHERE Size = ${size}`,
      ),
    );
    return { RecordNo: next };
  },

  /** Delete: the record's Vishay lines and every child table's rows (the desktop left them), then the record. */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM VishayEntry WHERE TransactionName = ${VISHAY_TRANSACTION}
      AND RecordKt IN (SELECT AnyaBhandarSubjectKm FROM AnyaBhandarSubjectT WHERE AnyaBhandarKt = ${id})`.execute(
      trx,
    );
    for (const t of CHILD_TABLES)
      await sql`DELETE FROM ${sql.table(t)} WHERE AnyaBhandarKt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM AnyaBhandarM WHERE AnyaBhandarKm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  trans: {
    // TranName "Author" and its sub-popups "multiauthortype" / "multiauthor".
    AuthTran: { lookups: BOOK_TRANS.AuthTran!.lookups! },
    PrakTran: { lookups: BOOK_TRANS.PrakTran!.lookups! },
    BhashaTran: {
      lookups: {
        bhasa_attr: list(
          sql`SELECT bhashacokm, bhashaname, bhasa_attr FROM bhasmast ORDER BY bhashaname`,
        ),
      },
    },
    LipiTran: {
      lookups: {
        lipi_attr: list(
          sql`SELECT lipicodekm, lipiname, lipi_attr FROM lipimast ORDER BY lipiname`,
        ),
      },
    },
    SubjTran: {
      lookups: {
        ...VISHAY_ENTRY_LOOKUPS,
        entrytype: list(sql`
          SELECT 'MainTitle' AS Id, 'Main Title(New)' AS Name UNION SELECT 'SubTitle' AS Id, 'Sub Title(New)' AS Name
          UNION SELECT 'Old' AS Id, 'Old' AS Name`),
        workdonebyname: list(
          sql`SELECT DISTINCT partyMkm, PName FROM PartyM WHERE Categorykt IN (1577, 1581) ORDER BY PName`,
        ),
      },
    },
    MulAuthorTran: {
      lookups: {
        authorname: list(sql`SELECT authorcokm, authorname FROM authmast ORDER BY authorname`),
      },
    },
    AnuAuthorTran: {
      lookups: {
        authorname: list(sql`SELECT authorcokm, authorname FROM authmast ORDER BY authorname`),
      },
    },
  },

  f2: {
    /** txtBookMastKt: every named book (BookMastkm is the key, so the desktop's DISTINCT changes nothing). */
    bookmastkt: (db) =>
      pickListOf(
        db,
        sql`SELECT BookMastkm, BookName, Part, txtPrakashak AS Prakashak, txtAuthor AS Author,
              samvmast.samvatname AS SamvatType, PSamvat AS Samvat, txtBhasha AS Bhasha, Pages, TotalPages,
              txtBookTran AS LibNo
            FROM BookM LEFT JOIN samvmast ON BookM.PSamvatcokt = samvmast.samvatcokm
            WHERE ISNULL(BookName, '') <> '' ORDER BY BookName`,
      ),
    /** txtBookTKt: every library number. */
    booktkt: (db) =>
      pickListOf(
        db,
        sql`SELECT tid, Libno FROM BookT WHERE ISNULL(Libno, '') <> '' ORDER BY LibNo`,
      ),
  },

  actions: {
    /** F2 on Book Name picked a book: what the form fills from it (`form`), or nothing. */
    async 'fill-from-book'(db, user, _ids, ctx) {
      const filled = await fillFromBook(
        db,
        user,
        intVal(ctx.params.bookId),
        intVal(ctx.params.tranKm),
      );
      return filled ? { kind: 'form', ...filled } : { kind: 'message', message: '' };
    },
    /**
     * F2 on Library No picked a number: its book goes into Book Name. The desktop looked up
     * `BookM WHERE BookMastKm = <BookT.tid>`, an unrelated book; here it is the number's own.
     */
    async 'book-of-libno'(db, _user, _ids, ctx) {
      const rows = await rowsOf(
        db,
        sql`SELECT BookM.BookMastKm, BookM.BookName FROM BookT INNER JOIN BookM ON BookM.BookMastKm = BookT.BookMastkt
            WHERE BookT.tid = ${intVal(ctx.params.tid)}`,
      );
      return { kind: 'cells', rows };
    },
    /** For Selected Record › Book Master: the selected records' books. */
    'book-master': (db, _user, ids) =>
      openInUse(
        db,
        'book-master',
        sql<{ id: number }>`
          SELECT DISTINCT BookMastKm AS id FROM BookM WHERE BookMastKm IN (
            SELECT BookMastKt FROM AnyaBhandarM WHERE AnyaBhandarKm IN ${idList(ids.length ? ids : [0])})`,
        'No Record Found',
      ),
  },
};
