import type { ActionResult, FieldValue, GridValue } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { execLongRunning } from '../../db/long-running.js';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { ident } from '../../db/trusted-sql.js';
import {
  authorDetailReport,
  authorParamparaReport,
  authorReport,
  krutiFromAuthorReport,
} from '../../reports/author.js';
import { normalizeRow, normalizeValue, pickListOf } from '../values.js';
import { netString, prepareWorkReport, signBetween, writeWorkReport } from '../work-report-log.js';
import type { ActionContext, ScreenDefinition, TransDefinition } from './registry.js';

/**
 * Master › Author Master (frmAuthorMaster + AuthMastRepository + the Author popups of
 * frmDisplayTransNew). Table authmast, key authorcokm (identity). See
 * docs/screens/author-master.md for the behaviour this ports and the few deliberate changes.
 */

type Row = Record<string, GridValue>;

const text = (v: unknown) =>
  v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v);
/** VB Val(): the leading number of the text, or 0. */
const val = (v: unknown) => {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const m = String(v ?? '')
    .trim()
    .match(/^[+-]?(\d+\.?\d*|\.\d+)/);
  return m ? Number(m[0]) : 0;
};
/** clsCom.INint: an integer, 0 for blank; bits read 1/0. */
const int = (v: unknown) => Math.trunc(val(v));
const bit = (v: unknown) =>
  v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' ? 1 : 0;

/** DataRow("Column"): DataTable columns are looked up without regard to case. */
function get(row: Row, name: string): GridValue {
  if (name in row) return row[name]!;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(row)) if (k.toLowerCase() === lower) return v;
  return null;
}

/**
 * A popup's rows as the client sent them (`<column>.Rows`, beside the text box's own value), or
 * null when the user never opened that popup.
 */
function grid(f: Record<string, FieldValue>, column: string): Row[] | null {
  const v = f[column.includes('.') ? column : `${column}.Rows`];
  return Array.isArray(v) ? (v as Row[]) : null;
}

/**
 * The next value of a key the application assigns (`select isnull(max(x),0)+1`), locked for
 * the rest of the transaction so two saves cannot take the same one.
 */
async function nextKey(trx: Executor, table: string, column: string): Promise<number> {
  const { rows } = await sql<{ id: number }>`
    SELECT ISNULL(MAX(${ident(column)}), 0) + 1 AS id FROM ${ident(table)} WITH (UPDLOCK, HOLDLOCK)
  `.execute(trx);
  return Number(rows[0]!.id);
}

async function scalar<T = unknown>(
  db: Executor,
  query: RawBuilder<unknown>,
): Promise<T | undefined> {
  const { rows } = await sql<Record<string, unknown>>`${query}`.execute(db);
  const first = rows[0];
  return first ? (Object.values(first)[0] as T) : undefined;
}

async function ids(db: Executor, query: RawBuilder<unknown>): Promise<number[]> {
  const { rows } = await sql<{ id: number | string | null }>`${query}`.execute(db);
  return [...new Set(rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n !== 0))];
}

async function table(
  db: Executor,
  query: RawBuilder<unknown>,
): Promise<{ columns: string[]; rows: GridValue[][] }> {
  const { rows } = await sql<Record<string, unknown>>`${query}`.execute(db);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { columns, rows: rows.map((r) => columns.map((c) => normalizeValue(r[c]))) };
}

/** GetTableKt: the code looks up 'PrakMast', not 'AuthMast' — load-bearing, kept as is. */
async function tableKt(db: Executor): Promise<number> {
  return Number(
    (await scalar(
      db,
      sql`SELECT ISNULL(ColumnMastkm, 0) FROM columnmaster WHERE Vibhag = 'TableNm' AND Name = 'PrakMast'`,
    )) ?? 0,
  );
}

/** VB's CInt(Double): halves round to even. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// -----------------------------------------------------------------------------------------
// Save
// -----------------------------------------------------------------------------------------

/** frmAuthorMaster.SetSamvatDetail's order of preference among the Samvat kinds. */
const SAMVAT_PREFERENCE = [
  'रचना संवत्',
  'विद्यमान् सं.',
  'रचनाकाल',
  'आचार्य.प.',
  'उपाध्याय सं.',
  'पंडित संवत',
  'पंन्यास सं.',
  'गणि संवत',
  'दी.सं.',
  'स्व.सं.',
  'ज.सं.',
  'जी.काळ सं.',
  'प्र.सं.',
];

/**
 * Save() + SetSamvatDetail: the record's samvatkindkt / vksamvat from its Samvat rows — the
 * last IsPrint row; otherwise the first kind in the preferred order; otherwise the first row's
 * kind (keeping the vksamvat found so far).
 */
function samvatOf(rows: Row[], printedFirst: boolean): { kindKt: number; vk: number } {
  let kindKt = 0;
  let vk = 0;
  if (printedFirst) {
    for (const r of rows) {
      if (text(get(r, 'IsPrint')).toLowerCase() === 'true' || get(r, 'IsPrint') === 1) {
        kindKt = int(get(r, 'samvatkindkt'));
        vk = int(get(r, 'vksamvat'));
      }
    }
  }
  if (rows.length === 0) return { kindKt, vk };
  let matched = false;
  for (const name of SAMVAT_PREFERENCE) {
    const hits = rows.filter((r) => text(get(r, 'SamvatKindName')) === name);
    if (hits.length > 0) {
      matched = true;
      for (const r of hits) {
        kindKt = int(get(r, 'SamvatKindKt'));
        vk = int(get(r, 'Vksamvat'));
      }
      break;
    }
  }
  if (!matched) kindKt = int(get(rows[0]!, 'SamvatKindKt'));
  for (const r of rows.filter((x) => bit(get(x, 'IsPrint')) === 1)) {
    kindKt = int(get(r, 'SamvatKindKt'));
    vk = int(get(r, 'Vksamvat'));
  }
  return { kindKt, vk };
}

