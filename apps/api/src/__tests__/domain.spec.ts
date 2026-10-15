import { peakOverlap } from '../bookings/availability.service';
import { QrService } from '../bookings/qr.service';
import { CryptoService } from '../common/crypto.service';
import type { Env } from '../config/env';

const env = {
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  QR_SIGNING_SECRET: 'x'.repeat(40),
} as Env;

describe('peakOverlap', () => {
  const m = (min: number) => min * 60_000;
  const busy = [
    { start: m(0), end: m(20), serviceId: 'a' },
    { start: m(10), end: m(30), serviceId: 'b' },
    { start: m(40), end: m(60), serviceId: 'a' },
  ];

  it('cuenta el pico de citas simultáneas en el intervalo', () => {
    expect(peakOverlap(busy, m(0), m(30), 'a')).toEqual({ total: 2, sameService: 1 });
  });

  it('los intervalos que se tocan en el borde no solapan', () => {
    expect(peakOverlap(busy, m(30), m(40), 'a')).toEqual({ total: 0, sameService: 0 });
  });

  it('citas encadenadas que nunca coinciden cuentan como una', () => {
    const chain = [0, 10, 20].map((s) => ({ start: m(s), end: m(s + 10), serviceId: 'a' }));
    expect(peakOverlap(chain, m(0), m(30), 'a').total).toBe(1);
  });

  it('separa el conteo por servicio', () => {
    expect(peakOverlap(busy, m(15), m(50), 'a').sameService).toBe(1);
  });
});

describe('QrService', () => {
  const qr = new QrService(new CryptoService(env), env);
  const id = '3f1c2a54-7b2e-4c1a-9d3e-8a1b2c3d4e5f';

  it('firma y verifica tokens sin PII', () => {
    const token = qr.sign(id, 'nonce123');
    expect(token.startsWith(`vf1.${id}.nonce123.`)).toBe(true);
    expect(qr.verify(token)).toEqual({ bookingId: id, nonce: 'nonce123' });
  });

  it('rechaza tokens manipulados', () => {
    const token = qr.sign(id, 'nonce123');
    expect(qr.verify(token.replace('nonce123', 'nonce124'))).toBeNull();
    expect(qr.verify('vf1.no-uuid.n.sig')).toBeNull();
    expect(qr.verify('basura')).toBeNull();
  });
});

describe('CryptoService', () => {
  const c = new CryptoService(env);

  it('cifra y descifra con AES-256-GCM', () => {
    const enc = c.encrypt('12345678Z');
    expect(enc).not.toContain('12345678Z');
    expect(c.decrypt(enc)).toBe('12345678Z');
  });

  it('detecta manipulación del texto cifrado', () => {
    const enc = c.encrypt('dato');
    const parts = enc.split(':');
    parts[3] = Buffer.from('otro').toString('base64url');
    expect(() => c.decrypt(parts.join(':'))).toThrow();
  });

  it('hashea y verifica contraseñas con argon2id', async () => {
    const h = await c.hashPassword('Secreta1234');
    expect(await c.verifyPassword(h, 'Secreta1234')).toBe(true);
    expect(await c.verifyPassword(h, 'otra')).toBe(false);
  });
});
