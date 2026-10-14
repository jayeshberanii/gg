'use client';

import type { LibraryFileInfo } from '@gglib/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { Modal, ToolSeparator } from '@/components/ui/Modal';
import { api, errorMessage } from '@/lib/api';
import { libraryFileUrl, openLibraryFile } from './libraryFiles';

export type ImageViewerOptions = {
  /** The screen whose user is reading the files (the library-file route's guard). */
  screen: string;
  /** The files, as the desktop names them; Previous / Next Page move through them in order. */
  files: string[];
  /** The file to start at. */
  index?: number;
  /** The window's title; the desktop's form name by default. */
  title?: string;
  /** Text shown beside each file's name (by the files' order), e.g. its record's RecNo. */
  captions?: string[];
};

type Api = {
  /** Shows the files; resolves when the viewer is closed. */
  open: (options: ImageViewerOptions) => Promise<void>;
};

const Ctx = createContext<Api | null>(null);

/**
 * The image viewer every screen opens a picture of the desktop's folders in (SN / EB / TIT / GR
 * scans, Graphics Detail's pictures, RefrenceT pages). The desktop handed each file to Windows
 * (Process.Start, from frmViewJpg and the pictures' clicks), so its own viewer opened it; the
 * web shows it here instead of a bare browser tab, with frmViewJpg's controls.
 */
