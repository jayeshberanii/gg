import { themeQuartz } from 'ag-grid-community';

/**
 * AG Grid styled as the desktop's DataGridView: LightSteelBlue header with DarkRed text,
 * LightSteelBlue grid lines (`GridColor`), square corners, white rows, and the selected rows
 * in navy rgb(10,36,106) — the master grids are `SelectionMode = FullRowSelect`, so the whole
 * row highlights, not one cell. Most forms use Arial Unicode MS 9pt headers and Verdana 12pt
 * rows; a form can override both.
 * Pair the grid with the `dgv` class (globals.css) for the selected-row text colour.
 */
export function dataGridViewTheme({
  headerFont = 'var(--font-grid-header)',
  headerFontSize = 12, // 9pt
  cellFont = 'var(--font-grid)',
  cellFontSize = 16, // 12pt
  rowHeight = 24,
  headerTextColor = '#8b0000',
}: {
  headerFont?: string;
  headerFontSize?: number;
  cellFont?: string;
  cellFontSize?: number;
  rowHeight?: number;
  /** ColumnHeadersDefaultCellStyle.ForeColor, when a form sets another than DarkRed. */
  headerTextColor?: string;
} = {}) {
  return themeQuartz.withParams({
    backgroundColor: '#ffffff',
    foregroundColor: '#000000',
    borderColor: '#a0a0a0',
    borderRadius: 0,
    wrapperBorderRadius: 0,
    accentColor: '#0a246a',
    fontFamily: cellFont,
    fontSize: cellFontSize,
    rowHeight,
    rowBorder: { color: '#b0c4de' },
    columnBorder: { color: '#b0c4de' },
    headerBackgroundColor: '#b0c4de',
    headerTextColor,
    headerFontFamily: headerFont,
    headerFontSize,
    headerFontWeight: 400,
    headerHeight: 25,
    headerColumnBorder: { color: '#a0a0a0' },
    headerColumnResizeHandleColor: 'transparent',
    cellHorizontalPadding: 4,
    oddRowBackgroundColor: '#ffffff',
    rowHoverColor: 'transparent',
    selectedRowBackgroundColor: '#0a246a',
    focusShadow: 'none',
    inputFocusBorder: { color: '#0078d7' },
  });
}
