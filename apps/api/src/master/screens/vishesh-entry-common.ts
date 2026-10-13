import type { FieldValue, GridRow, GridValue } from '@gglib/shared';
import { sql } from 'kysely';
import { type Executor, idList } from '../../db/legacy-sql.js';
import { ident } from '../../db/trusted-sql.js';
import { pickListOf } from '../values.js';
import {
  contString,
  get,
  grid,
  int,
  list,
  type Row,
  signBetween,
  text,
  val,
} from './book-common.js';
import { type ChildTable, openInUse, upsertChildRows } from './master-common.js';
import type { ScreenDefinition, TransDefinition } from './registry.js';
import { saveVishayEntry, VISHAY_ENTRY_LOOKUPS } from './vishay-entry.js';

/**
 * The Vishesh entry forms of the Library menu: Magazine Vishesh Master (frmMagazineVisheshNew,
 * MagazineVisheshRepository) and English Book Vishesh (frmEnglishBookVishesh,
 * EnglishBookVisheshRepository). The two forms and repositories are the same code with the
 * names swapped; what differs is described by a `VisheshEntryConfig`. See
 * docs/screens/magazine-vishesh-master.md and english-book-vishesh.md.
 */

/** A column the repository writes from a text box. */
type RecordColumn = {
  name: string;
  /**
   * `int`: Val() of the box (or its Tag for a ...Kt box); `text`: the box trimmed; `raw`: the
   * box as typed (Magazine's SubSeq).
   */
  kind: 'int' | 'text' | 'raw';
  /** nvarchar length: a longer value is refused with a validation line, not an SQL error. */
  max?: number;
  /** The name the validation line uses. */
  label?: string;
};

/** A popup's child table, and the summary column Save rebuilds from its rows. */
type ChildSpec = {
  /** The tblSearch column (Type 'T') of the popup, whose rows the client sends. */
  column: string;
  table: ChildTable;
  /** The record column the joined text goes to (INSQ: blank as ' '). */
  summary: string;
  max: number;
  label: string;
  /** SignBetweenStr's sign: "," (its default) or ", ". */
  sign: string;
  /** The text one row adds to the summary. */
  text: (row: Row) => string;
};

/** One frmVishayEntry box: its tblSearch column and its VishayEntry.TransactionName. */
type VishayEntrySpec = { column: string; transactionName: string; summary: string };

export type VisheshEntryConfig = {
  screen: string;
  table: string;
  primaryColumn: string;
  /** The UpdateMagazineSeq @Transaction switch. */
  seqTransaction: string;
  /** Record columns besides BookTKt, BookMastKt, Seq and WorkDoneByKt, in the INSERT's order. */
  columns: RecordColumn[];
  /**
   * `Ent.Seq = txtSeq.Text` (Magazine: a whole number, anything else throws on the desktop)
   * rather than `Val(txtSeq.Text)` (English).
   */
  strictSeq: boolean;
  vishayEntries: VishayEntrySpec[];
  /** In the order Save processes them. */
  children: ChildSpec[];
  /** Grid columns FillList passes through GetcontString. */
  contStringColumns: string[];
  /** Record columns FillData passes through GetcontString (the vishay boxes). */
  contStringBoxes: { box: string; column: string }[];
  listOrderBy?: string;
  /** Extra F2 lists of the form's own Txt_KeyDown. */
  f2?: ScreenDefinition['f2'];
  /** Extra popups (English Book Vishesh's Tag). */
  trans?: Record<string, TransDefinition>;
};

// ------------------------------------------------------------------------------------------
// Conversions
// ------------------------------------------------------------------------------------------

/** CInt(String) for `Ent.Seq = txtSeq.Text`: a whole number, or 0 (the desktop throws). */
const strictInt = (v: unknown) => {
  const s = text(v).trim();
  if (!/^[+-]?\d+$/.test(s)) return 0;
  const n = Number(s);
  return Number.isSafeInteger(n) && Math.abs(n) <= 2147483647 ? n : 0;
};

/** Val() of a box going to an int column, kept inside the column's range. */
const intVal = (v: unknown) => {
  const n = int(v);
  return Math.abs(n) <= 2147483647 ? n : 0;
};

const columnValue = (c: RecordColumn, v: FieldValue | undefined) =>
  c.kind === 'int' ? intVal(v) : c.kind === 'raw' ? text(v) : text(v).trim();

/** The summary a popup's rows make (SignBetweenStr over the rows). */
function summaryOf(child: ChildSpec, rows: Row[]): string {
  let out = '';
  for (const r of rows) out = signBetween(out, child.text(r), child.sign);
  return out.trim();
}

