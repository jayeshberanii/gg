import type { ActionResult, GridRow, GridValue } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { type Executor, idList, inTransaction } from '../../db/legacy-sql.js';
import {
  bookReport,
  lekhPrastavanaReport,
  visheshParishishtReport,
  visheshReport,
} from '../../reports/book.js';
import { prepareWorkReport, writeWorkReport } from '../work-report-log.js';
import { ids, int, scalar, signBetween, table, text } from './book-common.js';
import type { ActionContext, ScreenDefinition } from './registry.js';
import { masterGrid } from './master-common.js';

/**
 * Book Master's right-click menu (cntMenu), handler by handler. Items that need the desktop's
 * file shares, Excel templates or Crystal Reports say so instead (see the doc).
 */

type Actions = NonNullable<ScreenDefinition['actions']>;

const toIds = (list: readonly number[]) => idList(list.length ? list : [0]);
const param = (ctx: ActionContext, name: string) => ctx.params[name];
const numberParam = (ctx: ActionContext, name: string) => int(param(ctx, name));
const textParam = (ctx: ActionContext, name: string) => text(param(ctx, name));
const idsParam = (ctx: ActionContext, name: string): number[] => {
  const v = param(ctx, name);
  if (Array.isArray(v)) return v;
  return text(v)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
};

async function openWhere(
  db: Executor,
  screen: string,
  query: RawBuilder<unknown>,
  emptyMessage: string,
): Promise<ActionResult> {
  return { kind: 'open', screen, ids: await ids(db, query), emptyMessage };
}

/** A computed table the desktop pushes into Excel (SendtoExcel), or its "nothing" message. */
async function excel(
  db: Executor,
  title: string,
  query: RawBuilder<unknown>,
  emptyMessage?: string,
): Promise<ActionResult> {
  const t = await table(db, query);
  return { kind: 'table', title, ...t, ...(emptyMessage ? { emptyMessage } : {}) };
}

/** A stored procedure's own error, which the desktop shows as it is (MsgBox(ex.Message)). */
async function runProc<T>(statement: () => Promise<T>): Promise<T> {
  try {
    return await statement();
  } catch (err) {
    const e = err as { number?: number; message?: string };
    if (typeof e.number === 'number' && e.message) throw new BadRequestException(e.message);
    throw err;
  }
}

// ------------------------------------------------------------------------------------------
// The form's shared routines
// ------------------------------------------------------------------------------------------

/** UpdateTxtBookTran: BookM.txtBookTran rebuilt from the books' library numbers. */
export async function updateTxtBookTran(db: Executor, books: readonly number[]) {
  await sql`
    UPDATE BookM SET txtBookTran = (SELECT STUFF((SELECT ',' + T.Libno FROM BookT T WHERE T.BookMastkt = Main.BookMastkm
      FOR XML PATH('')), 1, 1, '')) FROM BookM Main WHERE BookMastkm IN ${toIds(books)}
  `.execute(db);
}

/** UpdateTxtAuthor: praksnAuthorT.txtAuth, then BookM.txtAuthor, rebuilt from the author tables. */
export async function updateTxtAuthor(db: Executor, books: readonly number[]) {
  await sql`
    UPDATE praksnAuthorT SET txtAuth = (SELECT STUFF((SELECT ',' + AT.authortype + CASE WHEN ISNULL(colAT.Name, '') = '' THEN '' ELSE '(' + colAT.Name + ')' END
      FROM PraksnAuthorAuthTypeT PT LEFT JOIN authtype AT ON PT.authortypekt = AT.authtycokm
      LEFT JOIN columnmaster colAT ON PT.signkt = colAT.ColumnMastkm AND colAT.vibhag = 'Sign'
      WHERE PT.praksnauthorkt = praksnAuthorT.praksnauthorkm FOR XML PATH('')), 1, 1, ''))
    FROM praksnAuthorT WHERE praksnAuthorT.prakashannokt IN ${toIds(books)}
  `.execute(db);
  await sql`
    UPDATE praksnAuthorT SET txtAuth += '-' + (SELECT STUFF((SELECT ',' + auth.authorname
        + CASE WHEN ISNULL(auth.Identyty, '') = '' THEN '' ELSE '(' + auth.Identyty + ')' END
        + CASE WHEN ISNULL(VisPad.Vishesh, '') = '' THEN '' ELSE '(' + VisPad.Vishesh + ')' END
        + CASE WHEN ISNULL(colA.Name, '') = '' THEN '' ELSE '(' + colA.Name + ')' END
      FROM praksnAuthorAuthT PA LEFT JOIN authmast auth ON PA.authorkt = auth.authorcokm
      LEFT JOIN VisheshMast VisPad ON PA.padkt = VisPad.Tid AND VisPad.remark = 'Avastha'
      LEFT JOIN columnmaster colA ON PA.signkt = colA.ColumnMastkm AND colA.vibhag = 'Sign'
      WHERE PA.praksnauthorkt = praksnAuthorT.praksnauthorkm FOR XML PATH('')), 1, 1, ''))
    FROM praksnAuthorT WHERE praksnAuthorT.prakashannokt IN ${toIds(books)}
  `.execute(db);
  await sql`
    UPDATE BookM SET txtAuthor = (SELECT STUFF((SELECT ',' + txtAuth FROM praksnAuthorT PM WHERE PM.prakashannokt = BookM.BookMastkm
      ORDER BY PM.seq FOR XML PATH('')), 1, 1, '')) FROM BookM WHERE BookM.BookMastkm IN ${toIds(books)}
  `.execute(db);
}

/** UpdateTxtPrakashak: BookM.txtPrakashak rebuilt from praksnPrakT. */
export async function updateTxtPrakashak(db: Executor, books: readonly number[]) {
  await sql`
    UPDATE BookM SET txtPrakashak = (SELECT STUFF((SELECT ',' + prakmast.prakname
        + CASE WHEN ISNULL(columnmaster.Name, '') = '' THEN '' ELSE '-' + columnmaster.Name END
        + CASE WHEN ISNULL(praksnPrakT.remark, '') = '' THEN '' ELSE '-' + praksnPrakT.remark END
        + CASE WHEN ISNULL(colSign.Name, '') = '' THEN '' ELSE '-' + colSign.Name END
      FROM praksnPrakT INNER JOIN prakmast ON praksnPrakT.prakashakkt = prakmast.prakcodekm
      LEFT OUTER JOIN columnmaster ON praksnPrakT.PrakTypekt = columnmaster.ColumnMastkm
      LEFT OUTER JOIN columnmaster colSign ON praksnPrakT.signkt = colSign.ColumnMastkm
      WHERE praksnPrakT.prakashannokt = BookM.BookMastkm ORDER BY praksnPrakT.seq FOR XML PATH('')), 1, 1, ''))
    FROM BookM WHERE BookM.BookMastkm IN ${toIds(books)}
  `.execute(db);
}

/** GetBookMastkmForSameGroupNo for several books: them, or every book of their common groups. */
function sameGroupSql(books: readonly number[]) {
  return sql`SELECT BookMastkm FROM BookM
    WHERE (ISNULL(CommonGrpNo, 0) = 0 AND BookMastkm IN ${toIds(books)})
      OR (ISNULL(CommonGrpNo, 0) > 0 AND CommonGrpNo IN (SELECT CommonGrpNo FROM BookM WHERE BookMastkm IN ${toIds(books)}))`;
}

/**
 * DeleteTran's tables for a book that goes away (Merge Record, Delete Petank). The desktop only
 * empties those whose popup changed on the open record, which leaves the rest orphaned.
 */
async function deleteChildren(trx: Executor, book: number) {
  await sql`DELETE FROM praksnPrakT WHERE prakashannokt = ${book}`.execute(trx);
  await sql`DELETE FROM praksnBhashaT WHERE prakshnokt = ${book}`.execute(trx);
  await sql`DELETE FROM praksnLipiT WHERE prakashankt = ${book}`.execute(trx);
  await sql`DELETE FROM PraksnAuthorAuthTypeT WHERE prakashannokt = ${book}`.execute(trx);
  await sql`DELETE FROM praksnAuthorAuthT WHERE prakashannokt = ${book}`.execute(trx);
  await sql`DELETE FROM praksnAuthorT WHERE prakashannokt = ${book}`.execute(trx);
  await sql`DELETE FROM praksnVisheshT WHERE prakashannokt = ${book}`.execute(trx);
  await sql`DELETE FROM PraksnVishAutT WHERE prakashannokt = ${book}`.execute(trx);
  await sql`DELETE FROM PraksnVishBhasT WHERE prakashannokt = ${book}`.execute(trx);
  await sql`DELETE FROM BookVibhagT WHERE BookMastKt = ${book}`.execute(trx);
}

/** The lock password Book Master's LockUnlockTransaction asks for (shared with authmast / krutimst). */
const lockPassword = (ctx: ActionContext) => ctx.env.AUTHOR_LOCK_PASSWORD ?? '';

// ------------------------------------------------------------------------------------------
// The actions
// ------------------------------------------------------------------------------------------

