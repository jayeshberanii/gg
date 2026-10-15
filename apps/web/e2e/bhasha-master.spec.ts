import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  answer,
  chooseSearchBy,
  dialog,
  grid,
  login,
  openMenuItem,
  scenario,
  useScenario,
} from './helpers';

/**
 * Master › Bhasha Master (frmBhashaMaster), the pilot screen for the generic master engine
 * (MasterScreen / useMasterScreen), in a real browser against the real API and database.
 */
useScenario();

async function openScreen(page: Page, username = scenario.users.reporter) {
  await login(page, username);
  await openMenuItem(page, 'Master', 'Bhasha Master');
  return page.getByRole('region', { name: 'Bhasha Master' });
}

test('validates before saving, then adds a record that appears at the top of the grid', async ({
  page,
}) => {
  const win = await openScreen(page);
  await win.getByRole('button', { name: 'New' }).click();

  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Please Enter Letter Type', 'OK');

  const name = `Zzqweb e2e ${Date.now() % 100000}`;
  await win.getByLabel('Name').fill(name);
  await win.getByLabel('Brief').fill('added by the browser test');
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');

  const g = grid(page);
  await expect(g.cell(0, 'bhashaname')).toHaveText(name);
});

test('picks the Up Level with F2, modifies a record, and edits are locked to one user', async ({
  page,
  browser,
}) => {
  const win = await openScreen(page);
  await win.getByRole('button', { name: 'New' }).click();
  const name = `Zzqweb f2 ${Date.now() % 100000}`;
  await win.getByLabel('Name').fill(name);

  await win.getByLabel('Up Level').press('F2');
  const list = page.getByRole('listbox', { name: 'Up Level' });
  await expect(list.getByRole('option').nth(1)).toBeVisible();
  const search = page.getByLabel('Search Up Level');
  // Row 0 is the field's own "clear the value" blank row (frmList1's boolAddBlankRow); the
  // first real entry is row 1.
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(list).toBeHidden();
  await expect(win.getByLabel('Up Level')).not.toHaveValue('');

  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');

  // A second, different user cannot claim the record this page is now editing.
  await win.getByRole('button', { name: 'Modify' }).click();
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const otherWin = await openScreen(otherPage, scenario.users.admin);
  const g = grid(otherPage);
  await expect(g.cell(0, 'bhashaname')).toHaveText(name);
  await g.cell(0, 'bhashaname').click();
  await otherWin.getByRole('button', { name: 'Modify' }).click();
  await answer(otherPage, /Record is in used by - /, 'OK');
  await otherContext.close();

  await win.getByLabel('Brief').fill('now edited');
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');
});

test('deletes only with the correct Security password', async ({ page }) => {
  const win = await openScreen(page);
  await win.getByRole('button', { name: 'New' }).click();
  const name = `Zzqweb del ${Date.now() % 100000}`;
  await win.getByLabel('Name').fill(name);
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');

  const g = grid(page);
  await expect(g.cell(0, 'bhashaname')).toHaveText(name);
  await g.cell(0, 'bhashaname').click();

  await win.getByRole('button', { name: 'Delete' }).click();
  await answer(page, 'Are You Sure to Delete This Record?', 'Yes');
  const security = dialog(page, 'Security');
  await expect(security).toBeVisible();

  await security.getByLabel('Password').fill('nope');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Invalid security password', 'OK');
  // The Security dialog stays open for another try.
  await expect(security).toBeVisible();

  await security.getByLabel('Password').fill('e2e-security-pw');
  await security.getByRole('button', { name: 'Ok' }).click();
  await answer(page, 'Record Deleted', 'OK');
  await expect(page.getByRole('gridcell', { name })).toHaveCount(0);
});

test('filters the grid from the search box, like the DataView filter', async ({ page }) => {
  const win = await openScreen(page);
  await win.getByRole('button', { name: 'New' }).click();
  const stamp = Date.now() % 100000;
  await win.getByLabel('Name').fill(`Zzqweb search ${stamp}`);
  await win.getByRole('button', { name: 'Save' }).click();
  await answer(page, 'Are You Sure to Save This Record?', 'Yes');
  await answer(page, 'Record Saved Successfully', 'OK');

  const search = win.getByLabel('Search', { exact: true });
  await search.fill(`Zzqweb search ${stamp}`);
  const g = grid(page);
  await expect(g.cell(0, 'bhashaname')).toHaveText(`Zzqweb search ${stamp}`);
  await expect(win.getByLabel('Total Records')).toHaveText('1');

  await search.fill('');
  await expect(win.getByLabel('Total Records')).not.toHaveText('1');
});

