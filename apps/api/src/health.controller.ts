import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
import { Public } from './common/auth.decorators';
import { REDIS } from './common/common.module';
import { PrismaService } from './common/prisma.service';

@ApiTags('salud')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: el proceso responde. */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencias críticas disponibles. */
  @Public()
  @Get('ready')
  async ready() {
    const [db, cache] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);
    const ok = db.status === 'fulfilled' && cache.status === 'fulfilled';
    if (!ok) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'Dependencias no disponibles',
        details: { database: db.status, redis: cache.status },
      });
    }
    return { status: 'ok', database: 'ok', redis: 'ok' };
  }
}
