import type { SearchColumn } from '@gglib/shared';
import { sql } from 'kysely';
import type { Executor } from '../db/legacy-sql.js';

/** A tblSearch row: the desktop's per-screen column metadata. */
export type TblSearchRow = {
  Id: number;
  Type: string | null;
  DisplayName: string | null;
  ColumnName: string | null;
  PrimaryColumn: string | null;
  ForeignKeyColumn: string | null;
  DataType: string | null;
  SearchOnF2: boolean | null;
  F2SearchText: string | null;
  SearchOnTextChange: boolean | null;
  Seq: number | null;
  F2EntryText: string | null;
  JoinCondition: string | null;
  JoinColumnName: string | null;
  IsSearchable: boolean | null;
  DisplayInGrid: boolean | null;
  GridColumnName: string | null;
  GridSeq: number | null;
  IsExternalColumn: boolean | null;
  HelpText: string | null;
  AddTableInfo: string | null;
  TranTableName: string | null;
  IsPrintable: boolean | null;
  PrintSeq: number | null;
  PrintColumn: string | null;
  PrintDisplayName: string | null;
};

/**
 * The rows in the table's physical order: tblSearch is a heap and GetDataTable reads it with
 * FOR XML PATH and no ORDER BY (record columns) or ORDER BY GridSeq with ties in that order.
 */
export async function loadTblSearch(
  db: Executor,
  transactionName: string,
): Promise<TblSearchRow[]> {
  const { rows } = await sql<TblSearchRow>`
    SELECT Id, Type, DisplayName, ColumnName, PrimaryColumn, ForeignKeyColumn, DataType, SearchOnF2,
      F2SearchText, SearchOnTextChange, Seq, F2EntryText, JoinCondition, JoinColumnName, IsSearchable,
      DisplayInGrid, GridColumnName, GridSeq, IsExternalColumn, HelpText, AddTableInfo, TranTableName,
      IsPrintable, PrintSeq, PrintColumn, PrintDisplayName
    FROM tblSearch WHERE TransactionName = ${transactionName}
  `.execute(db);
  return rows;
}

const has = (s: string | null | undefined) => (s ?? '') !== '';
const typeOf = (r: TblSearchRow) => (r.Type ?? '').trim().toUpperCase();
/** Rows GetDataTable uses at all: master columns, and transaction columns with a join. */
const selectable = (r: TblSearchRow) =>
  typeOf(r) === 'M' || (typeOf(r) === 'T' && has(r.JoinCondition));

/**
 * The column list GetDataTable builds for the grid (@IsDisplayGrid = 1), expression for
 * expression, in GridSeq order. `ucSearch`: UcSearch.GetColumns' variant, which a form that
 * builds its own grid query uses (Kruti Master): a GridColumnName stands alone, without the
 * master column after it.
 */
export function gridColumnsSql(rows: TblSearchRow[], ucSearch = false): string {
  return rows
    .filter((r) => r.DisplayInGrid && selectable(r))
    .sort((a, b) => (a.GridSeq ?? -1) - (b.GridSeq ?? -1))
    .map((r) => {
      if (r.IsExternalColumn && has(r.JoinCondition)) return r.JoinCondition!;
      if (r.IsExternalColumn) return `''${r.ColumnName}`;
      if (has(r.GridColumnName)) {
        if (typeOf(r) !== 'M' || ucSearch) return r.GridColumnName!;
        // A GridColumnName aliased to the column's own name (InwordM's "CASE WHEN InOut=1 THEN
        // 'OUT' ELSE 'IN' END InOut") puts that name in the result twice: the desktop's DataTable
        // keeps the first under it and renames the second "<name>1"; so does the web.
        // (A bare column, WorkReportM's "WorkDate", reads the same value twice: left alone.)
        const same =
          gridAlias(r.GridColumnName!) === (r.ColumnName ?? '').toLowerCase() &&
          !/^\[?\w+\]?$/.test(r.GridColumnName!.trim());
        return `${r.GridColumnName},${r.ColumnName}${same ? ` AS ${r.ColumnName}1` : ''}`;
      }
      if (!has(r.JoinCondition)) return r.ColumnName!;
      return `${r.JoinCondition},${r.ColumnName}`;
    })
    .join(',');
}

