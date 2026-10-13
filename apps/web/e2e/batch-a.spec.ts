import { expect, type Page, test } from '@playwright/test';
import { answer, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * Plan Batch A in a real browser against the real API and database (inside the e2e server's
 * rolled-back transaction): Holiday, New Word Master, New Vishay Master, Outsider(Visitor)
 * Master and Book Confirmation. See their docs/screens notes.
 */
useScenario();

async function open(page: Page, menu: string, item: string, title = item) {
  await login(page, scenario.users.reporter);
  await openMenuItem(page, menu, item);
  return page.getByRole('region', { name: title });
}

async function save(page: Page, win: ReturnType<Page['getByRole']>) {
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
}

async function rightClick(page: Page, row: number, col: string, path: string[]) {
  await grid(page).cell(row, col).click({ button: 'right' });
  let menu = page.getByRole('menu', { name: 'Record' });
  for (const [i, label] of path.entries()) {
    const item = menu.getByRole('menuitem', { name: label, exact: true });
    if (i < path.length - 1) {
      await item.hover();
      menu = page.getByRole('menu', { name: label });
    } else await item.click();
  }
}

test('Holiday: adds a holiday with the date picker and shows its day name', async ({ page }) => {
  const win = await open(page, 'Employee', 'Holiday');
  // No holiday this year in the test copy: Form_Load starts New on the empty grid.
  await expect(win.getByRole('button', { name: 'Save' })).toBeEnabled();
  const year = new Date().getFullYear();
  await win.getByLabel('Holiday Name').fill('Zzq e2e holiday');
  await win.getByLabel('Holiday Date').fill(`${year}-08-15`);
  await save(page, win);
  const g = grid(page);
  await expect(g.cell(0, 'HolidayName')).toHaveText('Zzq e2e holiday');
  await expect(g.cell(0, 'HolidayDate')).toHaveText(`15-08-${year}`);
  await expect(
    win
      .getByRole('gridcell', {
        name: new Date(Date.UTC(year, 7, 15)).toLocaleDateString('en-US', {
          weekday: 'long',
          timeZone: 'UTC',
        }),
      })
      .first(),
  ).toBeVisible();

  await rightClick(page, 0, 'HolidayName', ['Show All Records']);
  await expect(g.cell(0, 'HolidayMKm')).toBeVisible();
});

test('New Word Master: adds a word and offers the words of its Type to replace with', async ({
  page,
}) => {
  const win = await open(page, 'Graphics', 'New Word Master');
  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('Type').fill('zzqe2etype');
  await win.getByLabel('Name').fill('Zzq e2e word');
  await save(page, win);
  const g = grid(page);
  const row = page.getByRole('row').filter({ hasText: 'Zzq e2e word' }).first();
  await row.click();
  const index = Number(await row.getAttribute('row-index'));
  await rightClick(page, index, 'wordnm', ['Utility', 'Replace']);
  const list = page.getByRole('listbox', { name: 'Replace' });
  await expect(list.getByRole('option').filter({ hasText: 'Zzq e2e word' })).toBeVisible();
  await page.getByLabel('Search Replace').press('Escape');
  await expect(list).toBeHidden();
  await expect(g.cell(index, 'typenm')).toHaveText('zzqe2etype');
});

test('New Vishay Master: the Cancel box sits over the toolbar and is saved', async ({ page }) => {
  const win = await open(page, 'Graphics', 'New Vishay Master');
  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('Name', { exact: true }).fill('Zzq e2e vishay');
  await win.getByRole('checkbox', { name: 'Cancel' }).check();
  await save(page, win);
  await expect(grid(page).cell(0, 'vishaynm')).toHaveText('Zzq e2e vishay');
  await expect(grid(page).cell(0, 'IsCancel')).toHaveText('True');
});

test('Outsider: picks a party with F2, keeps the work time mask, and saves', async ({ page }) => {
  const win = await open(page, 'Issue', 'Outsider(Visitor) Master');
  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('Party Name').press('F2');
  const list = page.getByRole('listbox', { name: 'Party Name' });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Search Party Name').press('ArrowDown');
  await page.getByLabel('Search Party Name').press('Enter');
  await expect(win.getByLabel('Party Name')).not.toHaveValue('');
  const time = win.getByLabel('Work Time');
  await time.pressSequentially('0a5:30');
  await expect(time).toHaveValue('05:30');
  await save(page, win);
  await expect(grid(page).cell(0, 'WorkTime')).toHaveText('05:30:00');
});

test('Book Confirmation: only Delete, Refresh and Exit on the toolbar', async ({ page }) => {
  const win = await open(page, 'Issue', 'Book Confirmation');
  const bar = win.getByRole('toolbar', { name: 'Record' });
  await expect(bar.getByRole('button', { name: 'Delete' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Exit' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'New' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Save' })).toHaveCount(0);
});
