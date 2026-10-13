import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  JWT_SECRET: 'x'.repeat(32),
  DB_HOST: 'h',
  DB_NAME: 'DBLibSQLTest',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
};

describe('loadEnv', () => {
  it('applies defaults and splits CORS origins', () => {
    const env = loadEnv({ ...base, CORS_ORIGIN: 'http://a, http://b' });
    expect(env.PORT).toBe(8080);
    expect(env.DB_PORT).toBe(1433);
    expect(env.DB_ENCRYPT).toBe(false);
    expect(env.CORS_ORIGIN).toEqual(['http://a', 'http://b']);
  });

  it('names every missing variable, without echoing values', () => {
    expect(() => loadEnv({ DB_PASSWORD: 'secret' })).toThrow(/DB_HOST[\s\S]*DB_NAME[\s\S]*DB_USER/);
    expect(() => loadEnv({ DB_PASSWORD: 'secret' })).not.toThrow(/secret/);
  });
});
