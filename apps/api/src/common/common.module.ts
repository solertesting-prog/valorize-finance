import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV, Env, loadEnv } from '../config/env';
import { AuditService } from './audit.service';
import { CryptoService } from './crypto.service';
import { PrismaService } from './prisma.service';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    PrismaService,
    CryptoService,
    AuditService,
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false }),
    },
  ],
  exports: [ENV, PrismaService, CryptoService, AuditService, REDIS],
})
export class CommonModule {}
