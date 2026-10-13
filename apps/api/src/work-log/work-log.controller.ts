import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  isoDate,
  type LookupOption,
  saveWorkLogRequestSchema,
  type SaveWorkLogRequest,
  type SessionUser,
  type WorkLogDetail,
} from '@gglib/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { WorkLogService } from './work-log.service.js';

const findQuerySchema = z.object({ userId: z.coerce.number().int(), date: isoDate });
const vibhagQuerySchema = z.object({
  tableName: z.string().default(''),
  workTypeId: z.coerce.number().int().default(0),
});
const workTypeQuerySchema = z.object({ vibhagId: z.coerce.number().int().default(0) });

/** The logout work report (Employee › Login & Log Out, Master › Exit, and closing the app). */
@Controller('work-log')
export class WorkLogController {
  constructor(private readonly workLogs: WorkLogService) {}

  @Get('current')
  current(@CurrentUser() user: SessionUser): Promise<WorkLogDetail> {
    return this.workLogs.detail(user, user.logId);
  }

  @Get('users')
  users(@CurrentUser() user: SessionUser): Promise<LookupOption[]> {
    return this.workLogs.users(user);
  }

  @Get('find')
  find(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(findQuerySchema)) q: z.infer<typeof findQuerySchema>,
  ): Promise<{ logId: number }> {
    return this.workLogs.find(user, q.userId, q.date);
  }

  @Get('lookups/vibhag')
  vibhag(
    @Query(new ZodValidationPipe(vibhagQuerySchema)) q: z.infer<typeof vibhagQuerySchema>,
  ): Promise<LookupOption[]> {
    return this.workLogs.vibhagOptions(q.tableName, q.workTypeId);
  }

  @Get('lookups/work-type')
  workType(
    @Query(new ZodValidationPipe(workTypeQuerySchema)) q: z.infer<typeof workTypeQuerySchema>,
  ): Promise<LookupOption[]> {
    return this.workLogs.workTypeOptions(q.vibhagId);
  }

  @Get(':logId')
  detail(
    @CurrentUser() user: SessionUser,
    @Param('logId', ParseIntPipe) logId: number,
  ): Promise<WorkLogDetail> {
    return this.workLogs.detail(user, logId);
  }

  @Put(':logId')
  @HttpCode(HttpStatus.NO_CONTENT)
  save(
    @CurrentUser() user: SessionUser,
    @Param('logId', ParseIntPipe) logId: number,
    @Body(new ZodValidationPipe(saveWorkLogRequestSchema)) body: SaveWorkLogRequest,
  ): Promise<void> {
    return this.workLogs.save(user, logId, body.rows);
  }

  @Post(':logId/logout-time')
  @HttpCode(HttpStatus.NO_CONTENT)
  recordLogoutTime(
    @CurrentUser() user: SessionUser,
    @Param('logId', ParseIntPipe) logId: number,
  ): Promise<void> {
    return this.workLogs.recordLogoutTime(user, logId);
  }
}
