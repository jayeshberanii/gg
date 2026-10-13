import type { GridRow, PickList, TransGrid } from '@gglib/shared';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/** Master › Party Master (frmPartyMaster) through the master engine, rolled back after each test. */
describe.skipIf(!hasDb)('Party Master via the master engine (integration)', () => {
  const h = useMasterHarness();
  const API = '/api/master/party-master';
  const count = (q: ReturnType<typeof sql<{ n: number }>>) => h.scalar(q);

  it('validates, adds with max + 1, and shows the kt names', async () => {
    const empty = await h.user.post(`${API}/save`).send({ id: 0, fields: { PName: ' ' } });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Please Enter Party Name');

    expect((await h.user.get(`${API}/new-defaults`)).body).toEqual({ BlockParty: 'No' });

    const next = await count(
      sql<{ n: number }>`SELECT ISNULL(MAX(partyMkm), 0) + 1 AS n FROM PartyM`,
    );
    const sampraday = await count(
      sql<{ n: number }>`SELECT TOP 1 SampradayKm AS n FROM Sampraday ORDER BY SampradayKm`,
    );
    const added = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        PName: 'વેબ પાર્ટી',
        Sampradaykt: sampraday,
        UpSeq: '4',
        MRecNo: '0',
        BlockParty: 'Yes',
        BlockReason: 'x',
      },
    });
    expect(added.status).toBe(200);
    expect(added.body.id).toBe(next);
    expect(added.body.row).toMatchObject({ partyMkm: next, PName: 'વેબ પાર્ટી' });
    expect(added.body.row.SampradayName).toBeTruthy();
    // An Operator cannot block a party (cmbBlockParty is enabled for AMaster only).
    const record = (await h.user.get(`${API}/record/${next}`)).body as GridRow;
    expect(record).toMatchObject({ UpSeq: 4, IsBlocked: false, BlockParty: 'No' });
    expect(record.BlockReason ?? '').toBe('');

    const amaster = await h.signIn(5);
    await amaster
      .post(`${API}/save`)
      .send({ id: next, fields: { PName: 'Blocked', BlockParty: 'Yes', BlockReason: 'dues' } });
    expect((await h.user.get(`${API}/record/${next}`)).body).toMatchObject({
      BlockParty: 'Yes',
      BlockReason: 'dues',
    });
    // An Operator's later edit keeps the block.
    await h.user
      .post(`${API}/save`)
      .send({ id: next, fields: { PName: 'Edited', BlockParty: 'No', BlockReason: '' } });
    expect((await h.user.get(`${API}/record/${next}`)).body).toMatchObject({
      PName: 'Edited',
      BlockParty: 'Yes',
      BlockReason: 'dues',
    });
  });

  it('saves the Address, Relation, Deposit and Anya Name popups', async () => {
    const city = await count(
      sql<{ n: number }>`SELECT TOP 1 Tid AS n FROM visheshMast WHERE Remark = 'city'`,
    );
    const cityName = String(
      (
        await sql<{ v: string }>`SELECT Vishesh AS v FROM visheshMast WHERE Tid = ${city}`.execute(
          h.trx,
        )
      ).rows[0]!.v,
    );
    const maxSr = await count(
      sql<{ n: number }>`SELECT ISNULL(MAX(SrNo), 0) AS n FROM PartyDepositT`,
    );
    const saved = await h.user.post(`${API}/save`).send({
      id: 0,
      fields: {
        PName: 'popups',
        AddressTran: 'a',
        'AddressTran.Rows': [
          { prakMAddkm: -1, PrakashakName: '', address: 'Line 1', citykt: 0, City: '', seq: 1 },
          {
            prakMAddkm: -2,
            PrakashakName: '',
            address: 'Line 2',
            citykt: city,
            City: cityName,
            seq: 2,
          },
        ],
        RelationTran: 'r',
        'RelationTran.Rows': [{ partyMRelkm: 0, TableNm: 'Vishay', TableId: 5, Remark: 'rel' }],
        DepositTran: 'd',
        'DepositTran.Rows': [
          {
            partyDepositkm: 0,
            DepositDate: '31/01/2024',
            CreditAmt: 100,
            DebitAmt: 0,
            ClosingAmt: 0,
            SrNo: 0,
          },
          {
            partyDepositkm: 0,
            DepositDate: '01/02/2024',
            CreditAmt: 0,
            DebitAmt: 40,
            ClosingAmt: 0,
            SrNo: 0,
          },
        ],
        AnyaNameTran: 'n',
        'AnyaNameTran.Rows': [
          { PartyMAnyNmKm: -5, AnyaNm: 'Alias one', BookTKt: 0, PageNo: '', seq: 1 },
          { PartyMAnyNmKm: -6, AnyaNm: 'Alias two', BookTKt: 0, PageNo: '3', seq: 2 },
        ],
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const id = saved.body.id as number;
    expect(saved.body.row.txtAddress).toBe(`Line 1,Line 2,${cityName}`);
    expect(saved.body.row.DepositTran).toBe(60);

    const deposits = (await h.user.get(`${API}/trans/DepositTran/${id}`)).body as TransGrid;
    expect(deposits.rows.map((r) => [r.DepositDate, Number(r.SrNo)])).toEqual([
      ['31/01/2024', maxSr + 1],
      ['01/02/2024', maxSr + 2],
    ]);
    expect(
      await count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM PartyMRelT WHERE PartyMKt = ${id}`),
    ).toBe(1);

    const anya = (await h.user.get(`${API}/trans/AnyaNameTran/${id}`)).body as TransGrid;
    expect(anya.rows.map((r) => r.AnyaNm)).toEqual(['Alias one', 'Alias two']);
    // Edit one, drop the other, add a third.
    const [first] = anya.rows;
    await h.user.post(`${API}/save`).send({
      id,
      fields: {
        PName: 'popups',
        AddressTran: saved.body.row.txtAddress,
        RelationTran: 'r',
        DepositTran: '60',
        AnyaNameTran: 'n',
        'AnyaNameTran.Rows': [
          { ...first, AnyaNm: 'Alias one edited' },
          { PartyMAnyNmKm: -9, AnyaNm: 'Alias three', BookTKt: 0, PageNo: '', seq: 2 },
        ],
      },
    });
    const after = (await h.user.get(`${API}/trans/AnyaNameTran/${id}`)).body as TransGrid;
    expect(after.rows.map((r) => r.AnyaNm)).toEqual(['Alias one edited', 'Alias three']);
    expect(after.rows[0]!.PartyMAnyNmKm).toBe(first!.PartyMAnyNmKm);
    // Popups not sent, boxes unchanged: their rows stay.
    expect(
      await count(
        sql<{ n: number }>`SELECT COUNT(*) AS n FROM PartyDepositT WHERE PartyMKt = ${id}`,
      ),
    ).toBe(2);
    expect(
      await count(sql<{ n: number }>`SELECT COUNT(*) AS n FROM PrakMAddT WHERE partyMkt = ${id}`),
    ).toBe(2);

    const bad = await h.user.post(`${API}/save`).send({
      id,
      fields: {
        PName: 'p',
        DepositTran: 'x',
        'DepositTran.Rows': [{ DepositDate: '31/02/2024', CreditAmt: 1, SrNo: 0 }],
      },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('is not a date');
  });

  it('refuses to delete a party in use, then deletes it with its rows', async () => {
    const id = (
      await h.user.post(`${API}/save`).send({
        id: 0,
        fields: {
          PName: 'to delete',
          RelationTran: 'r',
          'RelationTran.Rows': [{ partyMRelkm: 0, TableNm: 'Vishay', TableId: 5, Remark: '' }],
          AnyaNameTran: 'n',
          'AnyaNameTran.Rows': [{ PartyMAnyNmKm: -1, AnyaNm: 'x', BookTKt: 0, PageNo: '', seq: 1 }],
        },
      })
    ).body.id as number;
    const refused = await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe('Current Record Relation Table is not blank');

    // Emptying the Relation box deletes its rows (DeleteTransaction with txtRel = "").
    await h.user.post(`${API}/save`).send({ id, fields: { PName: 'to delete', RelationTran: '' } });
    expect(
      (await h.user.post(`${API}/delete`).send({ ids: [id], password: SECURITY })).status,
    ).toBe(204);
    expect(
      await count(
        sql<{ n: number }>`SELECT COUNT(*) AS n FROM PartyMAnayNmT WHERE PartyMKt = ${id}`,
      ),
    ).toBe(0);
  });

  it('serves the popup lists and the Send To actions', async () => {
    const tables = (await h.user.post(`${API}/trans/RelationTran/lookup/tablenm`).send({ row: {} }))
      .body as PickList;
    expect(tables.columns).toEqual(['columnmastkm', 'Name']);
    const vishay = (
      await h.user
        .post(`${API}/trans/RelationTran/lookup/tableid`)
        .send({ row: { TableNm: 'Vishay' } })
    ).body as PickList;
    expect(vishay.columns).toEqual(['Id', 'Value']);
    expect(vishay.rows.length).toBeGreaterThan(0);
    const none = (
      await h.user
        .post(`${API}/trans/RelationTran/lookup/tableid`)
        .send({ row: { TableNm: 'nothing' } })
    ).body as PickList;
    expect(none.rows).toEqual([]);

    const { rows } = await sql<{
      id: number;
    }>`SELECT TOP 1 party_cokt AS id FROM IssueTran WHERE party_cokt > 0`.execute(h.trx);
    if (rows[0]) {
      const party = await h.user
        .post(`${API}/action/send-to-issue`)
        .send({ ids: [rows[0].id], params: { mode: 'party' } });
      expect(party.body).toMatchObject({ kind: 'open', screen: 'issue-master' });
      expect(party.body.ids.length).toBeGreaterThan(0);
    }
    const bookT = await h.user.post(`${API}/action/send-to-book-t`).send({ ids: [-1] });
    expect(bookT.body).toMatchObject({ kind: 'open', ids: [], emptyMessage: 'No Record Found' });
  });
});
