import { Prisma } from '@prisma/client';
import type { AdminUserDto, MeDto } from '@valorize/shared';

export const meInclude = {
  kycProfile: { select: { status: true, level: true } },
  staffLocations: { select: { locationId: true } },
} satisfies Prisma.UserInclude;

export type UserWithMe = Prisma.UserGetPayload<{ include: typeof meInclude }>;

export function toMeDto(u: UserWithMe): MeDto {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    status: u.status,
    locale: u.locale,
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
    mfaEnabled: u.mfaEnabled,
    marketingOptIn: u.marketingOptIn,
    kycStatus: u.kycProfile?.status ?? 'NOT_STARTED',
    kycLevel: u.kycProfile?.level ?? 0,
    locationIds: u.staffLocations.map((s) => s.locationId),
    createdAt: u.createdAt.toISOString(),
  };
}

export function toAdminUserDto(u: UserWithMe & { _count?: { bookings: number } }): AdminUserDto {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    status: u.status,
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
    mfaEnabled: u.mfaEnabled,
    kycStatus: u.kycProfile?.status ?? 'NOT_STARTED',
    locationIds: u.staffLocations.map((s) => s.locationId),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    bookingCount: u._count?.bookings,
  };
}
