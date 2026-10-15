'use client';

import { BookingDto, BookingStatus, BOOKING_STATUS_LABEL, formatDate, formatTime, LocationDto, Paginated } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorBox, Pager, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';

export default function AdminBookings() {
  const [f, setF] = useState({ q: '', status: '' as BookingStatus | '', locationId: '', from: '', to: '', page: 1 });
  const locs = useQuery({ queryKey: ['admin', 'locations'], queryFn: () => api.get<LocationDto[]>('/admin/locations') });
  const q = useQuery({
    queryKey: ['admin', 'bookings', f],
    queryFn: () => api.get<Paginated<BookingDto>>('/admin/bookings', { query: { ...f, pageSize: 25, scope: 'all' } }),
  });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v, page: 1 });

  return (
    <div className="page">
      <div className="page-head"><h1>Citas</h1></div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 240 }} placeholder="Referencia, email o apellido" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar" />
        <select className="select" style={{ width: 'auto' }} value={f.locationId} onChange={(e) => set('locationId', e.target.value)} aria-label="Ubicación">
          <option value="">Todas las ubicaciones</option>
          {locs.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.status} onChange={(e) => set('status', e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(BOOKING_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" className="input" style={{ width: 'auto' }} value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="Desde" />
        <input type="date" className="input" style={{ width: 'auto' }} value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="Hasta" />
      </div>
      {q.isLoading ? <Spinner /> : <ErrorBox error={q.error} />}
      {q.data && !q.data.items.length ? <Empty title="No hay citas con estos filtros" /> : null}
      {q.data?.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Referencia</th><th>Fecha</th><th>Cliente</th><th>Ubicación</th><th>Gestión</th><th>Estado</th></tr></thead>
            <tbody>
              {q.data.items.map((b) => (
                <tr key={b.id}>
                  <td className="mono"><Link href={`/admin/citas/${b.id}`}>{b.reference}</Link></td>
                  <td style={{ textTransform: 'capitalize' }}>{formatDate(b.startsAt, b.location.timezone)} <span className="mono">{formatTime(b.startsAt, b.location.timezone)}</span></td>
                  <td>{b.customer ? <Link href={`/admin/clientes/${b.customer.id}`}>{b.customer.firstName} {b.customer.lastName}</Link> : null}</td>
                  <td>{b.location.name}</td>
                  <td>{b.service.name}</td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {q.data ? <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => setF({ ...f, page: p })} /> : null}
    </div>
  );
}
