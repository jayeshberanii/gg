'use client';

import type { GridValue } from '@gglib/shared';
import { useState } from 'react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { Modal, ToolButton } from '@/components/ui/Modal';
import { useImageViewer } from '@/features/master/ImageViewer';
import { libraryFileUrl } from '@/features/master/libraryFiles';
import { netString } from '@/features/master/transSummary';

/** A row of FormDisplayImage.dtImage. */
export type GraphicsPicture = { id: number; file: string; libNo: string; refPlace: string };

/** A `show-pictures` / `copy-to-tempgr` table (Id, FileName, LibNo, RefPlace, RecNo) as dtImage. */
export function toPictures(rows: GridValue[][]): GraphicsPicture[] {
  return rows.map((r) => ({
    id: Number(r[0]) || 0,
    file: netString(r[1] ?? null),
    libNo: netString(r[2] ?? null),
    refPlace: netString(r[3] ?? null),
  }));
}

/** PicImage1 … PicImage6 inside Panel1 (940 x 601), with their text boxes 265 px below. */
const SLOTS: [x: number, y: number][] = [
  [0, 0],
  [313, 0],
  [626, 0],
  [0, 304],
  [313, 304],
  [626, 304],
];
const PAGE = SLOTS.length;

/**
 * FormDisplayImage (frmGraphicsDetail's Show Pictures): the pictures six at a time, each with
 * "LibNo:- …, RefPlace:- …" under it and a tick box at its corner; a click opens the picture
 * itself (Process.Start; here the image viewer, over all the pictures, at that one), the right-click menu's Save to Temp Selected writes the typed text into
 * the ticked pictures' records. Sizes and positions are FormDisplayImage.Designer.vb's.
 */
export function GraphicsPicturesDialog({
  screen,
  title = 'FormDisplayImage',
  pictures,
  onSaveTempSelected,
  onClose,
}: {
  screen: string;
  title?: string;
  pictures: GraphicsPicture[];
  /** SaveToTempSelectedToolStripMenuItem_Click, with the ticked pictures' ids. */
  onSaveTempSelected: (ids: number[]) => void;
  onClose: () => void;
}) {
  /** CurInd / 6. */
  const [page, setPage] = useState(0);
  /** dtTempSelected. */
  const [ticked, setTicked] = useState<number[]>([]);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const viewer = useImageViewer();
  // Ind: the pages, rounded up.
  const pages = Math.ceil(pictures.length / PAGE);
  const last = Math.max(0, pages - 1);
  const shown = pictures.slice(page * PAGE, page * PAGE + PAGE);
  const button = 'win-button absolute';
  const buttonFont = { fontFamily: "'Microsoft Sans Serif', sans-serif", fontSize: 16 };

  return (
    <Modal title={title} width={963} className="bg-alice-blue" onClose={onClose}>
      <div style={{ width: 963, height: 673 }} className="relative">
        <div
          role="toolbar"
          aria-label={title}
          className="win-toolstrip"
          style={{ backgroundColor: 'red', backgroundImage: 'none' }}
        >
          <ToolButton icon="exit" label="Exit" onClick={onClose} />
        </div>
        <div className="absolute" style={{ left: 11, top: 28, width: 940, height: 601 }}>
          {shown.map((p, i) => {
            const [x, y] = SLOTS[i]!;
            const caption = [
              p.libNo.trim() !== '' ? `LibNo:- ${p.libNo.trim()}` : '',
              p.refPlace.trim() !== '' ? `RefPlace:- ${p.refPlace.trim()}` : '',
            ]
              .filter(Boolean)
              .join(', ');
            const on = ticked.includes(p.id);
            return (
              <div key={`${page}:${p.id}`}>
                <button
                  type="button"
                  aria-label={`Picture ${page * PAGE + i + 1}`}
                  title={p.file}
                  className="absolute cursor-pointer border-0 bg-transparent p-0"
                  style={{ left: x, top: y, width: 305, height: 265 }}
                  onClick={() =>
                    void viewer.open({
                      screen,
                      files: pictures.map((q) => q.file),
                      index: page * PAGE + i,
                    })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuAt({ x: e.clientX, y: e.clientY });
                  }}
                >
                  {/* SizeMode = StretchImage; a missing file leaves the box empty. */}
                  <img
                    src={libraryFileUrl(screen, p.file)}
                    alt={caption}
                    style={{ width: '100%', height: '100%', objectFit: 'fill' }}
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                </button>
                <input
                  type="checkbox"
                  aria-label={`Select picture ${page * PAGE + i + 1}`}
                  className="absolute m-0"
                  style={{ left: x + 292, top: y + 253, width: 12, height: 11 }}
                  checked={on}
                  onChange={() =>
                    setTicked((t) => (on ? t.filter((id) => id !== p.id) : [...t, p.id]))
                  }
                />
                <input
                  readOnly
                  aria-label={`Picture ${page * PAGE + i + 1} detail`}
                  className="win-textbox absolute"
                  style={{
                    left: x,
                    top: y + 265,
                    width: 305,
                    height: 20,
                    fontFamily: "'Times New Roman', serif",
                    fontSize: 11,
                  }}
                  value={caption}
                />
              </div>
            );
          })}
        </div>
        <div className="absolute" style={{ left: 229, top: 635, width: 407, height: 33 }}>
          <button
            type="button"
            aria-label="First"
            className={button}
            style={{ ...buttonFont, left: 0, top: 0, width: 50, height: 30 }}
            onClick={() => setPage(0)}
          >
            {'<<'}
          </button>
          <button
            type="button"
            aria-label="Previous"
            className={button}
            style={{ ...buttonFont, left: 51, top: 0, width: 50, height: 30 }}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {'<'}
          </button>
          <input
            readOnly
            aria-label="Page"
            className="win-textbox absolute text-center"
            style={{
              left: 102,
              top: 0,
              width: 200,
              height: 30,
              fontFamily: 'Tahoma, sans-serif',
              fontSize: 19,
            }}
            value={`${page + 1} of ${pages}`}
          />
          <button
            type="button"
            aria-label="Next"
            className={button}
            style={{ ...buttonFont, left: 303, top: 0, width: 50, height: 30 }}
            onClick={() => setPage((p) => Math.min(last, p + 1))}
          >
            {'>'}
          </button>
          <button
            type="button"
            aria-label="Last"
            className={button}
            style={{ ...buttonFont, left: 354, top: 0, width: 50, height: 30 }}
            onClick={() => setPage(last)}
          >
            {'>>'}
          </button>
        </div>
      </div>
      {menuAt && (
        <ContextMenu
          at={menuAt}
          label="Pictures"
          onClose={() => setMenuAt(null)}
          items={[
            {
              kind: 'item',
              label: 'Save to Temp Selected',
              onSelect: () => onSaveTempSelected(ticked),
            },
          ]}
        />
      )}
    </Modal>
  );
}
