'use client';

import type React from 'react';
import { BookingDto, BookingEventDto, BOOKING_STATUS_LABEL, CHANNEL_LABEL, BOOKING_TRANSITIONS, errorMessage, formatDateLong, formatTime, fullName, todayIn } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { SlotPicker } from './booking';
import { ExchangeSummary } from './exchange';
import { OpenScanViewer, TxCheckPanel } from './openscan';
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
            {formatDateLong(b.startsAt, tz)}, {formatTime(b.startsAt, tz)} · {b.location.name} · <span style={{ textTransform: 'none' }}>solicitada desde {CHANNEL_LABEL[b.channel]}</span>
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {b.autoApproved ? <span className="badge info">Aprobada automáticamente</span> : null}
          <StatusBadge status={b.status} />
        </div>
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

          {b.exchange ? (
            <section className="card stack">
              <div className="row between">
                <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Operación de cambio</h2>
                {apiBase === '/admin' ? (
                  <Link className="small" href={`/admin/wallets/${b.exchange.wallet.id}`}>
                    Auditoría de la wallet
                  </Link>
                ) : null}
              </div>
              <ExchangeSummary ex={b.exchange} staff />
              <OpenScanViewer network={b.exchange.network} kind="address" value={b.exchange.wallet.address} />
              {['CHECKED_IN', 'IN_SERVICE', 'COMPLETED'].includes(b.status) ? <SettlementForm booking={b} /> : null}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <TxCheckPanel booking={b} />
              </div>
            </section>
          ) : null}

          {b.status === 'PENDING' ? (
            <Alert kind="warn">
              Pendiente de aprobación.{' '}
              {apiBase === '/admin' ? <Link href="/admin/solicitudes">Revisarla en Solicitudes</Link> : 'Un responsable debe aprobarla antes de la visita.'}
            </Alert>
          ) : null}
          {b.status === 'REJECTED' ? <Alert kind="error">Rechazada: {b.rejectReason}</Alert> : null}

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


/** Liquidación en oficina: tipo aplicado, euros entregados/recibidos y hash de la transacción. */
function SettlementForm({ booking }: { booking: BookingDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const ex = booking.exchange!;
  const [f, setF] = useState({ agreedRate: ex.agreedRate ?? '', fiatAmount: ex.fiatAmount ?? '', feeAmount: ex.feeAmount ?? '', txHash: ex.txHash ?? '' });
  const m = useMutation({
    mutationFn: () =>
      api.post<BookingDto>(`/staff/bookings/${booking.id}/exchange`, {
        agreedRate: f.agreedRate || undefined,
        fiatAmount: f.fiatAmount || undefined,
        feeAmount: f.feeAmount || undefined,
        txHash: f.txHash || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(f.txHash && f.txHash !== ex.txHash ? 'Liquidación guardada. Transacción comprobada en la red.' : 'Datos de la operación guardados');
    },
  });
  return (
    <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <strong className="small">Liquidación</strong>
      <div className="grid" style={{ '--min': '140px' } as React.CSSProperties}>
        <TextInput label="Tipo aplicado (EUR)" inputMode="decimal" value={f.agreedRate} onChange={(e) => setF({ ...f, agreedRate: e.target.value })} />
        <TextInput label="Euros" inputMode="decimal" value={f.fiatAmount} onChange={(e) => setF({ ...f, fiatAmount: e.target.value })} />
        <TextInput label="Comisión (EUR)" inputMode="decimal" value={f.feeAmount} onChange={(e) => setF({ ...f, feeAmount: e.target.value })} />
      </div>
      <TextInput
        label="Hash de la transacción"
        className="input mono"
        value={f.txHash}
        onChange={(e) => setF({ ...f, txHash: e.target.value.trim() })}
        placeholder={ex.network === 'TRON' ? '64 caracteres hexadecimales' : '0x…'}
        hint={`${ex.direction === 'SELL_CRYPTO' ? 'Envío del cliente a la wallet de Valorize.' : 'Envío de Valorize a la wallet del cliente.'} Al guardarlo se comprueba en la blockchain.`}
      />
      {m.error ? <Alert kind="error">{errorMessage(m.error)}</Alert> : null}
      <div>
        <Button onClick={() => m.mutate()} loading={m.isPending}>
          Guardar liquidación
        </Button>
      </div>
    </div>
  );
}
