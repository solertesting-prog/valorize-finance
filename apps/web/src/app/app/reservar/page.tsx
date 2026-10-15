'use client';

import { ApiError, BookingDto, DIRECTION_SHORT, errorMessage, formatDateLong, formatTime, LocationDto, NETWORK_LABEL, todayIn } from '@valorize/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { SlotPicker } from '@/components/booking';
import { emptyExchange, ExchangeDraft, exchangeError, ExchangeForm, exchangePayload, shortAddress, useExchangeSettings } from '@/components/exchange';
import { Alert, Button, ErrorBox, Spinner, TextArea } from '@/components/ui';
import { api } from '@/lib/api';

type Step = 'location' | 'service' | 'exchange' | 'slot' | 'confirm';

function Wizard() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const settings = useExchangeSettings();
  const [locationId, setLocationId] = useState<string | null>(params.get('location'));
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [exchange, setExchange] = useState<ExchangeDraft | null>(null);
  const [exchangeDone, setExchangeDone] = useState(false);
  const [exchangeMsg, setExchangeMsg] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const locations = useQuery({ queryKey: ['locations', '', null], queryFn: () => api.get<LocationDto[]>('/locations') });
  const location = locations.data?.find((l) => l.id === locationId) ?? null;
  const service = location?.services.find((s) => s.id === serviceId) ?? null;
  const isExchange = service?.kind === 'CRYPTO_EXCHANGE';

  const steps: Step[] = isExchange ? ['location', 'service', 'exchange', 'slot', 'confirm'] : ['location', 'service', 'slot', 'confirm'];
  const step: Step = !location ? 'location' : !service ? 'service' : isExchange && !exchangeDone ? 'exchange' : !startsAt ? 'slot' : 'confirm';
  const stepIndex = steps.indexOf(step);

  function pickService(id: string) {
    const s = location?.services.find((x) => x.id === id);
    setServiceId(id);
    setDate(todayIn(location!.timezone));
    if (s?.kind === 'CRYPTO_EXCHANGE') {
      setExchange((e) => e ?? emptyExchange(settings.data));
      setExchangeDone(false);
    }
  }

  async function confirm() {
    if (!location || !service || !startsAt) return;
    setBusy(true);
    setError(null);
    try {
      const b = await api.post<BookingDto>('/me/bookings', {
        locationId: location.id,
        serviceId: service.id,
        startsAt,
        notes: notes || undefined,
        exchange: isExchange && exchange ? exchangePayload(exchange) : undefined,
      });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['me', 'wallets'] });
      router.replace(`/app/reservas/${b.id}?nueva=1`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError({ message: errorMessage(e), code });
      if (code === 'SLOT_FULL') {
        setStartsAt(null);
        qc.invalidateQueries({ queryKey: ['availability'] });
      }
      if (code && ['WALLET_NOT_ACCEPTED', 'INVALID_ADDRESS', 'WALLET_NETWORK_MISMATCH', 'AMOUNT_TOO_LOW', 'AMOUNT_TOO_HIGH'].includes(code)) {
        setExchangeDone(false);
        setExchangeMsg(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <h1>{isExchange ? 'Solicitar un cambio' : 'Nueva reserva'}</h1>
      <div className="steps" aria-label={`Paso ${stepIndex + 1} de ${steps.length}`}>
        {steps.map((s, i) => (
          <span key={s} className={i <= stepIndex ? 'done' : ''} />
        ))}
      </div>

      {locations.isLoading ? <Spinner /> : <ErrorBox error={locations.error} />}

      {step === 'location' && locations.data ? (
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

      {location && step !== 'location' ? (
        <Summary label="Ubicación" value={location.name} onChange={() => { setLocationId(null); setServiceId(null); setStartsAt(null); }} />
      ) : null}

      {step === 'service' && location ? (
        <section className="stack">
          <h2 style={{ fontSize: 'var(--t-lg)' }}>¿Qué gestión vas a hacer?</h2>
          {location.services.map((s) => (
            <button key={s.id} className="choice" onClick={() => pickService(s.id)}>
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

      {service && step !== 'service' && step !== 'location' ? (
        <Summary label="Gestión" value={service.name} onChange={() => { setServiceId(null); setStartsAt(null); }} />
      ) : null}

      {step === 'exchange' && exchange ? (
        <section className="stack">
          <h2 style={{ fontSize: 'var(--t-lg)' }}>Tu operación</h2>
          <ExchangeForm value={exchange} onChange={(d) => { setExchange(d); setExchangeMsg(null); }} />
          {exchangeMsg ? <Alert kind="error">{exchangeMsg}</Alert> : null}
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              const err = exchangeError(exchange, settings.data);
              if (err) return setExchangeMsg(err);
              setExchangeDone(true);
            }}
          >
            Elegir día y hora
          </Button>
        </section>
      ) : null}

      {isExchange && exchange && exchangeDone ? (
        <Summary
          label="Operación"
          value={`${DIRECTION_SHORT[exchange.direction]} de ${exchange.amount} ${exchange.asset} · ${NETWORK_LABEL[exchange.network]}${exchange.walletId ? '' : ` · ${shortAddress(exchange.newAddress)}`}`}
          onChange={() => setExchangeDone(false)}
          keepCase
        />
      ) : null}

      {step === 'slot' && location && service && date ? (
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

      {step === 'confirm' && location && service && startsAt ? (
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
              {['KYC_REQUIRED', 'KYC_EXPIRED', 'KYC_LEVEL_REQUIRED'].includes(error.code ?? '') ? <Link href="/app/perfil/verificacion">Verificar mi identidad</Link> : null}
              {error.code === 'EMAIL_NOT_VERIFIED' ? <Link href="/verificar">Verificar email</Link> : null}
            </Alert>
          ) : null}
          {service.requiresApproval ? (
            <Alert kind="info">Revisaremos tu solicitud y la wallet antes de confirmarla. Te avisaremos por email y notificación; el QR estará disponible al aprobarla.</Alert>
          ) : null}
          <Button variant="primary" size="lg" block loading={busy} onClick={confirm}>
            {service.requiresApproval ? 'Enviar solicitud' : 'Confirmar reserva'}
          </Button>
          <p className="xs muted center" style={{ margin: 0 }}>
            Podrás cambiar o cancelar la cita desde Mis citas.
          </p>
        </section>
      ) : null}
      {step === 'slot' && error ? <Alert kind="error">{error.message}</Alert> : null}
    </div>
  );
}

function Summary({ label, value, onChange, keepCase }: { label: string; value: string; onChange: () => void; keepCase?: boolean }) {
  return (
    <div className="row between card" style={{ padding: '12px 16px', marginBottom: 16, flexWrap: 'nowrap' }}>
      <div style={{ minWidth: 0 }}>
        <div className="xs muted">{label}</div>
        <div style={{ fontWeight: 600, textTransform: keepCase ? 'none' : 'capitalize', overflowWrap: 'anywhere' }}>{value}</div>
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
