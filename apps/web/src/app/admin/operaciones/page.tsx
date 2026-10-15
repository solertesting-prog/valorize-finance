'use client';

import type React from 'react';
import {
  BookingChannel,
  BookingDto,
  BookingStatus,
  BOOKING_STATUS_LABEL,
  ChainNetwork,
  CHANNEL_LABEL,
  DIRECTION_SHORT,
  formatTime,
  fullName,
  NETWORK_LABEL,
  Paginated,
  TX_CHECK_LABEL,
  TxCheckStatus,
  WALLET_RISK_LABEL,
  WalletRiskStatus,
} from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { ExchangeSummary, shortAddress, WalletRiskBadge } from '@/components/exchange';
import { ExplorerButtons, OpenScanViewer, TxCheckBadge, TxCheckPanel } from '@/components/openscan';
import { Empty, ErrorBox, Pager, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';

interface Filters {
  q: string;
  status: BookingStatus | '';
  network: ChainNetwork | '';
  riskStatus: WalletRiskStatus | '';
  txStatus: TxCheckStatus | 'NONE' | '';
  channel: BookingChannel | '';
  page: number;
}

/** Todas las operaciones de cambio con wallet (web y app): auditoría de la wallet y verificación de la transacción con OpenScan. */
export default function Operations() {
  const [f, setF] = useState<Filters>({ q: '', status: '', network: '', riskStatus: '', txStatus: '', channel: '', page: 1 });
  const [open, setOpen] = useState<string | null>(null);
  const set = (p: Partial<Filters>) => setF({ ...f, ...p, page: p.page ?? 1 });
  const query = Object.fromEntries(Object.entries({ ...f, pageSize: 25 }).filter(([, v]) => v !== ''));
  const q = useQuery({
    queryKey: ['admin', 'exchanges', f],
    queryFn: () => api.get<Paginated<BookingDto>>('/admin/exchanges', { query }),
    refetchInterval: 60_000,
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Operaciones</h1>
          <p className="muted">Cada petición con wallet, de la web y de la app: auditoría de la wallet y comprobación de la transacción en la blockchain y OpenScan.</p>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Referencia, cliente, wallet o hash"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          aria-label="Buscar"
        />
        <Select label="Transacción" value={f.txStatus} onChange={(v) => set({ txStatus: v as Filters['txStatus'] })} options={{ NONE: 'Sin transacción / sin verificar', ...TX_CHECK_LABEL }} />
        <Select label="Wallet" value={f.riskStatus} onChange={(v) => set({ riskStatus: v as WalletRiskStatus })} options={WALLET_RISK_LABEL} />
        <Select label="Red" value={f.network} onChange={(v) => set({ network: v as ChainNetwork })} options={NETWORK_LABEL} />
        <Select label="Estado" value={f.status} onChange={(v) => set({ status: v as BookingStatus })} options={BOOKING_STATUS_LABEL} />
        <Select label="Canal" value={f.channel} onChange={(v) => set({ channel: v as BookingChannel })} options={CHANNEL_LABEL} />
      </div>

      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="No hay operaciones con estos filtros" /> : null}
      {q.data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Cita</th>
                <th>Cliente</th>
                <th>Operación</th>
                <th>Wallet</th>
                <th>Transacción</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((b) => {
                const ex = b.exchange!;
                const expanded = open === b.id;
                return (
                  <Fragment key={b.id}>
                    <tr>
                      <td>
                        <Link href={`/admin/citas/${b.id}`} className="mono">
                          {b.reference}
                        </Link>
                        <div className="xs muted">{CHANNEL_LABEL[b.channel]}</div>
                      </td>
                      <td>
                        <div className="small">
                          {new Date(b.startsAt).toLocaleDateString('es-ES')} <span className="mono">{formatTime(b.startsAt, b.location.timezone)}</span>
                        </div>
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="small">{b.customer ? <Link href={`/admin/clientes/${b.customer.id}`}>{fullName(b.customer)}</Link> : '—'}</td>
                      <td>
                        <div className="mono small" style={{ fontWeight: 700 }}>
                          {ex.amount} {ex.asset}
                        </div>
                        <div className="xs muted">
                          {DIRECTION_SHORT[ex.direction]} · {NETWORK_LABEL[ex.network]}
                        </div>
                      </td>
                      <td>
                        <div className="mono small">{shortAddress(ex.wallet.address)}</div>
                        <Link href={`/admin/wallets/${ex.wallet.id}`}>
                          <WalletRiskBadge status={ex.wallet.riskStatus} score={ex.wallet.riskScore} />
                        </Link>
                      </td>
                      <td>
                        {ex.txHash ? (
                          <>
                            <div className="mono small">{shortAddress(ex.txHash)}</div>
                            <TxCheckBadge status={ex.txCheck?.status} />
                          </>
                        ) : (
                          <span className="xs muted">Sin registrar</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className={`btn sm ${expanded ? 'primary' : ''}`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.id)}>
                          {expanded ? 'Cerrar' : 'Revisar'}
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--slate)' }}>
                          <Review booking={b} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} /> : null}
    </div>
  );
}

function Review({ booking: b }: { booking: BookingDto }) {
  const ex = b.exchange!;
  return (
    <div className="stack" style={{ padding: '8px 4px', '--gap': '16px' } as React.CSSProperties}>
      <div className="grid" style={{ '--min': '320px', alignItems: 'start' } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
          <strong className="small">Solicitud</strong>
          <ExchangeSummary ex={ex} staff />
          <div className="row" style={{ gap: 6 }}>
            <span className="xs muted">Wallet:</span>
            <ExplorerButtons network={ex.network} kind="address" value={ex.wallet.address} />
          </div>
        </div>
        <div>
          <TxCheckPanel booking={b} />
        </div>
      </div>
      <OpenScanViewer network={ex.network} kind="address" value={ex.wallet.address} title="Actividad de la wallet en OpenScan" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <select className="select" style={{ width: 'auto' }} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: todas</option>
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}
