import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { CryptoService } from '../common/crypto.service';
import { REDIS } from '../common/common.module';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

authenticator.options = { window: 1, step: 30, digits: 6 };

const ISSUER = 'Valorize Finance';

/** MFA con TOTP (Google Authenticator, 1Password, Authy…) y códigos de recuperación de un solo uso. */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async setup(userId: string, email: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabled: true } });
    if (user.mfaEnabled) throw Errors.conflict('MFA_ALREADY_ENABLED', 'La verificación en dos pasos ya está activa');
    const secret = authenticator.generateSecret(20);
    await this.redis.set(`mfa:setup:${userId}`, this.crypto.encrypt(secret), 'EX', 600);
    const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
    return { secret, otpauthUrl, qrDataUrl };
  }

  /** Activa MFA y devuelve los códigos de recuperación en claro (solo se muestran una vez). */
  async enable(userId: string, code: string): Promise<string[]> {
    const pending = await this.redis.get(`mfa:setup:${userId}`);
    if (!pending) throw Errors.unprocessable('MFA_SETUP_EXPIRED', 'La configuración ha caducado, vuelve a empezar');
    const secret = this.crypto.decrypt(pending);
    if (!authenticator.check(code, secret)) throw Errors.unprocessable('CODE_INVALID', 'Código incorrecto');

    const recovery = Array.from({ length: 10 }, () => {
      const raw = this.crypto.randomToken(8).replace(/[-_]/g, '').slice(0, 10).toUpperCase();
      return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    });
    const hashes = await Promise.all(recovery.map((c) => this.crypto.hashPassword(c)));
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecretEnc: this.crypto.encrypt(secret),
        mfaRecoveryCodes: hashes,
        mfaEnabledAt: new Date(),
      },
    });
    await this.redis.del(`mfa:setup:${userId}`);
    return recovery;
  }

  async disable(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryCodes: [], mfaEnabledAt: null },
    });
  }

  /** Verifica un TOTP o consume un código de recuperación. Protegido contra reutilización del mismo TOTP. */
  async verify(userId: string, code: string): Promise<{ ok: boolean; usedRecovery: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecretEnc: true, mfaRecoveryCodes: true },
    });
    if (!user.mfaEnabled || !user.mfaSecretEnc) return { ok: true, usedRecovery: false };

    const clean = code.replace(/\s/g, '');
    if (/^\d{6}$/.test(clean)) {
      const secret = this.crypto.decrypt(user.mfaSecretEnc);
      if (!authenticator.check(clean, secret)) return { ok: false, usedRecovery: false };
      const replayKey = `mfa:used:${userId}:${clean}`;
      const fresh = await this.redis.set(replayKey, '1', 'EX', 90, 'NX');
      return { ok: fresh === 'OK', usedRecovery: false };
    }

    const normalized = clean.toUpperCase();
    for (let i = 0; i < user.mfaRecoveryCodes.length; i++) {
      if (await this.crypto.verifyPassword(user.mfaRecoveryCodes[i], normalized)) {
        const remaining = user.mfaRecoveryCodes.filter((_, idx) => idx !== i);
        await this.prisma.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: remaining } });
        return { ok: true, usedRecovery: true };
      }
    }
    return { ok: false, usedRecovery: false };
  }
}
