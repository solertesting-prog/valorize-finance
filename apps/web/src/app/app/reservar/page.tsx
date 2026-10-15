'use client';

import { ApiError, BookingDto, errorMessage, formatDateLong, formatTime, LocationDto, todayIn } from '@valorize/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { SlotPicker } from '@/components/booking';
import { Alert, Button, ErrorBox, Spinner, TextArea } from '@/components/ui';
import { api } from '@/lib/api';

function Wizard() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState<string | null>(params.get('location'));
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const locations = useQuery({ queryKey: ['locations', '', null], queryFn: () => api.get<LocationDto[]>('/locations') });
  const location = locations.data?.find((l) => l.id === locationId) ?? null;
  const service = location?.services.find((s) => s.id === serviceId) ?? null;

  const step = !location ? 1 : !service ? 2 : !startsAt ? 3 : 4;

  async function confirm() {
    if (!location || !service || !startsAt) return;
    setBusy(true);
    setError(null);
    try {
      const b = await api.post<BookingDto>('/me/bookings', { locationId: location.id, serviceId: service.id, startsAt, notes: notes || undefined });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      router.replace(`/app/reservas/${b.id}?nueva=1`);
    } catch (e) {
      setError({ message: errorMessage(e), code: e instanceof ApiError ? e.code : undefined });
      if (e instanceof ApiError && e.code === 'SLOT_FULL') {
        setStartsAt(null);
        qc.invalidateQueries({ queryKey: ['availability'] });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <h1>Nueva reserva</h1>
      <div className="steps" aria-label={`Paso ${step} de 4`}>
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className={s <= step ? 'done' : ''} />
        ))}
      </div>

      {locations.isLoading ? <Spinner /> : <ErrorBox error={locations.error} />}

      {step === 1 && locations.data ? (
        <section className="stack">
          <h2 style={{ fontSize: 'var(--t-lg)' }}>¿Dónde quieres ir?</h2>
          {locations.data.map((l) => (
            <button key={l.id} className="choice" onClick={() => setLocationId(l.id)}>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{l.name}</div>
                <div className="small muted">{l.address}</div>
              </div>
            </button>
          ))}
          <Link href="/app/ubicaciones" className="small">
            Ver en el mapa
          </Link>
        </section>
      ) : null}

      {step >= 2 && location ? (
        <Summary label="Ubicación" value={location.name} onChange={() => { setLocationId(null); setServiceId(null); setStartsAt(null); }} />
      ) : null}

      {step === 2 && location ? (
        <section className="stack">
          <h2 style={{ fontSize: 'var(--t-lg)' }}>¿Qué gestión vas a hacer?</h2>
          {location.services.map((s) => (
            <button key={s.id} className="choice" onClick={() => { setServiceId(s.id); setDate(todayIn(location.timezone)); }}>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div className="small muted">
                  {s.description ? `${s.description} ` : ''}Unos {s.durationMin} minutos.
                  {s.requiresKyc ? ' Requiere identidad verificada.' : ''}
                </div>
              </div>
            </button>
          ))}
        </section>
      ) : null}

      {step >= 3 && service ? (
        <Summary label="Gestión" value={service.name} onChange={() => { setServiceId(null); setStartsAt(null); }} />
      ) : null}

      {step === 3 && location && service && date ? (
        <section>
          <SlotPicker
            locationId={location.id}
            serviceId={service.id}
            timezone={location.timezone}
            date={date}
            onDate={(d) => { setDate(d); setStartsAt(null); }}
            value={startsAt}
            onChange={setStartsAt}
          />
        </section>
      ) : null}

      {step === 4 && location && service && startsAt ? (
        <section className="stack">
          <Summary
            label="Cuándo"
            value={`${formatDateLong(startsAt, location.timezone)}, ${formatTime(startsAt, location.timezone)}`}
            onChange={() => setStartsAt(null)}
          />
          <TextArea label="Algo que debamos saber (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          {error ? (
            <Alert kind="error">
              {error.message}{' '}
              {error.code === 'KYC_REQUIRED' || error.code === 'KYC_EXPIRED' ? <Link href="/app/perfil/verificacion">Verificar mi identidad</Link> : null}
              {error.code === 'EMAIL_NOT_VERIFIED' ? <Link href="/verificar">Verificar email</Link> : null}
            </Alert>
          ) : null}
          <Button variant="primary" size="lg" block loading={busy} onClick={confirm}>
            Confirmar reserva
          </Button>
          <p className="xs muted center" style={{ margin: 0 }}>
            Podrás cambiar o cancelar la cita desde Mis citas.
          </p>
        </section>
      ) : null}
      {step === 3 && error ? <Alert kind="error">{error.message}</Alert> : null}
    </div>
  );
}

function Summary({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <div className="row between card" style={{ padding: '12px 16px', marginBottom: 16 }}>
      <div>
        <div className="xs muted">{label}</div>
        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{value}</div>
      </div>
      <button className="btn ghost sm" onClick={onChange}>
        Cambiar
      </button>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
