import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { idList } from '../../db/legacy-sql.js';
import { pickListOf } from '../values.js';
import { grid, int } from './book-common.js';
import {
  type ChildTable,
  openInUse,
  trimmed,
  upsertChildRows,
  uplevelWithChild,
} from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

/** SampradayRepository.Save's popups, by tblSearch column. */
const POPUPS: Record<string, ChildTable> = {
  SampradayAnyaNameTran: {
    table: 'SampradayAnyaNameT',
    key: 'SampradayAnyaNameKm',
    parent: 'SampradayKt',
    columns: { AnyaName: 'text', BookTKt: 'int', Page: 'text', Seq: 'int' },
  },
  SampradayAdyaSthapakTran: {
    table: 'SampradayAdyaSthapakT',
    key: 'SampradayAdyaSthapakKm',
    parent: 'SampradayKt',
    columns: { AuthorKt: 'int', Seq: 'int' },
  },
  SampradayReferenceTran: {
    table: 'SampradayReferenceT',
    key: 'SampradayReferenceKm',
    parent: 'SampradayKt',
    columns: { BookTKt: 'int', RefPlaceKt: 'int', RefPgNo: 'text', Remark: 'text', Seq: 'int' },
  },
  SampradayNoteTran: {
    table: 'SampradayNoteT',
    key: 'SampradayNoteKm',
    parent: 'SampradayKt',
    columns: { NoteTypeKt: 'int', Notes: 'text', BookTKt: 'int', PageNo: 'text', Seq: 'int' },
  },
  SampradaySamvatTran: {
    table: 'SampradaySamvatT',
    key: 'SampradaySamvatKm',
    parent: 'SampradayKt',
    columns: {
      SamvatTypeKt: 'int',
      Samvat: 'text',
      SamvatVK: 'int',
      BookTKt: 'int',
      PageNo: 'text',
      Seq: 'int',
    },
  },
  SampradayBriefTran: {
    table: 'SampradayBriefT',
    key: 'SampradayBriefKm',
    parent: 'SampradayKt',
    columns: { Brief: 'text', BookTKt: 'int', PageNo: 'text', Seq: 'int' },
    audit: true,
  },
  SampradayRemarkTran: {
    table: 'SampradayRemarkT',
    key: 'SampradayRemarkKm',
    parent: 'SampradayKt',
    columns: { Remark: 'text', BookTKt: 'int', PageNo: 'text', Seq: 'int' },
    audit: true,
  },
  SampradaySthalTran: {
    table: 'SampradaySthalT',
    key: 'SampradaySthalKm',
    parent: 'SampradayKt',
    columns: { SthalKt: 'int', BookTKt: 'int', PageNo: 'text', Seq: 'int' },
    audit: true,
  },
};

const LIBNO = (db: Parameters<typeof pickListOf>[0]) =>
  pickListOf(db, sql`SELECT Tid, LibNo FROM BookT WHERE ISNULL(LibNo, '') <> '' ORDER BY LibNo`);
const SAMPRADAYS = (db: Parameters<typeof pickListOf>[0]) =>
  pickListOf(db, sql`SELECT SampradayKm, SampradayName FROM Sampraday ORDER BY SampradayName`);

/** Update Uplevel / Uplevel1 In Selected Records (SampradayRepository.UpdateUplevel / 1). */
async function setUplevel(
  db: Parameters<typeof pickListOf>[0],
  column: 'UplevelKt' | 'Uplevel1Kt',
  selected: number[],
  kt: number,
): Promise<ActionResult> {
  if (kt <= 0 || selected.length === 0) return { kind: 'message', message: '' };
  const result = await sql`
    UPDATE Sampraday SET ${sql.ref(column)} = ${kt} WHERE SampradayKm IN ${idList(selected)} AND SampradayKm <> ${kt}
  `.execute(db);
  return {
    kind: 'message',
    message: Number(result.numAffectedRows ?? 0) > 0 ? 'Records Updated Successfully' : '',
  };
}

/**
 * Master › Sampraday Master (frmSampraday, SampradayRepository). Table Sampraday, IDENTITY key
 * SampradayKm. No Locked column (the form's Ctrl+L / Ctrl+U fail on the desktop).
 */
