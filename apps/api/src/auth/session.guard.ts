import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthedRequest, IS_PUBLIC } from './decorators.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

/** Global guard: every route needs a valid session cookie unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.sessions.verifySession(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException('Please log in');
    req.user = user;
    return true;
  }
}
