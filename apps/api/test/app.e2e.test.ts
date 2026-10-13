import 'reflect-metadata';
import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { apiErrorSchema, healthResponseSchema } from '@gglib/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { Public } from '../src/auth/decorators.js';
import { loadEnv } from '../src/config/env.js';
import { configureApp } from '../src/configure-app.js';
import { KYSELY } from '../src/db/db.module.js';

@Public()
@Controller('boom')
class BoomController {
  @Get('sql')
  sql(): never {
    throw new Error("Invalid column name 'secret_col'");
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundException('Record not found');
  }

  @Post('count')
  count(@Body() body: { gridIds: number[] }): { count: number } {
    return { count: body.gridIds.length };
  }
}

// A Kysely stand-in whose queries always fail, as if SQL Server were unreachable.
const unreachableDb = {
  getExecutor: () => ({
    compileQuery: (node: unknown) => ({ query: node, sql: '', parameters: [] }),
    transformQuery: (node: unknown) => node,
    executeQuery: () => Promise.reject(new Error('ECONNREFUSED')),
  }),
};

describe('API (e2e, no database)', () => {
  let app: NestExpressApplication;

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
      controllers: [BoomController],
    })
      .overrideProvider(KYSELY)
      .useValue({ ...unreachableDb, destroy: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health reports the database as down when SQL Server is unreachable', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(healthResponseSchema.parse(res.body)).toMatchObject({
      status: 'degraded',
      database: 'down',
    });
  });

  it('accepts a master search body carrying 200,000 grid ids (over the 100kb default)', async () => {
    const gridIds = Array.from({ length: 200_000 }, (_, i) => 1_000_000 + i);
    const res = await request(app.getHttpServer())
      .post('/api/boom/count')
      .set('Content-Type', 'application/json')
      .send({ gridIds })
      .expect(201);
    expect(res.body).toEqual({ count: 200_000 });
  });

  it('hides internal error messages behind a generic 500', async () => {
    const res = await request(app.getHttpServer()).get('/api/boom/sql').expect(500);
    const body = apiErrorSchema.parse(res.body);
    expect(body.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(res.body)).not.toContain('secret_col');
    expect(body.requestId).toBe(res.headers['x-request-id']);
  });

  it('does not advertise the server framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('passes deliberate HTTP errors through', async () => {
    const res = await request(app.getHttpServer()).get('/api/boom/missing').expect(404);
    expect(apiErrorSchema.parse(res.body)).toMatchObject({
      error: 'Not Found',
      message: 'Record not found',
    });
  });
});
