import { expect, type Page, test } from '@playwright/test';
import { answer, dialog, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * Plan Batch B in a real browser against the real API and database (inside the e2e server's
 * rolled-back transaction): Employee Master, Leaves, Old Log Reports. See their docs/screens notes.
 */
useScenario();

async function open(page: Page, user: string, menu: string, item: string, title = item) {
  await login(page, user);
  await openMenuItem(page, menu, item);
  return page.getByRole('region', { name: title });
}

async function save(page: Page, win: ReturnType<Page['getByRole']>) {
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
}

test('Employee Master: an admin adds, edits and deletes an employee', async ({ page }) => {
  const win = await open(page, scenario.users.admin, 'Employee', 'Employee Master');
  const g = grid(page);
  await expect(g.cell(0, 'tid')).toBeVisible();

  const name = `Zzq e2e emp ${Date.now() % 100000}`;
  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('Employee Name').fill(name);
  await win.getByLabel('User Name').fill('zzqe2eemp');
  const password = win.getByLabel('Password', { exact: true });
  await password.fill('e2ePw1');
  await expect(password).toHaveAttribute('type', 'password');
  await win.getByRole('checkbox', { name: 'Show Password' }).check();
  await expect(password).toHaveAttribute('type', 'text');
  await win.getByLabel('Working Hrs').fill('');
  await win.getByLabel('Working Hrs').pressSequentially('08:30');

  // Reporting To opens its popup (frmDisplayTransNew).
  await win.getByLabel('Reporting To').press('F2');
  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'ReportingToName' })).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'ReportingToKt' })).toHaveCount(0);
  await popup.getByRole('button', { name: 'Close' }).click();
  await expect(popup).toBeHidden();

  await save(page, win);
  await expect(g.cell(0, 'Employee_Name')).toHaveText(name);
  // The grid never carries the password.
  await expect(page.getByRole('grid')).not.toContainText('e2ePw1');
  await expect(password).toHaveValue('e2ePw1');

  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Employee Name').fill(`${name} x`);
  await save(page, win);
  const types = page.getByRole('listbox', { name: 'Work Type' });
  await expect(types.getByRole('option').first()).toBeVisible();
  await page.getByLabel('Search Work Type').fill('Modify');
  await page.getByLabel('Search Work Type').press('Enter');
  await expect(types).toBeHidden();
  await expect(g.cell(0, 'Employee_Name')).toHaveText(`${name} x`);

  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Record Deleted', 'OK');
  await expect(page.getByRole('grid')).not.toContainText(name);
});

