import { Injectable } from '@nestjs/common';
import { KycProfile, Prisma, Service } from '@prisma/client';
import type { ExchangeInput } from '@valorize/shared';
import { DateTime } from 'luxon';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { WalletScreeningService } from '../wallets/screening.service';
import { WalletsService } from '../wallets/wallets.service';
import { RatesService } from './rates.service';

/** Estados que cuentan para los límites de importe (todo lo que no se ha caído). */
const COUNTED = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED'] as const;
const TZ = 'Europe/Madrid';

export interface PreparedExchange {
  direction: ExchangeInput['direction'];
  asset: ExchangeInput['asset'];
  network: ExchangeInput['network'];
  amount: string;
  walletId: string;
  quotedRate?: string;
  quotedFiatAmount?: string;
  quotedAt?: Date;
}

/**
 * Reglas de la solicitud de cambio USDT/USDC:
 *  - activo, red y sentido habilitados en los ajustes
 *  - importe entre mínimo y máximo; límites diario y mensual por cliente
 *  - KYC reforzado (nivel 2) por encima del umbral configurado
 *  - wallet del cliente válida y auditada; si está BLOQUEADA no se admite la solicitud
 */
@Injectable()
export class ExchangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly screening: WalletScreeningService,
    private readonly audit: AuditService,
    private readonly rates: RatesService,
  ) {}

  /** Validación y auditoría de wallet. Se hace fuera de la transacción porque consulta la blockchain. */
  async prepare(
    userId: string,
    service: Service,
    kyc: KycProfile | null,
    input: ExchangeInput | undefined,
    meta: RequestMeta,
  ): Promise<PreparedExchange | null> {
    if (service.kind !== 'CRYPTO_EXCHANGE') {
      if (input) throw Errors.unprocessable('NOT_EXCHANGE_SERVICE', 'Esta gestión no admite operaciones de cambio');
      return null;
    }
    if (!input) throw Errors.unprocessable('EXCHANGE_REQUIRED', 'Indica qué quieres cambiar: importe, moneda, red y wallet');

    const s = await this.prisma.exchangeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    if (!s.enabledAssets.includes(input.asset)) throw Errors.unprocessable('ASSET_DISABLED', `Ahora mismo no operamos con ${input.asset}`);
    if (!s.enabledNetworks.includes(input.network)) throw Errors.unprocessable('NETWORK_DISABLED', 'Ahora mismo no operamos en esa red');
    if (input.direction === 'SELL_CRYPTO' && !s.sellEnabled) throw Errors.unprocessable('DIRECTION_DISABLED', 'Ahora mismo no compramos cripto');
    if (input.direction === 'BUY_CRYPTO' && !s.buyEnabled) throw Errors.unprocessable('DIRECTION_DISABLED', 'Ahora mismo no vendemos cripto');

    const amount = new Prisma.Decimal(input.amount);
    if (amount.lt(s.minAmount)) throw Errors.unprocessable('AMOUNT_TOO_LOW', `El importe mínimo es ${s.minAmount} ${input.asset}`);
    if (amount.gt(s.maxAmount)) throw Errors.unprocessable('AMOUNT_TOO_HIGH', `El importe máximo por operación es ${s.maxAmount} ${input.asset}`);
    if (amount.gt(s.enhancedKycAbove) && (kyc?.status !== 'APPROVED' || kyc.level < 2)) {
      throw Errors.unprocessable(
        'KYC_LEVEL_REQUIRED',
        `Para operar más de ${s.enhancedKycAbove} ${input.asset} necesitas la verificación ampliada. Complétala desde tu perfil.`,
      );
    }

    const wallet = input.walletId
      ? await this.wallets.ownedOrThrow(userId, input.walletId)
      : await this.wallets.upsertForUser(userId, input.wallet!, meta);
    if (wallet.network !== input.network) {
      throw Errors.unprocessable('WALLET_NETWORK_MISMATCH', 'La wallet elegida es de otra red');
    }

    const result = await this.screening.ensureFresh(wallet.id, { asset: input.asset, amount: amount.toString(), direction: input.direction });
    if (result.status === 'BLOCKED') {
      await this.audit.log({
        actorId: userId,
        action: 'exchange.wallet_rejected',
        entityType: 'wallet',
        entityId: wallet.id,
        metadata: { screeningId: result.id },
        meta,
      });
      // Mensaje deliberadamente genérico: no se revela el motivo (sanciones, listas…).
      throw Errors.unprocessable('WALLET_NOT_ACCEPTED', 'No podemos operar con esta wallet. Usa otra o contacta con nosotros.');
    }

    // Cotización orientativa que ve el cliente: se guarda para que la oficina parta de ella al aprobar.
    const quote = await this.rates.quote(input.direction, input.asset, amount.toString()).catch(() => null);
    return {
      direction: input.direction,
      asset: input.asset,
      network: input.network,
      amount: amount.toString(),
      walletId: wallet.id,
      ...(quote ? { quotedRate: quote.rate, quotedFiatAmount: quote.fiatAmount, quotedAt: new Date() } : {}),
    };
  }

  /** Límites diario y mensual. Se comprueban dentro de la transacción de la reserva. */
  async assertLimits(tx: Prisma.TransactionClient, userId: string, startsAt: Date, amount: string, excludeBookingId?: string) {
    const s = await tx.exchangeSettings.findUniqueOrThrow({ where: { id: 1 } });
    const day = DateTime.fromJSDate(startsAt).setZone(TZ);
    const sum = async (from: DateTime, to: DateTime) => {
      const r = await tx.exchangeRequest.aggregate({
        _sum: { amount: true },
        where: {
          booking: {
            userId,
            status: { in: [...COUNTED] },
            startsAt: { gte: from.toJSDate(), lt: to.toJSDate() },
            ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
          },
        },
      });
      return r._sum.amount ?? new Prisma.Decimal(0);
    };
    const add = new Prisma.Decimal(amount);
    const daily = await sum(day.startOf('day'), day.endOf('day'));
    if (daily.plus(add).gt(s.dailyLimitPerUser)) {
      throw Errors.unprocessable('DAILY_LIMIT', `Superas el límite diario de ${s.dailyLimitPerUser}. Ya tienes ${daily} solicitados ese día.`);
    }
    const monthly = await sum(day.startOf('month'), day.endOf('month'));
    if (monthly.plus(add).gt(s.monthlyLimitPerUser)) {
      throw Errors.unprocessable('MONTHLY_LIMIT', `Superas el límite mensual de ${s.monthlyLimitPerUser}.`);
    }
  }
}
