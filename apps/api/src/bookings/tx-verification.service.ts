import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainNetwork, CryptoAsset, Prisma, TxCheckStatus } from '@prisma/client';
import { CheckResult, ScreeningCheckDto, TxCheckDto, WebhookEvent } from '@valorize/shared';
import { AuditService } from '../common/audit.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { ENV, Env } from '../config/env';
import { WebhooksService } from '../webhooks/webhooks.service';
import { parseAddress } from '../wallets/address';
import { formatUnits, TOKENS } from '../wallets/chains';
import { OnchainService } from '../wallets/onchain.service';
import { WalletsService } from '../wallets/wallets.service';

/** Confirmaciones a partir de las que damos la transacción por firme. */
export const REQUIRED_CONFIRMATIONS: Record<ChainNetwork, number> = { TRON: 19, ETHEREUM: 12, POLYGON: 64, BSC: 15 };

const PROVIDER = 'onchain';

/**
 * Verificación on-chain de la transacción de una operación de cambio:
 *  1. la transacción existe y está confirmada con éxito
 *  2. contiene una transferencia del token correcto (USDT/USDC de la red elegida)
 *  3. la transferencia sale de la wallet del cliente (venta) o llega a ella (compra)
 *  4. la contraparte es una dirección propia de Valorize (si están configuradas)
 *  5. el importe coincide con el solicitado
 *  6. tiene las confirmaciones necesarias
 * El resultado se guarda en la operación y queda en el registro de auditoría.
 */
@Injectable()
export class TxVerificationService {
  private readonly logger = new Logger(TxVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onchain: OnchainService,
    private readonly wallets: WalletsService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Verifica la transacción de una operación y guarda el resultado. */
  async verify(exchangeId: string, actorId: string | null = null): Promise<TxCheckDto> {
    const ex = await this.prisma.exchangeRequest.findUnique({ where: { id: exchangeId }, include: { wallet: true, booking: true } });
    if (!ex) throw Errors.notFound('Operación');
    if (!ex.txHash) throw Errors.unprocessable('NO_TX_HASH', 'La operación no tiene hash de transacción');

    const result = await this.evaluate({
      network: ex.network,
      asset: ex.asset,
      direction: ex.direction,
      amount: ex.amount.toString(),
      walletAddress: ex.wallet.address,
      txHash: ex.txHash,
    });

    const previous = ex.txCheckStatus;
    await this.prisma.exchangeRequest.update({
      where: { id: ex.id },
      data: { txCheckStatus: result.status, txCheck: result as unknown as Prisma.InputJsonValue, txCheckedAt: new Date(result.checkedAt) },
    });
    await this.audit.log({
      actorId,
      action: 'exchange.tx_verified',
      entityType: 'booking',
      entityId: ex.bookingId,
      metadata: { txHash: ex.txHash, status: result.status, confirmations: result.confirmations, automatic: !actorId },
    });
    if (previous !== result.status) {
      void this.webhooks.emit(WebhookEvent.EXCHANGE_TX_VERIFIED, {
        bookingId: ex.bookingId,
        reference: ex.booking.reference,
        txHash: ex.txHash,
        network: ex.network,
        status: result.status,
      });
    }
    return result;
  }

  /** Re-verifica las transacciones que esperaban confirmaciones o que no se pudieron comprobar. */
  async recheckPending(limit = 50): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const due = await this.prisma.exchangeRequest.findMany({
      where: { txHash: { not: null }, txCheckStatus: { in: ['PENDING', 'NOT_FOUND', 'ERROR'] }, createdAt: { gte: since } },
      orderBy: { txCheckedAt: 'asc' },
      select: { id: true },
      take: limit,
    });
    for (const d of due) {
      await this.verify(d.id).catch((e) => this.logger.warn(`Verificación de ${d.id}: ${(e as Error).message}`));
    }
    return due.length;
  }

