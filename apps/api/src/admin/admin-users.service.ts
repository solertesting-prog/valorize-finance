import { Injectable } from '@nestjs/common';
import { KycStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { CryptoService } from '../common/crypto.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { TokensService } from '../auth/tokens.service';
import { VerificationService } from '../auth/verification.service';
import { meInclude, toAdminUserDto } from '../users/user.mapper';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly verification: VerificationService,
  ) {}

  async list(q: { page: number; pageSize: number; q?: string; role?: Role; status?: UserStatus; kycStatus?: KycStatus }) {
    const where: Prisma.UserWhereInput = {
      status: q.status ?? { not: 'DELETED' },
      ...(q.role ? { role: q.role } : {}),
      ...(q.kycStatus ? { kycProfile: { status: q.kycStatus } } : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { firstName: { contains: q.q, mode: 'insensitive' } },
              { lastName: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { ...meInclude, _count: { select: { bookings: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toAdminUserDto), total, page: q.page, pageSize: q.pageSize };
  }

  async detail(id: string, actorId: string, meta: RequestMeta) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { ...meInclude, _count: { select: { bookings: true } } } });
    if (!u) throw Errors.notFound('Usuario');
    await this.audit.log({ actorId, action: 'user.viewed', entityType: 'user', entityId: id, meta });
    const sessions = await this.prisma.session.findMany({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, client: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { user: toAdminUserDto(u), sessions };
  }

  /** Alta de personal: se crea la cuenta y se envía un código para que el empleado fije su contraseña. */
  async create(
    input: { email: string; phone?: string; firstName: string; lastName: string; role: Role; locationIds: string[] },
    actor: { id: string; role: Role },
    meta: RequestMeta,
  ) {
    this.assertCanAssignRole(actor.role, input.role);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        passwordHash: await this.crypto.hashPassword(this.crypto.randomToken(32)),
        emailVerifiedAt: null,
        kycProfile: { create: {} },
        staffLocations: { create: input.locationIds.map((locationId) => ({ locationId })) },
      },
      include: meInclude,
    });
    await this.verification.send(user, 'EMAIL', 'PASSWORD_RESET').catch(() => undefined);
    await this.audit.log({
      actorId: actor.id,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { role: input.role, locationIds: input.locationIds },
      meta,
    });
    return toAdminUserDto(user);
  }

  async update(
    id: string,
    input: { role?: Role; status?: UserStatus; locationIds?: string[] },
    actor: { id: string; role: Role },
    meta: RequestMeta,
  ) {
    if (id === actor.id && (input.role || input.status)) {
      throw Errors.forbidden('No puedes cambiar tu propio rol o estado');
    }
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Usuario');
    if (current.role === 'ADMIN' && actor.role !== 'ADMIN') throw Errors.forbidden();
    if (input.role) this.assertCanAssignRole(actor.role, input.role);

    const user = await this.prisma.$transaction(async (tx) => {
      if (input.locationIds) {
        await tx.staffLocation.deleteMany({ where: { userId: id } });
        await tx.staffLocation.createMany({ data: input.locationIds.map((locationId) => ({ userId: id, locationId })) });
      }
      return tx.user.update({
        where: { id },
        data: { role: input.role, status: input.status },
        include: meInclude,
      });
    });
    if (input.status && input.status !== 'ACTIVE') await this.tokens.revokeAll(id, undefined, 'suspended');
    await this.audit.log({
      actorId: actor.id,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      metadata: { before: { role: current.role, status: current.status }, after: input },
      meta,
    });
    return toAdminUserDto(user);
  }

  async revokeSessions(id: string, actorId: string, meta: RequestMeta) {
    await this.tokens.revokeAll(id, undefined, 'admin_revoked');
    await this.audit.log({ actorId, action: 'user.sessions_revoked', entityType: 'user', entityId: id, meta });
  }

  async resetMfa(id: string, actorId: string, meta: RequestMeta) {
    await this.prisma.user.update({
      where: { id },
      data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryCodes: [], mfaEnabledAt: null },
    });
    await this.tokens.revokeAll(id, undefined, 'mfa_reset');
    await this.audit.log({ actorId, action: 'user.mfa_reset', entityType: 'user', entityId: id, meta });
  }

  private assertCanAssignRole(actorRole: Role, target: Role) {
    // Un responsable (MANAGER) solo gestiona empleados y clientes.
    if (actorRole === 'MANAGER' && (target === 'ADMIN' || target === 'MANAGER')) {
      throw Errors.forbidden('Solo un administrador puede asignar ese rol');
    }
  }
}
