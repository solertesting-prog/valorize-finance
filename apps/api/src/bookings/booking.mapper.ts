import { Prisma } from '@prisma/client';
import type { BookingDto } from '@valorize/shared';

export const bookingInclude = {
  location: { select: { id: true, name: true, address: true, city: true, timezone: true, latitude: true, longitude: true } },
  service: { select: { id: true, code: true, name: true, durationMin: true } },
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      kycProfile: { select: { status: true } },
    },
  },
} satisfies Prisma.BookingInclude;

export type BookingFull = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export interface BookingRules {
  cancelCutoffMin: number;
  maxReschedules: number;
}

export function toBookingDto(b: BookingFull, rules: BookingRules, opts: { includeCustomer: boolean }): BookingDto {
  const minutesToStart = (b.startsAt.getTime() - Date.now()) / 60_000;
  const modifiable = ['PENDING', 'CONFIRMED'].includes(b.status) && minutesToStart >= rules.cancelCutoffMin;
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    notes: b.notes,
    location: b.location,
    service: b.service,
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
    canCancel: modifiable,
    canReschedule: modifiable && b.rescheduleCount < rules.maxReschedules,
    createdAt: b.createdAt.toISOString(),
  };
}
