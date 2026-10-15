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
 * Plan Batch D (the Issue menu) in a real browser against the real API and database (inside the
 * e2e server's rolled-back transaction): Inward Master, Letter Bhet, Letter Demand, Lab Issue Master, Patrika and Issue Master. See their
 * docs/screens notes.
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

/** F2 on a box, then the list's second row (the first is frmList1's blank row). */
async function pickSecond(page: Page, win: Locator, box: string) {
  await win.getByLabel(box, { exact: true }).press('F2');
  const list = page.getByRole('listbox', { name: box });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(`Search ${box}`).press('ArrowDown');
  await page.getByLabel(`Search ${box}`).press('Enter');
  await expect(list).toBeHidden();
}

test('Inward Master: add with the Vibhag serial, Return Date by Returned, edit, owner lock, Send To, delete', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Inward Master');
  const win = page.getByRole('region', { name: 'Inward Master' });
  const g = grid(page);
  await expect(g.cell(0, 'inwordkm')).toBeVisible({ timeout: 60_000 });
  // The grid shows In/Out as text (tblSearch's GridColumnName).
  await expect(g.cell(0, 'InOut')).toHaveText(/^(IN|OUT)$/);

  // Owner lock: the reporter entered none of the existing rows, so Modify stays off.
  await g.cell(0, 'VibhagName').click();
  await expect(win.getByLabel('Vibhag', { exact: true })).not.toHaveValue('');
  await expect(win.getByRole('button', { name: 'Modify' })).toBeDisabled();
  await expect(win.getByRole('button', { name: 'Delete' })).toBeDisabled();

  await win.getByRole('button', { name: 'New' }).click();
  await expect(win.getByLabel('Vibhag', { exact: true })).toHaveValue('');
  // A picked Vibhag brings its next VibhagSrNo.
  await pickSecond(page, win, 'Vibhag');
  await expect(win.getByLabel('VibhagSrNo')).not.toHaveValue('');
  const srNo = await win.getByLabel('VibhagSrNo').inputValue();
  await win.getByLabel('subject', { exact: true }).fill('zq-inward-e2e');
  await win.getByLabel('In/Out').selectOption('OUT');

  // Return Date: a disabled blank box until Returned is Yes, then the date picker.
  await expect(win.getByLabel('ReturDate')).toBeDisabled();
  await expect(win.getByLabel('Return Date', { exact: true })).toBeHidden();
  await win.getByLabel('Returned', { exact: true }).selectOption('Yes');
  await expect(win.getByLabel('Return Date', { exact: true })).toBeVisible();
  await expect(win.getByLabel('ReturDate')).toBeHidden();

  await save(page, win);
  await expect(g.cell(0, 'subject')).toHaveText('zq-inward-e2e');
  await expect(g.cell(0, 'VibhagSrNo')).toHaveText(srNo);
  await expect(g.cell(0, 'InOut')).toHaveText('OUT');

  // The reporter's own record can be edited.
  await g.cell(0, 'subject').click();
  await expect(win.getByLabel('Returned', { exact: true })).toHaveValue('Yes');
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('subject', { exact: true }).fill('zq-inward-e2e2');
  await save(page, win);
  await expect(g.cell(0, 'subject')).toHaveText('zq-inward-e2e2');

  // Send To › Party Master with no party: the desktop's message.
  await rightClick(page, 0, 'subject', ['Send To', 'Party Master']);
  await answer(page, 'No Record Found', 'OK');
  // Send To › Letter Bhet Master with no letter yet opens Letter Bhet (to add one).
  await rightClick(page, 0, 'subject', ['Send To', 'Letter Bhet Master']);
  await expect(page.getByRole('region', { name: 'Letter Bhet' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Close Letter Bhet', exact: true })
    .click();
  await expect(win).toBeVisible();

  await g.cell(0, 'subject').click();
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Record Deleted', 'OK');
  await expect(page.getByRole('grid')).not.toContainText('zq-inward-e2e2');
});

/** Clicks the window's Delete and goes through the confirm and the Security password. */
async function deleteCurrent(page: Page, win: Locator) {
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Record Deleted', 'OK');
}

/** window.print() is counted instead of opening the browser's dialog. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
}
const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { printed: number }).printed);

test('Letter Bhet: add with a Book Detail popup, edit, print Bhet Pahoch, delete', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await stubPrint(page);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Letter Bhet');
  const win = page.getByRole('region', { name: 'Letter Bhet' });
  const g = grid(page);
  await expect(g.cell(0, 'LetterBhetMkm')).toBeVisible({ timeout: 60_000 });

  await win.getByRole('button', { name: 'New' }).click();
  // New: the next LetterNo and the default letter.
  await expect(win.getByLabel('Letter No')).not.toHaveValue('');
  await expect(win.getByLabel('Letter', { exact: true })).toHaveValue(/^सादर प्रणाम,/);
  await pickSecond(page, win, 'Bhet Type');
  await expect(win.getByLabel('Bhet Type')).not.toHaveValue('');
  await win.getByLabel('Party Name').fill('zq-bhet party');
  await win.getByLabel('Vishay').fill('zq-bhet');

  // Book Detail: frmDisplayTransNew with one blank row; the box shows its summary.
  await win.getByLabel('Book Detail').press('F2');
  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup.getByRole('columnheader', { name: 'BookName' })).toBeVisible();
  await expect(popup.getByRole('columnheader', { name: 'LetterBookKm' })).toHaveCount(0);
  await popup.getByRole('grid').press('Z');
  await popup.getByLabel('Cell').fill('zq book');
  await popup.getByLabel('Cell').press('Enter');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toBeHidden();
  await expect(win.getByLabel('Book Detail')).toHaveValue('zq book');

  await save(page, win);
  await expect(g.cell(0, 'PartyName')).toHaveText('zq-bhet party');
  await expect(g.cell(0, 'Vishay')).toHaveText('zq-bhet');

  // Edit the record; the reloaded Book Detail reads the BookNames.
  await g.cell(0, 'PartyName').click();
  await expect(win.getByLabel('Book Detail')).toHaveValue('zq book');
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Vishay').fill('zq-bhet2');
  await save(page, win);
  await expect(g.cell(0, 'Vishay')).toHaveText('zq-bhet2');

  // Print Report › Print Bhet Pahoch: the report window, and the print dialog.
  await rightClick(page, 0, 'PartyName', ['Print Report', 'Print Bhet Pahoch']);
  const report = dialog(page, 'Bhet Pahoch');
  await expect(report).toBeVisible();
  await expect(report.getByText('zq-bhet party')).toBeVisible();
  await expect(report.getByRole('cell', { name: 'zq book' })).toBeVisible();
  await expect(report.getByRole('img', { name: 'Geetarth Ganga' })).toBeVisible();
  await expect(report.getByText(/Provisional layout/)).toBeVisible();
  await expect.poll(() => printed(page)).toBe(1);
  await report
    .getByRole('toolbar', { name: 'Report' })
    .getByRole('button', { name: 'Print' })
    .click();
  await expect.poll(() => printed(page)).toBe(2);
  await report
    .getByRole('toolbar', { name: 'Report' })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(report).toBeHidden();

  await g.cell(0, 'PartyName').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('zq-bhet party');
});

test('Inward Master › Send To › Letter Bhet: a new letter with the inward filled in, then the letter', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Inward Master');
  const inward = page.getByRole('region', { name: 'Inward Master' });
  const g = grid(page);
  await expect(g.cell(0, 'inwordkm')).toBeVisible({ timeout: 60_000 });
  await inward.getByRole('button', { name: 'New' }).click();
  await pickSecond(page, inward, 'Vibhag');
  const vibhag = await inward.getByLabel('Vibhag', { exact: true }).inputValue();
  await inward.getByLabel('subject', { exact: true }).fill('zq-inward-letter');
  await save(page, inward);
  await expect(g.cell(0, 'subject')).toHaveText('zq-inward-letter');

  // No letter yet: Letter Bhet opens in Add mode with Inword set to the inward's Vibhag.
  await rightClick(page, 0, 'subject', ['Send To', 'Letter Bhet Master']);
  const bhet = page.getByRole('region', { name: 'Letter Bhet' });
  await expect(bhet).toBeVisible();
  await expect(bhet.getByLabel('Inword')).toHaveValue(vibhag);
  await expect(bhet.getByLabel('Letter No')).not.toHaveValue('');
  await pickSecond(page, bhet, 'Bhet Type');
  await bhet.getByLabel('Party Name').fill('zq-inward-party');
  await save(page, bhet);
  const letters = bhet.getByRole('grid');
  await expect(letters.locator('[row-index="0"] [col-id="InwordName"]')).toHaveText(vibhag);
  await expect(letters.locator('[row-index="0"] [col-id="PartyName"]')).toHaveText(
    'zq-inward-party',
  );
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Close Letter Bhet', exact: true })
    .click();

  // Now the inward has a letter: Send To opens Letter Bhet on it.
  await expect(inward).toBeVisible();
  await rightClick(page, 0, 'subject', ['Send To', 'Letter Bhet Master']);
  await expect(bhet).toBeVisible();
  await expect(letters.locator('[row-index="0"] [col-id="PartyName"]')).toHaveText(
    'zq-inward-party',
  );
  await expect(letters.locator('[row-index="1"]')).toHaveCount(0);
  // Send To › Inword Master goes back to the inward.
  await letters.locator('[row-index="0"] [col-id="PartyName"]').click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Record' })
    .getByRole('menuitem', { name: 'Send To', exact: true })
    .hover();
  await page
    .getByRole('menu', { name: 'Send To' })
    .getByRole('menuitem', { name: 'Inword Master' })
    .click();
  // A second Inward Master window (the first stays open behind it) on just that inward.
  const back = page.getByRole('region', { name: 'Inward Master' }).getByRole('grid');
  await expect(back.locator('[row-index="0"] [col-id="subject"]')).toHaveText('zq-inward-letter');
  await expect(back.locator('[row-index="1"]')).toHaveCount(0);
});

test('Letter Demand: add, Running past its reminder shows red, print Demand, delete', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await stubPrint(page);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Letter Demand');
  const win = page.getByRole('region', { name: 'Letter Demand' });
  const g = grid(page);
  await expect(g.cell(0, 'LetterDemandMkm')).toBeVisible({ timeout: 60_000 });

  await win.getByRole('button', { name: 'New' }).click();
  await expect(win.getByLabel('Letter No')).not.toHaveValue('');
  await expect(win.getByLabel('Letter', { exact: true })).toHaveValue(/^सादर प्रणाम,/);
  await pickSecond(page, win, 'Letter Type');
  await win.getByLabel('Party Name').fill('zq-demand party');
  await win.getByLabel('NextReminder Date').fill('2020-01-01');
  await win.getByLabel('Status Type').press('F2');
  const list = page.getByRole('listbox', { name: 'Status Type' });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Search Status Type').fill('Running');
  await page.getByLabel('Search Status Type').press('Enter');
  await expect(list).toBeHidden();
  await expect(win.getByLabel('Status Type')).toHaveValue('Running');
  await save(page, win);
  await expect(g.cell(0, 'PartyName')).toHaveText('zq-demand party');
  // dgMain_CellFormatting: Running with a past reminder date is red.
  await expect(g.cell(0, 'PartyName')).toHaveCSS('color', 'rgb(255, 0, 0)');

  await g.cell(0, 'PartyName').click();
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('FollowUp Remark').fill('zq-follow');
  await save(page, win);
  await expect(g.cell(0, 'FollowUpRem')).toHaveText('zq-follow');

  await rightClick(page, 0, 'PartyName', ['Print Report', 'Print Demand']);
  const report = dialog(page, 'Letter Demand');
  await expect(report.getByText('zq-demand party')).toBeVisible();
  await expect.poll(() => printed(page)).toBe(1);
  await report
    .getByRole('toolbar', { name: 'Report' })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(report).toBeHidden();

  await g.cell(0, 'PartyName').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('zq-demand party');
});

/** Lab Issue Master: New, a free LibNo from F2, Save; the new request is the grid's first row. */
async function addLabRequest(page: Page, win: Locator) {
  const g = grid(page);
  await expect(g.cell(0, 'LabIssueMkm')).toBeVisible({ timeout: 60_000 });
  await win.getByRole('button', { name: 'New' }).click();
  // ~140k free LibNos: the windowed list takes a while.
  await pickSecond(page, win, 'LibNo');
  await expect(win.getByLabel('LibNo', { exact: true })).not.toHaveValue('');
  const libNo = await win.getByLabel('LibNo', { exact: true }).inputValue();
  await save(page, win);
  await expect(g.cell(0, 'BookTName')).toHaveText(libNo);
  await expect(g.cell(0, 'StatusName')).toHaveText('DlvrPen');
  await expect(g.cell(0, 'Type')).toHaveText('Book');
  return libNo;
}

test('Lab Issue Master: request, edit For, F4 refused for a non-Operator, Send To › BookT, delete', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Lab Issue Master');
  const win = page.getByRole('region', { name: 'Lab Issue Master' });
  const g = grid(page);
  const libNo = await addLabRequest(page, win);

  // The saved row is current already; clicking another row and back loads it (FillData).
  await g.cell(1, 'BookTName').click();
  await g.cell(0, 'BookTName').click();
  await expect(win.getByLabel('Requested By')).toHaveValue(scenario.users.reporter);
  await expect(win.getByLabel('Status', { exact: true })).toHaveValue('DlvrPen');
  await expect(win.getByLabel('Request Date')).toHaveValue(/^\d{2}-\d{2}-\d{4}$/);

  // Deliver Selected Book (F4) is for user type 3 only; the reporter is an Admin (1).
  await page.keyboard.press('F4');
  await answer(page, 'U have no right to Deliver the Books', 'OK');

  await win.getByRole('button', { name: 'Modify' }).click();
  await pickSecond(page, win, 'For');
  const party = await win.getByLabel('For', { exact: true }).inputValue();
  expect(party).not.toBe('');
  await save(page, win);
  // An Edit is work-reported: insertworkreports asks for the Work Type.
  const types = page.getByRole('listbox', { name: 'Work Type' });
  await expect(types.getByRole('option').first()).toBeVisible();
  await page.getByLabel('Search Work Type').press('Enter');
  await expect(types).toBeHidden();
  await expect(g.cell(0, 'ForName')).toHaveText(party);

  // Send To › BookT: the Library No dialog over the request's LibNo.
  await rightClick(page, 0, 'BookTName', ['Send To', 'BookT']);
  const bookTran = dialog(page, 'Book Tran');
  await expect(bookTran).toBeVisible();
  // F6 there (Request For LabIssue): the LibNo is already requested, by this user.
  await bookTran.getByRole('grid').locator('[row-index="0"] [col-id="Libno"]').click();
  await page.keyboard.press('F6');
  await answer(
    page,
    `Patrika No - ${libNo} already Requested For LabIssue By - ${scenario.users.reporter}`,
    'OK',
  );
  await bookTran.getByRole('button', { name: 'Close' }).first().click();
  await expect(bookTran).toBeHidden();

  const id = (await g.cell(0, 'LabIssueMkm').textContent()) ?? '';
  await g.cell(0, 'BookTName').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid').getByRole('gridcell', { name: id, exact: true })).toHaveCount(
    0,
  );
});

test('Lab Issue Master: an Operator delivers (F4) and returns (F5); Delete, then Modify turn off', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // An Operator (user type 3); this one is first shown the last login date.
  await login(page, scenario.users.fresh);
  await answer(page, /Last LogIn Date/, 'OK');
  await openMenuItem(page, 'Issue', 'Lab Issue Master');
  const win = page.getByRole('region', { name: 'Lab Issue Master' });
  const g = grid(page);
  await addLabRequest(page, win);

  await g.cell(0, 'BookTName').click();
  await expect(win.getByRole('button', { name: 'Delete' })).toBeEnabled();
  await page.keyboard.press('F4');
  await answer(page, 'Are u Sure to Deliver Selected Books?', 'Yes');
  await answer(page, '1 Books Delivered Successfully', 'OK');
  await expect(g.cell(0, 'StatusName')).toHaveText('RetPen');
  await expect(g.cell(0, 'DeliveryByName')).toHaveText(scenario.users.fresh);
  await expect(win.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await expect(win.getByRole('button', { name: 'Modify' })).toBeEnabled();

  await g.cell(0, 'BookTName').click();
  await page.keyboard.press('F5');
  await answer(page, 'Are Selected Books Returned Back to Library?', 'Yes');
  await answer(page, '1 Books Returned Successfully', 'OK');
  await expect(g.cell(0, 'StatusName')).toHaveText('Closed');
  await expect(win.getByRole('button', { name: 'Modify' })).toBeDisabled();

  // Show All Records of Current User: the closed request is there too.
  await rightClick(page, 0, 'BookTName', ['Utility', 'Show All Records of Current User']);
  await expect(g.cell(0, 'StatusName')).toHaveText('Closed');
  await expect(g.cell(1, 'StatusName')).toHaveCount(0);
});

/**
 * F2 on the popup's current cell (a new popup's first row starts in its first visible column,
 * the name), then the list's second row (the first is frmList1's blank row).
 */
async function pickInPopup(page: Page, popup: Locator, column: string) {
  await popup.getByRole('grid').press('F2');
  const list = page.getByRole('listbox', { name: column });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(`Search ${column}`).press('ArrowDown');
  await page.getByLabel(`Search ${column}`).press('Enter');
  await expect(list).toBeHidden();
}

/** New, the P series asked for in RecordNo, a Prasang and a Bhasha from their popups, Save. */
async function addPatrika(page: Page, win: Locator) {
  const g = grid(page);
  await expect(g.cell(0, 'PatrikaKm')).toBeVisible({ timeout: 60_000 });
  // New takes the series of the current row's RecordNo.
  await g.cell(0, 'RecordNo').click();
  const top = (await g.cell(0, 'RecordNo').textContent()) ?? '';
  await win.getByRole('button', { name: 'New' }).click();
  await expect(win.getByLabel('RecordNo')).toHaveValue(
    top.startsWith('EP') ? /^EP\d{5}$/ : /^P0\d{5}$/,
  );
  // A key in RecordNo (Add mode) asks for the series instead of typing.
  await win.getByLabel('RecordNo').press('x');
  await answer(page, /Press\(Yes\) for P Series/, 'Yes');
  await expect(win.getByLabel('RecordNo')).toHaveValue(/^P0\d{5}$/);
  const recordNo = await win.getByLabel('RecordNo').inputValue();

  for (const [box, column] of [
    ['PatrikaPrasangTran', 'PrasangName'],
    ['PatrikaBhashaTran', 'BhashaName'],
  ] as const) {
    await win.getByLabel(box).press('F2');
    const popup = dialog(page, 'frmDisplayTransNew');
    await expect(popup.getByRole('columnheader', { name: column })).toBeVisible();
    await expect(popup.getByRole('columnheader', { name: 'PatrikaKt' })).toHaveCount(0);
    await pickInPopup(page, popup, column);
    await popup.getByRole('button', { name: 'Save' }).click();
    await expect(popup).toBeHidden();
    await expect(win.getByLabel(box)).not.toHaveValue('');
  }
  const prasang = await win.getByLabel('PatrikaPrasangTran').inputValue();
  await win.getByLabel('Pages').fill('zq1');
  await save(page, win);
  await expect(g.cell(0, 'RecordNo')).toHaveText(recordNo);
  await expect(g.cell(0, 'txtPrasang')).toHaveText(prasang);
  return recordNo;
}

test('Lab Issue Master: Search In Range on RequestDate (dates only), not offered for a text column', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Lab Issue Master');
  const win = page.getByRole('region', { name: 'Lab Issue Master' });
  const g = grid(page);
  const libNo = await addLabRequest(page, win);

  const searchMenu = () => page.getByRole('menu', { name: 'Search' });
  // UcSearch.cntMenu_Opening: no Search In Range for a text column.
  await win.getByLabel('Search By').selectOption({ label: 'Type' });
  await win.getByLabel('Search', { exact: true }).click({ button: 'right' });
  await expect(searchMenu().getByRole('menuitem', { name: 'Search For Blank' })).toBeVisible();
  await expect(searchMenu().getByRole('menuitem', { name: 'Search In Range' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A datetime column: the box offers last month to today, dd/MM/yyyy-dd/MM/yyyy.
  await win.getByLabel('Search By').selectOption({ label: 'RequestDate' });
  await win.getByLabel('Search', { exact: true }).click({ button: 'right' });
  await searchMenu().getByRole('menuitem', { name: 'Search In Range' }).click();
  const box = page.getByLabel(/Please Enter Range in dd\/MM\/yyyy Format/);
  await expect(box).toHaveValue(/^\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}$/);
  await box.press('Enter');
  await expect(g.cell(0, 'BookTName')).toHaveText(libNo);

  // A range before today: the new request is not in it.
  await win.getByLabel('Search', { exact: true }).click({ button: 'right' });
  await searchMenu().getByRole('menuitem', { name: 'Search In Range' }).click();
  await box.fill('01/01/2001-31/12/2001');
  await box.press('Enter');
  await expect(
    page.getByRole('grid').getByRole('gridcell', { name: libNo, exact: true }),
  ).toHaveCount(0);
});

test('Patrika: New by series, popups, edit, Graphics Detail, Show Attachments, delete', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Patrika');
  const win = page.getByRole('region', { name: 'Patrika' });
  const g = grid(page);
  const recordNo = await addPatrika(page, win);

  // Edit. No Work Type is asked: the record was added (work type New) by this user today.
  await g.cell(0, 'Pages').click();
  await expect(win.getByLabel('RecordNo')).toHaveValue(recordNo);
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Pages').fill('zq2');
  await save(page, win);
  await expect(g.cell(0, 'Pages')).toHaveText('zq2');

  // The record's Bhasha popup reloads its saved row.
  await win.getByLabel('PatrikaBhashaTran').press('F2');
  const popup = dialog(page, 'frmDisplayTransNew');
  await expect(popup.getByRole('gridcell').first()).not.toHaveText('');
  await popup.getByRole('button', { name: 'Exit' }).click();
  await answer(page, 'Are You Sure to Exit?', 'Yes');
  await expect(popup).toBeHidden();

  await rightClick(page, 0, 'Pages', ['For Selected Record', 'Graphics Detail']);
  await answer(page, 'No Record Found', 'OK');
  await rightClick(page, 0, 'Pages', ['Utility', 'Show Attachments']);
  const attachments = dialog(page, 'Attachments');
  await expect(attachments.getByRole('columnheader', { name: 'File Name' })).toBeVisible();
  await attachments.getByRole('button', { name: 'Exit' }).click();
  await expect(attachments).toBeHidden();

  await g.cell(0, 'Pages').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText(recordNo);
});

test('Patrika: Request For LabIssue blocks Delete; Lab Issue Master › Send To › Patrika opens it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Patrika');
  const win = page.getByRole('region', { name: 'Patrika' });
  const g = grid(page);
  const recordNo = await addPatrika(page, win);

  await rightClick(page, 0, 'RecordNo', ['For Selected Record', 'Utility', 'Request For LabIssue']);
  await answer(page, 'Book Issued Successfully', 'OK');
  await rightClick(page, 0, 'RecordNo', ['For Selected Record', 'Utility', 'Request For LabIssue']);
  await answer(
    page,
    `Lib No - ${recordNo} already Requested For LabIssue By - ${scenario.users.reporter}`,
    'OK',
  );

  // Deliberate difference: a Patrika with a lab request cannot be deleted.
  await g.cell(0, 'RecordNo').click();
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Record is used in Lab Issue Master', 'OK');

  await openMenuItem(page, 'Issue', 'Lab Issue Master');
  const lab = page.getByRole('region', { name: 'Lab Issue Master' });
  const labRow = lab.getByRole('grid').locator('[row-index="0"] [col-id="BookTName"]');
  await expect(labRow).toHaveText(recordNo, { timeout: 60_000 });
  await labRow.click();
  await labRow.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Record' });
  await menu.getByRole('menuitem', { name: 'Send To', exact: true }).hover();
  await page
    .getByRole('menu', { name: 'Send To' })
    .getByRole('menuitem', { name: 'Patrika', exact: true })
    .click();
  const opened = page.getByRole('region', { name: 'Patrika' }).last();
  await expect(opened.getByRole('grid').locator('[row-index="0"] [col-id="RecordNo"]')).toHaveText(
    recordNo,
    { timeout: 60_000 },
  );
  await expect(opened.getByRole('grid').locator('[row-index="1"] [col-id="RecordNo"]')).toHaveCount(
    0,
  );
});

