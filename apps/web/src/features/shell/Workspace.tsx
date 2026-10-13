'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { GridRow } from '@gglib/shared';
import { NotYetAvailable } from '@/screens/NotYetAvailable';
import { SCREEN_COMPONENTS, screenTitle } from '@/screens/registry';

/**
 * The MDI area of Frmlibmain (IsMdiContainer), emulated. As on the desktop:
 * - every menu click opens a new child window, even for a screen that is already open;
 * - children open maximized (frmMasterPage.WindowState = Maximized); while one is maximized,
 *   they all are, and the active child's buttons sit at the right of the menu strip;
 * - otherwise children are movable, resizable windows that can be minimized to the bottom;
 * - Windows › Cascade / Tile Vertical / Tile Horizontal / Arrange Icons / Close All arrange
 *   them, and the Windows menu lists them (MdiWindowListItem).
 * Hidden and minimized windows stay mounted, so unsaved work survives.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Area = { w: number; h: number };
type Win = {
  id: number;
  screen: string;
  title: string;
  minimized: boolean;
  rect: Rect;
  /** Records this window was opened for ("Show In Use" from another screen). */
  ids?: number[];
  /** Opened in Add mode with these values in its boxes (ActionResult `open` + `newRecord`). */
  newRecord?: GridRow;
};

export type WorkspaceState = {
  /** In z-order: the last one is on top. */
  windows: Win[];
  activeId: number | null;
  maximized: boolean;
  nextId: number;
};

type Action =
  | { type: 'open'; screen: string; area: Area; ids?: number[]; newRecord?: GridRow }
  | { type: 'close'; id: number }
  | { type: 'activate'; id: number }
  | { type: 'minimize'; id: number }
  | { type: 'maximize'; id: number }
  | { type: 'restore' }
  | { type: 'move'; id: number; rect: Rect }
  | { type: 'cascade'; area: Area }
  | { type: 'tile'; direction: 'vertical' | 'horizontal'; area: Area }
  | { type: 'close-all' }
  | { type: 'next' };

export const CASCADE_STEP = 26;
export const MIN_SIZE = { w: 320, h: 200 };

function cascadeRect(i: number, area: Area): Rect {
  const w = Math.max(MIN_SIZE.w, Math.round(area.w * 0.7));
  const h = Math.max(MIN_SIZE.h, Math.round(area.h * 0.7));
  const room = Math.max(1, Math.floor(Math.min(area.w - w, area.h - h) / CASCADE_STEP) + 1);
  const step = (i % room) * CASCADE_STEP;
  return { x: step, y: step, w, h };
}

/** The top-most window that is not minimized, else the top-most one. */
function topWindow(windows: Win[]): number | null {
  const open = windows.filter((w) => !w.minimized);
  return (open.at(-1) ?? windows.at(-1))?.id ?? null;
}

function raise(windows: Win[], id: number, patch: Partial<Win> = {}): Win[] {
  const win = windows.find((w) => w.id === id);
  if (!win) return windows;
  return [...windows.filter((w) => w.id !== id), { ...win, ...patch }];
}

export function workspaceReducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'open': {
      const same = state.windows.filter((w) => w.screen === action.screen).length;
      const base = screenTitle(action.screen);
      const win: Win = {
        id: state.nextId,
        screen: action.screen,
        title: same > 0 ? `${base} (${same + 1})` : base,
        minimized: false,
        rect: cascadeRect(state.windows.length, action.area),
        ids: action.ids,
        ...(action.newRecord ? { newRecord: action.newRecord } : {}),
      };
      return {
        ...state,
        windows: [...state.windows, win],
        activeId: win.id,
        nextId: win.id + 1,
      };
    }
    case 'close': {
      const windows = state.windows.filter((w) => w.id !== action.id);
      if (windows.length === state.windows.length) return state;
      return {
        ...state,
        windows,
        activeId: state.activeId === action.id ? topWindow(windows) : state.activeId,
      };
    }
    case 'activate':
      return {
        ...state,
        windows: raise(state.windows, action.id, { minimized: false }),
        activeId: action.id,
      };
    case 'minimize': {
      const windows = state.windows.map((w) =>
        w.id === action.id ? { ...w, minimized: true } : w,
      );
      return { ...state, windows, maximized: false, activeId: topWindow(windows) };
    }
    case 'maximize':
      return {
        ...state,
        windows: raise(state.windows, action.id, { minimized: false }),
        activeId: action.id,
        maximized: true,
      };
    case 'restore':
      return { ...state, maximized: false };
    case 'move':
      return {
        ...state,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, rect: action.rect } : w)),
      };
    case 'cascade': {
      let i = 0;
      const windows = state.windows.map((w) =>
        w.minimized ? w : { ...w, rect: cascadeRect(i++, action.area) },
      );
      return { ...state, windows, maximized: false };
    }
    case 'tile': {
      const open = state.windows.filter((w) => !w.minimized);
      const n = Math.max(open.length, 1);
      const { w: aw, h: ah } = action.area;
      const rects = new Map(
        open.map((w, i) => [
          w.id,
          action.direction === 'vertical'
            ? { x: Math.round((aw / n) * i), y: 0, w: Math.round(aw / n), h: ah }
            : { x: 0, y: Math.round((ah / n) * i), w: aw, h: Math.round(ah / n) },
        ]),
      );
      return {
        ...state,
        windows: state.windows.map((w) => ({ ...w, rect: rects.get(w.id) ?? w.rect })),
        maximized: false,
      };
    }
    case 'close-all':
      return { ...state, windows: [], activeId: null };
    case 'next': {
      const open = state.windows.filter((w) => !w.minimized);
      if (open.length < 2) return state;
      // The bottom-most window comes to the top (Ctrl+F6).
      const next = open[0]!;
      return { ...state, windows: raise(state.windows, next.id), activeId: next.id };
    }
  }
}

