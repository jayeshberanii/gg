import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { queryLongRunning } from '../../db/long-running.js';
import { normalizeValue } from '../values.js';
import { authorMaster } from './author.js';
import { AUTHOR_LIST, anyNames } from './book.js';
import { get, grid, int, list, type Row, SIGN_UNDER_10, signBetween, text } from './book-common.js';
import {
  type ChildTable,
  openInUse,
  tableKtOf,
  trimmed,
  upsertChildRows,
} from './master-common.js';
import type { ActionContext, ActionResult, ScreenDefinition } from './registry.js';

/** clsCom.INSQ: trimmed, a blank written as ' '. */
const insq = (v: unknown) => trimmed(v) || ' ';

const child = (
  table: string,
  key: string,
  columns: ChildTable['columns'],
  audit = true,
): ChildTable => ({ table, key, parent: 'PrakMastKt', columns, audit });

/** PrakMastRepository.Save's popups (upsert by key, then delete the rest), by tblSearch column. */
const POPUPS: Record<string, ChildTable> = {
  prakcontactTran: child('prakContactT', 'prakcontactkm', {
    contacttypekt: 'int',
    contactkt: 'int',
    ContactNo: 'text',
    remark: 'text',
    BookTKt: 'int',
    PageNo: 'text',
    IsPrint: 'bit',
    Seq: 'int',
  }),
  PrakMAnayNmTran: child('PrakMAnayNmT', 'PrakMAnyNmKm', {
    AnyaNm: 'text',
    anynmtypekt: 'int',
    BookTKt: 'int',
    PageNo: 'text',
    IsPrint: 'bit',
    Seq: 'int',
  }),
  PrakMRelTran: child('PrakMRelT', 'PrakRelKm', {
    relatedprakkt: 'int',
    relationId: 'int',
    remark: 'text',
    BookTKt: 'int',
    PageNo: 'text',
    Seq: 'int',
  }),
  PrakMAddTran: child('PrakMAddT', 'prakMAddkm', {
    PrakashakName: 'text',
    address: 'text',
    citykt: 'int',
    StateKt: 'int',
    pincode: 'text',
    phoneno: 'text',
    email: 'text',
    Website: 'text',
    remark: 'text',
    category: 'int',
    Pname: 'text',
    MobName: 'text',
    MobileNo: 'text',
    BookTKt: 'int',
    PageNo: 'text',
    IsPrint: 'bit',
    Seq: 'int',
  }),
  PrakMSubTran: child('prakMSubT', 'PrakSujTkm', {
    Subjectkt: 'int',
    remark: 'text',
    typeid: 'int',
    signkt: 'int',
    Seq: 'int',
  }),
  PrakMgmalaTran: child('PrakMgmalaT', 'prakGMalakm', {
    visheshTid: 'int',
    remark: 'text',
    BookTKt: 'int',
    PageNo: 'text',
    Seq: 'int',
  }),
  PrakMRefLibNoTran: child(
    'PrakMRefLibNoT',
    'PrakMRefLibNoKm',
    { BookTKt: 'int', RefPgNo: 'text', Seq: 'int' },
    false,
  ),
  PrakMExcelNameTran: child('PrakMExcelNameT', 'PrakMExcelNameKm', {
    ExcelName: 'text',
    Seq: 'int',
  }),
  SamvatTran: child('PrakMSamvatT', 'PrakMSamvatKm', {
    SamvatKindKt: 'int',
    Remark: 'text',
    AsamvatKt: 'int',
    Asamvat: 'text',
    Vksamvat: 'int',
    BookTKt: 'int',
    PageNo: 'text',
    SthalKt: 'int',
    IsPrint: 'bit',
    Seq: 'int',
  }),
  PrakarTran: child('PrakMPrakarT', 'PrakMPrakarKm', {
    PrakarKt: 'int',
    SubPrakarKt: 'int',
    Seq: 'int',
  }),
  VibhagTran: child('PrakMVibhagT', 'PrakMVibhagKm', { VibhagKt: 'int', Seq: 'int' }),
  PublicationTypeTran: child('PrakMPublicationTypeT', 'PrakMPublicationTypeKm', {
    PublicationTypeKt: 'int',
    Seq: 'int',
  }),
  PraptiSthanTran: child('PrakMPraptiSthanT', 'PrakMPraptiSthanKm', {
    PraptiSthanName: 'text',
    Address: 'text',
    CityKt: 'int',
    StateKt: 'int',
    PinCode: 'text',
    BookTKt: 'int',
    PageNo: 'text',
    PhoneNo: 'text',
    Remark: 'text',
    Seq: 'int',
  }),
  MudrakTran: child('PrakMMudrakT', 'PrakMMudrakKm', {
    MudrakName: 'text',
    MobileNo: 'text',
    BookTKt: 'int',
    PageNo: 'text',
    Seq: 'int',
  }),
};

