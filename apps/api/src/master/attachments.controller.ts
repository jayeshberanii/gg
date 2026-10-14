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
  UseGuards,
} from '@nestjs/common';
import {
  type Attachment,
  deleteAttachmentsRequestSchema,
  saveAttachmentsRequestSchema,
  type SessionUser,
} from '@gglib/shared';
import type { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { CurrentUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AttachmentsService } from './attachments.service.js';
import { ScreenParamGuard } from './screen-param.guard.js';
import { sendFile } from './send-file.js';

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
    return sendFile(res, path, fileName);
  }
}
