import {
  type GridRow,
  type GridValue,
  type PrintBlock,
  type PrintField,
  issueKeptColumns,
} from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { type Executor, serverNow } from '../../db/legacy-sql.js';
import { val } from './bhasha.js';
import { ids as idsOf, int, list, scalar, text } from './book-common.js';
import { isFirstBook } from './book-tran.js';
import { ids0, intOf, overflowMessage, printDocument } from './letter-common.js';
import { pickerDate, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Issue › Issue Master (frmIssueTran, "Issue Register"; IssueTranRepository). Table IssueTran,
 * IDENTITY key IssueTranKm (~139k rows), one row per issued LibNo or Patrika, grouped into slips.
 * Locked bit (a returned row is saved Locked). See docs/screens/issue-master.md.
 */

/** The form's JoinCond: tblSearch's ConfmMarkkt column reads `ConMark.Name`. */
const JOIN = ' LEFT JOIN ColumnMaster AS ConMark ON ConMark.ColumnMastKm=IssueTran.ConfmMarkkt';

/** nvarchar sizes the desktop lets SQL Server throw on, with the form's labels. */
const TEXT_LIMITS: [column: string, label: string, max: number][] = [
  ['party_add', 'Party Address', 550],
  ['slipno', 'Slip No', 40],
  ['ConfmReport', 'Confirm Report', 150],
  ['ActionReport', 'Action Report', 150],
  ['remark', 'Remark', 3000],
  ['AnkNo', 'Ank', 500],
];

/** The six-month count (Txt_KeyDown / Save): open, not lost, due more than six months ago. */
const sixMonthWhere = (who: RawBuilder<unknown>) => sql`
  SELECT COUNT(*) FROM issuetran INNER JOIN columnmaster ON issuetran.ConfmMarkkt = columnmaster.ColumnMastkm
  WHERE ${who} AND ISNULL(returned, 0) = 0 AND columnmaster.Name NOT LIKE 'lost%'
    AND DATEDIFF(MONTH, due_date, GETDATE()) > 6`;

/** GetMaxIssueNo: "I" + MAX(RIGHT(issue_no, 9)) + 1 zero-padded to 9; '' past 9 digits. */
async function nextIssueNo(db: Executor, lock = false): Promise<string> {
  const { rows } = await (
    lock
      ? sql<{
          m: string | null;
        }>`SELECT MAX(RIGHT(issue_no, 9)) AS m FROM IssueTran WITH (UPDLOCK, HOLDLOCK)`
      : sql<{ m: string | null }>`SELECT MAX(RIGHT(issue_no, 9)) AS m FROM IssueTran`
  ).execute(db);
  const n = Math.trunc(Number(rows[0]?.m ?? 0) || 0) + 1;
  const digits = String(n);
  return digits.length > 9 ? '' : `I${digits.padStart(9, '0')}`;
}

/** The slip generator (txtslipno's F2): the letter's next number. */
async function nextSlipNo(db: Executor, letter: string, lock = false): Promise<number> {
  const like = `${letter} %`;
  const { rows } = await (
    lock
      ? sql<{ n: number }>`
          SELECT ISNULL(MAX(CAST(SUBSTRING(slipno, 3, LEN(slipno) - 1) AS INTEGER)), 0) + 1 AS n
          FROM IssueTran WITH (UPDLOCK, HOLDLOCK) WHERE slipno LIKE ${like}`
      : sql<{ n: number }>`
          SELECT ISNULL(MAX(CAST(SUBSTRING(slipno, 3, LEN(slipno) - 1) AS INTEGER)), 0) + 1 AS n
          FROM IssueTran WHERE slipno LIKE ${like}`
  ).execute(db);
  return Number(rows[0]?.n ?? 1);
}

const SLIP_LETTERS = ['J', 'R', 'D'];

/** A MaskedTextBox "00/00/0000" (dd/MM/yyyy): the date when MaskCompleted, else NULL. */
function maskedDate(v: unknown, label: string): string | null {
  const s = trimmed(v);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso)
    throw new BadRequestException(`${label} is not a valid date`);
  return iso;
}

/** IsNumeric on the trimmed text (VB accepts group separators and a sign). */
const isNumeric = (s: string) => s !== '' && Number.isFinite(Number(s.replace(/,/g, '')));

