'use client';

import { BookingDto, bookingSteps, formatDate, formatTime, Paginated } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorBox, Pager, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';

export default function MyBookings() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['bookings', scope, page],
    queryFn: () => api.get<Paginated<BookingDto>>('/me/bookings', { query: { scope, page, pageSize: 10 } }),
  });

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Mis citas</h1>
        <Link href="/app/reservar" className="btn primary">
          Nueva reserva
        </Link>
      </div>
      <div className="row" role="tablist" style={{ marginBottom: 16 }}>
        {(['upcoming', 'past'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            className={`btn sm ${scope === s ? 'primary' : ''}`}
            onClick={() => { setScope(s); setPage(1); }}
          >
            {s === 'upcoming' ? 'Próximas' : 'Historial'}
          </button>
        ))}
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? (
        <Empty
          title={scope === 'upcoming' ? 'No tienes citas pendientes' : 'Aún no tienes historial'}
          action={scope === 'upcoming' ? <Link href="/app/reservar" className="btn primary">Reservar una visita</Link> : undefined}
        />
      ) : null}
      <div className="stack">
        {q.data?.items.map((b) => (
          <Link key={b.id} href={`/app/reservas/${b.id}`} className="card card-link row between">
            <div className="row" style={{ gap: 16 }}>
              <div className="mono" style={{ fontSize: 'var(--t-xl)', fontWeight: 700, minWidth: 70 }}>
                {formatTime(b.startsAt, b.location.timezone)}
              </div>
              <div>
                <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{formatDate(b.startsAt, b.location.timezone)}</div>
                <div className="small muted">
                  {b.service.name} · {b.location.name}
                </div>
                {(() => {
                  // Paso en curso del seguimiento, para ver de un vistazo en qué punto está cada solicitud.
                  const step = bookingSteps(b).find((s) => s.state === 'current' || s.state === 'failed');
                  return step && b.status !== 'CONFIRMED' ? (
                    <div className="xs" style={{ color: step.state === 'failed' ? 'var(--coral)' : 'var(--amber)', marginTop: 2 }}>
                      {step.label}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
            <StatusBadge status={b.status} />
          </Link>
        ))}
      </div>
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} /> : null}
    </div>
  );
}