type WorkspaceApi = {
  windows: Win[];
  activeId: number | null;
  active: Win | null;
  maximized: boolean;
  /** `newRecord`: open it in Add mode with these values in its boxes (see ScreenProps.initialNew). */
  open: (screen: string, ids?: number[], newRecord?: GridRow) => void;
  close: (id: number) => void;
  activate: (id: number) => void;
  minimize: (id: number) => void;
  maximize: (id: number) => void;
  restore: () => void;
  move: (id: number, rect: Rect) => void;
  cascade: () => void;
  tile: (direction: 'vertical' | 'horizontal') => void;
  arrangeIcons: () => void;
  closeAll: () => void;
  /** Set by WorkspaceView: the client area's size, for new and arranged windows. */
  areaRef: React.RefObject<Area>;
};

const Ctx = createContext<WorkspaceApi | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, {
    windows: [],
    activeId: null,
    maximized: true,
    nextId: 1,
  });
  const areaRef = useRef<Area>({ w: 1000, h: 600 });

  const value = useMemo<WorkspaceApi>(
    () => ({
      windows: state.windows,
      activeId: state.activeId,
      active: state.windows.find((w) => w.id === state.activeId) ?? null,
      maximized: state.maximized,
      open: (screen, ids, newRecord) =>
        dispatch({ type: 'open', screen, area: areaRef.current, ids, newRecord }),
      close: (id) => dispatch({ type: 'close', id }),
      activate: (id) => dispatch({ type: 'activate', id }),
      minimize: (id) => dispatch({ type: 'minimize', id }),
      maximize: (id) => dispatch({ type: 'maximize', id }),
      restore: () => dispatch({ type: 'restore' }),
      move: (id, rect) => dispatch({ type: 'move', id, rect }),
      cascade: () => dispatch({ type: 'cascade', area: areaRef.current }),
      tile: (direction) => dispatch({ type: 'tile', direction, area: areaRef.current }),
      // Minimized windows are always kept in a row along the bottom edge.
      arrangeIcons: () => dispatch({ type: 'restore' }),
      closeAll: () => dispatch({ type: 'close-all' }),
      areaRef,
    }),
    [state],
  );

  // MDI keys: Ctrl+F6 next window, Ctrl+F4 close the active one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'F6') {
        e.preventDefault();
        dispatch({ type: 'next' });
      } else if (e.key === 'F4' && state.activeId !== null) {
        e.preventDefault();
        dispatch({ type: 'close', id: state.activeId });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.activeId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspace needs WorkspaceProvider');
  return ctx;
}

const ICON_W = 160;
const ICON_H = 30;

export function WorkspaceView({ caption }: { caption?: ReactNode }) {
  const ws = useWorkspace();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      ws.areaRef.current = { w: el.clientWidth, h: el.clientHeight };
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ws.areaRef]);

  const minimized = ws.windows.filter((w) => w.minimized);

  return (
    <div
      ref={ref}
      aria-label="Windows"
      className="relative min-h-0 flex-1 overflow-hidden bg-white bg-[length:100%_100%] bg-no-repeat"
      style={{ backgroundImage: "url('/legacy/mdi-background.jpg')" }}
    >
      {caption}
      {ws.windows.map((w) => {
        const isActive = w.id === ws.activeId;
        if (ws.maximized) {
          return (
            <section
              key={w.id}
              aria-label={w.title}
              hidden={!isActive || w.minimized}
              className="absolute inset-0 overflow-auto bg-control"
            >
              <ScreenHost win={w} close={() => ws.close(w.id)} />
            </section>
          );
        }
        if (w.minimized) {
          const i = minimized.indexOf(w);
          const perRow = Math.max(1, Math.floor((ws.areaRef.current.w || 1) / ICON_W));
          return (
            <section
              key={w.id}
              aria-label={w.title}
              className="win-frame absolute shadow-none"
              style={{
                left: (i % perRow) * ICON_W,
                bottom: Math.floor(i / perRow) * ICON_H,
                width: ICON_W,
                height: ICON_H,
              }}
            >
              <TitleBar win={w} active={isActive} />
              <div hidden>
                <ScreenHost win={w} close={() => ws.close(w.id)} />
              </div>
            </section>
          );
        }
        return (
          <section
            key={w.id}
            aria-label={w.title}
            onMouseDown={() => !isActive && ws.activate(w.id)}
            className="win-frame absolute"
            style={{
              left: w.rect.x,
              top: w.rect.y,
              width: w.rect.w,
              height: w.rect.h,
              zIndex: ws.windows.indexOf(w) + 1,
            }}
          >
            <TitleBar win={w} active={isActive} />
            <div className="min-h-0 flex-1 overflow-auto bg-control">
              <ScreenHost win={w} close={() => ws.close(w.id)} />
            </div>
            <ResizeHandle win={w} />
          </section>
        );
      })}
    </div>
  );
}

