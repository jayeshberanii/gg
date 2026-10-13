import { expect, test } from '@playwright/test';
import { answer, API, dialog, dmy, grid, login, pickFirst, scenario, useScenario } from './helpers';

/**
 * The desktop's login → attendance → work-report flows (frmlogin, frmLogoutNew.SaveLog,
 * frmLogoutNew, Frmlibmain exit paths), in a real browser against the real API and database.
 * The API's transaction is reset to the seeded scenario before every test.
 */
useScenario();

test('rejects a wrong password with the desktop message', async ({ page }) => {
  await login(page, scenario.users.fresh, 'wrong');
  // MsgBox(..., MsgBoxStyle.Information, "Information")
  const box = page.getByRole('dialog', { name: 'Information' });
  await expect(box.getByRole('alert')).toHaveText('Please Enter Current Username And Password');
  await answer(page, 'Please Enter Current Username And Password', 'OK');
  await expect(page).toHaveURL(/\/login\/$/);
});

test('asks for the user name first, like the desktop', async ({ page }) => {
  await page.goto('/login/');
  await expect(page.getByRole('heading', { name: /\(Library Login\) Version - / })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit' })).toBeVisible();
  await page.getByRole('button', { name: 'Login' }).click();
  // An untitled MsgBox shows the assembly title, "Library".
  await expect(page.getByRole('dialog', { name: 'Library' })).toBeVisible();
  await answer(page, 'Please Enter User Name', 'OK');
  await expect(page.getByLabel('User Name')).toBeFocused();
});

test('logs in, shows the last login, and logs out through the work report', async ({ page }) => {
  await login(page, scenario.users.fresh);
  await answer(page, `Last LogIn Date : ${dmy(scenario.lastWorkingDay, '/')}`, 'OK');

  await expect(page).toHaveTitle(/^गीतार्थ गंगा \(Library Program\) Version - /);
  await expect(page.getByLabel('Signed in as')).toHaveText(scenario.users.fresh);
  await expect(page.getByRole('menuitem', { name: 'Master', exact: true })).toBeVisible();

  // Closing the program asks this user for today's work report (Frmlibmain_FormClosing).
  await page.getByRole('button', { name: 'Logout' }).click();
  const report = dialog(page, 'Logout');
  await expect(report).toBeVisible();
  await expect(report.getByText('Login Time')).toBeVisible();
  await expect(report.getByRole('button', { name: 'Report' })).toHaveCount(0);
  // Closing it without saving still ends the session.
  await report.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/login\/$/);
  expect((await page.request.get(`${API}/api/auth/me`)).status()).toBe(401);
});

test('makes an absent user apply for leave before entering', async ({ page }) => {
  await login(page, scenario.users.absent);
  const leave = dialog(page, 'Save');
  await expect(leave).toBeVisible();
  await expect(leave.getByRole('row', { name: /Date From/ })).toContainText(
    dmy(scenario.dayBefore),
  );
  await expect(leave.getByRole('row', { name: /Date To/ })).toContainText(
    dmy(scenario.lastWorkingDay),
  );

  await leave.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Please SELECT LeaveType', 'OK');

  await leave.getByLabel('LeaveType').press('F2');
  await pickFirst(page, 'LeaveType');
  await expect(leave.getByLabel('LeaveType')).not.toHaveValue('');
  await leave.getByRole('button', { name: 'Save' }).click();

  await answer(page, 'Last LogIn Date', 'OK');
  await expect(page.getByLabel('Signed in as')).toHaveText(scenario.users.absent);
});

