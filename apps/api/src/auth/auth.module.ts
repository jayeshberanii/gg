import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AttendanceService } from '../attendance/attendance.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AttendanceService,
    SessionService,
    { provide: LoginRateLimiter, useFactory: () => new LoginRateLimiter() },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AttendanceService, SessionService],
})
export class AuthModule {}
