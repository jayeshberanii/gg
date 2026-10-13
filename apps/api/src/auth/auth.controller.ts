import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type LoginResponse,
  type LoginSuccess,
  leaveSubmitRequestSchema,
  loginRequestSchema,
  type PendingWorkReport,
  requiresWorkReport,
  type SessionUser,
} from '@gglib/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AttendanceService, type AttendanceUser } from '../attendance/attendance.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const logoutRequestSchema = z.object({ recordLogoutTime: z.boolean() });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly attendance: AttendanceService,
    private readonly sessions: SessionService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  /**
   * Step 1 of logging in. Either starts the session, or answers `leave-required` with a
   * ticket when the desktop's attendance rules demand a leave application first.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: z.infer<typeof loginRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const ip = req.ip ?? 'unknown';
    const retryMs = this.limiter.retryAfterMs(body.username, ip);
    if (retryMs > 0) {
      res.setHeader('Retry-After', Math.ceil(retryMs / 1000));
      throw new HttpException(
        'Too many failed attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let user: AttendanceUser;
    try {
      user = await this.auth.verifyCredentials(body.username, body.password);
    } catch (err) {
      if (err instanceof UnauthorizedException) this.limiter.recordFailure(body.username, ip);
      throw err;
    }
    this.limiter.recordSuccess(body.username, ip);

    const leave = await this.attendance.leaveRequirement(user);
    if (leave) {
      return {
        status: 'leave-required',
        ticket: await this.sessions.signLoginTicket(user.id),
        leave,
      };
    }
    return this.completeLogin(user, res);
  }

  /** Step 2, when asked: saves the leave application, then starts the session. */
  @Public()
  @Post('login/leave')
  @HttpCode(HttpStatus.OK)
  async submitLeave(
    @Body(new ZodValidationPipe(leaveSubmitRequestSchema))
    body: z.infer<typeof leaveSubmitRequestSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginSuccess> {
    const uid = await this.sessions.verifyLoginTicket(body.ticket);
    const user = uid === null ? null : await this.auth.activeUser(uid);
    if (!user) throw new UnauthorizedException('Your login has expired. Please log in again.');
    await this.attendance.submitLeave(user, body.leaveTypeId, body.reason);
    return this.completeLogin(user, res);
  }

  /** The signed-in user, for restoring the app after a page reload. */
  @Get('me')
  me(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user };
  }

  @Get('pending-work-reports')
  async pendingWorkReports(@CurrentUser() user: SessionUser): Promise<PendingWorkReport[]> {
    return requiresWorkReport(user) ? this.attendance.pendingWorkReports(user.id) : [];
  }

  /**
   * Ends the session (the desktop's FormClosing). `recordLogoutTime` is set when the user
   * closed the work report without saving it, which still stamps today's logout time.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(logoutRequestSchema)) body: z.infer<typeof logoutRequestSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (body.recordLogoutTime) await this.attendance.recordLogoutTime(user.logId);
    await this.attendance.releaseEditLocks(user.id);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private async completeLogin(user: AttendanceUser, res: Response): Promise<LoginSuccess> {
    const { logId, ...session } = await this.attendance.startSession(user);
    const sessionUser: SessionUser = { ...user, logId };
    res.cookie(SESSION_COOKIE, await this.sessions.signSession(sessionUser), {
      ...this.cookieOptions(),
      maxAge: this.sessions.sessionMaxAgeMs,
    });
    return { status: 'ok', user: sessionUser, ...session };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: this.sessions.secureCookies,
      path: '/',
    };
  }
}
