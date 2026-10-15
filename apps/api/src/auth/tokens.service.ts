import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { CryptoService } from '../common/crypto.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { ENV, Env } from '../config/env';

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

/**
 * Sesiones con access token JWT corto + refresh token opaco rotatorio.
 * Si se reutiliza un refresh token ya rotado (robo probable), se revoca toda la familia.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(user: { id: string; role: Role }, client: string, meta: RequestMeta, family?: string): Promise<IssuedTokens> {
    const refreshToken = this.crypto.randomToken(48);
    const refreshTokenExpiresAt = new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.crypto.sha256(refreshToken),
        family: family ?? randomUUID(),
        client,
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: refreshTokenExpiresAt,
        lastUsedAt: new Date(),
      },
    });
    return { ...(await this.signAccess(user, session.id)), refreshToken, refreshTokenExpiresAt, sessionId: session.id };
  }

  async signAccess(user: { id: string; role: Role }, sessionId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, sid: sessionId, typ: 'access' },
      { expiresIn: this.env.JWT_ACCESS_TTL },
    );
    return { accessToken, accessTokenExpiresAt: new Date(Date.now() + this.env.JWT_ACCESS_TTL * 1000) };
  }

  async rotate(refreshToken: string, meta: RequestMeta): Promise<IssuedTokens & { userId: string }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: this.crypto.sha256(refreshToken) },
      include: { user: { select: { id: true, role: true, status: true } } },
    });
    if (!session) throw Errors.unauthorized('Sesión no válida');

    if (session.revokedAt) {
      if (session.revokedReason === 'rotated') {
        // Reutilización de un token ya rotado → posible robo: revocar toda la familia.
        await this.prisma.session.updateMany({
          where: { family: session.family, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'reuse_detected' },
        });
        await this.audit.log({
          actorId: session.userId,
          action: 'auth.refresh_reuse_detected',
          entityType: 'session',
          entityId: session.id,
          meta,
        });
      }
      throw Errors.unauthorized('Sesión cerrada');
    }
    if (session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      throw Errors.unauthorized('Sesión caducada');
    }

    // Rotación atómica: solo una petición concurrente gana.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });
    if (count === 0) throw Errors.unauthorized('Sesión no válida');

    const issued = await this.issue(session.user, session.client, meta, session.family);
    return { ...issued, userId: session.userId };
  }

  async revoke(sessionId: string, reason = 'logout') {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeByRefreshToken(refreshToken: string) {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: this.crypto.sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  async revokeAll(userId: string, exceptSessionId?: string, reason = 'revoked_all') {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Token de corta duración que acredita que la contraseña ya se validó y falta el segundo factor. */
  signMfaChallenge(userId: string) {
    return this.jwt.signAsync({ sub: userId, typ: 'mfa' }, { expiresIn: 300 });
  }

  async verifyMfaChallenge(token: string): Promise<string> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; typ: string }>(token);
      if (p.typ !== 'mfa') throw new Error();
      return p.sub;
    } catch {
      throw Errors.unauthorized('El paso de verificación ha caducado. Vuelve a iniciar sesión.');
    }
  }
}
