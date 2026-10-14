import type { GridValue, SessionUser } from '@gglib/shared';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';
import { copyFile, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Env } from '../../config/env.js';
import { type Executor, idList, inTransaction } from '../../db/legacy-sql.js';
import {
  desktopRoot,
  existingDirectory,
  existingFile,
  findDirectories,
  findFiles,
  type LibraryRoot,
  localRoot,
  toDesktopPath,
  toLocalPath,
  windowsPattern,
} from '../library-files.js';
import { int, scalar, text } from './book-common.js';
import type { ActionContext, ActionResult } from './registry.js';

/**
 * frmGraphicsDetail's menu items that work on the pictures themselves (graphicbkt.filepath), on
 * this server's copies of the desktop's folders (library-files.ts). The database keeps the paths
 * as the desktop writes them (`Y:\<LibNo>\<file>`). See docs/screens/graphics-detail.md.
 */

/** The folders these items may change files in: the pictures' drive and the other graphics folders. */
const WRITE_ROOTS: readonly LibraryRoot[] = ['graphicsDrive', 'graphics', 'mainRoot', 'tempGr'];

const toIds = (list: readonly number[]) => idList(list.length ? list : [0]);
const fold = (p: string) => p.replace(/\//g, '\\').toLowerCase();
/** Substring(0, InStrRev(path, "\")): the folder, with its last backslash. */
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('\\') + 1);
/** Substring(InStrRev(path, "\")): the file name. */
const nameOf = (path: string) => path.slice(path.lastIndexOf('\\') + 1);
const jpg = windowsPattern('*.jpg');

/** Directory.GetFiles / FileSystem.RenameFile's own messages (the desktop shows them in a MsgBox). */
const noFolder = (path: string) =>
  new BadRequestException(`Could not find a part of the path '${path}'.`);
const noFile = (path: string) => `Could not find file '${path}'.`;

/** A file name, not a path: nothing Windows refuses in a name. */
function isFileName(name: string): boolean {
  if (name.trim() === '' || /^\.+$/.test(name.trim())) return false;
  return ![...name].some((c) => '\\/:*?"<>|'.includes(c) || c.charCodeAt(0) < 32);
}

type Picture = {
  id: number;
  filepath: string;
  refplace: string;
  recno: GridValue;
  comment: string;
  libno: string;
};

/**
 * The selected rows in the order they were selected, each with its book's LibNo (the form's
 * `CASE WHEN ISNULL(BookT.LibNo,'')='' THEN GraphicBKM.libno ELSE BookT.LibNo END`).
 */
async function pictures(db: Executor, ids: readonly number[]): Promise<Picture[]> {
  const { rows } = await sql<{
    id: number;
    filepath: string | null;
    refplace: string | null;
    recno: number | null;
    comment: string | null;
    libno: string | null;
  }>`
    SELECT T.graphicBkTkm AS id, T.filepath, T.refplace, T.recno, T.comment,
      CASE WHEN ISNULL(BookT.LibNo, '') = '' THEN GraphicBKM.libno ELSE BookT.LibNo END AS libno
    FROM graphicbkt T
    LEFT JOIN GraphicBKM ON T.Graphickt = GraphicBKM.graphicBkm
    LEFT JOIN BookT ON GraphicBKM.BookTKt = BookT.Tid
    WHERE T.graphicBkTkm IN ${toIds(ids)}
  `.execute(db);
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const out: Picture[] = [];
  for (const id of new Set(ids)) {
    const r = byId.get(id);
    if (!r) continue;
    out.push({
      id,
      filepath: text(r.filepath),
      refplace: text(r.refplace),
      recno: r.recno === null ? null : Number(r.recno),
      comment: text(r.comment),
      libno: text(r.libno),
    });
  }
  return out;
}

/** FormDisplayImage's dtImage: Id, FileName, LibNo, RefPlace, RecNo. */
const PICTURE_COLUMNS = ['Id', 'FileName', 'LibNo', 'RefPlace', 'RecNo'];
const pictureRow = (p: Picture, file: string): GridValue[] => [
  p.id,
  file,
  p.libno,
  p.refplace,
  p.recno,
];

/** The web's rule for its bulk tools: a Locked record is not changed. */
async function assertUnlocked(db: Executor, ids: readonly number[]) {
  const n = int(
    await scalar(
      db,
      sql`SELECT COUNT(*) FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)} AND ISNULL(Locked, 0) = 1`,
    ),
  );
  if (n > 0) throw new BadRequestException('A selected record is Locked');
}

