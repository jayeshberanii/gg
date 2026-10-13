import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { canOpenScreen } from '@gglib/shared';
import type { AuthedRequest } from '../auth/decorators.js';
import { screenDefinition } from './screens/registry.js';

/** @ScreenAccess for the engine's `:screen` routes: the menu rules, per request. */
@Injectable()
export class ScreenParamGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest & { params: { screen?: string } }>();
    const screen = req.params.screen ?? '';
    const def = screenDefinition(screen);
    if (!def || !req.user || !canOpenScreen(req.user, def.accessScreen ?? screen)) {
      throw new ForbiddenException('You do not have access to this screen');
    }
    return true;
  }
}
