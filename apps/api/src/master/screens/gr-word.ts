import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { idList, type Executor } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { insertWithMaxId, openInUse, trimmed as text } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/** One record id from an action's params (a picked list row's code). */
export const pickedId = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('Nothing was picked');
  return n;
};

/**
 * The graphics word lists' shared right-click items (frmGrWordMaster, frmGrVishayMaster):
 * Update Count (the UpdateCount procedure, which knows both tables), Show In Use in Graphics
 * Master and Graphics Detail through their link tables, and Replace, which re-points every link
 * row at the picked record (the record itself stays).
 */
export function graphicsWordActions(o: {
  /** UpdateCount's @TableName. */
  countTable: 'GrwordM' | 'GrVishay';
  /** Graphics Master's and Graphics Detail's link tables, and their column for this record. */
  masterLinks: string;
  detailLinks: string;
  linkColumn: string;
}): NonNullable<ScreenDefinition['actions']> {
  const links = (table: string) => sql.table(table);
  const column = sql.ref(o.linkColumn);
  return {
    /** Update Count For Selected Records, then FillList. */
    async 'update-count'(db: Executor, _user, ids, ctx): Promise<ActionResult> {
      if (ids.length === 0) return { kind: 'message', message: '' };
      await sql`EXEC UpdateCount ${o.countTable}, ${ids.join(',')}`.execute(db);
      return { kind: 'list', rows: await ctx.list() };
    },
    async replace(db, _user, ids, ctx): Promise<ActionResult> {
      const from = ids[0];
      if (!from) return { kind: 'message', message: '' };
      const to = pickedId(ctx.params.replaceWith);
      await sql`UPDATE ${links(o.masterLinks)} SET ${column} = ${to} WHERE ${column} = ${from}`.execute(
        db,
      );
      await sql`UPDATE ${links(o.detailLinks)} SET ${column} = ${to} WHERE ${column} = ${from}`.execute(
        db,
      );
      return { kind: 'list', rows: await ctx.list(), message: 'Record Replaced Successfully' };
    },
    'in-use-graphics-master': (db, _user, ids) =>
      openInUse(
        db,
        'graphics-master',
        sql<{ id: number }>`SELECT DISTINCT graphicbkt AS id FROM ${links(o.masterLinks)}
          WHERE ${column} IN ${idList(ids.length ? ids : [0])}`,
        'No Record Found',
      ),
    'in-use-graphics-detail': (db, _user, ids) =>
      openInUse(
        db,
        'graphics-detail',
        sql<{ id: number }>`SELECT DISTINCT graphicbkt AS id FROM ${links(o.detailLinks)}
          WHERE ${column} IN ${idList(ids.length ? ids : [0])}`,
        'No Record Found',
      ),
  };
}

/**
 * Graphics › New Word Master (frmGrWordMaster, GrWordMRepository). Table grwordm, key GrwordMkm
 * assigned as max + 1. No Locked column; Copy is off until the first Save / Cancel. Saves are
 * logged in the work report (Add and Edit, not Delete).
 */
export const grWordMaster: ScreenDefinition = {
  screen: 'new-word-master',
  table: 'grwordm',
  primaryColumn: 'GrwordMkm',
  lockable: false,
  // FillList: ListGridData(..., OrderByCol "typenm").
  listOrderBy: 'typenm',
  workReport: true,
  workReportOn: { add: true, edit: true, delete: false },

  // GrWordMRepository.GetValidationMessage: the first failure only.
  validate: (f) =>
    text(f.typenm) === ''
      ? 'Please Enter Type Name'
      : text(f.wordnm) === ''
        ? 'Please Enter Word Name'
        : '',

  async save(trx, user, id, f) {
    const v = {
      wordnm: text(f.wordnm),
      typenm: text(f.typenm),
      defination: text(f.defination),
      remark: text(f.remark),
    };
    if (id > 0) {
      await sql`
        UPDATE grwordm SET wordnm = ${v.wordnm}, typenm = ${v.typenm}, defination = ${v.defination},
          remark = ${v.remark}, moduser = ${user.id}, moddate = GETDATE()
        WHERE GrwordMkm = ${id}
      `.execute(trx);
      return id;
    }
    return insertWithMaxId(trx, 'grwordm', 'GrwordMkm', (newId) =>
      sql`
        INSERT INTO grwordm (GrwordMkm, wordnm, typenm, defination, remark, enuser, endate)
        VALUES (${newId}, ${v.wordnm}, ${v.typenm}, ${v.defination}, ${v.remark}, ${user.id}, GETDATE())
      `.execute(trx),
    );
  },

  // GrWordMRepository.CheckInUse
  async checkInUse(db, id) {
    const used = async (table: string) =>
      Number(
        (
          await sql<{
            n: number;
          }>`SELECT COUNT(*) AS n FROM ${sql.table(table)} WHERE grwordkt = ${id}`.execute(db)
        ).rows[0]?.n ?? 0,
      ) > 0;
    if (await used('GrBookWordT')) return 'Record is used in Graphics Master';
    if (await used('GrDetailWordT')) return 'Record is used in Graphics Detail';
    return '';
  },

  lists: {
    // ReplaceToolStripMenuItem: the words of the current row's Type.
    'replace-with': (db, params) =>
      pickListOf(
        db,
        sql`SELECT GrwordMkm, wordnm FROM GrwordM
          WHERE typenm = (SELECT typenm FROM GrwordM WHERE GrwordMkm = ${Number(params.id) || 0})
          ORDER BY wordnm`,
      ),
  },

  actions: graphicsWordActions({
    countTable: 'GrwordM',
    masterLinks: 'GrBookWordT',
    detailLinks: 'GrDetailWordT',
    linkColumn: 'grwordkt',
  }),
};
