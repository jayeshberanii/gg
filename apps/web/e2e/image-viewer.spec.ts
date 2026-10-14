import { expect, type Page, test } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  API,
  dialog,
  grid,
  LIBRARY_DIR,
  login,
  openMenuItem,
  scenario,
  useScenario,
} from './helpers';

/**
 * The image viewer (features/master/ImageViewer.tsx, frmViewJpg's controls) that opens the
 * desktop's files where the desktop ran Process.Start: Book Master's View Image of This Book ›
 * SN here. The scan folder is LIBRARY_DIR/ScanData (\\192.168.0.50\ScanData).
 */
useScenario();

/** 40 x 30 red and 30 x 40 blue JPEGs. */
const RED =
  '/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAeACgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAUG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnQE9rwAAAAAAAAAH/9k=';
const BLUE =
  '/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAoAB4DASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAQG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AigGvTgAAAAAAAAAP/9k=';

const SCAN = join(LIBRARY_DIR, 'ScanData');

test.beforeAll(() => {
  rmSync(SCAN, { recursive: true, force: true });
  mkdirSync(SCAN, { recursive: true });
});
test.afterAll(() => rmSync(LIBRARY_DIR, { recursive: true, force: true }));

/** Book Master, with the scans of the grid's first book written to the scan folder. */
async function openWithScans(page: Page) {
  await login(page, scenario.users.reporter);
  const listed = page.waitForResponse(
    (r) => r.url().endsWith('/master/book-master/list') && r.request().method() === 'POST',
  );
  await openMenuItem(page, 'Library', 'Book Master');
  const rows = (await (await listed).json()) as { txtBookTran: string | null }[];
  const libNos = (rows[0]?.txtBookTran ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  expect(libNos.length).toBeGreaterThan(0);
  // SN: the folders named after a LibNo at the top of the scan folder.
  for (const libNo of libNos) {
    const folder = join(SCAN, `${libNo}_e2e`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, '001.jpg'), Buffer.from(RED, 'base64'));
    writeFileSync(join(folder, '002.jpg'), Buffer.from(BLUE, 'base64'));
  }
  await expect(grid(page).cell(0, 'txtBookName')).not.toBeEmpty({ timeout: 30_000 });
  await grid(page).cell(0, 'txtBookName').click();
}

async function viewScans(page: Page) {
  await grid(page).cell(0, 'txtBookName').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'For Current Record' }).hover();
  await page.getByRole('menuitem', { name: 'View Image of This Book' }).hover();
  await page.getByRole('menuitem', { name: 'SN', exact: true }).click();
}