/** The records whose filepath is in `folder` (the form's `filepath like '<folder>%'`). */
async function recordsIn(db: Executor, folder: string): Promise<{ id: number; path: string }[]> {
  const { rows } = await sql<{ id: number; filepath: string | null }>`
    SELECT graphicBkTkm AS id, filepath FROM graphicbkt WHERE LEFT(filepath, ${folder.length}) = ${folder}
  `.execute(db);
  return rows.map((r) => ({ id: Number(r.id), path: text(r.filepath) }));
}

/**
 * Directory.GetFiles(<the record's folder>, "*.jpg", TopDirectoryOnly), named as the desktop
 * names them (the folder as the record spells it, the file as the disk does).
 */
async function jpgFilesOf(env: Env, folder: string): Promise<string[]> {
  if (folder === '') throw new BadRequestException('The path is not of a legal form.');
  const dir = await existingDirectory(env, folder);
  if (!dir) throw noFolder(folder);
  const files = await findFiles(dir, { recursive: false, match: jpg });
  return files.map((f) => folder + basename(f));
}

/** The record's filepath (dgMain.CurrentRow's cell), '' when there is no such record. */
async function filePathOf(db: Executor, id: number): Promise<string> {
  return text(await scalar(db, sql`SELECT filepath FROM graphicbkt WHERE graphicBkTkm = ${id}`));
}

type Action = (
  db: Executor,
  user: SessionUser,
  ids: number[],
  ctx: ActionContext,
) => Promise<ActionResult>;

