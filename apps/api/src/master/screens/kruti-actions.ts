import type { ActionResult, GridValue } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { type Executor, idList, inTransaction } from '../../db/legacy-sql.js';
import {
  krutiAgamSuchiReport,
  krutiAkaradiParishishtReport,
  krutiAkaradiReport,
  krutiPrakashakReport,
  krutiReport,
} from '../../reports/kruti.js';
import { prepareWorkReport, writeWorkReport } from '../work-report-log.js';
import { ids, int, nextKey, scalar, table, text } from './book-common.js';
import { trustedSql } from '../../db/trusted-sql.js';
import type { ActionContext, ScreenDefinition } from './registry.js';

/**
 * Kruti Master's right-click menu (cntMenu), handler by handler. Items that need the desktop's
 * Excel templates or Crystal Reports are answered on the client (see the doc).
 */

type Actions = NonNullable<ScreenDefinition['actions']>;

const toIds = (list: readonly number[]) => idList(list.length ? list : [0]);
const param = (ctx: ActionContext, name: string) => ctx.params[name];
const numberParam = (ctx: ActionContext, name: string) => int(param(ctx, name));
const textParam = (ctx: ActionContext, name: string) => text(param(ctx, name));
const boolParam = (ctx: ActionContext, name: string) => param(ctx, name) === true;
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

