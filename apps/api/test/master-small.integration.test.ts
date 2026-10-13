import type { GridRow, MasterMeta, PickList } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * The small one-table Master screens (Lipi, Author Type, Apprisal Standard, Parishisht
 * Namsuchi) through the master engine, rolled back after every test.
 */
describe.skipIf(!hasDb)('small Master screens via the master engine (integration)', () => {
  const h = useMasterHarness();
  const scalar = (q: ReturnType<typeof sql<{ v: number }>>) => h.scalar(q);

  describe('Lipi Master', () => {
    const API = '/api/master/lipi-master';

    it('validates, adds with max + 1, copies Attr into shortnm, and edits', async () => {
      const meta = (await h.user.get(`${API}/meta`)).body as MasterMeta;
      expect(meta).toMatchObject({ transactionName: 'lipimast', primaryColumn: 'lipicodekm' });

      const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: { lipiname: ' ' } });
      expect(empty.status).toBe(400);
      expect(empty.body.message).toBe('Please Enter Lipi Name');

      const next = await scalar(
        sql<{ v: number }>`SELECT ISNULL(MAX(lipicodekm), 0) + 1 AS v FROM lipimast`,
      );
      const up = await scalar(sql<{ v: number }>`SELECT MIN(lipicodekm) AS v FROM lipimast`);
      const added = await h.user.post(`${API}/save`).send({
        id: 0,
        fields: { lipiname: 'વેબ લિપિ', lipi_attr: 'WL', columnNo: '3x', Uplevelkt: up },
      });
      expect(added.status).toBe(200);
      expect(added.body.id).toBe(next);
      expect(added.body.row).toMatchObject({ lipicodekm: next, lipiname: 'વેબ લિપિ', columnNo: 3 });
      expect(added.body.row.UplevelName).toBeTruthy();
      const record = (await h.user.get(`${API}/record/${next}`)).body as GridRow;
      expect(record).toMatchObject({ shortnm: 'WL', Uplevelkt: up });

      const edited = await h.user
        .post(`${API}/save`)
        .send({ id: next, fields: { lipiname: 'Edited' } });
      expect(edited.body.row).toMatchObject({ lipicodekm: next, lipiname: 'Edited' });
    });

    it('locks, updates the count and finds where a lipi is used', async () => {
      const id = (await h.user.post(`${API}/save`).send({ id: 0, fields: { lipiname: 'lock me' } }))
        .body.id as number;
      const locked = await h.user
        .post(`${API}/lock`)
        .send({ ids: [id], lock: true, password: SECURITY });
      expect(locked.body.message).toBe('Locked Successfully in 1 Records');

      const counted = await h.user.post(`${API}/action/update-count`).send({ ids: [id] });
      expect(counted.body.kind).toBe('refreshed');

      const up = (await h.user.get(`${API}/f2/Uplevelkt`)).body as PickList;
      expect(up.columns).toEqual(['lipicodekm', 'lipiname']);

      const none = await h.user.post(`${API}/action/in-use-book`).send({ ids: [id] });
      expect(none.body).toMatchObject({ kind: 'open', screen: 'book-master', ids: [] });
      expect(none.body.emptyMessage).toBe('No Book Available for Current Selection');

      expect(
        (await h.admin.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
      ).toBe(204);
    });
  });

  describe('Author Type Master', () => {
    const API = '/api/master/author-type-master';

    it('validates, adds with max + 1, keeps IsPrint, drops Brief, and edits', async () => {
      const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: { authortype: '' } });
      expect(empty.body.message).toBe('Please Enter AuthorType');

      const next = await scalar(
        sql<{ v: number }>`SELECT ISNULL(MAX(authtycokm), 0) + 1 AS v FROM authtype`,
      );
      const up = await scalar(sql<{ v: number }>`SELECT MIN(authtycokm) AS v FROM authtype`);
      const added = await h.user.post(`${API}/save`).send({
        id: 0,
        fields: {
          authortype: 'વેબ પ્રકાર',
          authtyattr: 'A',
          brif: 'never saved',
          IsPrint: true,
          uplevalkt: up,
        },
      });
      expect(added.status).toBe(200);
      expect(added.body.id).toBe(next);
      const record = (await h.user.get(`${API}/record/${next}`)).body as GridRow;
      expect(record).toMatchObject({ authortype: 'વેબ પ્રકાર', IsPrint: true, uplevalkt: up });
      expect(record.brif ?? '').toBe('');
      expect(added.body.row.UplevalName).toBeTruthy();
      // v3.4.3.1: the Attribute column is no longer written, on add or on edit.
      const attr = async () =>
        (
          await sql<{ a: string | null }>`
            SELECT authtyattr AS a FROM authtype WHERE authtycokm = ${next}`.execute(h.trx)
        ).rows[0]!.a;
      expect(await attr()).toBeNull();
      await sql`UPDATE authtype SET authtyattr = N'kept' WHERE authtycokm = ${next}`.execute(h.trx);

      const edited = await h.user
        .post(`${API}/save`)
        .send({ id: next, fields: { authortype: 'Edited', IsPrint: false } });
      expect(edited.body.row).toMatchObject({ authortype: 'Edited' });
      expect((await h.user.get(`${API}/record/${next}`)).body).toMatchObject({ IsPrint: false });
      expect(await attr()).toBe('kept');
    });

    it('lists types not used in books and finds where one is used', async () => {
      const id = (
        await h.user.post(`${API}/save`).send({ id: 0, fields: { authortype: 'unused' } })
      ).body.id as number;
      const notUsed = await h.user.post(`${API}/action/not-used-in-book`).send({ ids: [] });
      expect(notUsed.body.kind).toBe('list');
      const ids = (notUsed.body.rows as GridRow[]).map((r) => Number(r.authtycokm));
      expect(ids).toContain(id);
      const { rows: used } = await sql<{
        id: number;
      }>`SELECT TOP 1 AUTHTYCOKT AS id FROM AUTHTRAN`.execute(h.trx);
      expect(ids).not.toContain(used[0]!.id);

      const author = await h.user.post(`${API}/action/in-use-author`).send({ ids: [id] });
      expect(author.body).toMatchObject({ kind: 'open', screen: 'author-master', ids: [] });
      expect(author.body.emptyMessage).toBe('No Author Available for Current Selection');
      expect(
        (await h.user.post(`${API}/lock`).send({ ids: [id], lock: true, password: SECURITY }))
          .status,
      ).toBe(400);
    });
  });

  describe('Apprisal Standard', () => {
    const API = '/api/master/apprisal-standard';

    it('is refused to users outside the menu rule, validates in order, and saves', async () => {
      expect((await h.user.get(`${API}/meta`)).status).toBe(403);

      const noVibhag = await h.admin.post(`${API}/save`).send({ id: 0, fields: { WorkTypeKt: 1 } });
      expect(noVibhag.body.message).toBe('Please Enter Vibhag');
      const noType = await h.admin.post(`${API}/save`).send({ id: 0, fields: { VibhagKt: 1 } });
      expect(noType.body.message).toBe('Please Enter Work Type');

      const vibhag = await scalar(
        sql<{
          v: number;
        }>`SELECT TOP 1 ColumnMastkm AS v FROM columnmaster WHERE Vibhag = 'Vibhag'`,
      );
      const type = await scalar(
        sql<{
          v: number;
        }>`SELECT TOP 1 ColumnMastkm AS v FROM columnmaster WHERE Vibhag = 'WorkType'`,
      );
      const added = await h.admin.post(`${API}/save`).send({
        id: 0,
        fields: {
          VibhagKt: vibhag,
          WorkTypeKt: type,
          PerHourWorkQty: '12',
          IsManualEntry: true,
          TableName: 'KrutiMst',
        },
      });
      expect(added.status).toBe(200);
      const id = added.body.id as number;
      expect(id).toBe(
        await scalar(sql<{ v: number }>`SELECT MAX(ApprisalStandardKm) AS v FROM ApprisalStandard`),
      );
      expect(added.body.row).toMatchObject({
        PerHourWorkQty: 12,
        IsManualEntry: true,
        TableName: 'KrutiMst',
      });
      expect(added.body.row.VibhagName).toBeTruthy();
      expect(added.body.row.WorkTypeName).toBeTruthy();

      await h.admin
        .post(`${API}/save`)
        .send({ id, fields: { VibhagKt: vibhag, WorkTypeKt: type, PerHourWorkQty: '5' } });
      const { rows } = await sql<{
        enuser: number;
        moduser: number;
        PerHourWorkQty: number;
        IsManualEntry: boolean;
      }>`
        SELECT enuser, moduser, PerHourWorkQty, IsManualEntry FROM ApprisalStandard WHERE ApprisalStandardKm = ${id}`.execute(
        h.trx,
      );
      expect(rows[0]).toMatchObject({ PerHourWorkQty: 5, IsManualEntry: false });
      expect(rows[0]!.enuser).toBe(rows[0]!.moduser);
    });
  });

  describe('Parishisht Namsuchi', () => {
    const API = '/api/master/parishisht-namsuchi';

    it('validates both fields at once, sorts by publication then name, deletes the selection', async () => {
      const both = await h.user.post(`${API}/save`).send({ id: 0, fields: {} });
      expect(both.body.message).toBe('- Publication is Mandatory\r\n- Name is Mandatory');

      const pub = await scalar(
        sql<{ v: number }>`SELECT MAX(ParishistPublicationKm) AS v FROM ParishistPublicationM`,
      );
      const add = async (Name: string) =>
        (
          await h.user
            .post(`${API}/save`)
            .send({ id: 0, fields: { ParishistPublicationKt: pub, Name } })
        ).body;
      const b = await add('zz web b');
      const a = await add('zz web a');
      expect(a.row).toMatchObject({ Name: 'zz web a', ParishistPublicationKt: pub });
      expect(a.row.ParishistPublicationName).toBeTruthy();

      const list = (await h.user.post(`${API}/list`).send({})).body as GridRow[];
      const pubs = list.map((r) => Number(r.ParishistPublicationKt ?? 0));
      expect(pubs).toEqual([...pubs].sort((x, y) => y - x));
      const names = list.filter((r) => r.ParishistPublicationKt === pub).map((r) => String(r.Name));
      expect(names.indexOf('zz web a')).toBeLessThan(names.indexOf('zz web b'));

      // The procedure runs for minutes on its own connection (outside this transaction, whose
      // new rows it would wait on), so only its guard is exercised here.
      const printed = await h.user.post(`${API}/action/print-parishisht`).send({ ids: [] });
      expect(printed.body.message).toBe('Select a record first');

      const logged = () =>
        scalar(
          sql<{
            v: number;
          }>`SELECT COUNT(*) AS v FROM WorkReportM WHERE TableName = 'ParishistNamSuchiM' AND RecordNo IN (${a.id}, ${b.id})`,
        );
      const before = await logged();
      expect(
        (await h.user.post(`${API}/delete`).send({ ids: [a.id, b.id], password: SECURITY })).status,
      ).toBe(204);
      expect(
        await scalar(
          sql<{
            v: number;
          }>`SELECT COUNT(*) AS v FROM ParishistNamSuchiM WHERE ParishistNamSuchiKm IN (${a.id}, ${b.id})`,
        ),
      ).toBe(0);
      expect(await logged()).toBe(before);
    });
  });
});
