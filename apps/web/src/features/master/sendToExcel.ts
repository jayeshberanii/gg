import type { GridColumnSpec } from './types';
import type { MasterState } from './useMasterScreen';

/**
 * CommonLibrary.SendtoExcel: dumps the grid's current DataSource (i.e. the rows the search
 * filter currently leaves visible, same as `dv`/`dgMain`) into a spreadsheet and opens it. The
 * desktop builds a real .xls workbook via Aspose; the web app has no server round trip to do
 * that from a static export, so it downloads a CSV instead, which Excel opens just as well.
 */
export function sendToExcel(
  screen: string,
  columns: GridColumnSpec[],
  rows: MasterState['visibleRows'],
) {
  const header = columns.map((c) => csvCell(c.header));
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.field])));
  const csv = [header, ...body].map((line) => line.join(',')).join('\r\n');
  // UTF-8 BOM so Excel renders the Gujarati/Hindi text correctly instead of guessing ANSI.
  download(`${screen}.csv`, new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }));
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * SendtoExcel on a computed table (the desktop's hidden `dgForExcel` / `Dgrid_booklist` grids):
 * the same CSV download, with the table's own column names.
 */
export function sendTableToExcel(name: string, columns: string[], rows: unknown[][]) {
  const lines = [columns.map(csvCell), ...rows.map((r) => r.map(csvCell))];
  download(
    `${name}.csv`,
    new Blob(['﻿', lines.map((l) => l.join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    }),
  );
}

/**
 * SendtoWord(text): the desktop opens the text in a new Word document. The web app downloads
 * it as a .doc (Word opens HTML as a document), keeping the tree's tab indentation.
 */
export function sendTextToWord(name: string, text: string) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html><head><meta charset="utf-8"></head><body><pre style="font-family:'Arial Unicode MS';tab-size:4">${escaped}</pre></body></html>`;
  download(`${name}.doc`, new Blob([html], { type: 'application/msword' }));
}

function download(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
