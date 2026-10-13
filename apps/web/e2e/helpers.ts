import { expect, type Page, test } from '@playwright/test';

/** Shared helpers for the browser tests. The API is apps/api/test/e2e-server.mjs. */
export const API = 'http://localhost:8181';

export type Scenario = {
  users: Record<'fresh' | 'pending' | 'absent' | 'manyPending' | 'reporter' | 'admin', string>;
  password: string;
  today: string;
  lastWorkingDay: string;
  dayBefore: string;
  threeBack: string;
};

export let scenario: Scenario;
export const dmy = (iso: string, sep = '-') => iso.split('-').reverse().join(sep);

/** Loads the seeded scenario once, and restores it before every test. */
export function useScenario() {
  test.beforeAll(async ({ request }) => {
    scenario = await (await request.get(`${API}/__e2e__/scenario`)).json();
  });

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/__e2e__/reset`, { data: {} });
    expect(res.ok()).toBe(true);
  });
}

export async function login(page: Page, username: string, password = scenario.password) {
  await page.goto('/login/');
  await page.getByLabel('User Name').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Password').press('Enter');
}

export const dialog = (page: Page, title: string | RegExp) =>
  page.getByRole('dialog', { name: title });

/** Clicks OK / Yes / No on the MsgBox-style dialog showing `text`. */
export async function answer(page: Page, text: string | RegExp, button: 'OK' | 'Yes' | 'No') {
  const box = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('alert').filter({ hasText: text }) });
  await expect(box).toBeVisible();
  await box.getByRole('button', { name: button, exact: true }).click();
}

/** Picks the first entry of the F2 list (frmList1) showing `title`, once it has loaded. */
export async function pickFirst(page: Page, title: string) {
  const list = page.getByRole('listbox', { name: title });
  await expect(list.getByRole('option').first()).toBeVisible();
  await page.getByLabel(`Search ${title}`).press('Enter');
  await expect(list).toBeHidden();
}

export function grid(page: Page) {
  const cell = (row: number, col: string) =>
    page.getByRole('grid').locator(`[row-index="${row}"] [col-id="${col}"]`);
  return { cell };
}

/** Opens a screen from the main menu, like clicking through Frmlibmain. */
export async function openMenuItem(page: Page, menu: string, item: string) {
  await page
    .getByRole('menubar', { name: 'Main menu' })
    .getByRole('menuitem', { name: menu, exact: true })
    .click();
  await page
    .getByRole('menu', { name: menu })
    .getByRole('menuitem', { name: item, exact: true })
    .click();
}
