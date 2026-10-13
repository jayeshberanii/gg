import type { GridRow } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * The small Issue-menu screens (Outsider(Visitor) Master, Book Confirmation) through the master
 * engine, rolled back after every test.
 */
describe.skipIf(!hasDb)('small Issue screens via the master engine (integration)', () => {
  const h = useMasterHarness();
  const scalar = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  describe('Outsider(Visitor) Master', () => {
    const API = '/api/master/outsider-master';

    it('is refused to users whose menu hides it', async () => {
      expect((await h.user.post(`${API}/list`).send({})).status).toBe(403);
      expect((await h.admin.post(`${API}/list`).send({})).status).toBe(200);
    });

    it('validates, adds with dates and the work time, edits, and opens its parties', async () => {
      const empty = await h.admin.post(`${API}/save`).send({ id: 0, fields: { partymkt: 0 } });
      expect(empty.body.message).toBe('Please Enter Party Name');

      const [p1, p2] = (
        await sql<{
          id: number;
        }>`SELECT TOP 2 partyMkm AS id FROM PartyM WHERE partyMkm > 0 ORDER BY partyMkm`.execute(
          h.trx,
        )
      ).rows.map((r) => r.id);
      const added = await h.admin.post(`${API}/save`).send({
        id: 0,
        fields: {
          partymkt: p1,
          attendedbykt: p2,
          VisitDate: '2026-10-01',
          DataGivenDt: '2026-10-03',
          WorkTime: '5:30',
          demand: ' માંગ ',
        },
      });
      expect(added.body).toMatchObject({ id: expect.any(Number) });
      const id = added.body.id as number;
      const [row] = (
        await sql<{ v: string; d: string; t: string; demand: string; enuser: number }>`
          SELECT CONVERT(varchar(10), VisitDate, 23) AS v, CONVERT(varchar(10), DataGivenDt, 23) AS d,
                 CONVERT(varchar(5), WorkTime, 108) AS t, demand, enuser
          FROM OutsiderM WHERE OutsiderMkm = ${id}
        `.execute(h.trx)
      ).rows;
      expect(row).toMatchObject({ v: '2026-10-01', d: '2026-10-03', t: '05:30', demand: 'માંગ' });

      // An incomplete mask saves '' (00:00:00), as MaskCompleted = False does on the desktop.
      await h.admin.post(`${API}/save`).send({
        id,
        fields: {
          partymkt: p1,
          attendedbykt: p2,
          VisitDate: '2026-10-01',
          DataGivenDt: '2026-10-03',
          WorkTime: '5:',
        },
      });
      expect(
        (
          await sql<{
            t: string;
          }>`SELECT CONVERT(varchar(8), WorkTime, 108) AS t FROM OutsiderM WHERE OutsiderMkm = ${id}`.execute(
            h.trx,
          )
        ).rows[0]!.t,
      ).toBe('00:00:00');

      const opened = await h.admin.post(`${API}/action/send-to-party`).send({ ids: [id] });
      expect(opened.body).toMatchObject({ kind: 'open', screen: 'party-master' });
      expect([...opened.body.ids].sort()).toEqual([p1, p2].sort());

      expect(
        (await h.admin.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
      ).toBe(204);
    });
  });

  describe('Book Confirmation', () => {
    const API = '/api/master/book-confirmation';
    const sent = async (bySelf: boolean, status = 'Sent') => {
      const by = bySelf
        ? await scalar(sql<{ v: number }>`SELECT MAX(tid) AS v FROM Usecurity`)
        : await scalar(sql<{ v: number }>`SELECT MIN(tid) AS v FROM Usecurity`);
      const { rows } = await sql<{ id: number }>`
        INSERT INTO BookConfirmation (BookTKt, Ank, BookConfirmationStatus, BookSentByKt, BookSentDate)
        OUTPUT INSERTED.BookConfirmationKm AS id
        VALUES ((SELECT MIN(tid) FROM BookT), '1', ${status}, ${by}, GETDATE())
      `.execute(h.trx);
      return rows[0]!.id;
    };

    it('lists Sent rows until Show All Records, and has no Save', async () => {
      const s = await sent(false);
      const r = await sent(false, 'Received');
      const ids = (rows: GridRow[]) => rows.map((x) => x.BookConfirmationKm);
      const list = (await h.user.post(`${API}/list`).send({})).body as GridRow[];
      expect(ids(list)).toContain(s);
      expect(ids(list)).not.toContain(r);
      const all = await h.user.post(`${API}/action/show-all`).send({ ids: [] });
      expect(ids(all.body.rows)).toEqual(expect.arrayContaining([s, r]));

      const save = await h.user.post(`${API}/save`).send({ id: s, fields: {} });
      expect(save.status).toBe(400);
    });

    it('receives only the selected Sent rows', async () => {
      const s = await sent(false);
      const r = await sent(false, 'Received');
      const none = await h.user.post(`${API}/action/receive`).send({ ids: [r] });
      expect(none.body).toEqual({
        kind: 'message',
        message: 'Please select record with Statu as Sent',
      });

      const done = await h.user.post(`${API}/action/receive`).send({ ids: [s, r] });
      expect(done.body.kind).toBe('list');
      const [row] = (
        await sql<{ status: string; recvBy: number | null; at: Date | null }>`
          SELECT BookConfirmationStatus AS status, BookReceivedByKt AS recvBy, BookReceivedDate AS at
          FROM BookConfirmation WHERE BookConfirmationKm = ${s}
        `.execute(h.trx)
      ).rows;
      expect(row!.status).toBe('Received');
      expect(row!.recvBy).toBeGreaterThan(0);
      expect(row!.at).not.toBeNull();
    });

    it('deletes with the Security password', async () => {
      const s = await sent(true);
      expect(
        (await h.user.post(`${API}/delete`).send({ ids: [s], password: SECURITY })).status,
      ).toBe(204);
    });
  });
});
