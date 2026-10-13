import { UserType } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { ADDRESS_TRANS } from './author.js';
import { val } from './bhasha.js';
import { get, grid, int, type Row, signBetween, text } from './book-common.js';
import { insertWithMaxId, openInUse, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/** EnableDisableBlockParty: only the AMaster user type may block a party. */
const mayBlock = (userType: number) => userType === UserType.AMaster;

/** PartyDepositT.DepositDate: the popup's dd/MM/yyyy, as a date SQL Server cannot misread. */
function depositDate(value: unknown): string {
  const m = trimmed(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const d = m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
  if (!m || !d || d.getUTCDate() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1) {
    throw new BadRequestException(`Deposit Date "${trimmed(value)}" is not a date (Ex-dd/MM/yyyy)`);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * PartyMRepository.Save's txtAddress: every address joined by "," and then the last row's city
 * (SignBetweenStr, which skips blanks).
 */
function addressText(rows: Row[]): string {
  let out = '';
  rows.forEach((r, i) => {
    out = signBetween(out, text(get(r, 'address')));
    const city = text(get(r, 'city'));
    if (i === rows.length - 1 && city !== '') out = signBetween(out, city);
  });
  return out;
}

/** The Relation popup's TableId list: the ids of the table its TableNm names. */
const RELATION_TABLES: Record<string, ReturnType<typeof sql>> = {
  vishay: sql`SELECT vishaycokm AS Id, vishaycokm AS Value FROM vishay ORDER BY vishaycokm`,
  authmast: sql`SELECT authorcokm AS Id, authorcokm AS Value FROM authmast ORDER BY authorcokm`,
  prakmast: sql`SELECT praksnnokm AS Id, praksnnokm AS Value FROM praksnM ORDER BY praksnnokm`,
  visheshmast: sql`SELECT Tid AS Id, Tid AS Value FROM visheshMast ORDER BY Tid`,
  columnmaster: sql`SELECT ColumnMastkm AS Id, ColumnMastkm AS Value FROM columnmaster ORDER BY ColumnMastkm`,
  bookmaster: sql`SELECT BookMastkm AS Id, BookMastkm AS Value FROM BookM ORDER BY BookMastkm`,
  grvishaymembr: sql`SELECT GrvishayMemkm AS Id, GrvishayMemkm AS Value FROM GrVishayMembr ORDER BY GrvishayMemkm`,
};

/** PartyMRepository.CheckInUse, in its order, messages verbatim. */
const IN_USE: [RawCheck, string][] = [
  [
    (id) => sql`SELECT COUNT(*) AS n FROM InwordM WHERE forkt = ${id} OR fromkt = ${id}`,
    'Record is in used in Inword Master',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM WorkGivenM WHERE Givenbykt = ${id} OR GivenTokt = ${id}`,
    'Record is in used in WorkGiven Master',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM praksnlistAnyaBndrM WHERE bhandarkt = ${id}`,
    'Record is in used in Prakashan List Anya Bhandar',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM krutireflibno WHERE bhandarkt = ${id}`,
    'Record is in used in KrutiRef',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM BookM WHERE bhandarcokt = ${id}`,
    'Record is in used in Book Master',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM praptitran WHERE prapticokt = ${id}`,
    'Record is in used in BookT PraptiTran',
  ],
  [
    (id) =>
      sql`SELECT COUNT(*) AS n FROM IssueTran WHERE party_cokt = ${id} OR Ref_partykt = ${id}`,
    'Record is in used in Issue Master',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM bhandtran WHERE bhandarKt = ${id}`,
    'Record is in used in BhandarTran(Catalogue Master)',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM PartyMRelT WHERE PartyMKt = ${id}`,
    'Current Record Relation Table is not blank',
  ],
  [
    (id) => sql`SELECT COUNT(*) AS n FROM MagSubscribeT WHERE PartyMKt = ${id}`,
    'Record is used in Magazine Master',
  ],
  [
    (id) =>
      sql`SELECT COUNT(*) AS n FROM PartyM WHERE (UplevelKt > 0 OR MasterKt > 0 OR MRecNo > 0 OR GroupNo > 0) AND partyMkm = ${id}`,
    'Current Record uplevel or masterid or mrecno or grpno is not blank',
  ],
  [
    (id) =>
      sql`SELECT COUNT(*) AS n FROM OutsiderM WHERE partymkt = ${id} OR attendedbykt = ${id} OR DemandApprovedbykt = ${id} OR WorkDonebykt = ${id}`,
    'Record is used in Outsider Master',
  ],
];
type RawCheck = (id: number) => ReturnType<typeof sql<{ n: number }>>;

async function count(db: Executor, query: ReturnType<typeof sql<{ n: number }>>) {
  return Number((await query.execute(db)).rows[0]?.n ?? 0);
}

/**
 * Master › Party Master (frmPartyMaster, PartyMRepository). Table PartyM, key partyMkm
 * assigned as max + 1. No Locked column (the grid's L / U fail on the desktop).
 */
export const partyMaster: ScreenDefinition = {
  screen: 'party-master',
  table: 'PartyM',
  primaryColumn: 'partyMkm',
  lockable: false,
  // Save logs Edit only (the Add call is commented out); Delete logs nothing.
  workReport: true,
  workReportOn: { add: false, delete: false },

  validate: (f) => (trimmed(f.PName) === '' ? 'Please Enter Party Name' : ''),

  newDefaults: async () => ({ BlockParty: 'No' }),
  async recordExtras(db, id) {
    const { rows } = await sql<{ b: boolean | null }>`
      SELECT IsBlocked AS b FROM PartyM WHERE partyMkm = ${id}`.execute(db);
    return { BlockParty: rows[0]?.b ? 'Yes' : 'No' };
  },

  async save(trx, user, id, f) {
    const old =
      id > 0
        ? (
            await sql<{
              txtAddress: string | null;
              IsBlocked: boolean | null;
              BlockReason: string | null;
            }>`
              SELECT txtAddress, IsBlocked, BlockReason FROM PartyM WHERE partyMkm = ${id}`.execute(
              trx,
            )
          ).rows[0]
        : undefined;
    const addressRows = grid(f, 'AddressTran');
    const relationRows = grid(f, 'RelationTran');
    const depositRows = grid(f, 'DepositTran');
    const anyaRows = grid(f, 'AnyaNameTran');
    const blocking = mayBlock(user.userType);
    const v = {
      PrefixNm: trimmed(f.PrefixNm),
      PName: trimmed(f.PName),
      ShortNm: trimmed(f.ShortNm),
      Sampradaykt: val(f.Sampradaykt),
      Gurukt: val(f.Gurukt),
      Categorykt: val(f.Categorykt),
      Mixsign: trimmed(f.Mixsign),
      refrence: trimmed(f.refrence),
      Remark: trimmed(f.Remark),
      MRecNo: val(f.MRecNo),
      GroupNo: val(f.GroupNo),
      MasterKt: val(f.MasterKt),
      UplevelKt: val(f.UplevelKt),
      // The desktop reads txtUpSeq.Tag, which nothing sets, so every save wrote 0; the box's
      // text is saved here.
      UpSeq: val(f.UpSeq),
      Website: trimmed(f.Website),
      txtAddress:
        addressRows && addressRows.length > 0 ? addressText(addressRows) : (old?.txtAddress ?? ''),
      // cmbBlockParty / txtBlockReason are enabled for AMaster only; nobody else can change them.
      IsBlocked: blocking ? trimmed(f.BlockParty) === 'Yes' : Boolean(old?.IsBlocked),
      BlockReason: blocking ? trimmed(f.BlockReason) : (old?.BlockReason ?? ''),
    };

    if (id > 0) {
      // DeleteTransaction: a popup's rows go when its box was emptied or it was saved.
      if (trimmed(f.AddressTran) === '' || (addressRows?.length ?? 0) > 0)
        await sql`DELETE FROM PrakMAddT WHERE partyMkt = ${id}`.execute(trx);
      if (trimmed(f.RelationTran) === '' || (relationRows?.length ?? 0) > 0)
        await sql`DELETE FROM PartyMRelT WHERE PartyMKt = ${id}`.execute(trx);
      if (trimmed(f.DepositTran) === '' || (depositRows?.length ?? 0) > 0)
        await sql`DELETE FROM PartyDepositT WHERE PartyMKt = ${id}`.execute(trx);
      await sql`
        UPDATE PartyM SET PrefixNm = ${v.PrefixNm}, PName = ${v.PName}, ShortNm = ${v.ShortNm},
          Sampradaykt = ${v.Sampradaykt}, Gurukt = ${v.Gurukt}, Categorykt = ${v.Categorykt},
          Mixsign = ${v.Mixsign}, refrence = ${v.refrence}, Remark = ${v.Remark}, MRecNo = ${v.MRecNo},
          GroupNo = ${v.GroupNo}, MasterKt = ${v.MasterKt}, UplevelKt = ${v.UplevelKt}, UpSeq = ${v.UpSeq},
          Website = ${v.Website}, txtAddress = ${v.txtAddress}, IsBlocked = ${v.IsBlocked},
          BlockReason = ${v.BlockReason}, moduser = ${user.id}, moddate = GETDATE()
        WHERE partyMkm = ${id}
      `.execute(trx);
    }
    const partyId =
      id > 0
        ? id
        : await insertWithMaxId(trx, 'PartyM', 'partyMkm', (newId) =>
            sql`
              INSERT INTO PartyM (partyMkm, PrefixNm, PName, ShortNm, Sampradaykt, Gurukt, Categorykt, Mixsign,
                refrence, Remark, MRecNo, GroupNo, MasterKt, UplevelKt, UpSeq, Website, txtAddress, IsBlocked,
                BlockReason, enuser, endate)
              VALUES (${newId}, ${v.PrefixNm}, ${v.PName}, ${v.ShortNm}, ${v.Sampradaykt}, ${v.Gurukt},
                ${v.Categorykt}, ${v.Mixsign}, ${v.refrence}, ${v.Remark}, ${v.MRecNo}, ${v.GroupNo},
                ${v.MasterKt}, ${v.UplevelKt}, ${v.UpSeq}, ${v.Website}, ${v.txtAddress}, ${v.IsBlocked},
                ${v.BlockReason}, ${user.id}, GETDATE())
            `.execute(trx),
          );

    // PrakMastRepository.SavePrakMAddT
    for (const r of addressRows ?? []) {
      await sql`
        INSERT INTO PrakMAddT (PrakMastKt, PartyMKt, Magazinekt, AuthorCoKt, PrakashakName, address, citykt,
          StateKt, pincode, phoneno, email, remark, category, seq, Pname, MobName, MobileNo)
        VALUES (0, ${partyId}, 0, 0, ${text(get(r, 'PrakashakName'))}, ${text(get(r, 'address')).trim()},
          ${int(get(r, 'citykt'))}, ${int(get(r, 'statekt'))}, ${text(get(r, 'pincode'))},
          ${text(get(r, 'phoneno')).trim()}, ${text(get(r, 'email')).trim()}, ${text(get(r, 'remark')).trim()},
          ${int(get(r, 'category'))}, ${int(get(r, 'seq'))}, ${text(get(r, 'Pname')).trim()},
          ${text(get(r, 'MobName')).trim()}, ${text(get(r, 'MobileNo')).trim()})
      `.execute(trx);
    }

    for (const r of relationRows ?? []) {
      await insertWithMaxId(trx, 'PartyMRelT', 'partyMRelkm', (relId) =>
        sql`
          INSERT INTO PartyMRelT (partyMRelkm, TableNm, TableId, Remark, partyMkt)
          VALUES (${relId}, ${text(get(r, 'TableNm')).trim()}, ${int(get(r, 'TableId'))},
                  ${text(get(r, 'Remark')).trim()}, ${partyId})
        `.execute(trx),
      );
    }

    if (depositRows && depositRows.length > 0) {
      // SrNo runs across every party: a row without one takes the next after the largest.
      let srNo = Number(
        (
          await sql<{ n: number }>`
            SELECT ISNULL(MAX(SrNo), 0) AS n FROM PartyDepositT WITH (UPDLOCK, HOLDLOCK)`.execute(
            trx,
          )
        ).rows[0]!.n,
      );
      for (const r of depositRows) {
        let rowSr = int(get(r, 'SrNo'));
        if (rowSr === 0) rowSr = ++srNo;
        await sql`
          INSERT INTO PartyDepositT (PartyMKt, DepositDate, creditamt, debitAmt, SrNo)
          VALUES (${partyId}, ${depositDate(get(r, 'DepositDate'))}, ${val(get(r, 'CreditAmt'))},
                  ${val(get(r, 'DebitAmt'))}, ${rowSr})
        `.execute(trx);
      }
    }

    // The Anya Name popup, when it was opened: upsert by key, then drop the rows it no longer has.
    if (anyaRows) {
      const kept: number[] = [];
      for (const r of anyaRows) {
        const key = int(get(r, 'PartyMAnyNmKm'));
        if (key <= 0) {
          const { rows } = await sql<{ id: number }>`
            INSERT INTO PartyMAnayNmT (PartyMKt, AnyaNm, BookTKt, PageNo, Seq, EnUser, EnDate)
            OUTPUT INSERTED.PartyMAnyNmKm AS id
            VALUES (${partyId}, ${text(get(r, 'AnyaNm'))}, ${int(get(r, 'BookTKt'))}, ${text(get(r, 'PageNo'))},
                    ${int(get(r, 'seq'))}, ${user.id}, GETDATE())
          `.execute(trx);
          kept.push(Number(rows[0]!.id));
        } else {
          await sql`
            UPDATE PartyMAnayNmT SET AnyaNm = ${text(get(r, 'AnyaNm'))}, BookTKt = ${int(get(r, 'BookTKt'))},
              PageNo = ${text(get(r, 'PageNo'))}, Seq = ${int(get(r, 'seq'))}, moduser = ${user.id}, moddate = GETDATE()
            WHERE PartyMAnyNmKm = ${key} AND PartyMKt = ${partyId}
          `.execute(trx);
          kept.push(key);
        }
      }
      await sql`
        DELETE FROM PartyMAnayNmT WHERE PartyMKt = ${partyId} AND PartyMAnyNmKm NOT IN ${idList([0, ...kept])}
      `.execute(trx);
    }
    return partyId;
  },

  async checkInUse(db, id) {
    for (const [query, message] of IN_USE) if ((await count(db, query(id))) > 0) return message;
    return '';
  },

  /**
   * Delete: DeleteTransaction with every box blank, then the record. The desktop deletes the
   * Anya Name rows only when that popup had been opened; they are always deleted here, so none
   * is left pointing at a deleted party.
   */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM PrakMAddT WHERE partyMkt = ${id}`.execute(trx);
    await sql`DELETE FROM PartyMRelT WHERE PartyMKt = ${id}`.execute(trx);
    await sql`DELETE FROM PartyDepositT WHERE PartyMKt = ${id}`.execute(trx);
    await sql`DELETE FROM PartyMAnayNmT WHERE PartyMKt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM PartyM WHERE partyMkm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  trans: {
    AddressTran: ADDRESS_TRANS,
    // TranName "Relation" (SetForm_PartyM)
    RelationTran: {
      lookups: {
        tablenm: (db) =>
          pickListOf(db, sql`SELECT columnmastkm, Name FROM ColumnMaster WHERE Vibhag = 'TableNm'`),
        tableid: (db, row) => {
          const query = RELATION_TABLES[trimmed(row.TableNm).toLowerCase()];
          return query ? pickListOf(db, query) : Promise.resolve({ columns: [], rows: [] });
        },
      },
    },
    // TranName "Deposit" (SetForm_PartyM): its date cell asks with an InputBox, no lists.
    DepositTran: {},
    // TranName "AnyName" (SetForm_PartyM)
    AnyaNameTran: {
      lookups: {
        libno: (db) =>
          pickListOf(
            db,
            sql`SELECT Tid, LibNo, BookM.BookName + CASE WHEN ISNULL(BookM.part, '') = '' THEN '' ELSE ' ' + BookM.Part END AS BookName,
                  BookM.txtPrakashak AS Prakashak, BookM.txtAuthor AS AuthorName, BookM.PSamvatVK AS Samvat
                FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm
                WHERE ISNULL(LibNo, '') <> '' ORDER BY Libno`,
          ),
      },
    },
  },

  actions: {
    // Send To › …
    'send-to-book': (db, _user, ids) =>
      openInUse(
        db,
        'book-master',
        sql<{ id: number }>`SELECT DISTINCT BT.BookMastkt AS id FROM BookM BM
          INNER JOIN BookT BT ON BM.BookMastKm = BT.BookMastKt LEFT JOIN praptitran P ON P.tid = BT.tid
          WHERE P.prapticokt IN ${idList(ids)} OR BM.bhandarcokt IN ${idList(ids)}`,
        'No Record Found',
      ),
    /** BookT: frmBookTranNew with strTid (the client opens its Library No dialog). */
    'send-to-book-t': (db, _user, ids) =>
      openInUse(
        db,
        'book-tran',
        sql<{
          id: number;
        }>`SELECT DISTINCT BT.Tid AS id FROM praptitran P INNER JOIN BookT BT ON P.tid = BT.tid
          WHERE P.prapticokt IN ${idList(ids)}`,
        'No Record Found',
      ),
    'send-to-kruti': (db, _user, ids) =>
      openInUse(
        db,
        'kruti-master',
        sql<{
          id: number;
        }>`SELECT DISTINCT krutimstkt AS id FROM krutireflibno WHERE bhandarkt IN ${idList(ids)}`,
        'No Record Found',
      ),
    /**
     * IssueTran: "Only Party (Yes) / Only Ref Party (No) / Both (Cancel)"; frmIssueTran gets
     * the WhereCondition, here the ids it selects.
     */
    async 'send-to-issue'(db, _user, ids, ctx): Promise<ActionResult> {
      const mode = String(ctx.params.mode ?? 'both');
      const where =
        mode === 'party'
          ? sql`Party_Cokt IN ${idList(ids)}`
          : mode === 'ref'
            ? sql`Ref_partykt IN ${idList(ids)}`
            : sql`(Party_Cokt IN ${idList(ids)} OR Ref_partykt IN ${idList(ids)})`;
      return openInUse(
        db,
        'issue-master',
        sql<{ id: number }>`SELECT IssueTranKm AS id FROM IssueTran WHERE ${where}`,
        'No Record Found',
      );
    },
    'send-to-inward': (db, _user, ids) =>
      openInUse(
        db,
        'inward-master',
        sql<{ id: number }>`SELECT DISTINCT inwordkm AS id FROM InwordM
          WHERE forkt IN ${idList(ids)} OR fromkt IN ${idList(ids)}`,
        'No Record Found',
      ),
    'send-to-work-given': (db, _user, ids) =>
      openInUse(
        db,
        'work-given-master',
        sql<{ id: number }>`SELECT DISTINCT WorkGivenMkm AS id FROM WorkGivenM
          WHERE Assignedbykt IN ${idList(ids)} OR AssignedTokt IN ${idList(ids)}`,
        'No Record Found',
      ),
    'send-to-prakashan-list': (db, _user, ids) =>
      openInUse(
        db,
        'book-master-anya-bhandar',
        sql<{
          id: number;
        }>`SELECT prakshnlistnokm AS id FROM praksnlistAnyaBndrM WHERE bhandarkt IN ${idList(ids)}`,
        'No Record Found',
      ),
    'send-to-outsider': (db, _user, ids) =>
      openInUse(
        db,
        'outsider-master',
        sql<{ id: number }>`SELECT OutsiderMkm AS id FROM OutsiderM
          WHERE partymkt IN ${idList(ids)} OR attendedbykt IN ${idList(ids)}
             OR DemandApprovedbykt IN ${idList(ids)} OR WorkDonebykt IN ${idList(ids)}`,
        'No Record Found',
      ),
  },
};
