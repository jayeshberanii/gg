import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@gglib/shared';
import { sql } from 'kysely';
import { Public } from '../auth/decorators.js';
import { KYSELY, type Database } from '../db/db.module.js';

const VERSION = process.env.npm_package_version ?? '0.0.0';

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const database = await sql`SELECT 1 AS ok`
      .execute(this.db)
      .then(() => 'up' as const)
      .catch(() => 'down' as const);
    return { status: database === 'up' ? 'ok' : 'degraded', database, version: VERSION };
  }
}
