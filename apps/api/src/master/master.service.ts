import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ActionResult,
  type FieldValue,
  type GridRow,
  type GridValue,
  type MasterMeta,
  parseSearch,
  type PickList,
  type PrintCondition,
  type PrintLayout,
  type PrintRequest,
  type PrintResult,
  type SaveLayoutRequest,
  type SaveResult,
  type SessionUser,
  type TransGrid,
  type TransTable,
  type WorkReportEntry,
} from '@gglib/shared';
import { type RawBuilder, sql } from 'kysely';
import { ENV, type Env } from '../config/env.js';
import { KYSELY, type Database } from '../db/db.module.js';
import { type Executor, idList, inTransaction, textList } from '../db/legacy-sql.js';
import { ident, trustedSql } from '../db/trusted-sql.js';
import { type ListParams, type ScreenDefinition, screenDefinition } from './screens/registry.js';
import { mistakeRemarkDetail } from './screens/work-report.js';
import { SecurityPassword } from './security-password.js';
import {
  freeTextTargets,
  gridColumnsSql,
  loadTblSearch,
  isSecret,
  printColumns,
  recordColumnsSql,
  searchColumns,
  type TblSearchRow,
  unescapeSql,
} from './tbl-search.js';
import { compileFilter } from './search-sql.js';
import { normalizeRow, normalizeValue, pickListOf } from './values.js';

export { compileFilter };
import {
  compareTables,
  decide,
  modifyWorkTypes,
  prepareWorkReport,
  writeWorkReport,
} from './work-report-log.js';

type Sql = RawBuilder<unknown>;
const EMPTY: Sql = sql``;

/**
 * The shared behaviour of the desktop's master forms (frmMasterPage + CommonRepository +
 * UcSearch + clsCommon.EnableDisableDataEditing), driven by each screen's tblSearch rows.
 */
