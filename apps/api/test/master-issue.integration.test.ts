import type { GridRow } from '@gglib/shared';
import { sql } from 'kysely';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';
import { hasDb, ISSUE_REPLACE, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Issue › Issue Master (frmIssueTran) through the master engine, rolled back after every test:
 * the record join, validation, IssueNo and slip numbers, the one-day rule, the same-slip party
 * update, delete guards and every right-click action, including the Issue Slip print.
 */
describe.skipIf(!hasDb)(
  'Issue Master via the master engine (integration)',
  { timeout: 120_000 },
  () => {
    const h = useMasterHarness();
    const API = '/api/master/issue-master';
    const num = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

    const action = (agent: request.Agent, name: string, ids: number[], params?: object) =>
      agent.post(`${API}/action/${name}`).send({ ids, ...(params ? { params } : {}) });

    async function row(id: number) {
      const { rows } = await sql<Record<string, unknown>>`
      SELECT * FROM IssueTran WHERE IssueTranKm = ${id}`.execute(h.trx);
      return rows[0]!;
    }

    /** Two parties and two free (unissued, ordinary series) LibNos. */
    async function fixtures() {
      const { rows: parties } = await sql<{ id: number }>`
      SELECT TOP 2 partyMkm AS id FROM PartyM WHERE partyMkm > 0 AND ISNULL(IsBlocked, 0) = 0
      ORDER BY partyMkm`.execute(h.trx);
      const { rows: books } = await sql<{ tid: number; book: number }>`
      SELECT TOP 2 t.Tid AS tid, t.BookMastkt AS book FROM BookT t
      WHERE ISNULL(t.Libno, '') <> '' AND t.BookMastkt > 0
        AND t.Tid NOT IN (SELECT entrcodekt FROM IssueTran WHERE entrcodekt IS NOT NULL)
      ORDER BY t.Tid DESC`.execute(h.trx);
      return { p1: parties[0]!.id, p2: parties[1]!.id, b1: books[0]!, b2: books[1]! };
    }

    async function me(agent: request.Agent): Promise<number> {
      return (await agent.get('/api/auth/me')).body.user.id as number;
    }

    async function add(agent: request.Agent, fields: Record<string, unknown>) {
      const user = await me(agent);
      return agent.post(`${API}/save`).send({
        id: 0,
        fields: {
          issue_date: '2026-10-01',
          due_date: '2026-12-30',
          returned: 'No',
          SearcherKt: user,
          issue_no: 'I999999999',
          ...fields,
        },
      });
    }

    it('lists the open, not lost rows with the joined Confirm Mark and the lost flag', async () => {
      expect((await h.user.post(`${API}/list`).send({})).status).toBe(200);
      const rows = (await h.user.post(`${API}/list`).send({})).body as GridRow[];
      expect(rows.length).toBeGreaterThan(100);
      expect(rows.length).toBeLessThanOrEqual(10000);
      for (const c of ['IssueTranKm', 'entrcodeName', 'party_coName', 'SlipNo', 'ConfmMarkName'])
        expect(rows[0]).toHaveProperty(c);
      expect(rows[0]).toHaveProperty('HasLost');
      for (const r of rows.slice(0, 500)) {
        expect(r.returned === true || r.returned === 1).toBe(false);
        expect(String(r.ConfmMarkName ?? '').startsWith('Lost')).toBe(false);
      }
      // The record query applies the form's JoinCond (tblSearch reads ConMark.Name).
      const marked = await num(sql<{ v: number }>`
      SELECT TOP 1 IssueTranKm AS v FROM IssueTran WHERE ConfmMarkkt > 0 ORDER BY IssueTranKm DESC`);
      const record = (await h.user.get(`${API}/record/${marked}`)).body as GridRow;
      expect(String(record.ConfmMarkName ?? '')).not.toBe('');
      expect(record).toHaveProperty('Ref_add');
      expect(record).toHaveProperty('endate');
    });

    it('validates with the desktop messages, in order', async () => {
      const { p1, b1 } = await fixtures();
      const msg = async (fields: Record<string, unknown>) =>
        (await h.user.post(`${API}/save`).send({ id: 0, fields })).body.message;
      expect(await msg({})).toBe('Please Enter Party Name');
      expect(await msg({ party_cokt: p1 })).toBe('Please Enter LibNo');
      expect(await msg({ party_cokt: p1, entrcodekt: b1.tid, MobileNo: '12345' })).toBe(
        'Please Enter MobileNo in Proper Format(10 digit)',
      );
      expect(await msg({ party_cokt: p1, PatrikaKt: 5, MobileNo: 'abcdefghij' })).toBe(
        'Please Enter MobileNo in Proper Format(10 digit)',
      );
      expect(await msg({ party_cokt: p1, entrcodekt: b1.tid, MobileNo: '9876543210' })).toBe(
        'Please Enter Searcher',
      );
    });

    it('adds with the IssueNo and a new slip taken in the transaction; a second row joins the slip', async () => {
      const { p1, b1, b2 } = await fixtures();
      const maxNo = await num(sql<{ v: number }>`
      SELECT CAST(MAX(RIGHT(issue_no, 9)) AS int) AS v FROM IssueTran`);
      const nextJ = await num(sql<{ v: number }>`
      SELECT ISNULL(MAX(CAST(SUBSTRING(slipno, 3, LEN(slipno) - 1) AS INTEGER)), 0) + 1 AS v
      FROM IssueTran WHERE slipno LIKE 'J %'`);
      const defaults = (await h.user.get(`${API}/new-defaults`)).body as GridRow;
      expect(defaults.issue_no).toBe(`I${String(maxNo + 1).padStart(9, '0')}`);
      expect(defaults.returned).toBe('No');
      expect(defaults.SearcherKt).toBe(await me(h.user));
      // The generator's number as shown; Save takes it again (here: unchanged).
      const slip = (await action(h.user, 'next-slip', [], { letter: 'J' })).body;
      expect(slip.fields).toEqual({ slipno: `J ${nextJ} `, NewSlip: 'J' });

      const first = await add(h.user, {
        party_cokt: p1,
        entrcodekt: b1.tid,
        BookMastKt: b1.book,
        slipno: `J ${nextJ - 1}`,
        NewSlip: 'J',
        MobileNo: '9876543210',
        returndate: '05/10/2026',
        Adey: true,
        Amout: '12',
      });
      expect(first.status).toBe(200);
      const a = await row(first.body.id);
      expect(a.issue_no).toBe(`I${String(maxNo + 1).padStart(9, '0')}`);
      expect(a.slipno).toBe(`J ${nextJ}`);
      expect(a.Adey).toBe(true);
      expect(a.Amout).toBe(12);
      expect(a.Locked).toBe(false);
      expect(a.enuser).toBe(await me(h.user));
      expect(String((a.returndate as Date).toISOString()).slice(0, 10)).toBe('2026-10-05');
      expect(first.body.row.SlipNo).toBe(`J ${nextJ}`);

      // "Continue With Add New Record?": the slip is kept, the IssueNo is the next one.
      const second = await add(h.user, {
        party_cokt: p1,
        entrcodekt: b2.tid,
        BookMastKt: b2.book,
        slipno: `J ${nextJ}`,
        returned: 'Yes',
      });
      const b = await row(second.body.id);
      expect(b.slipno).toBe(`J ${nextJ}`);
      expect(b.issue_no).toBe(`I${String(maxNo + 2).padStart(9, '0')}`);
      expect(b.Locked).toBe(true);
      expect(b.returned).toBe(true);

      const bad = await add(h.user, { party_cokt: p1, entrcodekt: b2.tid, Confmdt: '31/02/2026' });
      expect(bad.body.message).toBe('Confirm Date is not a valid date');
    });

    it('copies a party change to the rest of the slip, but never across blank slips', async () => {
      const { p1, p2, b1, b2 } = await fixtures();
      const slip = `R 99${Date.now() % 100000}`;
      const a = (await add(h.user, { party_cokt: p1, entrcodekt: b1.tid, slipno: slip })).body.id;
      const b = (await add(h.user, { party_cokt: p1, entrcodekt: b2.tid, slipno: slip })).body.id;
      const record = (await h.user.get(`${API}/record/${a}`)).body as GridRow;
      const user = await me(h.user);
      const edit = await h.user.post(`${API}/save`).send({
        id: a,
        fields: {
          issue_date: '2026-10-01',
          due_date: '2026-12-30',
          returned: 'No',
          SearcherKt: user,
          party_cokt: p2,
          entrcodekt: b1.tid,
          slipno: record.SlipNo,
          Ref_partykt: 0,
        },
      });
      expect(edit.status).toBe(200);
      expect(edit.body.message).toBe(`(1) Records updated for SlipNo -${slip}`);
      expect((await row(b)).party_cokt).toBe(p2);
      expect(Number((await row(a)).moduser)).toBe(user);

      // Blank slips: the other blank-slip rows keep their party.
      const blankOther = await num(sql<{ v: number }>`
      SELECT TOP 1 IssueTranKm AS v FROM IssueTran WHERE slipno = '' ORDER BY IssueTranKm DESC`);
      const otherParty = (await row(blankOther)).party_cokt;
      const c = (await add(h.user, { party_cokt: p1, entrcodekt: b1.tid, slipno: '' })).body.id;
      const blankEdit = await h.user.post(`${API}/save`).send({
        id: c,
        fields: {
          returned: 'No',
          SearcherKt: user,
          party_cokt: p2,
          entrcodekt: b1.tid,
          slipno: '',
        },
      });
      expect(blankEdit.status).toBe(200);
      expect(blankEdit.body.message).toBeUndefined();
      expect((await row(blankOther)).party_cokt).toEqual(otherParty);

      // Ref Party and Slip never change on Edit.
      const ref = await h.user.post(`${API}/save`).send({
        id: c,
        fields: {
          SearcherKt: user,
          party_cokt: p2,
          entrcodekt: b1.tid,
          slipno: '',
          Ref_partykt: p1,
        },
      });
      expect(ref.status).toBe(400);
      expect(ref.body.message).toBe('Ref_partykt cannot be changed for this record');
    });

    it('keeps Party and LibNo of a record older than yesterday (the one-day rule)', async () => {
      const { p1, p2, b1 } = await fixtures();
      const id = (await add(h.user, { party_cokt: p1, entrcodekt: b1.tid })).body.id;
      await sql`UPDATE IssueTran SET endate = DATEADD(DAY, -2, GETDATE()) WHERE IssueTranKm = ${id}`.execute(
        h.trx,
      );
      const user = await me(h.user);
      const base = { SearcherKt: user, party_cokt: p1, entrcodekt: b1.tid, slipno: '' };
      const res = await h.user
        .post(`${API}/save`)
        .send({ id, fields: { ...base, party_cokt: p2 } });
      expect(res.body.message).toBe('party_cokt cannot be changed for this record');
      const ok = await h.user
        .post(`${API}/save`)
        .send({ id, fields: { ...base, remark: 'zq-old-edit', returned: 'No' } });
      expect(ok.status).toBe(200);
      expect((await row(id)).remark).toBe('zq-old-edit');
    });

    it('guards delete with the Security password and the Locked flag', async () => {
      const { p1, b1, b2 } = await fixtures();
      const open = (await add(h.user, { party_cokt: p1, entrcodekt: b1.tid })).body.id;
      const returned = (await add(h.user, { party_cokt: p1, entrcodekt: b2.tid, returned: 'Yes' }))
        .body.id;
      expect(
        (await h.user.post(`${API}/delete`).send({ ids: [open], password: 'wrong' })).status,
      ).toBe(401);
      expect(
        (await h.user.post(`${API}/delete`).send({ ids: [returned], password: SECURITY })).status,
      ).toBe(403);
      expect(
        (await h.user.post(`${API}/delete`).send({ ids: [open], password: SECURITY })).status,
      ).toBe(204);
      expect(
        await num(sql<{ v: number }>`
      SELECT COUNT(*) AS v FROM IssueTran WHERE IssueTranKm = ${open}`),
      ).toBe(0);
    });

    it('returns the selected rows, and replaces their LibNo only behind its own password', async () => {
      const { p1, b1, b2 } = await fixtures();
      const id = (
        await add(h.user, { party_cokt: p1, entrcodekt: b1.tid, BookMastKt: b1.book, Adey: true })
      ).body.id;
      const before = await row(id);

      expect((await action(h.user, 'replace-libno', [id], { password: SECURITY })).status).toBe(
        401,
      );
      const ask = await action(h.user, 'replace-libno', [id], { password: ISSUE_REPLACE });
      expect(ask.body).toEqual({ kind: 'message', message: 'ask-libno' });
      const replaced = await action(h.user, 'replace-libno', [id], {
        password: ISSUE_REPLACE,
        tid: b2.tid,
      });
      expect(replaced.body.kind).toBe('refreshed');
      expect(replaced.body.message).toBe('(1) Records Updated Successfully');
      const after = await row(id);
      expect(Number(after.entrcodekt)).toBe(b2.tid);
      expect(Number(after.BookMastkt)).toBe(b2.book);
      for (const c of ['issue_no', 'Adey', 'MobileNo', 'Locked', 'party_cokt', 'slipno'])
        expect(after[c]).toEqual(before[c]);

      const ret = await action(h.user, 'return-selected', [id]);
      expect(ret.body.message).toBe('1 Records Returned Successfully');
      expect(ret.body.rows[0].IssueTranKm).toBe(id);
      const r = await row(id);
      expect(r.returned).toBe(true);
      expect(r.Locked).toBe(true);
      expect(Number(r.receiverkt ?? r.Receiverkt)).toBe(await me(h.user));
      expect((await action(h.user, 'return-selected', [id])).body).toEqual({
        kind: 'message',
        message: '',
      });
    });

    it('runs the lists, searches, checks and Send To items', async () => {
      const { p1, b1 } = await fixtures();
      const id = (await add(h.user, { party_cokt: p1, entrcodekt: b1.tid, BookMastKt: b1.book }))
        .body.id;

      const all = (await action(h.user, 'show-all', [])).body;
      expect(all.kind).toBe('list');
      expect(all.rows.length).toBe(10000);
      const lost = (await action(h.user, 'show-lost', [])).body.rows as GridRow[];
      expect(lost.length).toBeGreaterThan(0);
      for (const r of lost) expect(String(r.ConfmMarkName)).toMatch(/^Lost/i);
      expect((await action(h.user, 'show-single-copy', [])).body.kind).toBe('list');
      expect((await action(h.user, 'show-multi-copy', [])).body.kind).toBe('list');

      const returned = (await action(h.user, 'search-returned', [], { returned: 1 })).body
        .rows as GridRow[];
      expect(returned.length).toBeGreaterThan(0);
      expect(returned.every((r) => r.returned === true)).toBe(true);
      const range = await action(h.user, 'search-return-date', [], {
        from: '01/01/2020 00:00:00',
        to: '31/12/2020 23:00:00',
      });
      expect(range.body.kind).toBe('list');
      expect(
        (await action(h.user, 'search-return-date', [], { from: '2020-01-01', to: 'x' })).body
          .message,
      ).toBe(
        'Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015 00:00:00 - 31/12/2015 23:00:00)',
      );

      const libno = (await action(h.user, 'check-libno', [], { tid: b1.tid })).body;
      expect(libno.fields).toHaveProperty('lab');
      expect(libno.fields).toHaveProperty('firstBook');
      const counts = (await action(h.user, 'party-counts', [], { party: p1 })).body;
      expect(Object.keys(counts.fields).sort()).toEqual(['lost', 'six']);
      expect(
        (await action(h.user, 'save-six-month', [], { party: p1 })).body.fields,
      ).toHaveProperty('six');
      expect(
        (await action(h.user, 'check-patrika', [], { patrika: 1 })).body.fields,
      ).toHaveProperty('lab');

      const bookm = (await action(h.user, 'send-bookm', [id])).body;
      expect(bookm).toMatchObject({ kind: 'open', screen: 'book-master', ids: [b1.book] });
      expect((await action(h.user, 'send-bookt', [id])).body.ids).toEqual([b1.tid]);
      expect((await action(h.user, 'send-party', [id], { which: 'party' })).body.ids).toEqual([p1]);
      expect((await action(h.user, 'send-party', [id], { which: 'ref' })).body).toMatchObject({
        ids: [],
        emptyMessage: 'No Record Found',
      });

      // The F2 lists: the free LibNos exclude this now-issued one; the slip letters.
      const free = (await h.user.get(`${API}/f2/entrcodekt`)).body;
      expect(free.columns).toEqual(['Tid', 'LibNo', 'BookMastKm', 'BookName']);
      const freeTids = new Set(free.rows.map((r: unknown[]) => r[0]));
      expect(freeTids.has(b1.tid)).toBe(false);
      expect(freeTids.size).toBeGreaterThan(1000);
      const slips = (await h.user.get(`${API}/f2/slipno`)).body;
      expect(slips.rows.map((r: unknown[]) => r[0])).toEqual(['D', 'J', 'R']);
      const mobiles = (await h.user.get(`${API}/f2/mobileno?party=0`)).body;
      expect(mobiles.rows).toEqual([]);
    });

    it('prints the Issue Slip in both modes (provisional layout)', async () => {
      const { p1, b1, b2 } = await fixtures();
      const slip = `D 98${Date.now() % 100000}`;
      const a = (
        await add(h.user, { party_cokt: p1, entrcodekt: b1.tid, BookMastKt: b1.book, slipno: slip })
      ).body.id;
      await add(h.user, {
        party_cokt: p1,
        entrcodekt: b2.tid,
        BookMastKt: b2.book,
        slipno: slip,
        returned: 'Yes',
      });
      const all = (await action(h.user, 'print-slip', [a], { issueOnly: false })).body;
      expect(all.kind).toBe('print');
      expect(all.document.provisional).toMatch(/Provisional/);
      expect(all.document.pages[0].header.fields[0]).toEqual({ label: 'Slip No', value: slip });
      const table = all.document.pages[0].blocks.find((b: { kind: string }) => b.kind === 'table');
      expect(table.rows).toHaveLength(2);
      expect(table.columns.map((c: { header: string }) => c.header)).toContain('Returned');
      const only = (await action(h.user, 'print-slip', [a], { issueOnly: true })).body;
      const t2 = only.document.pages[0].blocks.find((b: { kind: string }) => b.kind === 'table');
      expect(t2.rows).toHaveLength(1);
      // A slip-less row prints alone.
      const c = (await add(h.user, { party_cokt: p1, entrcodekt: b1.tid, slipno: '' })).body.id;
      const alone = (await action(h.user, 'print-slip', [c], { issueOnly: false })).body;
      expect(
        alone.document.pages[0].blocks.find((b: { kind: string }) => b.kind === 'table').rows,
      ).toHaveLength(1);
    });

    it('logs an Edit in the work report, not an Add', async () => {
      const { p1, b1 } = await fixtures();
      const id = (await add(h.user, { party_cokt: p1, entrcodekt: b1.tid })).body.id;
      const count = () =>
        num(sql<{ v: number }>`
        SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'IssueTran' AND RecordNo = ${String(id)}`);
      expect(await count()).toBe(0);
      const user = await me(h.user);
      const res = await h.user.post(`${API}/save`).send({
        id,
        fields: {
          SearcherKt: user,
          party_cokt: p1,
          entrcodekt: b1.tid,
          slipno: '',
          remark: 'zq-wr',
        },
      });
      expect(res.status).toBe(200);
      expect(Boolean(res.body.workReport) || (await count()) > 0).toBe(true);
    });
  },
);
