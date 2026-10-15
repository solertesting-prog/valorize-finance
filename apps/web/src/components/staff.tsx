'use client';

import { BookingDto, BookingStatus, errorMessage, formatTime } from '@valorize/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, KycBadge, StatusBadge, useToast } from './ui';

/** Acción siguiente lógica para el mostrador según el estado de la cita. */
const NEXT: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  CONFIRMED: { to: 'CHECKED_IN', label: 'Hacer check-in' },
  PENDING: { to: 'CHECKED_IN', label: 'Hacer check-in' },
  CHECKED_IN: { to: 'IN_SERVICE', label: 'Empezar atención' },
  IN_SERVICE: { to: 'COMPLETED', label: 'Finalizar' },
};

export function useTransition(apiBase: '/staff' | '/admin' = '/staff') {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: BookingStatus; note?: string }) =>
      api.post<BookingDto>(`${apiBase}/bookings/${id}/transition`, { status, note }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`${b.reference}: ${labelFor(b.status)}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
}

function labelFor(s: BookingStatus) {
  return { CHECKED_IN: 'check-in hecho', IN_SERVICE: 'en atención', COMPLETED: 'atendida', NO_SHOW: 'no presentado', CANCELLED: 'cancelada' }[s as string] ?? s;
}

export function NextActionButton({ booking, size }: { booking: BookingDto; size?: 'sm' | 'lg' }) {
  const t = useTransition();
  const next = NEXT[booking.status];
  if (!next) return null;
  return (
    <Button variant="primary" size={size} loading={t.isPending} onClick={() => t.mutate({ id: booking.id, status: next.to })}>
      {next.label}
    </Button>
  );
}

export function AgendaTable({ bookings }: { bookings: BookingDto[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Referencia</th>
            <th>Cliente</th>
            <th>Gestión</th>
            <th>Identidad</th>
            <th>Estado</th>
            <th>
              <span className="sr-only">Acción</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td className="mono" style={{ fontWeight: 700 }}>
                {formatTime(b.startsAt, b.location.timezone)}
              </td>
              <td className="mono">
                <Link href={`/panel/citas/${b.id}`}>{b.reference}</Link>
              </td>
              <td>
                {b.customer?.firstName} {b.customer?.lastName}
              </td>
              <td>{b.service.name}</td>
              <td>{b.customer ? <KycBadge status={b.customer.kycStatus} /> : null}</td>
              <td>
                <StatusBadge status={b.status} />
              </td>
              <td style={{ textAlign: 'right' }}>
                <NextActionButton booking={b} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
