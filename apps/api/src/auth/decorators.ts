import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { SessionUser } from '@gglib/shared';

export const IS_PUBLIC = 'isPublic';

/** Opts a route out of the session check (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthedRequest = { user?: SessionUser; cookies?: Record<string, string> };

/** The signed-in user; only valid on routes behind SessionGuard. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser => {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new Error('CurrentUser used on a public route');
    return user;
  },
);
