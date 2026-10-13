import type { GridRow } from '@gglib/shared';
import { sql } from 'kysely';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Issue › Lab Issue Master (frmLabIssueMaster) through the master engine, plus Book Master's
 * Library No dialog's Request For LabIssue (book-tran, lab-issue-common), rolled back after
 * every test: the request rules, the save round trip, the per-row toolbar guards, the Operator
 * (user type 3) rule and every right-click action.
 */
describe.skipIf(!hasDb)('Lab Issue Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/lab-issue-master';
  const num = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  async function me(agent: request.Agent): Promise<{ id: number; name: string }> {
    const id = (await agent.get('/api/auth/me')).body.user.id as number;
    const { rows } = await sql<{
      uname: string;
    }>`SELECT uname FROM Usecurity WHERE tid = ${id}`.execute(h.trx);
    return { id, name: rows[0]!.uname };
  }

  /** Two free copies (no request ever, not issued) of one book. */
  async function freeCopies(): Promise<{ book: number; tids: number[]; libNos: string[] }> {
    const book = await num(sql<{ v: number }>`
      SELECT TOP 1 t.BookMastkt AS v FROM BookT t
      WHERE ISNULL(t.Libno, '') <> '' AND t.tid NOT IN (SELECT BookTKt FROM LabIssueM)
        AND t.tid NOT IN (SELECT entrcodekt FROM IssueTran)
      GROUP BY t.BookMastkt HAVING COUNT(*) >= 2 ORDER BY t.BookMastkt DESC`);
    const { rows } = await sql<{ tid: number; Libno: string }>`
      SELECT TOP 2 tid, Libno FROM BookT WHERE BookMastkt = ${book} AND ISNULL(Libno, '') <> ''
        AND tid NOT IN (SELECT BookTKt FROM LabIssueM) AND tid NOT IN (SELECT entrcodekt FROM IssueTran)
      ORDER BY tid`.execute(h.trx);
    return { book, tids: rows.map((r) => r.tid), libNos: rows.map((r) => r.Libno) };
  }

  async function add(agent: request.Agent, bookTKt: number, forKt = 0) {
    return agent.post(`${API}/save`).send({ id: 0, fields: { BookTKt: bookTKt, Forkt: forKt } });
  }

  async function row(id: number) {
    const { rows } = await sql<Record<string, unknown>>`
      SELECT * FROM LabIssueM WHERE LabIssueMkm = ${id}`.execute(h.trx);
    return rows[0]!;
  }

  const status = (name: string) =>
    num(sql<{ v: number }>`
      SELECT ColumnMastkm AS v FROM columnmaster WHERE Vibhag = 'LabIssueStatus' AND Name = ${name}`);

  const action = (agent: request.Agent, name: string, ids: number[], params?: object) =>
    agent.post(`${API}/action/${name}`).send({ ids, ...(params ? { params } : {}) });

  it('lists the open requests only, newest first, with the Designer columns', async () => {
    const res = await h.user.post(`${API}/list`).send({});
    expect(res.status).toBe(200);
    const rows = res.body as GridRow[];
    expect(rows.length).toBeGreaterThan(0);
    for (const c of [
      'LabIssueMkm',
      'Type',
      'BookTName',
      'StatusName',
      'enuserName',
      'endate',
      'ForName',
      'DeliveryByName',
      'DeliveryDt',
      'RetbackByName',
      'RetbackDt',
      'TransferuserName',
    ])
      expect(rows[0]).toHaveProperty(c);
    expect(Number(rows[0]!.LabIssueMkm)).toBeGreaterThan(Number(rows.at(-1)!.LabIssueMkm));
    for (const r of rows) {
      const open = !Number(r.DeliveryBykt ?? 0) || !Number(r.RetbackBykt ?? 0);
      expect(open).toBe(true);
    }
  });

  it('adds a Book request, refuses an empty, open or issued item, and edits For', async () => {
    const user = await me(h.user);
    const { tids, libNos } = await freeCopies();

    const none = await add(h.user, 0);
    expect(none.status).toBe(400);
    expect(none.body.message).toBe('Please Enter Lib No');

    const saved = await add(h.user, tids[0]!);
    expect(saved.status).toBe(200);
    const id = saved.body.id as number;
    const r = await row(id);
    expect(r).toMatchObject({ BookTKt: tids[0], Type: 'Book', enuserKt: user.id, Forkt: 0 });
    expect(r.Statuskt).toBe(await status('DlvrPen'));
    expect(saved.body.row.BookTName).toBe(libNos[0]);
    // No work report for an Add (TranKm is 0 when the desktop logs it).
    expect(
      await num(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'LabIssueM' AND RecordNo = ${String(id)}`,
      ),
    ).toBe(0);

    // The same item again: the desktop's swapped "Patrika No - " label for a book.
    const again = await add(h.admin, tids[0]!);
    expect(again.status).toBe(400);
    expect(again.body.message).toBe(
      `Patrika No - ${libNos[0]} already Requested For LabIssue By - ${user.name}`,
    );

    // An issued item.
    const { rows: issued } = await sql<{ tid: number; PName: string; Libno: string }>`
      SELECT TOP 1 i.entrcodekt AS tid, p.PName, t.Libno FROM IssueTran i
      INNER JOIN PartyM p ON i.party_cokt = p.partyMkm INNER JOIN BookT t ON t.tid = i.entrcodekt
      WHERE ISNULL(i.returned, 0) = 0 AND i.entrcodekt NOT IN
        (SELECT BookTKt FROM LabIssueM WHERE ISNULL(RetbackBykt, 0) = 0 AND ISNULL(CancelReq, 0) = 0)
      ORDER BY i.IssueTranKm DESC`.execute(h.trx);
    const busy = await add(h.user, issued[0]!.tid);
    expect(busy.status).toBe(400);
    expect(busy.body.message).toBe(
      `LibNo - ${issued[0]!.Libno} already Requested For Issue By - ${issued[0]!.PName}`,
    );

    // Edit: For changes, moduserKt is the user (the desktop wrote 0); status untouched.
    const party = await num(
      sql<{ v: number }>`SELECT TOP 1 partyMkm AS v FROM PartyM ORDER BY partyMkm`,
    );
    const edit = await h.user
      .post(`${API}/save`)
      .send({ id, fields: { BookTKt: tids[0], Forkt: party } });
    expect(edit.status).toBe(200);
    expect(await row(id)).toMatchObject({ Forkt: party, moduserKt: user.id });
    expect((await row(id)).moddate).not.toBeNull();

    // Edit moves the request to the book's other copy.
    const moved = await h.user
      .post(`${API}/save`)
      .send({ id, fields: { BookTKt: tids[1], Forkt: party } });
    expect(moved.status).toBe(200);
    expect((await row(id)).BookTKt).toBe(tids[1]);
  });

  it('refuses a user with 30-day-old undelivered returns (GetUserNotReturnedBook)', async () => {
    const user = await me(h.user);
    const { tids } = await freeCopies();
    const retPen = await status('RetPen');
    await sql`
      INSERT INTO LabIssueM (BookTKt, enuserKt, endate, Forkt, StatusKt, Type, DeliveryBykt, DeliveryDt)
      VALUES (${tids[1]}, ${user.id}, DATEADD(DAY, -45, GETDATE()), 0, ${retPen}, 'Book', 1, DATEADD(DAY, -40, GETDATE()))
    `.execute(h.trx);
    const res = await add(h.user, tids[0]!);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'You Cannot Issue any Books\r\nPlease Return1  Nos. of 30 days Old Due Books to Issue New Books.',
    );
    // For a party, the party's overdue books count instead.
    const party = await num(sql<{ v: number }>`
      SELECT TOP 1 partyMkm AS v FROM PartyM WHERE partyMkm NOT IN
        (SELECT ISNULL(Forkt, 0) FROM LabIssueM WHERE Statuskt = ${retPen}) ORDER BY partyMkm`);
    expect((await add(h.user, tids[0]!, party)).status).toBe(200);
  });

  it('lists the free LibNos for F2: all in Add mode, the copies of the book in Edit mode', async () => {
    const { tids, libNos } = await freeCopies();
    const id = (await add(h.user, tids[0]!)).body.id as number;
    expect(id).toBeGreaterThan(0);
    const edit = await h.user
      .get(`${API}/f2/BookTKt`)
      .query({ mode: 'Edit', bookTKt: String(tids[0]) });
    expect(edit.body.columns).toEqual(['Tid', 'LibNo', 'BookName']);
    expect(edit.body.rows.map((r: unknown[]) => r[1])).toEqual([libNos[1]]);
    const all = await h.user.get(`${API}/f2/BookTKt`).query({ mode: 'Add', bookTKt: '0' });
    const listed = new Set(all.body.rows.map((r: unknown[]) => Number(r[0])));
    expect(listed.has(tids[1]!)).toBe(true);
    expect(listed.has(tids[0]!)).toBe(false);
  }, 60_000);

  it('delivers and returns for user type 3 only, and guards Delete / Modify per row', async () => {
    const user = await me(h.user);
    const { tids } = await freeCopies();
    const id = (await add(h.user, tids[0]!)).body.id as number;

    // Admin (type 1), Master and AMaster are refused: exactly type 3.
    for (const type of [1, 2, 5]) {
      const other = await h.signIn(type, type === 1);
      const res = await action(other, 'deliver', [id]);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('U have no right to Deliver the Books');
      const ret = await action(other, 'return', [id]);
      expect(ret.status).toBe(403);
      expect(ret.body.message).toBe('U have no right to Return the Books');
    }

    // Returning a request not yet delivered does nothing.
    expect((await action(h.user, 'return', [id])).body).toEqual({
      kind: 'message',
      message: 'No Books Returned',
    });
    const delivered = await action(h.user, 'deliver', [id]);
    expect(delivered.body).toMatchObject({
      kind: 'refreshed',
      message: '1 Books Delivered Successfully',
    });
    expect(delivered.body.rows[0].DeliveryByName).toBe(user.name);
    expect(await row(id)).toMatchObject({
      DeliveryBykt: user.id,
      Statuskt: await status('RetPen'),
    });
    expect((await action(h.user, 'deliver', [id])).body.message).toBe('No Books Delivered');

    // Delivered: no Delete, Modify still allowed.
    const del = await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(del.status).toBe(403);
    expect((await h.user.post(`${API}/edit-lock/${id}`).send({})).status).toBe(204);
    await h.user.delete(`${API}/edit-lock/${id}`).set('Content-Type', 'application/json');

    const returned = await action(h.user, 'return', [id]);
    expect(returned.body).toMatchObject({ message: '1 Books Returned Successfully' });
    expect(await row(id)).toMatchObject({ RetbackBykt: user.id, Statuskt: await status('Closed') });

    // Returned: no Modify either (edit lock and save refused).
    expect((await h.user.post(`${API}/edit-lock/${id}`).send({})).status).toBe(403);
    const save = await h.user
      .post(`${API}/save`)
      .send({ id, fields: { BookTKt: tids[0], Forkt: 0 } });
    expect(save.status).toBe(403);
  });

  it('cancels only the requester’s own requests', async () => {
    const { tids } = await freeCopies();
    const mine = (await add(h.user, tids[0]!)).body.id as number;
    const theirs = (await add(h.admin, tids[1]!)).body.id as number;

    const mixed = await action(h.user, 'cancel-request', [mine, theirs], { confirmed: true });
    expect(mixed.body.message).toBe('only User Requested the Book Only can Cancell the Request');
    expect((await row(theirs)).CancelReq).toBeFalsy();

    expect((await action(h.user, 'cancel-request', [mine])).body.message).toBe('ask-confirm');
    const done = await action(h.user, 'cancel-request', [mine], { confirmed: true });
    expect(done.body).toMatchObject({
      kind: 'refreshed',
      message: '(1) Records Cancelled Successfully',
    });
    expect(await row(mine)).toMatchObject({ CancelReq: true, Statuskt: await status('CancelReq') });

    // A delivered request is not cancelled.
    await action(h.admin, 'deliver', [theirs]);
    expect(
      (await action(h.admin, 'cancel-request', [theirs], { confirmed: true })).body.message,
    ).toBe('No Records Canceled');
  });

  it('transfers the current request to another user, never to the requester', async () => {
    const admin = await me(h.admin);
    const { tids } = await freeCopies();
    const id = (await add(h.user, tids[0]!)).body.id as number;
    expect((await action(h.user, 'transfer-to-me', [id])).body).toEqual({
      kind: 'message',
      message: '',
    });
    const res = await action(h.admin, 'transfer-to-me', [id]);
    expect(res.body).toMatchObject({ kind: 'refreshed', message: 'Book Transferred Successfully' });
    expect(await row(id)).toMatchObject({ Transferuserkt: admin.id });
    expect((await row(id)).TransferDt).not.toBeNull();
  });

  it('updates For(Party) of the undelivered selected rows only, and nothing on cancel', async () => {
    const user = await me(h.user);
    const { tids } = await freeCopies();
    const open = (await add(h.user, tids[0]!)).body.id as number;
    const delivered = (await add(h.user, tids[1]!)).body.id as number;
    await action(h.user, 'deliver', [delivered]);
    const party = await num(sql<{ v: number }>`
      SELECT TOP 1 partyMkm AS v FROM PartyM WHERE partyMkm NOT IN
        (SELECT ISNULL(Forkt, 0) FROM LabIssueM WHERE Statuskt = ${await status('RetPen')}) ORDER BY partyMkm`);

    expect((await action(h.user, 'update-for-party', [delivered])).body.message).toBe(
      'Selected Books Already Delivered',
    );
    expect((await action(h.user, 'update-for-party', [open, delivered])).body.message).toBe(
      'ask-party',
    );
    // The picker cancelled: nothing changes (the desktop cleared For).
    await sql`UPDATE LabIssueM SET Forkt = ${party} WHERE LabIssueMkm = ${open}`.execute(h.trx);
    await action(h.user, 'update-for-party', [open], { party: 0 });
    expect((await row(open)).Forkt).toBe(party);

    await sql`UPDATE LabIssueM SET Forkt = 0, moduserKt = 1 WHERE LabIssueMkm = ${open}`.execute(
      h.trx,
    );
    const res = await action(h.user, 'update-for-party', [open, delivered], { party });
    expect(res.body.kind).toBe('refreshed');
    expect(await row(open)).toMatchObject({ Forkt: party, moduserKt: user.id });
    expect((await row(delivered)).Forkt).toBe(0);
  });

  it('shows all records (capped) and the user’s own, closed ones included', async () => {
    const user = await me(h.user);
    const { tids } = await freeCopies();
    const id = (await add(h.user, tids[0]!)).body.id as number;
    await action(h.user, 'cancel-request', [id], { confirmed: true });

    const all = await action(h.user, 'show-all', []);
    expect(all.body.kind).toBe('list');
    expect(all.body.rows.length).toBe(5000);
    expect(all.body.rows.some((r: GridRow) => r.StatusName === 'Closed')).toBe(true);
    expect(all.body.rows[0].LabIssueMkm).toBe(id);

    const mine = await action(h.user, 'show-mine', []);
    expect(mine.body.rows.map((r: GridRow) => r.LabIssueMkm)).toEqual([id]);
    expect(mine.body.rows[0].enuserKt).toBe(user.id);
  }, 60_000);

  it('sends Book requests to Book Master / the Library No dialog, and Patrika ones to Patrika', async () => {
    const { book, tids } = await freeCopies();
    const id = (await add(h.user, tids[0]!)).body.id as number;
    expect((await action(h.user, 'send-to-book-m', [id])).body).toEqual({
      kind: 'open',
      screen: 'book-master',
      ids: [book],
      emptyMessage: 'No Record Found',
    });
    expect((await action(h.user, 'send-to-book-t', [id])).body).toMatchObject({
      kind: 'open',
      screen: 'book-tran',
      ids: [tids[0]],
    });
    expect((await action(h.user, 'send-to-patrika', [id])).body.message).toBe(
      'Please Select Patrika Record',
    );
    const patrika = await num(sql<{ v: number }>`
      SELECT TOP 1 LabIssueMkm AS v FROM LabIssueM WHERE Type = 'Patrika' ORDER BY LabIssueMkm DESC`);
    const res = await action(h.user, 'send-to-patrika', [patrika, id]);
    expect(res.body).toMatchObject({ kind: 'open', screen: 'patrika' });
    expect(res.body.ids).toHaveLength(1);
    expect((await action(h.user, 'send-to-book-m', [patrika])).body.message).toBe(
      'Please Select Book Record',
    );
  });

  it('keeps a Patrika request on its Patrika (the LibNo list offers BookT items only)', async () => {
    const { tids } = await freeCopies();
    const { rows } = await sql<{ id: number; BookTKt: number }>`
      SELECT TOP 1 LabIssueMkm AS id, BookTKt FROM LabIssueM WHERE Type = 'Patrika'
      ORDER BY LabIssueMkm DESC`.execute(h.trx);
    const p = rows[0]!;
    await sql`UPDATE LabIssueM SET RetbackBykt = NULL WHERE LabIssueMkm = ${p.id}`.execute(h.trx);
    const res = await h.admin
      .post(`${API}/save`)
      .send({ id: p.id, fields: { BookTKt: tids[0], Forkt: 0 } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('LibNo cannot be changed for a Patrika request');
    expect((await row(p.id)).BookTKt).toBe(p.BookTKt);
  });

  it('deletes an undelivered request with the Security password', async () => {
    const { tids } = await freeCopies();
    const id = (await add(h.user, tids[0]!)).body.id as number;
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: 'wrong' })).status,
    ).not.toBe(200);
    const res = await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(res.status).toBeLessThan(300);
    expect(
      await num(sql<{ v: number }>`SELECT COUNT(*) AS v FROM LabIssueM WHERE LabIssueMkm = ${id}`),
    ).toBe(0);
  });

  it('Book Tran’s Request For LabIssue uses the same rules (lab-issue-common)', async () => {
    const user = await me(h.user);
    const { tids, libNos } = await freeCopies();
    const BT = '/api/master/book-tran';
    const first = await h.user
      .post(`${BT}/action/request-lab-issue`)
      .send({ ids: tids, params: { forKt: 0 } });
    expect(first.body).toEqual({ kind: 'message', message: 'Book Issued Successfully' });
    const made = await num(sql<{ v: number }>`
      SELECT COUNT(*) AS v FROM LabIssueM WHERE BookTKt IN (${tids[0]}, ${tids[1]}) AND Type = 'Book'
        AND enuserKt = ${user.id} AND Statuskt = ${await status('DlvrPen')}`);
    expect(made).toBe(2);
    const again = await h.user
      .post(`${BT}/action/request-lab-issue`)
      .send({ ids: [tids[1]], params: { forKt: 0 } });
    expect(again.body.message).toBe(
      `Patrika No - ${libNos[1]} already Requested For LabIssue By - ${user.name}`,
    );
  });
});
