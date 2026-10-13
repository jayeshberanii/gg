import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  type Attachment,
  deleteAttachmentsRequestSchema,
  saveAttachmentsRequestSchema,
  type SessionUser,
} from '@gglib/shared';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import type { z } from 'zod';
import { CurrentUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AttachmentsService } from './attachments.service.js';
import { ScreenParamGuard } from './screen-param.guard.js';

/** What the browser may show in a tab; everything else is downloaded. */
const INLINE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Utility › Show Attachment(s) (CommonLibrary.frmAttachments) for a record of a screen. */
@UseGuards(ScreenParamGuard)
@Controller('master/:screen/attachments/:id')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  list(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
  ): Promise<Attachment[]> {
    return this.attachments.list(screen, id, user);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  save(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(saveAttachmentsRequestSchema))
    body: z.infer<typeof saveAttachmentsRequestSchema>,
  ): Promise<void> {
    return this.attachments.save(screen, id, user, body.files);
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(deleteAttachmentsRequestSchema))
    body: z.infer<typeof deleteAttachmentsRequestSchema>,
  ): Promise<{ deleted: number }> {
    return { deleted: await this.attachments.delete(screen, id, user, body.ids) };
  }

  @Get('file/:attachmentId')
  async file(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { path, fileName } = await this.attachments.file(screen, id, attachmentId, user);
    const type = INLINE[extname(fileName).toLowerCase()];
    // Uploaded files are never run as pages of this origin: only types that cannot carry script
    // are shown, never sniffed into another type, and everything else downloads.
    res.set({
      'Content-Type': type ?? 'application/octet-stream',
      'Content-Disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(createReadStream(path));
  }
}