/** A popup's extra table as the client sends it (`<column>.Extra`, `.Extra2`, …). */
const extraRows = (f: Record<string, unknown>, key: string): Row[] =>
  Array.isArray(f[key]) ? (f[key] as Row[]) : [];

/** The author tables (the AuthTran popup and its multiauthortype / multiauthor sub-popups). */
const AUTHOR_TABLES = ['PrakMAuthorAuthTypeT', 'PrakMAuthorAuthT', 'PrakMAuthorT'];

async function scalarText(db: Executor, query: RawBuilder<unknown>): Promise<string> {
  const { rows } = await sql<Record<string, unknown>>`${query}`.execute(db);
  const first = rows[0];
  return first ? text(Object.values(first)[0]) : '';
}

/**
 * Save's txtPrakName: the name, then "Cont(<contacts>)" and "AName(<any names>)" (each joined
 * by "," with SignBetweenStr). The popups' rows as the user left them, or else as stored.
 */
async function composePrakName(
  db: Executor,
  id: number,
  name: string,
  contacts: Row[] | null,
  anyNamesRows: Row[] | null,
): Promise<string> {
  const contactNames =
    contacts?.map((r) => text(get(r, 'Contact'))) ??
    (id > 0
      ? (
          await sql<{ c: string | null }>`
            SELECT ISNULL(visheshMast.Vishesh, N'') AS c FROM prakcontactT
            LEFT OUTER JOIN visheshMast ON prakcontactT.contactkt = visheshMast.Tid
            WHERE prakcontactT.prakmastkt = ${id}`.execute(db)
        ).rows.map((r) => text(r.c))
      : []);
  const anyNames =
    anyNamesRows?.map((r) => text(get(r, 'AnyaNm'))) ??
    (id > 0
      ? (
          await sql<{ a: string | null }>`
            SELECT AnyaNm AS a FROM PrakMAnayNmT WHERE prakmastkt = ${id} ORDER BY seq`.execute(db)
        ).rows.map((r) => text(r.a))
      : []);
  const join = (values: string[]) =>
    values
      .filter((v) => v.trim() !== '')
      .reduce((out, v) => signBetween(out, v), '')
      .trim();
  let out = name;
  const cont = join(contactNames);
  if (cont !== '') out = signBetween(out, `Cont(${cont})`);
  const any = join(anyNames);
  if (any !== '') out = signBetween(out, `AName(${any})`);
  return out;
}

/**
 * GetAuthorName: the authors' types and names, as txtAuthor keeps them. `keys` names the author
 * rows' key and the column of the type / name rows pointing at it (Prakashak Master's by
 * default; Tirth Raksha Master's repository is the same code over its own tables).
 */
export async function authorText(
  db: Executor,
  authors: Row[],
  types: Row[],
  names: Row[],
  keys: { author: string; link: string } = { author: 'PrakMAuthorKm', link: 'PrakMAuthorKt' },
): Promise<string> {
  let out = '';
  for (const a of authors) {
    const key = int(get(a, keys.author));
    let st = '';
    for (const t of types.filter((r) => int(get(r, keys.link)) === key)) {
      st = signBetween(
        st.trim(),
        await scalarText(
          db,
          sql`SELECT ISNULL(authortype, '') FROM authtype WHERE authtycokm = ${int(get(t, 'authortypekt'))}`,
        ),
      );
      const { rows } = await sql<{ ShortNm: string; ColumnNo: number }>`
        SELECT ISNULL(ShortNm, '') AS ShortNm, ISNULL(ColumnNo, 0) AS ColumnNo FROM columnmaster
        WHERE ColumnMastkm = ${int(get(t, 'signkt'))} AND vibhag = 'Sign'`.execute(db);
      if (rows[0] && rows[0].ShortNm !== '' && Number(rows[0].ColumnNo) > 0)
        st += `(${rows[0].ShortNm})`;
    }
    let st1 = '';
    for (const n of names.filter((r) => int(get(r, keys.link)) === key)) {
      const anya = text(get(n, 'AnyaName'));
      st1 = signBetween(st1.trim(), anya.trim() !== '' ? anya : text(get(n, 'authorname')));
      const { rows: pad } = await sql<{ VShortNm: string }>`
        SELECT ISNULL(shortnm, '') AS VShortNm FROM VisheshMast WHERE Tid = ${int(get(n, 'padkt'))} AND remark = 'Avastha'`.execute(
        db,
      );
      const guru = text(get(n, 'Guru'));
      if (guru.trim() !== '') st1 += `(${guru})`;
      const identity = text(get(n, 'identyty'));
      if (!(identity === '' && pad.length === 0)) {
        st1 += `[${identity}-${pad[0] ? pad[0].VShortNm : ''}]`;
        st1 = st1.replace('-]', ']');
      }
      const { rows: sign } = await sql<{ CShortNm: string; ColumnNo: number }>`
        SELECT ISNULL(shortnm, '') AS CShortNm, ISNULL(ColumnNo, 0) AS ColumnNo FROM columnmaster
        WHERE ColumnMastkm = ${int(get(n, 'signkt'))} AND vibhag = 'Sign'`.execute(db);
      if (sign[0] && sign[0].CShortNm !== '' && Number(sign[0].ColumnNo) > 0)
        st1 += `(${sign[0].CShortNm})`;
    }
    out = signBetween(out.trim(), signBetween(st, st1, '-'));
  }
  return out
    .trim()
    .replace(/\(\/\)/g, ' /')
    .replace(/\/,/g, '/');
}

