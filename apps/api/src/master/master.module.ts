import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { MasterController } from './master.controller.js';
import { MasterService } from './master.service.js';
import { PreferencesController } from './preferences.controller.js';
import { SecurityPassword } from './security-password.js';

@Module({
  controllers: [AttachmentsController, MasterController, PreferencesController],
  providers: [AttachmentsService, MasterService, SecurityPassword],
})
export class MasterModule {}
