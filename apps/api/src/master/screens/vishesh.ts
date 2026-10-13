import { sql } from 'kysely';
import { idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { get, grid, int, text } from './book-common.js';
import {
  insertWithMaxId,
  openInUse,
  referenceStatement,
  tableKtOf,
  trimmed,
  uplevelWithChild,
} from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/** clsCom.INSQ: trimmed, a blank written as ' '. */
const insq = (v: unknown) => trimmed(v) || ' ';

/** Numbers only, from a comma-separated form value. */
const ids = (v: unknown) =>
  trimmed(v)
    .split(',')
    .map((s) => Math.trunc(Number(s)))
    .filter((n) => Number.isFinite(n) && n > 0);

/**
 * Master › Vishesh Master (frmVisheshMaster, VisheshMastRepository). Table visheshMast, key Tid
 * assigned as max + 1. `remark` works as the record's category (Guru, Category, city, …).
 */
export const visheshMaster: ScreenDefinition = {
  screen: 'vishesh-master',
  table: 'visheshMast',
  primaryColumn: 'Tid',
  lockable: true,
  // insertworkreports after Add and Edit; Delete logs nothing.
  workReport: true,
  workReportOn: { delete: false },

  validate: (f) => (trimmed(f.Vishesh) === '' ? 'Please Enter Name' : ''),

  async recordExtras(db, id) {
    const n = Number(
      (
        await sql<{ n: number }>`SELECT COUNT(*) AS n FROM RefrenceT
          WHERE Tablekt = ${await tableKtOf(db, 'visheshMast')} AND RecordKt = ${id}`.execute(db)
      ).rows[0]?.n ?? 0,
    );
    return { HasReference: n > 0 };
  },

  async save(trx, _user, id, f) {
    const v = {
      Vishesh: trimmed(f.Vishesh),
      remark: trimmed(f.remark),
      UplevelKt: int(f.UplevelKt),
      Brief: trimmed(f.Brief),
      VisheshNo: int(f.VisheshNo),
      ShortNm: trimmed(f.ShortNm),
      Notes: trimmed(f.Notes),
      HindiWord: trimmed(f.HindiWord),
      txtAnyaName: trimmed(f.VisheshAnyaNameTran),
      txtAdyaSthapak: trimmed(f.VisheshAdyaSthapakTran),
    };
    const refs = grid(f, 'ReferenceT1');
    const anya = grid(f, 'VisheshAnyaNameTran');
    const adya = grid(f, 'VisheshAdyaSthapakTran');
    const tk = await tableKtOf(trx, 'visheshMast');
    let tid = id;
    if (id > 0) {
      // DeleteTransaction: the rows of every popup that was loaded.
      if (refs)
        await sql`DELETE FROM RefrenceT WHERE Tablekt = ${tk} AND RecordKt = ${id}`.execute(trx);
      if (anya) await sql`DELETE FROM VisheshAnyaNameT WHERE VisheshKt = ${id}`.execute(trx);
      if (adya) await sql`DELETE FROM VisheshAdyaSthapakT WHERE VisheshKt = ${id}`.execute(trx);
      await sql`
        UPDATE visheshMast SET Vishesh = ${v.Vishesh}, remark = ${v.remark}, UplevelKt = ${v.UplevelKt},
          Brief = ${v.Brief}, VisheshNo = ${v.VisheshNo}, ShortNm = ${v.ShortNm}, Notes = ${v.Notes},
          HindiWord = ${v.HindiWord}, txtAnyaName = ${v.txtAnyaName}, txtAdyaSthapak = ${v.txtAdyaSthapak}
        WHERE Tid = ${id}
      `.execute(trx);
    } else {
      tid = await insertWithMaxId(trx, 'visheshMast', 'Tid', (newId) =>
        sql`
          INSERT INTO visheshMast (Tid, Vishesh, remark, UplevelKt, Brief, VisheshNo, ShortNm, Notes, HindiWord,
            txtAnyaName, txtAdyaSthapak)
          VALUES (${newId}, ${v.Vishesh}, ${v.remark}, ${v.UplevelKt}, ${v.Brief}, ${v.VisheshNo}, ${v.ShortNm},
            ${v.Notes}, ${v.HindiWord}, ${v.txtAnyaName}, ${v.txtAdyaSthapak})
        `.execute(trx),
      );
    }
    for (const r of refs ?? []) {
      await sql`
        INSERT INTO RefrenceT (Tablekt, RecordKt, Subhead, WordNm, Example, LibNo, Refplacekt, Pgno, Seq, BookTKt)
        VALUES (${tk}, ${tid}, ${insq(get(r, 'Subhead'))}, ${insq(get(r, 'WordNm'))}, ${insq(get(r, 'Example'))},
          ${text(get(r, 'BookTName'))}, ${int(get(r, 'Refplacekt'))}, ${text(get(r, 'Pgno'))}, ${int(get(r, 'seq'))},
          ${int(get(r, 'BookTKt'))})
      `.execute(trx);
    }
    for (const r of anya ?? []) {
      await sql`
        INSERT INTO VisheshAnyaNameT (VisheshKt, AnyaName, Seq) VALUES (${tid}, ${insq(get(r, 'AnyaName'))}, ${int(get(r, 'seq'))})
      `.execute(trx);
    }
    for (const r of adya ?? []) {
      await sql`
        INSERT INTO VisheshAdyaSthapakT (VisheshKt, AuthorKt, Seq) VALUES (${tid}, ${int(get(r, 'AuthorKt'))}, ${int(get(r, 'seq'))})
      `.execute(trx);
    }
    return tid;
  },

  /**
   * Delete: the desktop calls DeleteTransaction with no tables, so the record's references, anya
   * names and adya sthapaks were left behind; they are deleted with it here.
   */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM RefrenceT WHERE Tablekt = ${await tableKtOf(trx, 'visheshMast')} AND RecordKt = ${id}`.execute(
      trx,
    );
    await sql`DELETE FROM VisheshAnyaNameT WHERE VisheshKt = ${id}`.execute(trx);
    await sql`DELETE FROM VisheshAdyaSthapakT WHERE VisheshKt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM visheshMast WHERE Tid = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  f2: {
    /**
     * txtUplevelKt: with Remark "contactnm" every vishesh (with its remark), otherwise those
     * sharing the loaded record's remark.
     */
    uplevelkt: (db, p) =>
      trimmed(p.remark).toLowerCase() === 'contactnm'
        ? pickListOf(db, sql`SELECT tid, vishesh, remark FROM visheshMast ORDER BY remark, vishesh`)
        : pickListOf(
            db,
            sql`SELECT tid, vishesh FROM visheshMast
                WHERE remark IN (SELECT remark FROM visheshMast WHERE tid = ${int(p.id)})`,
          ),
    /** Utility › Update Uplevel In Selected Records: the vishesh sharing the selection's remarks. */
    'update-uplevel': (db, p) =>
      pickListOf(
        db,
        sql`SELECT tid, vishesh FROM visheshMast
            WHERE remark IN (SELECT remark FROM visheshMast WHERE tid IN ${idList(ids(p.ids))})`,
      ),
  },

  searchOverrides: {
    uplevelwithchild: {
      values: (db) =>
        pickListOf(
          db,
          sql`SELECT DISTINCT a1.Tid, a1.Vishesh FROM visheshMast a INNER JOIN visheshMast a1 ON a.UplevelKt = a1.Tid
              ORDER BY a1.Vishesh`,
        ),
      where: (db, codes) =>
        uplevelWithChild(db, 'visheshMast', 'Tid', 'UplevelKt', codes.map(Number)),
    },
  },

  lists: {
    /** FillTree's dtTree. */
    tree: (db) => pickListOf(db, sql`SELECT Tid, Vishesh, Uplevelkt FROM visheshMast`),
  },

  trans: {
    // TranName "AnyaName", FormName "Vishesh"
    VisheshAnyaNameTran: {},
    // TranName "AdyaSthapak", FormName "Vishesh"
    VisheshAdyaSthapakTran: {
      lookups: {
        adyasthapak: (db) =>
          pickListOf(
            db,
            sql`SELECT authorcokm, txtAuthorName AS Author, Identyty, txtGuru AS Guru, visheshMast.Vishesh AS Sampraday,
                  txtParampara AS Parampara
                FROM authmast INNER JOIN visheshMast ON authmast.Sampradaykt = visheshMast.Tid ORDER BY txtAuthorName`,
          ),
      },
    },
    // lnkColumnReference: ReferenceT1 / Common (its lists are the engine's).
    ReferenceT1: { statements: (db, id) => referenceStatement(db, 'visheshMast', id) },
  },

  actions: {
    async 'update-uplevel'(db, _user, selected, ctx): Promise<ActionResult> {
      const kt = int(ctx.params.uplevelKt);
      if (kt <= 0 || selected.length === 0) return { kind: 'message', message: '' };
      const result = await sql`
        UPDATE visheshMast SET UplevelKt = ${kt} WHERE Tid IN ${idList(selected)} AND Tid <> ${kt}
      `.execute(db);
      return {
        kind: 'message',
        message: Number(result.numAffectedRows ?? 0) > 0 ? 'Records Updated Successfully' : '',
      };
    },
    /**
     * For Selected Record › Author Master / Magazine Master. The desktop compares the vishesh
     * ids with SampradayKt (copied from Sampraday Master); kept as it is.
     */
    'in-use-author': (db, _user, selected) =>
      openInUse(
        db,
        'author-master',
        sql<{
          id: number;
        }>`SELECT authorcokm AS id FROM authmast WHERE SampradayKt IN ${idList(selected)}`,
        'No Records Found',
      ),
    'in-use-magazine': (db, _user, selected) =>
      openInUse(
        db,
        'magazine-master',
        sql<{
          id: number;
        }>`SELECT Magazinekm AS id FROM MagazineM WHERE SampradayKt IN ${idList(selected)}`,
        'No Records Found',
      ),
  },
};
