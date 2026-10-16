'use client';

import type React from 'react';
import { BookingDto, errorMessage, todayIn } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { QrPass, SlotPicker, StatusTracker } from '@/components/booking';
import { ExchangeSummary, NetworkGuideBox, ReceiptButton } from '@/components/exchange';
import { Alert, Button, ErrorBox, Modal, Spinner, TextInput, useToast } from '@/components/ui';
import { api, authFetch } from '@/lib/api';

function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'none' | 'reschedule' | 'cancel'>('none');
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  // Mientras la solicitud está pendiente, se consulta cada 20 s: el QR aparece en cuanto se aprueba.
  const q = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get<BookingDto>(`/me/bookings/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 20_000 : false),
  });
  const b = q.data;

  const done = (msg: string) => (nb: BookingDto) => {
    qc.setQueryData(['booking', id], nb);
    qc.invalidateQueries({ queryKey: ['booking', id, 'qr'] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    setMode('none');
    setStartsAt(null);
    toast(msg);
  };
  const reschedule = useMutation({
    mutationFn: () => api.post<BookingDto>(`/me/bookings/${id}/reschedule`, { startsAt }),
    onSuccess: (nb) => done(nb.status === 'PENDING' ? 'Cita cambiada. La revisaremos de nuevo antes de enviarte el QR.' : 'Cita cambiada. Tu QR se ha actualizado.')(nb),
  });
  const cancel = useMutation({
    mutationFn: () => api.post<BookingDto>(`/me/bookings/${id}/cancel`, { reason: reason || undefined }),
    onSuccess: done('Cita cancelada'),
  });

  async function downloadIcs() {
    const r = await authFetch(`/me/bookings/${id}/calendar.ics`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = `cita-${b?.reference}.ics`;
    a.click();
  }

  if (q.isLoading) return <Spinner />;
  if (!b) return <div className="page narrow"><ErrorBox error={q.error} /></div>;

  return (
    <div className="page narrow stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <Link href="/app/reservas" className="btn ghost sm" style={{ paddingLeft: 0, alignSelf: 'flex-start' }}>
        Mis citas
      </Link>
      {params.get('nueva') ? (
        <Alert kind="ok">
          {b.status === 'PENDING'
            ? 'Solicitud enviada. Te avisaremos en cuanto la revisemos.'
            : b.autoApproved
              ? 'Solicitud aprobada al momento: ya tienes tu QR. Te hemos enviado los detalles por email.'
              : 'Reserva confirmada. Te hemos enviado los detalles por email.'}
        </Alert>
      ) : null}
      {b.status === 'REJECTED' ? <Alert kind="error">No hemos podido aprobar esta solicitud. Motivo: {b.rejectReason}</Alert> : null}
      <QrPass booking={b} />
      <StatusTracker booking={b} />

      {b.exchange ? (
        <div className="card stack">
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Tu operación</h2>
          <ExchangeSummary ex={b.exchange} />
          {b.status === 'COMPLETED' ? <ReceiptButton path={`/me/bookings/${b.id}/receipt-link`} /> : null}
          {['PENDING', 'CONFIRMED'].includes(b.status) ? (
            <NetworkGuideBox network={b.exchange.network} asset={b.exchange.asset} direction={b.exchange.direction}>
              {b.exchange.direction === 'SELL_CRYPTO' ? (
                <p className="small" style={{ margin: '6px 0 0' }}>
                  Envía los fondos en la oficina, delante del empleado, desde esta misma wallet. No hagas envíos antes de la cita.
                </p>
              ) : null}
            </NetworkGuideBox>
          ) : null}
        </div>
      ) : null}

      <div className="card stack">
        <div className="small muted">Dirección</div>
        <div>
          {b.location.address}, {b.location.city}
        </div>
        <a
          className="small"
          href={`https://www.google.com/maps/dir/?api=1&destination=${b.location.latitude},${b.location.longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          Cómo llegar
        </a>
        {b.notes ? (
          <>
            <div className="small muted">Tus notas</div>
            <div>{b.notes}</div>
          </>
        ) : null}
      </div>

      {b.canReschedule || b.canCancel ? (
        <div className="row">
          <Button onClick={downloadIcs}>Añadir al calendario</Button>
          {b.canReschedule ? (
            <Button onClick={() => { setMode('reschedule'); setDate(todayIn(b.location.timezone)); }}>Cambiar fecha u hora</Button>
          ) : null}
          {b.canCancel ? (
            <Button variant="danger" onClick={() => setMode('cancel')}>
              Cancelar cita
            </Button>
          ) : null}
        </div>
      ) : ['CONFIRMED', 'PENDING'].includes(b.status) ? (
        <p className="small muted">Ya no se puede cambiar ni cancelar desde la app. Si no puedes venir, llama a la oficina.</p>
      ) : null}

      {mode === 'reschedule' && date ? (
        <section className="card big stack">
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Elige otra fecha</h2>
          <SlotPicker
            locationId={b.location.id}
            serviceId={b.service.id}
            timezone={b.location.timezone}
            date={date}
            onDate={(d) => { setDate(d); setStartsAt(null); }}
            value={startsAt}
            onChange={setStartsAt}
          />
          {b.service.kind === 'CRYPTO_EXCHANGE' && b.status === 'CONFIRMED' ? (
            <Alert kind="info">Al cambiar la fecha, la solicitud vuelve a revisión y el QR se activará de nuevo al aprobarla.</Alert>
          ) : null}
          {reschedule.error ? <Alert kind="error">{errorMessage(reschedule.error)}</Alert> : null}
          <div className="row">
            <Button variant="primary" disabled={!startsAt} loading={reschedule.isPending} onClick={() => reschedule.mutate()}>
              Guardar cambio
            </Button>
            <Button variant="ghost" onClick={() => setMode('none')}>
              Volver
            </Button>
          </div>
        </section>
      ) : null}

      <Modal
        open={mode === 'cancel'}
        onClose={() => setMode('none')}
        title="Cancelar la cita"
        footer={
          <>
            <Button onClick={() => setMode('none')}>Mantener cita</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancelar cita
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small">Liberaremos la hora para otra persona y tu QR dejará de ser válido.</p>
          <TextInput label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          {cancel.error ? <Alert kind="error">{errorMessage(cancel.error)}</Alert> : null}
        </div>
      </Modal>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense>
      <BookingDetail />
    </Suspense>
  );
}
