import type { FieldValue } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { get, grid, list, text, val } from './book-common.js';
import { requestLabIssue } from './lab-issue-common.js';
import { type ChildTable, openInUse, trimmed, upsertChildRows } from './master-common.js';
import type { ActionResult, ScreenDefinition } from './registry.js';

const INT_MAX = 2147483647;

/** PatrikaRepository.Save's popups, by tblSearch column. */
const POPUPS: Record<string, ChildTable> = {
  PatrikaBhashaTran: {
    table: 'PatrikaBhashaT',
    key: 'PatrikaBhashaKm',
    parent: 'PatrikaKt',
    columns: { BhashaKt: 'int', Seq: 'int' },
  },
  PatrikaPrasangTran: {
    table: 'PatrikaPrasangT',
    key: 'PatrikaPrasangKm',
    parent: 'PatrikaKt',
    columns: { PrasangKt: 'int', Remark: 'text', Seq: 'int' },
  },
  PatrikaMixSignTran: {
    table: 'PatrikaMixSignT',
    key: 'PatrikaMixSignKm',
    parent: 'PatrikaKt',
    columns: { MixSignKt: 'int', Seq: 'int' },
  },
};

/** The Patrika text columns the form writes, and their sizes: the desktop's INSERT fails past them. */
const LENGTHS: [field: string, label: string, max: number][] = [
  ['RecordNo', 'RecordNo', 10],
  ['PatrikaPrasangTran', 'Prasang', 500],
  ['PatrikaBhashaTran', 'Bhasha', 100],
  ['Samvat', 'Samvat', 20],
  ['Pages', 'Pages', 10],
  ['Remark', 'Remark', 1000],
];

/** The record's own values, as frmPatrika.Save fills EntPatrika. */
function values(f: Record<string, FieldValue>) {
  return {
    // Ent.RecordNo = txtRecordNo.Text (not trimmed).
    RecordNo: text(f.RecordNo),
    CityKt: Math.trunc(val(f.CityKt)),
    SamvatTypeKt: Math.trunc(val(f.SamvatTypeKt)),
    Samvat: trimmed(f.Samvat),
    SamvatVK: Math.trunc(val(f.SamvatVK)),
    SizeKt: Math.trunc(val(f.SizeKt)),
    Pages: trimmed(f.Pages),
    AuthorKt: Math.trunc(val(f.AuthorKt)),
    SampradayKt: Math.trunc(val(f.SampradayKt)),
    Remark: trimmed(f.Remark),
    txtPrasang: trimmed(f.PatrikaPrasangTran),
    txtBhasha: trimmed(f.PatrikaBhashaTran),
  };
}

/**
 * PatrikaRepository.GetValidationMessage, verbatim and in its order, CRLF-joined. Its
 * "- RecordNo Already Exist" needs the database, so the whole check runs inside the save's
 * transaction, with the RecordNo range held (UPDLOCK) so two saves cannot both pass it. Then
 * what the desktop's INSERT / UPDATE would fail on (an overlong text, an int out of range), as
 * a message instead of an aborted save.
 */
async function validationMessage(
  trx: Executor,
  f: Record<string, FieldValue>,
  id: number,
): Promise<string> {
  const v = values(f);
  const lines: string[] = [];
  if (v.txtPrasang === '') lines.push('- Prasang is Mandatory');
  if (v.RecordNo === '') lines.push('- RecordNo is Mandatory');
  // Runs even when RecordNo is blank, as on the desktop.
  const { rows } = await sql<{ n: number }>`
    SELECT COUNT(PatrikaKm) AS n FROM Patrika WITH (UPDLOCK, HOLDLOCK)
    WHERE PatrikaKm <> ${id} AND RecordNo = ${v.RecordNo}
  `.execute(trx);
  if (Number(rows[0]?.n ?? 0) > 0) lines.push('- RecordNo Already Exist');
  if (v.txtBhasha === '') lines.push('- Bhasha is Mandatory');
  if (lines.length > 0) return lines.join('\r\n');

  for (const [field, label, max] of LENGTHS) {
    if (trimmed(f[field]).length > max) return `${label} cannot be longer than ${max} characters`;
  }
  if (Math.abs(v.SamvatVK) > INT_MAX) return 'SamvatVK is too large';
  for (const r of grid(f, 'PatrikaPrasangTran') ?? []) {
    if (text(get(r, 'Remark')).trim().length > 500)
      return 'Prasang Remark cannot be longer than 500 characters';
  }
  return '';
}

