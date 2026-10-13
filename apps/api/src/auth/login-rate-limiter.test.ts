import { describe, expect, it } from 'vitest';
import { LoginRateLimiter } from './login-rate-limiter.js';

describe('LoginRateLimiter', () => {
  it('locks after 5 failures and unlocks when the window passes', () => {
    let t = 0;
    const limiter = new LoginRateLimiter(() => t);
    for (let i = 0; i < 5; i++) limiter.recordFailure('Guest', '1.2.3.4');
    expect(limiter.retryAfterMs('guest', '1.2.3.4')).toBeGreaterThan(0);
    expect(limiter.retryAfterMs('guest', '5.6.7.8')).toBe(0);
    t += 15 * 60 * 1000;
    expect(limiter.retryAfterMs('guest', '1.2.3.4')).toBe(0);
  });

  it('clears the count on success', () => {
    const limiter = new LoginRateLimiter(() => 0);
    for (let i = 0; i < 4; i++) limiter.recordFailure('a', 'ip');
    limiter.recordSuccess('a', 'ip');
    limiter.recordFailure('a', 'ip');
    expect(limiter.retryAfterMs('a', 'ip')).toBe(0);
  });
});
