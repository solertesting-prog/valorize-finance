import { ApiError, BookingDto, errorMessage, formatDateLong, formatTime, LocationDto, todayIn } from '@valorize/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SlotPicker } from '@/components/booking';
import { Body, Button, Choice, Field, H2, Loader, Muted, Notice, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { c } from '@/theme';

export default function Book() {
  const params = useLocalSearchParams<{ location?: string }>();
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState<string | null>(params.location ?? null);
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
      router.dismiss();
      router.push(`/booking/${b.id}`);
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
    <Screen edges={['bottom']}>
      <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={`Paso ${step} de 4`}>
        {[1, 2, 3, 4].map((s) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s <= step ? c.mint : c.line }} />
        ))}
      </View>
      {locations.isLoading ? <Loader /> : null}

      {step === 1 && locations.data ? (
        <>
          <H2>¿Dónde quieres ir?</H2>
          {locations.data.map((l) => (
            <Choice key={l.id} title={l.name} subtitle={l.address} onPress={() => setLocationId(l.id)} />
          ))}
        </>
      ) : null}

      {location && step > 1 ? <Summary label="Ubicación" value={location.name} onChange={() => { setLocationId(null); setServiceId(null); setStartsAt(null); }} /> : null}

      {step === 2 && location ? (
        <>
          <H2>¿Qué gestión vas a hacer?</H2>
          {location.services.map((s) => (
            <Choice
              key={s.id}
              title={s.name}
              subtitle={`Unos ${s.durationMin} minutos.${s.requiresKyc ? ' Requiere identidad verificada.' : ''}`}
              onPress={() => { setServiceId(s.id); setDate(todayIn(location.timezone)); }}
            />
          ))}
        </>
      ) : null}

      {service && step > 2 ? <Summary label="Gestión" value={service.name} onChange={() => { setServiceId(null); setStartsAt(null); }} /> : null}

      {step === 3 && location && service && date ? (
        <SlotPicker
          locationId={location.id}
          serviceId={service.id}
          timezone={location.timezone}
          date={date}
          onDate={(d) => { setDate(d); setStartsAt(null); }}
          value={startsAt}
          onChange={setStartsAt}
        />
      ) : null}

      {step === 4 && location && startsAt ? (
        <>
          <Summary label="Cuándo" value={`${formatDateLong(startsAt, location.timezone)}, ${formatTime(startsAt, location.timezone)}`} onChange={() => setStartsAt(null)} />
          <Field label="Algo que debamos saber (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }} />
          {error ? <Notice kind="error">{error.message}</Notice> : null}
          {error?.code === 'KYC_REQUIRED' || error?.code === 'KYC_EXPIRED' ? <Button title="Verificar mi identidad" onPress={() => router.push('/kyc')} /> : null}
          {error?.code === 'EMAIL_NOT_VERIFIED' ? <Button title="Verificar mi email" onPress={() => router.push('/verify')} /> : null}
          <Button title="Confirmar reserva" variant="primary" size="lg" loading={busy} onPress={confirm} />
          <Muted style={{ textAlign: 'center', fontSize: 13 }}>Podrás cambiar o cancelar la cita desde Mis citas.</Muted>
        </>
      ) : null}
    </Screen>
  );
}

function Summary({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', backgroundColor: c.slate, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 14 }}>
      <View style={{ flex: 1 }}>
        <Muted style={{ fontSize: 12 }}>{label}</Muted>
        <Body style={{ fontWeight: '600', textTransform: 'capitalize' }}>{value}</Body>
      </View>
      <Button title="Cambiar" variant="ghost" size="sm" onPress={onChange} />
    </Row>
  );
}
