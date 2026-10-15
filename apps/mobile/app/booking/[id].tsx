import { BookingDto, errorMessage, todayIn } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { QrPass, SlotPicker } from '@/components/booking';
import { Body, Button, Card, Field, Loader, Muted, Notice, Screen } from '@/components/ui';
import { api } from '@/lib/api';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'none' | 'reschedule' | 'cancel'>('none');
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => api.get<BookingDto>(`/me/bookings/${id}`) });

  const after = (msg: string) => (b: BookingDto) => {
    qc.setQueryData(['booking', id], b);
    qc.invalidateQueries({ queryKey: ['booking', id, 'qr'] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
    setMode('none');
    setStartsAt(null);
    Alert.alert(msg);
  };
  const reschedule = useMutation({ mutationFn: () => api.post<BookingDto>(`/me/bookings/${id}/reschedule`, { startsAt }), onSuccess: after('Cita cambiada. Tu QR se ha actualizado.') });
  const cancel = useMutation({ mutationFn: () => api.post<BookingDto>(`/me/bookings/${id}/cancel`, { reason: reason || undefined }), onSuccess: after('Cita cancelada') });

  if (q.isLoading) return <Loader />;
  const b = q.data;
  if (!b) return <Screen edges={['bottom']}><Notice kind="error">{errorMessage(q.error)}</Notice></Screen>;

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <QrPass booking={b} />
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