export const bookActions: Actions = {
  // ---------------------------------------------------------------- For Selected Record ----
  async 'kruti-master'(db, _user, selected) {
    return openWhere(
      db,
      'kruti-master',
      sql`SELECT krutimstkt AS id FROM krutireflibno
        WHERE (BookTKt IN (SELECT Tid FROM BookT WHERE BookMastkt IN (${sameGroupSql(selected)})) AND krutireflibno.IsCommonGroup = 1)
          OR (BookTKt IN (SELECT Tid FROM BookT WHERE BookMastkt IN ${toIds(selected)}) AND krutireflibno.IsCommonGroup = 0)`,
      'No Kruti Available for Current Selection',
    );
  },
  async 'prakashak-master'(db, _user, selected) {
    return openWhere(
      db,
      'prakashak-master',
      sql`SELECT prakashakkt AS id FROM praksnPrakT WHERE prakashannokt IN ${toIds(selected)}`,
      'No Prakashan Available for Current Selection',
    );
  },
  async 'author-master-all'(db, _user, selected) {
    return openWhere(
      db,
      'author-master',
      sql`SELECT DISTINCT Authorkt AS id FROM praksnAuthorAuthT WHERE prakashannokt IN ${toIds(selected)}
        UNION SELECT DISTINCT Authorkt FROM PraksnVishAutT WHERE prakashannokt IN ${toIds(selected)}`,
      'No Record Found',
    );
  },
  async 'author-master-author'(db, _user, selected) {
    return openWhere(
      db,
      'author-master',
      sql`SELECT DISTINCT Authorkt AS id FROM praksnAuthorAuthT WHERE prakashannokt IN ${toIds(selected)}`,
      'No Record Found',
    );
  },
  async 'author-master-prak-vishesh'(db, _user, selected) {
    return openWhere(
      db,
      'author-master',
      sql`SELECT DISTINCT Authorkt AS id FROM PraksnVishAutT WHERE prakashannokt IN ${toIds(selected)}`,
      'No Record Found',
    );
  },
  // The BookT form for the selected books (frmBookTranNew.strTid).
  async 'book-t-ids'(db, _user, selected) {
    const t = await ids(
      db,
      sql`SELECT tid AS id FROM BookT WHERE BookMastkt IN ${toIds(selected)} GROUP BY tid`,
    );
    return { kind: 'table', title: 'BookT', columns: ['tid'], rows: t.map((id) => [id]) };
  },
  async 'work-given-master'(db, _user, selected) {
    return openWhere(
      db,
      'work-given-master',
      sql`SELECT WorkGivenMKt AS id FROM BookM WHERE BookMastkm IN ${toIds(selected)}`,
      'No Record Found',
    );
  },
  async 'selection-master'(db, _user, selected) {
    return openWhere(
      db,
      'selection-master',
      sql`SELECT SelectionMkt AS id FROM BookM WHERE BookMastkm IN ${toIds(selected)}
        UNION SELECT SelectionMkm FROM SelectionM WHERE SelectionM.LibNokt IN (SELECT tid FROM BookT WHERE BookMastkt IN ${toIds(selected)})`,
      'No Selection Available',
    );
  },
  // Catalog Master: by the catalogue's copy number (Yes), its book (No) or either (Cancel).
  async 'catalog-master'(db, _user, selected, ctx) {
    const mode = textParam(ctx, 'mode');
    const { rows } = await sql<{ tid: number; LibNo: string }>`
      SELECT Tid AS tid, LibNo FROM BookT WHERE BookMastKt IN ${toIds(selected)}`.execute(db);
    const tids = rows.map((r) => Number(r.tid));
    const libNos = rows.map((r) => text(r.LibNo));
    const byCopy = sql`bhandtran.cplibnoKt IN ${toIds(tids)}`;
    const byBook = sql`BookT.LibNo IN (SELECT val FROM dbo.SplitString(${libNos.join('~')}, '~'))`;
    const where = mode === 'yes' ? byCopy : mode === 'no' ? byBook : sql`${byBook} OR ${byCopy}`;
    return openWhere(
      db,
      'catalogue-master',
      sql`SELECT bhandtran.bhandtranKm AS id FROM bhandtran INNER JOIN BookT ON bhandtran.entrcodekt = BookT.bookmastkt WHERE ${where}`,
      'No Catalog Found for Selected Book',
    );
  },
  async 'anya-bhandar'(db, _user, selected) {
    return openWhere(
      db,
      'anya-bhandar',
      sql`SELECT DISTINCT AnyaBhandarKm AS id FROM AnyaBhandarM WHERE BookMastKt IN ${toIds(selected)}`,
      'No Record Found',
    );
  },
  async 'prakashan-list-anya-bhandar'(db, _user, _selected, ctx) {
    const book = numberParam(ctx, 'current');
    return openWhere(
      db,
      'book-master-anya-bhandar',
      sql`SELECT prakshnlistnokm AS id FROM praksnlistAnyaBndrM WHERE BookTKt IN (SELECT Tid FROM BookT WHERE BookMastKt = ${book})`,
      '',
    );
  },
  async 'graphic-master'(db, _user, selected) {
    return openWhere(
      db,
      'graphics-master',
      sql`SELECT GraphicBKM AS id FROM GraphicBKM WHERE BookTKt IN (SELECT Tid FROM BookT WHERE BookMastkt IN ${toIds(selected)})`,
      'No Graphics Available for Current Selection',
    );
  },
  // Granth Mala: praksnM's granth malas for every record the grid shows, in Vishesh Master.
  async 'granth-mala'(db, _user, _selected, ctx) {
    const found = await ids(
      db,
      sql`SELECT DISTINCT granthmalakt AS id FROM praksnM WHERE granthmalakt > 0 AND praksnnokm IN ${toIds(idsParam(ctx, 'gridIds'))}`,
    );
    return {
      kind: 'open',
      screen: 'vishesh-master',
      ids: found.length ? found : [0],
      emptyMessage: '',
    };
  },
  async 'inword-master'(db, _user, selected) {
    return openWhere(
      db,
      'inward-master',
      sql`SELECT DISTINCT InwordKt AS id FROM BookT WHERE BookMastkt IN ${toIds(selected)}`,
      'No Record Found',
    );
  },
  async 'party-master'(db, _user, selected) {
    const found = await ids(
      db,
      sql`SELECT DISTINCT P.prapticokt AS id FROM BookM BM INNER JOIN BookT BT ON BM.BookMastKm = BT.BookMastKt
        LEFT JOIN praptitran P ON P.tid = BT.tid WHERE BM.BookMastkm IN ${toIds(selected)}
        UNION SELECT DISTINCT BM.bhandarcokt FROM BookM BM INNER JOIN BookT BT ON BM.BookMastKm = BT.BookMastKt
        WHERE ISNULL(BM.bhandarcokt, 0) > 0 AND BM.BookMastkm IN ${toIds(selected)}`,
    );
    return {
      kind: 'open',
      screen: 'party-master',
      ids: found.length ? found : [0],
      emptyMessage: '',
    };
  },
  async 'issue-master'(db, _user, selected) {
    return openWhere(
      db,
      'issue-master',
      sql`SELECT IssueTranKm AS id FROM IssueTran WHERE entrcodekt IN (SELECT tid FROM BookT WHERE BookMastkt IN ${toIds(selected)})`,
      'No Record Found',
    );
  },
  async 'magazine-master'(db, _user, selected) {
    return openWhere(
      db,
      'magazine-master',
      sql`SELECT DISTINCT Magazinekt AS id FROM MagBookmT WHERE bookmastkt IN ${toIds(selected)} AND ISNULL(bookmastkt, 0) > 0`,
      'No Record Found',
    );
  },
  async 'tirth-raksha-master'(db, _user, selected) {
    const found = await ids(
      db,
      sql`SELECT DISTINCT TirthRakshaReferenceT.TirthRakshaKt AS id FROM TirthRakshaReferenceT
        INNER JOIN BookT ON TirthRakshaReferenceT.BookTKt = BookT.tid WHERE BookT.BookMastkt IN ${toIds(selected)}`,
    );
    return {
      kind: 'open',
      screen: 'tirth-raksha-master',
      ids: found.length ? found : [0],
      emptyMessage: '',
    };
  },

  // Utility
  async 'merge-record'(db, _user, selected, ctx) {
    if (selected.length <= 1)
      return { kind: 'message', message: 'Please select more than 1 record to merge' };
    const keep = numberParam(ctx, 'keep');
    if (keep <= 0 || !selected.includes(keep)) return { kind: 'message', message: '' };
    ctx.assertPassword(ctx.params.password);
    await inTransaction(db, async (trx) => {
      for (const book of selected.filter((b) => b !== keep)) {
        await deleteChildren(trx, book);
        await sql`UPDATE BookT SET BookMastkt = ${keep} WHERE BookMastkt = ${book}`.execute(trx);
        await sql`DELETE FROM BookM WHERE BookMastkm = ${book}`.execute(trx);
      }
      await updateTxtBookTran(trx, [keep]);
    });
    return { kind: 'list', rows: await ctx.list() };
  },
  async 'update-libno-text'(db, _user, selected) {
    await updateTxtBookTran(db, selected);
    return { kind: 'refreshed', rows: [] };
  },
  async 'set-link-with-kruti'(db, _user, selected, ctx) {
    const kt = numberParam(ctx, 'linkKt');
    if (kt <= 0) return { kind: 'message', message: '' };
    const result = await sql`
      UPDATE BookM SET LinkWithKruti = ${kt} WHERE (LinkWithKruti = 0 OR LinkWithKruti > 2) AND BookMastkm IN ${toIds(selected)}
    `.execute(db);
    return {
      kind: 'refreshed',
      rows: [],
      message: `Total (${Number(result.numAffectedRows ?? 0)}) records updated successfully`,
    };
  },
  async 'set-project-work'(db, _user, selected, ctx) {
    const kt = numberParam(ctx, 'projectKt');
    if (kt <= 0) return { kind: 'message', message: '' };
    const result =
      await sql`UPDATE BookM SET ProjectWorkKt = ${kt} WHERE BookMastkm IN ${toIds(selected)}`.execute(
        db,
      );
    return {
      kind: 'refreshed',
      rows: [],
      message: `Total (${Number(result.numAffectedRows ?? 0)}) records updated successfully`,
    };
  },

  // ----------------------------------------------------------------- For Current Record ----
  // Delete Petank: the other books sharing this book's library numbers from a "/" rack.
  async 'delete-petank'(db, user, _selected, ctx) {
    ctx.assertPassword(ctx.params.password);
    const book = numberParam(ctx, 'current');
    const name = textParam(ctx, 'bookName').trim();
    const others = await ids(
      db,
      sql`SELECT DISTINCT BookMastkt AS id FROM BookT WHERE Libno IN (SELECT Libno FROM BookT WHERE BookMastkt = ${book})
        AND BookMastkt <> ${book} AND CupBoardRackNo LIKE '%/%'`,
    );
    for (const other of others) {
      await inTransaction(db, async (trx) => {
        await deleteChildren(trx, other);
        await sql`DELETE FROM praptitran WHERE tid IN (SELECT Tid FROM BookT WHERE BookMastkt = ${other})`.execute(
          trx,
        );
        await sql`DELETE FROM BookT WHERE BookMastkt = ${other}`.execute(trx);
        await sql`DELETE FROM BookM WHERE BookMastkm = ${other}`.execute(trx);
      });
      await writeWorkReport(db, 'BookM', 'BookMastkm', other, user.id, `Delete ${name}`);
    }
    return { kind: 'message', message: '' };
  },
  async 'copy-subject'(db, _user, _selected, ctx) {
    const book = numberParam(ctx, 'current');
    const to = idsParam(ctx, 'to');
    if (to.length === 0) return { kind: 'message', message: '' };
    await runProc(() =>
      sql`EXEC CopyBookSubject @BookMastKm = ${book}, @StrBookMastKm = ${to.join(',')}`.execute(db),
    );
    return { kind: 'message', message: 'Subject Copied Successfully' };
  },
  async 'magazine-vishesh'(db, _user, _selected, ctx) {
    const book = numberParam(ctx, 'current');
    return openWhere(
      db,
      'magazine-vishesh-master-old',
      sql`SELECT BookMagazineVisheshKm AS id FROM BookMagazineVisheshT WHERE BookMastKt = ${book}`,
      'No Record Found',
    );
  },
  // txtBookName_PreviewKeyDown (Tab): other "OB" books with the same name.
  async 'duplicate-name'(db, _user, _selected, ctx) {
    return openWhere(
      db,
      'book-master',
      sql`SELECT DISTINCT BookMastkm AS id FROM BookM WHERE ',' + txtBookTran LIKE '%,OB%'
        AND BookName = ${textParam(ctx, 'name').trim()} AND BookMastkm <> ${numberParam(ctx, 'current')}`,
      '',
    );
  },
  // The Info box's F2 (txtPM_GBKM_SEL_PLIST_IMG_KeyDown): GetSignFromLibNo with the mix signs.
  async 'sign-from-libno'(db, _user, _selected, ctx) {
    const book = numberParam(ctx, 'current');
    return { kind: 'message', message: await signFromLibNo(db, book, true) };
  },

  // The lists the Part's Group / Common Group / Replace In Selected items pick from.
  async 'group-heads'(db, _user, _selected, ctx) {
    const t = await table(
      db,
      sql`SELECT BookMastKm, BookName, Part FROM BookM WHERE ISNULL(GrpName, '') <> '' AND BookMastKm IN ${toIds(idsParam(ctx, 'gridIds'))}`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'common-heads'(db, _user, _selected, ctx) {
    const t = await table(
      db,
      sql`SELECT BookMastKm, BookName, CommonGrpNo, Part FROM BookM WHERE ISNULL(CommonGrpNo, '0') <> '0' AND BookMastKm IN ${toIds(idsParam(ctx, 'gridIds'))}`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'selected-books'(db, _user, selected, ctx) {
    const t = await table(
      db,
      param(ctx, 'withLibNo')
        ? sql`SELECT BookMastkm, txtBookTran AS LibNo, BookName FROM BookM WHERE BookMastkm IN ${toIds(selected)} ORDER BY BookName`
        : sql`SELECT BookMastKm, BookName, Part FROM BookM WHERE BookMastKm IN ${toIds(selected)}`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'authors-of'(db, _user, selected) {
    const t = await table(
      db,
      sql`SELECT praksnAuthorAuthT.authorkt, authmast.authorname AS Author FROM authmast
        INNER JOIN praksnAuthorAuthT ON authmast.authorcokm = praksnAuthorAuthT.authorkt WHERE praksnAuthorAuthT.prakashannokt IN ${toIds(selected)}
        UNION ALL SELECT PraksnVishAutT.Authorkt, authmast.authorname FROM PraksnVishAutT
        INNER JOIN authmast ON PraksnVishAutT.Authorkt = authmast.authorcokm WHERE PraksnVishAutT.prakashannokt IN ${toIds(selected)}`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'author-types-of'(db, _user, selected) {
    const t = await table(
      db,
      sql`SELECT PraksnAuthorAuthTypeT.authortypekt, authtype.authortype AS AuthorType FROM authtype
        INNER JOIN PraksnAuthorAuthTypeT ON authtype.authtycokm = PraksnAuthorAuthTypeT.authortypekt
        WHERE PraksnAuthorAuthTypeT.prakashannokt IN ${toIds(selected)}
        GROUP BY PraksnAuthorAuthTypeT.authortypekt, authtype.authortype ORDER BY authtype.authortype`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'prakashaks-of'(db, _user, selected) {
    const t = await table(
      db,
      sql`SELECT praksnPrakT.prakashakkt, prakmast.prakname FROM prakmast INNER JOIN praksnPrakT ON prakmast.prakcodekm = praksnPrakT.prakashakkt
        WHERE praksnPrakT.prakashannokt IN ${toIds(selected)} GROUP BY praksnPrakT.prakashakkt, prakmast.prakname ORDER BY prakmast.prakname`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'gmalas-of'(db, _user, selected) {
    const t = await table(
      db,
      sql`SELECT praksnM.granthmalakt, visheshMast.Vishesh AS GranthMala FROM praksnM INNER JOIN visheshMast ON praksnM.granthmalakt = visheshMast.Tid
        WHERE praksnM.praksnnokm IN ${toIds(selected)} GROUP BY praksnM.granthmalakt, visheshMast.Vishesh ORDER BY visheshMast.Vishesh`,
    );
    return { kind: 'table', title: 'list', ...t };
  },

  // ------------------------------------------------------------------------ Part's Group ----
  async 'group-add-new'(db, _user, selected, ctx) {
    const head = numberParam(ctx, 'head');
    const name = textParam(ctx, 'name');
    if (head <= 0 || name === '') return { kind: 'message', message: '' };
    await inTransaction(db, async (trx) => {
      const grpNo = Number(
        (await scalar(
          trx,
          sql`SELECT ISNULL(MAX(grpno), 0) + 1 FROM BookM WITH (UPDLOCK, HOLDLOCK)`,
        )) ?? 1,
      );
      await sql`
        UPDATE BookM SET GrpNo = ${grpNo}, GrpName = ${name}, GrpParichayakName = ${textParam(ctx, 'pariName')},
          grppart = ${textParam(ctx, 'parts')} WHERE BookMastKm = ${head}`.execute(trx);
      await sql`
        UPDATE BookM SET GrpNo = ${grpNo}, GrpName = '', GrpParichayakName = '', grppart = ''
        WHERE BookMastKm IN ${toIds(selected)} AND BookMastKm <> ${head}`.execute(trx);
    });
    return { kind: 'refreshed', rows: [] };
  },
  // The head keeps its group name (the desktop blanks it too when it is among the selected rows).
  async 'group-add-existing'(db, _user, selected, ctx) {
    const head = numberParam(ctx, 'head');
    if (head <= 0) return { kind: 'message', message: '' };
    const grpNo = int(await scalar(db, sql`SELECT grpno FROM BookM WHERE BookMastKm = ${head}`));
    await sql`
      UPDATE BookM SET GrpNo = ${grpNo}, GrpName = '', GrpParichayakName = '', grppart = ''
      WHERE BookMastKm IN ${toIds(selected)} AND BookMastKm <> ${head}`.execute(db);
    return { kind: 'refreshed', rows: [] };
  },
  async 'group-delete'(db, _user, selected, ctx) {
    ctx.assertPassword(ctx.params.password);
    await sql`
      UPDATE BookM SET GrpNo = 0, GrpName = '', GrpParichayakName = '', grppart = '' WHERE BookMastKm IN ${toIds(selected)}
    `.execute(db);
    return { kind: 'refreshed', rows: [] };
  },

  // ------------------------------------------------------------------------ Common Group ----
  // Ctrl+G: every book of the current row's common group, not just the 100 the grid holds.
  async 'current-common-group'(db, _user, _selected, ctx) {
    const grp = numberParam(ctx, 'commonGrpNo');
    if (grp <= 0) return { kind: 'message', message: '' };
    return { kind: 'list', rows: await ctx.list(sql`CommonGrpNo = ${grp}`) };
  },
  // Ctrl+P (v3.4.3.1), Parts Group › Show Book of Current Group Parts: likewise for GrpNo.
  async 'current-part-group'(db, _user, _selected, ctx) {
    const grp = numberParam(ctx, 'grpNo');
    if (grp <= 0) return { kind: 'message', message: '' };
    return { kind: 'list', rows: await ctx.list(sql`Grpno = ${grp}`) };
  },
  // Show All Book of Common Group (v3.4.3.1): every book that has a common group, not only
  // those among the grid's rows, in CommonGrpNo order (a stable sort of the newest-first list).
  async 'all-common-groups'(db, _user, _selected, ctx) {
    const rows = await ctx.list(sql`ISNULL(CommonGrpNo, 0) > 0`);
    const grp = (r: GridRow) => Number(r.CommonGrpNo) || 0;
    return { kind: 'list', rows: [...rows].sort((a, b) => grp(a) - grp(b)) };
  },
  async 'common-add-new'(db, _user, selected) {
    await inTransaction(db, async (trx) => {
      const grpNo = Number(
        (await scalar(
          trx,
          sql`SELECT ISNULL(MAX(CommonGrpNo), 0) + 1 FROM BookM WITH (UPDLOCK, HOLDLOCK)`,
        )) ?? 1,
      );
      await sql`UPDATE BookM SET CommonGrpNo = ${grpNo} WHERE BookMastKm IN ${toIds(selected)}`.execute(
        trx,
      );
    });
    return { kind: 'refreshed', rows: [] };
  },
  async 'common-add-existing'(db, _user, selected, ctx) {
    const from = numberParam(ctx, 'from');
    if (from <= 0) return { kind: 'message', message: '' };
    const grpNo = int(
      await scalar(db, sql`SELECT CommonGrpNo FROM BookM WHERE BookMastKm = ${from}`),
    );
    await sql`UPDATE BookM SET CommonGrpNo = ${grpNo} WHERE BookMastKm IN ${toIds(selected)}`.execute(
      db,
    );
    return { kind: 'refreshed', rows: [] };
  },
  async 'common-delete'(db, _user, selected) {
    let count = 0;
    await inTransaction(db, async (trx) => {
      const groups = await ids(
        trx,
        sql`SELECT CommonGrpNo AS id FROM BookM WHERE BookMastKm IN ${toIds(selected)}`,
      );
      for (const book of selected) {
        const r = await sql`UPDATE BookM SET CommonGrpNo = 0 WHERE BookMastKm = ${book}`.execute(
          trx,
        );
        // The desktop reports the last update's count, then adds the clean-up's.
        count = Number(r.numAffectedRows ?? 0);
      }
      if (groups.length > 0) {
        const r = await sql`
          UPDATE BookM SET CommonGrpNo = 0 WHERE CommonGrpNo IN (SELECT CommonGrpNo FROM BookM
            WHERE CommonGrpNo IN ${toIds(groups)} GROUP BY CommonGrpNo HAVING COUNT(CommonGrpNo) = 1)
        `.execute(trx);
        count += Number(r.numAffectedRows ?? 0);
      }
    });
    return {
      kind: 'refreshed',
      rows: [],
      message: `Common Group from ( ${count}) Records Deleted Successfully`,
    };
  },
  // Show Common Group Having Single Record (v3.4.3.1: GetDataTable with this WhereCondition,
  // so the newest `listLimit` of the books that are alone in their group, not a filter of the
  // grid's rows).
  async 'common-single'(db, _user, _selected, ctx) {
    return {
      kind: 'list',
      rows: await ctx.list(
        sql`BookMastKm IN (SELECT BookMastkm FROM BookM WHERE CommonGrpNo IN (SELECT CommonGrpNo FROM BookM
          WHERE (CommonGrpNo > 0) GROUP BY CommonGrpNo HAVING COUNT(CommonGrpNo) = 1))`,
        { limit: true },
      ),
    };
  },
  async 'common-single-reset'(db) {
    const result = await sql`
      UPDATE BookM SET CommonGrpNo = 0 WHERE CommonGrpNo IN (SELECT CommonGrpNo FROM BookM WHERE CommonGrpNo > 0
        GROUP BY CommonGrpNo HAVING COUNT(CommonGrpNo) = 1)`.execute(db);
    const n = Number(result.numAffectedRows ?? 0);
    return { kind: 'message', message: n > 0 ? `(${n}) Records Updated Successfully` : '' };
  },

  // ----------------------------------------------------------------------------- Utility ----
  // v3.4.3.1: matched by the library row's key (was by the LibNo text), sent to Excel. A NULL
  // BookTKt in krutireflibno would make the desktop's NOT IN find nothing; it is left out here.
  async 'no-ref-libno'(db) {
    return excel(
      db,
      'BookM',
      sql`SELECT DISTINCT BookMastkm, BookName FROM BookM INNER JOIN BookT ON BookM.BookMastkm = BookT.BookMastkt
        WHERE tid NOT IN (SELECT BookTKt FROM krutireflibno WHERE BookTKt IS NOT NULL)`,
      'No Records Found',
    );
  },
  async 'libno-in-range'(db, _user, _selected, ctx) {
    const series = textParam(ctx, 'series');
    const from = numberParam(ctx, 'from');
    const to = numberParam(ctx, 'to');
    const like = `${series.replace(/[[\]%_]/g, (c) => `[${c}]`)}%`;
    const where = param(ctx, 'all')
      ? sql`BookMastkm IN (SELECT T.BookMastKt FROM BookT T WHERE T.LibNo LIKE ${like}
          AND CAST(SUBSTRING(T.LibNo, 3, LEN(T.LibNo) - 2) AS int) BETWEEN ${from} AND ${to})`
      : sql`BookMastkm IN (SELECT T.BookMastKt FROM BookT T WHERE T.LibNo LIKE ${like}
          AND SUBSTRING(T.LibNo, 3, LEN(T.LibNo) - 2) BETWEEN ${from} AND ${to}
          AND T.BookMastkt NOT IN (SELECT T.BookMastKt FROM BookT T WHERE T.LibNo LIKE ${like}
            AND SUBSTRING(T.LibNo, 3, LEN(T.LibNo) - 2) < ${from}))`;
    return { kind: 'list', rows: await runProc(() => ctx.list(where)) };
  },
  async 'transfer-mix-sign'(db, _user, _selected, ctx) {
    const sign = textParam(ctx, 'sign');
    if (sign === '') return { kind: 'message', message: '' };
    ctx.assertPassword(ctx.params.password);
    const like = `%,${sign.replace(/[[\]%_]/g, (c) => `[${c}]`)},%`;
    await inTransaction(db, async (trx) => {
      await sql`UPDATE BookT SET Mixsign = ',' + Mixsign WHERE ISNULL(Mixsign, '') <> '' AND SUBSTRING(Mixsign, 1, 1) <> ','`.execute(
        trx,
      );
      await sql`UPDATE BookT SET Mixsign = Mixsign + ',' WHERE ISNULL(Mixsign, '') <> '' AND SUBSTRING(Mixsign, LEN(Mixsign), 1) <> ','`.execute(
        trx,
      );
      const books = await ids(
        trx,
        sql`SELECT DISTINCT BookMastkt AS id FROM BookT WHERE Mixsign LIKE ${like}`,
      );
      await sql`UPDATE BookT SET Mixsign = REPLACE(Mixsign, ${`,${sign}`}, '') WHERE Mixsign LIKE ${like}`.execute(
        trx,
      );
      await sql`UPDATE BookM SET Mixsign = '' WHERE Mixsign IS NULL`.execute(trx);
      await sql`UPDATE BookM SET Mixsign = Mixsign + ',' WHERE ISNULL(Mixsign, '') <> '' AND SUBSTRING(Mixsign, LEN(Mixsign), 1) <> ','`.execute(
        trx,
      );
      for (const book of books) {
        await sql`UPDATE BookM SET Mixsign = Mixsign + ${`${sign},`} WHERE BookMastkm = ${book}`.execute(
          trx,
        );
      }
    });
    return { kind: 'message', message: '' };
  },
  // Show Missing And Duplicate No: Print_MissingNo's gaps and the series' duplicates.
  async 'missing-dup-libno'(db, _user, _selected, ctx) {
    const series = textParam(ctx, 'series');
    const kind = textParam(ctx, 'kind');
    if (kind === 'missing') {
      const t = await runProc(() => table(db, sql`EXEC Print_MissingNo 'libary', ${series}`));
      return { kind: 'table', title: 'Missing', ...t, emptyMessage: 'No Missing Record found' };
    }
    const like = `${series.replace(/[[\]%_]/g, (c) => `[${c}]`)}%`;
    return excel(
      db,
      'Duplicate',
      sql`SELECT libno FROM BookT WHERE libno LIKE ${like} GROUP BY libno HAVING COUNT(libno) > 1 ORDER BY libno`,
      'No duplicate Record found',
    );
  },
  async 'save-stock-libno'(db, user, _selected, ctx) {
    const series = textParam(ctx, 'series');
    const like = `${series.replace(/[[\]%_]/g, (c) => `[${c}]`)}%`;
    await inTransaction(db, async (trx) => {
      const missing = await runProc(() =>
        table(trx, sql`EXEC Print_MissingNo 'libary', ${series}`),
      );
      const { rows: dup } = await sql<{ libno: string }>`
        SELECT libno FROM BookT WHERE libno LIKE ${like} GROUP BY libno HAVING COUNT(libno) > 1 ORDER BY libno`.execute(
        trx,
      );
      const { rows: range } = await sql<{ MinLibNo: string | null; MaxLibNo: string | null }>`
        SELECT MIN(libno) AS MinLibNo, MAX(libno) AS MaxLibNo FROM BookT WHERE libno LIKE ${like}`.execute(
        trx,
      );
      const id = Number(
        (await scalar(
          trx,
          sql`SELECT ISNULL(MAX(id), 0) + 1 FROM StockLibNo WITH (UPDLOCK, HOLDLOCK)`,
        )) ?? 1,
      );
      await sql`
        INSERT INTO StockLibNo (Id, Series, FirstLastno, MissingNos, DuplicateNos, Remark, Endate, Enuser)
        VALUES (${id}, ${series}, ${`${text(range[0]?.MinLibNo)} - ${text(range[0]?.MaxLibNo)}`},
          ${missing.rows.map((r) => text(r[0])).join(',')}, ${dup.map((r) => text(r.libno)).join(',')},
          ${textParam(ctx, 'remark')}, CONVERT(date, SYSDATETIME()), ${user.id})
      `.execute(trx);
    });
    return { kind: 'message', message: '' };
  },

  // Replace In Selected
  async 'replace-author'(db, _user, selected, ctx) {
    const from = numberParam(ctx, 'from');
    const to = numberParam(ctx, 'to');
    if (from > 0 && to > 0) {
      await inTransaction(db, async (trx) => {
        await sql`UPDATE praksnAuthorAuthT SET authorkt = ${to}, AuthAnyaNmKt = 0 WHERE authorkt = ${from} AND prakashannokt IN ${toIds(selected)}`.execute(
          trx,
        );
        await sql`UPDATE PraksnVishAutT SET authorkt = ${to}, AuthAnyaNmKt = 0 WHERE authorkt = ${from} AND prakashannokt IN ${toIds(selected)}`.execute(
          trx,
        );
        await updateTxtAuthor(trx, selected);
      });
    }
    return { kind: 'list', rows: await ctx.list() };
  },
  async 'replace-author-type'(db, _user, selected, ctx) {
    const from = numberParam(ctx, 'from');
    const to = numberParam(ctx, 'to');
    if (from > 0 && to > 0) {
      await inTransaction(db, async (trx) => {
        await sql`UPDATE PraksnAuthorAuthTypeT SET authortypekt = ${to} WHERE authortypekt = ${from} AND prakashannokt IN ${toIds(selected)}`.execute(
          trx,
        );
        await updateTxtAuthor(trx, selected);
      });
    }
    return { kind: 'list', rows: await ctx.list() };
  },
  async 'replace-prakashak'(db, _user, selected, ctx) {
    const from = numberParam(ctx, 'from');
    const to = numberParam(ctx, 'to');
    if (from > 0 && to > 0) {
      await inTransaction(db, async (trx) => {
        await sql`UPDATE praksnPrakT SET prakashakkt = ${to}, nameSelected = '' WHERE prakashakkt = ${from} AND prakashannokt IN ${toIds(selected)}`.execute(
          trx,
        );
        await updateTxtPrakashak(trx, selected);
      });
    }
    return { kind: 'list', rows: await ctx.list() };
  },
  async 'replace-granth-mala'(db, _user, selected, ctx) {
    await sql`
      UPDATE praksnM SET granthmalakt = ${numberParam(ctx, 'to')} WHERE granthmalakt = ${numberParam(ctx, 'from')}
        AND praksnnokm IN ${toIds(selected)}`.execute(db);
    return { kind: 'list', rows: await ctx.list() };
  },
  async 'replace-vishesh-colno'(db, _user, _selected, ctx) {
    const rowsToChange = idsParam(ctx, 'vishesh');
    const col = numberParam(ctx, 'column');
    if (rowsToChange.length === 0 || col <= 0) return { kind: 'message', message: '' };
    const result =
      await sql`UPDATE praksnVisheshT SET ColumnMastkt = ${col} WHERE prksnvisheshkm IN ${toIds(rowsToChange)}`.execute(
        db,
      );
    return {
      kind: 'message',
      message: `Colno Sucessfully Replaced in ${Number(result.numAffectedRows ?? 0)} Records  `,
    };
  },
  async 'replace-vishesh-detail'(db, _user, _selected, ctx) {
    const rowsToChange = idsParam(ctx, 'vishesh');
    const col = numberParam(ctx, 'column');
    const result = await sql`
      UPDATE praksnVisheshT SET Detail = ${textParam(ctx, 'detail')} WHERE ColumnMastkt = ${col}
        AND prksnvisheshkm IN ${toIds(rowsToChange)}`.execute(db);
    return {
      kind: 'message',
      message: `Detail Sucessfully Replaced in ${Number(result.numAffectedRows ?? 0)} Records `,
    };
  },
  async 'vishesh-of-grid'(db, _user, _selected, ctx) {
    const t = await table(
      db,
      sql`SELECT prksnvisheshkm, CAST(columnmaster.ColumnNo AS varchar(4)) AS ColumnNo, BookM.BookName, Detail
        FROM praksnVisheshT INNER JOIN BookM ON praksnVisheshT.prakashannokt = BookM.BookMastkm
        INNER JOIN columnmaster ON praksnVisheshT.ColumnMastkt = columnmaster.ColumnMastkm
        WHERE praksnVisheshT.prakashannokt IN ${toIds(idsParam(ctx, 'gridIds'))} ORDER BY BookName, ColumnNo`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'vishesh-of-column'(db, _user, _selected, ctx) {
    const t = await table(
      db,
      sql`SELECT prksnvisheshkm, Detail FROM praksnVisheshT WHERE ColumnMastkt = ${numberParam(ctx, 'column')}`,
    );
    return { kind: 'table', title: 'list', ...t };
  },

  // Report counters (administrators)
  async 'restart-report-counter'(db, user, _selected, ctx) {
    if (!user.isAdmin) throw new BadRequestException('Only an administrator can do this');
    ctx.assertPassword(ctx.params.password);
    await sql`UPDATE reports SET plistLno = NULL WHERE plistLno = (SELECT MAX(plistLno) AS pl FROM reports)`.execute(
      db,
    );
    await sql`UPDATE reports SET KrutiLNo = NULL WHERE KrutiLNo = (SELECT MAX(KrutiLNo) AS pl FROM reports)`.execute(
      db,
    );
    return { kind: 'message', message: 'Restart Your Last Report Counter successfully !' };
  },
  async 'report-table'(db) {
    return excel(
      db,
      'frmPopup',
      sql`SELECT r.reportno, c.Name, c.columnNo, r.pnofrom, r.pnoto, r.kpnofrom, r.kpnoto FROM reports AS r
        LEFT OUTER JOIN columnmaster AS c ON r.vibhagkt = c.ColumnMastkm
        WHERE ISNULL(pnofrom, 0) > 0 OR ISNULL(kpnofrom, 0) > 0 ORDER BY r.vibhagkt`,
    );
  },
  async 'gsearch-records'(_db, user, _selected, ctx) {
    if (!user.isAdmin) throw new BadRequestException('Only an administrator can do this');
    const picked = idsParam(ctx, 'gsearch');
    if (picked.length === 0) return { kind: 'message', message: '' };
    return {
      kind: 'list',
      rows: await ctx.list(
        sql`BookMastkm IN (SELECT tableid FROM GSearchT WHERE GSearchMkt IN ${toIds(picked)} AND FormNm = 'BookM')`,
      ),
    };
  },
  // Find Mismatch of LibNo / Author: books whose stored text no longer matches their rows.
  async 'mismatch-libno'(db) {
    const { rows } = await sql<{
      BookMastkm: number;
      txtBookTran: string | null;
      LibNo: string | null;
      n: number;
    }>`
      SELECT M.BookMastkm, M.txtBookTran,
        (SELECT STUFF((SELECT ',' + T.Libno FROM BookT T WHERE T.BookMastkt = M.BookMastkm AND ISNULL(T.Libno, '') <> ''
          ORDER BY T.tid FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, '')) AS LibNo,
        (SELECT COUNT(*) FROM BookT T WHERE T.BookMastkt = M.BookMastkm) AS n
      FROM BookM M`.execute(db);
    const out: GridValue[][] = [];
    for (const r of rows) {
      if (Number(r.n) > 0 || text(r.txtBookTran) !== '') {
        if (text(r.LibNo) !== text(r.txtBookTran))
          out.push([r.BookMastkm, text(r.txtBookTran), text(r.LibNo)]);
      }
    }
    return {
      kind: 'table',
      title: 'Mismatch of LibNo',
      columns: ['BookMastkm', 'txtBookTran', 'LibNo'],
      rows: out,
    };
  },
  async 'mismatch-author'(db) {
    const { rows } = await sql<{
      BookMastkm: number;
      txtAuthor: string | null;
      Author: string | null;
      n: number;
    }>`
      SELECT M.BookMastkm, M.txtAuthor,
        (SELECT STUFF((SELECT ',' + A.txtAuth FROM praksnAuthorT A WHERE A.prakashannokt = M.BookMastkm AND ISNULL(A.txtAuth, '') <> ''
          ORDER BY A.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, '')) AS Author,
        (SELECT COUNT(*) FROM praksnAuthorT A WHERE A.prakashannokt = M.BookMastkm AND ISNULL(A.txtAuth, '') <> '') AS n
      FROM BookM M`.execute(db);
    const out: GridValue[][] = [];
    for (const r of rows) {
      if (Number(r.n) > 0 || text(r.txtAuthor) !== '') {
        if (text(r.Author) !== text(r.txtAuthor))
          out.push([r.BookMastkm, text(r.txtAuthor), text(r.Author)]);
      }
    }
    return {
      kind: 'table',
      title: 'Mismatch of Author',
      columns: ['BookMastkm', 'txtAuth', 'Author'],
      rows: out,
    };
  },
  async 'update-psamvatvk'(db) {
    await runProc(() => sql`EXEC UpdateVikSamvat 'BookM', ''`.execute(db));
    return { kind: 'message', message: '' };
  },
  async 'update-name-selected'(db) {
    await sql`
      UPDATE P SET P.nameSelected = '' FROM praksnPrakT P INNER JOIN prakmast M ON P.prakashakkt = M.prakcodekm
      WHERE ISNULL(P.nameSelected, '') = ISNULL(M.prakname, '')`.execute(db);
    return { kind: 'message', message: '' };
  },
  async 'update-author-selected'(db) {
    await sql`
      UPDATE P SET P.AuthAnyaNmKt = NULL FROM praksnAuthorAuthT P INNER JOIN authmast a ON P.authorkt = a.authorcokm
      LEFT JOIN AuthMAnyNmT ON P.AuthAnyaNmKt = AuthMAnyNmT.AuthAnyaNmKm
      WHERE ISNULL(AuthMAnyNmT.AnyaName, '') = ISNULL(a.authorname, '')`.execute(db);
    return { kind: 'message', message: '' };
  },
  async 'update-mix-sign'(db, _user, selected, ctx) {
    const sign = textParam(ctx, 'sign');
    if (sign === '') return { kind: 'message', message: '' };
    const result =
      await sql`UPDATE BookM SET Mixsign = mixsign + ',' + ${sign} WHERE Bookmastkm IN ${toIds(selected)}`.execute(
        db,
      );
    return {
      kind: 'refreshed',
      rows: [],
      message: `Mixsign Sucessfully updated in ${Number(result.numAffectedRows ?? 0)} Records  `,
    };
  },
  // Ctrl+L / Ctrl+U (LockUnlockTransaction): Locked plus moduser/moddate and a Lock work report entry.
  async 'lock-records'(db, user, selected, ctx) {
    ctx.assertPassword(ctx.params.password, lockPassword(ctx));
    const lock = Boolean(param(ctx, 'lock'));
    let count = 0;
    for (const id of selected) {
      const old = text(
        await scalar(
          db,
          sql`SELECT CASE WHEN ISNULL(Locked, 0) = 1 THEN 'True' ELSE 'False' END FROM BookM WHERE BookMastkm = ${id}`,
        ),
      );
      const now = lock ? 'True' : 'False';
      if (old === now) continue;
      await sql`UPDATE BookM SET Locked = ${lock ? 1 : 0}, moduser = ${user.id}, moddate = GETDATE() WHERE BookMastkm = ${id}`.execute(
        db,
      );
      const prepared = await prepareWorkReport(
        db,
        'BookM',
        'BookMastkm',
        id,
        user.id,
        { Locked: old },
        { Locked: now },
        'Lock',
      );
      if (prepared?.kind === 'write') {
        await writeWorkReport(
          db,
          'BookM',
          'BookMastkm',
          id,
          user.id,
          prepared.remark,
          prepared.workTypeId,
          prepared.mistake,
          prepared.mistakeCount,
          prepared.workTypeName,
        );
      }
      count++;
    }
    const message =
      count === 0
        ? ''
        : lock
          ? `(${count} ) Records Locked Successfully`
          : `(${count} ) Records UnLocked Successfully`;
    return { kind: 'refreshed', rows: [], message };
  },
  async 'update-link-with-kruti'(db) {
    const n = await runProc(async () => {
      const r = await sql`EXEC UpdateLinkWithKruti`.execute(db);
      return Number(r.numAffectedRows ?? 0);
    });
    return { kind: 'message', message: `Total (${n}) records updated successfully` };
  },
  async 'magazine-not-linked'(_db, _user, _selected, ctx) {
    return {
      kind: 'list',
      rows: await ctx.list(sql`BookMastkm IN (SELECT b.BookMastkm FROM bookM b WHERE b.BookMastkm NOT IN (SELECT bookmastkt FROM MagBookmT
        WHERE bookmastkt IS NOT NULL) AND (bookname LIKE N'%(मासिक)%' OR bookname LIKE N'%(साप्ताहिक)%' OR bookname LIKE N'%(पाक्षिक)%'
        OR bookname LIKE N'%(अर्धवार्षिक)%' OR bookname LIKE N'%(अर्धमासिक)%' OR bookname LIKE N'%(त्रिमासिक)%'
        OR bookname LIKE N'%(वार्षिक)%' OR bookname LIKE N'%विशेषांक%' OR bookname LIKE N'%Magazine%'))`),
    };
  },
  // Update For Selected Record › Selection Master / Workgiven Master.
  async 'selection-choices'(db, _user, selected) {
    const current = await ids(
      db,
      sql`SELECT SelectionMkt AS id FROM BookM WHERE ISNULL(SelectionMkt, 0) > 0 AND BookMastkm IN ${toIds(selected)} GROUP BY SelectionMkt`,
    );
    const { rows } = await sql<{ Libno: string }>`
      SELECT BookT.Libno FROM BookT INNER JOIN SelectionM ON tid = LibNokt WHERE SelectionMkM IN ${toIds(current)} GROUP BY BookT.Libno`.execute(
      db,
    );
    const list = await masterGrid(db, 'SelectionM', 'SelectionMKm');
    return {
      kind: 'table',
      title: rows.map((r) => text(r.Libno)).join('-'),
      columns: list.columns,
      rows: list.rows,
    };
  },
  async 'set-selection'(db, _user, selected, ctx) {
    const kt = numberParam(ctx, 'selectionKt');
    await sql`UPDATE BookM SET SelectionMKt = ${kt} WHERE Bookmastkm IN ${toIds(selected)}`.execute(
      db,
    );
    return { kind: 'refreshed', rows: [] };
  },
  async 'workgiven-choices'(db, _user, selected) {
    const current = await ids(
      db,
      sql`SELECT WorkGivenMkt AS id FROM BookM WHERE ISNULL(WorkGivenMkt, 0) > 0 AND BookMastkm IN ${toIds(selected)} GROUP BY WorkGivenMkt`,
    );
    const { rows } = await sql<{ WorkRemark: string }>`
      SELECT WorkRemark FROM WorkGivenM WHERE WorkGivenMkm IN ${toIds(current)} GROUP BY WorkRemark`.execute(
      db,
    );
    const list = await masterGrid(db, 'WorkGivenM', 'WorkGivenMkm');
    return {
      kind: 'table',
      title: rows.map((r) => text(r.WorkRemark)).join('-'),
      columns: list.columns,
      rows: list.rows,
    };
  },
  async 'set-workgiven'(db, _user, selected, ctx) {
    const kt = numberParam(ctx, 'workGivenKt');
    await sql`UPDATE BookM SET WorkGivenMkt = ${kt} WHERE Bookmastkm IN ${toIds(selected)}`.execute(
      db,
    );
    return { kind: 'refreshed', rows: [] };
  },
  // Update Kruti Seq (v3.4.3.1; was Update Book Akaradi Seq / UpdateBookKrutiAkaradiSeq): the
  // procedure renumbers BookM.KrutiAkaradiSeq for the picked sampraday; its result set is not
  // shown (ExecuteNonQuery). Nothing runs without a pick.
  async 'update-kruti-seq'(db, _user, _selected, ctx) {
    const sampradayKt = numberParam(ctx, 'sampradayKt');
    if (sampradayKt <= 0) return { kind: 'message', message: '' };
    await runProc(() => sql`EXEC PrintKrutiPrakashakReport ${sampradayKt}`.execute(db));
    return { kind: 'message', message: '' };
  },

  // ------------------------------------------------------------------------------ Filter ----
  async 'having-author-selected'(db) {
    return excel(
      db,
      'Having AuthorSelected',
      sql`SELECT P.prakashannokt AS BookMastKm, AuthMAnyNmT.AnyaName, a.authorname FROM praksnAuthorAuthT P
        LEFT JOIN authmast a ON P.authorkt = a.authorcokm LEFT JOIN AuthMAnyNmT ON P.AuthAnyaNmKt = AuthMAnyNmT.AuthAnyaNmKm
        WHERE ISNULL(P.AuthAnyaNmKt, 0) > 0 ORDER BY P.prakashannokt, AuthMAnyNmT.AnyaName`,
    );
  },
  async 'having-author-selected-no-author'(db) {
    return excel(
      db,
      'Having AuthorSelected',
      sql`SELECT P.prakashannokt AS BookMastKm, AuthMAnyNmT.AnyaName FROM praksnAuthorAuthT P
        LEFT JOIN authmast a ON P.authorkt = a.authorcokm LEFT JOIN AuthMAnyNmT ON P.AuthAnyaNmKt = AuthMAnyNmT.AuthAnyaNmKm
        WHERE ISNULL(P.AuthAnyaNmKt, 0) > 0 AND ISNULL(p.authorkt, 0) = 0 ORDER BY P.prakashannokt, AuthMAnyNmT.AnyaName`,
    );
  },
  async 'having-name-selected'(db) {
    return excel(
      db,
      'Having NameSelected',
      sql`SELECT P.prakashannokt AS BookMastKm, P.nameSelected, M.prakname FROM praksnPrakT P
        LEFT JOIN prakmast M ON P.prakashakkt = M.prakcodekm
        WHERE ISNULL(P.nameSelected, '') <> '' AND P.nameSelected <> M.prakname ORDER BY P.prakashannokt, P.nameSelected`,
    );
  },
  async 'having-name-selected-no-prak'(db) {
    return excel(
      db,
      'Having NameSelected',
      sql`SELECT P.prakashannokt AS BookMastKm, P.nameSelected FROM praksnPrakT P LEFT JOIN prakmast M ON P.prakashakkt = M.prakcodekm
        WHERE ISNULL(P.nameSelected, '') <> '' AND ISNULL(M.prakname, '') = '' ORDER BY P.prakashannokt, P.nameSelected`,
    );
  },
  // Distinct Common/Part GrpNo: FillList again, one row per group (GetDataTable's group loop).
  async 'distinct-groups'(_db, _user, _selected, ctx) {
    const mode = textParam(ctx, 'mode');
    const rows = await ctx.list();
    const byColumn = (list: GridRow[], column: string) => {
      const get = (r: GridRow) => Number(r[column] ?? r[column.toLowerCase()] ?? 0) || 0;
      const id = (r: GridRow) => Number(r.BookMastkm) || 0;
      const grouped = list
        .filter((r) => get(r) > 0)
        .sort((a, b) => get(a) - get(b) || id(a) - id(b));
      const firsts: GridRow[] = [];
      let last: number | null = null;
      for (const r of grouped) {
        if (get(r) !== last) firsts.push(r);
        last = get(r);
      }
      const ungrouped = list.filter((r) => get(r) === 0).sort((a, b) => id(a) - id(b));
      return [...ungrouped, ...firsts];
    };
    let out = rows;
    if (mode === 'common' || mode === 'both') out = byColumn(out, 'CommonGrpNo');
    if (mode === 'part' || mode === 'both') out = byColumn(out, 'Grpno');
    return { kind: 'list', rows: out };
  },
  async 'filter-libno'(_db, _user, _selected, ctx) {
    const libNo = textParam(ctx, 'libNo');
    if (libNo === '') return { kind: 'message', message: '' };
    return {
      kind: 'list',
      rows: await ctx.list(
        sql`txtBookTran LIKE ${`%${libNo.replace(/[[\]%_]/g, (c) => `[${c}]`)}%`}`,
      ),
    };
  },

  // ------------------------------------------------------------------------------- Print ----
  // frmWebBrowser: the report site's pages, built here (reports/book.ts).
  async 'new-vishesh-report'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await visheshReport({ db, env: ctx.env }, [numberParam(ctx, 'vibhagKt')]),
    };
  },
  async 'vishesh-columns-of-vibhag'(db, _user, _selected, ctx) {
    const t = await table(
      db,
      sql`SELECT DISTINCT C.ColumnMastkm, C.Name, C.ColumnNo FROM praksnVisheshT P
        INNER JOIN columnmaster C ON P.ColumnMastkt = C.ColumnMastkm INNER JOIN BookVibhagT BV ON P.prakashannokt = BV.BookMastKt
        WHERE BV.VibhagKt IN ${toIds(idsParam(ctx, 'vibhag'))}`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'vishesh-parishisht-report'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await visheshParishishtReport(
        { db, env: ctx.env },
        {
          printDetail: Boolean(param(ctx, 'printDetail')),
          columns: idsParam(ctx, 'column'),
          vibhags: idsParam(ctx, 'vibhag'),
          printVibhag: Boolean(param(ctx, 'printVibhag')),
        },
      ),
    };
  },
  // Home/PrintParishisht, the page the report above replaced. No menu item opens it, on the
  // desktop either; it is kept so every page of the report site has its counterpart.
  async 'vishesh-parishisht-report-old'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await visheshParishishtReport(
        { db, env: ctx.env },
        {
          printDetail: Boolean(param(ctx, 'printDetail')),
          columns: idsParam(ctx, 'column'),
          vibhags: idsParam(ctx, 'vibhag'),
          printVibhag: Boolean(param(ctx, 'printVibhag')),
        },
        true,
      ),
    };
  },
  async 'lekh-prastavana-report'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await lekhPrastavanaReport(
        { db, env: ctx.env },
        idsParam(ctx, 'column'),
        idsParam(ctx, 'vibhag'),
      ),
    };
  },
  // Book Report: the procedure reads the chosen print numbers from TranIds.
  async 'book-report'(db, _user, _selected, ctx) {
    const nos = idsParam(ctx, 'printNos');
    if (nos.length === 0) return { kind: 'message', message: '' };
    return { kind: 'report', document: await bookReport({ db, env: ctx.env }, nos) };
  },
  async 'printno-with-kruti'(db, _user, _selected, ctx) {
    const from = numberParam(ctx, 'from');
    const to = numberParam(ctx, 'to');
    if (textParam(ctx, 'kind') === 'kruti') {
      const { rows: krutis } = await sql<Record<string, GridValue>>`
        SELECT K.pno, K.extranm, K.Author, K.Bhasha, K.Swaroop, K.Rsamvatvir, K.desi FROM krutiMst K
        WHERE K.pno BETWEEN ${from} AND ${to} ORDER BY CAST(k.pno AS int)`.execute(db);
      const { rows: books } = await sql<{
        PrintNo: number;
        BookName: string;
        parichayakname: string;
      }>`
        SELECT B.PrintNo, B.BookName, ISNULL(b.parichayakname, '') AS parichayakname FROM BookM B
        WHERE ISNULL(B.PrintNo, 0) > 0 AND ((ISNULL(B.GrpNo, 0) = 0) OR (B.GrpNo > 0 AND ISNULL(GrpParichayakName, '') <> ''))`.execute(
        db,
      );
      const columns = [
        'pno',
        'extranm',
        'Author',
        'Bhasha',
        'Swaroop',
        'Rsamvatvir',
        'desi',
        'BookName',
        'parichayakname',
      ];
      const out: GridValue[][] = [];
      let lastPno = '';
      for (const k of krutis) {
        for (const d of text(k.desi).trim().split(',')) {
          if (d.trim() === '' || d.trim() === ',') continue;
          for (const b of books.filter((x) => String(x.PrintNo) === d)) {
            const first = lastPno !== text(k.pno);
            out.push([
              first ? (k.pno ?? null) : null,
              first ? (k.extranm ?? null) : null,
              first ? (k.Author ?? null) : null,
              first ? (k.Bhasha ?? null) : null,
              first ? (k.Swaroop ?? null) : null,
              first ? (k.Rsamvatvir ?? null) : null,
              d,
              b.BookName,
              b.parichayakname,
            ]);
            lastPno = text(k.pno);
          }
        }
      }
      return { kind: 'table', title: 'PrintNo With Kruti', columns, rows: out };
    }
    const { rows: books } = await sql<Record<string, GridValue>>`
      SELECT B.PrintNo, B.BookName, b.parichayakname, B.KNo FROM BookM B WHERE B.PrintNo BETWEEN ${from} AND ${to} ORDER BY B.PrintNo`.execute(
      db,
    );
    const { rows: krutis } = await sql<Record<string, GridValue>>`
      SELECT K.pno, K.extranm, K.Author, K.Bhasha, K.Swaroop, K.Rsamvatvir FROM krutiMst K WHERE ISNULL(K.pno, '') <> ''`.execute(
      db,
    );
    const columns = [
      'PrintNo',
      'BookName',
      'parichayakname',
      'KNo',
      'KrutiName',
      'Author',
      'Bhasha',
      'Swaroop',
      'Rsamvatvir',
    ];
    const out: GridValue[][] = [];
    let lastPrint = '';
    for (const b of books) {
      for (const kno of text(b.KNo).split(',')) {
        if (kno.trim() === '') continue;
        for (const k of krutis.filter((x) => text(x.pno) === kno)) {
          const first = lastPrint !== text(b.PrintNo);
          out.push([
            first ? (b.PrintNo ?? null) : null,
            first ? (b.BookName ?? null) : null,
            first ? (b.parichayakname ?? null) : null,
            kno,
            k.extranm ?? null,
            k.Author ?? null,
            k.Bhasha ?? null,
            k.Swaroop ?? null,
            k.Rsamvatvir ?? null,
          ]);
          lastPrint = text(b.PrintNo);
        }
      }
    }
    return { kind: 'table', title: 'PrintNo With Book', columns, rows: out };
  },
  async 'magazine-vishesh-report'(db, _user, selected) {
    return excel(
      db,
      'Magazine Vishesh',
      sql`WITH PAGING AS (
          SELECT ROW_NUMBER() OVER (PARTITION BY BookM.BookName ORDER BY BookM.BookName) AS GroupRowNumber,
            ROW_NUMBER() OVER (ORDER BY BookM.BookName, BookMagazineVisheshT.Seq) AS RowNumber,
            BookM.BookName, BookMagazineVisheshT.Seq, BookT.LibNo, BookMagazineVisheshT.Year, BookMagazineVisheshT.Ank,
            BookMagazineVisheshT.HeadName, Detail,
            (SELECT LTRIM(RTRIM((SELECT STUFF((SELECT ' ' + vishay.vishay_nm + ISNULL(vachan.vachan_nm, '') + ISNULL(vibhakti.vibh_nm, '')
              FROM VishayEntry INNER JOIN vishay ON VishayEntry.VishayKt = vishay.vishaycokm
              LEFT JOIN vachan ON VishayEntry.VachanKt = vachan.vachancokm LEFT JOIN vibhakti ON VishayEntry.VibhaktiKt = vibhakti.vibhaktikm
              WHERE VishayEntry.TransactionName = 'BookMagazineVishesh' AND BookMagazineVisheshT.BookMagazineVisheshKm = VishayEntry.RecordKt
              ORDER BY BookMagazineVisheshT.seq, VishayEntry.Seq FOR XML PATH('')), 1, 1, ''))))) AS MainDetail,
            BookMagazineVisheshT.BhashaName AS Bhasha, BookMagazineVisheshT.MTypeName AS MType, colStatus.Name AS Status,
            BookMagazineVisheshT.AuthorTypeName AS AutorType, BookMagazineVisheshT.AuthorName AS Author, BookMagazineVisheshT.PageNo,
            BookMagazineVisheshT.Sabhar, BookMagazineVisheshT.Reference, PartyM.PName AS WorkDoneBy, BookMagazineVisheshT.PDFPageNo,
            BookMagazineVisheshT.PDFPath, columnmaster.Name AS ColumnName
          FROM BookMagazineVisheshT INNER JOIN BookM ON BookMagazineVisheshT.BookMastKt = BookM.BookMastkm
          LEFT JOIN columnmaster ON BookMagazineVisheshT.ColumnMastkt = columnmaster.ColumnMastkm
          LEFT JOIN columnmaster AS colStatus ON BookMagazineVisheshT.StatusKt = colStatus.ColumnMastkm
          LEFT JOIN PartyM ON BookMagazineVisheshT.WorkDoneByKt = PartyM.partyMkm
          LEFT JOIN BookT ON BookMagazineVisheshT.BookTKt = BookT.Tid
          WHERE BookMagazineVisheshT.BookMastKt IN ${toIds(selected)})
        SELECT CASE WHEN GroupRowNumber = 1 THEN BookName ELSE '' END AS BookName, Seq, LibNo, Year, Ank, HeadName, Detail,
          MainDetail, Bhasha, MType, Status, AutorType, Author, PageNo, Sabhar, Reference, WorkDoneBy, PDFPageNo, PDFPath, ColumnName
        FROM PAGING ORDER BY RowNumber`,
      'No Records Found',
    );
  },
  async 'prak-vishesh-columns'(db, _user, selected) {
    const t = await table(
      db,
      sql`SELECT DISTINCT columnmaster.ColumnMastkm, columnmaster.Name AS ColumnName, columnmaster.ColumnNo
        FROM praksnVisheshT INNER JOIN columnmaster ON praksnVisheshT.ColumnMastkt = columnmaster.ColumnMastkm
        WHERE praksnVisheshT.prakashannokt IN ${toIds(selected)} ORDER BY columnmaster.ColumnNo`,
    );
    return { kind: 'table', title: 'list', ...t };
  },
  async 'prak-vishesh-report'(db, _user, selected, ctx) {
    const columns = idsParam(ctx, 'columns');
    const t = await runProc(() =>
      table(
        db,
        sql`EXEC PrintPrakashanVishesh @BookMastKt = ${selected.join(',')}, @ColumnMastKt = ${columns.join(',')}`,
      ),
    );
    return { kind: 'table', title: 'Prak Vishesh', ...t };
  },
  // VK Samvat Report: GetBookMVKSamvatReport over the selected books, via the shared TranIds table.
  async 'vk-samvat-report'(db, _user, selected) {
    const t = await inTransaction(db, async (trx) => {
      await sql`EXEC SetTranIds 0`.execute(trx);
      await sql`EXEC SetTranIds 1, ${selected.join(',')}`.execute(trx);
      const result = await runProc(() => table(trx, sql`EXEC GetBookMVKSamvatReport`));
      await sql`EXEC SetTranIds 0`.execute(trx);
      return result;
    });
    return { kind: 'table', title: 'VK Samvat Report', ...t };
  },
};

/** GetSignFromLibNo: where the book's library numbers are used (P, G, S, PL, K, KR, CL, MAG). */
export async function signFromLibNo(
  db: Executor,
  book: number,
  withMixSign: boolean,
  only?: number[],
): Promise<string> {
  const tids = only ?? (await ids(db, sql`SELECT tid AS id FROM BookT WHERE BookMastKt = ${book}`));
  const t = toIds(tids);
  const checks: [RawBuilder<unknown>, string][] = [
    [sql`SELECT COUNT(praksnnokm) FROM praksnM WHERE BookTKt IN ${t}`, 'P'],
    [sql`SELECT COUNT(GraphicBKM) FROM GraphicBKM WHERE BookTKt IN ${t}`, 'G'],
    [sql`SELECT COUNT(SelectionMkm) FROM SelectionM WHERE LibNoKt IN ${t}`, 'S'],
    [sql`SELECT COUNT(prakshnlistnokm) FROM praksnlistAnyaBndrM WHERE BookTKt IN ${t}`, 'PL'],
    [sql`SELECT COUNT(krutiReflibnokm) FROM KrutiRefLibNo WHERE BookTKt IN ${t}`, 'K'],
    [sql`SELECT COUNT(KrutiNoteKm) FROM KrutiNoteT WHERE BookTKt IN ${t}`, 'KR'],
    [sql`SELECT COUNT(bhandtran.bhandtranKm) FROM bhandtran WHERE entrcodekt IN ${t}`, 'CL'],
    [sql`SELECT COUNT(MagBookmTKm) FROM MagBookmT WHERE bookmastkt = ${book}`, 'MAG'],
  ];
  let res = '';
  for (const [query, sign] of checks) {
    if (Number((await scalar(db, query)) ?? 0) > 0) res = signBetween(res, sign);
  }
  if (withMixSign) {
    const { rows } = await sql<{ m: string | null }>`
      SELECT DISTINCT Mixsign AS m FROM BookT WHERE Tid IN ${t} AND Mixsign IS NOT NULL`.execute(
      db,
    );
    const mix = rows.map((r) => text(r.m)).join(',');
    if (mix !== '') res = signBetween(res, `{${mix}}`);
  }
  return res;
}
