'use client';

import { useState } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { Modal, ToolButton, ToolSeparator } from '@/components/ui/Modal';
import { useImageViewer } from './ImageViewer';
import { libraryFileUrl } from './libraryFiles';

/** The form shows six pictures at a time (PicImage1 … PicImage6). */
const PER_PAGE = 6;

/**
 * frmDisplayImages (Author and Prakashak Master's "Show Image of RefrenceT for Selected
 * Record"): the scanned pages, six to a page in two rows of three, each stretched to its box.
 * The toolbar has Exit, << < Page [n] of [pages] > >> and Total Records; a double click on a
 * picture opens the file (Process.Start). The form is maximized, and its boxes grow with the
 * screen (ResizeControl). The double click opens the image viewer over all the files, at that one.
 */
export function DisplayImagesDialog({
  screen,
  files,
  onClose,
}: {
  /** The screen whose user is reading the files. */
  screen: string;
  /** lstFiles: the pictures' paths, as the desktop names them. */
  files: string[];
  onClose: () => void;
}) {
  const msg = useMessageBox();
  const viewer = useImageViewer();
  const pages = Math.ceil(files.length / PER_PAGE);
  const [page, setPage] = useState(1);
  const first = (page - 1) * PER_PAGE;
  const shown = Array.from({ length: PER_PAGE }, (_, i) => files[first + i] ?? null);

  /** PicImage_DoubleClick: the viewer over lstFiles, at the picture's own. */
  function open(index: number) {
    if (files[index] === undefined) void msg.alert('Image not Found');
    else void viewer.open({ screen, files, index });
  }

  return (
    <Modal title="frmDisplayImages" maximized className="bg-light-steel-blue" onClose={onClose}>
      <div className="flex h-full flex-col">
        <div role="toolbar" aria-label="Images" className="win-toolstrip shrink-0">
          <ToolButton icon="exit" label="Exit" onClick={onClose} />
          <ToolSeparator />
          <button type="button" className="win-toolstrip-text" onClick={() => setPage(1)}>
            {'<<'}
          </button>
          <ToolSeparator />
          <button
            type="button"
            className="win-toolstrip-text"
            aria-label="Previous page"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {'<'}
          </button>
          <ToolSeparator />
          <span className="win-toolstrip-text leading-[20px]">Page</span>
          <select
            aria-label="Page"
            className="win-toolstrip-field w-[75px]"
            value={pages === 0 ? '' : page}
            onChange={(e) => setPage(Number(e.target.value) || 1)}
          >
            {Array.from({ length: pages }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <span className="win-toolstrip-text leading-[20px]">of</span>
          <input
            aria-label="Total pages"
            readOnly
            className="win-toolstrip-field w-[60px] text-center"
            value={pages}
          />
          <ToolSeparator />
          <button
            type="button"
            className="win-toolstrip-text"
            aria-label="Next page"
            onClick={() => setPage((p) => Math.min(Math.max(pages, 1), p + 1))}
          >
            {'>'}
          </button>
          <ToolSeparator />
          <button
            type="button"
            className="win-toolstrip-text"
            onClick={() => setPage(Math.max(pages, 1))}
          >
            {'>>'}
          </button>
          <ToolSeparator />
          <span className="win-toolstrip-text leading-[20px]">Total Records</span>
          <input
            aria-label="Total Records"
            readOnly
            className="win-toolstrip-field w-[60px]"
            value={files.length}
          />
        </div>
        {/* Panel1 (1014×683): the boxes are 330×330 at x 0 / 340 / 681 and y 0 / 343. */}
        <div
          className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2"
          style={{ columnGap: '1%', rowGap: '1.9%', paddingBottom: '1%' }}
        >
          {shown.map((path, i) => (
            <div
              key={i}
              role="img"
              aria-label={path ?? `Picture ${i + 1} (empty)`}
              title={path ?? undefined}
              onDoubleClick={() => open(first + i)}
              className="min-h-0 min-w-0 border border-black"
            >
              {path !== null && (
                <img
                  key={path}
                  src={libraryFileUrl(screen, path)}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-fill"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
