import { Prisma, WalletRiskStatus } from '@prisma/client';
import type { BookingDto, ExchangeDto, TxCheckDto } from '@valorize/shared';
import { parseAddress } from '../wallets/address';

export const bookingInclude = {
  location: { select: { id: true, name: true, address: true, city: true, timezone: true, latitude: true, longitude: true } },
  service: { select: { id: true, code: true, name: true, durationMin: true, kind: true, requiresApproval: true } },
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      kycProfile: { select: { status: true, expiresAt: true, level: true } },
    },
  },
  exchange: { include: { wallet: true } },
} satisfies Prisma.BookingInclude;

export type BookingFull = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export interface BookingRules {
  cancelCutoffMin: number;
  maxReschedules: number;
}

function exchangeDto(e: NonNullable<BookingFull['exchange']>, staff: boolean): ExchangeDto {
  const w = e.wallet;
  // Al cliente no se le revela si la wallet está bloqueada.
  const risk: WalletRiskStatus = !staff && w.riskStatus === 'BLOCKED' ? 'REVIEW' : w.riskStatus;
  return {
    id: e.id,
    direction: e.direction,
    asset: e.asset,
    network: e.network,
    amount: e.amount.toString(),
    wallet: {
      id: w.id,
      network: w.network,
      address: parseAddress(w.network, w.address).display,
      label: w.label,
      riskStatus: risk,
      riskScore: staff ? w.riskScore : null,
      lastScreenedAt: w.lastScreenedAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
    },
    agreedRate: e.agreedRate?.toString() ?? null,
    fiatAmount: e.fiatAmount?.toString() ?? null,
    feeAmount: e.feeAmount?.toString() ?? null,
    txHash: e.txHash,
    internalNote: staff ? e.internalNote : undefined,
    txCheck: staff ? ((e.txCheck as unknown as TxCheckDto | null) ?? null) : undefined,
  };
}

export function toBookingDto(b: BookingFull, rules: BookingRules, opts: { includeCustomer: boolean }): BookingDto {
  const minutesToStart = (b.startsAt.getTime() - Date.now()) / 60_000;
  const modifiable = ['PENDING', 'CONFIRMED'].includes(b.status) && minutesToStart >= rules.cancelCutoffMin;
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    channel: b.channel,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    notes: b.notes,
    location: b.location,
    service: { id: b.service.id, code: b.service.code, name: b.service.name, durationMin: b.service.durationMin, kind: b.service.kind },
    customer: opts.includeCustomer
      ? {
          id: b.user.id,
          firstName: b.user.firstName,
          lastName: b.user.lastName,
          email: b.user.email,
          phone: b.user.phone,
          kycStatus: b.user.kycProfile?.status ?? 'NOT_STARTED',
        }
      : undefined,
    checkedInAt: b.checkedInAt?.toISOString() ?? null,
    completedAt: b.completedAt?.toISOString() ?? null,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    cancelReason: b.cancelReason,
    rescheduleCount: b.rescheduleCount,
    approvedAt: b.approvedAt?.toISOString() ?? null,
    // Las aprobaciones automáticas no tienen aprobador (las manuales siempre lo registran).
    autoApproved: !!b.approvedAt && !b.approvedById,
    rejectedAt: b.rejectedAt?.toISOString() ?? null,
    rejectReason: b.rejectReason,
    exchange: b.exchange ? exchangeDto(b.exchange, opts.includeCustomer) : null,
    canCancel: modifiable,
    canReschedule: modifiable && b.rescheduleCount < rules.maxReschedules,
    createdAt: b.createdAt.toISOString(),
  };
}
