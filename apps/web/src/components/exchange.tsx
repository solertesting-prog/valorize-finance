'use client';

import {
  ChainNetwork,
  CryptoAsset,
  DIRECTION_LABEL,
  DIRECTION_SHORT,
  ExchangeDirection,
  ExchangeDto,
  ExchangeSettingsDto,
  EXPLORER_ADDRESS_URL,
  EXPLORER_TX_URL,
  NETWORK_LABEL,
  ScreeningCheckDto,
  WALLET_RISK_LABEL,
  walletAddressShape,
  WalletDto,
  WalletRiskStatus,
  WalletScreeningDto,
} from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { api } from '@/lib/api';
import { Spinner } from './ui';

export interface ExchangeDraft {
  direction: ExchangeDirection;
  asset: CryptoAsset;
  network: ChainNetwork;
  amount: string;
  walletId: string | null;
  newAddress: string;
  newLabel: string;
}

export const emptyExchange = (s?: ExchangeSettingsDto): ExchangeDraft => ({
  direction: s && !s.sellEnabled ? 'BUY_CRYPTO' : 'SELL_CRYPTO',
  asset: s?.enabledAssets[0] ?? 'USDT',
  network: s?.enabledNetworks[0] ?? 'TRON',
  amount: '',
  walletId: null,
  newAddress: '',
  newLabel: '',
});

/** Valida el borrador en cliente. Devuelve el primer error o null. */
export function exchangeError(d: ExchangeDraft, s: ExchangeSettingsDto | undefined): string | null {
  const n = Number(d.amount.replace(',', '.'));
  if (!d.amount || !Number.isFinite(n) || n <= 0) return 'Indica el importe';
  if (s && n < Number(s.minAmount)) return `El mínimo es ${s.minAmount} ${d.asset}`;
  if (s && n > Number(s.maxAmount)) return `El máximo por operación es ${s.maxAmount} ${d.asset}`;
  if (!d.walletId) {
    if (!d.newAddress.trim()) return 'Indica la dirección de tu wallet';
    if (!walletAddressShape[d.network].test(d.newAddress.trim())) {
      return d.network === 'TRON' ? 'Una dirección TRON empieza por T y tiene 34 caracteres' : 'La dirección debe empezar por 0x y tener 42 caracteres';
    }
  }
  return null;
}

export function exchangePayload(d: ExchangeDraft) {
  return {
    direction: d.direction,
    asset: d.asset,
    network: d.network,
    amount: d.amount.replace(',', '.'),
    ...(d.walletId ? { walletId: d.walletId } : { wallet: { network: d.network, address: d.newAddress.trim(), label: d.newLabel || undefined } }),
  };
}

export function useExchangeSettings() {
  return useQuery({ queryKey: ['exchange-settings'], queryFn: () => api.get<ExchangeSettingsDto>('/exchange/settings'), staleTime: 300_000 });
}

