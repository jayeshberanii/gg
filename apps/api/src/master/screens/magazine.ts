import type { FieldValue } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { ADDRESS_TRANS } from './author.js';
import { get, grid, int, list, type Row, text, val } from './book-common.js';
import { openInUse, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

const INT_MAX = 2147483647;

/** The MagazineM text columns and their sizes: the desktop's INSERT fails past them. */
const LENGTHS: [column: string, label: string, max: number][] = [
  ['MName', 'Name', 350],
  ['Series', 'Series', 3],
  ['SeriesRem', 'Series Remark', 50],
  ['FirstYr', 'First Yr', 50],
  ['BreakYr', 'Break Yr', 350],
  ['CloseYr', 'Last Yr', 150],
  ['RegisterNo', 'Register No', 50],
  ['SelectionRem', 'Selection Rem', 150],
  ['AvailableRem', 'Available Rem', 250],
  ['MissingRem', 'Missing Rem', 50],
  ['Remark', 'Remark', 1000],
];

/** The popups' cells and their column sizes (MagBookmT, MagSubscribeT, MagBhashaT). */
const CELL_LENGTHS: Record<string, [cell: string, max: number][]> = {
  BookTran: [
    ['MissingYr', 50],
    ['MissingaAnk', 500],
  ],
  SubscribeTran: [
    ['SType', 50],
    ['SUptoYr', 50],
    ['LavajamType', 50],
    ['Remark', 1000],
  ],
  BhashaTran: [['Remark', 1000]],
};

/**
 * MagSubscribeT.SubDate: the popup's dd/MM/yyyy (the desktop swaps day and month into
 * "MM-dd-yyyy" for SQL Server), as an ISO date; null when blank, undefined when not a date.
 */
function subDate(v: unknown): string | null | undefined {
  const s = trimmed(v);
  if (s === '') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  if (d.getUTCDate() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1) return undefined;
  return d.toISOString().slice(0, 10);
}

/** VB Val() of an int column's text: the desktop's AddWithValue fails past the int range. */
const intVal = (v: unknown) => Math.trunc(val(v));
const outOfInt = (n: number) => n > INT_MAX || n < -INT_MAX - 1;

/**
 * MagazineMRepository.GetValidationMessage ("Please Enter Magazine Name"), then what the
 * desktop's INSERT / UPDATE would fail on ("String or binary data would be truncated", a SubDate
 * that is not dd/MM/yyyy, an int out of range), as messages instead of an aborted save.
 */
function validate(f: Record<string, FieldValue>): string {
  if (trimmed(f.MName) === '') return 'Please Enter Magazine Name';
  for (const [column, label, max] of LENGTHS) {
    if (trimmed(f[column]).length > max) return `${label} cannot be longer than ${max} characters`;
  }
  for (const column of ['FYearVK', 'CYearVK']) {
    if (outOfInt(intVal(f[column]))) return `${column} is too large`;
  }
  for (const [column, cells] of Object.entries(CELL_LENGTHS)) {
    for (const r of grid(f, column) ?? []) {
      for (const [cell, max] of cells) {
        if (text(get(r, cell)).trim().length > max)
          return `${cell} cannot be longer than ${max} characters`;
      }
    }
  }
  for (const r of grid(f, 'SubscribeTran') ?? []) {
    if (subDate(get(r, 'SubDate')) === undefined)
      return `SubDate "${trimmed(get(r, 'SubDate'))}" is not a date (Ex-dd/MM/yyyy)`;
    if (outOfInt(intVal(get(r, 'Amount')))) return 'Amount is too large';
  }
  return '';
}

/** DeleteTransaction for one popup's table: when its box was emptied or its rows were saved. */
async function clearWhen(boxText: unknown, rows: Row[] | null, remove: () => Promise<unknown>) {
  if (trimmed(boxText) === '' || (rows?.length ?? 0) > 0) await remove();
}

/**
 * Library › Magazine Master (frmMagazineMaster, MagazineMRepository). Table MagazineM, IDENTITY
 * key Magazinekm. Locked records open read-only; Save logs Edit only in the work report.
 * Children (PrakMAddT, MagBookmT, MagSubscribeT, MagBhashaT) are deleted and re-inserted when
 * their popup's box changed, in the record's transaction.
 */
export const magazineMaster: ScreenDefinition = {
  screen: 'magazine-master',
  table: 'MagazineM',
  primaryColumn: 'Magazinekm',
  lockable: true,
  lockedColumns: ['Locked'],
  // Save calls insertworkreports after an Edit only; Delete logs nothing.
  workReport: true,
  workReportOn: { add: false, delete: false },

  validate: (f) => validate(f),

  async save(trx, user, id, f) {
    const v = {
      MName: trimmed(f.MName),
      Series: trimmed(f.Series),
      SeriesRem: trimmed(f.SeriesRem),
      MTypekt: intVal(f.MTypekt),
      samvatcokt: intVal(f.samvatcokt),
      FirstYr: trimmed(f.FirstYr),
      FYearVK: intVal(f.FYearVK),
      BreakYr: trimmed(f.BreakYr),
      CloseYr: trimmed(f.CloseYr),
      CYearVK: intVal(f.CYearVK),
      RegisterNo: trimmed(f.RegisterNo),
      SelectionRem: trimmed(f.SelectionRem),
      AvailableRem: trimmed(f.AvailableRem),
      MissingRem: trimmed(f.MissingRem),
      PubStatuskt: intVal(f.PubStatuskt),
      RcvStatuskt: intVal(f.RcvStatuskt),
      SampradayKt: intVal(f.SampradayKt),
      ContactPersonKt: intVal(f.ContactPersonKt),
      Remark: trimmed(f.Remark),
    };
    const address = grid(f, 'AddressTran');
    const books = grid(f, 'BookTran');
    const subscribes = grid(f, 'SubscribeTran');
    const bhashas = grid(f, 'BhashaTran');

    let magId = id;
    if (id > 0) {
      await clearWhen(f.AddressTran, address, () =>
        sql`DELETE FROM PrakMAddT WHERE Magazinekt = ${id}`.execute(trx),
      );
      await clearWhen(f.BookTran, books, () =>
        sql`DELETE FROM MagBookmT WHERE Magazinekt = ${id}`.execute(trx),
      );
      await clearWhen(f.SubscribeTran, subscribes, () =>
        sql`DELETE FROM MagSubscribeT WHERE Magazinekt = ${id}`.execute(trx),
      );
      await clearWhen(f.BhashaTran, bhashas, () =>
        sql`DELETE FROM MagBhashaT WHERE MagazineKt = ${id}`.execute(trx),
      );
      const updated = await sql`
        UPDATE MagazineM SET MName = ${v.MName}, Series = ${v.Series}, SeriesRem = ${v.SeriesRem},
          MTypekt = ${v.MTypekt}, samvatcokt = ${v.samvatcokt}, FirstYr = ${v.FirstYr},
          FYearVK = ${v.FYearVK}, BreakYr = ${v.BreakYr}, CloseYr = ${v.CloseYr}, CYearVK = ${v.CYearVK},
          RegisterNo = ${v.RegisterNo}, SelectionRem = ${v.SelectionRem}, AvailableRem = ${v.AvailableRem},
          MissingRem = ${v.MissingRem}, PubStatuskt = ${v.PubStatuskt}, moduser = ${user.id},
          moddate = GETDATE(), RcvStatuskt = ${v.RcvStatuskt}, SampradayKt = ${v.SampradayKt},
          ContactPersonKt = ${v.ContactPersonKt}, Remark = ${v.Remark}
        WHERE Magazinekm = ${id}
      `.execute(trx);
      if (Number(updated.numAffectedRows ?? 0) === 0)
        throw new BadRequestException('Record not found');
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO MagazineM (MName, Series, SeriesRem, MTypekt, samvatcokt, FirstYr, FYearVK, BreakYr,
          CloseYr, CYearVK, RegisterNo, SelectionRem, AvailableRem, MissingRem, PubStatuskt, enuser,
          endate, RcvStatuskt, SampradayKt, ContactPersonKt, Remark)
        OUTPUT INSERTED.Magazinekm AS id
        VALUES (${v.MName}, ${v.Series}, ${v.SeriesRem}, ${v.MTypekt}, ${v.samvatcokt}, ${v.FirstYr},
          ${v.FYearVK}, ${v.BreakYr}, ${v.CloseYr}, ${v.CYearVK}, ${v.RegisterNo}, ${v.SelectionRem},
          ${v.AvailableRem}, ${v.MissingRem}, ${v.PubStatuskt}, ${user.id}, GETDATE(), ${v.RcvStatuskt},
          ${v.SampradayKt}, ${v.ContactPersonKt}, ${v.Remark})
      `.execute(trx);
      magId = Number(rows[0]!.id);
    }

    // PrakMastRepository.SavePrakMAddT(…, MagazineKt): the form never fills StateKt.
    for (const r of address ?? []) {
      await sql`
        INSERT INTO PrakMAddT (PrakMastKt, PartyMKt, Magazinekt, AuthorCoKt, PrakashakName, address, citykt,
          StateKt, pincode, phoneno, email, remark, category, seq, Pname, MobName, MobileNo)
        VALUES (0, 0, ${magId}, 0, ${text(get(r, 'PrakashakName'))}, ${text(get(r, 'address')).trim()},
          ${int(get(r, 'citykt'))}, 0, ${text(get(r, 'pincode'))}, ${text(get(r, 'phoneno')).trim()},
          ${text(get(r, 'email')).trim()}, ${text(get(r, 'remark')).trim()}, ${int(get(r, 'category'))},
          ${int(get(r, 'seq'))}, ${text(get(r, 'Pname')).trim()}, ${text(get(r, 'MobName')).trim()},
          ${text(get(r, 'MobileNo')).trim()})
      `.execute(trx);
    }
    // SaveMagBookmT
    for (const r of books ?? []) {
      await sql`
        INSERT INTO MagBookmT (Magazinekt, bookmastkt, MissingYr, MissingaAnk)
        VALUES (${magId}, ${int(get(r, 'bookmastkt'))}, ${text(get(r, 'MissingYr')).trim()},
          ${text(get(r, 'MissingaAnk')).trim()})
      `.execute(trx);
    }
    for (const r of subscribes ?? []) {
      await sql`
        INSERT INTO MagSubscribeT (Magazinekt, PartyMkt, SType, SUptoYr, LavajamType, Amount, Remark, SubDate)
        VALUES (${magId}, ${int(get(r, 'PartyMkt'))}, ${text(get(r, 'SType')).trim()},
          ${text(get(r, 'SUptoYr')).trim()}, ${text(get(r, 'LavajamType')).trim()}, ${intVal(get(r, 'Amount'))},
          ${text(get(r, 'Remark')).trim()}, ${subDate(get(r, 'SubDate')) ?? null})
      `.execute(trx);
    }
    for (const r of bhashas ?? []) {
      await sql`
        INSERT INTO MagBhashaT (MagazineKt, BhashaKt, Remark)
        VALUES (${magId}, ${int(get(r, 'BhashaKt'))}, ${text(get(r, 'Remark')).trim()})
      `.execute(trx);
    }
    return magId;
  },

  /**
   * Delete: every child table, then the record, in one transaction. The desktop's
   * DeleteTransaction(…, Nothing, …) threw on the Bhasha text after deleting the other three
   * (left outside any transaction), so MagBhashaT rows were left behind.
   */
  async deleteRecord(trx, _user, id) {
    await sql`DELETE FROM PrakMAddT WHERE Magazinekt = ${id}`.execute(trx);
    await sql`DELETE FROM MagBookmT WHERE Magazinekt = ${id}`.execute(trx);
    await sql`DELETE FROM MagSubscribeT WHERE Magazinekt = ${id}`.execute(trx);
    await sql`DELETE FROM MagBhashaT WHERE MagazineKt = ${id}`.execute(trx);
    const result = await sql`DELETE FROM MagazineM WHERE Magazinekm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  // frmDisplayTransNew.SetForm_MagazineM (s = 0) and SetForm_Common for the Address.
  trans: {
    AddressTran: ADDRESS_TRANS,
    BookTran: {
      lookups: { bookname: list(sql`SELECT BookMastkm, BookName, PSamvatVK FROM BookM`) },
    },
    SubscribeTran: {
      lookups: {
        pname: list(sql`SELECT partyMkm, PName FROM PartyM`),
        stype: list(
          sql`SELECT 'Free' AS Id, 'Free' AS Name UNION ALL SELECT 'Paid' AS Id, 'Paid' AS Name`,
        ),
      },
    },
    BhashaTran: {
      lookups: { bhashaname: list(sql`SELECT bhashacokm, bhashaname FROM bhasmast`) },
    },
  },

  lists: {
    // MissingAnkToolStripMenuItem's picker.
    'missing-ank-sampraday': (db) =>
      pickListOf(
        db,
        sql`SELECT DISTINCT Sampraday.SampradayKm, Sampraday.SampradayName FROM MagazineM
          INNER JOIN Sampraday ON MagazineM.SampradayKt = Sampraday.SampradayKm
          ORDER BY Sampraday.SampradayName`,
      ),
  },

  actions: {
    /** Send To › BookM: frmBookMasterNew with the books of the selected magazines. */
    async 'send-to-book'(db, _user, ids): Promise<ActionResult> {
      if (!(await hasBooks(db, ids)))
        return { kind: 'open', screen: 'book-master', ids: [], emptyMessage: 'No Record Found' };
      return openInUse(
        db,
        'book-master',
        sql<{
          id: number;
        }>`SELECT DISTINCT bookmastkt AS id FROM MagBookmT WHERE Magazinekt IN ${idList(ids)}`,
        'No Record Found',
      );
    },
    /** Send To › BookT: frmBookTranNew (a dialog) with the library numbers of those books. */
    async 'send-to-book-t'(db, _user, ids): Promise<ActionResult> {
      if (!(await hasBooks(db, ids)))
        return { kind: 'open', screen: 'book-tran', ids: [], emptyMessage: 'No Record Found' };
      return openInUse(
        db,
        'book-tran',
        sql<{ id: number }>`SELECT DISTINCT BookT.Tid AS id FROM MagBookmT
          INNER JOIN BookT ON MagBookmT.bookmastkt = BookT.BookMastkt
          WHERE MagBookmT.Magazinekt IN ${idList(ids)} AND ISNULL(MagBookmT.bookmastkt, 0) > 0`,
        'No Record Found',
      );
    },
    /**
     * Print Report › Missing Ank(Sampradaywise): GetMissingAnkReport for the picked sampradays,
     * sent to Excel. Rows whose Ank is missing, or EB books with neither year nor Ank given;
     * the Sampraday shows on each group's first row only.
     */
    async 'missing-ank'(db, _user, _ids, ctx): Promise<ActionResult> {
      const raw = ctx.params.sampraday;
      const picked = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0);
      const columns = [
        'Sampraday',
        'BookName',
        'txtBookTran',
        'MissingaAnk',
        'MissingYr',
        'PSamvatVK',
        'PubStatus',
      ];
      // Nothing picked: the desktop runs nothing (its `If tx.Tag <> ""`).
      if (picked.length === 0) return { kind: 'table', title: 'Missing Ank', columns, rows: [] };
      const { rows } = await sql<Record<string, string | number | null>>`
        WITH paging AS (
          SELECT ROW_NUMBER() OVER (PARTITION BY V.SampradayName ORDER BY V.SampradayName) GroupRowNumber,
            ROW_NUMBER() OVER (ORDER BY V.SampradayName) RowNumber, V.SampradayName AS Sampraday, M.MName,
            B.BookName, B.txtBookTran, MB.MissingaAnk, MB.MissingYr, ISNULL(B.PSamvatVK, 0) PSamvatVK,
            colPubStatus.Name AS PubStatus
          FROM MagazineM M LEFT JOIN Sampraday V ON M.SampradayKt = V.SampradayKm
          INNER JOIN MagBookmT MB ON M.Magazinekm = MB.Magazinekt
          INNER JOIN BookM B ON MB.bookmastkt = B.BookMastkm
          LEFT JOIN columnmaster colPubStatus ON M.PubStatuskt = colPubStatus.ColumnMastkm
          WHERE M.SampradayKt IN ${idList(picked)}
            AND ((ISNULL(MissingaAnk, '') <> '')
              OR (B.txtBookTran LIKE '%EB%' AND ISNULL(MB.MissingYr, '') = '' AND ISNULL(MB.MissingaAnk, '') = ''))
        )
        SELECT CASE WHEN GroupRowNumber = 1 THEN Sampraday ELSE '' END Sampraday, BookName, txtBookTran,
          MissingaAnk, MissingYr, PSamvatVK, PubStatus
        FROM paging ORDER BY RowNumber
      `.execute(db);
      return {
        kind: 'table',
        title: 'Missing Ank',
        columns,
        rows: rows.map((r) => columns.map((c) => r[c] ?? null)),
      };
    },
  },
};

/** "SELECT COUNT(*) FROM magbookmt WHERE MagazineKt IN(<ids>)" > 0 */
async function hasBooks(db: Executor, ids: number[]): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM MagBookmT WHERE Magazinekt IN ${idList(ids.length ? ids : [0])}
  `.execute(db);
  return Number(rows[0]?.n ?? 0) > 0;
}
