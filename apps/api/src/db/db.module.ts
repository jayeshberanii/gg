import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { DB } from '@gglib/db';
import { Kysely, MssqlDialect } from 'kysely';
import * as Tarn from 'tarn';
import * as Tedious from 'tedious';
import { ENV, type Env } from '../config/env.js';

export const KYSELY = Symbol('KYSELY');
export type Database = Kysely<DB>;

export function createDatabase(env: Env): Database {
  return new Kysely<DB>({
    dialect: new MssqlDialect({
      // min: 0 lets the API boot while SQL Server is unreachable; /api/health reports it.
      tarn: { ...Tarn, options: { min: 0, max: 10 } },
      tedious: {
        ...Tedious,
        connectionFactory: () =>
          new Tedious.Connection({
            server: env.DB_HOST,
            authentication: {
              type: 'default',
              options: { userName: env.DB_USER, password: env.DB_PASSWORD },
            },
            options: {
              port: env.DB_PORT,
              database: env.DB_NAME,
              encrypt: env.DB_ENCRYPT,
              trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
              connectTimeout: 5000,
            },
          }),
      },
    }),
  });
}

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    // A transaction handed in by tests is owned (and rolled back) by the test.
    if (!this.db.isTransaction) await this.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    { provide: KYSELY, inject: [ENV], useFactory: (env: Env) => createDatabase(env) },
    DatabaseShutdown,
  ],
  exports: [KYSELY],
})
export class DbModule {}
