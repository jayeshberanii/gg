import type { GridRow, LibraryFolder } from '@gglib/shared';
import { sql } from 'kysely';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasDb, SECURITY, useMasterHarness } from './master-harness.js';

/**
 * Graphics Detail's menu items that work on the pictures themselves (graphics-detail-files.ts):
 * the records are rolled back after every test, the files live in a temporary folder that stands
 * for the desktop's Y: drive, d:\tempgr and the other graphics folders.
 */
describe.skipIf(!hasDb)('Graphics Detail: the pictures on disk (integration)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gglib-graphics-'));
  const Y = join(dir, 'Y');
  const TEMP = join(dir, 'tempgr');
  const h = useMasterHarness({
    env: {
      LIBRARY_FILES_DIR: dir,
      GRAPHICS_DRIVE_PATH: 'Y:',
      GRAPHICS_DRIVE_DIR: Y,
      TEMPGR_PATH: 'd:\\tempgr',
      TEMPGR_DIR: TEMP,
      MAIN_ROOT_DIR: join(dir, 'LibraryImages'),
      GRAPHICS_DIR: join(dir, 'Graphics'),
      SCAN_DIR: join(dir, 'ScanData'),
    },
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const d of [Y, TEMP, join(dir, 'ScanData')]) mkdirSync(d, { recursive: true });
  });

  const API = '/api/master/graphics-detail';
  const LIB = 'ZQF0001';
  const file = (name: string, text = name, lib = LIB) => {
    mkdirSync(join(Y, lib), { recursive: true });
    writeFileSync(join(Y, lib, name), text);
  };
  const action = (name: string, ids: number[], params: Record<string, unknown> = {}) =>
    h.user.post(`${API}/action/${name}`).send({ ids, params });
  const ids = (rows: GridRow[]) => rows.map((r) => Number(r.graphicBkTkm)).sort((a, b) => a - b);

  /** A Graphics Master record with its own LibNo (no book behind it). */
  async function parent(libno = LIB) {
    const { rows } = await sql<{ id: number }>`
      INSERT INTO GraphicBKM (recno, bkname, BookTKt, libno, enuser, endate)
      OUTPUT INSERTED.graphicBkm AS id VALUES (4321, N'zq-files', 0, ${libno}, 1, GETDATE())
    `.execute(h.trx);
    return Number(rows[0]!.id);
  }

  async function picture(g: number, refplace: string, filepath: string, extra = {}) {
    const v = { comment: '', tempselected: null as string | null, locked: 0, ...extra };
    const { rows } = await sql<{ id: number }>`
      INSERT INTO graphicbkt (recno, refplace, filepath, Graphickt, comment, tempselected, Locked, enuser, endate)
      OUTPUT INSERTED.graphicBkTkm AS id
      VALUES (1, ${refplace}, ${filepath}, ${g}, ${v.comment}, ${v.tempselected}, ${v.locked}, 1, GETDATE())
    `.execute(h.trx);
    return Number(rows[0]!.id);
  }

  const column = async (id: number, name: 'filepath' | 'comment' | 'tempselected') =>
    (
      await sql<{ v: string | null }>`
        SELECT ${sql.ref(name)} AS v FROM graphicbkt WHERE graphicBkTkm = ${id}`.execute(h.trx)
    ).rows[0]!.v;

  it("lists the master record's pictures for the viewer, in RecNo order", async () => {
    const g = await parent();
    const other = await parent('ZQF0002');
    const add = async (gk: number, recno: number | null, filepath: string, refplace = '') =>
      Number(
        (
          await sql<{ id: number }>`
            INSERT INTO graphicbkt (recno, refplace, filepath, Graphickt, enuser, endate)
            OUTPUT INSERTED.graphicBkTkm AS id
            VALUES (${recno}, ${refplace}, ${filepath}, ${gk}, 1, GETDATE())`.execute(h.trx)
        ).rows[0]!.id,
      );
    const third = await add(g, 3, `Y:\\${LIB}\\c.jpg`, 'p3');
    const first = await add(g, 1, `Y:\\${LIB}\\a.jpg`, 'p1');
    await add(g, 2, '');
    const none = await add(g, null, `Y:\\${LIB}\\z.jpg`);
    await add(other, 1, 'Y:\\ZQF0002\\x.jpg');

    const res = await action('master-pictures', [], { current: third });
    expect(res.status).toBe(200);
    // Only the record's own master's, with a file; no RecNo goes last.
    expect(res.body).toEqual({
      kind: 'table',
      title: 'Pictures',
      columns: ['Id', 'FileName', 'RecNo', 'RefPlace'],
      rows: [
        [first, `Y:\\${LIB}\\a.jpg`, 1, 'p1'],
        [third, `Y:\\${LIB}\\c.jpg`, 3, 'p3'],
        [none, `Y:\\${LIB}\\z.jpg`, null, ''],
      ],
    });
    // No such record: nothing to step through.
    expect((await action('master-pictures', [], { current: 0 })).body).toMatchObject({ rows: [] });
  });

  it('serves a picture by its desktop path, whatever the case, and lists the folders', async () => {
    file('P1.JPG', 'jpeg-bytes');
    const got = await h.user.get(`${API}/library-file`).query({ path: `y:\\${LIB}\\p1.jpg` });
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.body.toString()).toBe('jpeg-bytes');
    expect(
      (await h.user.get(`${API}/library-file`).query({ path: `Y:\\${LIB}\\none.jpg` })).status,
    ).toBe(404);
    expect(
      (await h.user.get(`${API}/library-file`).query({ path: 'C:\\Windows\\win.ini' })).status,
    ).toBe(400);
    expect(
      (await h.user.get(`${API}/library-file`).query({ path: `Y:\\${LIB}\\..\\..\\x` })).status,
    ).toBe(400);

    const top = (await h.user.get(`${API}/library-folder`)).body as LibraryFolder;
    expect(top.folders.map((f) => f.path)).toEqual(expect.arrayContaining(['Y:', 'd:\\tempgr']));
    const made = await action('make-folder', [], { path: 'Y:', name: 'For Print' });
    expect(made.status).toBe(200);
    expect(existsSync(join(Y, 'For Print'))).toBe(true);
    expect((await action('make-folder', [], { path: 'Y:', name: 'for print' })).status).toBe(400);
    expect((await action('make-folder', [], { path: 'Y:', name: '..\\x' })).status).toBe(400);
    // Only the graphics folders can be written to.
    const scan = '\\\\192.168.0.50\\ScanData';
    expect((await action('make-folder', [], { path: scan, name: 'x' })).status).toBe(400);
    const inside = (await h.user.get(`${API}/library-folder`).query({ path: `Y:\\${LIB}` }))
      .body as LibraryFolder;
    expect(inside).toMatchObject({ path: `Y:\\${LIB}`, parent: 'Y:' });
    expect(inside.files).toEqual([{ name: 'P1.JPG', path: `Y:\\${LIB}\\P1.JPG` }]);
  });

  it('shows the pictures of the selected rows and saves Temp Selected', async () => {
    const g = await parent();
    const a = await picture(g, 'p1', `Y:\\${LIB}\\p1.jpg`);
    const blank = await picture(g, 'p2', '');
    const b = await picture(g, 'p3', `Y:\\${LIB}\\p3.jpg`, { tempselected: 'old' });

    const shown = await action('show-pictures', [b, blank, a]);
    expect(shown.body).toMatchObject({
      kind: 'table',
      columns: ['Id', 'FileName', 'LibNo', 'RefPlace', 'RecNo'],
      rows: [
        [b, `Y:\\${LIB}\\p3.jpg`, LIB, 'p3', 1],
        [a, `Y:\\${LIB}\\p1.jpg`, LIB, 'p1', 1],
      ],
    });

    const saved = await action('save-temp-selected', [a, b], { name: 'for-book' });
    expect(saved.body.kind).toBe('refreshed');
    expect(await column(a, 'tempselected')).toBe(' for-book');
    expect(await column(b, 'tempselected')).toBe('old for-book');
    // Nothing ticked, or nothing typed: nothing happens (the desktop failed on `in ()`).
    expect((await action('save-temp-selected', [], { name: 'x' })).body.message).toBe('');
    expect((await action('save-temp-selected', [a], { name: 'x'.repeat(260) })).status).toBe(400);
  });

  it('finds the rows whose file is gone, deleted pictures and files no record names', async () => {
    const g = await parent();
    file('p1.jpg');
    file('P2.JPG');
    file('loose.jpg');
    file('notes.txt');
    const a = await picture(g, 'p1', `Y:\\${LIB}\\p1.jpg`);
    const b = await picture(g, 'p2', `Y:\\${LIB}\\p2.jpg`);
    const gone = await picture(g, 'p3', `Y:\\${LIB}\\p3.jpg`);
    const blank = await picture(g, 'p4', '');
    const outside = await picture(g, 'p5', 'C:\\Users\\user\\Pictures\\x.PNG');

    const all = await action('file-not-found', [a, b]);
    expect(all.body).toEqual({ kind: 'message', message: 'All File Exists in The Dirctory' });
    const missing = await action('file-not-found', [a, b, gone, blank, outside]);
    expect(missing.body.kind).toBe('list');
    expect(ids(missing.body.rows)).toEqual([gone, blank, outside].sort((x, y) => x - y));

    const deleted = await action('deleted-picture', [], { current: a });
    expect(deleted.body.kind).toBe('list');
    expect(ids(deleted.body.rows)).toEqual([gone]);
    // A blank path, as Directory.GetFiles("") on the desktop; a folder that is not there.
    const illegal = await action('deleted-picture', [], { current: blank });
    expect(illegal.status).toBe(400);
    expect(illegal.body.message).toBe('The path is not of a legal form.');
    const nowhere = await picture(g, 'p6', 'Y:\\ZQNOWHERE\\p6.jpg');
    expect((await action('deleted-picture', [], { current: nowhere })).body.message).toBe(
      "Could not find a part of the path 'Y:\\ZQNOWHERE\\'.",
    );

    const loose = await action('not-linked-files', [], { current: a });
    expect(loose.body).toEqual({
      kind: 'message',
      message: `Not Linked Files Are \nY:\\${LIB}\\loose.jpg`,
    });
    await picture(g, 'p7', `y:\\${LIB}\\LOOSE.JPG`);
    const linked = 'All Files in current folder are linked with records';
    expect((await action('not-linked-files', [], { current: a })).body.message).toBe(linked);
    expect((await action('not-linked-files', [], { current: blank })).body.message).toBe(linked);
  });

  it('copies the selected pictures to the user’s tempgr folder, emptying it first', async () => {
    const g = await parent();
    file('p1.jpg', 'one');
    file('p2.jpg', 'two');
    const a = await picture(g, 'p1', `Y:\\${LIB}\\p1.jpg`);
    const b = await picture(g, 'p2', `Y:\\${LIB}\\P2.JPG`);
    const gone = await picture(g, 'p3', `Y:\\${LIB}\\p3.jpg`);

    const first = await action('copy-to-tempgr', [a]);
    expect(first.body.kind).toBe('table');
    const shown = String(first.body.title);
    expect(shown).toMatch(/^d:\\tempgr\\\d+$/);
    const folder = join(TEMP, shown.split('\\').pop()!);
    expect(readdirSync(folder)).toEqual([`${a}.jpg`]);
    writeFileSync(join(folder, 'stale.txt'), 'x');

    const second = await action('copy-to-tempgr', [b, gone]);
    expect(second.body.rows).toEqual([[b, `${shown}\\${b}.jpg`, LIB, 'p2', 1]]);
    expect(readdirSync(folder)).toEqual([`${b}.jpg`]);
    expect(readFileSync(join(folder, `${b}.jpg`), 'utf8')).toBe('two');
    // The originals stay.
    expect(readFileSync(join(Y, LIB, 'p1.jpg'), 'utf8')).toBe('one');
    const copy = await h.user.get(`${API}/library-file`).query({ path: `${shown}\\${b}.jpg` });
    expect(copy.body.toString()).toBe('two');
  });

  it('counts each sub-folder’s images against the records', async () => {
    const g = await parent('ZQF0002');
    file('a.jpg', 'a', 'ZQF0002');
    file('b.JPG', 'b', 'ZQF0002');
    file('c.png', 'c', 'ZQF0002');
    mkdirSync(join(Y, 'ZQF0003'));
    await picture(g, 'a', 'Y:\\ZQF0002\\a.jpg');
    await picture(g, 'x', 'Y:\\zqf0003\\x.jpg');
    await picture(g, 'y', 'Y:\\ZQF0003\\y.jpg');

    const res = await action('image-count-mismatch', [], { folder: 'Y:' });
    expect(res.body).toMatchObject({
      kind: 'table',
      columns: ['FileName', 'Count', 'Database count', 'Diff'],
      rows: [
        ['ZQF0002', 2, 1, 1],
        ['ZQF0003', 0, 2, -2],
        ['Total', 2, 3, -1],
      ],
    });
    expect((await action('image-count-mismatch', [], { folder: 'Y:\\none' })).status).toBe(400);
    expect((await action('image-count-mismatch', [], { folder: 'C:\\' })).status).toBe(400);
  });

  it('fills blank file paths from the book’s folder', async () => {
    const g = await parent();
    file('p1.jpg');
    file('p2.BMP');
    file('p3.png');
    file('p5.gif');
    const a = await picture(g, 'p1', '');
    const b = await picture(g, 'p2', '');
    const c = await picture(g, 'p3', '');
    const none = await picture(g, 'p4', '');
    const gif = await picture(g, 'p5', '');
    const kept = await picture(g, 'p1', `Y:\\${LIB}\\other.jpg`);
    const all = [a, b, c, none, gif, kept];

    expect((await action('update-blank-filepath', all, { graphickt: g, libNo: LIB })).status).toBe(
      401,
    );
    expect(await column(a, 'filepath')).toBe('');
    const res = await action('update-blank-filepath', all, {
      graphickt: g,
      libNo: LIB,
      password: SECURITY,
    });
    expect(res.body.kind).toBe('refreshed');
    expect(ids(res.body.rows)).toEqual(all);
    expect(await column(a, 'filepath')).toBe(`Y:\\${LIB}\\p1.jpg`);
    expect(await column(b, 'filepath')).toBe(`Y:\\${LIB}\\p2.bmp`);
    expect(await column(c, 'filepath')).toBe(`Y:\\${LIB}\\p3.png`);
    expect(await column(none, 'filepath')).toBe('');
    expect(await column(gif, 'filepath')).toBe('');
    expect(await column(kept, 'filepath')).toBe(`Y:\\${LIB}\\other.jpg`);
    // A Lib No that climbs out of the drive finds nothing.
    const d = await picture(g, 'p1', '');
    await action('update-blank-filepath', [d], {
      graphickt: g,
      libNo: `..\\Y\\${LIB}`,
      password: SECURITY,
    });
    expect(await column(d, 'filepath')).toBe('');
    expect(
      (await action('update-blank-filepath', [], { graphickt: 0, libNo: '', password: SECURITY }))
        .body.message,
    ).toBe('Please Enter Lib No');
  });

  it('sends the selected pictures to a folder and notes the prefix in the comment', async () => {
    const g = await parent();
    file('p1.jpg', 'one');
    file('p2.jpg', 'two');
    mkdirSync(join(Y, 'Out'));
    const a = await picture(g, 'p1', `Y:\\${LIB}\\p1.jpg`);
    const b = await picture(g, 'p2', `Y:\\${LIB}\\p2.jpg`, { comment: 'seen' });
    const gone = await picture(g, 'p3', `Y:\\${LIB}\\p3.jpg`, { comment: 'kept' });

    const res = await action('send-image-to-folder', [a, b, gone], {
      folder: 'Y:\\out',
      prefix: '13102026 Ravi',
    });
    expect(res.body).toMatchObject({
      kind: 'table',
      title: 'List',
      rows: [[`Y:\\Out\\13102026 Ravi ${LIB} p1.jpg`], [`Y:\\Out\\13102026 Ravi ${LIB} p2.jpg`]],
    });
    expect(readFileSync(join(Y, 'Out', `13102026 Ravi ${LIB} p2.jpg`), 'utf8')).toBe('two');
    expect(await column(a, 'comment')).toBe('13102026 Ravi');
    expect(await column(b, 'comment')).toBe('seen,13102026 Ravi');
    expect(await column(gone, 'comment')).toBe('kept');

    // Outside the graphics folders, a missing folder, or a prefix that is a path: nothing is copied.
    for (const params of [
      { folder: '\\\\192.168.0.50\\ScanData', prefix: 'x' },
      { folder: 'Y:\\nowhere', prefix: 'x' },
      { folder: 'C:\\Users', prefix: 'x' },
      { folder: 'Y:\\Out', prefix: '..\\x' },
      { folder: 'Y:\\Out', prefix: 'a/b' },
    ]) {
      expect((await action('send-image-to-folder', [a], params)).status).toBe(400);
    }
    expect(readdirSync(join(Y, 'Out'))).toHaveLength(2);
    expect(readdirSync(join(dir, 'ScanData'))).toHaveLength(0);
    expect(await column(a, 'comment')).toBe('13102026 Ravi');
  });

  it('renames the current row’s file, on disk and in the record or in the record only', async () => {
    const g = await parent();
    file('p1.jpg', 'one');
    file('taken.jpg', 'taken');
    const a = await picture(g, 'p1', `Y:\\${LIB}\\P1.JPG`);
    const locked = await picture(g, 'p9', `Y:\\${LIB}\\taken.jpg`, { locked: 1 });
    const blank = await picture(g, 'p8', '');
    const rename = (current: number, name: string, physical: boolean) =>
      action('rename-file', [current], { current, name, physical });

    const both = await rename(a, 'front.jpg', true);
    expect(both.body.kind).toBe('refreshed');
    expect(ids(both.body.rows)).toEqual([a]);
    expect(await column(a, 'filepath')).toBe(`Y:\\${LIB}\\front.jpg`);
    expect(readdirSync(join(Y, LIB)).sort()).toEqual(['front.jpg', 'taken.jpg']);
    expect(readFileSync(join(Y, LIB, 'front.jpg'), 'utf8')).toBe('one');

    // Another file has the name (in any case): neither the file nor the record changes.
    const clash = await rename(a, 'TAKEN.jpg', true);
    expect(clash.status).toBe(400);
    expect(clash.body.message).toBe('Cannot create a file when that file already exists.');
    expect(await column(a, 'filepath')).toBe(`Y:\\${LIB}\\front.jpg`);
    expect(readFileSync(join(Y, LIB, 'taken.jpg'), 'utf8')).toBe('taken');
    // A change of case only is a rename.
    await rename(a, 'Front.JPG', true);
    expect(readdirSync(join(Y, LIB)).sort()).toEqual(['Front.JPG', 'taken.jpg']);

    // No: only the record.
    await rename(a, 'record-only.jpg', false);
    expect(await column(a, 'filepath')).toBe(`Y:\\${LIB}\\record-only.jpg`);
    expect(readdirSync(join(Y, LIB)).sort()).toEqual(['Front.JPG', 'taken.jpg']);
    // Yes for a file that is not there.
    const lost = await rename(a, 'x.jpg', true);
    expect(lost.status).toBe(400);
    expect(lost.body.message).toBe(`Could not find file 'Y:\\${LIB}\\record-only.jpg'.`);
    expect(await column(a, 'filepath')).toBe(`Y:\\${LIB}\\record-only.jpg`);

    for (const name of ['..\\x.jpg', 'a/b.jpg', '..', 'a:b.jpg']) {
      expect((await rename(a, name, false)).status).toBe(400);
    }
    expect((await rename(locked, 'y.jpg', true)).body.message).toBe('A selected record is Locked');
    expect((await rename(blank, 'y.jpg', true)).body).toEqual({
      kind: 'message',
      message: 'No Files Found',
    });
    expect(readdirSync(join(Y, LIB)).sort()).toEqual(['Front.JPG', 'taken.jpg']);
  });

  it('renames the selected rows’ files after their Ref Place', async () => {
    const g = await parent();
    file('scan01.jpg', 'one');
    file('scan02.jpg', 'two');
    file('p3.jpg', 'three');
    file('scan04.jpg', 'four');
    file('p4.JPG', 'other');
    const a = await picture(g, 'p1', `Y:\\${LIB}\\scan01.jpg`);
    const b = await picture(g, 'p2', `Y:\\${LIB}\\SCAN02.JPG`);
    const same = await picture(g, 'p3', `Y:\\${LIB}\\p3.jpg`);
    const taken = await picture(g, 'p4', `Y:\\${LIB}\\scan04.jpg`);
    const noRef = await picture(g, '', `Y:\\${LIB}\\scan01.jpg`);
    const blank = await picture(g, 'p6', '');
    const gone = await picture(g, 'p7', `Y:\\${LIB}\\scan07.jpg`);
    const all = [a, b, same, taken, noRef, blank, gone];

    const res = await action('rename-with-refplace', all);
    expect(res.body.kind).toBe('refreshed');
    expect(res.body.message).toBe(`Could not find file 'Y:\\${LIB}\\scan07.jpg'.`);
    expect(await column(a, 'filepath')).toBe(`Y:\\${LIB}\\p1.JPG`);
    expect(await column(b, 'filepath')).toBe(`Y:\\${LIB}\\p2.JPG`);
    // A file of that name is already there (p3.jpg itself, p4.JPG): left alone.
    expect(await column(same, 'filepath')).toBe(`Y:\\${LIB}\\p3.jpg`);
    expect(await column(taken, 'filepath')).toBe(`Y:\\${LIB}\\scan04.jpg`);
    expect(await column(noRef, 'filepath')).toBe(`Y:\\${LIB}\\scan01.jpg`);
    expect(await column(gone, 'filepath')).toBe(`Y:\\${LIB}\\scan07.jpg`);
    expect(readdirSync(join(Y, LIB)).sort()).toEqual(
      ['p1.JPG', 'p2.JPG', 'p3.jpg', 'p4.JPG', 'scan04.jpg'].sort(),
    );
    expect(readFileSync(join(Y, LIB, 'p2.JPG'), 'utf8')).toBe('two');
    expect(readFileSync(join(Y, LIB, 'p4.JPG'), 'utf8')).toBe('other');

    const locked = await picture(g, 'p9', `Y:\\${LIB}\\scan04.jpg`, { locked: 1 });
    expect((await action('rename-with-refplace', [locked])).status).toBe(400);
  });
});
