import { expect, type Page, test } from '@playwright/test';
import { answer, dialog, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * Library › Kruti Master (frmKrutiMasterNew) in a real browser against the real API and database
 * (inside the e2e server's rolled-back transaction): the designer's layout, a popup, Save, the
 * up-level F2, the tree view and Delete. See docs/screens/kruti-master.md.
 */
useScenario();

async function openScreen(page: Page) {
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Library', 'Kruti Master');
  const win = page.getByRole('region', { name: 'Kruti Master' });
  // The grid holds every kruti (the desktop's FillList has no TOP).
  await expect(grid(page).cell(0, 'extranm')).not.toBeEmpty({ timeout: 60_000 });
  return win;
}

/** Picks the first real row of the open F2 list (row 0 may be frmList1's blank row). */
async function pickFirstReal(page: Page, title: string) {
  const list = page.getByRole('listbox', { name: title });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 60_000 });
  const search = page.getByLabel(`Search ${title}`);
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(list).toBeHidden();
}

async function saveRecord(page: Page) {
  await page
    .getByRole('region', { name: 'Kruti Master' })
    .getByRole('button', { name: 'Save' })
    .click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
}

test('shows the desktop layout, read-only until New', async ({ page }) => {
  const win = await openScreen(page);
  for (const label of [
    'कृति परि. नाम',
    'कर्ता 1/कर्ता 2',
    'रचना सं',
    'वि.क्र.',
    'कृति क्र.',
    'Sampr.',
  ]) {
    await expect(win.locator('span.win-label').getByText(label, { exact: true })).toBeVisible();
  }
  await expect(win.getByRole('checkbox', { name: 'Down Level' })).toBeVisible();
  await expect(win.getByRole('checkbox', { name: 'NSMP' })).toBeVisible();
  await expect(win.getByRole('checkbox', { name: 'Dummy' })).toBeVisible();
  await expect(win.getByLabel('extranm')).toHaveAttribute('readonly', '');
  // txtRsamvatvir, txtRachnaSadi and txtextraid2 are Enabled = False.
  await expect(win.getByLabel('Rsamvatvir')).toBeDisabled();
  await expect(win.getByRole('columnheader', { name: 'कृतिनाम' })).toBeVisible();
});

test('adds a kruti, links an up level with F2, shows it in the tree, and deletes it', async ({
  page,
}) => {
  const win = await openScreen(page);
  await win.getByRole('button', { name: 'New' }).click();
  // btnNew_Click: the next KrutiNo.
  await expect(win.getByLabel('KrutiNo', { exact: true })).not.toHaveValue('');
  const name = `Zzqweb kruti ${Date.now() % 100000}`;
  await win.getByLabel('extranm').fill(name);
  await win.getByRole('checkbox', { name: 'Down Level' }).check();

  // Bhasha: F2 opens its popup; F2 in the cell lists the languages.
  await win.getByLabel('BhashaTran').press('F2');
  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'bhashaname' })).toBeVisible();
  await popup.getByRole('grid').press('F2');
  const languages = page.getByRole('listbox', { name: 'bhashaname' });
  await expect(languages.getByRole('option').nth(1)).toBeVisible({ timeout: 30_000 });
  // "/" searches the list's second column (the language's full name).
  await page.getByLabel('Search bhashaname').fill('/अपभ्रंश');
  await page.getByLabel('Search bhashaname').press('Enter');
  await expect(languages).toBeHidden();
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toBeHidden();
  await expect(win.getByLabel('BhashaTran')).not.toHaveValue('');

  await saveRecord(page);
  const g = grid(page);
  await expect(g.cell(0, 'extranm')).toContainText(name);
  await expect(g.cell(0, 'Bhasha')).not.toBeEmpty();

  // वि.क्र.: Modify, then F2 asks how to list, picks an up level, asks for more.
  await g.cell(0, 'extranm').click();
  await expect(win.getByLabel('extranm')).toHaveValue(name);
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('krutiRelTran').press('F2');
  await answer(page, 'select by KrutiName ?', 'No');
  await pickFirstReal(page, 'Link UpperLevel Kruti');
  await answer(page, 'Do You Want To Add More Records?', 'No');
  await expect(win.getByLabel('krutiRelTran')).toHaveValue(/^\(\d+\)/);
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
  // (No Work Type question: insertworkreports skips a record this user added since yesterday.)
  await expect(win.getByLabel('krutiRelTran')).toHaveValue(/^\(\d+\)/);

  // Utility › Show In Treeview › Up Level: the up level with this kruti below it.
  await g.cell(0, 'extranm').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Utility', exact: true }).last().hover();
  await page.getByRole('menuitem', { name: 'Show In Treeview' }).hover();
  await page.getByRole('menuitem', { name: 'Up Level' }).click();
  const tree = page.getByRole('tree', { name: 'Kruti Level' });
  await expect(tree).toBeVisible();
  await tree.getByRole('button', { name: 'Expand' }).first().click();
  await expect(tree.getByText(name, { exact: false })).toBeVisible();
  await tree.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Utility', exact: true }).last().hover();
  await page.getByRole('menuitem', { name: 'Show In Grid' }).click();
  await expect(tree).toBeHidden();

  // Delete: refused while it still has an up level.
  await g.cell(0, 'extranm').click();
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, /Delete the Kruti No \d+ Kruti Name :- /, 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  // v3.4.3.1: every reason in one message.
  await answer(page, /KrutiMstKm - \d+ is used in वि\.क्र\./, 'OK');
});

