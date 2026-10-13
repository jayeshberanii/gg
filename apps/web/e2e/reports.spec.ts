import { expect, type Page, test } from '@playwright/test';
import { dialog, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * The report window (features/report/ReportView, the web's frmWebBrowser): a report page of
 * the desktop's companion web site, built by the API. See docs/screens/reports.md.
 */
useScenario();

/** window.print() is counted instead of opening the browser's dialog. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
});
const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { printed: number }).printed);

test('Author Master: Kruti Author Check opens the report window; Print, Save, Refresh, Exit', async ({
  page,
}) => {
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Master', 'Author Master');
  const first = grid(page).cell(0, 'txtauthorname');
  await expect(first).toBeVisible({ timeout: 60_000 });

  await first.click();
  await first.click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Record' })
    .getByRole('menuitem', { name: 'Print Report', exact: true })
    .hover();
  await page
    .getByRole('menu', { name: 'Print Report' })
    .getByRole('menuitem', { name: 'Kruti Author Check', exact: true })
    .click();

  const report = dialog(page, 'PrintAuthorDetail');
  await expect(report).toBeVisible({ timeout: 60_000 });
  const body = report.getByLabel('PrintAuthorDetail report');
  await expect(body.getByRole('cell', { name: 'Author Name', exact: true })).toBeVisible();
  await expect(body.getByRole('cell', { name: /^RecordNo - / })).toBeVisible();

  // Print hands the browser a copy of the page under <body>, the only thing it prints.
  const toolbar = report.getByRole('toolbar', { name: 'Report' });
  expect(await printed(page)).toBe(0);
  await toolbar.getByRole('button', { name: 'Print' }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(page.locator('body > #print-report table.report-table')).toHaveCount(1);

  // Save: the page as an .html file of its own.
  const download = page.waitForEvent('download');
  await toolbar.getByRole('button', { name: 'Save' }).click();
  expect((await download).suggestedFilename()).toBe('PrintAuthorDetail.html');

  // Refresh runs the report again; Exit closes the window and removes the print copy.
  await toolbar.getByRole('button', { name: 'Refresh' }).click();
  await expect(body.getByRole('cell', { name: 'Author Name', exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Exit' }).click();
  await expect(report).toBeHidden();
  await expect(page.locator('#print-report')).toHaveCount(0);
});
