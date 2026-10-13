import { sql } from 'kysely';
import { idList } from '../../db/legacy-sql.js';
import { val } from './bhasha.js';
import { bit } from './book-common.js';
import { insertWithMaxId, openInUse, trimmed as text } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Master › Author Type Master (frmAuthorType, AuthTypeRepository). Table authtype, key
 * authtycokm assigned as max + 1. No Locked column, so no Ctrl+L / Ctrl+U (the desktop wires
 * them and they fail).
 */
export const authorTypeMaster: ScreenDefinition = {
  screen: 'author-type-master',
  table: 'authtype',
  primaryColumn: 'authtycokm',
  lockable: false,

  // AuthTypeRepository.GetValidationMessage
  validate: (f) => (text(f.authortype) === '' ? 'Please Enter AuthorType' : ''),

  /**
   * AuthTypeRepository.Save. The Brief box (brif) is loaded and shown but the repository's
   * INSERT / UPDATE never write it, so an edited Brief is dropped, as on the desktop.
   * v3.4.3.1: authtyattr (Attribute) is no longer written; existing values stay as they are.
   */
  async save(trx, _user, id, f) {
    const values = {
      authortype: text(f.authortype),
      remark: text(f.remark),
      short_name: text(f.short_name),
      uplevalKt: val(f.uplevalkt),
      hindiword: text(f.hindiword),
      IsPrint: bit(f.IsPrint),
    };
    if (id > 0) {
      await sql`
        UPDATE authtype SET authortype = ${values.authortype},
          remark = ${values.remark}, short_name = ${values.short_name},
          uplevalKt = ${values.uplevalKt}, hindiword = ${values.hindiword}, IsPrint = ${values.IsPrint}
        WHERE authtycokm = ${id}
      `.execute(trx);
      return id;
    }
    return insertWithMaxId(trx, 'authtype', 'authtycokm', (newId) =>
      sql`
        INSERT INTO authtype (authtycokm, authortype, remark, short_name, uplevalKt,
                              hindiword, IsPrint)
        VALUES (${newId}, ${values.authortype}, ${values.remark},
                ${values.short_name}, ${values.uplevalKt}, ${values.hindiword}, ${values.IsPrint})
      `.execute(trx),
    );
  },

  actions: {
    /** Show Records Not Used In Book: FillList with the ids AUTHTRAN never names. */
    async 'not-used-in-book'(_db, _user, _ids, ctx): Promise<ActionResult> {
      return {
        kind: 'list',
        rows: await ctx.list(sql`authtycokm NOT IN (SELECT AUTHTYCOKT FROM AUTHTRAN)`),
      };
    },
    /**
     * Update AuthorType Count: `exec UpdateBhashaCount 'AuthType', id`. The procedure has no
     * 'AuthType' branch, so nothing changes — on the desktop too. Kept as the desktop calls it.
     */
    async 'update-count'(db, _user, ids): Promise<ActionResult> {
      for (const id of ids)
        await sql`EXEC UpdateBhashaCount ${'AuthType'}, ${String(id)}`.execute(db);
      return { kind: 'refreshed', rows: [] };
    },
    // Show In Use › Kruti Master / Prakashan List / Author Master / BookM › Author, Magazine Vishesh
    // The desktop matches krutiauthT.authorcokt (an author id) against the author type ids;
    // kept as it is (krutiauthT.authtycokt would be the author type).
    'in-use-kruti': (db, _user, ids) =>
      openInUse(
        db,
        'kruti-master',
        sql<{ id: number }>`SELECT DISTINCT krutimstkt AS id FROM krutiauthT
          WHERE authorcokt IN ${idList(ids)}`,
        'No Kruti Available for Current Selection',
      ),
    'in-use-prakashan-list': (db, _user, ids) =>
      openInUse(
        db,
        'book-master-anya-bhandar',
        sql<{ id: number }>`SELECT DISTINCT prakshnlistnokm AS id FROM praklistauthortype
          WHERE authortype IN ${idList(ids)}`,
        'No Prakashan Available for Current Selection',
      ),
    'in-use-author': (db, _user, ids) =>
      openInUse(
        db,
        'author-master',
        sql<{ id: number }>`SELECT DISTINCT AUTHORCOKT AS id FROM AuthMSubT
          WHERE authtypekt IN ${idList(ids)}`,
        'No Author Available for Current Selection',
      ),
    'in-use-book-author': (db, _user, ids) =>
      openInUse(
        db,
        'book-master',
        sql<{ id: number }>`SELECT DISTINCT prakashannokt AS id FROM PraksnAuthorAuthTypeT
          WHERE authortypekt IN ${idList(ids)}`,
        'No Record Found',
      ),
    'in-use-book-magazine-vishesh': (db, _user, ids) =>
      openInUse(
        db,
        'book-master',
        sql<{ id: number }>`SELECT DISTINCT BookMastKt AS id FROM BookMagazineVisheshAuthorTypeT
          WHERE AuthorTypeKt IN ${idList(ids)}`,
        'No Record Found',
      ),
  },
};
