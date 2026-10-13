import 'reflect-metadata';
import type { DB } from '@gglib/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type ControlledTransaction, sql } from 'kysely';
import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { encodeLegacyPassword } from '../src/auth/legacy-password.js';
import { loadEnv } from '../src/config/env.js';
import { configureApp } from '../src/configure-app.js';
import { createDatabase, type Database, KYSELY } from '../src/db/db.module.js';

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
/** The integration tests run only against a configured database (apps/api/.env). */
export const hasDb = Boolean(process.env.DB_HOST);
export const SECURITY = 'test-security-pw';
/** Issue Master's Replace LibNo password (ISSUE_REPLACE_PASSWORD) in the tests. */
export const ISSUE_REPLACE = 'test-issue-replace-pw';
/** Graphics Master's Lock / Unlock password (GRAPHICS_LOCK_PASSWORD) in the tests. */
export const GRAPHICS_LOCK = 'test-graphics-lock-pw';
const PASSWORD = 'Secret1';

export type Harness = {
  /** The transaction every request runs in; rolled back after each test. */
  trx: ControlledTransaction<DB>;
  /** Signed in as a plain Operator (UserTypeKt 3). */
  user: request.Agent;
  /** Signed in as an admin. */
  admin: request.Agent;
  /** Signs in a new user of this type (Usecurity.UserTypeKt). */
  signIn: (userType: number, isAdmin?: boolean) => Promise<request.Agent>;
  /** The first column of the first row. */
  scalar: (q: {
    execute: (db: ControlledTransaction<DB>) => Promise<{ rows: unknown[] }>;
  }) => Promise<number>;
};

/**
 * The master screens' integration setup: the app on a transaction of the real DB, with a user
 * and an admin signed in, all rolled back after every test. Call inside a `describe`.
 */
export function useMasterHarness(): Harness {
  let db: Database;
  let app: NestExpressApplication;
  let stamp = 0;
  let n = 0;
  const h = {} as Harness;

  beforeAll(() => {
    db = createDatabase(loadEnv());
  });
  afterAll(async () => {
    await db.destroy();
  });

  h.signIn = async (userType: number, isAdmin = false) => {
    const name = `mt${stamp}u${n++}`;
    await sql`
      INSERT INTO Usecurity (uname, upwd, uadd, umodify, udel, uview, IsAdmin, IsActive, UserTypeKt, WorkingHours)
      VALUES (${name}, CONVERT(varchar(50), ${encodeLegacyPassword(PASSWORD)}), 0, 0, 0, 1, ${isAdmin ? 1 : 0}, 1,
              ${userType}, '08:00')
    `.execute(h.trx);
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/login').send({ username: name, password: PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  };
  h.scalar = async (q) => Number(Object.values((await q.execute(h.trx)).rows[0] as object)[0]);

  beforeEach(async () => {
    h.trx = await db.startTransaction().execute();
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      SECURITY_PASSWORD: SECURITY,
      ISSUE_REPLACE_PASSWORD: ISSUE_REPLACE,
      GRAPHICS_LOCK_PASSWORD: GRAPHICS_LOCK,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
      .overrideProvider(KYSELY)
      .useValue(h.trx)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();
    stamp = Date.now() % 1_000_000;
    h.user = await h.signIn(3);
    h.admin = await h.signIn(3, true);
  });

  afterEach(async () => {
    await app.close();
    await h.trx.rollback().execute();
  });

  return h;
}
