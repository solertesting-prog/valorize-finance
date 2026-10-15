import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS } from '../common/common.module';
import { PrismaService } from '../common/prisma.service';
import { ENV, Env } from '../config/env';
import { BookingsService } from '../bookings/bookings.service';
import { KycService } from '../kyc/kyc.service';
import { StorageService } from '../files/storage.service';

/**
 * Tareas periódicas. Con varias réplicas de la API, un lock en Redis garantiza
 * que cada tarea se ejecuta en una sola instancia.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly kyc: KycService,
    private readonly storage: StorageService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async exclusive(name: string, ttlSec: number, fn: () => Promise<unknown>) {
    if (this.env.DISABLE_JOBS) return;
    const ok = await this.redis.set(`job:${name}`, process.pid.toString(), 'EX', ttlSec, 'NX');
    if (ok !== 'OK') return;
    try {
      const r = await fn();
      if (r) this.logger.log(`${name}: ${JSON.stringify(r)}`);
    } catch (e) {
      this.logger.error(`${name} falló`, e as Error);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  reminders() {
    return this.exclusive('reminders', 240, async () => {
      const n = await this.bookings.sendReminders();
      return n ? { sent: n } : null;
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  noShows() {
    return this.exclusive('no-shows', 240, async () => {
      const n = await this.bookings.sweepNoShows();
      return n ? { marked: n } : null;
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  kycExpiry() {
    return this.exclusive('kyc-expiry', 3000, async () => {
      const expired = await this.prisma.kycProfile.findMany({
        where: { status: 'APPROVED', expiresAt: { lt: new Date() } },
        select: { userId: true },
      });
      for (const p of expired) {
        await this.prisma.kycProfile.update({ where: { userId: p.userId }, data: { status: 'EXPIRED' } });
        await this.kyc.notifyStatus(p.userId, 'EXPIRED');
      }
      return expired.length ? { expired: expired.length } : null;
    });
  }

  /** Limpieza: subidas abandonadas, códigos y sesiones caducadas. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Europe/Madrid' })
  cleanup() {
    return this.exclusive('cleanup', 3000, async () => {
      const stale = await this.prisma.file.findMany({
        where: { status: 'PENDING_UPLOAD', createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
        select: { id: true, key: true },
        take: 1000,
      });
      for (const f of stale) {
        await this.storage.remove(f.key).catch(() => undefined);
        await this.prisma.file.update({ where: { id: f.id }, data: { status: 'DELETED', deletedAt: new Date() } });
      }
      const codes = await this.prisma.verificationCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
      const sessions = await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 30 * 86400_000) } } });
      return { files: stale.length, codes: codes.count, sessions: sessions.count };
    });
  }
}
