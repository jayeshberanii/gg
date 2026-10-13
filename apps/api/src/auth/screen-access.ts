import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canOpenScreen, SCREENS } from '@gglib/shared';
import type { AuthedRequest } from './decorators.js';

const SCREEN = 'screen';

/**
 * Restricts a controller (or route) to users whose main menu shows the screen, using the same
 * rules as Frmlibmain (`canOpenScreen`). The desktop only hid menu items; the web API also
 * refuses the data.
 */
export function ScreenAccess(screenId: string) {
  if (!SCREENS.has(screenId)) throw new Error(`Unknown screen "${screenId}" in @ScreenAccess`);
  return applyDecorators(SetMetadata(SCREEN, screenId), UseGuards(ScreenAccessGuard));
}

@Injectable()
export class ScreenAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const screenId = this.reflector.getAllAndOverride<string>(SCREEN, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const { user } = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!screenId || !user || !canOpenScreen(user, screenId)) {
      throw new ForbiddenException('You do not have access to this screen');
    }
    return true;
  }
}
