import { sql } from 'kysely';
import { val } from './bhasha.js';
import { bit } from './book-common.js';
import { trimmed as text } from './master-common.js';
import type { ScreenDefinition } from './registry.js';

/**
 * Master › Apprisal Standard (frmApprisalStandard, ApprisalStandardRepository). Table
 * ApprisalStandard, IDENTITY key ApprisalStandardKm. No Locked column; no work report.
 */
export const apprisalStandard: ScreenDefinition = {
  screen: 'apprisal-standard',
  table: 'ApprisalStandard',
  primaryColumn: 'ApprisalStandardKm',
  lockable: false,

  // ApprisalStandardRepository.GetValidationMessage: the first failure only.
  validate: (f) =>
    val(f.VibhagKt) === 0
      ? 'Please Enter Vibhag'
      : val(f.WorkTypeKt) === 0
        ? 'Please Enter Work Type'
        : '',

  async save(trx, user, id, f) {
    const values = {
      VibhagKt: val(f.VibhagKt),
      WorkTypeKt: val(f.WorkTypeKt),
      PerHourWorkQty: val(f.PerHourWorkQty),
      IsManualEntry: bit(f.IsManualEntry),
      TableName: text(f.TableName),
    };
    if (id > 0) {
      await sql`
        UPDATE ApprisalStandard SET VibhagKt = ${values.VibhagKt}, WorkTypeKt = ${values.WorkTypeKt},
          PerHourWorkQty = ${values.PerHourWorkQty}, IsManualEntry = ${values.IsManualEntry},
          TableName = ${values.TableName}, moduser = ${user.id}, moddate = GETDATE()
        WHERE ApprisalStandardKm = ${id}
      `.execute(trx);
      return id;
    }
    const { rows } = await sql<{ id: number }>`
      INSERT INTO ApprisalStandard (VibhagKt, WorkTypeKt, PerHourWorkQty, IsManualEntry, TableName,
                                    enuser, endate)
      OUTPUT INSERTED.ApprisalStandardKm AS id
      VALUES (${values.VibhagKt}, ${values.WorkTypeKt}, ${values.PerHourWorkQty},
              ${values.IsManualEntry}, ${values.TableName}, ${user.id}, GETDATE())
    `.execute(trx);
    return Number(rows[0]!.id);
  },
};
