import { sql } from 'kysely';
import { pickerDate, trimmed as text } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Employee › Holiday (frmHolidayM, HolidayMRepository). Table HolidayM, IDENTITY key HolidayMKm.
 * No Locked column (the form's Ctrl+L / U would fail), no work report, Copy and Work Report off.
 * The grid shows this year's holidays (DefaultCond) until "Show All Records".
 */
export const holiday: ScreenDefinition = {
  screen: 'holiday',
  table: 'HolidayM',
  primaryColumn: 'HolidayMKm',
  lockable: false,
  defaultCondition: sql`DATEPART(YEAR, HolidayDate) = DATEPART(YEAR, GETDATE())`,

  // HolidayMRepository.GetValidationMessage. The date check never fires on the desktop, whose
  // picker always holds a date; it guards the API.
  validate: (f) =>
    text(f.HolidayName) === ''
      ? 'Please Enter Holiday Name'
      : pickerDate(f.HolidayDate) === null
        ? 'Please Enter Holiday Date'
        : '',

  async save(trx, user, id, f) {
    const name = text(f.HolidayName);
    const date = pickerDate(f.HolidayDate);
    if (id > 0) {
      await sql`
        UPDATE HolidayM SET HolidayDate = ${date}, HolidayName = ${name}, moduser = ${user.id},
          moddate = GETDATE()
        WHERE HolidayMKm = ${id}
      `.execute(trx);
      return id;
    }
    const { rows } = await sql<{ id: number }>`
      INSERT INTO HolidayM (HolidayDate, HolidayName, enuser, endate)
      OUTPUT INSERTED.HolidayMKm AS id
      VALUES (${date}, ${name}, ${user.id}, GETDATE())
    `.execute(trx);
    return Number(rows[0]!.id);
  },

  actions: {
    /** Show All Records: FillList without DefaultCond. */
    async 'show-all'(_db, _user, _ids, ctx): Promise<ActionResult> {
      return { kind: 'list', rows: await ctx.list(sql`1 = 1`) };
    },
  },
};
