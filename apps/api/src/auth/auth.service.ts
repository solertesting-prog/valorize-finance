import { Injectable } from '@nestjs/common';
import { VerificationChannel } from '@prisma/client';
import type { AuthTokensDto, LoginResultDto, RegisterInput, SessionDto } from '@valorize/shared';
import { WebhookEvent } from '@valorize/shared';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { CryptoService } from '../common/crypto.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { meInclude, toMeDto } from '../users/user.mapper';
import { WebhooksService } from '../webhooks/webhooks.service';
import { MfaService } from './mfa.service';
import { IssuedTokens, TokensService } from './tokens.service';
import { VerificationService } from './verification.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface AuthResult {
  body: AuthTokensDto;
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService {
  // Hash señuelo para igualar tiempos cuando el email no existe (evita enumeración de usuarios).
  private dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokensService,
    private readonly verification: VerificationService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {
    this.dummyHash = this.crypto.hashPassword('dummy-password-for-timing');
  }

  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthResult> {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { phone: input.phone }] },
      select: { email: true },
    });
    if (exists) {
      throw Errors.conflict(
        'ACCOUNT_EXISTS',
        exists.email.toLowerCase() === input.email ? 'Ya existe una cuenta con este email' : 'Este teléfono ya está registrado',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        passwordHash: await this.crypto.hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        marketingOptIn: input.marketingOptIn,
        termsAcceptedAt: new Date(),
        kycProfile: { create: {} },
      },
      include: meInclude,
    });

    await this.audit.log({ actorId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id, meta });
    void this.webhooks.emit(WebhookEvent.USER_REGISTERED, { userId: user.id, createdAt: user.createdAt.toISOString() });
    // Enviamos el código de email de inmediato; el de teléfono lo pide el usuario desde el flujo de verificación.
    void this.verification.send(user, 'EMAIL', 'VERIFY_CONTACT').catch(() => undefined);

    const tokens = await this.tokens.issue(user, input.client, meta);
    return { tokens, body: this.authBody(toMeDto(user), tokens, input.client) };
  }

  async login(email: string, password: string, client: string, meta: RequestMeta): Promise<{ result: LoginResultDto; tokens?: IssuedTokens }> {
    const user = await this.prisma.user.findUnique({ where: { email }, include: meInclude });

    if (!user) {
      await this.crypto.verifyPassword(await this.dummyHash, password);
      await this.audit.log({ action: 'auth.login_failed', metadata: { reason: 'unknown_email' }, meta });
      throw Errors.unauthorized('Email o contraseña incorrectos');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw Errors.tooMany('Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo más tarde.');
    }

    const ok = await this.crypto.verifyPassword(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
        },
      });
      await this.audit.log({
        actorId: user.id,
        action: lock ? 'auth.account_locked' : 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        meta,
      });
      if (lock) {
        void this.notifications.notify({
          userId: user.id,
          type: 'SECURITY',
          title: 'Cuenta bloqueada temporalmente',
          body: `Hemos detectado varios intentos fallidos de acceso. Tu cuenta estará bloqueada ${LOCK_MINUTES} minutos. Si no has sido tú, cambia tu contraseña.`,
          email: {},
        });
      }
      throw Errors.unauthorized('Email o contraseña incorrectos');
    }
    if (user.status !== 'ACTIVE') throw Errors.forbidden('Esta cuenta no está activa. Contacta con soporte.');

    if (user.mfaEnabled) {
      return { result: { mfaRequired: true, challengeToken: await this.tokens.signMfaChallenge(user.id) } };
    }
    return this.completeLogin(user.id, client, meta);
  }

  async loginMfa(challengeToken: string, code: string, client: string, meta: RequestMeta) {
    const userId = await this.tokens.verifyMfaChallenge(challengeToken);
    const { ok, usedRecovery } = await this.mfa.verify(userId, code);
    if (!ok) {
      await this.audit.log({ actorId: userId, action: 'auth.mfa_failed', entityType: 'user', entityId: userId, meta });
      throw Errors.unauthorized('Código de verificación incorrecto');
    }
    if (usedRecovery) {
      await this.audit.log({ actorId: userId, action: 'auth.mfa_recovery_used', entityType: 'user', entityId: userId, meta });
      void this.notifications.notify({
        userId,
        type: 'SECURITY',
        title: 'Se ha usado un código de recuperación',
        body: 'Has iniciado sesión con un código de recuperación. Si te quedan pocos, genera nuevos desde Seguridad.',
        email: {},
      });
    }
    return this.completeLogin(userId, client, meta);
  }

  private async completeLogin(userId: string, client: string, meta: RequestMeta) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      include: meInclude,
    });
    const tokens = await this.tokens.issue(user, client, meta);
    await this.audit.log({ actorId: user.id, action: 'auth.login', entityType: 'session', entityId: tokens.sessionId, meta });
    return { result: this.authBody(toMeDto(user), tokens, client), tokens };
  }

  async refresh(refreshToken: string, client: string, meta: RequestMeta): Promise<AuthResult> {
    const tokens = await this.tokens.rotate(refreshToken, meta);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: tokens.userId }, include: meInclude });
    return { tokens, body: this.authBody(toMeDto(user), tokens, client) };
  }

  async logout(sessionId: string | null, refreshToken: string | null, actorId: string | null, meta: RequestMeta) {
    if (sessionId) await this.tokens.revoke(sessionId);
    else if (refreshToken) await this.tokens.revokeByRefreshToken(refreshToken);
    await this.audit.log({ actorId, action: 'auth.logout', entityType: 'session', entityId: sessionId ?? undefined, meta });
  }

  // ─────────── Verificación de contacto ───────────

  async sendVerification(userId: string, channel: VerificationChannel) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (channel === 'EMAIL' && user.emailVerifiedAt) throw Errors.conflict('ALREADY_VERIFIED', 'El email ya está verificado');
    if (channel === 'PHONE' && user.phoneVerifiedAt) throw Errors.conflict('ALREADY_VERIFIED', 'El teléfono ya está verificado');
    return this.verification.send(user, channel, 'VERIFY_CONTACT');
  }

  async confirmVerification(userId: string, channel: VerificationChannel, code: string, meta: RequestMeta) {
    const target = await this.verification.consume(userId, channel, 'VERIFY_CONTACT', code);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // El código solo verifica el destino al que se envió: si el usuario cambió el dato entretanto, no vale.
    const current = channel === 'EMAIL' ? user.email : user.phone;
    if (current?.toLowerCase() !== target.toLowerCase()) {
      throw Errors.unprocessable('TARGET_CHANGED', 'El dato cambió después de enviar el código. Pide uno nuevo.');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: channel === 'EMAIL' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() },
      include: meInclude,
    });
    await this.audit.log({
      actorId: userId,
      action: channel === 'EMAIL' ? 'auth.email_verified' : 'auth.phone_verified',
      entityType: 'user',
      entityId: userId,
      meta,
    });
    return toMeDto(updated);
  }

  // ─────────── Contraseña ───────────

  async forgotPassword(email: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Respuesta idéntica exista o no la cuenta.
    if (user && user.status === 'ACTIVE') {
      await this.verification.send(user, 'EMAIL', 'PASSWORD_RESET').catch(() => undefined);
      await this.audit.log({ actorId: user.id, action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id, meta });
    }
  }

  async resetPassword(email: string, code: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw Errors.unprocessable('CODE_INVALID', 'Código incorrecto');
    await this.verification.consume(user.id, 'EMAIL', 'PASSWORD_RESET', code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.crypto.hashPassword(password),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        // Si el usuario puede leer su email, el email queda verificado.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    await this.tokens.revokeAll(user.id, undefined, 'password_reset');
    await this.audit.log({ actorId: user.id, action: 'auth.password_reset', entityType: 'user', entityId: user.id, meta });
    void this.notifications.notify({
      userId: user.id,
      type: 'SECURITY',
      title: 'Contraseña restablecida',
      body: 'Tu contraseña se ha cambiado y se han cerrado todas las sesiones abiertas.',
      email: {},
    });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.crypto.verifyPassword(user.passwordHash, current))) {
      throw Errors.unprocessable('WRONG_PASSWORD', 'La contraseña actual no es correcta');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.crypto.hashPassword(next), passwordChangedAt: new Date() },
    });
    await this.tokens.revokeAll(userId, sessionId, 'password_changed');
    await this.audit.log({ actorId: userId, action: 'auth.password_changed', entityType: 'user', entityId: userId, meta });
    void this.notifications.notify({
      userId,
      type: 'SECURITY',
      title: 'Contraseña actualizada',
      body: 'Has cambiado tu contraseña. Hemos cerrado el resto de sesiones abiertas.',
      email: {},
    });
  }

  // ─────────── MFA ───────────

  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    return this.mfa.setup(userId, user.email);
  }

  async mfaEnable(userId: string, code: string, meta: RequestMeta) {
    const recoveryCodes = await this.mfa.enable(userId, code);
    await this.audit.log({ actorId: userId, action: 'auth.mfa_enabled', entityType: 'user', entityId: userId, meta });
    void this.notifications.notify({
      userId,
      type: 'SECURITY',
      title: 'Verificación en dos pasos activada',
      body: 'A partir de ahora te pediremos un código de tu app de autenticación al iniciar sesión.',
      email: {},
    });
    return { recoveryCodes };
  }

  async mfaDisable(userId: string, password: string, code: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (['EMPLOYEE', 'MANAGER', 'ADMIN'].includes(user.role)) {
      throw Errors.forbidden('El personal de Valorize debe mantener la verificación en dos pasos activa');
    }
    if (!(await this.crypto.verifyPassword(user.passwordHash, password))) {
      throw Errors.unprocessable('WRONG_PASSWORD', 'Contraseña incorrecta');
    }
    const { ok } = await this.mfa.verify(userId, code);
    if (!ok) throw Errors.unprocessable('CODE_INVALID', 'Código incorrecto');
    await this.mfa.disable(userId);
    await this.audit.log({ actorId: userId, action: 'auth.mfa_disabled', entityType: 'user', entityId: userId, meta });
    void this.notifications.notify({
      userId,
      type: 'SECURITY',
      title: 'Verificación en dos pasos desactivada',
      body: 'Si no has sido tú, cambia tu contraseña de inmediato y contacta con soporte.',
      email: {},
    });
  }

  // ─────────── Sesiones ───────────

  async sessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, meta: RequestMeta) {
    const s = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!s) throw Errors.notFound('Sesión');
    await this.tokens.revoke(sessionId, 'user_revoked');
    await this.audit.log({ actorId: userId, action: 'auth.session_revoked', entityType: 'session', entityId: sessionId, meta });
  }

  private authBody(user: AuthTokensDto['user'], t: IssuedTokens, client: string): AuthTokensDto {
    return {
      accessToken: t.accessToken,
      accessTokenExpiresAt: t.accessTokenExpiresAt.toISOString(),
      // En web el refresh token viaja solo en cookie httpOnly.
      refreshToken: client === 'mobile' ? t.refreshToken : undefined,
      user,
    };
  }
}
