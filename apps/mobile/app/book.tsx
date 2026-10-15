import { ApiError, BookingDto, DIRECTION_SHORT, errorMessage, formatDateLong, formatTime, LocationDto, NETWORK_LABEL, todayIn } from '@valorize/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SlotPicker } from '@/components/booking';
import { emptyExchange, ExchangeDraft, exchangeError, ExchangeForm, exchangePayload, shortAddress, useExchangeSettings } from '@/components/exchange';
import { Body, Button, Choice, Field, H2, Loader, Muted, Notice, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { c } from '@/theme';

type Step = 'location' | 'service' | 'exchange' | 'slot' | 'confirm';

const EXCHANGE_CODES = ['WALLET_NOT_ACCEPTED', 'INVALID_ADDRESS', 'WALLET_NETWORK_MISMATCH', 'AMOUNT_TOO_LOW', 'AMOUNT_TOO_HIGH'];

export default function Book() {
  const params = useLocalSearchParams<{ location?: string }>();
  const qc = useQueryClient();
  const settings = useExchangeSettings();
  const [locationId, setLocationId] = useState<string | null>(params.location ?? null);
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
      router.dismiss();
      router.push(`/booking/${b.id}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError({ message: errorMessage(e), code });
      if (code === 'SLOT_FULL') {
        setStartsAt(null);
        qc.invalidateQueries({ queryKey: ['availability'] });
      }
      if (code && EXCHANGE_CODES.includes(code)) {
        setExchangeDone(false);
        setExchangeMsg(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={`Paso ${stepIndex + 1} de ${steps.length}`}>
        {steps.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= stepIndex ? c.mint : c.line }} />
        ))}
      </View>
      {locations.isLoading ? <Loader /> : null}

      {step === 'location' && locations.data ? (
        <>
          <H2>¿Dónde quieres ir?</H2>
          {locations.data.map((l) => (
            <Choice key={l.id} title={l.name} subtitle={l.address} onPress={() => setLocationId(l.id)} />
          ))}
        </>
      ) : null}

      {location && step !== 'location' ? (
        <Summary label="Ubicación" value={location.name} onChange={() => { setLocationId(null); setServiceId(null); setStartsAt(null); }} />
      ) : null}

      {step === 'service' && location ? (
        <>
          <H2>¿Qué gestión vas a hacer?</H2>
          {location.services.map((s) => (
            <Choice
              key={s.id}
              title={s.name}
              subtitle={`Unos ${s.durationMin} minutos.${s.requiresKyc ? ' Requiere identidad verificada.' : ''}`}
              onPress={() => pickService(s.id)}
            />
          ))}
        </>
      ) : null}

      {service && step !== 'service' && step !== 'location' ? (
        <Summary label="Gestión" value={service.name} onChange={() => { setServiceId(null); setStartsAt(null); }} />
      ) : null}

      {step === 'exchange' && exchange ? (
        <>
          <H2>Tu operación</H2>
          <ExchangeForm value={exchange} onChange={(d) => { setExchange(d); setExchangeMsg(null); }} />
          {exchangeMsg ? <Notice kind="error">{exchangeMsg}</Notice> : null}
          <Button
            title="Elegir día y hora"
            variant="primary"
            size="lg"
            onPress={() => {
              const err = exchangeError(exchange, settings.data);
              if (err) return setExchangeMsg(err);
              setExchangeDone(true);
            }}
          />
        </>
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
        <>
          <SlotPicker
            locationId={location.id}
            serviceId={service.id}
            timezone={location.timezone}
            date={date}
            onDate={(d) => { setDate(d); setStartsAt(null); }}
            value={startsAt}
            onChange={setStartsAt}
          />
          {error ? <Notice kind="error">{error.message}</Notice> : null}
        </>
      ) : null}

      {step === 'confirm' && location && service && startsAt ? (
        <>
          <Summary label="Cuándo" value={`${formatDateLong(startsAt, location.timezone)}, ${formatTime(startsAt, location.timezone)}`} onChange={() => setStartsAt(null)} />
          <Field label="Algo que debamos saber (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }} />
          {error ? <Notice kind="error">{error.message}</Notice> : null}
          {['KYC_REQUIRED', 'KYC_EXPIRED', 'KYC_LEVEL_REQUIRED'].includes(error?.code ?? '') ? <Button title="Verificar mi identidad" onPress={() => router.push('/kyc')} /> : null}
          {error?.code === 'EMAIL_NOT_VERIFIED' ? <Button title="Verificar mi email" onPress={() => router.push('/verify')} /> : null}
          {service.requiresApproval ? (
            <Notice>Revisaremos tu solicitud y la wallet antes de confirmarla. Te avisaremos con una notificación; el QR estará disponible al aprobarla.</Notice>
          ) : null}
          <Button title={service.requiresApproval ? 'Enviar solicitud' : 'Confirmar reserva'} variant="primary" size="lg" loading={busy} onPress={confirm} />
          <Muted style={{ textAlign: 'center', fontSize: 13 }}>Podrás cambiar o cancelar la cita desde Mis citas.</Muted>
        </>
      ) : null}
    </Screen>
  );
}

function Summary({ label, value, onChange, keepCase }: { label: string; value: string; onChange: () => void; keepCase?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', backgroundColor: c.slate, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 14, flexWrap: 'nowrap' }}>
      <View style={{ flex: 1 }}>
        <Muted style={{ fontSize: 12 }}>{label}</Muted>
        <Body style={{ fontWeight: '600', textTransform: keepCase ? 'none' : 'capitalize' }}>{value}</Body>
      </View>
      <Button title="Cambiar" variant="ghost" size="sm" onPress={onChange} />
    </Row>
  );
}