async function excel(
  db: Executor,
  title: string,
  query: RawBuilder<unknown>,
): Promise<ActionResult> {
  return { kind: 'table', title, ...(await table(db, query)) };
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

const affected = (r: { numAffectedRows?: bigint }) => Number(r.numAffectedRows ?? 0);

/** ComanFunction.StringContinuanceSequential: "1,2,4-6" → "1,2,4,5,6". */
export function expandNumbers(input: string): number[] {
  const out: number[] = [];
  for (const part of input.split(',')) {
    const p = part.trim();
    if (p === '') continue;
    const range = p.split('-');
    if (range.length === 2) {
      const from = Math.trunc(Number(range[0]));
      const to = Math.trunc(Number(range[1]));
      if (Number.isFinite(from) && Number.isFinite(to))
        for (let i = from; i <= to; i++) out.push(i);
    } else if (Number.isFinite(Number(p))) out.push(Math.trunc(Number(p)));
  }
  return out;
}

/** The Lock By Admin / LockUnlockTransaction loop: each change is logged as "Lock". */
async function setLockColumn(
  db: Executor,
  userId: number,
  selected: readonly number[],
  column: 'Locked' | 'LockedByAdmin',
  lock: boolean,
): Promise<number> {
  let count = 0;
  const col = trustedSql(column);
  for (const id of selected) {
    const old = text(
      await scalar(
        db,
        sql`SELECT CASE WHEN ISNULL(${col}, 0) = 1 THEN 'True' ELSE 'False' END FROM KrutiMst WHERE krutimstkm = ${id}`,
      ),
    );
    const now = lock ? 'True' : 'False';
    if (old === now) continue;
    await sql`UPDATE KrutiMst SET ${col} = ${lock ? 1 : 0}, moduser = ${userId}, moddate = GETDATE() WHERE krutimstkm = ${id}`.execute(
      db,
    );
    const prepared = await prepareWorkReport(
      db,
      'krutiMst',
      'krutimstkm',
      id,
      userId,
      { [column]: old },
      { [column]: now },
      'Lock',
    );
    if (prepared?.kind === 'write') {
      await writeWorkReport(
        db,
        'krutiMst',
        'krutimstkm',
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
  return count;
}

const lockMessage = (count: number, lock: boolean) =>
  count === 0 ? '' : `(${count} ) Records ${lock ? 'Locked' : 'UnLocked'} Successfully`;

/** The texts krutiMst keeps of its Bhasha / Swaroop / Vibhag rows (ChangeInSelectedRecord). */
async function refreshTexts(db: Executor, id: number, kind: string) {
  if (kind === 'Bhasha') {
    await sql`UPDATE KrutiMst SET Bhasha = (SELECT ISNULL(STUFF((SELECT ',' + ISNULL(bhasmast.bhasa_attr, '') FROM krutibhast
      INNER JOIN bhasmast ON krutibhast.bhashakt = bhashacokm WHERE krutimstkt = ${id} ORDER BY seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), ''))
      WHERE KrutimstKM = ${id}`.execute(db);
  } else if (kind === 'Swaroop') {
    await sql`UPDATE KrutiMst SET Swaroop = (SELECT ISNULL(STUFF((SELECT ',' + ISNULL(columnmaster.shortnm, columnmaster.Name) FROM krutiSwaropT
      INNER JOIN columnmaster ON krutiSwaropT.swroopkt = columnmaster.ColumnMastkm WHERE krutiSwaropT.krutimstkt = ${id} ORDER BY seq
      FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')) WHERE KrutimstKM = ${id}`.execute(
      db,
    );
  } else if (kind === 'Vibhag') {
    await sql`UPDATE KrutiMst SET Vibhag = (SELECT ISNULL(STUFF((SELECT ',' + columnmaster.Name FROM KrutiVibhagT
      INNER JOIN columnmaster ON KrutiVibhagT.VibhagKt = columnmaster.ColumnMastkm WHERE KrutiVibhagT.krutimstkt = ${id} ORDER BY seq
      FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), '')) WHERE KrutimstKM = ${id}`.execute(
      db,
    );
  }
}

/** DisplayTree: node text "extranm-Author-Swaroop-Bhasha-(KrutiNo)VK-मुद्रित". */
const TREE_COLUMNS = sql`K.krutimstkm, ISNULL(K.extranm, '') AS extranm, K.KrutiNo, ISNULL(K.Author, '') AS Author,
  ISNULL(K.Swaroop, '') AS Swaroop, ISNULL(K.Bhasha, '') AS Bhasha, ISNULL(K.Rsamvatvir, 0) AS Rsamvatvir,
  CASE WHEN (SELECT COUNT(krutiReflibnokm) FROM krutireflibno WHERE krutimstkt = K.krutimstkm AND ktypeid = 3012) > 0 THEN N'मुद्रित' ELSE '' END AS KType`;

type TreeRow = {
  krutimstkm: number;
  extranm: string;
  KrutiNo: number | null;
  Author: string;
  Swaroop: string;
  Bhasha: string;
  Rsamvatvir: number;
  KType: string;
};

/** MdlLib.PrintStr: "" for "" or "0", else the text with a "-" before (left) or after (right). */
const printStr = (s: unknown, right = false, left = false) => {
  const t = text(s);
  return t === '0' || t === '' ? '' : `${left ? '-' : ''}${t.trim()}${right ? '-' : ''}`;
};
const nodeText = (r: TreeRow) =>
  `${r.extranm}${printStr(r.Author, false, true)}${printStr(r.Swaroop, false, true)}${printStr(r.Bhasha, false, true)}-(${text(
    r.KrutiNo,
  )})${printStr(r.Rsamvatvir)}${printStr(r.KType, false, true)}`;

/** UpdateKrutiAuthor: krutiMst.Author (Author1) / SAuthor (Author2) rebuilt from their tables. */
export async function updateKrutiAuthor(
  db: Executor,
  kind: 'Author1' | 'Author2',
  ids?: readonly number[],
) {
  const col = kind === 'Author1' ? trustedSql('Author') : trustedSql('SAuthor');
  const table = kind === 'Author1' ? trustedSql('krutiautht') : trustedSql('krutiSautht');
  if (!ids) await sql`UPDATE krutimst SET ${col} = ''`.execute(db);
  await sql`
    UPDATE kMain SET ${col} = (SELECT ISNULL(STUFF((SELECT ',' + LTRIM(RTRIM(ISNULL(at.authtyattr, '')
        + CASE WHEN ISNULL(at.authtyattr, '') <> '' THEN '-' ELSE '' END
        + CASE WHEN ISNULL(AuthMAnyNmT.AnyaName, '') = '' THEN am.authorname ELSE AuthMAnyNmT.AnyaName END
        + CASE WHEN ISNULL(am.Identyty, '') = '' THEN '' ELSE '[' + am.Identyty + ']' END
        + CASE WHEN ISNULL(VisAvastha.VisheshNo, 0) BETWEEN 1 AND 5 AND ISNULL(VisAvastha.Vishesh, '') <> '' THEN '(' + VisAvastha.Vishesh + ')' ELSE '' END))
      FROM krutiMst k LEFT JOIN ${table} kt ON k.krutimstkm = kt.krutimstkt
      LEFT JOIN authtype at ON kt.authtycokt = at.authtycokm
      LEFT JOIN authmast am ON kt.authorcokt = am.authorcokm
      LEFT JOIN AuthMAnyNmT ON AuthMAnyNmT.AuthAnyaNmKm = kt.AuthAnyaNmKt AND AuthMAnyNmT.AuthmastKt = am.authorcokm
      LEFT JOIN VisheshMast VisAvastha ON kt.avasthaid = VisAvastha.Tid AND VisAvastha.remark = 'Avastha'
      WHERE kMain.krutimstkm = k.krutimstkm FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), ''))
    FROM KrutiMst kMain ${ids ? sql`WHERE kMain.KrutiMstkm IN ${toIds(ids)}` : sql``}
  `.execute(db);
}

/** UpdateKrutiSwaroopNo: all it writes is this global reset of samvat-less VK samvats. */
export async function resetSamvatlessVk(db: Executor): Promise<number> {
  const r = await sql`
    UPDATE krutiMst SET Rsamvatvir = 0 WHERE Rsamvatvir > 0 AND ISNULL(samvattype, 0) = 0 AND ISNULL(rachsamvat, '') = ''
  `.execute(db);
  return Number(r.numAffectedRows ?? 0);
}

export const krutiActions: Actions = {
  // ------------------------------------------------------------ Show For Selected Kruti ----
  async 'book-master'(db, _user, selected) {
    // GetBookMastkmForSameGroupNo over the books the krutis refer to.
    const books = sql`SELECT b.BookMastkt FROM krutireflibno kr INNER JOIN BookT b ON kr.BookTKt = b.Tid WHERE krutimstkt IN ${toIds(selected)}`;
    return openWhere(
      db,
      'book-master',
      sql`SELECT BookMastkm AS id FROM BookM WHERE (ISNULL(CommonGrpNo, 0) = 0 AND BookMastkm IN (${books}))
        OR (ISNULL(CommonGrpNo, 0) > 0 AND CommonGrpNo IN (SELECT CommonGrpNo FROM BookM WHERE BookMastkm IN (${books})))`,
      '',
    );
  },
  async 'author-card'(db, _user, selected, ctx) {
    if (boolParam(ctx, 'krutiOnly')) {
      return openWhere(
        db,
        'author-master',
        sql`SELECT DISTINCT authorcokt AS id FROM krutiautht WHERE krutimstkt IN ${toIds(selected)}`,
        'No Author Available for Current Selection',
      );
    }
    const prak = sql`SELECT DISTINCT prakshnnokt FROM praksnparimnT WHERE krutinokt IN ${toIds(selected)}`;
    return openWhere(
      db,
      'author-master',
      sql`SELECT DISTINCT PraksnVishAutT.authorkt AS id FROM praksnVisheshT LEFT OUTER JOIN PraksnVishAutT
          ON praksnVisheshT.prksnvisheshkm = PraksnVishAutT.prksnvisheshkt WHERE PraksnVishAutT.prakashannokt IN (${prak})
        UNION SELECT DISTINCT authorkt FROM praksnAuthorAuthT WHERE prakashannokt IN (${prak})
        UNION SELECT DISTINCT authorcokt FROM krutiautht WHERE krutimstkt IN (SELECT krutimstkm FROM krutiMst
          WHERE KrutiNo IN (SELECT krutinokt FROM praksnparimnT WHERE prakshnnokt IN (${prak})))`,
      'No Author Available for Current Selection',
    );
  },
  async 'swarop-master'(db, _user, selected) {
    return openWhere(
      db,
      'column-master',
      sql`SELECT DISTINCT swroopkt AS id FROM krutiSwaropT WHERE krutimstkt IN ${toIds(selected)}`,
      '',
    );
  },
  // Vibhag: the heads of every kruti the grid shows.
  async 'vibhag-master'(db, _user, _selected, ctx) {
    return openWhere(
      db,
      'column-master',
      sql`SELECT DISTINCT KrutiHeadkt AS id FROM krutiMst WHERE krutimstkm IN ${toIds(idsParam(ctx, 'gridIds'))} AND KrutiHeadkt IS NOT NULL`,
      '',
    );
  },
  async 'party-master'(db, _user, selected) {
    return openWhere(
      db,
      'party-master',
      sql`SELECT DISTINCT bhandarkt AS id FROM krutireflibno WHERE krutimstkt IN ${toIds(selected)}`,
      'No Record Found',
    );
  },
  async 'check-nsmp'(db, _user, selected, ctx) {
    await sql`UPDATE KrutiMst SET IsNSMP = ${boolParam(ctx, 'nsmp') ? 1 : 0} WHERE krutimstkm IN ${toIds(selected)}`.execute(
      db,
    );
    return { kind: 'refreshed', rows: [] };
  },
  async 'lock-by-admin'(db, user, selected, ctx) {
    ctx.assertPassword(ctx.params.password, ctx.env.KRUTI_LOCK_PASSWORD ?? '');
    const lock = boolParam(ctx, 'lock');
    const count = await setLockColumn(db, user.id, selected, 'LockedByAdmin', lock);
    return { kind: 'refreshed', rows: [], message: lockMessage(count, lock) };
  },
  // Ctrl+L / Ctrl+U: LockUnlockTransaction, with the Security password.
  async 'lock-records'(db, user, selected, ctx) {
    ctx.assertPassword(ctx.params.password);
    const lock = boolParam(ctx, 'lock');
    const count = await setLockColumn(db, user.id, selected, 'Locked', lock);
    return { kind: 'refreshed', rows: [], message: lockMessage(count, lock) };
  },

  // txtKrutiNo_Leave: IsDuplicateKrutiNo.
  async 'krutino-exists'(db, _user, _selected, ctx) {
    const n = int(
      await scalar(
        db,
        sql`SELECT COUNT(*) FROM krutiMst WHERE krutimstkm <> ${numberParam(ctx, 'current')} AND KrutiNo = ${numberParam(ctx, 'krutiNo')}`,
      ),
    );
    return { kind: 'message', message: String(n) };
  },

  // ------------------------------------------------------------ For Current Record ----
  async 'copy-subject'(db, _user, _selected, ctx) {
    await runProc(() =>
      sql`EXEC CopyKrutiSubject @KrutimstKm = ${numberParam(ctx, 'current')}, @StrKrutimstKm = ${textParam(ctx, 'to')}`.execute(
        db,
      ),
    );
    return { kind: 'message', message: 'Subject Copied Successfully' };
  },

  // ------------------------------------------------------------ Print Report ----
  async 'missing-nos'(db, _user, _selected, ctx) {
    return {
      kind: 'table',
      title: 'Missing Rec. Nos',
      ...(await runProc(() =>
        table(db, sql`EXEC Print_MissingNo 'Kruti', ${idsParam(ctx, 'gridIds').join(',')}`),
      )),
    };
  },
  async 'duplicate-nos'(db, _user, _selected, ctx) {
    return excel(
      db,
      'Duplicate Rec. Nos',
      sql`SELECT KrutiNo FROM krutiMst WHERE krutimstkm IN ${toIds(idsParam(ctx, 'gridIds'))}
        GROUP BY KrutiNo HAVING COUNT(KrutiNo) > 1 ORDER BY KrutiNo`,
    );
  },
  async 'note-report-new'(db, _user, selected) {
    return excel(
      db,
      'Note Report New',
      sql`SELECT K.KrutiNo, colK.ColumnNo, ISNULL(colK.Name, N'') AS ColumnName, KN.wordnm AS Detail, BT.Libno AS BookNo,
          colRefPlace.Name AS Sthan, KN.pgno AS Page
        FROM krutiMst K INNER JOIN KrutiNoteT KN ON K.krutimstkm = KN.krutimstkt
        INNER JOIN columnmaster colK ON KN.KrutiColKt = colK.ColumnMastkm
        LEFT JOIN BookT BT ON KN.BookTkt = BT.tid
        LEFT JOIN columnmaster colRefPlace ON KN.RefplaceKt = colRefPlace.ColumnMastkm
        WHERE K.krutimstkm IN ${toIds(selected)} ORDER BY K.KrutiNo, colK.ColumnNo, KN.seq`,
    );
  },
  /**
   * NoteReportToolStripMenuItem: the grid krutis' notes in the given column numbers, as
   * distinct (column, word) — Yes — or (column, word, report nos with their counts) — No.
   */
  async 'note-report'(db, _user, _selected, ctx) {
    const columns = expandNumbers(textParam(ctx, 'columns'));
    if (columns.length === 0) return { kind: 'message', message: '' };
    const { rows } = await sql<{
      KrutiColKt: number | null;
      wordnm: string | null;
      PNo: string | null;
      ColumnNo: string;
    }>`
      SELECT KrutiNoteT.KrutiColKt, KrutiNoteT.wordnm, CAST(krutiMst.PNo AS varchar) AS PNo, ISNULL(c.ColumnNo, N'') AS ColumnNo
      FROM KrutiNoteT INNER JOIN krutiMst ON krutiMst.krutimstkm = KrutiNoteT.krutimstkt
      LEFT OUTER JOIN columnmaster c ON KrutiNoteT.KrutiColKt = c.ColumnMastkm
      WHERE KrutiNoteT.krutimstkt IN ${toIds(idsParam(ctx, 'gridIds'))}
      ORDER BY KrutiNoteT.KrutiColKt, KrutiNoteT.serieskt
    `.execute(db);
    const matched = columns.flatMap((n) => rows.filter((r) => Number(r.ColumnNo) === n));
    const byKey = (a: { KrutiColKt: number | null; wordnm: string | null }, b: typeof a) =>
      (a.KrutiColKt ?? -1) - (b.KrutiColKt ?? -1) || text(a.wordnm).localeCompare(text(b.wordnm));
    if (textParam(ctx, 'mode') === 'yes') {
      const seen = new Set<string>();
      const out: GridValue[][] = [];
      // The desktop's blank separator rows collapse into one blank row at the top.
      if (matched.length > 1) out.push([null, '']);
      for (const r of [...matched].sort(byKey)) {
        const key = `${r.KrutiColKt}|${text(r.wordnm)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([r.KrutiColKt, text(r.wordnm).trim() === '' ? '' : `[${text(r.wordnm)}] `]);
      }
      return { kind: 'table', title: 'Note Report', columns: ['Kruticolkt', 'wordnm'], rows: out };
    }
    if (textParam(ctx, 'mode') === 'no') {
      const seen = new Set<string>();
      const distinct = [...matched]
        .sort((a, b) => byKey(a, b) || text(a.PNo).localeCompare(text(b.PNo)))
        .filter((r) => {
          const key = `${r.KrutiColKt}|${text(r.wordnm)}|${text(r.PNo)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      const out: GridValue[][] = [];
      let col = '';
      let word = '';
      let c = 0;
      for (const r of distinct) {
        if (r.KrutiColKt === null) continue;
        const pno = text(r.PNo);
        if (out.length === 0 || (col === String(r.KrutiColKt) && word !== text(r.wordnm))) {
          c = pno === '' ? 0 : 1;
          out.push([r.KrutiColKt, text(r.wordnm), pno === '' ? '' : `${pno}{1}`]);
        } else if (col === String(r.KrutiColKt) && word.trim() === text(r.wordnm).trim()) {
          const last = out[out.length - 1]!;
          const current = text(last[2]);
          last[2] =
            c > 0
              ? `${current.slice(0, current.indexOf('{'))},${pno}{${c + 1}}`
              : `${current}${pno}{${c + 1}}`;
          c++;
        }
        col = String(r.KrutiColKt);
        word = text(r.wordnm);
      }
      return {
        kind: 'table',
        title: 'Note Report',
        columns: ['Kruticolkt', 'wordnm', 'pno'],
        rows: out,
      };
    }
    // Cancel ("Short") reads columns the table does not have; the desktop fails the same way.
    return { kind: 'message', message: "Column 'ColumnNo' does not belong to table ." };
  },
  // frmWebBrowser: the report site's pages, built here (reports/kruti.ts).
  async 'kruti-report'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await krutiReport({ db, env: ctx.env }, idsParam(ctx, 'pnos')),
    };
  },
  async 'akaradi-report'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await krutiAkaradiParishishtReport(
        { db, env: ctx.env },
        textParam(ctx, 'type'),
        numberParam(ctx, 'sampraday'),
      ),
    };
  },
  async 'main-report'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await krutiAkaradiReport(
        { db, env: ctx.env },
        numberParam(ctx, 'sampraday'),
        idsParam(ctx, 'ids'),
        boolParam(ctx, 'printAdiAnt'),
      ),
    };
  },
  // PrintAgamSuchiReport: `pattern` 1 starts the detail with Purnata, 2 adds the Kruti No.
  async 'agam-suchi'(db, _user, _selected, ctx) {
    const pattern = numberParam(ctx, 'pattern');
    return {
      kind: 'report',
      document: await krutiAgamSuchiReport(
        { db, env: ctx.env },
        {
          sampraday: numberParam(ctx, 'sampraday'),
          krutis: idsParam(ctx, 'ids'),
          printAdiAnt: boolParam(ctx, 'printAdiAnt'),
          startWithPurnata: pattern === 1,
          krutiNoFirst: pattern === 2,
        },
      ),
    };
  },
  async 'agam-suchi-index'(db, _user, _selected, ctx) {
    return inTransaction(db, async (trx) => {
      await sql`EXEC SetTranIds 1, ${textParam(ctx, 'ids')}`.execute(trx);
      const result = await runProc(() =>
        table(
          trx,
          sql`SELECT * FROM dbo.KrutiAkaradiAgamSuchiReportIndex(${numberParam(ctx, 'sampraday')})`,
        ),
      );
      await sql`EXEC SetTranIds 0`.execute(trx);
      return { kind: 'table', title: 'Main Report As Agam Suchi Index', ...result } as ActionResult;
    });
  },
  async 'main-report-ref'(db, _user, _selected, ctx) {
    return {
      kind: 'table',
      title: 'Main Report With Reference',
      ...(await runProc(() =>
        table(
          db,
          sql`EXEC PrintKrutiAkaradiReport ${numberParam(ctx, 'sampraday')}, ${textParam(ctx, 'ids')}, ${
            boolParam(ctx, 'printAdiAnt') ? 1 : 0
          }`,
        ),
      )),
    };
  },
  async 'kruti-prakashak-report'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await krutiPrakashakReport(
        { db, env: ctx.env },
        numberParam(ctx, 'sampraday'),
        boolParam(ctx, 'printAll'),
      ),
    };
  },
  async 'krutis-of-sampraday'(db, _user, _selected, ctx) {
    return excel(
      db,
      'Kruti',
      sql`SELECT DISTINCT krutiMst.krutimstkm, krutiMst.extranm FROM KrutiSampradayT INNER JOIN krutiMst
        ON KrutiSampradayT.KrutimstKt = krutiMst.krutimstkm WHERE SampradayKt = ${numberParam(ctx, 'sampraday')} ORDER BY krutiMst.extranm`,
    );
  },
  async 'akaradi-sampraday'(db) {
    return {
      kind: 'message',
      message: text(
        await scalar(
          db,
          sql`SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'KrutiSampraday' AND Name = N'अकारादि लीस्ट'`,
        ),
      ),
    };
  },

  // ------------------------------------------------------------ Utility ----
  async 'authors-of'(db, _user, selected) {
    return excel(
      db,
      'Author',
      sql`SELECT krutiauthT.authorcokt, authmast.authorname AS Author FROM authmast INNER JOIN krutiauthT ON authmast.authorcokm = krutiauthT.authorcokt
        WHERE krutiauthT.krutimstkt IN ${toIds(selected)} GROUP BY krutiauthT.authorcokt, authmast.authorname ORDER BY authmast.authorname`,
    );
  },
  async 'replace-author'(db, _user, selected, ctx) {
    await sql`UPDATE krutiauthT SET authorcokt = ${numberParam(ctx, 'to')} WHERE authorcokt = ${numberParam(ctx, 'from')}
      AND krutimstkt IN ${toIds(selected)}`.execute(db);
    return { kind: 'refreshed', rows: [] };
  },
  async 'notes-of-col'(db, _user, _selected, ctx) {
    return excel(
      db,
      'KrutiNoteT',
      sql`SELECT KrutiNoteKm, wordnm FROM KrutiNoteT WHERE KrutiColKt = ${numberParam(ctx, 'col')}`,
    );
  },
  async 'replace-note-col'(db, _user, _selected, ctx) {
    const n = affected(
      await sql`UPDATE KrutiNoteT SET KrutiColKt = ${numberParam(ctx, 'to')} WHERE KrutiColKt = ${numberParam(ctx, 'from')}
        AND KrutiNoteKm IN ${toIds(idsParam(ctx, 'notes'))}`.execute(db),
    );
    return { kind: 'message', message: `Colno Sucessfully Replaced in ${n} Records  ` };
  },
  async 'replace-note-word'(db, _user, _selected, ctx) {
    const n = affected(
      await sql`UPDATE KrutiNoteT SET wordnm = ${textParam(ctx, 'word')} WHERE KrutiColKt = ${numberParam(ctx, 'from')}
        AND KrutiNoteKm IN ${toIds(idsParam(ctx, 'notes'))}`.execute(db),
    );
    return { kind: 'message', message: `wordnm Sucessfully Replaced in ${n} Records ` };
  },
  async 'pariman-types-of'(db, _user, selected) {
    return excel(
      db,
      'Pariman',
      sql`SELECT kp.parimantypkt, c.Name AS pariman FROM columnmaster c INNER JOIN krutiparimnT kp ON kp.parimantypkt = c.ColumnMastkm
        WHERE kp.krutimstkt IN ${toIds(selected)} GROUP BY kp.parimantypkt, c.name ORDER BY c.Name`,
    );
  },
  async 'replace-pariman-type'(db, _user, selected, ctx) {
    ctx.assertPassword(ctx.params.password);
    await sql`UPDATE krutiparimnT SET parimantypkt = ${numberParam(ctx, 'to')} WHERE parimantypkt = ${numberParam(ctx, 'from')}
      AND krutimstkt IN ${toIds(selected)}`.execute(db);
    for (const id of selected) {
      await sql`UPDATE KrutiMst SET Pariman = (SELECT ISNULL(STUFF((SELECT ',' + ISNULL(c1.name, '') + ISNULL(c2.shortnm, c2.Name) + ' '
          + ISNULL(kp.pariman, '') + ISNULL(c3.name, '') FROM krutiparimnT kp LEFT OUTER JOIN columnmaster c1 ON kp.Sign1Kt = c1.ColumnMastkm
          LEFT OUTER JOIN columnmaster c2 ON c2.ColumnMastkm = kp.parimantypkt LEFT OUTER JOIN columnmaster c3 ON c3.ColumnMastkm = kp.Sign2kt
          WHERE kp.krutimstkt = ${id} ORDER BY seq FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 1, ''), ''))
        WHERE KrutimstKM = ${id}`.execute(db);
    }
    return { kind: 'refreshed', rows: [] };
  },
  /**
   * DisplayTree: the selected krutis (Down Level) or their up levels (Up Level), then the krutis
   * below each, three levels deep (four for Down Level). A flat table: id, parent index, text.
   */
  async tree(db, _user, selected, ctx) {
    const up = boolParam(ctx, 'up');
    const rootIds = up
      ? await ids(
          db,
          sql`SELECT uplevelKrutimstkt AS id FROM krutiRelT WHERE krutimstkt IN ${toIds(selected)}`,
        )
      : [...selected];
    const out: GridValue[][] = [];
    const below = async (parentId: number) =>
      (
        await sql<TreeRow>`SELECT ${TREE_COLUMNS} FROM krutiMst K INNER JOIN krutiRelT KR ON K.krutimstkm = KR.krutimstkt
          WHERE KR.uplevelKrutimstkt = ${parentId}`.execute(db)
      ).rows;
    const add = async (parent: number, depth: number, rows: TreeRow[]) => {
      for (const r of rows) {
        out.push([r.krutimstkm, parent, nodeText(r)]);
        const index = out.length - 1;
        if (depth < (up ? 2 : 3)) await add(index, depth + 1, await below(r.krutimstkm));
      }
    };
    for (const id of rootIds) {
      const { rows } =
        await sql<TreeRow>`SELECT ${TREE_COLUMNS} FROM krutiMst K WHERE K.krutimstkm = ${id}`.execute(
          db,
        );
      await add(-1, 0, rows);
    }
    return { kind: 'table', title: 'tree', columns: ['id', 'parent', 'text'], rows: out };
  },
  async 'insert-ji'(db) {
    await runProc(() => sql`EXEC Insert_JiInAuthor`.execute(db));
    return {
      kind: 'message',
      message: 'जी Inserted Successfully in AnyaName Column of Kruti-Prakashan',
    };
  },
  async 'send-to-author'(db, _user, selected) {
    return openWhere(
      db,
      'author-master',
      sql`SELECT authorcokt AS id FROM krutiautht WHERE krutimstkt IN ${toIds(selected)}`,
      'No Author Available for Current Selection',
    );
  },
  // Send Selected Record To Title: the selected krutis become Title rows of the picked one.
  async 'send-to-title'(db, _user, selected, ctx) {
    const target = numberParam(ctx, 'target');
    if (target <= 0) return { kind: 'message', message: 'No Records Selected' };
    await inTransaction(db, async (trx) => {
      const { rows } = await sql<Record<string, string | null>>`
        SELECT krutimstkm, extranm, adivakya, antvakya, Pariman, parimanpattern, desi, remark,
          STUFF((SELECT ',' + refpgno FROM krutireflibno WHERE ISNULL(refpgno, '') <> '' AND ktypeid = 3012 AND krutimstkt = krutimstkm
            FOR XML PATH('')), 1, 1, '') AS PgNo
        FROM krutiMst WHERE krutimstkm IN ${toIds(selected)}`.execute(trx);
      let key = await nextKey(trx, 'KrutiSubTitleT', 'krutiSubTitleKm');
      let seq = 1;
      for (const r of rows) {
        await sql`
          INSERT INTO KrutiSubTitleT (krutiSubTitleKm, krutimstkt, SubTitleNo, Refplace, SubTitleNm, pariman, parimanpattern, adivakya,
            antvakya, desi, refpgno, remark, seq)
          VALUES (${key++}, ${target}, NULL, NULL, ${text(r.extranm)}, ${text(r.Pariman)}, ${text(r.parimanpattern)},
            ${text(r.adivakya)}, ${text(r.antvakya)}, ${text(r.desi)}, ${text(r.PgNo)}, ${text(r.remark)}, ${seq++})`.execute(
          trx,
        );
      }
    });
    return {
      kind: 'refreshed',
      rows: [],
      message: `Sub Title Records From Krutin Id ${target} Inserted Successfully`,
    };
  },
  async 'transform-parichay'(db, _user, selected) {
    for (const id of selected) await runProc(() => sql`EXEC updatekrutiparich ${id}`.execute(db));
    return {
      kind: 'refreshed',
      rows: [],
      message: `Transform Krutiname To Parichaykname Rec No ${selected.join(',')}`,
    };
  },
  /**
   * Transform record No in Another Sires: the KrutiNos from the first to the last selected get
   * consecutive numbers from `start`; the old ones go to oldkrutiNo.
   */
  async 'transform-recno'(db, _user, _selected, ctx) {
    const i = numberParam(ctx, 'first');
    const i1 = numberParam(ctx, 'last');
    const start = numberParam(ctx, 'start');
    const span = Math.abs(i - i1);
    const end = start + span;
    const taken = int(
      await scalar(
        db,
        sql`SELECT COUNT(*) FROM krutiMst WHERE krutino >= ${start} AND krutino <= ${end}`,
      ),
    );
    if (taken > 0)
      return {
        kind: 'message',
        message: 'Record Already Exist in This Series-Unable to Transfer Recno',
      };
    const { rows } = await sql<{ krutimstkm: number }>`
      SELECT krutimstkm FROM krutiMst WHERE krutino >= ${Math.min(i, i1)} AND krutino <= ${Math.max(i, i1)}`.execute(
      db,
    );
    let next = start;
    for (const r of rows) {
      await sql`UPDATE krutiMst SET krutino = ${next}, oldkrutiNo = ISNULL(oldkrutiNo, '') + ',' + CAST(krutino AS nvarchar(50))
        WHERE krutimstkm = ${r.krutimstkm}`.execute(db);
      if (next === end) break;
      next++;
    }
    return { kind: 'refreshed', rows: [] };
  },
  async 'authors-of-selection'(db, _user, selected) {
    return excel(
      db,
      'Author',
      sql`SELECT authorcokm, authorname FROM authmast WHERE authorcokm IN (SELECT authorcokt FROM krutiautht WHERE krutimstkt IN ${toIds(selected)})`,
    );
  },
  /**
   * Add RefLibNo in selection Master: a SelectionM row per referenced book for the picked
   * author, unless it has one. Inserted with column names — the desktop's positional insert no
   * longer fits the table and always failed (see the doc).
   */
  async 'add-ref-selection'(db, user, selected, ctx) {
    const author = numberParam(ctx, 'author');
    if (author <= 0) return { kind: 'message', message: '' };
    const { rows } = await sql<{ BookTKt: number; refpgno: string | null }>`
      SELECT remark, BookTKt, refpgno, krutimstkt FROM krutiRefLibno WHERE krutimstkt IN ${toIds(selected)} AND ISNULL(BookTKt, 0) > 0
      GROUP BY remark, BookTKt, refpgno, krutimstkt`.execute(db);
    for (const r of rows) {
      const n = int(
        await scalar(
          db,
          sql`SELECT COUNT(*) FROM SelectionM WHERE libnokt = ${r.BookTKt} AND Authorkt = ${author}`,
        ),
      );
      if (n > 0) continue;
      await sql`
        INSERT INTO SelectionM (libnokt, Authorkt, prakashakkt, vibhagkt, refpgno, markingkt, VibhagRem, SelectionRem, SelectionDt,
          Selectedbykt, Remark, ReceiveRem)
        VALUES (${r.BookTKt}, ${author}, 0, 0, ${text(r.refpgno)}, 0, ' ', ' ', CONVERT(date, GETDATE()), ${user.id}, ' ', ' ')`.execute(
        db,
      );
    }
    return { kind: 'message', message: '' };
  },
  async 'delete-with-tran'(db, _user, selected) {
    for (const id of selected) await runProc(() => sql`EXEC deleteselactedkruti ${id}`.execute(db));
    const left = int(
      await scalar(db, sql`SELECT COUNT(*) FROM krutiMst WHERE krutimstkm IN ${toIds(selected)}`),
    );
    return {
      kind: 'list',
      rows: [],
      message: `There is ${left} Records Not Deleted And ${selected.length - left} Records Deleted `,
    };
  },
  // Insert Ref Library No (Ctrl+9): a krutiRefLibno row of type 3518 for the current kruti.
  async 'insert-ref-libno'(db, _user, _selected, ctx) {
    const current = numberParam(ctx, 'current');
    await inTransaction(db, async (trx) => {
      const key = await nextKey(trx, 'krutiRefLibno', 'krutiReflibnokm');
      await sql`
        INSERT INTO krutiRefLibno (krutiReflibnokm, krutimstkt, bhandarkt, remark, reflibno, refplacekt, refpgno, signkt, seq, ktypeid,
          lipi, pariman, vishash, libseq, BookTKt, IsCommonGroup, IsPrint)
        VALUES (${key}, ${current}, 0, '', ${textParam(ctx, 'libno')}, 0, ${textParam(ctx, 'pgno')}, 0,
          (SELECT ISNULL(MAX(seq), 0) + 1 FROM krutiRefLibno WHERE krutimstkt = ${current}), 3518, NULL, NULL, NULL, NULL,
          ${numberParam(ctx, 'bookT')}, 0, 0)`.execute(trx);
    });
    return { kind: 'message', message: 'Default Value for Reference Updated Successfully' };
  },
  // Save Seq: the grid's order into GridSeq (Form 'Kruti').
  async 'save-seq'(db, _user, _selected, ctx) {
    const order = idsParam(ctx, 'gridIds');
    await inTransaction(db, async (trx) => {
      await sql`DELETE FROM GridSeq WHERE Form = 'Kruti'`.execute(trx);
      for (let i = 0; i < order.length; i += 1000) {
        const chunk = order.slice(i, i + 1000);
        await sql`INSERT INTO GridSeq (Id, Seq, Form) VALUES ${sql.join(
          chunk.map((id, j) => sql`(${id}, ${i + j + 1}, 'Kruti')`),
        )}`.execute(trx);
      }
    });
    return { kind: 'message', message: '' };
  },
  /**
   * Update RefLibNo From Prakshan With "," And "-": for references whose book number has a
   * list or a range, BookTKt from praksnM by srno. The desktop stops at the first reference with
   * none or several (its UPDATE is then malformed) and shows SQL Server's message; so does this.
   */
  async 'update-reflib-prk'(db, _user, _selected, ctx) {
    const { rows } = await sql<{ krutiReflibnokm: number; BookTKt: number }>`
      SELECT krutiReflibnokm, BookTKt FROM krutiRefLibno INNER JOIN BookT ON krutiRefLibno.BookTKt = BookT.Tid
      WHERE (BookT.LibNo LIKE N'%,%' OR BookT.LibNo LIKE N'%-%') AND krutimstkt IN ${toIds(idsParam(ctx, 'gridIds'))}`.execute(
      db,
    );
    for (const r of rows) {
      const found = await ids(
        db,
        sql`SELECT ISNULL(BookTKt, 0) AS id FROM praksnM WHERE srno IN (${r.BookTKt})`,
      );
      if (found.length === 0)
        return { kind: 'message', message: "Incorrect syntax near the keyword 'where'." };
      if (found.length > 1) return { kind: 'message', message: "Incorrect syntax near ','." };
      await sql`UPDATE krutiRefLibno SET BookTKt = ${found[0]!} WHERE krutiReflibnokm = ${r.krutiReflibnokm}`.execute(
        db,
      );
    }
    return { kind: 'message', message: '' };
  },
  // Update RefLibNo From Prakshan And Note: plain book numbers, and notes whose prakashankt is a number.
  async 'update-reflib-prakashan'(db, _user, _selected, ctx) {
    const grid = toIds(idsParam(ctx, 'gridIds'));
    await sql`
      UPDATE r SET BookTKt = p.BookTKt FROM krutiRefLibno r INNER JOIN BookT ON r.BookTKt = BookT.Tid
      CROSS APPLY (SELECT TOP 1 BookTKt FROM praksnM WHERE srno = r.BookTKt ORDER BY BookTKt DESC) p
      WHERE BookT.LibNo NOT LIKE N'%,%' AND BookT.LibNo NOT LIKE N'%-%' AND BookT.LibNo NOT LIKE N'B%' AND BookT.LibNo NOT LIKE N'%s%'
        AND BookT.LibNo NOT LIKE N'' AND BookT.LibNo NOT LIKE N' ' AND BookT.LibNo NOT LIKE N'X%' AND BookT.LibNo NOT LIKE N'C%'
        AND r.krutimstkt IN ${grid}`.execute(db);
    await sql`
      UPDATE n SET BookTKt = p.BookTKt FROM KrutiNoteT n
      CROSS APPLY (SELECT TOP 1 BookTKt FROM praksnM WHERE CAST(srno AS nvarchar(50)) = n.prakashankt ORDER BY BookTKt DESC) p
      WHERE n.prakashankt LIKE N'[0-9]%' AND n.krutimstkt IN ${grid}`.execute(db);
    return { kind: 'message', message: '' };
  },
  async 'update-group-head-vakya'(db) {
    await sql`
      UPDATE K SET
        K.adivakya = CASE WHEN ISNULL(K.adivakya, '') <> '' THEN K.adivakya ELSE (SELECT TOP (1) ISNULL(K1.adivakya, '') FROM KrutiMst K1
          INNER JOIN KrutiGroupT G1 ON K1.krutimstkm = G1.krutimstkt WHERE G1.GroupNo = G.groupno AND ISNULL(K1.adivakya, '') <> ''
          AND G1.head = 0 ORDER BY G1.seq) + '(C)' END,
        K.antvakya = CASE WHEN ISNULL(K.antvakya, '') <> '' THEN K.antvakya ELSE (SELECT TOP (1) '(C)' + ISNULL(K1.antvakya, '')
          FROM KrutiMst K1 INNER JOIN KrutiGroupT G2 ON K1.krutimstkm = G2.krutimstkt WHERE G2.GroupNo = G.groupno
          AND ISNULL(K1.antvakya, '') <> '' AND G2.head = 0 ORDER BY G2.seq DESC) END
      FROM KrutiMst K INNER JOIN KrutiGroupT G ON K.krutimstkm = G.krutimstkt
      WHERE (ISNULL(K.adivakya, '') = '' OR ISNULL(K.antvakya, '') = '') AND G.head = 1`.execute(
      db,
    );
    return { kind: 'message', message: '' };
  },
  // Update SwaroopNo Column: UpdateKrutiSwaroopNo only resets samvat-less VK samvats.
  async 'update-swaroop-no'(db, _user, _selected, ctx) {
    const n = int(
      await scalar(
        db,
        sql`SELECT COUNT(*) FROM KrutiMst WHERE KrutiNo BETWEEN ${numberParam(ctx, 'from')} AND ${numberParam(ctx, 'to')}`,
      ),
    );
    if (n > 0) await resetSamvatlessVk(db);
    return { kind: 'message', message: '' };
  },
  async 'update-kruti-author'(db, _user, _selected, ctx) {
    await inTransaction(db, (trx) =>
      updateKrutiAuthor(trx, textParam(ctx, 'kind') === 'Author2' ? 'Author2' : 'Author1'),
    );
    return { kind: 'list', rows: await ctx.list() };
  },
  async 'update-vk-samvat'(db, _user, selected, ctx) {
    for (const id of selected)
      await runProc(() => sql`EXEC UpdateVikSamvat 'krutiMst', ${id}`.execute(db));
    return { kind: 'list', rows: await ctx.list() };
  },
  async 'show-vk-zero'(_db, _user, _selected, ctx) {
    return {
      kind: 'list',
      rows: await ctx.list(
        sql`krutiMst.krutimstkm IN (SELECT krutimstkm FROM krutiMst WHERE ISNULL(Rsamvatvir, 0) = 0 AND ISNULL(samvattype, 0) > 0 AND ISNULL(rachsamvat, '') <> '')`,
      ),
    };
  },
  async 'show-samvatless-vk'(_db, _user, _selected, ctx) {
    return {
      kind: 'list',
      rows: await ctx.list(
        sql`krutiMst.krutimstkm IN (SELECT krutimstkm FROM krutiMst WHERE Rsamvatvir > 0 AND ISNULL(samvattype, 0) = 0 AND ISNULL(rachsamvat, '') = '')`,
      ),
    };
  },
  async 'reset-samvatless-vk'(db) {
    const n = await resetSamvatlessVk(db);
    return { kind: 'message', message: `In  ${n}Records vikramtsamvat set to to 0 ` };
  },
  async 'akaradi-seq'(db) {
    await runProc(() => sql`EXEC UpdateKrutiAkaradiSeq`.execute(db));
    return { kind: 'message', message: '' };
  },
  async 'agam-seq'(db) {
    await runProc(() => sql`EXEC UpdateKrutiSeq N'अकारादि लीस्ट'`.execute(db));
    return { kind: 'message', message: 'Seq Updated Successfully' };
  },
  async 'kadi-seq'(db) {
    await runProc(() => sql`EXEC UpdateKrutiSeq N'क आदि लीस्ट'`.execute(db));
    return { kind: 'message', message: 'Seq Updated Successfully' };
  },
  async seq(db) {
    await runProc(() => sql`EXEC UpdateSeq`.execute(db));
    return { kind: 'message', message: 'Seq Updated Successfully' };
  },
  async 'latest-book-info'(db) {
    await runProc(() => sql`EXEC UpdateKrutiLatestBookMastKt`.execute(db));
    return { kind: 'message', message: '' };
  },
  // Replace LibNo In › Reference / Note: how many krutis use it, then the replacement.
  async 'libno-use-count'(db, _user, _selected, ctx) {
    const t = textParam(ctx, 'kind') === 'note' ? sql`KrutiNoteT` : sql`krutireflibno`;
    const n = int(
      await scalar(
        db,
        sql`SELECT COUNT(krutimstkt) FROM ${t} WHERE BookTKt = ${numberParam(ctx, 'from')}`,
      ),
    );
    return { kind: 'message', message: String(n) };
  },
  async 'replace-libno'(db, _user, _selected, ctx) {
    const from = numberParam(ctx, 'from');
    const to = numberParam(ctx, 'to');
    if (textParam(ctx, 'kind') === 'note')
      await sql`UPDATE KrutiNoteT SET BookTKt = ${to} WHERE BookTKt = ${from}`.execute(db);
    else
      await sql`UPDATE krutireflibno SET reflibno = ${textParam(ctx, 'toLibNo')}, BookTKt = ${to} WHERE BookTKt = ${from}`.execute(
        db,
      );
    return { kind: 'message', message: '' };
  },

  // ------------------------------------------------------------ Common Group ----
  async 'group-add-new'(db, _user, selected, ctx) {
    const head = numberParam(ctx, 'head');
    const name = textParam(ctx, 'name');
    await inTransaction(db, async (trx) => {
      const grpNo = int(
        await scalar(
          trx,
          sql`SELECT ISNULL(MAX(groupno), 0) + 1 FROM krutigroupT WITH (UPDLOCK, HOLDLOCK)`,
        ),
      );
      let key = await nextKey(trx, 'krutigroupT', 'krutigrouptkm');
      for (const id of selected) {
        await sql`INSERT INTO krutigroupT (KrutiGroupTkm, groupno, groupname, krutimstkt, remark, seq, head)
          VALUES (${key++}, ${grpNo}, ${name}, ${id}, '', 0, ${head === id ? 1 : 0})`.execute(trx);
      }
    });
    return { kind: 'refreshed', rows: [] };
  },
  /** Add In Existing Group, as the desktop words it: "Yes" heads (or renames), "No" adds members. */
  async 'group-add-existing'(db, _user, selected, ctx) {
    const grpNo = numberParam(ctx, 'group');
    const groupName = textParam(ctx, 'groupName');
    await inTransaction(db, async (trx) => {
      let key = await nextKey(trx, 'krutigroupT', 'krutigrouptkm');
      let seq = int(
        await scalar(
          trx,
          sql`SELECT ISNULL(MAX(seq), 0) + 1 FROM krutigroupT WHERE groupno = ${grpNo}`,
        ),
      );
      const counter = int(
        await scalar(
          trx,
          sql`SELECT COUNT(*) FROM krutigroupT WHERE krutimstkt IN ${toIds(selected)}`,
        ),
      );
      if (boolParam(ctx, 'head')) {
        if (counter > 0) {
          // The desktop compares the group number with a kruti id here.
          await sql`UPDATE krutigroupT SET groupname = ${groupName} WHERE krutimstkt = ${grpNo}`.execute(
            trx,
          );
        } else {
          for (const id of selected) {
            await sql`INSERT INTO krutigroupT (KrutiGroupTkm, groupno, groupname, krutimstkt, remark, seq, head)
              VALUES (${key++}, ${grpNo}, ${groupName}, ${id}, '', ${seq++}, ${grpNo === id ? 1 : 0})`.execute(
              trx,
            );
          }
        }
        return;
      }
      for (const id of selected) {
        if (grpNo === id) {
          const heads = int(
            await scalar(trx, sql`SELECT COUNT(*) FROM KrutiGroupT WHERE krutimstkt = ${id}`),
          );
          if (heads === 1)
            await sql`UPDATE krutigroupT SET groupNo = ${grpNo}, groupname = ${groupName} WHERE krutimstkt = ${id}`.execute(
              trx,
            );
          else
            await sql`INSERT INTO krutigroupT (KrutiGroupTkm, groupno, groupname, krutimstkt, remark, seq, head)
              VALUES (${key}, ${grpNo}, ${groupName}, ${id}, '', ${seq}, 1)`.execute(trx);
        } else {
          await sql`INSERT INTO krutigroupT (KrutiGroupTkm, groupno, groupname, krutimstkt, remark, seq, head)
            VALUES (${key}, ${grpNo}, N'', ${id}, '', ${seq}, 0)`.execute(trx);
        }
        key++;
        seq++;
      }
    });
    return { kind: 'refreshed', rows: [] };
  },
  async 'groups-of'(db, _user, selected) {
    return excel(
      db,
      'Group',
      sql`SELECT groupno, groupname FROM krutigroupT WHERE krutimstkt IN ${toIds(selected)}`,
    );
  },
  async 'group-delete'(db, _user, selected, ctx) {
    const group = numberParam(ctx, 'group');
    const { rows } = await sql<{ krutimstkt: number; head: boolean | null }>`
      SELECT krutimstkt, head FROM krutigroupT WHERE krutimstkt IN ${toIds(selected)} AND groupno = ${group}`.execute(
      db,
    );
    if (rows.length === 0) return { kind: 'message', message: '' };
    if (rows[0]!.head === true)
      return { kind: 'message', message: `Kruti : ${rows[0]!.krutimstkt} is Group Header` };
    await sql`DELETE FROM krutigroupT WHERE krutimstkt IN ${toIds(selected)} AND groupno = ${group}`.execute(
      db,
    );
    return { kind: 'refreshed', rows: [] };
  },
  async 'group-names-of'(db, _user, selected) {
    return excel(
      db,
      'Group',
      sql`SELECT groupNo, groupname FROM krutigroupT WHERE groupname <> '' AND groupno IN
        (SELECT groupNo FROM krutigroupT WHERE krutimstkt IN ${toIds(selected)}) GROUP BY groupNo, groupname`,
    );
  },
  async 'group-make-head'(db, _user, selected, ctx) {
    const group = numberParam(ctx, 'group');
    const head = selected[0] ?? 0;
    await sql`UPDATE krutigroupT SET groupname = ${textParam(ctx, 'groupName')}, head = 1 WHERE krutimstkt = ${head}`.execute(
      db,
    );
    await sql`UPDATE krutigroupT SET groupname = N'', head = 0 WHERE groupNo = ${group} AND krutimstkt != ${head}`.execute(
      db,
    );
    return { kind: 'refreshed', rows: [] };
  },
  async 'group-rows-of'(db, _user, selected) {
    return excel(
      db,
      'Group',
      sql`SELECT KrutiGroupTkm, groupname FROM krutigroupT WHERE krutimstkt IN ${toIds(selected)}`,
    );
  },
  async 'group-rename'(db, _user, _selected, ctx) {
    await sql`UPDATE krutigroupT SET groupname = ${textParam(ctx, 'name')} WHERE KrutiGroupTkm = ${numberParam(ctx, 'row')}`.execute(
      db,
    );
    return { kind: 'refreshed', rows: [] };
  },
  async 'group-seq'(db, _user, selected) {
    let seq = 1;
    for (const id of selected)
      await sql`UPDATE krutigroupT SET seq = ${seq++} WHERE krutimstkt = ${id}`.execute(db);
    return { kind: 'refreshed', rows: [] };
  },
  /**
   * txtgroupnm's popup, saved (Txt_KeyDown "txtgroupnm"): the group is rewritten at once; the
   * current kruti becomes its head, named after the box.
   */
  async 'save-group'(db, _user, _selected, ctx) {
    const current = numberParam(ctx, 'current');
    const rows = JSON.parse(textParam(ctx, 'rows') || '[]') as Record<string, GridValue>[];
    await inTransaction(db, async (trx) => {
      const gpno = int(
        await scalar(trx, sql`SELECT groupno FROM krutigroupt WHERE krutimstkt = ${current}`),
      );
      await sql`DELETE FROM krutigroupt WHERE groupno = ${gpno}`.execute(trx);
      let gid = await nextKey(trx, 'krutigroupt', 'KrutiGroupTkm');
      for (const r of rows) {
        const kid = int(r.krutimstkm);
        const head = kid === current;
        await sql`INSERT INTO krutigroupt (KrutiGroupTkm, groupno, groupname, krutimstkt, remark, seq, head)
          VALUES (${gid++}, ${gpno}, ${head ? textParam(ctx, 'groupName') : ''}, ${kid}, ${text(r.remark)}, ${int(r.seq)}, ${head ? 1 : 0})`.execute(
          trx,
        );
      }
    });
    return { kind: 'refreshed', rows: [] };
  },

  // ------------------------------------------------------------ Insert / Delete In Selected ----
  async 'values-of'(db, _user, selected, ctx) {
    const kind = textParam(ctx, 'kind');
    const q =
      kind === 'Bhasha'
        ? sql`SELECT DISTINCT Bhashacokm, Bhashaname FROM Bhasmast INNER JOIN krutibhast ON bhasmast.bhashacokm = krutibhast.bhashakt
            WHERE krutibhast.krutimstkt IN ${toIds(selected)} ORDER BY bhasmast.bhashaname`
        : kind === 'Swaroop'
          ? sql`SELECT DISTINCT c1.ColumnMastkm, c1.Name, c1.Brief, c1.ColumnNo, c1.Remark, ISNULL(c.name, '') AS Uplevel FROM columnmaster AS c1
              LEFT OUTER JOIN columnmaster AS c ON c1.UplevelId = c.ColumnMastkm INNER JOIN krutiSwaropT ON c1.ColumnMastkm = krutiswaropt.swroopkt
              WHERE c1.Vibhag = N'Swroop' AND krutiswaropt.krutimstkt IN ${toIds(selected)} ORDER BY c1.Name`
          : kind === 'Vibhag'
            ? sql`SELECT DISTINCT c1.ColumnMastkm, c1.Name, c1.Brief, c1.ColumnNo, c1.Remark FROM columnmaster AS c1
                INNER JOIN KrutiVibhagT ON c1.ColumnMastkm = KrutiVibhagT.VibhagKt WHERE c1.Vibhag = N'Head'
                AND KrutiVibhagT.krutimstkt IN ${toIds(selected)} ORDER BY c1.Name`
            : sql`SELECT columnmastkm, Name FROM columnMaster WHERE Vibhag = 'KrutiSampraday' ORDER BY Name`;
    return excel(db, kind, q);
  },
  /** ChangeInSelectedRecord: insert (op 1) or delete (op 2) one Bhasha/Swaroop/Vibhag/Sampraday. */
  async 'change-in-selected'(db, _user, selected, ctx) {
    ctx.assertPassword(ctx.params.password);
    const kind = textParam(ctx, 'kind');
    const insert = numberParam(ctx, 'op') === 1;
    const value = numberParam(ctx, 'value');
    let n = 0;
    await inTransaction(db, async (trx) => {
      let tid =
        kind === 'Bhasha'
          ? int(
              await scalar(
                trx,
                sql`SELECT MAX(krutibhashakm) FROM krutibhast WITH (UPDLOCK, HOLDLOCK)`,
              ),
            )
          : kind === 'Swaroop'
            ? int(
                await scalar(
                  trx,
                  sql`SELECT MAX(krutiswaropkm) FROM krutiSwaropT WITH (UPDLOCK, HOLDLOCK)`,
                ),
              )
            : 0;
      for (const id of selected) {
        tid++;
        if (kind === 'Bhasha') {
          if (insert) {
            const seq = int(
              await scalar(
                trx,
                sql`SELECT ISNULL(MAX(Seq), 0) + 1 FROM krutibhast WHERE KrutiMstkt = ${id}`,
              ),
            );
            n += affected(
              await sql`INSERT INTO krutibhast (krutibhashakm, krutimstkt, bhashakt, Seq) VALUES (${tid}, ${id}, ${value}, ${seq})`.execute(
                trx,
              ),
            );
          } else
            n += affected(
              await sql`DELETE FROM krutibhast WHERE krutimstkt = ${id} AND Bhashakt = ${value}`.execute(
                trx,
              ),
            );
          await refreshTexts(trx, id, kind);
        } else if (kind === 'Swaroop') {
          if (insert) {
            const seq = int(
              await scalar(
                trx,
                sql`SELECT ISNULL(MAX(Seq), 0) + 1 FROM krutiSwaropT WHERE KrutiMstkt = ${id}`,
              ),
            );
            n += affected(
              await sql`INSERT INTO krutiSwaropT (krutiswaropkm, krutimstkt, swroopkt, seq, mark1) VALUES (${tid}, ${id}, ${value}, ${seq}, 0)`.execute(
                trx,
              ),
            );
          } else
            n += affected(
              await sql`DELETE FROM krutiSwaropT WHERE krutimstkt = ${id} AND swroopkt = ${value}`.execute(
                trx,
              ),
            );
          await refreshTexts(trx, id, kind);
        } else if (kind === 'Vibhag') {
          if (insert) {
            const seq = int(
              await scalar(
                trx,
                sql`SELECT ISNULL(MAX(Seq), 0) + 1 FROM KrutiVibhagT WHERE KrutiMstkt = ${id}`,
              ),
            );
            n += affected(
              await sql`INSERT INTO KrutiVibhagT (KrutiMstKt, VibhagKt, Seq) VALUES (${id}, ${value}, ${seq})`.execute(
                trx,
              ),
            );
          } else
            n += affected(
              await sql`DELETE FROM KrutiVibhagT WHERE krutimstkt = ${id} AND VibhagKt = ${value}`.execute(
                trx,
              ),
            );
          await refreshTexts(trx, id, kind);
        } else if (kind === 'Sampraday') {
          const cnt = int(
            await scalar(
              trx,
              sql`SELECT COUNT(KrutiSampradayKm) FROM KrutiSampradayT WHERE krutimstkt = ${id} AND SampradayKt = ${value}`,
            ),
          );
          if (insert && cnt === 0) {
            const seq = int(
              await scalar(
                trx,
                sql`SELECT ISNULL(MAX(Seq), 0) + 1 FROM KrutiSampradayT WHERE KrutiMstkt = ${id}`,
              ),
            );
            await sql`INSERT INTO KrutiSampradayT (KrutiMstKt, SampradayKt, Seq) VALUES (${id}, ${value}, ${seq})`.execute(
              trx,
            );
            n++;
          } else if (!insert && cnt > 0) {
            await sql`DELETE FROM KrutiSampradayT WHERE krutimstkt = ${id} AND SampradayKt = ${value}`.execute(
              trx,
            );
            n++;
          }
        }
      }
    });
    const name = textParam(ctx, 'name');
    return {
      kind: 'refreshed',
      rows: [],
      message: insert
        ? `At ${n} Places ${name}  ${kind} is Inserted succefully`
        : `At ${n} Places ${name}   ${kind} is Deleted succefully`,
    };
  },

  // ------------------------------------------------------------ Update Kruti Swarop Head ----
  async 'heads-of'(db, _user, selected) {
    return excel(
      db,
      'Krutihead',
      sql`SELECT c.ColumnMastkm, c.Name AS Krutihead FROM krutimst AS k LEFT OUTER JOIN columnmaster AS c ON k.KrutiHeadkt = c.ColumnMastkm
        WHERE ISNULL(c.name, '') <> '' AND krutimstkm IN ${toIds(selected)} GROUP BY c.ColumnMastkm, c.Name ORDER BY c.name`,
    );
  },
  async 'update-swarop-head'(db, _user, selected, ctx) {
    const n = affected(
      await sql`UPDATE krutimst SET KrutiHeadkt = ${numberParam(ctx, 'to')} WHERE KrutiHeadkt = ${numberParam(ctx, 'from')}
        AND krutimstkm IN ${toIds(selected)}`.execute(db),
    );
    return { kind: 'message', message: `Kruti Swarop Head Updated Total ${n}` };
  },
};
