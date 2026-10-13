import { sql } from 'kysely';
import { idList } from '../../db/legacy-sql.js';
import { val } from './bhasha.js';
import { insertWithMaxId, openInUse, trimmed as text } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Master › Lipi Master (frmLipiMaster, LipiMastRepository). Table lipimast, key lipicodekm
 * assigned as max + 1. The form is frmBhashaMaster's twin.
 */
export const lipiMaster: ScreenDefinition = {
  screen: 'lipi-master',
  table: 'lipimast',
  primaryColumn: 'lipicodekm',
  lockable: true,

  // LipiMastRepository.GetValidationMessage
  validate: (f) => (text(f.lipiname) === '' ? 'Please Enter Lipi Name' : ''),

  async save(trx, _user, id, f) {
    const values = {
      lipiname: text(f.lipiname),
      lipi_attr: text(f.lipi_attr),
      columnNo: val(f.columnNo),
      vibhag: text(f.vibhag),
      // frmLipiMaster.Save sets shortnm from the Attr box.
      shortnm: text(f.lipi_attr),
      brief: text(f.brief),
      remark: text(f.remark),
      hindiword: text(f.hindiword),
      UplevelKt: val(f.Uplevelkt),
    };
    if (id > 0) {
      await sql`
        UPDATE lipimast SET lipiname = ${values.lipiname}, lipi_attr = ${values.lipi_attr},
          columnNo = ${values.columnNo}, vibhag = ${values.vibhag}, shortnm = ${values.shortnm},
          brief = ${values.brief}, remark = ${values.remark}, hindiword = ${values.hindiword},
          UplevelKt = ${values.UplevelKt}
        WHERE lipicodekm = ${id}
      `.execute(trx);
      return id;
    }
    return insertWithMaxId(trx, 'lipimast', 'lipicodekm', (newId) =>
      sql`
        INSERT INTO lipimast (lipicodekm, lipiname, lipi_attr, columnNo, vibhag, shortnm, brief,
                              remark, hindiword, UplevelKt)
        VALUES (${newId}, ${values.lipiname}, ${values.lipi_attr}, ${values.columnNo},
                ${values.vibhag}, ${values.shortnm}, ${values.brief}, ${values.remark},
                ${values.hindiword}, ${values.UplevelKt})
      `.execute(trx),
    );
  },

  actions: {
    /** Update Lipi Count: the UpdateBhashaCount procedure per record ('Lipi' is one it knows). */
    async 'update-count'(db, _user, ids): Promise<ActionResult> {
      for (const id of ids) await sql`EXEC UpdateBhashaCount ${'Lipi'}, ${String(id)}`.execute(db);
      return { kind: 'refreshed', rows: [] };
    },
    // Show In Use › Prakashan List / BookM
    'in-use-prakashan-list': (db, _user, ids) =>
      openInUse(
        db,
        'book-master-anya-bhandar',
        sql<{ id: number }>`SELECT DISTINCT prakshnlistnokt AS id FROM PrakListLipiT
          WHERE Lipikt IN ${idList(ids)}`,
        'No Prakashan Available for Current Selection',
      ),
    'in-use-book': (db, _user, ids) =>
      openInUse(
        db,
        'book-master',
        sql<{ id: number }>`SELECT DISTINCT prakashankt AS id FROM praksnLipiT
          WHERE lippikt IN ${idList(ids)}`,
        'No Book Available for Current Selection',
      ),
  },
};
