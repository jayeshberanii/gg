import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { idList } from '../../db/legacy-sql.js';
import { queryLongRunning } from '../../db/long-running.js';
import { normalizeValue } from '../values.js';
import { val } from './bhasha.js';
import { signBetween } from './book-common.js';
import { trimmed as text } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Master › Parishisht Namsuchi (frmParishistNamSuchi, ParishistNamSuchiRepository). Table
 * ParishistNamSuchiM, IDENTITY key ParishistNamSuchiKm. No Locked column.
 */
export const parishishtNamsuchi: ScreenDefinition = {
  screen: 'parishisht-namsuchi',
  table: 'ParishistNamSuchiM',
  primaryColumn: 'ParishistNamSuchiKm',
  lockable: false,
  // FillList: ListGridData(…, "ParishistPublicationKt Desc,Name asc").
  listOrderBy: 'ParishistPublicationKt DESC, Name ASC',
  // Save calls clsCom1.insertworkreports; Delete does not.
  workReport: true,
  workReportOn: { delete: false },

  // GetValidationMessage: both messages, one per line.
  validate(f) {
    let message = val(f.ParishistPublicationKt) === 0 ? '- Publication is Mandatory' : '';
    if (text(f.Name) === '') message = signBetween(message, '- Name is Mandatory', '\r\n');
    return message;
  },

  async save(trx, user, id, f) {
    const publication = val(f.ParishistPublicationKt);
    const name = text(f.Name);
    if (id > 0) {
      await sql`
        UPDATE ParishistNamSuchiM SET ParishistPublicationKt = ${publication}, Name = ${name},
          moduser = ${user.id}, moddate = GETDATE()
        WHERE ParishistNamSuchiKm = ${id}
      `.execute(trx);
      return id;
    }
    const { rows } = await sql<{ id: number }>`
      INSERT INTO ParishistNamSuchiM (ParishistPublicationKt, Name, enuser, endate)
      OUTPUT INSERTED.ParishistNamSuchiKm AS id
      VALUES (${publication}, ${name}, ${user.id}, GETDATE())
    `.execute(trx);
    return Number(rows[0]!.id);
  },

  actions: {
    /**
     * Print Report › Print Parishisht: `exec PrintParishistNamSuchi <current row's
     * publication>`, sent to Excel. The procedure matches every name against praksnVisheshT
     * with LIKE and runs for minutes; the desktop reads it with no command timeout, so it runs
     * on its own connection without one (and so outside any transaction).
     */
    async 'print-parishisht'(db, _user, ids, ctx): Promise<ActionResult> {
      const { rows } = await sql<{ kt: number | null }>`
        SELECT ParishistPublicationKt AS kt FROM ParishistNamSuchiM
        WHERE ParishistNamSuchiKm IN ${idList(ids.slice(0, 1))}
      `.execute(db);
      if (!rows[0]) throw new BadRequestException('Select a record first');
      const publication = Math.trunc(Number(rows[0].kt ?? 0));
      const result = await queryLongRunning(ctx.env, `EXEC PrintParishistNamSuchi ${publication}`);
      return {
        kind: 'table',
        title: 'Parishisht',
        columns: result.columns,
        rows: result.rows.map((r) => r.map(normalizeValue)),
      };
    },
  },
};
