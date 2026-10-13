import { describe, expect, it } from 'vitest';
import { CASCADE_STEP, workspaceReducer, type WorkspaceState } from './Workspace';

const area = { w: 1000, h: 600 };
const start: WorkspaceState = { windows: [], activeId: null, maximized: true, nextId: 1 };
const open = (s: WorkspaceState, screen: string) =>
  workspaceReducer(s, { type: 'open', screen, area });
const openAll = (...screens: string[]) => screens.reduce(open, start);

describe('MDI workspace (Frmlibmain)', () => {
  it('opens a new maximized child per click, numbering repeats', () => {
    const s = openAll('bhasha-master', 'bhasha-master', 'lipi-master');
    expect(s.windows.map((w) => w.title)).toEqual([
      'Bhasha Master',
      'Bhasha Master (2)',
      'Lipi Master',
    ]);
    expect(s.activeId).toBe(3);
    expect(s.maximized).toBe(true);
  });

  it('activating a window brings it to the top and restores it if minimized', () => {
    let s = openAll('a', 'b', 'c');
    s = workspaceReducer(s, { type: 'minimize', id: 1 });
    expect(s.maximized).toBe(false);
    s = workspaceReducer(s, { type: 'activate', id: 1 });
    expect(s.windows.at(-1)).toMatchObject({ id: 1, minimized: false });
    expect(s.activeId).toBe(1);
  });

  it('closing the active window activates the top-most remaining one', () => {
    let s = openAll('a', 'b', 'c');
    s = workspaceReducer(s, { type: 'close', id: 3 });
    expect(s.activeId).toBe(2);
    s = workspaceReducer(s, { type: 'close', id: 1 });
    expect(s.activeId).toBe(2);
    s = workspaceReducer(s, { type: 'close-all' });
    expect(s).toMatchObject({ windows: [], activeId: null });
  });

  it('cascades normal windows with a fixed offset and leaves maximized mode', () => {
    let s = openAll('a', 'b', 'c');
    s = workspaceReducer(s, { type: 'cascade', area });
    expect(s.maximized).toBe(false);
    expect(s.windows.map((w) => [w.rect.x, w.rect.y])).toEqual([
      [0, 0],
      [CASCADE_STEP, CASCADE_STEP],
      [2 * CASCADE_STEP, 2 * CASCADE_STEP],
    ]);
  });

  it('tiles side by side (vertical) and stacked (horizontal), skipping minimized', () => {
    let s = openAll('a', 'b', 'c');
    s = workspaceReducer(s, { type: 'minimize', id: 2 });
    s = workspaceReducer(s, { type: 'tile', direction: 'vertical', area });
    expect(s.windows.filter((w) => !w.minimized).map((w) => w.rect)).toEqual([
      { x: 0, y: 0, w: 500, h: 600 },
      { x: 500, y: 0, w: 500, h: 600 },
    ]);
    s = workspaceReducer(s, { type: 'tile', direction: 'horizontal', area });
    expect(s.windows.filter((w) => !w.minimized).map((w) => w.rect)).toEqual([
      { x: 0, y: 0, w: 1000, h: 300 },
      { x: 0, y: 300, w: 1000, h: 300 },
    ]);
  });

  it('Ctrl+F6 brings the bottom-most window to the top', () => {
    let s = openAll('a', 'b', 'c');
    s = workspaceReducer(s, { type: 'next' });
    expect(s.activeId).toBe(1);
    expect(s.windows.map((w) => w.id)).toEqual([2, 3, 1]);
  });

  it('maximize applies to all windows and restore returns them to normal', () => {
    let s = openAll('a', 'b');
    s = workspaceReducer(s, { type: 'restore' });
    expect(s.maximized).toBe(false);
    s = workspaceReducer(s, { type: 'maximize', id: 1 });
    expect(s).toMatchObject({ maximized: true, activeId: 1 });
  });
});
