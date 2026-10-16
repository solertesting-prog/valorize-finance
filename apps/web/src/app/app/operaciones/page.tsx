'use client';

import type React from 'react';
import { DIRECTION_SHORT, formatDate, formatEur, formatNum, MyExchangesDto, NETWORK_LABEL } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ReceiptButton } from '@/components/exchange';
import { Empty, ErrorBox, Pager, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';

/** Historial de operaciones de cambio del cliente, con totales del año y justificantes. */
export default function MyOperations() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['me', 'exchanges', page],
    queryFn: () => api.get<MyExchangesDto>('/me/exchanges', { query: { page, pageSize: 20 } }),
  });
  const t = q.data?.totals;

  return (
    <div className="page narrow stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Mis operaciones</h1>
        <Link href="/app/reservar" className="btn primary sm">
          Nuevo cambio
        </Link>
      </div>

      {t ? (
        <div className="grid" style={{ '--min': '150px' } as React.CSSProperties}>
          <Stat label={`Operaciones en ${t.year}`} value={String(t.completed)} />
          <Stat label="Euros recibidos (ventas)" value={formatEur(t.soldEur)} />
          <Stat label="Euros pagados (compras)" value={formatEur(t.boughtEur)} />
        </div>
      ) : null}

      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? (
        <Empty title="Aún no has hecho ninguna operación" action={<Link href="/app/reservar" className="btn primary">Solicitar un cambio</Link>} />
      ) : null}

      <div className="stack">
        {q.data?.items.map((b) => {
          const ex = b.exchange!;
          const eur = ex.fiatAmount ?? ex.quotedFiatAmount;
          return (
            <article key={b.id} className="card stack" style={{ '--gap': '10px' } as React.CSSProperties}>
              <div className="row between">
                <Link href={`/app/reservas/${b.id}`} className="mono" style={{ fontWeight: 700 }}>
                  {b.reference}
                </Link>
                <StatusBadge status={b.status} />
              </div>
              <div className="row between" style={{ alignItems: 'flex-end' }}>
                <div>
                  <div className="mono" style={{ fontSize: 'var(--t-lg)', fontWeight: 700 }}>
                    {DIRECTION_SHORT[ex.direction]} {formatNum(ex.amount)} {ex.asset}
                  </div>
                  <div className="small muted" style={{ textTransform: 'capitalize' }}>
                    {formatDate(b.startsAt, b.location.timezone)} · {NETWORK_LABEL[ex.network]} · {b.location.name}
                  </div>
                </div>
                {eur ? (
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontWeight: 700 }}>{formatEur(eur)}</div>
                    <div className="xs muted">{ex.fiatAmount ? (ex.direction === 'SELL_CRYPTO' ? 'recibidos' : 'pagados') : 'estimación'}</div>
                  </div>
                ) : null}
              </div>
              {b.status === 'COMPLETED' ? <ReceiptButton path={`/me/bookings/${b.id}/receipt-link`} size="sm" /> : null}
            </article>
          );
        })}
      </div>
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="xs muted">{label}</div>
      <div className="mono" style={{ fontSize: 'var(--t-lg)', fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}