/** Paso "Operación" de la reserva: qué, cuánto, en qué red y con qué wallet. */
export function ExchangeForm({ value, onChange }: { value: ExchangeDraft; onChange: (d: ExchangeDraft) => void }) {
  const settings = useExchangeSettings();
  const wallets = useQuery({
    queryKey: ['me', 'wallets', value.network],
    queryFn: () => api.get<WalletDto[]>('/me/wallets', { query: { network: value.network } }),
  });
  const s = settings.data;
  if (!s) return <Spinner />;
  const set = (p: Partial<ExchangeDraft>) => onChange({ ...value, ...p });
  const directions = (['SELL_CRYPTO', 'BUY_CRYPTO'] as const).filter((d) => (d === 'SELL_CRYPTO' ? s.sellEnabled : s.buyEnabled));
  const walletPrompt =
    value.direction === 'SELL_CRYPTO' ? `Wallet desde la que enviarás los ${value.asset}` : `Wallet en la que recibirás los ${value.asset}`;

  return (
    <div className="stack" style={{ '--gap': '20px' } as CSSProperties}>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, '--gap': '8px' } as CSSProperties}>
        <legend className="small" style={{ fontWeight: 600, marginBottom: 8 }}>
          ¿Qué quieres hacer?
        </legend>
        {directions.map((d) => (
          <button key={d} type="button" className="choice" aria-pressed={value.direction === d} onClick={() => set({ direction: d })}>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{DIRECTION_LABEL[d]}</div>
              <div className="small muted">
                {d === 'SELL_CRYPTO' ? 'Nos envías USDT/USDC en la oficina y te pagamos en euros.' : 'Pagas en euros en la oficina y te enviamos USDT/USDC a tu wallet.'}
              </div>
            </div>
          </button>
        ))}
      </fieldset>

      <div className="grid" style={{ '--min': '150px' } as CSSProperties}>
        <div className="field">
          <label htmlFor="ex-asset">Moneda</label>
          <div className="row" role="group" id="ex-asset" style={{ gap: 8 }}>
            {s.enabledAssets.map((a) => (
              <button key={a} type="button" className={`btn ${value.asset === a ? 'primary' : ''}`} aria-pressed={value.asset === a} onClick={() => set({ asset: a })}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="ex-network">Red</label>
          <select id="ex-network" className="select" value={value.network} onChange={(e) => set({ network: e.target.value as ChainNetwork, walletId: null })}>
            {s.enabledNetworks.map((n) => (
              <option key={n} value={n}>
                {NETWORK_LABEL[n]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ex-amount">Importe en {value.asset}</label>
        <input
          id="ex-amount"
          className="input mono"
          inputMode="decimal"
          placeholder={`${s.minAmount} – ${s.maxAmount}`}
          value={value.amount}
          onChange={(e) => set({ amount: e.target.value.replace(/[^\d.,]/g, '') })}
          style={{ fontSize: 'var(--t-xl)' }}
        />
        <span className="hint">
          Entre {s.minAmount} y {s.maxAmount} {value.asset} por operación. Por encima de {s.enhancedKycAbove} se pide la verificación ampliada.
        </span>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, '--gap': '8px' } as CSSProperties}>
        <legend className="small" style={{ fontWeight: 600, marginBottom: 8 }}>
          {walletPrompt}
        </legend>
        {wallets.data?.map((w) => (
          <button key={w.id} type="button" className="choice" aria-pressed={value.walletId === w.id} onClick={() => set({ walletId: w.id })}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{w.label ?? 'Mi wallet'}</div>
              <div className="small muted mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {w.address}
              </div>
            </div>
          </button>
        ))}
        <button type="button" className="choice" aria-pressed={value.walletId === null} onClick={() => set({ walletId: null })}>
          <div className="grow" style={{ fontWeight: 600 }}>
            {wallets.data?.length ? 'Usar otra wallet' : 'Añadir mi wallet'}
          </div>
        </button>
        {value.walletId === null ? (
          <div className="card flat stack">
            <div className="field">
              <label htmlFor="ex-address">Dirección ({NETWORK_LABEL[value.network]})</label>
              <input
                id="ex-address"
                className="input mono"
                autoComplete="off"
                spellCheck={false}
                placeholder={value.network === 'TRON' ? 'T…' : '0x…'}
                value={value.newAddress}
                onChange={(e) => set({ newAddress: e.target.value.trim() })}
              />
              <span className="hint">Cópiala de tu wallet. Comprueba que es de la red {NETWORK_LABEL[value.network]}: si eliges otra red, los fondos se pueden perder.</span>
            </div>
            <div className="field">
              <label htmlFor="ex-label">Nombre para recordarla (opcional)</label>
              <input id="ex-label" className="input" maxLength={60} placeholder="Trust Wallet, Ledger…" value={value.newLabel} onChange={(e) => set({ newLabel: e.target.value })} />
            </div>
          </div>
        ) : null}
        <p className="xs muted" style={{ margin: 0 }}>
          Revisamos cada wallet antes de aprobar la operación, como exige la normativa de prevención de blanqueo.
        </p>
      </fieldset>
    </div>
  );
}

// ───────── Resúmenes y estados ─────────

const RISK_TONE: Record<WalletRiskStatus, string> = { PENDING: '', CLEAR: 'ok', REVIEW: 'warn', BLOCKED: 'bad' };

export function WalletRiskBadge({ status, score }: { status: WalletRiskStatus; score?: number | null }) {
  return (
    <span className={`badge ${RISK_TONE[status]}`}>
      {WALLET_RISK_LABEL[status]}
      {score != null ? ` · ${score}` : ''}
    </span>
  );
}

export function shortAddress(a: string) {
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a;
}

export function ExchangeSummary({ ex, staff = false }: { ex: ExchangeDto; staff?: boolean }) {
  return (
    <dl className="grid" style={{ '--min': '150px', margin: 0, gap: 12 } as CSSProperties}>
      <div>
        <dt className="xs muted">Operación</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{DIRECTION_SHORT[ex.direction]}</dd>
      </div>
      <div>
        <dt className="xs muted">Importe</dt>
        <dd className="mono" style={{ margin: 0, fontSize: 'var(--t-lg)', fontWeight: 700 }}>
          {ex.amount} {ex.asset}
        </dd>
      </div>
      <div>
        <dt className="xs muted">Red</dt>
        <dd style={{ margin: 0 }}>{NETWORK_LABEL[ex.network]}</dd>
      </div>
      {ex.fiatAmount ? (
        <div>
          <dt className="xs muted">Importe en euros</dt>
          <dd className="mono" style={{ margin: 0 }}>
            {ex.fiatAmount} €{ex.agreedRate ? ` (a ${ex.agreedRate})` : ''}
          </dd>
        </div>
      ) : null}
      <div style={{ gridColumn: '1 / -1' }}>
        <dt className="xs muted">Wallet{ex.wallet.label ? ` · ${ex.wallet.label}` : ''}</dt>
        <dd className="row" style={{ margin: 0, gap: 8 }}>
          {staff ? (
            <a className="mono small" href={`${EXPLORER_ADDRESS_URL[ex.network]}${ex.wallet.address}`} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
              {ex.wallet.address}
            </a>
          ) : (
            <span className="mono small" style={{ wordBreak: 'break-all' }}>
              {ex.wallet.address}
            </span>
          )}
          {staff ? <WalletRiskBadge status={ex.wallet.riskStatus} score={ex.wallet.riskScore} /> : null}
        </dd>
      </div>
      {ex.txHash ? (
        <div style={{ gridColumn: '1 / -1' }}>
          <dt className="xs muted">Transacción</dt>
          <dd style={{ margin: 0 }}>
            <a className="mono small" href={`${EXPLORER_TX_URL[ex.network]}${ex.txHash}`} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
              {ex.txHash}
            </a>
          </dd>
        </div>
      ) : null}
      {staff && ex.internalNote ? (
        <div style={{ gridColumn: '1 / -1' }}>
          <dt className="xs muted">Nota interna</dt>
          <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }} className="small">
            {ex.internalNote}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

const CHECK_ICON: Record<ScreeningCheckDto['result'], [string, string]> = {
  pass: ['✓', 'var(--mint)'],
  warn: ['!', 'var(--amber)'],
  fail: ['✕', 'var(--coral)'],
  error: ['?', 'var(--sky)'],
  skip: ['–', 'var(--fog)'],
};

/** Lista de comprobaciones de una auditoría de wallet. */
export function ScreeningChecks({ screening }: { screening: WalletScreeningDto }) {
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '6px' } as CSSProperties}>
      {screening.checks.map((c, i) => {
        const [icon, color] = CHECK_ICON[c.result];
        return (
          <li key={`${c.code}-${i}`} className="row" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'nowrap' }}>
            <span
              aria-label={c.result}
              style={{ width: 22, height: 22, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center', fontWeight: 700, color, border: `1px solid ${color}` }}
            >
              {icon}
            </span>
            <div className="grow">
              <div className="small" style={{ fontWeight: 600 }}>
                {c.label}
              </div>
              <div className="xs muted">{c.detail}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ScreeningHeader({ screening }: { screening: WalletScreeningDto }) {
  return (
    <div className="row between">
      <div className="row" style={{ gap: 8 }}>
        <WalletRiskBadge status={screening.status} score={screening.riskScore} />
        {screening.reviewDecision ? (
          <span className="xs muted">
            Revisada por {screening.reviewedBy?.name ?? '—'}: {WALLET_RISK_LABEL[screening.reviewDecision]}
          </span>
        ) : null}
      </div>
      <span className="xs muted">{new Date(screening.createdAt).toLocaleString('es-ES')}</span>
    </div>
  );
}
