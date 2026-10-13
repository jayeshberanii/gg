import { Injectable } from '@nestjs/common';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Locks a username+IP pair after repeated failed logins. The desktop had no such limit, and
 * many legacy passwords are only a few characters long, so this is the main guard against
 * guessing. In-memory: correct for one API instance; move to a shared store before scaling out.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly failures = new Map<string, { count: number; firstAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private key(username: string, ip: string): string {
    return `${ip}|${username.trim().toLowerCase()}`;
  }

  /** Milliseconds until the pair may try again, or 0 when not locked. */
  retryAfterMs(username: string, ip: string): number {
    const entry = this.failures.get(this.key(username, ip));
    if (!entry) return 0;
    const elapsed = this.now() - entry.firstAt;
    if (elapsed >= WINDOW_MS) {
      this.failures.delete(this.key(username, ip));
      return 0;
    }
    return entry.count >= MAX_FAILURES ? WINDOW_MS - elapsed : 0;
  }

  recordFailure(username: string, ip: string): void {
    const key = this.key(username, ip);
    const entry = this.failures.get(key);
    if (!entry || this.now() - entry.firstAt >= WINDOW_MS) {
      this.failures.set(key, { count: 1, firstAt: this.now() });
    } else {
      entry.count++;
    }
  }

  recordSuccess(username: string, ip: string): void {
    this.failures.delete(this.key(username, ip));
  }
}