test('View Image of This Book opens the picked scan in the image viewer', async ({ page }) => {
  await openWithScans(page);
  await viewScans(page);

  // The desktop's list of the files comes first; the picked one opens in the viewer.
  const list = page.getByRole('listbox', { name: 'List' });
  const second = list.getByRole('option', { name: /002\.jpg/ });
  await expect(second).toBeVisible({ timeout: 30_000 });
  await second.dblclick();

  const viewer = dialog(page, 'View Image of This Book - SN');
  await expect(viewer).toBeVisible();
  const picture = viewer.getByRole('img', { name: '002.jpg' });
  await expect(picture).toBeVisible();
  await expect(picture).toHaveJSProperty('naturalWidth', 30);
  const position = viewer.getByLabel('Position');
  await expect(position).toContainText('File 2 of 2');

  // Previous / Next Page move through the list; the ends disable them.
  const controls = viewer.getByRole('toolbar', { name: 'Picture controls' });
  await expect(controls.getByRole('button', { name: 'Next Page' })).toBeDisabled();
  await controls.getByRole('button', { name: 'Previous Page' }).click();
  await expect(viewer.getByRole('img', { name: '001.jpg' })).toHaveJSProperty('naturalWidth', 40);
  await expect(position).toContainText('File 1 of 2');
  await expect(controls.getByRole('button', { name: 'Previous Page' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(position).toContainText('File 2 of 2');

  // Zoom: the menu's sizes, Actual Size, and Zoom In / Out by a quarter.
  await controls.getByRole('button', { name: 'Zoom ▾' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Actual Size' }).click();
  await expect(position).toContainText('100 %');
  await controls.getByRole('button', { name: 'Zoom In' }).click();
  await expect(position).toContainText('125 %');
  await controls.getByRole('button', { name: 'Zoom Out' }).click();
  await expect(position).toContainText('100 %');
  await controls.getByRole('button', { name: 'Zoom ▾' }).click();
  // 100 % is frmViewJpg's 800 x 600 box: the 30 x 40 picture fills its height, 1500 %.
  await page.getByRole('menuitemcheckbox', { name: '100 %', exact: true }).click();
  await expect(position).toContainText('1500 %');

  // Closing the viewer brings the list back, as after the desktop's viewer; Esc there ends it.
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(list).toBeVisible();
  await page.getByLabel('Search List').press('Escape');
  await expect(list).toBeHidden();
});

test("Graphics Detail: the picture opens in the viewer over its master record's pictures", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, scenario.users.reporter);
  const listed = page.waitForResponse(
    (r) => r.url().endsWith('/master/graphics-detail/list') && r.request().method() === 'POST',
    { timeout: 90_000 },
  );
  await openMenuItem(page, 'Graphics', 'Graphics Detail');
  const rows = (await (await listed).json()) as { graphicBkTkm: number }[];

  // The first of the newest rows whose Graphics Master record has two or more pictures on Y:,
  // with those files written to the e2e copy of the drive.
  type Pictures = { rows: [number, string, number | null, string][] };
  let row = -1;
  let pictures: Pictures['rows'] = [];
  for (let i = 0; i < Math.min(rows.length, 40) && row < 0; i++) {
    const res = await page.request.post(
      `${API}/api/master/graphics-detail/action/master-pictures`,
      {
        data: { ids: [], params: { current: rows[i]!.graphicBkTkm } },
      },
    );
    const got = ((await res.json()) as Pictures).rows;
    // The row itself must have a picture (an empty box opens nothing).
    const own = got.some((p) => Number(p[0]) === Number(rows[i]!.graphicBkTkm));
    if (own && got.length >= 2 && got.every((p) => /^Y:\\/i.test(p[1]))) {
      row = i;
      pictures = got;
    }
  }
  expect(row).toBeGreaterThanOrEqual(0);
  for (const [, path] of pictures) {
    const local = join(LIBRARY_DIR, 'Y', ...path.slice(3).split('\\'));
    mkdirSync(join(local, '..'), { recursive: true });
    writeFileSync(local, Buffer.from(RED, 'base64'));
  }
  const at = pictures.findIndex((p) => Number(p[0]) === Number(rows[row]!.graphicBkTkm));
  const nameOf = (path: string) => path.slice(path.lastIndexOf('\\') + 1);

  const det = page.getByRole('region', { name: 'Graphics Detail' });
  // AG Grid draws only the rows in view: scroll down until the row is there.
  const mainGrid = det.getByRole('grid').last();
  const target = mainGrid.locator(`[row-index="${row}"] [col-id="graphicBkTkm"]`);
  for (let tries = 0; tries < 40 && (await target.count()) === 0; tries++) {
    await mainGrid.evaluate((el) =>
      el
        .closest('.ag-root-wrapper')
        ?.querySelector('.ag-grid-viewport, .ag-body-viewport')
        ?.scrollBy(0, 200),
    );
  }
  await target.click();
  const box = det.getByRole('button', { name: 'Picture', exact: true });
  await expect(box).toHaveAttribute('title', pictures[at]![1]);
  await box.click();

  const viewer = dialog(page, 'frmViewJpg');
  await expect(viewer).toBeVisible();
  const position = viewer.getByLabel('Position');
  await expect(position).toContainText(`File ${at + 1} of ${pictures.length}`);
  await expect(viewer.getByRole('img', { name: nameOf(pictures[at]![1]) })).toHaveJSProperty(
    'naturalWidth',
    40,
  );
  // Next Page goes on to the master record's next picture (or Previous Page from the last).
  const controls = viewer.getByRole('toolbar', { name: 'Picture controls' });
  const step = at + 1 < pictures.length ? 1 : -1;
  await controls.getByRole('button', { name: step > 0 ? 'Next Page' : 'Previous Page' }).click();
  await expect(position).toContainText(`File ${at + 1 + step} of ${pictures.length}`);
  await expect(viewer.getByRole('img', { name: nameOf(pictures[at + step]![1]) })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(det).toBeVisible();
});