test('completes a pending work report at login with F2 lookups', async ({ page }) => {
  await login(page, scenario.users.pending);
  await answer(page, 'Last LogIn Date', 'OK');
  const prompt = dialog(page, `Your Work Report on: (${dmy(scenario.lastWorkingDay)}) is Pending`);
  await expect(prompt).toContainText('Do You Want to Fill the Work Report?');
  await prompt.getByRole('button', { name: 'Yes' }).click();

  const report = dialog(page, `Logout(Pending Login Date: ${dmy(scenario.lastWorkingDay)})`);
  await expect(report).toBeVisible();
  await expect(report.getByText('08:00:00').first()).toBeVisible(); // Total Time

  // Nothing reported yet: the desktop's validation message.
  await report.getByRole('button', { name: 'Save & Logout' }).click();
  await answer(page, 'Total Work Time cannot be Less than : 08:00', 'OK');

  await report.getByRole('button', { name: 'New' }).click();
  const g = grid(page);
  await g.cell(0, 'vibhagName').click();
  await g.cell(0, 'vibhagName').press('F2');
  await pickFirst(page, 'Vibhag');
  await expect(g.cell(0, 'vibhagName')).not.toHaveText('');

  await g.cell(0, 'workTypeName').click();
  await g.cell(0, 'workTypeName').press('F2');
  await pickFirst(page, 'Work Type');
  await expect(g.cell(0, 'workTypeName')).not.toHaveText('');

  await g.cell(0, 'hrs').click();
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');
  await expect(g.cell(0, 'hrs')).toHaveText('8');
  await expect(
    report.getByText('Report Time').locator('xpath=following-sibling::dd[1]'),
  ).toHaveText('08:00:00');

  await report.getByRole('button', { name: 'Save & Logout' }).click();
  await expect(report).toBeHidden();
  // No more pending days: straight into the program.
  await expect(page.getByLabel('Signed in as')).toHaveText(scenario.users.pending);
});

test('refuses entry when more than two pending reports are declined', async ({ page }) => {
  await login(page, scenario.users.manyPending);
  await answer(page, 'Last LogIn Date', 'OK');
  await answer(page, 'Do You Want to Fill the Work Report?', 'No');
  await answer(page, 'You have 3 pending work reports', 'OK');
  await expect(page).toHaveURL(/\/login\/$/);
  expect((await page.request.get(`${API}/api/auth/me`)).status()).toBe(401);
});

test('Master › Exit (Ctrl+Q) saves today\'s report and leaves on "No"', async ({ page }) => {
  await login(page, scenario.users.fresh);
  await answer(page, 'Last LogIn Date', 'OK');
  await expect(page.getByLabel('Signed in as')).toBeVisible();

  await page.keyboard.press('Control+q');
  const report = dialog(page, 'Logout');
  await expect(report).toBeVisible();
  // Just logged in: nothing to report, and the logged time is under the 5-minute tolerance.
  await report.getByRole('button', { name: 'Save & Logout' }).click();
  await answer(page, 'Continue LibProgram?', 'No');
  await expect(page).toHaveURL(/\/login\/$/);
});

test("an Admin-type user can open another user's report read-only", async ({ page }) => {
  await login(page, scenario.users.reporter);
  await expect(page.getByLabel('Signed in as')).toHaveText(scenario.users.reporter);

  await page.getByRole('menuitem', { name: 'Employee', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Login & Log Out' }).click();
  const report = dialog(page, 'Logout');
  await report.getByRole('button', { name: 'Report' }).click();

  await page.getByLabel('Search User').fill(scenario.users.pending);
  await page.getByLabel('Search User').press('Enter');
  // VB InputBox: "Please Enter Date in MM/dd/yyyy format".
  const date = page.getByRole('dialog', { name: 'Enter Work Date' });
  const [y, m, d] = scenario.lastWorkingDay.split('-');
  await date.getByLabel(/MM\/dd\/yyyy/).fill(`${m}/${d}/${y}`);
  await date.getByRole('button', { name: 'OK' }).click();

  const other = dialog(page, `Logout (${scenario.users.pending} ${dmy(scenario.lastWorkingDay)})`);
  await expect(other).toBeVisible();
  await expect(other.getByRole('button', { name: 'Save & Logout' })).toBeDisabled();
  await expect(other.getByRole('button', { name: 'New' })).toBeDisabled();
});
