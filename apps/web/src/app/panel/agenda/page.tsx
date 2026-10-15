'use client';

import { BookingDto, BookingStatus, BOOKING_STATUS_LABEL, todayIn } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useStaffLocation } from '@/components/shells';
import { AgendaTable } from '@/components/staff';
import { Empty, ErrorBox, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export default function Agenda() {
  const { location } = useStaffLocation();
  const [date, setDate] = useState<string>(() => todayIn('Europe/Madrid'));
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [q, setQ] = useState('');
  const list = useQuery({
    queryKey: ['staff', 'agenda', location?.id, date, status, q],
    queryFn: () => api.get<BookingDto[]>('/staff/bookings', { query: { locationId: location!.id, date, status, q } }),
    enabled: !!location,
    refetchInterval: 30_000,
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Citas</h1>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <input type="date" className="input" style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día" />
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(BOOKING_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Referencia o apellido" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      </div>
      {list.isLoading ? <Spinner /> : <ErrorBox error={list.error} />}
      {list.data ? list.data.length ? <AgendaTable bookings={list.data} /> : <Empty title="No hay citas con estos filtros" /> : null}
    </div>
  );
}
