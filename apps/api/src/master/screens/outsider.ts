import { sql } from 'kysely';
import { idList } from '../../db/legacy-sql.js';
import { val } from './bhasha.js';
import { maskedTime, pickerDate, trimmed as text } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/**
 * Issue › Outsider(Visitor) Master (frmOutsiderM, OutsiderMRepository). Table OutsiderM, IDENTITY
 * key OutsiderMkm. No Locked column (the form's Ctrl+L / U would fail), no work report, no entry
 * label. The menu shows it to admins and the Admin / AMaster user types only (menu.ts).
 */
export const outsiderMaster: ScreenDefinition = {
  screen: 'outsider-master',
  table: 'OutsiderM',
  primaryColumn: 'OutsiderMkm',
  lockable: false,

  // OutsiderMRepository.GetValidationMessage
  validate: (f) => (val(f.partymkt) === 0 ? 'Please Enter Party Name' : ''),

  async save(trx, user, id, f) {
    const v = {
      partymkt: val(f.partymkt),
      VisitTypekt: val(f.VisitTypekt),
      LetterTypekt: val(f.LetterTypekt),
      VisitDate: pickerDate(f.VisitDate),
      demand: text(f.demand),
      suggestion: text(f.suggestion),
      attendedbykt: val(f.attendedbykt),
      AttendentRemark: text(f.AttendentRemark),
      DemandApprovedbykt: val(f.DemandApprovedbykt),
      ApprovalComments: text(f.ApprovalComments),
      WorkDonebykt: val(f.WorkDonebykt),
      WorkRemark: text(f.WorkRemark),
      WorkTime: maskedTime(f.WorkTime),
      OutputTypekt: val(f.OutputTypekt),
      DataGivenDt: pickerDate(f.DataGivenDt),
      Statuskt: val(f.Statuskt),
    };
    if (id > 0) {
      await sql`
        UPDATE OutsiderM SET partymkt = ${v.partymkt}, VisitTypekt = ${v.VisitTypekt},
          LetterTypekt = ${v.LetterTypekt}, VisitDate = ${v.VisitDate}, demand = ${v.demand},
          suggestion = ${v.suggestion}, attendedbykt = ${v.attendedbykt},
          AttendentRemark = ${v.AttendentRemark}, DemandApprovedbykt = ${v.DemandApprovedbykt},
          ApprovalComments = ${v.ApprovalComments}, WorkDonebykt = ${v.WorkDonebykt},
          WorkRemark = ${v.WorkRemark}, WorkTime = ${v.WorkTime}, OutputTypekt = ${v.OutputTypekt},
          DataGivenDt = ${v.DataGivenDt}, Statuskt = ${v.Statuskt}, moduser = ${user.id},
          moddate = GETDATE()
        WHERE OutsiderMkm = ${id}
      `.execute(trx);
      return id;
    }
    const { rows } = await sql<{ id: number }>`
      INSERT INTO OutsiderM (partymkt, VisitTypekt, LetterTypekt, VisitDate, demand, suggestion,
        attendedbykt, AttendentRemark, DemandApprovedbykt, ApprovalComments, WorkDonebykt,
        WorkRemark, WorkTime, OutputTypekt, DataGivenDt, Statuskt, enuser, endate)
      OUTPUT INSERTED.OutsiderMkm AS id
      VALUES (${v.partymkt}, ${v.VisitTypekt}, ${v.LetterTypekt}, ${v.VisitDate}, ${v.demand},
        ${v.suggestion}, ${v.attendedbykt}, ${v.AttendentRemark}, ${v.DemandApprovedbykt},
        ${v.ApprovalComments}, ${v.WorkDonebykt}, ${v.WorkRemark}, ${v.WorkTime},
        ${v.OutputTypekt}, ${v.DataGivenDt}, ${v.Statuskt}, ${user.id}, GETDATE())
    `.execute(trx);
    return Number(rows[0]!.id);
  },

  actions: {
    /**
     * Send To › Party Master: every party the selected visits name (party, attended by, demand
     * approved by, work done by).
     */
    async 'send-to-party'(db, _user, ids): Promise<ActionResult> {
      const { rows } = await sql<{ id: number }>`
        SELECT DISTINCT p.id FROM OutsiderM
        CROSS APPLY (VALUES (partymkt), (attendedbykt), (DemandApprovedbykt), (WorkDonebykt)) AS p(id)
        WHERE OutsiderMkm IN ${idList(ids.length ? ids : [0])} AND p.id > 0
      `.execute(db);
      return {
        kind: 'open',
        screen: 'party-master',
        ids: rows.map((r) => Number(r.id)),
        emptyMessage: 'No Records Found',
      };
    },
  },
};
