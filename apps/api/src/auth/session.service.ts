import { Inject, Injectable } from '@nestjs/common';
import { sessionUserSchema, type SessionUser } from '@gglib/shared';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';

export const SESSION_COOKIE = 'gglib_session';
const LOGIN_TICKET_MINUTES = 10;

const ticketSchema = z.object({ purpose: z.literal('login-ticket'), uid: z.number().int() });

/** Signs and verifies the session token (a cookie) and the short-lived login ticket. */
@Injectable()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  get sessionMaxAgeMs(): number {
    return this.env.SESSION_HOURS * 3600 * 1000;
  }

  get secureCookies(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  async signSession(user: SessionUser): Promise<string> {
    return new SignJWT({ user })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(user.id))
      .setIssuedAt()
      .setExpirationTime(`${this.env.SESSION_HOURS}h`)
      .sign(this.key);
  }

  /** The session's user, or null for a missing, forged or expired token. */
  async verifySession(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      const parsed = sessionUserSchema.safeParse(payload.user);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async signLoginTicket(uid: number): Promise<string> {
    return new SignJWT({ purpose: 'login-ticket', uid })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${LOGIN_TICKET_MINUTES}m`)
      .sign(this.key);
  }

  async verifyLoginTicket(ticket: string): Promise<number | null> {
    try {
      const { payload } = await jwtVerify(ticket, this.key, { algorithms: ['HS256'] });
      const parsed = ticketSchema.safeParse(payload);
      return parsed.success ? parsed.data.uid : null;
    } catch {
      return null;
    }
  }
}
