import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ENV, type Env } from '../config/env.js';
import type { LibraryFileInfo, LibraryFolder } from '@gglib/shared';
import { fileToOpen, listFolder } from './library-files.js';
import { ScreenParamGuard } from './screen-param.guard.js';
import { fileInfo, sendFile } from './send-file.js';

/**
 * Process.Start(path) / PictureBox.Image for a file of the desktop's folders (scans, e-books,
 * graphics, reference scans …), named as the desktop names it. Any screen's user may read them,
 * as every desktop computer can.
 */
@UseGuards(ScreenParamGuard)
@Controller('master/:screen/library-file')
export class LibraryFilesController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** The file; `page` (from 0) picks a page of a multi-page scan. */
  @Get()
  async file(
    @Query('path') path: unknown,
    @Query('page') page: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const local = await fileToOpen(this.env, requiredPath(path));
    return sendFile(res, local, undefined, pageNumber(page));
  }

  /** The image viewer's look before it shows the file: its kind and page count. */
  @Get('info')
  async info(@Query('path') path: unknown): Promise<LibraryFileInfo> {
    return fileInfo(await fileToOpen(this.env, requiredPath(path)));
  }
}

function requiredPath(path: unknown): string {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new BadRequestException('A file path is required');
  }
  return path;
}

function pageNumber(page: unknown): number {
  if (page === undefined || page === '') return 0;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 0) throw new BadRequestException('A page is a whole number');
  return n;
}

/**
 * OpenFileDialog over the desktop's folders: one folder's sub-folders and files, or (with no
 * path) the configured folders. The browser cannot name a file of the user's own computer by
 * its path, so the dialog picks among the files the server reaches.
 */
@UseGuards(ScreenParamGuard)
@Controller('master/:screen/library-folder')
export class LibraryFolderController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  folder(@Query('path') path: unknown): Promise<LibraryFolder> {
    return listFolder(this.env, typeof path === 'string' ? path : '');
  }
}
