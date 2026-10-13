import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { SessionUser } from '@gglib/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ScreenAccess } from '../src/auth/screen-access.js';
import { SESSION_COOKIE, SessionService } from '../src/auth/session.service.js';
import { loadEnv } from '../src/config/env.js';
import { configureApp } from '../src/configure-app.js';
import { KYSELY } from '../src/db/db.module.js';

@ScreenAccess('apprisal-standard')
@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return { ok: true };
  }
}

const base: SessionUser = {
  id: 42,
  username: 'u',
  isAdmin: false,
  userType: 3,
  rights: { add: true, modify: true, delete: true, view: true },
  logId: 1,
};

describe('@ScreenAccess (menu rules on the API)', () => {
  let app: NestExpressApplication;
  let sessions: SessionService;

  beforeAll(async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(32),
      DB_HOST: 'unused',
      DB_NAME: 'unused',
      DB_USER: 'unused',
      DB_PASSWORD: 'unused',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(env)],
      controllers: [ProbeController],
    })
      .overrideProvider(KYSELY)
      .useValue({ destroy: async () => undefined, isTransaction: false })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();
    sessions = app.get(SessionService);
  });

  afterAll(async () => {
    await app.close();
  });

  const as = async (user: SessionUser) =>
    request(app.getHttpServer())
      .get('/api/probe')
      .set('Cookie', `${SESSION_COOKIE}=${await sessions.signSession(user)}`);

  it('refuses users whose menu hides the screen', async () => {
    const res = await as(base);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You do not have access to this screen');
  });

  it('allows the users Frmlibmain shows it to', async () => {
    expect((await as({ ...base, isAdmin: true })).status).toBe(200);
    expect((await as({ ...base, id: 5 })).status).toBe(200);
    expect((await as({ ...base, id: 100 })).status).toBe(200);
  });

  it('still requires a session first', async () => {
    expect((await request(app.getHttpServer()).get('/api/probe')).status).toBe(401);
  });

  it('rejects unknown screen ids at startup', () => {
    expect(() => ScreenAccess('no-such-screen')).toThrow(/Unknown screen/);
  });
});
