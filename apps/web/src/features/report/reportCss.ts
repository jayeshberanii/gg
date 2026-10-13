import type { ReportFont } from '@gglib/shared';

const FALLBACK = "'Noto Serif Devanagari', var(--font-noto-serif-devanagari), Mangal, serif";

/**
 * The fonts the report site's views name, first, so a machine that has them (the desktop PCs)
 * prints as before; Noto Serif Devanagari, which the app ships, everywhere else.
 */
export const REPORT_FONTS: Record<ReportFont, string> = {
  noto: FALLBACK,
  ganesh: `'DVOT-Ganesh', ${FALLBACK}`,
  surekh: `'DVOT-Surekh', ${FALLBACK}`,
  shree: `'SHREE_DEV_OTF_0708', ${FALLBACK}`,
};

/**
 * The views' shared stylesheet (GGWebSolution/GGWeb/Views/Home/*.cshtml): thin black borders,
 * a header that repeats on each printed page, rows that do not split across pages, and group
 * bands that keep their grey when printed. One string, so the saved .html file carries it too.
 */
export const REPORT_CSS = `
.report-page { background: #fff; color: #000; padding: 8px; font-family: ${FALLBACK}; font-size: 16px; }
.report-table { border-collapse: collapse; line-height: 12px; }
.report-table th, .report-table td { border: 0.5px solid #000; padding: 5px; word-wrap: break-word; overflow-wrap: break-word; break-inside: avoid; page-break-inside: avoid; }
.report-table th { font-weight: bold; text-align: left; }
.report-table thead { display: table-header-group; }
.report-table tr { break-inside: avoid; page-break-inside: avoid; }
.report-shade-1 { background-color: #bfbfbf; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report-shade-2 { background-color: #d9d9d9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report-heading { font-weight: bold; margin-top: 10px; }
.report-field { margin-top: 10px; }
.report-field-label { font-weight: bold; }
.report-fields-table { width: 100%; border-collapse: collapse; }
.report-fields-table td { vertical-align: top; padding: 1px 2px; }
.report-paragraph { margin: 0 0 16px; }
.report-space { height: 2.4em; }
.report-break { break-before: page; page-break-before: always; height: 0; }
.report-rule { border: 0; border-top: 1px solid #808080; margin: 8px 0; }
`;
