import { sql } from 'kysely';
import { type Executor, idList, isDuplicateKey } from '../../db/legacy-sql.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();
/** VB Val(): the leading number of the text, or 0. */
export const val = (v: unknown) => {
  const m = String(v ?? '')
    .trim()
    .match(/^[+-]?(\d+\.?\d*|\.\d+)/);
  return m ? Number(m[0]) : 0;
};

async function idsFrom(
  db: Executor,
  query: ReturnType<typeof sql<{ id: number | string | null }>>,
) {
  const { rows } = await query.execute(db);
  return rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n !== 0);
}

/**
 * Master › Bhasha Master (frmBhashaMaster, BhasMastRepository). Table bhasmast, key
 * bhashacokm assigned as max + 1.
 */
export const bhashaMaster: ScreenDefinition = {
  screen: 'bhasha-master',
  table: 'bhasmast',
  primaryColumn: 'bhashacokm',
  lockable: true,

  // BhasMastRepository.GetValidationMessage (its message really does say "Letter Type").
  validate: (f) => (text(f.bhashaname) === '' ? 'Please Enter Letter Type' : ''),

  async save(trx, _user, id, f) {
    const values = {
      bhashaname: text(f.bhashaname),
      bhasa_attr: text(f.bhasa_attr),
      columnNo: val(f.columnNo),
      vibhag: text(f.vibhag),
      // frmBhashaMaster.Save sets shortnm from the Attr box.
      shortnm: text(f.bhasa_attr),
      brief: text(f.brief),
      remark: text(f.remark),
      hindiword: text(f.hindiword),
      UplevelKt: val(f.UplevelKt),
    };
    if (id > 0) {
      await sql`
        UPDATE bhasmast SET bhashaname = ${values.bhashaname}, bhasa_attr = ${values.bhasa_attr},
          columnNo = ${values.columnNo}, vibhag = ${values.vibhag}, shortnm = ${values.shortnm},
          brief = ${values.brief}, remark = ${values.remark}, hindiword = ${values.hindiword},
          UplevelKt = ${values.UplevelKt}
        WHERE bhashacokm = ${id}
      `.execute(trx);
      return id;
    }
    for (let attempt = 0; ; attempt++) {
      const { rows } = await sql<{ id: number }>`
        SELECT ISNULL(MAX(bhashacokm), 0) + 1 AS id FROM bhasmast WITH (UPDLOCK, HOLDLOCK)
      `.execute(trx);
      const newId = Number(rows[0]!.id);
      try {
        await sql`
          INSERT INTO bhasmast (bhashacokm, bhashaname, bhasa_attr, columnNo, vibhag, shortnm, brief,
                                remark, hindiword, UplevelKt)
          VALUES (${newId}, ${values.bhashaname}, ${values.bhasa_attr}, ${values.columnNo},
                  ${values.vibhag}, ${values.shortnm}, ${values.brief}, ${values.remark},
                  ${values.hindiword}, ${values.UplevelKt})
        `.execute(trx);
        return newId;
      } catch (err) {
        if (!isDuplicateKey(err) || attempt >= 2) throw err;
      }
    }
  },

  actions: {
    /**
     * Update Bhasha Count: the UpdateBhashaCount procedure per record. The desktop passes
     * 'Bhasha', which the procedure does not recognise (it tests for 'Bhash'), so the counts
     * never updated there; the web app passes 'Bhash' so they do.
     */
    async 'update-count'(db, _user, ids): Promise<ActionResult> {
      for (const id of ids) await sql`EXEC UpdateBhashaCount ${'Bhash'}, ${String(id)}`.execute(db);
      return { kind: 'refreshed', rows: [] };
    },
    // Show In Use › Kruti Master / Prakashan List / BookM
    async 'in-use-kruti'(db, _user, ids): Promise<ActionResult> {
      return {
        kind: 'open',
        screen: 'kruti-master',
        ids: await idsFrom(
          db,
          sql<{ id: number }>`
          SELECT DISTINCT krutimstkt AS id FROM krutibhasT
          WHERE bhashakt IN ${idList(ids)}`,
        ),
        emptyMessage: 'No Kruti Available for Current Selection',
      };
    },
    async 'in-use-prakashan-list'(db, _user, ids): Promise<ActionResult> {
      return {
        kind: 'open',
        screen: 'book-master-anya-bhandar',
        ids: await idsFrom(
          db,
          sql<{ id: number }>`
          SELECT DISTINCT prakshnlistnokt AS id FROM PrakListBhashaT
          WHERE Bhashakt IN ${idList(ids)}`,
        ),
        emptyMessage: 'No Prakashan Available for Current Selection',
      };
    },
    async 'in-use-book'(db, _user, ids): Promise<ActionResult> {
      return {
        kind: 'open',
        screen: 'book-master',
        ids: await idsFrom(
          db,
          sql<{ id: number }>`
          SELECT DISTINCT prakshnokt AS id FROM praksnBhashaT
          WHERE bhashakt IN ${idList(ids)}`,
        ),
        emptyMessage: 'No Book Available for Current Selection',
      };
    },
  },
};