// ------------------------------------------------------------------------------------------
// Lists shared by both forms
// ------------------------------------------------------------------------------------------

/** The Author popup's list (the commented-out authmast list replaced by this "mainname" one). */
const AUTHOR_LIST = list(sql`
  SELECT a.authorcokm, a.txtauthorname AS authorname, ISNULL(a.txtGuru, '') AS Guru, a.identyty,
    ISNULL(a.count, 0) AS count, ISNULL(a.recordno, 0) AS recordno, ISNULL(c.name, '') AS vibhag,
    a.txtParampara AS Parampara, a.txtGuru AS Guru1, ISNULL(v.SampradayName, '') AS samprady,
    ISNULL(a.vksamvat, 0) AS vksamvat, a.authorname AS mainname
  FROM authmast AS a LEFT OUTER JOIN columnmaster AS c ON a.vibhagkt = c.columnmastkm
  LEFT OUTER JOIN Sampraday AS v ON a.sampradayKt = v.SampradayKm`);

/** setform_MagazineVishesh / setform_EnglishBookVishesh: the cell lists of the four popups. */
const POPUPS: Record<string, TransDefinition> = {
  BhashaTran: {
    lookups: {
      bhashaname: list(
        sql`SELECT bhashacokm, bhashaname, bhasa_attr FROM bhasmast ORDER BY bhashaname`,
      ),
    },
  },
  MTypeTran: {
    lookups: {
      mtypename: list(
        sql`SELECT columnmastkm, name, ColumnNo FROM columnmaster WHERE vibhag = 'MagazineVisheshType' ORDER BY columnno`,
      ),
    },
  },
  AuthorTypeTran: {
    lookups: {
      authortypename: list(
        sql`SELECT authtycokm, authortype FROM authtype WHERE ISNULL(authortype, '') <> '' ORDER BY authortype`,
      ),
    },
  },
  AuthorTran: {
    lookups: {
      authorname: AUTHOR_LIST,
      anyaname: (db, row) =>
        pickListOf(
          db,
          sql`SELECT AuthAnyaNmKm, AnyaName FROM AuthMAnyNmT WHERE AuthmastKt = ${int(row.AuthorKt ?? row.authorkt)} ORDER BY AnyaName`,
        ),
      padvi: list(
        sql`SELECT tid, vishesh FROM visheshmast WHERE remark = 'avastha' AND ISNULL(visheshno, 0) > 5 ORDER BY vishesh`,
      ),
      sign: list(
        sql`SELECT columnmastkm, name FROM columnmaster WHERE vibhag = 'sign' AND ISNULL(columnno, 0) < 10 ORDER BY name`,
      ),
    },
  },
};

/** The child tables of the four popups both forms have, under the table's prefix. */
export function commonChildren(prefix: string): Record<string, ChildSpec> {
  const parent = `${prefix}Kt`;
  return {
    BhashaTran: {
      column: 'BhashaTran',
      table: {
        table: `${prefix}BhashaT`,
        key: `${prefix}BhashaKm`,
        parent,
        columns: { BhashaKt: 'int', Seq: 'int' },
        audit: true,
      },
      summary: 'BhashaName',
      max: 100,
      label: 'Bhasha',
      sign: ',',
      text: (r) => text(get(r, 'BhashaName')),
    },
    MTypeTran: {
      column: 'MTypeTran',
      table: {
        table: `${prefix}MTypeT`,
        key: `${prefix}MTypeKm`,
        parent,
        columns: { MTypeKt: 'int', Seq: 'int' },
        audit: true,
      },
      summary: 'MTypeName',
      max: 500,
      label: 'MType',
      sign: ', ',
      text: (r) => text(get(r, 'MTypeName')),
    },
    AuthorTypeTran: {
      column: 'AuthorTypeTran',
      table: {
        table: `${prefix}AuthorTypeT`,
        key: `${prefix}AuthorTypeKm`,
        parent,
        columns: { AuthorTypeKt: 'int', Seq: 'int' },
        audit: true,
      },
      summary: 'AuthorTypeName',
      max: 500,
      label: 'Author Type',
      sign: ', ',
      text: (r) => text(get(r, 'AuthorTypeName')),
    },
    AuthorTran: {
      column: 'AuthorTran',
      table: {
        table: `${prefix}AuthorT`,
        key: `${prefix}AuthorKm`,
        parent,
        columns: { AuthorKt: 'int', AuthAnyaNmKt: 'int', PadKt: 'int', SignKt: 'int', Seq: 'int' },
        audit: true,
      },
      summary: 'AuthorName',
      max: 500,
      label: 'Author',
      sign: ', ',
      text: (r) =>
        text(get(r, 'AnyaName')) !== '' ? text(get(r, 'AnyaName')) : text(get(r, 'AuthorName')),
    },
  };
}

