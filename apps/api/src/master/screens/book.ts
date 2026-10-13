import type { FieldValue, GridValue, SessionUser } from '@gglib/shared';
import { UserType } from '@gglib/shared';
import { sql } from 'kysely';
import type { Executor } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { bookActions } from './book-actions.js';
import {
  asDesktopError,
  bit,
  contString,
  ddmmyyyy,
  extra,
  get,
  grid,
  int,
  intText,
  list,
  nextKey,
  put,
  type Row,
  scalar,
  SIGN_UNDER_10,
  signBetween,
  text,
  val,
} from './book-common.js';
import type { ListParams, ScreenDefinition, TransDefinition } from './registry.js';
import { saveVishayEntries, VISHAY_ENTRY_LOOKUPS } from './vishay-entry.js';

/**
 * Library › Book Master (frmBookMasterNew). Table BookM, key BookMastkm (identity). The form has
 * no repository: its own Save, DeleteTran and Delete are ported here, with the popups it opens
 * from frmDisplayTransNew (setform_prakashan). See docs/screens/book-master.md.
 */

// ------------------------------------------------------------------------------------------
// Validation (Save(), before "Are You Sure to Save This Record?")
// ------------------------------------------------------------------------------------------

/** The library number prefixes whose books must carry the full description. */
const FULL_ENTRY_PREFIXES = [',B0', ',S0', ',C0', ',X0', ',XP'];

export function validateBook(f: Record<string, FieldValue>, id: number): string {
  if (text(f.BookName).trim() === '') return 'Please Enter BookName';
  if (id === 0) return '';
  if (text(f.BookTran).trim() === '') return 'Please Enter LibNo in BookT';
  const libNos = `,${text(f.BookTran)}`;
  if (!FULL_ENTRY_PREFIXES.some((p) => libNos.includes(p))) return '';
  let missing = '';
  const need = (ok: boolean, label: string) => {
    if (!ok) missing += `\r\n- ${label}`;
  };
  need(val(f.PSamvatcokt) !== 0, 'Smvt Type');
  need(val(f.Avrutikt) !== 0, 'Avruti');
  need(val(f.GMalaKt) !== 0, 'GMalaName');
  need(text(f.Pages) !== '', 'Pgs');
  need(text(f.TotalPages) !== '', 'TotPgs');
  need(text(f.Price) !== '', 'Price');
  need(text(f.Size) !== '', 'Size');
  need(val(f.ShapeKt) !== 0, 'Shape');
  need(text(f.PrakTran).trim() !== '', 'Prakashak');
  need(text(f.AuthTran).trim() !== '', 'Author');
  need(text(f.BhasTran).trim() !== '', 'Bhasha');
  need(text(f.LipiTran).trim() !== '', 'Lipi');
  return missing ? `Please Enter Required Fields:${missing}` : '';
}

// ------------------------------------------------------------------------------------------
// The text boxes' summaries the form recomputes on Save
// ------------------------------------------------------------------------------------------

async function signShortName(db: Executor, kt: number, vibhagSign: boolean) {
  const { rows } = vibhagSign
    ? await sql<{ ShortNm: string; ColumnNo: number }>`
        SELECT ISNULL(ShortNm, '') AS ShortNm, ISNULL(ColumnNo, 0) AS ColumnNo FROM columnmaster
        WHERE ColumnMastkm = ${kt} AND vibhag = 'Sign'`.execute(db)
    : await sql<{ ShortNm: string; ColumnNo: number }>`
        SELECT ISNULL(ColumnNo, 0) AS ColumnNo, ISNULL(ShortNm, '') AS ShortNm FROM ColumnMaster
        WHERE ISNULL(ShortNm, '') <> '' AND ColumnMastkm = ${kt}`.execute(db);
  const r = rows[0];
  return r && r.ShortNm !== '' && Number(r.ColumnNo) > 0 ? `(${r.ShortNm})` : '';
}

/**
 * Save(): txtAuthTran rebuilt from the Author popup's rows (the type's name —
 * authtype.authortype since v3.4.3.1, authtyattr before — names, marks).
 */
async function authorText(
  db: Executor,
  authors: Row[],
  auths: Row[],
  authTypes: Row[],
): Promise<string> {
  let out = '';
  for (const a of authors) {
    const key = get(a, 'praksnauthorkm');
    let st = '';
    let st1 = '';
    for (const t of authTypes.filter((r) => get(r, 'praksnauthorkt') === key)) {
      const attr = await scalar<string>(
        db,
        sql`SELECT ISNULL(authortype, '') FROM authtype WHERE authtycokm = ${int(get(t, 'authortypekt'))}`,
      );
      st = signBetween(st.trim(), attr ?? '');
      st += await signShortName(db, int(get(t, 'signkt')), true);
    }
    for (const r of auths.filter((x) => get(x, 'praksnauthorkt') === key)) {
      st1 = signBetween(
        st1.trim(),
        text(get(r, 'AnyaName')).trim() !== ''
          ? text(get(r, 'AnyaName'))
          : text(get(r, 'AuthorName')),
      );
      const { rows: pad } = await sql<{ Vishesh: string; VShortNm: string }>`
        SELECT ISNULL(Vishesh, '') AS Vishesh, ISNULL(shortnm, '') AS VShortNm FROM VisheshMast
        WHERE Tid = ${int(get(r, 'padkt'))} AND remark = 'Avastha'`.execute(db);
      if (text(get(r, 'Guru')).trim() !== '') st1 += `(${text(get(r, 'Guru'))})`;
      const identity = text(get(r, 'Identyty'));
      if (!(identity === '' && pad.length === 0)) {
        st1 += `[${identity}-${pad[0] ? pad[0].VShortNm : ''}]`;
        st1 = st1.replace('-]', ']');
      }
      st1 += await signShortName(db, int(get(r, 'signkt')), true);
    }
    out = signBetween(out.trim(), signBetween(st, st1, '-'));
  }
  return out.trim().split('(/)').join(' /').split('/,').join('/');
}

/** Save(): txtPrakTran rebuilt from the Prakashak popup's rows. */
async function prakashakText(db: Executor, rows: Row[]): Promise<string> {
  let out = '';
  for (const r of rows) {
    if (text(get(r, 'Purva')) === 'True') out = signBetween(out, '(P)');
    const selected = text(get(r, 'nameSelected')).trim();
    out = signBetween(out, selected !== '' ? selected : text(get(r, 'prakname')).trim(), ', ');
    if (text(get(r, 'PrakType')).trim() !== '')
      out += await signShortName(db, int(get(r, 'PrakTypekt')), false);
    if (text(get(r, 'sign')).trim() !== '')
      out += await signShortName(db, int(get(r, 'signkt')), false);
    else out += ', ';
  }
  if (out.trim() !== '' && out.trim().endsWith(',')) out = out.trim().replace(/,+$/, '');
  return out.trim().split('(/)').join(' /').trim().split(',,').join(',').split('/,').join('/');
}

// ------------------------------------------------------------------------------------------
// Save
// ------------------------------------------------------------------------------------------

