import type { GridRow, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Issue › Patrika (frmPatrika) through the master engine, rolled back after every test:
 * validation, the P / EP RecordNo series, the three popups' upsert, the delete guards and the
 * right-click actions.
 */
describe.skipIf(!hasDb)('Patrika via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/patrika';
  const scalar = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  /** One id from each popup's cell list. */
  async function picks() {
    const bhashas = (
      await sql<{ v: number; n: string }>`
        SELECT TOP 2 bhashacokm AS v, bhasa_attr AS n FROM bhasmast WHERE ISNULL(bhasa_attr, '') <> '' ORDER BY bhashacokm`.execute(
        h.trx,
      )
    ).rows;
    const prasangs = (
      await sql<{ v: number; n: string }>`
        SELECT TOP 2 columnmastkm AS v, Name AS n FROM columnmaster WHERE vibhag = 'Prasang' ORDER BY columnmastkm`.execute(
        h.trx,
      )
    ).rows;
    const mixSign = await scalar(
      sql<{
        v: number;
      }>`SELECT TOP 1 Tid AS v FROM VisheshMast WHERE remark = 'CHKBX' AND VisheshNo IN (1, 3) ORDER BY Tid`,
    );
    return { bhashas, prasangs, mixSign };
  }

  async function nextP(): Promise<string> {
    const n = await scalar(
      sql<{
        v: number;
      }>`SELECT ISNULL(MAX(CAST(RIGHT(RecordNo, 5) AS int)), 0) + 1 AS v FROM Patrika WHERE LEFT(RecordNo, 2) = 'P0'`,
    );
    return `P0${String(n).padStart(5, '0')}`;
  }

  async function add(fields: Record<string, unknown> = {}) {
    const p = await picks();
    const res = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        PatrikaPrasangTran: p.prasangs[0]!.n,
        PatrikaBhashaTran: p.bhashas[0]!.n,
        RecordNo: await nextP(),
        Samvat: '2050',
        SamvatVK: '2050',
        Pages: '12',
        Remark: ' zq-patrika ',
        'PatrikaBhashaTran.Rows': [
          { PatrikaBhashaKm: 0, BhashaKt: p.bhashas[0]!.v, BhashaName: p.bhashas[0]!.n, Seq: 1 },
        ],
        'PatrikaPrasangTran.Rows': [
          {
            PatrikaPrasangKm: 0,
            PrasangKt: p.prasangs[0]!.v,
            PrasangName: p.prasangs[0]!.n,
            Remark: '',
            Seq: 1,
          },
          {
            PatrikaPrasangKm: 0,
            PrasangKt: p.prasangs[1]!.v,
            PrasangName: p.prasangs[1]!.n,
            Remark: 'rem',
            Seq: 2,
          },
        ],
        'PatrikaMixSignTran.Rows': [
          { PatrikaMixSignKm: 0, MixSignKt: p.mixSign, MixSignName: 'x', Seq: 1 },
        ],
        ...fields,
      },
    });
    expect(res.status).toBe(200);
    return { id: res.body.id as number, p };
  }

  it('is open to every user and lists the Designer columns', async () => {
    const guest = await h.signIn(4);
    const res = await guest.post(`${API}/list`).send({ ids: [] });
    expect(res.status).toBe(200);
    const id = await scalar(sql<{ v: number }>`SELECT MAX(PatrikaKm) AS v FROM Patrika`);
    const [row] = (await h.user.post(`${API}/list`).send({ ids: [id] })).body as GridRow[];
    for (const c of [
      'PatrikaKm',
      'RecordNo',
      'txtPrasang',
      'SampradayName',
      'CityName',
      'SizeName',
      'Pages',
      'txtBhasha',
      'PatrikaMixSignTran',
      'AuthorName',
      'SamvatTypeName',
      'Samvat',
      'Remark',
    ])
      expect(row).toHaveProperty(c);
  });

  it('validates with the desktop messages', async () => {
    const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: {} });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe(
      '- Prasang is Mandatory\r\n- RecordNo is Mandatory\r\n- Bhasha is Mandatory',
    );
    const taken = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: { RecordNo: 'EP00001', PatrikaBhashaTran: 'x' },
    });
    expect(taken.body.message).toBe('- Prasang is Mandatory\r\n- RecordNo Already Exist');
    const long = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        RecordNo: await nextP(),
        PatrikaPrasangTran: 'a',
        PatrikaBhashaTran: 'b',
        Pages: 'x'.repeat(11),
      },
    });
    expect(long.body.message).toBe('Pages cannot be longer than 10 characters');
  });

  it('computes the next RecordNo of the P and EP series', async () => {
    const p = await nextP();
    expect((await h.user.get(`${API}/new-defaults`)).body).toEqual({ RecordNo: p });
    expect((await h.user.get(`${API}/new-defaults?prefix=P`)).body).toEqual({ RecordNo: p });
    expect((await h.user.get(`${API}/new-defaults?prefix=EP`)).body).toEqual({
      RecordNo: 'EP00002',
    });
    const ep = await h.user
      .post(`${API}/action/next-recordno`)
      .send({ ids: [], params: { prefix: 'EP' } });
    expect(ep.body).toMatchObject({ kind: 'form', fields: { RecordNo: 'EP00002' } });
  });

  it('saves the record and its popups, keeping row keys on edit', async () => {
    const { id, p } = await add();
    const me = (await h.user.get('/api/auth/me')).body.user.id as number;
    const [row] = (
      await sql<{
        RecordNo: string;
        Remark: string;
        txtPrasang: string;
        SamvatVK: number;
        enuser: number;
        endate: Date | null;
      }>`SELECT RecordNo, Remark, txtPrasang, SamvatVK, enuser, endate FROM Patrika WHERE PatrikaKm = ${id}`.execute(
        h.trx,
      )
    ).rows;
    expect(row).toMatchObject({
      Remark: 'zq-patrika',
      txtPrasang: p.prasangs[0]!.n,
      SamvatVK: 2050,
      enuser: me,
    });
    expect(row!.endate).not.toBeNull();
    expect(
      await scalar(
        sql<{
          v: number;
        }>`SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'Patrika' AND RecordNo = ${String(id)}`,
      ),
    ).toBeGreaterThan(0);

    const prasang = (await h.user.get(`${API}/trans/PatrikaPrasangTran/${id}`)).body as TransGrid;
    expect(prasang.rows).toHaveLength(2);
    // INSQ: a blank Remark is stored as ' '.
    expect(prasang.rows.map((r) => r.Remark)).toEqual([' ', 'rem']);
    const keys = prasang.rows.map((r) => Number(r.PatrikaPrasangKm));

    // Edit: keep the second row (changed), drop the first, add a new one; Bhasha not opened.
    const edited = await h.user.post(`${API}/save`).send({
      id,
      fields: {
        PatrikaPrasangTran: 'changed',
        PatrikaBhashaTran: p.bhashas[0]!.n,
        RecordNo: row!.RecordNo,
        'PatrikaPrasangTran.Rows': [
          { ...prasang.rows[1], Remark: 'rem2', Seq: 1 },
          { PatrikaPrasangKm: 0, PrasangKt: p.prasangs[0]!.v, Remark: 'new', Seq: 2 },
        ],
      },
    });
    expect(edited.status).toBe(200);
    const after = (await h.user.get(`${API}/trans/PatrikaPrasangTran/${id}`)).body as TransGrid;
    expect(after.rows.map((r) => r.Remark)).toEqual(['rem2', 'new']);
    expect(Number(after.rows[0]!.PatrikaPrasangKm)).toBe(keys[1]);
    expect(after.rows.map((r) => Number(r.PatrikaPrasangKm))).not.toContain(keys[0]);
    expect(
      await scalar(
        sql<{ v: number }>`SELECT COUNT(*) AS v FROM PatrikaBhashaT WHERE PatrikaKt = ${id}`,
      ),
    ).toBe(1);
    const [mod] = (
      await sql<{
        moduser: number;
        txtPrasang: string;
      }>`SELECT moduser, txtPrasang FROM Patrika WHERE PatrikaKm = ${id}`.execute(h.trx)
    ).rows;
    expect(mod).toEqual({ moduser: me, txtPrasang: 'changed' });

    // RecordNo stays unique on edit.
    const dup = await h.user.post(`${API}/save`).send({
      id,
      fields: { PatrikaPrasangTran: 'a', PatrikaBhashaTran: 'b', RecordNo: 'EP00001' },
    });
    expect(dup.body.message).toBe('- RecordNo Already Exist');
  });

  it('refuses to delete a Patrika in use, and deletes one with its popups', async () => {
    const usedIn = async (q: ReturnType<typeof sql<{ v: number }>>, message: string) => {
      const id = await scalar(q);
      const res = await h.admin.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(message);
    };
    await usedIn(
      sql<{ v: number }>`SELECT TOP 1 PatrikaKt AS v FROM graphicbkt WHERE PatrikaKt > 0`,
      'Record is used in Graphics Detail',
    );
    const { id } = await add();
    const me = (await h.user.get('/api/auth/me')).body.user.id as number;
    await sql`INSERT INTO issuetran (PatrikaKt, returned, enuser, endate) VALUES (${id}, 0, ${me}, GETDATE())`.execute(
      h.trx,
    );
    const issued = await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(issued.status).toBe(409);
    expect(issued.body.message).toBe('Record is used in Issue Master');
    await sql`DELETE FROM issuetran WHERE PatrikaKt = ${id}`.execute(h.trx);

    expect(
      (await h.user.post(`${API}/action/request-lab-issue`).send({ ids: [id] })).body.message,
    ).toBe('Book Issued Successfully');
    const lab = await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(lab.body.message).toBe('Record is used in Lab Issue Master');
    await sql`DELETE FROM LabIssueM WHERE Type = 'Patrika' AND BookTKt = ${id}`.execute(h.trx);

    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: 'wrong' })).status,
    ).not.toBe(204);
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    for (const t of ['PatrikaBhashaT', 'PatrikaPrasangT', 'PatrikaMixSignT'])
      expect(
        await scalar(
          sql<{
            v: number;
          }>`SELECT COUNT(*) AS v FROM ${sql.table(t)} WHERE PatrikaKt = ${id}`,
        ),
      ).toBe(0);
    expect(
      await scalar(sql<{ v: number }>`SELECT COUNT(*) AS v FROM Patrika WHERE PatrikaKm = ${id}`),
    ).toBe(0);
  });

  it('opens Graphics Detail and requests a lab issue', async () => {
    const used = await scalar(
      sql<{ v: number }>`SELECT TOP 1 PatrikaKt AS v FROM graphicbkt WHERE PatrikaKt > 0`,
    );
    const graphics = await h.user.post(`${API}/action/graphics-detail`).send({ ids: [used] });
    expect(graphics.body).toMatchObject({ kind: 'open', screen: 'graphics-detail' });
    expect(graphics.body.ids.length).toBeGreaterThan(0);

    const { id } = await add();
    const none = await h.user.post(`${API}/action/graphics-detail`).send({ ids: [id] });
    expect(none.body).toMatchObject({ kind: 'open', ids: [], emptyMessage: 'No Record Found' });

    const recordNo = (
      await sql<{ r: string }>`SELECT RecordNo AS r FROM Patrika WHERE PatrikaKm = ${id}`.execute(
        h.trx,
      )
    ).rows[0]!.r;
    const first = await h.user.post(`${API}/action/request-lab-issue`).send({ ids: [id] });
    expect(first.body).toEqual({ kind: 'message', message: 'Book Issued Successfully' });
    const [req] = (
      await sql<{
        Type: string;
        Forkt: number;
        enuserKt: number;
      }>`SELECT Type, Forkt, enuserKt FROM LabIssueM WHERE BookTKt = ${id} AND Type = 'Patrika'`.execute(
        h.trx,
      )
    ).rows;
    expect(req).toMatchObject({ Type: 'Patrika', Forkt: 0 });
    const uname = (
      await sql<{
        u: string;
      }>`SELECT uname AS u FROM Usecurity WHERE tid = ${req!.enuserKt}`.execute(h.trx)
    ).rows[0]!.u;
    const again = await h.user.post(`${API}/action/request-lab-issue`).send({ ids: [id] });
    expect(again.body.message).toBe(
      `Lib No - ${recordNo} already Requested For LabIssue By - ${uname}`,
    );
  });
});
