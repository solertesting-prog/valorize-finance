import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainNetwork, CryptoAsset, Prisma, WalletRiskStatus } from '@prisma/client';
import type { CheckResult, ScreeningCheckDto, WalletScreeningDto } from '@valorize/shared';
import { WebhookEvent } from '@valorize/shared';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { ENV, Env } from '../config/env';
import { WebhooksService } from '../webhooks/webhooks.service';
import { parseAddress } from './address';
import { TOKENS } from './chains';
import { OnchainService, OnchainSnapshot } from './onchain.service';

/**
 * Proveedor externo de análisis de riesgo (KYT).
 * Para conectar TRM Labs, Elliptic o Chainalysis KYT, implementa esta interfaz y regístrala en `providers`.
 */
export interface ScreeningProvider {
  readonly name: string;
  enabled(): boolean;
  screen(network: ChainNetwork, address: string): Promise<ScreeningCheckDto[]>;
}

/** API gratuita de sanciones de Chainalysis (solo identifica direcciones sancionadas). */
class ChainalysisSanctionsProvider implements ScreeningProvider {
  readonly name = 'chainalysis-sanctions';
  constructor(private readonly apiKey?: string) {}
  enabled() {
    return !!this.apiKey;
  }
  async screen(_network: ChainNetwork, address: string): Promise<ScreeningCheckDto[]> {
    const res = await fetch(`https://public.chainalysis.com/api/v1/address/${encodeURIComponent(address)}`, {
      headers: { 'X-API-Key': this.apiKey!, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Chainalysis HTTP ${res.status}`);
    const json = (await res.json()) as { identifications?: { category?: string; name?: string }[] };
    const ids = json.identifications ?? [];
    return [
      {
        code: 'CHAINALYSIS_SANCTIONS',
        label: 'Sanciones (Chainalysis)',
        provider: this.name,
        result: ids.length ? 'fail' : 'pass',
        detail: ids.length ? `Identificada: ${ids.map((i) => i.name ?? i.category).join(', ')}` : 'Sin identificaciones',
      },
    ];
  }
}

export interface ScreeningContext {
  asset?: CryptoAsset;
  amount?: string;
  direction?: 'SELL_CRYPTO' | 'BUY_CRYPTO';
}

const WEIGHT: Record<string, number> = {
  WALLET_AGE: 25,
  NO_ACTIVITY: 15,
  CONTRACT_ADDRESS: 20,
  SHARED_WALLET: 30,
  INSUFFICIENT_BALANCE: 10,
};
const REVIEW_THRESHOLD = 30;
/** Comprobaciones cuyo error impide dar la wallet por buena sin revisión humana. */
const ESSENTIAL = new Set(['ISSUER_BLACKLIST', 'CHAINALYSIS_SANCTIONS']);
const REUSE_HOURS = 24;
const REVIEW_VALID_DAYS = 90;

/**
 * Auditoría de wallets.
 *
 * Comprobaciones propias (sin coste):
 *  1. Formato y checksum de la dirección
 *  2. Listas de sanciones: OFAC (importada a diario) y lista interna de Valorize
 *  3. Lista negra del emisor on-chain (Tether / Circle) para USDT y USDC en esa red
 *  4. Actividad: antigüedad, transacciones, si es un contrato, saldo frente al importe a vender
 *  5. Reutilización: la misma dirección registrada por otro cliente
 * Más proveedores externos opcionales (Chainalysis Sanctions gratis; KYT de pago enchufable).
 *
 * Resultado: CLEAR (sin riesgos), REVIEW (requiere revisión humana) o BLOCKED (no se puede operar).
 */
@Injectable()
export class WalletScreeningService {
  private readonly logger = new Logger(WalletScreeningService.name);
  private readonly providers: ScreeningProvider[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly onchain: OnchainService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.providers = [new ChainalysisSanctionsProvider(env.CHAINALYSIS_SANCTIONS_API_KEY)];
  }

  /** Devuelve la última auditoría si es reciente; si no, audita de nuevo. */
  async ensureFresh(walletId: string, ctx: ScreeningContext = {}) {
    const last = await this.prisma.walletScreening.findFirst({ where: { walletId }, orderBy: { createdAt: 'desc' } });
    const fresh = last && Date.now() - last.createdAt.getTime() < REUSE_HOURS * 3600_000;
    // El saldo frente al importe depende de la operación concreta: si hay importe a vender, se recalcula.
    if (fresh && !(ctx.direction === 'SELL_CRYPTO' && ctx.amount)) return last;
    return this.screen(walletId, ctx);
  }

  async screen(walletId: string, ctx: ScreeningContext = {}, actorId?: string) {
    const wallet = await this.prisma.cryptoWallet.findUniqueOrThrow({ where: { id: walletId } });
    const settings = await this.prisma.exchangeSettings.findUnique({ where: { id: 1 } });
    const checks: ScreeningCheckDto[] = [];
    const add = (code: string, label: string, result: CheckResult, detail: string, provider = 'internal') =>
      checks.push({ code, label, result, detail, provider });

    // 1. Formato
    const parsed = parseAddress(wallet.network, wallet.address);
    add('FORMAT', 'Formato de la dirección', parsed.valid ? 'pass' : 'fail', parsed.valid ? 'Dirección válida con checksum' : (parsed.error ?? 'No válida'));

    // 2. Listas de sanciones e internas
    const blocked = await this.prisma.blockedAddress.findMany({ where: { address: wallet.address } });
    const ofac = blocked.filter((b) => b.source === 'ofac');
    const internal = blocked.filter((b) => b.source !== 'ofac');
    const ofacCount = await this.prisma.blockedAddress.count({ where: { source: 'ofac' } });
    add(
      'OFAC',
      'Lista de sanciones OFAC',
      ofac.length ? 'fail' : ofacCount ? 'pass' : 'error',
      ofac.length ? 'La dirección figura en la lista SDN de OFAC' : ofacCount ? `No figura (${ofacCount} direcciones comprobadas)` : 'La lista OFAC aún no se ha importado',
    );
    add('INTERNAL_BLOCKLIST', 'Lista interna de Valorize', internal.length ? 'fail' : 'pass', internal.length ? (internal[0].reason ?? 'Bloqueada por Valorize') : 'No figura');

    // 3. Reutilización por otros clientes
    const shared = await this.prisma.cryptoWallet.count({
      where: { network: wallet.network, address: wallet.address, userId: { not: wallet.userId } },
    });
    add('SHARED_WALLET', 'Usada por otros clientes', shared ? 'warn' : 'pass', shared ? `Registrada por ${shared} cliente(s) más` : 'Solo la usa este cliente');

    // 4 y 5. On-chain
    let snapshot: OnchainSnapshot | null = null;
    if (this.env.SCREENING_OFFLINE || !parsed.valid) {
      add('ONCHAIN', 'Consultas on-chain', 'skip', 'Desactivadas en este entorno');
    } else {
      for (const asset of Object.keys(TOKENS[wallet.network]) as CryptoAsset[]) {
        const token = TOKENS[wallet.network][asset]!;
        if (!token.blacklist) {
          add(`ISSUER_BLACKLIST_${asset}`, `Lista negra de ${asset === 'USDT' ? 'Tether' : 'Circle'}`, 'skip', 'Este token no tiene lista negra on-chain en esta red');
          continue;
        }
        try {
          const listed = await this.onchain.issuerBlacklisted(wallet.network, asset, wallet.address);
          checks.push({
            code: 'ISSUER_BLACKLIST',
            label: `Lista negra de ${asset === 'USDT' ? 'Tether' : 'Circle'} (${asset})`,
            provider: 'onchain',
            result: listed ? 'fail' : 'pass',
            detail: listed ? `El emisor de ${asset} ha congelado esta dirección` : 'No congelada por el emisor',
          });
        } catch (e) {
          checks.push({ code: 'ISSUER_BLACKLIST', label: `Lista negra de ${asset}`, provider: 'onchain', result: 'error', detail: (e as Error).message });
        }
      }

      try {
        snapshot = await this.onchain.snapshot(wallet.network, ctx.asset ?? 'USDT', wallet.address);
        const minDays = settings?.minWalletAgeDays ?? 7;
        if (snapshot.firstSeenAt === undefined) {
          add('WALLET_AGE', 'Antigüedad', 'skip', 'Sin indexador configurado (ETHERSCAN_API_KEY)');
        } else if (snapshot.firstSeenAt === null) {
          add('WALLET_AGE', 'Antigüedad', 'warn', 'Sin actividad registrada');
        } else {
          const days = Math.floor((Date.now() - new Date(snapshot.firstSeenAt).getTime()) / 86400_000);
          add('WALLET_AGE', 'Antigüedad', days < minDays ? 'warn' : 'pass', `${days} días desde la primera actividad`);
        }
        const inactive = snapshot.exists === false || (snapshot.outgoingTxCount === 0 && Number(snapshot.tokenBalance ?? 0) === 0);
        add('NO_ACTIVITY', 'Actividad', inactive ? 'warn' : 'pass', inactive ? 'Wallet sin uso o sin activar' : 'Con actividad');
        if (snapshot.isContract !== undefined) {
          add('CONTRACT_ADDRESS', 'Tipo de cuenta', snapshot.isContract ? 'warn' : 'pass', snapshot.isContract ? 'Es un contrato (wallet inteligente o plataforma)' : 'Cuenta de usuario');
        }
        if (ctx.direction === 'SELL_CRYPTO' && ctx.amount && ctx.asset) {
          const bal = Number(snapshot.tokenBalance ?? 0);
          const need = Number(ctx.amount);
          add('INSUFFICIENT_BALANCE', `Saldo de ${ctx.asset}`, bal >= need ? 'pass' : 'warn', `${snapshot.tokenBalance ?? 0} ${ctx.asset} disponibles para vender ${ctx.amount}`);
        }
      } catch (e) {
        add('ONCHAIN', 'Consultas on-chain', 'error', (e as Error).message);
      }
    }

    // Proveedores externos
    const used = ['internal', ...(this.env.SCREENING_OFFLINE ? [] : ['onchain'])];
    for (const p of this.providers.filter((x) => x.enabled() && !this.env.SCREENING_OFFLINE)) {
      used.push(p.name);
      try {
        checks.push(...(await p.screen(wallet.network, wallet.address)));
      } catch (e) {
        checks.push({ code: p.name.toUpperCase(), label: p.name, provider: p.name, result: 'error', detail: (e as Error).message });
      }
    }

    // Puntuación
    let status: WalletRiskStatus;
    let score = 0;
    if (checks.some((c) => c.result === 'fail')) {
      status = 'BLOCKED';
      score = 100;
    } else {
      for (const c of checks) if (c.result === 'warn') score += WEIGHT[c.code] ?? 10;
      const essentialError = checks.some((c) => c.result === 'error' && ESSENTIAL.has(c.code));
      score = Math.min(99, score + checks.filter((c) => c.result === 'error').length * 5);
      status = score >= REVIEW_THRESHOLD || essentialError ? 'REVIEW' : 'CLEAR';

      // Si un responsable ya revisó y aprobó estos mismos avisos recientemente, se mantiene la aprobación.
      if (status === 'REVIEW' && !essentialError) {
        const reviewed = await this.prisma.walletScreening.findFirst({
          where: { walletId, reviewDecision: 'CLEAR', reviewedAt: { gt: new Date(Date.now() - REVIEW_VALID_DAYS * 86400_000) } },
          orderBy: { reviewedAt: 'desc' },
        });
        if (reviewed) {
          const prevWarns = new Set(((reviewed.checks as unknown as ScreeningCheckDto[]) ?? []).filter((c) => c.result === 'warn').map((c) => c.code));
          const nowWarns = checks.filter((c) => c.result === 'warn').map((c) => c.code);
          if (nowWarns.every((w) => prevWarns.has(w))) {
            status = 'CLEAR';
            add('PRIOR_REVIEW', 'Revisión previa', 'pass', `Avisos ya revisados y aceptados el ${reviewed.reviewedAt!.toISOString().slice(0, 10)}`);
          }
        }
      }
    }

    const screening = await this.prisma.$transaction(async (tx) => {
      const s = await tx.walletScreening.create({
        data: {
          walletId,
          status,
          riskScore: score,
          providers: used,
          checks: checks as unknown as Prisma.InputJsonValue,
          snapshot: (snapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.cryptoWallet.update({ where: { id: walletId }, data: { riskStatus: status, riskScore: score, lastScreenedAt: new Date() } });
      return s;
    });

    await this.audit.log({
      actorId: actorId ?? null,
      action: `wallet.screened.${status.toLowerCase()}`,
      entityType: 'wallet',
      entityId: walletId,
      metadata: { score, failed: checks.filter((c) => c.result === 'fail').map((c) => c.code) },
    });
    void this.webhooks.emit(WebhookEvent.WALLET_SCREENED, { walletId, userId: wallet.userId, network: wallet.network, status, riskScore: score });
    return screening;
  }

  /** Decisión manual de un responsable sobre una wallet en revisión. */
  async review(walletId: string, decision: 'CLEAR' | 'BLOCKED', note: string, actorId: string, meta?: Parameters<AuditService['log']>[0]['meta']) {
    const last = await this.prisma.walletScreening.findFirst({ where: { walletId }, orderBy: { createdAt: 'desc' } });
    if (!last) throw new Error('La wallet no tiene auditorías');
    await this.prisma.$transaction([
      this.prisma.walletScreening.update({
        where: { id: last.id },
        data: { reviewedById: actorId, reviewedAt: new Date(), reviewDecision: decision, reviewNote: note },
      }),
      this.prisma.cryptoWallet.update({ where: { id: walletId }, data: { riskStatus: decision } }),
    ]);
    await this.audit.log({ actorId, action: `wallet.review.${decision.toLowerCase()}`, entityType: 'wallet', entityId: walletId, metadata: { note }, meta });
  }

  toDto(s: Prisma.WalletScreeningGetPayload<{ include: { reviewedBy: { select: { id: true; firstName: true; lastName: true } } } }>): WalletScreeningDto {
    return {
      id: s.id,
      status: s.status,
      riskScore: s.riskScore,
      providers: s.providers,
      checks: (s.checks as unknown as ScreeningCheckDto[]) ?? [],
      snapshot: (s.snapshot as Record<string, unknown>) ?? null,
      reviewedBy: s.reviewedBy ? { id: s.reviewedBy.id, name: `${s.reviewedBy.firstName} ${s.reviewedBy.lastName}` } : null,
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
      reviewDecision: s.reviewDecision,
      reviewNote: s.reviewNote,
      createdAt: s.createdAt.toISOString(),
    };
  }
}
