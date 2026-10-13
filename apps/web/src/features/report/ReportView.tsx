'use client';

import {
  type ReportBlock,
  type ReportCell,
  type ReportDocument,
  type ReportFont,
  richTextRuns,
} from '@gglib/shared';
import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { REPORT_CSS, REPORT_FONTS } from './reportCss';

/**
 * The web's frmWebBrowser: the window the desktop shows a report page of its companion web site
 * in, with the same toolbar (Save, Print, Refresh, Exit). The page itself is drawn here from
 * the ReportDocument the server built, instead of being fetched from that site.
 *
 * Print hands the browser a copy of the page placed directly under <body> (`#print-report`,
 * the only thing left visible by the print rules in globals.css), so the browser paginates the
 * whole report instead of clipping it to the window.
 */
export function ReportView({
  document: initial,
  refresh,
  onClose,
}: {
  document: ReportDocument;
  /** Refresh: runs the report again (WebBrowser1.Refresh()). */
  refresh?: () => Promise<ReportDocument | null>;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState(initial);
  const [busy, setBusy] = useState(false);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => removePrintCopy, []);

  function print() {
    if (!page.current) return;
    removePrintCopy();
    const copy = window.document.createElement('div');
    copy.id = 'print-report';
    copy.innerHTML = `<style>${REPORT_CSS}</style>`;
    copy.appendChild(page.current.cloneNode(true));
    window.document.body.appendChild(copy);
    window.document.body.classList.add('print-report-open');
    window.addEventListener('afterprint', removePrintCopy, { once: true });
    window.print();
  }

  /** btnSave: the page as a file of its own (WebBrowser1.ShowSaveAsDialog()). */
  function save() {
    if (!page.current) return;
    const html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>${REPORT_CSS}</style></head><body>${page.current.outerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'report'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function reload() {
    if (!refresh || busy) return;
    setBusy(true);
    try {
      const next = await refresh();
      if (next) setDoc(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={doc.title} onClose={onClose} maximized>
      <div className="flex h-full flex-col">
        <div role="toolbar" aria-label="Report" className="win-toolstrip shrink-0">
          <ToolButton icon="save" label="Save" onClick={save} />
          <ToolSeparator />
          <ToolButton icon="print" label="Print" onClick={print} />
          <ToolSeparator />
          <ToolButton
            icon="refresh"
            label="Refresh"
            disabled={!refresh || busy}
            onClick={() => void reload()}
          />
          <ToolSeparator />
          <ToolButton icon="exit" label="Exit" onClick={onClose} />
          <ToolSeparator />
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-white">
          <style>{REPORT_CSS}</style>
          <ReportPage ref={page} document={doc} />
        </div>
      </div>
    </Modal>
  );
}

function removePrintCopy() {
  window.document.getElementById('print-report')?.remove();
  window.document.body.classList.remove('print-report-open');
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const fontStyle = (font?: ReportFont, size?: number): CSSProperties => ({
  ...(font ? { fontFamily: REPORT_FONTS[font] } : {}),
  ...(size ? { fontSize: `${size}px` } : {}),
});

function ReportPage({
  document: doc,
  ref,
}: {
  document: ReportDocument;
  ref: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      aria-label={`${doc.title} report`}
      className="report-page"
      style={fontStyle(doc.font, doc.size)}
    >
      {doc.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function Block({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case 'heading':
      return (
        <div
          className="report-heading"
          style={{ ...fontStyle(block.font, block.size), textAlign: block.align ?? 'left' }}
        >
          {block.text}
        </div>
      );
    case 'fields':
      if (block.labelWidth) {
        return (
          <table className="report-fields-table">
            <tbody>
              {block.fields.map((f, i) => (
                <tr key={i}>
                  <td className="report-field-label" style={{ width: `${block.labelWidth}%` }}>
                    {f.label}
                  </td>
                  <td>
                    {block.separator ?? ': '}
                    {f.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      return (
        <>
          {block.fields.map((f, i) => (
            <div key={i} className="report-field">
              <span className="report-field-label">
                {f.label}
                {block.separator ?? ' : '}
              </span>{' '}
              {f.value}
            </div>
          ))}
        </>
      );
    case 'paragraph':
      return (
        <p
          className="report-paragraph"
          style={block.indent ? { textIndent: `${block.indent}px` } : undefined}
        >
          {block.text}
        </p>
      );
    case 'rule':
      return <hr className="report-rule" />;
    case 'space':
      return <div className="report-space" />;
    case 'pageBreak':
      return <div className="report-break" />;
    case 'table':
      return (
        <table
          className="report-table"
          style={{
            ...fontStyle(block.font, block.size),
            ...(block.fixed === false ? {} : { tableLayout: 'fixed' }),
            ...(block.full === false ? {} : { width: '100%' }),
          }}
        >
          {block.columns && (
            <colgroup>
              {block.columns.map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
          )}
          {block.head.length > 0 && (
            <thead>
              {block.head.map((cells, i) => (
                <tr key={i}>
                  {cells.map((c, j) => (
                    <Cell key={j} cell={c} as="th" top={block.top} />
                  ))}
                </tr>
              ))}
            </thead>
          )}
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i} className={r.band ? `report-shade-${r.band}` : undefined}>
                {r.cells.map((c, j) => (
                  <Cell
                    key={j}
                    cell={c}
                    as={r.head ? 'th' : 'td'}
                    align={block.align}
                    top={block.top}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

function Cell({
  cell,
  as: Tag,
  align,
  top,
}: {
  cell: ReportCell;
  as: 'td' | 'th';
  align?: ReportCell['align'];
  top?: boolean;
}) {
  const style: CSSProperties = {
    ...fontStyle(cell.font, cell.size),
    ...(cell.align || align ? { textAlign: cell.align ?? align } : {}),
    ...(top ? { verticalAlign: 'top' } : {}),
    ...(cell.bold ? { fontWeight: 'bold' } : {}),
    ...(cell.italic ? { fontStyle: 'italic' } : {}),
    ...(cell.underline ? { textDecoration: 'underline' } : {}),
    ...(cell.width ? { width: `${cell.width}%` } : {}),
    ...(cell.padding ? { padding: `${cell.padding}px` } : {}),
  };
  return (
    <Tag
      colSpan={cell.colSpan}
      rowSpan={cell.rowSpan}
      className={cell.shade ? `report-shade-${cell.shade}` : undefined}
      style={style}
    >
      {cell.rich ? <Rich html={cell.text} /> : cell.text}
    </Tag>
  );
}

/** A column the views print with Html.Raw: only line breaks and b / i / u survive. */
function Rich({ html }: { html: string }): ReactNode {
  return richTextRuns(html).map((run, i) => {
    if (run.br) return <br key={i} />;
    const style: CSSProperties = {
      ...(run.bold ? { fontWeight: 'bold' } : {}),
      ...(run.italic ? { fontStyle: 'italic' } : {}),
      ...(run.underline ? { textDecoration: 'underline' } : {}),
    };
    return Object.keys(style).length > 0 ? (
      <span key={i} style={style}>
        {run.text}
      </span>
    ) : (
      <Fragment key={i}>{run.text}</Fragment>
    );
  });
}