/**
 * GetRecordNo("Patrika", "RecordNo", Prefix) (MdlLib.vb): the series' highest number + 1, after
 * the prefix ('P' becomes 'P0'; 'EP' stays), padded to 5 digits. The desktop's MAX over the
 * text works because the numbers are zero-padded; TRY_CAST keeps a stray RecordNo from making
 * the query fail. A 7-digit number gives '' (the desktop's Select Case has no branch for it).
 */
export async function nextRecordNo(db: Executor, prefix: 'P' | 'EP'): Promise<string> {
  const head = prefix.length === 1 ? `${prefix}0` : prefix;
  const { rows } = await sql<{ n: number }>`
    SELECT ISNULL(MAX(TRY_CAST(RIGHT(RecordNo, 5) AS int)), 0) + 1 AS n FROM Patrika WHERE LEFT(RecordNo, 2) = ${head}
  `.execute(db);
  const digits = String(Number(rows[0]?.n ?? 1));
  if (digits.length > 6) return '';
  return head + digits.padStart(5, '0');
}

const prefixOf = (v: unknown): 'P' | 'EP' => (text(v).trim().toUpperCase() === 'EP' ? 'EP' : 'P');

/**
 * Issue › Patrika (frmPatrika, PatrikaRepository). Table Patrika, IDENTITY key PatrikaKm; no
 * Locked column (Ctrl+L / Ctrl+U fail on the desktop). Children PatrikaBhashaT /
 * PatrikaPrasangT / PatrikaMixSignT are upserted with their keys kept, in the record's
 * transaction. See docs/screens/patrika.md.
 */
