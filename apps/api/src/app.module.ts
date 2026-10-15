import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { AdminController } from './admin/admin.controller';
import { AdminUsersService } from './admin/admin-users.service';
import { AnalyticsService } from './admin/analytics.service';
import { AuthModule } from './auth/auth.module';
import { AvailabilityService } from './bookings/availability.service';
import { BookingsController } from './bookings/bookings.controller';
import { BookingsService } from './bookings/bookings.service';
import { QrService } from './bookings/qr.service';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { ENV, Env, loadEnv } from './config/env';
import { FilesController } from './files/files.controller';
import { StorageService } from './files/storage.service';
import { HealthController } from './health.controller';
import { JobsService } from './jobs/jobs.service';
import { AdminKycController, MyKycController } from './kyc/kyc.controller';
import { KycService } from './kyc/kyc.service';
import { AdminLocationsController, LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StaffController } from './staff/staff.controller';
import { StaffService } from './staff/staff.service';
import { MeController } from './users/me.controller';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ExchangeService } from './bookings/exchange.service';
import { OnchainService } from './wallets/onchain.service';
import { WalletScreeningService } from './wallets/screening.service';
import { AdminWalletsController, WalletsController } from './wallets/wallets.controller';
import { WalletsService } from './wallets/wallets.service';

@Module({
  imports: [
    CommonModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ name: 'default', ttl: env.RATE_LIMIT_TTL_SEC * 1000, limit: env.RATE_LIMIT_MAX }],
        // Contadores compartidos entre réplicas.
        storage: new ThrottlerStorageRedisService(new Redis(env.REDIS_URL)),
      }),
    }),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(loadEnv().REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            username: url.username || undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
    MessagingModule,
    WebhooksModule,
    NotificationsModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    MeController,
    FilesController,
    MyKycController,
    AdminKycController,
    LocationsController,
    AdminLocationsController,
    BookingsController,
    StaffController,
    AdminController,
    WalletsController,
    AdminWalletsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    StorageService,
    KycService,
    LocationsService,
    AvailabilityService,
    QrService,
    BookingsService,
    StaffService,
    AdminUsersService,
    AnalyticsService,
    JobsService,
    OnchainService,
    WalletScreeningService,
    WalletsService,
    ExchangeService,
  ],
})
export class AppModule {}
