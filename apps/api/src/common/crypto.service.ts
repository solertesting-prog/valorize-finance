import { Inject, Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { ENV, Env } from '../config/env';

/**
 * Primitivas criptográficas centralizadas:
 *  - argon2id para contraseñas y códigos de recuperación
 *  - AES-256-GCM para campos sensibles en BD (secreto MFA, valores KYC, secretos de webhooks)
 *  - SHA-256 para tokens opacos (refresh tokens, códigos OTP de un solo uso)
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'base64');
  }

  hashPassword(plain: string): Promise<string> {
    return argonHash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hash, plain);
    } catch {
      return false;
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [v, iv, tag, data] = payload.split(':');
    if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Formato cifrado desconocido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  hmac(secret: string, value: string, encoding: 'hex' | 'base64url' = 'hex'): string {
    return createHmac('sha256', secret).update(value).digest(encoding);
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  numericCode(digits = 6): string {
    return randomInt(0, 10 ** digits).toString().padStart(digits, '0');
  }
}