/** Return Date search: "dd/MM/yyyy HH:mm:ss" as an ISO datetime, or null. */
function rangeDate(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`;
  return Number.isNaN(Date.parse(`${iso}Z`)) ? null : iso;
}

const RETURN_DATE_FORMAT =
  'Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015 00:00:00 - 31/12/2015 23:00:00)';

const message = (m: string): ActionResult => ({ kind: 'message', message: m });

/** The selected rows' own columns. */
async function issueRows(db: Executor, ids: readonly number[]) {
  const { rows } = await sql<{
    id: number;
    entrcodekt: number | null;
    party_cokt: number | null;
    Ref_partykt: number | null;
  }>`
    SELECT IssueTranKm AS id, entrcodekt, party_cokt, Ref_partykt FROM IssueTran
    WHERE IssueTranKm IN ${ids0([...ids])}
  `.execute(db);
  return rows;
}

const fmtDate = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

type SlipRow = {
  IssueTranKm: number;
  slipno: string | null;
  issue_date: Date | null;
  due_date: Date | null;
  PartyName: string | null;
  PartyAdd: string | null;
  MobileNo: string | null;
  RefPartyName: string | null;
  RefAdd: string | null;
  LibNo: string | null;
  BookName: string | null;
  AnkNo: string | null;
  PatrikaNo: string | null;
  returned: boolean | null;
  returndate: Date | null;
  Searcher: string | null;
};

export const issueMaster: ScreenDefinition = {
  screen: 'issue-master',
  table: 'IssueTran',
  primaryColumn: 'IssueTranKm',
  lockable: true,
  // Save writes Locked = returned: a returned row gets the Locked toolbar.
  lockedColumns: ['Locked'],
  listJoin: JOIN,
  // GetDataTableById(…, JoinCond): ConfmMarkName needs the join in the record query too.
  recordJoin: true,
  defaultCondition: sql`ISNULL(Returned, 0) = 0 AND ISNULL(ConMark.Name, '') NOT LIKE 'Lost%'`,
  // Show All Records loads the whole table on the desktop (~139k rows): the web shows the newest
  // 10000. The default grid (~6.7k open rows) fits under the same cap.
  listLimit: 10000,
  // insertworkreports runs after an Edit only.
  workReport: true,
  workReportOn: { add: false, edit: true, delete: false },

  /** IssueTranRepository.GetValidationMessage, in order, then the overflows SQL would throw. */
  validate(f) {
    if (val(f.party_cokt) === 0) return 'Please Enter Party Name';
    if (val(f.entrcodekt) === 0 && val(f.PatrikaKt) === 0) return 'Please Enter LibNo';
    const mobile = trimmed(f.MobileNo);
    if (mobile !== '' && (mobile.length !== 10 || !isNumeric(mobile)))
      return 'Please Enter MobileNo in Proper Format(10 digit)';
    if (val(f.SearcherKt) === 0) return 'Please Enter Searcher';
    return overflowMessage(f, TEXT_LIMITS, [['Amout', 'Amount']]);
  },

  /** btnNew_Click: the next IssueNo (shown only; Save takes its own), today, +90, the user. */
  async newDefaults(db, user) {
    const { date } = await serverNow(db);
    const due = new Date(`${date}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 90);
    return {
      issue_no: await nextIssueNo(db),
      issue_date: date,
      due_date: due.toISOString().slice(0, 10),
      returned: 'No',
      Adey: 'False',
      ...(user ? { SearcherKt: user.id, SearcherName: user.username } : {}),
    };
  },

  /** FillData: txtRef_add is the ref party's PartyM.txtAddress (never saved). */
  async recordExtras(db, id) {
    const address = await scalar(
      db,
      sql`SELECT p.txtAddress FROM IssueTran i INNER JOIN PartyM p ON p.partyMkm = i.Ref_partykt
        WHERE i.IssueTranKm = ${id}`,
    );
    return { Ref_add: text(address) };
  },

  /**
   * dgMain_CellFormatting's per-cell query, once per list: `HasLost` = the party has an
   * unreturned lost row as party, or the ref party one as ref party.
   */
  async decorateList(db, rows) {
    if (rows.length === 0) return rows;
    const { rows: lost } = await sql<{ p: number | null; r: number | null }>`
      SELECT DISTINCT IssueTran.party_cokt AS p, IssueTran.Ref_partykt AS r
      FROM IssueTran INNER JOIN columnmaster ON IssueTran.ConfmMarkkt = columnmaster.ColumnMastkm
      WHERE ISNULL(IssueTran.returned, 0) = 0 AND columnmaster.Name LIKE 'Lost%'
    `.execute(db);
    const parties = new Set(lost.map((l) => Number(l.p ?? 0)));
    const refs = new Set(lost.map((l) => Number(l.r ?? 0)).filter((n) => n !== 0));
    const get = (row: GridRow, name: string) => {
      const k = Object.keys(row).find((c) => c.toLowerCase() === name.toLowerCase());
      return k === undefined ? 0 : Number(row[k] ?? 0) || 0;
    };
    return rows.map((row) => ({
      ...row,
      HasLost: parties.has(get(row, 'party_cokt')) || refs.has(get(row, 'Ref_partykt')) ? 1 : 0,
    }));
  },

  /**
   * IssueTranRepository.Save. Fixes: IssueNo and a new slip's number are taken inside the
   * transaction (UPDLOCK); an Edit keeps the columns FillData made ReadOnly / disabled (checked
   * here too); UpdateSameSlipRecords runs in the same transaction, never for a blank slip.
   */
  async save(trx, user, id, f) {
    const v = {
      issue_date: pickerDate(f.issue_date),
      due_date: pickerDate(f.due_date),
      returned: trimmed(f.returned) === 'Yes',
      returndate: maskedDate(f.returndate, 'Return Date'),
      party_cokt: val(f.party_cokt),
      party_add: trimmed(f.party_add),
      entrcodekt: val(f.entrcodekt),
      MobileNo: trimmed(f.MobileNo),
      slipno: trimmed(f.slipno),
      ConfmMarkkt: val(f.ConfmMarkkt),
      ConfmReport: trimmed(f.ConfmReport),
      ConfmBykt: val(f.ConfmBykt),
      Confmdt: maskedDate(f.Confmdt, 'Confirm Date'),
      replacebykt: val(f.replacebykt),
      ActionReport: trimmed(f.ActionReport),
      ActionDt: maskedDate(f.ActionDt, 'Action Date'),
      receivedFromKt: val(f.receivedFromKt),
      CostBearBykt: val(f.CostBearBykt),
      Amout: intOf(f.Amout),
      Ref_partykt: val(f.Ref_partykt),
      remark: trimmed(f.remark),
      BookMastkt: val(f.BookMastKt),
      SearcherKt: val(f.SearcherKt),
      Adey: f.Adey === true || trimmed(f.Adey) === 'True',
      AnkNo: trimmed(f.AnkNo),
      PatrikaKt: val(f.PatrikaKt),
    };
    if (id > 0) {
      const { rows } = await sql<GridRow>`
        SELECT * FROM IssueTran WITH (UPDLOCK) WHERE IssueTranKm = ${id}
      `.execute(trx);
      const old = rows[0];
      if (!old) throw new BadRequestException('Record not found');
      // FillData's ReadOnly / disabled boxes: an Edit cannot change them.
      const { date } = await serverNow(trx);
      const now: Record<string, unknown> = v;
      for (const column of issueKeptColumns(old, date)) {
        const key = Object.keys(now).find((k) => k.toLowerCase() === column.toLowerCase())!;
        const stored = Object.keys(old).find((k) => k.toLowerCase() === column.toLowerCase())!;
        const same =
          column === 'slipno'
            ? trimmed(old[stored]) === trimmed(now[key])
            : Number(old[stored] ?? 0) === Number(now[key] ?? 0);
        if (!same) throw new BadRequestException(`${column} cannot be changed for this record`);
      }
      await sql`
        UPDATE IssueTran SET issue_date = ${v.issue_date}, returned = ${v.returned}, due_date = ${v.due_date},
          party_cokt = ${v.party_cokt}, entrcodekt = ${v.entrcodekt}, MobileNo = ${v.MobileNo},
          slipno = ${v.slipno}, ConfmMarkkt = ${v.ConfmMarkkt}, ConfmReport = ${v.ConfmReport},
          ConfmBykt = ${v.ConfmBykt}, replacebykt = ${v.replacebykt}, ActionReport = ${v.ActionReport},
          receivedFromKt = ${v.receivedFromKt}, CostBearBykt = ${v.CostBearBykt}, Amout = ${v.Amout},
          Ref_partykt = ${v.Ref_partykt}, remark = ${v.remark}, moduser = ${user.id}, moddate = GETDATE(),
          Locked = ${v.returned}, party_add = ${v.party_add}, BookMastkt = ${v.BookMastkt},
          SearcherKt = ${v.SearcherKt}, Adey = ${v.Adey}, AnkNo = ${v.AnkNo}, PatrikaKt = ${v.PatrikaKt},
          returndate = ${v.returndate}, Confmdt = ${v.Confmdt}, ActionDt = ${v.ActionDt}
        WHERE IssueTranKm = ${id}
      `.execute(trx);
      // UpdateSameSlipRecords: a changed party / ref party goes to the slip's other rows.
      let msg: string | undefined;
      const changed =
        Number(old.party_cokt ?? 0) !== v.party_cokt ||
        Number(old.Ref_partykt ?? 0) !== v.Ref_partykt;
      if (changed && v.slipno !== '') {
        const { numAffectedRows } = await sql`
          UPDATE IssueTran SET party_cokt = ${v.party_cokt}, Ref_partykt = ${v.Ref_partykt}
          WHERE slipno = ${v.slipno} AND IssueTranKm <> ${id}
        `.execute(trx);
        const c = Number(numAffectedRows ?? 0);
        if (c > 0) msg = `(${c}) Records updated for SlipNo -${v.slipno}`;
      }
      return msg ? { id, message: msg } : id;
    }
    // A slip from the generator (NewSlip = its letter): its number is taken now.
    const letter = trimmed(f.NewSlip).toUpperCase();
    if (SLIP_LETTERS.includes(letter) && new RegExp(`^${letter} \\d+$`).test(v.slipno))
      v.slipno = `${letter} ${await nextSlipNo(trx, letter, true)}`;
    const issueNo = await nextIssueNo(trx, true);
    const { rows } = await sql<{ id: number }>`
      INSERT INTO IssueTran (issue_no, issue_date, returned, due_date, party_cokt, entrcodekt, MobileNo,
        slipno, ConfmMarkkt, ConfmReport, ConfmBykt, replacebykt, ActionReport, receivedFromKt,
        CostBearBykt, Amout, Ref_partykt, remark, enuser, endate, Locked, party_add, BookMastkt,
        SearcherKt, Adey, AnkNo, PatrikaKt, returndate, Confmdt, ActionDt)
      OUTPUT INSERTED.IssueTranKm AS id
      VALUES (${issueNo}, ${v.issue_date}, ${v.returned}, ${v.due_date}, ${v.party_cokt}, ${v.entrcodekt},
        ${v.MobileNo}, ${v.slipno}, ${v.ConfmMarkkt}, ${v.ConfmReport}, ${v.ConfmBykt}, ${v.replacebykt},
        ${v.ActionReport}, ${v.receivedFromKt}, ${v.CostBearBykt}, ${v.Amout}, ${v.Ref_partykt},
        ${v.remark}, ${user.id}, GETDATE(), ${v.returned}, ${v.party_add}, ${v.BookMastkt},
        ${v.SearcherKt}, ${v.Adey}, ${v.AnkNo}, ${v.PatrikaKt}, ${v.returndate}, ${v.Confmdt}, ${v.ActionDt})
    `.execute(trx);
    return Number(rows[0]!.id);
  },

  f2: {
    /**
     * txtentrcodekt: M0 numbers always; never OB/EB/SN/WB/YB/HY; the rest only when not issued.
     * Columns Tid, LibNo, BookMastKm, BookName (the form reads them by position). The desktop's
     * `tid NOT IN (SELECT entrcodekt …)` as NOT EXISTS: the same rows, in 1.5 s instead of 2 min.
     */
    entrcodekt: list(sql`
      SELECT Tid, LibNo, BookMastKm, LTRIM(RTRIM(BookM.BookName + ' ' + ISNULL(BookM.Part, ''))) AS BookName
      FROM BookT INNER JOIN BookM ON BookMastkm = BookMastkt
        INNER JOIN bookmast ON BookT.SeriesKt = bookmast.bookcodekm
      WHERE ((bookmast.bookprefix = 'M0') OR (bookmast.bookprefix NOT IN ('OB', 'EB', 'SN', 'WB', 'YB', 'HY')
        AND NOT EXISTS (SELECT 1 FROM issuetran i WHERE i.entrcodekt = BookT.tid AND ISNULL(i.returned, 0) = 0)))`),
    patrikakt: list(sql`SELECT Patrikakm, RecordNo FROM Patrika ORDER BY RecordNo`),
    /**
     * txtparty_cokt. Columns: partyMkm, PName, MobileNo, txtAddress, sampraday, guru, catagory,
     * Mrecno, refrence, ClosingBalance, IsBlocked.
     */
    party_cokt: list(sql`
      SELECT partyMkm, PName,
        (SELECT TOP (1) MobileNo FROM PrakMAddT WHERE ISNULL(MobileNo, '') <> '' AND partyMkt = p.partyMkm) MobileNo,
        txtAddress, v1.SampradayName sampraday, v2.Vishesh guru, v3.Vishesh catagory, ISNULL(Mrecno, 0) Mrecno,
        p.refrence,
        (SELECT ISNULL(SUM(creditamt) - SUM(debitamt), 0) FROM PartyDepositT WHERE PartyMKt = p.PartyMKm) AS ClosingBalance,
        CAST(ISNULL(p.IsBlocked, 0) AS INT) AS IsBlocked
      FROM PartyM p LEFT OUTER JOIN Sampraday v1 ON v1.SampradayKm = p.Sampradaykt
        LEFT OUTER JOIN visheshMast v2 ON v2.tid = p.Gurukt LEFT OUTER JOIN visheshMast v3 ON v3.tid = p.Categorykt
      ORDER BY PName`),
    /** txtRef_partykt. Columns: partyMkm, PName, txtAddress, …, IsBlocked (index 8). */
    ref_partykt: list(sql`
      SELECT partyMkm, PName, txtAddress, v1.SampradayName sampraday, v2.Vishesh guru, v3.Vishesh catagory,
        ISNULL(Mrecno, 0) Mrecno, p.refrence, CAST(ISNULL(p.IsBlocked, 0) AS INT) AS IsBlocked
      FROM PartyM p LEFT OUTER JOIN Sampraday v1 ON v1.SampradayKm = p.Sampradaykt
        LEFT OUTER JOIN visheshMast v2 ON v2.tid = p.Gurukt LEFT OUTER JOIN visheshMast v3 ON v3.tid = p.Categorykt
      ORDER BY PName`),
    /** txtMobileNo: the party's mobile numbers (no party: an empty list; the desktop errs). */
    mobileno: (db, params) =>
      int(params.party) > 0
        ? list(sql`SELECT MobileNo FROM PrakMAddT WHERE partyMkt = ${int(params.party)}`)(db)
        : Promise.resolve({ columns: ['MobileNo'], rows: [] }),
    party_add: (db, params) =>
      int(params.party) > 0
        ? list(
            sql`SELECT address FROM PrakMAddT WHERE partyMkt = ${int(params.party)} AND ISNULL(address, '') <> ''`,
          )(db)
        : Promise.resolve({ columns: ['address'], rows: [] }),
    /** txtslipno: the series letter; the number comes after the pick (next-slip). */
    slipno: list(sql`SELECT 'J' AS SlipNo UNION SELECT 'R' AS SlipNo UNION SELECT 'D' AS SlipNo`),
  },

  lists: {
    /** Replace LibNo: every LibNo (no issued / series / lab exclusions, as on the desktop). */
    'replace-libnos': list(sql`
      SELECT Tid, LibNo, BookMastKm, BookName FROM BookT INNER JOIN BookM ON BookMastkm = BookMastkt
      WHERE ISNULL(BookT.Libno, '') <> '' ORDER BY Libno`),
    /** Search By "Returned". */
    'returned-values': list(sql`SELECT 0 AS Id, 0 AS Returned UNION SELECT 1 AS Id, 1 AS Returned`),
  },

  actions: {
    /** After a LibNo pick: lab-issue use (DlvrPen 9635 / RetPen 9637) and the Kruti first book. */
    async 'check-libno'(db, _user, _ids, ctx): Promise<ActionResult> {
      const tid = int(ctx.params.tid);
      const lab = Number(
        (await scalar(
          db,
          sql`SELECT COUNT(LabIssueMkm) FROM LabIssueM WHERE BookTKt = ${tid} AND Type = 'Book' AND Statuskt IN (9635, 9637)`,
        )) ?? 0,
      );
      return {
        kind: 'form',
        fields: { lab, firstBook: lab > 0 ? 0 : (await isFirstBook(db, tid)) ? 1 : 0 },
        trans: {},
      };
    },

    /** After a Patrika pick: its lab-issue use. */
    async 'check-patrika'(db, _user, _ids, ctx): Promise<ActionResult> {
      const lab = Number(
        (await scalar(
          db,
          sql`SELECT COUNT(LabIssueMkm) FROM LabIssueM WHERE BookTKt = ${int(ctx.params.patrika)} AND Type = 'Patrika' AND Statuskt IN (9635, 9637)`,
        )) ?? 0,
      );
      return { kind: 'form', fields: { lab }, trans: {} };
    },

    /** After a Party / Ref Party pick: its six-month-old and lost books (as party or ref). */
    async 'party-counts'(db, _user, _ids, ctx): Promise<ActionResult> {
      const id = val(ctx.params.party);
      const who = sql`(issuetran.party_cokt = ${id} OR issuetran.Ref_partykt = ${id})`;
      const six = Number((await scalar(db, sixMonthWhere(who))) ?? 0);
      const lost = Number(
        (await scalar(
          db,
          sql`SELECT COUNT(*) FROM IssueTran INNER JOIN columnmaster ON IssueTran.ConfmMarkkt = columnmaster.ColumnMastkm
            WHERE columnmaster.Name LIKE 'Lost%' AND ${who}`,
        )) ?? 0,
      );
      return { kind: 'form', fields: { six, lost }, trans: {} };
    },

    /** Save(): the party's six-month-old books (as party only) change the question. */
    async 'save-six-month'(db, _user, _ids, ctx): Promise<ActionResult> {
      const id = val(ctx.params.party);
      const six = Number((await scalar(db, sixMonthWhere(sql`issuetran.party_cokt = ${id}`))) ?? 0);
      return { kind: 'form', fields: { six }, trans: {} };
    },

    /** txtslipno after the letter: "<letter> <next> " (the number is taken again on Save). */
    async 'next-slip'(db, _user, _ids, ctx): Promise<ActionResult> {
      const letter = text(ctx.params.letter).trim().toUpperCase();
      if (!SLIP_LETTERS.includes(letter)) return message('');
      return {
        kind: 'form',
        fields: { slipno: `${letter} ${await nextSlipNo(db, letter)} `, NewSlip: letter },
        trans: {},
      };
    },

    /**
     * Utility › Return Selected Record (F6): open rows become returned today, Locked, received by
     * the user. The message counts the rows really returned (the desktop counts the selection).
     */
    async 'return-selected'(db, user, ids): Promise<ActionResult> {
      const { numAffectedRows } = await sql`
        UPDATE IssueTran SET returndate = GETDATE(), returned = 1, Locked = 1, Receiverkt = ${user.id}
        WHERE IssueTranKm IN ${ids0(ids)} AND returned = 0
      `.execute(db);
      const n = Number(numAffectedRows ?? 0);
      return n > 0
        ? { kind: 'refreshed', rows: [], message: `${n} Records Returned Successfully` }
        : message('');
    },

    /**
     * Utility › Replace LibNo For Selected Records: ISSUE_REPLACE_PASSWORD (or the second
     * Security password), then the picked LibNo. Fix: only the LibNo and its Book change (the
     * desktop rewrote the whole row from GetDataById). Without `tid` it answers 'ask-libno'.
     */
    async 'replace-libno'(db, user, ids, ctx): Promise<ActionResult> {
      ctx.assertPassword(ctx.params.password, ctx.env.ISSUE_REPLACE_PASSWORD ?? '');
      if (ids.length === 0) return message('');
      if (ctx.params.tid === undefined) return message('ask-libno');
      const tid = int(ctx.params.tid);
      const book = await scalar(db, sql`SELECT BookMastkt FROM BookT WHERE Tid = ${tid}`);
      if (book === undefined || book === null) return message('');
      const { numAffectedRows } = await sql`
        UPDATE IssueTran SET entrcodekt = ${tid}, BookMastkt = ${int(book)}, moduser = ${user.id}, moddate = GETDATE()
        WHERE IssueTranKm IN ${ids0(ids)}
      `.execute(db);
      return {
        kind: 'refreshed',
        rows: [],
        message: `(${Number(numAffectedRows ?? 0)}) Records Updated Successfully`,
      };
    },

    /** Utility › Show All Records: FillList(False), capped at listLimit. */
    async 'show-all'(_db, _user, _ids, ctx) {
      return { kind: 'list', rows: await ctx.list(sql`1 = 1`, { limit: true }) };
    },

    /** Utility › Show Lost Books (returned or not). */
    async 'show-lost'(_db, _user, _ids, ctx) {
      return { kind: 'list', rows: await ctx.list(sql`ISNULL(ConMark.Name, '') LIKE 'Lost%'`) };
    },

    /** Utility › Show Issued Books Having Single Copy (the desktop's condition, verbatim). */
    async 'show-single-copy'(_db, _user, _ids, ctx) {
      return {
        kind: 'list',
        rows: await ctx.list(sql`Returned <> 1 AND BookMastKt IN (SELECT BookMastkm FROM BookM
          INNER JOIN IssueTran ON BookM.BookMastkm = IssueTran.BookMastKt
          WHERE returned <> 1 AND LEN(txtBookTran) - LEN(REPLACE(txtBookTran, ',', '')) + 1 = 1)`),
      };
    },

    /** Utility › Show Issued Books Having Multiple Copy (verbatim: 3+ copies, all out). */
    async 'show-multi-copy'(_db, _user, _ids, ctx) {
      return {
        kind: 'list',
        rows: await ctx.list(sql`Returned <> 1 AND BookMastKt IN (SELECT BookMastkm FROM BookM
          INNER JOIN IssueTran IT ON BookM.BookMastkm = IT.BookMastKt
          WHERE returned <> 1 AND LEN(txtBookTran) - LEN(REPLACE(txtBookTran, ',', '')) > 1
            AND LEN(txtBookTran) - LEN(REPLACE(txtBookTran, ',', '')) + 1 =
              (SELECT COUNT(*) FROM IssueTran WHERE returned <> 1 AND BookMastkt = IT.BookMastKt))`),
      };
    },

    /** Search By "Return Date" (F2): returndate in the range, without the default condition. */
    async 'search-return-date'(_db, _user, _ids, ctx) {
      const from = rangeDate(text(ctx.params.from));
      const to = rangeDate(text(ctx.params.to));
      if (!from || !to) throw new BadRequestException(RETURN_DATE_FORMAT);
      return {
        kind: 'list',
        rows: await ctx.list(
          sql`returndate BETWEEN CAST(${from} AS datetime) AND CAST(${to} AS datetime)`,
        ),
      };
    },

    /** Search By "Returned" (F2): Returned = the pick, in place of the default condition. */
    async 'search-returned'(_db, _user, _ids, ctx) {
      const returned = int(ctx.params.returned) === 1 ? 1 : 0;
      return { kind: 'list', rows: await ctx.list(sql`Returned = ${returned}`) };
    },

    /** Send To › BookM: the books of the selected rows' LibNos. */
    async 'send-bookm'(db, _user, ids): Promise<ActionResult> {
      const tids = (await issueRows(db, ids)).map((r) => int(r.entrcodekt)).filter((n) => n > 0);
      return {
        kind: 'open',
        screen: 'book-master',
        ids: [
          ...new Set(
            await idsOf(db, sql`SELECT BookMastkt AS id FROM BookT WHERE tid IN ${ids0(tids)}`),
          ),
        ].filter((n) => n > 0),
        emptyMessage: 'No Record Found',
      };
    },

    /** Send To › BookT: the Library No dialog over the selected rows' LibNos. */
    async 'send-bookt'(db, _user, ids): Promise<ActionResult> {
      const tids = (await issueRows(db, ids)).map((r) => int(r.entrcodekt)).filter((n) => n > 0);
      return {
        kind: 'open',
        screen: 'book-tran',
        ids: await idsOf(db, sql`SELECT Tid AS id FROM BookT WHERE tid IN ${ids0(tids)}`),
        emptyMessage: 'No Record Found',
      };
    },

    /** Send To › PartyMaster: `which` = party (Yes), ref (No) or both (Cancel). */
    async 'send-party'(db, _user, ids, ctx): Promise<ActionResult> {
      const which = text(ctx.params.which);
      const rows = await issueRows(db, ids);
      const out = new Set<number>();
      for (const r of rows) {
        if (which !== 'ref') out.add(int(r.party_cokt));
        if (which !== 'party') out.add(int(r.Ref_partykt));
      }
      out.delete(0);
      return {
        kind: 'open',
        screen: 'party-master',
        ids: [...out],
        emptyMessage: 'No Record Found',
      };
    },

    /**
     * Print Report › Issue Slip › All / Issue Only (IssueSlipReport.rpt with SlipNo, IssueTranKm,
     * PrintIssueOnly): the current row's slip, or the row alone when it has none. PROVISIONAL
     * layout (the .rpt is Crystal-encrypted), see letter-common.ts and the note.
     */
    async 'print-slip'(db, _user, ids, ctx): Promise<ActionResult> {
      const id = ids[0] ?? 0;
      const issueOnly = ctx.params.issueOnly === true;
      const slip = text(
        await scalar(db, sql`SELECT slipno FROM IssueTran WHERE IssueTranKm = ${id}`),
      ).trim();
      const { rows } = await sql<SlipRow>`
        SELECT it.IssueTranKm, it.slipno, it.issue_date, it.due_date, p.PName AS PartyName,
          COALESCE(NULLIF(LTRIM(RTRIM(it.party_add)), ''), p.txtAddress) AS PartyAdd,
          LTRIM(RTRIM(it.MobileNo)) AS MobileNo, rp.PName AS RefPartyName, rp.txtAddress AS RefAdd,
          bt.LibNo, LTRIM(RTRIM(bm.BookName + ' ' + ISNULL(bm.Part, ''))) AS BookName, it.AnkNo,
          pt.RecordNo AS PatrikaNo, it.returned, it.returndate, u.uname AS Searcher
        FROM IssueTran it
        LEFT JOIN PartyM p ON p.partyMkm = it.party_cokt
        LEFT JOIN PartyM rp ON rp.partyMkm = it.Ref_partykt
        LEFT JOIN BookT bt ON bt.Tid = it.entrcodekt
        LEFT JOIN BookM bm ON bm.BookMastkm = it.BookMastkt
        LEFT JOIN Patrika pt ON pt.Patrikakm = it.PatrikaKt
        LEFT JOIN Usecurity u ON u.tid = it.SearcherKt
        WHERE ${slip === '' ? sql`it.IssueTranKm = ${id}` : sql`LTRIM(RTRIM(it.slipno)) = ${slip}`}
          AND (${issueOnly ? 1 : 0} = 0 OR ISNULL(it.returned, 0) = 0)
        ORDER BY it.IssueTranKm
      `.execute(db);
      const head = rows[0];
      if (!head) return message('No Record Found');
      const t = (v: unknown) => text(v).trim();
      const party: PrintField[] = [
        { label: 'Party Name', value: t(head.PartyName) },
        { label: 'Party Address', value: t(head.PartyAdd) },
        { label: 'Mobile No', value: t(head.MobileNo) },
      ];
      if (t(head.RefPartyName) !== '') {
        party.push({ label: 'Ref Party', value: t(head.RefPartyName) });
        if (t(head.RefAdd) !== '') party.push({ label: 'Ref Address', value: t(head.RefAdd) });
      }
      const columns = [
        { header: 'LibNo', width: 14 },
        { header: 'Book Name' },
        { header: 'Ank No', width: 12 },
        ...(issueOnly
          ? []
          : [
              { header: 'Returned', width: 10 },
              { header: 'Return Date', width: 14 },
            ]),
      ];
      const cells = (r: SlipRow): GridValue[] => [
        t(r.LibNo) || t(r.PatrikaNo),
        t(r.BookName),
        t(r.AnkNo),
        ...(issueOnly ? [] : [r.returned ? 'Yes' : 'No', fmtDate(r.returndate)]),
      ];
      const blocks: PrintBlock[] = [
        { kind: 'fields', fields: party },
        { kind: 'table', numbered: true, columns, rows: rows.map(cells) },
      ];
      return printDocument('Issue Slip', [
        {
          header: {
            logo: true,
            lines: ['गीतार्थ गंगा', 'Issue Slip'],
            fields: [
              { label: 'Slip No', value: t(head.slipno) },
              { label: 'Issue Date', value: fmtDate(head.issue_date) },
              { label: 'Due Date', value: fmtDate(head.due_date) },
            ],
          },
          blocks,
          footer: [
            `Items: ${rows.length}`,
            `Searcher: ${t(head.Searcher)}`,
            'Party Signature: ____________________      Library Signature: ____________________',
          ],
        },
      ]);
    },
  },
};