export const patrika: ScreenDefinition = {
  screen: 'patrika',
  table: 'Patrika',
  primaryColumn: 'PatrikaKm',
  lockable: false,
  // insertworkreports after Add and Edit; Delete logs nothing.
  workReport: true,
  workReportOn: { add: true, edit: true, delete: false },

  // GetValidationMessage needs the database: it runs in `save` (validationMessage).
  validate: () => '',

  async save(trx, user, id, f) {
    const message = await validationMessage(trx, f, id);
    if (message) throw new BadRequestException(message);
    const v = values(f);
    let patrikaId = id;
    if (id > 0) {
      const updated = await sql`
        UPDATE Patrika SET RecordNo = ${v.RecordNo}, CityKt = ${v.CityKt}, SamvatTypeKt = ${v.SamvatTypeKt},
          Samvat = ${v.Samvat}, SamvatVK = ${v.SamvatVK}, SizeKt = ${v.SizeKt}, Pages = ${v.Pages},
          AuthorKt = ${v.AuthorKt}, SampradayKt = ${v.SampradayKt}, Remark = ${v.Remark},
          txtPrasang = ${v.txtPrasang}, txtBhasha = ${v.txtBhasha}, moduser = ${user.id}, moddate = GETDATE()
        WHERE PatrikaKm = ${id}
      `.execute(trx);
      if (Number(updated.numAffectedRows ?? 0) === 0)
        throw new BadRequestException('Record not found');
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO Patrika (RecordNo, CityKt, SamvatTypeKt, Samvat, SamvatVK, SizeKt, Pages, AuthorKt,
          SampradayKt, Remark, txtPrasang, txtBhasha, enuser, endate)
        OUTPUT INSERTED.PatrikaKm AS id
        VALUES (${v.RecordNo}, ${v.CityKt}, ${v.SamvatTypeKt}, ${v.Samvat}, ${v.SamvatVK}, ${v.SizeKt},
          ${v.Pages}, ${v.AuthorKt}, ${v.SampradayKt}, ${v.Remark}, ${v.txtPrasang}, ${v.txtBhasha},
          ${user.id}, GETDATE())
      `.execute(trx);
      patrikaId = Number(rows[0]!.id);
    }
    // A popup that was never opened sends no rows, and its table is left as it is.
    for (const [column, table] of Object.entries(POPUPS)) {
      const rows = grid(f, column);
      if (rows) await upsertChildRows(trx, table, patrikaId, rows, user.id);
    }
    return patrikaId;
  },

  /**
   * Deliberate difference: the desktop deletes with no in-use check, leaving graphicbkt /
   * issuetran / AuthorRefLibno rows and Patrika lab requests pointing at nothing. The web
   * refuses instead.
   */
  async checkInUse(db, id) {
    const used = async (q: ReturnType<typeof sql<{ n: number }>>) =>
      Number((await q.execute(db)).rows[0]?.n ?? 0) > 0;
    if (await used(sql`SELECT COUNT(*) AS n FROM graphicbkt WHERE PatrikaKt = ${id}`))
      return 'Record is used in Graphics Detail';
    if (await used(sql`SELECT COUNT(*) AS n FROM issuetran WHERE PatrikaKt = ${id}`))
      return 'Record is used in Issue Master';
    if (await used(sql`SELECT COUNT(*) AS n FROM AuthorRefLibno WHERE PatrikaKt = ${id}`))
      return 'Record is used in Author Master';
    if (
      await used(
        sql`SELECT COUNT(*) AS n FROM LabIssueM WHERE Type = 'Patrika' AND BookTKt = ${id}`,
      )
    )
      return 'Record is used in Lab Issue Master';
    return '';
  },

  /** DeleteTransaction (the three popups' rows) and the record, in one transaction. */
  async deleteRecord(trx, _user, id) {
    for (const t of Object.values(POPUPS)) {
      await sql`DELETE FROM ${sql.table(t.table)} WHERE PatrikaKt = ${id}`.execute(trx);
    }
    const result = await sql`DELETE FROM Patrika WHERE PatrikaKm = ${id}`.execute(trx);
    return Number(result.numAffectedRows ?? 0);
  },

  /**
   * btnNew_Click: the next RecordNo of the current grid row's series (EP when its RecordNo
   * starts with EP, else P; P when the grid is empty, where the desktop throws).
   */
  async newDefaults(db, _user, params) {
    return { RecordNo: await nextRecordNo(db, prefixOf(params?.prefix)) };
  },

  // frmDisplayTransNew.SetForm_Patrika (s = 0).
  trans: {
    PatrikaBhashaTran: {
      lookups: {
        bhashaname: list(
          sql`SELECT bhashacokm, bhasa_attr, bhashaname FROM bhasmast WHERE ISNULL(bhasa_attr, '') <> '' ORDER BY bhashaname`,
        ),
      },
    },
    PatrikaPrasangTran: {
      lookups: {
        prasangname: list(
          sql`SELECT columnmastkm, Name FROM columnmaster WHERE vibhag = 'Prasang' ORDER BY Name`,
        ),
      },
    },
    PatrikaMixSignTran: {
      lookups: {
        mixsignname: list(
          sql`SELECT Tid, Vishesh, v.Brief, v.Notes, v.HindiWord FROM VisheshMast v
              WHERE remark = 'CHKBX' AND v.VisheshNo IN (1, 3) ORDER BY vishesh`,
        ),
      },
    },
  },

  actions: {
    /**
     * A key in txtRecordNo in Add mode ("Select Series": Yes for P, No for EP): that series'
     * next RecordNo, for the form to put in the box.
     */
    async 'next-recordno'(db, _user, _ids, ctx): Promise<ActionResult> {
      return {
        kind: 'form',
        fields: { RecordNo: await nextRecordNo(db, prefixOf(ctx.params.prefix)) },
        trans: {},
      };
    },

    /** For Selected Record › Graphics Detail: frmGraphicsDetail with the selected Patrikas' graphics. */
    async 'graphics-detail'(db, _user, ids): Promise<ActionResult> {
      return openInUse(
        db,
        'graphics-detail',
        sql<{
          id: number;
        }>`SELECT graphicBkTkm AS id FROM graphicbkt WHERE PatrikaKt IN ${idList(ids.length ? ids : [0])}`,
        'No Record Found',
      );
    },

    /** For Selected Record › Utility › Request For LabIssue (For party 0, Type Patrika). */
    async 'request-lab-issue'(db, user, ids): Promise<ActionResult> {
      const { rows } = await sql<{ id: number; RecordNo: string | null }>`
        SELECT PatrikaKm AS id, RecordNo FROM Patrika WHERE PatrikaKm IN ${idList(ids.length ? ids : [0])}
      `.execute(db);
      const byId = new Map(rows.map((r) => [Number(r.id), text(r.RecordNo)]));
      const items = ids.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! }));
      return { kind: 'message', message: await requestLabIssue(db, user.id, items, 0, 'Patrika') };
    },
  },
};
