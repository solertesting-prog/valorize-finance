import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  adminExchangeQuerySchema,
  adminUserCreateSchema,
  approveBookingSchema,
  rejectBookingSchema,
  uuid,
  adminUserUpdateSchema,
  analyticsQuerySchema,
  auditQuerySchema,
  bookingListQuerySchema,
  cancelBookingSchema,
  paginationSchema,
  rescheduleBookingSchema,
  staffTransitionSchema,
  userListQuerySchema,
  webhookEndpointSchema,
} from '@valorize/shared';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod-validation.pipe';
import { bookingInclude } from '../bookings/booking.mapper';
import { BookingsService } from '../bookings/bookings.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WalletsService } from '../wallets/wallets.service';
import { AdminUsersService } from './admin-users.service';
import { AnalyticsService } from './analytics.service';

const approvalsQuery = z.object({ locationId: uuid.optional() });

@ApiTags('admin')
@ApiBearerAuth()
@Roles('MANAGER', 'ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: AdminUsersService,
    private readonly bookings: BookingsService,
    private readonly analytics: AnalyticsService,
    private readonly webhooks: WebhooksService,
    private readonly wallets: WalletsService,
  ) {}

  // ─────────── Aprobación de solicitudes ───────────

  @Get('approvals')
  async approvals(@Query(new ZodPipe(approvalsQuery)) q: z.infer<typeof approvalsQuery>) {
    const rows = await this.bookings.pendingApprovals(q.locationId);
    return Promise.all(
      rows.map(async (b) => ({
        booking: this.bookings.dto(b, true),
        screening: b.exchange ? await this.wallets.latestScreening(b.exchange.walletId) : null,
      })),
    );
  }

  /** Todas las operaciones de cambio (web y app) con wallet, auditoría y verificación de la transacción. */
  @Get('exchanges')
  exchanges(@Query(new ZodPipe(adminExchangeQuerySchema)) q: z.infer<typeof adminExchangeQuerySchema>) {
    return this.bookings.adminExchanges(q);
  }

  @Post('bookings/:id/approve')
  approve(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(approveBookingSchema)) b: z.infer<typeof approveBookingSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.approve(u, id, b, meta);
  }

  @Post('bookings/:id/reject')
  reject(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rejectBookingSchema)) b: z.infer<typeof rejectBookingSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.reject(u, id, b.reason, meta);
  }

  // ─────────── Usuarios y roles ───────────

  @Get('users')
  listUsers(@Query(new ZodPipe(userListQuerySchema)) q: z.infer<typeof userListQuerySchema>) {
    return this.users.list(q);
  }

  @Get('users/:id')
  user(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.detail(id, u.id, meta);
  }

  @Post('users')
  createUser(@CurrentUser() u: AuthUser, @Body(new ZodPipe(adminUserCreateSchema)) b: z.infer<typeof adminUserCreateSchema>, @ReqMeta() meta: RequestMeta) {
    return this.users.create(b, u, meta);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(adminUserUpdateSchema)) b: z.infer<typeof adminUserUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.update(id, b, u, meta);
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(204)
  revokeSessions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.revokeSessions(id, u.id, meta);
  }

  @Roles('ADMIN')
  @Post('users/:id/reset-mfa')
  @HttpCode(204)
  resetMfa(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.resetMfa(id, u.id, meta);
  }

  // ─────────── Citas ───────────

  @Get('bookings')
  async listBookings(@Query(new ZodPipe(bookingListQuerySchema)) q: z.infer<typeof bookingListQuerySchema>) {
    const tz = 'Europe/Madrid';
    const where: Prisma.BookingWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.locationId ? { locationId: q.locationId } : {}),
      ...(q.serviceId ? { serviceId: q.serviceId } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.from || q.to
        ? {
            startsAt: {
              ...(q.from ? { gte: DateTime.fromISO(q.from, { zone: tz }).startOf('day').toJSDate() } : {}),
              ...(q.to ? { lte: DateTime.fromISO(q.to, { zone: tz }).endOf('day').toJSDate() } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' } },
              { user: { email: { contains: q.q, mode: 'insensitive' } } },
              { user: { lastName: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { startsAt: q.scope === 'past' ? 'desc' : 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: items.map((b) => this.bookings.dto(b, true)), total, page: q.page, pageSize: q.pageSize };
  }

  @Get('bookings/:id')
  async booking(@Param('id', ParseUUIDPipe) id: string) {
    const b = await this.bookings.findAny(id);
    return { booking: this.bookings.dto(b, true), events: await this.bookings.events(id) };
  }

  @Post('bookings/:id/cancel')
  cancel(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cancelBookingSchema)) b: z.infer<typeof cancelBookingSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.cancel(u, id, b.reason, meta);
  }

  @Post('bookings/:id/reschedule')
  reschedule(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rescheduleBookingSchema)) b: z.infer<typeof rescheduleBookingSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.reschedule(u, id, b.startsAt, b.locationId, meta);
  }

  @Post('bookings/:id/transition')
  transition(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(staffTransitionSchema)) b: z.infer<typeof staffTransitionSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.staffTransition(u, id, b.status, b.note, meta);
  }

  // ─────────── Analítica ───────────

  @Get('analytics')
  overview(@Query(new ZodPipe(analyticsQuerySchema)) q: z.infer<typeof analyticsQuerySchema>) {
    return this.analytics.overview(q.from, q.to, q.locationId);
  }

  // ─────────── Auditoría ───────────

  @Roles('ADMIN')
  @Get('audit')
  async audit(@Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        actor: a.actor ? { id: a.actor.id, name: `${a.actor.firstName} ${a.actor.lastName}`, role: a.actor.role } : null,
        ip: a.ip,
        userAgent: a.userAgent,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // ─────────── Webhooks ───────────

  @Roles('ADMIN')
  @Get('webhooks')
  listWebhooks() {
    return this.webhooks.list();
  }

  @Roles('ADMIN')
  @Post('webhooks')
  createWebhook(@Body(new ZodPipe(webhookEndpointSchema)) b: z.infer<typeof webhookEndpointSchema>) {
    return this.webhooks.create(b);
  }

  @Roles('ADMIN')
  @Patch('webhooks/:id')
  updateWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(webhookEndpointSchema.partial())) b: Partial<z.infer<typeof webhookEndpointSchema>>,
  ) {
    return this.webhooks.update(id, b);
  }

  @Roles('ADMIN')
  @Delete('webhooks/:id')
  @HttpCode(204)
  deleteWebhook(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.remove(id);
  }

  @Roles('ADMIN')
  @Post('webhooks/:id/rotate-secret')
  rotate(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.rotateSecret(id);
  }

  @Roles('ADMIN')
  @Post('webhooks/:id/test')
  test(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.sendTest(id);
  }

  @Roles('ADMIN')
  @Get('webhooks/:id/deliveries')
  deliveries(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(paginationSchema)) q: z.infer<typeof paginationSchema>) {
    return this.webhooks.deliveries(id, q.page, q.pageSize);
  }

  @Roles('ADMIN')
  @Post('webhooks/deliveries/:deliveryId/redeliver')
  @HttpCode(204)
  redeliver(@Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    return this.webhooks.redeliver(deliveryId);
  }
}