export const graphicsDetailFileActions: Record<string, Action> = {
  /**
   * The picture box's click (Process.Start(FilePath) on the desktop): the pictures of the
   * current record's Graphics Master record (its Graphickt) that have a file, in RecNo order,
   * for the image viewer to step through with Previous / Next Page, starting at this one. A
   * record not saved yet, or without a Graphickt, has only its own.
   */
  async 'master-pictures'(db, _user, _ids, ctx) {
    const current = int(ctx.params.current);
    const { rows } = await sql<{
      id: number;
      filepath: string | null;
      recno: number | null;
      refplace: string | null;
    }>`
      SELECT d.graphicBkTkm AS id, d.filepath, d.recno, d.refplace
      FROM graphicbkt c
      INNER JOIN graphicbkt d ON d.Graphickt = c.Graphickt
      WHERE c.graphicBkTkm = ${current} AND ISNULL(c.Graphickt, 0) <> 0 AND ISNULL(d.filepath, '') <> ''
      ORDER BY CASE WHEN d.recno IS NULL THEN 1 ELSE 0 END, d.recno, d.graphicBkTkm
    `.execute(db);
    return {
      kind: 'table',
      title: 'Pictures',
      columns: ['Id', 'FileName', 'RecNo', 'RefPlace'],
      rows: rows.map((r) => [
        Number(r.id),
        text(r.filepath),
        r.recno === null ? null : Number(r.recno),
        text(r.refplace),
      ]),
    };
  },

  /**
   * Show Pictures (FormDisplayImage's dtImage): the selected rows that have a File Path, with
   * their book's LibNo, for the six-at-a-time viewer.
   */
  async 'show-pictures'(db, _user, ids) {
    const rows = (await pictures(db, ids)).filter((p) => p.filepath !== '');
    return {
      kind: 'table',
      title: 'FormDisplayImage',
      columns: PICTURE_COLUMNS,
      rows: rows.map((p) => pictureRow(p, p.filepath)),
    };
  },

  /**
   * FormDisplayImage › Save to Temp Selected: "Please Enter Temp Selected" added, after a space,
   * to tempselected of the ticked pictures. Fixes: nothing ticked no longer fails (`in ()`), and
   * a NULL tempselected takes the text (the desktop's `NULL + …` left it NULL).
   */
  async 'save-temp-selected'(db, _user, ids, ctx) {
    const name = text(ctx.params.name);
    if (name === '' || ids.length === 0) return { kind: 'message', message: '' };
    const long = int(
      await scalar(
        db,
        sql`SELECT COUNT(*) FROM graphicbkt WHERE graphicBkTkm IN ${toIds(ids)}
          AND DATALENGTH(ISNULL(tempselected, '')) / 2 + ${name.length + 1} > 255`,
      ),
    );
    if (long > 0)
      throw new BadRequestException('Temp Selected cannot be longer than 255 characters');
    await sql`UPDATE graphicbkt SET tempselected = ISNULL(tempselected, '') + ' ' + ${name}
      WHERE graphicBkTkm IN ${toIds(ids)}`.execute(db);
    return { kind: 'refreshed', rows: [] };
  },

  /**
   * Show Record From Selected Record › File Not Found on it's Original Location: the selected
   * rows whose File.Exists(filepath) is false (a blank path, or one outside the server's folders,
   * counts as not found).
   */
  async 'file-not-found'(db, _user, ids, ctx) {
    // Without the pictures' folder every file would be "not found".
    localRoot(ctx.env, 'graphicsDrive');
    const missing: number[] = [];
    for (const p of await pictures(db, ids)) {
      if (!(await existingFile(ctx.env, p.filepath))) missing.push(p.id);
    }
    if (missing.length === 0)
      return { kind: 'message', message: 'All File Exists in The Dirctory' };
    return { kind: 'list', rows: await ctx.list(sql`graphicBkTkm IN ${toIds(missing)}`) };
  },

  /**
   * › -XXX Deleted Picture: the records of the current row's folder (`filepath like '<folder>%'`)
   * whose picture is no longer among the folder's *.jpg files. The desktop built the same list
   * as `FilePath not in (<files>)`, but its loop left out the one file that matched when the
   * folder had a single record, and failed on a folder without .jpg files; both work here.
   */
  async 'deleted-picture'(db, _user, _ids, ctx) {
    const folder = folderOf(await filePathOf(db, int(ctx.params.current)));
    const files = new Set((await jpgFilesOf(ctx.env, folder)).map(fold));
    const gone = (await recordsIn(db, folder)).filter((r) => !files.has(fold(r.path)));
    return {
      kind: 'list',
      rows: gone.length ? await ctx.list(sql`graphicBkTkm IN ${toIds(gone.map((r) => r.id))}`) : [],
    };
  },

  /**
   * Copy to TempGr And Open with Acdsee - Selected Record: the user's folder under d:\tempgr is
   * made if missing and emptied, then every selected picture that exists is copied into it as
   * `<Id>.jpg`. The desktop opened the last copy (ACDSee then showed the folder); the web gets
   * the copies back for its picture viewer. The desktop's folder was `<id>` for users 103 / 75 /
   * 93 and `0` for everyone else of that computer; the server is shared, so every user has `<id>`.
   */
  async 'copy-to-tempgr'(db, user, ids, ctx) {
    const base = localRoot(ctx.env, 'tempGr');
    const dest = join(base, String(user.id));
    const shown = toDesktopPath(ctx.env, 'tempGr', dest);
    try {
      await mkdir(dest, { recursive: true });
    } catch {
      throw new BadRequestException(
        `Directory ${shown} is not created\r\nPlease Create Direcotry or Contact Administrator`,
      );
    }
    for (const old of await findFiles(dest, { recursive: false })) await unlink(old);
    const rows: GridValue[][] = [];
    for (const p of await pictures(db, ids)) {
      const src = await existingFile(ctx.env, p.filepath);
      if (!src) continue;
      const copy = join(dest, `${p.id}.jpg`);
      await copyFile(src, copy);
      rows.push(pictureRow(p, toDesktopPath(ctx.env, 'tempGr', copy)));
    }
    return { kind: 'table', title: shown, columns: PICTURE_COLUMNS, rows };
  },

  /**
   * Print Record › Showing Mismatch Of No Of Images: for every sub-folder of the picked folder,
   * its *.jpg files against the records whose filepath contains the folder's name, and a Total.
   * The desktop listed the sub-folders through `xp_cmdshell 'DIR … /ad/b'` on the SQL Server;
   * the web reads the folder itself and never runs that.
   */
  async 'image-count-mismatch'(db, _user, _ids, ctx) {
    const folder = text(ctx.params.folder).trim();
    if (folder === '') return { kind: 'message', message: '' };
    const dir = await existingDirectory(ctx.env, folder);
    if (!dir) throw noFolder(folder);
    const { rows: stored } = await sql<{ filepath: string }>`
      SELECT filepath FROM graphicbkt WHERE ISNULL(filepath, '') <> ''
    `.execute(db);
    const paths = stored.map((r) => text(r.filepath).toLowerCase());
    const rows: GridValue[][] = [];
    let sum = 0;
    let recorded = 0;
    let done = 0;
    for (const sub of await findDirectories(dir, { recursive: false })) {
      const name = basename(sub);
      const needle = name.toLowerCase();
      const count = (await findFiles(sub, { recursive: false, match: jpg })).length;
      // `filepath like '%<name>%'`.
      const inDb = paths.reduce((n, p) => (p.includes(needle) ? n + 1 : n), 0);
      rows.push([name, count, inDb, count - inDb]);
      sum += count;
      recorded += inDb;
      // A big share has thousands of folders: let other requests through.
      if (++done % 50 === 0) await new Promise((r) => setImmediate(r));
    }
    rows.push(['Total', sum, recorded, sum - recorded]);
    return {
      kind: 'table',
      title: 'Showing Mismatch Of No Of Images',
      columns: ['FileName', 'Count', 'Database count', 'Diff'],
      rows,
    };
  },

  /**
   * Utility › Show File Not Linked for Give Book: the *.jpg files of the current row's folder
   * that no record's filepath names. The desktop ran the names together; here one per line.
   */
  async 'not-linked-files'(db, _user, _ids, ctx) {
    const path = await filePathOf(db, int(ctx.params.current));
    const linked = 'All Files in current folder are linked with records';
    if (path === '') return { kind: 'message', message: linked };
    const folder = folderOf(path);
    const known = new Set((await recordsIn(db, folder)).map((r) => fold(r.path)));
    const loose = (await jpgFilesOf(ctx.env, folder)).filter((f) => !known.has(fold(f)));
    return {
      kind: 'message',
      message: loose.length ? `Not Linked Files Are \n${loose.join('\n')}` : linked,
    };
  },

  /**
   * Utility › Update Blank Filepath For Given Book (updateFilePath): for the book in Lib No, each
   * record without a filepath takes `Y:\<LibNo>\<RefPlace>.jpg`, else `.bmp`, else `.png`,
   * whichever exists. After the Yes/No and the Security password.
   */
  async 'update-blank-filepath'(db, _user, _ids, ctx) {
    ctx.assertPassword(ctx.params.password);
    localRoot(ctx.env, 'graphicsDrive');
    const g = int(ctx.params.graphickt);
    // The desktop failed with an SQL error when no Lib No was on screen.
    if (g <= 0) return { kind: 'message', message: 'Please Enter Lib No' };
    const main = `${desktopRoot(ctx.env, 'graphicsDrive')}\\${text(ctx.params.libNo)}`;
    const { rows } = await sql<{ refplace: string | null }>`
      SELECT DISTINCT refplace FROM graphicbkt WHERE filepath = '' AND Graphickt = ${g}
    `.execute(db);
    await inTransaction(db, async (trx) => {
      for (const ref of rows.map((r) => text(r.refplace))) {
        for (const ext of ['.jpg', '.bmp', '.png']) {
          const path = `${main}\\${ref}${ext}`;
          if (path.length > 250 || !(await existingFile(ctx.env, path, ['graphicsDrive'])))
            continue;
          await sql`UPDATE graphicbkt SET filepath = ${path}
            WHERE filepath = '' AND Graphickt = ${g} AND refplace = ${ref}`.execute(trx);
          break;
        }
      }
    });
    return { kind: 'refreshed', rows: [] };
  },

  /** FolderBrowserDialog's Make New Folder, inside one of the graphics folders. */
  async 'make-folder'(_db, _user, _ids, ctx) {
    const parent = text(ctx.params.path);
    const name = text(ctx.params.name).trim();
    if (!isFileName(name)) throw new BadRequestException('A folder name is required');
    const dir = await existingDirectory(ctx.env, parent, WRITE_ROOTS);
    if (!dir) throw noFolder(parent);
    const names = await readdir(dir);
    if (names.some((n) => n.toLowerCase() === name.toLowerCase()))
      throw new BadRequestException('Cannot create a file when that file already exists.');
    await mkdir(join(dir, name));
    return { kind: 'message', message: '' };
  },

  /**
   * Utility › Send Image To Folder: every selected picture that exists is copied into the picked
   * folder as `<prefix> <LibNo> <file name>` (an existing copy is replaced, as FileSystemObject
   * does), and the prefix is added to the record's comment after a comma. The folder is one of
   * the server's graphics folders; the copies come back as a list to open or download.
   */
  async 'send-image-to-folder'(db, _user, ids, ctx) {
    const folder = text(ctx.params.folder).trim();
    const prefix = text(ctx.params.prefix);
    if (/[\\/:*?"<>|]/.test(prefix))
      throw new BadRequestException('The prefix cannot contain \\ / : * ? " < > |');
    const where = toLocalPath(ctx.env, folder, WRITE_ROOTS);
    const dir = await existingDirectory(ctx.env, folder, WRITE_ROOTS);
    if (!where || !dir) throw noFolder(folder);
    const copies: { id: number; src: string; dest: string; comment: string }[] = [];
    for (const p of await pictures(db, ids)) {
      const src = await existingFile(ctx.env, p.filepath);
      if (!src) continue;
      const name = `${prefix} ${p.libno} ${nameOf(p.filepath)}`;
      if (!isFileName(name)) throw new BadRequestException(`Invalid file name : ${name}`);
      const comment = (p.comment === '' ? '' : `${p.comment},`) + prefix;
      if (comment.length > 255)
        throw new BadRequestException('Comment cannot be longer than 255 characters');
      copies.push({ id: p.id, src, dest: join(dir, name), comment });
    }
    for (const c of copies) await copyFile(c.src, c.dest);
    await inTransaction(db, async (trx) => {
      for (const c of copies) {
        await sql`UPDATE graphicbkt SET comment = ${c.comment} WHERE graphicBkTkm = ${c.id}`.execute(
          trx,
        );
      }
    });
    return {
      kind: 'table',
      title: 'List',
      columns: ['FileName'],
      rows: copies.map((c) => [toDesktopPath(ctx.env, where.root, c.dest)]),
    };
  },

  /**
   * Utility › Rename File Name Records: the current row's file takes the typed name, on disk and
   * in filepath (Yes) or in filepath only (No). A rename that fails changes nothing.
   */
  async 'rename-file'(db, _user, _ids, ctx) {
    const id = int(ctx.params.current);
    const name = text(ctx.params.name);
    const physical = ctx.params.physical === true;
    const path = await filePathOf(db, id);
    if (path === '') return { kind: 'message', message: 'No Files Found' };
    if (name === '') return { kind: 'message', message: '' };
    if (!isFileName(name)) throw new BadRequestException('The file name is not valid');
    await assertUnlocked(db, [id]);
    const next = folderOf(path) + name;
    if (next.length > 250)
      throw new BadRequestException('File Path cannot be longer than 250 characters');
    const move = physical ? await renamePlan(ctx.env, path, name) : null;
    await inTransaction(db, async (trx) => {
      await sql`UPDATE graphicbkt SET filepath = ${next} WHERE graphicBkTkm = ${id}`.execute(trx);
      if (move) await rename(move.src, move.dest);
    });
    return { kind: 'refreshed', rows: [] };
  },

  /**
   * Utility › Rename File Name With Refpls for selected Reords: each selected picture is renamed
   * to `<RefPlace>.JPG`, on disk and in filepath, unless a file of that name is already there.
   * The desktop stopped at the first row it could not rename (a blank path or RefPlace, a missing
   * file); the web skips such rows, renames the rest and then names the first missing file.
   */
  async 'rename-with-refplace'(db, _user, ids, ctx) {
    await assertUnlocked(db, ids);
    let missing = '';
    for (const p of await pictures(db, ids)) {
      const name = `${p.refplace}.JPG`;
      const next = folderOf(p.filepath) + name;
      if (p.filepath === '' || p.refplace.trim() === '' || !isFileName(name) || next.length > 250)
        continue;
      if (await existingFile(ctx.env, next)) continue;
      if (!(await existingFile(ctx.env, p.filepath, WRITE_ROOTS))) {
        if (missing === '') missing = noFile(p.filepath);
        continue;
      }
      const move = await renamePlan(ctx.env, p.filepath, name);
      await inTransaction(db, async (trx) => {
        await sql`UPDATE graphicbkt SET filepath = ${next} WHERE graphicBkTkm = ${p.id}`.execute(
          trx,
        );
        if (move) await rename(move.src, move.dest);
      });
    }
    return { kind: 'refreshed', rows: [], ...(missing ? { message: missing } : {}) };
  },
};

/**
 * FileSystem.RenameFile(path, name), checked before anything is changed: the file keeps its
 * folder, it must be in one of the graphics folders, and no other file there may have the name
 * (a change of case only is fine). Null when the file already has exactly that name.
 */
async function renamePlan(
  env: Env,
  path: string,
  name: string,
): Promise<{ src: string; dest: string } | null> {
  const src = await existingFile(env, path, WRITE_ROOTS);
  if (!src) throw new BadRequestException(noFile(path));
  if (basename(src) === name) return null;
  const others = (await readdir(dirname(src))).filter((n) => n !== basename(src));
  if (others.some((n) => n.toLowerCase() === name.toLowerCase()))
    throw new BadRequestException('Cannot create a file when that file already exists.');
  return { src, dest: join(dirname(src), name) };
}
