import { Inject, Injectable } from '@nestjs/common';
import { CryptoService } from '../common/crypto.service';
import { ENV, Env } from '../config/env';

const PREFIX = 'vf1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Token del QR: "vf1.<bookingId>.<nonce>.<firma>"
 *  - No contiene datos personales: solo el id opaco de la cita.
 *  - La firma HMAC-SHA256 impide fabricar QRs válidos.
 *  - El nonce se rota al reprogramar o cancelar, invalidando cualquier QR anterior (capturas de pantalla, etc.).
 */
@Injectable()
export class QrService {
  constructor(
    private readonly crypto: CryptoService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  newNonce(): string {
    return this.crypto.randomToken(12);
  }

  sign(bookingId: string, nonce: string): string {
    const body = `${PREFIX}.${bookingId}.${nonce}`;
    return `${body}.${this.crypto.hmac(this.env.QR_SIGNING_SECRET, body, 'base64url').slice(0, 32)}`;
  }

  /**
   * Contenido del QR: un enlace a la web (…/q/<token>).
   * Así cualquier cámara lo abre: el personal llega al escáner con la cita validada
   * y cualquier otra persona solo ve que es un pase de Valorize, sin datos.
   */
  url(token: string): string {
    return `${this.env.APP_URL.replace(/\/+$/, '')}/q/${token}`;
  }

  /** Acepta el token tal cual o el enlace completo del QR. */
  static extract(raw: string): string {
    const v = raw.trim();
    const m = v.match(/\/q\/([^/?#\s]+)/);
    if (!m) return v;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  /** Devuelve { bookingId, nonce } si la firma es válida, o null. */
  verify(token: string): { bookingId: string; nonce: string } | null {
    const parts = QrService.extract(token).split('.');
    if (parts.length !== 4 || parts[0] !== PREFIX || !UUID_RE.test(parts[1])) return null;
    const [, bookingId, nonce, sig] = parts;
    const expected = this.crypto.hmac(this.env.QR_SIGNING_SECRET, `${PREFIX}.${bookingId}.${nonce}`, 'base64url').slice(0, 32);
    return this.crypto.safeEqual(sig, expected) ? { bookingId, nonce } : null;
  }
}
