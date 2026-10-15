'use client';

import type React from 'react';
import { BookingDto, BookingEventDto, BOOKING_STATUS_LABEL, BOOKING_TRANSITIONS, errorMessage, formatDateLong, formatTime, fullName, todayIn } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { SlotPicker } from './booking';
import { useTransition } from './staff';
import { Alert, Button, ErrorBox, KycBadge, Modal, Spinner, StatusBadge, TextInput, useToast } from './ui';
import { api } from '@/lib/api';

export function BookingAdminView({ id, basePath, apiBase }: { id: string; basePath: string; apiBase: '/staff' | '/admin' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['staff', 'booking', id],
    queryFn: () => api.get<{ booking: BookingDto; events: BookingEventDto[] }>(`${apiBase}/bookings/${id}`),
  });
  const transition = useTransition(apiBase);
  const [confirm, setConfirm] = useState<'NO_SHOW' | 'CANCELLED' | null>(null);
  const [note, setNote] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);

  const reschedule = useMutation({
    mutationFn: () => api.post<BookingDto>(`${apiBase}/bookings/${id}/reschedule`, { startsAt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setRescheduling(false);
      toast('Cita reprogramada. Hemos avisado al cliente.');
    },
  });

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <div className="page"><ErrorBox error={q.error} /></div>;
  const { booking: b, events } = q.data;
  const allowed = BOOKING_TRANSITIONS[b.status];
  const tz = b.location.timezone;

  return (
    <div className="page">
      <Link href={basePath} className="btn ghost sm" style={{ paddingLeft: 0 }}>
        Volver
      </Link>
      <div className="page-head">
        <div>
          <h1 className="mono">{b.reference}</h1>
          <p className="muted" style={{ textTransform: 'capitalize' }}>
            {formatDateLong(b.startsAt, tz)}, {formatTime(b.startsAt, tz)} · {b.location.name}
          </p>
        </div>
        <StatusBadge status={b.status} />
      </div>

      <div className="grid" style={{ '--min': '300px', alignItems: 'start' } as React.CSSProperties}>
        <div className="stack">
          <section className="card stack">
            <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Cliente</h2>
            {b.customer ? (
              <>
                <div className="row between">
                  <strong>{fullName(b.customer)}</strong>
                  <KycBadge status={b.customer.kycStatus} />
                </div>
                <div className="small muted">
                  {b.customer.email}
                  {b.customer.phone ? ` · ${b.customer.phone}` : ''}
                </div>
                {apiBase === '/admin' ? (
                  <Link className="small" href={`/admin/clientes/${b.customer.id}`}>
                    Ver ficha del cliente
                  </Link>
                ) : null}
              </>
            ) : null}
            <hr className="divider" />
            <div className="small muted">Gestión</div>
            <div>
              {b.service.name} ({b.service.durationMin} min)
            </div>
            {b.notes ? (
              <>
                <div className="small muted">Notas del cliente</div>
                <div>{b.notes}</div>
              </>
            ) : null}
          </section>

          <section className="card stack">
            <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Acciones</h2>
            <div className="row">
              {allowed.includes('CHECKED_IN') ? (
                <Button variant="primary" loading={transition.isPending} onClick={() => transition.mutate({ id, status: 'CHECKED_IN' })}>
                  Hacer check-in
                </Button>
              ) : null}
              {allowed.includes('IN_SERVICE') ? (
                <Button variant="primary" loading={transition.isPending} onClick={() => transition.mutate({ id, status: 'IN_SERVICE' })}>
                  Empezar atención
                </Button>
              ) : null}
              {allowed.includes('COMPLETED') ? (
                <Button variant={allowed.includes('IN_SERVICE') ? 'default' : 'primary'} loading={transition.isPending} onClick={() => transition.mutate({ id, status: 'COMPLETED' })}>
                  Finalizar
                </Button>
              ) : null}
              {['PENDING', 'CONFIRMED'].includes(b.status) ? (
                <Button onClick={() => { setRescheduling(true); setDate(todayIn(tz)); }}>Reprogramar</Button>
              ) : null}
              {allowed.includes('NO_SHOW') ? <Button onClick={() => setConfirm('NO_SHOW')}>No presentado</Button> : null}
              {allowed.includes('CANCELLED') ? (
                <Button variant="danger" onClick={() => setConfirm('CANCELLED')}>
                  Cancelar
                </Button>
              ) : null}
            </div>
            {!allowed.length ? <p className="small muted" style={{ margin: 0 }}>Esta cita está cerrada.</p> : null}
          </section>

          {rescheduling && date ? (
            <section className="card stack">
              <SlotPicker
                locationId={b.location.id}
                serviceId={b.service.id}
                timezone={tz}
                date={date}
                onDate={(d) => { setDate(d); setStartsAt(null); }}
                value={startsAt}
                onChange={setStartsAt}
              />
              {reschedule.error ? <Alert kind="error">{errorMessage(reschedule.error)}</Alert> : null}
              <div className="row">
                <Button variant="primary" disabled={!startsAt} loading={reschedule.isPending} onClick={() => reschedule.mutate()}>
                  Guardar
                </Button>
                <Button variant="ghost" onClick={() => setRescheduling(false)}>
                  Volver
                </Button>
              </div>
            </section>
          ) : null}
        </div>

        <section className="card">
          <h2 style={{ fontSize: 'var(--t-lg)' }}>Historial</h2>
          <ol className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <div style={{ fontWeight: 600 }}>
                  {e.fromStatus && e.fromStatus !== e.toStatus ? `${BOOKING_STATUS_LABEL[e.fromStatus]} → ` : ''}
                  {BOOKING_STATUS_LABEL[e.toStatus]}
                </div>
                <div className="xs muted">
                  {new Date(e.createdAt).toLocaleString('es-ES', { timeZone: tz })} · {e.actor ? e.actor.name : 'Sistema'}
                </div>
                {e.note ? <div className="small">{e.note}</div> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'NO_SHOW' ? 'Marcar como no presentado' : 'Cancelar la cita'}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Volver</Button>
            <Button
              variant="danger"
              loading={transition.isPending}
              onClick={() =>
                transition.mutate(
                  { id, status: confirm!, note: note || undefined },
                  { onSuccess: () => { setConfirm(null); setNote(''); } },
                )
              }
            >
              {confirm === 'NO_SHOW' ? 'Marcar no presentado' : 'Cancelar cita'}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small">Avisaremos al cliente por notificación{confirm === 'CANCELLED' ? ' y email' : ''}.</p>
          <TextInput label="Motivo" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </div>
      </Modal>
    </div>
  );
}

