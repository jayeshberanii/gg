import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ENV, type Env } from '../config/env.js';

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** The Security dialog's check (frmDeleteList), done on the server. */
@Injectable()
export class SecurityPassword {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * InputBoxProc(Password, Password1): `first` replaces the first accepted password when a form
   * passes its own (Author Master's Lock Author); the second one is always accepted.
   */
  assert(password: string, first?: string): void {
    const accepted = [first ?? this.env.SECURITY_PASSWORD, this.env.SECURITY_PASSWORD_ALT].filter(
      (p): p is string => Boolean(p),
    );
    if (accepted.length === 0) {
      throw new ServiceUnavailableException(
        'The security password is not configured on the server',
      );
    }
    // frmDeleteList compares the trimmed entry.
    const given = digest(password.trim());
    if (!accepted.some((p) => timingSafeEqual(digest(p), given))) {
      throw new UnauthorizedException('Invalid security password');
    }
  }
}
