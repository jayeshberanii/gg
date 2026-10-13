import type { GridValue, PrintBlock } from '@gglib/shared';
import { sql } from 'kysely';
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

/** The overflows the desktop lets SQL Server throw on: nvarchar sizes of LetterDemandM. */
const TEXT_LIMITS: [string, string, number][] = [
  ['PartyName', 'Party Name', 200],
  ['PartyAddress', 'Party Address', 500],
  ['Vishay', 'Vishay', 250],
  ['FollowUpRem', 'FollowUp Remark', 250],
  ['StatusRemark', 'Status Remark', 150],
];

type ReportRow = {
  Sort1: number;
  LetterNo: number | null;
  LetterDate: string;
  PName: string | null;
  Vishay: string | null;
  Letter: string | null;
  BookName: string | null;
  Nakal: number | null;
  Prakashak: string | null;
};

/**
 * Issue › Letter Demand (frmLetterDemandM, LetterDemandMRepository): a letter asking a
 * publisher, author or party for books or magazine issues. The twin of Letter Bhet (shared
 * helpers in letter-common.ts); its book lines are LetterBookT rows under TransactionName
 * 'LetterDemandM'. No Locked column, no work report. See docs/screens/letter-demand.md.
 */
export const letterDemand: ScreenDefinition = {
  screen: 'letter-demand',
  attachments: true,
  table: 'LetterDemandM',
  primaryColumn: 'LetterDemandMkm',
  lockable: false,

  validate(f) {
    if (val(f.LetterTypekt) === 0) return 'Please Enter Letter Type';
    if (trimmed(f.PartyName) === '') return 'Please Enter Party Name';
    return overflowMessage(f, TEXT_LIMITS, [
      ['LetterNo', 'Letter No'],
      ['PagesAttached', 'Page Attached'],
    ]);
  },

  // New keeps NextReminderDt (a DateTimePicker clsCom.clear leaves alone).
  newDefaults: (db) => letterDefaults(db, 'LetterDemandM'),

  async save(trx, user, id, f) {
    const lines = await prepareBookLines(trx, 'LetterDemandM', id, f);
    const v = {
      LetterDate: pickerDate(f.LetterDate),
      LetterNo: intOf(f.LetterNo),
      LetterTypekt: val(f.LetterTypekt),
      ConcernedPersonKt: val(f.ConcernedPersonKt),
      PartyName: trimmed(f.PartyName),
      PartyAddress: trimmed(f.PartyAddress),
      Vishay: trimmed(f.Vishay),
      // Saved trimmed (txtLetter.Text.Trim), unlike Letter Bhet.
      Letter: letterText(f.Letter).trim(),
      PagesAttached: intOf(f.PagesAttached),
      FollowUpRem: trimmed(f.FollowUpRem),
      NextReminderDt: pickerDate(f.NextReminderDt),
      StatusTypekt: val(f.StatusTypekt),
      StatusRemark: trimmed(f.StatusRemark),
      WorkGivenMkt: val(f.WorkGivenMkt),
      MagazineKt: val(f.MagazineKt),
      AuthorKt: val(f.AuthorKt),
      PrakashakKt: val(f.PrakashakKt),
    };
    let recordId = id;
    if (id > 0) {
      await sql`
        UPDATE LetterDemandM SET LetterDate = COALESCE(${v.LetterDate}, CAST(GETDATE() AS date)),
          LetterNo = ${v.LetterNo}, LetterTypekt = ${v.LetterTypekt},
          ConcernedPersonKt = ${v.ConcernedPersonKt}, PartyName = ${v.PartyName},
          PartyAddress = ${v.PartyAddress}, Vishay = ${v.Vishay}, Letter = ${v.Letter},
          PagesAttached = ${v.PagesAttached}, FollowUpRem = ${v.FollowUpRem},
          NextReminderDt = COALESCE(${v.NextReminderDt}, CAST(GETDATE() AS date)),
          StatusTypekt = ${v.StatusTypekt}, StatusRemark = ${v.StatusRemark},
          WorkGivenMkt = ${v.WorkGivenMkt}, MagazineKt = ${v.MagazineKt}, AuthorKt = ${v.AuthorKt},
          PrakashakKt = ${v.PrakashakKt}, moduser = ${user.id}, moddate = GETDATE()
        WHERE LetterDemandMkm = ${id}
      `.execute(trx);
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO LetterDemandM (LetterDate, LetterNo, LetterTypekt, ConcernedPersonKt, PartyName,
          PartyAddress, Vishay, Letter, PagesAttached, FollowUpRem, NextReminderDt, StatusTypekt,
          StatusRemark, WorkGivenMkt, MagazineKt, AuthorKt, PrakashakKt, enuser, endate)
        OUTPUT INSERTED.LetterDemandMkm AS id
        VALUES (COALESCE(${v.LetterDate}, CAST(GETDATE() AS date)), ${v.LetterNo}, ${v.LetterTypekt},
          ${v.ConcernedPersonKt}, ${v.PartyName}, ${v.PartyAddress}, ${v.Vishay}, ${v.Letter},
          ${v.PagesAttached}, ${v.FollowUpRem}, COALESCE(${v.NextReminderDt}, CAST(GETDATE() AS date)),
          ${v.StatusTypekt}, ${v.StatusRemark}, ${v.WorkGivenMkt}, ${v.MagazineKt}, ${v.AuthorKt},
          ${v.PrakashakKt}, ${user.id}, GETDATE())
      `.execute(trx);
      recordId = Number(rows[0]!.id);
    }
    await writeBookLines(trx, 'LetterDemandM', recordId, lines);
    return recordId;
  },

  deleteRecord: deleteLetter('LetterDemandM'),

  trans: { BookTran: {} },

  f2: {
    /** txtWorkGivenMkt: the Work Given grid (WorkGivenMRepository.ListGridData). */
    workgivenmkt: (db) => masterGrid(db, 'WorkGivenM', 'WorkGivenMKm'),
  },

  actions: {
    /** Send To › WorkGiven Master (not on the web yet: the engine says so). */
    'send-to-work-given': (db, _user, ids) =>
      sendTo(
        db,
        'work-given-master',
        sql<{
          id: number | null;
        }>`SELECT DISTINCT WorkGivenMkt AS id FROM LetterDemandM WHERE LetterDemandMkm IN ${ids0(ids)}`,
      ),

    /**
     * Print Report › Print Demand: LetterDemandReport.rpt for the grid's current row, from its
     * data source Rpt_LetterDemand, as an HTML print view (provisional layout, see
     * letter-common.ts). Its rows are grouped by Sort1: the magazine's missing issues (0), the
     * Prakashak's / Author's books held only as "ob" copies (1), and the books typed into Book
     * Detail (2); empty BookNames (the LEFT JOIN's row) are left out.
     */
    async 'print-demand'(db, _user, ids): Promise<ActionResult> {
      const id = ids[0] ?? 0;
      const { rows } = await sql<ReportRow>`EXEC Rpt_LetterDemand ${id}`.execute(db);
      const head = rows[0];
      if (!head) return { kind: 'message', message: 'No Record Found' };
      const group = (sort: number) =>
        rows.filter((r) => Number(r.Sort1) === sort && trimmed(r.BookName) !== '');
      const tables: PrintBlock[] = [];
      const add = (
        title: string,
        list: ReportRow[],
        columns: { header: string; align?: 'right'; width?: number }[],
        cells: (r: ReportRow) => GridValue[],
      ) => {
        if (list.length > 0)
          tables.push({ kind: 'table', title, numbered: true, columns, rows: list.map(cells) });
      };
      add(
        'Magazine (missing issues)',
        group(0),
        [{ header: 'Issue' }, { header: 'Prakashak', width: 40 }],
        (r) => [trimmed(r.BookName), trimmed(r.Prakashak)],
      );
      add(
        'Books',
        group(1),
        [{ header: 'Book Name' }, { header: 'Prakashak / Author', width: 35 }],
        (r) => [trimmed(r.BookName), trimmed(r.Prakashak)],
      );
      add(
        'Book Detail',
        group(2),
        [{ header: 'Book Name' }, { header: 'Nakal', align: 'right', width: 12 }],
        (r) => [trimmed(r.BookName), r.Nakal],
      );
      return printDocument('Letter Demand', [
        letterPage({
          letterNo: head.LetterNo,
          date: head.LetterDate,
          to: [trimmed(head.PName)],
          vishay: trimmed(head.Vishay),
          letter: head.Letter ?? '',
          tables,
        }),
      ]);
    },
  },
};
