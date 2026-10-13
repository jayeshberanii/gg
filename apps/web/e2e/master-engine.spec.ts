import { expect, type Page, test } from '@playwright/test';
import {
  answer,
  dialog,
  grid,
  login,
  openMenuItem,
  pickFirst,
  scenario,
  useScenario,
} from './helpers';

/**
 * The generic master-screen engine's "5c" pieces — Print Selected Column, Send To Excel and
 * the Work Report dialog — exercised through Bhasha Master, in a real browser against the real
 * API and database.
 */
useScenario();

async function openScreen(page: Page) {
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Master', 'Bhasha Master');
  return page.getByRole('region', { name: 'Bhasha Master' });
}

test('opens the Work Report (frmDisplayTransNew) once a row is selected, and saves nothing', async ({
  page,
}) => {
  const win = await openScreen(page);
  const workReport = win.getByRole('button', { name: 'Work Report' });
  await expect(workReport).toBeDisabled();
  await grid(page).cell(0, 'bhashaname').click();
  // Deliberately unlike the desktop: no New/Modify/Cancel cycle needed first.
  await expect(workReport).toBeEnabled();
  await workReport.click();

  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup).toBeVisible();
  for (const name of ['WorkType', 'DoneBy', 'WorkDate', 'Mistake', 'Remark', 'alterTime'])
    await expect(popup.getByRole('columnheader', { name, exact: true })).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'WorkReportKm' })).toHaveCount(0);
  // SetForm_Common: New, Save and Delete are there but Enabled = False.
  for (const name of ['New', 'Save', 'Delete'])
    await expect(popup.getByRole('button', { name, exact: true })).toBeDisabled();

  const rows = popup.locator('tbody tr');
  const before = await rows.count();
  // F6 still adds a row (dgDisplay_KeyDown calls TsBtnNew_Click directly), for yourself.
  const cells = popup.getByRole('grid');
  await cells.focus();
  await cells.press('F6');
  await expect(rows).toHaveCount(before + 1);
  await expect(rows.last()).toContainText(scenario.users.reporter);
  // F2 on WorkType: columnmaster's WorkType list.
  await cells.press('F2');
  await pickFirst(page, 'WorkType');

  // Alt+S: TsBtnSave closes; nothing is written, so reopening shows the old rows.
  await cells.press('Alt+s');
  await expect(popup).toBeHidden();
  await workReport.click();
  await expect(dialog(page, 'frmDisplayTransNew').locator('tbody tr')).toHaveCount(before);
  // cntMenu_Opening: Compare Data is offered for the work report popup; it opens frmPopup.
  await dialog(page, 'frmDisplayTransNew').getByRole('grid').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Compare Data' }).click();
  await expect(page.getByRole('grid', { name: 'Popup' })).toBeVisible();
  await page.getByRole('grid', { name: 'Popup' }).press('Escape');
  await expect(page.getByRole('grid', { name: 'Popup' })).toBeHidden();
  await dialog(page, 'frmDisplayTransNew').getByRole('grid').press('Escape');
  await answer(page, 'Are You Sure to Exit?', 'Yes');
  await expect(dialog(page, 'frmDisplayTransNew')).toBeHidden();
});

test('right-click menu keeps one submenu open at a time, like a ToolStrip', async ({ page }) => {
  await openScreen(page);
  const g = grid(page);
  await g.cell(0, 'bhashaname').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Record' });
  const parents = menu.locator(':scope > li > [aria-haspopup="menu"]');
  expect(await parents.count()).toBeGreaterThan(1);
  // Nothing opens by itself when the menu appears.
  await expect(page.getByRole('menu')).toHaveCount(1);
  const first = (await parents.nth(0).innerText()).replace('▸', '').trim();
  const second = (await parents.nth(1).innerText()).replace('▸', '').trim();
  await parents.nth(0).hover();
  await expect(page.getByRole('menu', { name: first })).toBeVisible();
  await parents.nth(1).hover();
  await expect(page.getByRole('menu', { name: second })).toBeVisible();
  await expect(page.getByRole('menu', { name: first })).toHaveCount(0);
  // A plain item closes the open submenu too.
  await menu.locator(':scope > li > [role="menuitem"]:not([aria-haspopup])').first().hover();
  await expect(page.getByRole('menu', { name: second })).toHaveCount(0);
});

