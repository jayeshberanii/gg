import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Attachment, SessionUser } from '@gglib/shared';
import { sql } from 'kysely';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { ENV, type Env } from '../config/env.js';
import { KYSELY, type Database } from '../db/db.module.js';
import { type Executor, inTransaction } from '../db/legacy-sql.js';
import { MasterService } from './master.service.js';

type Row = {
  AttachmentKm: number;
  TranName: string | null;
  TranKm: number | null;
  FileName: string | null;
  FileType: string | null;
};

/** Attachments.FileName / FilePath / FileType are varchar(50) / (150) / (5). */
const MAX_NAME = 50;
const MAX_PATH = 150;
const MAX_TYPE = 5;

/**
 * CommonLibrary.frmAttachments: the files kept with a record, as rows of Attachments
 * (TranName = the form's table, TranKm = the record) and files under
 * <attachments folder>\<TranName>/<TranKm>/<FileName>.
 *
 * The desktop opens Attachments.FilePath, a path on its file share. The web finds the file by
 * the same three parts under ATTACHMENT_DIR, so rows saved by either application open in both
 * whatever host name the stored path carries.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly master: MasterService,
  ) {}

  /** The screen's TranName, once the user may see the record. */
  private async tranName(
    screen: string,
    id: number,
    user: SessionUser,
    db: Executor,
  ): Promise<string> {
    const def = this.master.definition(screen);
    if (!def.attachments) throw new NotFoundException('This screen has no attachments');
    await this.master.assertVisible(db, def, user, id);
    return def.table;
  }

  private root(): string {
    if (!this.env.ATTACHMENT_DIR) {
      throw new ServiceUnavailableException(
        'The attachments folder is not configured on the server',
      );
    }
    return resolve(this.env.ATTACHMENT_DIR);
  }

  /** Where the file of a row is, or null when the row's parts cannot name a file under the root. */
  private fileOf(root: string, row: Pick<Row, 'TranName' | 'TranKm' | 'FileName'>): string | null {
    const name = row.FileName ?? '';
    const tran = row.TranName ?? '';
    if (!isPlainName(name) || !isPlainName(tran) || row.TranKm === null) return null;
    const path = resolve(root, tran, String(row.TranKm), name);
    return path.startsWith(root + sep) ? path : null;
  }

  /** FillList, with lblEntry's text (GetEntryUser on enuser / endate) for each row. */
  async list(
    screen: string,
    id: number,
    user: SessionUser,
    db: Executor = this.db,
  ): Promise<Attachment[]> {
    const tranName = await this.tranName(screen, id, user, db);
    const { rows } = await sql<Row & { entry: string | null }>`
      SELECT A.AttachmentKm, A.TranName, A.TranKm, A.FileName, A.FileType,
        CASE WHEN ISNULL(A.enuser, 0) = 0 THEN ' | '
          ELSE ua.uname + '-' + CONVERT(varchar, A.endate, 103) + ' | ' END AS entry
      FROM Attachments A
      LEFT JOIN Usecurity ua ON A.enuser = ua.tid
      WHERE A.TranName = ${tranName} AND A.TranKm = ${id}
      ORDER BY A.AttachmentKm
    `.execute(db);
    const root = this.env.ATTACHMENT_DIR ? resolve(this.env.ATTACHMENT_DIR) : null;
    return Promise.all(
      rows.map(async (r) => {
        const path = root ? this.fileOf(root, r) : null;
        return {
          id: r.AttachmentKm,
          fileName: r.FileName ?? '',
          fileType: r.FileType ?? '',
          entry: r.entry ?? '',
          exists: path !== null && (await isFile(path)),
        };
      }),
    );
  }

  /**
   * btnSave_Click: every new row is inserted and its file copied (over a file of the same name)
   * to <share>\<TranName>/<TranKm>/<FileName>, which is also what FilePath gets.
   */
  async save(
    screen: string,
    id: number,
    user: SessionUser,
    files: { name: string; data: string }[],
    db: Executor = this.db,
  ): Promise<void> {
    const tranName = await this.tranName(screen, id, user, db);
    const root = this.root();
    const share = this.env.ATTACHMENT_SHARE.replace(/[\\/]+$/, '');
    const items = files.map((f) => {
      if (!isPlainName(f.name)) throw new BadRequestException(`Invalid file name : ${f.name}`);
      const fileType = extname(f.name);
      // As on the desktop: <share>\<TranName> then "/" + TranKm + "/" + FileName.
      const filePath = `${share}\\${tranName}/${id}/${f.name}`;
      if (f.name.length > MAX_NAME || fileType.length > MAX_TYPE || filePath.length > MAX_PATH) {
        throw new BadRequestException(
          `File name is too long : ${f.name} (at most ${MAX_NAME} characters, its extension at most ${MAX_TYPE - 1})`,
        );
      }
      const target = this.fileOf(root, { TranName: tranName, TranKm: id, FileName: f.name });
      if (!target) throw new BadRequestException(`Invalid file name : ${f.name}`);
      return { name: f.name, fileType, filePath, target, bytes: Buffer.from(f.data, 'base64') };
    });
    await mkdir(join(root, tranName, String(id)), { recursive: true });
    await inTransaction(db, async (trx) => {
      for (const f of items) {
        await sql`
          INSERT INTO Attachments (TranName, TranKm, FileName, FilePath, FileType, enuser, endate)
          VALUES (${tranName}, ${id}, ${f.name}, ${f.filePath}, ${f.fileType}, ${user.id}, GETDATE())
        `.execute(trx);
        await writeFile(f.target, f.bytes);
      }
    });
  }

  /** btnDelete_Click: the selected rows and their files. Returns how many rows went. */
  async delete(
    screen: string,
    id: number,
    user: SessionUser,
    ids: number[],
    db: Executor = this.db,
  ): Promise<number> {
    const tranName = await this.tranName(screen, id, user, db);
    const root = this.root();
    let deleted = 0;
    for (const km of ids) {
      const { rows } = await sql<Row>`
        DELETE FROM Attachments
        OUTPUT deleted.AttachmentKm, deleted.TranName, deleted.TranKm, deleted.FileName, deleted.FileType
        WHERE AttachmentKm = ${km} AND TranName = ${tranName} AND TranKm = ${id}
      `.execute(db);
      const row = rows[0];
      if (!row) continue;
      deleted++;
      const path = this.fileOf(root, row);
      // A file that is already gone is not an error (the desktop stops there with a message).
      if (path) await unlink(path).catch(() => undefined);
    }
    return deleted;
  }

  /** dgMain_CellDoubleClick: the file of a row of this record. */
  async file(
    screen: string,
    id: number,
    attachmentId: number,
    user: SessionUser,
    db: Executor = this.db,
  ): Promise<{ path: string; fileName: string }> {
    const tranName = await this.tranName(screen, id, user, db);
    const { rows } = await sql<Row>`
      SELECT AttachmentKm, TranName, TranKm, FileName, FileType FROM Attachments
      WHERE AttachmentKm = ${attachmentId} AND TranName = ${tranName} AND TranKm = ${id}
    `.execute(db);
    const row = rows[0];
    if (!row) throw new NotFoundException('Attachment not found');
    const path = this.fileOf(this.root(), row);
    if (!path || !(await isFile(path))) {
      throw new NotFoundException(`File At Location : ${row.FileName ?? ''} Does Not Exists`);
    }
    return { path, fileName: row.FileName ?? '' };
  }
}

/** A single path segment: no separators, no "." / "..", nothing Windows refuses in a name. */
function isPlainName(name: string): boolean {
  if (name.trim() === '' || name === '.' || name === '..') return false;
  return ![...name].some((c) => c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c));
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}
