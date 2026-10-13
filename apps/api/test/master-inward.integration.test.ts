import type { GridRow } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Issue › Inward Master (frmInwordMaster) through the master engine, rolled back after every
 * test: validation, the per-Vibhag serial number, the owner lock, the delete guards and the
 * Send To actions.
 */
describe.skipIf(!hasDb)('Inward Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/inward-master';
  const scalar = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  /** A Vibhag (columnmaster Vibhag='vibhag') and its next VibhagSrNo. */
  async function vibhag() {
    const id = await scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 c.ColumnMastkm AS v FROM columnmaster c INNER JOIN InwordM i ON i.Vibhagkt = c.ColumnMastkm
          WHERE c.Vibhag = 'vibhag' GROUP BY c.ColumnMastkm ORDER BY COUNT(*) DESC`,
    );
    const next = await scalar(
      sql<{
        v: number;
      }>`SELECT ISNULL(MAX(VibhagSrNo), 0) + 1 AS v FROM InwordM WHERE Vibhagkt = ${id}`,
    );
    return { id, next };
  }

  const base = (vibhagkt: number) => ({
    Vibhagkt: vibhagkt,
    InOut: 'OUT',
    ToReturned: 'Yes',
    returned: 'No',
    indate: '2026-10-02',
    returndate: '2026-10-05',
    subject: ' zq-inward ',
    paidamount: '250',
    VibhagSrNo: '',
  });

  async function meId(agent: typeof h.user): Promise<number> {
    return (await agent.get('/api/auth/me')).body.user.id as number;
  }

  it('is open to every user and lists the Designer columns', async () => {
    const res = await h.user.post(`${API}/list`).send({ ids: [22510] });
    expect(res.status).toBe(200);
    const row = (res.body as GridRow[])[0]!;
    for (const c of ['inwordkm', 'VibhagName', 'VibhagSrNo', 'InOut', 'InDat', 'subject'])
      expect(row).toHaveProperty(c);
    expect(['IN', 'OUT']).toContain(row.InOut);
  });

  it('validates with the desktop messages', async () => {
    const v = await vibhag();
    const none = await h.user.post(`${API}/save`).send({ id: 0, fields: { Vibhagkt: 0 } });
    expect(none.status).toBe(400);
    expect(none.body.message).toBe('Please Enter Vibhag');

    const taken = await scalar(
      sql<{
        v: number;
      }>`SELECT MAX(VibhagSrNo) AS v FROM InwordM WHERE Vibhagkt = ${v.id}`,
    );
    const dup = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { ...base(v.id), VibhagSrNo: String(taken) } });
    expect(dup.body.message).toBe(`VibhagSrNo ${taken} is already assigned`);

    const long = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { ...base(v.id), refno: 'x'.repeat(151) } });
    expect(long.body.message).toBe('Ref No cannot be longer than 150 characters');
  });

  it('adds with the next VibhagSrNo, edits, logs the work report and computes defaults', async () => {
    const v = await vibhag();
    expect((await h.user.get(`${API}/new-defaults?vibhagkt=${v.id}`)).body).toEqual({
      VibhagSrNo: v.next,
    });
    const picked = await h.user
      .post(`${API}/action/next-vibhag-srno`)
      .send({ ids: [], params: { vibhagkt: v.id } });
    expect(picked.body).toMatchObject({ kind: 'form', fields: { VibhagSrNo: v.next } });

    const added = await h.user.post(`${API}/save`).send({ id: 0, fields: base(v.id) });
    expect(added.status).toBe(200);
    const id = added.body.id as number;
    const me = await meId(h.user);
    const [row] = (
      await sql<{
        sr: number;
        io: boolean;
        tr: boolean;
        rt: boolean;
        ind: string;
        rd: string;
        subject: string;
        paid: number;
        enuser: number;
        endate: Date | null;
      }>`SELECT VibhagSrNo AS sr, InOut AS io, ToReturned AS tr, returned AS rt,
               CONVERT(varchar(10), indate, 23) AS ind, CONVERT(varchar(10), returndate, 23) AS rd,
               subject, paidamount AS paid, enuser, endate
          FROM InwordM WHERE inwordkm = ${id}`.execute(h.trx)
    ).rows;
    expect(row).toMatchObject({
      sr: v.next,
      io: true,
      tr: true,
      rt: false,
      ind: '2026-10-02',
      // dtpreturndate is saved although Returned is No.
      rd: '2026-10-05',
      subject: 'zq-inward',
      paid: 250,
      enuser: me,
    });
    expect(row!.endate).not.toBeNull();
    expect(
      await scalar(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'InwordM' AND RecordNo = ${String(id)}`,
      ),
    ).toBeGreaterThan(0);

    const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
    expect(record).toMatchObject({ WorkGivenTran: 0, InOut: true, returned: false });

    const edited = await h.user
      .post(`${API}/save`)
      .send({ id, fields: { ...base(v.id), VibhagSrNo: String(v.next), InOut: 'IN' } });
    expect(edited.status).toBe(200);
    const [after] = (
      await sql<{
        io: boolean;
        moduser: number;
      }>`SELECT InOut AS io, moduser FROM InwordM WHERE inwordkm = ${id}`.execute(h.trx)
    ).rows;
    expect(after).toMatchObject({ io: false, moduser: me });
  });

  it('owner lock: a non-admin cannot change a record someone else entered', async () => {
    const v = await vibhag();
    const id = (await h.user.post(`${API}/save`).send({ id: 0, fields: base(v.id) })).body
      .id as number;
    const other = await h.signIn(3);
    expect((await other.post(`${API}/edit-lock/${id}`).send({})).status).toBe(403);
    expect((await other.post(`${API}/save`).send({ id, fields: base(v.id) })).status).toBe(403);
    expect((await other.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status).toBe(
      403,
    );
    // Anyone may still add.
    expect((await other.post(`${API}/save`).send({ id: 0, fields: base(v.id) })).status).toBe(200);
    // The owner and an admin may edit.
    expect((await h.user.post(`${API}/edit-lock/${id}`).send({})).status).toBe(204);
    await h.user.delete(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json');
    expect((await h.admin.post(`${API}/edit-lock/${id}`).send({})).status).toBe(204);
    await h.admin.delete(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json');

    // Locked = 1 locks it for the owner too.
    await sql`UPDATE InwordM SET Locked = 1 WHERE inwordkm = ${id}`.execute(h.trx);
    expect((await h.user.post(`${API}/save`).send({ id, fields: base(v.id) })).status).toBe(403);
  });

  it('refuses to delete an inward in use, and deletes one that is not', async () => {
    const v = await vibhag();
    const id = (await h.user.post(`${API}/save`).send({ id: 0, fields: base(v.id) })).body
      .id as number;
    const me = await meId(h.user);
    await sql`
      INSERT INTO WorkGivenM (Givenbykt, enuser, endate, inwordkt) VALUES (${me}, ${me}, GETDATE(), ${id})
    `.execute(h.trx);
    const workGiven = await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(workGiven.status).toBe(409);
    expect(workGiven.body.message).toBe('Record is in used in Work Assign Master');
    expect((await h.user.get(`${API}/record/${id}`)).body.WorkGivenTran).toBe(1);

    const opened = await h.user.post(`${API}/action/work-given-of`).send({ ids: [id] });
    expect(opened.body).toMatchObject({ kind: 'open', screen: 'work-given-master' });
    expect(opened.body.ids).toHaveLength(1);
    await sql`DELETE FROM WorkGivenM WHERE inwordkt = ${id}`.execute(h.trx);

    const inBookT = await h.admin.post(`${API}/delete`).send({ ids: [22510], password: SECURITY });
    expect(inBookT.status).toBe(409);
    expect(inBookT.body.message).toBe('Record is in used in BookT');

    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: 'wrong' })).status,
    ).not.toBe(204);
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    expect(
      await scalar(sql<{ v: number }>`SELECT COUNT(*) AS v FROM InwordM WHERE inwordkm = ${id}`),
    ).toBe(0);
  });

  it('runs the Send To actions', async () => {
    // 22510 has library numbers and a letter; a new inward has neither.
    const books = await h.user.post(`${API}/action/send-to-book-m`).send({ ids: [22510] });
    expect(books.body).toMatchObject({ kind: 'open', screen: 'book-master' });
    expect(books.body.ids.length).toBeGreaterThan(0);
    const tids = await h.user.post(`${API}/action/send-to-book-t`).send({ ids: [22510] });
    expect(tids.body).toMatchObject({ kind: 'open', screen: 'book-tran' });
    expect(tids.body.ids.length).toBeGreaterThan(0);
    const letters = await h.user.post(`${API}/action/send-to-letter-bhet`).send({ ids: [22510] });
    expect(letters.body).toMatchObject({ kind: 'open', screen: 'letter-bhet' });
    expect(letters.body.ids.length).toBeGreaterThan(0);
    expect(letters.body.newRecord).toBeUndefined();

    const v = await vibhag();
    const parties = (
      await sql<{
        id: number;
      }>`SELECT TOP 2 partyMkm AS id FROM PartyM WHERE partyMkm > 0 ORDER BY partyMkm`.execute(
        h.trx,
      )
    ).rows.map((r) => r.id);
    const id = (
      await h.user.post(`${API}/save`).send({
        id: 0,
        fields: { ...base(v.id), forkt: parties[0], fromkt: parties[1] },
      })
    ).body.id as number;
    const party = await h.user.post(`${API}/action/send-to-party`).send({ ids: [id] });
    expect(party.body).toMatchObject({ kind: 'open', screen: 'party-master' });
    expect([...party.body.ids].sort()).toEqual([...parties].sort());

    for (const action of ['send-to-book-m', 'send-to-book-t', 'send-to-work-given']) {
      const none = await h.user.post(`${API}/action/${action}`).send({ ids: [id] });
      expect(none.body).toMatchObject({ kind: 'open', ids: [], emptyMessage: 'No Record Found' });
    }

    // No letter yet: Letter Bhet opens in Add mode with the current row's inward pre-filled.
    const vibhagName = (
      await sql<{
        n: string;
      }>`SELECT Name AS n FROM columnmaster WHERE ColumnMastkm = ${v.id}`.execute(h.trx)
    ).rows[0]!.n;
    const fresh = await h.user
      .post(`${API}/action/send-to-letter-bhet`)
      .send({ ids: [id], params: { currentId: id } });
    expect(fresh.body).toEqual({
      kind: 'open',
      screen: 'letter-bhet',
      ids: [],
      emptyMessage: '',
      newRecord: { inwordkt: id, InwordName: vibhagName },
    });
  });
});
