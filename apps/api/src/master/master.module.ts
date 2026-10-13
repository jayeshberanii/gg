import { Module } from '@nestjs/common';
import { MasterController } from './master.controller.js';
import { MasterService } from './master.service.js';
import { PreferencesController } from './preferences.controller.js';
import { SecurityPassword } from './security-password.js';

@Module({
  controllers: [MasterController, PreferencesController],
  providers: [MasterService, SecurityPassword],
})
export class MasterModule {}
