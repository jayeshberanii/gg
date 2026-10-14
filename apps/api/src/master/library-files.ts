import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { LibraryFolder } from '@gglib/shared';
import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { Env } from '../config/env.js';

/**
 * The desktop's file folders, as the web server reaches them. The desktop names files by its
 * own paths (\\server\share\…, F:\…), and those are what the database stores and what its lists
 * show; the web keeps showing them and maps each to the matching folder of this server.
 */
export const LIBRARY_ROOTS = {
  /** scanpath.txt's four, in its order: SN, EB, TIT, GR. */
  scan: { label: 'scan data', path: 'SCAN_PATH', dir: 'SCAN_DIR' },
  ebook: { label: 'e-book', path: 'EBOOK_PATH', dir: 'EBOOK_DIR' },
  title: { label: 'title scan', path: 'TITLE_PATH', dir: 'TITLE_DIR' },
  graphics: { label: 'graphics', path: 'GRAPHICS_PATH', dir: 'GRAPHICS_DIR' },
  /** MdlLib.ReferenceTPath. */
  referenceT: { label: 'reference scan', path: 'REFERENCET_PATH', dir: 'REFERENCET_DIR' },
  /** MdlLib.MainRoot: Graphics Detail's pictures. */
  mainRoot: { label: 'library images', path: 'MAIN_ROOT_PATH', dir: 'MAIN_ROOT_DIR' },
  /** Graphics Detail's pictures: the Y: drive of graphicbkt.filepath. */
  graphicsDrive: {
    label: 'graphics pictures',
    path: 'GRAPHICS_DRIVE_PATH',
    dir: 'GRAPHICS_DRIVE_DIR',
  },
  /** Graphics Detail's d:\tempgr. */
  tempGr: { label: 'temporary graphics', path: 'TEMPGR_PATH', dir: 'TEMPGR_DIR' },
} as const satisfies Record<string, { label: string; path: keyof Env; dir: keyof Env }>;

export type LibraryRoot = keyof typeof LIBRARY_ROOTS;