/** F2 on a box, then the row the list's search box finds for `text`. */
async function pickByText(page: Page, win: Locator, box: string, text: string) {
  await win.getByLabel(box, { exact: true }).press('F2');
  const list = page.getByRole('listbox', { name: box });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 90_000 });
  await page.getByLabel(`Search ${box}`).fill(text);
  await page.getByLabel(`Search ${box}`).press('Enter');
  await expect(list).toBeHidden();
}

/** Clicks Yes on a Yes/No question if it shows up within a few seconds. */
async function yesIfAsked(page: Page, text: RegExp) {
  const box = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('alert').filter({ hasText: text }) });
  if (
    await box.waitFor({ timeout: 4_000 }).then(
      () => true,
      () => false,
    )
  )
    await box.getByRole('button', { name: 'Yes', exact: true }).click();
}

test('Issue Master: add a slip, continue adding, edit, Issue Slip print, Return Selected, Search By Returned, delete', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await stubPrint(page);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Issue', 'Issue Master');
  const win = page.getByRole('region', { name: 'Issue Master' });
  const g = grid(page);
  await expect(g.cell(0, 'IssueTranKm')).toBeVisible({ timeout: 90_000 });

  await win.getByRole('button', { name: 'New' }).click();
  await expect(win.getByLabel('Old IssueNo')).toHaveValue(/^I\d{9}$/);
  const issueNo = await win.getByLabel('Old IssueNo').inputValue();
  await expect(win.getByLabel('Searcher')).toHaveValue(scenario.users.reporter);
  await expect(win.getByLabel('Returned', { exact: true })).toHaveValue('No');
  await expect(win.getByLabel('Return Date', { exact: true })).toBeDisabled();
  await expect(win.getByLabel('Confirm Date')).toBeDisabled();

  await pickByText(page, win, 'Party Name', 'Guru Prem Mission');
  await yesIfAsked(page, /Continue Issue Book\?/);
  await expect(win.getByLabel('Party Name', { exact: true })).toHaveValue('Guru Prem Mission');
  await pickByText(page, win, 'LibNo', 'A000334');
  await yesIfAsked(page, /Do you want to issue\?/);
  await expect(win.getByLabel('LibNo', { exact: true })).toHaveValue('A000334');
  await expect(win.getByLabel('Book Name', { exact: true })).not.toHaveValue('');
  // The slip generator: the series letter, then its next number.
  await pickSecond(page, win, 'SlipNo');
  await expect(win.getByLabel('SlipNo')).toHaveValue(/^D \d+ $/);
  const slip = (await win.getByLabel('SlipNo').inputValue()).trim();
  await win.getByLabel('Returned', { exact: true }).selectOption('Yes');
  await expect(win.getByLabel('Return Date', { exact: true })).toBeEnabled();
  await win.getByLabel('Returned', { exact: true }).selectOption('No');

  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, /Are You Sure to Save This Record\?/, 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
  await answer(page, 'Do You Want to Continue With Add New Record?', 'Yes');
  // Continue adding: party and slip stay (disabled), LibNo is cleared, the IssueNo moves on.
  await expect(win.getByLabel('Party Name', { exact: true })).toBeDisabled();
  await expect(win.getByLabel('Party Name', { exact: true })).toHaveValue('Guru Prem Mission');
  await expect(win.getByLabel('SlipNo')).toBeDisabled();
  await expect(win.getByLabel('SlipNo')).toHaveValue(slip);
  await expect(win.getByLabel('LibNo', { exact: true })).toHaveValue('');
  await expect(win.getByLabel('Old IssueNo')).not.toHaveValue(issueNo);
  await pickByText(page, win, 'LibNo', 'F004427');
  await yesIfAsked(page, /Do you want to issue\?/);
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, /Are You Sure to Save This Record\?/, 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
  await answer(page, 'Do You Want to Continue With Add New Record?', 'No');
  await expect(g.cell(0, 'entrcodeName')).toHaveText('F004427');
  await expect(g.cell(1, 'entrcodeName')).toHaveText('A000334');
  await expect(g.cell(0, 'SlipNo')).toHaveText(slip);
  await expect(g.cell(1, 'SlipNo')).toHaveText(slip);

  // A record entered today: Party editable, Ref Party ReadOnly (no F2), Slip disabled.
  await g.cell(1, 'entrcodeName').click();
  await expect(win.getByLabel('LibNo', { exact: true })).toHaveValue('A000334');
  await expect(win.getByLabel('SlipNo')).toBeDisabled();
  await expect(win.getByLabel('Ref Party')).toHaveAttribute('readonly', '');
  await win.getByLabel('Ref Party').press('F2');
  await expect(page.getByRole('listbox', { name: 'Ref Party' })).toHaveCount(0);
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Remark').fill('zq-issue-e2e');
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, /Are You Sure to Save This Record\?/, 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
  const workType = page.getByRole('listbox', { name: 'Work Type' });
  if (
    await workType.waitFor({ timeout: 4_000 }).then(
      () => true,
      () => false,
    )
  )
    await pickFirst(page, 'Work Type');

  // Print Report › Issue Slip › All: both rows of the slip, provisional layout.
  await rightClick(page, 1, 'entrcodeName', ['Print Report', 'Issue Slip', 'All']);
  const report = dialog(page, 'Issue Slip');
  await expect(report).toBeVisible();
  await expect(report.getByRole('cell', { name: 'A000334' })).toBeVisible();
  await expect(report.getByRole('cell', { name: 'F004427' })).toBeVisible();
  await expect(report.getByText(/Provisional layout/)).toBeVisible();
  await expect.poll(() => printed(page)).toBe(1);
  await report
    .getByRole('toolbar', { name: 'Report' })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(report).toBeHidden();

  // Utility › Return Selected Record (F6, its ShortcutKeys, while the grid has the focus).
  await g.cell(1, 'entrcodeName').click();
  await page.keyboard.press('F6');
  await answer(page, 'Are You Sure To Return Selected Records?', 'Yes');
  await answer(page, '1 Records Returned Successfully', 'OK');
  await g.cell(1, 'entrcodeName').click();
  await expect(win.getByLabel('Returned', { exact: true })).toHaveValue('Yes');
  await expect(win.getByRole('button', { name: 'Modify' })).toBeDisabled();

  // The other row: delete it.
  await g.cell(0, 'entrcodeName').click();
  await expect(win.getByLabel('LibNo', { exact: true })).toHaveValue('F004427');
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('F004427');

  // Search By "Returned", F2: the form's own list, then the rows with that value.
  await win.getByLabel('Search By').selectOption({ label: 'Returned' });
  await win.getByLabel('Search', { exact: true }).press('F2');
  const values = page.getByRole('listbox', { name: 'List' });
  await expect(values.getByRole('option').nth(1)).toBeVisible();
  await page.getByLabel('Search List').fill('1');
  await page.getByLabel('Search List').press('Enter');
  await expect(g.cell(0, 'returned')).toHaveText(/true/i, { timeout: 60_000 });
});
