import { expect, type Locator, type Page, test } from '@playwright/test';
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
 * Plan Batch E (the Graphics menu) in a real browser against the real API and database (inside
 * the e2e server's rolled-back transaction): Graphics Master and Graphics Detail. See
 * docs/screens/graphics-master.md and docs/screens/graphics-detail.md.
 */
useScenario();

async function save(page: Page, win: Locator) {
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

/** F2 on a box (or a popup's grid), then the list's second row (the first is frmList1's blank row). */
async function pickSecond(page: Page, target: Locator, list: string) {
  await target.press('F2');
  const box = page.getByRole('listbox', { name: list });
  await expect(box.getByRole('option').nth(1)).toBeVisible({ timeout: 90_000 });
  await page.getByLabel(`Search ${list}`).press('ArrowDown');
  await page.getByLabel(`Search ${list}`).press('Enter');
  await expect(box).toBeHidden();
}

async function security(page: Page, password: string) {
  const dlg = dialog(page, 'Security');
  await dlg.getByLabel('Password').fill(password);
  await dlg.getByRole('button', { name: 'Ok' }).click();
}

test('Graphics Master: add with Lib No and a Vishesh popup, edit, lock / unlock, Graphics Detail, delete', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Graphics', 'Graphics Master');
  const win = page.getByRole('region', { name: 'Graphics Master' });
  const g = grid(page);
  await expect(g.cell(0, 'graphicBkm')).toBeVisible({ timeout: 60_000 });

  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('recno', { exact: true }).fill('987001');
  // The Lib No pick fills Book Name (and the samvat boxes) from the book.
  await pickSecond(page, win.getByLabel('BookTKt', { exact: true }), 'BookTKt');
  await expect(win.getByLabel('BookTKt', { exact: true })).not.toHaveValue('');
  await expect(win.getByLabel('bkname', { exact: true })).not.toHaveValue('');
  const libNo = await win.getByLabel('BookTKt', { exact: true }).inputValue();

  // The Vishesh popup: a word from GrwordM (type Vishesh), saved into the box as its text.
  await win.getByLabel('VisheshTran', { exact: true }).press('F2');
  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup.getByRole('columnheader', { name: 'wordnm' })).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'grwordkt' })).toHaveCount(0);
  await pickSecond(page, popup.getByRole('grid'), 'wordnm');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toBeHidden();
  const vishesh = await win.getByLabel('VisheshTran', { exact: true }).inputValue();
  expect(vishesh).not.toBe('');

  await win.getByLabel('color', { exact: true }).fill('zq1');
  await save(page, win);
  await expect(g.cell(0, 'recno')).toHaveText('987001');
  await expect(g.cell(0, 'BookTName')).toHaveText(libNo);
  await expect(g.cell(0, 'VisheshTran')).toHaveText(vishesh);

  // Edit (no Work Type asked: this user added the record today).
  await g.cell(0, 'color').click();
  await expect(win.getByLabel('recno', { exact: true })).toHaveValue('987001');
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('color', { exact: true }).fill('zq2');
  await save(page, win);
  await expect(g.cell(0, 'color')).toHaveText('zq2');
  await expect(g.cell(0, 'VisheshTran')).toHaveText(vishesh);

  // Ctrl+L with the graphics lock password: the record turns read-only; Ctrl+U frees it.
  await g.cell(0, 'color').click();
  await page.keyboard.press('Control+l');
  await security(page, 'e2e-graphics-lock-pw');
  await answer(page, 'Locked Successfully in 1 Records', 'OK');
  await g.cell(0, 'color').click();
  await expect(win.getByRole('button', { name: 'Modify' })).toBeDisabled();
  await page.keyboard.press('Control+u');
  await security(page, 'e2e-graphics-lock-pw');
  await answer(page, 'Unlocked Successfully in 1 Records', 'OK');
  await g.cell(0, 'color').click();
  await expect(win.getByRole('button', { name: 'Modify' })).toBeEnabled();

  // For Selected Record › Graphics Detail opens that screen's window (empty for a new record).
  await rightClick(page, 0, 'color', ['For Selected Record', 'Graphics Detail']);
  await expect(page.getByRole('region', { name: 'Graphics Detail' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Close Graphics Detail', exact: true })
    .click();
  await expect(win).toBeVisible();

  // Delete: in use is checked first, then the question and the Security password.
  await g.cell(0, 'color').click();
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  await security(page, 'e2e-security-pw');
  await answer(page, 'Record Deleted', 'OK');
  await expect(page.getByRole('grid')).not.toContainText('zq2');
});

test('Graphics Master: Delete refuses a record used in Graphics Detail', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Graphics', 'Graphics Master');
  const win = page.getByRole('region', { name: 'Graphics Master' });
  const g = grid(page);
  // The oldest records all have pictures; the grid lists newest first, so search for one.
  await expect(g.cell(0, 'graphicBkm')).toBeVisible({ timeout: 60_000 });
  const ids = await page
    .getByRole('grid')
    .locator('[col-id="graphicBkm"][role="gridcell"]')
    .allTextContents();
  expect(ids.length).toBeGreaterThan(0);
  // Walk down until a record whose Delete says it is in use (most records have details).
  for (let i = 0; i < 10; i++) {
    await g.cell(i, 'color').click();
    await win.getByRole('button', { name: 'Delete' }).click();
    const inUse = page.getByRole('dialog').filter({
      has: page.getByRole('alert').filter({ hasText: 'Record is used in Graphics Detail' }),
    });
    const question = page.getByRole('dialog').filter({
      has: page.getByRole('alert').filter({ hasText: 'Are You Sure to Delete This Record?' }),
    });
    await expect(inUse.or(question)).toBeVisible();
    if (await inUse.isVisible()) {
      await expect(inUse).toContainText('Record Cannot Be Deleted');
      await inUse.getByRole('button', { name: 'OK', exact: true }).click();
      return;
    }
    await question.getByRole('button', { name: 'No', exact: true }).click();
  }
  throw new Error('no record in use among the first ten');
});