test('Employee Master: a non-privileged user sees and edits only their own row', async ({
  page,
}) => {
  const win = await open(page, scenario.users.reporter, 'Employee', 'Employee Master');
  const g = grid(page);
  await expect(g.cell(0, 'tid')).toBeVisible();
  await expect(g.cell(1, 'tid')).toHaveCount(0);
  await g.cell(0, 'tid').click();
  await expect(win.getByLabel('User Name')).toHaveValue(scenario.users.reporter);
  const bar = win.getByRole('toolbar', { name: 'Record' });
  await expect(bar.getByRole('button', { name: 'New' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Modify' })).toBeEnabled();
  // Their own password, behind the Show Password box; no Working Hrs, User Type or Active.
  await expect(win.getByLabel('Password', { exact: true })).toHaveValue(scenario.password);
  await expect(win.getByRole('checkbox', { name: 'Show Password' })).toBeVisible();
  await expect(win.getByLabel('Working Hrs')).toBeDisabled();
  await expect(win.getByLabel('User Type')).toBeDisabled();
  await expect(win.getByRole('checkbox', { name: 'Active' })).toBeDisabled();
  // No Utility menu for them.
  await g.cell(0, 'tid').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Record' });
  await expect(menu.getByRole('menuitem', { name: 'Print Report' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Utility' })).toHaveCount(0);
});

/** Picks the first real row of the open F2 list (row 0 is frmList1's blank row). */
async function pickFirstReal(page: Page, title: string) {
  const list = page.getByRole('listbox', { name: title });
  await expect(list.getByRole('option').nth(1)).toBeVisible();
  const search = page.getByLabel(`Search ${title}`);
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(list).toBeHidden();
}

/** Leaves: a new leave from Mon 03-03-2031 to Sun 09-03-2031, saved. */
async function addLeave(page: Page, win: ReturnType<Page['getByRole']>, user: string) {
  const bar = win.getByRole('toolbar', { name: 'Record' });
  // An empty grid starts in New (frmLeaveM_Load).
  if (await bar.getByRole('button', { name: 'New' }).isEnabled())
    await bar.getByRole('button', { name: 'New' }).click();
  await expect(win.getByLabel('Requested By')).toHaveValue(user);
  await expect(win.getByLabel('Leave Status')).toHaveValue('Pending');
  await expect(win.getByLabel('Leave Status')).toBeDisabled();
  await expect(win.getByLabel('Total Days')).toBeDisabled();
  await expect(win.getByLabel('Comment')).toBeDisabled();
  await expect(win.getByLabel('Hour')).toBeVisible();
  await win.getByLabel('Leave From').fill('2031-03-03');
  await win.getByLabel('Leave To').fill('2031-03-09');
  // GetTotalDays: the Sunday does not count.
  await expect(win.getByLabel('Total Days')).toHaveValue('6');
  await win.getByLabel('Leave Type').press('F2');
  await pickFirstReal(page, 'Leave Type');
  await expect(win.getByLabel('Leave Type')).not.toHaveValue('');
  await win.getByLabel('Reason').fill('e2e leave');
  await save(page, win);
  const g = grid(page);
  await expect(g.cell(0, 'EmployeeName')).toHaveText(user);
  await expect(g.cell(0, 'TotalDays')).toHaveText('6');
  await expect(g.cell(0, 'LeaveStatusName')).toHaveText('Pending');
  await expect(g.cell(0, 'LeaveFromDate')).toHaveText('03-03-2031');
}

test('Leaves: an operator adds a leave but cannot change or approve it', async ({ page }) => {
  // An Operator (user type 3); this one is first shown the last login date.
  await login(page, scenario.users.fresh);
  await answer(page, /Last LogIn Date/, 'OK');
  await openMenuItem(page, 'Employee', 'Leaves');
  const win = page.getByRole('region', { name: 'Leaves' });
  await addLeave(page, win, scenario.users.fresh);
  const g = grid(page);
  await g.cell(0, 'EmployeeName').click();
  await expect(win.getByLabel('Reason')).toHaveValue('e2e leave');
  const bar = win.getByRole('toolbar', { name: 'Record' });
  await expect(bar.getByRole('button', { name: 'New' })).toBeEnabled();
  await expect(bar.getByRole('button', { name: 'Modify' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await g.cell(0, 'EmployeeName').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Record' });
  await menu.getByRole('menuitem', { name: 'Utility' }).hover();
  await expect(menu.getByRole('menuitem', { name: 'Show Leaves Between Dates' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Approve Leave' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Reject Leave' })).toHaveCount(0);
});

test('Leaves: user type 1 modifies a leave, filters by dates, and cannot delete', async ({
  page,
}) => {
  const win = await open(page, scenario.users.reporter, 'Employee', 'Leaves');
  await addLeave(page, win, scenario.users.reporter);
  const g = grid(page);
  await g.cell(0, 'EmployeeName').click();
  const bar = win.getByRole('toolbar', { name: 'Record' });
  await bar.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Leave To').fill('2031-03-05');
  await expect(win.getByLabel('Total Days')).toHaveValue('3');
  await save(page, win);
  await expect(g.cell(0, 'TotalDays')).toHaveText('3');

  await bar.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Delete Facility is not Available', 'OK');

  // No Approve for an Admin user type; Show Leaves Between Dates asks for a range.
  await g.cell(0, 'EmployeeName').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Record' });
  await menu.getByRole('menuitem', { name: 'Utility' }).hover();
  await expect(menu.getByRole('menuitem', { name: 'Approve Leave' })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Show Leaves Between Dates' }).click();
  const box = page.getByRole('dialog', { name: 'Library' });
  await box.getByRole('textbox').fill('04/03/2031-04/03/2031');
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(g.cell(0, 'TotalDays')).toHaveText('3');
  await expect(g.cell(1, 'TotalDays')).toHaveCount(0);
});

test('Old Log Reports: modes, search, F2 and the right-click menu for an Admin user type', async ({
  page,
}) => {
  const win = await open(page, scenario.users.admin, 'Employee', 'Old Log Reports');
  await expect(win.getByText('Employee Work Report')).toBeVisible();
  await expect(win.getByText(/^Total Records : \d+$/)).toBeVisible();

  // The seeded `fresh` user logged a full day with one work entry on the last working day.
  await win.getByLabel('From Date').fill(scenario.threeBack);
  await win.getByLabel('To Date').fill(scenario.lastWorkingDay);
  await win.getByRole('button', { name: 'Show Report' }).click();
  const fresh = scenario.users.fresh;
  await expect(page.getByRole('grid')).toContainText(fresh);
  const vibhagHeader = win.getByRole('columnheader', { name: 'Vibhag', exact: true });
  await expect(vibhagHeader).toBeVisible();

  // Short Report only for Datewise / Userwise; picking Vibhagwise falls back to Full.
  const shortRadio = win.getByRole('radio', { name: 'Short Report' });
  await shortRadio.check();
  await win.getByLabel('Reports Type').selectOption('Vibhagwise');
  await expect(shortRadio).toBeDisabled();
  await expect(win.getByRole('radio', { name: 'Full Report' })).toBeChecked();
  await win.getByLabel('Reports Type').selectOption('Userwise');
  await expect(shortRadio).toBeEnabled();
  await shortRadio.check();
  await win.getByRole('button', { name: 'Show Report' }).click();
  await expect(vibhagHeader).toHaveCount(0);
  await expect(win.getByRole('columnheader', { name: 'User' })).toBeVisible();
  await expect(win.getByRole('columnheader', { name: 'Total Gap Time' })).toBeVisible();

  // Search by User: contains, then an exact comma list (which threw on the desktop).
  await win.getByLabel('Search By').selectOption('User');
  const search = win.getByLabel('Search', { exact: true });
  const theGrid = page.getByRole('grid');
  await search.fill(fresh.slice(0, -1));
  await expect(theGrid).not.toContainText(scenario.users.absent);
  await expect(theGrid.getByRole('gridcell', { name: fresh })).toHaveCount(1);
  await search.fill(`nobody-at-all, ${fresh}`);
  await expect(theGrid.getByRole('gridcell', { name: fresh })).toHaveCount(1);
  await search.fill('no-such-user-zz');
  await expect(theGrid.getByRole('gridcell', { name: fresh })).toHaveCount(0);

  // F2: the users with a log; picking one filters to them and updates the count.
  await search.fill('');
  await search.press('F2');
  const users = page.getByRole('listbox', { name: 'User' });
  await expect(users.getByRole('option').nth(1)).toBeVisible();
  await page.getByLabel('Search User').fill(fresh);
  await page.getByLabel('Search User').press('Enter');
  await expect(users).toBeHidden();
  await expect(search).toHaveValue(fresh);
  await expect(win.getByText('Total Records : 1', { exact: true })).toBeVisible();

  // Right-click: an Admin user type sees all three items. Send To Work Report opens that
  // user's work report entries of the clicked row's day.
  await expect(theGrid).not.toContainText(scenario.users.absent);
  await theGrid.getByRole('gridcell', { name: fresh }).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Log Report' });
  await expect(menu.getByRole('menuitem', { name: 'Send To Excel' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Send To Log Report' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Send To Work Report' }).click();
  const workReport = page.getByRole('region', { name: 'Work Report' });
  await expect(workReport).toBeVisible();
  await expect(workReport.getByRole('grid')).toContainText('bhasmast');
});

test('Old Log Reports: an operator sees only their own logs and a shorter menu', async ({
  page,
}) => {
  await login(page, scenario.users.fresh);
  await answer(page, /Last LogIn Date/, 'OK');
  await openMenuItem(page, 'Employee', 'Old Log Reports');
  const win = page.getByRole('region', { name: 'Old Log Reports' });
  await win.getByLabel('From Date').fill(scenario.threeBack);
  await win.getByLabel('To Date').fill(scenario.lastWorkingDay);
  await win.getByRole('button', { name: 'Show Report' }).click();
  const g = grid(page);
  await expect(g.cell(0, 'uname')).toHaveText(scenario.users.fresh);
  // `pending` and `manyPending` logged the same days, but they don't report to `fresh`.
  await expect(page.getByRole('grid')).not.toContainText(scenario.users.pending);

  await g.cell(0, 'uname').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Log Report' });
  await expect(menu.getByRole('menuitem', { name: 'Send To Work Report' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Send To Excel' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Send To Log Report' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await win.getByRole('button', { name: 'Close' }).click();
  await expect(win).toBeHidden();
});
