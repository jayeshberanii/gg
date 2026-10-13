import { UserType } from '@gglib/shared';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { bit, get, grid, int, text } from './book-common.js';
import {
  insertWithMaxId,
  openInUse,
  referenceStatement,
  tableKtOf,
  trimmed,
} from './master-common.js';
import type { ScreenDefinition } from './registry.js';

/**
 * MdlLib.INSQ: the text trimmed, and a blank written as ' ' (the desktop builds its Column
 * Master SQL with it).
 */
const insq = (v: unknown) => trimmed(v) || ' ';

/** TableKt of Form_Load (this database has no row for columnmaster, so it is 0). */
const tableKt = (db: Executor) => tableKtOf(db, 'columnmaster');

/**
 * frmColumnMaster_Load: New, Modify, Save and Delete are for admins, AMaster and users 20 and
 * 50; everyone else gets EnableDisableDataEditing's Locked toolbar with New off.
 */
export const mayEditColumns = (u: { id: number; isAdmin: boolean; userType: number }) =>
  u.isAdmin || u.userType === UserType.AMaster || u.id === 20 || u.id === 50;

/**
 * Master › Column Master (frmColumnMaster). It has no repository: Save is the form's own SQL.
 * Table columnmaster, key ColumnMastkm assigned as max + 1.
 */
