import { expect, type Locator, type Page, test } from '@playwright/test';
import { answer, dialog, grid, login, openMenuItem, scenario, useScenario } from './helpers';

/**
 * Plan Batch C in a real browser against the real API and database (inside the e2e server's
 * rolled-back transaction): Magazine Vishesh Master, English Book Vishesh, Magazine Master,
 * Tirth Raksha Master and Anya Bhandar. See their docs/screens notes.
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

/** F2 on a box, then the list's second row (the first is frmList1's blank / party 0). */
async function pickSecond(page: Page, win: Locator, box: string) {
  await win.getByLabel(box, { exact: true }).press('F2');
  const list = page.getByRole('listbox', { name: box });
  await expect(list.getByRole('option').nth(1)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(`Search ${box}`).press('ArrowDown');
  await page.getByLabel(`Search ${box}`).press('Enter');
  await expect(list).toBeHidden();
}

async function deleteCurrent(page: Page, win: Locator) {
  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  const security = dialog(page, 'Security');
  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Record Deleted', 'OK');
}

test('Magazine Vishesh: cancel the book list, add with the LibNo list and a Vishay box, edit, delete', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Library', 'Magazine Vishesh Master New');
  // The menu's book list comes first; cancelling it opens the form on an empty grid, in New.
  const books = page.getByRole('listbox', { name: 'List' });
  await expect(books.getByRole('option').nth(1)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Search List').press('Escape');
  const win = page.getByRole('region', { name: 'Magazine Vishesh Master New' });
  await expect(win.getByRole('button', { name: 'Save' })).toBeEnabled();
  await expect(win.getByLabel('Seq/Sub Seq')).toHaveValue('1');

  // The LibNo pick fills Book Name too.
  await pickSecond(page, win, 'LibNo');
  await expect(win.getByLabel('LibNo')).not.toHaveValue('');
  await expect(win.getByLabel('Book Name')).not.toHaveValue('');
  await pickSecond(page, win, 'Work Done By');
  await win.getByLabel('Ank').fill('zq1');

  // Detail opens frmVishayEntry straight from the box.
  await win.getByLabel('Detail').press('F2');
  const vishay = dialog(page, 'Vishay Entry');
  await expect(vishay).toBeVisible();
  await vishay.getByRole('button', { name: 'Save & Exit' }).click();
  await expect(vishay).toBeHidden();

  // The Bhasha popup (frmDisplayTransNew).
  await win.getByLabel('Bhasha').press('F2');
  const bhasha = dialog(page, 'frmDisplayTransNew');
  await expect(bhasha.getByRole('toolbar', { name: 'Rows' })).toBeVisible();
  await bhasha.getByRole('button', { name: 'Exit' }).click();
  await answer(page, 'Are You Sure to Exit?', 'Yes');
  await expect(bhasha).toBeHidden();

  await save(page, win);
  const g = grid(page);
  await expect(g.cell(0, 'Ank')).toHaveText('zq1');
  await expect(g.cell(0, 'Seq')).toHaveText('1');

  // Edit the record.
  await g.cell(0, 'Ank').click();
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Ank').fill('zq2');
  await save(page, win);
  await expect(g.cell(0, 'Ank')).toHaveText('zq2');

  // Show All Records drops the window's condition.
  await rightClick(page, 0, 'Ank', ['Utility', 'Show All Records']);
  await expect(g.cell(5, 'MagazineVisheshKm')).toBeVisible();
  await expect(g.cell(0, 'Ank')).toHaveText('zq2');

  await g.cell(0, 'Ank').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('zq2');
});

test('English Book Vishesh: a picked book lists its rows, New keeps the book, Column No fills both boxes', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Library', 'English Book Vishesh');
  const books = page.getByRole('listbox', { name: 'List' });
  await expect(books.getByRole('option').nth(1)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Search List').press('ArrowDown');
  await page.getByLabel('Search List').press('Enter');
  const win = page.getByRole('region', { name: 'English Book Vishesh' });
  const g = grid(page);
  await expect(g.cell(0, 'EnglishBookVisheshKm')).toBeVisible();
  const topSeq = Number(await g.cell(0, 'Seq').textContent());

  await g.cell(0, 'Seq').click();
  await expect(win.getByLabel('Book Name')).not.toHaveValue('');
  const book = await win.getByLabel('Book Name').inputValue();
  await win.getByRole('button', { name: 'New' }).click();
  // btnNew_Click keeps LibNo, Book Name and Work Done By; Seq is the book's next (Seq Desc).
  await expect(win.getByLabel('Book Name')).toHaveValue(book);
  await expect(win.getByLabel('Seq/Sub Seq')).toHaveValue(String(topSeq + 1));
  await expect(win.getByLabel('Numbers')).toHaveValue('');

  await pickSecond(page, win, 'Column No/Name');
  await expect(win.getByLabel('Column No/Name')).not.toHaveValue('');
  await expect(win.getByLabel('ColumnMastKt')).not.toHaveValue('');
  await win.getByLabel('Numbers').fill('zq-e2e');
  if ((await win.getByLabel('Work Done By').inputValue()) === '')
    await pickSecond(page, win, 'Work Done By');
  await save(page, win);
  await expect(g.cell(0, 'Numbers')).toHaveText('zq-e2e');
  await expect(g.cell(0, 'Seq')).toHaveText(String(topSeq + 1));

  await g.cell(0, 'Numbers').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('zq-e2e');
});

test('Magazine Master: list, add with an MType and the Bhasha popup, edit, delete', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Library', 'Magazine Master');
  const win = page.getByRole('region', { name: 'Magazine Master' });
  const g = grid(page);
  await expect(g.cell(0, 'Magazinekm')).toBeVisible({ timeout: 30_000 });

  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('Name', { exact: true }).fill('zq-magazine');
  await win.getByLabel('Series', { exact: true }).fill('B');
  await pickSecond(page, win, 'MType');
  await expect(win.getByLabel('MType')).not.toHaveValue('');

  // The Bhasha popup (frmDisplayTransNew, SetForm_MagazineM).
  await win.getByLabel('Bhasha').press('F2');
  const bhasha = dialog(page, 'frmDisplayTransNew');
  await expect(bhasha.getByRole('toolbar', { name: 'Rows' })).toBeVisible();
  await bhasha.getByRole('button', { name: 'Exit' }).click();
  await answer(page, 'Are You Sure to Exit?', 'Yes');
  await expect(bhasha).toBeHidden();

  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  // The first save on a cold database can take longer than the MessageBox wait.
  await expect(
    page.getByRole('alert').filter({ hasText: 'Record Saved Successfully' }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await answer(page, 'Record Saved Successfully', 'OK');
  await expect(g.cell(0, 'MName')).toHaveText('zq-magazine');
  await expect(g.cell(0, 'Series')).toHaveText('B');

  // Edit the record.
  await g.cell(0, 'MName').click();
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Name', { exact: true }).fill('zq-magazine2');
  await save(page, win);
  // insertworkreports after an Edit: the work type is asked.
  const types = page.getByRole('listbox', { name: 'Work Type' });
  await expect(types.getByRole('option').first()).toBeVisible();
  await page.getByLabel('Search Work Type').fill('Modify');
  await page.getByLabel('Search Work Type').press('Enter');
  await expect(types).toBeHidden();
  await expect(g.cell(0, 'MName')).toHaveText('zq-magazine2');

  await g.cell(0, 'MName').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('zq-magazine2');
});

test('Tirth Raksha: New carries the reference, add with a popup and a Vishay box, edit, delete', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Library', 'Tirth Raksha Master');
  const win = page.getByRole('region', { name: 'Tirth Raksha Master' });
  const g = grid(page);
  await expect(g.cell(0, 'TirthRakshaKm')).toBeVisible({ timeout: 30_000 });
  const topSeq = Number(await g.cell(0, 'Seq').textContent());

  // The record on screen; New keeps its Reference, Project and Done By.
  await g.cell(0, 'Seq').click();
  await expect(win.getByLabel('Reference(P)')).not.toHaveValue('');
  const reference = await win.getByLabel('Reference(P)').inputValue();
  const doneBy = await win.getByLabel('Done By(D)').inputValue();
  await win.getByRole('button', { name: 'New' }).click();
  await expect(win.getByLabel('Seq/Book Seq')).toHaveValue(String(topSeq + 1));
  await expect(win.getByLabel('BookSeq')).not.toHaveValue('');
  await expect(win.getByLabel('Reference(P)')).toHaveValue(reference);
  await expect(win.getByLabel('Done By(D)')).toHaveValue(doneBy);
  await expect(win.getByLabel('Name(N)')).toHaveValue('');
  await win.getByLabel('Name(N)').fill('zq-tirth');
  if (doneBy === '') await pickSecond(page, win, 'Done By(D)');

  // The carried Reference rows, PageNo cleared (frmDisplayTransNew, SetForm_TirthRaksha).
  await win.getByLabel('Reference(P)').press('F2');
  const refs = dialog(page, 'frmDisplayTransNew');
  await expect(refs.getByRole('toolbar', { name: 'Rows' })).toBeVisible();
  await refs.getByRole('button', { name: 'Exit' }).click();
  await answer(page, 'Are You Sure to Exit?', 'Yes');
  await expect(refs).toBeHidden();

  // Peta Vishay opens frmVishayEntry straight from the box.
  await win.getByLabel('Peta Vishay(SS)').press('F2');
  const vishay = dialog(page, 'Vishay Entry');
  await expect(vishay).toBeVisible();
  await vishay.getByRole('button', { name: 'Save & Exit' }).click();
  await expect(vishay).toBeHidden();

  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  // The first save on a cold database can take longer than the MessageBox wait.
  await expect(
    page.getByRole('alert').filter({ hasText: 'Record Saved Successfully' }),
  ).toBeVisible({ timeout: 30_000 });
  await answer(page, 'Record Saved Successfully', 'OK');
  await expect(g.cell(0, 'TirthRakshaName')).toHaveText('zq-tirth');
  await expect(g.cell(0, 'Seq')).toHaveText(String(topSeq + 1));

  // Edit the record.
  await g.cell(0, 'TirthRakshaName').click();
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('BookSeq').fill('977');
  await save(page, win);
  await expect(g.cell(0, 'BookSeq')).toHaveText('977');

  // Group No › Add In New Group writes the group into the box.
  await rightClick(page, 0, 'TirthRakshaName', ['Group No', 'Add In New Group']);
  await answer(page, /1 Records Added in New GroupNo \d+ Successfully/, 'OK');
  await expect(win.getByLabel('GroupNo')).not.toHaveValue('');

  await g.cell(0, 'TirthRakshaName').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('zq-tirth');
});

test('Anya Bhandar: New asks the Size, add with a new obtain book and a popup, edit, delete', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  await openMenuItem(page, 'Library', 'Anya Bhandar');
  const win = page.getByRole('region', { name: 'Anya Bhandar' });
  const g = grid(page);
  await expect(g.cell(0, 'AnyaBhandarKm')).toBeVisible({ timeout: 60_000 });

  // btnNew_Click with no Size asks for one; RecordNo is the size's next.
  await win.getByRole('button', { name: 'New' }).click();
  const size = dialog(page, 'Library');
  await size.getByLabel('Please Enter Size').fill('zq');
  await size.getByRole('button', { name: 'OK' }).click();
  await expect(win.getByLabel('Size', { exact: true })).toHaveValue('zq');
  await expect(win.getByLabel('Record No')).toHaveValue('1');
  await pickSecond(page, win, 'Bhandar Name');
  await win.getByLabel('Book Name').fill('zq-anya');

  // The Bhasha popup (frmDisplayTransNew, SetForm_AnyaBhandar).
  await win.getByLabel('Bhasha', { exact: true }).press('F2');
  const bhasha = dialog(page, 'frmDisplayTransNew');
  await expect(bhasha.getByRole('toolbar', { name: 'Rows' })).toBeVisible();
  await bhasha.getByRole('button', { name: 'Exit' }).click();
  await answer(page, 'Are You Sure to Exit?', 'Yes');
  await expect(bhasha).toBeHidden();

  // A typed Book Name with no book picked adds the book in the obtain-book (OB) series.
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Do You want to Add New Book Entry?', 'Yes');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Record Saved Successfully' }),
  ).toBeVisible({ timeout: 30_000 });
  await answer(page, 'Record Saved Successfully', 'OK');
  await expect(g.cell(0, 'BookMastName')).toHaveText('zq-anya');
  await expect(g.cell(0, 'BookTName')).toHaveText(/^OB\d{5}$/);

  // Edit the record.
  await g.cell(0, 'BookMastName').click();
  await expect(win.getByLabel('Book Name')).toHaveValue('zq-anya');
  await win.getByRole('button', { name: 'Modify' }).click();
  await win.getByLabel('Record No').fill('5');
  await save(page, win);
  // insertworkreports asks for the work type only when the change calls for it.
  const types = page.getByRole('listbox', { name: 'Work Type' });
  if (await types.isVisible()) {
    await page.getByLabel('Search Work Type').fill('Modify');
    await page.getByLabel('Search Work Type').press('Enter');
    await expect(types).toBeHidden();
  }
  await expect(g.cell(0, 'RecordNo')).toHaveText('5');

  await g.cell(0, 'BookMastName').click();
  await deleteCurrent(page, win);
  await expect(page.getByRole('grid')).not.toContainText('zq-anya');
});