test('Graphics Detail: menu list, Add Detail copying the master, popup, edit, Insert › Grade, Patrika round trip, delete', async ({
  page,
}) => {
  test.setTimeout(400_000);
  await login(page, scenario.users.reporter);
  const nav = page.getByRole('navigation', { name: 'Main menu' });

  // From the menu: the newest pictures, with the first row's Graphics Master row above them.
  await openMenuItem(page, 'Graphics', 'Graphics Detail');
  const det = page.getByRole('region', { name: 'Graphics Detail' });
  const main = () => det.getByRole('grid').last();
  const cell = (row: number, col: string) =>
    main().locator(`[row-index="${row}"] [col-id="${col}"]`);
  const parentRows = () =>
    det.getByLabel('Graphics Master record').locator('[col-id="graphicBkm"][role="gridcell"]');
  await expect(cell(0, 'graphicBkTkm')).toBeVisible({ timeout: 90_000 });
  await expect(parentRows()).toHaveCount(1, { timeout: 30_000 });
  await nav.getByRole('button', { name: 'Close Graphics Detail', exact: true }).click();

  // A Graphics Master record with a Vishesh word.
  await openMenuItem(page, 'Graphics', 'Graphics Master');
  const gm = page.getByRole('region', { name: 'Graphics Master' });
  const gmCell = (col: string) => gm.getByRole('grid').locator(`[row-index="0"] [col-id="${col}"]`);
  await expect(gmCell('color')).toBeVisible({ timeout: 60_000 });
  await gm.getByRole('button', { name: 'New' }).click();
  await gm.getByLabel('recno', { exact: true }).fill('987003');
  await pickSecond(page, gm.getByLabel('BookTKt', { exact: true }), 'BookTKt');
  const libNo = await gm.getByLabel('BookTKt', { exact: true }).inputValue();
  await gm.getByLabel('VisheshTran', { exact: true }).press('F2');
  let popup = dialog(page, 'frmDisplayTransNew');
  await pickSecond(page, popup.getByRole('grid'), 'wordnm');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toBeHidden();
  const vishesh = await gm.getByLabel('VisheshTran', { exact: true }).inputValue();
  await gm.getByLabel('color', { exact: true }).fill('zqm');
  await save(page, gm);
  await expect(gmCell('recno')).toHaveText('987003');

  // Add Detail, copying the master's data: Add mode for that book, its boxes and popup rows.
  await gmCell('color').click();
  await gmCell('color').click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Record' })
    .getByRole('menuitem', { name: 'Add Detail', exact: true })
    .click();
  await answer(page, 'Do You Want To Copy Master Data?', 'Yes');
  await expect(det).toBeVisible();
  await expect(det.getByLabel('Graphickt', { exact: true })).toHaveValue(libNo, {
    timeout: 30_000,
  });
  await expect(det.getByLabel('VisheshTran', { exact: true })).toHaveValue(vishesh);
  await expect(det.getByLabel('color', { exact: true })).toHaveValue('zqm');
  await expect(det.getByRole('button', { name: 'Save' })).toBeEnabled();
  await expect(parentRows()).toHaveCount(1, { timeout: 30_000 });

  await det.getByLabel('recno', { exact: true }).fill('987002');
  await det.getByLabel('color', { exact: true }).fill('zq3');
  // The Material popup: a GrwordM word of type Material.
  await det.getByLabel('MaterialTran', { exact: true }).press('F2');
  popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup.getByRole('columnheader', { name: 'wordnm' })).toBeVisible();
  await pickSecond(page, popup.getByRole('grid'), 'wordnm');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toBeHidden();
  await expect(det.getByLabel('MaterialTran', { exact: true })).not.toHaveValue('');

  // Save asks "Add More With Copying Data?" under "Record Saved Successfully". The copied
  // Vishesh rows were saved with the new picture.
  await det.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Do You Want to Add More With Copying Data?', 'No');
  await expect(cell(0, 'recno')).toHaveText('987002');
  await expect(cell(0, 'color')).toHaveText('zq3');
  await expect(cell(0, 'VisheshTran')).toHaveText(vishesh);

  // Edit.
  await cell(0, 'color').click();
  await expect(det.getByLabel('recno', { exact: true })).toHaveValue('987002');
  await det.getByRole('button', { name: 'Modify' }).click();
  await det.getByLabel('color', { exact: true }).fill('zq4');
  await det.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Do You Want to Add More With Copying Data?', 'No');
  await expect(cell(0, 'color')).toHaveText('zq4');

  const menuPath = async (path: string[]) => {
    await cell(0, 'color').click();
    await cell(0, 'color').click({ button: 'right' });
    let menu = page.getByRole('menu', { name: 'Record' });
    for (const [i, label] of path.entries()) {
      const item = menu.getByRole('menuitem', { name: label, exact: true });
      if (i < path.length - 1) {
        await item.hover();
        menu = page.getByRole('menu', { name: label });
      } else await item.click();
    }
  };

  // Insert in Selected Record › Grade: a grade word, the Security password, the count.
  await menuPath(['Insert in Selected Record', 'Grade']);
  await pickFirst(page, 'List');
  await security(page, 'e2e-security-pw');
  await answer(page, /At 1 Places .*,Type -grade is Inserted succefully/, 'OK');
  await expect(cell(0, 'grade')).not.toHaveText('');

  // Update Patrika, then Show For Selected Records › Patrika, and back through Patrika's
  // For Selected Record › Graphics Detail, which lists this picture.
  await menuPath(['Utility', 'Update Patrika For Selected Records']);
  await pickFirst(page, 'List');
  await answer(page, 'Records Updated Successfully At 1 Places', 'OK');
  await menuPath(['Show For Selected Records', 'Patrika']);
  const pat = page.getByRole('region', { name: 'Patrika' });
  const patCell = pat.getByRole('grid').locator('[row-index="0"] [col-id="RecordNo"]');
  await expect(patCell).toBeVisible({ timeout: 60_000 });
  await patCell.click();
  await patCell.click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Record' })
    .getByRole('menuitem', { name: 'For Selected Record', exact: true })
    .hover();
  await page
    .getByRole('menu', { name: 'For Selected Record' })
    .getByRole('menuitem', { name: 'Graphics Detail', exact: true })
    .click();
  await expect(det).toBeVisible();
  await expect(main()).toContainText('987002', { timeout: 60_000 });

  // Delete (from this window): the question, then the Security password.
  const row = main().locator('[role="row"]').filter({ hasText: 'zq4' });
  await row.locator('[col-id="color"]').click();
  await det.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  await security(page, 'e2e-security-pw');
  await answer(page, 'Record Deleted', 'OK');
  await expect(main()).not.toContainText('zq4');
});