  async evaluate(input: {
    network: ChainNetwork;
    asset: CryptoAsset;
    direction: 'SELL_CRYPTO' | 'BUY_CRYPTO';
    amount: string;
    walletAddress: string;
    txHash: string;
  }): Promise<TxCheckDto> {
    const required = REQUIRED_CONFIRMATIONS[input.network];
    const checks: ScreeningCheckDto[] = [];
    const add = (code: string, label: string, result: CheckResult, detail: string) => checks.push({ code, label, result, detail, provider: PROVIDER });
    const base = {
      checkedAt: new Date().toISOString(),
      txHash: input.txHash,
      requiredConfirmations: required,
      blockNumber: null as number | null,
      timestamp: null as string | null,
      confirmations: null as number | null,
      transfer: null as TxCheckDto['transfer'],
    };
    const done = (status: TxCheckStatus): TxCheckDto => ({ ...base, status, checks });

    if (this.env.SCREENING_OFFLINE) {
      add('lookup', 'Consulta a la red', 'error', 'Modo sin red activado (SCREENING_OFFLINE)');
      return done('ERROR');
    }

    const token = TOKENS[input.network][input.asset];
    if (!token) {
      add('token', 'Token admitido', 'fail', `${input.asset} no está disponible en ${input.network}`);
      return done('MISMATCH');
    }

    let tx;
    try {
      tx = await this.onchain.lookupTx(input.network, input.txHash);
    } catch (e) {
      add('lookup', 'Consulta a la red', 'error', (e as Error).message);
      return done('ERROR');
    }

    base.blockNumber = tx.blockNumber ?? null;
    base.timestamp = tx.timestamp ?? null;
    base.confirmations = tx.confirmations ?? null;

    if (tx.state === 'not_found') {
      add('exists', 'Transacción en la red', 'fail', 'No existe en esta red. Revisa el hash y la red elegida.');
      return done('NOT_FOUND');
    }
    if (tx.state === 'pending') {
      add('exists', 'Transacción en la red', 'warn', 'Enviada, pendiente de entrar en un bloque');
      return done('PENDING');
    }
    add('exists', 'Transacción en la red', 'pass', `Bloque ${tx.blockNumber ?? '—'}`);
    if (tx.state === 'failed') {
      add('success', 'Ejecución', 'fail', 'La transacción falló en la red (revertida). No se movieron fondos.');
      return done('FAILED');
    }
    add('success', 'Ejecución', 'pass', 'Ejecutada con éxito');

    // Token correcto
    const tokenCanon = parseAddress(input.network, token.address).canonical;
    const ofToken = tx.transfers.filter((t) => t.token === tokenCanon);
    if (!ofToken.length) {
      const others = tx.transfers.length ? `Contiene transferencias de otros tokens (${tx.transfers.length}).` : 'No contiene transferencias de tokens.';
      add('token', `Transferencia de ${input.asset}`, 'fail', `${others} Se esperaba ${input.asset} (${token.address}).`);
      return done('MISMATCH');
    }
    add('token', `Transferencia de ${input.asset}`, 'pass', `Contrato oficial ${token.address}`);

    // Wallet del cliente en el lado correcto
    const wallet = parseAddress(input.network, input.walletAddress).canonical;
    const selling = input.direction === 'SELL_CRYPTO';
    const mine = ofToken.filter((t) => (selling ? t.from : t.to) === wallet);
    if (!mine.length) {
      add(
        'wallet',
        'Wallet del cliente',
        'fail',
        selling ? 'Los fondos no salen de la wallet declarada por el cliente.' : 'Los fondos no llegan a la wallet declarada por el cliente.',
      );
      return done('MISMATCH');
    }
    add('wallet', 'Wallet del cliente', 'pass', selling ? 'Los fondos salen de la wallet declarada' : 'Los fondos llegan a la wallet declarada');

    // Elegimos la transferencia cuyo importe más se acerca al solicitado.
    const wanted = toRaw(input.amount, token.decimals);
    const best = mine.reduce((a, b) => (abs(b.raw - wanted) < abs(a.raw - wanted) ? b : a));
    base.transfer = {
      from: display(input.network, best.from),
      to: display(input.network, best.to),
      amount: formatUnits(best.raw, token.decimals),
      token: input.asset,
    };

    // Contraparte = dirección propia
    const own = (await this.wallets.receivingAddresses())[input.network] ?? [];
    const counterparty = selling ? best.to : best.from;
    if (!own.length) {
      add('counterparty', 'Dirección de Valorize', 'skip', 'No hay direcciones propias configuradas para esta red (Backoffice → Cambio cripto)');
    } else if (own.includes(counterparty)) {
      add('counterparty', 'Dirección de Valorize', 'pass', selling ? 'Llega a una dirección de Valorize' : 'Sale de una dirección de Valorize');
    } else {
      add(
        'counterparty',
        'Dirección de Valorize',
        'warn',
        `${selling ? 'Llega a' : 'Sale de'} ${display(input.network, counterparty)}, que no está entre las direcciones de Valorize`,
      );
    }

    // Importe
    if (best.raw === wanted) {
      add('amount', 'Importe', 'pass', `${base.transfer.amount} ${input.asset}, igual al solicitado`);
    } else {
      add('amount', 'Importe', 'warn', `${base.transfer.amount} ${input.asset}; se solicitaron ${input.amount} ${input.asset}`);
    }

    // Confirmaciones
    const conf = tx.confirmations ?? 0;
    if (conf >= required) add('confirmations', 'Confirmaciones', 'pass', `${conf} (mínimo ${required})`);
    else add('confirmations', 'Confirmaciones', 'warn', `${conf} de ${required}. Se volverá a comprobar automáticamente.`);

    if (conf < required) return done('PENDING');
    return done(checks.some((c) => c.result === 'warn') ? 'WARNING' : 'VERIFIED');
  }
}

function toRaw(amount: string, decimals: number): bigint {
  const [w, f = ''] = amount.split('.');
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

const abs = (v: bigint) => (v < 0n ? -v : v);

function display(network: ChainNetwork, canonical: string) {
  return parseAddress(network, canonical).display;
}

