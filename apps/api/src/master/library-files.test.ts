import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import {
  findDirectories,
  findFiles,
  localRootOrNull,
  toDesktopPath,
  toLocalPath,
  windowsPattern,
} from './library-files.js';

const base = {
  JWT_SECRET: 'x'.repeat(32),
  DB_HOST: 'h',
  DB_NAME: 'd',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
};

describe('library files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gglib-files-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const env = loadEnv({ ...base, LIBRARY_FILES_DIR: dir, EBOOK_DIR: join(dir, 'books') });

  it('places each folder under LIBRARY_FILES_DIR unless it has its own', () => {
    expect(localRootOrNull(env, 'scan')).toBe(join(dir, 'ScanData'));
    expect(localRootOrNull(env, 'ebook')).toBe(join(dir, 'books'));
    expect(localRootOrNull(env, 'mainRoot')).toBe(join(dir, 'LibraryImages'));
    expect(localRootOrNull(loadEnv(base), 'scan')).toBeNull();
  });

  it('maps desktop paths both ways and never leaves the folder', () => {
    const local = join(dir, 'ScanData', 'B0001_x', '001.jpg');
    expect(toDesktopPath(env, 'scan', local)).toBe('\\\\192.168.0.50\\ScanData\\B0001_x\\001.jpg');
    expect(toLocalPath(env, '\\\\192.168.0.50\\SCANDATA/B0001_x\\001.jpg')).toEqual({
      root: 'scan',
      local,
    });
    expect(toLocalPath(env, 'i:\\libraryimages\\a.jpg')?.root).toBe('mainRoot');
    expect(toLocalPath(env, '\\\\192.168.0.50\\ScanData\\..\\x')).toBeNull();
    expect(toLocalPath(env, '\\\\192.168.0.50\\ScanDataOther\\x')).toBeNull();
    expect(toLocalPath(env, 'C:\\Windows\\win.ini')).toBeNull();
  });

  it('matches Windows search patterns', () => {
    const m = windowsPattern('*B0001*.*');
    expect(m('xb0001_name')).toBe(true);
    expect(m('B0001.pdf')).toBe(true);
    expect(m('B0002.pdf')).toBe(false);
    expect(windowsPattern('*.jpg')('a.JPG')).toBe(true);
    expect(windowsPattern('a?.txt')('ab.txt')).toBe(true);
  });

  it('finds files and folders like Directory.GetFiles / GetDirectories', async () => {
    mkdirSync(join(dir, 'ScanData', 'B0001_x', 'inner'), { recursive: true });
    writeFileSync(join(dir, 'ScanData', 'B0001_x', '002.jpg'), '');
    writeFileSync(join(dir, 'ScanData', 'B0001_x', 'inner', '001.jpg'), '');
    const root = join(dir, 'ScanData');
    expect(await findDirectories(root, { recursive: false })).toEqual([join(root, 'B0001_x')]);
    expect(await findFiles(root)).toEqual([
      join(root, 'B0001_x', '002.jpg'),
      join(root, 'B0001_x', 'inner', '001.jpg'),
    ]);
    expect(await findFiles(root, { recursive: false })).toEqual([]);
    expect(await findFiles(join(root, 'missing'))).toEqual([]);
  });
});
