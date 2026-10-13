import { describe, expect, it } from 'vitest';
import {
  canOpenScreen,
  MAIN_MENU,
  type MenuItem,
  type MenuUser,
  SCREENS,
  visibleMenu,
} from './menu.js';

const operator: MenuUser = { id: 42, isAdmin: false, userType: 3 };
const admin: MenuUser = { id: 1, isAdmin: true, userType: 1 };

const labels = (user: MenuUser) => visibleMenu(user).map((m) => m.label);
const itemLabels = (user: MenuUser, menu: string) =>
  visibleMenu(user)
    .find((m) => m.label === menu)!
    .items.map((i) => (i.kind === 'separator' ? '---' : i.label));

describe('main menu (Frmlibmain)', () => {
  it('has the desktop menus in order, without the ones menu.ts keeps commented out', () => {
    expect(MAIN_MENU.map((m) => m.label)).toEqual([
      'Master',
      'Issue',
      'Library',
      'Graphics',
      'Windows',
      'Employee',
    ]);
  });

  it('gives screens unique ids', () => {
    const collect = (items: MenuItem[]): string[] =>
      items.flatMap((i) =>
        i.kind === 'screen' ? [i.screen] : i.kind === 'submenu' ? collect(i.items) : [],
      );
    const ids = MAIN_MENU.flatMap((m) => collect(m.items));
    expect(new Set(ids).size).toBe(ids.length);
    expect(SCREENS.size).toBe(ids.length);
  });

  it('shows nobody the commented-out Article, Utility and Reports menus', () => {
    for (const user of [operator, admin, { ...operator, id: 100 }]) {
      expect(labels(user)).not.toContain('Reports');
      expect(labels(user)).not.toContain('Utility');
      expect(labels(user)).not.toContain('Article');
    }
  });

  it('applies the Apprisal Standard rule (admin, users 5 and 100)', () => {
    expect(itemLabels(operator, 'Master')).not.toContain('Apprisal Standard');
    expect(itemLabels({ ...operator, id: 5 }, 'Master')).toContain('Apprisal Standard');
    expect(canOpenScreen(operator, 'apprisal-standard')).toBe(false);
    expect(canOpenScreen(admin, 'apprisal-standard')).toBe(true);
  });

  it('applies the Outsider rule (admin, user types Admin and AMaster)', () => {
    expect(canOpenScreen(operator, 'outsider-master')).toBe(false);
    expect(canOpenScreen({ ...operator, userType: 5 }, 'outsider-master')).toBe(true);
    expect(canOpenScreen({ ...operator, userType: 1 }, 'outsider-master')).toBe(true);
  });

  it('opens no screen of a commented-out item, even for an admin', () => {
    for (const id of ['export-table', 'replace-substring', 'vyakhyan-master', 'read-lekh']) {
      expect(canOpenScreen(admin, id)).toBe(false);
      expect(canOpenScreen({ ...operator, id: 13 }, id)).toBe(false);
    }
  });

  it('never opens a disabled item or an unknown screen', () => {
    expect(canOpenScreen(admin, 'magazine-vishesh-master-old')).toBe(false);
    expect(canOpenScreen(admin, 'no-such-screen')).toBe(false);
  });

  it('keeps separators only between items', () => {
    for (const menu of visibleMenu(operator)) {
      expect(menu.items[0]?.kind).not.toBe('separator');
      expect(menu.items.at(-1)?.kind).not.toBe('separator');
      menu.items.forEach((item, i) => {
        if (item.kind === 'separator') expect(menu.items[i + 1]?.kind).not.toBe('separator');
      });
    }
  });
});
