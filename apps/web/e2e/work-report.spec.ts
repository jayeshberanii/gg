import { expect, type Page, test } from '@playwright/test';
import { answer, dmy, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * Employee › Work Report (frmWorkReportM): the read-only WorkReportM list, in a real browser
 * against the real API and database. e2e-server.mjs seeds two entries by `fresh` on their last
 * working day, one with old and new values.
 */
useScenario();

async function openScreen(page: Page) {
  await login(page, scenario.users.fresh);
  await answer(page, /Last LogIn Date/, 'OK');
  await openMenuItem(page, 'Employee', 'Work Report');
  return page.getByRole('region', { name: 'Work Report' });
}

test('lists your entries for the last month, with the date range in lblEntry', async ({ page }) => {
  const win = await openScreen(page);
  const g = grid(page);
  await expect(g.cell(0, 'TableName')).toHaveText('bhasmast');
  await expect(g.cell(1, 'TableName')).toHaveText('bhasmast');
  await expect(g.cell(0, 'WorkDate')).toHaveText(dmy(scenario.lastWorkingDay));
  await expect(g.cell(0, 'alterTime')).toHaveText('10:15:30');
  await expect(win.getByLabel('Total Records')).toHaveText('2');
  await expect(win.getByRole('toolbar', { name: 'Record' })).toContainText(
    `-${dmy(scenario.today, '/')}`,
  );
  // No field panel; Refresh reloads the same rows.
  await expect(win.getByRole('textbox', { name: 'Name' })).toHaveCount(0);
  await win.getByRole('button', { name: 'Refresh' }).click();
  await expect(win.getByLabel('Total Records')).toHaveText('2');
});

test('Compare Data shows the old and new values; Display Count groups the day', async ({
  page,
}) => {
  const win = await openScreen(page);
  const changed = win.getByRole('gridcell', { name: 'brief(Old brief)=1' });
  await changed.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Compare Data' }).click();
  const popup = page.getByRole('grid', { name: 'Popup' });
  await expect(popup.getByRole('gridcell', { name: '(Old brief)' })).toBeVisible();
  await expect(popup.getByRole('gridcell', { name: '(New brief)' })).toBeVisible();
  // clsCommon.DataGridView_KeyDown on frmPopup's grid: F3 shows the current cell in
  // frmBixtextbox, without Save (dgResult is ReadOnly).
  await popup.getByRole('gridcell', { name: '(New brief)' }).click();
  await page.keyboard.press('F3');
  const big = page.getByRole('dialog').last();
  await expect(big.getByRole('textbox')).toHaveValue('(New brief)');
  await expect(big.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await big.getByText('Close', { exact: true }).click();
  await expect(popup.getByRole('gridcell', { name: '(New brief)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();

  const g = grid(page);
  await g.cell(0, 'TableName').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Display Count' }).click();
  await expect(win.getByLabel('Total Records')).toHaveText('1');
  // The detail rows leave as the grouped one arrives; wait for just the one.
  await expect(g.cell(0, 'Qty')).toHaveCount(1);
  await expect(g.cell(0, 'Qty')).toHaveText('2');

  await g.cell(0, 'TableName').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Display Count' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Display Full Report' }).click();
  await expect(win.getByLabel('Total Records')).toHaveText('2');
});

test('Show in › Bhash Master opens the changed record', async ({ page }) => {
  const win = await openScreen(page);
  const g = grid(page);
  const recordNo = await g.cell(0, 'RecordNo').innerText();
  await g.cell(0, 'TableName').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Show in' }).hover();
  await page.getByRole('menuitem', { name: 'Bhash Master' }).click();
  const bhasha = page.getByRole('region', { name: 'Bhasha Master' });
  await expect(bhasha.getByLabel('Total Records')).toHaveText('1');
  await expect(
    bhasha.getByRole('grid').locator('[row-index="0"] [col-id="bhashacokm"]'),
  ).toHaveText(recordNo);
  await expect(win).toBeHidden();
});
