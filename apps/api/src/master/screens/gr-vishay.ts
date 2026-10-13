import { sql } from 'kysely';
import { idList, inTransaction, type Executor } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { bit } from './book-common.js';
import { graphicsWordActions, pickedId } from './gr-word.js';
import { insertWithMaxId, tableKtOf, trimmed as text } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * GrVishayRepository.CheckInUse(Id, Name): "<name> is used in Graphics Master." and / or
 * "… Graphics Detail.", joined by " and ".
 */
async function inUse(db: Executor, id: number, name: string): Promise<string> {
  const count = async (table: string) =>
    Number(
      (
        await sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM ${sql.table(table)} WHERE grvishaykt = ${id}`.execute(db)
      ).rows[0]?.n ?? 0,
    );
  const parts: string[] = [];
  if ((await count('GrbookSubT')) > 0) parts.push(`${name} is used in Graphics Master.`);
  if ((await count('GrDetailSubT')) > 0) parts.push(`${name} is used in Graphics Detail.`);
  return parts.join(' and ');
}

/**
 * Show Member/Master (NewShowMemberMaster): for each selected subject, the subjects under it in
 * the GrVishay member tree (TreeMast, Tablekt of 'GrVishayMembr') and the ones it sits under.
 */
async function memberMaster(db: Executor, ids: number[]) {
  const tableId = await tableKtOf(db, 'GrVishayMembr');
  const masters = (
    await sql<{ recordkt: number; Master: string }>`
      SELECT Main.recordkt, ISNULL(VMain.vishaynm, '') AS Master
      FROM TreeMast Main
      INNER JOIN TreeMast MainTreeMast ON Main.masterid = MainTreeMast.TreeMastkm
      INNER JOIN GrVishay VMain ON MainTreeMast.recordkt = VMain.GrVishaykm
      WHERE Main.MainMasterId > 0 AND Main.Tablekt = ${tableId} AND Main.recordkt IN ${idList(ids)}
      ORDER BY Main.TreeMastkm
    `.execute(db)
  ).rows;
  const join = (values: string[]) =>
    values
      .map((v) => v.trim())
      .filter((v) => v !== '')
      .join(',');
  const rows = [];
  for (const id of ids) {
    const members = (
      await sql<{ Member: string }>`
        SELECT vishaynm AS Member FROM GrVishay
        INNER JOIN TreeMast ON GrVishay.GrVishaykm = TreeMast.recordkt
        WHERE tablekt = ${tableId}
          AND TreeMast.MasterId IN (SELECT TreeMastkm FROM TreeMast WHERE recordkt = ${id} AND Tablekt = ${tableId})
        GROUP BY vishaynm ORDER BY MIN(TreeMast.seq)
      `.execute(db)
    ).rows;
    rows.push({
      Grvishaykm: id,
      Member: join(members.map((m) => m.Member ?? '')),
      Master: join(masters.filter((m) => Number(m.recordkt) === id).map((m) => m.Master)),
    });
  }
  return rows;
}

const shared = graphicsWordActions({
  countTable: 'GrVishay',
  masterLinks: 'GrbookSubT',
  detailLinks: 'GrDetailSubT',
  linkColumn: 'grvishaykt',
});

/**
 * Graphics › New Vishay Master (frmGrVishayMaster, GrVishayRepository). Table GrVishay, key
 * Grvishaykm assigned as max + 1. frmGrWordMaster's twin, with Group Name, a Cancel check box,
 * the Member / Master columns, and Delete and Replace over every selected row.
 */
export const grVishayMaster: ScreenDefinition = {
  screen: 'new-vishay-master',
  table: 'GrVishay',
  primaryColumn: 'Grvishaykm',
  lockable: false,
  workReport: true,
  workReportOn: { add: true, edit: true, delete: false },

  // GrVishayRepository.GetValidationMessage
  validate: (f) => (text(f.vishaynm) === '' ? 'Please Enter Vishay Name' : ''),

  async save(trx, user, id, f) {
    const v = {
      vishaynm: text(f.vishaynm),
      groupnm: text(f.groupnm),
      defination: text(f.defination),
      remark: text(f.remark),
      IsCancel: bit(f.IsCancel),
    };
    if (id > 0) {
      await sql`
        UPDATE GrVishay SET vishaynm = ${v.vishaynm}, groupnm = ${v.groupnm},
          defination = ${v.defination}, remark = ${v.remark}, IsCancel = ${v.IsCancel},
          moduser = ${user.id}, moddate = GETDATE()
        WHERE GrVishaykm = ${id}
      `.execute(trx);
      return id;
    }
    return insertWithMaxId(trx, 'GrVishay', 'GrVishaykm', (newId) =>
      sql`
        INSERT INTO GrVishay (GrVishaykm, vishaynm, groupnm, defination, remark, IsCancel, enuser, endate)
        VALUES (${newId}, ${v.vishaynm}, ${v.groupnm}, ${v.defination}, ${v.remark}, ${v.IsCancel},
                ${user.id}, GETDATE())
      `.execute(trx),
    );
  },

  async checkInUse(db, id) {
    const { rows } = await sql<{ name: string | null }>`
      SELECT vishaynm AS name FROM GrVishay WHERE Grvishaykm = ${id}
    `.execute(db);
    return inUse(db, id, rows[0]?.name ?? '');
  },

  lists: {
    // ReplaceToolStripMenuItem. The desktop's statement reads "… FROM GrVishay WHERE order by
    // vishaynm", which SQL Server refuses, so Replace never got past its list there.
    'replace-with': (db) =>
      pickListOf(db, sql`SELECT Grvishaykm, vishaynm FROM GrVishay ORDER BY vishaynm`),
  },

  actions: {
    'update-count': shared['update-count']!,
    'in-use-graphics-master': shared['in-use-graphics-master']!,
    'in-use-graphics-detail': shared['in-use-graphics-detail']!,

    /** Replace: every selected record's links move to the picked one. */
    async replace(db, _user, ids, ctx): Promise<ActionResult> {
      if (ids.length === 0) return { kind: 'message', message: '' };
      const to = pickedId(ctx.params.replaceWith);
      await sql`UPDATE GrbookSubT SET grvishaykt = ${to} WHERE grvishaykt IN ${idList(ids)}`.execute(
        db,
      );
      await sql`UPDATE GrDetailSubT SET grvishaykt = ${to} WHERE grvishaykt IN ${idList(ids)}`.execute(
        db,
      );
      return { kind: 'list', rows: await ctx.list(), message: 'Records Replaced Successfully' };
    },

    async 'show-member-master'(db, _user, ids): Promise<ActionResult> {
      if (ids.length === 0) return { kind: 'message', message: '' };
      return { kind: 'cells', rows: await memberMaster(db, ids) };
    },

    /**
     * Delete(): after the confirm and the Security password, every selected row's CheckInUse
     * (one line each); any of them in use deletes nothing. Then FillList.
     */
    async 'delete-selected'(db, _user, ids, ctx): Promise<ActionResult> {
      ctx.assertPassword(ctx.params.password);
      if (ids.length === 0) return { kind: 'message', message: '' };
      const names = new Map(
        (
          await sql<{ id: number; name: string | null }>`
            SELECT Grvishaykm AS id, vishaynm AS name FROM GrVishay WHERE Grvishaykm IN ${idList(ids)}
          `.execute(db)
        ).rows.map((r) => [Number(r.id), r.name ?? '']),
      );
      const messages: string[] = [];
      for (const id of ids) {
        const m = await inUse(db, id, names.get(id) ?? '');
        if (m.trim() !== '') messages.push(m);
      }
      if (messages.length > 0) return { kind: 'message', message: messages.join('\r\n') };
      const deleted = await inTransaction(db, async (trx) => {
        const r = await sql`DELETE FROM GrVishay WHERE Grvishaykm IN ${idList(ids)}`.execute(trx);
        return Number(r.numAffectedRows ?? 0);
      });
      return deleted > 0
        ? {
            kind: 'list',
            rows: await ctx.list(),
            message: `(${deleted}) Records Deleted Successfully`,
          }
        : { kind: 'message', message: '' };
    },
  },
};