@Injectable()
export class MasterService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly security: SecurityPassword,
  ) {}

  definition(screen: string): ScreenDefinition {
    const def = screenDefinition(screen);
    if (!def) throw new NotFoundException('Unknown screen');
    return def;
  }

  /** A screen whose definition may change records (not a list-only form like Work Report). */
  private writable(screen: string, user?: SessionUser): ScreenDefinition {
    const def = this.definition(screen);
    if (def.readOnly) throw new ForbiddenException('Records cannot be changed on this screen');
    if (user && def.writableBy && !def.writableBy(user))
      throw new ForbiddenException('You cannot change records on this screen');
    return def;
  }

  /**
   * ScreenDefinition.recordWritableBy: may this user add (`id` 0), edit or delete the record?
   * With `enforceListFilter`, an existing record must also be one the user can see.
   */
  private async assertRecordWritable(
    db: Executor,
    def: ScreenDefinition,
    user: SessionUser,
    id: number,
    op: 'add' | 'edit' | 'delete',
  ) {
    if (def.recordWritableBy && !def.recordWritableBy(user, id, op))
      throw new ForbiddenException('You cannot change this record');
    if (id > 0) await this.assertVisible(db, def, user, id);
    if (id > 0 && def.lockedColumns?.length) {
      const { rows } = await sql<Record<string, unknown>>`
        SELECT ${sql.join(def.lockedColumns.map((c) => ident(c)))} FROM ${ident(def.table)}
        WHERE ${ident(def.primaryColumn)} = ${id}
      `.execute(db);
      const row = rows[0];
      if (row && Object.values(row).some((v) => v === true || Number(v) === 1))
        throw new ForbiddenException('This record is Locked');
    }
    if (id > 0 && def.buttonsOff && op !== 'add') {
      const { rows } = await sql<GridRow>`
        SELECT * FROM ${ident(def.table)} WHERE ${ident(def.primaryColumn)} = ${id}
      `.execute(db);
      const off = rows[0] ? def.buttonsOff(rows[0], user) : {};
      if (op === 'edit' && off.modify)
        throw new ForbiddenException('This record cannot be modified');
      if (op === 'delete' && off.delete)
        throw new ForbiddenException('This record cannot be deleted');
    }
    if (id > 0 && def.lockedWhen) {
      const { rows } = await sql<GridRow>`
        SELECT * FROM ${ident(def.table)} WHERE ${ident(def.primaryColumn)} = ${id}
      `.execute(db);
      const row = rows[0];
      if (row && def.lockedWhen(row, user))
        throw new ForbiddenException('This record was entered by another user');
    }
  }

  /**
   * With `enforceListFilter`: the record must be one of this user's (listFilter), or it does not
   * exist as far as they are concerned.
   */
  async assertVisible(
    db: Executor,
    def: ScreenDefinition,
    user: SessionUser | undefined,
    id: number,
  ) {
    if (!def.enforceListFilter || !def.listFilter || id <= 0) return;
    if (!user) throw new ForbiddenException('You cannot see this record');
    const { rows } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM ${ident(def.table)}
      WHERE ${ident(def.primaryColumn)} = ${id} ${this.userFilter(def, user)}
    `.execute(db);
    if (Number(rows[0]?.n ?? 0) === 0) throw new NotFoundException('Record not found');
  }

  /** The screen's tblSearch rows without its secret columns (ScreenDefinition.secretColumns). */
  private async tbl(db: Executor, def: ScreenDefinition): Promise<TblSearchRow[]> {
    let rows = await loadTblSearch(db, def.table);
    if (def.gridColumnsAlso?.length) {
      // ScreenDefinition.gridColumnsAlso: shown in the grid, after tblSearch's own grid columns.
      const also = def.gridColumnsAlso;
      rows = rows.map((r) => {
        const at = also.findIndex(
          (c) => c.column.toLowerCase() === (r.ColumnName ?? '').toLowerCase(),
        );
        return at < 0 || r.DisplayInGrid
          ? r
          : {
              ...r,
              DisplayInGrid: true,
              GridSeq: 100_000 + at,
              GridSelect: also[at]!.select ?? (r.JoinCondition || r.ColumnName || ''),
            };
      });
    }
    if (!def.secretColumns?.length) return rows;
    const secret = isSecret(def.secretColumns);
    return rows.filter((r) => !secret(r));
  }

  /** ScreenDefinition.searchableBy: may this user search the screen at all? */
  private canSearch(def: ScreenDefinition, user?: SessionUser): boolean {
    return !def.searchableBy || (user !== undefined && def.searchableBy(user));
  }

  /** The secret columns' stored bytes (hex), to tell whether a save changed them. */
  private async secretValues(
    db: Executor,
    def: ScreenDefinition,
    id: number,
  ): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const column of def.secretColumns ?? []) {
      const { rows } = await sql<{ v: string | null }>`
        SELECT CONVERT(varchar(max), CONVERT(varbinary(max), ${ident(column)}), 2) AS v
        FROM ${ident(def.table)} WHERE ${ident(def.primaryColumn)} = ${id}
      `.execute(db);
      out[column] = rows[0]?.v ?? '';
    }
    return out;
  }

  async meta(screen: string, db: Executor = this.db, user?: SessionUser): Promise<MasterMeta> {
    const def = this.definition(screen);
    const rows = await this.tbl(db, def);
    const { rows: allLayouts } = await sql<{
      ConfigId: number;
      ConfigName: string;
      ConfigStr: string | null;
      ShortcutKey: string | null;
      ConfigRemark: string | null;
      ConditionColumn: string | null;
      ConditionValue: string | null;
    }>`
      SELECT ConfigId, ConfigName, ConfigStr, ShortcutKey, ConfigRemark, ConditionColumn, ConditionValue
      FROM Config_Master WHERE ConfigType = ${def.table} ORDER BY ConfigName
    `.execute(db);
    const toLayout = (l: (typeof allLayouts)[number]): PrintLayout => ({
      id: l.ConfigId,
      name: l.ConfigName,
      shortcut: l.ShortcutKey ?? '',
      columnIndices: (l.ConfigStr ?? '')
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n)),
      remark: l.ConfigRemark ?? '',
      condition: splitCondition(l.ConditionColumn, l.ConditionValue),
    });
    const menuLayouts = def.menuLayoutType
      ? (
          await sql<(typeof allLayouts)[number]>`
            SELECT ConfigId, ConfigName, ConfigStr, ShortcutKey, ConfigRemark, ConditionColumn, ConditionValue
            FROM Config_Master WHERE ConfigType = ${def.menuLayoutType} ORDER BY ConfigName
          `.execute(db)
        ).rows
      : allLayouts;
    return {
      screen,
      transactionName: def.table,
      primaryColumn: def.primaryColumn,
      searchColumns: this.canSearch(def, user) ? searchColumns(rows) : [],
      freeTextTargets: freeTextTargets(rows),
      // Only layouts with a shortcut key appear as their own Print Report menu item
      // (frmBhashaMaster_Load's dtConfig query); the picker's own dropdown offers every layout.
      printLayouts: menuLayouts.filter((l) => (l.ShortcutKey ?? '') !== '').map(toLayout),
      savedPrintLayouts: allLayouts.map(toLayout),
      printColumns: printColumns(
        await loadTblSearch(db, def.table),
        isSecret(def.secretColumns),
      ).map((c) => ({ index: c.index, name: c.name })),
    };
  }

  /**
   * ListGridData: the grid, newest first; `ids` limits it to those records (StrId). Without
   * ids a screen may show only its newest `listLimit` records (GetDataTable's @TotRecords).
   */
  async list(
    screen: string,
    ids?: number[],
    db: Executor = this.db,
    user?: SessionUser,
    params: ListParams = {},
  ): Promise<GridRow[]> {
    const def = this.definition(screen);
    if (def.listRows) {
      const list = await def.listRows(db, { ids, params, filter: this.userFilter(def, user) });
      return def.decorateList ? def.decorateList(db, list) : list;
    }
    const rows = await this.tbl(db, def);
    const where = ids
      ? sql`AND ${ident(def.primaryColumn)} IN ${idList(ids.length ? ids : [0])}`
      : EMPTY;
    const list = await this.select(
      db,
      def,
      gridColumnsSql(rows, def.ucSearchColumns),
      sql`${where} ${ids ? EMPTY : this.defaultCondition(def)} ${this.listCondition(def, params)} ${this.userFilter(def, user, params)}`,
      def.listOrderBy
        ? trustedSql(`ORDER BY ${def.listOrderBy}`)
        : def.listOrderAsc
          ? sql`ORDER BY ${ident(def.primaryColumn)}`
          : sql`ORDER BY ${ident(def.primaryColumn)} DESC`,
      ids ? 0 : (def.listLimit ?? 0),
      true,
    );
    return def.decorateList ? def.decorateList(db, list) : list;
  }

  /** The form's DefaultCond (UcSearch's WhereCondition), as `AND (…)`, or nothing. */
  private defaultCondition(def: ScreenDefinition): Sql {
    return def.defaultCondition ? sql`AND (${def.defaultCondition})` : EMPTY;
  }

  /** FillList's WhereCondition from the form's switches (ScreenDefinition.listCondition). */
  private listCondition(def: ScreenDefinition, params: ListParams): Sql {
    const cond = def.listCondition?.(params) ?? null;
    return cond ? sql`AND (${cond})` : EMPTY;
  }

  /** UcSearch's WhereCondition: the DefaultCond, unless it is FillList's alone. */
  private searchCondition(def: ScreenDefinition): Sql {
    return def.defaultConditionListOnly ? EMPTY : this.defaultCondition(def);
  }

  /** The screen's DefaultCondition for this user, as `AND (…)`, or nothing. */
  private userFilter(def: ScreenDefinition, user?: SessionUser, params?: ListParams): Sql {
    const filter = user && def.listFilter ? def.listFilter(user, params) : null;
    return filter ? sql`AND (${filter})` : EMPTY;
  }

  /** GetDataTableById: every column of one record, for the form's text boxes. */
  async record(
    screen: string,
    id: number,
    db: Executor = this.db,
    user?: SessionUser,
    params?: ListParams,
  ): Promise<GridRow> {
    const def = this.definition(screen);
    const rows = await this.tbl(db, def);
    const [row] = await this.select(
      db,
      def,
      recordColumnsSql(rows),
      sql`AND ${ident(def.table)}.${ident(def.primaryColumn)} IN (${id}) ${this.userFilter(def, user, params)}`,
      EMPTY,
      0,
      Boolean(def.recordJoin),
    );
    if (!row) throw new NotFoundException('Record not found');
    if (def.recordExtras) Object.assign(row, await def.recordExtras(db, id, user));
    return row;
  }

  /**
   * lblEntry (clsCommon.GetEntryUser): "who-dd/MM/yyyy | who-dd/MM/yyyy", the record's entry
   * and last modification, shown at the end of the toolbar.
   */
  async entryUser(
    screen: string,
    id: number,
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<string> {
    const def = this.definition(screen);
    await this.assertVisible(db, def, user, id);
    const { rows } = await sql<{ t: string | null }>`
      SELECT CASE WHEN ISNULL(M.enuser, 0) = 0 THEN ' | ' ELSE ua.uname + '-' + CONVERT(varchar, M.endate, 103) + ' | ' END
        + CASE WHEN ISNULL(M.moduser, 0) = 0 THEN '' ELSE um.uname + '-' + CONVERT(varchar, M.moddate, 103) END AS t
      FROM ${ident(def.table)} M
      LEFT JOIN Usecurity ua ON M.enuser = ua.tid
      LEFT JOIN Usecurity um ON M.moduser = um.tid
      WHERE M.${ident(def.primaryColumn)} = ${id}
    `.execute(db);
    return rows[0]?.t ?? '';
  }

  /** btnNew_Click: what a new record starts with (e.g. Author Master's next RecordNo). */
  async newDefaults(
    screen: string,
    db: Executor = this.db,
    user?: SessionUser,
    params: Record<string, string> = {},
  ): Promise<GridRow> {
    const def = this.definition(screen);
    return def.newDefaults ? def.newDefaults(db, user, params) : {};
  }

  /**
   * F2 on a "…Tran" text box (FillTransactionDatatable): the popup's rows, from tblSearch's
   * F2EntryText for the column with {Id} set to the record. Only columns the screen declares.
   */
  async transGrid(
    screen: string,
    column: string,
    id: number,
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<TransGrid> {
    const def = this.definition(screen);
    const trans = def.trans?.[column];
    if (!trans) throw new NotFoundException('Unknown popup');
    if (user) await this.assertVisible(db, def, user, id);
    let text: string;
    if (trans.statements) {
      text = (await trans.statements(db, id)).join(';');
    } else {
      const rows = await this.tbl(db, def);
      const row = rows.find(
        (r) => (r.Type ?? '').trim().toUpperCase() === 'T' && r.ColumnName === column,
      );
      text = unescapeSql(row?.F2EntryText ?? '').replace(/\{Id\}/gi, String(Math.trunc(id)));
    }
    // Only ids (numbers and commas) are ever substituted, as the desktop's own Replace does.
    for (const [key, value] of Object.entries((await trans.placeholders?.(db, id)) ?? {})) {
      if (!/^[\d,]*$/.test(value)) throw new Error(`Bad placeholder value for ${key}`);
      text = text.split(`{${key}}`).join(value);
    }
    const [first, ...rest] = text.split(';').filter((q) => q.trim() !== '');
    if (!first) throw new NotFoundException('Unknown popup');
    const grid: TransGrid = await this.runTable(db, first);
    const extras: TransTable[] = [];
    for (const statement of rest) extras.push(await this.runTable(db, statement));
    for (const statement of (await trans.appendTables?.(db, id)) ?? [])
      extras.push(await this.runTable(db, statement));
    if (extras[0]) grid.extra = extras[0];
    if (extras.length > 0) grid.extras = extras;
    if (trans.defaults) grid.defaults = await trans.defaults(db);
    return grid;
  }

  /** A cell's F2 list inside a popup (frmDisplayTransNew.SetForm_<X>, s = 0). */
  async transLookup(
    screen: string,
    column: string,
    lookup: string,
    row: Record<string, GridValue>,
    db: Executor = this.db,
  ): Promise<PickList> {
    const def = this.definition(screen);
    const run =
      column === REFERENCE_T1
        ? REFERENCE_LOOKUPS[lookup]
        : column === WORK_REPORT
          ? WORK_REPORT_LOOKUPS[lookup]
          : def.trans?.[column]?.lookups?.[lookup];
    if (!run) throw new NotFoundException('Unknown list');
    return run(db, row);
  }

  /**
   * F1 on a text box: its tblSearch HelpText ("Table|Key|RecordKt") names RefrenceT rows about
   * the field, shown in frmDisplayTransNew (TranName "ReferenceT1"). Empty when it has none.
   */
  async helpGrid(
    screen: string,
    column: string,
    db: Executor = this.db,
  ): Promise<TransGrid | null> {
    const ref = await this.helpTarget(screen, column, db);
    if (!ref) return null;
    return this.runTableSql(
      db,
      sql`
        SELECT r.RefrenceTkm, r.Subhead, r.WordNm, r.Example, r.BookTKt, BookT.LibNo AS BookTName, r.Refplacekt,
          cRefPlace.Name AS RefPlace, r.Pgno, r.Seq
        FROM RefrenceT r LEFT JOIN columnmaster cRefPlace ON r.Refplacekt = cRefPlace.ColumnMastkm
        LEFT JOIN BookT ON r.BookTKt = BookT.Tid
        WHERE r.Tablekt = ${ref.tableKt} AND r.RecordKt = ${ref.recordKt} ORDER BY seq
      `,
      `SELECT r.RefrenceTkm, r.Subhead, r.WordNm, r.Example, r.BookTKt, BookT.LibNo AS BookTName, r.Refplacekt, cRefPlace.Name AS RefPlace, r.Pgno, r.Seq FROM RefrenceT r LEFT JOIN columnmaster cRefPlace ON r.Refplacekt = cRefPlace.ColumnMastkm LEFT JOIN BookT ON r.BookTKt = BookT.Tid WHERE 1 = 0`,
    );
  }

  /** The F1 popup's Save: MdlLib.SaveReference, which the desktop only runs for an admin. */
  async saveHelp(
    screen: string,
    user: SessionUser,
    column: string,
    rows: Record<string, GridValue>[],
    db: Executor = this.db,
  ): Promise<void> {
    if (!user.isAdmin)
      throw new ForbiddenException('Only an administrator can change the reference');
    const ref = await this.helpTarget(screen, column, db);
    if (!ref) throw new NotFoundException('No reference for this field');
    await inTransaction(db, async (trx) => {
      await sql`DELETE FROM RefrenceT WHERE Tablekt = ${ref.tableKt} AND Recordkt = ${ref.recordKt}`.execute(
        trx,
      );
      for (const r of rows) {
        await sql`
          INSERT INTO RefrenceT (Tablekt, RecordKt, Subhead, WordNm, Example, LibNo, Refplacekt, Pgno, Seq, BookTKt)
          VALUES (${ref.tableKt}, ${ref.recordKt}, ${textOf(r.Subhead)}, ${textOf(r.WordNm)}, ${textOf(r.Example)},
            ${textOf(r.BookTName)}, ${intOf(r.Refplacekt)}, ${textOf(r.Pgno)}, ${intOf(r.Seq)}, ${intOf(r.BookTKt)})
        `.execute(trx);
      }
    });
  }

  private async helpTarget(screen: string, column: string, db: Executor) {
    const def = this.definition(screen);
    if (!def.help) return null;
    const rows = await this.tbl(db, def);
    const row = rows.find((r) => (r.ColumnName ?? '').toLowerCase() === column.toLowerCase());
    const parts = (row?.HelpText ?? '').split('|');
    if (parts.length !== 3) return null;
    const { rows: t } = await sql<{ id: number }>`
      SELECT ISNULL(ColumnMastkm, 0) AS id FROM columnmaster WHERE Vibhag = 'TableNm' AND Name = ${parts[0]!}
    `.execute(db);
    return { tableKt: Number(t[0]?.id ?? 0), recordKt: Math.trunc(Number(parts[2]) || 0) };
  }

  /** Runs one statement of a tblSearch query, with its columns even when it returns no rows. */
  private async runTable(db: Executor, text: string): Promise<TransTable> {
    return this.runTableSql(db, trustedSql(text), text);
  }

  private async runTableSql(db: Executor, query: Sql, describe: string): Promise<TransTable> {
    const [{ rows: cols }, { rows }] = await Promise.all([
      sql<{ name: string | null; system_type_name: string | null }>`
        SELECT name, system_type_name FROM sys.dm_exec_describe_first_result_set(${describe}, NULL, 0)
        ORDER BY column_ordinal
      `.execute(db),
      sql<Record<string, unknown>>`${query}`.execute(db),
    ]);
    return {
      columns: cols.map((c) => ({
        name: c.name ?? '',
        type: (c.system_type_name ?? '').replace(/\(.*$/, ''),
      })),
      rows: rows.map(normalizeRow),
    };
  }

  /** F2 on a form field: the column's F2EntryText list (Txt_KeyDown + DisplayListForm). */
  async pickList(
    screen: string,
    column: string,
    params: Record<string, string> = {},
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<PickList> {
    const def = this.definition(screen);
    const own = def.f2?.[column.toLowerCase()];
    if (own) return own(db, params, user);
    const rows = await this.tbl(db, def);
    const base = column.toLowerCase().endsWith('name') ? column.slice(0, -4) : column;
    const row = rows.find((r) => {
      const c = (r.ColumnName ?? '').toLowerCase();
      return c === column.toLowerCase() || c === base.toLowerCase();
    });
    if (!row?.F2EntryText) return { columns: [], rows: [] };
    return this.runPickList(db, trustedSql(unescapeSql(row.F2EntryText)));
  }

  /**
   * F2 / F3 in the search box: the distinct values of a column (F2SearchText, first
   * statement). F2 looks within the grid's records ({Id}); F3 drops that condition.
   */
  async searchValues(
    screen: string,
    req: { columnId: number; scope: 'grid' | 'all'; gridIds: number[] },
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<PickList> {
    const { def, col } = await this.searchColumn(db, screen, req.columnId, user);
    const override = def.searchOverrides?.[(col.ColumnName ?? '').toLowerCase()];
    if (override) return override.values(db);
    const [first] = (col.F2SearchText ?? '').split(';');
    if (!first) return { columns: [], rows: [] };
    const query = this.fillTemplate(first, def, col, req.scope, req.gridIds, []);
    return this.runPickList(db, query);
  }

  /**
   * Search after F2 / F3 (UcSearch.txtSearch_KeyDown): by the values picked from the list, or
   * by the typed text when nothing was picked. Replaces the grid's rows.
   */
  async search(
    screen: string,
    req: {
      columnId: number;
      scope: 'grid' | 'all';
      gridIds: number[];
      notIn: boolean;
      values: string[];
      text: string;
      params?: ListParams;
    },
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<GridRow[]> {
    const { def, col, rows } = await this.searchColumn(db, screen, req.columnId, user);
    const pk = trustedSql(def.primaryColumn);
    const override = def.searchOverrides?.[(col.ColumnName ?? '').toLowerCase()];
    let where: Sql;
    if (override) {
      if (req.values.length === 0) return [];
      where = sql`AND ${await override.where(db, req.values)}`;
    } else if (req.values.length === 0) {
      if (req.text.trim() === '') return [];
      // SearchWithAndOr(column, "String", N): always a text comparison here.
      const column =
        (col.Type ?? '').toUpperCase() === 'M' ? `${def.table}.${col.ColumnName}` : col.ColumnName!;
      const parsed = parseSearch(req.text, [{ column, dataType: 'String' }]);
      if (!parsed.ok) throw new BadRequestException(parsed.message);
      where = sql`AND ${compileFilter(parsed.filter)}`;
    } else {
      const statements = (col.F2SearchText ?? '').split(';');
      const inOrNot = req.notIn ? sql`NOT IN` : sql`IN`;
      if (statements.length < 2) {
        where = sql`AND LTRIM(RTRIM(${pk})) ${inOrNot} ${textList(req.values)}`;
      } else {
        // UcSearch (CommonLibrary v3.4.3.1): one clause, the second statement always filled
        // with the picked values, so "Not In" also finds the records with no child row at all
        // (before: `IN (<statement with NOT IN>) AND NOT IN (<statement with IN>)`, which only
        // found records that had some other child).
        const idsQuery = this.fillTemplate(
          statements[1]!,
          def,
          col,
          req.scope,
          req.gridIds,
          req.values,
        );
        where = sql`AND LTRIM(RTRIM(${pk})) ${inOrNot} (${idsQuery})`;
      }
    }
    const found = await this.select(
      db,
      def,
      gridColumnsSql(rows, def.ucSearchColumns),
      sql`${where} ${this.searchCondition(def)} ${this.userFilter(def, user, req.params)}`,
      EMPTY,
      0,
      true,
    );
    return def.decorateList ? def.decorateList(db, found) : found;
  }

  /** Search In Range (right-click on the search box): numbers "1-10" or dates dd/MM/yyyy. */
  async range(
    screen: string,
    req: { columnId: number; from: string; to: string; params?: ListParams },
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<GridRow[]> {
    const { def, col, rows } = await this.searchColumn(db, screen, req.columnId, user);
    const isDate = ['date', 'datetime'].includes((col.DataType ?? '').toLowerCase());
    let from: string | number;
    let to: string | number;
    if (isDate) {
      const toIso = (s: string) => {
        const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) {
          throw new BadRequestException(
            'Please Enter Proper Value in dd/MM/yyyy Format(Ex.:- (01/12/2015-31/12/2015)',
          );
        }
        return `${m[3]}-${m[2]}-${m[1]}`;
      };
      from = toIso(req.from);
      to = toIso(req.to);
    } else {
      from = Number(req.from.trim());
      to = Number(req.to.trim());
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        throw new BadRequestException('Please Enter Proper Value (Ex.:- 1-10)');
      }
    }
    const cols = trustedSql(
      gridColumnsSql(rows, def.ucSearchColumns).replace(/,,/g, ',').replace(/,$/, ''),
    );
    const range = isDate
      ? sql`BETWEEN CAST(${from} AS date) AND CAST(${to} AS date)`
      : sql`BETWEEN ${from} AND ${to}`;
    const { rows: result } = await sql<GridRow>`
      WITH paging AS (SELECT ${cols} FROM ${ident(def.table)} ${this.join(def)} WHERE 1 = 1 ${this.searchCondition(def)} ${this.userFilter(def, user, req.params)})
      SELECT * FROM paging WHERE ${ident(col.ColumnName!)} ${range}
    `.execute(db);
    return result;
  }

  /** Search For Blank / For Not In Blank (UcSearch.SearchRecords). */
  async blank(
    screen: string,
    req: { columnId: number; blank: boolean; withinIds?: number[]; params?: ListParams },
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<GridRow[]> {
    const { def, col, rows } = await this.searchColumn(db, screen, req.columnId, user);
    const pk = ident(def.primaryColumn);
    let where: Sql;
    if ((col.Type ?? '').toUpperCase() === 'T') {
      const inOrNot = req.blank ? sql`NOT IN` : sql`IN`;
      where = sql`AND ${pk} ${inOrNot} (SELECT ${ident(col.ForeignKeyColumn!)} FROM ${ident(col.TranTableName!)})`;
    } else {
      const c = ident(col.ColumnName!);
      const cond = req.blank
        ? sql`(ISNULL(${c}, '0') = '0' OR ISNULL(${c}, '') = '')`
        : sql`(ISNULL(${c}, '0') <> '0' AND ISNULL(${c}, '') <> '')`;
      where = sql`AND ${pk} IN (SELECT ${pk} FROM ${ident(def.table)} WHERE 1 = 1 AND ${cond})`;
    }
    if (req.withinIds)
      where = sql`${where} AND ${pk} IN ${idList(req.withinIds.length ? req.withinIds : [0])}`;
    return this.select(
      db,
      def,
      gridColumnsSql(rows, def.ucSearchColumns),
      sql`${where} ${this.userFilter(def, user, req.params)}`,
      EMPTY,
      0,
      true,
    );
  }

  /**
   * Modify (clsCommon.EnableDisableDataEditing, mode 1): claim the record in DataEditingInfo,
   * or refuse when another user is editing it.
   */
  async acquireEditLock(screen: string, user: SessionUser, id: number, db: Executor = this.db) {
    const def = this.writable(screen, user);
    await this.assertRecordWritable(db, def, user, id, 'edit');
    await inTransaction(db, async (trx) => {
      const holder = await this.lockHolder(trx, def.table, id);
      if (holder && holder.userId !== user.id) {
        throw new ConflictException(`Record is in used by - ${holder.name}`);
      }
      if (!holder) {
        await sql`
          INSERT INTO DataEditingInfo (TableName, Recordkt, Userkt) VALUES (${def.table}, ${id}, ${user.id})
        `.execute(trx);
      }
    });
  }

  /**
   * Cancel / after Save (mode 2): release the record, or with no record (a new one) every
   * lock this user holds, as the desktop does.
   */
  async releaseEditLock(screen: string, user: SessionUser, id: number, db: Executor = this.db) {
    const def = this.writable(screen);
    if (id > 0) {
      await sql`DELETE FROM DataEditingInfo WHERE TableName = ${def.table} AND Recordkt = ${id}`.execute(
        db,
      );
    } else {
      await sql`DELETE FROM DataEditingInfo WHERE Userkt = ${user.id}`.execute(db);
    }
  }

  /**
   * Save: GetValidationMessage, then the repository's Save. Returns the saved row, and for a
   * screen that logs its work (insertworkreports) either logs it or — for a modification —
   * returns what to log once the user has picked the Work Type.
   */
  async save(
    screen: string,
    user: SessionUser,
    id: number,
    fields: Record<string, FieldValue>,
    db: Executor = this.db,
  ): Promise<SaveResult> {
    const def = this.writable(screen, user);
    await this.assertRecordWritable(db, def, user, id, id > 0 ? 'edit' : 'add');
    const message = def.validate(fields, id);
    if (message) throw new BadRequestException(message);
    const logSave = def.workReport && def.workReportOn?.[id > 0 ? 'edit' : 'add'] !== false;
    const oldRow = logSave && id > 0 ? await this.recordOrNull(screen, id, db) : null;
    const secretBefore =
      oldRow && def.secretColumns?.length ? await this.secretValues(db, def, id) : null;
    // frmAuthorMaster.Save: a popup the user opened is logged row by row (CompareDataTable)
    // in place of the record's own summary text; its rows before the save are the DB's.
    const compared: { column: string; old: TransGrid }[] = [];
    if (oldRow) {
      for (const column of def.workReportTrans ?? []) {
        if (Array.isArray(fields[`${column}.Rows`]))
          compared.push({ column, old: await this.transGrid(screen, column, id, db) });
      }
    }
    const saved = await inTransaction(db, async (trx) => {
      if (id > 0) await this.assertNotLockedByOther(trx, def, user, id);
      return def.save(trx, user, id, fields, { env: this.env });
    });
    const savedId = typeof saved === 'number' ? saved : saved.id;
    const [row] = await this.list(screen, [savedId], db, user);
    const result: SaveResult = { id: savedId, row: row ?? null };
    if (typeof saved !== 'number' && saved.message) result.message = saved.message;
    if (logSave) {
      const newRow = id > 0 ? await this.recordOrNull(screen, savedId, db) : null;
      if (oldRow && newRow) {
        for (const { column, old } of compared) {
          const diff = compareTables(
            old.rows,
            fields[`${column}.Rows`] as GridRow[],
            old.columns.map((c) => c.name),
            column,
          );
          oldRow[column] = diff.old;
          newRow[column] = diff.new;
        }
        // A secret column is logged as changed or not, never with its value.
        if (secretBefore) {
          const after = await this.secretValues(db, def, savedId);
          for (const column of def.secretColumns ?? []) {
            oldRow[column] = '';
            newRow[column] = secretBefore[column] !== after[column] ? 'changed' : '';
          }
        }
        def.workReportAdjust?.(oldRow, newRow);
      }
      const prepared = await prepareWorkReport(
        db,
        def.table,
        def.primaryColumn,
        savedId,
        user.id,
        oldRow,
        newRow,
      );
      if (prepared?.kind === 'write') {
        await writeWorkReport(
          db,
          def.table,
          def.primaryColumn,
          savedId,
          user.id,
          prepared.remark,
          prepared.workTypeId,
          prepared.mistake,
          prepared.mistakeCount,
          prepared.workTypeName,
        );
      } else if (prepared?.kind === 'ask') {
        result.workReport = prepared.pending;
      }
    }
    return result;
  }

  /** frmList1 over the WorkType rows a modification offers. */
  async modifyWorkTypes(db: Executor = this.db): Promise<PickList> {
    const rows = await modifyWorkTypes(db);
    return {
      columns: ['ColumnMastkm', 'Name', 'Brief', 'Remark', 'ColumnNo'],
      rows: rows.map((r) => [r.ColumnMastkm, r.Name, r.Brief, r.Remark, r.ColumnNo]),
    };
  }

  /** The Work Type the user picked for a modification: finish insertworkreports. */
  async logWorkReport(
    screen: string,
    user: SessionUser,
    id: number,
    body: { workTypeId: number; mistake: string; remark: string; mistakeCount: number },
    db: Executor = this.db,
  ): Promise<void> {
    const def = this.definition(screen);
    if (!def.workReport) throw new NotFoundException('This screen does not log its work');
    await this.assertVisible(db, def, user, id);
    const decision = await decide(
      db,
      body.workTypeId,
      body.mistake,
      body.remark,
      body.mistakeCount,
    );
    if (decision) {
      await writeWorkReport(
        db,
        def.table,
        def.primaryColumn,
        id,
        user.id,
        decision.remark,
        decision.workTypeId,
        decision.mistake,
        decision.mistakeCount,
        decision.workTypeName,
      );
    }
  }

  private async recordOrNull(screen: string, id: number, db: Executor): Promise<GridRow | null> {
    try {
      return await this.record(screen, id, db);
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  /**
   * Delete (CommonRepository.Delete), after the Security password. A screen with CheckInUse
   * refuses a record other data still points at; one that logs its work notes "Delete <name>".
   */
  async delete(screen: string, user: SessionUser, id: number, db: Executor = this.db) {
    const def = this.writable(screen, user);
    await this.assertRecordWritable(db, def, user, id, 'delete');
    const logDelete = def.workReport && def.workReportOn?.delete !== false;
    const label =
      logDelete && def.deleteLabelColumn
        ? (await this.recordOrNull(screen, id, db))?.[def.deleteLabelColumn]
        : '';
    if (def.checkInUse) {
      const inUse = await def.checkInUse(db, id);
      if (inUse) throw new ConflictException(inUse);
    }
    await inTransaction(db, async (trx) => {
      await this.assertNotLockedByOther(trx, def, user, id);
      const deleted = def.deleteRecord
        ? await def.deleteRecord(trx, user, id)
        : Number(
            (
              await sql`DELETE FROM ${ident(def.table)} WHERE ${ident(def.primaryColumn)} = ${id}`.execute(
                trx,
              )
            ).numAffectedRows ?? 0,
          );
      if (deleted === 0) throw new NotFoundException('Record not found');
    });
    if (logDelete) {
      await writeWorkReport(
        db,
        def.table,
        def.primaryColumn,
        id,
        user.id,
        def.deleteWorkReportText
          ? def.deleteWorkReportText(String(label ?? '').trim())
          : `Delete ${String(label ?? '').trim()}`,
      );
    }
  }

  /** Ctrl+L / Ctrl+U (CommonRepository.LockUnlockRecords), after the Security password. */
  async setLocked(screen: string, ids: number[], lock: boolean, db: Executor = this.db) {
    const def = this.writable(screen);
    if (!def.lockable) throw new BadRequestException("Invalid column name 'Locked'.");
    for (const id of ids) {
      // The desktop writes 'True' / 'False', which a bit column reads as 1 / 0 but an int one
      // (MagazineM.Locked, bhandtran.Locked) refuses; 1 / 0 suit both.
      await sql`
        UPDATE ${ident(def.table)} SET Locked = ${lock ? 1 : 0} WHERE ${ident(def.primaryColumn)} = ${id}
      `.execute(db);
    }
    // The desktop's messages, including the missing space in the second one.
    return {
      message: lock
        ? `Locked Successfully in ${ids.length} Records`
        : `Unlocked Successfully${ids.length} Records`,
      rows: await this.list(screen, ids, db),
    };
  }

  /** The record's work report entries (CommonRepository.GetWorkReportData). */
  async workReport(
    screen: string,
    id: number,
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<WorkReportEntry[]> {
    const def = this.definition(screen);
    await this.assertVisible(db, def, user, id);
    const { rows } = await sql<WorkReportEntry>`
      SELECT WorkReportM.WorkReportKm, WorkReportM.RecordNo, WorkReportM.TableName, WorkReportM.ColumnName,
        WorkReportM.WorkTypeGId, ISNULL(columnmaster.Name, N'') AS WorkType, WorkReportM.DoneByGId,
        ISNULL(columnmaster_1.uname, N'') AS DoneBy, CONVERT(varchar, WorkReportM.Workdate, 103) AS WorkDate,
        WorkReportM.Mistake, WorkReportM.Remark, CONVERT(varchar(8), WorkReportM.alterTime, 108) AS alterTime
      FROM WorkReportM
      LEFT OUTER JOIN Usecurity AS columnmaster_1 ON WorkReportM.DoneByGId = columnmaster_1.tid
      LEFT OUTER JOIN columnmaster ON WorkReportM.WorkTypeGId = columnmaster.ColumnMastkm
      WHERE TableName = ${def.table} AND RecordNo = ${String(id)}
      ORDER BY CAST(workdate AS datetime), CAST(alterTime AS time)
    `.execute(db);
    if (!def.secretColumns?.length) return rows;
    // The desktop logged secret columns with their (encoded) values; never show those.
    const secret = def.secretColumns;
    return rows.map((r) => ({
      ...r,
      Mistake: redactSecrets(r.Mistake, secret),
      Remark: redactSecrets(r.Remark, secret),
    }));
  }

  /**
   * The work report popup's "Compare Data" (frmDisplayTransNew.CompareDataToolStripMenuItem,
   * shown only for TranName "WorkReport"): WorkReportMRepository.GetMistakeRemarkDetail of the
   * row's WorkReportKm, in frmPopup. Only an entry of this record is read.
   */
  async workReportCompare(
    screen: string,
    id: number,
    workReportKm: number,
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<{ columns: string[]; rows: GridValue[][] }> {
    const def = this.definition(screen);
    await this.assertVisible(db, def, user, id);
    const { rows } = await sql<{ OldData: string | null; NewData: string | null }>`
      SELECT ISNULL(Mistake, '') OldData, ISNULL(Remark, '') NewData FROM WorkReportM
      WHERE WorkReportKm = ${workReportKm} AND TableName = ${def.table} AND RecordNo = ${String(id)}
    `.execute(db);
    const row = rows[0];
    const secret = def.secretColumns ?? [];
    return {
      columns: ['ColName', 'OldData', 'NewData'],
      rows: row
        ? mistakeRemarkDetail(
            redactSecrets(row.OldData ?? '', secret),
            redactSecrets(row.NewData ?? '', secret),
          )
        : [],
    };
  }

  async action(
    screen: string,
    user: SessionUser,
    name: string,
    ids: number[],
    params: Record<string, string | number | boolean | number[]> = {},
    db: Executor = this.db,
    /** The form's switches (ScreenDefinition.listFilter's params) for the rows it lists. */
    switches: ListParams = {},
  ): Promise<ActionResult> {
    const def = this.definition(screen);
    const run = def.actions?.[name];
    if (!run) throw new NotFoundException('Unknown action');
    const result = await run(db, user, ids, {
      params,
      env: this.env,
      assertPassword: (given, first) =>
        this.security.assert(typeof given === 'string' ? given : '', first),
      list: (where, opts) =>
        where
          ? this.listWhere(
              screen,
              where,
              db,
              user,
              opts?.limit ? (def.listLimit ?? 0) : 0,
              switches,
            )
          : this.list(screen, undefined, db, user, switches),
    });
    if (result.kind === 'refreshed') {
      return {
        kind: 'refreshed',
        rows: await this.list(screen, ids, db, user),
        message: result.message,
      };
    }
    return result;
  }

  /** A list the form opens from its menu (clsCom.DisplayListForm with a fixed query). */
  async namedList(
    screen: string,
    name: string,
    params: Record<string, string> = {},
    db: Executor = this.db,
  ): Promise<PickList> {
    const run = this.definition(screen).lists?.[name];
    if (!run) throw new NotFoundException('Unknown list');
    return run(db, params);
  }

  /** The grid query with an extra condition (FillList with a form's WhereCondition). */
  async listWhere(
    screen: string,
    where: Sql,
    db: Executor = this.db,
    user?: SessionUser,
    top = 0,
    params?: ListParams,
  ): Promise<GridRow[]> {
    const def = this.definition(screen);
    const rows = await this.tbl(db, def);
    const list = await this.select(
      db,
      def,
      gridColumnsSql(rows, def.ucSearchColumns),
      sql`AND ${where} ${this.userFilter(def, user, params)}`,
      sql`ORDER BY ${ident(def.primaryColumn)} DESC`,
      top,
      true,
    );
    // The grid's own rows, wherever they come from, get FillList's changes (decorateList).
    return def.decorateList ? def.decorateList(db, list) : list;
  }

  /**
   * clsCommon.PrintSelectedColumn: build the selected rows' report for the chosen columns,
   * either a saved layout (`layoutId`, Config_Master.ConfigStr — a comma list of indices into
   * the printable columns) or the picker dialog's own choices (`columnIndices`). The desktop
   * shows this in a print-preview grid and then Windows-prints it; the web app has no print
   * pipeline to do that from a static export, so it hands the browser a printable table.
   */
  async printSelectedColumn(
    screen: string,
    req: PrintRequest,
    db: Executor = this.db,
    user?: SessionUser,
  ): Promise<PrintResult> {
    const def = this.definition(screen);
    const all = printColumns(await loadTblSearch(db, def.table), isSecret(def.secretColumns));

    let indices = req.columnIndices;
    let title = 'Selected Column';
    if (req.layoutId !== undefined) {
      const { rows: cfg } = await sql<{ ConfigName: string; ConfigStr: string | null }>`
        SELECT ConfigName, ConfigStr FROM Config_Master
        WHERE ConfigId = ${req.layoutId}
          AND ConfigType IN (${def.table}, ${def.menuLayoutType ?? def.table})
      `.execute(db);
      if (!cfg[0]) throw new NotFoundException('Unknown print layout');
      indices = (cfg[0].ConfigStr ?? '').split(',').map(Number);
      title = cfg[0].ConfigName;
    }

    const chosen = (indices ?? [])
      .map((i) => all[i])
      .filter((c): c is (typeof all)[number] => Boolean(c));
    if (chosen.length === 0) throw new BadRequestException('Please select at least one column');
    if (req.ids.length === 0) throw new BadRequestException('Please select at least one record');

    // Some PrintColumn values already carry their own "AS <alias>" (e.g. a scalar subquery);
    // drop it so a single, predictable positional alias can be appended instead. The desktop
    // matches result columns back to its picks by name, which silently drops a column whenever
    // its own alias does not equal its DisplayName (as happens for at least one column here) —
    // this sidesteps that instead of reproducing it.
    const stripAlias = (expr: string) =>
      expr
        .replace(/\s+AS\s+\[?[A-Za-z_][A-Za-z0-9_]*\]?\s*$/i, '')
        // An alias without AS, after a closing bracket or CASE's END ("… end Pariman").
        .replace(/(\)|\bend)\s+\[?[A-Za-z_][A-Za-z0-9_]*\]?\s*$/i, '$1');
    const cols = trustedSql(chosen.map((c, i) => `${stripAlias(c.column)} AS __c${i}`).join(','));
    const { rows: data } = await sql<Record<string, unknown>>`
      SELECT ${cols} FROM ${ident(def.table)} ${this.join(def)}
      WHERE ${ident(def.table)}.${ident(def.primaryColumn)} IN (SELECT CAST(val AS bigint) FROM dbo.SplitString(${req.ids.join(',')}, ','))
        ${def.enforceListFilter ? this.userFilter(def, user) : EMPTY}
    `.execute(db);

    return {
      title,
      columns: chosen.map((c) => c.name),
      rows: data.map((r) => chosen.map((_, i) => normalizeValue(r[`__c${i}`]))),
    };
  }

  /**
   * FormPrintWithSelectedColumn's "Save Config" (`SaveConfig`): saves the picker's current
   * picks as a named, reusable Config_Master layout, with an optional shortcut key. `configId`
   * means "Edit" (update that layout, which must belong to this screen); its absence means
   * "Add" (a new one, with an app-assigned ConfigId, same pattern as this database's other
   * non-identity tables). The desktop's per-form "condition" panel (ConditionColumn /
   * ConditionValue, prefilled only for the Prakashan and Vishay forms) is not ported — nothing
   * built so far uses it.
   */
  async savePrintLayout(
    screen: string,
    req: SaveLayoutRequest,
    db: Executor = this.db,
  ): Promise<PrintLayout> {
    const def = this.writable(screen);
    if (req.shortcut) {
      const { rows } = await sql<{ n: number }>`
        SELECT COUNT(*) AS n FROM Config_Master
        WHERE ConfigType = ${def.table} AND ShortcutKey = ${req.shortcut} AND ConfigId <> ${req.configId ?? 0}
      `.execute(db);
      if (Number(rows[0]!.n) > 0) throw new ConflictException('Shortcut Key Already Assigned');
    }
    const configStr = req.columnIndices.join(',');
    const condition = req.condition ?? [];
    const conditionColumn =
      condition.length === 0 ? null : condition.map((c) => c.column).join('|');
    const conditionValue = condition.length === 0 ? null : condition.map((c) => c.value).join('|');
    const configId = await inTransaction(db, async (trx) => {
      if (req.configId !== undefined) {
        const result = await sql`
          UPDATE Config_Master SET ConfigName = ${req.name}, ConfigStr = ${configStr},
            ConfigRemark = ${req.remark ?? null}, ConditionColumn = ${conditionColumn},
            ConditionValue = ${conditionValue}, ShortcutKey = ${req.shortcut ?? null}
          WHERE ConfigId = ${req.configId} AND ConfigType = ${def.table}
        `.execute(trx);
        if (Number(result.numAffectedRows ?? 0) === 0)
          throw new NotFoundException('Unknown print layout');
        return req.configId;
      }
      const { rows } = await sql<{ id: string | number }>`
        SELECT ISNULL(MAX(ConfigId), 0) + 1 AS id FROM Config_Master WITH (UPDLOCK, HOLDLOCK)
      `.execute(trx);
      const id = Number(rows[0]!.id);
      await sql`
        INSERT INTO Config_Master
          (ConfigId, ConfigName, ConfigStr, ConfigType, ConfigRemark, ConditionColumn, ConditionValue, ShortcutKey)
        VALUES (${id}, ${req.name}, ${configStr}, ${def.table}, ${req.remark ?? null},
          ${conditionColumn}, ${conditionValue}, ${req.shortcut ?? null})
      `.execute(trx);
      return id;
    });
    return {
      id: configId,
      name: req.name,
      shortcut: req.shortcut ?? '',
      columnIndices: req.columnIndices,
      remark: req.remark ?? '',
      condition,
    };
  }

  /**
   * "Delete Config" (`tsBtnDeleteConfig_Click`): drops the layout the "Saved Layout" combo has
   * selected. Scoped to this screen, which the desktop's own `where ConfigId=` is not.
   */
  async deletePrintLayout(screen: string, id: number, db: Executor = this.db): Promise<void> {
    const def = this.writable(screen);
    const result = await sql`
      DELETE FROM Config_Master WHERE ConfigId = ${id} AND ConfigType = ${def.table}
    `.execute(db);
    if (Number(result.numAffectedRows ?? 0) === 0)
      throw new NotFoundException('Unknown print layout');
  }

  private async searchColumn(db: Executor, screen: string, columnId: number, user?: SessionUser) {
    const def = this.definition(screen);
    if (!this.canSearch(def, user)) throw new ForbiddenException('You cannot search this screen');
    const rows = await this.tbl(db, def);
    const col = rows.find((r) => r.Id === columnId && r.IsSearchable);
    if (!col) throw new BadRequestException('Unknown search column');
    return { def, col, rows };
  }

  /**
   * Fills a F2SearchText statement. {Id} is the grid's records (F2) or, for F3, the
   * "<key> in({Id}) and" condition is removed; {tId} is the picked values.
   */
  private fillTemplate(
    template: string,
    def: ScreenDefinition,
    col: TblSearchRow,
    scope: 'grid' | 'all',
    gridIds: number[],
    values: string[],
  ): Sql {
    let text = unescapeSql(template);
    if (scope === 'all') {
      for (const key of [col.PrimaryColumn ?? def.primaryColumn, col.ForeignKeyColumn]) {
        if (!key) continue;
        text = text.replace(
          new RegExp(`${escapeRegex(key)}\\s+in\\s*\\(\\{Id\\}\\)\\s+and\\s+`, 'gi'),
          '',
        );
      }
    }
    // Split around the placeholders and bind the lists in their place.
    const parts = text.split(/(\{Id\}|\bIN\s*\(\{tId\}\))/i);
    const pieces: Sql[] = parts.map((part) => {
      if (/^\{Id\}$/i.test(part))
        return sql`SELECT CAST(val AS bigint) FROM dbo.SplitString(${gridIds.join(',')}, ',')`;
      if (/^IN\s*\(\{tId\}\)$/i.test(part)) return sql`IN ${textList(values)}`;
      return trustedSql(part);
    });
    return sql.join(pieces, sql``);
  }

  private async select(
    db: Executor,
    def: ScreenDefinition,
    columns: string,
    where: Sql,
    order: Sql,
    top = 0,
    grid = false,
  ) {
    const limit = top > 0 ? sql`TOP (${Math.trunc(top)})` : EMPTY;
    const { rows } = await sql<GridRow>`
      SELECT ${limit} ${trustedSql(unescapeSql(columns))} FROM ${ident(def.table)} ${grid ? this.join(def) : EMPTY}
      WHERE 1 = 1 ${where} ${order}
    `.execute(db);
    return rows.map(normalizeRow);
  }

  /** The form's own JoinCondition for its grid queries (a constant of the screen definition). */
  private join(def: ScreenDefinition): Sql {
    return def.listJoin ? trustedSql(def.listJoin) : EMPTY;
  }

  private async runPickList(db: Executor, query: Sql): Promise<PickList> {
    const result = await sql<Record<string, unknown>>`${query}`.execute(db);
    const first = result.rows[0];
    const columns = first ? Object.keys(first) : [];
    return {
      columns,
      rows: result.rows.map((r) => columns.map((c) => normalizeValue(r[c]))),
    };
  }

  private async lockHolder(db: Executor, table: string, id: number) {
    const { rows } = await sql<{ userkt: number; uname: string | null }>`
      SELECT D.Userkt AS userkt, U.uname FROM DataEditingInfo D INNER JOIN Usecurity U ON D.Userkt = U.tid
      WHERE D.TableName = ${table} AND D.Recordkt = ${id}
    `.execute(db);
    return rows[0] ? { userId: rows[0].userkt, name: rows[0].uname ?? '' } : null;
  }

  private async assertNotLockedByOther(
    db: Executor,
    def: ScreenDefinition,
    user: SessionUser,
    id: number,
  ) {
    const holder = await this.lockHolder(db, def.table, id);
    if (holder && holder.userId !== user.id) {
      throw new ConflictException(`Record is in used by - ${holder.name}`);
    }
  }
}

/**
 * A work report text with every `<column>(value)` of these columns shown as `<column>(***)`:
 * insertworkreports' "col(value)~col(value)=n" format, as the desktop wrote it before the web
 * stopped logging secret values.
 */
export function redactSecrets<T extends string | null>(text: T, columns: string[]): T {
  if (text === null || columns.length === 0) return text;
  let out: string = text;
  for (const c of columns)
    out = out.replace(
      new RegExp(`(^|[~(])(${escapeRegex(c)})\\((?!changed\\))[^)~]+\\)`, 'gi'),
      '$1$2(***)',
    );
  return out as T;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The popup behind F1 (TranName "ReferenceT1"): the lists its cells open (SetForm_Common). */
const REFERENCE_T1 = 'ReferenceT1';
const REFERENCE_LOOKUPS: Record<
  string,
  (db: Executor, row: Record<string, GridValue>) => Promise<PickList>
> = {
  booktname: (db) =>
    pickListOf(
      db,
      sql`SELECT Tid AS Id, Libno FROM BookT WHERE ISNULL(Libno, '') <> '' ORDER BY Libno`,
    ),
  refplace: (db) =>
    pickListOf(
      db,
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'Refplace' ORDER BY Name`,
    ),
};