const trimSlashes = (p: string) => p.replace(/[\\/]+$/, '');
/** For comparing desktop paths: Windows ignores case and takes either slash. */
const fold = (p: string) => p.replace(/\//g, '\\').toLowerCase();

/** The folder as the desktop names it, without a trailing slash. */
export function desktopRoot(env: Env, root: LibraryRoot): string {
  return trimSlashes(env[LIBRARY_ROOTS[root].path] as string);
}

/** The folder on this server, or null when it is not configured. */
export function localRootOrNull(env: Env, root: LibraryRoot): string | null {
  const own = env[LIBRARY_ROOTS[root].dir] as string | undefined;
  if (own) return resolve(own);
  if (!env.LIBRARY_FILES_DIR) return null;
  const last = desktopRoot(env, root).split(/[\\/]/).pop() ?? root;
  return resolve(env.LIBRARY_FILES_DIR, last.replace(':', ''));
}

/** The folder on this server; 503 when it is not configured. */
export function localRoot(env: Env, root: LibraryRoot): string {
  const dir = localRootOrNull(env, root);
  if (!dir) {
    throw new ServiceUnavailableException(
      `The ${LIBRARY_ROOTS[root].label} folder is not configured on the server`,
    );
  }
  return dir;
}

/** A file or folder of this server, as the desktop would name it. */
export function toDesktopPath(env: Env, root: LibraryRoot, local: string): string {
  const rel = relative(localRoot(env, root), local);
  return rel === ''
    ? desktopRoot(env, root)
    : `${desktopRoot(env, root)}\\${rel.split(sep).join('\\')}`;
}

/**
 * A path as the desktop names it, on this server: the configured folder it is under (the first
 * of `roots` that matches), or null when it is under none of them. `..` cannot leave the folder.
 */
export function toLocalPath(
  env: Env,
  desktopPath: string,
  roots: readonly LibraryRoot[] = Object.keys(LIBRARY_ROOTS) as LibraryRoot[],
): { root: LibraryRoot; local: string } | null {
  const given = fold(desktopPath.trim());
  for (const root of roots) {
    const prefix = fold(desktopRoot(env, root));
    if (given !== prefix && !given.startsWith(`${prefix}\\`)) continue;
    const base = localRootOrNull(env, root);
    if (!base) continue;
    const rest = desktopPath
      .trim()
      .slice(prefix.length)
      .split(/[\\/]+/)
      .filter(Boolean);
    if (rest.some((part) => part === '..' || part.includes('\u0000'))) return null;
    const local = resolve(base, ...rest);
    if (local !== base && !local.startsWith(base + sep)) return null;
    return { root, local };
  }
  return null;
}

/** toLocalPath for a path that must be a configured folder's: 400 otherwise. */
export function requireLocalPath(
  env: Env,
  desktopPath: string,
  roots?: readonly LibraryRoot[],
): { root: LibraryRoot; local: string } {
  const found = toLocalPath(env, desktopPath, roots);
  if (!found) throw new BadRequestException('The path is not in one of the library folders');
  return found;
}

/** File.Exists. */
export async function isFile(local: string): Promise<boolean> {
  return stat(local).then(
    (s) => s.isFile(),
    () => false,
  );
}

/** Directory.Exists. */
export async function isDirectory(local: string): Promise<boolean> {
  return stat(local).then(
    (s) => s.isDirectory(),
    () => false,
  );
}

/**
 * A Windows search pattern (`*`, `?`) as Directory.GetFiles reads it: case does not matter, and
 * a trailing `.*` also matches names without an extension.
 */
export function windowsPattern(pattern: string): (name: string) => boolean {
  const body = pattern.endsWith('.*') ? pattern.slice(0, -2) : pattern;
  const source = [...body]
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  const re = new RegExp(`^${source}${pattern.endsWith('.*') ? '(\\..*)?' : ''}$`, 'i');
  return (name) => re.test(name);
}

type FindOptions = {
  /** SearchOption.AllDirectories (default) or TopDirectoryOnly. */
  recursive?: boolean;
  /** Keep only names this accepts (the search pattern). */
  match?: (name: string) => boolean;
};

async function walk(
  dir: string,
  want: 'files' | 'dirs',
  opts: FindOptions,
  out: string[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const wanted = entries.filter((e) => (want === 'files' ? e.isFile() : e.isDirectory()));
  for (const e of wanted) if (!opts.match || opts.match(e.name)) out.push(join(dir, e.name));
  if (opts.recursive === false) return;
  for (const e of entries) if (e.isDirectory()) await walk(join(dir, e.name), want, opts, out);
}

/** Directory.GetFiles(dir, pattern, option), as paths of this server; empty for a missing folder. */
export async function findFiles(dir: string, opts: FindOptions = {}): Promise<string[]> {
  const out: string[] = [];
  await walk(dir, 'files', opts, out);
  return out;
}

/** Directory.GetDirectories(dir, pattern, option). */
export async function findDirectories(dir: string, opts: FindOptions = {}): Promise<string[]> {
  const out: string[] = [];
  await walk(dir, 'dirs', opts, out);
  return out;
}

/**
 * A file or folder under `base` as it is really spelled on this server, or null when there is
 * none: Windows ignores case in names, and the paths the database stores were typed there.
 */
export async function actualPath(base: string, local: string): Promise<string | null> {
  const exists = (p: string) =>
    stat(p).then(
      () => true,
      () => false,
    );
  if (await exists(local)) return local;
  let current = base;
  for (const part of relative(base, local).split(sep).filter(Boolean)) {
    if (part === '..') return null;
    const exact = join(current, part);
    if (await exists(exact)) {
      current = exact;
      continue;
    }
    const names = await readdir(current).catch(() => [] as string[]);
    const found = names.find((n) => n.toLowerCase() === part.toLowerCase());
    if (found === undefined) return null;
    current = join(current, found);
  }
  return current;
}

async function existing(
  env: Env,
  desktopPath: string,
  roots: readonly LibraryRoot[] | undefined,
  is: (local: string) => Promise<boolean>,
): Promise<string | null> {
  const found = toLocalPath(env, desktopPath, roots);
  if (!found) return null;
  const actual = await actualPath(localRoot(env, found.root), found.local);
  return actual !== null && (await is(actual)) ? actual : null;
}

/** File.Exists(desktopPath): the file on this server, or null (also for a path outside the folders). */
export function existingFile(
  env: Env,
  desktopPath: string,
  roots?: readonly LibraryRoot[],
): Promise<string | null> {
  return existing(env, desktopPath, roots, isFile);
}

/** Directory.Exists(desktopPath): the folder on this server, or null. */
export function existingDirectory(
  env: Env,
  desktopPath: string,
  roots?: readonly LibraryRoot[],
): Promise<string | null> {
  return existing(env, desktopPath, roots, isDirectory);
}

/** A file the browser is to open: it must exist under a configured folder. */
export async function fileToOpen(env: Env, desktopPath: string): Promise<string> {
  requireLocalPath(env, desktopPath);
  const local = await existingFile(env, desktopPath);
  if (!local) throw new NotFoundException(`File Not Found : ${desktopPath}`);
  return local;
}

/**
 * A folder for a file dialog (OpenFileDialog over the library folders): its sub-folders and
 * files, named as the desktop names them. An empty path lists the configured folders
 * themselves, which is as far up as the dialog goes.
 */
export async function listFolder(env: Env, desktopPath: string): Promise<LibraryFolder> {
  if (desktopPath.trim() === '') {
    const seen = new Set<string>();
    const folders: LibraryFolder['folders'] = [];
    for (const root of Object.keys(LIBRARY_ROOTS) as LibraryRoot[]) {
      const local = localRootOrNull(env, root);
      const path = desktopRoot(env, root);
      if (!local || seen.has(fold(path)) || !(await isDirectory(local))) continue;
      seen.add(fold(path));
      folders.push({ name: path, path });
    }
    return { path: '', parent: null, folders, files: [] };
  }
  const { root } = requireLocalPath(env, desktopPath);
  const local = await existingDirectory(env, desktopPath);
  if (!local) throw new NotFoundException(`Folder Not Found : ${desktopPath}`);
  const entry = (f: string) => ({ name: basename(f), path: toDesktopPath(env, root, f) });
  return {
    path: toDesktopPath(env, root, local),
    parent: local === localRoot(env, root) ? '' : toDesktopPath(env, root, dirname(local)),
    folders: (await findDirectories(local, { recursive: false })).map(entry),
    files: (await findFiles(local, { recursive: false })).map(entry),
  };
}
