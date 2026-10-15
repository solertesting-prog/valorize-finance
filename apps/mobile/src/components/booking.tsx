import { AvailabilityDto, BookingDto, BookingQrDto, formatDateLong, formatTime, todayIn } from '@valorize/shared';
import { useQuery } from '@tanstack/react-query';
import * as Brightness from 'expo-brightness';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../lib/api';
import { c, f, r, t } from '../theme';
import { H2, Loader, Muted, Notice, StatusBadge } from './ui';

/** Pase QR. Sube el brillo de la pantalla mientras se muestra, para que el lector lo lea a la primera. */
export function QrPass({ booking }: { booking: BookingDto }) {
  const usable = booking.status === 'CONFIRMED';
  const pending = booking.status === 'PENDING';
  const qr = useQuery({
    queryKey: ['booking', booking.id, 'qr'],
    queryFn: () => api.get<BookingQrDto>(`/me/bookings/${booking.id}/qr`),
    enabled: usable,
    staleTime: 60_000,
  });
  const tz = booking.location.timezone;

  useEffect(() => {
    if (!usable) return;
    let previous: number | null = null;
    (async () => {
      try {
        const { status } = await Brightness.requestPermissionsAsync();
        if (status !== 'granted') return;
        previous = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
      } catch {
        /* sin control de brillo */
      }
    })();
    return () => {
      if (previous != null) void Brightness.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, [usable]);

  return (
    <View style={p.pass} accessibilityLabel={`Pase de la cita ${booking.reference}`}>
      <View style={p.headRow}>
        <Text style={p.brand}>VALORIZE</Text>
        <StatusBadge status={booking.status} />
      </View>
      <View style={[p.tile, !usable && { opacity: pending ? 0.3 : 0.15 }]}>
        {qr.data ? (
          <QRCode value={qr.data.token} size={220} color={c.ink} backgroundColor="#ffffff" ecl="M" />
        ) : (
          <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>{usable ? <ActivityIndicator color={c.ink} /> : null}</View>
        )}
      </View>
      <Text style={p.ref}>{booking.reference}</Text>
      <Muted style={{ textAlign: 'center', fontSize: t.sm }}>
        {usable
          ? 'Muéstralo al llegar. Si cambias la cita, se actualiza solo.'
          : pending
            ? 'Tu QR aparecerá aquí cuando aprobemos la solicitud.'
            : 'Esta cita no tiene un QR válido.'}
      </Muted>
      <View style={p.tear} />
      <View style={p.meta}>
        <Meta label="Fecha" value={formatDateLong(booking.startsAt, tz)} />
        <Meta label="Hora" value={formatTime(booking.startsAt, tz)} mono />
        <Meta label="Ubicación" value={booking.location.name} />
        <Meta label="Gestión" value={booking.service.name} />
      </View>
    </View>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ width: '50%', paddingVertical: 6, paddingRight: 8 }}>
      <Text style={{ color: c.fog, fontFamily: f.ui, fontSize: t.xs }}>{label}</Text>
      <Text style={{ color: c.paper, fontFamily: mono ? f.brand : f.uiBold, fontSize: mono ? t.lg : t.sm, textTransform: 'capitalize' }}>{value}</Text>
    </View>
  );
}

export function SlotPicker({
  locationId,
  serviceId,
  timezone,
  date,
  onDate,
  value,
  onChange,
}: {
  locationId: string;
  serviceId: string;
  timezone: string;
  date: string;
  onDate: (d: string) => void;
  value: string | null;
  onChange: (startsAt: string) => void;
}) {
  const from = todayIn(timezone);
  const days = useQuery({
    queryKey: ['availability-days', locationId, serviceId, from],
    queryFn: () => api.get<{ date: string; available: number; closed: boolean }[]>('/availability/days', { query: { locationId, serviceId, from, days: 21 } }),
  });
  const slots = useQuery({
    queryKey: ['availability', locationId, serviceId, date],
    queryFn: () => api.get<AvailabilityDto>('/availability', { query: { locationId, serviceId, date } }),
    refetchInterval: 30_000,
  });

  return (
    <View style={{ gap: 16 }}>
      <H2>Día</H2>
      {days.isLoading ? (
        <Loader />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(days.data ?? []).map((d) => {
            const dt = new Date(`${d.date}T12:00:00Z`);
            const wd = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(dt);
            const mo = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(dt);
            const disabled = d.closed || d.available === 0;
            const sel = d.date === date;
            return (
              <Pressable
                key={d.date}
                disabled={disabled}
                onPress={() => onDate(d.date)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel, disabled }}
                accessibilityLabel={`${wd} ${dt.getUTCDate()} de ${mo}`}
                style={[p.day, sel && { backgroundColor: c.mint, borderColor: c.mint }, disabled && { opacity: 0.35 }]}
              >
                <Text style={[p.dayWd, sel && { color: c.mintInk }]}>{wd}</Text>
                <Text style={[p.dayN, sel && { color: c.mintInk }]}>{dt.getUTCDate()}</Text>
                <Text style={[p.dayWd, sel && { color: c.mintInk }]}>{mo}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <H2>Hora</H2>
      {slots.isLoading ? (
        <Loader />
      ) : slots.data?.closed ? (
        <Notice>{slots.data.closedReason ?? 'Cerrado este día'}</Notice>
      ) : !slots.data?.slots.length ? (
        <Notice>No quedan horas este día. Prueba con otro.</Notice>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {slots.data.slots.map((sl) => {
            const sel = sl.startsAt === value;
            const full = sl.available <= 0;
            return (
              <Pressable
                key={sl.startsAt}
                disabled={full}
                onPress={() => onChange(sl.startsAt)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel, disabled: full }}
                accessibilityLabel={`${sl.label}${full ? ', completo' : ''}`}
                style={[p.slot, sel && { backgroundColor: c.mint, borderColor: c.mint }, full && { opacity: 0.3 }]}
              >
                <Text style={[p.slotText, sel && { color: c.mintInk }]}>{sl.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const p = StyleSheet.create({
  pass: { backgroundColor: c.slate, borderColor: c.line, borderWidth: 1, borderRadius: r.lg, padding: 22, alignItems: 'center', gap: 10 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', marginBottom: 6 },
  brand: { fontFamily: f.brand, color: c.mint, letterSpacing: 1 },
  tile: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  ref: { fontFamily: f.brand, fontSize: t.lg, color: c.mint, letterSpacing: 1, marginTop: 6 },
  tear: { alignSelf: 'stretch', borderTopWidth: 2, borderStyle: 'dashed', borderColor: c.line, marginVertical: 10 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch' },
  day: { width: 64, paddingVertical: 10, alignItems: 'center', borderRadius: r.sm, borderWidth: 1, borderColor: c.line, backgroundColor: c.slate },
  dayWd: { color: c.fog, fontFamily: f.ui, fontSize: t.xs, textTransform: 'capitalize' },
  dayN: { color: c.paper, fontFamily: f.brand, fontSize: t.xl },
  slot: { width: 78, paddingVertical: 12, alignItems: 'center', borderRadius: r.sm, borderWidth: 1, borderColor: c.line, backgroundColor: c.slate2 },
  slotText: { color: c.paper, fontFamily: f.brand, fontSize: t.md },
});
