import type { ActionResult, LibraryFolder } from '@gglib/shared';
import { sql } from 'kysely';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { referencePages } from '../src/master/reference-images.js';
import { hasDb, useMasterHarness } from './master-harness.js';

const SCAN = '\\\\server\\ScanData';
const EBOOK = '\\\\server\\B2 Ebook';
const TITLE = '\\\\server\\ScanTitle';
const REFERENCE = 'F:\\scantesting';

/**
 * An uncompressed 8-bit grey TIFF with one page per value (each 2 x 1 pixels of it): sharp
 * reads multi-page TIFFs but cannot write them.
 */
function multiPageTiff(values: number[]): Buffer {
  const ENTRIES = 9;
  const ifdSize = 2 + ENTRIES * 12 + 4;
  const pageSize = ifdSize + 2;
  const buf = Buffer.alloc(8 + values.length * pageSize);
  buf.write('II', 0, 'latin1');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(8, 4);
  values.forEach((value, i) => {
    const ifd = 8 + i * pageSize;
    const pixels = ifd + ifdSize;
    const tags: [number, number, number][] = [
      [256, 3, 2], // ImageWidth
      [257, 3, 1], // ImageLength
      [258, 3, 8], // BitsPerSample
      [259, 3, 1], // Compression: none
      [262, 3, 1], // PhotometricInterpretation: BlackIsZero
      [273, 4, pixels], // StripOffsets
      [277, 3, 1], // SamplesPerPixel
      [278, 3, 1], // RowsPerStrip
      [279, 4, 2], // StripByteCounts
    ];
    buf.writeUInt16LE(ENTRIES, ifd);
    tags.forEach(([tag, type, v], t) => {
      const at = ifd + 2 + t * 12;
      buf.writeUInt16LE(tag, at);
      buf.writeUInt16LE(type, at + 2);
      buf.writeUInt32LE(1, at + 4);
      if (type === 3) buf.writeUInt16LE(v, at + 8);
      else buf.writeUInt32LE(v, at + 8);
    });
    const next = i + 1 < values.length ? ifd + pageSize : 0;
    buf.writeUInt32LE(next, ifd + 2 + ENTRIES * 12);
    buf.writeUInt8(value, pixels);
    buf.writeUInt8(value, pixels + 1);
  });
  return buf;
}

describe('RefrenceT page numbers', () => {
  it('reads single pages, comma lists and from-to ranges', () => {
    expect(referencePages('3')).toEqual(['3']);
    expect(referencePages(' 1, 4 ')).toEqual(['1', '4']);
    expect(referencePages('10-12')).toEqual(['10', '11', '12']);
    expect(referencePages('1-3,7')).toEqual(['1', '2', '3', '7']);
    // lstRange(0) + a is a number: leading zeros go.
    expect(referencePages('008-9')).toEqual(['8', '9']);
    expect(referencePages('5-3')).toEqual([]);
    expect(referencePages('a-b')).toEqual(['a-b']);
    expect(referencePages('1-2-3')).toEqual(['1-2-3']);
    expect(referencePages('1-999999')).toHaveLength(1001);
  });
});

/**
 * The menu items that read the desktop's file folders (docs/screens/book-master.md,
 * author-master.md, prakashak-master.md, inward-master.md): the folders are a temporary
 * directory, the database rows are rolled back after every test.
 */