test('grid: a header click sorts, F3 shows the cell in frmBixtextbox, and Ctrl+/- zooms', async ({
  page,
}) => {
  await openScreen(page);
  const g = grid(page);
  const gridEl = page.getByRole('grid');

  // dgMain is bound and its columns are SortMode.Automatic, so the header sorts.
  const before = await g.cell(0, 'bhashaname').innerText();
  await gridEl.getByRole('columnheader', { name: 'Name' }).click();
  await expect(g.cell(0, 'bhashaname')).not.toHaveText(before);
  const ascending = await g.cell(0, 'bhashaname').innerText();
  await gridEl.getByRole('columnheader', { name: 'Name' }).click();
  await expect(g.cell(0, 'bhashaname')).not.toHaveText(ascending);

  // FullRowSelect: clicking a cell selects the whole row.
  await g.cell(0, 'bhashaname').click();
  await expect(gridEl.locator('.ag-row-selected')).toHaveCount(1);

  // clsCommon.DataGridView_KeyDown: F3 opens the value in frmBixtextbox; dgMain is ReadOnly, so
  // there is no Save.
  const value = await g.cell(0, 'bhashaname').innerText();
  await page.keyboard.press('F3');
  const big = dialog(page, 'Name');
  await expect(big.getByLabel('Name')).toHaveValue(value);
  await expect(big.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await big.getByText('Close', { exact: true }).click();

  // Ctrl+= / Ctrl+- grow and shrink the grid font by 2pt.
  const rowHeight = async () => (await g.cell(0, 'bhashaname').boundingBox())?.height ?? 0;
  const normal = await rowHeight();
  await page.keyboard.press('Control+=');
  await expect.poll(rowHeight).toBeGreaterThan(normal);
  await page.keyboard.press('Control+-');
  await expect.poll(rowHeight).toBe(normal);
});

test('F3 in a text box opens its text in frmBixtextbox, and Save writes it back', async ({
  page,
}) => {
  const win = await openScreen(page);
  await win.getByRole('button', { name: 'New' }).click();
  await win.getByLabel('Brief').fill('typed in the box');

  // clsCommon.Txt_KeyDown: the box is not ReadOnly, so the window has Save.
  await win.getByLabel('Brief').press('F3');
  const big = dialog(page, 'Brief');
  await expect(big.getByLabel('Brief')).toHaveValue('typed in the box');
  await big.getByLabel('Brief').fill('edited in the big box');
  await big.getByText('Save', { exact: true }).click();
  await expect(win.getByLabel('Brief')).toHaveValue('edited in the big box');
  await expect(win.getByLabel('Brief')).toBeFocused();

  // Close leaves the box as it was.
  await win.getByLabel('Brief').press('F3');
  const box = big.getByLabel('Brief');

  // frmBixtextbox.txtSearch_KeyDown: F7 finds a text (ignoring case), F8 the next one.
  await box.fill('one Two three two');
  await box.press('F7');
  const ask = dialog(page, 'Search');
  await ask.getByRole('textbox').fill('two');
  await ask.getByRole('button', { name: 'OK' }).click();
  const selection = () =>
    box.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);
  await expect.poll(selection).toEqual([4, 7]);
  await box.press('F8');
  await expect.poll(selection).toEqual([14, 17]);

  // SetFont: 15pt, Ctrl + adds 10pt and Ctrl - takes it off, never below 15pt; Ctrl+M
  // maximizes (20pt) and the title bar's button restores.
  const fontSize = () => box.evaluate((el) => getComputedStyle(el).fontSize);
  expect(await fontSize()).toBe('20px');
  await box.press('Control+=');
  await expect.poll(fontSize).toBe('33.3333px');
  await box.press('Control+-');
  await box.press('Control+-');
  await expect.poll(fontSize).toBe('20px');
  await box.press('Control+m');
  await expect.poll(fontSize).toBe('26.6667px');
  await big.getByRole('button', { name: 'Restore Down' }).click();
  await expect.poll(fontSize).toBe('20px');

  await box.fill('thrown away');
  await big.getByText('Close', { exact: true }).click();
  await expect(win.getByLabel('Brief')).toHaveValue('edited in the big box');
});

