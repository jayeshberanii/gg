import type { GridRow, PickList } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Graphics › New Word Master (frmGrWordMaster) and New Vishay Master (frmGrVishayMaster)
 * through the master engine, rolled back after every test.
 */
describe.skipIf(!hasDb)('Graphics word lists via the master engine (integration)', () => {
  const h = useMasterHarness();
  const scalar = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);
  /** A link row of a Graphics Master / Detail table pointing at `id`. */
  const link = async (table: string, pk: string, column: string, id: number) => {
    const key = await scalar(
      sql<{ v: number }>`SELECT ISNULL(MAX(${sql.ref(pk)}), 0) + 1 AS v FROM ${sql.table(table)}`,
    );
    await sql`INSERT INTO ${sql.table(table)} (${sql.ref(pk)}, graphicbkt, ${sql.ref(column)}, seq)
      VALUES (${key}, 1, ${id}, 1)`.execute(h.trx);
  };
  const count = (table: string, column: string, id: number) =>
    scalar(
      sql<{
        v: number;
      }>`SELECT COUNT(*) AS v FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ${id}`,
    );

  describe('New Word Master', () => {
    const API = '/api/master/new-word-master';
    const add = async (fields: Record<string, string>) =>
      (await h.user.post(`${API}/save`).send({ id: 0, fields })).body.id as number;

    it('validates, adds with max + 1, logs the work report, and edits', async () => {
      const noType = await h.user.post(`${API}/save`).send({ id: 0, fields: { wordnm: 'x' } });
      expect(noType.body.message).toBe('Please Enter Type Name');
      const noWord = await h.user.post(`${API}/save`).send({ id: 0, fields: { typenm: 'x' } });
      expect(noWord.body.message).toBe('Please Enter Word Name');

      const next = await scalar(
        sql<{ v: number }>`SELECT ISNULL(MAX(GrwordMkm), 0) + 1 AS v FROM grwordm`,
      );
      const added = await h.user.post(`${API}/save`).send({
        id: 0,
        fields: { wordnm: ' શબ્દ ', typenm: 'webtype', defination: 'd', remark: 'r' },
      });
      expect(added.status).toBe(200);
      expect(added.body.id).toBe(next);
      expect(added.body.row).toMatchObject({ GrwordMkm: next, wordnm: 'શબ્દ', typenm: 'webtype' });
      expect(
        await scalar(
          sql<{
            v: number;
          }>`SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'grwordm' AND RecordNo = ${String(next)}`,
        ),
      ).toBeGreaterThan(0);

      const edited = await h.user
        .post(`${API}/save`)
        .send({ id: next, fields: { wordnm: 'edited', typenm: 'webtype' } });
      expect(edited.body.row).toMatchObject({ wordnm: 'edited', defination: '' });
    });

    it('refuses to delete a word in use, and deletes one that is not', async () => {
      const used = await add({ wordnm: 'used', typenm: 'webtype' });
      await link('GrBookWordT', 'GrBookWordkm', 'grwordkt', used);
      const refused = await h.user.post(`${API}/delete`).send({ ids: [used], password: SECURITY });
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('Record is used in Graphics Master');

      const free = await add({ wordnm: 'free', typenm: 'webtype' });
      expect(
        (await h.user.post(`${API}/delete`).send({ ids: [free], password: SECURITY })).status,
      ).toBe(204);
    });

    it('replaces a word with another of its Type, counts, and shows where it is used', async () => {
      const from = await add({ wordnm: 'old', typenm: 'webtype' });
      const to = await add({ wordnm: 'new', typenm: 'webtype' });
      const other = await add({ wordnm: 'other', typenm: 'othertype' });
      await link('GrBookWordT', 'GrBookWordkm', 'grwordkt', from);
      await link('GrDetailWordT', 'GrDetailWordkm', 'grwordkt', from);

      const choices = (await h.user.get(`${API}/lists/replace-with?id=${from}`)).body as PickList;
      const offered = choices.rows.map((r) => r[0]);
      expect(offered).toEqual(expect.arrayContaining([from, to]));
      expect(offered).not.toContain(other);

      const inUse = await h.user.post(`${API}/action/in-use-graphics-detail`).send({ ids: [from] });
      expect(inUse.body).toMatchObject({ kind: 'open', screen: 'graphics-detail', ids: [1] });

      const replaced = await h.user
        .post(`${API}/action/replace`)
        .send({ ids: [from], params: { replaceWith: to } });
      expect(replaced.body).toMatchObject({
        kind: 'list',
        message: 'Record Replaced Successfully',
      });
      expect(await count('GrBookWordT', 'grwordkt', to)).toBe(1);
      expect(await count('GrDetailWordT', 'grwordkt', to)).toBe(1);
      expect(await count('GrBookWordT', 'grwordkt', from)).toBe(0);

      const counted = await h.user.post(`${API}/action/update-count`).send({ ids: [from, to] });
      const rows = counted.body.rows as GridRow[];
      expect(rows.find((r) => r.GrwordMkm === to)?.count).toBe('1+1');
      expect(rows.find((r) => r.GrwordMkm === from)?.count).toBe('0+0');
    });
  });

  describe('New Vishay Master', () => {
    const API = '/api/master/new-vishay-master';
    const add = async (fields: Record<string, string | boolean>) =>
      (await h.user.post(`${API}/save`).send({ id: 0, fields })).body.id as number;

    it('validates, adds with max + 1 and the Cancel flag, and edits', async () => {
      const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: { vishaynm: '' } });
      expect(empty.body.message).toBe('Please Enter Vishay Name');

      const next = await scalar(
        sql<{ v: number }>`SELECT ISNULL(MAX(Grvishaykm), 0) + 1 AS v FROM GrVishay`,
      );
      const id = await add({ vishaynm: 'વિષય', groupnm: 'g', IsCancel: true });
      expect(id).toBe(next);
      const record = (await h.user.get(`${API}/record/${id}`)).body as GridRow;
      expect(record).toMatchObject({ vishaynm: 'વિષય', groupnm: 'g', IsCancel: true });

      const edited = await h.user
        .post(`${API}/save`)
        .send({ id, fields: { vishaynm: 'edited', IsCancel: false } });
      expect(edited.body.row).toMatchObject({ vishaynm: 'edited', IsCancel: false });
    });

    it('deletes every selected row only when none is in use', async () => {
      const a = await add({ vishaynm: 'first' });
      const b = await add({ vishaynm: 'second' });
      const c = await add({ vishaynm: 'third' });
      await link('GrbookSubT', 'grbooksubkm', 'grvishaykt', b);
      await link('GrDetailSubT', 'grdetailSubKm', 'grvishaykt', b);
      await link('GrDetailSubT', 'grdetailSubKm', 'grvishaykt', c);

      const wrong = await h.user
        .post(`${API}/action/delete-selected`)
        .send({ ids: [a], params: { password: 'nope' } });
      expect(wrong.status).toBe(401);

      const refused = await h.user
        .post(`${API}/action/delete-selected`)
        .send({ ids: [a, b, c], params: { password: SECURITY } });
      expect(refused.body).toEqual({
        kind: 'message',
        message:
          'second is used in Graphics Master. and second is used in Graphics Detail.\r\n' +
          'third is used in Graphics Detail.',
      });
      expect(await count('GrVishay', 'Grvishaykm', a)).toBe(1);

      const d = await add({ vishaynm: 'fourth' });
      const done = await h.user
        .post(`${API}/action/delete-selected`)
        .send({ ids: [a, d], params: { password: SECURITY } });
      expect(done.body).toMatchObject({
        kind: 'list',
        message: '(2) Records Deleted Successfully',
      });
      expect(await count('GrVishay', 'Grvishaykm', a)).toBe(0);
    });

    it('replaces every selected subject and lists all subjects to pick from', async () => {
      const a = await add({ vishaynm: 'a' });
      const b = await add({ vishaynm: 'b' });
      const to = await add({ vishaynm: 'target' });
      await link('GrbookSubT', 'grbooksubkm', 'grvishaykt', a);
      await link('GrDetailSubT', 'grdetailSubKm', 'grvishaykt', b);

      const choices = (await h.user.get(`${API}/lists/replace-with`)).body as PickList;
      expect(choices.columns).toEqual(['Grvishaykm', 'vishaynm']);
      expect(choices.rows.map((r) => r[0])).toContain(to);

      const replaced = await h.user
        .post(`${API}/action/replace`)
        .send({ ids: [a, b], params: { replaceWith: to } });
      expect(replaced.body.message).toBe('Records Replaced Successfully');
      expect(await count('GrbookSubT', 'grvishaykt', to)).toBe(1);
      expect(await count('GrDetailSubT', 'grvishaykt', to)).toBe(1);
    });

    it('shows Member / Master from the member tree', async () => {
      const [withMembers] = (
        await sql<{ id: number }>`
          SELECT TOP 1 m.recordkt AS id FROM TreeMast m
          INNER JOIN columnmaster c ON c.ColumnMastkm = m.Tablekt AND c.Vibhag = 'TableNm' AND c.Name = 'GrVishayMembr'
          WHERE EXISTS (SELECT 1 FROM TreeMast k WHERE k.MasterId = m.TreeMastkm AND k.Tablekt = m.Tablekt)
        `.execute(h.trx)
      ).rows;
      if (!withMembers) return;
      const res = await h.user
        .post(`${API}/action/show-member-master`)
        .send({ ids: [withMembers.id] });
      expect(res.body.kind).toBe('cells');
      expect(res.body.rows[0]).toMatchObject({ Grvishaykm: withMembers.id });
      expect(String(res.body.rows[0].Member)).not.toBe('');
    });
  });
});
