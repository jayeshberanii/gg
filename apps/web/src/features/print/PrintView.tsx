'use client';

import type { GridValue, PrintBlock, PrintDocument, PrintPage } from '@gglib/shared';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Modal } from '@/components/ui/Modal';

/** The report logo, extracted from the Letter Bhet / Letter Demand .rpt files (OLE embedding). */
export const REPORT_LOGO = '/legacy/report-logo.png';

const cell = (v: GridValue) => (v === null || v === undefined ? '' : String(v));

/**
 * The web's frmReport: a report window showing the document as plain A4 sheets, which opens the
 * browser's print dialog straight away (window.print()) so the user can print it or save it as
 * PDF, and again from its Print button. Generic: every report sends the same PrintDocument shape
 * (header block with the logo, body blocks, repeating table rows), built by the screen's `print`
 * action on the server.
 *
 * The sheets are drawn twice: once inside the window for the screen, and once as a direct child
 * of <body> (`#print-report`, hidden on screen) that alone survives printing, so a report longer
 * than a page breaks across sheets instead of being clipped by the window.
 */
export function PrintView({
  document: doc,
  onClose,
  autoPrint = true,
}: {
  document: PrintDocument;
  onClose: () => void;
  /** Open the print dialog as soon as the sheets (and the logo) are ready. */
  autoPrint?: boolean;
}) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    const el = window.document.createElement('div');
    el.id = 'print-report';
    window.document.body.appendChild(el);
    window.document.body.classList.add('print-report-open');
    setPortal(el);
    return () => {
      window.document.body.classList.remove('print-report-open');
      el.remove();
    };
  }, []);

  useEffect(() => {
    if (!portal || !autoPrint || printed.current) return;
    printed.current = true;
    // Wait for the logo, so the first print shows it.
    const images = [...portal.querySelectorAll('img')];
    void Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    ).then(() => window.print());
  }, [portal, autoPrint]);

  return (
    <>
      <Modal title={doc.title} onClose={onClose} maximized className="bg-[#808080]">
        <div className="flex h-full flex-col">
          <div role="toolbar" aria-label="Report" className="win-toolstrip shrink-0 gap-1">
            <Button onClick={() => window.print()}>Print</Button>
            <Button onClick={onClose}>Close</Button>
            {doc.provisional && (
              <span className="ml-2 truncate text-[12px] text-[#800000]">{doc.provisional}</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-3">
            <Sheets document={doc} />
          </div>
        </div>
      </Modal>
      {portal && createPortal(<Sheets document={doc} />, portal)}
    </>
  );
}

function Sheets({ document: doc }: { document: PrintDocument }) {
  return (
    <div aria-label={`${doc.title} pages`} className="print-sheets">
      {doc.pages.map((page, i) => (
        <Sheet key={i} page={page} />
      ))}
    </div>
  );
}

function Sheet({ page }: { page: PrintPage }) {
  const { header } = page;
  return (
    <section className="print-sheet">
      <header className="print-header">
        {header.logo && <img src={REPORT_LOGO} alt="Geetarth Ganga" className="print-logo" />}
        <div className="print-heading">
          {(header.lines ?? []).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        {header.fields && header.fields.length > 0 && (
          <table className="print-header-fields">
            <tbody>
              {header.fields.map((f) => (
                <tr key={f.label}>
                  <th>{f.label}</th>
                  <td>: {f.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </header>
      {page.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
      {page.footer && page.footer.length > 0 && (
        <footer className="print-footer">
          {page.footer.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </footer>
      )}
    </section>
  );
}

function Block({ block }: { block: PrintBlock }) {
  switch (block.kind) {
    case 'lines':
      return (
        <div className="print-block">
          {block.title && <div className="print-block-title">{block.title}</div>}
          {block.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      );
    case 'fields':
      return (
        <div className="print-block">
          {block.fields.map((f) => (
            <div key={f.label}>
              <span className="print-label">{f.label}</span> : {f.value}
            </div>
          ))}
        </div>
      );
    case 'text':
      return <div className="print-block print-text">{block.text}</div>;
    case 'table':
      return (
        <div className="print-block">
          {block.title && <div className="print-block-title">{block.title}</div>}
          <table className="print-table">
            <thead>
              <tr>
                {block.numbered && <th style={{ width: '8%' }}>No.</th>}
                {block.columns.map((c) => (
                  <th
                    key={c.header}
                    style={{
                      textAlign: c.align ?? 'left',
                      ...(c.width ? { width: `${c.width}%` } : {}),
                    }}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {block.numbered && <td>{i + 1}</td>}
                  {block.columns.map((c, j) => (
                    <td key={c.header} style={{ textAlign: c.align ?? 'left' }}>
                      {cell(r[j] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