test('dgMain is MultiSelect: Ctrl-click, Shift-click, Shift+arrows and Ctrl+A', async ({
  page,
}) => {
  await openScreen(page);
  const g = grid(page);
  const gridEl = page.getByRole('grid');
  const selected = gridEl.locator('.ag-row-selected');
  const isSelected = (row: number) =>
    expect(gridEl.locator(`.ag-row[row-index="${row}"]`)).toHaveClass(/ag-row-selected/);

  await g.cell(0, 'bhashaname').click();
  await expect(selected).toHaveCount(1);
  await g.cell(2, 'bhashaname').click({ modifiers: ['Control'] });
  await expect(selected).toHaveCount(2);
  await isSelected(0);
  await isSelected(2);

  // Shift-click runs from the anchor (the last row clicked without Shift) to the clicked row.
  await g.cell(4, 'bhashaname').click({ modifiers: ['Shift'] });
  await expect(selected).toHaveCount(3);
  for (const row of [2, 3, 4]) await isSelected(row);

  // A plain click selects only that row again; Shift+Down stretches the selection.
  await g.cell(1, 'bhashaname').click();
  await expect(selected).toHaveCount(1);
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(selected).toHaveCount(3);
  for (const row of [1, 2, 3]) await isSelected(row);
  // Down without Shift collapses it to the new current row.
  await page.keyboard.press('ArrowDown');
  await expect(selected).toHaveCount(1);
  await isSelected(4);

  await page.keyboard.press('Control+a');
  await expect(gridEl.locator('.ag-row:not(.ag-row-selected)')).toHaveCount(0);
});

test('the Search By F2 list picks several values: Ctrl-click, then Enter in the grid', async ({
  page,
}) => {
  const win = await openScreen(page);
  await chooseSearchBy(win, 'Name');
  await win.getByLabel('Search', { exact: true }).press('F2');
  const list = page.getByRole('listbox', { name: 'Name' });
  await expect(list.getByRole('option').nth(3)).toBeVisible({ timeout: 30_000 });

  const nameOf = async (row: number) =>
    (await list.getByRole('option').nth(row).locator('td').first().innerText()).trim();
  const first = await nameOf(0);
  const third = await nameOf(2);
  await list.getByRole('option').nth(0).click();
  await list
    .getByRole('option')
    .nth(2)
    .click({ modifiers: ['Control'] });
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(2);
  // Shift+Down in the grid stretches from the anchor (row 2) to row 3.
  await page.keyboard.press('Shift+ArrowDown');
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(2);
  await page.keyboard.press('Shift+ArrowUp');
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(1);
  await list
    .getByRole('option')
    .nth(0)
    .click({ modifiers: ['Control'] });
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(2);

  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();

  const names = page.getByRole('grid').locator('.ag-row [col-id="bhashaname"]');
  await expect
    .poll(async () => new Set(await names.allInnerTexts()))
    .toEqual(new Set([first, third]));
});

