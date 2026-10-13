import { sql } from 'kysely';
import { pickListOf } from '../values.js';
import { val } from './bhasha.js';
import {
  deleteLetter,
  ids0,
  intOf,
  letterDefaults,
  letterPage,
  letterText,
  overflowMessage,
  prepareBookLines,
  printDocument,
  sendTo,
  writeBookLines,
} from './letter-common.js';
import { masterGrid, pickerDate, trimmed } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/** The overflows the desktop lets SQL Server throw on: nvarchar / varchar sizes of LetterbhetM. */
const TEXT_LIMITS: [string, string, number][] = [
  ['PartyName', 'Party Name', 50],
  ['party_add', 'Party Address', 500],
  ['MobileNo', 'Mobile No', 10],
  ['Vishay', 'Vishay', 250],
];

/**
 * Issue › Letter Bhet (frmLetterBhetM, LetterBhetMRepository): an acknowledgement letter for
 * books received as a gift. Table LetterbhetM, IDENTITY key LetterBhetMkm, no Locked column, no
 * work report. The Book Detail popup keeps LetterBookT lines under TransactionName
 * 'LetterBhetM'. See docs/screens/letter-bhet.md.
 */
export const letterBhet: ScreenDefinition = {
  screen: 'letter-bhet',
  table: 'LetterBhetM',
  primaryColumn: 'LetterBhetMkm',
  lockable: false,

  /** GetValidationMessage, then the overflows (new messages: the desktop shows SQL's error). */
  validate(f) {
    if (val(f.BhetTypekt) === 0) return 'Please Enter Bhet Type';
    if (trimmed(f.PartyName) === '') return 'Please Enter Party Name';
    return overflowMessage(f, TEXT_LIMITS, [['LetterNo', 'Letter No']]);
  },

  newDefaults: (db) => letterDefaults(db, 'LetterBhetM'),

  async save(trx, user, id, f) {
    const lines = await prepareBookLines(trx, 'LetterBhetM', id, f);
    const v = {
      LetterNo: intOf(f.LetterNo),
      LetterDate: pickerDate(f.LetterDate),
      BhetTypekt: val(f.BhetTypekt),
      PartyName: trimmed(f.PartyName),
      party_add: trimmed(f.party_add),
      MobileNo: trimmed(f.MobileNo),
      Vishay: trimmed(f.Vishay),
      // Saved untrimmed, as the form passes txtLetter.Text.
      Letter: letterText(f.Letter),
      inwordkt: val(f.inwordkt),
    };
    let recordId = id;
    if (id > 0) {
      await sql`
        UPDATE LetterBhetM SET LetterNo = ${v.LetterNo},
          LetterDate = COALESCE(${v.LetterDate}, CAST(GETDATE() AS date)), BhetTypekt = ${v.BhetTypekt},
          PartyName = ${v.PartyName}, party_add = ${v.party_add}, MobileNo = ${v.MobileNo},
          Vishay = ${v.Vishay}, Letter = ${v.Letter}, inwordkt = ${v.inwordkt},
          moduser = ${user.id}, moddate = GETDATE()
        WHERE LetterBhetMkm = ${id}
      `.execute(trx);
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO LetterBhetM (LetterNo, LetterDate, BhetTypekt, PartyName, party_add, MobileNo,
          Vishay, Letter, inwordkt, enuser, endate)
        OUTPUT INSERTED.LetterBhetMkm AS id
        VALUES (${v.LetterNo}, COALESCE(${v.LetterDate}, CAST(GETDATE() AS date)), ${v.BhetTypekt},
          ${v.PartyName}, ${v.party_add}, ${v.MobileNo}, ${v.Vishay}, ${v.Letter}, ${v.inwordkt},
          ${user.id}, GETDATE())
      `.execute(trx);
      recordId = Number(rows[0]!.id);
    }
    await writeBookLines(trx, 'LetterBhetM', recordId, lines);
    return recordId;
  },

  deleteRecord: deleteLetter('LetterBhetM'),

  trans: { BookTran: {} },

  f2: {
    /** txtPartyName: the form's own PartyM list (tblSearch has no F2EntryText for it). */
    partyname: (db) =>
      pickListOf(
        db,
        sql`SELECT partyMkm, PName,
            (SELECT TOP (1) MobileNo FROM PrakMAddT WHERE ISNULL(MobileNo, '') <> '' AND partyMkt = p.partyMkm) MobileNo,
            txtAddress, v1.SampradayName sampraday, v2.Vishesh guru, v3.Vishesh catagory,
            ISNULL(Mrecno, 0) Mrecno, p.refrence,
            (SELECT ISNULL(SUM(creditamt) - SUM(debitamt), 0) FROM PartyDepositT WHERE PartyMKt = p.PartyMKm) AS ClosingBalance
          FROM PartyM p
          LEFT OUTER JOIN Sampraday v1 ON v1.SampradayKm = p.Sampradaykt
          LEFT OUTER JOIN visheshMast v2 ON v2.tid = p.Gurukt
          LEFT OUTER JOIN visheshMast v3 ON v3.tid = p.Categorykt
          ORDER BY PName`,
      ),
    /** txtinwordkt: the Inward Master grid (InwordMRepository.ListGridData). */
    inwordkt: (db) => masterGrid(db, 'InwordM', 'inwordkm'),
  },

  actions: {
    /**
     * After an Inword pick (Txt_KeyDown): the inward's From party, with the address and mobile
     * of its first PrakMAddT row, only when it has one. An inward without a From (the desktop's
     * "partyMkt=" SQL error) or an address NULL fills nothing / ''.
     */
    async 'inward-party'(db, _user, _ids, ctx): Promise<ActionResult> {
      const inward = val(ctx.params.inwordkm);
      const { rows } = await sql<{
        fromkt: number | null;
        fromName: string | null;
        address: string | null;
        MobileNo: string | null;
      }>`
        SELECT TOP (1) i.fromkt, p.PName AS fromName, a.address, a.MobileNo
        FROM InwordM i
        INNER JOIN PrakMAddT a ON a.partyMkt = i.fromkt
        LEFT JOIN PartyM p ON p.partyMkm = i.fromkt
        WHERE i.inwordkm = ${inward} AND ISNULL(i.fromkt, 0) <> 0
      `.execute(db);
      const r = rows[0];
      return {
        kind: 'form',
        fields: r
          ? {
              PartyName: r.fromName ?? '',
              party_add: r.address ?? '',
              MobileNo: r.MobileNo ?? '',
            }
          : {},
        trans: {},
      };
    },

    /** Send To › Inword Master: the inwards of the selected letters. */
    'send-to-inward': (db, _user, ids) =>
      sendTo(
        db,
        'inward-master',
        sql<{
          id: number | null;
        }>`SELECT DISTINCT inwordkt AS id FROM LetterBhetM WHERE LetterBhetMkm IN ${ids0(ids)}`,
      ),

    /**
     * Print Report › Print Bhet Pahoch: LetterBhetReport.rpt for the grid's current row, as an
     * HTML print view (provisional layout, see letter-common.ts). The report has no stored
     * procedure; its data is the letter and its LetterBookT lines.
     */
    async 'print-bhet-pahoch'(db, _user, ids): Promise<ActionResult> {
      const id = ids[0] ?? 0;
      const { rows } = await sql<{
        LetterNo: number | null;
        LetterDate: string;
        PName: string | null;
        party_add: string | null;
        MobileNo: string | null;
        Vishay: string | null;
        Letter: string | null;
        BookName: string;
        Nakal: number;
      }>`
        SELECT L.LetterNo, CONVERT(varchar, L.LetterDate, 103) AS LetterDate, L.PartyName AS PName,
          L.party_add, L.MobileNo, L.Vishay, L.Letter,
          ISNULL(LB.BookName, '') AS BookName, ISNULL(LB.Nakal, 0) AS Nakal
        FROM LetterBhetM L
        LEFT JOIN LetterBookT LB ON LB.TransactionKt = L.LetterBhetMkm AND LB.TransactionName = 'LetterBhetM'
        WHERE L.LetterBhetMkm = ${id}
        ORDER BY LB.LetterBookKm
      `.execute(db);
      const head = rows[0];
      if (!head) return { kind: 'message', message: 'No Record Found' };
      const books = rows.filter((r) => trimmed(r.BookName) !== '');
      return printDocument('Bhet Pahoch', [
        letterPage({
          letterNo: head.LetterNo,
          date: head.LetterDate,
          to: [
            trimmed(head.PName),
            trimmed(head.party_add),
            trimmed(head.MobileNo) ? `Mobile No: ${trimmed(head.MobileNo)}` : '',
          ],
          vishay: trimmed(head.Vishay),
          letter: head.Letter ?? '',
          tables:
            books.length > 0
              ? [
                  {
                    kind: 'table',
                    numbered: true,
                    columns: [
                      { header: 'Book Name' },
                      { header: 'Nakal', align: 'right', width: 12 },
                    ],
                    rows: books.map((b) => [b.BookName, b.Nakal]),
                  },
                ]
              : [],
        }),
      ]);
    },
  },
};
