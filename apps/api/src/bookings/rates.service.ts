import { Inject, Injectable, Logger } from '@nestjs/common';
import { CryptoAsset, ExchangeDirection, Prisma } from '@prisma/client';
import type { QuoteDto } from '@valorize/shared';
import Redis from 'ioredis';
import { REDIS } from '../common/common.module';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { ENV, Env } from '../config/env';

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** Identificadores de CoinGecko para el precio en EUR. */
const COINGECKO_ID: Record<CryptoAsset, string> = { USDT: 'tether', USDC: 'usd-coin' };
const CACHE_KEY = 'rates:eur:v1';
/** El precio de mercado se refresca como mucho cada 2 minutos. */
const CACHE_TTL_SEC = 120;
/** Un precio de mercado más antiguo que esto no se usa: se pasa al tipo manual. */
const MAX_AGE_MS = 30 * 60_000;

interface MarketRates {
  rates: Partial<Record<CryptoAsset, string>>;
  at: string;
}

export interface MidRate {
  mid: Dec;
  source: 'AUTO' | 'MANUAL';
  updatedAt: Date;
}

/**
 * Cotización orientativa del cambio:
 *  - tipo medio: precio de mercado en EUR (CoinGecko, en caché 2 min) o el tipo manual del backoffice
 *  - margen por sentido: el cliente que vende cripto recibe tipo medio × (1 − margen),
 *    el que compra paga tipo medio × (1 + margen)
 *  - comisión fija opcional por operación
 * El precio final lo fija la oficina al aprobar o liquidar.
 */
@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);
  private lastGood: MarketRates | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async mid(asset: CryptoAsset): Promise<MidRate> {
    const s = await this.settings();
    const manual = readManual(s.manualRates)[asset];
    if (s.rateSource === 'AUTO' && !this.env.SCREENING_OFFLINE) {
      const market = await this.market().catch((e) => {
        this.logger.warn(`Precio de mercado no disponible: ${(e as Error).message}`);
        return this.lastGood;
      });
      const v = market?.rates[asset];
      if (v && Date.now() - Date.parse(market!.at) < MAX_AGE_MS) return { mid: new Decimal(v), source: 'AUTO', updatedAt: new Date(market!.at) };
    }
    if (!manual) {
      throw Errors.unprocessable('RATE_UNAVAILABLE', 'Ahora mismo no podemos calcular la cotización. Inténtalo en unos minutos.');
    }
    return { mid: new Decimal(manual), source: 'MANUAL', updatedAt: s.updatedAt };
  }

  async quote(direction: ExchangeDirection, asset: CryptoAsset, amount: string): Promise<QuoteDto> {
    const [s, m] = await Promise.all([this.settings(), this.mid(asset)]);
    return computeQuote({
      direction,
      asset,
      amount: new Decimal(amount),
      mid: m.mid,
      spreadPct: direction === 'SELL_CRYPTO' ? s.sellSpreadPct : s.buySpreadPct,
      fee: s.fixedFeeEur,
      source: m.source,
      updatedAt: m.updatedAt,
    });
  }

  private settings() {
    return this.prisma.exchangeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  /** Precio de mercado en EUR, compartido entre instancias a través de Redis. */
  private async market(): Promise<MarketRates> {
    const cached = await this.redis.get(CACHE_KEY).catch(() => null);
    if (cached) return (this.lastGood = JSON.parse(cached) as MarketRates);
    const ids = Object.values(COINGECKO_ID).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, { eur?: number }>;
    const rates: MarketRates['rates'] = {};
    for (const [asset, id] of Object.entries(COINGECKO_ID) as [CryptoAsset, string][]) {
      const eur = json[id]?.eur;
      // Una stablecoin en EUR no debería salir de esta franja: si sale, el dato no es fiable.
      if (typeof eur === 'number' && eur > 0.5 && eur < 1.5) rates[asset] = eur.toFixed(6);
    }
    if (!Object.keys(rates).length) throw new Error('CoinGecko sin precios válidos');
    const value: MarketRates = { rates, at: new Date().toISOString() };
    await this.redis.set(CACHE_KEY, JSON.stringify(value), 'EX', CACHE_TTL_SEC).catch(() => undefined);
    return (this.lastGood = value);
  }
}

export function readManual(v: Prisma.JsonValue): Partial<Record<CryptoAsset, string>> {
  const out: Partial<Record<CryptoAsset, string>> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const a of Object.values(CryptoAsset)) {
    const x = (v as Record<string, unknown>)[a];
    if (typeof x === 'string' && /^\d{1,4}(\.\d{1,8})?$/.test(x) && Number(x) > 0) out[a] = x;
  }
  return out;
}

/** Cálculo puro de la cotización (sin redondeos intermedios; euros a 2 decimales al final). */
export function computeQuote(i: {
  direction: ExchangeDirection;
  asset: CryptoAsset;
  amount: Dec;
  mid: Dec;
  spreadPct: Dec;
  fee: Dec;
  source: 'AUTO' | 'MANUAL';
  updatedAt: Date;
}): QuoteDto {
  const selling = i.direction === 'SELL_CRYPTO';
  const factor = new Decimal(1).plus(i.spreadPct.div(100).times(selling ? -1 : 1));
  const rate = i.mid.times(factor);
  const gross = i.amount.times(rate);
  const fiat = selling ? Decimal.max(gross.minus(i.fee), 0) : gross.plus(i.fee);
  return {
    direction: i.direction,
    asset: i.asset,
    amount: i.amount.toString(),
    midRate: i.mid.toDecimalPlaces(6).toString(),
    rate: rate.toDecimalPlaces(6).toString(),
    spreadPct: i.spreadPct.toString(),
    fee: i.fee.toFixed(2),
    // Venta: se redondea a favor de la casa (hacia abajo); compra: hacia arriba.
    fiatAmount: fiat.toDecimalPlaces(2, selling ? Decimal.ROUND_DOWN : Decimal.ROUND_UP).toFixed(2),
    source: i.source,
    updatedAt: i.updatedAt.toISOString(),
  };
}
