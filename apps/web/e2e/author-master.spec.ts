import { expect, type Page, test } from '@playwright/test';
import { answer, dialog, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * Master › Author Master (frmAuthorMaster) in a real browser against the real API and
 * database (inside the e2e server's rolled-back transaction): the designer's layout, the F2
 * popups (frmDisplayTransNew), the right-click menu, the work type asked after a modification,
 * and CheckInUse on delete. See docs/screens/author-master.md.
 */
useScenario();

async function openScreen(page: Page) {
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Master', 'Author Master');
  return page.getByRole('region', { name: 'Author Master' });
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

test('shows the desktop layout and starts a new author at the next RecordNo', async ({ page }) => {
  const win = await openScreen(page);
  for (const label of [
    'Name1/Sign',
    'Record/Report No',
    'Done By/Grade',
    'Kruti',
    'Identity/Guru',
    'रेफरन्स',
    'Anya Name2',
  ]) {
    await expect(win.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(win.getByRole('button', { name: 'Ref Samvat' })).toBeVisible();
  await expect(win.getByRole('checkbox', { name: 'Guru' })).toBeVisible();

  await win.getByRole('button', { name: 'New' }).click();
  // Desktop v3.4.3.1: txtSampradaykt.Enabled = False, even while adding.
  await expect(win.getByLabel('Sampradaykt', { exact: true })).toBeDisabled();
  await expect(win.getByLabel('recordno')).not.toHaveValue('');
  await win.getByLabel('recordno').pressSequentially('x');
  await expect(win.getByLabel('recordno')).not.toHaveValue(/x/);
});

test('adds an author through the F2 popups and refuses to delete it while it has an any name', async ({
  page,
}) => {
  const win = await openScreen(page);
  await win.getByRole('button', { name: 'New' }).click();
  const name = `Zzqweb author ${Date.now() % 100000}`;
  await win.getByLabel('Name1').fill(name);

  await win.getByLabel('donebykt').press('F2');
  await pickFirstReal(page, 'donebykt');
  await expect(win.getByLabel('donebykt')).not.toHaveValue('');

  // Anya Name1: the popup opens with one row ready; typing into AnyaName edits the cell.
  await win.getByLabel('AuthMAnyNmTran').press('F2');
  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'AnyaName' })).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'AuthAnyaNmKm' })).toHaveCount(0);
  const gridEl = popup.getByRole('grid');
  await gridEl.press('A');
  await popup.getByLabel('Cell').fill('Alt E2E');
  await popup.getByLabel('Cell').press('Enter');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toBeHidden();
  await expect(win.getByLabel('AuthMAnyNmTran')).toHaveValue('Alt E2E');

  // Guru: F2 on the GuruName cell lists the authors.
  await win.getByLabel('AuthorGuruTran').press('F2');
  await expect(popup).toBeVisible();
  await popup.getByRole('grid').press('F2');
  await pickFirstReal(page, 'GuruName');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(win.getByLabel('AuthorGuruTran')).toHaveValue(/-False$/);

  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
  const g = grid(page);
  await expect(g.cell(0, 'txtauthorname')).toHaveText(`${name}(Alt E2E)`);

  // Right-click › marked as physically checked.
  await g.cell(0, 'txtauthorname').click();
  await g.cell(0, 'txtauthorname').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'marked as physically checked' }).click();
  await answer(page, 'completed marking', 'OK');
  await expect(win.getByLabel('marking')).toHaveValue('PC');

  // Delete: the author's own question, the Security password, then CheckInUse refuses.
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, `Are You Sure to Delete This Author ==> ${name}(Alt E2E)`, 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Record is used in Author AnyName', 'OK');
});

test('asks for the work type after modifying an existing author', async ({ page }) => {
  const win = await openScreen(page);
  const g = grid(page);
  await g.cell(3, 'txtauthorname').click();
  await expect(win.getByLabel('Name1')).not.toHaveValue('');
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('markremark').fill(`e2e ${Date.now() % 1000}`);
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
  const types = page.getByRole('listbox', { name: 'Work Type' });
  await expect(types.getByRole('option').first()).toBeVisible();
  await page.getByLabel('Search Work Type').fill('Modify');
  await page.getByLabel('Search Work Type').press('Enter');
  await expect(types).toBeHidden();
});

test('Author Type Master: no Attribute box or column, IsPrint beside the toolbar (v3.4.3.1)', async ({
  page,
}) => {
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Master', 'Author Type Master');
  const win = page.getByRole('region', { name: 'Author Type Master' });
  await expect(win.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(win.getByText('Attribute', { exact: true })).toHaveCount(0);
  await expect(win.getByRole('columnheader', { name: 'AuthAttr' })).toHaveCount(0);
  await expect(win.getByRole('columnheader', { name: 'Brief' })).toBeVisible();
  const isPrint = win.getByRole('checkbox', { name: 'IsPrint' });
  await expect(isPrint).toBeVisible();
  // On the toolbar strip, above the panel's first box.
  const boxTop = (await win.getByLabel('Name', { exact: true }).boundingBox())!.y;
  expect((await isPrint.boundingBox())!.y).toBeLessThan(boxTop);
});