/** The alias a select-list expression ends with ("… END InOut", "x AS [y]"), lower-cased. */
export function gridAlias(expression: string): string {
  const m = expression.trim().match(/(?:^|[\s\]])\[?(\w+)\]?$/);
  return (m?.[1] ?? '').toLowerCase();
}

/** The column list GetDataTable builds for one record (@IsDisplayGrid = 0). */
export function recordColumnsSql(rows: TblSearchRow[]): string {
  return rows
    .filter(selectable)
    .map((r) =>
      typeOf(r) === 'T' && has(r.JoinCondition)
        ? r.JoinCondition!
        : (has(r.JoinCondition) ? `${r.JoinCondition},` : '') + r.ColumnName,
    )
    .join(',');
}

/** GetDataTable replaces HTML-escaped comparison signs in the finished statement. */
export function unescapeSql(s: string): string {
  return s.replace(/&gt;/g, '>').replace(/&lt;/g, '<');
}

/** The "Search By" choices (UcSearch.cmbSearchBy): searchable rows in Seq order. */
export function searchColumns(rows: TblSearchRow[]): SearchColumn[] {
  return rows
    .filter((r) => r.IsSearchable)
    .sort((a, b) => (a.Seq ?? -1) - (b.Seq ?? -1))
    .map((r) => ({
      id: r.Id,
      displayName: r.DisplayName ?? r.ColumnName ?? '',
      columnName: r.ColumnName ?? '',
      type: typeOf(r) === 'T' ? 'T' : 'M',
      dataType: r.DataType ?? '',
      searchOnF2: Boolean(r.SearchOnF2) && has(r.F2SearchText),
      searchOnTextChange: Boolean(r.SearchOnTextChange),
      displayInGrid: Boolean(r.DisplayInGrid),
      gridColumnName: r.GridColumnName ?? '',
      joinColumnName: r.JoinColumnName ?? '',
    }));
}

export type PrintColumnDef = { index: number; name: string; column: string };

/**
 * "Print Report › Selected Column" (clsCommon.PrintSelectedColumn): the printable columns in
 * PrintSeq order. `index` is what a saved Config_Master layout's ConfigStr and the picker
 * dialog's choices count by.
 */
export function printColumns(
  rows: TblSearchRow[],
  secret: (r: TblSearchRow) => boolean = () => false,
): PrintColumnDef[] {
  return (
    rows
      .filter((r) => r.IsPrintable && has(r.PrintColumn))
      .sort((a, b) => (a.PrintSeq ?? -1) - (b.PrintSeq ?? -1))
      .map((r, index) => ({
        index,
        name: has(r.PrintDisplayName) ? r.PrintDisplayName! : (r.DisplayName ?? r.ColumnName ?? ''),
        column: r.PrintColumn!,
        secret: secret(r),
      }))
      // A secret column keeps its place in the count, so saved layouts' indices still match.
      .filter((c) => !c.secret)
      .map(({ index, name, column }) => ({ index, name, column }))
  );
}

/** Drops the screen's secret columns (ScreenDefinition.secretColumns) from its tblSearch rows. */
export function isSecret(secretColumns: string[] | undefined) {
  const names = new Set((secretColumns ?? []).map((c) => c.toLowerCase()));
  return (r: TblSearchRow) => names.has((r.ColumnName ?? '').toLowerCase());
}

/**
 * Columns the search box filters when "Search By" is empty (UcSearch.srcgrid): the grid
 * columns in GridSeq order, without the first one and without ...KT id columns.
 */
export function freeTextTargets(rows: TblSearchRow[]): { column: string; dataType: string }[] {
  return rows
    .filter((r) => r.DisplayInGrid)
    .sort((a, b) => (a.GridSeq ?? -1) - (b.GridSeq ?? -1))
    .map((r) => ({
      column: has(r.GridColumnName)
        ? r.GridColumnName!
        : has(r.JoinColumnName)
          ? r.JoinColumnName!
          : r.ColumnName!,
      dataType: has(r.JoinColumnName) ? 'nvarchar' : (r.DataType ?? ''),
    }))
    .slice(1)
    .filter((c) => !c.column.toUpperCase().endsWith('KT'));
}
