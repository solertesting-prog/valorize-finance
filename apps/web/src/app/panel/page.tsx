'use client';

import type React from 'react';
import { DayDashboardDto } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useStaffLocation } from '@/components/shells';
import { AgendaTable } from '@/components/staff';
import { Empty, ErrorBox, Icon, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export default function StaffToday() {
  const { location, locations } = useStaffLocation();
  const q = useQuery({
    queryKey: ['staff', 'dashboard', location?.id],
    queryFn: () => api.get<DayDashboardDto>('/staff/dashboard', { query: { locationId: location!.id } }),
    enabled: !!location,
    refetchInterval: 20_000,
  });

  if (!locations.length && !location) {
    return (
      <div className="page">
        <Empty title="No tienes ubicaciones asignadas">Pide a un responsable que te asigne a una oficina.</Empty>
      </div>
    );
  }
  if (!q.data) return q.error ? <div className="page"><ErrorBox error={q.error} /></div> : <Spinner />;
  const d = q.data;
  const dateLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T12:00:00Z`));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>Hoy</p>
          <h1 className="mono" style={{ textTransform: 'uppercase' }}>
            {dateLabel} · {d.location.name}
          </h1>
        </div>
        <Link href="/panel/escanear" className="btn primary lg">
          <Icon name="scan" /> Escanear QR
        </Link>
      </div>

      <div className="grid" style={{ '--min': '150px', marginBottom: 28 } as React.CSSProperties}>
        <div className="stat"><div className="n">{d.totals.bookings}</div><div className="l">Citas</div></div>
        <div className="stat accent"><div className="n">{d.totals.attended}</div><div className="l">Atendidos</div></div>
        <div className="stat"><div className="n">{d.totals.inService}</div><div className="l">En oficina ahora</div></div>
        <div className="stat warn"><div className="n">{d.totals.pending}</div><div className="l">Pendientes</div></div>
        <div className="stat"><div className="n">{d.totals.noShow}</div><div className="l">No presentados</div></div>
      </div>

      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Próximas reservas</h2>
        <Link href="/panel/agenda" className="small">Ver la agenda completa</Link>
      </div>
      {d.upcoming.length ? <AgendaTable bookings={d.upcoming} /> : <Empty title="No quedan citas para hoy" />}
    </div>
  );
}
