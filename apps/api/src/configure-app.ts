import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { jsonOnly } from './common/json-only.middleware.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import type { Env } from './config/env.js';

/** HTTP-level setup shared by main.ts and the e2e tests, so tests exercise the real config. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.disable('x-powered-by');
  // CORS first, so that even rejected requests carry headers the web app can read.
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
  app.use(cookieParser());
  // Express's default 100kb is too small: master search / print send the grid's visible ids
  // (up to 1,000,000, see `ids` in @gglib/shared master.ts) and F2 picks up to 10,000 values.
  app.useBodyParser('json', { limit: '50mb' });
  app.use(jsonOnly);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());
}
