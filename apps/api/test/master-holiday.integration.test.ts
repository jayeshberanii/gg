import type { GridRow } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Employee › Holiday (frmHolidayM) through the master engine, rolled back after every test. */
describe.skipIf(!hasDb)('Holiday via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/holiday';
  const thisYear = new Date().getFullYear();

  it('validates, adds with the identity and the enuser, and edits with the moduser', async () => {
    const empty = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { HolidayName: ' ', HolidayDate: `${thisYear}-01-14` } });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Please Enter Holiday Name');

    const added = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { HolidayName: ' Uttarayan ', HolidayDate: `${thisYear}-01-14` } });
    expect(added.status).toBe(200);
    const id = added.body.id as number;
    expect(added.body.row).toMatchObject({ HolidayMKm: id, HolidayName: 'Uttarayan' });
    const [row] = (
      await sql<{ d: string; enuser: number; moduser: number | null }>`
        SELECT CONVERT(varchar(10), HolidayDate, 23) AS d, enuser, moduser FROM HolidayM
        WHERE HolidayMKm = ${id}
      `.execute(h.trx)
    ).rows;
    expect(row).toMatchObject({ d: `${thisYear}-01-14`, moduser: null });
    expect(row!.enuser).toBeGreaterThan(0);

    const edited = await h.user
      .post(`${API}/save`)
      .send({ id, fields: { HolidayName: 'Makar Sankranti', HolidayDate: `${thisYear}-01-15` } });
    expect(edited.body.row).toMatchObject({ HolidayMKm: id, HolidayName: 'Makar Sankranti' });
    const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
    expect(String(record.HolidayDate)).toMatch(new RegExp(`^${thisYear}-01-15`));
    expect(record.moduser).toBeGreaterThan(0);
  });

  it("lists this year's holidays until Show All Records", async () => {
    const mk = async (name: string, date: string) =>
      (
        await h.user
          .post(`${API}/save`)
          .send({ id: 0, fields: { HolidayName: name, HolidayDate: date } })
      ).body.id as number;
    const now = await mk('this year', `${thisYear}-08-15`);
    const old = await mk('old year', `${thisYear - 3}-08-15`);

    const ids = (rows: GridRow[]) => rows.map((r) => r.HolidayMKm);
    const list = (await h.user.post(`${API}/list`).send({})).body as GridRow[];
    expect(ids(list)).toContain(now);
    expect(ids(list)).not.toContain(old);

    // A StrId list (the row just saved) is not limited to this year.
    const byId = (await h.user.post(`${API}/list`).send({ ids: [old] })).body as GridRow[];
    expect(ids(byId)).toEqual([old]);

    const all = await h.user.post(`${API}/action/show-all`).send({ ids: [] });
    expect(all.body.kind).toBe('list');
    expect(ids(all.body.rows)).toEqual(expect.arrayContaining([now, old]));
  });

  it('deletes only with the Security password', async () => {
    const id = (
      await h.user
        .post(`${API}/save`)
        .send({ id: 0, fields: { HolidayName: 'gone', HolidayDate: `${thisYear}-02-02` } })
    ).body.id as number;
    expect((await h.user.post(`${API}/delete`).send({ ids: [id], password: 'wrong' })).status).toBe(
      401,
    );
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    const left = await sql<{
      n: number;
    }>`SELECT COUNT(*) AS n FROM HolidayM WHERE HolidayMKm = ${id}`.execute(h.trx);
    expect(left.rows[0]!.n).toBe(0);
  });
});
