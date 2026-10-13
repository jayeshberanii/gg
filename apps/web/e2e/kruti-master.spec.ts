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
  await answer(page, 'Records in used anthor plase !', 'OK');
});
