import { expect, type Page, test } from '@playwright/test';
import { API, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * The main window (Frmlibmain): menu tree and visibility rules, windows opened from the menu,
 * the Windows menu, and the API refusing screens a user's menu hides.
 */
useScenario();

async function enter(page: Page, username: string) {
  await login(page, username);
  await expect(page.getByLabel('Signed in as')).toHaveText(username);
}

const menubar = (page: Page) => page.getByRole('menubar', { name: 'Main menu' });
const topMenus = async (page: Page) =>
  (await menubar(page).locator(':scope > li > [role="menuitem"]').allInnerTexts()).map((t) =>
    t.trim(),
  );

test('shows an operator the desktop menus, without the restricted ones', async ({ page }) => {
  await enter(page, scenario.users.reporter);
  // menu.ts keeps the desktop's Article, Utility and Reports menus commented out.
  expect(await topMenus(page)).toEqual([
    'Master',
    'Issue',
    'Library',
    'Graphics',
    'Windows',
    'Employee',
  ]);

  await menubar(page).getByRole('menuitem', { name: 'Master', exact: true }).click();
  const master = page.getByRole('menu', { name: 'Master' });
  await expect(master.getByRole('menuitem', { name: 'Bhasha Master' })).toBeVisible();
  await expect(master.getByRole('menuitem', { name: 'Apprisal Standard' })).toHaveCount(0);
  await expect(master.getByRole('menuitem', { name: /Exit/ })).toContainText('Ctrl+Q');
  await page.keyboard.press('Escape');

  // User type Admin (1) sees the Outsider screen.
  await menubar(page).getByRole('menuitem', { name: 'Issue', exact: true }).click();
  await expect(
    page
      .getByRole('menu', { name: 'Issue' })
      .getByRole('menuitem', { name: 'Outsider(Visitor) Master' }),
  ).toBeVisible();
});

test('shows an admin the admin-only items', async ({ page }) => {
  await enter(page, scenario.users.admin);
  await menubar(page).getByRole('menuitem', { name: 'Master', exact: true }).click();
  await expect(
    page.getByRole('menu', { name: 'Master' }).getByRole('menuitem', { name: 'Apprisal Standard' }),
  ).toBeVisible();
});

const windowList = (page: Page) =>
  page.getByRole('menu', { name: 'Windows' }).getByRole('menuitemradio');

test('opens every screen as a new maximized MDI child, like Frmlibmain', async ({ page }) => {
  await enter(page, scenario.users.reporter);
  await openMenuItem(page, 'Master', 'Bhasha Master');
  await openMenuItem(page, 'Master', 'Bhasha Master');
  await openMenuItem(page, 'Graphics', 'Graphics Detail');

  // Maximized: only the active child shows, and its title joins the program's.
  const detail = page.getByRole('region', { name: 'Graphics Detail' });
  await expect(detail).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bhasha Master (2)' })).toBeHidden();
  await expect(page).toHaveTitle(
    /^गीतार्थ गंगा \(Library Program\) Version - .+ - \[Graphics Detail\]$/,
  );

  // Every live menu item is ported now, so the child is the real screen, not the placeholder.
  await expect(detail).not.toContainText('not available on the web yet');

  // The Windows menu lists the children, the active one checked (MdiWindowListItem).
  await menubar(page).getByRole('menuitem', { name: 'Windows', exact: true }).click();
  await expect(windowList(page)).toHaveText([
    '1 Bhasha Master',
    '2 Bhasha Master (2)',
    '3 Graphics Detail',
  ]);
  await expect(windowList(page).nth(2)).toHaveAttribute('aria-checked', 'true');
  await windowList(page).nth(0).click();
  await expect(page.getByRole('region', { name: 'Bhasha Master', exact: true })).toBeVisible();

  // The maximized child's close button sits at the right of the menu strip.
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Close Bhasha Master', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Bhasha Master', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Graphics Detail' })).toBeVisible();
});

test('moves between windows and closes them all from the Windows menu', async ({ page }) => {
  // menu.ts keeps Cascade / Tile / Arrange Icons commented out: Close All is the only item.
  await enter(page, scenario.users.reporter);
  await openMenuItem(page, 'Master', 'Bhasha Master');
  await openMenuItem(page, 'Library', 'Book Master');
  await expect(page).toHaveTitle(/\[Book Master\]$/);
  await page.keyboard.press('Control+F6');
  await expect(page).toHaveTitle(/\[Bhasha Master\]$/);

  await openMenuItem(page, 'Windows', 'Close All');
  await expect(page.getByRole('region')).toHaveCount(0);
});

test('drives the menu from the keyboard (Alt+L, arrows, Enter)', async ({ page }) => {
  await enter(page, scenario.users.reporter);
  await page.keyboard.press('Alt+l');
  const library = page.getByRole('menu', { name: 'Library' });
  await expect(library.getByRole('menuitem', { name: 'Book Master', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(library.getByRole('menuitem', { name: 'Kruti Master' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Kruti Master' })).toBeVisible();

  await page.keyboard.press('Alt+l');
  await expect(page.getByRole('menu', { name: 'Library' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Library' })).toHaveCount(0);
});

test('Employee › Login & Log Out opens the work report from the menu', async ({ page }) => {
  await enter(page, scenario.users.reporter);
  await openMenuItem(page, 'Employee', 'Login & Log Out');
  const report = page.getByRole('dialog', { name: 'Logout' });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: 'Close' }).click();
  // Closing without saving keeps the session (only the logout time is stamped).
  await expect(page.getByLabel('Signed in as')).toBeVisible();
  expect((await page.request.get(`${API}/api/auth/me`)).status()).toBe(200);
});