// ------------------------------------------------------------------------------------------
// The screen
// ------------------------------------------------------------------------------------------

export function visheshEntryScreen(cfg: VisheshEntryConfig): ScreenDefinition {
  const { table, primaryColumn: pk } = cfg;
  const parent = `${cfg.table}Kt`;

  /** GetValidationMessage, then the lengths the desktop would fail on (CrLf-joined). */
  function validate(f: Record<string, FieldValue>): string {
    const lines: string[] = [];
    if (val(f.BookMastKt) === 0) lines.push('- Book Name is Mandatory');
    if (val(f.BookTKt) === 0) lines.push('- LibNo is Mandatory');
    const seq = cfg.strictSeq ? strictInt(f.Seq) : intVal(f.Seq);
    if (seq === 0) lines.push('- Seq is Mandatory');
    if (val(f.WorkDoneByKt) === 0) lines.push('- Work Done By is Mandatory');
    // The desktop's INSERT fails on these with "String or binary data would be truncated".
    for (const c of cfg.columns) {
      if (c.max && columnValue(c, f[c.name]).toString().length > c.max)
        lines.push(`- ${c.label ?? c.name} cannot be longer than ${c.max} characters`);
    }
    for (const child of cfg.children) {
      const rows = grid(f, child.column);
      if (rows && summaryOf(child, rows).length > child.max)
        lines.push(`- ${child.label} cannot be longer than ${child.max} characters`);
    }
    return lines.join('\r\n');
  }

  async function save(
    trx: Executor,
    userId: number,
    id: number,
    f: Record<string, FieldValue>,
  ): Promise<number> {
    const values: [string, GridValue][] = [
      ['BookTKt', intVal(f.BookTKt)],
      ['BookMastKt', intVal(f.BookMastKt)],
      ['Seq', cfg.strictSeq ? strictInt(f.Seq) : intVal(f.Seq)],
      ...cfg.columns.map((c): [string, GridValue] => [c.name, columnValue(c, f[c.name])]),
      ['WorkDoneByKt', intVal(f.WorkDoneByKt)],
    ];
    let recordId = id;
    if (id > 0) {
      const sets = values.map(([n, v]) => sql`${ident(n)} = ${v}`);
      await sql`
        UPDATE ${ident(table)} SET ${sql.join(sets)}, moduser = ${userId}, moddate = GETDATE()
        WHERE ${ident(pk)} = ${id}`.execute(trx);
    } else {
      const { rows } = await sql<{ id: number }>`
        INSERT INTO ${ident(table)} (${sql.join(values.map(([n]) => ident(n)))}, enuser, endate)
        OUTPUT INSERTED.${ident(pk)} AS id
        VALUES (${sql.join(values.map(([, v]) => sql`${v}`))}, ${userId}, GETDATE())`.execute(trx);
      recordId = Number(rows[0]!.id);
    }
    for (const v of cfg.vishayEntries)
      await saveVishayEntry(trx, grid(f, v.column), v.transactionName, table, pk, recordId);
    for (const child of cfg.children) {
      const rows = grid(f, child.column);
      if (rows === null) continue;
      await upsertChildRows(trx, child.table, recordId, rows, userId);
      await sql`
        UPDATE ${ident(table)} SET ${ident(child.summary)} = ${summaryOf(child, rows) || ' '}
        WHERE ${ident(pk)} = ${recordId}`.execute(trx);
    }
    return recordId;
  }

  return {
    screen: cfg.screen,
    table,
    primaryColumn: pk,
    // The table has no Locked column: Ctrl+L / Ctrl+U fail after the password, as on the desktop.
    lockable: false,
    ...(cfg.listOrderBy ? { listOrderBy: cfg.listOrderBy } : {}),
    workReport: true,
    workReportOn: { delete: false },

    validate: (f) => validate(f),
    save: (trx, user, id, f) => save(trx, user.id, id, f),

    /** btnNew_Click: Seq = the kept book's MAX(Seq) + 1 (1 with no book). */
    async newDefaults(db, _user, params) {
      const { rows } = await sql<{ seq: number }>`
        SELECT ISNULL(MAX(Seq), 0) + 1 AS seq FROM ${ident(table)} WHERE BookMastKt = ${int(params?.BookMastKt)}
      `.execute(db);
      return { Seq: Number(rows[0]?.seq ?? 1) };
    },

    /** The menu's pick: " AND BookMastKt=<pick>" (Refresh keeps it; Show All Records drops it). */
    listCondition: (params) =>
      params.BookMastKt === undefined ? null : sql`BookMastKt = ${int(params.BookMastKt)}`,

    async decorateList(_db, rows: GridRow[]) {
      for (const r of rows)
        for (const c of cfg.contStringColumns) if (c in r) r[c] = contString(text(r[c]));
      return rows;
    },

    /** FillData: the vishay boxes show GetcontString of their summary. */
    async recordExtras(db, id) {
      const cols = cfg.contStringBoxes;
      const { rows } = await sql<Record<string, unknown>>`
        SELECT ${sql.join(cols.map((c) => sql`${ident(c.column)} AS ${ident(c.box)}`))}
        FROM ${ident(table)} WHERE ${ident(pk)} = ${id}`.execute(db);
      const out: GridRow = {};
      for (const c of cols) out[c.box] = contString(text(rows[0]?.[c.box]));
      return out;
    },

    /** Delete(StrId): the record's Vishay lines and popup rows, then the record. */
    async deleteRecord(trx, _user, id) {
      for (const v of cfg.vishayEntries) {
        await sql`
          DELETE FROM VishayEntry WHERE TransactionName = ${v.transactionName} AND RecordKt = ${id}
        `.execute(trx);
      }
      for (const child of cfg.children) {
        await sql`DELETE FROM ${ident(child.table.table)} WHERE ${ident(parent)} = ${id}`.execute(
          trx,
        );
      }
      const result = await sql`DELETE FROM ${ident(table)} WHERE ${ident(pk)} = ${id}`.execute(trx);
      return Number(result.numAffectedRows ?? 0);
    },

    trans: {
      ...Object.fromEntries(
        cfg.vishayEntries.map((v) => [v.column, { lookups: VISHAY_ENTRY_LOOKUPS }]),
      ),
      ...Object.fromEntries(
        cfg.children.filter((c) => POPUPS[c.column]).map((c) => [c.column, POPUPS[c.column]!]),
      ),
      ...cfg.trans,
    },

    f2: {
      /** txtBookTKt: every library number with its book (the pick fills Book Name too). */
      booktkt: (db) =>
        pickListOf(
          db,
          sql`SELECT tid, Libno, BookName + CASE WHEN ISNULL(BookM.Part, '') = '' THEN '' ELSE ' ' + BookM.Part END AS BookName,
                BookMastKm
              FROM BookT INNER JOIN BookM ON BookT.BookMastkt = BookM.BookMastkm
              WHERE ISNULL(Libno, '') <> '' ORDER BY Libno`,
        ),
      ...cfg.f2,
    },

    lists: {
      /** The menu's DisplayListForm (boolSelectFirst) before the form opens: the books listed. */
      open: (db) =>
        pickListOf(
          db,
          sql`SELECT DISTINCT BookMastKm,
                BookName + CASE WHEN ISNULL(Part, '') <> '' THEN ' ' + Part ELSE '' END AS BookName,
                txtBookTran AS LibNo, txtPrakashak AS Prakashak, txtAuthor AS Author, txtVibhag AS Vibhag
              FROM ${ident(table)} INNER JOIN BookM ON ${ident(table)}.BookMastKt = BookM.BookMastkm
              ORDER BY BookName`,
        ),
    },

    actions: {
      /** Utility › Update Seq: renumber the form's book (txtBookMastKt.Tag), then FillList. */
      async 'update-seq'(db, _user, _ids, ctx) {
        await sql`EXEC UpdateMagazineSeq @Transaction = ${cfg.seqTransaction}, @BookMastKt = ${int(ctx.params.bookMastKt)}`.execute(
          db,
        );
        return { kind: 'message', message: '' };
      },
      /** For Selected Record › BookM: Book Master on the form's book (txtBookMastKt.Tag). */
      async bookm(_db, _user, _ids, ctx) {
        return {
          kind: 'open',
          screen: 'book-master',
          ids: [int(ctx.params.bookMastKt)],
          emptyMessage: '',
        };
      },
      /** For Selected Record › Author: the selected records' authors; nothing at all when none. */
      author: (db, _user, ids) =>
        openInUse(
          db,
          'author-master',
          sql<{ id: number }>`SELECT authorcokm AS id FROM authmast WHERE authorcokm IN (
            SELECT AuthorKt FROM ${ident(`${table}AuthorT`)} WHERE ${ident(parent)} IN ${idList(ids.length ? ids : [0])})`,
          '',
        ),
    },
  };
}
