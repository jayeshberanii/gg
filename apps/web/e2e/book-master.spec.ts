import { expect, type Page, test } from '@playwright/test';
import { answer, dialog, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * Library › Book Master (frmBookMasterNew) in a real browser against the real API and database
 * (inside the e2e server's rolled-back transaction): the designer's layout, a popup, Save, the
 * Library No form (frmBookTranNew) and the delete check. See docs/screens/book-master.md.
 */
useScenario();

async function openScreen(page: Page) {
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Library', 'Book Master');
  return page.getByRole('region', { name: 'Book Master' });
}

/** Picks the first real row of the open F2 list (row 0 may be frmList1's blank row). */
async function pickFirstReal(page: Page, title: string) {
  const list = page.getByRole('listbox', { name: title });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 30_000 });
  const search = page.getByLabel(`Search ${title}`);
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(list).toBeHidden();
}

test('shows the desktop layout and the newest books', async ({ page }) => {
  const win = await openScreen(page);
  for (const label of [
    'Book Name',
    'Smvt Type',
    // Captions of desktop v3.4.3.1.
    'GMala Name/No',
    'Pages/Total Pages',
    'Group No/Name',
    'Group Pari Name/Part',
    'Bhasha/Lipi',
    'Mix Sign/Remark',
    'Prak Vishesh',
    'Library No',
    'Magazine Remark',
  ]) {
    await expect(win.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(win.getByRole('checkbox', { name: 'IsPrint' })).toBeVisible();
  await expect(grid(page).cell(0, 'txtBookName')).not.toBeEmpty({ timeout: 30_000 });
  // chkSearchNotInOB (v3.4.3.1): ticking it reloads the grid without the OB library numbers.
  const notInOb = win.getByRole('checkbox', { name: 'Search Not In OB' });
  await expect(notInOb).not.toBeChecked();
  const listed = page.waitForResponse(
    (r) => r.url().endsWith('/master/book-master/list') && r.request().method() === 'POST',
  );
  await notInOb.check();
  const response = await listed;
  expect(response.request().postDataJSON()).toMatchObject({ params: { SearchNotInOB: true } });
  const rows = (await response.json()) as { txtBookTran: string | null }[];
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.some((r) => /OB/i.test(r.txtBookTran ?? ''))).toBe(false);
  await expect(grid(page).cell(0, 'txtBookName')).not.toBeEmpty({ timeout: 30_000 });
  // EnableDisableDataEditing: the boxes are read-only until New or Modify.
  await expect(win.getByLabel('Book Name')).toHaveAttribute('readonly', '');
});

test('adds a book with a language, gives it a library number, then refuses to delete it', async ({
  page,
}) => {
  const win = await openScreen(page);
  await expect(grid(page).cell(0, 'txtBookName')).not.toBeEmpty({ timeout: 30_000 });
  await win.getByRole('button', { name: 'New' }).click();
  const name = `Zzqweb book ${Date.now() % 100000}`;
  await win.getByLabel('Book Name').fill(name);

  // Bhasha: the popup opens with one row; F2 in its cell lists the languages.
  await win.getByLabel('BhasTran').press('F2');
  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'bhasa_attr' })).toBeVisible();
  // (The list starts with blank languages: search for one.)
  await popup.getByRole('grid').press('F2');
  const languages = page.getByRole('listbox', { name: 'bhasa_attr' });
  await expect(languages.getByRole('option').nth(1)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Search bhasa_attr').fill('अपभ्रंश');
  await page.getByLabel('Search bhasa_attr').press('Enter');
  await expect(languages).toBeHidden();
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toBeHidden();
  await expect(win.getByLabel('BhasTran')).not.toHaveValue('');

  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
  const g = grid(page);
  await expect(g.cell(0, 'txtBookName')).toContainText(name);
  await expect(g.cell(0, 'txtBhasha')).not.toBeEmpty();

  // Library No (F2): frmBookTranNew over the book's rows. Series' F2 fills the next number.
  await g.cell(0, 'txtBookName').click();
  await expect(win.getByLabel('Book Name')).toHaveValue(name);
  await win.getByLabel('BookTran', { exact: true }).press('F2');
  const bookT = dialog(page, 'Book Tran');
  await expect(bookT).toBeVisible();
  // Adding the book gave it one blank BookT row: fill that one in.
  await bookT.getByRole('grid').locator('[row-index="0"] [col-id="tid"]').click();
  await bookT.getByLabel('SeriesKt').press('F2');
  await pickFirstReal(page, 'Series');
  await expect(bookT.getByLabel('Libno', { exact: true })).not.toHaveValue('');
  const libNo = await bookT.getByLabel('Libno', { exact: true }).inputValue();
  await bookT.getByRole('button', { name: 'Save' }).click();
  // Saved at once, without a question; the modification asks for its work type.
  const types = page.getByRole('listbox', { name: 'Work Type' });
  await expect(types.getByRole('option').first()).toBeVisible();
  await page.getByLabel('Search Work Type').fill('Modify');
  await page.getByLabel('Search Work Type').press('Enter');
  await expect(types).toBeHidden();
  await expect(bookT.getByRole('grid').getByText(libNo, { exact: true })).toBeVisible();
  await bookT.getByRole('button', { name: 'Exit' }).click();
  await expect(bookT).toBeHidden();
  await expect(win.getByLabel('BookTran', { exact: true })).toHaveValue(libNo);

  // Delete: CheckInUse refuses while the book has a library number.
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Lib No is in use. Record cannot be deleted', 'OK');
});

test('opens the MS data form from the right-click menu', async ({ page }) => {
  const win = await openScreen(page);
  const g = grid(page);
  await g.cell(0, 'txtBookName').click();
  await expect(win.getByLabel('Book Name')).not.toHaveValue('');
  await g.cell(0, 'txtBookName').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'For Current Record' }).hover();
  await expect(page.getByRole('menuitem', { name: 'Magazine Vishesh' })).toBeVisible();
  await page
    .getByRole('menu', { name: 'For Current Record' })
    .getByRole('menuitem', { name: 'Utility' })
    .hover();
  await page.getByRole('menuitem', { name: 'Add/Edit MS Data' }).click();
  const ms = dialog(page, 'Add/Edit MS Data');
  await expect(ms).toBeVisible();
  await expect(ms.getByText('Hastprat No', { exact: true })).toBeVisible();
  await ms.getByRole('button', { name: 'Exit' }).click();
  await expect(ms).toBeHidden();
});