/** The loaded record's joined texts the form compares its boxes with (dtSel). */
async function loadedTexts(db: Executor, id: number) {
  const { rows } = await sql<{
    PrakTran: string | null;
    BhasTran: string | null;
    LipiTran: string | null;
    MagazineRemarkTran: string | null;
    BookSubjTran: string | null;
  }>`
    SELECT txtPrakashak AS PrakTran, txtBhasha AS BhasTran, txtLipi AS LipiTran,
      (SELECT STUFF((SELECT ',' + ISNULL(Remark, '') FROM BookMagazineRemarkT
        WHERE BookMagazineRemarkT.BookMastkt = BookM.BookMastkm FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, '')) AS MagazineRemarkTran,
      LTRIM(RTRIM(dbo.ReplaceVishayInPlainText((SELECT STUFF((SELECT ', ' + ISNULL(BookSubjectT.Vishay, N'') FROM BookSubjectT
        WHERE BookSubjectT.BookMastKt = BookM.BookMastkm ORDER BY BookSubjectT.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''))))) AS BookSubjTran
    FROM BookM WHERE BookMastkm = ${id}
  `.execute(db);
  const r = rows[0];
  return {
    PrakTran: text(r?.PrakTran),
    BhasTran: text(r?.BhasTran),
    LipiTran: text(r?.LipiTran),
    MagazineRemarkTran: text(r?.MagazineRemarkTran),
    // FillData keeps GetcontString of the loaded text in dtSel.
    BookSubjTran: contString(text(r?.BookSubjTran)).trim(),
  };
}

/**
 * Save() of frmBookMasterNew, in one transaction. A child table is rewritten on the same
 * conditions as the desktop: Prakashak, Bhasha, Lipi and Magazine Remark when their box no
 * longer reads as loaded; Author on a new record or after its popup was saved; Vishesh and Book
 * Subject whenever their popup was loaded; Vibhag after its popup was saved.
 */