test('v3.4.3.1: the renamed menu, and Filter › Show Records By Work', async ({ page }) => {
  // The whole list (every kruti) is loaded twice here.
  test.setTimeout(150_000);
  const win = await openScreen(page);
  // A kruti added now has a work report of today.
  await win.getByRole('button', { name: 'New' }).click();
  await expect(win.getByLabel('KrutiNo', { exact: true })).not.toHaveValue('');
  const name = `Zzqweb work ${Date.now() % 100000}`;
  await win.getByLabel('extranm').fill(name);
  await saveRecord(page);
  const g = grid(page);
  await expect(g.cell(0, 'extranm')).toContainText(name);

  await g.cell(0, 'extranm').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Show For Selected  Kruti' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'For Selected  Kruti' }).hover();
  await expect(page.getByRole('menuitem', { name: 'TirthRaksha Master' })).toBeVisible();
  // Replace Records is for IsAdmin and AMaster; Lock / Unlock By Admin left the menu.
  await expect(page.getByRole('menuitem', { name: 'Replace Records' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Utility', exact: true }).first().hover();
  await expect(page.getByRole('menuitem', { name: 'Append Remark' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Lock By Admin' })).toHaveCount(0);
  // AdminLockToolStrip is for AMaster only.
  await expect(win.getByRole('button', { name: 'Lock By Admin' })).toHaveCount(0);

  await page.getByRole('menuitem', { name: 'Filter', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Show Records By Work' }).click();
  const filter = dialog(page, 'Kruti Work Filter');
  await expect(filter).toBeVisible();
  // Both DateTimePickers start on today.
  await expect(filter.getByLabel('Work From Date')).toHaveValue(scenario.today);
  await expect(filter.getByLabel('Work To Date')).toHaveValue(scenario.today);
  // txtWorkType opens its list on any key; the box shows the chosen names.
  await filter.getByLabel('Work Type').press('a');
  const types = page.getByRole('listbox', { name: 'Work Type' });
  await expect(types.getByRole('option').nth(1)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Search Work Type').fill('New');
  await page.getByLabel('Search Work Type').press('Enter');
  await expect(types).toBeHidden();
  await expect(filter.getByLabel('Work Type')).toHaveValue(/New/);
  // txtWorkDoneBy only on F2.
  await filter.getByLabel('Work Done By').press('a');
  await expect(page.getByRole('listbox', { name: 'Work Done By' })).toHaveCount(0);
  await filter.getByRole('button', { name: 'Save' }).click();
  await expect(filter).toBeHidden();
  // The grid now holds the krutis worked on today; Refresh brings the whole list back.
  await expect(g.cell(0, 'extranm')).toContainText(name);
  await expect(g.cell(1, 'extranm')).toHaveCount(0);
  await win.getByRole('button', { name: 'Refresh' }).click();
  await expect(g.cell(1, 'extranm')).toHaveCount(1, { timeout: 60_000 });
});

test('v3.4.3.1: Lock / Unlock By Admin are panel buttons for AMaster, password asked once', async ({
  page,
}) => {
  await login(page, scenario.users.amaster);
  await openMenuItem(page, 'Library', 'Kruti Master');
  const win = page.getByRole('region', { name: 'Kruti Master' });
  const g = grid(page);
  await expect(g.cell(0, 'extranm')).not.toBeEmpty({ timeout: 60_000 });
  await g.cell(0, 'extranm').click();

  await win.getByRole('button', { name: 'Lock By Admin', exact: true }).click();
  await answer(page, 'Are You Sure To Lock Selected Records?', 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-kruti-lock-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, /\(\d+ \) Records Locked Successfully/, 'OK');

  // boolAskForAdminLockPassword: not asked again in this window.
  await win.getByRole('button', { name: 'Unlock By Admin', exact: true }).click();
  await answer(page, 'Are You Sure To Unlock Selected Records?', 'Yes');
  await answer(page, /\(\d+ \) Records UnLocked Successfully/, 'OK');
  await expect(security).toHaveCount(0);

  // Replace Records is in the menu for AMaster.
  await g.cell(0, 'extranm').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'For Selected  Kruti' }).hover();
  await page.getByRole('menuitem', { name: 'Replace Records' }).hover();
  await expect(page.getByRole('menuitem', { name: 'कृति परि. नाम' })).toBeVisible();
});
