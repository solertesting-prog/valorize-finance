import { Injectable, Logger } from '@nestjs/common';
import { AlertRule, AlertSeverity, ChainNetwork, Prisma } from '@prisma/client';
import type { AlertQuery, AlertUpdateInput, ComplianceAlertDto } from '@valorize/shared';
import { WebhookEvent } from '@valorize/shared';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';

/** Umbrales de las reglas. Conservadores: mejor revisar de más que de menos. */
export const RULES = {
  STRUCTURING: { days: 7, count: 3, bandFrom: 0.8 },
  VELOCITY: { hours: 24, count: 5 },
  MANY_WALLETS: { days: 30, count: 4 },
  REPEATED_REJECTIONS: { days: 30, count: 3 },
} as const;

const SEVERITY: Record<AlertRule, AlertSeverity> = {
  STRUCTURING: 'MEDIUM',
  VELOCITY: 'MEDIUM',
  MANY_WALLETS: 'MEDIUM',
  SHARED_WALLET: 'HIGH',
  BLOCKED_WALLET_ATTEMPT: 'HIGH',
  REPEATED_REJECTIONS: 'MEDIUM',
};

const ago = (ms: number) => new Date(Date.now() - ms);
const DAY = 86_400_000;

/**
 * Alertas de cumplimiento: detecta patrones sospechosos en las solicitudes de cambio
 * (fraccionamiento, velocidad, muchas wallets, wallets compartidas o bloqueadas, rechazos).
 * Una alerta abierta impide la aprobación automática del cliente; el equipo la revisa y la cierra con una nota.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  /** Evalúa las reglas tras una nueva solicitud de cambio. No lanza errores: nunca bloquea la solicitud. */
  async afterExchangeRequest(userId: string, bookingId: string) {
    try {
      const s = await this.prisma.exchangeSettings.findUnique({ where: { id: 1 } });
      const ex = await this.prisma.exchangeRequest.findUnique({ where: { bookingId }, include: { wallet: true } });
      if (!ex) return;
      const mine = { booking: { userId } };

      // Fraccionamiento: varias solicitudes justo por debajo del umbral de verificación ampliada / propiedad.
      const threshold = Prisma.Decimal.min(s?.enhancedKycAbove ?? new Prisma.Decimal(1000), s?.ownershipRequiredAbove ?? new Prisma.Decimal(1000));
      const near = await this.prisma.exchangeRequest.findMany({
        where: {
          ...mine,
          createdAt: { gte: ago(RULES.STRUCTURING.days * DAY) },
          amount: { gte: threshold.times(RULES.STRUCTURING.bandFrom), lt: threshold },
        },
        select: { amount: true, booking: { select: { reference: true } } },
      });
      if (near.length >= RULES.STRUCTURING.count) {
        await this.raise(userId, 'STRUCTURING', {
          bookingId,
          details: {
            threshold: threshold.toString(),
            days: RULES.STRUCTURING.days,
            requests: near.map((n) => ({ reference: n.booking.reference, amount: n.amount.toString() })),
          },
        });
      }

      // Velocidad: muchas solicitudes en 24 h.
      const recent = await this.prisma.exchangeRequest.count({ where: { ...mine, createdAt: { gte: ago(RULES.VELOCITY.hours * 3600_000) } } });
      if (recent >= RULES.VELOCITY.count) await this.raise(userId, 'VELOCITY', { bookingId, details: { hours: RULES.VELOCITY.hours, requests: recent } });

      // Muchas wallets distintas en 30 días.
      const wallets = await this.prisma.exchangeRequest.findMany({
        where: { ...mine, createdAt: { gte: ago(RULES.MANY_WALLETS.days * DAY) } },
        distinct: ['walletId'],
        select: { walletId: true },
      });
      if (wallets.length >= RULES.MANY_WALLETS.count) {
        await this.raise(userId, 'MANY_WALLETS', { bookingId, details: { days: RULES.MANY_WALLETS.days, wallets: wallets.length } });
      }

      // Wallet que también usa otro cliente.
      const others = await this.prisma.cryptoWallet.findMany({
        where: { network: ex.wallet.network, address: ex.wallet.address, userId: { not: userId } },
        select: { userId: true },
      });
      if (others.length) {
        await this.raise(userId, 'SHARED_WALLET', {
          bookingId,
          walletId: ex.walletId,
          details: { network: ex.wallet.network, address: ex.wallet.address, otherCustomers: others.map((o) => o.userId) },
        });
      }

      // Rechazos repetidos.
      const rejected = await this.prisma.booking.count({
        where: { userId, status: 'REJECTED', rejectedAt: { gte: ago(RULES.REPEATED_REJECTIONS.days * DAY) } },
      });
      if (rejected >= RULES.REPEATED_REJECTIONS.count) {
        await this.raise(userId, 'REPEATED_REJECTIONS', { bookingId, details: { days: RULES.REPEATED_REJECTIONS.days, rejected } });
      }
    } catch (e) {
      this.logger.warn(`Evaluación de cumplimiento de ${bookingId}: ${(e as Error).message}`);
    }
  }

  /** El cliente intentó operar con una wallet bloqueada (sanciones, lista interna…). */
  async blockedWalletAttempt(userId: string, network: ChainNetwork, address: string, walletId?: string) {
    await this.raise(userId, 'BLOCKED_WALLET_ATTEMPT', { walletId, details: { network, address } }).catch((e) =>
      this.logger.warn(`Alerta de wallet bloqueada: ${(e as Error).message}`),
    );
  }

  /** Abre una alerta, o actualiza la que ya esté abierta para el mismo cliente y regla. */
  private async raise(userId: string, rule: AlertRule, input: { bookingId?: string; walletId?: string; details: Record<string, unknown> }) {
    const open = await this.prisma.complianceAlert.findFirst({ where: { userId, rule, status: { in: ['OPEN', 'IN_REVIEW'] } } });
    const details = { ...input.details, detectedAt: new Date().toISOString() } as Prisma.InputJsonValue;
    if (open) {
      await this.prisma.complianceAlert.update({ where: { id: open.id }, data: { details, bookingId: input.bookingId ?? open.bookingId, walletId: input.walletId ?? open.walletId } });
      return;
    }
    const a = await this.prisma.complianceAlert.create({
      data: { userId, rule, severity: SEVERITY[rule], bookingId: input.bookingId, walletId: input.walletId, details },
    });
    await this.audit.log({ action: 'compliance.alert_raised', entityType: 'user', entityId: userId, metadata: { alertId: a.id, rule, severity: a.severity } });
    void this.webhooks.emit(WebhookEvent.COMPLIANCE_ALERT, { alertId: a.id, rule, severity: a.severity, userId, bookingId: input.bookingId ?? null });
  }

  openCountForUser(userId: string) {
    return this.prisma.complianceAlert.count({ where: { userId, status: { in: ['OPEN', 'IN_REVIEW'] } } });
  }

  openCount() {
    return this.prisma.complianceAlert.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } });
  }

  async list(q: AlertQuery) {
    const where: Prisma.ComplianceAlertWhereInput = {
      ...(q.status ? { status: q.status } : { status: { in: ['OPEN', 'IN_REVIEW'] } }),
      ...(q.rule ? { rule: q.rule } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.complianceAlert.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, reviewedBy: { select: { firstName: true, lastName: true } } },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.complianceAlert.count({ where }),
    ]);
    return { items: items.map((a) => this.dto(a)), total, page: q.page, pageSize: q.pageSize };
  }

  async update(actorId: string, id: string, input: AlertUpdateInput, meta: RequestMeta): Promise<ComplianceAlertDto> {
    const a = await this.prisma.complianceAlert.findUnique({ where: { id } });
    if (!a) throw Errors.notFound('Alerta');
    if (a.status === 'CLOSED') throw Errors.conflict('ALERT_CLOSED', 'La alerta ya está cerrada');
    const updated = await this.prisma.complianceAlert.update({
      where: { id },
      data: {
        status: input.status,
        resolution: input.status === 'CLOSED' ? input.resolution : undefined,
        note: input.note ?? undefined,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, reviewedBy: { select: { firstName: true, lastName: true } } },
    });
    await this.audit.log({
      actorId,
      action: input.status === 'CLOSED' ? 'compliance.alert_closed' : 'compliance.alert_reviewing',
      entityType: 'user',
      entityId: a.userId,
      metadata: { alertId: id, rule: a.rule, resolution: input.resolution, note: input.note },
      meta,
    });
    return this.dto(updated);
  }

  private dto(
    a: Prisma.ComplianceAlertGetPayload<{
      include: { user: { select: { id: true; firstName: true; lastName: true; email: true } }; reviewedBy: { select: { firstName: true; lastName: true } } };
    }>,
  ): ComplianceAlertDto {
    return {
      id: a.id,
      rule: a.rule,
      severity: a.severity,
      status: a.status,
      details: (a.details ?? {}) as Record<string, unknown>,
      resolution: a.resolution,
      note: a.note,
      customer: { id: a.user.id, name: `${a.user.firstName} ${a.user.lastName}`, email: a.user.email },
      bookingId: a.bookingId,
      walletId: a.walletId,
      reviewedBy: a.reviewedBy ? `${a.reviewedBy.firstName} ${a.reviewedBy.lastName}` : null,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
