import { Inject, Injectable } from '@nestjs/common';
import { DIRECTION_LABEL, formatDateLong, formatEur, formatNum, formatTime, networkFullName, TX_CHECK_LABEL, TxCheckStatus } from '@valorize/shared';
import { CryptoService } from '../common/crypto.service';
import { Errors } from '../common/errors';
import { PdfPage, renderPdf } from '../common/pdf';
import { PrismaService } from '../common/prisma.service';
import { ENV, Env } from '../config/env';
import { KycService } from '../kyc/kyc.service';
import { parseAddress } from '../wallets/address';

const LINK_TTL_MS = 5 * 60_000;
const INK: [number, number, number] = [0.027, 0.067, 0.11];
const MINT: [number, number, number] = [0.29, 0.86, 0.66];
const GREY: [number, number, number] = [0.42, 0.47, 0.53];

/**
 * Justificante en PDF de una operación de cambio completada.
 *  - Se descarga con un enlace firmado de 5 minutos (sirve igual en la web y en la app, sin cabeceras).
 *  - Lleva un código de verificación: con la referencia y ese código se comprueba que es auténtico.
 */
@Injectable()
export class ReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly kyc: KycService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Enlace de descarga firmado y de corta duración. */
  link(bookingId: string) {
    const exp = Date.now() + LINK_TTL_MS;
    const body = `${bookingId}.${exp}`;
    const sig = this.crypto.hmac(this.env.QR_SIGNING_SECRET, `receipt-link:${body}`, 'base64url').slice(0, 32);
    return {
      url: `${this.env.API_PUBLIC_URL.replace(/\/+$/, '')}/v1/receipts/${Buffer.from(body).toString('base64url')}.${sig}`,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  /** Comprueba el enlace y devuelve el id de la cita, o null si no vale o ha caducado. */
  readLink(token: string): string | null {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    let body: string;
    try {
      body = Buffer.from(b64, 'base64url').toString('utf8');
    } catch {
      return null;
    }
    const expected = this.crypto.hmac(this.env.QR_SIGNING_SECRET, `receipt-link:${body}`, 'base64url').slice(0, 32);
    if (!this.crypto.safeEqual(sig, expected)) return null;
    const [id, exp] = body.split('.');
    return Number(exp) > Date.now() ? id : null;
  }

  /** Código de verificación impreso en el justificante (12 caracteres, en grupos de 4). */
  code(reference: string, completedAt: Date, amount: string, fiat: string | null) {
    const raw = this.crypto.hmac(this.env.QR_SIGNING_SECRET, `receipt:${reference}|${completedAt.toISOString()}|${amount}|${fiat ?? ''}`, 'hex');
    return raw.slice(0, 12).toUpperCase().match(/.{4}/g)!.join('-');
  }

  /** Para la comprobación pública: ¿coinciden referencia y código? */
  async verify(reference: string, code: string) {
    const b = await this.prisma.booking.findUnique({ where: { reference: reference.trim().toUpperCase() }, include: { exchange: true } });
    if (!b?.exchange || b.status !== 'COMPLETED' || !b.completedAt) return { valid: false };
    const expected = this.code(b.reference, b.completedAt, b.exchange.amount.toString(), b.exchange.fiatAmount?.toString() ?? null);
    const valid = this.crypto.safeEqual(expected, code.trim().toUpperCase());
    return valid
      ? {
          valid: true,
          reference: b.reference,
          completedAt: b.completedAt.toISOString(),
          operation: `${DIRECTION_LABEL[b.exchange.direction]}: ${formatNum(b.exchange.amount.toString())} ${b.exchange.asset}`,
          fiatAmount: b.exchange.fiatAmount ? formatEur(b.exchange.fiatAmount.toString()) : null,
        }
      : { valid: false };
  }

  async pdf(bookingId: string): Promise<{ filename: string; data: Buffer }> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        exchange: { include: { wallet: true } },
        location: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        checkedInBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!b) throw Errors.notFound('Cita');
    const ex = b.exchange;
    if (!ex) throw Errors.unprocessable('NOT_EXCHANGE', 'Solo las operaciones de cambio tienen justificante');
    if (b.status !== 'COMPLETED' || !b.completedAt) {
      throw Errors.conflict('NOT_COMPLETED', 'El justificante estará disponible cuando la operación se complete en la oficina');
    }

    const id = await this.kyc.receiptIdentity(b.user.id);
    const tz = b.location.timezone;
    const fiat = ex.fiatAmount?.toString() ?? null;
    const code = this.code(b.reference, b.completedAt, ex.amount.toString(), fiat);
    const selling = ex.direction === 'SELL_CRYPTO';
    const txStatus = ex.txCheckStatus as TxCheckStatus | null;

    const p = new PdfPage();
    const L = 50;
    const R = p.width - 50;
    // Cabecera
    p.rect(0, 0, p.width, 96, INK);
    p.text(L, 30, 'VALORIZE', { size: 18, font: 'B', color: MINT });
    p.text(L + 98, 30, 'FINANCE', { size: 18, font: 'B', color: [1, 1, 1] });
    p.text(L, 58, 'Justificante de operación de cambio', { size: 11, color: [0.8, 0.85, 0.9] });
    p.text(R, 30, b.reference, { size: 14, font: 'B', color: [1, 1, 1], align: 'right' });
    p.text(R, 58, `${formatDateLong(b.completedAt.toISOString(), tz)}, ${formatTime(b.completedAt.toISOString(), tz)}`, { size: 10, color: [0.8, 0.85, 0.9], align: 'right' });

    let y = 124;
    const section = (title: string) => {
      p.text(L, y, title.toUpperCase(), { size: 8.5, font: 'B', color: GREY });
      y += 16;
      p.line(L, y, R, y);
      y += 10;
    };
    const row = (label: string, value: string, opts: { mono?: boolean; strong?: boolean } = {}) => {
      p.text(L, y, label, { size: 9.5, color: GREY });
      const size = opts.mono ? 8.5 : opts.strong ? 12 : 10;
      const h = p.wrap(L + 150, y - (opts.strong ? 1 : 0), value, R - L - 150, { size, font: opts.strong ? 'B' : 'R' });
      y += Math.max(h, 14) + 6;
    };

    section('Operación');
    row('Tipo', DIRECTION_LABEL[ex.direction]);
    row(selling ? 'Entregado por el cliente' : 'Recibido por el cliente', `${formatNum(ex.amount.toString())} ${ex.asset}`, { strong: true });
    row('Red', networkFullName(ex.network));
    row('Tipo aplicado', ex.agreedRate ? `${formatNum(ex.agreedRate.toString(), 6)} € por ${ex.asset}` : '—');
    if (ex.feeAmount && Number(ex.feeAmount) > 0) row('Comisión', formatEur(ex.feeAmount.toString()));
    row(selling ? 'Pagado al cliente' : 'Pagado por el cliente', fiat ? formatEur(fiat) : '—', { strong: true });
    row('Oficina', `${b.location.name} · ${b.location.address}, ${b.location.city}`);
    if (b.checkedInBy) row('Atendido por', `${b.checkedInBy.firstName} ${b.checkedInBy.lastName}`);
    y += 8;

    section('Cliente');
    row('Nombre', id.legalName ?? `${b.user.firstName} ${b.user.lastName}`);
    if (id.document) row('Documento', id.document);
    y += 8;

    section('Blockchain');
    row(selling ? 'Wallet de origen' : 'Wallet de destino', parseAddress(ex.network, ex.wallet.address).display, { mono: true });
    row('Transacción', ex.txHash ?? 'No registrada', { mono: !!ex.txHash });
    row('Verificación en la red', txStatus ? TX_CHECK_LABEL[txStatus] : 'Sin verificar');
    y += 8;

    // Pie: código de verificación
    p.rect(L, y, R - L, 58, [0.95, 0.97, 0.98]);
    p.text(L + 14, y + 12, 'Código de verificación', { size: 9, color: GREY });
    p.text(L + 14, y + 28, code, { size: 15, font: 'B' });
    p.wrap(L + 210, y + 12, `Para comprobar que este justificante es auténtico, introduce la referencia ${b.reference} y este código en ${this.env.APP_URL.replace(/\/+$/, '')}/justificante.`, R - L - 224, { size: 8.5, color: GREY });
    y += 76;
    p.wrap(L, y, 'Documento informativo de la operación realizada en oficina. Las operaciones con criptoactivos pueden tener implicaciones fiscales; conserva este justificante.', R - L, { size: 8, color: GREY });

    return { filename: `justificante-${b.reference}.pdf`, data: renderPdf(p, { title: `Justificante ${b.reference}` }) };
  }
}