/**
 * btnWorkReport's popup (TranName "WorkReport", FormName "Common"): the lists F2 opens on its
 * WorkType and DoneBy cells (frmDisplayTransNew.SetForm_Common). Done By's list is
 * columnmaster's 'DoneBy' entries, as on the desktop, although the grid shows DoneBy from
 * Usecurity; the dialog never saves, so the two never meet.
 */
const WORK_REPORT = 'WorkReport';
const WORK_REPORT_LOOKUPS: Record<
  string,
  (db: Executor, row: Record<string, GridValue>) => Promise<PickList>
> = {
  worktype: (db) =>
    pickListOf(
      db,
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'WorkType' ORDER BY Name`,
    ),
  doneby: (db) =>
    pickListOf(
      db,
      sql`SELECT ColumnMastkm, Name FROM columnmaster WHERE vibhag = 'DoneBy' ORDER BY Name`,
    ),
};

const textOf = (v: GridValue | undefined) => (v === null || v === undefined ? '' : String(v));
const intOf = (v: GridValue | undefined) => Math.trunc(Number(v) || 0);

/**
 * Config_Master stores the dialog's Config Condition grid as two '|'-separated lists, paired
 * by position (`cmbDispConfig_SelectedIndexChanged` splits them the same way).
 */
function splitCondition(column: string | null, value: string | null): PrintCondition[] {
  if ((column ?? '') === '') return [];
  const values = (value ?? '').split('|');
  return column!.split('|').map((c, i) => ({ column: c, value: values[i] ?? '' }));
}