/** A child window's title bar: drag to move; minimize, maximize and close buttons. */
function TitleBar({ win, active }: { win: Win; active: boolean }) {
  const ws = useWorkspace();

  function onPointerDown(e: React.PointerEvent) {
    if (win.minimized || (e.target as HTMLElement).closest('button')) return;
    ws.activate(win.id);
    const start = { x: e.clientX, y: e.clientY, rect: win.rect };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const area = ws.areaRef.current;
      ws.move(win.id, {
        ...start.rect,
        x: Math.min(Math.max(start.rect.x + ev.clientX - start.x, -start.rect.w + 80), area.w - 80),
        y: Math.min(Math.max(start.rect.y + ev.clientY - start.y, 0), area.h - 30),
      });
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  }

  return (
    <div
      className="win-titlebar shrink-0 cursor-default"
      data-inactive={active ? undefined : ''}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) =>
        !(e.target as HTMLElement).closest('button') &&
        (win.minimized ? ws.activate(win.id) : ws.maximize(win.id))
      }
    >
      <h2 className="flex-1 truncate font-normal">{win.title}</h2>
      <CaptionButtons
        title={win.title}
        onMinimize={win.minimized ? undefined : () => ws.minimize(win.id)}
        onMaximize={() => (win.minimized ? ws.activate(win.id) : ws.maximize(win.id))}
        restoreIcon={win.minimized}
        onClose={() => ws.close(win.id)}
      />
    </div>
  );
}

/** Minimize / maximize-or-restore / close, as on a window's title bar. */
export function CaptionButtons({
  title,
  onMinimize,
  onMaximize,
  restoreIcon,
  onClose,
  compact = false,
}: {
  title: string;
  onMinimize?: () => void;
  onMaximize: () => void;
  restoreIcon: boolean;
  onClose: () => void;
  compact?: boolean;
}) {
  const cls = compact
    ? 'win-caption-button !h-[22px] !w-[28px] !text-[11px]'
    : 'win-caption-button';
  return (
    <span className="flex">
      {onMinimize && (
        <button
          type="button"
          data-caption
          aria-label={`Minimize ${title}`}
          onClick={onMinimize}
          className={cls}
        >
          ─
        </button>
      )}
      <button
        type="button"
        data-caption
        aria-label={`${restoreIcon ? 'Restore' : 'Maximize'} ${title}`}
        onClick={onMaximize}
        className={cls}
      >
        {restoreIcon ? '❐' : '☐'}
      </button>
      <button
        type="button"
        data-caption
        data-close
        aria-label={`Close ${title}`}
        onClick={onClose}
        className={cls}
      >
        ✕
      </button>
    </span>
  );
}

function ResizeHandle({ win }: { win: Win }) {
  const ws = useWorkspace();
  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, rect: win.rect };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) =>
      ws.move(win.id, {
        ...start.rect,
        w: Math.max(MIN_SIZE.w, start.rect.w + ev.clientX - start.x),
        h: Math.max(MIN_SIZE.h, start.rect.h + ev.clientY - start.y),
      });
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  }
  return (
    <span
      aria-hidden="true"
      onPointerDown={onPointerDown}
      className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize"
      style={{
        background:
          'linear-gradient(135deg, transparent 50%, #a0a0a0 50%, #a0a0a0 60%, transparent 60%, transparent 70%, #a0a0a0 70%, #a0a0a0 80%, transparent 80%)',
      }}
    />
  );
}

function ScreenHost({ win, close }: { win: Win; close: () => void }) {
  const Screen = SCREEN_COMPONENTS[win.screen];
  return Screen ? (
    <Screen
      windowId={win.id}
      close={close}
      initialIds={win.newRecord ? [0] : win.ids}
      {...(win.newRecord ? { initialNew: win.newRecord } : {})}
    />
  ) : (
    <NotYetAvailable screenId={win.screen} count={win.ids?.length} />
  );
}
