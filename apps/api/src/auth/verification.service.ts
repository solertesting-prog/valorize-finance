import { Inject, Injectable } from '@nestjs/common';
import { VerificationChannel, VerificationPurpose } from '@prisma/client';
import Redis from 'ioredis';
import { CryptoService } from '../common/crypto.service';
import { REDIS } from '../common/common.module';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { MailerService, SmsService } from '../messaging/messaging.service';

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;
const MAX_SENDS_PER_HOUR = 5;

/** Códigos OTP de 6 dígitos para verificar email/teléfono y restablecer contraseña. */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async send(
    user: { id: string; email: string; phone: string | null; firstName: string },
    channel: VerificationChannel,
    purpose: VerificationPurpose,
  ): Promise<{ expiresInSec: number; cooldownSec: number }> {
    const target = channel === 'EMAIL' ? user.email : user.phone;
    if (!target) throw Errors.unprocessable('NO_PHONE', 'Añade un teléfono a tu perfil antes de verificarlo');

    // Límite anti-abuso por usuario/canal (además del rate limit global por IP).
    const cooldownKey = `otp:cd:${user.id}:${channel}:${purpose}`;
    const hourKey = `otp:h:${user.id}:${channel}`;
    if (await this.redis.exists(cooldownKey)) {
      throw Errors.tooMany('Espera un minuto antes de pedir otro código');
    }
    const sends = await this.redis.incr(hourKey);
    if (sends === 1) await this.redis.expire(hourKey, 3600);
    if (sends > MAX_SENDS_PER_HOUR) throw Errors.tooMany('Has pedido demasiados códigos. Inténtalo en una hora.');
    await this.redis.set(cooldownKey, '1', 'EX', RESEND_COOLDOWN_SEC);

    const code = this.crypto.numericCode(6);
    await this.prisma.$transaction([
      // Un único código vigente por canal y propósito.
      this.prisma.verificationCode.updateMany({
        where: { userId: user.id, channel, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.verificationCode.create({
        data: {
          userId: user.id,
          channel,
          purpose,
          target,
          codeHash: this.crypto.sha256(`${user.id}:${code}`),
          expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
        },
      }),
    ]);

    const what = purpose === 'PASSWORD_RESET' ? 'restablecer tu contraseña' : 'verificar tu cuenta';
    if (channel === 'EMAIL') {
      await this.mailer.send({
        to: target,
        subject: `Tu código de Valorize: ${code}`,
        text: `Hola ${user.firstName},\n\nTu código para ${what} es:\n\n${code}\n\nCaduca en ${CODE_TTL_MIN} minutos. Si no lo has pedido tú, ignora este mensaje.`,
      });
    } else {
      await this.sms.send(target, `Valorize: tu código para ${what} es ${code}. Caduca en ${CODE_TTL_MIN} min.`);
    }
    return { expiresInSec: CODE_TTL_MIN * 60, cooldownSec: RESEND_COOLDOWN_SEC };
  }

  /** Valida y consume el código. Devuelve el destino (email/teléfono) al que se envió. */
  async consume(userId: string, channel: VerificationChannel, purpose: VerificationPurpose, code: string): Promise<string> {
    const vc = await this.prisma.verificationCode.findFirst({
      where: { userId, channel, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!vc || vc.expiresAt < new Date()) throw Errors.unprocessable('CODE_EXPIRED', 'El código ha caducado. Pide uno nuevo.');
    if (vc.attempts >= MAX_ATTEMPTS) {
      throw Errors.tooMany('Demasiados intentos con este código. Pide uno nuevo.');
    }
    if (!this.crypto.safeEqual(vc.codeHash, this.crypto.sha256(`${userId}:${code}`))) {
      await this.prisma.verificationCode.update({ where: { id: vc.id }, data: { attempts: { increment: 1 } } });
      throw Errors.unprocessable('CODE_INVALID', 'Código incorrecto');
    }
    await this.prisma.verificationCode.update({ where: { id: vc.id }, data: { consumedAt: new Date() } });
    return vc.target;
  }
}
