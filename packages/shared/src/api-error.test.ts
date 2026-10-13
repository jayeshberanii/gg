import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from './api-error.js';

describe('apiErrorSchema', () => {
  it('accepts a validation error with field details', () => {
    const parsed = apiErrorSchema.parse({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: [{ path: 'bhasha_nm', message: 'Required' }],
    });
    expect(parsed.details).toHaveLength(1);
  });

  it('rejects a payload without a status code', () => {
    expect(apiErrorSchema.safeParse({ error: 'x', message: 'y' }).success).toBe(false);
  });
});
