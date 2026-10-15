import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { updateProfileSchema, UpdateProfileInput } from '@valorize/shared';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta } from '../common/auth.decorators';
import { CryptoService } from '../common/crypto.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod-validation.pipe';
import { TokensService } from '../auth/tokens.service';
import { meInclude, toMeDto } from './user.mapper';

const deleteSchema = z.object({ password: z.string().min(1) });

@ApiTags('perfil')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokensService,
  ) {}

  @Get()
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: meInclude });
    return toMeDto(user);
  }

  @Patch()
  async update(@CurrentUser() u: AuthUser, @Body(new ZodPipe(updateProfileSchema)) b: UpdateProfileInput, @ReqMeta() meta: RequestMeta) {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const phoneChanged = b.phone !== undefined && b.phone !== current.phone;
    if (phoneChanged) {
      const taken = await this.prisma.user.findFirst({ where: { phone: b.phone, id: { not: u.id } } });
      if (taken) throw Errors.conflict('PHONE_TAKEN', 'Este teléfono ya está registrado en otra cuenta');
    }
    const user = await this.prisma.user.update({
      where: { id: u.id },
      data: { ...b, ...(phoneChanged ? { phoneVerifiedAt: null } : {}) },
      include: meInclude,
    });
    await this.audit.log({
      actorId: u.id,
      action: 'user.profile_updated',
      entityType: 'user',
      entityId: u.id,
      metadata: { fields: Object.keys(b) },
      meta,
    });
    return toMeDto(user);
  }

  /** Portabilidad de datos (RGPD art. 20): exporta los datos personales del usuario. */
  @Get('export')
  async export(@CurrentUser() u: AuthUser, @ReqMeta() meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      include: {
        kycProfile: { include: { values: { include: { requirement: true, file: true } } } },
        bookings: { include: { location: { select: { name: true } }, service: { select: { name: true } } } },
        notifications: true,
      },
    });
    await this.audit.log({ actorId: u.id, action: 'user.data_exported', entityType: 'user', entityId: u.id, meta });
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        locale: user.locale,
        marketingOptIn: user.marketingOptIn,
        createdAt: user.createdAt,
      },
      kyc: user.kycProfile && {
        status: user.kycProfile.status,
        level: user.kycProfile.level,
        fields: user.kycProfile.values.map((v) => ({
          field: v.requirement.label,
          value: v.valueEnc ? this.crypto.decrypt(v.valueEnc) : null,
          file: v.file?.fileName ?? null,
        })),
      },
      bookings: user.bookings.map((b) => ({
        reference: b.reference,
        location: b.location.name,
        service: b.service.name,
        startsAt: b.startsAt,
        status: b.status,
      })),
      notifications: user.notifications.map((n) => ({ title: n.title, body: n.body, createdAt: n.createdAt })),
    };
  }

  /**
   * Baja de cuenta: se anonimizan los datos personales y se conservan las reservas
   * (sin PII) por trazabilidad operativa.
   */
  @Post('delete')
  @HttpCode(204)
  async deleteAccount(@CurrentUser() u: AuthUser, @Body(new ZodPipe(deleteSchema)) b: z.infer<typeof deleteSchema>, @ReqMeta() meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await this.crypto.verifyPassword(user.passwordHash, b.password))) {
      throw Errors.unprocessable('WRONG_PASSWORD', 'Contraseña incorrecta');
    }
    if (user.role !== 'CUSTOMER') throw Errors.forbidden('Las cuentas de personal se dan de baja desde administración');

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: { userId: u.id, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Baja de cuenta' },
      });
      await tx.kycProfile.deleteMany({ where: { userId: u.id } });
      await tx.file.updateMany({ where: { ownerId: u.id }, data: { status: 'DELETED', deletedAt: new Date() } });
      await tx.pushDevice.deleteMany({ where: { userId: u.id } });
      await tx.notification.deleteMany({ where: { userId: u.id } });
      await tx.user.update({
        where: { id: u.id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          email: `deleted+${u.id}@deleted.invalid`,
          phone: null,
          firstName: 'Usuario',
          lastName: 'eliminado',
          passwordHash: 'deleted',
          mfaEnabled: false,
          mfaSecretEnc: null,
          mfaRecoveryCodes: [],
          marketingOptIn: false,
        },
      });
    });
    await this.tokens.revokeAll(u.id, undefined, 'account_deleted');
    await this.audit.log({ actorId: u.id, action: 'user.account_deleted', entityType: 'user', entityId: u.id, meta });
  }
}
