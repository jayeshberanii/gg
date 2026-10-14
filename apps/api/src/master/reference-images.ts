import type { ActionResult } from '@gglib/shared';
import { sql } from 'kysely';
import type { Env } from '../config/env.js';
import { type Executor, idList } from '../db/legacy-sql.js';
import {
  desktopRoot,
  existingDirectory,
  findDirectories,
  findFiles,
  localRoot,
  toDesktopPath,
} from './library-files.js';

/** The pages one "from-to" may name: a slip in the box must not make the server list forever. */
const MAX_RANGE = 1000;

/** VB Val(): the leading number of the text, or 0. */
const val = (v: string) => Number(/^\s*[+-]?(\d+\.?\d*|\.\d+)/.exec(v)?.[0] ?? 0);

/**
 * The page names of a RefrenceT.Pgno ("3", "1,4", "10-12"): each comma part is a file name, or
 * with one "-" between two numbers the pages from the first to the second.
 */
export function referencePages(pgNo: string): string[] {
  const names: string[] = [];
  for (const raw of pgNo.trim().split(',')) {
    const part = raw.trim();
    const range = part.split('-');
    const from = Number(range[0]?.trim());
    if (range.length === 2 && range[0]!.trim() !== '' && Number.isFinite(from)) {
      const last = Math.min(val(range[1]!) - val(range[0]!), MAX_RANGE);
      for (let a = 0; a <= last; a++) names.push(String(from + a));
    } else {
      names.push(part);
    }
  }
  return names;
}

/**
 * "Show Image of RefrenceT for Selected Record" (Author and Prakashak Master → frmDisplayImages
 * with lstClsImage): the scanned pages the selected records' references name. Each RefrenceT
 * row with a LibNo and a Pgno is a folder and pages of ReferenceTPath: the first folder
 * anywhere under it whose path has "<LibNo>_", else <ReferenceTPath>\<LibNo>, and in it
 * <page>.jpg for each page of Pgno. The files that exist are the form's pictures, as the
 * desktop names them; the others are its "Following Files Not Found" message.
 */
export async function referenceImages(
  db: Executor,
  env: Env,
  tableKt: number,
  records: readonly number[],
): Promise<ActionResult> {
  const { rows } = await sql<{ LibNo: string; Pgno: string }>`
    SELECT DISTINCT r.LibNo, r.Pgno FROM RefrenceT R
    WHERE ISNULL(r.LibNo, '') <> '' AND ISNULL(r.Pgno, '') <> '' AND r.Tablekt = ${tableKt}
      AND r.RecordKt IN ${idList(records.length ? records : [0])}`.execute(db);

  const base = localRoot(env, 'referenceT');
  const mainPath = desktopRoot(env, 'referenceT');
  const folders =
    rows.length === 0
      ? []
      : (await findDirectories(base)).map((f) => toDesktopPath(env, 'referenceT', f));
  // File.Exists does not mind the case of a name; this server's folders may.
  const listings = new Map<string, Map<string, string>>();
  const filesOf = async (folder: string) => {
    let known = listings.get(folder);
    if (!known) {
      known = new Map();
      const local = await existingDirectory(env, folder, ['referenceT']);
      for (const f of local ? await findFiles(local, { recursive: false }) : []) {
        const path = toDesktopPath(env, 'referenceT', f);
        known.set(path.slice(folder.length + 1).toLowerCase(), path);
      }
      listings.set(folder, known);
    }
    return known;
  };

  const files: string[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    const folder =
      folders.find((f) => f.trim().includes(`${row.LibNo}_`)) ?? `${mainPath}\\${row.LibNo}`;
    const known = await filesOf(folder);
    for (const page of referencePages(row.Pgno)) {
      const found = known.get(`${page}.jpg`.toLowerCase());
      if (found) files.push(found);
      else missing.push(`${folder}\\${page}.jpg`);
    }
  }
  return {
    kind: 'table',
    title: 'frmDisplayImages',
    columns: ['FileName'],
    rows: [...new Set(files)].map((f) => [f]),
    ...(missing.length > 0
      ? { message: `Following Files Not Found : \r\n${missing.map((m) => `${m}\r\n`).join('')}` }
      : {}),
  };
}