/** Press the left button on `from`, move through to `to` (or a point), and let go. */
async function drag(
  page: Page,
  from: Locator,
  to: Locator | { x: number; y: number },
  opts: { ctrl?: boolean; holdMs?: number } = {},
) {
  const a = (await from.boundingBox())!;
  let end: { x: number; y: number };
  if ('x' in to) end = to;
  else {
    const b = (await to.boundingBox())!;
    end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  if (opts.ctrl) await page.keyboard.down('Control');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  if (opts.holdMs) await page.waitForTimeout(opts.holdMs);
  await page.mouse.up();
  if (opts.ctrl) await page.keyboard.up('Control');
}

test('dgMain: click and drag selects the rows passed over, scrolling past the edge', async ({
  page,
}) => {
  const win = await openScreen(page);
  const g = grid(page);
  const gridEl = page.getByRole('grid');
  const selected = gridEl.locator('.ag-row-selected');
  const row = (i: number) => gridEl.locator(`.ag-row[row-index="${i}"]`);

  await g.cell(0, 'bhashaname').click();
  await drag(page, g.cell(1, 'bhashaname'), g.cell(4, 'bhashaname'));
  await expect(selected).toHaveCount(4);
  for (const i of [1, 2, 3, 4]) await expect(row(i)).toHaveClass(/ag-row-selected/);
  // The current row (and the loaded record) stays where the button went down.
  await expect(row(1).locator('.ag-cell-focus')).toHaveCount(1);

  // Dragging back up shrinks the selection again.
  await drag(page, g.cell(4, 'bhashaname'), g.cell(2, 'bhashaname'));
  await expect(selected).toHaveCount(3);
  for (const i of [2, 3, 4]) await expect(row(i)).toHaveClass(/ag-row-selected/);

  // With Ctrl held the rows already selected stay.
  await drag(page, g.cell(7, 'bhashaname'), g.cell(8, 'bhashaname'), { ctrl: true });
  await expect(selected).toHaveCount(5);
  await expect(row(2)).toHaveClass(/ag-row-selected/);
  await expect(row(8)).toHaveClass(/ag-row-selected/);

  // Held below the grid, it scrolls down to the last row, selecting all the way.
  const total = Number(await win.getByLabel('Total Records').innerText());
  const box = (await gridEl.boundingBox())!;
  await drag(
    page,
    g.cell(0, 'bhashaname'),
    { x: box.x + 100, y: box.y + box.height + 60 },
    {
      holdMs: 3000,
    },
  );
  await expect(row(total - 1)).toHaveClass(/ag-row-selected/);
  await expect(gridEl.locator('.ag-row:not(.ag-row-selected)')).toHaveCount(0);
});

test('the F2 list: click and drag selects the rows passed over, then Enter picks them', async ({
  page,
}) => {
  const win = await openScreen(page);
  await chooseSearchBy(win, 'Name');
  await win.getByLabel('Search', { exact: true }).press('F2');
  const list = page.getByRole('listbox', { name: 'Name' });
  const options = list.getByRole('option');
  const chosen = list.locator('[aria-selected="true"]');
  await expect(options.nth(5)).toBeVisible({ timeout: 30_000 });

  await drag(page, options.nth(1), options.nth(3));
  await expect(chosen).toHaveCount(3);
  await drag(page, options.nth(5), options.nth(5));
  await expect(chosen).toHaveCount(1);
  await drag(page, options.nth(0), options.nth(1), { ctrl: true });
  await expect(chosen).toHaveCount(3);

  const names = await Promise.all(
    [0, 1, 5].map(async (i) => (await options.nth(i).locator('td').first().innerText()).trim()),
  );
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  const shown = page.getByRole('grid').locator('.ag-row [col-id="bhashaname"]');
  await expect.poll(async () => new Set(await shown.allInnerTexts())).toEqual(new Set(names));
});

test('the fields panel stretches sideways to fill a wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const win = await openScreen(page);
  const name = win.getByLabel('Name');
  await expect(name).toBeVisible();
  const atWide = (await name.boundingBox())!;

  await page.setViewportSize({ width: 1400, height: 1000 });
  await expect.poll(async () => (await name.boundingBox())!.width).toBeLessThan(atWide.width);
  const atNarrow = (await name.boundingBox())!;
  // Positions and widths scale together; the row stays where the designer put it.
  expect(atNarrow.x).toBeLessThan(atWide.x);
  expect(atNarrow.y).toBeCloseTo(atWide.y, 0);
});

test('Search By is a SuggestAppend combo: typing suggests and completes, arrows and Alt+Down pick', async ({
  page,
}) => {
  const win = await openScreen(page);
  const box = win.getByRole('combobox', { name: 'Search By', exact: true });
  const list = page.getByRole('listbox', { name: 'Search By list' });

  // Typing "na": every column that starts with it is listed, and the box completes the first.
  await box.pressSequentially('na');
  await expect(list).toBeVisible();
  const names = await list.getByRole('option').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(n.toLowerCase().startsWith('na')).toBe(true);
  await expect(box).toHaveValue(`na${names[0]!.slice(2)}`);

  // Down highlights the first suggestion and shows it; Enter takes it.
  await box.press('ArrowDown');
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await box.press('Enter');
  await expect(list).toBeHidden();
  await expect(box).toHaveValue(names[0]!);

  // Alt+Down drops the whole list (with the blank first row); Esc closes it.
  await box.press('Alt+ArrowDown');
  await expect(list.getByRole('option')).toHaveCount(await list.getByRole('option').count());
  expect(await list.getByRole('option').count()).toBeGreaterThan(names.length);
  await box.press('Escape');
  await expect(list).toBeHidden();

  // Text that is no column clears the choice when the box is left.
  await box.fill('zzqnothing');
  await box.press('Tab');
  await expect(box).toHaveValue('');

  // With no list open, Down steps to the next column.
  await box.focus();
  await box.press('ArrowDown');
  await expect(box).not.toHaveValue('');
});