export const columnMaster: ScreenDefinition = {
  screen: 'column-master',
  table: 'columnmaster',
  primaryColumn: 'ColumnMastkm',
  // The table has Locked, but the form has no Ctrl+L / Ctrl+U.
  lockable: false,
  // GetDataTable builds the grid query with UcSearch.GetColumns.
  ucSearchColumns: true,
  writableBy: mayEditColumns,
  // insertworkreports after Add and Edit, with the Reference rows compared one by one.
  workReport: true,
  workReportOn: { delete: false },
  workReportTrans: ['ReferenceT1'],

  // Save's own checks, in order.
  validate: (f) =>
    trimmed(f.Vibhag) === ''
      ? 'Please Enter Vibhag'
      : trimmed(f.Name) === ''
        ? 'Please Enter Name'
        : '',

  /** dgMain_CellFormatting colours a row DarkViolet when it has RefrenceT rows. */
  async decorateList(db, rows) {
    if (rows.length === 0) return rows;
    const tk = await tableKt(db);
    const { rows: refs } = await sql<{ id: number }>`
      SELECT DISTINCT RecordKt AS id FROM RefrenceT
      WHERE Tablekt = ${tk} AND RecordKt IN ${idList(rows.map((r) => Number(r.ColumnMastkm)))}
    `.execute(db);
    const has = new Set(refs.map((r) => Number(r.id)));
    return rows.map((r) => ({ ...r, HasReference: has.has(Number(r.ColumnMastkm)) }));
  },
  /** FillData: lnkColumnReference turns DarkViolet when the record has references. */
  async recordExtras(db, id) {
    const n = Number(
      (
        await sql<{
          n: number;
        }>`SELECT COUNT(*) AS n FROM RefrenceT WHERE Tablekt = ${await tableKt(db)} AND RecordKt = ${id}`.execute(
          db,
        )
      ).rows[0]?.n ?? 0,
    );
    return { HasReference: n > 0 };
  },

  async save(trx, user, id, f) {
    // v3.4.3.1 Save: another record has the same Name and Vibhag (message as the desktop has it).
    const { rows: same } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM columnmaster
      WHERE ColumnMastkm <> ${id} AND Name = ${trimmed(f.Name)} AND Vibhag = ${trimmed(f.Vibhag)}
    `.execute(trx);
    if (Number(same[0]?.n ?? 0) > 0) throw new BadRequestException('Recor Already Exist');

    const v = {
      Name: insq(f.Name),
      ColumnNo: int(f.ColumnNo),
      Vibhag: insq(f.Vibhag),
      ShortNm: insq(f.ShortNm),
      Brief: insq(f.Brief),
      Remark: insq(f.Remark),
      HindiWord: insq(f.HindiWord),
      IsPrint: bit(f.IsPrint) ? 1 : 0,
    };
    let columnId = id;
    if (id > 0) {
      // The desktop also sets UplevelId from txtUplevelTran.Tag, which nothing ever sets, so
      // every edit wrote 0; UplevelId is left as it is here.
      await sql`
        UPDATE columnmaster SET Name = ${v.Name}, ColumnNo = ${v.ColumnNo}, Vibhag = ${v.Vibhag},
          ShortNm = ${v.ShortNm}, Brief = ${v.Brief}, Remark = ${v.Remark}, HindiWord = ${v.HindiWord},
          IsPrint = ${v.IsPrint}, moduser = ${user.id}, Moddate = GETDATE()
        WHERE ColumnMastkm = ${id}
      `.execute(trx);
    } else {
      columnId = await insertWithMaxId(trx, 'columnmaster', 'ColumnMastkm', (newId) =>
        sql`
          INSERT INTO columnmaster (ColumnMastkm, Name, ColumnNo, Vibhag, ShortNm, Brief, Remark, count, countI,
            HindiWord, UplevelId, Locked, IsPrint, enuser, endate)
          VALUES (${newId}, ${v.Name}, ${v.ColumnNo}, ${v.Vibhag}, ${v.ShortNm}, ${v.Brief}, ${v.Remark}, 0, 0,
            ${v.HindiWord}, 0, 0, ${v.IsPrint}, ${user.id}, GETDATE())
        `.execute(trx),
      );
    }

    // The Reference rows (lnkColumnReference): replaced when the popup was saved.
    const refs = grid(f, 'ReferenceT1');
    if (refs) {
      const tk = await tableKt(trx);
      await sql`DELETE FROM RefrenceT WHERE Tablekt = ${tk} AND Recordkt = ${columnId}`.execute(
        trx,
      );
      for (const r of refs) {
        await sql`
          INSERT INTO RefrenceT (Tablekt, RecordKt, Subhead, WordNm, Example, LibNo, Refplacekt, Pgno, Seq, BookTKt)
          VALUES (${tk}, ${columnId}, ${insq(get(r, 'Subhead'))}, ${insq(get(r, 'WordNm'))}, ${insq(get(r, 'Example'))},
            ${text(get(r, 'BookTName'))}, ${int(get(r, 'Refplacekt'))}, ${text(get(r, 'Pgno'))}, ${int(get(r, 'Seq'))},
            ${int(get(r, 'BookTKt'))})
        `.execute(trx);
      }
    }

    // ColumnUplevelTran. The desktop rewrote it on every save from a table it only loads on F2,
    // so saving without opening the popup deleted every up level; it is replaced only when the
    // popup was saved.
    const uplevels = grid(f, 'UplevelTran');
    if (uplevels) {
      await sql`DELETE FROM ColumnUplevelTran WHERE ColumnMastKt = ${columnId}`.execute(trx);
      for (const r of uplevels) {
        await sql`
          INSERT INTO ColumnUplevelTran (ColumnMastKt, UplevelKt) VALUES (${columnId}, ${int(get(r, 'UplevelKt'))})
        `.execute(trx);
      }
    }
    return columnId;
  },

  /** Delete() is empty on the desktop: nothing is ever deleted. */
  async deleteRecord() {
    throw new ForbiddenException('Column Master records cannot be deleted');
  },

  trans: {
    // txtUplevelTran: TranName "Uplevel", FormName "columnmaster", TranType = txtVibhag.
    UplevelTran: {
      statements: async (_db, id) => [
        `SELECT ColumnUplevelTranKm, UplevelKt, ColumnMaster.Name AS UplevelName FROM ColumnUplevelTran
         INNER JOIN ColumnMaster ON ColumnUplevelTran.UplevelKt = ColumnMaster.ColumnMastKm
         WHERE ColumnUplevelTran.ColumnMastKt = ${Math.trunc(id)}`,
      ],
      lookups: {
        uplevelname: (db, row) => {
          const tranType = trimmed(row.TranType);
          return pickListOf(
            db,
            sql`SELECT ColumnMastkm, name FROM columnmaster
                WHERE Vibhag = ${tranType.toLowerCase() === 'worktype' ? 'Vibhag' : tranType}`,
          );
        },
      },
    },
    // lnkColumnReference: TranName "ReferenceT1", FormName "Common" (its lists are the engine's).
    ReferenceT1: { statements: (db, id) => referenceStatement(db, 'columnmaster', id) },
  },

  actions: {
    // For Selected Record › Kruti Master › Vibhag->Head
    'vibhag-head': (db, _user, ids) =>
      openInUse(
        db,
        'kruti-master',
        sql<{
          id: number;
        }>`SELECT krutimstkt AS id FROM KrutiVibhagT WHERE VibhagKt IN ${idList(ids)}`,
        'No Records Found',
      ),
  },
};
