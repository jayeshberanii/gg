import { StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import type { LibraryFileInfo } from '@gglib/shared';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { basename, extname } from 'node:path';
import sharp from 'sharp';

/** What the browser may show in a tab; everything else is downloaded. */
const INLINE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Scans browsers cannot draw: sent as a PNG of one page (the first unless asked). */
const CONVERTED = new Set(['.tif', '.tiff']);

/** A converted file sharp cannot read (a broken or unsupported scan). */
const unreadable = () => new UnprocessableEntityException('The picture cannot be read');

/**
 * What the image viewer needs before it shows a file: its kind, and how many pages a converted
 * scan has (a multi-page TIFF; one for anything else).
 */
export async function fileInfo(path: string): Promise<LibraryFileInfo> {
  const ext = extname(path).toLowerCase();
  if (CONVERTED.has(ext)) {
    const meta = await sharp(path, { limitInputPixels: false })
      .metadata()
      .catch(() => {
        throw unreadable();
      });
    return { kind: 'image', pages: Math.max(1, meta.pages ?? 1) };
  }
  const type = INLINE[ext];
  const kind = type?.startsWith('image/') ? 'image' : type === 'application/pdf' ? 'pdf' : 'other';
  return { kind, pages: 1 };
}

/**
 * A stored file as the response (the desktop's Process.Start / PictureBox). Uploaded files are
 * never run as pages of this origin: only types that cannot carry script are shown, never
 * sniffed into another type, and everything else downloads.
 */
export async function sendFile(
  res: Response,
  path: string,
  fileName: string = basename(path),
  /** A converted scan's page, from 0. */
  page = 0,
): Promise<StreamableFile> {
  const ext = extname(fileName).toLowerCase();
  const headers = (type: string | undefined, name: string) =>
    res.set({
      'Content-Type': type ?? 'application/octet-stream',
      'Content-Disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
  if (CONVERTED.has(ext)) {
    const png = await sharp(path, { limitInputPixels: false, page })
      .png()
      .toBuffer()
      .catch(() => {
        throw unreadable();
      });
    headers('image/png', `${fileName}.png`);
    return new StreamableFile(png);
  }
  headers(INLINE[ext], fileName);
  return new StreamableFile(createReadStream(path));
}
