import type { Attachment } from '@gglib/shared';
import { sql } from 'kysely';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { hasDb, useMasterHarness } from './master-harness.js';

/**
 * Utility › Show Attachment(s) (CommonLibrary.frmAttachments) through /api/master/<screen>/
 * attachments/<id>: the Attachments rows are rolled back after every test, the files go to a
 * temporary folder.
 */
describe.skipIf(!hasDb)('Attachments of a master record (integration)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gglib-attachments-'));
  const SHARE = '\\\\server\\Attachments\\Production';
  const h = useMasterHarness({ env: { ATTACHMENT_DIR: dir, ATTACHMENT_SHARE: SHARE } });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const author = () =>
    h.scalar(sql<{ v: number }>`SELECT TOP 1 authorcokm AS v FROM authmast ORDER BY authorcokm`);
  const data = (text: string) => Buffer.from(text).toString('base64');

  it('saves, lists, serves and deletes a file as the desktop lays it out', async () => {
    const id = await author();
    const base = `/api/master/author-master/attachments/${id}`;
    const before = ((await h.user.get(base)).body as Attachment[]).length;

    const saved = await h.user
      .post(base)
      .send({ files: [{ name: 'note 1.txt', data: data('hello') }] });
    expect(saved.status).toBe(204);
    expect(readFileSync(join(dir, 'authmast', String(id), 'note 1.txt'), 'utf8')).toBe('hello');

    const list = (await h.user.get(base)).body as Attachment[];
    expect(list).toHaveLength(before + 1);
    const row = list.at(-1)!;
    expect(row).toMatchObject({ fileName: 'note 1.txt', fileType: '.txt', exists: true });
    expect(row.entry).toMatch(/^mt\d+u\d+-\d\d\/\d\d\/\d{4} \| $/);
    const path = await sql<{ FilePath: string }>`
      SELECT FilePath FROM Attachments WHERE AttachmentKm = ${row.id}
    `.execute(h.trx);
    expect(path.rows[0]!.FilePath).toBe(`${SHARE}\\authmast/${id}/note 1.txt`);

    const file = await h.user.get(`${base}/file/${row.id}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('text/plain');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.text).toBe('hello');
    // A row of this record cannot be reached through another record or screen.
    expect(
      (await h.user.get(`/api/master/author-master/attachments/${id + 1}/file/${row.id}`)).status,
    ).toBe(404);
    expect(
      (await h.user.get(`/api/master/patrika/attachments/${id}/file/${row.id}`)).status,
    ).not.toBe(200);

    const gone = await h.user.post(`${base}/delete`).send({ ids: [row.id] });
    expect(gone.body).toEqual({ deleted: 1 });
    expect(existsSync(join(dir, 'authmast', String(id), 'note 1.txt'))).toBe(false);
    expect((await h.user.get(base)).body).toHaveLength(before);
  });

  it('downloads types that could run in the browser, and reports a missing file', async () => {
    const id = await author();
    const base = `/api/master/author-master/attachments/${id}`;
    await h.user
      .post(base)
      .send({ files: [{ name: 'page.html', data: data('<script>1</script>') }] });
    const row = ((await h.user.get(base)).body as Attachment[]).at(-1)!;
    const file = await h.user.get(`${base}/file/${row.id}`);
    expect(file.headers['content-type']).toBe('application/octet-stream');
    expect(file.headers['content-disposition']).toMatch(/^attachment/);

    rmSync(join(dir, 'authmast', String(id), 'page.html'));
    expect(((await h.user.get(base)).body as Attachment[]).at(-1)!.exists).toBe(false);
    const missing = await h.user.get(`${base}/file/${row.id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('File At Location : page.html Does Not Exists');
  });

  it('refuses names that leave the folder or do not fit the table, and screens without attachments', async () => {
    const id = await author();
    const base = `/api/master/author-master/attachments/${id}`;
    for (const name of [
      '../x.txt',
      'a/b.txt',
      'a\\b.txt',
      '..',
      `${'n'.repeat(51)}.txt`,
      'x.torrent',
    ]) {
      const res = await h.user.post(base).send({ files: [{ name, data: data('x') }] });
      expect(res.status, name).toBe(400);
    }
    expect((await h.user.get(base)).status).toBe(200);
    expect((await h.user.get('/api/master/bhasha-master/attachments/1')).status).toBe(404);
  });
});
