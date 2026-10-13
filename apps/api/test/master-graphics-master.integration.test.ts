import type { GridRow, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { GRAPHICS_LOCK, hasDb, SECURITY, useMasterHarness } from './master-harness.js';
import { masterRowsForDetail } from '../src/master/screens/graphics-master.js';

/**
 * Graphics › Graphics Master (frmGraphicMaster) through the master engine, rolled back after
 * every test: validation, the save with its three popup tables (the GrBookWordT key fix, the
 * per-type replace, Proof By's upsert), the delete guard, Lock / Unlock and each menu action.
 */
describe.skipIf(!hasDb)('Graphics Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/graphics-master';
  const scalar = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  /** A library number nobody has requested or issued, and some popup values. */
  async function picks() {
    const book = (
      await sql<{ tid: number; libno: string; bkname: string }>`
        SELECT TOP 1 T.Tid AS tid, T.Libno AS libno, M.BookName AS bkname FROM BookT T
        INNER JOIN BookM M ON T.BookMastkt = M.BookMastkm
        WHERE ISNULL(T.LibNo, '') <> ''
          AND NOT EXISTS (SELECT 1 FROM LabIssueM L WHERE L.BookTKt = T.Tid)
          AND NOT EXISTS (SELECT 1 FROM IssueTran I WHERE I.entrcodekt = T.Tid AND ISNULL(I.returned, 0) = 0)
        ORDER BY T.Tid DESC`.execute(h.trx)
    ).rows[0]!;
    const word = async (type: string) =>
      (
        await sql<{ v: number; n: string }>`
          SELECT TOP 2 GrwordMkm AS v, wordnm AS n FROM GrwordM WHERE typenm = ${type} ORDER BY GrwordMkm`.execute(
          h.trx,
        )
      ).rows;
    const vishesh = await word('Vishesh');
    const style = await word('Style');
    const subject = (
      await sql<{ v: number; n: string }>`
        SELECT TOP 1 Grvishaykm AS v, vishaynm AS n FROM GrVishay WHERE ISNULL(IsCancel, 0) <> 1 ORDER BY Grvishaykm`.execute(
        h.trx,
      )
    ).rows[0]!;
    const doneBy = await scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 ColumnMastkm AS v FROM columnmaster WHERE Vibhag = 'DoneBy' AND ISNULL(Name, '') <> '' ORDER BY ColumnMastkm`,
    );
    const proofType = await scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 ColumnMastkm AS v FROM columnmaster WHERE Vibhag = 'ProofType' ORDER BY ColumnMastkm`,
    );
    return { book, vishesh, style, subject, doneBy, proofType };
  }

  async function add(fields: Record<string, unknown> = {}) {
    const p = await picks();
    const res = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        recno: '987654',
        BookTKt: p.book.tid,
        bkname: ' zq-graphics ',
        SamvTypeKt: 2,
        samvat: '2050',
        viksamvat: '2050',
        finalizeddate: '2026-01-15',
        finalized: true,
        pending: false,
        color: 'Red',
        grade: 'A',
        remark: 'zq',
        'VisheshTran.Rows': [
          {
            GrBookWordkm: 0,
            grwordkt: p.vishesh[0]!.v,
            wordnm: p.vishesh[0]!.n,
            typenm: 'Vishesh',
            seq: 1,
          },
          { GrBookWordkm: 0, grwordkt: 0, wordnm: '', typenm: 'Vishesh', seq: 2 },
        ],
        'StyleTran.Rows': [
          {
            GrBookWordkm: 0,
            grwordkt: p.style[0]!.v,
            wordnm: p.style[0]!.n,
            typenm: 'Style',
            seq: 1,
          },
        ],
        'GrbookSubTran.Rows': [
          { grbooksubkm: 0, grvishaykt: p.subject.v, vishaynm: p.subject.n, seq: 1 },
        ],
        'ProofByTran.Rows': [
          {
            GrBookProofByKm: 0,
            ProofByKt: p.doneBy,
            ProofBy: 'x',
            ProofTypeKt: p.proofType,
            ProofType: 'y',
            ProofDate: '25/12/2025',
            Remark: '',
            Seq: 1,
          },
        ],
        ...fields,
      },
    });
    expect(res.status).toBe(200);
    return { id: res.body.id as number, p };
  }

  it('is open to every user and lists the Designer columns', async () => {
    const guest = await h.signIn(4);
    expect((await guest.post(`${API}/list`).send({ ids: [] })).status).toBe(200);
    const id = await scalar(sql<{ v: number }>`SELECT MAX(graphicBkm) AS v FROM GraphicBKM`);
    const [row] = (await h.user.post(`${API}/list`).send({ ids: [id] })).body as GridRow[];
    for (const c of [
      'graphicBkm',
      'recno',
      'BookTName',
      'bkname',
      'color',
      'grade',
      'VisheshTran',
      'viksamvat',
      'ProofByTran',
      'WorkDoneByName',
      'finalizeddate',
      'BookTKt',
    ])
      expect(row).toHaveProperty(c);
  });

  it('validates with the desktop messages', async () => {
    const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: {} });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Please Enter RecNo');
    const noBook = await h.user.post(`${API}/save`).send({ id: 0, fields: { recno: '12' } });
    expect(noBook.body.message).toBe('Please Enter LibNo');
    const long = await h.user
      .post(`${API}/save`)
      .send({ id: 0, fields: { recno: '12', BookTKt: 1, color: 'x'.repeat(11) } });
    expect(long.body.message).toBe('Color cannot be longer than 10 characters');
  });

  it('saves the record and its popups, with GrBookWordT keys of its own table', async () => {
    const before = await scalar(
      sql<{ v: number }>`SELECT ISNULL(MAX(GrBookWordkm), 0) AS v FROM GrBookWordT`,
    );
    const { id, p } = await add();
    const me = (await h.user.get('/api/auth/me')).body.user.id as number;
    const [row] = (
      await sql<{
        recno: number;
        bkname: string;
        finalized: boolean;
        finalizeddate: Date;
        enuser: number;
        BookTKt: number;
      }>`SELECT recno, bkname, finalized, finalizeddate, enuser, BookTKt FROM GraphicBKM WHERE graphicBkm = ${id}`.execute(
        h.trx,
      )
    ).rows;
    expect(row).toMatchObject({
      recno: 987654,
      bkname: 'zq-graphics',
      finalized: true,
      enuser: me,
      BookTKt: p.book.tid,
    });
    expect(
      await scalar(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'GraphicBKM' AND RecordNo = ${String(id)}`,
      ),
    ).toBeGreaterThan(0);

    // The blank Vishesh row is dropped; keys follow GrBookWordT's own MAX.
    const words = (
      await sql<{
        k: number;
        t: string;
      }>`SELECT GrBookWordkm AS k, typenm AS t FROM GrBookWordT WHERE graphicbkt = ${id} ORDER BY GrBookWordkm`.execute(
        h.trx,
      )
    ).rows;
    expect(words.map((w) => w.t).sort()).toEqual(['Style', 'Vishesh']);
    for (const w of words) expect(w.k).toBeGreaterThan(before);
    expect(new Set(words.map((w) => w.k)).size).toBe(2);
    const proof = (await h.user.get(`${API}/trans/ProofByTran/${id}`)).body as TransGrid;
    expect(proof.rows).toHaveLength(1);
    expect(proof.rows[0]!.ProofDate).toBe('25/12/2025');
    const subjects = (await h.user.get(`${API}/trans/GrbookSubTran/${id}`)).body as TransGrid;
    expect(subjects.rows.map((r) => Number(r.grvishaykt))).toEqual([p.subject.v]);

    // Edit with no word popup saved: the word rows stay exactly as they were.
    const edit = await h.user.post(`${API}/save`).send({
      id,
      fields: { recno: '987655', BookTKt: p.book.tid, finalizeddate: '2026-01-16' },
    });
    expect(edit.status).toBe(200);
    const same = (
      await sql<{
        k: number;
      }>`SELECT GrBookWordkm AS k FROM GrBookWordT WHERE graphicbkt = ${id} ORDER BY GrBookWordkm`.execute(
        h.trx,
      )
    ).rows;
    expect(same.map((w) => w.k)).toEqual(words.map((w) => w.k));
    expect(
      await scalar(
        sql<{ v: number }>`SELECT moduser AS v FROM GraphicBKM WHERE graphicBkm = ${id}`,
      ),
    ).toBe(me);

    // The Vishesh popup emptied: only Vishesh goes, Style stays; Proof By saved empty clears it.
    await h.user.post(`${API}/save`).send({
      id,
      fields: {
        recno: '987655',
        BookTKt: p.book.tid,
        'VisheshTran.Rows': [],
        'ProofByTran.Rows': [],
        'StyleTran.Rows': [
          { GrBookWordkm: 0, grwordkt: p.style[1]!.v, typenm: 'Style', seq: 1 },
          { GrBookWordkm: 0, grwordkt: p.style[0]!.v, typenm: 'Style', seq: 2 },
        ],
      },
    });
    const left = (
      await sql<{
        g: number;
        t: string;
      }>`SELECT grwordkt AS g, typenm AS t FROM GrBookWordT WHERE graphicbkt = ${id} ORDER BY seq`.execute(
        h.trx,
      )
    ).rows;
    expect(left).toEqual([
      { g: p.style[1]!.v, t: 'Style' },
      { g: p.style[0]!.v, t: 'Style' },
    ]);
    expect(
      await scalar(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM GrBookProofByT WHERE graphicbkt = ${id}`,
      ),
    ).toBe(0);
    expect(
      await scalar(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM GrbookSubT WHERE graphicbkt = ${id}`,
      ),
    ).toBe(1);
  });

  it('keeps Proof By keys on edit (upsert)', async () => {
    const { id, p } = await add();
    const first = (await h.user.get(`${API}/trans/ProofByTran/${id}`)).body as TransGrid;
    const key = Number(first.rows[0]!.GrBookProofByKm);
    await h.user.post(`${API}/save`).send({
      id,
      fields: {
        recno: '1',
        BookTKt: p.book.tid,
        'ProofByTran.Rows': [
          { ...first.rows[0], Remark: 'changed', ProofDate: '' },
          {
            GrBookProofByKm: 0,
            ProofByKt: p.doneBy,
            ProofTypeKt: p.proofType,
            ProofDate: '01/02/2026',
            Seq: 2,
          },
        ],
      },
    });
    const rows = (
      await sql<{
        k: number;
        r: string;
        d: Date | null;
      }>`SELECT GrBookProofByKm AS k, Remark AS r, ProofDate AS d FROM GrBookProofByT WHERE graphicbkt = ${id} ORDER BY Seq`.execute(
        h.trx,
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ k: key, r: 'changed', d: null });
    expect(rows[1]!.d?.toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  it('refuses to delete a record in use, and deletes one with its popups', async () => {
    const used = await scalar(
      sql<{ v: number }>`SELECT TOP 1 Graphickt AS v FROM graphicbkt WHERE Graphickt > 0`,
    );
    const inUse = await h.user.post(`${API}/delete`).send({ ids: [used], password: SECURITY });
    expect(inUse.status).toBe(409);
    expect(inUse.body.message).toBe('Record is used in Graphics Detail');
    expect((await h.user.post(`${API}/action/in-use`).send({ ids: [used] })).body.message).toBe(
      'Record is used in Graphics Detail',
    );

    const { id } = await add();
    expect((await h.user.post(`${API}/action/in-use`).send({ ids: [id] })).body.message).toBe('');
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: 'wrong' })).status,
    ).not.toBe(204);
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    for (const t of ['GrbookSubT', 'GrBookWordT', 'GrBookProofByT'])
      expect(
        await scalar(
          sql<{ v: number }>`SELECT COUNT(*) AS v FROM ${sql.table(t)} WHERE graphicbkt = ${id}`,
        ),
      ).toBe(0);
    expect(
      await scalar(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM GraphicBKM WHERE graphicBkm = ${id}`,
      ),
    ).toBe(0);
  });

  it('locks and unlocks with GRAPHICS_LOCK_PASSWORD, details included', async () => {
    const id = await scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 Graphickt AS v FROM graphicbkt WHERE Graphickt > 0 GROUP BY Graphickt ORDER BY Graphickt`,
    );
    const wrong = await h.user
      .post(`${API}/action/lock-records`)
      .send({ ids: [id], params: { password: SECURITY, lock: true } });
    expect(wrong.status).toBe(401);
    const locked = await h.user
      .post(`${API}/action/lock-records`)
      .send({ ids: [id], params: { password: GRAPHICS_LOCK, lock: true } });
    expect(locked.body).toMatchObject({
      kind: 'refreshed',
      message: 'Locked Successfully in 1 Records',
    });
    expect(
      await scalar(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM graphicbkt WHERE Graphickt = ${id} AND ISNULL(Locked, 0) = 0`,
      ),
    ).toBe(0);
    // A locked record cannot be saved or deleted.
    const p = await picks();
    expect(
      (await h.user.post(`${API}/save`).send({ id, fields: { recno: '1', BookTKt: p.book.tid } }))
        .status,
    ).toBe(403);
    const unlocked = await h.user
      .post(`${API}/action/lock-records`)
      .send({ ids: [id], params: { password: GRAPHICS_LOCK, lock: false } });
    expect(unlocked.body.message).toBe('Unlocked Successfully in 1 Records');
    expect(
      await scalar(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM graphicbkt WHERE Graphickt = ${id} AND ISNULL(Locked, 0) = 1`,
      ),
    ).toBe(0);
  });

  it('runs the right-click actions', async () => {
    const { id, p } = await add();
    const { id: twin } = await add();

    // Print Duplicate No: the RecNos found more than once among the grid's rows.
    const dup = await h.user
      .post(`${API}/action/duplicate-no`)
      .send({ ids: [], params: { gridIds: [id, twin] } });
    expect(dup.body).toMatchObject({ kind: 'table', columns: ['RecNo'], rows: [[987654]] });

    const book = await h.user.post(`${API}/action/open-bookm`).send({ ids: [id] });
    expect(book.body).toMatchObject({ kind: 'open', screen: 'book-master' });
    expect(book.body.ids).toHaveLength(1);

    const used = await scalar(
      sql<{ v: number }>`SELECT TOP 1 Graphickt AS v FROM graphicbkt WHERE Graphickt > 0`,
    );
    const details = await h.user.post(`${API}/action/open-graphics-detail`).send({ ids: [used] });
    expect(details.body).toMatchObject({ kind: 'open', screen: 'graphics-detail' });
    expect(details.body.ids.length).toBeGreaterThan(0);
    const none = await h.user.post(`${API}/action/open-graphics-detail`).send({ ids: [id] });
    expect(none.body).toMatchObject({ kind: 'open', ids: [0] });

    // Add Detail: Lib No only, or the master's values too.
    const plain = await h.user
      .post(`${API}/action/add-detail`)
      .send({ ids: [id], params: { copy: false } });
    expect(plain.body).toEqual({
      kind: 'open',
      screen: 'graphics-detail',
      ids: [],
      emptyMessage: '',
      newRecord: { Graphickt: id, LibNo: p.book.libno },
    });
    const copied = await h.user
      .post(`${API}/action/add-detail`)
      .send({ ids: [id], params: { copy: true } });
    expect(copied.body.newRecord).toMatchObject({
      Graphickt: id,
      recno: 987654,
      color: 'Red',
      grade: 'A',
      samvtypeKt: 2,
      samvat: '2050',
      VisheshTran: p.vishesh[0]!.n,
      StyleTran: p.style[0]!.n,
      GrDetailSubTran: p.subject.n,
      CopyFromGraphicBkm: id,
    });
    const rows = await masterRowsForDetail(h.trx, id);
    expect(rows.VisheshTran!.map((r) => r.grwordkt)).toEqual([p.vishesh[0]!.v]);
    expect(rows.GrDetailSubTran!.map((r) => r.grvishaykt)).toEqual([p.subject.v]);
    expect(rows.AvailableAtTran).toEqual([]);

    // Request For Book(LabIssue): one request, then the desktop's "already requested".
    const first = await h.user.post(`${API}/action/request-lab-issue`).send({ ids: [id] });
    expect(first.body).toEqual({ kind: 'message', message: 'Book Issued Successfully' });
    const [req] = (
      await sql<{ Type: string; Forkt: number; enuserKt: number }>`
        SELECT Type, Forkt, enuserKt FROM LabIssueM WHERE BookTKt = ${p.book.tid}`.execute(h.trx)
    ).rows;
    expect(req).toMatchObject({ Type: 'Book', Forkt: 0 });
    const uname = (
      await sql<{
        u: string;
      }>`SELECT uname AS u FROM Usecurity WHERE tid = ${req!.enuserKt}`.execute(h.trx)
    ).rows[0]!.u;
    const again = await h.user.post(`${API}/action/request-lab-issue`).send({ ids: [id] });
    expect(again.body.message).toBe(
      `Patrika No - zq-graphics already Requested For LabIssue By - ${uname}`,
    );
  });
});
