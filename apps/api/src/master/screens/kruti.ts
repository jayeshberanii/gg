import type { FieldValue, GridRow, GridValue, PickList } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import type { Executor } from '../../db/legacy-sql.js';
import { idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { saveVishayEntries, VISHAY_ENTRY_LOOKUPS } from './vishay-entry.js';
import {
  asDesktopError,
  bit,
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
  signBetween,
  text,
  val,
} from './book-common.js';
import { krutiActions, resetSamvatlessVk, updateKrutiAuthor } from './kruti-actions.js';
import { trustedSql } from '../../db/trusted-sql.js';
import type { ScreenDefinition, TransDefinition } from './registry.js';

/**
 * Library › Kruti Master (frmKrutiMasterNew). Table krutiMst, key krutimstkm (identity). The form
 * has no repository: its own FillData, Save and Delete are ported here, with the popups it opens
 * from frmDisplayTransNew (SetForm_Kruti). See docs/screens/kruti-master.md.
 */

/** Form_Load's JoinCondition: the up-level names (tblUplvl) and two visheshMast aliases. */
const JOIN = ` LEFT join (select distinct krutimstkt,STUFF(( select ',' + T.extranm + '(' + cast(T.KrutiNo as nvarchar(30)) + ')' as [text()] from krutiRelT Sub inner join krutimst T on Sub.uplevelKrutimstkt=T.krutimstkm where Sub.krutimstkt=Main.krutimstkt order by Sub.seq for XML PATH('')),1,1,'') as UpLvl from krutiRelT Main ) tblUplvl on KrutiMst.krutimstkm=tblUplvl.krutimstkt left outer JOIN visheshMast AS visheshMast_5 ON krutiMst.PurnaKt = visheshMast_5.Tid left outer JOIN visheshMast AS tblPrasastiVishesh ON krutiMst.prasastitypekt = tblPrasastiVishesh.Tid `;

const toIds = (xs: readonly number[]) => idList(xs.length ? xs : [0]);

// ------------------------------------------------------------------------------------------
// FillList / FillData
// ------------------------------------------------------------------------------------------

/** FillList: each kruti's any names (KrutiNmT) are appended to extranm as "(a,b)". */
async function appendAnyNames(db: Executor, rows: GridRow[]): Promise<GridRow[]> {
  if (rows.length === 0) return rows;
  const { rows: names } = await sql<{ krutimstkt: number; AnyaName: string | null }>`
    SELECT Main.krutimstkt, STUFF((SELECT ',' + Sub.Anyaname FROM krutinmt Sub
      WHERE Sub.krutimstkt = Main.krutimstkt ORDER BY Sub.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, '') AS AnyaName
    FROM krutinmt Main GROUP BY Main.krutimstkt
  `.execute(db);
  const byId = new Map(names.map((n) => [Number(n.krutimstkt), n.AnyaName]));
  for (const row of rows) {
    const id = Number(get(row, 'krutimstkm'));
    if (!byId.has(id)) continue;
    put(row, 'extranm', `${text(get(row, 'extranm'))}(${text(byId.get(id))})`);
  }
  return rows;
}

/**
 * FillData's own texts and the record query's duplicate columns: grpno, groupnm and Rsamvatvir
 * come twice (computed, then raw) and .NET names the raw one "…1"; txtgroupnm shows the head's
 * "(no)name"; the Title, Rag and RefLibNo boxes are built from their tables.
 */
async function recordExtras(db: Executor, id: number): Promise<GridRow> {
  const { rows } = await sql<Record<string, GridValue>>`
    SELECT dbo.GetKrutiRSamvatVir(K.krutimstkm) AS Rsamvatvir, K.Rsamvatvir AS Rsamvatvir1,
      STUFF((SELECT ',' + CAST(Sub.groupno AS varchar(10)) FROM krutigroupT Sub WHERE Sub.krutimstkt = K.krutimstkm
        ORDER BY Sub.seq FOR XML PATH('')), 1, 1, '') AS grpno, K.grpno AS grpno1,
      STUFF((SELECT ',' + '(' + CAST(Sub.groupno AS nvarchar) + ')' + Sub.groupname FROM krutigroupT Sub
        WHERE Sub.krutimstkt = K.krutimstkm ORDER BY Sub.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, '') AS groupnm,
      K.groupnm AS groupnm1, K.extraid2, K.grpremark
    FROM krutiMst K WHERE K.krutimstkm = ${id}
  `.execute(db);
  const r = rows[0];
  if (!r) return {};
  const out: GridRow = {
    Rsamvatvir: r.Rsamvatvir ?? null,
    Rsamvatvir1: r.Rsamvatvir1 ?? null,
    grpno: r.grpno ?? null,
    grpno1: r.grpno1 ?? null,
    groupnm: text(r.groupnm).trim(),
    groupnm1: r.groupnm1 ?? null,
    grpremark: text(r.grpremark).trim(),
  };

  // The group: its head's "(no)name"; the box and its remark are enabled only for the head.
  const { rows: group } = await sql<{
    groupno: number;
    head: boolean | null;
    headName: string | null;
  }>`
    SELECT TOP 1 g.groupno, g.head,
      (SELECT TOP 1 groupname FROM krutigroupT WHERE groupno = g.groupno AND groupname <> '') AS headName
    FROM krutigroupT g WHERE g.krutimstkt = ${id}
  `.execute(db);
  if (group[0]) {
    out.groupnm = `(${group[0].groupno})${text(group[0].headName)}`;
    out.GroupDisabled = group[0].head !== true;
  } else out.GroupDisabled = true;

  // txtextraid2_TextChanged: a digit other than 0 disables Samvat Type, Samvat and Samvat Kind.
  const extraid2 = text(r.extraid2);
  out.SamvatDisabled = !(extraid2.includes('0') || extraid2.trim() === '');

  out.KrutiSubTitleTran = subTitleText(await subTitleRows(db, id));
  out.KrutiRagTran = await ragText(db, id);
  out.KRag = out.KrutiRagTran;
  out.krutireflibnoTran = refLibText(await refLibRows(db, id));
  return out;
}

/** The Title popup's rows as FillData builds them (dtSubTitle), RagaName from their rags. */
async function subTitleRows(db: Executor, id: number): Promise<Row[]> {
  const { rows } = await sql<Row>`${trustedSql(subTitleSql(id))}`.execute(db);
  return rows;
}

/** SignBetweenStr in SQL, for the texts FillData builds. */
const sqlSignBetween = (a: string, b: string, sign: string) =>
  `CASE WHEN LTRIM(RTRIM(ISNULL(${a},''))) = '' AND LTRIM(RTRIM(ISNULL(${b},''))) = '' THEN '' WHEN LTRIM(RTRIM(ISNULL(${a},''))) = '' THEN ISNULL(${b},'') WHEN LTRIM(RTRIM(ISNULL(${b},''))) = '' THEN ISNULL(${a},'') ELSE LTRIM(RTRIM(${a})) + '${sign}' + LTRIM(RTRIM(${b})) END`;

function subTitleSql(id: number): string {
  const k = Math.trunc(id);
  // RagaName: each rag "type-name(remark)", run together, trimmed, "()" dropped.
  const raga = `REPLACE(LTRIM(RTRIM(ISNULL((SELECT ${sqlSignBetween('c2.Name', 'c3.Name', '-')} + '(' + LTRIM(RTRIM(ISNULL(T.Remark,''))) + ')'
    FROM KrutiSubTitleRagT T LEFT JOIN columnmaster c2 ON T.RagTypekt = c2.ColumnMastkm LEFT JOIN columnmaster c3 ON T.RagNamekt = c3.ColumnMastkm
    WHERE T.krutiSubTitleKt = KrutiSubTitleT.krutiSubTitleKm ORDER BY T.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'),''))), '()', '')`;
  return `SELECT KrutiSubTitleT.krutimstkt, krutiSubTitleKm, SubTitleNo, Refplace, SubTitleNm, txtSubTitleNm, KrutiSubTitleT.pariman,
    KrutiSubTitleT.parimanpattern, KrutiSubTitleT.adivakya, KrutiSubTitleT.antvakya, ${raga} AS RagaName, KrutiSubTitleT.desi, refpgno,
    KrutiSubTitleT.remark, seq FROM KrutiSubTitleT WHERE KrutiSubTitleT.krutimstkt IN (${k}) ORDER BY KrutiSubTitleT.krutimstkt, KrutiSubTitleT.seq`;
}

/** txtKrutiSubTitleTran, from the Title rows (FillData and the popup's Save word it alike). */
export function subTitleText(rows: Row[]): string {
  let out = '';
  for (const r of rows) {
    const v = (c: string) => text(get(r, c));
    const sp = (c: string, trim = true) =>
      v(c).trim() === '' ? '' : ` ${trim ? v(c).trim() : v(c)}`;
    out +=
      (out.trim() === '' ? '' : ';') +
      signBetween(v('SubTitleNo').trim(), v('Refplace').trim(), ' ') +
      sp('SubTitleNm') +
      sp('pariman') +
      sp('parimanpattern') +
      sp('adivakya', false) +
      sp('antvakya', false) +
      sp('RagaName', false) +
      sp('refpgno', false) +
      ',' +
      (v('remark').trim() === '' ? '' : `(${v('remark')})`);
  }
  return out;
}

/** The Rag popup's three tables (dskrutirag): KrutiRagT with its types' and names' texts. */
function ragSql(id: number): string[] {
  const k = Math.trunc(id);
  const joined = (table: string, col: string, kt: string) =>
    `ISNULL(STUFF((SELECT ',' + ISNULL(c.Name,'') + CASE WHEN LTRIM(RTRIM(ISNULL(x.Remark,''))) = '' THEN '' ELSE '(' + LTRIM(RTRIM(x.Remark)) + ')' END
      FROM ${table} x LEFT JOIN columnmaster c ON x.${kt} = c.ColumnMastkm WHERE x.krutiRagTkt = t.KrutiRagTkm
      ORDER BY x.${col} FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')`;
  return [
    `SELECT t.KrutiRagTkm, t.krutimstkt, ${joined('KrutiRagTRagTypeT', 'KrutiRagTRagTypeKm', 'RagTypekt')} AS Ragtype,
      ${joined('KrutiRagTRanNmT', 'KrutiRagTRagNmKm', 'RagNamekt')} AS Ragname, t.seq FROM KrutiRagT AS t WHERE t.krutimstkt IN (${k}) ORDER BY t.KrutiRagTkm`,
    `SELECT kt.KrutiRagTRagTypeKm, kt.krutiRagTkt, kt.krutimstkt, kt.RagTypekt, c.Name AS RagType, kt.Remark, kt.seq FROM KrutiRagTRagTypeT AS kt
      LEFT OUTER JOIN columnmaster AS c ON kt.RagTypekt = c.ColumnMastkm WHERE kt.krutimstkt IN (${k}) ORDER BY kt.KrutiRagTRagTypeKm`,
    `SELECT kt.KrutiRagTRagNmKm, kt.krutimstkt, kt.krutiRagTkt, kt.RagNamekt, c.Name AS RagName, kt.remark, kt.seq FROM KrutiRagTRanNmT AS kt
      LEFT OUTER JOIN columnmaster AS c ON kt.RagNamekt = c.ColumnMastkm WHERE kt.krutimstkt IN (${k}) ORDER BY kt.KrutiRagTRagNmKm`,
  ];
}

/** FillData's txtKrutiRagTran: "types-names" per rag, joined by ";". */
async function ragText(db: Executor, id: number): Promise<string> {
  const { rows } = await sql<{
    Ragtype: string | null;
    Ragname: string | null;
  }>`${trustedSql(ragSql(id)[0]!)}`.execute(db);
  let out = '';
  for (const r of rows) {
    const type = text(r.Ragtype).trim();
    out += (out.trim() === '' ? '' : ';') + (type === '' ? '' : `${type}-`) + text(r.Ragname);
  }
  return out;
}

const REF_LIB_SQL = (id: number) =>
  `SELECT krutiRefLibno.krutimstkt,krutiRefLibno.krutiReflibnokm,krutiRefLibno.bhandarkt,ISNULL(PartyM.PName,N'') AS BhandarName,krutiRefLibno.remark,krutiRefLibno.BookTKt,BookT.Libno AS BookTName,case when ISNULL(krutiRefLibno.BookTKt,0)<>0 then BookM.bookname else '' end as BookDetail,krutiRefLibno.refplacekt,ISNULL(columnmaster_1.Name,N'') AS RefPlaceName,krutiRefLibno.refpgno,krutiRefLibno.signkt,ISNULL(columnmaster.Name,N'') AS SignName,krutiRefLibno.ktypeid,com1.Name as Typename,isnull(krutiRefLibno.lipi,'') as lipiname,krutiRefLibno.pariman,krutiRefLibno.vishash,krutireflibno.libseq,ISNULL(krutiRefLibno.IsCommonGroup,1) AS IsCommonGroup,ISNULL(krutiRefLibno.IsPrint,0) AS IsPrint,krutiRefLibno.seq FROM columnmaster RIGHT OUTER JOIN krutiRefLibno ON columnmaster.ColumnMastkm = krutiRefLibno.signkt LEFT OUTER JOIN columnmaster AS columnmaster_1 ON krutiRefLibno.refplacekt = columnmaster_1.ColumnMastkm LEFT OUTER JOIN PartyM ON krutiRefLibno.bhandarkt = PartyM.partyMkm left outer join columnmaster as com1 on krutiRefLibno.ktypeid=com1.ColumnMastkm left join BookT on BookT.tid = krutiRefLibno.BookTKt  left join BookM on BookT.BookMastkt = BookM.BookMastkm WHERE KrutiRefLibNo.krutimstkt in (${Math.trunc(id)}) and ISNULL(bookT.CupBoardRackNo,'') not like '%/%' order by krutiRefLibno.seq`;

async function refLibRows(db: Executor, id: number): Promise<Row[]> {
  const { rows } = await sql<Row>`${trustedSql(REF_LIB_SQL(id))}`.execute(db);
  return rows;
}

/** FillData's txtkrutireflibnoTran (the popup's Save words it without lipi/pariman/vishash). */
function refLibText(rows: Row[]): string {
  let out = '';
  for (const r of rows) {
    const v = (c: string) => text(get(r, c));
    out +=
      `${v('BhandarName')} ${v('Remark')} ${v('BookTName').trim() === '' ? 'प्र.क्र.' : v('BookTName')} ${v('refplacename')} ${
        v('refpgno').trim() === '' ? '' : `पृष्ठ-${v('refpgno')}`
      }${v('SignName')}`.trim() +
      (v('Typename').trim() === '' ? '' : ` ${v('Typename')}`) +
      v('lipiName').trim() +
      v('pariman').trim() +
      v('vishash').trim();
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// Save
// ------------------------------------------------------------------------------------------

export function validateKruti(f: Record<string, FieldValue>): string {
  if (val(f.KrutiNo) === 0) return 'KrutiNo is Null so record can not be saved ';
  return '';
}

/** Rows the client sent for a popup, or the database's (the DataTable FillData loaded). */
async function rowsOr(
  db: Executor,
  sent: Row[] | null,
  query: RawBuilder<unknown>,
): Promise<Row[]> {
  if (sent) return sent;
  const { rows } = await sql<Row>`${query}`.execute(db);
  return rows;
}

/**
 * Save() of frmKrutiMasterNew, in one transaction. A child table is rewritten only when its
 * popup's rows were sent (the popup was opened); authors only after their popup was saved, as
 * the desktop's boolAuthorSel. The desktop rewrote every table from what FillData loaded, which
 * for an unopened popup is the same rows (see docs/screens/kruti-master.md).
 */
async function saveKruti(
  trx: Executor,
  userId: number,
  id: number,
  f: Record<string, FieldValue>,
): Promise<number> {
  const add = id === 0;
  const krutiNo = int(f.KrutiNo);
  const dup = Number(
    (await scalar(
      trx,
      sql`SELECT COUNT(*) FROM krutiMst WHERE krutimstkm <> ${id} AND KrutiNo = ${krutiNo}`,
    )) ?? 0,
  );
  if (dup > 0) throw new BadRequestException(`Cannot Enter RecordNo ${text(f.KrutiNo)}`);

  // Rsamvatvir stays only with a Samvat Type and a Samvat.
  let rsamvat = Math.trunc(val(f.Rsamvatvir));
  if (rsamvat === 0 || text(f.samvattypeText).trim() === '' || text(f.rachsamvat).trim() === '')
    rsamvat = 0;

  const v = {
    krutiname: text(f.krutiname).trim(),
    KrutiNo: krutiNo,
    krutitypekt: int(f.krutitypekt),
    granthagra: text(f.granthagra).trim(),
    adivakya: text(f.adivakya).trim(),
    antvakya: text(f.antvakya).trim(),
    samvattype: int(f.samvattype),
    rachsamvat: text(f.rachsamvat).trim(),
    Rsamvatvir: rsamvat,
    rachnasthalkt: int(f.rachnasthalkt),
    PurnaKt: int(f.PurnaKt),
    prasastitypekt: int(f.prasastitypekt),
    prasastipariman: text(f.prasastipariman).trim(),
    remark: text(f.remark).trim(),
    prapat: bit(f.prapat) ? 1 : 0,
    published: bit(f.published) ? 1 : 0,
    pending: bit(f.pending) ? 1 : 0,
    extraid2: intText(f.extraid2),
    extranm: text(f.extranm),
    parimanpattern: text(f.parimanpattern),
    samvatkindkt: int(f.samvatkindkt),
    groupnm: text(f.groupnm),
    grpremark: text(f.grpremark),
    IsDummy: bit(f.IsDummy) ? 1 : 0,
    IsDownLevel: bit(f.IsDownLevel) ? 1 : 0,
    IsNSMP: bit(f.IsNSMP) ? 1 : 0,
  };

  let kid = id;
  await asDesktopError(async () => {
    if (add) {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO krutiMst (krutiname, KrutiNo, krutitypekt, granthagra, adivakya, antvakya, samvattype, rachsamvat, Rsamvatvir,
          rachnasthalkt, PurnaKt, prasastitypekt, prasastipariman, vishesh, remark, prapat, published, pending, extraid1, extraid2,
          extranm, endate, moddate, enuser, moduser, parimanpattern, samvatkindkt, ragakt, desi, groupnm, grpno, grpremark,
          oldkrutiNo, pno, Bhasha, Author, Pariman, Swaroop, AuthSamvat, SwaroopNo, IsDummy, IsDownLevel, IsNSMP)
        OUTPUT INSERTED.krutimstkm AS id
        VALUES (${v.krutiname}, ${v.KrutiNo}, ${v.krutitypekt}, ${v.granthagra}, ${v.adivakya}, ${v.antvakya}, ${v.samvattype},
          ${v.rachsamvat}, ${v.Rsamvatvir}, ${v.rachnasthalkt}, ${v.PurnaKt}, ${v.prasastitypekt}, ${v.prasastipariman}, '',
          ${v.remark}, ${v.prapat}, ${v.published}, ${v.pending}, 0, ${v.extraid2}, ${v.extranm}, CONVERT(date, GETDATE()),
          CONVERT(date, GETDATE()), ${userId}, ${userId}, ${v.parimanpattern}, ${v.samvatkindkt}, 0, NULL, ${v.groupnm}, 0,
          ${v.grpremark}, NULL, NULL, '', '', '', '', 0, 0, ${v.IsDummy}, ${v.IsDownLevel}, ${v.IsNSMP})
      `.execute(trx);
      kid = Number(rows[0]!.id);
    } else {
      // KrutiHeadkt is left as it is: the desktop writes Val(txtVibhagTran.Tag), a Tag nothing
      // sets, so it would zero the old head (see the doc's deliberate differences).
      await sql`
        UPDATE krutiMst SET krutiname = ${v.krutiname}, KrutiNo = ${v.KrutiNo}, krutitypekt = ${v.krutitypekt},
          granthagra = ${v.granthagra}, adivakya = ${v.adivakya}, antvakya = ${v.antvakya}, samvattype = ${v.samvattype},
          rachsamvat = ${v.rachsamvat}, Rsamvatvir = ${v.Rsamvatvir}, rachnasthalkt = ${v.rachnasthalkt}, PurnaKt = ${v.PurnaKt},
          prasastitypekt = ${v.prasastitypekt}, prasastipariman = ${v.prasastipariman}, vishesh = '', remark = ${v.remark},
          prapat = ${v.prapat}, published = ${v.published}, pending = ${v.pending}, extraid2 = ${v.extraid2},
          extranm = ${v.extranm}, moddate = CONVERT(date, GETDATE()), moduser = ${userId}, parimanpattern = ${v.parimanpattern},
          samvatkindkt = ${v.samvatkindkt}, grpremark = ${v.grpremark}, IsDummy = ${v.IsDummy}, IsDownLevel = ${v.IsDownLevel},
          IsNSMP = ${v.IsNSMP}, pno = ${intText(f.PNo)}
          ${bit(f.GroupDisabled) ? sql`` : sql`, groupnm = ${v.groupnm}`}
        WHERE krutimstkm = ${id}
      `.execute(trx);
    }
  });

  const del = async (table: string, column = 'krutimstkt') => {
    if (!add)
      await sql`DELETE FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ${kid}`.execute(trx);
  };

  // Bhasha (blank rows are not stored).
  const bhasha = grid(f, 'BhashaTran');
  if (bhasha) {
    await del('krutibhasT');
    let key = await nextKey(trx, 'krutibhasT', 'krutibhashakm');
    for (const r of bhasha.filter((x) => int(get(x, 'bhashakt')) > 0)) {
      await sql`
        INSERT INTO krutibhasT (krutibhashakm, krutimstkt, bhashakt, seq, Remarkkt)
        VALUES (${key++}, ${kid}, ${int(get(r, 'bhashakt'))}, ${int(get(r, 'seq'))}, ${int(get(r, 'Remarkkt'))})`.execute(
        trx,
      );
    }
  }

  const vibhag = grid(f, 'VibhagTran');
  if (vibhag) {
    await del('KrutiVibhagT');
    for (const r of vibhag.filter((x) => int(get(x, 'VibhagKt')) > 0)) {
      await sql`
        INSERT INTO KrutiVibhagT (KrutiMstKt, VibhagKt, Seq) VALUES (${kid}, ${int(get(r, 'VibhagKt'))}, ${int(get(r, 'seq'))})`.execute(
        trx,
      );
    }
  }

  const subjects = grid(f, 'KrutiSubjTran');
  if (subjects && subjects.length > 0)
    await saveKrutiSubjects(trx, kid, subjects, extra(f, 'KrutiSubjTran', 1));

  // Authors: only after their popup was saved (boolAuthorSel / boolSAuthorSel).
  const authors = grid(f, 'AuthorTran');
  if (authors) {
    await del('krutiauthT');
    let key = await nextKey(trx, 'krutiauthT', 'krutauthkm');
    for (const r of authors.filter(
      (x) => int(get(x, 'authorcokt')) > 0 || int(get(x, 'authtycokt')) > 0,
    )) {
      await sql`
        INSERT INTO krutiauthT (krutauthkm, krutimstkt, authorcokt, authtycokt, avasthaid, seq, AuthAnyaNmKt, UpdateAuthorSamvat)
        VALUES (${key++}, ${kid}, ${int(get(r, 'authorcokt'))}, ${int(get(r, 'authtycokt'))}, ${int(get(r, 'avasthaid'))},
          ${int(get(r, 'seq'))}, ${int(get(r, 'AuthAnyaNmKt'))}, ${bit(get(r, 'UpdateAuthorSamvat')) ? 1 : 0})`.execute(
        trx,
      );
    }
  }
  const sAuthors = grid(f, 'SAuthorTran');
  if (sAuthors) {
    await del('krutiSautht');
    for (const r of sAuthors.filter(
      (x) => int(get(x, 'authorcokt')) > 0 || int(get(x, 'authtycokt')) > 0,
    )) {
      await sql`
        INSERT INTO krutiSautht (krutimstkt, authorcokt, authtycokt, avasthaid, seq, AuthAnyaNmKt)
        VALUES (${kid}, ${int(get(r, 'authorcokt'))}, ${int(get(r, 'authtycokt'))}, ${int(get(r, 'avasthaid'))},
          ${int(get(r, 'seq'))}, ${int(get(r, 'AuthAnyaNmKt'))})`.execute(trx);
    }
  }

  const vishay = grid(f, 'krutivishayTran');
  if (vishay) {
    await del('krutivishayT');
    let key = await nextKey(trx, 'krutivishayT', 'krutisubjkm');
    for (const r of vishay) {
      await sql`
        INSERT INTO krutivishayT (krutisubjkm, krutimstkt, Mark1, vishaykt, vachankt, vibhaktikt, Remark, seq)
        VALUES (${key++}, ${kid}, ${int(get(r, 'Mark1'))}, ${int(get(r, 'vishaykt'))}, ${int(get(r, 'vachankt'))},
          ${int(get(r, 'vibhaktikt'))}, ${text(get(r, 'Remark'))}, ${int(get(r, 'seq'))})`.execute(
        trx,
      );
    }
  }

  for (const [column, table, key] of [
    ['krutiparimnTran', 'krutiparimnT', 'krutparimKm'],
    ['krutisubparimnTran', 'krutisubparimnT', 'krutsubparimKm'],
  ] as const) {
    const rows = grid(f, column);
    if (!rows) continue;
    await del(table);
    let next = await nextKey(trx, table, key);
    for (const r of rows) {
      await sql`
        INSERT INTO ${sql.table(table)} (${sql.ref(key)}, krutimstkt, Sign1Kt, parimantypkt, pariman, Sign2kt, seq)
        VALUES (${next++}, ${kid}, ${int(get(r, 'sign1kt'))}, ${int(get(r, 'parimantypkt'))}, ${text(get(r, 'pariman'))},
          ${int(get(r, 'sign2kt'))}, ${int(get(r, 'seq'))})`.execute(trx);
    }
  }

  const refLib = grid(f, 'krutireflibnoTran');
  if (refLib) {
    await del('krutiRefLibno');
    let key = await nextKey(trx, 'krutiRefLibno', 'krutiReflibnokm');
    for (const r of refLib) {
      await sql`
        INSERT INTO krutiRefLibno (krutiReflibnokm, krutimstkt, bhandarkt, remark, reflibno, refplacekt, refpgno, signkt, seq, ktypeid,
          lipi, pariman, vishash, libseq, BookTKt, IsCommonGroup, IsPrint)
        VALUES (${key++}, ${kid}, ${int(get(r, 'bhandarkt'))}, ${text(get(r, 'remark'))}, ${text(get(r, 'BookTName'))},
          ${int(get(r, 'refplacekt'))}, ${text(get(r, 'refpgno'))}, ${int(get(r, 'signkt'))}, ${int(get(r, 'seq'))},
          ${int(get(r, 'ktypeid'))}, ${text(get(r, 'lipiname'))}, ${text(get(r, 'pariman'))}, ${text(get(r, 'vishash'))},
          ${int(get(r, 'libseq'))}, ${int(get(r, 'BookTKt'))}, ${bit(get(r, 'IsCommonGroup')) ? 1 : 0},
          ${bit(get(r, 'IsPrint')) ? 1 : 0})`.execute(trx);
    }
  }

  const rel = grid(f, 'krutiRelTran');
  if (rel) {
    await del('krutiRelT');
    let key = await nextKey(trx, 'krutiRelT', 'krutirelkm');
    for (const r of rel.filter((x) => int(get(x, 'uplevelKrutimstkt')) > 0)) {
      await sql`
        INSERT INTO krutiRelT (krutirelkm, krutimstkt, uplevelKrutimstkt, seq)
        VALUES (${key++}, ${kid}, ${int(get(r, 'uplevelKrutimstkt'))}, ${int(get(r, 'seq'))})`.execute(
        trx,
      );
    }
  }

  const notes = grid(f, 'KrutiNoteTran');
  if (notes) {
    await del('KrutiNoteT');
    let key = await nextKey(trx, 'KrutiNoteT', 'KrutiNoteKm');
    for (const r of notes) {
      await sql`
        INSERT INTO KrutiNoteT (KrutiNoteKm, krutimstkt, KrutiColKt, SeriesKt, wordnm, prakashankt, RefplaceKt, pgno, SignColKt, seq, BookTkt)
        VALUES (${key++}, ${kid}, ${int(get(r, 'KrutiColkt'))}, ${int(get(r, 'Serieskt'))}, ${text(get(r, 'wordnm'))},
          ${text(get(r, 'BookTName'))}, ${int(get(r, 'refplacekt'))}, ${text(get(r, 'pgno'))}, ${int(get(r, 'SignColkt'))},
          ${int(get(r, 'seq'))}, ${int(get(r, 'BookTKt'))})`.execute(trx);
    }
  }

  const swaroop = grid(f, 'SwaroopTran');
  if (swaroop) {
    await del('krutiSwaropT');
    let key = await nextKey(trx, 'krutiSwaropT', 'krutiswaropkm');
    for (const r of swaroop.filter((x) => int(get(x, 'swroopkt')) > 0)) {
      await sql`
        INSERT INTO krutiSwaropT (krutiswaropkm, krutimstkt, swroopkt, seq, mark1)
        VALUES (${key++}, ${kid}, ${int(get(r, 'swroopkt'))}, ${int(get(r, 'seq'))}, ${int(get(r, 'mark1'))})`.execute(
        trx,
      );
    }
  }

  const titles = grid(f, 'KrutiSubTitleTran');
  if (titles)
    await saveSubTitles(
      trx,
      kid,
      add,
      titles,
      extra(f, 'KrutiSubTitleTran', 1),
      extra(f, 'KrutiSubTitleTran', 2),
    );

  const names = grid(f, 'KrutiNmTran');
  if (names) {
    await del('KrutiNmT');
    let key = await nextKey(trx, 'KrutiNmT', 'KrutiNmkm');
    for (const r of names) {
      await sql`
        INSERT INTO KrutiNmT (KrutiNmkm, Krutimstkt, Anyaname, seq, Mark1, remark)
        VALUES (${key++}, ${kid}, ${text(get(r, 'Anyaname'))}, ${int(get(r, 'seq'))}, ${int(get(r, 'mark1'))},
          ${text(get(r, 'remark'))})`.execute(trx);
    }
  }

  const rags = grid(f, 'KrutiRagTran');
  if (rags) {
    await del('KrutiRagTRanNmT');
    await del('KrutiRagTRagTypeT');
    await del('KrutiRagT');
    const types = extra(f, 'KrutiRagTran', 1);
    const ragNames = extra(f, 'KrutiRagTran', 2);
    let key = await nextKey(trx, 'KrutiRagT', 'KrutiRagTkm');
    let typeKey = await nextKey(trx, 'KrutiRagTRagTypeT', 'KrutiRagTRagTypeKm');
    let nameKey = await nextKey(trx, 'KrutiRagTRanNmT', 'KrutiRagTRagNmKm');
    for (const r of rags) {
      const old = int(get(r, 'KrutiRagTkm'));
      await sql`INSERT INTO KrutiRagT (KrutiRagTkm, krutimstkt, seq) VALUES (${key}, ${kid}, ${int(get(r, 'seq'))})`.execute(
        trx,
      );
      for (const t of types.filter((x) => int(get(x, 'krutiRagTkt')) === old)) {
        await sql`
          INSERT INTO KrutiRagTRagTypeT (KrutiRagTRagTypeKm, krutimstkt, krutiRagTkt, RagTypekt, Remark, seq)
          VALUES (${typeKey++}, ${kid}, ${key}, ${int(get(t, 'RagTypekt'))}, ${text(get(t, 'remark'))}, ${int(get(t, 'seq'))})`.execute(
          trx,
        );
      }
      for (const n of ragNames.filter((x) => int(get(x, 'krutiRagTkt')) === old)) {
        await sql`
          INSERT INTO KrutiRagTRanNmT (KrutiRagTRagNmKm, krutimstkt, krutiRagTkt, RagNamekt, remark, seq)
          VALUES (${nameKey++}, ${kid}, ${key}, ${int(get(n, 'RagNameKt'))}, ${text(get(n, 'remark'))}, ${int(get(n, 'seq'))})`.execute(
          trx,
        );
      }
      key++;
    }
  }

  const sampraday = grid(f, 'SampradayTran');
  if (sampraday) {
    const kept: number[] = [];
    for (const r of sampraday.filter((x) => val(get(x, 'SampradayKt')) > 0)) {
      const km = int(get(r, 'KrutiSampradayKm'));
      if (km <= 0) {
        const { rows } = await sql<{ id: number }>`
          INSERT INTO KrutiSampradayT (KrutimstKt, SampradayKt, Seq) OUTPUT INSERTED.KrutiSampradayKm AS id
          VALUES (${kid}, ${int(get(r, 'SampradayKt'))}, ${int(get(r, 'Seq'))})`.execute(trx);
        kept.push(Number(rows[0]!.id));
      } else {
        await sql`UPDATE KrutiSampradayT SET SampradayKt = ${int(get(r, 'SampradayKt'))}, Seq = ${int(get(r, 'Seq'))}
          WHERE KrutiSampradayKm = ${km}`.execute(trx);
        kept.push(km);
      }
    }
    await sql`DELETE FROM KrutiSampradayT WHERE KrutimstKt = ${kid} AND KrutiSampradayKm NOT IN ${toIds([0, ...kept])}`.execute(
      trx,
    );
  }

  // The texts krutiMst keeps of its child rows.
  const bhashaText = await scalar<string>(
    trx,
    sql`SELECT ISNULL(STUFF((SELECT ',' + ISNULL(b.bhasa_attr, '') FROM krutibhasT k INNER JOIN bhasmast b ON b.bhashacokm = k.bhashakt
      WHERE k.krutimstkt = ${kid} ORDER BY k.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')`,
  );
  const vibhagText = await scalar<string>(
    trx,
    sql`SELECT ISNULL(STUFF((SELECT ',' + ISNULL(c.Name, '') FROM KrutiVibhagT k INNER JOIN columnmaster c ON k.VibhagKt = c.ColumnMastkm
      WHERE k.KrutiMstKt = ${kid} ORDER BY k.Seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')`,
  );
  const swaroopText = await scalar<string>(
    trx,
    sql`SELECT ISNULL(STUFF((SELECT ',' + CASE WHEN ISNULL(c.shortnm, '') = '' THEN ISNULL(c.Name, '') ELSE c.shortnm END
      FROM krutiSwaropT k INNER JOIN columnmaster c ON k.swroopkt = c.ColumnMastkm WHERE k.krutimstkt = ${kid} ORDER BY k.seq
      FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')`,
  );

  // StrPariman: the SubPariman box, then each Pariman row, then the prasasti.
  const parimanRows = await rowsOr(
    trx,
    grid(f, 'krutiparimnTran'),
    sql`SELECT ISNULL(c1.Name, N'') AS Sign1, ISNULL(c.ShortNm, N'') AS ParimanType, p.pariman, ISNULL(c2.Name, N'') AS Sign2
      FROM krutiparimnT p LEFT JOIN columnmaster c1 ON c1.ColumnMastkm = p.Sign1Kt LEFT JOIN columnmaster c ON c.ColumnMastkm = p.parimantypkt
      LEFT JOIN columnmaster c2 ON c2.ColumnMastkm = p.Sign2kt WHERE p.krutimstkt = ${kid} ORDER BY p.seq`,
  );
  let pariman = text(f.krutisubparimnTran).trim();
  for (const r of parimanRows) {
    pariman +=
      (pariman === '' ? '' : ' ') +
      `${text(get(r, 'Sign1'))}${text(get(r, 'ParimanType'))} ${text(get(r, 'Pariman'))}${text(get(r, 'Sign2'))}`;
  }
  pariman = signBetween(pariman, text(f.prasastitypeText));
  pariman = signBetween(pariman, text(f.prasastipariman), ' ');

  // AuthSamvat: the first author's printed samvat.
  const authorRows = await rowsOr(
    trx,
    authors,
    sql`SELECT authorcokt, seq FROM krutiauthT WHERE krutimstkt = ${kid}`,
  );
  let authSamvat = 0;
  for (const r of authorRows.filter((x) => int(get(x, 'seq')) === 1)) {
    authSamvat = int(
      await scalar(
        trx,
        sql`SELECT ISNULL(vksamvat, 0) FROM AuthorSamvatT WHERE AuthorKt = ${int(get(r, 'authorcokt'))} AND IsPrint = 1`,
      ),
    );
  }

  await sql`
    UPDATE krutiMst SET Bhasha = ${text(bhashaText).trim()}, Pariman = ${pariman.trim()}, Swaroop = ${text(swaroopText).trim()},
      Vibhag = ${text(vibhagText).trim()}, AuthSamvat = ${authSamvat}
    WHERE krutimstkm = ${kid}
  `.execute(trx);
  await resetSamvatlessVk(trx);
  await updateKrutiAuthor(trx, 'Author1', [kid]);
  await updateKrutiAuthor(trx, 'Author2', [kid]);
  return kid;
}

/** The Title popup: every row with new keys, its rags, and its names (VishayEntry). */
async function saveSubTitles(
  trx: Executor,
  kid: number,
  add: boolean,
  rows: Row[],
  rags: Row[],
  names: Row[],
) {
  if (!add) {
    await sql`DELETE FROM KrutiSubTitleT WHERE krutimstkt = ${kid}`.execute(trx);
    await sql`DELETE FROM KrutiSubTitleRagT WHERE krutimstkt = ${kid}`.execute(trx);
  }
  let key = await nextKey(trx, 'KrutiSubTitleT', 'krutiSubTitleKm');
  let ragKey = await nextKey(trx, 'KrutiSubTitleRagT', 'KrutiSubTitleRagkm');
  const named: { key: number; kept: number[] }[] = [];
  for (const r of rows) {
    const old = get(r, 'krutiSubTitleKm');
    await sql`
      INSERT INTO KrutiSubTitleT (krutiSubTitleKm, krutimstkt, SubTitleNo, Refplace, SubTitleNm, pariman, parimanpattern, adivakya,
        antvakya, ragakt, desi, refpgno, remark, seq)
      VALUES (${key}, ${kid}, ${text(get(r, 'SubTitleNo'))}, ${text(get(r, 'Refplace'))}, ${text(get(r, 'SubTitleNm'))},
        ${text(get(r, 'pariman'))}, ${text(get(r, 'parimanpattern'))}, ${text(get(r, 'adivakya'))}, ${text(get(r, 'antvakya'))},
        0, '', ${text(get(r, 'refpgno'))}, ${text(get(r, 'remark'))}, ${int(get(r, 'seq'))})`.execute(
      trx,
    );
    const mine = names.filter((n) => String(get(n, 'RecordKt')) === String(old));
    if (mine.length > 0)
      named.push({ key, kept: await saveVishayEntries(trx, 'KrutiTitleSubTitleName', key, mine) });
    for (const g of rags.filter((x) => String(get(x, 'krutiSubTitleKt')) === String(old))) {
      await sql`
        INSERT INTO KrutiSubTitleRagT (KrutiSubTitleRagkm, krutiSubTitleKt, krutimstkt, Signkt, RagTypekt, RagNamekt, Remark, Seq)
        VALUES (${ragKey++}, ${key}, ${kid}, ${int(get(g, 'Signkt'))}, ${int(get(g, 'RagTypekt'))}, ${int(get(g, 'RagNamekt'))},
          ${text(get(g, 'remark'))}, ${int(get(g, 'seq'))})`.execute(trx);
    }
    key++;
  }
  // SaveVishayEntry's clean-up, once every entry has moved to its title's new key.
  for (const n of named) {
    await sql`
      DELETE FROM VishayEntry WHERE TransactionName = 'KrutiTitleSubTitleName' AND RecordKt = ${n.key}
        AND VishayEntryKm NOT IN ${toIds([0, ...n.kept])}`.execute(trx);
  }
  await sql`
    DELETE VishayEntry FROM VishayEntry LEFT JOIN KrutiSubTitleT ON VishayEntry.RecordKt = KrutiSubTitleT.krutiSubTitleKm
    WHERE TransactionName = 'KrutiTitleSubTitleName' AND ISNULL(KrutiSubTitleT.krutiSubTitleKm, 0) = 0
  `.execute(trx);
  for (const n of named)
    await sql`EXEC UpdateVishay 'KrutiTitleSubTitleName', ${String(n.key)}`.execute(trx);
}

/** Save()'s KrutiSubject block: upsert by key, prune, then its Vishay entries. */
async function saveKrutiSubjects(trx: Executor, kid: number, rows: Row[], entries: Row[]) {
  const kept: number[] = [];
  for (const r of rows) {
    const km = int(get(r, 'KrutiSubjectKm'));
    const printDate = ddmmyyyy(get(r, 'PrintDate'));
    const values = {
      EntryType: text(get(r, 'EntryType')),
      Vishay: text(get(r, 'Vishay')),
      WorkDoneByKt: int(get(r, 'WorkDoneByKt')),
      PrintSeq: int(get(r, 'PrintSeq')),
      Remark: text(get(r, 'Remark')),
      Seq: int(get(r, 'seq')),
    };
    if (km === 0) {
      const { rows: ins } = await sql<{ id: number }>`
        INSERT INTO KrutiSubjectT (KrutimstKt, EntryType, Vishay, WorkDoneByKt, PrintSeq, Remark, Seq, PrintDate)
        OUTPUT INSERTED.KrutiSubjectKm AS id
        VALUES (${kid}, ${values.EntryType}, ${values.Vishay}, ${values.WorkDoneByKt}, ${values.PrintSeq}, ${values.Remark},
          ${values.Seq}, ${printDate === null ? null : sql`CAST(${printDate} AS date)`})`.execute(
        trx,
      );
      kept.push(Number(ins[0]!.id));
    } else {
      // The desktop only sets PrintDate when the cell has one.
      await sql`
        UPDATE KrutiSubjectT SET EntryType = ${values.EntryType}, Vishay = ${values.Vishay}, WorkDoneByKt = ${values.WorkDoneByKt},
          PrintSeq = ${values.PrintSeq}, Remark = ${values.Remark}, Seq = ${values.Seq}
          ${printDate === null ? sql`` : sql`, PrintDate = CAST(${printDate} AS date)`}
        WHERE KrutiSubjectKm = ${km}`.execute(trx);
      kept.push(km);
    }
  }
  await sql`DELETE FROM KrutiSubjectT WHERE KrutiMstKt = ${kid} AND KrutiSubjectKm NOT IN ${toIds([0, ...kept])}`.execute(
    trx,
  );
  const entryIds: number[] = [];
  for (const e of entries) {
    if (val(get(e, 'VishayKt')) <= 0) continue;
    const entryId = int(get(e, 'Id'));
    if (entryId === 0) {
      const { rows: ins } = await sql<{ id: number }>`
        INSERT INTO VishayEntry (TransactionName, RecordKt, VishayKt, VachanKt, VibhaktiKt, Seq)
        OUTPUT INSERTED.VishayEntryKm AS id
        VALUES ('KrutiSubject', ${int(get(e, 'RecordKt'))}, ${int(get(e, 'VishayKt'))}, ${int(get(e, 'VachanKt'))},
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
    DELETE VishayEntry FROM VishayEntry LEFT JOIN KrutiSubjectT ON VishayEntry.RecordKt = KrutiSubjectT.KrutiSubjectKm
    WHERE TransactionName = 'KrutiSubject' AND KrutiSubjectT.KrutiMstKt = ${kid}
      AND VishayEntry.RecordKt IN ${toIds([0, ...kept])} AND VishayEntryKm NOT IN ${toIds([0, ...entryIds])}
  `.execute(trx);
  await sql`
    DELETE VishayEntry FROM VishayEntry LEFT JOIN KrutiSubjectT ON VishayEntry.RecordKt = KrutiSubjectT.KrutiSubjectKm
    WHERE TransactionName = 'KrutiSubject' AND ISNULL(KrutiSubjectT.KrutiSubjectKm, 0) = 0
  `.execute(trx);
  for (const km of kept) await sql`EXEC UpdateVishay 'KrutiSubject', ${String(km)}`.execute(trx);
}

// ------------------------------------------------------------------------------------------
// The popups (SetForm_Kruti) and their cell lists
// ------------------------------------------------------------------------------------------

const SIGN = list(
  sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'Sign' ORDER BY Name`,
);
const REF_PLACE = list(
  sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'RefPlace' ORDER BY Name`,
);
const PARIMAN_TYPE = list(
  sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'ParimnType' ORDER BY Name`,
);
const PARIMAN_LOOKUPS = { sign1: SIGN, sign2: SIGN, parimantype: PARIMAN_TYPE };

/** Every kruti's authors (any name, else name) and languages, as frmList1 shows them. */
const KRUTI_AUTHOR = `ISNULL(STUFF((SELECT ',' + ISNULL(AuthMAnyNmT.AnyaName, authmast.authorname) FROM krutiauthT
  LEFT JOIN authmast ON krutiauthT.authorcokt = authmast.authorcokm LEFT JOIN AuthMAnyNmT ON AuthMAnyNmT.AuthAnyaNmKm = krutiautht.AuthAnyaNmKt
  WHERE krutiauthT.krutimstkt = krutiMst.krutimstkm ORDER BY krutiauthT.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')`;
const KRUTI_BHASHA = `ISNULL(STUFF((SELECT ',' + ISNULL(b.bhasa_attr, '') FROM krutibhasT k LEFT JOIN bhasmast b ON k.bhashakt = b.bhashacokm
  WHERE k.krutimstkt = krutiMst.krutimstkm ORDER BY k.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')`;

/** The group popup's kruti list: every kruti with its adivakya and authors. */
const GROUP_KRUTI_AUTHOR = `ISNULL(STUFF((SELECT ',' + ISNULL(a.authorname, '') FROM krutiauthT k LEFT JOIN authmast a ON k.authorcokt = a.authorcokm
  WHERE k.krutimstkt = krutiMst.krutimstkm FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')`;

const TRANS: Record<string, TransDefinition> = {
  KrutiNmTran: {
    lookups: {
      anyaname: list(sql`SELECT DISTINCT 0 AS Id, Anyaname FROM KrutiNmT ORDER BY Anyaname`),
      mark: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = N'NameType' ORDER BY Name`,
      ),
    },
  },
  AuthorTran: { lookups: authorLookups() },
  SAuthorTran: { lookups: authorLookups() },
  krutiparimnTran: { lookups: PARIMAN_LOOKUPS },
  krutisubparimnTran: { lookups: PARIMAN_LOOKUPS },
  KrutiSubTitleTran: {
    statements: async (_db, id) => [
      subTitleSql(id),
      `select T.krutimstkt,T.KrutiSubTitleRagkm,T.krutiSubTitleKt,T.Signkt,isnull(c1.Name,'') as Sign,isnull(T.RagTypekt,0) RagTypekt,isnull(c2.Name,'') as RagType,T.RagNamekt,isnull(c3.Name,'') as RagName,T.Remark,T.seq from KrutiSubTitleRagT T left outer join columnmaster c1 on T.Signkt=c1.ColumnMastkm left outer join columnmaster c2 on T.RagTypekt=c2.ColumnMastkm left outer join columnmaster c3 on T.RagNamekt =c3.ColumnMastkm where krutimstkt in (${Math.trunc(id)}) order by T.krutimstkt,T.seq`,
      `SELECT VishayEntryKm AS Id,RecordKt,VishayEntry.VishayKt,CASE WHEN ISNULL(VishayAnyaNameT.AnyaName,'')<>'' THEN VishayAnyaNameT.AnyaName ELSE vishay_nm END AS Vishay,VachanKt,vachan_nm AS Vachan,VibhaktiKt,vibh_nm AS Vibhakti,VishayEntry.AnyaNameKt,VishayEntry.Seq From VishayEntry LEFT JOIN VishayAnyaNameT ON VishayEntry.AnyaNameKt=VishayAnyaNameT.VishayAnyaNameKm INNER JOIN KrutiSubTitleT ON VishayEntry.RecordKt=KrutiSubTitleT.krutiSubTitleKm INNER Join vishay On VishayEntry.VishayKt=vishay.vishaycokm Left Join vachan On VachanKt=vachan.vachancokm Left Join vibhakti On VibhaktiKt=vibhakti.vibhaktikm Where KrutiSubTitleT.krutimstkt in (${Math.trunc(id)}) And TransactionName = 'KrutiTitleSubTitleName' order by VishayEntry.Seq`,
    ],
    lookups: {
      ...VISHAY_ENTRY_LOOKUPS,
      refplace: REF_PLACE,
      // MultiRagSubTitle
      sign: SIGN,
      ragtype: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'ragtype' ORDER BY Name`,
      ),
      ragname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'rag' ORDER BY Name`,
      ),
    },
  },
  krutivishayTran: {
    lookups: {
      m1: SIGN,
      vishay: list(
        sql`SELECT ColumnMastkm, name, ISNULL(Brief, '') AS Brief FROM columnmaster WHERE vibhag = 'KrutiMSubject' ORDER BY name`,
      ),
      vachan: list(sql`SELECT vachancokm, vachan_nm FROM vachan ORDER BY vachan_nm`),
      vibhakti: list(sql`SELECT vibhaktikm, vibh_nm FROM vibhakti ORDER BY vibh_nm`),
    },
  },
  krutiRelTran: {},
  SwaroopTran: {
    lookups: {
      swroop: list(sql`
        SELECT c1.ColumnMastkm, c1.ShortNm, c1.Name, c1.Brief, c1.ColumnNo, c1.Remark, ISNULL(c.name, '') AS Uplevel
        FROM columnmaster AS c1 LEFT OUTER JOIN columnmaster AS c ON c1.UplevelId = c.ColumnMastkm
        WHERE c1.Vibhag = N'Swroop' ORDER BY c1.Name`),
      m1: list(
        sql`SELECT ColumnMastkm, name FROM columnmaster WHERE Vibhag = 'sign' ORDER BY name`,
      ),
    },
  },
  KrutiRagTran: {
    statements: async (_db, id) => ragSql(id),
    lookups: {
      ragtype: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = N'RagType' ORDER BY Name`,
      ),
      ragname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = N'Rag' ORDER BY Name`,
      ),
    },
  },
  krutireflibnoTran: {
    statements: async (_db, id) => [REF_LIB_SQL(id)],
    lookups: {
      bhandarname: list(
        sql`SELECT partyMkm, PName, shortnm, txtAddress FROM PartyM WHERE Categorykt = 14132 ORDER BY PName`,
      ),
      booktname: list(
        sql`SELECT Tid AS Id, libno, bookname FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm ORDER BY libno`,
      ),
      refplacename: REF_PLACE,
      signname: list(
        sql`SELECT ColumnMastkm, Name, ISNULL(Brief, '') AS brief FROM columnmaster WHERE vibhag = 'Sign' ORDER BY Name`,
      ),
      typename: list(
        sql`SELECT ColumnMastkm, Name, Brief, Remark, HindiWord FROM columnmaster WHERE vibhag = 'krutireftype' ORDER BY ColumnMastkm`,
      ),
      lipiname: list(sql`SELECT lipicodekm, lipiname, lipi_attr FROM lipimast ORDER BY lipiname`),
      // cntMenu "Show Book Detail": the book's name, kruti, prakashak, authors, samvat, pariman, vishesh.
      'book-detail': (db, row) =>
        pickListOf(
          db,
          sql`SELECT CASE WHEN ISNULL(${int(row.BookTKt)}, 0) <> 0 THEN tblBook.bookname
              + CASE WHEN ISNULL(tblBook.kruti_nam, '') = '' THEN '' ELSE ' K(' + tblBook.kruti_nam + ')' END
              + CASE WHEN ISNULL(tblPrak.PrakName, '') = '' THEN '' ELSE ' P(' + tblPrak.PrakName + ')' END
              + CASE WHEN ISNULL(tblAuth.AuthName, '') = '' THEN '' ELSE ' A(' + tblAuth.AuthName + ')' END
              + CASE WHEN CAST(tblBook.PsamvVk AS varchar) = '' THEN '' ELSE 'S(' + CAST(tblBook.PsamvVk AS varchar) + ')' END
              + CASE WHEN ISNULL(tblBook.pariman, '') = '' THEN '' ELSE ' Pr(' + tblBook.pariman + ')' END
              + ' V(' + tblBook.Vishesh + ')' ELSE '' END AS BookDetail
            FROM (SELECT BKname.tid, bookname, pariman, Entrmast.kruti_nam, PsamvVk,
                ISNULL(Vishesh_1, '') + ' ' + ISNULL(Vishesh_2, '') + ' ' + ISNULL(Vishesh_3, '') AS Vishesh
              FROM Entrmast INNER JOIN BKname ON BKname.tid = Entrmast.tid WHERE BKname.tid = ${int(row.BookTKt)}) tblBook
            LEFT JOIN (SELECT praktran.entrcodekt AS tid, STUFF((SELECT ',' + p.prakname FROM praktran t INNER JOIN prakmast p
                ON t.prakashakkt = p.prakcodekm WHERE t.entrcodekt = ${int(row.BookTKt)} ORDER BY t.seq FOR XML PATH('')), 1, 1, '') AS PrakName
              FROM praktran WHERE praktran.entrcodekt = ${int(row.BookTKt)} GROUP BY praktran.entrcodekt) tblPrak ON tblPrak.tid = tblBook.tid
            LEFT JOIN (SELECT AUTHTRAN.entrcodekt AS tid, STUFF((SELECT ',' + CASE WHEN ISNULL(at.authortype, '') = '' THEN '' ELSE at.authortype + '-' END
                + am.authorname FROM authtran t INNER JOIN authmast am ON t.AUTHORCOKT = am.authorcokm LEFT JOIN authtype at ON t.AUTHTYCOKT = at.authtycokm
                WHERE t.entrcodekt = ${int(row.BookTKt)} ORDER BY t.vseq FOR XML PATH('')), 1, 1, '') AS AuthName
              FROM AUTHTRAN WHERE AUTHTRAN.entrcodekt = ${int(row.BookTKt)} GROUP BY AUTHTRAN.entrcodekt) tblAuth ON tblAuth.tid = tblBook.tid`,
        ),
    },
  },
  KrutiNoteTran: {
    lookups: {
      kruticolname: list(
        sql`SELECT columnmastkm, name, columnno FROM columnmaster WHERE vibhag = 'KrutiCol' AND columnno > 0 ORDER BY columnno`,
      ),
      seriesname: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'Alpha' ORDER BY Name`,
      ),
      wordnm: (db, row) =>
        pickListOf(
          db,
          sql`SELECT 0 AS Id, wordnm FROM KrutiNoteT WHERE KrutiColKt = ${int(row.KrutiColKt)} GROUP BY wordnm ORDER BY wordnm`,
        ),
      booktname: list(sql`
        SELECT Tid AS Id, libno, bookname FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm
        WHERE ISNULL(libno, '') <> '' ORDER BY libno`),
      refplacename: REF_PLACE,
      signcolname: SIGN,
    },
  },
  BhashaTran: {
    lookups: {
      bhashaname: list(
        sql`SELECT bhashacokm, bhasa_attr, bhashaname FROM bhasmast ORDER BY bhashaname`,
      ),
      remark: list(
        sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = N'krutiBhashaRemark' ORDER BY Name`,
      ),
    },
  },
  SampradayTran: {
    lookups: {
      sampradayname: list(
        sql`SELECT columnmastkm, Name FROM columnMaster WHERE Vibhag = 'KrutiSampraday' ORDER BY Name`,
      ),
    },
  },
  VibhagTran: {
    lookups: {
      vibhagname: list(
        sql`SELECT ColumnMastkm, Name, ShortNm, Brief FROM columnmaster WHERE Vibhag = N'Head' ORDER BY Name`,
      ),
    },
  },
  KrutiSubjTran: {
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
  // txtgroupnm's F2: the kruti's group (TranName "group"), written at once by 'save-group'.
  group: {
    statements: async (_db, id) => [
      `select k1.krutimstkm,k1.KrutiNo,k1.extranm as krutiname,k1.adivakya,${GROUP_KRUTI_AUTHOR.replace(/krutiMst\.krutimstkm/g, 'k1.krutimstkm')} as authorname,k.remark,k.seq from KrutiGroupT as k left outer join krutimst as k1 on k.krutimstkt=k1.krutimstkm where k.groupno = ISNULL((select top 1 groupno from krutigroupt where krutimstkt=${Math.trunc(id)}),0) AND ISNULL(k1.krutimstkm,0)>0 order By seq`,
    ],
    lookups: {
      krutiname: list(
        trustedSql(
          `SELECT krutimstkm, extranm, adivakya, ${GROUP_KRUTI_AUTHOR} AS author FROM krutimst`,
        ),
      ),
      adivakya: list(
        trustedSql(
          `SELECT krutimstkm, adivakya, extranm, ${GROUP_KRUTI_AUTHOR} AS author FROM krutimst`,
        ),
      ),
      'group-kruti': (db, row) =>
        pickListOf(
          db,
          sql`SELECT krutimstkm, KrutiNo, extranm, adivakya, ${trustedSql(GROUP_KRUTI_AUTHOR)} AS author FROM krutimst
            WHERE krutimstkm = ${int(row.id)}`,
        ),
    },
  },
};

function authorLookups(): NonNullable<TransDefinition['lookups']> {
  return {
    authortype: list(sql`SELECT authtycokm, authortype FROM authtype ORDER BY authortype`),
    // Every author, its any names run on after "-".
    authorname: list(sql`
      SELECT a.Authorcokm, a.Authorname + ISNULL((SELECT '-' + n.AnyaName FROM AuthMAnyNmT n WHERE n.AuthmastKt = a.authorcokm
          ORDER BY n.seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), '') AS Authorname,
        a.Identyty, ISNULL(a.Count, 0) AS count, ISNULL(a.recordno, 0) AS recordno, ISNULL(c.Name, '') AS vibhag,
        a.txtParampara AS Parampara, ISNULL(v.SampradayName, '') AS samprady, a.txtGuru AS Guru,
        ISNULL(a.vksamvat, 0) AS vksamvat, a.Authorname AS mainname
      FROM Authmast AS a LEFT OUTER JOIN columnmaster AS c ON a.vibhagkt = c.ColumnMastkm
      LEFT OUTER JOIN Sampraday AS v ON a.SampradayKt = v.SampradayKm`),
    anyaname: (db, row) =>
      pickListOf(
        db,
        sql`SELECT REPLACE(0, 0, 0) AS id, authorname AS AnyaName FROM authmast WHERE authorcokm = ${int(row.authorcokt)}
          UNION SELECT AuthAnyaNmKm AS ID, AnyaName FROM AuthMAnyNmT WHERE AuthmastKt = ${int(row.authorcokt)}`,
      ),
    avastha: list(sql`
      SELECT Tid, Vishesh FROM visheshMast WHERE Remark = N'Avastha' AND ISNULL(VisheshNo, 0) > 0 ORDER BY Vishesh`),
  };
}

// ------------------------------------------------------------------------------------------
// The definition
// ------------------------------------------------------------------------------------------

export const krutiMaster: ScreenDefinition = {
  screen: 'kruti-master',
  table: 'krutiMst',
  primaryColumn: 'krutimstkm',
  lockable: true,
  listJoin: JOIN,
  ucSearchColumns: true,
  decorateList: appendAnyNames,
  menuLayoutType: 'Kruti',
  workReport: true,
  // CompareDataTable of Note, RefLibNo and Title (their ByRef arguments write back).
  workReportTrans: ['KrutiNoteTran', 'krutireflibnoTran', 'KrutiSubTitleTran'],
  deleteLabelColumn: 'extranm',
  deleteWorkReportText: (label) => `DEL-${label}`,
  help: true,

  validate: (f) => validateKruti(f),
  save: (trx, user, id, f) => saveKruti(trx, user.id, id, f),
  trans: TRANS,
  recordExtras,

  // btnNew_Click: finxmaxtid("krutiMst", "KrutiNo").
  async newDefaults(db) {
    const max = int(await scalar(db, sql`SELECT ISNULL(MAX(KrutiNo), 0) FROM krutiMst`));
    return { KrutiNo: max > 0 ? max + 1 : 1 };
  },

  // Delete(): the group's other members, then (after the password) an up level still linked.
  async checkInUse(db, id) {
    const others = Number(
      (await scalar(
        db,
        sql`SELECT COUNT(*) FROM KrutiGroupT WHERE krutimstkt <> ${id}
          AND groupno IN (SELECT groupno FROM KrutiGroupT WHERE krutimstkt = ${id})`,
      )) ?? 0,
    );
    if (others > 0) return "You can not delete Group's Master Record First Remove Group Member";
    const rel = Number(
      (await scalar(db, sql`SELECT COUNT(*) FROM krutiRelT WHERE krutimstkt = ${id}`)) ?? 0,
    );
    return rel > 0 ? 'Records in used anthor plase !' : '';
  },

  /**
   * Delete(): every child table, then the kruti. The desktop left second authors, sub pariman,
   * vibhag, sampraday, subjects and title names behind; they go too (see the doc).
   */
  async deleteRecord(trx, _user, id) {
    for (const t of [
      'krutiauthT',
      'krutiSautht',
      'krutibhasT',
      'krutiparimnT',
      'krutisubparimnT',
      'krutiRefLibno',
      'krutiRelT',
      'krutivishayT',
      'krutiSwaropT',
      'KrutiNoteT',
      'KrutiSubTitleRagT',
      'KrutiRagTRanNmT',
      'KrutiRagTRagTypeT',
      'KrutiRagT',
      'KrutiMulT',
      'KrutiNmT',
      'krutiGroupT',
      'KrutiVibhagT',
      'KrutiSampradayT',
    ]) {
      await sql`DELETE FROM ${sql.table(t)} WHERE krutimstkt = ${id}`.execute(trx);
    }
    await sql`
      DELETE VishayEntry FROM VishayEntry INNER JOIN KrutiSubTitleT ON VishayEntry.RecordKt = KrutiSubTitleT.krutiSubTitleKm
      WHERE TransactionName = 'KrutiTitleSubTitleName' AND KrutiSubTitleT.krutimstkt = ${id}`.execute(
      trx,
    );
    await sql`
      DELETE VishayEntry FROM VishayEntry INNER JOIN KrutiSubjectT ON VishayEntry.RecordKt = KrutiSubjectT.KrutiSubjectKm
      WHERE TransactionName = 'KrutiSubject' AND KrutiSubjectT.KrutimstKt = ${id}`.execute(trx);
    await sql`DELETE FROM KrutiSubTitleT WHERE krutimstkt = ${id}`.execute(trx);
    await sql`DELETE FROM KrutiSubjectT WHERE KrutimstKt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM krutiMst WHERE krutimstkm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  /** Save(): what the work report must not count as a change (dtTmpSel's adjustments). */
  workReportAdjust(oldRow, newRow) {
    // FillData's own changes to dtSel.
    put(oldRow, 'locked', text(get(oldRow, 'locked')).toLowerCase() === 'true');
    for (const c of ['pending', 'prapat', 'published', 'IsDummy', 'IsDownLevel', 'IsNSMP'])
      if (text(get(oldRow, c)).toLowerCase() !== 'true') put(oldRow, c, false);
    for (const row of [oldRow, newRow]) {
      for (const c of ['KrutiNoteTran', 'krutireflibnoTran', 'KrutiSubTitleTran'])
        if (text(get(row, c)) === '') put(row, c, '');
      const samvat = signBetween(
        text(get(row, 'samvatkindname')).trim(),
        text(get(row, 'samvattypeName')).trim(),
      );
      put(row, 'rachsamvat', signBetween(samvat, text(get(row, 'rachsamvat')).trim()));
      put(
        row,
        'prasastipariman',
        signBetween(
          text(get(row, 'prasastitypeName')).trim(),
          text(get(row, 'prasastipariman')).trim(),
        ),
      );
    }
    for (const c of [
      'samvatkindname',
      'samvattypeName',
      'prasastitypeName',
      'locked',
      'RsamvatVir',
      'extraid2',
      'Samvattype',
      'count',
      'RsamvatVir1',
      'AuthSamvat',
      'remark',
    ])
      put(newRow, c, get(oldRow, c));
    // Columns only the web's record carries (its FillData helpers).
    for (const c of ['GroupDisabled', 'SamvatDisabled', 'KrutiRagTran', 'grpno1', 'groupnm1'])
      put(newRow, c, get(oldRow, c));
  },

  lists: {
    // Txt_KeyDown's up-level F2: by KrutiName (Yes) or by KrutiNo (No).
    'uplvl-by-name': list(
      trustedSql(`SELECT krutiMst.krutimstkm, krutiMst.extranm AS krutiname, ISNULL(krutiMst.Krutino, 0) AS Krutino,
        ${KRUTI_AUTHOR} AS Author, ${KRUTI_BHASHA} AS bhash FROM krutiMst ORDER BY krutiMst.Krutino`),
    ),
    'uplvl-by-no': list(
      trustedSql(`SELECT krutiMst.krutimstkm, CAST(krutiMst.Krutino AS nvarchar(255)) AS Krutino, extranm,
        ${KRUTI_AUTHOR} AS Author, ${KRUTI_BHASHA} AS bhash FROM krutiMst`),
    ),
    krutis: list(sql`SELECT krutimstkm, extranm FROM krutiMst ORDER BY krutiMst.extranm`),
    'kruti-sampraday': list(
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'KrutiSampraday' ORDER BY Name`,
    ),
    'kruti-sampraday-akaradi': list(sql`
      SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'KrutiSampraday'
        AND Name IN (N'अकारादि लीस्ट', N'क आदि लीस्ट') ORDER BY Name`),
    'kruti-cols': list(sql`
      SELECT ColumnMastkm, CAST(ColumnNo AS varchar) AS ColumnNo, Name FROM columnmaster
      WHERE Vibhag LIKE 'KrutiCol' AND ColumnNo <> ''`),
    authors: list(
      sql`SELECT Authorcokm, Authorname, recordno, vksamvat, Identyty, Count FROM Authmast ORDER BY Authorname`,
    ),
    'libnos-used-ref': list(sql`
      SELECT DISTINCT tid, Libno AS FromLibNo FROM krutireflibno Kr INNER JOIN BookT B ON Kr.BookTKt = B.tid
      WHERE ISNULL(Libno, '') <> '' ORDER BY Libno`),
    'libnos-used-note': list(sql`
      SELECT DISTINCT tid, Libno AS FromLibNo FROM KrutiNoteT Kr INNER JOIN BookT B ON Kr.BookTKt = B.tid
      WHERE ISNULL(Libno, '') <> '' ORDER BY Libno`),
    libnos: list(
      sql`SELECT DISTINCT tid, Libno AS ToLibNo FROM BookT B WHERE ISNULL(Libno, '') <> '' ORDER BY Libno`,
    ),
    'libnos-insert': list(
      sql`SELECT Tid, LibNO FROM BookT WHERE ISNULL(LibNo, '') <> '' ORDER BY LibNo`,
    ),
    'title-target': list(
      sql`SELECT krutimstkm, extranm, krutino, adivakya, antvakya, Pariman FROM krutiMst`,
    ),
    'report-nos': list(
      sql`SELECT DISTINCT pno AS Id, pno FROM krutiMst WHERE ISNULL(pno, 0) > 0 ORDER BY pno`,
    ),
    heads: list(
      sql`SELECT c.ColumnMastkm, c.Name, c.Brief FROM columnmaster AS c WHERE c.Vibhag LIKE N'Head' ORDER BY c.Name`,
    ),
    'group-heads': list(sql`SELECT groupno, groupname FROM KrutiGroupT WHERE head = 1`),
    bhasha: list(sql`SELECT Bhashacokm, Bhashaname FROM Bhasmast ORDER BY Bhashaname`),
    swaroop: list(sql`
      SELECT c1.ColumnMastkm, c1.Name, c1.Brief, c1.ColumnNo, c1.Remark, ISNULL(c.name, '') AS Uplevel
      FROM columnmaster AS c1 LEFT OUTER JOIN columnmaster AS c ON c1.UplevelId = c.ColumnMastkm
      WHERE c1.Vibhag = N'Swroop' ORDER BY c1.Name`),
    vibhag: list(
      sql`SELECT ColumnMastkm, Name, ShortNm, Brief FROM columnmaster WHERE Vibhag = N'Head' ORDER BY Name`,
    ),
    sampraday: list(
      sql`SELECT columnmastkm, Name FROM columnMaster WHERE Vibhag = 'KrutiSampraday' ORDER BY Name`,
    ),
    'pariman-types': list(sql`
      SELECT kp.parimantypkt, c.Name AS pariman FROM columnmaster c INNER JOIN krutiparimnT kp ON kp.parimantypkt = c.ColumnMastkm
      WHERE c.Vibhag = 'ParimnType' GROUP BY kp.parimantypkt, c.name ORDER BY c.Name`),
  },

  actions: krutiActions,
};

export { TRANS as KRUTI_TRANS };
export type { PickList };
