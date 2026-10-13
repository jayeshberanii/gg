import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkLogController } from './work-log.controller.js';
import { WorkLogService } from './work-log.service.js';

@Module({
  imports: [AuthModule],
  controllers: [WorkLogController],
  providers: [WorkLogService],
})
export class WorkLogModule {}