describe.skipIf(!hasDb)('Library folders behind the master screens (integration)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gglib-library-'));
  const h = useMasterHarness({
    env: {
      LIBRARY_FILES_DIR: dir,
      SCAN_PATH: SCAN,
      EBOOK_PATH: EBOOK,
      TITLE_PATH: TITLE,
      REFERENCET_PATH: REFERENCE,
    },
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => {
    for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true });
    for (const name of ['ScanData', 'B2 Ebook', 'ScanTitle', 'scantesting'])
      mkdirSync(join(dir, name));
  });

  /** Writes an (empty) file of the temporary folders. */
  const file = (...parts: string[]) => {
    const path = join(dir, ...parts);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'x');
  };
  const action = async (screen: string, name: string, params: object = {}, ids: number[] = []) => {
    const res = await h.user.post(`/api/master/${screen}/action/${name}`).send({ ids, params });
    return { status: res.status, body: res.body as ActionResult & { message?: string } };
  };
  /** A book with at least two library numbers, and those. */
  const book = async () => {
    const { rows } = await sql<{ id: number; libNos: string }>`
      SELECT TOP 1 BookMastkm AS id, txtBookTran AS libNos FROM BookM
      WHERE txtBookTran LIKE '_______,_______%' AND txtBookTran NOT LIKE '% %'
        AND (SELECT COUNT(*) FROM BookT WHERE BookMastkt = BookMastkm) >= 2
      ORDER BY BookMastkm`.execute(h.trx);
    const libNos = rows[0]!.libNos.split(',');
    return { id: Number(rows[0]!.id), first: libNos[0]!, second: libNos[1]! };
  };
  /** A BookT row whose LibNo no other row has, with this Mixsign. */
  const bookT = async (mixsign: string | null, skip: number[] = []) => {
    const { rows } = await sql<{ tid: number; Libno: string }>`
      SELECT TOP 1 tid, Libno FROM BookT b
      WHERE LEN(Libno) = 7 AND Libno NOT LIKE 'SN%' AND Libno NOT LIKE 'EB%' AND Libno NOT LIKE '%[_ ]%'
        AND (SELECT COUNT(*) FROM BookT o WHERE o.Libno = b.Libno) = 1
        AND tid NOT IN (${sql.join(skip.length ? skip : [0])})
      ORDER BY tid`.execute(h.trx);
    const row = { tid: Number(rows[0]!.tid), libNo: rows[0]!.Libno };
    await sql`UPDATE BookT SET Mixsign = ${mixsign} WHERE tid = ${row.tid}`.execute(h.trx);
    return row;
  };
  const mixsign = async (tid: number) =>
    (
      await sql<{ m: string | null }>`SELECT Mixsign AS m FROM BookT WHERE tid = ${tid}`.execute(
        h.trx,
      )
    ).rows[0]!.m;

  it('View Image of This Book lists the files of the type and serves them', async () => {
    const b = await book();
    // SN: the folders named after a LibNo at the top of the scan folder (the second LibNo's
    // here: the first has nothing).
    file('ScanData', `${b.second}_dummy`, '001.jpg');
    file('ScanData', `${b.second}_dummy`, '002.tif');
    file('ScanData', `${b.second}_dummy`, 'note.txt');
    file('ScanData', 'deep', `${b.first}_dummy`, '001.jpg');
    file('B2 Ebook', 'sub', `${b.first}.pdf`);

    const sn = await action('book-master', 'view-image', { type: 'SN', current: b.id });
    expect(sn.body).toEqual({
      kind: 'table',
      title: 'List',
      columns: ['FileName'],
      rows: [[`${SCAN}\\${b.second}_dummy\\001.jpg`], [`${SCAN}\\${b.second}_dummy\\002.tif`]],
    });
    const eb = await action('book-master', 'view-image', { type: 'eb', current: b.id });
    expect(eb.body).toMatchObject({ rows: [[`${EBOOK}\\sub\\${b.first}.pdf`]] });
    // Nothing found: nothing happens.
    const tit = await action('book-master', 'view-image', { type: 'TIT', current: b.id });
    expect(tit.body).toEqual({ kind: 'message', message: '' });
    expect((await action('book-master', 'view-image', { type: 'XX', current: b.id })).status).toBe(
      400,
    );

    const open = (path: string) =>
      h.user.get(`/api/master/book-master/library-file?path=${encodeURIComponent(path)}`);
    const jpg = await open(`${SCAN}\\${b.second}_dummy\\001.jpg`);
    expect(jpg.status).toBe(200);
    expect(jpg.headers['content-type']).toBe('image/jpeg');
    expect((await open(`${SCAN}\\${b.second}_dummy\\none.jpg`)).status).toBe(404);
    expect((await open(`${SCAN}\\..\\secret.txt`)).status).toBe(400);
    expect((await open('C:\\Windows\\win.ini')).status).toBe(400);
  });

  it('serves each page of a multi-page scan, and tells the viewer how many there are', async () => {
    const folder = join(dir, 'ScanData', 'X0000001_multi');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'pages.tif'), multiPageTiff([10, 200, 90]));
    writeFileSync(join(folder, 'broken.tif'), 'x');
    file('ScanData', 'X0000001_multi', '001.jpg');
    file('B2 Ebook', 'X0000001.pdf');
    file('ScanData', 'X0000001_multi', 'note.doc');
    const tif = `${SCAN}\\X0000001_multi\\pages.tif`;
    const q = (path: string, extra = '') =>
      `/api/master/book-master/library-file${extra}?path=${encodeURIComponent(path)}`;
    const info = async (path: string) => (await h.user.get(q(path, '/info'))).body as unknown;

    expect(await info(tif)).toEqual({ kind: 'image', pages: 3 });
    expect(await info(`${SCAN}\\X0000001_multi\\001.jpg`)).toEqual({ kind: 'image', pages: 1 });
    expect(await info(`${EBOOK}\\X0000001.pdf`)).toEqual({ kind: 'pdf', pages: 1 });
    expect(await info(`${SCAN}\\X0000001_multi\\note.doc`)).toEqual({ kind: 'other', pages: 1 });
    expect((await h.user.get(q(`${SCAN}\\X0000001_multi\\none.tif`, '/info'))).status).toBe(404);
    expect((await h.user.get(q(`${SCAN}\\X0000001_multi\\broken.tif`, '/info'))).status).toBe(422);

    // Each page comes back as its own PNG: the grey values differ page to page.
    const sharp = (await import('sharp')).default;
    const grey = async (page: string) => {
      const res = await h.user
        .get(`${q(tif)}&page=${page}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      const { data } = await sharp(res.body as Buffer)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return data[0];
    };
    expect(await grey('0')).toBe(10);
    expect(await grey('1')).toBe(200);
    expect(await grey('2')).toBe(90);
    expect((await h.user.get(`${q(tif)}&page=-1`)).status).toBe(400);
    expect((await h.user.get(`${q(tif)}&page=9`)).status).toBe(422);
    expect((await h.user.get(q(`${SCAN}\\X0000001_multi\\broken.tif`))).status).toBe(422);
  });

  it('Check For Image adds SN / EB / TIT for what the folders hold', async () => {
    const b = await book();
    const check = async (sign: string) =>
      (await action('book-master', 'check-image', { current: b.id, sign })).body;
    // Nothing anywhere: the box keeps its text.
    expect(await check('P')).toEqual({ kind: 'message', message: 'P' });

    // SN wants more than one folder or file named after the LibNo; one folder is not enough.
    file('ScanData', `${b.first}_dummy`, '001.jpg');
    expect(await check('')).toEqual({ kind: 'message', message: '' });
    file('ScanData', `${b.first}_dummy`, `${b.first}_001.jpg`);
    file('ScanData', `${b.first}_dummy`, `${b.first}_002.jpg`);
    file('B2 Ebook', 'deep', 'er', `x${b.second.toLowerCase()}_book.pdf`);
    expect(await check('')).toEqual({ kind: 'message', message: 'SN,EB' });
    file('ScanTitle', `${b.second}`, 'title.jpg');
    // Per LibNo in turn, after what the box held.
    expect(await check('P,{L MS}')).toEqual({ kind: 'message', message: 'P,{L MS},SN,EB,TIT' });
  });

  it('ScanData Folder Info lists the books of the folders at the top of the scan folder', async () => {
    expect((await action('book-master', 'scan-folder-info')).body).toEqual({
      kind: 'message',
      message: 'Files Not Found',
    });
    const t = await bookT(null);
    file('ScanData', `${t.libNo}_some book`, '001.jpg');
    file('ScanData', 'short', '001.jpg');
    // Only the top folders count, and only names longer than 7 characters.
    file('ScanData', 'short', 'ZZZZZZZ_inner', '001.jpg');
    const info = (await action('book-master', 'scan-folder-info')).body;
    expect(info).toMatchObject({
      kind: 'table',
      columns: [
        'BookName',
        'Libno',
        'Part',
        'PSamvatVK',
        'TotalPages',
        'txtPrakashak',
        'txtAuthor',
        'Avrutiname',
      ],
    });
    if (info.kind !== 'table') throw new Error('expected a table');
    expect(info.rows).toHaveLength(1);
    expect(info.rows[0]![1]).toBe(t.libNo);
  });

  it('BookT › Utility: SN / EB in the folder but not in the mix sign, listed then added', async () => {
    const plain = await bookT(',L MS,');
    const empty = await bookT(null, [plain.tid]);
    const signed = await bookT(',EB,SN(SC),', [plain.tid, empty.tid]);
    const find = async (type: string, update = false) =>
      (await action('book-tran', 'mixsign-in-path', { type, ...(update ? { update } : {}) })).body;

    // An empty folder.
    expect(await find('SN')).toEqual({ kind: 'message', message: 'No Records Found' });
    for (const t of [plain, empty, signed]) file('ScanData', `${t.libNo}_name_gg`, '001.jpg');
    // Names that start with the type itself are not library numbers.
    file('ScanData', 'SN00001_x', '001.jpg');
    const listed = await find('SN');
    expect(listed).toMatchObject({
      kind: 'table',
      columns: ['Tid', 'SNLIbNo'],
      emptyMessage: 'No Records Found',
    });
    if (listed.kind !== 'table') throw new Error('expected a table');
    expect(listed.rows).toHaveLength(2);
    expect(listed.rows).toEqual(
      expect.arrayContaining([
        [plain.tid, plain.libNo],
        [empty.tid, empty.libNo],
      ]),
    );
    // Listing changes nothing.
    expect(await mixsign(plain.tid)).toBe(',L MS,');

    expect(await find('SN', true)).toEqual({
      kind: 'message',
      message: 'Records Added Successfully',
    });
    expect(await mixsign(plain.tid)).toBe(',L MS,SN,');
    expect(await mixsign(empty.tid)).toBe(',SN,');
    expect(await mixsign(signed.tid)).toBe(',EB,SN(SC),');
    expect(await find('SN')).toMatchObject({ kind: 'table', rows: [] });

    // EB: the .pdf files anywhere under the e-book folder, named <LibNo>_….
    file('B2 Ebook', 'a', 'b', `${plain.libNo}_book.PDF`);
    file('B2 Ebook', 'a', `${signed.libNo}_book.pdf`);
    file('B2 Ebook', 'a', `${empty.libNo}_book.txt`);
    expect(await find('EB')).toEqual({
      kind: 'table',
      title: 'frmBookTranNew',
      columns: ['Tid', 'EB LIbNo'],
      rows: [[plain.tid, plain.libNo]],
      emptyMessage: 'No Records Found',
    });
    expect((await action('book-tran', 'mixsign-in-path', { type: 'TIT' })).status).toBe(400);
  });

  it('BookT › Utility: SN / EB in the mix sign with nothing in the folder', async () => {
    const withFolder = await bookT(',SN,');
    const without = await bookT(',print1,SN(Tif-clear),EB(o),', [withFolder.tid]);
    const other = await bookT(',LW,', [withFolder.tid, without.tid]);
    file('ScanData', `${withFolder.libNo}_name`, '001.jpg');
    const sn = (await action('book-tran', 'mixsign-not-in-path', { type: 'SN' })).body;
    expect(sn).toMatchObject({ kind: 'table', columns: ['BookTKt', 'SN LIbNo'] });
    if (sn.kind !== 'table') throw new Error('expected a table');
    const tids = sn.rows.map((r) => r[0]);
    expect(sn.rows).toContainEqual([without.tid, without.libNo]);
    expect(tids).not.toContain(withFolder.tid);
    expect(tids).not.toContain(other.tid);

    file('B2 Ebook', `${without.libNo}_book.pdf`);
    const eb = (await action('book-tran', 'mixsign-not-in-path', { type: 'EB' })).body;
    if (eb.kind !== 'table') throw new Error('expected a table');
    expect(eb.rows.map((r) => r[0])).not.toContain(without.tid);
  });

  it('Show Image of RefrenceT: the pages the selected records reference', async () => {
    const tableKt = await h.scalar(
      sql`SELECT ColumnMastkm FROM columnmaster WHERE Vibhag = 'TableNm' AND Name = 'PrakMast'`,
    );
    const author = await h.scalar(sql`SELECT TOP 1 authorcokm FROM authmast ORDER BY authorcokm`);
    const prakashak = await h.scalar(
      sql`SELECT TOP 1 prakcodekm FROM prakmast WHERE prakcodekm <> ${author} ORDER BY prakcodekm`,
    );
    const reference = (record: number, libNo: string, pgNo: string) =>
      sql`INSERT INTO RefrenceT (Tablekt, RecordKt, LibNo, Pgno, Seq)
          VALUES (${tableKt}, ${record}, ${libNo}, ${pgNo}, 1)`.execute(h.trx);
    await reference(author, 'ZZ90001', '1-3,7');
    await reference(author, 'ZZ90002', '5');
    await reference(author, '', '9');
    await reference(prakashak + 1_000_000, 'ZZ90001', '2');
    // The first folder anywhere under the path with "<LibNo>_" in its name; File.Exists does
    // not mind the case of the name.
    file('scantesting', 'box 1', 'ZZ90001_scan', '1.jpg');
    file('scantesting', 'box 1', 'ZZ90001_scan', '2.JPG');
    file('scantesting', 'box 1', 'ZZ90001_scan', '7.jpg');

    const shown = (await action('author-master', 'refrence-images', {}, [author])).body;
    if (shown.kind !== 'table') throw new Error('expected a table');
    expect(shown.columns).toEqual(['FileName']);
    const folder = `${REFERENCE}\\box 1\\ZZ90001_scan`;
    expect(shown.rows).toEqual([[`${folder}\\1.jpg`], [`${folder}\\2.JPG`], [`${folder}\\7.jpg`]]);
    expect(shown.message).toMatch(/^Following Files Not Found : \r\n/);
    expect(shown.message).toContain(`${folder}\\3.jpg\r\n`);
    // No such folder: <ReferenceTPath>\<LibNo>.
    expect(shown.message).toContain(`${REFERENCE}\\ZZ90002\\5.jpg\r\n`);
    const image = await h.user.get(
      `/api/master/author-master/library-file?path=${encodeURIComponent(`${folder}\\2.JPG`)}`,
    );
    expect(image.status).toBe(200);

    // Prakashak Master reads the same rows: both forms use the 'PrakMast' TableKt, so an author
    // and a prakashak with the same id share their references (as on the desktop).
    const same = (await action('prakashak-master', 'refrence-images', {}, [author])).body;
    expect(same).toMatchObject({ kind: 'table', rows: shown.rows });
    // A record without references: the form opens empty.
    const none = (await action('prakashak-master', 'refrence-images', {}, [prakashak])).body;
    expect(none).toEqual({
      kind: 'table',
      title: 'frmDisplayImages',
      columns: ['FileName'],
      rows: [],
    });
  });

  it("PC Location's file dialog lists the library folders and nothing else", async () => {
    file('ScanData', 'C000001_x', '001.jpg');
    file('ScanData', 'C000001_x', 'inner', '002.jpg');
    file('ScanData', 'readme.txt');
    const list = async (path?: string) => {
      const query = path === undefined ? '' : `?path=${encodeURIComponent(path)}`;
      const res = await h.user.get(`/api/master/inward-master/library-folder${query}`);
      return { status: res.status, body: res.body as LibraryFolder };
    };
    // The configured folders that exist here.
    const roots = await list();
    expect(roots.body).toEqual({
      path: '',
      parent: null,
      folders: [SCAN, EBOOK, TITLE, REFERENCE].map((p) => ({ name: p, path: p })),
      files: [],
    });
    expect((await list(SCAN.toUpperCase())).body).toEqual({
      path: SCAN,
      parent: '',
      folders: [{ name: 'C000001_x', path: `${SCAN}\\C000001_x` }],
      files: [{ name: 'readme.txt', path: `${SCAN}\\readme.txt` }],
    });
    expect((await list(`${SCAN}\\C000001_x\\`)).body).toEqual({
      path: `${SCAN}\\C000001_x`,
      parent: SCAN,
      folders: [{ name: 'inner', path: `${SCAN}\\C000001_x\\inner` }],
      files: [{ name: '001.jpg', path: `${SCAN}\\C000001_x\\001.jpg` }],
    });
    expect((await list(`${SCAN}\\missing`)).status).toBe(404);
    expect((await list(`${SCAN}\\..`)).status).toBe(400);
    expect((await list('C:\\Windows')).status).toBe(400);
    expect((await list('/etc')).status).toBe(400);
  });
});
