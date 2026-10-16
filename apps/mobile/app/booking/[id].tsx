import { BookingDto, errorMessage, todayIn } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { QrPass, SlotPicker, StatusTracker } from '@/components/booking';
import { ExchangeSummary, NetworkGuideBox } from '@/components/exchange';
import { c } from '@/theme';
import { Body, Button, Card, Field, H2, Loader, Muted, Notice, Screen } from '@/components/ui';
import { api } from '@/lib/api';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'none' | 'reschedule' | 'cancel'>('none');
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // Mientras está pendiente de aprobación, se consulta cada 20 s para mostrar el QR en cuanto se apruebe.
  const q = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get<BookingDto>(`/me/bookings/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 20_000 : false),
  });

  const after = (msg: string) => (b: BookingDto) => {
    qc.setQueryData(['booking', id], b);
    qc.invalidateQueries({ queryKey: ['booking', id, 'qr'] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    setMode('none');
    setStartsAt(null);
    Alert.alert(msg);
  };
  const reschedule = useMutation({ mutationFn: () => api.post<BookingDto>(`/me/bookings/${id}/reschedule`, { startsAt }), onSuccess: (nb) => after(nb.status === 'PENDING' ? 'Cita cambiada. La revisaremos de nuevo.' : 'Cita cambiada. Tu QR se ha actualizado.')(nb) });
  const cancel = useMutation({ mutationFn: () => api.post<BookingDto>(`/me/bookings/${id}/cancel`, { reason: reason || undefined }), onSuccess: after('Cita cancelada') });

  if (q.isLoading) return <Loader />;
  const b = q.data;
  if (!b) return <Screen edges={['bottom']}><Notice kind="error">{errorMessage(q.error)}</Notice></Screen>;

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {b.status === 'PENDING' ? (
        <Notice kind="warn">Estamos revisando tu solicitud. Te avisaremos en cuanto la aprobemos y entonces verás aquí tu QR.</Notice>
      ) : null}
      {b.status === 'REJECTED' ? (
        <Notice kind="error">No hemos podido aceptar esta solicitud.{b.rejectReason ? ` Motivo: ${b.rejectReason}` : ''}</Notice>
      ) : null}
      <QrPass booking={b} />
      <StatusTracker booking={b} />
      {b.exchange ? (
        <Card>
          <H2>Tu operación</H2>
          <ExchangeSummary ex={b.exchange} />
          {['PENDING', 'CONFIRMED'].includes(b.status) ? (
            <NetworkGuideBox network={b.exchange.network} asset={b.exchange.asset} direction={b.exchange.direction}>
              {b.exchange.direction === 'SELL_CRYPTO' ? (
                <Muted style={{ fontSize: 13, color: c.paper }}>Envía los fondos solo desde esta wallet y en la oficina, cuando te lo indique el personal.</Muted>
              ) : null}
            </NetworkGuideBox>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <Muted>Dirección</Muted>
        <Body>
          {b.location.address}, {b.location.city}
        </Body>
        <Button
          title="Cómo llegar"
          size="sm"
          onPress={() =>
            Linking.openURL(Platform.OS === 'ios' ? `maps:?daddr=${b.location.latitude},${b.location.longitude}` : `geo:${b.location.latitude},${b.location.longitude}?q=${encodeURIComponent(b.location.name)}`)
          }
        />
      </Card>

      {mode === 'none' && b.canReschedule ? <Button title="Cambiar fecha u hora" onPress={() => { setMode('reschedule'); setDate(todayIn(b.location.timezone)); }} /> : null}
      {mode === 'none' && b.canCancel ? <Button title="Cancelar cita" variant="danger" onPress={() => setMode('cancel')} /> : null}
      {mode === 'none' && !b.canCancel && ['CONFIRMED', 'PENDING'].includes(b.status) ? (
        <Muted>Ya no se puede cambiar ni cancelar desde la app. Si no puedes venir, llama a la oficina.</Muted>
      ) : null}

      {mode === 'reschedule' && date ? (
        <Card big>
          <SlotPicker
            locationId={b.location.id}
            serviceId={b.service.id}
            timezone={b.location.timezone}
            date={date}
            onDate={(d) => { setDate(d); setStartsAt(null); }}
            value={startsAt}
            onChange={setStartsAt}
          />
          {b.status === 'CONFIRMED' && b.approvedAt ? (
            <Notice kind="warn">Al cambiar la hora, la solicitud vuelve a revisión y el QR actual deja de valer hasta que la aprobemos.</Notice>
          ) : null}
          {reschedule.error ? <Notice kind="error">{errorMessage(reschedule.error)}</Notice> : null}
          <Button title="Guardar cambio" variant="primary" disabled={!startsAt} loading={reschedule.isPending} onPress={() => reschedule.mutate()} />
          <Button title="Volver" variant="ghost" onPress={() => setMode('none')} />
        </Card>
      ) : null}

      {mode === 'cancel' ? (
        <Card big>
          <Body>Liberaremos la hora para otra persona y tu QR dejará de ser válido.</Body>
          <Field label="Motivo (opcional)" value={reason} onChangeText={setReason} maxLength={300} />
          {cancel.error ? <Notice kind="error">{errorMessage(cancel.error)}</Notice> : null}
          <Button title="Cancelar cita" variant="danger" loading={cancel.isPending} onPress={() => cancel.mutate()} />
          <Button title="Mantener cita" variant="ghost" onPress={() => setMode('none')} />
        </Card>
      ) : null}
    </Screen>
  );
}