/** The author popup's save: PrakMAuthorT rows, then each one's types and names. */
async function saveAuthors(
  trx: Executor,
  prakId: number,
  authors: Row[],
  types: Row[],
  names: Row[],
) {
  const keptAuthors: number[] = [];
  const keptTypes: number[] = [];
  const keptNames: number[] = [];
  for (const a of authors) {
    const oldKey = int(get(a, 'PrakMAuthorKm'));
    const txtAuth = signBetween(text(get(a, 'authortype')), text(get(a, 'authorname')), '-');
    let key = oldKey;
    if (oldKey <= 0) {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO PrakMAuthorT (PrakMastKt, txtAuth, BookTKt, PageNo, Seq) OUTPUT INSERTED.PrakMAuthorKm AS id
        VALUES (${prakId}, ${txtAuth}, ${int(get(a, 'BookTKt'))}, ${insq(get(a, 'PageNo'))}, ${int(get(a, 'seq'))})
      `.execute(trx);
      key = Number(rows[0]!.id);
    } else {
      await sql`
        UPDATE PrakMAuthorT SET txtAuth = ${txtAuth}, BookTKt = ${int(get(a, 'BookTKt'))}, PageNo = ${insq(get(a, 'PageNo'))},
          Seq = ${int(get(a, 'seq'))}
        WHERE PrakMAuthorKm = ${oldKey}
      `.execute(trx);
    }
    keptAuthors.push(key);
    for (const t of types.filter((r) => int(get(r, 'PrakMAuthorKt')) === oldKey)) {
      const tKey = int(get(t, 'PrakMAuthorAuthTypeKm'));
      if (tKey <= 0) {
        const { rows } = await sql<{ id: number }>`
          INSERT INTO PrakMAuthorAuthTypeT (PrakMastKt, PrakMAuthorKt, AuthorTypeKt, SignKt, Seq)
          OUTPUT INSERTED.PrakMAuthorAuthTypeKm AS id
          VALUES (${prakId}, ${key}, ${int(get(t, 'authortypekt'))}, ${int(get(t, 'signkt'))}, ${int(get(t, 'seq'))})
        `.execute(trx);
        keptTypes.push(Number(rows[0]!.id));
      } else {
        await sql`
          UPDATE PrakMAuthorAuthTypeT SET AuthorTypeKt = ${int(get(t, 'authortypekt'))}, SignKt = ${int(get(t, 'signkt'))},
            Seq = ${int(get(t, 'seq'))}, PrakMAuthorKt = ${key}
          WHERE PrakMAuthorAuthTypeKm = ${tKey}
        `.execute(trx);
        keptTypes.push(tKey);
      }
    }
    for (const n of names.filter((r) => int(get(r, 'PrakMAuthorKt')) === oldKey)) {
      const nKey = int(get(n, 'PrakMAuthorAuthKm'));
      if (nKey <= 0) {
        const { rows } = await sql<{ id: number }>`
          INSERT INTO PrakMAuthorAuthT (PrakMastKt, PrakMAuthorKt, authorkt, padkt, signkt, AuthAnyaNmKt, Seq)
          OUTPUT INSERTED.PrakMAuthorAuthKm AS id
          VALUES (${prakId}, ${key}, ${int(get(n, 'authorkt'))}, ${int(get(n, 'padkt'))}, ${int(get(n, 'signkt'))},
                  ${int(get(n, 'AuthAnyaNmKt'))}, ${int(get(n, 'seq'))})
        `.execute(trx);
        keptNames.push(Number(rows[0]!.id));
      } else {
        await sql`
          UPDATE PrakMAuthorAuthT SET authorkt = ${int(get(n, 'authorkt'))}, padkt = ${int(get(n, 'padkt'))},
            signkt = ${int(get(n, 'signkt'))}, AuthAnyaNmKt = ${int(get(n, 'AuthAnyaNmKt'))}, Seq = ${int(get(n, 'seq'))},
            PrakMAuthorKt = ${key}
          WHERE PrakMAuthorAuthKm = ${nKey}
        `.execute(trx);
        keptNames.push(nKey);
      }
    }
  }
  await sql`DELETE FROM PrakMAuthorAuthTypeT WHERE PrakMastKt = ${prakId} AND PrakMAuthorAuthTypeKm NOT IN ${idList([0, ...keptTypes])}`.execute(
    trx,
  );
  await sql`DELETE FROM PrakMAuthorAuthT WHERE PrakMastKt = ${prakId} AND PrakMAuthorAuthKm NOT IN ${idList([0, ...keptNames])}`.execute(
    trx,
  );
  await sql`DELETE FROM PrakMAuthorT WHERE PrakMastKt = ${prakId} AND PrakMAuthorKm NOT IN ${idList([0, ...keptAuthors])}`.execute(
    trx,
  );
}

/** Save's last step: every book of this prakashak gets its txtPrakashak rebuilt. */
async function rebuildBookPrakashak(trx: Executor, id: number) {
  await sql`
    UPDATE BookM SET txtPrakashak = (SELECT STUFF((SELECT ',' + CASE WHEN pp.purva = 1 THEN N'(P)' ELSE '' END
      + CASE WHEN ISNULL(pp.nameSelected, '') <> '' THEN pp.nameSelected ELSE p.prakname END
      + CASE WHEN ISNULL(ColPt.shortnm, '') <> '' AND ISNULL(colpt.ColumnNo, 0) > 0 THEN '(' + colpt.shortnm + ')' ELSE '' END
      + CASE WHEN ISNULL(colSign.shortNm, '') <> '' AND ISNULL(colsign.ColumnNo, 0) > 0 THEN ' ' + colSign.shortNm ELSE '' END
      FROM praksnPrakT pp INNER JOIN prakmast p ON pp.prakashakkt = p.prakcodekm
      LEFT OUTER JOIN columnmaster ColPt ON pp.PrakTypekt = ColPt.ColumnMastkm
      LEFT OUTER JOIN columnmaster colSign ON pp.signkt = colSign.ColumnMastkm
      WHERE pp.prakashannokt = BookM.BookMastkm ORDER BY pp.seq FOR XML PATH('')), 1, 1, ''))
    FROM BookM INNER JOIN praksnPrakT ON BookM.BookMastkm = praksnPrakT.prakashannokt WHERE prakashakkt = ${id}
  `.execute(trx);
  await sql`
    UPDATE BookM SET txtPrakashak = REPLACE(txtPrakashak, '(/)', ' /')
    FROM BookM INNER JOIN praksnPrakT ON BookM.BookMastkm = praksnPrakT.prakashannokt WHERE prakashakkt = ${id}
  `.execute(trx);
  await sql`
    UPDATE BookM SET txtPrakashak = REPLACE(txtPrakashak, '/,', '/')
    FROM BookM INNER JOIN praksnPrakT ON BookM.BookMastkm = praksnPrakT.prakashannokt WHERE prakashakkt = ${id}
  `.execute(trx);
}

/** A "table" result from a report procedure the desktop reads with no command timeout. */
async function longTable(
  ctx: ActionContext,
  title: string,
  statement: string,
  emptyMessage?: string,
): Promise<ActionResult> {
  const result = await queryLongRunning(ctx.env, statement);
  return {
    kind: 'table',
    title,
    columns: result.columns,
    rows: result.rows.map((r) => r.map(normalizeValue)),
    ...(emptyMessage ? { emptyMessage } : {}),
  };
}

const idsParam = (ctx: ActionContext, name: string) =>
  (Array.isArray(ctx.params[name]) ? (ctx.params[name] as number[]) : [])
    .map((n) => Math.trunc(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0);

const SAMVAT_LOOKUPS = authorMaster.trans!.SamvatTran!.lookups!;
const LIBNO = list(sql`SELECT Tid, LibNo FROM BookT WHERE ISNULL(LibNo, '') <> '' ORDER BY LibNo`);
const LIBNO_RICH = list(sql`
  SELECT Tid, LibNo, BookM.BookName + CASE WHEN ISNULL(BookM.part, '') = '' THEN '' ELSE ' ' + BookM.Part END AS BookName,
    BookM.txtPrakashak AS Prakashak, BookM.txtAuthor AS AuthorName, BookM.PSamvatVK AS Samvat
  FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm WHERE ISNULL(LibNo, '') <> '' ORDER BY Libno`);
const vibhag = (name: string) =>
  list(sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = ${name} ORDER BY Name`);

/**
 * Master › Prakashak Master (frmPrakashakMaster, PrakMastRepository). Table prakmast, IDENTITY
 * key prakcodekm; recordno is MAX + 1 on insert and never changed afterwards.
 */
export const prakashakMaster: ScreenDefinition = {
  screen: 'prakashak-master',
  table: 'prakmast',
  primaryColumn: 'prakcodekm',
  lockable: true,
  // insertworkreports after Add, Edit and Delete ("Delete <name>").
  workReport: true,
  deleteLabelColumn: 'prakname',
  help: true,

  /**
   * GetValidationMessage (blank name) and the form's own check, which wins: "Please Enter
   * RefLibNo". The repository's "RecordNo … is already in use" needs the database (save).
   */
  validate: (f) =>
    trimmed(f.PrakMRefLibNoTran) === ''
      ? 'Please Enter RefLibNo'
      : trimmed(f.prakname) === ''
        ? 'Please Enter Name'
        : '',

  async save(trx, user, id, f) {
    const recordno = int(f.recordno);
    if (recordno !== 0) {
      const { rows } = await sql<{ n: number }>`
        SELECT COUNT(*) AS n FROM prakmast WHERE recordno <> 0 AND recordno = ${recordno} AND prakcodekm <> ${id}
      `.execute(trx);
      if (Number(rows[0]!.n) > 0)
        throw new BadRequestException(`RecordNo ${recordno} is already in use`);
    }
    const authors = grid(f, 'AuthTran');
    const txtAuthor = authors
      ? await authorText(
          trx,
          authors,
          extraRows(f, 'AuthTran.Extra2'),
          extraRows(f, 'AuthTran.Extra'),
        )
      : id > 0
        ? await scalarText(
            trx,
            sql`SELECT ISNULL(txtAuthor, '') FROM prakmast WHERE prakcodekm = ${id}`,
          )
        : '';
    const v = {
      prakname: trimmed(f.prakname),
      Remark: trimmed(f.Remark),
      // chkFinished: the web loads it with the record (the desktop never did, see the note).
      Finished: ['true', '1'].includes(String(f.Finished ?? '').toLowerCase()),
      MainSubject: trimmed(f.PrakMSubTran),
      SamudayKt: int(f.SamudayKt),
      Sampark: text(f.Sampark),
      StatusKt: int(f.StatusKt),
      txtAuthor,
      txtPrakName: await composePrakName(
        trx,
        id,
        trimmed(f.prakname),
        grid(f, 'prakcontactTran'),
        grid(f, 'PrakMAnayNmTran'),
      ),
    };
    let prakId = id;
    if (id > 0) {
      await sql`
        UPDATE prakmast SET prakname = ${v.prakname}, Remark = ${v.Remark}, Finished = ${v.Finished},
          MainSubject = ${v.MainSubject}, txtPrakName = ${v.txtPrakName}, SamudayKt = ${v.SamudayKt},
          Sampark = ${v.Sampark}, StatusKt = ${v.StatusKt}, txtAuthor = ${v.txtAuthor}, moduser = ${user.id},
          moddate = GETDATE()
        WHERE prakcodekm = ${id}
      `.execute(trx);
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO prakmast (prakname, Remark, Finished, recordno, MainSubject, txtPrakName, SamudayKt, Sampark,
          StatusKt, txtAuthor, enuser, endate)
        OUTPUT INSERTED.prakcodekm AS id
        VALUES (${v.prakname}, ${v.Remark}, ${v.Finished},
          (SELECT ISNULL(MAX(RecordNo), 0) + 1 FROM prakmast WITH (UPDLOCK, HOLDLOCK)),
          ${v.MainSubject}, ${v.txtPrakName}, ${v.SamudayKt}, ${v.Sampark}, ${v.StatusKt}, ${v.txtAuthor}, ${user.id},
          GETDATE())
      `.execute(trx);
      prakId = Number(rows[0]!.id);
    }

    for (const [column, table] of Object.entries(POPUPS)) {
      const rows = grid(f, column);
      if (!rows) continue;
      await upsertChildRows(trx, table, prakId, rows, user.id);
      if (column === 'SamvatTran') {
        // The first samvat row's kind and VK samvat go on the record.
        await sql`
          UPDATE prakmast SET samvatcokt = ${rows[0] ? int(get(rows[0], 'SamvatKindKt')) : 0},
            vikramsmvt = ${rows[0] ? int(get(rows[0], 'Vksamvat')) : 0}
          WHERE prakcodekm = ${prakId}
        `.execute(trx);
      }
    }
    if (authors) {
      await saveAuthors(
        trx,
        prakId,
        authors,
        extraRows(f, 'AuthTran.Extra2'),
        extraRows(f, 'AuthTran.Extra'),
      );
    }
    if (id > 0) await rebuildBookPrakashak(trx, id);
    return prakId;
  },

  /**
   * Delete: the desktop deletes the prakmast row only; its popups' rows (contacts, addresses,
   * authors, …) were left behind. They are deleted with it here.
   */
  async deleteRecord(trx, _user, id) {
    for (const t of Object.values(POPUPS)) {
      await sql`DELETE FROM ${sql.table(t.table)} WHERE PrakMastKt = ${id}`.execute(trx);
    }
    for (const t of AUTHOR_TABLES)
      await sql`DELETE FROM ${sql.table(t)} WHERE PrakMastKt = ${id}`.execute(trx);
    await sql`DELETE FROM RefrenceT WHERE Tablekt = ${await tableKtOf(trx, 'PrakMast')} AND RecordKt = ${id}`.execute(
      trx,
    );
    const result = await sql`DELETE FROM prakmast WHERE prakcodekm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  trans: {
    // TranName "Author" and its sub-popups "multiauthortype" / "multiauthor" (SetForm_PrakMast).
    // The F2EntryText's second table is the authors, its third the author types.
    AuthTran: {
      lookups: {
        libno: LIBNO,
        authortype: list(sql`SELECT authtycokm, authortype FROM authtype ORDER BY authortype`),
        sign: SIGN_UNDER_10,
        authorname: AUTHOR_LIST,
        anyaname: anyNames,
        padvi: list(
          sql`SELECT tid, vishesh FROM visheshmast WHERE remark = 'avastha' AND ISNULL(visheshno, 0) > 5 ORDER BY vishesh`,
        ),
      },
    },
    PrakMAnayNmTran: { lookups: { anynametype: vibhag('PrakMNameType'), libno: LIBNO_RICH } },
    prakcontactTran: {
      lookups: {
        contacttype: list(
          sql`SELECT Tid, Vishesh FROM visheshMast WHERE Remark = N'conttype' ORDER BY Vishesh`,
        ),
        contact: list(
          sql`SELECT Tid, Vishesh FROM visheshMast WHERE Remark = N'contactnm' ORDER BY Vishesh`,
        ),
        libno: LIBNO,
      },
    },
    PrakMRelTran: {
      lookups: {
        relprakashak: list(sql`SELECT prakcodekm, prakname FROM prakmast ORDER BY prakname`),
        relationname: vibhag('PrakRelType'),
        libno: LIBNO,
      },
    },
    PrakMAddTran: {
      lookups: {
        prakashakname: list(sql`
          SELECT DISTINCT prakname AS Id, prakname AS Name FROM prakmast
          UNION ALL SELECT DISTINCT AnyaNm AS Id, AnyaNm AS Name FROM PrakMAnayNmT ORDER BY Name`),
        city: list(
          sql`SELECT Tid, Vishesh FROM visheshMast WHERE Remark = 'city' ORDER BY Vishesh`,
        ),
        state: vibhag('State'),
        categoryname: vibhag('PrakMCat'),
        libno: LIBNO_RICH,
      },
    },
    PrakMgmalaTran: {
      lookups: {
        vishesh: list(
          sql`SELECT Tid, Vishesh FROM visheshMast WHERE remark = 'gmala' ORDER BY Vishesh`,
        ),
        libno: LIBNO,
      },
    },
    PrakMSubTran: {
      lookups: {
        sign: list(
          sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'sign' ORDER BY Name`,
        ),
        subject: list(sql`
          SELECT ColumnMastkm, Name AS name FROM columnmaster WHERE vibhag = 'PrakMSubject' AND ISNULL(name, '') <> ''
          UNION SELECT ColumnMastkm, hindiword AS name FROM columnmaster WHERE vibhag = 'PrakMSubject' AND ISNULL(HindiWord, '') <> ''
          ORDER BY Name`),
        type: vibhag('PrakMSubjType'),
      },
    },
    PrakMRefLibNoTran: { lookups: { libno: LIBNO } },
    PrakMExcelNameTran: {},
    SamvatTran: { lookups: SAMVAT_LOOKUPS },
    PrakarTran: {
      lookups: { prakarname: vibhag('PrakMPrakar'), subprakarname: vibhag('PrakMSubPrakar') },
    },
    VibhagTran: { lookups: { vibhagname: vibhag('PrakMVibhag') } },
    PublicationTypeTran: { lookups: { publicationtypename: vibhag('PrakMPublicationType') } },
    PraptiSthanTran: {
      lookups: {
        cityname: list(
          sql`SELECT Tid, Vishesh AS City FROM visheshMast WHERE remark = 'City' AND ISNULL(Vishesh, '') <> '' ORDER BY Vishesh`,
        ),
        statename: list(
          sql`SELECT ColumnMastkm, Name AS State FROM columnmaster WHERE vibhag = 'State'`,
        ),
        libno: LIBNO_RICH,
      },
    },
    MudrakTran: { lookups: { libno: LIBNO } },
  },

  lists: { finance: vibhag('PrakMFin') },

  actions: {
    async 'mark-physically-checked'(db, _user, selected): Promise<ActionResult> {
      await sql`UPDATE prakmast SET Exist = N'PC' WHERE prakcodekm IN ${idList(selected)}`.execute(
        db,
      );
      return { kind: 'refreshed', rows: [], message: 'Selected Records Marked Successfully' };
    },
    async 'show-active-only'(_db, _user, _selected, ctx): Promise<ActionResult> {
      return { kind: 'list', rows: await ctx.list(sql`Finished = 1`) };
    },
    /** Update BookCount / Update Count for Selected Prakashak: long procedures, then FillList. */
    async 'update-book-count'(_db, _user, selected, ctx): Promise<ActionResult> {
      if (selected.length === 0) return { kind: 'message', message: '' };
      await queryLongRunning(ctx.env, `EXEC UpdatePrakashakBookCount '${selected.join(',')}'`);
      return { kind: 'list', rows: await ctx.list() };
    },
    async 'update-count'(_db, _user, selected, ctx): Promise<ActionResult> {
      if (selected.length === 0) return { kind: 'message', message: '' };
      await queryLongRunning(ctx.env, `EXEC UpdatePrakashakCount '${selected.join(',')}'`);
      return { kind: 'list', rows: await ctx.list() };
    },
    // Show in Use › …
    'in-use-book': (db, _user, selected) =>
      openInUse(
        db,
        'book-master',
        sql<{
          id: number;
        }>`SELECT DISTINCT prakashannokt AS id FROM praksnPrakT WHERE prakashakkt IN ${idList(selected)}`,
        'No Record Found',
      ),
    /** Related Prakashak: the grid shows the selected prakashaks that have relations. */
    async 'in-use-related'(db, _user, selected, ctx): Promise<ActionResult> {
      const { rows } = await sql<{ id: number }>`
        SELECT PrakMRelT.prakmastkt AS id FROM PrakMRelT WHERE PrakMRelT.prakmastkt IN ${idList(selected)}
        UNION SELECT PrakMRelT.relatedprakkt FROM PrakMRelT WHERE PrakMRelT.relatedprakkt IN ${idList(selected)}
      `.execute(db);
      const ids = rows.map((r) => Number(r.id)).filter((n) => n > 0);
      if (ids.length === 0) return { kind: 'message', message: 'No Record Found' };
      return { kind: 'list', rows: await ctx.list(sql`prakcodekm IN ${idList(ids)}`) };
    },
    'in-use-author': (db, _user, selected) =>
      openInUse(
        db,
        'author-master',
        sql<{ id: number }>`
          SELECT DISTINCT AUTHORCOKT AS id FROM AUTHTRAN WHERE ENTRCODEKT IN (SELECT DISTINCT entrcodekt FROM praktran
            WHERE prakashakkt IN ${idList(selected)}) AND AUTHORCOKT > 0
          UNION ALL SELECT DISTINCT authorkt FROM praksnAuthorAuthT WHERE prakashannokt IN (SELECT DISTINCT prakashannokt
            FROM praksnPrakT WHERE prakashakkt IN ${idList(selected)})`,
        'No Author Available for Current Selection',
      ),
    'in-use-selection': (db, _user, selected) =>
      openInUse(
        db,
        'selection-master',
        sql<{
          id: number;
        }>`SELECT SelectionMkm AS id FROM SelectionM WHERE prakashakkt IN ${idList(selected)}`,
        'No Selection Available',
      ),
    'in-use-prakashan-list': (db, _user, selected) =>
      openInUse(
        db,
        'book-master-anya-bhandar',
        sql<{
          id: number;
        }>`SELECT DISTINCT praklistnokm AS id FROM praklistprakt WHERE prakashakkt IN ${idList(selected)}`,
        'No Prakashan List Available for Current Selection',
      ),
    /** Find Missing RecNo: `exec Print_MissingNo 'prakmast', <grid ids>` to Excel. */
    'missing-recno': (_db, _user, _selected, ctx) =>
      longTable(
        ctx,
        'Missing RecNo',
        `EXEC Print_MissingNo 'prakmast', '${idsParam(ctx, 'gridIds').join(',')}'`,
      ),
    /** Find Duplicate RecNo (MdlLib.FindDuplicate) to Excel. */
    async 'duplicate-recno'(db, _user, _selected, ctx): Promise<ActionResult> {
      const { rows } = await sql<{ recordno: number }>`
        SELECT recordno FROM prakmast WHERE prakcodekm IN ${idList(idsParam(ctx, 'gridIds'))}
        GROUP BY recordno HAVING COUNT(recordno) > 1 ORDER BY recordno
      `.execute(db);
      return {
        kind: 'table',
        title: 'Duplicate RecNo',
        columns: ['recordno'],
        rows: rows.map((r) => [r.recordno]),
      };
    },
    /**
     * Show Half Prakashak Name Of Grid Matching › AnyaName-Contact Name / Prakashak Name: the
     * desktop's partial match (CheckPartialMatchInDataTable) starts from " " and so matches every
     * row; the grid ends up showing the rows it already had.
     */
    async 'half-match-grid'(_db, _user, _selected, ctx): Promise<ActionResult> {
      const ids = idsParam(ctx, 'gridIds');
      return {
        kind: 'list',
        rows: await ctx.list(sql`prakcodekm IN ${idList(ids.length ? ids : [1])}`),
      };
    },
    /** … › Starting Part - Prakashak Name: names whose first half is shared with another. */
    async 'half-match-start'(_db, _user, _selected, ctx): Promise<ActionResult> {
      return {
        kind: 'list',
        rows: await ctx.list(sql`prakcodekm IN (SELECT prakmast.prakcodekm FROM prakmast
          WHERE SUBSTRING(prakname, 0, LEN(prakname) / 2) IN (SELECT SUBSTRING(prakname, 0, LEN(prakname) / 2)
            FROM prakmast GROUP BY prakname HAVING COUNT(SUBSTRING(prakname, 0, LEN(prakname) / 2)) > 1))`),
      };
    },
    async 'update-finance'(db, _user, selected, ctx): Promise<ActionResult> {
      const kt = int(ctx.params.financeKt);
      if (kt <= 0 || selected.length === 0) return { kind: 'message', message: '' };
      await sql`UPDATE prakmast SET FinanceKt = ${kt} WHERE prakcodekm IN ${idList(selected)}`.execute(
        db,
      );
      return { kind: 'refreshed', rows: [], message: 'Finance Updated in Selected Records' };
    },
    /** Print Contact For Selected Grid Records: ManualNo "from-to", then PrintPrakashakContact. */
    async 'print-contact'(_db, _user, _selected, ctx): Promise<ActionResult> {
      const parts = String(ctx.params.range ?? '').split('-');
      const [from, to] = parts.map((p) => Math.trunc(Number(p.trim())));
      if (parts.length !== 2 || !Number.isFinite(from) || !Number.isFinite(to)) {
        return { kind: 'message', message: 'Please Enter ManualNo in Proper Format(Ex:1-100)' };
      }
      return longTable(ctx, 'Prakashak Contact', `EXEC PrintPrakashakContact ${from}, ${to}`);
    },
    /** Filter › Show Records Used in Selection Master. */
    async 'filter-selection'(_db, _user, _selected, ctx): Promise<ActionResult> {
      return {
        kind: 'list',
        rows: await ctx.list(sql`prakcodekm IN (SELECT prakashakkt FROM SelectionM)`),
      };
    },
  },
};