async function saveBook(
  trx: Executor,
  userId: number,
  id: number,
  f: Record<string, FieldValue>,
): Promise<number> {
  const add = id === 0;
  const old = add ? null : await loadedTexts(trx, id);
  const changed = (column: keyof NonNullable<typeof old>) => {
    const now = text(f[column]).trim();
    return old ? old[column].trim() !== now : now !== '';
  };

  const grpNo = val(f.Grpno);
  const grpLocked = bit(f.GrpLocked);
  const grpName = grpNo === 0 || grpLocked ? '' : text(f.GrpName).trim();
  const grpPari = grpNo === 0 || grpLocked ? '' : text(f.GrpParichayakName).trim();
  const grpPart = grpNo === 0 ? '' : text(f.GrpPart).trim();

  const prakRows = grid(f, 'PrakTran');
  const bhashaRows = grid(f, 'BhasTran');
  const lipiRows = grid(f, 'LipiTran');
  const authorRows = grid(f, 'AuthTran');
  const visheshRows = grid(f, 'praksnVisheshTran');
  const vibhagRows = grid(f, 'VibhagTran');
  const subjectRows = grid(f, 'BookSubjTran');
  const remarkRows = grid(f, 'MagazineRemarkTran');

  const rewrite = {
    prak: changed('PrakTran'),
    bhasha: changed('BhasTran'),
    lipi: changed('LipiTran'),
    remark: changed('MagazineRemarkTran'),
    author: add || authorRows !== null,
    vishesh: visheshRows !== null,
    vibhag: vibhagRows !== null,
    subject: (subjectRows !== null && subjectRows.length > 0) || (!add && changed('BookSubjTran')),
  };

  // DeleteTran
  if (!add) {
    if (rewrite.prak) await sql`DELETE FROM praksnPrakT WHERE prakashannokt = ${id}`.execute(trx);
    if (rewrite.bhasha) await sql`DELETE FROM praksnBhashaT WHERE prakshnokt = ${id}`.execute(trx);
    if (rewrite.lipi) await sql`DELETE FROM praksnLipiT WHERE prakashankt = ${id}`.execute(trx);
    if (authorRows !== null) await deleteAuthors(trx, id);
    if (rewrite.vishesh) await deleteVishesh(trx, id);
    if (rewrite.vibhag) await sql`DELETE FROM BookVibhagT WHERE BookMastKt = ${id}`.execute(trx);
  }

  const values = {
    BookName: text(f.BookName).trim(),
    ParichayakName: text(f.ParichayakName).trim(),
    Part: text(f.Part).trim(),
    TitleDetail: text(f.TitleDetail).trim(),
    PSamvatcokt: int(f.PSamvatcokt),
    PSamvat: text(f.PSamvat).trim(),
    PSamvatVK: intText(f.PSamvatVK),
    Avrutikt: int(f.Avrutikt),
    Pages: text(f.Pages).trim(),
    TotalPages: intText(f.TotalPages),
    Pariman: text(f.Pariman).trim(),
    Price: text(f.Price).trim(),
    GMalaKt: int(f.GMalaKt),
    GMalaNo: text(f.GMalaNo).trim(),
    Size: text(f.Size).trim(),
    ShapeKt: int(f.ShapeKt),
    Bind_PaperKt: int(f.Bind_PaperKt),
    PrintStylekt: int(f.PrintStylekt),
    FundTypeKt: int(f.FundTypeKt),
    Nakal: intText(f.Nakal),
    ISBNNo: text(f.ISBNNo).trim(),
    PLSthalkt: int(f.PLSthalkt),
    Vishesh: text(f.Vishesh).trim(),
    Grpno: intText(f.Grpno),
    GrpName: grpName,
    GrpParichayakName: grpPari,
    CommonGrpNo: intText(f.CommonGrpNo),
    Remark: text(f.Remark),
    MixSign: text(f.MixSign).trim(),
    MixSignRem: text(f.MixSignRem),
    // Val(txtVibhagTran.Tag): nothing ever sets that Tag, so the desktop always writes 0.
    KrutiHeadKt: 0,
    PrintNo: Math.trunc(val(f.PrintNo)),
    bhandarcokt: int(f.bhandarcokt),
    Hastpratno: text(f.Hastpratno),
    HastpratSize: text(f.HastpratSize),
    panktiAkshar: text(f.panktiAkshar),
    LSamvcokt: int(f.LSamvcokt),
    LSamvat: text(f.LSamvat),
    LSamvatVK: int(f.LSamvatVK),
    AdiVakya: text(f.AdiVakya),
    AntVakya: text(f.AntVakya),
    PartNo: text(f.PartNo).trim(),
    grppart: grpPart,
    txtLipi: text(f.LipiTran),
    txtBhasha: text(f.BhasTran),
    txtBookTran: text(f.BookTran),
    txtVibhag: text(f.VibhagTran),
    IsPrint: bit(f.IsPrint) ? 1 : 0,
    ShortName: text(f.ShortName).trim(),
  };
  const v = values;

  let bookId = id;
  await asDesktopError(async () => {
    if (add) {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO BookM (BookName, ParichayakName, Part, TitleDetail, PSamvatcokt, PSamvat, PSamvatVK, Avrutikt,
          Pages, TotalPages, Pariman, Price, GMalaKt, GMalaNo, Size, ShapeKt, Bind_PaperKt, PrintStylekt, FundTypeKt,
          Nakal, ISBNNo, Vishesh, Grpno, GrpName, GrpParichayakName, CommonGrpNo, Remark, MixSign, MixSignRem,
          KrutiHeadKt, PrintNo, bhandarcokt, Hastpratno, HastpratSize, panktiAkshar, LSamvcokt, LSamvat, LSamvatVK,
          AdiVakya, AntVakya, endate, moddate, enuser, moduser, grppart, txtLipi, txtBhasha, txtBookTran, KNo,
          LinkWithKruti, txtVibhag, PLSthalkt, PartNo, IsPrint, ShortName)
        OUTPUT INSERTED.BookMastkm AS id
        VALUES (${v.BookName}, ${v.ParichayakName}, ${v.Part}, ${v.TitleDetail}, ${v.PSamvatcokt}, ${v.PSamvat},
          ${v.PSamvatVK}, ${v.Avrutikt}, ${v.Pages}, ${v.TotalPages}, ${v.Pariman}, ${v.Price}, ${v.GMalaKt},
          ${v.GMalaNo}, ${v.Size}, ${v.ShapeKt}, ${v.Bind_PaperKt}, ${v.PrintStylekt}, ${v.FundTypeKt}, ${v.Nakal},
          ${v.ISBNNo}, ${v.Vishesh}, ${v.Grpno}, ${v.GrpName}, ${v.GrpParichayakName}, ${v.CommonGrpNo}, ${v.Remark},
          ${v.MixSign}, ${v.MixSignRem}, ${v.KrutiHeadKt}, ${v.PrintNo}, ${v.bhandarcokt}, ${v.Hastpratno},
          ${v.HastpratSize}, ${v.panktiAkshar}, ${v.LSamvcokt}, ${v.LSamvat}, ${v.LSamvatVK}, ${v.AdiVakya},
          ${v.AntVakya}, CONVERT(date, SYSDATETIME()), CONVERT(date, SYSDATETIME()), ${userId}, ${userId},
          ${v.grppart}, ${v.txtLipi}, ${v.txtBhasha}, ${v.txtBookTran}, '', 0, ${v.txtVibhag}, ${v.PLSthalkt},
          ${v.PartNo}, ${v.IsPrint}, ${v.ShortName})
      `.execute(trx);
      bookId = Number(rows[0]!.id);
    } else {
      await sql`
        UPDATE BookM SET BookName = ${v.BookName}, ParichayakName = ${v.ParichayakName}, Part = ${v.Part},
          TitleDetail = ${v.TitleDetail}, PSamvatcokt = ${v.PSamvatcokt}, PSamvat = ${v.PSamvat},
          PSamvatVK = ${v.PSamvatVK}, Avrutikt = ${v.Avrutikt}, Pages = ${v.Pages}, TotalPages = ${v.TotalPages},
          Pariman = ${v.Pariman}, Price = ${v.Price}, GMalaKt = ${v.GMalaKt}, GMalaNo = ${v.GMalaNo}, Size = ${v.Size},
          ShapeKt = ${v.ShapeKt}, Bind_PaperKt = ${v.Bind_PaperKt}, PrintStylekt = ${v.PrintStylekt},
          FundTypeKt = ${v.FundTypeKt}, Nakal = ${v.Nakal}, ISBNNo = ${v.ISBNNo}, Vishesh = ${v.Vishesh},
          Grpno = ${v.Grpno}, GrpName = ${v.GrpName}, GrpParichayakName = ${v.GrpParichayakName},
          CommonGrpNo = ${v.CommonGrpNo}, Remark = ${v.Remark}, MixSign = ${v.MixSign}, MixSignRem = ${v.MixSignRem},
          KrutiHeadKt = ${v.KrutiHeadKt}, PrintNo = ${v.PrintNo}, bhandarcokt = ${v.bhandarcokt},
          Hastpratno = ${v.Hastpratno}, HastpratSize = ${v.HastpratSize}, panktiAkshar = ${v.panktiAkshar},
          LSamvcokt = ${v.LSamvcokt}, LSamvat = ${v.LSamvat}, LSamvatVK = ${v.LSamvatVK}, AdiVakya = ${v.AdiVakya},
          AntVakya = ${v.AntVakya}, moddate = CONVERT(date, SYSDATETIME()), moduser = ${userId},
          grppart = ${v.grppart}, txtLipi = ${v.txtLipi}, txtBhasha = ${v.txtBhasha}, txtBookTran = ${v.txtBookTran},
          txtVibhag = ${v.txtVibhag}, PLSthalkt = ${v.PLSthalkt}, PartNo = ${v.PartNo}, IsPrint = ${v.IsPrint},
          ShortName = ${v.ShortName}
        WHERE BookMastkm = ${id}
      `.execute(trx);
    }
  });

  // Bhasha, Magazine Remark, Lipi, Vibhag.
  if (rewrite.bhasha) {
    let next = await nextKey(trx, 'praksnBhashaT', 'prakshnbhashakm');
    // The popup always ends on an empty row; the desktop stores it (bhashakt 0), the web does not.
    for (const r of (bhashaRows ?? []).filter((x) => int(get(x, 'bhashakt')) > 0)) {
      await sql`
        INSERT INTO praksnBhashaT (prakshnbhashakm, prakshnokt, bhashakt, seq)
        VALUES (${next++}, ${bookId}, ${int(get(r, 'bhashakt'))}, ${int(get(r, 'seq'))})`.execute(
        trx,
      );
    }
  }
  if (rewrite.remark) await saveMagazineRemarks(trx, userId, bookId, remarkRows ?? []);
  if (rewrite.lipi) {
    let next = await nextKey(trx, 'praksnLipiT', 'prakshnlipikm');
    for (const r of (lipiRows ?? []).filter((x) => int(get(x, 'lippikt')) > 0)) {
      await sql`
        INSERT INTO praksnLipiT (prakshnlipikm, prakashankt, lippikt, seq)
        VALUES (${next++}, ${bookId}, ${int(get(r, 'lippikt'))}, ${int(get(r, 'seq'))})`.execute(
        trx,
      );
    }
  }
  if (rewrite.vibhag) {
    for (const r of (vibhagRows ?? []).filter((x) => int(get(x, 'VibhagKt')) > 0)) {
      await sql`
        INSERT INTO BookVibhagT (BookMastKt, VibhagKt, Seq)
        VALUES (${bookId}, ${int(get(r, 'VibhagKt'))}, ${int(get(r, 'seq'))})`.execute(trx);
    }
  }

  // Author: txtAuthTran is rebuilt from the rows, which are then written with new keys.
  let authText = text(f.AuthTran);
  if (rewrite.author) {
    const authors = authorRows ?? [];
    const auths = extra(f, 'AuthTran', 1);
    const types = extra(f, 'AuthTran', 2);
    authText = await authorText(trx, authors, auths, types);
    let authorKey = await nextKey(trx, 'praksnAuthorT', 'praksnauthorkm');
    let typeKey = await nextKey(trx, 'PraksnAuthorAuthTypeT', 'praksnauthorauthtypekm');
    let authKey = await nextKey(trx, 'praksnAuthorAuthT', 'praksnauthorauthkm');
    for (const a of authors) {
      const key = get(a, 'praksnauthorkm');
      await sql`
        INSERT INTO praksnAuthorT (praksnauthorkm, prakashannokt, seq, txtAuth)
        VALUES (${authorKey}, ${bookId}, ${int(get(a, 'seq'))},
          ${signBetween(text(get(a, 'authortype')), text(get(a, 'authorname')), '-')})`.execute(
        trx,
      );
      for (const t of types.filter((r) => get(r, 'praksnauthorkt') === key)) {
        await sql`
          INSERT INTO PraksnAuthorAuthTypeT (praksnauthorauthtypekm, praksnauthorkt, prakashannokt, authortypekt, signkt, seq)
          VALUES (${typeKey++}, ${authorKey}, ${bookId}, ${int(get(t, 'authortypekt'))}, ${int(get(t, 'signkt'))},
            ${int(get(t, 'seq'))})`.execute(trx);
      }
      for (const r of auths.filter((x) => get(x, 'praksnauthorkt') === key)) {
        await sql`
          INSERT INTO praksnAuthorAuthT (praksnauthorauthkm, praksnauthorkt, prakashannokt, authorkt, padkt, signkt, seq, AuthAnyaNmKt)
          VALUES (${authKey++}, ${authorKey}, ${bookId}, ${int(get(r, 'authorkt'))}, ${int(get(r, 'padkt'))},
            ${int(get(r, 'Signkt'))}, ${int(get(r, 'seq'))}, ${int(get(r, 'AuthAnyaNmKt'))})`.execute(
          trx,
        );
      }
      authorKey++;
    }
  }

  // Prakashak: txtPrakTran is rebuilt; the rows keep the key their popup row carries (a new
  // row's is 0, as on the desktop — the table has no primary key).
  let prakText = text(f.PrakTran);
  if (rewrite.prak) {
    const rows = prakRows ?? [];
    prakText = await prakashakText(trx, rows);
    for (const r of rows.filter((x) => int(get(x, 'prakashakkt')) > 0)) {
      await sql`
        INSERT INTO praksnPrakT (prashnprakkm, prakashannokt, prakashakkt, seq, purva, nameSelected, PrakTypekt, remark, signkt)
        VALUES (${int(get(r, 'prashnprakkm'))}, ${bookId}, ${int(get(r, 'prakashakkt'))}, ${int(get(r, 'seq'))},
          ${bit(get(r, 'purva')) ? 1 : 0}, ${text(get(r, 'nameselected'))}, ${int(get(r, 'PrakTypekt'))},
          ${text(get(r, 'Remark'))}, ${int(get(r, 'signkt'))})`.execute(trx);
    }
  }

  if (rewrite.vishesh) {
    await saveVishesh(
      trx,
      bookId,
      visheshRows ?? [],
      extra(f, 'praksnVisheshTran', 1),
      extra(f, 'praksnVisheshTran', 2),
      extra(f, 'praksnVisheshTran', 3),
      extra(f, 'praksnVisheshTran', 4),
    );
  }

  if (rewrite.subject) {
    await saveBookSubjects(trx, bookId, subjectRows ?? [], extra(f, 'BookSubjTran', 1));
  }

  // A new book gets its first (main) library row; the numbers are entered in the BookT form.
  if (add) {
    await sql`
      INSERT INTO BookT (BookMastkt, MainL, endate, moddate, enuser, moduser, seq)
      VALUES (${bookId}, 1, CONVERT(date, SYSDATETIME()), CONVERT(date, SYSDATETIME()), ${userId}, ${userId}, 1)
    `.execute(trx);
  }

  await sql`
    UPDATE BookM SET txtPrakashak = ${prakText.trim()}, txtAuthor = ${authText.trim()} WHERE BookMastkm = ${bookId}
  `.execute(trx);
  return bookId;
}

async function deleteAuthors(trx: Executor, id: number) {
  await sql`DELETE FROM PraksnAuthorAuthTypeT WHERE prakashannokt = ${id}`.execute(trx);
  await sql`DELETE FROM praksnAuthorAuthT WHERE prakashannokt = ${id}`.execute(trx);
  await sql`DELETE FROM praksnAuthorT WHERE prakashannokt = ${id}`.execute(trx);
}

async function deleteVishesh(trx: Executor, id: number) {
  await sql`DELETE FROM praksnVisheshT WHERE prakashannokt = ${id}`.execute(trx);
  await sql`DELETE FROM PraksnVishAutT WHERE prakashannokt = ${id}`.execute(trx);
  await sql`DELETE FROM PraksnVishBhasT WHERE prakashannokt = ${id}`.execute(trx);
}

/** Magazine Remark: an identity table, updated in place by key and pruned to the popup's rows. */
async function saveMagazineRemarks(trx: Executor, userId: number, bookId: number, rows: Row[]) {
  const kept: number[] = [];
  for (const r of rows) {
    const km = int(get(r, 'BookMagazineRemarkKm'));
    if (km <= 0) {
      const { rows: ins } = await sql<{ id: number }>`
        INSERT INTO BookMagazineRemarkT (BookMastKt, Remark, RefPageNo, Seq, enuser, endate)
        OUTPUT INSERTED.BookMagazineRemarkKm AS id
        VALUES (${bookId}, ${text(get(r, 'Remark'))}, ${text(get(r, 'RefPageNo'))}, ${int(get(r, 'Seq'))},
          ${userId}, GETDATE())`.execute(trx);
      kept.push(Number(ins[0]!.id));
    } else {
      await sql`
        UPDATE BookMagazineRemarkT SET Remark = ${text(get(r, 'Remark'))}, RefPageNo = ${text(get(r, 'RefPageNo'))},
          Seq = ${int(get(r, 'Seq'))}, moduser = ${userId}, moddate = GETDATE()
        WHERE BookMagazineRemarkKm = ${km}`.execute(trx);
      kept.push(km);
    }
  }
  await sql`
    DELETE FROM BookMagazineRemarkT WHERE BookMastKt = ${bookId}
      AND BookMagazineRemarkKm NOT IN (SELECT CAST(val AS int) FROM dbo.SplitString(${['0', ...kept].join(',')}, ','))
  `.execute(trx);
}

/** Save()'s praksnVishesh block: every row rewritten with new keys, with its authors, languages and details. */
async function saveVishesh(
  trx: Executor,
  bookId: number,
  rows: Row[],
  authors: Row[],
  languages: Row[],
  details: Row[],
  summaries: Row[],
) {
  let key = await nextKey(trx, 'praksnVisheshT', 'prksnvisheshkm');
  let authorKey = await nextKey(trx, 'PraksnVishAutT', 'praksnVishAutkm');
  let bhashaKey = await nextKey(trx, 'PraksnVishBhasT', 'praksnVishBhakm');
  const written: {
    key: number;
    details: number[];
    summaries: number[];
    hasDetails: boolean;
    hasSummaries: boolean;
  }[] = [];
  for (const r of rows) {
    const oldKey = get(r, 'prksnvisheshkm');
    await sql`
      INSERT INTO praksnVisheshT (prksnvisheshkm, prakashannokt, Mark1, ColumnMastkt, ColumnName, Detail, RefPgno, Mark2,
        seq, title, DoneByKt, DetailSummary, PraksnCopyNo, tid, AuthAnyaNmKt)
      VALUES (${key}, ${bookId}, ${int(get(r, 'Mark1'))}, ${int(get(r, 'ColumnMastkt'))}, ${text(get(r, 'ColumnName'))},
        ${text(get(r, 'Detail')).split("''''").join("'")}, ${text(get(r, 'RefpgNo'))}, ${int(get(r, 'Mark2'))},
        ${int(get(r, 'seq'))}, ${text(get(r, 'Title'))}, ${int(get(r, 'DoneByKt'))}, ${text(get(r, 'DetailSummary'))},
        ${text(get(r, 'PrCpNo'))}, ${bookId}, ${int(get(r, 'AuthAnyaNmKt'))})`.execute(trx);
    for (const a of authors.filter((x) => get(x, 'prksnvisheshkt') === oldKey)) {
      await sql`
        INSERT INTO PraksnVishAutT (praksnVishAutkm, prksnvisheshkt, prakashannokt, Authorkt, seq, padkt, signkt, tid, AuthAnyaNmKt)
        VALUES (${authorKey++}, ${key}, ${bookId}, ${int(get(a, 'authorkt'))}, ${int(get(a, 'seq'))},
          ${int(get(a, 'padkt'))}, ${int(get(a, 'signkt'))}, ${bookId}, ${int(get(a, 'AuthAnyaNmKt'))})`.execute(
        trx,
      );
    }
    for (const b of languages.filter(
      (x) => get(x, 'prksnvisheshkt') === oldKey && int(get(x, 'bhashakt')) > 0,
    )) {
      await sql`
        INSERT INTO PraksnVishBhasT (praksnVishBhakm, prksnvisheshkt, prakashannokt, bhashakt, seq, tid)
        VALUES (${bhashaKey++}, ${key}, ${bookId}, ${int(get(b, 'bhashakt'))}, ${int(get(b, 'seq'))}, ${bookId})`.execute(
        trx,
      );
    }
    const mine = (list: Row[]) => list.filter((x) => get(x, 'RecordKt') === oldKey);
    const d = mine(details);
    const s = mine(summaries);
    written.push({
      key,
      details: await saveVishayEntries(trx, 'BookVisheshDetail', key, d),
      summaries: await saveVishayEntries(trx, 'BookVisheshDetailSummary', key, s),
      hasDetails: d.length > 0,
      hasSummaries: s.length > 0,
    });
    key++;
  }
  // SaveVishayEntry's clean-up, once every entry has moved to its row's new key.
  for (const [name, pick, has] of [
    [
      'BookVisheshDetail',
      (w: (typeof written)[number]) => w.details,
      (w: (typeof written)[number]) => w.hasDetails,
    ],
    [
      'BookVisheshDetailSummary',
      (w: (typeof written)[number]) => w.summaries,
      (w: (typeof written)[number]) => w.hasSummaries,
    ],
  ] as const) {
    for (const w of written.filter(has)) {
      const kept = pick(w);
      await sql`
        DELETE FROM VishayEntry WHERE TransactionName = ${name} AND RecordKt = ${w.key}
          ${kept.length ? sql`AND VishayEntryKm NOT IN (SELECT CAST(val AS int) FROM dbo.SplitString(${kept.join(',')}, ','))` : sql``}
      `.execute(trx);
    }
    await sql`
      DELETE VishayEntry FROM VishayEntry LEFT JOIN praksnVisheshT ON VishayEntry.RecordKt = praksnVisheshT.prksnvisheshkm
      WHERE TransactionName = ${name} AND ISNULL(praksnVisheshT.prksnvisheshkm, 0) = 0
    `.execute(trx);
    for (const w of written.filter(has)) {
      await sql`EXEC UpdateVishay ${name}, ${String(w.key)}`.execute(trx);
    }
  }
}

/** Save()'s Book Subject block: upsert by key, prune, then its Vishay entries. */
async function saveBookSubjects(trx: Executor, bookId: number, rows: Row[], entries: Row[]) {
  const kept: number[] = [];
  for (const r of rows) {
    const km = int(get(r, 'BookSubjectKm'));
    const printDate = ddmmyyyy(get(r, 'PrintDate'));
    const date = ddmmyyyy(get(r, 'Date'));
    const values = {
      EntryType: text(get(r, 'EntryType')),
      Vishay: text(get(r, 'Vishay')),
      WorkDoneByKt: int(get(r, 'WorkDoneByKt')),
      PrintSeq: int(get(r, 'PrintSeq')),
      Remark: text(get(r, 'Remark')),
      PageNo: text(get(r, 'PageNo')),
      Tithi: text(get(r, 'Tithi')),
      DayKt: int(get(r, 'DayKt')),
      Seq: int(get(r, 'seq')),
    };
    if (km === 0) {
      const { rows: ins } = await sql<{ id: number }>`
        INSERT INTO BookSubjectT (BookMastKt, EntryType, Vishay, WorkDoneByKt, PrintSeq, Remark, PageNo, Tithi, DayKt, Seq, PrintDate, Date)
        OUTPUT INSERTED.BookSubjectKm AS id
        VALUES (${bookId}, ${values.EntryType}, ${values.Vishay}, ${values.WorkDoneByKt}, ${values.PrintSeq},
          ${values.Remark}, ${values.PageNo}, ${values.Tithi}, ${values.DayKt}, ${values.Seq},
          ${printDate === null ? null : sql`CAST(${printDate} AS date)`}, ${date === null ? null : sql`CAST(${date} AS date)`})
      `.execute(trx);
      kept.push(Number(ins[0]!.id));
    } else {
      await sql`
        UPDATE BookSubjectT SET EntryType = ${values.EntryType}, Vishay = ${values.Vishay},
          WorkDoneByKt = ${values.WorkDoneByKt}, PrintSeq = ${values.PrintSeq}, Remark = ${values.Remark},
          PageNo = ${values.PageNo}, Tithi = ${values.Tithi}, DayKt = ${values.DayKt}, Seq = ${values.Seq},
          PrintDate = ${printDate === null ? null : sql`CAST(${printDate} AS date)`},
          Date = ${date === null ? null : sql`CAST(${date} AS date)`}
        WHERE BookSubjectKm = ${km}`.execute(trx);
      kept.push(km);
    }
  }
  const keptList = ['0', ...kept].join(',');
  if (kept.length > 0) {
    await sql`
      DELETE FROM BookSubjectT WHERE BookMastKt = ${bookId}
        AND BookSubjectKm NOT IN (SELECT CAST(val AS int) FROM dbo.SplitString(${keptList}, ','))
    `.execute(trx);
  }
  const entryIds: number[] = [];
  for (const e of entries) {
    if (val(get(e, 'VishayKt')) <= 0) continue;
    const entryId = int(get(e, 'Id'));
    if (entryId === 0) {
      const { rows: ins } = await sql<{ id: number }>`
        INSERT INTO VishayEntry (TransactionName, RecordKt, VishayKt, VachanKt, VibhaktiKt, Seq)
        OUTPUT INSERTED.VishayEntryKm AS id
        VALUES ('BookSubject', ${int(get(e, 'RecordKt'))}, ${int(get(e, 'VishayKt'))}, ${int(get(e, 'VachanKt'))},
          ${int(get(e, 'VibhaktiKt'))}, ${int(get(e, 'Seq'))})`.execute(trx);
      entryIds.push(Number(ins[0]!.id));
    } else {
      await sql`
        UPDATE VishayEntry SET VishayKt = ${int(get(e, 'VishayKt'))}, VachanKt = ${int(get(e, 'VachanKt'))},
          VibhaktiKt = ${int(get(e, 'VibhaktiKt'))}, Seq = ${int(get(e, 'Seq'))}
        WHERE VishayEntryKm = ${entryId}`.execute(trx);
      entryIds.push(entryId);
    }
  }
  await sql`
    DELETE VishayEntry FROM VishayEntry LEFT JOIN BookSubjectT ON VishayEntry.RecordKt = BookSubjectT.BookSubjectKm
    WHERE TransactionName = 'BookSubject' AND BookSubjectT.BookMastKt = ${bookId}
      AND VishayEntry.RecordKt IN (SELECT CAST(val AS int) FROM dbo.SplitString(${keptList}, ','))
      AND VishayEntryKm NOT IN (SELECT CAST(val AS int) FROM dbo.SplitString(${['0', ...entryIds].join(',')}, ','))
  `.execute(trx);
  await sql`
    DELETE FROM VishayEntry WHERE TransactionName = 'BookSubject' AND RecordKt NOT IN (SELECT BookSubjectKm FROM BookSubjectT)
  `.execute(trx);
  for (const km of kept) await sql`EXEC UpdateVishay 'BookSubject', ${String(km)}`.execute(trx);
}

// ------------------------------------------------------------------------------------------
// The popups (setform_prakashan) and their cell lists
// ------------------------------------------------------------------------------------------

/** Every author, as the Author popups list them (dtBhasha); the second Guru column is Guru1 there. */
export const AUTHOR_LIST = list(sql`
  SELECT a.authorcokm, a.txtauthorname AS authorname, ISNULL(a.txtGuru, '') AS Guru, a.identyty,
    ISNULL(a.count, 0) AS count, ISNULL(a.recordno, 0) AS recordno, ISNULL(c.name, '') AS vibhag,
    a.txtParampara AS Parampara, a.txtGuru AS Guru1, ISNULL(v.SampradayName, '') AS samprady,
    a.txtSampraday AS SampradayTran, ISNULL(a.vksamvat, 0) AS vksamvat, a.authorname AS mainname
  FROM authmast AS a LEFT OUTER JOIN columnmaster AS c ON a.vibhagkt = c.columnmastkm
  LEFT OUTER JOIN Sampraday AS v ON a.sampradayKt = v.SampradayKm`);

const VISHESH_AUTHOR_LIST = list(sql`
  SELECT a.authorcokm, a.txtauthorname AS authorname, a.identyty, ISNULL(a.count, 0) AS count,
    ISNULL(a.recordno, 0) AS recordno, ISNULL(c.name, '') AS vibhag, a.txtParampara AS Parampara,
    a.txtGuru AS Guru, ISNULL(v.SampradayName, '') AS samprady, ISNULL(a.vksamvat, 0) AS vksamvat,
    a.authorname AS mainname
  FROM authmast AS a LEFT OUTER JOIN columnmaster AS c ON a.vibhagkt = c.columnmastkm
  LEFT OUTER JOIN Sampraday AS v ON a.sampradayKt = v.SampradayKm`);

/** An author's own name (id 0) and any names (their id), for the row's authorkt. */
export const anyNames = (db: Executor, row: Record<string, GridValue>) =>
  pickListOf(
    db,
    sql`SELECT REPLACE(0, 0, 0) AS id, authorname AS AnyaName FROM authmast WHERE authorcokm = ${int(row.authorkt ?? row.AuthorKt)}
      UNION SELECT AuthAnyaNmKm AS ID, AnyaName FROM AuthMAnyNmT WHERE AuthmastKt = ${int(row.authorkt ?? row.AuthorKt)}`,
  );

const BHASHA_LIST = list(
  sql`SELECT bhashacokm, bhashaname, bhasa_attr FROM bhasmast ORDER BY bhashaname`,
);

/** GetBookMastkmForSameGroupNo: the book, or every book of its common group. */
export async function sameGroupBooks(db: Executor, id: number): Promise<string> {
  const { rows } = await sql<{ id: number }>`
    SELECT BookMastkm AS id FROM BookM
    WHERE (ISNULL(CommonGrpNo, 0) = 0 AND BookMastkm = ${id})
      OR (ISNULL(CommonGrpNo, 0) > 0 AND CommonGrpNo IN (SELECT CommonGrpNo FROM BookM WHERE BookMastkm = ${id}))
  `.execute(db);
  return rows.map((r) => String(r.id)).join(',');
}

const TRANS: Record<string, TransDefinition> = {
  PrakTran: {
    lookups: {
      // The whole Prakashak master with its any names, addresses, contacts and granth malas.
      prakname: list(sql`
        SELECT p.prakcodekm,
          p.prakname + ISNULL(',' + STUFF((SELECT ',' + ISNULL(a.anyanm, '') FROM prakmanaynmt a WHERE a.prakmastkt = p.prakcodekm
            ORDER BY a.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '') AS prakname,
          ISNULL(p.count, 0) AS count,
          ISNULL(STUFF((SELECT ',' + ISNULL(d.address, '') + ' ' + ISNULL(v.vishesh, '') FROM prakmaddt d
            LEFT OUTER JOIN visheshmast v ON d.citykt = v.tid WHERE d.prakmastkt = p.prakcodekm
            ORDER BY d.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '') AS address,
          ISNULL(STUFF((SELECT ',' + ISNULL(v.vishesh, '') FROM prakcontactt c LEFT OUTER JOIN visheshmast v ON c.contactkt = v.tid
            WHERE c.prakmastkt = p.prakcodekm ORDER BY c.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '') AS contact_name,
          ISNULL(STUFF((SELECT ',' + ISNULL(v.vishesh, '') FROM prakmgmalat g INNER JOIN visheshmast v ON g.visheshtid = v.tid
            WHERE g.prakmastkt = p.prakcodekm ORDER BY g.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '') AS gmala,
          p.vikramsmvt, p.prakname AS mainname
        FROM prakmast p`),
      nameselected: (db, row) =>
        pickListOf(
          db,
          sql`SELECT REPLACE(0, 0, 0) AS id, prakname AS anyanm FROM prakmast WHERE prakcodekm = ${int(row.prakashakkt)}
            UNION SELECT REPLACE(0, 0, 0), anyanm FROM prakmanaynmt WHERE prakmastkt = ${int(row.prakashakkt)}`,
        ),
      praktype: list(
        sql`SELECT columnmastkm, name FROM columnmaster WHERE vibhag = N'prakoption' AND ISNULL(columnno, 0) > 0 ORDER BY name`,
      ),
      sign: SIGN_UNDER_10,
    },
  },
  AuthTran: {
    lookups: {
      // multiauthortype
      authortype: list(sql`SELECT authtycokm, authortype FROM authtype ORDER BY authortype`),
      sign: SIGN_UNDER_10,
      // multiauthor
      authorname: AUTHOR_LIST,
      anyaname: anyNames,
      padvi: list(
        sql`SELECT tid, vishesh FROM visheshmast WHERE remark = 'avastha' AND ISNULL(visheshno, 0) > 5 ORDER BY vishesh`,
      ),
    },
  },
  praksnVisheshTran: {
    // dsVishesh's two Vishay detail tables, loaded beside the F2EntryText's three.
    appendTables: async (_db, id) => {
      const detail = (name: string) => `SELECT VishayEntryKm AS Id, RecordKt, VishayEntry.VishayKt,
        CASE WHEN ISNULL(VishayAnyaNameT.AnyaName, '') <> '' THEN VishayAnyaNameT.AnyaName ELSE vishay_nm END AS Vishay,
        VachanKt, vachan_nm AS Vachan, VibhaktiKt, vibh_nm AS Vibhakti, VishayEntry.AnyaNameKt, VishayEntry.Seq
        FROM VishayEntry LEFT JOIN VishayAnyaNameT ON VishayEntry.AnyaNameKt = VishayAnyaNameT.VishayAnyaNameKm
        INNER JOIN praksnVisheshT ON VishayEntry.RecordKt = praksnVisheshT.prksnvisheshkm
        LEFT JOIN vishay ON VishayEntry.VishayKt = vishay.vishaycokm LEFT JOIN vachan ON VachanKt = vachan.vachancokm
        LEFT JOIN vibhakti ON VibhaktiKt = vibhakti.vibhaktikm
        WHERE praksnVisheshT.prakashannokt IN (${Math.trunc(id)}) AND TransactionName = '${name}' ORDER BY VishayEntry.Seq`;
      return [detail('BookVisheshDetail'), detail('BookVisheshDetailSummary')];
    },
    lookups: {
      ...VISHAY_ENTRY_LOOKUPS,
      m1: list(
        sql`SELECT columnmastkm, name, columnno FROM columnmaster WHERE vibhag = 'sign' ORDER BY name`,
      ),
      columnno: list(
        sql`SELECT columnmastkm, name, columnno FROM columnmaster WHERE vibhag = 'vishcol' AND columnno > 0 ORDER BY columnno`,
      ),
      detail: (db, row) =>
        pickListOf(
          db,
          sql`SELECT 0 AS Id, detail FROM praksnvishesht WHERE columnmastkt = ${int(row.ColumnMastkt)} GROUP BY detail ORDER BY detail`,
        ),
      donebyname: list(
        sql`SELECT partyMkm, PName FROM PartyM WHERE ISNULL(PName, '') <> '' ORDER BY PartyM.PName`,
      ),
      detailsummary: list(sql`
        SELECT detailsummary AS Id, detailsummary FROM praksnvishesht WHERE ISNULL(detailsummary, '') <> ''
        GROUP BY detailsummary ORDER BY detailsummary`),
      prcpno: list(
        sql`SELECT DISTINCT LibNo AS Id, LibNo FROM BookT WHERE ISNULL(LibNo, '') <> '' ORDER BY Libno`,
      ),
      m2: list(
        sql`SELECT columnmastkm, columnno, name FROM columnmaster WHERE vibhag = 'sign' ORDER BY columnno`,
      ),
      // TsBtnSave: the Vishesh seq starts after the largest in use.
      maxseq: list(sql`SELECT ISNULL(MAX(seq), 0) + 1 AS seq FROM praksnVisheshT`),
      // multivisheshauthor
      authorname: VISHESH_AUTHOR_LIST,
      anyaname: anyNames,
      padvi: list(
        sql`SELECT tid, vishesh FROM visheshmast WHERE remark = N'avastha' ORDER BY vishesh`,
      ),
      sign: list(
        sql`SELECT columnmastkm, name FROM columnmaster WHERE vibhag = 'sign' ORDER BY name`,
      ),
      // multivisheshbhasha
      bhashaname: BHASHA_LIST,
    },
  },
  // Subject (old): loaded and edited, never written back (Save() has no praksnVishayT block).
  SubjTran: {
    lookups: {
      entrytype: list(
        sql`SELECT 'MainTitle' AS Id, 'Main Title(New)' AS Name UNION SELECT 'SubTitle' AS Id, 'Sub Title(New)' AS Name`,
      ),
      m1: list(
        sql`SELECT columnmastkm, name FROM columnmaster WHERE vibhag = 'sign' ORDER BY name`,
      ),
      vishay: list(sql`
        SELECT vishaycokm, vishay_nm AS name, brif, remark FROM vishay
        WHERE vishaycokm IN (SELECT VishayKt FROM PraksnNewVishayList) ORDER BY name`),
      vachan: list(sql`SELECT vachancokm, vachan_nm FROM vachan ORDER BY vachan_nm`),
      vibhakti: list(sql`SELECT vibhaktikm, vibh_nm FROM vibhakti ORDER BY vibh_nm`),
    },
  },
  BookSubjTran: {
    lookups: {
      ...VISHAY_ENTRY_LOOKUPS,
      entrytype: list(sql`
        SELECT 'MainTitle' AS Id, 'Main Title(New)' AS Name UNION SELECT 'SubTitle' AS Id, 'Sub Title(New)' AS Name
        UNION SELECT 'Old' AS Id, 'Old' AS Name`),
      workdonebyname: list(
        sql`SELECT DISTINCT partyMkm, PName FROM PartyM WHERE Categorykt IN (1577, 1581) ORDER BY PName`,
      ),
      dayname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'Day' ORDER BY Name`,
      ),
    },
  },
  BhasTran: { lookups: { bhasa_attr: BHASHA_LIST } },
  LipiTran: {
    lookups: {
      lipi_attr: list(sql`SELECT lipicodekm, lipiname, lipi_attr FROM lipimast ORDER BY lipiname`),
    },
  },
  VibhagTran: {
    lookups: {
      vibhagname: list(
        sql`SELECT ColumnMastkm, Name, ShortNm, Brief FROM columnmaster WHERE Vibhag = N'Head' ORDER BY Name`,
      ),
    },
  },
  MagazineRemarkTran: {},
  // DisplayListForm over the book's Kruti references (its common group's where shared).
  KrutiTran: {
    placeholders: async (db, id) => ({ GroupId: (await sameGroupBooks(db, id)) || '0' }),
  },
  Bhandtran: {},
};

// ------------------------------------------------------------------------------------------
// The definition
// ------------------------------------------------------------------------------------------

/** chkSearchNotInOB ("Search Not In OB"), as the client sends it with a request. */
export const SEARCH_NOT_IN_OB = 'SearchNotInOB';

const switchOn = (v: unknown) => v === true || v === 'true' || v === 'True' || v === 1 || v === '1';

/** GetDataTable's " and ISNULL(txtBookTran,'') not like '%OB%'" while the box is ticked. */
export function notInObCondition(params?: Record<string, unknown>) {
  return switchOn(params?.[SEARCH_NOT_IN_OB]) ? sql`ISNULL(txtBookTran, '') NOT LIKE '%OB%'` : null;
}

/**
 * GetDataTable's DefaultCondition: an Operator does not see CM / MS / CP / SN numbers (NULL-safe
 * since v3.4.3.1: a book with no txtBookTran is visible), and nobody sees OB numbers while
 * "Search Not In OB" is ticked. The search box gets the same condition; the desktop's FillList
 * hands UcSearch the OB condition in place of the Operator's one, and that one without ISNULL
 * (see the doc).
 */
function bookFilter(user: SessionUser, params?: ListParams) {
  const parts = [];
  if (user.userType === UserType.Operator)
    parts.push(
      sql`ISNULL(txtBookTran, '') NOT LIKE '%CM%' AND ISNULL(txtBookTran, '') NOT LIKE '%ms%' AND ISNULL(txtBookTran, '') NOT LIKE '%CP%' AND ISNULL(txtBookTran, '') NOT LIKE '%SN%'`,
    );
  const ob = notInObCondition(params);
  if (ob) parts.push(ob);
  return parts.length ? sql.join(parts, sql` AND `) : null;
}

export const bookMaster: ScreenDefinition = {
  screen: 'book-master',
  table: 'BookM',
  primaryColumn: 'BookMastkm',
  lockable: true,
  // FillList passes TotRecords = 100 unless the form was opened for given records.
  listLimit: 100,
  listFilter: bookFilter,
  workReport: true,
  // The popups whose rows Save() logs with CompareDataTable (its ByRef arguments write back).
  workReportTrans: ['PrakTran', 'AuthTran', 'praksnVisheshTran', 'SubjTran', 'BookSubjTran'],
  deleteLabelColumn: 'BookName',
  help: true,

  validate: validateBook,

  save: (trx, user, id, f) => saveBook(trx, user.id, id, f),

  trans: TRANS,

  /**
   * FillData's extras: the group's name, pari name and part come from the group's head (and the
   * four group boxes are disabled) when this book's own pari name is blank; Anya Bhandar fills
   * an empty Bhandtran for an "OB" book; the subject text is shown through GetcontString.
   */
  async recordExtras(db, id) {
    const { rows } = await sql<{
      Grpno: number | null;
      GrpParichayakName: string | null;
      Bhandtran: string | null;
      txtBookTran: string | null;
      BookSubjTran: string | null;
    }>`
      SELECT Grpno, GrpParichayakName, txtBookTran,
        (SELECT STUFF((SELECT ',' + ISNULL(PName, '') + '-' + ISNULL(bhbookno, '') + '-' + ISNULL(cpBookT.LibNo, '') + '-'
          + cpBookM.BookName + '-' + CAST(pageno AS nvarchar) FROM bhandtran LEFT OUTER JOIN PartyM ON partyMkm = bhandarkt
          LEFT OUTER JOIN BookT ON BookT.BookMastkt = entrcodekt LEFT JOIN BookT cpBookT ON cpBookT.tid = bhandtran.cplibnoKt
          LEFT JOIN BookM cpBookM ON cpBookM.BookMastkm = cpBookT.BookMastkt WHERE BookT.BookMastkt = BookM.BookMastkm
          FOR XML PATH('')), 1, 1, '')) AS Bhandtran,
        LTRIM(RTRIM(dbo.ReplaceVishayInPlainText((SELECT STUFF((SELECT ', ' + ISNULL(BookSubjectT.Vishay, N'') FROM BookSubjectT
          WHERE BookSubjectT.BookMastKt = BookM.BookMastkm ORDER BY BookSubjectT.seq FOR XML PATH('')), 1, 1, ''))))) AS BookSubjTran
      FROM BookM WHERE BookMastkm = ${id}
    `.execute(db);
    const r = rows[0];
    if (!r) return {};
    const out: Record<string, GridValue> = {
      BookSubjTran: contString(text(r.BookSubjTran)),
      GrpLocked: false,
    };
    if (text(r.Bhandtran).trim() === '' && text(r.txtBookTran).includes('OB')) {
      const name = await scalar<string>(
        db,
        sql`SELECT PartyM.PName + '-' + AnyaBhandarM.Size + '-' + CAST(AnyaBhandarM.RecordNo AS varchar(10))
          FROM AnyaBhandarM INNER JOIN PartyM ON AnyaBhandarM.BhandarKt = PartyM.partyMkm WHERE AnyaBhandarM.BookMastKt = ${id}`,
      );
      if (name) out.Bhandtran = name;
    }
    if (r.Grpno === null) {
      out.GrpName = '';
      out.GrpParichayakName = '';
    } else {
      const { rows: group } = await sql<{
        Grpname: string | null;
        GrpParichayakName: string | null;
        GrpPart: string | null;
      }>`
        SELECT DISTINCT grpno, Grpname, GrpParichayakName, GrpPart FROM BookM
        WHERE grpno = ${String(r.Grpno)} AND Grpname NOT LIKE ' %' ORDER BY Grpname
      `.execute(db);
      const head = group[group.length - 1];
      if (text(r.GrpParichayakName).trim() === '') {
        out.GrpName = text(head?.Grpname);
        out.GrpParichayakName = text(head?.GrpParichayakName);
        out.GrpPart = text(head?.GrpPart);
        out.GrpLocked = true;
      }
    }
    return out;
  },

  // Delete(…, CheckforUse:=True).
  async checkInUse(db, id) {
    const n = Number(
      (await scalar(db, sql`SELECT COUNT(*) FROM BookT WHERE BookMastkt = ${id}`)) ?? 0,
    );
    return n > 0 ? 'Lib No is in use. Record cannot be deleted' : '';
  },

  /**
   * Delete(): DeleteTran, the library rows' Prapti entries, BookT, BookM. DeleteTran's tables
   * are always emptied here; the desktop only empties those whose popup changed, leaving the
   * rest behind for a book that no longer exists (see the doc).
   */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM praksnPrakT WHERE prakashannokt = ${id}`.execute(trx);
    await sql`DELETE FROM praksnBhashaT WHERE prakshnokt = ${id}`.execute(trx);
    await sql`DELETE FROM praksnLipiT WHERE prakashankt = ${id}`.execute(trx);
    await deleteAuthors(trx, id);
    await deleteVishesh(trx, id);
    await sql`DELETE FROM BookVibhagT WHERE BookMastKt = ${id}`.execute(trx);
    await sql`DELETE FROM praptitran WHERE tid IN (SELECT tid FROM BookT WHERE BookMastkt = ${id})`.execute(
      trx,
    );
    await sql`DELETE FROM BookT WHERE BookMastkt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM BookM WHERE BookMastkm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  /** Save(): what the work report must not count as a change. */
  workReportAdjust(oldRow, newRow) {
    put(newRow, 'remark', get(oldRow, 'remark'));
    put(newRow, 'PsamvatVK', get(oldRow, 'PsamvatVK'));
    if (text(get(newRow, 'Pages')) !== text(get(oldRow, 'Pages')))
      put(newRow, 'TotalPages', get(oldRow, 'TotalPages'));
    put(newRow, 'KrutiTran', get(oldRow, 'KrutiTran'));
    // FillData's own changes to dtSel.
    if (text(get(oldRow, 'IsPrint')).toLowerCase() !== 'true') put(oldRow, 'IsPrint', false);
    put(oldRow, 'BookSubjTran', contString(text(get(oldRow, 'BookSubjTran'))).trim());
  },

  lists: {
    'link-with-kruti': list(sql`
      SELECT vishaycokm, vishay_nm, brif FROM vishay WHERE ISNULL(vishay_nm, '') <> '' AND brif LIKE N'KrutiLinking%'
      ORDER BY vishay_nm`),
    // Update Kruti Seq's pick (v3.4.3.1).
    'kruti-sampraday': list(
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'KrutiSampraday' ORDER BY Name`,
    ),
    'project-work': list(
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'BookProjectWork' ORDER BY Name`,
    ),
    magazines: list(sql`SELECT Magazinekm, MName, FYearVK, CYearVK FROM MagazineM ORDER BY MName`),
    'mix-sign': list(
      sql`SELECT v.Tid, v.Vishesh, v.brief FROM visheshMast v WHERE v.remark = 'chkbx' ORDER BY v.Vishesh`,
    ),
    'mix-sign-transfer': list(
      sql`SELECT Tid, Vishesh FROM VisheshMast WHERE remark = 'CHKBX' ORDER BY vishesh`,
    ),
    vishcol: list(sql`
      SELECT ColumnMastkm, CAST(ColumnNo AS varchar) AS ColumnNo, Name FROM columnmaster
      WHERE Vibhag = 'vishcol' AND ColumnNo <> '' ORDER BY CAST(ColumnNo AS int)`),
    'vishcol-all': list(sql`
      SELECT ColumnMastkm, CAST(ColumnNo AS varchar), Name FROM columnmaster WHERE Vibhag LIKE 'vishcol' AND ColumnNo <> ''`),
    heads: list(
      sql`SELECT ColumnMastkm, Name, ColumnNo FROM columnmaster WHERE Vibhag = 'Head' AND ISNULL(Name, '') <> '' ORDER BY Name`,
    ),
    'heads-by-name': list(
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'Head' AND ISNULL(Name, '') <> '' ORDER BY Name`,
    ),
    'print-nos': list(
      sql`SELECT DISTINCT PrintNo AS Id, PrintNo FROM BookM WHERE ISNULL(PrintNo, 0) > 0 ORDER BY PrintNo`,
    ),
    'all-books': list(
      sql`SELECT BookMastkm, txtBookTran AS LibNo, BookName FROM BookM ORDER BY txtBookTran`,
    ),
    gsearch: list(
      sql`SELECT G.GSearchMkm, G.WordQry, P.PName, G.Purpose, G.DeliveryRem FROM GSearchM G LEFT JOIN PartyM P ON G.DemandedBy = P.partyMkm`,
    ),
    parties: list(sql`SELECT partyMkm, PName FROM PartyM ORDER BY PName`),
    authors: list(sql`SELECT authorcokm, authorname FROM authmast ORDER BY authorname`),
    'author-types': list(sql`SELECT authtycokm, authortype FROM authtype ORDER BY authortype`),
    prakashaks: list(sql`SELECT prakcodekm, prakname FROM prakmast ORDER BY prakname`),
    gmalas: list(sql`SELECT tid, vishesh FROM visheshmast WHERE remark = 'gmala' ORDER BY vishesh`),
  },

  actions: bookActions,
};

export { TRANS as BOOK_TRANS };