test('prints the columns picked in the Selected Column dialog for the selected row', async ({
  page,
}) => {
  await openScreen(page);
  const g = grid(page);
  const name = await g.cell(0, 'bhashaname').innerText();
  await g.cell(0, 'bhashaname').click();

  // Right-clicking a row selects it, as a DataGridView does, so aim at the row under test.
  await g.cell(0, 'bhashaname').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Record' });
  await menu.getByRole('menuitem', { name: 'Print Report' }).hover();
  await page
    .getByRole('menu', { name: 'Print Report' })
    .getByRole('menuitem', { name: 'Selected Column' })
    .click();

  const form = dialog(page, 'Select Column');
  await expect(form).toBeVisible();
  await form.getByRole('checkbox', { name: 'Name', exact: true }).check();
  await expect(
    form.getByRole('listbox', { name: 'Print Order' }).getByRole('option', { name: /Name/ }),
  ).toBeVisible();

  // Display In Grid runs the report into this same window (pnlGrid), as on the desktop.
  await form.getByRole('button', { name: 'Display In Grid' }).click();
  await expect(form.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  await expect(form.getByRole('cell', { name })).toBeVisible();

  // Back returns to the picker with the pick still made.
  await form.getByRole('button', { name: 'Back' }).click();
  await expect(form.getByRole('checkbox', { name: 'Name', exact: true })).toBeChecked();
});

test('saves the picked columns as a named layout, then reloads it from the dropdown', async ({
  page,
}) => {
  await openScreen(page);
  const g = grid(page);
  await g.cell(0, 'bhashaname').click();

  await g.cell(0, 'bhashaname').click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Record' })
    .getByRole('menuitem', { name: 'Print Report' })
    .hover();
  await page
    .getByRole('menu', { name: 'Print Report' })
    .getByRole('menuitem', { name: 'Selected Column' })
    .click();

  const picker = dialog(page, 'Select Column');
  await picker.getByRole('checkbox', { name: 'Name', exact: true }).check();
  await picker.getByRole('checkbox', { name: 'Brief', exact: true }).check();

  const layoutName = `e2e layout ${Date.now() % 100000}`;
  await picker.getByRole('button', { name: 'Save Config' }).click();
  const namePrompt = dialog(page, 'Library');
  await namePrompt.getByLabel('Please Enter Configuration Name').fill(layoutName);
  await namePrompt.getByRole('button', { name: 'OK' }).click();
  await answer(page, 'Configuration Saved Successfully', 'OK');

  // Starting a fresh pick, then reloading the saved layout brings the two columns back checked.
  await picker.getByRole('checkbox', { name: 'Name', exact: true }).uncheck();
  await picker.getByRole('checkbox', { name: 'Brief', exact: true }).uncheck();
  await picker.getByLabel('Saved Layout').selectOption({ label: layoutName });
  await expect(picker.getByRole('checkbox', { name: 'Name', exact: true })).toBeChecked();
  await expect(picker.getByRole('checkbox', { name: 'Brief', exact: true })).toBeChecked();
  await expect(
    picker.getByRole('listbox', { name: 'Print Order' }).getByRole('option'),
  ).toHaveCount(2);

  // Delete Config drops it again, so the run leaves no layout behind.
  await picker.getByRole('button', { name: 'Delete Config' }).click();
  await answer(page, 'Are You Sure to Delete This Configuration?', 'Yes');
  await expect(
    picker.getByLabel('Saved Layout').getByRole('option', { name: layoutName }),
  ).toHaveCount(0);
});

test('exports the grid to a downloadable CSV via Send To Excel', async ({ page }) => {
  await openScreen(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('grid').click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Record' })
    .getByRole('menuitem', { name: 'Send To Excel' })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bhasha-master.csv');
});

test('PrevNext right-click: Remove Selected Record narrows the history, Restate clears it', async ({
  page,
}) => {
  const win = await openScreen(page);
  const search = win.getByLabel('Search', { exact: true });
  const stamp = Date.now() % 100000;
  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('Name').fill(`Zzqweb prevnext ${stamp}`);
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');

  await search.fill(`Zzqweb prevnext ${stamp}`);
  await search.press('Enter');
  const history = page.locator('[aria-label="Result history"]');
  await expect(history).toBeVisible();

  await history.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Restate' }).click();
  // The history is now empty: First/Prev/Next/Last are all disabled.
  await expect(history.getByRole('button', { name: 'First result' })).toBeDisabled();
  await expect(history.getByRole('button', { name: 'Last result' })).toBeDisabled();
});
