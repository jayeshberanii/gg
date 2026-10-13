import { type DynamicModule, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { ENV, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { MasterModule } from './master/master.module.js';
import { WorkLogModule } from './work-log/work-log.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: { production: 'info', development: 'debug', test: 'silent' }[env.NODE_ENV],
            transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
            genReqId: (req, res) => {
              const id = req.headers['x-request-id']?.toString() || randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
        }),
        DbModule,
        AuthModule,
        WorkLogModule,
        MasterModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