async function saveAuthor(
  trx: Executor,
  userId: number,
  id: number,
  f: Record<string, FieldValue>,
): Promise<number> {
  // GetValidationMessage's last rule; it runs for a new record too.
  const dup = Number(
    (await scalar(
      trx,
      sql`SELECT COUNT(*) FROM Authmast WHERE authorcokm <> ${id} AND recordno = ${int(f.recordno)}`,
    )) ?? 0,
  );
  if (dup > 0) throw new BadRequestException('RecordNo Already Exists');

  const authorname = text(f.authorname).trim();
  const oldAuthorName =
    id > 0
      ? text(
          await scalar(trx, sql`SELECT authorname FROM authmast WHERE authorcokm = ${id}`),
        ).trim()
      : '';

  // txtAuthorName: authorname + "(" + any names + ")" + "(" + Sign + ")". The any names come
  // from the AnyName popup if it was opened, otherwise from the database, as the desktop
  // loads them just for this.
  const anyRows =
    grid(f, 'AuthMAnyNmTran') ??
    (
      await sql<Row>`SELECT AnyaName FROM AuthMAnyNmT WHERE AuthmastKt = ${id} ORDER BY Seq`.execute(
        trx,
      )
    ).rows;
  let strAny = '';
  for (const r of anyRows)
    if (text(get(r, 'AnyaName')) !== '')
      strAny = signBetween(strAny, text(get(r, 'AnyaName')).trim());
  const signRaw = text(f.Sign);
  const txtAuthorName =
    text(f.authorname).trim() +
    (strAny === '' ? '' : `(${strAny})`) +
    (signRaw === '' ? '' : `(${signRaw})`);

  const samvatGrid = grid(f, 'SamvatTran');
  const samvatRows =
    samvatGrid ??
    (
      await sql<Row>`
        SELECT AuthorSamvatT.SamvatKindKt, ISNULL(colSamvKind.Name, '') AS SamvatKindName, AuthorSamvatT.Vksamvat,
          AuthorSamvatT.IsPrint
        FROM AuthorSamvatT LEFT OUTER JOIN columnmaster AS colSamvKind ON AuthorSamvatT.SamvatKindKt = colSamvKind.ColumnMastkm
        WHERE AuthorSamvatT.Authorkt = ${id} ORDER BY AuthorSamvatT.seq
      `.execute(trx)
    ).rows.map(normalizeRow);
  const samvat = samvatOf(samvatRows, samvatGrid !== null);

  const v = {
    authorname,
    vksamvat: samvat.vk,
    samvatdetail: text(f.samvatdetail).trim(),
    Remark: text(f.Remark).trim(),
    Libno: text(f.Libno).trim(),
    pageno: text(f.pageno).trim(),
    marking: text(f.marking).trim(),
    recordno: int(f.recordno),
    Sampradaykt: int(f.Sampradaykt),
    Identyty: text(f.AuthorIdentityTran).trim(),
    samvatkindkt: samvat.kindKt,
    vibhagkt: int(f.vibhagkt),
    gradekt: int(f.gradekt),
    donebykt: int(f.donebykt),
    finished: text(f.finished).trim(),
    markremark: text(f.markremark).trim(),
    txtParampara: text(f.AuthorParamparaTran).trim(),
    txtAuthorName,
    txtGuru: text(f.AuthorGuruTran).trim(),
    IsGuru: bit(f.IsGuru),
    FinalRemark: text(f.FinalRemark).trim(),
    txtSampraday: text(f.SampradayTran).trim(),
    ReportNo: int(f.ReportNo),
    Sign: signRaw.trim(),
    authorname2: text(f.authorname2).trim(),
    RefSamvatKt: int(f.RefSamvatKt),
    ExtraRemark: text(f.ExtraRemark).trim(),
    AuthorNameRefBookTKt: int(f.AuthorNameRefBookTKt),
    AuthorNameRefPgNo: text(f.AuthorNameRefPgNo),
  };

  // The Address popup: rewritten only when its summary changed (frmAuthorMaster.Save's dtSel
  // check, done by the client, which then sends the rows).
  const addressText = text(f.AddressTran).trim();
  const addressRows = grid(f, 'AddressTran') ?? [];

  if (id > 0) {
    // DeleteTransaction: only the popups the user opened (DataTables with columns).
    const del = async (column: string, statement: RawBuilder<unknown>) => {
      if (grid(f, column)) await sql`${statement}`.execute(trx);
    };
    await del('AuthorParamparaTran', sql`DELETE FROM AuthorParamparaT WHERE Authorkt = ${id}`);
    await del('AuthorVishTran', sql`DELETE FROM AuthorVishT WHERE Authorkt = ${id}`);
    await del('AuthMContactTran', sql`DELETE FROM AuthMContactT WHERE authmastkt = ${id}`);
    await del('AuthMSubTran', sql`DELETE FROM AuthMSubT WHERE authorcokt = ${id}`);
    await del('AuthUnavailKrutiTran', sql`DELETE FROM AuthUnavailKrutiT WHERE authorcokt = ${id}`);
    await del('AuthorNoteTran', sql`DELETE FROM AuthorNoteT WHERE Authorkt = ${id}`);
    await del('AuthorNote2Tran', sql`DELETE FROM AuthorNoteT2 WHERE Authorkt = ${id}`);
    // The popup hides references to books in a "/" cupboard rack; the desktop then deleted them
    // with the rest and never wrote them back. They are kept here.
    await del(
      'AuthorRefLibnoTran',
      sql`DELETE AuthorRefLibno FROM AuthorRefLibno LEFT JOIN BookT ON BookT.tid = AuthorRefLibno.BookTKt
          WHERE AuthorRefLibno.Authorkt = ${id} AND ISNULL(BookT.CupBoardRackNo, '') NOT LIKE '%/%'`,
    );
    if (addressText === '' || addressRows.length > 0) {
      await sql`DELETE FROM PrakMAddT WHERE AuthorcoKt = ${id}`.execute(trx);
    }
    await del('AuthorIdentityTran', sql`DELETE FROM AuthorIdentityT WHERE Authorkt = ${id}`);
    await del('AuthorGuruTran', sql`DELETE FROM AuthorGuruT WHERE Authorkt = ${id}`);
    // v3.4.3.1: AuthorSamvatT is no longer emptied here; its rows are upserted below.
  }

  let authorId = id;
  if (id > 0) {
    await sql`
      UPDATE authmast SET authorname = ${v.authorname}, vksamvat = ${v.vksamvat}, samvatdetail = ${v.samvatdetail},
        Remark = ${v.Remark}, Libno = ${v.Libno}, pageno = ${v.pageno}, marking = ${v.marking}, recordno = ${v.recordno},
        Sampradaykt = ${v.Sampradaykt}, Identyty = ${v.Identyty}, samvatkindkt = ${v.samvatkindkt}, vibhagkt = ${v.vibhagkt},
        gradekt = ${v.gradekt}, donebykt = ${v.donebykt}, finished = ${v.finished}, markremark = ${v.markremark},
        txtParampara = ${v.txtParampara}, moduser = ${userId}, moddate = GETDATE(), txtAuthorName = ${v.txtAuthorName},
        txtGuru = ${v.txtGuru}, IsGuru = ${v.IsGuru}, FinalRemark = ${v.FinalRemark}, txtSampraday = ${v.txtSampraday},
        ReportNo = ${v.ReportNo}, Sign = ${v.Sign}, authorname2 = ${v.authorname2}, RefSamvatKt = ${v.RefSamvatKt},
        ExtraRemark = ${v.ExtraRemark}, AuthorNameRefBookTKt = ${v.AuthorNameRefBookTKt},
        AuthorNameRefPgNo = ${v.AuthorNameRefPgNo}
      WHERE authorcokm = ${id}
    `.execute(trx);
  } else {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO authmast (authorname, vksamvat, samvatdetail, Remark, Libno, pageno, marking, recordno, Sampradaykt,
        Identyty, samvatkindkt, vibhagkt, gradekt, donebykt, finished, markremark, txtParampara, enuser, endate,
        txtAuthorName, txtGuru, IsGuru, FinalRemark, txtSampraday, ReportNo, Sign, authorname2, RefSamvatKt,
        ExtraRemark, AuthorNameRefBookTKt, AuthorNameRefPgNo)
      OUTPUT INSERTED.authorcokm AS id
      VALUES (${v.authorname}, ${v.vksamvat}, ${v.samvatdetail}, ${v.Remark}, ${v.Libno}, ${v.pageno}, ${v.marking},
        ${v.recordno}, ${v.Sampradaykt}, ${v.Identyty}, ${v.samvatkindkt}, ${v.vibhagkt}, ${v.gradekt}, ${v.donebykt},
        ${v.finished}, ${v.markremark}, ${v.txtParampara}, ${userId}, GETDATE(), ${v.txtAuthorName}, ${v.txtGuru},
        ${v.IsGuru}, ${v.FinalRemark}, ${v.txtSampraday}, ${v.ReportNo}, ${v.Sign}, ${v.authorname2}, ${v.RefSamvatKt},
        ${v.ExtraRemark}, ${v.AuthorNameRefBookTKt}, ${v.AuthorNameRefPgNo})
    `.execute(trx);
    authorId = Number(rows[0]!.id);
  }

  const parampara = grid(f, 'AuthorParamparaTran');
  if (parampara && parampara.length > 0) {
    let key = await nextKey(trx, 'AuthorParamparaT', 'AuthorParamparaKm');
    for (const r of parampara) {
      await sql`
        INSERT INTO AuthorParamparaT (AuthorParamparaKm, Authorkt, Gurukt, Guru1kt, Guru1AnyaNmKt, seq, identitykt, sign1kt,
          identity2kt, remark, BookTKt, PageNo, IsPrint)
        VALUES (${key++}, ${authorId}, ${int(get(r, 'Gurukt'))}, ${int(get(r, 'Guru1kt'))}, ${int(get(r, 'Guru1AnyaNmKt'))},
          ${int(get(r, 'seq'))}, ${int(get(r, 'Identitykt'))}, ${int(get(r, 'sign1kt'))}, ${int(get(r, 'Identity2kt'))},
          ${text(get(r, 'remark'))}, ${int(get(r, 'BookTKt'))}, ${text(get(r, 'PageNo'))}, ${bit(get(r, 'IsPrint'))})
      `.execute(trx);
    }
  }

  const vish = grid(f, 'AuthorVishTran');
  if (vish && vish.length > 0) {
    let key = await nextKey(trx, 'AuthorVishT', 'AuthorVishKm');
    for (const r of vish) {
      await sql`
        INSERT INTO AuthorVishT (AuthorVishKm, Authorkt, Vishkt, Remark, BookTKt, RefPgNo, seq)
        VALUES (${key++}, ${authorId}, ${int(get(r, 'Vishkt'))}, ${text(get(r, 'Remark'))}, ${int(get(r, 'BookTKt'))},
          ${text(get(r, 'RefPgNo'))}, ${int(get(r, 'seq'))})
      `.execute(trx);
    }
  }

  await saveAnyNames(trx, authorId, grid(f, 'AuthMAnyNmTran'), grid(f, 'AuthMAnyNmTran.Extra'), {
    main: 'AuthMAnyNmT',
    lib: 'AuthMAnyLibNoT',
    pk: 'AuthAnyaNmKm',
    fk: 'AuthAnyaNmKt',
    libPk: 'AuthMAnyLibNoKm',
  });

  // Renamed and the user said Yes to "Do You Want To Add Entry In AnyaName And Related
  // Transactions?": keep the old name as an any name and point unlinked uses at it.
  if (id > 0 && bit(f.boolAddAnyaName) === 1 && oldAuthorName !== authorname) {
    let anyId = Number(
      (await scalar(
        trx,
        sql`SELECT ISNULL(AuthAnyaNmKm, 0) FROM AuthMAnyNmT WHERE AuthmastKt = ${authorId} AND AnyaName = ${oldAuthorName}`,
      )) ?? 0,
    );
    if (anyId === 0) {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO AuthMAnyNmT (AuthmastKt, AnyaName, Seq) OUTPUT INSERTED.AuthAnyaNmKm AS id VALUES (${authorId}, ${oldAuthorName}, 1)
      `.execute(trx);
      anyId = Number(rows[0]!.id);
    }
    await sql`UPDATE praksnAuthorAuthT SET AuthAnyaNmKt = ${anyId} WHERE authorkt = ${authorId} AND ISNULL(AuthAnyaNmKt, 0) = 0`.execute(
      trx,
    );
    await sql`UPDATE krutiautht SET AuthAnyaNmKt = ${anyId} WHERE authorcokt = ${authorId} AND ISNULL(AuthAnyaNmKt, 0) = 0`.execute(
      trx,
    );
  }

  await saveAnyNames(trx, authorId, grid(f, 'AuthMAnyNm2Tran'), grid(f, 'AuthMAnyNm2Tran.Extra'), {
    main: 'AuthMAnyNmT2',
    lib: 'AuthMAnyLibNoT2',
    pk: 'AuthAnyaNm2Km',
    fk: 'AuthAnyaNm2Kt',
    libPk: 'AuthMAnyLibNo2Km',
  });

  const contact = grid(f, 'AuthMContactTran');
  if (contact && contact.length > 0) {
    let key = await nextKey(trx, 'AuthMContactT', 'authMContactkm');
    for (const r of contact) {
      await sql`
        INSERT INTO AuthMContactT (authMContactkm, authmastkt, authContctTypekt, Authcontactkt, remark, BookTKt, RefPgNo, SthalKt, seq)
        VALUES (${key++}, ${authorId}, ${int(get(r, 'authContctTypekt'))}, ${int(get(r, 'Authcontactkt'))}, ${text(get(r, 'remark'))},
          ${int(get(r, 'BookTKt'))}, ${text(get(r, 'RefPgNo'))}, ${int(get(r, 'SthalKt'))}, ${int(get(r, 'seq'))})
      `.execute(trx);
    }
  }

  const subject = grid(f, 'AuthMSubTran');
  if (subject && subject.length > 0) {
    let key = await nextKey(trx, 'AuthMSubT', 'AuthMsubkm');
    for (const r of subject) {
      await sql`
        INSERT INTO AuthMSubT (AuthMsubkm, authorcokt, subjectkt, authtypekt, remark, seq)
        VALUES (${key++}, ${authorId}, ${int(get(r, 'subjectkt'))}, ${int(get(r, 'authtypekt'))}, ${text(get(r, 'remark'))},
          ${int(get(r, 'seq'))})
      `.execute(trx);
    }
  }

  const unavail = grid(f, 'AuthUnavailKrutiTran');
  if (unavail && unavail.length > 0) {
    let key = await nextKey(trx, 'AuthUnavailKrutiT', 'AuthUnavailKrutiTKm');
    for (const r of unavail) {
      // The desktop writes enuser from a local variable that is never set (always 0); this
      // writes the user who saved, as intended.
      await sql`
        INSERT INTO AuthUnavailKrutiT (AuthUnavailKrutiTKm, authorcokt, krutinm, kruticontent, krutiDetail, RefPlace, vishay,
          uplevelKrutimstkt, krutino, Remark, endate, enuser, seq)
        VALUES (${key++}, ${authorId}, ${text(get(r, 'krutinm'))}, ${text(get(r, 'kruticontent'))}, ${text(get(r, 'krutiDetail'))},
          ${text(get(r, 'RefPlace'))}, ${int(get(r, 'vishay'))}, ${int(get(r, 'uplevelKrutimstkt'))}, ${int(get(r, 'krutino'))},
          ${text(get(r, 'Remark'))}, CONVERT(date, GETDATE()), ${userId}, ${int(get(r, 'seq'))})
      `.execute(trx);
    }
  }

  for (const [column, tableName] of [
    ['AuthorNoteTran', 'AuthorNoteT'],
    ['AuthorNote2Tran', 'AuthorNoteT2'],
  ] as const) {
    for (const r of grid(f, column) ?? []) {
      await sql`
        INSERT INTO ${ident(tableName)} (Authorkt, AuthorColKt, SeriesKt, wordnm, RefplaceKt, pgno, SignColKt, seq, BookTkt)
        VALUES (${authorId}, ${int(get(r, 'AuthorColkt'))}, ${int(get(r, 'Serieskt'))}, ${text(get(r, 'wordnm'))},
          ${int(get(r, 'refplacekt'))}, ${text(get(r, 'pgno'))}, ${int(get(r, 'SignColkt'))}, ${int(get(r, 'seq'))},
          ${int(get(r, 'BookTKt'))})
      `.execute(trx);
    }
  }

  for (const r of grid(f, 'AuthorRefLibnoTran') ?? []) {
    await sql`
      INSERT INTO AuthorRefLibno (Authorkt, bhandarkt, remark, reflibno, refplacekt, refpgno, signkt, seq, ktypeid, lipi, pariman,
        vishash, PatrikaKt, libseq, BookTKt)
      VALUES (${authorId}, ${int(get(r, 'bhandarkt'))}, ${text(get(r, 'remark'))}, ${text(get(r, 'BookTName'))},
        ${int(get(r, 'refplacekt'))}, ${text(get(r, 'refpgno'))}, ${int(get(r, 'signkt'))}, ${int(get(r, 'seq'))},
        ${int(get(r, 'ktypeid'))}, ${text(get(r, 'lipiname'))}, ${text(get(r, 'pariman'))}, ${text(get(r, 'vishash'))},
        ${int(get(r, 'PatrikaKt'))}, ${int(get(r, 'libseq'))}, ${int(get(r, 'BookTKt'))})
    `.execute(trx);
  }

  for (const r of grid(f, 'AuthorIdentityTran') ?? []) {
    await sql`
      INSERT INTO AuthorIdentityT (Authorkt, Identitykt, BookTKt, RefPgNo, IsPrint, seq)
      VALUES (${authorId}, ${int(get(r, 'IdentityKt'))}, ${int(get(r, 'BookTKt'))}, ${text(get(r, 'RefPgNo'))},
        ${bit(get(r, 'IsPrint'))}, ${int(get(r, 'seq'))})
    `.execute(trx);
  }

  for (const r of grid(f, 'AuthorGuruTran') ?? []) {
    await sql`
      INSERT INTO AuthorGuruT (Authorkt, GuruKt, IsPrint, seq)
      VALUES (${authorId}, ${int(get(r, 'GuruKt'))}, ${bit(get(r, 'IsPrint'))}, ${int(get(r, 'seq'))})
    `.execute(trx);
  }

  // v3.4.3.1: Samvat rows are upserted by AuthorSamvatKm and the rest pruned, so the keys that
  // authmast.RefSamvatKt stores (of this author or another) survive a save.
  if (samvatGrid) {
    // A key that is not one of this author's rows is a new row (the desktop would UPDATE
    // whichever row has that key, another author's included).
    const { rows: own } = await sql<{ id: number }>`
      SELECT AuthorSamvatKm AS id FROM AuthorSamvatT WHERE AuthorKt = ${authorId}`.execute(trx);
    const mine = new Set(own.map((o) => Number(o.id)));
    const keep: number[] = [0];
    for (const r of samvatGrid) {
      const key = int(get(r, 'AuthorSamvatKm'));
      if (mine.has(key)) {
        await sql`
          UPDATE AuthorSamvatT SET SamvatKindKt = ${int(get(r, 'SamvatKindKt'))}, Remark = ${text(get(r, 'Remark'))},
            AsamvatKt = ${int(get(r, 'AsamvatKt'))}, Asamvat = ${text(get(r, 'Asamvat'))},
            Vksamvat = ${int(get(r, 'Vksamvat'))}, BookTKt = ${int(get(r, 'BookTKt'))},
            PageNo = ${text(get(r, 'PageNo'))}, SthalKt = ${int(get(r, 'SthalKt'))}, Seq = ${int(get(r, 'seq'))},
            IsPrint = ${bit(get(r, 'IsPrint'))}
          WHERE AuthorSamvatKm = ${key}
        `.execute(trx);
        keep.push(key);
      } else {
        const { rows: out } = await sql<{ id: number }>`
          INSERT INTO AuthorSamvatT (AuthorKt, SamvatKindKt, Remark, AsamvatKt, Asamvat, Vksamvat, BookTKt, PageNo, SthalKt, IsPrint, seq)
          OUTPUT INSERTED.AuthorSamvatKm AS id
          VALUES (${authorId}, ${int(get(r, 'SamvatKindKt'))}, ${text(get(r, 'Remark'))}, ${int(get(r, 'AsamvatKt'))},
            ${text(get(r, 'Asamvat'))}, ${int(get(r, 'Vksamvat'))}, ${int(get(r, 'BookTKt'))}, ${text(get(r, 'PageNo'))},
            ${int(get(r, 'SthalKt'))}, ${bit(get(r, 'IsPrint'))}, ${int(get(r, 'seq'))})
        `.execute(trx);
        keep.push(Number(out[0]!.id));
      }
    }
    // Deliberate difference: the desktop clears *this* author's RefSamvatKt whenever any of its
    // samvat rows is removed (even when the referenced row stays) and leaves other authors
    // pointing at a removed row. Here every reference to a row being removed is cleared, of any
    // author, and nothing else.
    await sql`
      UPDATE authmast SET RefSamvatKt = NULL
      WHERE RefSamvatKt IN (SELECT AuthorSamvatKm FROM AuthorSamvatT
                            WHERE AuthorKt = ${authorId} AND AuthorSamvatKm NOT IN ${idList(keep)})
    `.execute(trx);
    await sql`
      DELETE FROM AuthorSamvatT WHERE AuthorKt = ${authorId} AND AuthorSamvatKm NOT IN ${idList(keep)}
    `.execute(trx);
  }

  // Upsert by id and prune: rows with id 0 are new, the rest are updated in place, and rows
  // no longer in the popup are deleted.
  await upsert(
    trx,
    authorId,
    grid(f, 'SampradayTran'),
    'AuthorSampradayT',
    'AuthorSampradayKm',
    async (r) => ({
      insert: sql`
      INSERT INTO AuthorSampradayT (AuthorKt, SampradayKt, RefPlaceKt, UpLevelKt, Remark, BookTKt, RefPgNo, IsPrint, IsPrintAuthor, Seq)
      OUTPUT INSERTED.AuthorSampradayKm AS id
      VALUES (${authorId}, ${int(get(r, 'SampradayKt'))}, ${int(get(r, 'RefPlaceKt'))}, ${int(get(r, 'UpLevelKt'))},
        ${text(get(r, 'Remark'))}, ${int(get(r, 'BookTKt'))}, ${text(get(r, 'RefPgNo'))}, ${bit(get(r, 'IsPrint'))},
        ${bit(get(r, 'IsPrintAuthor'))}, ${int(get(r, 'seq'))})`,
      update: sql`
      UPDATE AuthorSampradayT SET SampradayKt = ${int(get(r, 'SampradayKt'))}, RefPlaceKt = ${int(get(r, 'RefPlaceKt'))},
        UpLevelKt = ${int(get(r, 'UpLevelKt'))}, Remark = ${text(get(r, 'Remark'))}, BookTKt = ${int(get(r, 'BookTKt'))},
        RefPgNo = ${text(get(r, 'RefPgNo'))}, IsPrint = ${bit(get(r, 'IsPrint'))}, IsPrintAuthor = ${bit(get(r, 'IsPrintAuthor'))},
        Seq = ${int(get(r, 'Seq'))}
      WHERE AuthorSampradayKm = ${int(get(r, 'AuthorSampradayKm'))}`,
    }),
  );
  await upsert(
    trx,
    authorId,
    grid(f, 'AnyaYogdanTran'),
    'AuthorAnyaYogdanT',
    'AuthorAnyaYogdanKm',
    async (r) => ({
      insert: sql`
      INSERT INTO AuthorAnyaYogdanT (AuthorKt, AnyaYogdan, BookTKt, RefPgNo, Seq) OUTPUT INSERTED.AuthorAnyaYogdanKm AS id
      VALUES (${authorId}, ${text(get(r, 'AnyaYogdan'))}, ${int(get(r, 'BookTKt'))}, ${text(get(r, 'RefPgNo'))}, ${int(get(r, 'seq'))})`,
      update: sql`
      UPDATE AuthorAnyaYogdanT SET AnyaYogdan = ${text(get(r, 'AnyaYogdan'))}, BookTKt = ${int(get(r, 'BookTKt'))},
        RefPgNo = ${text(get(r, 'RefPgNo'))}, Seq = ${int(get(r, 'Seq'))}
      WHERE AuthorAnyaYogdanKm = ${int(get(r, 'AuthorAnyaYogdanKm'))}`,
    }),
  );
  await upsert(
    trx,
    authorId,
    grid(f, 'ParyayTran'),
    'AuthorParyayT',
    'AuthorParyayKm',
    async (r) => ({
      insert: sql`
      INSERT INTO AuthorParyayT (AuthorKt, Paryay, BookTKt, RefPgNo, Seq) OUTPUT INSERTED.AuthorParyayKm AS id
      VALUES (${authorId}, ${text(get(r, 'Paryay'))}, ${int(get(r, 'BookTKt'))}, ${text(get(r, 'RefPgNo'))}, ${int(get(r, 'seq'))})`,
      update: sql`
      UPDATE AuthorParyayT SET Paryay = ${text(get(r, 'Paryay'))}, BookTKt = ${int(get(r, 'BookTKt'))},
        RefPgNo = ${text(get(r, 'RefPgNo'))}, Seq = ${int(get(r, 'Seq'))}
      WHERE AuthorParyayKm = ${int(get(r, 'AuthorParyayKm'))}`,
    }),
  );
  await upsert(
    trx,
    authorId,
    grid(f, 'AuthorPattavaliTran'),
    'AuthorPattavaliT',
    'AuthorPattavaliKm',
    async (r) => ({
      insert: sql`
      INSERT INTO AuthorPattavaliT (Authorkt, PattavaliKt, PattavaliSeq, BookTKt, PageNo, Remark, UplevelKt, seq)
      OUTPUT INSERTED.AuthorPattavaliKm AS id
      VALUES (${authorId}, ${int(get(r, 'PattavaliKt'))}, ${text(get(r, 'PattavaliSeq'))}, ${int(get(r, 'BookTKt'))},
        ${text(get(r, 'PageNo'))}, ${text(get(r, 'Remark'))}, ${int(get(r, 'UplevelKt'))}, ${int(get(r, 'seq'))})`,
      update: sql`
      UPDATE AuthorPattavaliT SET PattavaliKt = ${int(get(r, 'PattavaliKt'))}, PattavaliSeq = ${text(get(r, 'PattavaliSeq'))},
        BookTKt = ${int(get(r, 'BookTKt'))}, PageNo = ${text(get(r, 'PageNo'))}, Remark = ${text(get(r, 'Remark'))},
        UplevelKt = ${int(get(r, 'UplevelKt'))}, Seq = ${int(get(r, 'Seq'))}
      WHERE AuthorPattavaliKm = ${int(get(r, 'AuthorPattavaliKm'))}`,
    }),
  );

  // PrakMastRepository.SavePrakMAddT.
  for (const r of addressRows) {
    await sql`
      INSERT INTO PrakMAddT (PrakMastKt, PartyMKt, Magazinekt, AuthorCoKt, PrakashakName, address, citykt, StateKt, pincode, phoneno,
        email, remark, category, seq, Pname, MobName, MobileNo)
      VALUES (0, 0, 0, ${authorId}, ${text(get(r, 'PrakashakName'))}, ${text(get(r, 'address')).trim()}, ${int(get(r, 'citykt'))},
        ${int(get(r, 'statekt'))}, ${text(get(r, 'pincode'))}, ${text(get(r, 'phoneno')).trim()}, ${text(get(r, 'email')).trim()},
        ${text(get(r, 'remark')).trim()}, ${int(get(r, 'category'))}, ${int(get(r, 'seq'))}, ${text(get(r, 'Pname')).trim()},
        ${text(get(r, 'MobName')).trim()}, ${text(get(r, 'MobileNo')).trim()})
    `.execute(trx);
  }

  // Every author who has this one as a guru gets their txtGuru rebuilt.
  const { rows: pupils } = await sql<{ AuthorKt: number }>`
    SELECT DISTINCT AuthorKt FROM AuthorGuruT WHERE GuruKt = ${id}
  `.execute(trx);
  for (const p of pupils) {
    const txGuru = text(
      await scalar(
        trx,
        sql`SELECT ISNULL(STUFF((SELECT ',' + authmast.authorname FROM AuthorGuruT INNER JOIN authmast ON AuthorGuruT.GuruKt = authmast.authorcokm
            WHERE AuthorGuruT.AuthorKt = ${p.AuthorKt} FOR XML PATH('')), 1, 1, ''), '')`,
      ),
    );
    if (txGuru !== '')
      await sql`UPDATE authmast SET txtGuru = ${txGuru} WHERE authorcokm = ${p.AuthorKt}`.execute(
        trx,
      );
  }

  // Each Kruti whose first author this is gets its AuthSamvat brought up to date.
  if (id > 0) {
    await sql`
      UPDATE krutimst SET krutiMst.AuthSamvat = tblAut.vksamvat
      FROM krutimst OUTER APPLY (SELECT TOP (1) krutimstkt, krutiautht.authorcokt, authmast.vksamvat FROM krutiautht
        INNER JOIN authmast ON krutiautht.authorcokt = authmast.authorcokm WHERE krutiautht.krutimstkt = krutiMst.krutimstkm
        ORDER BY krutiautht.krutauthkm) AS tblAut
      WHERE ISNULL(Rsamvatvir, 0) = 0 AND AuthSamvat > 0 AND krutiMst.AuthSamvat <> tblAut.vksamvat AND tblAut.authorcokt = ${id}
    `.execute(trx);
  }

  return authorId;
}

