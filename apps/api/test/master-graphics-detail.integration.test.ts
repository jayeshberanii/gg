import type { GridRow, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { masterRowsForDetail } from '../src/master/screens/graphics-master.js';
import { GRAPHICS_LOCK, hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Graphics › Graphics Detail (frmGraphicsDetail) through the master engine, rolled back after
 * every test: validation, the save with its popups (per-type word replace, the Subject flags,
 * Other LibNo), the multi-row delete, Lock / Unlock, every DB-only menu tool, and the windows
 * Graphics Master and Patrika open on it.
 */
describe.skipIf(!hasDb)('Graphics Detail via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/graphics-detail';
  const n = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  /** A Graphics Master record of a book nobody has requested or issued, made for the test. */
  async function parent() {
    const book = (
      await sql<{ tid: number; libno: string }>`
        SELECT TOP 1 T.Tid AS tid, T.Libno AS libno FROM BookT T
        WHERE ISNULL(T.LibNo, '') <> ''
          AND NOT EXISTS (SELECT 1 FROM LabIssueM L WHERE L.BookTKt = T.Tid)
          AND NOT EXISTS (SELECT 1 FROM IssueTran I WHERE I.entrcodekt = T.Tid AND ISNULL(I.returned, 0) = 0)
        ORDER BY T.Tid DESC`.execute(h.trx)
    ).rows[0]!;
    const { rows } = await sql<{ id: number }>`
      INSERT INTO GraphicBKM (recno, bkname, BookTKt, color, grade, enuser, endate)
      OUTPUT INSERTED.graphicBkm AS id VALUES (4321, N'zq-parent', ${book.tid}, 'Blue', 'B', 1, GETDATE())
    `.execute(h.trx);
    return { id: Number(rows[0]!.id), book };
  }

  /** Two words of a type, and two subjects. */
  async function words(type: string) {
    return (
      await sql<{ v: number; n: string }>`
        SELECT TOP 2 GrwordMkm AS v, wordnm AS n FROM GrwordM WHERE typenm = ${type} ORDER BY GrwordMkm`.execute(
        h.trx,
      )
    ).rows;
  }
  async function subjects() {
    return (
      await sql<{ v: number; n: string }>`
        SELECT TOP 2 Grvishaykm AS v, vishaynm AS n FROM GrVishay WHERE ISNULL(IsCancel, 0) <> 1 ORDER BY Grvishaykm`.execute(
        h.trx,
      )
    ).rows;
  }

  async function add(graphickt: number, fields: Record<string, unknown> = {}) {
    const res = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        Graphickt: graphickt,
        recno: '77',
        refplace: ' p1 ',
        pictureQty: '2',
        grade: 'A',
        color: 'Red',
        samvtypeKt: 2,
        samvat: '2050',
        viksamvat: '2050',
        remark: 'zq-detail',
        filepath: 'Y:\\B1\\p1.JPG',
        pending: true,
        PatrikaKt: 0,
        ...fields,
      },
    });
    expect(res.status).toBe(200);
    return res.body.id as number;
  }

  const wordRows = async (id: number) =>
    (
      await sql<{ k: number; w: number; t: string; r: string }>`
        SELECT GrDetailWordkm AS k, grwordkt AS w, typenm AS t, Remark AS r FROM GrDetailWordT
        WHERE graphicbkt = ${id} ORDER BY GrDetailWordkm`.execute(h.trx)
    ).rows;
  const subjectRows = async (id: number) =>
    (
      await sql<{ k: number; w: number; t: boolean; r: string; s: number }>`
        SELECT grdetailSubKm AS k, grvishaykt AS w, internal AS t, remark AS r, seq AS s FROM GrDetailSubT
        WHERE graphicbkt = ${id} ORDER BY grdetailSubKm`.execute(h.trx)
    ).rows;

  it('is open to every user, lists the newest 5,000 and the record carries its Lib No', async () => {
    const guest = await h.signIn(4);
    const all = await guest.post(`${API}/list`).send({});
    expect(all.status).toBe(200);
    expect((all.body as GridRow[]).length).toBe(5000);
    for (const c of ['graphicBkTkm', 'recno', 'refplace', 'filepath', 'VisheshTran', 'Graphickt'])
      expect(all.body[0]).toHaveProperty(c);
    const { id: g, book } = await parent();
    const id = await add(g);
    const rec = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
    expect(rec).toMatchObject({ Graphickt: g, LibNo: book.libno, refplace: 'p1', pending: true });
    // Add Detail's WhereCondition: only that book's pictures.
    const scoped = (await h.user.post(`${API}/list`).send({ params: { graphickt: g } }))
      .body as GridRow[];
    expect(scoped.map((r) => r.graphicBkTkm)).toEqual([id]);
  });

  it('validates with the desktop message and refuses overlong text', async () => {
    const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: {} });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Please Enter Rec No');
    const word = await h.user.post(`${API}/save`).send({ id: 0, fields: { recno: 'abc' } });
    expect(word.body.message).toBe('Please Enter Rec No');
    const long = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { recno: '1', color: 'x'.repeat(11) } });
    expect(long.body.message).toBe('Color cannot be longer than 10 characters');
    // Graphickt 0 is allowed, as on the desktop.
    const ok = await h.user.post(`${API}/save`).send({ id: 0, fields: { recno: '1' } });
    expect(ok.status).toBe(200);
  });

  it('saves the popups per type and per flag, keeping untouched rows and their Remark', async () => {
    const { id: g } = await parent();
    const vishesh = await words('Vishesh');
    const creator = await words('Creator');
    const style = await words('Style');
    const subj = await subjects();
    const beforeWord = await n(
      sql<{ v: number }>`SELECT ISNULL(MAX(GrDetailWordkm), 0) AS v FROM GrDetailWordT`,
    );
    const id = await add(g, {
      'VisheshTran.Rows': [
        {
          GrDetailWordkm: 0,
          grwordkt: vishesh[0]!.v,
          wordnm: '',
          Remark: 'own remark',
          typenm: 'Vishesh',
          seq: 1,
        },
        { GrDetailWordkm: 0, grwordkt: 0, wordnm: '', Remark: '', typenm: 'Vishesh', seq: 2 },
      ],
      'CreatorTran.Rows': [
        {
          GrDetailWordkm: 0,
          grwordkt: creator[0]!.v,
          wordnm: '',
          Remark: '',
          typenm: 'Creator',
          seq: 1,
        },
      ],
      'StyleTran.Rows': [
        {
          GrDetailWordkm: 0,
          grwordkt: style[0]!.v,
          wordnm: '',
          Remark: 'st',
          typenm: 'Style',
          seq: 1,
        },
      ],
      'GrDetailSubTran.Rows': [
        {
          grdetailSubKm: 0,
          signkt: 0,
          Sign: '',
          grvishaykt: subj[0]!.v,
          vishaynm: '',
          remark: 'r0',
          internal: false,
          seq: 5,
        },
      ],
      'IntSubjectTran.Rows': [
        {
          grdetailSubKm: 0,
          signkt: 0,
          Sign: '',
          grvishaykt: subj[1]!.v,
          vishaynm: '',
          remark: '',
          internal: true,
          seq: 6,
        },
      ],
      'GrdetailOtherRefTran.Rows': [
        {
          GrdetailOtherRefTKm: 0,
          graphicbkt: 0,
          BookTKt: 0,
          BookTName: 'A1',
          Refplace: 'x',
          filepath: 'C:\\a.jpg',
          remark: '',
          seq: 1,
        },
        {
          GrdetailOtherRefTKm: 0,
          graphicbkt: 0,
          BookTKt: 0,
          BookTName: '',
          Refplace: '',
          filepath: '',
          remark: '',
          seq: 2,
        },
      ],
    });
    const me = (await h.user.get('/api/auth/me')).body.user.id as number;
    expect(
      (
        await sql<{
          e: number;
          f: string;
        }>`SELECT enuser AS e, filepath AS f FROM graphicbkt WHERE graphicBkTkm = ${id}`.execute(
          h.trx,
        )
      ).rows[0],
    ).toEqual({ e: me, f: 'Y:\\B1\\p1.JPG' });
    const w = await wordRows(id);
    expect(w.map((r) => r.t).sort()).toEqual(['Creator', 'Style', 'Vishesh']);
    for (const r of w) expect(r.k).toBeGreaterThan(beforeWord);
    expect(w.find((r) => r.t === 'Vishesh')!.r).toBe('own remark');
    expect((await subjectRows(id)).map((r) => [r.w, r.t, r.s])).toEqual([
      [subj[0]!.v, false, 5],
      [subj[1]!.v, true, 6],
    ]);
    expect(
      await n(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM GrdetailOtherRefT WHERE graphicbkt = ${id}`,
      ),
    ).toBe(1);
    // The work report logs the Add.
    expect(
      await n(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'graphicbkt' AND RecordNo = ${String(id)}`,
      ),
    ).toBeGreaterThan(0);

    // Only the Creator popup saved, emptied: Creator rows go; Vishesh keeps its row and Remark
    // (the desktop's typo deleted every Vishesh row here, and rewrote the Remarks).
    const edit = await h.user.post(`${API}/save`).send({
      id,
      fields: { recno: '78', Graphickt: g, 'CreatorTran.Rows': [] },
    });
    expect(edit.status).toBe(200);
    const after = await wordRows(id);
    expect(after.map((r) => r.t).sort()).toEqual(['Style', 'Vishesh']);
    expect(after.find((r) => r.t === 'Vishesh')).toEqual(w.find((r) => r.t === 'Vishesh'));
    // Only the Subject popup saved: the internal subject stays.
    await h.user.post(`${API}/save`).send({
      id,
      fields: {
        recno: '78',
        'GrDetailSubTran.Rows': [
          {
            grdetailSubKm: 0,
            signkt: 0,
            Sign: '',
            grvishaykt: subj[1]!.v,
            vishaynm: '',
            remark: '',
            internal: false,
            seq: 9,
          },
        ],
      },
    });
    expect((await subjectRows(id)).map((r) => [r.w, r.t])).toEqual([
      [subj[1]!.v, true],
      [subj[1]!.v, false],
    ]);
    // The Subject popup's binding-group start.
    const max = await h.user.post(`${API}/trans/GrDetailSubTran/lookup/maxseq`).send({ row: {} });
    expect(max.body.rows[0][0]).toBe(
      await n(sql<{ v: number }>`SELECT MAX(seq) AS v FROM GrDetailSubT`),
    );
  });

  it('deletes the selected records with their popups and grouping rows; Locked refuses', async () => {
    const { id: g } = await parent();
    const vishesh = await words('Vishesh');
    const a = await add(g, {
      'VisheshTran.Rows': [
        { GrDetailWordkm: 0, grwordkt: vishesh[0]!.v, Remark: '', typenm: 'Vishesh', seq: 1 },
      ],
    });
    const b = await add(g);
    await sql`INSERT INTO GraphicbktGrpT (GraphicbktGrpkm, grpnokt, graphicbkT, UseRemark, seq) VALUES (999999, 999999, ${a}, 'x', 1)`.execute(
      h.trx,
    );
    const wrong = await h.user.post(`${API}/delete`).send({ ids: [a, b], password: 'nope' });
    expect(wrong.status).toBe(401);
    const del = await h.user.post(`${API}/delete`).send({ ids: [a, b], password: SECURITY });
    expect(del.status).toBe(204);
    expect(
      await n(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM graphicbkt WHERE graphicBkTkm IN (${a}, ${b})`,
      ),
    ).toBe(0);
    expect(
      await n(sql<{ v: number }>`SELECT COUNT(*) AS v FROM GrDetailWordT WHERE graphicbkt = ${a}`),
    ).toBe(0);
    expect(
      await n(sql<{ v: number }>`SELECT COUNT(*) AS v FROM GraphicbktGrpT WHERE graphicbkT = ${a}`),
    ).toBe(0);

    const c = await add(g);
    const badLock = await h.user
      .post(`${API}/action/lock-records`)
      .send({ ids: [c], params: { password: SECURITY + 'x', lock: true } });
    expect(badLock.status).toBe(401);
    const locked = await h.user
      .post(`${API}/action/lock-records`)
      .send({ ids: [c], params: { password: GRAPHICS_LOCK, lock: true } });
    expect(locked.body.message).toBe('Locked Successfully in 1 Records');
    expect((await h.user.post(`${API}/save`).send({ id: c, fields: { recno: '5' } })).status).toBe(
      403,
    );
    expect((await h.user.post(`${API}/delete`).send({ ids: [c], password: SECURITY })).status).toBe(
      403,
    );
    // The bulk tools respect Locked too.
    const bulk = await h.user.post(`${API}/action/bulk-insert`).send({
      ids: [c],
      params: { type: 'grade', pickId: 1, pickText: 'A', password: SECURITY },
    });
    expect(bulk.status).toBe(400);
    expect(bulk.body.message).toBe('A selected record is Locked');
  });

  it('replaces, inserts and deletes in the selected records (Grade included)', async () => {
    const { id: g } = await parent();
    const style = await words('Style');
    const subj = await subjects();
    const a = await add(g, {
      grade: 'Old',
      'StyleTran.Rows': [
        { GrDetailWordkm: 0, grwordkt: style[0]!.v, Remark: '', typenm: 'Style', seq: 1 },
      ],
      'GrDetailSubTran.Rows': [
        { grdetailSubKm: 0, signkt: 0, grvishaykt: subj[0]!.v, remark: '', seq: 1 },
      ],
    });
    const b = await add(g, { grade: 'Old' });
    const ids = [a, b];
    const list = async (op: string, type: string) =>
      (await h.user.post(`${API}/action/bulk-list`).send({ ids, params: { op, type } })).body;

    // Lists: the old values come from the selection.
    expect((await list('old', 'style')).rows).toEqual([[style[0]!.v, style[0]!.n]]);
    expect((await list('old', 'grade')).rows).toEqual([[0, 'Old']]);
    expect((await list('old', 'subject')).rows.map((r: unknown[]) => r[0])).toEqual([subj[0]!.v]);
    expect((await list('new', 'grade')).columns).toEqual([
      'GrwordMkm',
      'wordnm',
      'defination',
      'remark',
    ]);
    expect(
      (await h.user.post(`${API}/action/bulk-list`).send({ ids, params: { op: 'old', type: 'x' } }))
        .status,
    ).toBe(400);

    const run = (name: string, params: Record<string, unknown>) =>
      h.user.post(`${API}/action/${name}`).send({ ids, params: { password: SECURITY, ...params } });

    expect(
      (
        await run('bulk-replace', {
          type: 'style',
          oldId: style[0]!.v,
          oldText: 'o',
          newId: style[1]!.v,
          newText: 'n',
          password: 'bad',
        })
      ).status,
    ).toBe(401);
    const rs = await run('bulk-replace', {
      type: 'style',
      oldId: style[0]!.v,
      oldText: 'o',
      newId: style[1]!.v,
      newText: 'n',
    });
    expect(rs.body).toMatchObject({
      kind: 'refreshed',
      message: 'At 1 Places o is Replaced by n succefully',
    });
    expect((await wordRows(a)).map((r) => r.w)).toEqual([style[1]!.v]);
    const rsub = await run('bulk-replace', {
      type: 'subject',
      oldId: subj[0]!.v,
      oldText: 'o',
      newId: subj[1]!.v,
      newText: 'n',
    });
    expect(rsub.body.message).toBe('At 1 Places o is Replaced by n succefully');
    // Replace › Grade works (inert on the desktop).
    const rg = await run('bulk-replace', {
      type: 'grade',
      oldId: 0,
      oldText: 'Old',
      newId: 9,
      newText: 'New',
    });
    expect(rg.body.message).toBe('At 2 Places Old is Replaced by New succefully');
    expect(
      await n(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM graphicbkt WHERE graphicBkTkm IN (${a}, ${b}) AND grade = 'New'`,
      ),
    ).toBe(2);

    const beforeWord = await n(
      sql<{ v: number }>`SELECT MAX(GrDetailWordkm) AS v FROM GrDetailWordT`,
    );
    const ins = await run('bulk-insert', { type: 'style', pickId: style[0]!.v, pickText: 's' });
    expect(ins.body.message).toBe('At 2 Places s,Type -style is Inserted succefully');
    const added = (await wordRows(b))[0]!;
    expect(added).toMatchObject({ w: style[0]!.v, t: 'style', r: '' });
    expect(added.k).toBeGreaterThan(beforeWord);
    const insSub = await run('bulk-insert', { type: 'subject', pickId: subj[0]!.v, pickText: 'v' });
    expect(insSub.body.message).toBe('At 2 Places v,Type -Subject is Inserted succefully');
    expect((await subjectRows(b)).map((r) => [r.w, r.s])).toEqual([[subj[0]!.v, 100]]);
    const insGrade = await run('bulk-insert', { type: 'grade', pickId: 3, pickText: 'G1' });
    expect(insGrade.body.message).toBe('At 2 Places G1,Type -grade is Inserted succefully');

    const delStyle = await run('bulk-delete', {
      type: 'style',
      pickId: style[0]!.v,
      pickText: 's',
    });
    expect(delStyle.body.message).toBe('At 2 Places s,Type -style is Deleted succefully');
    expect(await wordRows(b)).toEqual([]);
    const delSub = await run('bulk-delete', { type: 'subject', pickId: subj[0]!.v, pickText: 'v' });
    expect(delSub.body.message).toBe('At 2 Places v,Type -Subject is Deleted succefully');
    // Delete › Grade works too.
    const delGrade = await run('bulk-delete', { type: 'grade', pickId: 0, pickText: 'G1' });
    expect(delGrade.body.message).toBe('At 2 Places G1,Type -grade is Deleted succefully');
    expect(
      await n(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM graphicbkt WHERE graphicBkTkm IN (${a}, ${b}) AND grade = ''`,
      ),
    ).toBe(2);

    // Delete › File Path takes the Graphics lock password, not the Security one.
    expect((await run('delete-filepath', {})).status).toBe(401);
    const fp = await run('delete-filepath', { password: GRAPHICS_LOCK });
    expect(fp.body.kind).toBe('refreshed');
    expect(
      await n(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM graphicbkt WHERE graphicBkTkm IN (${a}, ${b}) AND filepath = ''`,
      ),
    ).toBe(2);
  });

  it('runs the Show Record and Print Record tools', async () => {
    const { id: g } = await parent();
    const a = await add(g, { refplace: 'p1', filepath: 'Y:\\B1\\p1.JPG', recno: '5' });
    const b = await add(g, { refplace: 'p2', filepath: 'Y:\\B1\\other.jpg', recno: '5' });
    const c = await add(g, { refplace: 'p3', filepath: 'Y:\\B1\\other.jpg', recno: '6' });
    const blank = await add(g, { refplace: 'p4', filepath: '' });

    const mismatch = await h.user.post(`${API}/action/refplace-mismatch`).send({ ids: [a, b, c] });
    expect(mismatch.body.kind).toBe('list');
    expect((mismatch.body.rows as GridRow[]).map((r) => r.graphicBkTkm).sort()).toEqual(
      [b, c].sort(),
    );
    const none = await h.user.post(`${API}/action/refplace-mismatch`).send({ ids: [a] });
    expect(none.body).toEqual({ kind: 'message', message: 'No Records Found' });

    const same = await h.user.post(`${API}/action/same-filename`).send({ ids: [] });
    const sameIds = (same.body.rows as GridRow[]).map((r) => r.graphicBkTkm);
    expect(sameIds).toEqual(expect.arrayContaining([b, c]));
    expect(sameIds).not.toContain(a);

    const ref = await h.user
      .post(`${API}/action/refplace-no-filepath`)
      .send({ ids: [], params: { graphickt: g } });
    expect(ref.body).toMatchObject({ kind: 'table', columns: ['refplace'], rows: [['p4']] });
    const noBook = await h.user
      .post(`${API}/action/refplace-no-filepath`)
      .send({ ids: [], params: { graphickt: 0 } });
    expect(noBook.body).toEqual({ kind: 'message', message: 'Please Enter Lib No' });

    const dup = await h.user
      .post(`${API}/action/duplicate-recno`)
      .send({ ids: [], params: { gridIds: [a, b, c, blank] } });
    expect(dup.body).toMatchObject({ kind: 'table', rows: [[5]] });
  });

  it('runs Break And Bind, Update Patrika and the Show For Selected Records windows', async () => {
    const first = (await h.user.get(`${API}/lists/break-bind-subjects`)).body;
    expect(first.columns).toEqual(['grvishaykt', 'vishaynm']);
    const v = Number(first.rows[0][0]);
    const second = (await h.user.get(`${API}/lists/break-bind-members?v=${v}`)).body;
    expect(second.columns).toEqual(['grvishaykt', 'vishaynm']);
    if (second.rows.length > 0) {
      const bnb = await h.user
        .post(`${API}/action/break-and-bind`)
        .send({ ids: [], params: { v, w: Number(second.rows[0][0]) } });
      expect(['list', 'message']).toContain(bnb.body.kind);
    }
    const nothing = await h.user
      .post(`${API}/action/break-and-bind`)
      .send({ ids: [], params: { v: -1, w: -1 } });
    expect(nothing.body).toEqual({ kind: 'message', message: 'No Records Found' });

    const { id: g, book } = await parent();
    const a = await add(g);
    const b = await add(g);
    const patrika = (await h.user.get(`${API}/lists/patrika`)).body.rows[0][0] as number;
    const up = await h.user
      .post(`${API}/action/update-patrika`)
      .send({ ids: [a, b], params: { patrika } });
    expect(up.body).toEqual({
      kind: 'message',
      message: 'Records Updated Successfully At 2 Places',
    });
    const me = (await h.user.get('/api/auth/me')).body.user.id as number;
    expect(
      await n(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM graphicbkt WHERE graphicBkTkm IN (${a}, ${b}) AND PatrikaKt = ${patrika} AND moduser = ${me}`,
      ),
    ).toBe(2);

    const bookm = await h.user.post(`${API}/action/open-bookm`).send({ ids: [a] });
    const bookMast = await n(
      sql<{ v: number }>`SELECT BookMastkt AS v FROM BookT WHERE Tid = ${book.tid}`,
    );
    expect(bookm.body).toEqual({
      kind: 'open',
      screen: 'book-master',
      ids: [bookMast],
      emptyMessage: 'No Record Found',
    });
    const gm = await h.user.post(`${API}/action/open-graphics-master`).send({ ids: [a, b] });
    expect(gm.body).toEqual({
      kind: 'open',
      screen: 'graphics-master',
      ids: [g],
      emptyMessage: '',
    });
    const pat = await h.user.post(`${API}/action/open-patrika`).send({ ids: [a] });
    expect(pat.body).toEqual({
      kind: 'open',
      screen: 'patrika',
      ids: [patrika],
      emptyMessage: 'No Record Found',
    });
    const noPat = await h.user.post(`${API}/action/open-patrika`).send({ ids: [0] });
    expect(noPat.body.ids).toEqual([]);
  });

  it('groups records without duplicates or group 0, in one transaction', async () => {
    const { id: g } = await parent();
    const a = await add(g);
    const b = await add(g);
    const start = await h.user.post(`${API}/action/grouping-start`).send({ ids: [a, b] });
    expect(start.body).toEqual({
      kind: 'form',
      fields: { group: 0 },
      trans: { grouping: { rows: [] } },
    });
    const nextGroup = await n(
      sql<{ v: number }>`SELECT ISNULL(MAX(grpnokt), 0) + 1 AS v FROM GraphicbktGrpT`,
    );
    const row = (title: string, seq: number, key = 0) => ({
      GrdetailSelectedPicTKm: key,
      grpnokm: 0,
      Title: title,
      requiredbykt: 0,
      selectedbykt: 0,
      grvishaykt: 0,
      grwordkt: 0,
      givendate: '2026-10-08',
      signkt: 0,
      seq,
    });
    const save = await h.user.post(`${API}/action/grouping-save`).send({
      ids: [a, b],
      params: { remarks: 'zq group', rows: JSON.stringify([row('one', 1), row('two', 2)]) },
    });
    expect(save.status).toBe(200);
    const members = (
      await sql<{ g: number; b: number; s: number; r: string }>`
        SELECT grpnokt AS g, graphicbkT AS b, seq AS s, UseRemark AS r FROM GraphicbktGrpT
        WHERE graphicbkT IN (${a}, ${b}) ORDER BY seq`.execute(h.trx)
    ).rows;
    expect(members).toEqual([
      { g: nextGroup, b: a, s: 1, r: 'zq group' },
      { g: nextGroup, b: b, s: 2, r: 'zq group' },
    ]);
    // The existing group: its popup rows come back, and saving them adds nothing twice.
    const again = await h.user.post(`${API}/action/grouping-start`).send({ ids: [b] });
    expect(again.body.fields.group).toBe(nextGroup);
    const loaded = again.body.trans.grouping.rows as Record<string, unknown>[];
    expect(loaded.map((r) => r.Title)).toEqual(['one', 'two']);
    const keep = loaded[0]!;
    await h.user.post(`${API}/action/grouping-save`).send({
      ids: [b],
      params: {
        rows: JSON.stringify([
          { ...keep, Title: 'one!', givendate: String(keep.givendate) },
          row('three', 3),
        ]),
      },
    });
    expect(
      await n(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM GraphicbktGrpT WHERE grpnokt = ${nextGroup}`,
      ),
    ).toBe(2);
    expect(
      (
        await sql<{
          t: string;
        }>`SELECT Title AS t FROM GrdetailSelectedPicT WHERE grpnokm = ${nextGroup} ORDER BY seq`.execute(
          h.trx,
        )
      ).rows.map((r) => r.t),
    ).toEqual(['one!', 'three']);
    expect(
      await n(sql<{ v: number }>`SELECT COUNT(*) AS v FROM GrdetailSelectedPicT WHERE grpnokm = 0`),
    ).toBe(0);
  });

  it('shows the parent row, requests a lab issue for its book, and copies the master rows', async () => {
    const { id: g, book } = await parent();
    const parentRow = await h.user.post(`${API}/action/graphic-master-row`).send({ ids: [g] });
    expect(parentRow.body.kind).toBe('list');
    expect(parentRow.body.rows[0]).toMatchObject({
      graphicBkm: g,
      recno: 4321,
      BookTName: book.libno,
    });
    for (const c of [
      'bkname',
      'color',
      'grade',
      'VisheshTran',
      'availableat',
      'WorkDoneByName',
      'finalized',
      'finalizeddate',
      'ProofByTran',
    ])
      expect(parentRow.body.rows[0]).toHaveProperty(c);

    const first = await h.user.post(`${API}/action/request-lab-issue`).send({ ids: [g] });
    expect(first.body).toEqual({ kind: 'message', message: 'Book Issued Successfully' });
    const [req] = (
      await sql<{
        Type: string;
        Forkt: number;
      }>`SELECT Type, Forkt FROM LabIssueM WHERE BookTKt = ${book.tid}`.execute(h.trx)
    ).rows;
    expect(req).toEqual({ Type: 'Book', Forkt: 0 });
    const second = await h.user.post(`${API}/action/request-lab-issue`).send({ ids: [g] });
    expect(second.body.message).toMatch(/already Requested For LabIssue By/);

    const vishesh = await words('Vishesh');
    await sql`INSERT INTO GrBookWordT (GrBookWordkm, graphicbkt, grwordkt, seq, typenm) VALUES (999999901, ${g}, ${vishesh[0]!.v}, 1, 'Vishesh')`.execute(
      h.trx,
    );
    const copied = await h.user
      .post(`${API}/action/master-rows`)
      .send({ ids: [], params: { graphicBkm: g } });
    expect(copied.body.kind).toBe('form');
    const direct = await masterRowsForDetail(h.trx, g);
    expect(copied.body.trans.VisheshTran.rows).toEqual(direct.VisheshTran);
    expect(
      copied.body.trans.VisheshTran.rows.map((r: Record<string, unknown>) => r.grwordkt),
    ).toEqual([vishesh[0]!.v]);
  });

  it('is opened by Graphics Master (Add Detail, For Selected Record) and Patrika', async () => {
    const { id: g, book } = await parent();
    const detail = await add(g);
    const addDetail = await h.user
      .post('/api/master/graphics-master/action/add-detail')
      .send({ ids: [g], params: { copy: true } });
    expect(addDetail.body).toMatchObject({
      kind: 'open',
      screen: 'graphics-detail',
      newRecord: {
        Graphickt: g,
        LibNo: book.libno,
        samvtypeKt: 0,
        CopyFromGraphicBkm: g,
        color: 'Blue',
      },
    });
    // The window lists that book's pictures (the scope the screen derives from Graphickt).
    const scoped = await h.user.post(`${API}/list`).send({ params: { graphickt: g } });
    expect((scoped.body as GridRow[]).map((r) => r.graphicBkTkm)).toEqual([detail]);
    // Its popups' columns take the copied rows.
    const vishesh = (await h.user.get(`${API}/trans/VisheshTran/0`)).body as TransGrid;
    expect(vishesh.columns.map((c) => c.name)).toEqual([
      'GrDetailWordkm',
      'grwordkt',
      'wordnm',
      'Remark',
      'typenm',
      'seq',
    ]);

    const forSelected = await h.user
      .post('/api/master/graphics-master/action/open-graphics-detail')
      .send({ ids: [g] });
    expect(forSelected.body).toEqual({
      kind: 'open',
      screen: 'graphics-detail',
      ids: [detail],
      emptyMessage: '',
    });
    const listed = await h.user.post(`${API}/list`).send({ ids: [detail] });
    expect((listed.body as GridRow[]).map((r) => r.graphicBkTkm)).toEqual([detail]);

    const patrika = (await h.user.get(`${API}/lists/patrika`)).body.rows[0][0] as number;
    await h.user.post(`${API}/action/update-patrika`).send({ ids: [detail], params: { patrika } });
    const fromPatrika = await h.user
      .post('/api/master/patrika/action/graphics-detail')
      .send({ ids: [patrika] });
    expect(fromPatrika.body.screen).toBe('graphics-detail');
    expect(fromPatrika.body.ids).toContain(detail);
  });
});