export function ImageViewerHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(ImageViewerOptions & { done: () => void }) | null>(null);
  const value = useMemo<Api>(
    () => ({
      open: (options) =>
        new Promise<void>((resolve) => {
          if (options.files.length === 0) {
            resolve();
            return;
          }
          setOpen({ ...options, done: resolve });
        }),
    }),
    [],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <ImageViewer
          {...open}
          onClose={() => {
            open.done();
            setOpen(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function useImageViewer(): Api {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useImageViewer needs ImageViewerHost');
  return ctx;
}

/**
 * How big the picture is drawn. `box` is frmViewJpg's zoom menu: the picture fitted into a box
 * of that many pixels (its "100 %" is the 800 x 600 PboxGenPages). `scale` is what Zoom In / Out
 * reach, 25 % at a time from wherever the picture is.
 */
type Zoom =
  | { kind: 'fit' }
  | { kind: 'actual' }
  | { kind: 'box'; width: number; height: number }
  | { kind: 'scale'; scale: number };

/** mnuMainZoom's items, top to bottom, with the box each sets. */
const PRESETS = [400, 300, 200, 150, 125, 100, 75, 50, 20, 10].map((percent) => ({
  percent,
  width: Math.round(8 * percent),
  height: Math.round(6 * percent),
}));

const MIN_SCALE = 0.02;
const MAX_SCALE = 16;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** The file's name, after its folder. */
const nameOf = (path: string) =>
  path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1);

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; info: LibraryFileInfo }
  | { state: 'error'; message: string };

/**
 * frmViewJpg (maximized): the picture in a scrolling panel, and the StatusStrip below it with
 * Zoom ▾, Zoom In, Zoom Out, Previous Page, Next Page and the name label (the icons are
 * frmViewJpg.resx's; three of them are WinForms' stock placeholder picture, as on the desktop).
 * The desktop's Zoom In shrank the picture and Zoom Out grew it; here they do what they say. Pages of a multi-page
 * scan come first, then the next file. Added for the web: fit to window, rotate, drag to pan,
 * Ctrl + wheel to zoom, and opening the file in a tab of its own.
 */
function ImageViewer({
  screen,
  files,
  index: startIndex = 0,
  title = 'frmViewJpg',
  captions,
  onClose,
}: ImageViewerOptions & { onClose: () => void }) {
  const [index, setIndex] = useState(Math.min(Math.max(0, startIndex), files.length - 1));
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [zoom, setZoom] = useState<Zoom>({ kind: 'fit' });
  const [rotation, setRotation] = useState(0);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });

  const path = files[index] ?? '';
  const pages = loaded.state === 'ready' ? loaded.info.pages : 1;

  // The file's kind and pages, before it is drawn.
  useEffect(() => {
    let live = true;
    setLoaded({ state: 'loading' });
    setNatural(null);
    setImageFailed(false);
    api
      .get<LibraryFileInfo>(`/master/${screen}/library-file/info?path=${encodeURIComponent(path)}`)
      .then(
        (info) => live && setLoaded({ state: 'ready', info }),
        (err: unknown) => live && setLoaded({ state: 'error', message: errorMessage(err) }),
      );
    return () => {
      live = false;
    };
  }, [screen, path]);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => setPanelSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const turned = rotation % 180 !== 0;
  /** The picture's size as it stands after rotating, at scale 1. */
  const upright = natural
    ? turned
      ? { width: natural.height, height: natural.width }
      : natural
    : null;

  const scale = useMemo(() => {
    if (!upright) return 1;
    const fitInto = (w: number, h: number) => Math.min(w / upright.width, h / upright.height);
    switch (zoom.kind) {
      case 'fit':
        // A little room inside the panel, so the picture never needs the scroll bars.
        return clampScale(fitInto(panelSize.width - 8, panelSize.height - 8));
      case 'actual':
        return 1;
      case 'box':
        return clampScale(fitInto(zoom.width, zoom.height));
      case 'scale':
        return zoom.scale;
    }
  }, [zoom, upright, panelSize]);

  // ------------------------------------------------------------------------------------------
  // Moving through the files (gotoNext / gotoPrevious) and their pages
  // ------------------------------------------------------------------------------------------

  const canPrevious = page > 0 || index > 0;
  const canNext = page < pages - 1 || index < files.length - 1;

  const goToFile = useCallback(
    (next: number) => {
      if (next < 0 || next >= files.length || next === index) return;
      setIndex(next);
      setPage(0);
      setRotation(0);
    },
    [files.length, index],
  );

  const previous = useCallback(() => {
    if (page > 0) setPage(page - 1);
    else goToFile(index - 1);
  }, [page, index, goToFile]);

  const next = useCallback(() => {
    if (page < pages - 1) setPage(page + 1);
    else goToFile(index + 1);
  }, [page, pages, index, goToFile]);

  /**
   * Focus back on the picture after Previous / Next Page and the Zoom menu: the button may have
   * just been disabled, or the menu item removed, which would drop focus out of the window and
   * with it the keys (Esc, arrows …).
   */
  const keepKeys = () => panel.current?.focus();

  const zoomBy = useCallback(
    (factor: number) => setZoom({ kind: 'scale', scale: clampScale(scale * factor) }),
    [scale],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (menuAt) {
      // The Zoom menu's own Esc closes only the menu.
      if (e.key === 'Escape') e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: previous,
      PageUp: previous,
      ArrowRight: next,
      PageDown: next,
      Home: () => goToFile(0),
      End: () => goToFile(files.length - 1),
      '+': () => zoomBy(1.25),
      '=': () => zoomBy(1.25),
      '-': () => zoomBy(0.8),
      '0': () => setZoom({ kind: 'fit' }),
      '1': () => setZoom({ kind: 'actual' }),
      r: () => setRotation((r) => (r + 90) % 360),
    };
    const run = keys[e.key];
    if (run && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      run();
    }
  }

  // Ctrl + wheel zooms (the desktop's MouseWheel only showed the delta); a plain wheel scrolls.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.25 : 0.8);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // Dragging the picture scrolls the panel.
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  function onMouseDown(e: React.MouseEvent) {
    const el = panel.current;
    if (e.button !== 0 || !el) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    e.preventDefault();
  }
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      const el = panel.current;
      if (!d || !el) return;
      el.scrollLeft = d.left - (e.clientX - d.x);
      el.scrollTop = d.top - (e.clientY - d.y);
    };
    const up = () => (drag.current = null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const zoomItems: ContextMenuItem[] = [
    { kind: 'item', label: 'Fit to Window', onSelect: () => setZoom({ kind: 'fit' }) },
    { kind: 'separator' },
    ...PRESETS.map((p): ContextMenuItem => ({
      kind: 'item',
      label: `${p.percent} %`,
      checked: zoom.kind === 'box' && zoom.width === p.width,
      onSelect: () => setZoom({ kind: 'box', width: p.width, height: p.height }),
    })),
    {
      kind: 'item',
      label: 'Actual Size',
      checked: zoom.kind === 'actual',
      onSelect: () => setZoom({ kind: 'actual' }),
    },
  ];

  const src = libraryFileUrl(screen, path) + (page > 0 ? `&page=${page}` : '');
  const isImage = loaded.state === 'ready' && loaded.info.kind === 'image';
  const shown = upright
    ? { width: upright.width * scale, height: upright.height * scale }
    : { width: 0, height: 0 };

  return (
    <Modal
      title={title}
      maximized
      className="bg-control"
      initialFocus='[aria-label="Picture"]'
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      <div className="flex h-full flex-col">
        <div
          ref={panel}
          role="region"
          aria-label="Picture"
          tabIndex={0}
          onMouseDown={isImage ? onMouseDown : undefined}
          className={`relative min-h-0 flex-1 overflow-auto bg-[#808080] outline-none ${
            isImage && natural ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          {loaded.state === 'loading' && <Notice text="Loading…" />}
          {loaded.state === 'error' && <Notice text={loaded.message} />}
          {loaded.state === 'ready' && loaded.info.kind === 'pdf' && (
            <iframe title={nameOf(path)} src={src} className="h-full w-full border-0 bg-white" />
          )}
          {loaded.state === 'ready' && loaded.info.kind === 'other' && (
            <Notice text="This file cannot be shown here.">
              <button
                type="button"
                className="win-button mt-2"
                onClick={() => openLibraryFile(screen, path)}
              >
                Download
              </button>
            </Notice>
          )}
          {isImage && imageFailed && <Notice text="Image not Found" />}
          {isImage && !imageFailed && (
            // The picture sits in a box of its turned size, centred while it is smaller than
            // the panel; bigger, it scrolls.
            <div
              className="flex min-h-full min-w-full items-center justify-center"
              style={{ width: 'max-content' }}
            >
              <div
                className="relative shrink-0"
                style={{ width: shown.width, height: shown.height, margin: 4 }}
              >
                <img
                  key={src}
                  src={src}
                  alt={nameOf(path)}
                  draggable={false}
                  onLoad={(e) =>
                    setNatural({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }
                  onError={() => setImageFailed(true)}
                  className="absolute top-1/2 left-1/2 max-w-none bg-white select-none"
                  style={{
                    width: natural ? natural.width * scale : undefined,
                    height: natural ? natural.height * scale : undefined,
                    visibility: natural ? 'visible' : 'hidden',
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div role="toolbar" aria-label="Picture controls" className="win-toolstrip shrink-0">
          <button
            type="button"
            className="win-toolstrip-text"
            aria-haspopup="menu"
            aria-expanded={menuAt !== null}
            disabled={!isImage}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenuAt({ x: r.left, y: r.top - 2 - 20 * zoomItems.length });
            }}
          >
            <img src="/legacy/icons/viewjpg-picture.png" alt="" className="mr-1 inline" />
            Zoom ▾
          </button>
          <button
            type="button"
            className="win-toolstrip-text"
            disabled={!isImage}
            onClick={() => zoomBy(1.25)}
          >
            <img src="/legacy/icons/viewjpg-zoom-in.png" alt="" className="mr-1 inline" />
            Zoom In
          </button>
          <button
            type="button"
            className="win-toolstrip-text"
            disabled={!isImage}
            onClick={() => zoomBy(0.8)}
          >
            <img src="/legacy/icons/viewjpg-zoom-out.png" alt="" className="mr-1 inline" />
            Zoom Out
          </button>
          <ToolSeparator />
          <button
            type="button"
            className="win-toolstrip-text"
            disabled={!canPrevious}
            onClick={() => {
              previous();
              keepKeys();
            }}
          >
            <img src="/legacy/icons/viewjpg-picture.png" alt="" className="mr-1 inline" />
            Previous Page
          </button>
          <button
            type="button"
            className="win-toolstrip-text"
            disabled={!canNext}
            onClick={() => {
              next();
              keepKeys();
            }}
          >
            <img src="/legacy/icons/viewjpg-picture.png" alt="" className="mr-1 inline" />
            Next Page
          </button>
          <ToolSeparator />
          <button
            type="button"
            className="win-toolstrip-text"
            disabled={!isImage}
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            Rotate
          </button>
          <button
            type="button"
            className="win-toolstrip-text"
            onClick={() => openLibraryFile(screen, path)}
          >
            Open in New Tab
          </button>
          <ToolSeparator />
          {/* mnulblgranthname */}
          <span className="win-toolstrip-text min-w-0 truncate leading-[20px]" title={path}>
            {nameOf(path)}
            {captions?.[index] ? `  ·  ${captions[index]}` : ''}
          </span>
          <span className="flex-1" />
          <span className="win-toolstrip-text leading-[20px]" aria-label="Position">
            {pages > 1 && `Page ${page + 1} of ${pages}  ·  `}
            {`File ${index + 1} of ${files.length}`}
            {isImage && natural && `  ·  ${Math.round(scale * 100)} %`}
          </span>
        </div>
      </div>
      {menuAt && (
        <ContextMenu
          items={zoomItems}
          at={menuAt}
          label="Zoom"
          onClose={() => {
            setMenuAt(null);
            keepKeys();
          }}
        />
      )}
    </Modal>
  );
}

function Notice({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-white" role="status">
      <p>{text}</p>
      {children}
    </div>
  );
}
