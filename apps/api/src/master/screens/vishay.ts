import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { get, grid, int, type Row, signBetween, text } from './book-common.js';
import { openInUse, referenceStatement, tableKtOf, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/** clsCom.INSQ: trimmed, a blank written as ' '. */
const insq = (v: unknown) => trimmed(v) || ' ';

/** The popups VishayRepository.Save upserts: table, key, the Vishay text column it rebuilds. */
type AnyaPopup = {
  table: string;
  key: string;
  /** The value columns, as the popup's DataTable names them → the table's own column. */
  columns: Record<string, string>;
  /** The Vishay column rebuilt from the rows (joined by ", "), and the row column it reads. */
  writeBack?: { column: string; from: string };
};

const POPUPS: Record<string, AnyaPopup> = {
  AnyaNameTran: {
    table: 'VishayAnyaNameT',
    key: 'VishayAnyaNameKm',
    columns: { AnyaName: 'AnyaName' },
    writeBack: { column: 'AnyaName', from: 'AnyaName' },
  },
  MeaningTran: { table: 'VishayMeaningT', key: 'VishayMeaningKm', columns: { Meaning: 'Meaning' } },
  EnglishAnyaNameTran: {
    table: 'VishayEnglishAnyaNameT',
    key: 'VishayEnglishAnyaNameKm',
    columns: { EnglishNameKt: 'EnglishNameKt' },
    writeBack: { column: 'EnglishAnyaName', from: 'EnglishName' },
  },
  HindiAnyaNameTran: {
    table: 'VishayHindiAnyaNameT',
    key: 'VishayHindiAnyaNameKm',
    columns: { HindiNameKt: 'HindiNameKt' },
    writeBack: { column: 'HindiAnyaName', from: 'HindiName' },
  },
};

/**
 * One popup of VishayRepository.Save: rows with a key of 0 or less are inserted, the others
 * updated, then the record's rows that are no longer listed deleted, and the Vishay text column
 * rebuilt. (The desktop inserts Hindi rows only below 0, so a 0-key row was lost; every new row
 * here has a negative key anyway.)
 */
async function savePopup(
  trx: Executor,
  userId: number,
  vishayId: number,
  p: AnyaPopup,
  rows: Row[],
) {
  const kept: number[] = [];
  let summary = '';
  const cols = Object.entries(p.columns);
  const isKt = (c: string) => c.toLowerCase().endsWith('kt');
  for (const r of rows) {
    const key = int(get(r, p.key));
    const values = cols.map(([from, to]) => ({
      to,
      value: isKt(to) ? int(get(r, from)) : insq(get(r, from)),
    }));
    if (key <= 0) {
      const { rows: inserted } = await sql<{ id: number }>`
        INSERT INTO ${sql.table(p.table)} (VishayKt, ${sql.join(values.map((v) => sql.ref(v.to)))}, Seq, enuser, endate)
        OUTPUT INSERTED.${sql.ref(p.key)} AS id
        VALUES (${vishayId}, ${sql.join(values.map((v) => v.value))}, ${int(get(r, 'Seq'))}, ${userId}, GETDATE())
      `.execute(trx);
      kept.push(Number(inserted[0]!.id));
    } else {
      await sql`
        UPDATE ${sql.table(p.table)}
        SET ${sql.join(values.map((v) => sql`${sql.ref(v.to)} = ${v.value}`))}, Seq = ${int(get(r, 'Seq'))},
            moduser = ${userId}, moddate = GETDATE()
        WHERE ${sql.ref(p.key)} = ${key}
      `.execute(trx);
      kept.push(key);
    }
    if (p.writeBack) summary = signBetween(summary, text(get(r, p.writeBack.from)), ', ');
  }
  await sql`
    DELETE FROM ${sql.table(p.table)} WHERE VishayKt = ${vishayId} AND ${sql.ref(p.key)} NOT IN ${idList([0, ...kept])}
  `.execute(trx);
  if (p.writeBack) {
    await sql`UPDATE Vishay SET ${sql.ref(p.writeBack.column)} = ${insq(summary)} WHERE vishaycokm = ${vishayId}`.execute(
      trx,
    );
  }
}

/** A Show In Use item that opens Book Master (a WhereCondition on the desktop). */
const books = (query: ReturnType<typeof sql<{ id: number }>>) => (db: Executor) =>
  openInUse(db, 'book-master', query, 'No Book Available for Current Selection');

/**
 * Master › Vishay Master (frmVishayMaster, VishayRepository). Table Vishay, IDENTITY key
 * vishaycokm.
 */
export const vishayMaster: ScreenDefinition = {
  screen: 'vishay-master',
  table: 'Vishay',
  primaryColumn: 'vishaycokm',
  lockable: true,
  // insertworkreports after Add and Edit; Delete logs nothing.
  workReport: true,
  workReportOn: { delete: false },

  validate: (f) => (trimmed(f.vishay_nm) === '' ? 'Please Enter Vishay Name' : ''),

  async recordExtras(db, id) {
    const n = Number(
      (
        await sql<{ n: number }>`SELECT COUNT(*) AS n FROM RefrenceT
          WHERE Tablekt = ${await tableKtOf(db, 'Vishay')} AND RecordKt = ${id}`.execute(db)
      ).rows[0]?.n ?? 0,
    );
    return { HasReference: n > 0 };
  },

  async save(trx, user, id, f) {
    // v3.4.3.1 GetValidationMessage's second rule (add and edit): the name is already taken.
    const name = trimmed(f.vishay_nm);
    const { rows: same } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM Vishay WHERE vishay_nm = ${name} AND vishaycokm <> ${id}
    `.execute(trx);
    if (Number(same[0]?.n ?? 0) > 0)
      throw new BadRequestException(`Vishay Name - ${name} Already Exist`);

    const v = {
      vishay_nm: trimmed(f.vishay_nm),
      brif: trimmed(f.brif),
      remark: trimmed(f.remark),
      short_name: trimmed(f.short_name),
      uplevalkt: int(f.uplevalkt),
      hindiword: trimmed(f.hindiword),
    };
    let vishayId = id;
    if (id > 0) {
      await sql`
        UPDATE Vishay SET vishay_nm = ${v.vishay_nm}, moduser = ${user.id}, moddate = GETDATE(), brif = ${v.brif},
          remark = ${v.remark}, short_name = ${v.short_name}, uplevalkt = ${v.uplevalkt}, hindiword = ${v.hindiword}
        WHERE vishaycokm = ${id}
      `.execute(trx);
    } else {
      // The desktop reads MAX(vishaycokm) *before* this IDENTITY insert, so every new subject's
      // popups (and the AnyaName / EnglishAnyaName / HindiAnyaName texts) went to the previous
      // subject. The inserted identity is used here.
      const { rows } = await sql<{ id: number }>`
        INSERT INTO Vishay (vishay_nm, enuser, endate, brif, remark, short_name, uplevalkt, hindiword)
        OUTPUT INSERTED.vishaycokm AS id
        VALUES (${v.vishay_nm}, ${user.id}, GETDATE(), ${v.brif}, ${v.remark}, ${v.short_name}, ${v.uplevalkt},
                ${v.hindiword})
      `.execute(trx);
      vishayId = Number(rows[0]!.id);
    }

    // References: the desktop inserted every loaded row on every save without deleting the old
    // ones, so each save doubled them. They are replaced when the popup was saved.
    const refs = grid(f, 'ReferenceT1');
    if (refs) {
      const tk = await tableKtOf(trx, 'Vishay');
      await sql`DELETE FROM RefrenceT WHERE Tablekt = ${tk} AND RecordKt = ${vishayId}`.execute(
        trx,
      );
      for (const r of refs) {
        await sql`
          INSERT INTO RefrenceT (Tablekt, RecordKt, Subhead, WordNm, Example, LibNo, Refplacekt, Pgno, Seq, BookTKt)
          VALUES (${tk}, ${vishayId}, ${insq(get(r, 'Subhead'))}, ${insq(get(r, 'WordNm'))}, ${insq(get(r, 'Example'))},
            ${text(get(r, 'BookTName'))}, ${int(get(r, 'Refplacekt'))}, ${text(get(r, 'Pgno'))}, ${int(get(r, 'seq'))},
            ${int(get(r, 'BookTKt'))})
        `.execute(trx);
      }
    }
    for (const [column, popup] of Object.entries(POPUPS)) {
      const rows = grid(f, column);
      if (rows) await savePopup(trx, user.id, vishayId, popup, rows);
    }
    return vishayId;
  },

  /** Delete(): refused while VishayEntry, krutivishayT or praksnVishayT use the subject. */
  async checkInUse(db, id) {
    const { rows } = await sql<{ t: string }>`
      SELECT DISTINCT TransactionName AS t FROM VishayEntry WHERE VishayKt = ${id}`.execute(db);
    let message = '';
    for (const r of rows) message = signBetween(message, ` - ${text(r.t)}`, '\r\n');
    const count = async (q: ReturnType<typeof sql<{ n: number }>>) =>
      Number((await q.execute(db)).rows[0]?.n ?? 0);
    if ((await count(sql`SELECT COUNT(*) AS n FROM krutivishayT WHERE vishaykt = ${id}`)) > 0)
      message = signBetween(message, '- कृति विषय', '\r\n');
    if ((await count(sql`SELECT COUNT(*) AS n FROM praksnVishayT WHERE vishaykt = ${id}`)) > 0)
      message = signBetween(message, '- Book Old Subject', '\r\n');
    return message === '' ? '' : `Record is in used in below forms\r\n${message}`;
  },

  trans: {
    // FormName "Vishay"
    AnyaNameTran: {},
    MeaningTran: {},
    EnglishAnyaNameTran: {
      lookups: {
        englishname: (db) =>
          pickListOf(
            db,
            sql`SELECT vishaycokm, vishay_nm FROM vishay WHERE ISNULL(vishay_nm, '') <> '' ORDER BY vishay_nm`,
          ),
      },
    },
    HindiAnyaNameTran: {
      lookups: {
        hindiname: (db) =>
          pickListOf(
            db,
            sql`SELECT vishaycokm, vishay_nm FROM vishay WHERE ISNULL(vishay_nm, '') <> '' ORDER BY vishay_nm`,
          ),
      },
    },
    // lnkColumnReference: ReferenceT1 / Common (its lists are the engine's).
    ReferenceT1: { statements: (db, id) => referenceStatement(db, 'Vishay', id) },
  },

  actions: {
    /** Update Vishay Count: `exec UpdateBhashaCount 'vishay', id` per selected row. */
    async 'update-count'(db, _user, selected): Promise<ActionResult> {
      for (const id of selected)
        await sql`EXEC UpdateBhashaCount ${'vishay'}, ${String(id)}`.execute(db);
      return { kind: 'refreshed', rows: [], message: 'Records Updated Successfully' };
    },
    // Show In Use › BookM › Subject With Old / New Entry Type
    'in-use-book-old': (db, _user, selected) =>
      books(sql<{ id: number }>`SELECT DISTINCT BookSubjectT.BookMastKt AS id FROM VishayEntry
        INNER JOIN BookSubjectT ON VishayEntry.RecordKt = BookSubjectT.BookSubjectKm
        WHERE VishayEntry.TransactionName = 'BookSubject' AND VishayEntry.VishayKt IN ${idList(selected)}
          AND BookSubjectT.EntryType = 'Old'`)(db),
    'in-use-book-new': (db, _user, selected) =>
      books(sql<{ id: number }>`SELECT DISTINCT BookSubjectT.BookMastKt AS id FROM VishayEntry
        INNER JOIN BookSubjectT ON VishayEntry.RecordKt = BookSubjectT.BookSubjectKm
        WHERE VishayEntry.TransactionName = 'BookSubject' AND VishayEntry.VishayKt IN ${idList(selected)}
          AND BookSubjectT.EntryType <> 'Old'`)(db),
    'in-use-kruti': (db, _user, selected) =>
      openInUse(
        db,
        'kruti-master',
        sql<{ id: number }>`SELECT DISTINCT KrutiSubjectT.KrutimstKt AS id FROM VishayEntry
          INNER JOIN KrutiSubjectT ON VishayEntry.RecordKt = KrutiSubjectT.KrutiSubjectKm
          WHERE VishayEntry.TransactionName = 'KrutiSubject' AND VishayEntry.VishayKt IN ${idList(selected)}`,
        'No Kruti Available For Current Selection',
      ),
    // The desktop reads TransactionName 'MagazineVishesh' (0 rows: frmMagazineVisheshNew saves its
    // Detail lines as 'MagazineVisheshDetail'), so it always said "No Records Available". Fixed
    // to read the Detail lines (see docs/screens/vishay-master.md).
    'in-use-magazine-vishesh': (db, _user, selected) =>
      openInUse(
        db,
        'magazine-vishesh-master',
        sql<{ id: number }>`SELECT DISTINCT MagazineVishesh.MagazineVisheshKm AS id FROM VishayEntry
          INNER JOIN MagazineVishesh ON VishayEntry.RecordKt = MagazineVishesh.MagazineVisheshKm
          WHERE VishayEntry.TransactionName = 'MagazineVisheshDetail' AND VishayEntry.VishayKt IN ${idList(selected)}`,
        'No Records Available for Current Selection',
      ),
    'in-use-english-book-vishesh': (db, _user, selected) =>
      openInUse(
        db,
        'english-book-vishesh',
        sql<{
          id: number;
        }>`SELECT DISTINCT EnglishBookVishesh.EnglishBookVisheshKm AS id FROM VishayEntry
          INNER JOIN EnglishBookVishesh ON VishayEntry.RecordKt = EnglishBookVishesh.EnglishBookVisheshKm
          WHERE VishayEntry.TransactionName = 'EnglishBookVishesh' AND VishayEntry.VishayKt IN ${idList(selected)}`,
        'No Records Available for Current Selection',
      ),
  },
};