/** AuthMAnyNmT(2) + AuthMAnyLibNoT(2): both upserted by id and pruned, linked by the any name's id. */
async function saveAnyNames(
  trx: Executor,
  authorId: number,
  names: Row[] | null,
  libs: Row[] | null,
  t: { main: string; lib: string; pk: string; fk: string; libPk: string },
) {
  if (!names) return;
  const keepNames: number[] = [];
  const keepLibs: number[] = [];
  for (const r of names) {
    const oldId = int(get(r, t.pk));
    let rowId = oldId;
    if (oldId <= 0) {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO ${ident(t.main)} (AuthmastKt, AnyaName, Avasthakt, RefPgNo, IsPrint, Seq) OUTPUT INSERTED.${ident(t.pk)} AS id
        VALUES (${authorId}, ${text(get(r, 'AnyaName'))}, ${int(get(r, 'Avasthakt'))}, ${text(get(r, 'RefPgNo'))},
          ${bit(get(r, 'IsPrint'))}, ${int(get(r, 'seq'))})
      `.execute(trx);
      rowId = Number(rows[0]!.id);
    } else {
      await sql`
        UPDATE ${ident(t.main)} SET AnyaName = ${text(get(r, 'AnyaName'))}, Avasthakt = ${int(get(r, 'Avasthakt'))},
          RefPgNo = ${text(get(r, 'RefPgNo'))}, IsPrint = ${bit(get(r, 'IsPrint'))}, Seq = ${int(get(r, 'Seq'))}
        WHERE ${ident(t.pk)} = ${oldId}
      `.execute(trx);
    }
    keepNames.push(rowId);
    for (const l of (libs ?? []).filter((x) => int(get(x, t.fk)) === oldId)) {
      const libId = int(get(l, t.libPk));
      if (libId <= 0) {
        const { rows } = await sql<{ id: number }>`
          INSERT INTO ${ident(t.lib)} (${ident(t.fk)}, AuthorKt, BookTKt, Seq) OUTPUT INSERTED.${ident(t.libPk)} AS id
          VALUES (${rowId}, ${authorId}, ${int(get(l, 'BookTKt'))}, ${int(get(l, 'Seq'))})
        `.execute(trx);
        keepLibs.push(Number(rows[0]!.id));
      } else {
        await sql`
          UPDATE ${ident(t.lib)} SET BookTKt = ${int(get(l, 'BookTKt'))}, Seq = ${int(get(l, 'Seq'))} WHERE ${ident(t.libPk)} = ${libId}
        `.execute(trx);
        keepLibs.push(libId);
      }
    }
  }
  await sql`
    DELETE FROM ${ident(t.lib)} WHERE Authorkt = ${authorId} AND ${ident(t.libPk)} NOT IN ${idList([0, ...keepLibs])}
  `.execute(trx);
  await sql`
    DELETE FROM ${ident(t.main)} WHERE AuthmastKt = ${authorId} AND ${ident(t.pk)} NOT IN ${idList([0, ...keepNames])}
  `.execute(trx);
}

async function upsert(
  trx: Executor,
  authorId: number,
  rows: Row[] | null,
  tableName: string,
  pk: string,
  statements: (r: Row) => Promise<{ insert: RawBuilder<unknown>; update: RawBuilder<unknown> }>,
) {
  if (!rows) return;
  const keep: number[] = [0];
  for (const r of rows) {
    const { insert, update } = await statements(r);
    if (int(get(r, pk)) === 0) {
      const { rows: out } = await sql<{ id: number }>`${insert}`.execute(trx);
      keep.push(Number(out[0]!.id));
    } else {
      await sql`${update}`.execute(trx);
      keep.push(int(get(r, pk)));
    }
  }
  await sql`DELETE FROM ${ident(tableName)} WHERE AuthorKt = ${authorId} AND ${ident(pk)} NOT IN ${idList(keep)}`.execute(
    trx,
  );
}

// -----------------------------------------------------------------------------------------
// The popups' cell lists (frmDisplayTransNew.SetForm_Author, s = 0)
// -----------------------------------------------------------------------------------------

const list = (query: RawBuilder<unknown>) => (db: Executor) => pickListOf(db, query);

/**
 * frmDisplayTransNew's Address popup (TranName "Address", FormName "Common", SetForm_Common): the
 * PrakMAddT rows of an author, a party, a prakashak or a magazine.
 */
export const ADDRESS_TRANS: TransDefinition = {
  lookups: {
    prakashakname: list(sql`
      SELECT DISTINCT prakname AS Id, prakname AS Name FROM prakmast
      UNION ALL SELECT DISTINCT AnyaNm AS Id, AnyaNm AS Name FROM PrakMAnayNmT ORDER BY Name`),
    city: list(sql`SELECT Tid, Vishesh FROM visheshMast WHERE Remark = 'city' ORDER BY Vishesh`),
    state: list(
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'State' ORDER BY Name`,
    ),
    categoryname: list(
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'PrakMCat' ORDER BY Name`,
    ),
  },
};
const LIBNO = list(sql`SELECT Tid, LibNo FROM BookT WHERE ISNULL(LibNo, '') <> '' ORDER BY LibNo`);
const CITY = list(
  sql`SELECT Tid, Vishesh FROM visheshMast WHERE remark = 'city' AND ISNULL(vishesh, '') <> '' ORDER BY Vishesh`,
);
const AUTHORS = list(sql`
  SELECT authorcokm, txtAuthorName AS Author, Identyty, txtGuru AS Guru, Sampraday.SampradayName AS Sampraday,
    txtParampara AS Parampara
  FROM authmast LEFT JOIN Sampraday ON authmast.Sampradaykt = Sampraday.SampradayKm ORDER BY txtAuthorName`);
const REFPLACE = list(
  sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'RefPlace' ORDER BY Name`,
);
const AVASTHA = list(
  sql`SELECT TId, Vishesh FROM VisheshMast WHERE Remark = 'Avastha' ORDER BY Vishesh`,
);

const ANY_NAME: TransDefinition = { lookups: { avastha: AVASTHA, multilibno: LIBNO } };

const TRANS: Record<string, TransDefinition> = {
  // txtauthorname's own popup (TranName "AuthorName"): rows live in the form, only its list is here.
  AuthorName: {
    lookups: {
      libno: list(
        sql`SELECT DISTINCT tid, LibNo FROM BookT WHERE ISNULL(LibNo, '') <> '' ORDER BY LibNo`,
      ),
    },
  },
  KrutiTran: {},
  AuthMAnyNmTran: ANY_NAME,
  AuthMAnyNm2Tran: ANY_NAME,
  AuthorParamparaTran: {
    lookups: {
      sign1: list(
        sql`SELECT ColumnMastkm, Name FROM ColumnMaster WHERE Vibhag = 'Sign' ORDER BY Name`,
      ),
      identyty2: list(
        sql`SELECT ColumnMastkm, Name FROM ColumnMaster WHERE Vibhag = 'AuthIdentity' AND Remark = 'Parampara' ORDER BY Name`,
      ),
      identyty: list(
        sql`SELECT ColumnMastkm, Name FROM ColumnMaster WHERE Vibhag = 'AuthIdentity' ORDER BY Name`,
      ),
      guru: list(sql`SELECT TId, Vishesh FROM VisheshMast WHERE Remark = 'Guru' ORDER BY Vishesh`),
      guru1: list(sql`
        SELECT authorcokm, txtAuthorName AS Author, Identyty, txtGuru AS Guru, Sampraday.SampradayName AS Sampraday,
          authmast.txtSampraday AS SampradayTran, txtParampara AS Parampara
        FROM authmast LEFT JOIN Sampraday ON authmast.Sampradaykt = Sampraday.SampradayKm ORDER BY txtAuthorName`),
      guru1anyaname: (db, row) => {
        const guru = int(get(row, 'Guru1Kt'));
        return pickListOf(
          db,
          sql`
          SELECT REPLACE(0, 0, 0) AS id, authorname AS AnyaName FROM authmast WHERE authorcokm = ${guru}
          UNION SELECT AuthAnyaNmKm AS ID, AnyaName FROM AuthMAnyNmT WHERE AuthmastKt = ${guru}`,
        );
      },
      libno: LIBNO,
    },
  },
  AuthorVishTran: {
    lookups: {
      visheshan: list(
        sql`SELECT TId, Vishesh FROM VisheshMast WHERE Remark = 'Visheshan' ORDER BY Vishesh`,
      ),
      libno: LIBNO,
    },
  },
  AuthMSubTran: {
    lookups: {
      subject: list(
        sql`SELECT ColumnMastkm, Name, Brief FROM ColumnMaster WHERE Vibhag = 'AuthSubject' ORDER BY Name`,
      ),
      authortype: list(sql`SELECT authtycokm, authortype FROM authtype ORDER BY authortype`),
    },
  },
  AuthMContactTran: {
    lookups: {
      authcontacttype: list(
        sql`SELECT TId, Vishesh FROM VisheshMast WHERE Remark = 'conttype' ORDER BY Vishesh`,
      ),
      authorcontact: async (db, row) => {
        const type = int(get(row, 'authContctTypekt'));
        const n = Number(
          (await scalar(
            db,
            sql`SELECT COUNT(Tid) FROM VisheshMast WHERE Remark = 'contactnm' AND UpLevelKt = ${type}`,
          )) ?? 0,
        );
        return n > 0
          ? pickListOf(
              db,
              sql`SELECT TId, Vishesh FROM VisheshMast WHERE Remark = 'contactnm' AND UpLevelKt = ${type} ORDER BY Vishesh`,
            )
          : pickListOf(
              db,
              sql`SELECT TId, Vishesh FROM VisheshMast WHERE Remark = 'contactnm' ORDER BY Vishesh`,
            );
      },
      libno: LIBNO,
      sthalname: list(
        sql`SELECT Tid, Vishesh FROM visheshMast WHERE remark = 'City' AND ISNULL(Vishesh, '') <> '' ORDER BY Vishesh`,
      ),
    },
  },
  AuthUnavailKrutiTran: {
    lookups: {
      vishay_nm: list(sql`SELECT vishaycokm, vishay_nm FROM vishay ORDER BY vishay_nm`),
      // Each Kruti with its any names after its name, and its authors (both comma-ended).
      upleval: list(sql`
        SELECT krutiMst.krutimstkm,
          ISNULL(krutiMst.extranm, krutiMst.krutiname) + ' ' + ISNULL((SELECT krutinmt.anyaname + ',' FROM krutinmt
            WHERE krutinmt.krutimstkt = krutiMst.krutimstkm ORDER BY krutinmt.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), '') AS krutiname,
          krutiMst.KrutiNo,
          ISNULL((SELECT authmast.authorname + ',' FROM krutiauthT INNER JOIN authmast ON krutiauthT.authorcokt = authmast.authorcokm
            WHERE krutiauthT.krutimstkt = krutiMst.krutimstkm ORDER BY krutiauthT.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), '') AS author
        FROM krutiMst ORDER BY krutiMst.Krutino`),
    },
    defaults: async (db) => ({
      krutino: Number(
        (await scalar(db, sql`SELECT ISNULL(MAX(krutino), 0) + 1 FROM AuthUnavailKrutiT`)) ?? 1,
      ),
    }),
  },
  AuthorNoteTran: noteLookups('AuthorNoteT'),
  AuthorNote2Tran: noteLookups('AuthorNoteT'),
  AuthorRefLibnoTran: {
    lookups: {
      bhandarname: list(
        sql`SELECT partyMkm, PName, shortnm, txtAddress FROM PartyM WHERE Categorykt = 14132 ORDER BY PName`,
      ),
      booktname: list(sql`
        SELECT Tid AS Id, libno, LTRIM(RTRIM(BookM.bookname + ' ' + ISNULL(BookM.Part, ''))) AS bookname
        FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm ORDER BY libno`),
      refplacename: REFPLACE,
      signname: list(
        sql`SELECT ColumnMastkm, Name, ISNULL(Brief, '') AS brief FROM columnmaster WHERE vibhag = 'Sign' ORDER BY Name`,
      ),
      typename: list(
        sql`SELECT ColumnMastkm, Name, Brief, Remark, HindiWord FROM columnmaster WHERE vibhag = 'krutireftype' ORDER BY ColumnMastkm`,
      ),
      lipiname: list(sql`SELECT lipicodekm, lipiname, lipi_attr FROM lipimast ORDER BY lipiname`),
      patrikano: list(sql`SELECT PatrikaKm, RecordNo AS PatrikaNo FROM Patrika ORDER BY PatrikaNo`),
    },
  },
  AuthorIdentityTran: {
    lookups: {
      identityname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'AuthIdentity' AND ISNULL(Name, '') <> '' ORDER BY Name`,
      ),
      libno: LIBNO,
    },
  },
  AuthorPattavaliTran: {
    lookups: {
      pattavaliname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'AuthPattavali' AND ISNULL(Name, '') <> '' ORDER BY Name`,
      ),
      libno: LIBNO,
      uplevelname: (db, row) =>
        pickListOf(
          db,
          sql`
          SELECT AuthorPattavaliKm, ${text(get(row, 'PattavaliName'))} + CASE WHEN ISNULL(PattavaliSeq, 0) > 0
            THEN CAST(PattavaliSeq AS varchar(5)) ELSE '' END + '-' + authmast.authorname AS Pattavali
          FROM AuthorPattavaliT INNER JOIN authmast ON AuthorPattavaliT.AuthorKt = authmast.authorcokm
          WHERE PattavaliKt = ${int(get(row, 'PattavaliKt'))} AND PattavaliSeq = ${val(get(row, 'PattavaliSeq')) - 1}`,
        ),
    },
  },
  AnyaYogdanTran: {
    lookups: {
      anyayogdan: list(sql`SELECT DISTINCT AnyaYogdan FROM AuthorAnyaYogdanT ORDER BY AnyaYogdan`),
      libno: LIBNO,
    },
  },
  ParyayTran: {
    lookups: {
      paryay: list(sql`SELECT DISTINCT paryay FROM AuthorParyayT ORDER BY Paryay`),
      libno: LIBNO,
    },
  },
  AuthorGuruTran: { lookups: { guruname: AUTHORS } },
  SamvatTran: {
    lookups: {
      samvatkindname: list(sql`
        SELECT ColumnMastkm, Name, ISNULL(Brief, N'') AS Brief, ISNULL(Remark, N'') AS Remark FROM columnmaster
        WHERE Vibhag = 'AuthSamKind' ORDER BY Name`),
      asamvatname: list(sql`SELECT Samvatcokm, Samvatname FROM Samvmast ORDER BY SAMVATCOKM DESC`),
      asamvat: list(sql`SELECT sadivalue, sadinm FROM sadimst ORDER BY sadinm`),
      // CellEndEdit: a sadi typed by name counts as its sadivalue.
      sadivalue: (db, row) =>
        pickListOf(
          db,
          sql`SELECT ISNULL(sadivalue, 0) AS sadivalue FROM sadimst WHERE sadinm = ${text(get(row, 'Asamvat'))}`,
        ),
      libno: LIBNO,
      sthalname: CITY,
    },
  },
  SampradayTran: {
    lookups: {
      sampradayname: list(
        sql`SELECT SampradayKm, SampradayName FROM Sampraday WHERE ISNULL(SampradayName, '') <> '' ORDER BY SampradayName`,
      ),
      refplacename: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'RefPlace' AND ISNULL(name, '') <> '' ORDER BY Name`,
      ),
      uplevelname: list(
        sql`SELECT SampradayKm, SampradayName FROM Sampraday WHERE ISNULL(SampradayName, '') <> '' ORDER BY SampradayName`,
      ),
      libno: list(sql`SELECT Tid, LibNo FROM BookT WHERE ISNULL(LibNo, '') <> '' ORDER BY LibNo`),
      remark: list(
        sql`SELECT DISTINCT Remark FROM AuthorSampradayT WHERE ISNULL(Remark, '') <> '' ORDER BY Remark`,
      ),
    },
  },
  // TranName "Address" (FormName "Common").
  AddressTran: ADDRESS_TRANS,
};

/** The Note popups share one set of lists; the word list reads AuthorNoteT for both, as the desktop does. */
function noteLookups(wordTable: string): TransDefinition {
  return {
    lookups: {
      authorcolname: list(sql`
        SELECT ColumnMastkm, ColumnNo, CASE WHEN ISNULL(HindiWord, '') <> '' THEN HindiWord ELSE Name END AS Name
        FROM columnmaster WHERE Vibhag = 'KrutiCol' ORDER BY ColumnNo`),
      seriesname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'Alpha' ORDER BY Name`,
      ),
      wordnm: list(sql`SELECT wordnm FROM ${ident(wordTable)} GROUP BY wordnm`),
      booktname: list(sql`
        SELECT Tid AS Id, libno, bookname FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm
        WHERE ISNULL(libno, '') <> '' ORDER BY libno`),
      refplacename: REFPLACE,
      signcolname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'Sign' ORDER BY Name`,
      ),
    },
  };
}

// -----------------------------------------------------------------------------------------
// The right-click menu (cmsSamv)
// -----------------------------------------------------------------------------------------

const toIdsSql = (list: number[]) => idList(list.length ? list : [0]);
const numberParam = (ctx: ActionContext, name: string) => int(ctx.params[name]);
const idsParam = (ctx: ActionContext, name: string): number[] => {
  const v = ctx.params[name];
  return Array.isArray(v) ? v : [];
};

/** A stored procedure's own error, which the desktop shows as it is (MsgBox(ex.Message)). */
async function runProc(statement: () => Promise<unknown>): Promise<void> {
  try {
    await statement();
  } catch (err) {
    const e = err as { number?: number; message?: string };
    if (typeof e.number === 'number' && e.message) throw new BadRequestException(e.message);
    throw err;
  }
}

async function openWhere(
  db: Executor,
  screen: string,
  query: RawBuilder<unknown>,
  emptyMessage: string,
): Promise<ActionResult> {
  return { kind: 'open', screen, ids: await ids(db, query), emptyMessage };
}

/** LockUnlockTransaction: Locked plus moduser/moddate, one Lock work report entry per change. */
async function lockRecords(
  db: Executor,
  userId: number,
  selected: number[],
  lock: boolean,
): Promise<string> {
  let count = 0;
  for (const id of selected) {
    const old = text(
      await scalar(
        db,
        sql`SELECT CASE WHEN ISNULL(Locked, 0) = 1 THEN 'True' ELSE 'False' END FROM authmast WHERE authorcokm = ${id}`,
      ),
    );
    const now = lock ? 'True' : 'False';
    if (old === now) continue;
    await sql`UPDATE authmast SET Locked = ${lock ? 1 : 0}, moduser = ${userId}, moddate = GETDATE() WHERE authorcokm = ${id}`.execute(
      db,
    );
    const prepared = await prepareWorkReport(
      db,
      'authmast',
      'authorcokm',
      id,
      userId,
      { Locked: old },
      { Locked: now },
      'Lock',
    );
    if (prepared?.kind === 'write') {
      await writeWorkReport(
        db,
        'authmast',
        'authorcokm',
        id,
        userId,
        prepared.remark,
        prepared.workTypeId,
        prepared.mistake,
        prepared.mistakeCount,
        prepared.workTypeName,
      );
    }
    count++;
  }
  if (count === 0) return '';
  return lock
    ? `(${count} ) Records Locked Successfully`
    : `(${count} ) Records UnLocked Successfully`;
}

/** frmAuthorMaster.PrintBooksForSelectedAuthor: the authors' books, one per similar title. */
async function booksForAuthors(db: Executor, authorIds: number[]): Promise<ActionResult> {
  const { rows: tids } = await sql<{ Tid: number }>`
    SELECT bkname.Tid FROM entrdates, bkname AS bkname, entrmast, AUTHTRAN
    WHERE bkname.tid = entrdates.tid AND AUTHTRAN.ENTRCODEKT = bkname.tid AND entrmast.tid = bkname.tid
    GROUP BY bkname.Tid, bkname.Bookname, bkname.libno, bkname.Peta_Ank, BKGRNO, bkname.petatype, Duplicate,
      AUTHTRAN.AUTHORCOKT, entrdates.GenGroup
    HAVING AUTHTRAN.AUTHORCOKT IN ${toIdsSql(authorIds)} ORDER BY AUTHTRAN.AUTHORCOKT
  `.execute(db);
  if (tids.length === 0) return { kind: 'message', message: 'No Record Found ' };
  const { rows: books } = await sql<{ Tid: number; Bookname: string | null }>`
    SELECT bkname.Tid, bkname.Bookname, bkname.libno, bkname.Peta_Ank FROM entrdates, bkname AS bkname
    WHERE bkname.tid = entrdates.tid AND bkname.tid IN ${toIdsSql(tids.map((t) => Number(t.Tid)))}
  `.execute(db);
  // Keep a book unless an earlier one starts the same (its first third, the shorter's length).
  const keep: number[] = [];
  const third = (s: string) => roundHalfEven(s.length / 3);
  for (let i = 0; i < books.length; i++) {
    const name = text(books[i]!.Bookname);
    const prefix = name.slice(0, third(name));
    let duplicate = false;
    for (let j = 0; j < i; j++) {
      const other = text(books[j]!.Bookname);
      const otherPrefix = other.slice(0, third(other));
      if (
        name.length >= other.length
          ? otherPrefix === prefix.slice(0, otherPrefix.length)
          : prefix === otherPrefix.slice(0, prefix.length)
      ) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) keep.push(Number(books[i]!.Tid));
  }
  const result = await table(
    db,
    sql`
    SELECT authmast.authorname, bkname.bookname, bkname.libno, ' ' + bkname.peta_ank AS peta_ank, pages, recordno
    FROM AUTHTRAN INNER JOIN authmast ON AUTHTRAN.AUTHORCOKT = authmast.authorcokm
    INNER JOIN entrmast INNER JOIN BKname AS bkname ON entrmast.tid = bkname.tid ON AUTHTRAN.ENTRCODEKT = bkname.tid
    WHERE bkname.duplicate <> 'D' AND bkname.tid IN ${toIdsSql(keep)} AND AUTHTRAN.AUTHORCOKT IN ${toIdsSql(authorIds)}
    ORDER BY authmast.authorname`,
  );
  let last = '';
  const iName = result.columns.indexOf('authorname');
  const iPeta = result.columns.indexOf('peta_ank');
  const iPages = result.columns.indexOf('pages');
  for (const r of result.rows) {
    if (text(r[iName]) === last) r[iName] = '';
    else last = text(r[iName]);
    if (!text(r[iPeta]).includes('/')) r[iPages] = '';
  }
  return { kind: 'table', title: 'Search Books For Selected Author', ...result };
}

/** MdlLib.repSpace: the spacing clean-up the desktop applies before exporting text. */
export function repSpace(input: string): string {
  let s = input;
  if (input.trim() === '') return input.trim();
  const rep = (a: string, b: string) => {
    s = s.split(a).join(b);
  };
  for (const c of ['(', '{', '[']) {
    rep(`${c}   `, c);
    rep(`${c}  `, c);
    rep(`${c} `, c);
  }
  for (const c of [')', '}', ']', '।', '?', '!', '।।', '->']) {
    rep(`   ${c}`, c);
    rep(`  ${c}`, c);
    rep(` ${c}`, c);
  }
  rep('    ,', ',');
  rep('   ,', ',');
  rep('  ,', ',');
  rep(' ,', ',');
  for (const c of ['(', '{', '[', '*']) {
    rep(c, ` ${c}`);
    rep(`  ${c}`, ` ${c}`);
    rep(`   ${c}`, ` ${c}`);
    rep(`    ${c}`, ` ${c}`);
  }
  for (const c of [')', '}', ']', '*']) {
    rep(c, `${c} `);
    rep(`${c}  `, `${c} `);
    rep(`${c}   `, `${c} `);
    rep(`${c}    `, `${c} `);
  }
  rep(',', ', ');
  rep(',  ', ', ');
  rep('डॊ', 'डॉ');
  rep('2रा', 'दूसरा');
  rep('3रा', 'तीसरा');
  rep('???', '?');
  rep('??', '?');
  rep('~~', '`');
  rep('~', '`');
  rep('    ', ' ');
  rep('   ', ' ');
  rep('  ', ' ');
  return s.trim();
}

export const authorMaster: ScreenDefinition = {
  screen: 'author-master',
  attachments: true,
  table: 'authmast',
  primaryColumn: 'authorcokm',
  lockable: true,
  workReport: true,
  workReportTrans: ['SamvatTran'],
  deleteLabelColumn: 'authorname',
  help: true,

  // AuthMastRepository.GetValidationMessage (its RecordNo rule needs the database: see save).
  validate: (f) => {
    if (text(f.authorname).trim() === '') return 'Please Enter Name';
    if (int(f.donebykt) === 0) return 'Please Enter DoneBy';
    return '';
  },

  save: (trx, user, id, f) => saveAuthor(trx, user.id, id, f),

  trans: TRANS,

  // btnNew_Click: RecordNo starts at the next one.
  async newDefaults(db) {
    return {
      recordno: normalizeValue(await scalar(db, sql`SELECT MAX(recordno) + 1 FROM authmast`)),
    };
  },

  // FillData: "SEL" in txtSignInfo when a Selection Master entry uses the author.
  async recordExtras(db, id) {
    const n = Number(
      (await scalar(db, sql`SELECT COUNT(*) FROM SelectionM WHERE AuthorKt = ${id}`)) ?? 0,
    );
    return { SignInfo: n > 0 ? 'SEL' : '' };
  },

  // AuthMastRepository.CheckInUse, messages verbatim.
  async checkInUse(db, id) {
    const count = async (q: RawBuilder<unknown>) => Number((await scalar(db, q)) ?? 0);
    const kt = await tableKt(db);
    if (await count(sql`SELECT COUNT(*) FROM praksnAuthorAuthT WHERE authorkt = ${id}`))
      return 'Record is used in Book Master';
    if (await count(sql`SELECT COUNT(*) FROM krutiautht WHERE authorcokt = ${id}`))
      return 'Record is used in kruti  Master';
    if (await count(sql`SELECT COUNT(*) FROM AuthorParamparaT WHERE Authorkt = ${id}`))
      return 'Record is used in Author Parampara Data';
    if (await count(sql`SELECT COUNT(*) FROM AuthorVishT WHERE Authorkt = ${id}`))
      return 'Record is used in Author Vishesh';
    if (await count(sql`SELECT COUNT(*) FROM AuthMAnyNmT WHERE AuthmastKt = ${id}`))
      return 'Record is used in Author AnyName';
    if (await count(sql`SELECT COUNT(*) FROM AuthMContactT WHERE authmastkt = ${id}`))
      return 'Record is used in Author Contact';
    if (await count(sql`SELECT COUNT(*) FROM AuthMSubT WHERE authorcokt = ${id}`))
      return 'Record is used in Author Subject Data';
    if (await count(sql`SELECT COUNT(*) FROM AuthUnavailKrutiT WHERE authorcokt = ${id}`))
      return 'Record is used in Unavailable Kruti Data';
    if (await count(sql`SELECT COUNT(*) FROM RefrenceT WHERE Tablekt = ${kt} AND Recordkt = ${id}`))
      return 'Record is used in Author Reference Data';
    return '';
  },

  lists: {
    sampraday: list(
      sql`SELECT SampradayKm, SampradayName, Brief FROM Sampraday ORDER BY SampradayName`,
    ),
    'link-with-sadi': list(
      sql`SELECT ColumnMastKm, Name FROM columnmaster WHERE Vibhag = 'LinkWithSadi' ORDER BY Name`,
    ),
    pattavali: list(
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'AuthPattavali' ORDER BY Name`,
    ),
  },

  actions: {
    async 'mark-physically-checked'(db, _user, selected) {
      await sql`UPDATE authmast SET Marking = N'PC' WHERE authorcokm IN ${toIdsSql(selected)}`.execute(
        db,
      );
      return { kind: 'refreshed', rows: [], message: 'completed marking' };
    },
    async 'not-used-in-book'(_db, _user, _selected, ctx) {
      return {
        kind: 'list',
        rows: await ctx.list(sql`authorcokm NOT IN (SELECT AUTHORCOKT FROM AUTHTRAN)`),
      };
    },
    async 'update-count'(db, _user, selected, ctx) {
      for (const id of selected)
        await runProc(() => sql`EXEC UpdateAuthorCount ${String(id)}`.execute(db));
      return { kind: 'list', rows: await ctx.list(), message: 'Records Updated Successfully' };
    },
    async 'change-sampraday'(db, _user, selected, ctx) {
      const kt = numberParam(ctx, 'sampradayKt');
      if (kt <= 0 || selected.length === 0) return { kind: 'message', message: '' };
      await sql`UPDATE authmast SET Sampradaykt = ${kt} WHERE authorcokm IN ${toIdsSql(selected)}`.execute(
        db,
      );
      return { kind: 'list', rows: await ctx.list(), message: 'Records Updated Successfully' };
    },

    // For Selected Record ›
    async 'in-use-kruti'(db, _user, selected, ctx) {
      // "Show In karta1(Press Yes) / karta2(Press No) / Both(Press Cancel)".
      const karta = String(ctx.params.karta ?? 'both');
      const found: number[] = [];
      if (karta === 'karta1' || karta === 'both') {
        found.push(
          ...(await ids(
            db,
            sql`SELECT DISTINCT krutimstkt AS id FROM krutiauthT WHERE authorcokt IN ${toIdsSql(selected)}`,
          )),
        );
      }
      if (karta === 'karta2' || karta === 'both') {
        found.push(
          ...(await ids(
            db,
            sql`SELECT DISTINCT krutimstkt AS id FROM krutiSautht WHERE authorcokt IN ${toIdsSql(selected)}`,
          )),
        );
      }
      return {
        kind: 'open',
        screen: 'kruti-master',
        ids: [...new Set(found)],
        emptyMessage: 'No Kruti Available for Current Selection',
      };
    },
    'in-use-book-author': (db, _u, selected) =>
      openWhere(
        db,
        'book-master',
        sql`SELECT DISTINCT prakashannokt AS id FROM praksnAuthorAuthT WHERE authorkt IN ${toIdsSql(selected)}`,
        'No Record Found',
      ),
    'in-use-book-magazine-vishesh': (db, _u, selected) =>
      openWhere(
        db,
        'book-master',
        sql`SELECT BookMastKt AS id FROM BookMagazineVisheshAuthorT WHERE AuthorKt IN ${toIdsSql(selected)}`,
        'No Record Found',
      ),
    'in-use-book-reference': (db, _u, selected) =>
      openWhere(
        db,
        'book-master',
        sql`SELECT DISTINCT BookMastkt AS id FROM AuthorRefLibno INNER JOIN BookT ON AuthorRefLibno.BookTKt = BookT.tid WHERE Authorkt IN ${toIdsSql(selected)}`,
        '',
      ),
    'in-use-book-prakashan-vishesh': (db, _u, selected) =>
      openWhere(
        db,
        'book-master',
        sql`SELECT DISTINCT prakashannokt AS id FROM PraksnVishAutT WHERE authorkt IN ${toIdsSql(selected)}`,
        'No Record Found',
      ),
    'in-use-prakashan-list': (db, _u, selected) =>
      openWhere(
        db,
        'book-master-anya-bhandar',
        sql`SELECT DISTINCT prakshnlistnokt AS id FROM praklistauthorautht WHERE authorkt IN ${toIdsSql(selected)}`,
        'No Prakashan Available for Current Selection',
      ),
    'in-use-selection-master': (db, _u, selected) =>
      openWhere(
        db,
        'selection-master',
        sql`SELECT SelectionMkm AS id FROM SelectionM WHERE Authorkt IN ${toIdsSql(selected)}`,
        '',
      ),
    'in-use-prakashak-master': (db, _u, selected) =>
      openWhere(
        db,
        'prakashak-master',
        sql`SELECT DISTINCT prakashakkt AS id FROM praktran WHERE entrcodekt IN (SELECT entrcodekt FROM AUTHTRAN WHERE AUTHORCOKT IN ${toIdsSql(selected)})
            UNION ALL SELECT DISTINCT prakashakkt FROM praksnPrakT WHERE prakashannokt IN
              (SELECT DISTINCT prakashannokt FROM PraksnVishAutT WHERE Authorkt IN ${toIdsSql(selected)})`,
        'No Prakshak Available for Current Selection',
      ),
    'in-use-magazine-vishesh': (db, _u, selected) =>
      openWhere(
        db,
        'magazine-vishesh-master',
        sql`SELECT MagazineVisheshKm AS id FROM MagazineVishesh WHERE MagazineVisheshKm IN
            (SELECT MagazineVisheshKt FROM MagazineVisheshAuthorT WHERE AuthorKt IN ${toIdsSql(selected)})`,
        'No Records Found',
      ),
    'in-use-english-book-vishesh': (db, _u, selected) =>
      openWhere(
        db,
        'english-book-vishesh',
        sql`SELECT EnglishBookVisheshKm AS id FROM EnglishBookVishesh WHERE EnglishBookVisheshKm IN
            (SELECT EnglishBookVisheshKt FROM EnglishBookVisheshAuthorT WHERE AuthorKt IN ${toIdsSql(selected)})`,
        'No Records Found',
      ),

    /**
     * v3.4.3.1 Show In Use (For Selected Record) › BookT: frmBookTranNew as a dialog over the
     * Library Nos the selected authors refer to — the name's reference, the Guru parampara
     * (the first kind present among गुरु, विद्यागुरु, गुरुपरंपरा), AnyName2, Sampraday and the
     * printed Samvat rows. No message when nothing is found: the dialog opens empty.
     */
    'in-use-book-t': (db, _u, selected) => {
      const sel = toIdsSql(selected);
      const kind = (name: string) => sql`
        OUTER APPLY (SELECT DISTINCT ISNULL(AuthorParamparaT.identity2kt, 0) AS GuruKt
                     FROM AuthorParamparaT INNER JOIN columnmaster ON AuthorParamparaT.identity2kt = columnmaster.ColumnMastkm
                     WHERE AuthorParamparaT.AuthorParamparaKm = AP.AuthorParamparaKm AND columnmaster.Name = ${name})`;
      return openWhere(
        db,
        'book-tran',
        sql`
          SELECT tid AS id FROM BookT WHERE tid IN (
            SELECT DISTINCT AuthorNameRefBookTKt AS BookTKt FROM authmast
            WHERE authorcokm IN ${sel} AND ISNULL(AuthorNameRefBookTKt, 0) > 0
            UNION
            SELECT DISTINCT AP.BookTKt FROM AuthorParamparaT AP
            ${kind('गुरु')} AS tblGuru
            ${kind('विद्यागुरु')} AS tblVidhyaGuru
            ${kind('गुरुपरंपरा')} AS tblGuruParampara
            WHERE AP.Authorkt IN ${sel}
              AND AP.identity2kt = CASE WHEN tblGuru.GuruKt > 0 THEN tblGuru.GuruKt
                                        WHEN tblVidhyaGuru.GuruKt > 0 THEN tblVidhyaGuru.GuruKt
                                        WHEN tblGuruParampara.GuruKt > 0 THEN tblGuruParampara.GuruKt ELSE -3 END
            UNION
            SELECT DISTINCT AuthMAnyLibNoT2.BookTKt FROM AuthMAnyLibNoT2 WHERE AuthorKt IN ${sel}
            UNION
            SELECT DISTINCT AuthorSampradayT.BookTKt FROM AuthorSampradayT WHERE AuthorKt IN ${sel}
            UNION
            SELECT DISTINCT AuthorSamvatT.BookTKt FROM AuthorSamvatT WHERE IsPrint = 1 AND AuthorKt IN ${sel})`,
        '',
      );
    },

    // For Selected Record › Utility ›
    async 'set-link-with-sadi'(db, _user, selected, ctx) {
      const kt = numberParam(ctx, 'linkSadiKt');
      const result =
        await sql`UPDATE authmast SET LinkedSadiKt = ${kt} WHERE authorcokm IN ${toIdsSql(selected)}`.execute(
          db,
        );
      const n = Number(result.numAffectedRows ?? 0);
      return n > 0
        ? { kind: 'refreshed', rows: [], message: `Total (${n}) records updated successfully` }
        : { kind: 'message', message: `Total (${n}) records updated successfully` };
    },
    async 'lock-author'(db, _user, selected, ctx) {
      ctx.assertPassword(ctx.params.password, ctx.env.AUTHOR_LOCK_PASSWORD ?? '');
      await sql`UPDATE authmast SET IsLockedByAdmin = 1 WHERE authorcokm IN ${toIdsSql(selected)}`.execute(
        db,
      );
      return { kind: 'refreshed', rows: [] };
    },
    async 'unlock-author'(db, _user, selected, ctx) {
      ctx.assertPassword(ctx.params.password, ctx.env.AUTHOR_LOCK_PASSWORD ?? '');
      await sql`UPDATE authmast SET IsLockedByAdmin = 0 WHERE authorcokm IN ${toIdsSql(selected)}`.execute(
        db,
      );
      return { kind: 'refreshed', rows: [] };
    },

    // Data checks, straight to Excel.
    async 'find-missing-recno'(db, _user, _selected, ctx) {
      const all = idsParam(ctx, 'gridIds');
      const result = await table(db, sql`EXEC Print_MissingNo 'Author', ${all.join(',')}`);
      return { kind: 'table', title: 'Find Missing RecNo', ...result };
    },
    async 'find-duplicate-recno'(db, _user, _selected, ctx) {
      const all = idsParam(ctx, 'gridIds');
      const result = await table(
        db,
        sql`
        SELECT recordno FROM authmast WHERE authorcokm IN ${toIdsSql(all)} GROUP BY recordno HAVING COUNT(recordno) > 1 ORDER BY recordno`,
      );
      return { kind: 'table', title: 'Find Duplicate RecNo', ...result };
    },

    // Show Half Author Name Of Grid Matching ›
    async 'half-name-match'(db, _user, _selected, ctx) {
      // Each grid row's author name, cut to its first half: every other author containing it.
      const all = idsParam(ctx, 'gridIds');
      const { rows: grid0 } = await sql<{ id: number; name: string | null }>`
        SELECT authorcokm AS id, txtAuthorName AS name FROM authmast WHERE authorcokm IN ${toIdsSql(all)}`.execute(
        db,
      );
      const found: number[] = [];
      for (let i = 0; i < grid0.length; i += 900) {
        const chunk = grid0
          .slice(i, i + 900)
          .filter((g) => text(g.name) !== '')
          .map((g) => ({
            id: Number(g.id),
            part: text(g.name).slice(0, roundHalfEven(text(g.name).length / 2)),
          }));
        if (chunk.length === 0) continue;
        const values = sql.join(chunk.map((c) => sql`(${c.id}, ${c.part})`));
        const { rows } = await sql<{ gid: number; aid: number }>`
          SELECT g.id AS gid, a.authorcokm AS aid FROM (VALUES ${values}) AS g(id, part)
          INNER JOIN authmast a ON a.authorcokm <> g.id AND (g.part = '' OR CHARINDEX(g.part, a.authorname) > 0)`.execute(
          db,
        );
        const hits = new Map<number, number[]>();
        for (const r of rows)
          hits.set(Number(r.gid), [...(hits.get(Number(r.gid)) ?? []), Number(r.aid)]);
        for (const c of chunk) {
          const h = hits.get(c.id);
          if (h) found.push(...h, c.id);
        }
      }
      if (found.length === 0) return { kind: 'message', message: '' };
      return {
        kind: 'list',
        rows: await ctx.list(sql`authorcokm IN ${toIdsSql([...new Set(found)])}`),
      };
    },
    async 'starting-part-match'(_db, _user, _selected, ctx) {
      return {
        kind: 'list',
        rows: await ctx.list(
          sql`authorcokm IN (SELECT authmast.authorcokm FROM authmast WHERE SUBSTRING(authorname, 0, LEN(authorname) / 2) IN
            (SELECT SUBSTRING(authorname, 0, LEN(authorname) / 2) FROM authmast GROUP BY authorname
             HAVING COUNT(SUBSTRING(authorname, 0, LEN(authorname) / 2)) > 1))`,
        ),
      };
    },

    async 'insert-g'(db) {
      await runProc(() => sql`EXEC Insert_JiInAuthorMst_All`.execute(db));
      return {
        kind: 'message',
        message: 'जी Inserted Successfully in AuthorSelected Column of All Record of Author Master',
      };
    },
    async 'update-vikram-samvat'(db, _user, selected) {
      for (const id of selected)
        await runProc(() => sql`EXEC UpdateVikSamvat 'authmast', ${id}`.execute(db));
      return { kind: 'refreshed', rows: [], message: 'Records Updated Successfully' };
    },
    async 'update-pno'(_db, _user, _selected, ctx) {
      ctx.assertPassword(ctx.params.password);
      await runProc(() => execLongRunning(ctx.env, 'EXEC insertpnoInAuthMastPrakmast'));
      return { kind: 'message', message: '' };
    },

    // Print Report ›
    'print-books': (db, _u, selected) => booksForAuthors(db, selected),
    async 'author-count-report'(db) {
      const result = await table(db, sql`EXEC CMSP_AuthorReport`);
      return {
        kind: 'table',
        title: 'Author व्याख्या परिचय',
        columns: result.columns,
        rows: result.rows.map((r) => r.map((c) => repSpace(netString(c)))),
        message: 'Export finished!',
      };
    },
    // frmWebBrowser: the report site's pages, built here (reports/author.ts).
    'kruti-report': async (db, _u, _s, ctx) => ({
      kind: 'report',
      document: await krutiFromAuthorReport({ db, env: ctx.env }),
    }),
    'author-report': async (db, _u, _s, ctx) => ({
      kind: 'report',
      document: await authorReport({ db, env: ctx.env }),
    }),
    // The site ignored AuthorKm and read TranIds, which this menu item never filled: the
    // selected authors are what it meant to print.
    'author-detail-report': async (db, _u, selected, ctx) => ({
      kind: 'report',
      document: await authorDetailReport({ db, env: ctx.env }, selected, false),
    }),
    'kruti-author-check': async (db, _u, selected, ctx) => ({
      kind: 'report',
      document: await authorDetailReport({ db, env: ctx.env }, selected, true),
    }),
    'parampara-report': async (db, _u, _s, ctx) => ({
      kind: 'report',
      document: await authorParamparaReport(
        { db, env: ctx.env },
        Boolean(ctx.params.printReference),
      ),
    }),
    async 'author-reference'(db, _u, selected, ctx) {
      const result = await table(
        db,
        sql`EXEC PrintAuthorReference ${selected.join(',')}, ${ctx.params.krutiCheck ? 1 : 0}`,
      );
      const iSeq = result.columns.indexOf('Seq');
      const iName = result.columns.indexOf('AuthorName');
      let seq = 0;
      if (iSeq >= 0 && iName >= 0)
        for (const r of result.rows) if (text(r[iName]) !== '') r[iSeq] = ++seq;
      return { kind: 'table', title: 'Author Reference', ...result };
    },
    async 'link-with-sadi-report'(db, _u, _s, ctx) {
      const result = await table(
        db,
        sql`EXEC PrintAuthorLinkWithSadi ${String(ctx.params.linkSadiKt ?? '')}`,
      );
      return { kind: 'table', title: 'Link With Sadi', ...result };
    },
    async 'author-info'(db, _u, selected) {
      const result = await table(
        db,
        sql`
        SELECT recordno AS RecordNo,
          authorname + CASE WHEN ISNULL(AuthorNameRefBookTKt, 0) > 0 OR ISNULL(A.AuthorNameRefPgNo, '') <> ''
            THEN '(' + LTRIM(RTRIM(ISNULL(BT.Libno, '') + '  ' + ISNULL(A.AuthorNameRefPgNo, ''))) + ')' ELSE '' END AS Name,
          ISNULL((SELECT STUFF((SELECT ',' + AL2.AnyaName + CASE WHEN ISNULL(tblLib.Libno, '') <> '' OR ISNULL(AL2.RefPgNo, '') <> ''
            THEN '(' + tblLib.Libno + '  ' + AL2.RefPgNo + ')' ELSE '' END FROM AuthMAnyNmT2 AL2
            OUTER APPLY (SELECT STUFF((SELECT ',' + B2.Libno FROM AuthMAnyLibNoT2 L2 INNER JOIN BookT B2 ON L2.BookTKt = B2.tid
              WHERE L2.AuthAnyaNm2Kt = AL2.AuthAnyaNm2Km FOR XML PATH('')), 1, 1, '') AS LibNo) AS tblLib
            WHERE AL2.AuthmastKt = A.authorcokm FOR XML PATH('')), 1, 1, '')), '') AS AnyaName2,
          ISNULL((SELECT STUFF((SELECT ',' + colAPId.Name + '-' + APGuru.authorname + CASE WHEN ISNULL(APBT.LibNo, '') <> '' OR ISNULL(AP.PageNo, '') <> ''
            THEN '(' + APBT.Libno + '  ' + ISNULL(AP.PageNo, '') + ')' ELSE '' END FROM AuthorParamparaT AP
            OUTER APPLY (SELECT TOP (1) colAP.ColumnMastkm, colAP.Name, CASE WHEN colAP.Name = N'गुरु' THEN 1 WHEN colAP.Name = N'विद्यागुरु' THEN 2 ELSE 3 END AS APSeq
              FROM columnmaster colAP WHERE colAP.ColumnMastkm = AP.identity2kt AND Vibhag = 'AuthIdentity'
              AND Name IN (N'विद्यागुरु', N'गुरुपरंपरा', N'गुरु') ORDER BY APSeq) AS colAPId
            LEFT JOIN authmast APGuru ON AP.Guru1kt = APGuru.authorcokm LEFT JOIN BookT APBT ON AP.BookTKt = APBT.tid
            WHERE AP.Authorkt = A.authorcokm FOR XML PATH('')), 1, 1, '')), '') AS Guru,
          ISNULL((SELECT STUFF((SELECT ',' + s.SampradayName + CASE WHEN ISNULL(B.Libno, '') <> '' OR ISNULL(Asam.RefPgNo, '') <> ''
            THEN '(' + LTRIM(RTRIM(ISNULL(B.Libno, '') + '  ' + ISNULL(Asam.RefPgNo, ''))) + ')' ELSE '' END
            FROM AuthorSampradayT ASam INNER JOIN Sampraday S ON ASam.SampradayKt = S.SampradayKm LEFT JOIN BookT B ON ASam.BookTKt = B.tid
            WHERE ASam.AuthorKt = A.authorcokm FOR XML PATH('')), 1, 1, '')), '') AS Sampraday,
          ISNULL((SELECT STUFF((SELECT ',' + CAST(ASam.Vksamvat AS varchar(5)) + CASE WHEN ISNULL(B.Libno, '') <> '' OR ISNULL(Asam.PageNo, '') <> ''
            THEN '(' + LTRIM(RTRIM(ISNULL(B.Libno, '') + '  ' + ISNULL(Asam.PageNo, ''))) + ')' ELSE '' END
            FROM AuthorSamvatT ASam LEFT JOIN BookT B ON ASam.BookTKt = B.tid
            WHERE ASam.IsPrint = 1 AND ASam.AuthorKt = A.authorcokm FOR XML PATH('')), 1, 1, '')), '') AS Samvat
        FROM authmast A LEFT JOIN BookT BT ON A.AuthorNameRefBookTKt = BT.tid
        WHERE A.authorcokm IN ${toIdsSql(selected)} ORDER BY A.RecordNo`,
      );
      return { kind: 'table', title: 'Author Info', ...result };
    },

    // Filter ›
    async 'used-in-selection-master'(_db, _u, _s, ctx) {
      return {
        kind: 'list',
        rows: await ctx.list(sql`authorcokm IN (SELECT Authorkt FROM SelectionM)`),
      };
    },
    async 'records-in-use'(_db, _u, _s, ctx) {
      // frmMultiCheckbox's picks, combined with And (In All Selection) or OR (In One Selection).
      const join = String(ctx.params.condType).toUpperCase() === 'OR' ? sql` OR ` : sql` AND `;
      const picked = String(ctx.params.selection ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const conds: RawBuilder<unknown>[] = [];
      for (const p of picked) {
        if (p === '1') conds.push(sql`authorcokm IN (SELECT authorkt FROM praksnAuthorAuthT)`);
        if (p === '2') {
          conds.push(sql`authorcokm IN (SELECT authorcokt FROM krutiautht)`);
          conds.push(sql`authorcokm IN (SELECT authorcokt FROM krutiSautht)`);
        }
        if (p === '3') conds.push(sql`authorcokm IN (SELECT Authorkt FROM SelectionM)`);
        if (p === '4') conds.push(sql`authorcokm IN (SELECT ContactPersonKt FROM MagazineM)`);
        if (p === '5') conds.push(sql`authorcokm IN (SELECT AuthorKt FROM HastpratAuthorAuthT)`);
        if (p === '6')
          conds.push(sql`authorcokm IN (SELECT AuthorKt FROM TirthRakshaAuthorAuthorT)`);
        if (p === '7') conds.push(sql`authorcokm IN (SELECT AuthorKt FROM MagazineVisheshAuthorT)`);
        if (p === '8') conds.push(sql`authorcokm IN (SELECT Guru1kt FROM AuthorParamparaT)`);
      }
      if (conds.length === 0) return { kind: 'message', message: '' };
      return { kind: 'list', rows: await ctx.list(sql`(${sql.join(conds, join)})`) };
    },
    async 'lock-records'(db, user, selected, ctx) {
      ctx.assertPassword(ctx.params.password);
      const message = await lockRecords(db, user.id, selected, true);
      return { kind: 'refreshed', rows: [], message };
    },
    async 'unlock-records'(db, user, selected, ctx) {
      ctx.assertPassword(ctx.params.password);
      const message = await lockRecords(db, user.id, selected, false);
      return { kind: 'refreshed', rows: [], message };
    },
    async 'sort-by-pattavali'(_db, _u, _s, ctx) {
      const kt = numberParam(ctx, 'pattavaliKt');
      const name = String(ctx.params.pattavaliName ?? '');
      const rows = await ctx.list(
        sql`authorcokm IN (SELECT DISTINCT AuthorKt FROM AuthorPattavaliT WHERE PattavaliKt = ${kt})`,
      );
      for (const r of rows) {
        const parts = text(r.Pattavali).split(',');
        r.Pattavali = parts.find((p) => p.includes(`${name}-`)) ?? '';
      }
      return { kind: 'list', rows };
    },

    // Display In Tree: the parampara links the tree is built from (FillTree / FillTree1).
    async 'tree-links'(db, _u, _s, ctx) {
      const guru = Boolean(ctx.params.guruParampara);
      const up = Boolean(ctx.params.uplevel);
      let query: RawBuilder<unknown>;
      if (guru && !up) {
        query = sql`
          SELECT tblAuthorParamparaT.Authorkt, tblAuthorParamparaT.Guru1kt,
            authmast.authorname + CASE WHEN (SELECT COUNT(AuthorParamparaKm) FROM AuthorParamparaT
              WHERE AuthorParamparaT.Authorkt = authmast.authorcokm AND AuthorParamparaT.identity2kt = 398) = 1
              THEN N'(समकालीन)' ELSE '' END AS Guru
          FROM authmast OUTER APPLY (
            SELECT TOP (1) * FROM AuthorParamparaT WHERE AuthorParamparaT.Authorkt = authmast.authorcokm
              AND ISNULL(AuthorParamparaT.Guru1kt, 0) > 0 ORDER BY AuthorParamparaT.Seq
            UNION ALL
            SELECT TOP (1) * FROM AuthorParamparaT WHERE AuthorParamparaT.Authorkt = authmast.authorcokm
              AND ISNULL(AuthorParamparaT.Guru1kt, 0) > 0 AND AuthorParamparaT.identity2kt = 395 AND AuthorParamparaT.seq > 1
              ORDER BY AuthorParamparaT.Seq) AS tblAuthorParamparaT
          WHERE tblAuthorParamparaT.Authorkt > 0`;
      } else if (guru) {
        query = sql`
          SELECT AuthorParamparaT.Authorkt, AuthorParamparaT.Guru1kt,
            authmast.authorname + CASE WHEN (SELECT COUNT(AuthorParamparaKm) FROM AuthorParamparaT
              WHERE AuthorParamparaT.Authorkt = authmast.authorcokm AND AuthorParamparaT.identity2kt = 398) = 1
              THEN N'(समकालीन)' ELSE '' END AS Guru
          FROM AuthorParamparaT INNER JOIN authmast ON AuthorParamparaT.Guru1kt = authmast.authorcokm`;
      } else if (!up) {
        query = sql`
          SELECT tblAuthorParamparaT.Authorkt, tblAuthorParamparaT.Guru1kt, authmast.authorname AS Guru
          FROM authmast OUTER APPLY (
            SELECT TOP (1) * FROM AuthorParamparaT WHERE AuthorParamparaT.Authorkt = authmast.authorcokm
              AND ISNULL(AuthorParamparaT.Guru1kt, 0) > 0 AND AuthorParamparaT.identity2kt = 15560 ORDER BY AuthorParamparaT.Seq
          ) AS tblAuthorParamparaT
          WHERE tblAuthorParamparaT.Authorkt > 0`;
      } else {
        query = sql`
          SELECT AuthorParamparaT.Authorkt, AuthorParamparaT.Guru1kt, authmast.authorname AS Guru
          FROM AuthorParamparaT INNER JOIN authmast ON AuthorParamparaT.Guru1kt = authmast.authorcokm
            AND ISNULL(AuthorParamparaT.Guru1kt, 0) > 0 AND AuthorParamparaT.identity2kt = 15560`;
      }
      return { kind: 'table', title: 'tree', ...(await table(db, query)) };
    },

    // lnkRefSamvat: the samvat row the record refers to, in frmPopup.
    async 'ref-samvat'(db, _u, _s, ctx) {
      const kt = numberParam(ctx, 'refSamvatKt');
      const result = await table(
        db,
        sql`
        SELECT authmast.recordno, ISNULL(colSamvKind.Name, '') AS SamvatKindName, ISNULL(AuthorSamvatT.Remark, '') AS Remark,
          ISNULL(samvmast.samvatname, '') AS AsamvatName, AuthorSamvatT.Asamvat, AuthorSamvatT.Vksamvat, BookT.Libno,
          AuthorSamvatT.PageNo, ISNULL(visheshMast.Vishesh, '') AS SthalName, AuthorSamvatT.IsPrint, AuthorSamvatT.seq
        FROM authmast INNER JOIN AuthorSamvatT ON authmast.authorcokm = AuthorSamvatT.AuthorKt
        LEFT OUTER JOIN columnmaster AS colSamvKind ON AuthorSamvatT.SamvatKindKt = colSamvKind.ColumnMastkm
        LEFT OUTER JOIN samvmast ON AuthorSamvatT.AsamvatKt = samvmast.samvatcokm
        LEFT JOIN BookT ON AuthorSamvatT.BookTKt = BookT.tid LEFT JOIN visheshMast ON visheshMast.Tid = AuthorSamvatT.SthalKt
        WHERE AuthorSamvatT.AuthorSamvatKm = ${kt}`,
      );
      return { kind: 'table', title: 'Ref Samvat', ...result };
    },
  },
};