export const sampradayMaster: ScreenDefinition = {
  screen: 'sampraday-master',
  table: 'Sampraday',
  primaryColumn: 'SampradayKm',
  lockable: false,
  // insertworkreports after Add and Edit; Delete logs nothing.
  workReport: true,
  workReportOn: { delete: false },

  // GetValidationMessage; its "Name Already Exist" needs the database and is checked in save.
  validate: (f) => (trimmed(f.SampradayName) === '' ? 'Please Enter Name' : ''),

  async save(trx, user, id, f) {
    const v = {
      SampradayName: trimmed(f.SampradayName),
      ShortNm: trimmed(f.ShortNm),
      UplevelKt: int(f.UplevelKt),
      Uplevel1Kt: int(f.Uplevel1Kt),
      txtAnyaName: trimmed(f.SampradayAnyaNameTran),
      txtAdyaSthapak: trimmed(f.SampradayAdyaSthapakTran),
    };
    const { rows: same } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM Sampraday WHERE SampradayName = ${v.SampradayName} AND SampradayKm <> ${id}
    `.execute(trx);
    if (Number(same[0]!.n) > 0) throw new BadRequestException('Name Already Exist');

    let sampradayId = id;
    if (id > 0) {
      await sql`
        UPDATE Sampraday SET SampradayName = ${v.SampradayName}, ShortNm = ${v.ShortNm}, UplevelKt = ${v.UplevelKt},
          Uplevel1Kt = ${v.Uplevel1Kt}, txtAnyaName = ${v.txtAnyaName}, txtAdyaSthapak = ${v.txtAdyaSthapak},
          moduser = ${user.id}, moddate = GETDATE()
        WHERE SampradayKm = ${id}
      `.execute(trx);
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO Sampraday (SampradayName, ShortNm, UplevelKt, Uplevel1Kt, txtAnyaName, txtAdyaSthapak, enuser, endate)
        OUTPUT INSERTED.SampradayKm AS id
        VALUES (${v.SampradayName}, ${v.ShortNm}, ${v.UplevelKt}, ${v.Uplevel1Kt}, ${v.txtAnyaName},
                ${v.txtAdyaSthapak}, ${user.id}, GETDATE())
      `.execute(trx);
      sampradayId = Number(rows[0]!.id);
    }
    for (const [column, table] of Object.entries(POPUPS)) {
      const rows = grid(f, column);
      if (rows) await upsertChildRows(trx, table, sampradayId, rows, user.id);
    }
    return sampradayId;
  },

  /**
   * Delete: the desktop's DeleteTransaction removes the anya name, adya sthapak and reference
   * rows only, leaving the notes, samvats, briefs, remarks and sthals behind; all eight go here.
   */
  async deleteRecord(trx, _user, id) {
    for (const t of Object.values(POPUPS)) {
      await sql`DELETE FROM ${sql.table(t.table)} WHERE SampradayKt = ${id}`.execute(trx);
    }
    const result = await sql`DELETE FROM Sampraday WHERE SampradayKm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  f2: {
    uplevelkt: (db) => SAMPRADAYS(db),
    uplevel1kt: (db) => SAMPRADAYS(db),
  },

  searchOverrides: {
    uplevelwithchild: {
      values: (db) =>
        pickListOf(
          db,
          sql`SELECT DISTINCT a1.SampradayKm, a1.SampradayName FROM Sampraday a
              INNER JOIN Sampraday a1 ON a.UplevelKt = a1.SampradayKm ORDER BY a1.SampradayName`,
        ),
      where: (db, codes) =>
        uplevelWithChild(db, 'Sampraday', 'SampradayKm', 'UplevelKt', codes.map(Number)),
    },
  },

  lists: {
    /** FillTree's dtTree: each name with its samvats (VK) in brackets. */
    tree: (db) =>
      pickListOf(
        db,
        sql`SELECT SampradayKm, SampradayName + CASE WHEN (SELECT COUNT(SampradaySamvatKm) FROM SampradaySamvatT
              WHERE SampradayKt = Sampraday.SampradayKm) > 0 THEN '(' + (SELECT ISNULL(STUFF((SELECT ',' +
              ISNULL(CAST(SampradaySamvatT.SamvatVK AS NVARCHAR(100)), '') FROM SampradaySamvatT
              WHERE SampradaySamvatT.SampradayKt = Sampraday.SampradayKm ORDER BY SampradaySamvatT.Seq
              FOR XML PATH('')), 1, 1, ''), '')) + ')' ELSE '' END AS SampradayName, Uplevelkt FROM Sampraday`,
      ),
    sampradays: (db) => SAMPRADAYS(db),
    'link-with-sadi': (db) =>
      pickListOf(
        db,
        sql`SELECT ColumnMastKm, Name FROM columnmaster WHERE Vibhag = 'LinkWithSadi' ORDER BY Name`,
      ),
  },

  trans: {
    // FormName "Sampraday" (SetForm_Sampraday)
    SampradayAnyaNameTran: { lookups: { libno: LIBNO } },
    SampradayAdyaSthapakTran: {
      lookups: {
        adyasthapak: (db) =>
          pickListOf(
            db,
            sql`SELECT authorcokm, txtAuthorName AS Author, Identyty, txtGuru AS Guru, Sampraday.SampradayName AS Sampraday,
                  txtParampara AS Parampara
                FROM authmast LEFT JOIN Sampraday ON authmast.Sampradaykt = Sampraday.SampradayKm ORDER BY txtAuthorName`,
          ),
      },
    },
    SampradayReferenceTran: {
      lookups: {
        libno: LIBNO,
        refplacename: (db) =>
          pickListOf(
            db,
            sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'Refplace' AND ISNULL(Name, '') <> '' ORDER BY Name`,
          ),
      },
    },
    SampradayNoteTran: {
      lookups: {
        libno: LIBNO,
        notetypename: (db) =>
          pickListOf(
            db,
            sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE Vibhag = 'SampradayNote' AND ISNULL(Name, '') <> '' ORDER BY Name`,
          ),
      },
    },
    SampradaySamvatTran: {
      lookups: {
        libno: LIBNO,
        samvattypename: (db) =>
          pickListOf(
            db,
            sql`SELECT samvatcokm, samvatname FROM samvmast WHERE ISNULL(samvatname, '') <> '' ORDER BY samvatname`,
          ),
      },
    },
    SampradayBriefTran: { lookups: { libno: LIBNO } },
    SampradayRemarkTran: { lookups: { libno: LIBNO } },
    SampradaySthalTran: {
      lookups: {
        libno: LIBNO,
        sthal: (db) =>
          pickListOf(
            db,
            sql`SELECT Tid, Vishesh FROM visheshMast WHERE remark = 'City' AND ISNULL(Vishesh, '') <> '' ORDER BY Vishesh`,
          ),
      },
    },
  },

  actions: {
    'update-uplevel': (db, _user, selected, ctx) =>
      setUplevel(db, 'UplevelKt', selected, int(ctx.params.uplevelKt)),
    'update-uplevel1': (db, _user, selected, ctx) =>
      setUplevel(db, 'Uplevel1Kt', selected, int(ctx.params.uplevelKt)),
    /** Utility › Set LinkWithSadi: "Total (n) records updated successfully". */
    async 'set-link-with-sadi'(db, _user, selected, ctx): Promise<ActionResult> {
      const kt = int(ctx.params.linkedSadiKt);
      if (kt <= 0 || selected.length === 0) return { kind: 'message', message: '' };
      const result = await sql`
        UPDATE Sampraday SET LinkedSadiKt = ${kt} WHERE SampradayKm IN ${idList(selected)}
      `.execute(db);
      return {
        kind: 'refreshed',
        rows: [],
        message: `Total (${Number(result.numAffectedRows ?? 0)}) records updated successfully`,
      };
    },
    /**
     * For Selected Record › Author Master: "Show From Sampraday (Yes) / From SampradayTran (No)
     * / Both (Cancel)".
     */
    async 'in-use-author'(db, _user, selected, ctx): Promise<ActionResult> {
      const mode = String(ctx.params.mode ?? 'both');
      const own = sql`Sampradaykt IN ${idList(selected)}`;
      const tran = sql`authorcokm IN (SELECT AuthorKt FROM AuthorSampradayT WHERE Sampradaykt IN ${idList(selected)})`;
      const where = mode === 'own' ? own : mode === 'tran' ? tran : sql`(${own} OR ${tran})`;
      return openInUse(
        db,
        'author-master',
        sql<{ id: number }>`SELECT authorcokm AS id FROM authmast WHERE ${where}`,
        'No Records Found',
      );
    },
    'in-use-magazine': (db, _user, selected) =>
      openInUse(
        db,
        'magazine-master',
        sql<{
          id: number;
        }>`SELECT Magazinekm AS id FROM MagazineM WHERE SampradayKt IN ${idList(selected)}`,
        'No Records Found',
      ),
  },
};
